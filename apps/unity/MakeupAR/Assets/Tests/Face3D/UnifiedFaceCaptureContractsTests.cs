using System;
using System.Globalization;
using System.Linq;
using NUnit.Framework;
using UnityEngine;

namespace Aura.Face3D.Tests
{
    public sealed class UnifiedFaceCaptureContractsTests
    {
        [Test]
        public void ProductPolicyAcceptsOnlyExactFiveOfEightTuple()
        {
            UnifiedFaceCaptureRequestData data = CreateRequestData(
                UnifiedFaceCaptureContract.ProductPolicyId,
                UnifiedFaceCaptureContract.SampleModeMicroBurst,
                500,
                5,
                8);

            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryValidate(
                    data,
                    out UnifiedFaceCaptureRequest request,
                    out string reason),
                Is.True,
                reason);
            Assert.That(request.Policy.Aggregation, Is.EqualTo("median_mad"));
            Assert.That(request.RetryAttemptCount, Is.EqualTo(0));

            data.targetValidFrames = 7;
            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryValidate(
                    data,
                    out _,
                    out reason),
                Is.False);
            Assert.That(reason, Is.EqualTo("unified_capture_policy_tuple_mismatch"));
        }

        [Test]
        public void RetryAttemptIsLimitedToZeroOrOne()
        {
            UnifiedFaceCaptureRequestData data = CreateRequestData(
                UnifiedFaceCaptureContract.ProductPolicyId,
                UnifiedFaceCaptureContract.SampleModeMicroBurst,
                500,
                5,
                8);
            data.retryAttemptCount = 2;

            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryValidate(
                    data,
                    out _,
                    out string reason),
                Is.False);
            Assert.That(
                reason,
                Is.EqualTo("unified_capture_retry_attempt_invalid"));
        }

        [TestCase(UnifiedFaceCaptureContract.DiagnosticsExact1PolicyId, "single_frame", 500, 1)]
        [TestCase(UnifiedFaceCaptureContract.DiagnosticsExact3PolicyId, "micro_burst", 500, 3)]
        [TestCase(UnifiedFaceCaptureContract.DiagnosticsExact5PolicyId, "micro_burst", 500, 5)]
        [TestCase(UnifiedFaceCaptureContract.DiagnosticsExact8PolicyId, "micro_burst", 500, 8)]
        [TestCase(UnifiedFaceCaptureContract.DiagnosticsExact12PolicyId, "micro_burst", 750, 12)]
        [TestCase(UnifiedFaceCaptureContract.DiagnosticsExact30PolicyId, "micro_burst", 3000, 30)]
        public void DiagnosticsPolicyIdsHaveImmutableExactTuples(
            string policyId,
            string sampleMode,
            int durationMs,
            int frames)
        {
            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryValidate(
                    CreateRequestData(
                        policyId,
                        sampleMode,
                        durationMs,
                        frames,
                        frames),
                    out _,
                    out string reason),
                Is.True,
                reason);
        }

        [Test]
        public void SingleFrameV2ProfileIsExplicitlyUnaggregatedAndUncalibrated()
        {
            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryGetPolicy(
                    UnifiedFaceCaptureContract.DiagnosticsExact1PolicyId,
                    out UnifiedFaceCapturePolicy policy),
                Is.True);
            Face3DProfileMetric aggregatedMetric = new Face3DProfileMetric(
                0.1f,
                0.87f,
                1,
                0.03f);
            Face3DProfileV2 profile = Face3DProfileV2.Create(
                policy,
                new Face3DProfile(
                    "test-topology",
                    1,
                    1,
                    Array.Empty<string>(),
                    new Face3DProfileMetrics(
                        aggregatedMetric,
                        aggregatedMetric,
                        aggregatedMetric,
                        aggregatedMetric,
                        aggregatedMetric)),
                18.5,
                "single-frame-profile-nonce");

            Assert.That(profile.SampleMode, Is.EqualTo("single_frame"));
            Assert.That(profile.Aggregation, Is.EqualTo("none"));
            Assert.That(profile.ConfidenceCalibrationStatus, Is.EqualTo("uncalibrated"));
            Assert.That(profile.CaptureNonce, Is.EqualTo("single-frame-profile-nonce"));
            Assert.That(profile.ProfileBindingSha256, Is.Null);
            Assert.That(profile.CalibrationReceipt, Is.Null);
            Assert.That(
                UnifiedFaceCaptureContract.CalibrationPromotionEnabled,
                Is.False);
            Assert.That(profile.Metrics.NoseTipProjection.Value, Is.EqualTo(0.1f));
            Assert.That(profile.Metrics.NoseTipProjection.Confidence, Is.Zero);
            Assert.That(profile.Metrics.NoseTipProjection.Mad, Is.Zero);
            Assert.That(profile.Metrics.NoseTipProjection.ValueMmConfidence, Is.Zero);
            Assert.That(profile.Metrics.NoseTipProjection.ValueMmValidFrameCount, Is.Zero);
            Assert.That(profile.Metrics.NoseTipProjection.ValueMmMad, Is.Zero);
            Assert.That(profile.Warnings, Does.Contain("single_frame_unaggregated"));
            Assert.That(profile.ToCanonicalJson(), Does.Contain("\"schemaVersion\":\"aura.face3d-profile.v3\""));
            Assert.That(profile.ToCanonicalJson(), Does.Contain("\"completionRatio\":1"));
            Assert.That(profile.ToCanonicalJson(), Does.Contain("\"mad\":null"));
            Assert.That(profile.ToCanonicalJson(), Does.Contain("\"valueMm\":null"));
            Assert.That(
                profile.ToCanonicalJson(),
                Does.Contain("\"valueMmConfidence\":0"));
            Assert.That(
                profile.ToCanonicalJson(),
                Does.Contain("\"valueMmValidFrameCount\":0"));
            Assert.That(
                profile.ToCanonicalJson(),
                Does.Contain("\"valueMmMad\":null"));
            Assert.That(
                profile.ToCanonicalJson(),
                Does.Contain("\"calibrationReceipt\":null"));
            Assert.That(
                profile.ToCanonicalJson(),
                Does.Contain(
                    "\"sensorProvenance\":{\"trueDepthHardware\":null,"
                    + "\"depthDataObservedRatio\":null,"
                    + "\"faceTrackingSupported\":null,"
                    + "\"deviceModel\":null}"));
        }

        [Test]
        public void SingleFrameCollectorPreservesRawValueWithoutMadConfidence()
        {
            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryValidate(
                    CreateRequestData(
                        UnifiedFaceCaptureContract.DiagnosticsExact1PolicyId,
                        UnifiedFaceCaptureContract.SampleModeSingleFrame,
                        500,
                        1,
                        1),
                    out UnifiedFaceCaptureRequest request,
                    out string reason),
                Is.True,
                reason);

            Face3DMeshSnapshot snapshot = new Face3DMeshSnapshot(
                new[]
                {
                    new Vector3(0.0f, 0.0f, 0.0f),
                    new Vector3(1.0f, 0.0f, 0.0f),
                    new Vector3(0.0f, 1.0f, 0.0f)
                },
                new[] { 0, 1, 2 },
                new[]
                {
                    new Vector2(0.0f, 0.0f),
                    new Vector2(1.0f, 0.0f),
                    new Vector2(0.0f, 1.0f)
                },
                10.01);
            Assert.That(
                Face3DTopologyFingerprint.TryCreate(
                    snapshot,
                    out Face3DTopologyFingerprint topology,
                    out reason),
                Is.True,
                reason);

            Face3DEvaluationResult evaluation = Face3DEvaluationResult.Valid(
                topology,
                new Face3DMetrics(
                    0.11f,
                    0.22f,
                    0.33f,
                    0.44f,
                    0.55f,
                    noseLength: 0.66f,
                    noseTipProjectionMeters: 0.0021f,
                    chinProjectionMeters: 0.0032f,
                    upperLipToELineMeters: -0.0013f,
                    lowerLipToELineMeters: -0.0014f,
                    centralProjectionScoreMeters: 0.0025f,
                    noseLengthMeters: 0.0066f));
            UnifiedFace3DProfileCollector collector =
                new UnifiedFace3DProfileCollector(request, 10.0);

            Face3DCollectionUpdate blockedUpdate = collector.AddEvaluation(
                Face3DEvaluationResult.Blocked("blocked_before_valid"),
                10.005);
            Assert.That(
                blockedUpdate.Status,
                Is.EqualTo(Face3DCollectionAddStatus.RejectedBlockedFrame));
            Face3DCollectionUpdate update =
                collector.AddEvaluation(evaluation, 10.01);
            Assert.That(
                update.Status,
                Is.EqualTo(Face3DCollectionAddStatus.AcceptedTargetReached));
            Assert.That(
                collector.TryBuildProfile(10.01, out Face3DProfileV2 profile, out reason),
                Is.True,
                reason);

            Assert.That(profile.Aggregation, Is.EqualTo("none"));
            Assert.That(profile.Metrics.NoseTipProjection.Value, Is.EqualTo(0.11f));
            Assert.That(profile.Metrics.NoseTipProjection.ValueMm, Is.EqualTo(2.1f));
            Assert.That(profile.Metrics.NoseTipProjection.ValueMmConfidence, Is.Zero);
            Assert.That(
                profile.Metrics.NoseTipProjection.ValueMmValidFrameCount,
                Is.EqualTo(1));
            Assert.That(profile.Metrics.NoseTipProjection.ValueMmMad, Is.Zero);
            Assert.That(profile.Metrics.NoseTipProjection.Confidence, Is.Zero);
            Assert.That(profile.Metrics.NoseTipProjection.Mad, Is.Zero);
            Assert.That(profile.Metrics.NoseTipProjection.ValidFrameCount, Is.EqualTo(1));
            Assert.That(profile.Metrics.NoseLength.Value, Is.EqualTo(0.66f));
            Assert.That(profile.Metrics.NoseLength.ValueMm, Is.EqualTo(6.6f));
            Assert.That(profile.Metrics.NoseLength.Confidence, Is.Zero);
            Assert.That(profile.Metrics.NoseLength.ValidFrameCount, Is.EqualTo(1));
            Assert.That(profile.Metrics.AlarWidth.Value, Is.Null);
            Assert.That(profile.Metrics.AlarWidth.ValidFrameCount, Is.Zero);
            Assert.That(profile.Warnings, Does.Contain("blocked_before_valid"));
            Assert.That(profile.Warnings, Does.Contain("single_frame_unaggregated"));
            string canonicalJson = profile.ToCanonicalJson();
            Assert.That(canonicalJson, Does.Contain("\"mad\":null"));
            const string valueMmMarker = "\"valueMm\":";
            int valueMmStart = canonicalJson.IndexOf(
                valueMmMarker,
                StringComparison.Ordinal) + valueMmMarker.Length;
            int valueMmEnd = canonicalJson.IndexOf(',', valueMmStart);
            Assert.That(valueMmStart, Is.GreaterThanOrEqualTo(valueMmMarker.Length));
            Assert.That(valueMmEnd, Is.GreaterThan(valueMmStart));
            double serializedValueMm = double.Parse(
                canonicalJson.Substring(valueMmStart, valueMmEnd - valueMmStart),
                CultureInfo.InvariantCulture);
            Assert.That(serializedValueMm, Is.EqualTo(2.1d).Within(0.000001d));
            Assert.That(
                canonicalJson,
                Does.Contain(
                    "\"valueMmConfidence\":0,\"valueMmValidFrameCount\":1,"
                    + "\"valueMmMad\":null"));
        }

        [Test]
        public void PartialProductBurstUsesDedicatedWarning()
        {
            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryGetPolicy(
                    UnifiedFaceCaptureContract.ProductPolicyId,
                    out UnifiedFaceCapturePolicy policy),
                Is.True);
            Face3DProfileV2 profile = Face3DProfileV2.Create(
                policy,
                CreateAggregate(5, 8, "target_frame_count_not_reached"),
                500.0,
                "partial-product-nonce");

            Assert.That(profile.ValidFrameCount, Is.EqualTo(5));
            Assert.That(profile.CompletionRatio, Is.EqualTo(0.625f));
            Assert.That(profile.Warnings, Does.Contain("micro_burst_target_not_reached"));
            Assert.That(profile.Warnings, Does.Not.Contain("target_frame_count_not_reached"));
        }

        [Test]
        public void PartialProductBurstClampsFinalizationOvershootToPolicyWindow()
        {
            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryGetPolicy(
                    UnifiedFaceCaptureContract.ProductPolicyId,
                    out UnifiedFaceCapturePolicy policy),
                Is.True);

            Face3DProfileV2 profile = Face3DProfileV2.Create(
                policy,
                CreateAggregate(5, 8, "target_frame_count_not_reached"),
                528.0,
                "overshoot-product-nonce");

            Assert.That(profile.CaptureWindowMs, Is.EqualTo(500.0));
            Assert.That(profile.ValidFrameCount, Is.EqualTo(5));
            Assert.That(
                profile.Warnings,
                Does.Contain("micro_burst_target_not_reached"));
        }

        [Test]
        public void UnifiedCollectorSeparatesCompletionFromMetricQuality()
        {
            Assert.That(
                UnifiedFaceCaptureRequestValidator.TryValidate(
                    CreateRequestData(
                        UnifiedFaceCaptureContract.ProductPolicyId,
                        UnifiedFaceCaptureContract.SampleModeMicroBurst,
                        500,
                        5,
                        8),
                    out UnifiedFaceCaptureRequest request,
                    out string reason),
                Is.True,
                reason);
            Face3DTopologyFingerprint topology = CreateTopology(10.0);
            Face3DEvaluationResult stableEvaluation = Face3DEvaluationResult.Valid(
                topology,
                new Face3DMetrics(
                    0.1f,
                    0.1f,
                    0.1f,
                    0.1f,
                    0.1f,
                    noseTipProjectionMeters: 0.002f,
                    chinProjectionMeters: 0.002f,
                    upperLipToELineMeters: 0.002f,
                    lowerLipToELineMeters: 0.002f,
                    centralProjectionScoreMeters: 0.002f));
            UnifiedFace3DProfileCollector collector =
                new UnifiedFace3DProfileCollector(request, 10.0);
            for (int index = 0; index < 5; index += 1)
            {
                collector.AddEvaluation(stableEvaluation, 10.01 + (index * 0.05));
            }

            Assert.That(
                collector.TryBuildProfile(
                    10.5,
                    out Face3DProfileV2 profile,
                    out reason),
                Is.True,
                reason);
            Assert.That(profile.CompletionRatio, Is.EqualTo(0.625f));
            Assert.That(profile.Metrics.NoseTipProjection.Confidence, Is.EqualTo(1.0f));
            Assert.That(profile.Metrics.NoseTipProjection.ValueMm, Is.EqualTo(2.0f));
            Assert.That(
                profile.Metrics.NoseTipProjection.ValueMmConfidence,
                Is.EqualTo(1.0f));
            Assert.That(
                profile.Metrics.NoseTipProjection.ValueMmValidFrameCount,
                Is.EqualTo(5));
            Assert.That(profile.Metrics.NoseTipProjection.ValueMmMad, Is.Zero);
            Assert.That(profile.ConfidenceCalibrationStatus, Is.EqualTo("uncalibrated"));
        }

        [Test]
        public void CollectorSuppressesRawMillimetersBelowIndependentInlierMinimum()
        {
            Face3DTopologyFingerprint topology = CreateTopology(20.0);
            Face3DProfileCollector collector = new Face3DProfileCollector(
                20.0,
                new Face3DCollectionPolicy(
                    maximumDurationSeconds: 0.5,
                    targetFrameCount: 3,
                    minimumFrameCount: 3,
                    separateCompletionFromQuality: true));
            float[] normalized = { 1.0f, 1.0f, 1.0f };
            float[] meters = { 0.003f, 0.004f, 0.2f };
            for (int index = 0; index < normalized.Length; index += 1)
            {
                collector.AddEvaluation(
                    Face3DEvaluationResult.Valid(
                        topology,
                        new Face3DMetrics(
                            normalized[index],
                            normalized[index],
                            normalized[index],
                            normalized[index],
                            normalized[index],
                            noseTipProjectionMeters: meters[index],
                            chinProjectionMeters: meters[index],
                            upperLipToELineMeters: meters[index],
                            lowerLipToELineMeters: meters[index],
                            centralProjectionScoreMeters: meters[index])),
                    20.01 + (index * 0.05));
            }

            Assert.That(
                collector.TryBuildProfile(
                    20.2,
                    out Face3DProfile profile,
                    out string reason),
                Is.True,
                reason);
            Assert.That(
                profile.Metrics.NoseTipProjection.Value,
                Is.EqualTo(1.0f).Within(0.0001f));
            Assert.That(profile.Metrics.NoseTipProjection.Confidence, Is.EqualTo(1.0f));
            Assert.That(profile.Metrics.NoseTipProjection.ValueMm, Is.Null);
            Assert.That(
                profile.Metrics.NoseTipProjection.ValueMmConfidence,
                Is.LessThan(profile.Metrics.NoseTipProjection.Confidence));
            Assert.That(
                profile.Metrics.NoseTipProjection.ValueMmValidFrameCount,
                Is.EqualTo(2));
            Assert.That(
                profile.Metrics.NoseTipProjection.ValueMmMad,
                Is.EqualTo(0.5f).Within(0.0001f));
            Assert.That(
                profile.Warnings,
                Does.Contain(
                    Face3DContract.NoseTipProjection
                    + "_raw_meters_inliers_below_minimum"));
        }

        [Test]
        public void LegacyV1ConstantsRemainUnchanged()
        {
            Assert.That(Face3DContract.ProfileSchemaVersion, Is.EqualTo("aura.face3d-profile.v1"));
            Assert.That(Face3DContract.GateVersion, Is.EqualTo("face3d-gate-v1"));
            Assert.That(Face3DCollectionPolicy.ProvisionalMaximumDurationSeconds, Is.EqualTo(3.0));
            Assert.That(Face3DCollectionPolicy.ProvisionalMinimumFrameCount, Is.EqualTo(20));
            Assert.That(Face3DCollectionPolicy.ProvisionalTargetFrameCount, Is.EqualTo(30));
        }

        private static UnifiedFaceCaptureRequestData CreateRequestData(
            string policyId,
            string sampleMode,
            int maximumDurationMs,
            int minimumValidFrames,
            int targetValidFrames)
        {
            return new UnifiedFaceCaptureRequestData
            {
                requestId = "unity-test-request",
                gateVersion = UnifiedFaceCaptureContract.GateVersion,
                hairlinePolicy = UnifiedFaceCaptureContract.HairlinePolicy,
                collectionPolicyId = policyId,
                sampleMode = sampleMode,
                maximumDurationMs = maximumDurationMs,
                minimumValidFrames = minimumValidFrames,
                targetValidFrames = targetValidFrames,
                maxAbsFaceSensorDeltaMs = 40.0
            };
        }

        private static Face3DProfile CreateAggregate(
            int validFrameCount,
            int targetFrameCount,
            params string[] warnings)
        {
            Face3DProfileMetric metric = new Face3DProfileMetric(
                0.1f,
                0.0f,
                validFrameCount,
                0.0f);
            return new Face3DProfile(
                "test-topology",
                validFrameCount,
                targetFrameCount,
                warnings ?? Array.Empty<string>(),
                new Face3DProfileMetrics(
                    metric,
                    metric,
                    metric,
                    metric,
                    metric));
        }

        private static Face3DTopologyFingerprint CreateTopology(double timestampSeconds)
        {
            Face3DMeshSnapshot snapshot = new Face3DMeshSnapshot(
                new[]
                {
                    new Vector3(0.0f, 0.0f, 0.0f),
                    new Vector3(1.0f, 0.0f, 0.0f),
                    new Vector3(0.0f, 1.0f, 0.0f)
                },
                new[] { 0, 1, 2 },
                new[]
                {
                    new Vector2(0.0f, 0.0f),
                    new Vector2(1.0f, 0.0f),
                    new Vector2(0.0f, 1.0f)
                },
                timestampSeconds);
            Assert.That(
                Face3DTopologyFingerprint.TryCreate(
                    snapshot,
                    out Face3DTopologyFingerprint topology,
                    out string reason),
                Is.True,
                reason);
            return topology;
        }
    }
}
