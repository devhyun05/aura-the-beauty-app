using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace Aura.Face3D
{
    public static class UnifiedFaceCaptureContract
    {
        public const string SchemaVersion = "aura.unified-face-capture.v1";
        public const string ProfileSchemaVersion = "aura.face3d-profile.v2";
        public const string GateVersion = "face3d-gate-v2";
        public const string HairlinePolicy = "soft_nudge_post_capture_omit";
        public const string ConfidenceCalibrationUncalibrated = "uncalibrated";
        public const string ConfidenceCalibrationCalibrated = "calibrated";
        public const string CalibrationSignatureAlgorithm = "hmac-sha256-v1";
        // Gate 6B evidence and a signed receipt must land before this can change.
        // Keeping the promotion flag in the contract makes a status-string-only
        // "calibration" impossible in the runtime producer.
        public const bool CalibrationPromotionEnabled = false;
        public const string AggregationMedianMad = "median_mad";
        public const string AggregationNone = "none";
        public const string SampleModeMicroBurst = "micro_burst";
        public const string SampleModeSingleFrame = "single_frame";

        public const string ProductPolicyId = "unified-micro-burst-5of8-v1";
        public const string DiagnosticsExact1PolicyId = "diagnostics-exact-1-v1";
        public const string DiagnosticsExact3PolicyId = "diagnostics-exact-3-v1";
        public const string DiagnosticsExact5PolicyId = "diagnostics-exact-5-v1";
        public const string DiagnosticsExact8PolicyId = "diagnostics-exact-8-v1";
        public const string DiagnosticsExact12PolicyId = "diagnostics-exact-12-v1";
        public const string DiagnosticsExact30PolicyId = "diagnostics-exact-30-v1";
    }

    public sealed class Face3DSensorProvenance
    {
        public Face3DSensorProvenance(
            bool? trueDepthHardware,
            float? depthDataObservedRatio,
            bool? faceTrackingSupported,
            string deviceModel)
        {
            TrueDepthHardware = trueDepthHardware;
            DepthDataObservedRatio = depthDataObservedRatio.HasValue
                && Face3DNumeric.IsFinite(depthDataObservedRatio.Value)
                && depthDataObservedRatio.Value >= 0.0f
                && depthDataObservedRatio.Value <= 1.0f
                    ? depthDataObservedRatio
                    : null;
            FaceTrackingSupported = faceTrackingSupported;
            DeviceModel = string.IsNullOrWhiteSpace(deviceModel)
                ? null
                : deviceModel.Trim();
        }

        public bool? TrueDepthHardware { get; }
        public float? DepthDataObservedRatio { get; }
        public bool? FaceTrackingSupported { get; }
        public string DeviceModel { get; }

        public static Face3DSensorProvenance Unknown()
        {
            return new Face3DSensorProvenance(null, null, null, null);
        }
    }

    /// <summary>
    /// Server/tooling-issued receipt shape. Unity never creates one: the runtime
    /// producer stays uncalibrated until Gate 6B promotion, and the backend must
    /// verify the HMAC plus one-time consumption before accepting it.
    /// </summary>
    public sealed class Face3DCalibrationReceipt
    {
        public Face3DCalibrationReceipt(
            string receiptId,
            string captureNonce,
            string profileBindingSha256,
            string collectionPolicyId,
            string gateVersion,
            string appBuild,
            string issuedAtUtc,
            string expiresAtUtc,
            string subjectContextId,
            string reportContextId,
            string approvalArtifactSha256,
            string signingKeyId,
            string signature)
        {
            ReceiptId = receiptId;
            CaptureNonce = captureNonce;
            ProfileBindingSha256 = profileBindingSha256;
            CollectionPolicyId = collectionPolicyId;
            GateVersion = gateVersion;
            AppBuild = appBuild;
            IssuedAtUtc = issuedAtUtc;
            ExpiresAtUtc = expiresAtUtc;
            SubjectContextId = subjectContextId;
            ReportContextId = reportContextId;
            ApprovalArtifactSha256 = approvalArtifactSha256;
            SignatureAlgorithm =
                UnifiedFaceCaptureContract.CalibrationSignatureAlgorithm;
            SigningKeyId = signingKeyId;
            Signature = signature;
        }

        public string ReceiptId { get; }
        public string CaptureNonce { get; }
        public string ProfileBindingSha256 { get; }
        public string CollectionPolicyId { get; }
        public string GateVersion { get; }
        public string AppBuild { get; }
        public string IssuedAtUtc { get; }
        public string ExpiresAtUtc { get; }
        public string SubjectContextId { get; }
        public string ReportContextId { get; }
        public string ApprovalArtifactSha256 { get; }
        public string SignatureAlgorithm { get; }
        public string SigningKeyId { get; }
        public string Signature { get; }
    }

    [Serializable]
    public sealed class UnifiedFaceCaptureRequestData
    {
        public string requestId;
        public string gateVersion;
        public string hairlinePolicy;
        public string collectionPolicyId;
        public string sampleMode;
        public int maximumDurationMs;
        public int minimumValidFrames;
        public int targetValidFrames;
        public double maxAbsFaceSensorDeltaMs;
        public int retryAttemptCount;
    }

    public sealed class UnifiedFaceCapturePolicy
    {
        internal UnifiedFaceCapturePolicy(
            string id,
            string sampleMode,
            string aggregation,
            int maximumDurationMs,
            int minimumValidFrames,
            int targetValidFrames)
        {
            Id = id;
            SampleMode = sampleMode;
            Aggregation = aggregation;
            MaximumDurationMs = maximumDurationMs;
            MinimumValidFrames = minimumValidFrames;
            TargetValidFrames = targetValidFrames;
        }

        public string Id { get; }
        public string SampleMode { get; }
        public string Aggregation { get; }
        public int MaximumDurationMs { get; }
        public int MinimumValidFrames { get; }
        public int TargetValidFrames { get; }
    }

    public sealed class UnifiedFaceCaptureRequest
    {
        internal UnifiedFaceCaptureRequest(
            string requestId,
            UnifiedFaceCapturePolicy policy,
            double maxAbsFaceSensorDeltaMs,
            int retryAttemptCount)
        {
            RequestId = requestId;
            Policy = policy;
            MaxAbsFaceSensorDeltaMs = maxAbsFaceSensorDeltaMs;
            RetryAttemptCount = retryAttemptCount;
        }

        public string RequestId { get; }
        public UnifiedFaceCapturePolicy Policy { get; }
        public double MaxAbsFaceSensorDeltaMs { get; }
        public int RetryAttemptCount { get; }
    }

    /// <summary>
    /// Validates immutable policy identifiers and their exact tuples. The legacy v1
    /// Face3D validator remains independent and unchanged.
    /// </summary>
    public static class UnifiedFaceCaptureRequestValidator
    {
        private static readonly IReadOnlyDictionary<string, UnifiedFaceCapturePolicy> Policies =
            new ReadOnlyDictionary<string, UnifiedFaceCapturePolicy>(
                new Dictionary<string, UnifiedFaceCapturePolicy>(StringComparer.Ordinal)
                {
                    {
                        UnifiedFaceCaptureContract.ProductPolicyId,
                        new UnifiedFaceCapturePolicy(
                            UnifiedFaceCaptureContract.ProductPolicyId,
                            UnifiedFaceCaptureContract.SampleModeMicroBurst,
                            UnifiedFaceCaptureContract.AggregationMedianMad,
                            500,
                            5,
                            8)
                    },
                    {
                        UnifiedFaceCaptureContract.DiagnosticsExact1PolicyId,
                        new UnifiedFaceCapturePolicy(
                            UnifiedFaceCaptureContract.DiagnosticsExact1PolicyId,
                            UnifiedFaceCaptureContract.SampleModeSingleFrame,
                            UnifiedFaceCaptureContract.AggregationNone,
                            500,
                            1,
                            1)
                    },
                    {
                        UnifiedFaceCaptureContract.DiagnosticsExact3PolicyId,
                        CreateExactMicroBurst(
                            UnifiedFaceCaptureContract.DiagnosticsExact3PolicyId,
                            500,
                            3)
                    },
                    {
                        UnifiedFaceCaptureContract.DiagnosticsExact5PolicyId,
                        CreateExactMicroBurst(
                            UnifiedFaceCaptureContract.DiagnosticsExact5PolicyId,
                            500,
                            5)
                    },
                    {
                        UnifiedFaceCaptureContract.DiagnosticsExact8PolicyId,
                        CreateExactMicroBurst(
                            UnifiedFaceCaptureContract.DiagnosticsExact8PolicyId,
                            500,
                            8)
                    },
                    {
                        UnifiedFaceCaptureContract.DiagnosticsExact12PolicyId,
                        CreateExactMicroBurst(
                            UnifiedFaceCaptureContract.DiagnosticsExact12PolicyId,
                            750,
                            12)
                    },
                    {
                        UnifiedFaceCaptureContract.DiagnosticsExact30PolicyId,
                        CreateExactMicroBurst(
                            UnifiedFaceCaptureContract.DiagnosticsExact30PolicyId,
                            3000,
                            30)
                    }
                });

        public static bool TryParseJson(
            string json,
            out UnifiedFaceCaptureRequest request,
            out string reason)
        {
            UnifiedFaceCaptureRequestData data;
            try
            {
                data = JsonUtility.FromJson<UnifiedFaceCaptureRequestData>(json ?? string.Empty);
            }
            catch (Exception)
            {
                request = null;
                reason = "unified_capture_request_json_invalid";
                return false;
            }

            return TryValidate(data, out request, out reason);
        }

        public static bool TryValidate(
            UnifiedFaceCaptureRequestData data,
            out UnifiedFaceCaptureRequest request,
            out string reason)
        {
            request = null;
            if (data == null || string.IsNullOrWhiteSpace(data.requestId))
            {
                reason = "unified_capture_request_id_missing";
                return false;
            }

            if (!string.Equals(
                    data.gateVersion,
                    UnifiedFaceCaptureContract.GateVersion,
                    StringComparison.Ordinal)
                || !string.Equals(
                    data.hairlinePolicy,
                    UnifiedFaceCaptureContract.HairlinePolicy,
                    StringComparison.Ordinal))
            {
                reason = "unified_capture_contract_unsupported";
                return false;
            }

            if (!Policies.TryGetValue(
                    data.collectionPolicyId ?? string.Empty,
                    out UnifiedFaceCapturePolicy policy))
            {
                reason = "unified_capture_policy_unknown";
                return false;
            }

            if (!string.Equals(data.sampleMode, policy.SampleMode, StringComparison.Ordinal)
                || data.maximumDurationMs != policy.MaximumDurationMs
                || data.minimumValidFrames != policy.MinimumValidFrames
                || data.targetValidFrames != policy.TargetValidFrames)
            {
                reason = "unified_capture_policy_tuple_mismatch";
                return false;
            }

            if (double.IsNaN(data.maxAbsFaceSensorDeltaMs)
                || double.IsInfinity(data.maxAbsFaceSensorDeltaMs)
                || data.maxAbsFaceSensorDeltaMs < 0.0)
            {
                reason = "unified_capture_native_delta_invalid";
                return false;
            }

            if (data.retryAttemptCount != 0 && data.retryAttemptCount != 1)
            {
                reason = "unified_capture_retry_attempt_invalid";
                return false;
            }

            request = new UnifiedFaceCaptureRequest(
                data.requestId.Trim(),
                policy,
                data.maxAbsFaceSensorDeltaMs,
                data.retryAttemptCount);
            reason = string.Empty;
            return true;
        }

        public static bool TryGetPolicy(
            string policyId,
            out UnifiedFaceCapturePolicy policy)
        {
            return Policies.TryGetValue(policyId ?? string.Empty, out policy);
        }

        private static UnifiedFaceCapturePolicy CreateExactMicroBurst(
            string id,
            int maximumDurationMs,
            int targetFrames)
        {
            return new UnifiedFaceCapturePolicy(
                id,
                UnifiedFaceCaptureContract.SampleModeMicroBurst,
                UnifiedFaceCaptureContract.AggregationMedianMad,
                maximumDurationMs,
                targetFrames,
                targetFrames);
        }
    }

    public sealed class Face3DProfileV2
    {
        private readonly ReadOnlyCollection<string> warnings;

        private Face3DProfileV2(
            UnifiedFaceCapturePolicy policy,
            Face3DProfile aggregate,
            double captureWindowMs,
            string captureNonce,
            Face3DSensorProvenance sensorProvenance,
            IEnumerable<string> warnings)
        {
            SchemaVersion = UnifiedFaceCaptureContract.ProfileSchemaVersion;
            Source = Face3DContract.Source;
            CollectionPolicyId = policy.Id;
            SampleMode = policy.SampleMode;
            Aggregation = policy.Aggregation;
            GateVersion = UnifiedFaceCaptureContract.GateVersion;
            ValidFrameCount = aggregate.ValidFrameCount;
            TargetFrameCount = policy.TargetValidFrames;
            CompletionRatio = Mathf.Clamp01(
                policy.TargetValidFrames > 0
                    ? (float)aggregate.ValidFrameCount / policy.TargetValidFrames
                    : 0.0f);
            ConfidenceCalibrationStatus =
                UnifiedFaceCaptureContract.ConfidenceCalibrationUncalibrated;
            CaptureNonce = captureNonce;
            ProfileBindingSha256 = null;
            CalibrationReceipt = null;
            SensorProvenance =
                sensorProvenance ?? Face3DSensorProvenance.Unknown();
            // The collector rejects samples outside the immutable policy window,
            // but finalization runs on a later Unity update and can observe a few
            // milliseconds of scheduler overshoot. Report the bounded sampling
            // window, not finalization latency, so partial 5-7 frame profiles keep
            // the same <=500ms wire contract as full 8-frame profiles.
            CaptureWindowMs = Math.Min(
                policy.MaximumDurationMs,
                Math.Max(0.0, captureWindowMs));
            TopologyFingerprint = aggregate.TopologyFingerprint;
            Metrics = aggregate.Metrics;
            this.warnings = new ReadOnlyCollection<string>(
                new List<string>(warnings ?? Array.Empty<string>()));
        }

        public string SchemaVersion { get; }
        public string Source { get; }
        public string CollectionPolicyId { get; }
        public string SampleMode { get; }
        public string Aggregation { get; }
        public string GateVersion { get; }
        public int ValidFrameCount { get; }
        public int TargetFrameCount { get; }
        public float CompletionRatio { get; }
        public string ConfidenceCalibrationStatus { get; }
        public string CaptureNonce { get; }
        public string ProfileBindingSha256 { get; }
        public Face3DCalibrationReceipt CalibrationReceipt { get; }
        public Face3DSensorProvenance SensorProvenance { get; }
        public double CaptureWindowMs { get; }
        public string TopologyFingerprint { get; }
        public Face3DProfileMetrics Metrics { get; }
        public IReadOnlyList<string> Warnings => warnings;

        public static Face3DProfileV2 Create(
            UnifiedFaceCapturePolicy policy,
            Face3DProfile aggregate,
            double captureWindowMs,
            string captureNonce,
            Face3DSensorProvenance sensorProvenance = null)
        {
            if (policy == null)
            {
                throw new ArgumentNullException(nameof(policy));
            }
            if (aggregate == null)
            {
                throw new ArgumentNullException(nameof(aggregate));
            }
            if (string.IsNullOrWhiteSpace(captureNonce))
            {
                throw new ArgumentException(
                    "Capture nonce must be non-empty.",
                    nameof(captureNonce));
            }
            if (aggregate.ValidFrameCount < policy.MinimumValidFrames
                || aggregate.ValidFrameCount > policy.TargetValidFrames)
            {
                throw new ArgumentException(
                    "Aggregate frame count does not satisfy the immutable policy.",
                    nameof(aggregate));
            }

            bool isSingleFrame = string.Equals(
                policy.SampleMode,
                UnifiedFaceCaptureContract.SampleModeSingleFrame,
                StringComparison.Ordinal);
            HashSet<string> normalizedWarnings = new HashSet<string>(
                aggregate.Warnings,
                StringComparer.Ordinal);
            normalizedWarnings.Remove("target_frame_count_not_reached");
            if (isSingleFrame)
            {
                normalizedWarnings.Add("single_frame_unaggregated");
            }
            else if (aggregate.ValidFrameCount < policy.TargetValidFrames)
            {
                normalizedWarnings.Add("micro_burst_target_not_reached");
            }

            List<string> sortedWarnings = new List<string>(normalizedWarnings);
            sortedWarnings.Sort(StringComparer.Ordinal);
            return new Face3DProfileV2(
                policy,
                isSingleFrame
                    ? WithoutAggregationMetadata(aggregate)
                    : aggregate,
                captureWindowMs,
                captureNonce.Trim(),
                sensorProvenance,
                sortedWarnings);
        }

        private static Face3DProfile WithoutAggregationMetadata(
            Face3DProfile aggregate)
        {
            return new Face3DProfile(
                aggregate.TopologyFingerprint,
                aggregate.ValidFrameCount,
                aggregate.TargetFrameCount,
                aggregate.Warnings,
                new Face3DProfileMetrics(
                    WithoutAggregationMetadata(
                        aggregate.Metrics.NoseTipProjection),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.ChinProjection),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.UpperLipToELine),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.LowerLipToELine),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.CentralProjectionScore),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.NoseLength),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.NasalBridgeStraightness),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.NasalAxisDeviation),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.AlarWidth),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.MalarProjectionLeft),
                    WithoutAggregationMetadata(
                        aggregate.Metrics.MalarProjectionRight)));
        }

        private static Face3DProfileMetric WithoutAggregationMetadata(
            Face3DProfileMetric metric)
        {
            return metric == null
                ? null
                : new Face3DProfileMetric(
                    metric.Value,
                    0.0f,
                    metric.ValidFrameCount,
                    0.0f,
                    metric.ValueMm,
                    0.0f,
                    metric.ValueMmValidFrameCount,
                    0.0f);
        }

        public string ToCanonicalJson()
        {
            return Face3DProfileV2Json.Serialize(this);
        }
    }

    public sealed class UnifiedFace3DProfileCollector
    {
        private readonly UnifiedFaceCaptureRequest request;
        private readonly double startTimestampSeconds;
        private readonly Face3DProfileCollector collector;

        public UnifiedFace3DProfileCollector(
            UnifiedFaceCaptureRequest request,
            double startTimestampSeconds,
            Face3DSensorProvenance sensorProvenance = null)
        {
            this.request = request ?? throw new ArgumentNullException(nameof(request));
            startTimestampSeconds = Face3DNumeric.IsFinite(startTimestampSeconds)
                ? startTimestampSeconds
                : throw new ArgumentOutOfRangeException(nameof(startTimestampSeconds));
            this.startTimestampSeconds = startTimestampSeconds;
            SensorProvenance =
                sensorProvenance ?? Face3DSensorProvenance.Unknown();
            collector = new Face3DProfileCollector(
                startTimestampSeconds,
                new Face3DCollectionPolicy(
                    request.Policy.MaximumDurationMs / 1000.0,
                    request.Policy.TargetValidFrames,
                    request.Policy.MinimumValidFrames,
                    separateCompletionFromQuality: true));
        }

        public int ValidFrameCount => collector.ValidFrameCount;
        public Face3DSensorProvenance SensorProvenance { get; }

        public Face3DCollectionUpdate AddEvaluation(
            Face3DEvaluationResult evaluation,
            double timestampSeconds)
        {
            return collector.AddEvaluation(evaluation, timestampSeconds);
        }

        public void AddWarning(string warning)
        {
            collector.AddWarning(warning);
        }

        public bool ShouldStop(double timestampSeconds)
        {
            return collector.ShouldStop(timestampSeconds);
        }

        public bool TryBuildProfile(
            double timestampSeconds,
            out Face3DProfileV2 profile,
            out string reason)
        {
            return TryBuildProfile(
                timestampSeconds,
                SensorProvenance,
                out profile,
                out reason);
        }

        public bool TryBuildProfile(
            double timestampSeconds,
            Face3DSensorProvenance sensorProvenance,
            out Face3DProfileV2 profile,
            out string reason)
        {
            profile = null;
            if (!collector.TryBuildProfile(
                    timestampSeconds,
                    out Face3DProfile aggregate,
                    out reason))
            {
                return false;
            }

            double captureWindowMs = Math.Max(
                0.0,
                (timestampSeconds - startTimestampSeconds) * 1000.0);
            profile = Face3DProfileV2.Create(
                request.Policy,
                aggregate,
                captureWindowMs,
                request.RequestId,
                sensorProvenance ?? SensorProvenance);
            reason = string.Empty;
            return true;
        }
    }

    public static class Face3DProfileV2Json
    {
        public static string Serialize(Face3DProfileV2 profile)
        {
            if (profile == null)
            {
                throw new ArgumentNullException(nameof(profile));
            }

            StringBuilder json = new StringBuilder(1024);
            json.Append('{');
            AppendString(json, "schemaVersion", profile.SchemaVersion, true);
            AppendString(json, "source", profile.Source, false);
            AppendString(json, "collectionPolicyId", profile.CollectionPolicyId, false);
            AppendString(json, "sampleMode", profile.SampleMode, false);
            AppendString(json, "aggregation", profile.Aggregation, false);
            AppendString(json, "gateVersion", profile.GateVersion, false);
            AppendInt(json, "validFrameCount", profile.ValidFrameCount);
            AppendInt(json, "targetFrameCount", profile.TargetFrameCount);
            AppendNumber(json, "completionRatio", profile.CompletionRatio);
            AppendString(
                json,
                "confidenceCalibrationStatus",
                profile.ConfidenceCalibrationStatus,
                false);
            AppendString(json, "captureNonce", profile.CaptureNonce, false);
            AppendNullableString(
                json,
                "profileBindingSha256",
                profile.ProfileBindingSha256);
            AppendCalibrationReceipt(json, profile.CalibrationReceipt);
            AppendSensorProvenance(json, profile.SensorProvenance);
            AppendNumber(json, "captureWindowMs", profile.CaptureWindowMs);
            AppendString(json, "topologyFingerprint", profile.TopologyFingerprint, false);
            json.Append(",\"warnings\":[");
            for (int index = 0; index < profile.Warnings.Count; index += 1)
            {
                if (index > 0)
                {
                    json.Append(',');
                }
                AppendEscapedValue(json, profile.Warnings[index]);
            }
            json.Append(']');
            json.Append(",\"metrics\":{");
            bool hasAggregationStatistics = !string.Equals(
                profile.Aggregation,
                UnifiedFaceCaptureContract.AggregationNone,
                StringComparison.Ordinal);
            AppendMetric(
                json,
                Face3DContract.NoseTipProjection,
                profile.Metrics.NoseTipProjection,
                true,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.ChinProjection,
                profile.Metrics.ChinProjection,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.UpperLipToELine,
                profile.Metrics.UpperLipToELine,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.LowerLipToELine,
                profile.Metrics.LowerLipToELine,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.CentralProjectionScore,
                profile.Metrics.CentralProjectionScore,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.NoseLength,
                profile.Metrics.NoseLength,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.NasalBridgeStraightness,
                profile.Metrics.NasalBridgeStraightness,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.NasalAxisDeviation,
                profile.Metrics.NasalAxisDeviation,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.AlarWidth,
                profile.Metrics.AlarWidth,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.MalarProjectionLeft,
                profile.Metrics.MalarProjectionLeft,
                false,
                hasAggregationStatistics);
            AppendMetric(
                json,
                Face3DContract.MalarProjectionRight,
                profile.Metrics.MalarProjectionRight,
                false,
                hasAggregationStatistics);
            json.Append("}}");
            return json.ToString();
        }

        private static void AppendMetric(
            StringBuilder json,
            string name,
            Face3DProfileMetric metric,
            bool first,
            bool hasAggregationStatistics)
        {
            if (!first)
            {
                json.Append(',');
            }
            AppendEscapedValue(json, name);
            json.Append(":{\"value\":");
            if (metric != null && metric.Value.HasValue)
            {
                AppendNumberValue(json, metric.Value.Value);
            }
            else
            {
                json.Append("null");
            }
            json.Append(",\"valueMm\":");
            if (metric != null && metric.ValueMm.HasValue)
            {
                AppendNumberValue(json, metric.ValueMm.Value);
            }
            else
            {
                json.Append("null");
            }
            json.Append(",\"valueMmConfidence\":");
            AppendNumberValue(
                json,
                metric != null ? metric.ValueMmConfidence : 0.0f);
            json.Append(",\"valueMmValidFrameCount\":");
            json.Append(metric != null ? metric.ValueMmValidFrameCount : 0);
            json.Append(",\"valueMmMad\":");
            if (hasAggregationStatistics)
            {
                AppendNumberValue(json, metric != null ? metric.ValueMmMad : 0.0f);
            }
            else
            {
                json.Append("null");
            }
            json.Append(",\"confidence\":");
            AppendNumberValue(json, metric != null ? metric.Confidence : 0.0f);
            json.Append(",\"unit\":\"normalized\",\"validFrameCount\":");
            json.Append(metric != null ? metric.ValidFrameCount : 0);
            json.Append(",\"mad\":");
            if (hasAggregationStatistics)
            {
                AppendNumberValue(json, metric != null ? metric.Mad : 0.0f);
            }
            else
            {
                json.Append("null");
            }
            json.Append('}');
        }

        private static void AppendCalibrationReceipt(
            StringBuilder json,
            Face3DCalibrationReceipt receipt)
        {
            json.Append(",\"calibrationReceipt\":");
            if (receipt == null)
            {
                json.Append("null");
                return;
            }

            json.Append('{');
            AppendString(json, "receiptId", receipt.ReceiptId, true);
            AppendString(json, "captureNonce", receipt.CaptureNonce, false);
            AppendString(
                json,
                "profileBindingSha256",
                receipt.ProfileBindingSha256,
                false);
            AppendString(
                json,
                "collectionPolicyId",
                receipt.CollectionPolicyId,
                false);
            AppendString(json, "gateVersion", receipt.GateVersion, false);
            AppendString(json, "appBuild", receipt.AppBuild, false);
            AppendString(json, "issuedAtUtc", receipt.IssuedAtUtc, false);
            AppendString(json, "expiresAtUtc", receipt.ExpiresAtUtc, false);
            AppendString(
                json,
                "subjectContextId",
                receipt.SubjectContextId,
                false);
            AppendString(
                json,
                "reportContextId",
                receipt.ReportContextId,
                false);
            AppendString(
                json,
                "approvalArtifactSha256",
                receipt.ApprovalArtifactSha256,
                false);
            AppendString(
                json,
                "signatureAlgorithm",
                receipt.SignatureAlgorithm,
                false);
            AppendString(json, "signingKeyId", receipt.SigningKeyId, false);
            AppendString(json, "signature", receipt.Signature, false);
            json.Append('}');
        }

        private static void AppendSensorProvenance(
            StringBuilder json,
            Face3DSensorProvenance provenance)
        {
            Face3DSensorProvenance resolved =
                provenance ?? Face3DSensorProvenance.Unknown();
            json.Append(",\"sensorProvenance\":{");
            AppendNullableBoolValue(json, "trueDepthHardware", resolved.TrueDepthHardware, true);
            AppendNullableNumberValue(
                json,
                "depthDataObservedRatio",
                resolved.DepthDataObservedRatio,
                false);
            AppendNullableBoolValue(
                json,
                "faceTrackingSupported",
                resolved.FaceTrackingSupported,
                false);
            json.Append(",\"deviceModel\":");
            if (resolved.DeviceModel == null)
            {
                json.Append("null");
            }
            else
            {
                AppendEscapedValue(json, resolved.DeviceModel);
            }
            json.Append('}');
        }

        private static void AppendString(
            StringBuilder json,
            string name,
            string value,
            bool first)
        {
            if (!first)
            {
                json.Append(',');
            }
            AppendEscapedValue(json, name);
            json.Append(':');
            AppendEscapedValue(json, value);
        }

        private static void AppendInt(StringBuilder json, string name, int value)
        {
            json.Append(',');
            AppendEscapedValue(json, name);
            json.Append(':').Append(value.ToString(CultureInfo.InvariantCulture));
        }

        private static void AppendNullableString(
            StringBuilder json,
            string name,
            string value)
        {
            json.Append(',');
            AppendEscapedValue(json, name);
            json.Append(':');
            if (value == null)
            {
                json.Append("null");
            }
            else
            {
                AppendEscapedValue(json, value);
            }
        }

        private static void AppendNullableBoolValue(
            StringBuilder json,
            string name,
            bool? value,
            bool first)
        {
            if (!first)
            {
                json.Append(',');
            }
            AppendEscapedValue(json, name);
            json.Append(':');
            json.Append(value.HasValue
                ? (value.Value ? "true" : "false")
                : "null");
        }

        private static void AppendNullableNumberValue(
            StringBuilder json,
            string name,
            float? value,
            bool first)
        {
            if (!first)
            {
                json.Append(',');
            }
            AppendEscapedValue(json, name);
            json.Append(':');
            if (value.HasValue)
            {
                AppendNumberValue(json, value.Value);
            }
            else
            {
                json.Append("null");
            }
        }

        private static void AppendNumber(
            StringBuilder json,
            string name,
            double value)
        {
            json.Append(',');
            AppendEscapedValue(json, name);
            json.Append(':');
            AppendNumberValue(json, value);
        }

        private static void AppendNumberValue(StringBuilder json, double value)
        {
            json.Append(value.ToString("R", CultureInfo.InvariantCulture));
        }

        private static void AppendEscapedValue(StringBuilder json, string value)
        {
            json.Append('"');
            string safeValue = value ?? string.Empty;
            for (int index = 0; index < safeValue.Length; index += 1)
            {
                char character = safeValue[index];
                switch (character)
                {
                    case '"':
                        json.Append("\\\"");
                        break;
                    case '\\':
                        json.Append("\\\\");
                        break;
                    case '\b':
                        json.Append("\\b");
                        break;
                    case '\f':
                        json.Append("\\f");
                        break;
                    case '\n':
                        json.Append("\\n");
                        break;
                    case '\r':
                        json.Append("\\r");
                        break;
                    case '\t':
                        json.Append("\\t");
                        break;
                    default:
                        if (character < 0x20)
                        {
                            json.Append("\\u");
                            json.Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            json.Append(character);
                        }
                        break;
                }
            }
            json.Append('"');
        }
    }
}
