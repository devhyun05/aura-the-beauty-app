using System;
using System.Linq;
using NUnit.Framework;

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
            Face3DProfileV2 profile = Face3DProfileV2.Create(
                policy,
                CreateAggregate(1, 1),
                18.5);

            Assert.That(profile.SampleMode, Is.EqualTo("single_frame"));
            Assert.That(profile.Aggregation, Is.EqualTo("none"));
            Assert.That(profile.ConfidenceCalibrationStatus, Is.EqualTo("uncalibrated"));
            Assert.That(profile.Warnings, Does.Contain("single_frame_unaggregated"));
            Assert.That(profile.ToCanonicalJson(), Does.Contain("\"schemaVersion\":\"aura.face3d-profile.v2\""));
            Assert.That(profile.ToCanonicalJson(), Does.Contain("\"completionRatio\":1"));
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
                500.0);

            Assert.That(profile.ValidFrameCount, Is.EqualTo(5));
            Assert.That(profile.CompletionRatio, Is.EqualTo(0.625f));
            Assert.That(profile.Warnings, Does.Contain("micro_burst_target_not_reached"));
            Assert.That(profile.Warnings, Does.Not.Contain("target_frame_count_not_reached"));
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
    }
}
