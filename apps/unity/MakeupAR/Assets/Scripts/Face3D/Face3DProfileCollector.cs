using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aura.Face3D
{
    public sealed class Face3DCollectionPolicy
    {
        public const double ProvisionalMaximumDurationSeconds = 3.0;
        public const int ProvisionalTargetFrameCount = 30;
        public const int ProvisionalMinimumFrameCount = 20;
        public const float ProvisionalOutlierMadMultiplier = 3.0f;
        public const float ProvisionalConfidenceMadScale = 0.02f;

        public Face3DCollectionPolicy(
            double maximumDurationSeconds = ProvisionalMaximumDurationSeconds,
            int targetFrameCount = ProvisionalTargetFrameCount,
            int minimumFrameCount = ProvisionalMinimumFrameCount,
            float outlierMadMultiplier = ProvisionalOutlierMadMultiplier,
            float confidenceMadScale = ProvisionalConfidenceMadScale,
            bool separateCompletionFromQuality = false)
        {
            if (!Face3DNumeric.IsFinite(maximumDurationSeconds)
                || maximumDurationSeconds <= 0.0)
            {
                throw new ArgumentOutOfRangeException(nameof(maximumDurationSeconds));
            }

            if (targetFrameCount <= 0)
            {
                throw new ArgumentOutOfRangeException(nameof(targetFrameCount));
            }

            if (minimumFrameCount <= 0 || minimumFrameCount > targetFrameCount)
            {
                throw new ArgumentOutOfRangeException(nameof(minimumFrameCount));
            }

            if (!Face3DNumeric.IsFinite(outlierMadMultiplier)
                || outlierMadMultiplier <= 0.0f)
            {
                throw new ArgumentOutOfRangeException(nameof(outlierMadMultiplier));
            }

            if (!Face3DNumeric.IsFinite(confidenceMadScale)
                || confidenceMadScale <= 0.0f)
            {
                throw new ArgumentOutOfRangeException(nameof(confidenceMadScale));
            }

            MaximumDurationSeconds = maximumDurationSeconds;
            TargetFrameCount = targetFrameCount;
            MinimumFrameCount = minimumFrameCount;
            OutlierMadMultiplier = outlierMadMultiplier;
            ConfidenceMadScale = confidenceMadScale;
            SeparateCompletionFromQuality = separateCompletionFromQuality;
        }

        public double MaximumDurationSeconds { get; private set; }
        public int TargetFrameCount { get; private set; }
        public int MinimumFrameCount { get; private set; }
        public float OutlierMadMultiplier { get; private set; }
        public float ConfidenceMadScale { get; private set; }
        public bool SeparateCompletionFromQuality { get; private set; }
    }

    public enum Face3DCollectionAddStatus
    {
        Accepted,
        AcceptedTargetReached,
        RejectedBlockedFrame,
        RejectedTopologyChanged,
        RejectedOutsideWindow,
        RejectedTargetAlreadyReached,
        RejectedTimestamp
    }

    public sealed class Face3DCollectionUpdate
    {
        internal Face3DCollectionUpdate(
            Face3DCollectionAddStatus status,
            string reason,
            int validFrameCount,
            int targetFrameCount,
            bool shouldStop)
        {
            Status = status;
            Reason = reason ?? string.Empty;
            ValidFrameCount = validFrameCount;
            TargetFrameCount = targetFrameCount;
            ShouldStop = shouldStop;
        }

        public Face3DCollectionAddStatus Status { get; private set; }
        public string Reason { get; private set; }
        public int ValidFrameCount { get; private set; }
        public int TargetFrameCount { get; private set; }
        public bool ShouldStop { get; private set; }
    }

    /// <summary>
    /// Bounded collector for the provisional 3-second / 30-target / 20-minimum policy.
    /// A session cannot silently combine samples from different ARKit mesh topologies.
    /// </summary>
    public sealed class Face3DProfileCollector
    {
        private readonly double startTimestampSeconds;
        private readonly Face3DCollectionPolicy policy;
        private readonly List<Face3DMetrics> samples = new List<Face3DMetrics>();
        private readonly HashSet<string> warnings = new HashSet<string>(StringComparer.Ordinal);
        private Face3DTopologyFingerprint topology;

        public Face3DProfileCollector(
            double startTimestampSeconds,
            Face3DCollectionPolicy policy = null)
        {
            if (!Face3DNumeric.IsFinite(startTimestampSeconds))
            {
                throw new ArgumentOutOfRangeException(nameof(startTimestampSeconds));
            }

            this.startTimestampSeconds = startTimestampSeconds;
            this.policy = policy ?? new Face3DCollectionPolicy();
        }

        public Face3DCollectionPolicy Policy
        {
            get { return policy; }
        }

        public int ValidFrameCount
        {
            get { return samples.Count; }
        }

        public Face3DTopologyFingerprint Topology
        {
            get { return topology; }
        }

        public void AddWarning(string warning)
        {
            if (!string.IsNullOrWhiteSpace(warning))
            {
                warnings.Add(warning.Trim());
            }
        }

        public Face3DCollectionUpdate AddEvaluation(
            Face3DEvaluationResult evaluation,
            double timestampSeconds)
        {
            if (!Face3DNumeric.IsFinite(timestampSeconds)
                || timestampSeconds < startTimestampSeconds)
            {
                warnings.Add("sample_timestamp_invalid");
                return BuildUpdate(
                    Face3DCollectionAddStatus.RejectedTimestamp,
                    "sample_timestamp_invalid",
                    timestampSeconds);
            }

            if (samples.Count >= policy.TargetFrameCount)
            {
                return BuildUpdate(
                    Face3DCollectionAddStatus.RejectedTargetAlreadyReached,
                    "target_frame_count_already_reached",
                    timestampSeconds);
            }

            if (timestampSeconds - startTimestampSeconds > policy.MaximumDurationSeconds)
            {
                warnings.Add("sample_outside_collection_window");
                return BuildUpdate(
                    Face3DCollectionAddStatus.RejectedOutsideWindow,
                    "sample_outside_collection_window",
                    timestampSeconds);
            }

            if (evaluation == null || !evaluation.IsValid)
            {
                string reason = evaluation == null
                    ? "face3d_evaluation_missing"
                    : evaluation.Reason;
                warnings.Add(string.IsNullOrWhiteSpace(reason)
                    ? "face3d_frame_blocked"
                    : reason);
                return BuildUpdate(
                    Face3DCollectionAddStatus.RejectedBlockedFrame,
                    reason,
                    timestampSeconds);
            }

            if (topology == null)
            {
                topology = evaluation.Topology;
            }
            else if (!topology.Equals(evaluation.Topology))
            {
                warnings.Add("topology_changed_during_collection");
                return BuildUpdate(
                    Face3DCollectionAddStatus.RejectedTopologyChanged,
                    "topology_changed_during_collection",
                    timestampSeconds);
            }

            samples.Add(evaluation.Metrics);
            Face3DCollectionAddStatus status = samples.Count >= policy.TargetFrameCount
                ? Face3DCollectionAddStatus.AcceptedTargetReached
                : Face3DCollectionAddStatus.Accepted;
            return BuildUpdate(status, string.Empty, timestampSeconds);
        }

        public bool ShouldStop(double timestampSeconds)
        {
            if (samples.Count >= policy.TargetFrameCount)
            {
                return true;
            }

            return Face3DNumeric.IsFinite(timestampSeconds)
                && timestampSeconds >= startTimestampSeconds
                && timestampSeconds - startTimestampSeconds >= policy.MaximumDurationSeconds;
        }

        public bool TryBuildProfile(
            double timestampSeconds,
            out Face3DProfile profile,
            out string reason)
        {
            profile = null;
            if (!Face3DNumeric.IsFinite(timestampSeconds)
                || timestampSeconds < startTimestampSeconds)
            {
                reason = "collection_timestamp_invalid";
                return false;
            }

            if (!ShouldStop(timestampSeconds))
            {
                reason = "collection_in_progress";
                return false;
            }

            if (samples.Count < policy.MinimumFrameCount || topology == null)
            {
                reason = "insufficient_valid_frames";
                return false;
            }

            Face3DRobustAggregationResult noseTip = AggregateWithMeters(
                delegate(Face3DMetrics metrics) { return metrics.NoseTipProjection; },
                delegate(Face3DMetrics metrics) { return metrics.NoseTipProjectionMeters; },
                out Face3DRobustAggregationResult noseTipMeters);
            Face3DRobustAggregationResult chin = AggregateWithMeters(
                delegate(Face3DMetrics metrics) { return metrics.ChinProjection; },
                delegate(Face3DMetrics metrics) { return metrics.ChinProjectionMeters; },
                out Face3DRobustAggregationResult chinMeters);
            Face3DRobustAggregationResult upperLip = AggregateWithMeters(
                delegate(Face3DMetrics metrics) { return metrics.UpperLipToELine; },
                delegate(Face3DMetrics metrics) { return metrics.UpperLipToELineMeters; },
                out Face3DRobustAggregationResult upperLipMeters);
            Face3DRobustAggregationResult lowerLip = AggregateWithMeters(
                delegate(Face3DMetrics metrics) { return metrics.LowerLipToELine; },
                delegate(Face3DMetrics metrics) { return metrics.LowerLipToELineMeters; },
                out Face3DRobustAggregationResult lowerLipMeters);
            Face3DRobustAggregationResult central = AggregateWithMeters(
                delegate(Face3DMetrics metrics) { return metrics.CentralProjectionScore; },
                delegate(Face3DMetrics metrics) { return metrics.CentralProjectionScoreMeters; },
                out Face3DRobustAggregationResult centralMeters);

            // Tier-2: 프레임별로 존재한 표본만 집계 — 전부 부재(g1)면 value:null 지표.
            Face3DRobustAggregationResult noseLength = AggregateOptionalWithMeters(
                delegate(Face3DMetrics metrics) { return metrics.NoseLength; },
                delegate(Face3DMetrics metrics) { return metrics.NoseLengthMeters; },
                out Face3DRobustAggregationResult noseLengthMeters);
            Face3DRobustAggregationResult nasalBridgeStraightness =
                AggregateOptionalWithMeters(
                    delegate(Face3DMetrics metrics) { return metrics.NasalBridgeStraightness; },
                    delegate(Face3DMetrics metrics) { return metrics.NasalBridgeStraightnessMeters; },
                    out Face3DRobustAggregationResult nasalBridgeStraightnessMeters);
            Face3DRobustAggregationResult nasalAxisDeviation =
                AggregateOptionalWithMeters(
                    delegate(Face3DMetrics metrics) { return metrics.NasalAxisDeviation; },
                    delegate(Face3DMetrics metrics) { return metrics.NasalAxisDeviationMeters; },
                    out Face3DRobustAggregationResult nasalAxisDeviationMeters);
            Face3DRobustAggregationResult alarWidth = AggregateOptionalWithMeters(
                delegate(Face3DMetrics metrics) { return metrics.AlarWidth; },
                delegate(Face3DMetrics metrics) { return metrics.AlarWidthMeters; },
                out Face3DRobustAggregationResult alarWidthMeters);
            Face3DRobustAggregationResult malarProjectionLeft =
                AggregateOptionalWithMeters(
                    delegate(Face3DMetrics metrics) { return metrics.MalarProjectionLeft; },
                    delegate(Face3DMetrics metrics) { return metrics.MalarProjectionLeftMeters; },
                    out Face3DRobustAggregationResult malarProjectionLeftMeters);
            Face3DRobustAggregationResult malarProjectionRight =
                AggregateOptionalWithMeters(
                    delegate(Face3DMetrics metrics) { return metrics.MalarProjectionRight; },
                    delegate(Face3DMetrics metrics) { return metrics.MalarProjectionRightMeters; },
                    out Face3DRobustAggregationResult malarProjectionRightMeters);

            AddAggregationWarning(Face3DContract.NoseTipProjection, noseTip);
            AddAggregationWarning(Face3DContract.ChinProjection, chin);
            AddAggregationWarning(Face3DContract.UpperLipToELine, upperLip);
            AddAggregationWarning(Face3DContract.LowerLipToELine, lowerLip);
            AddAggregationWarning(Face3DContract.CentralProjectionScore, central);
            AddMetersAggregationWarning(Face3DContract.NoseTipProjection, noseTipMeters);
            AddMetersAggregationWarning(Face3DContract.ChinProjection, chinMeters);
            AddMetersAggregationWarning(Face3DContract.UpperLipToELine, upperLipMeters);
            AddMetersAggregationWarning(Face3DContract.LowerLipToELine, lowerLipMeters);
            AddMetersAggregationWarning(Face3DContract.CentralProjectionScore, centralMeters);
            AddOptionalAggregationWarning(Face3DContract.NoseLength, noseLength);
            AddOptionalAggregationWarning(Face3DContract.NasalBridgeStraightness, nasalBridgeStraightness);
            AddOptionalAggregationWarning(Face3DContract.NasalAxisDeviation, nasalAxisDeviation);
            AddOptionalAggregationWarning(Face3DContract.AlarWidth, alarWidth);
            AddOptionalAggregationWarning(Face3DContract.MalarProjectionLeft, malarProjectionLeft);
            AddOptionalAggregationWarning(Face3DContract.MalarProjectionRight, malarProjectionRight);
            AddMetersAggregationWarning(Face3DContract.NoseLength, noseLengthMeters);
            AddMetersAggregationWarning(
                Face3DContract.NasalBridgeStraightness,
                nasalBridgeStraightnessMeters);
            AddMetersAggregationWarning(
                Face3DContract.NasalAxisDeviation,
                nasalAxisDeviationMeters);
            AddMetersAggregationWarning(Face3DContract.AlarWidth, alarWidthMeters);
            AddMetersAggregationWarning(
                Face3DContract.MalarProjectionLeft,
                malarProjectionLeftMeters);
            AddMetersAggregationWarning(
                Face3DContract.MalarProjectionRight,
                malarProjectionRightMeters);
            if (samples.Count < policy.TargetFrameCount)
            {
                warnings.Add("target_frame_count_not_reached");
            }

            List<string> sortedWarnings = new List<string>(warnings);
            sortedWarnings.Sort(StringComparer.Ordinal);
            profile = new Face3DProfile(
                topology.Value,
                samples.Count,
                policy.TargetFrameCount,
                sortedWarnings,
                new Face3DProfileMetrics(
                    noseTip.Metric,
                    chin.Metric,
                    upperLip.Metric,
                    lowerLip.Metric,
                    central.Metric,
                    noseLength.Metric,
                    nasalBridgeStraightness.Metric,
                    nasalAxisDeviation.Metric,
                    alarWidth.Metric,
                    malarProjectionLeft.Metric,
                    malarProjectionRight.Metric));
            reason = string.Empty;
            return true;
        }

        private Face3DRobustAggregationResult Aggregate(Func<Face3DMetrics, float> selector)
        {
            List<float> values = new List<float>(samples.Count);
            for (int index = 0; index < samples.Count; index += 1)
            {
                values.Add(selector(samples[index]));
            }

            return Face3DRobustMetricAggregator.Aggregate(values, policy);
        }

        private Face3DRobustAggregationResult AggregateWithMeters(
            Func<Face3DMetrics, float> normalizedSelector,
            Func<Face3DMetrics, float?> metersSelector,
            out Face3DRobustAggregationResult metersResult)
        {
            Face3DRobustAggregationResult normalizedResult = Aggregate(
                normalizedSelector);
            metersResult = AggregateOptional(metersSelector);
            return AttachValueMm(normalizedResult, metersResult);
        }

        // Tier-2: null(그룹 부재·프레임 결측) 표본은 집계에서 제외한다. 표본이 하나도
        // 없으면 Aggregate 가 value:null 지표를 반환한다.
        private Face3DRobustAggregationResult AggregateOptional(
            Func<Face3DMetrics, float?> selector)
        {
            List<float> values = new List<float>(samples.Count);
            for (int index = 0; index < samples.Count; index += 1)
            {
                float? value = selector(samples[index]);
                if (value.HasValue)
                {
                    values.Add(value.Value);
                }
            }

            return Face3DRobustMetricAggregator.Aggregate(values, policy);
        }

        private Face3DRobustAggregationResult AggregateOptionalWithMeters(
            Func<Face3DMetrics, float?> normalizedSelector,
            Func<Face3DMetrics, float?> metersSelector,
            out Face3DRobustAggregationResult metersResult)
        {
            Face3DRobustAggregationResult normalizedResult = AggregateOptional(
                normalizedSelector);
            metersResult = AggregateOptional(metersSelector);
            return AttachValueMm(normalizedResult, metersResult);
        }

        private Face3DRobustAggregationResult AttachValueMm(
            Face3DRobustAggregationResult normalizedResult,
            Face3DRobustAggregationResult metersResult)
        {
            Face3DProfileMetric normalizedMetric = normalizedResult.Metric;
            Face3DProfileMetric metersMetric = metersResult.Metric;
            bool rawAggregateMeetsMinimum =
                metersMetric.Value.HasValue
                && metersMetric.ValidFrameCount >= policy.MinimumFrameCount;
            float? valueMm = rawAggregateMeetsMinimum
                ? metersMetric.Value.Value * 1000.0f
                : (float?)null;
            return new Face3DRobustAggregationResult(
                new Face3DProfileMetric(
                    normalizedMetric.Value,
                    normalizedMetric.Confidence,
                    normalizedMetric.ValidFrameCount,
                    normalizedMetric.Mad,
                    valueMm,
                    metersMetric.Confidence,
                    metersMetric.ValidFrameCount,
                    metersMetric.Mad * 1000.0f),
                normalizedResult.InputCount,
                normalizedResult.OutlierCount);
        }

        private void AddAggregationWarning(
            string metricName,
            Face3DRobustAggregationResult result)
        {
            if (result.OutlierCount > 0)
            {
                warnings.Add(metricName + "_outliers_rejected:" + result.OutlierCount);
            }

            if (result.Metric.ValidFrameCount < policy.MinimumFrameCount)
            {
                warnings.Add(metricName + "_inliers_below_minimum");
            }
        }

        // Tier-2 는 그룹 부재(표본 0)가 정상 상태(g1)라 그때는 경고를 내지 않는다 —
        // 표본이 있었는데 최소치에 못 미친 경우만 데이터 품질 신호다.
        private void AddOptionalAggregationWarning(
            string metricName,
            Face3DRobustAggregationResult result)
        {
            if (result.InputCount == 0)
            {
                return;
            }

            AddAggregationWarning(metricName, result);
        }

        private void AddMetersAggregationWarning(
            string metricName,
            Face3DRobustAggregationResult result)
        {
            if (result.InputCount == 0)
            {
                return;
            }

            if (result.OutlierCount > 0)
            {
                warnings.Add(
                    metricName
                    + "_raw_meters_outliers_rejected:"
                    + result.OutlierCount);
            }

            if (result.Metric.ValidFrameCount < policy.MinimumFrameCount)
            {
                warnings.Add(metricName + "_raw_meters_inliers_below_minimum");
            }
        }

        private Face3DCollectionUpdate BuildUpdate(
            Face3DCollectionAddStatus status,
            string reason,
            double timestampSeconds)
        {
            return new Face3DCollectionUpdate(
                status,
                reason,
                samples.Count,
                policy.TargetFrameCount,
                ShouldStop(timestampSeconds));
        }
    }

    public sealed class Face3DRobustAggregationResult
    {
        internal Face3DRobustAggregationResult(
            Face3DProfileMetric metric,
            int inputCount,
            int outlierCount)
        {
            Metric = metric;
            InputCount = inputCount;
            OutlierCount = outlierCount;
        }

        public Face3DProfileMetric Metric { get; private set; }
        public int InputCount { get; private set; }
        public int OutlierCount { get; private set; }
    }

    public static class Face3DRobustMetricAggregator
    {
        private const float MadZeroTolerance = 0.000001f;

        public static Face3DRobustAggregationResult Aggregate(
            IReadOnlyList<float> inputValues,
            Face3DCollectionPolicy policy = null)
        {
            Face3DCollectionPolicy resolvedPolicy = policy ?? new Face3DCollectionPolicy();
            List<float> values = new List<float>();
            if (inputValues != null)
            {
                for (int index = 0; index < inputValues.Count; index += 1)
                {
                    if (Face3DNumeric.IsFinite(inputValues[index]))
                    {
                        values.Add(inputValues[index]);
                    }
                }
            }

            if (values.Count == 0)
            {
                return new Face3DRobustAggregationResult(
                    new Face3DProfileMetric(null, 0.0f, 0, 0.0f),
                    0,
                    0);
            }

            float rawMedian = Median(values);
            List<float> rawDeviations = AbsoluteDeviations(values, rawMedian);
            float rawMad = Median(rawDeviations);
            float threshold = rawMad <= MadZeroTolerance
                ? MadZeroTolerance
                : rawMad * resolvedPolicy.OutlierMadMultiplier;

            List<float> inliers = new List<float>(values.Count);
            for (int index = 0; index < values.Count; index += 1)
            {
                if (Mathf.Abs(values[index] - rawMedian) <= threshold)
                {
                    inliers.Add(values[index]);
                }
            }

            float finalMedian = Median(inliers);
            float finalMad = Median(AbsoluteDeviations(inliers, finalMedian));
            float coverage = Mathf.Clamp01(
                (float)inliers.Count / resolvedPolicy.TargetFrameCount);
            float inlierRatio = (float)inliers.Count / values.Count;
            float stability = 1.0f / (
                1.0f + (finalMad / resolvedPolicy.ConfidenceMadScale));
            float quality = Mathf.Clamp01(inlierRatio * stability);
            float confidence = resolvedPolicy.SeparateCompletionFromQuality
                ? quality
                : Mathf.Clamp01(coverage * quality);

            return new Face3DRobustAggregationResult(
                new Face3DProfileMetric(
                    finalMedian,
                    confidence,
                    inliers.Count,
                    finalMad),
                values.Count,
                values.Count - inliers.Count);
        }

        private static float Median(List<float> values)
        {
            if (values == null || values.Count == 0)
            {
                return 0.0f;
            }

            List<float> sorted = new List<float>(values);
            sorted.Sort();
            int midpoint = sorted.Count / 2;
            if (sorted.Count % 2 == 1)
            {
                return sorted[midpoint];
            }

            return (sorted[midpoint - 1] + sorted[midpoint]) * 0.5f;
        }

        private static List<float> AbsoluteDeviations(
            List<float> values,
            float center)
        {
            List<float> deviations = new List<float>(values.Count);
            for (int index = 0; index < values.Count; index += 1)
            {
                deviations.Add(Mathf.Abs(values[index] - center));
            }

            return deviations;
        }
    }
}
