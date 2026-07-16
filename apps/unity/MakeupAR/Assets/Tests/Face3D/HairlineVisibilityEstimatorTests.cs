using NUnit.Framework;
using UnityEngine;

namespace Aura.Face3D.Tests
{
    public sealed class HairlineVisibilityEstimatorTests
    {
        private const int Width = 160;
        private const int Height = 200;

        [Test]
        public void ClearHairSkinBoundary_ReturnsHighConfidenceActualMeasurement()
        {
            byte[] mask = CreateBoundaryMask(
                boundaryY: 0.28f,
                activeX0: 0.0f,
                activeX1: 1.0f,
                hairProbability: 1.0f,
                skinProbability: 1.0f);

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    mask,
                    CreateMaskReference(),
                    CreateFaceReference());

            Assert.That(
                result.Outcome,
                Is.EqualTo(HairlineDetectionContract.OutcomeHighConfidence));
            Assert.That(
                result.AdvisoryStatus,
                Is.EqualTo(HairlineDetectionContract.AdvisoryLikelyVisible));
            Assert.That(result.AnalysisEligible, Is.True);
            Assert.That(result.Position.HasValue, Is.True);
            Assert.That(result.Position.Value.y, Is.EqualTo(0.28f).Within(0.015f));
            Assert.That(result.Confidence, Is.GreaterThanOrEqualTo(0.70f));
            Assert.That(result.Provider, Is.EqualTo(HairlineDetectionContract.Provider));
            Assert.That(result.Provider, Is.EqualTo("mediapipe_selfie_multiclass"));
            Assert.That(result.FrameToken, Is.EqualTo("seg-test-1"));
        }

        [Test]
        public void SparseButRealBoundary_ReturnsLowConfidenceActualMeasurement()
        {
            byte[] mask = CreateBoundaryMask(
                boundaryY: 0.30f,
                activeX0: 0.458f,
                activeX1: 0.542f,
                hairProbability: 0.48f,
                skinProbability: 0.55f);

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    mask,
                    CreateMaskReference(),
                    CreateFaceReference(yawDegrees: 7.2f));

            Assert.That(
                result.Outcome,
                Is.EqualTo(HairlineDetectionContract.OutcomeLowConfidence));
            Assert.That(result.AnalysisEligible, Is.False);
            Assert.That(result.Position.HasValue, Is.True);
            Assert.That(result.Confidence, Is.InRange(0.45f, 0.699999f));
            Assert.That(
                result.AdvisoryStatus,
                Is.EqualTo(HairlineDetectionContract.AdvisoryUnknown));
        }

        [Test]
        public void MissingBoundary_OmitsHairlineWithoutProxy()
        {
            byte[] mask = CreateUniformMask(
                faceSkinProbability: 1.0f,
                hairProbability: 0.0f);

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    mask,
                    CreateMaskReference(),
                    CreateFaceReference());

            Assert.That(
                result.Outcome,
                Is.EqualTo(HairlineDetectionContract.OutcomeOmitted));
            Assert.That(result.HasActualMeasurement, Is.False);
            Assert.That(result.Position, Is.Null);
            Assert.That(result.Provider, Is.EqualTo("none"));
            Assert.That(result.Method, Is.Empty);
            Assert.That(result.FailureReason, Is.EqualTo("no_candidates"));
            Assert.That(
                result.AdvisoryStatus,
                Is.EqualTo(HairlineDetectionContract.AdvisoryUnknown));
        }

        [Test]
        public void BoundaryBelowMinimumConfidence_IsDiagnosticOnlyAndStillOmitted()
        {
            byte[] mask = CreateWeakBoundaryMask(
                boundaryY: 0.30f,
                activeX0: 0.47f,
                activeX1: 0.53f);

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    mask,
                    CreateMaskReference(),
                    CreateFaceReference(yawDegrees: 8.0f));

            Assert.That(
                result.Outcome,
                Is.EqualTo(HairlineDetectionContract.OutcomeOmitted));
            Assert.That(result.FailureReason, Is.EqualTo("confidence_below_minimum"));
            Assert.That(result.Confidence, Is.LessThan(0.45f));
            Assert.That(result.Position, Is.Null);
            Assert.That(result.Provider, Is.EqualTo("none"));
        }

        [Test]
        public void HairDominatesWholeForehead_UsesOnlyStrongOcclusionAdvisory()
        {
            byte[] mask = CreateUniformMask(
                faceSkinProbability: 0.0f,
                hairProbability: 1.0f);

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    mask,
                    CreateMaskReference(),
                    CreateFaceReference());

            Assert.That(
                result.Outcome,
                Is.EqualTo(HairlineDetectionContract.OutcomeOmitted));
            Assert.That(
                result.AdvisoryStatus,
                Is.EqualTo(HairlineDetectionContract.AdvisoryLikelyOccluded));
            Assert.That(result.Position, Is.Null);
            Assert.That(result.HairDominantFraction, Is.GreaterThanOrEqualTo(0.72f));
            Assert.That(
                result.CentralHairDominantFraction,
                Is.GreaterThanOrEqualTo(0.80f));
        }

        [Test]
        public void VisibleSkinWithoutBoundary_IsUnknownNotOcclusionDiagnosis()
        {
            byte[] mask = CreateUniformMask(
                faceSkinProbability: 1.0f,
                hairProbability: 0.0f);

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    mask,
                    CreateMaskReference(),
                    CreateFaceReference());

            Assert.That(
                result.AdvisoryStatus,
                Is.EqualTo(HairlineDetectionContract.AdvisoryUnknown));
            Assert.That(result.Position, Is.Null);
        }

        [Test]
        public void BoundaryJustAboveInitialRoi_ExpandsUpwardOnceAndMeasuresIt()
        {
            byte[] mask = CreateBoundaryMask(
                boundaryY: 0.08f,
                activeX0: 0.0f,
                activeX1: 1.0f,
                hairProbability: 1.0f,
                skinProbability: 1.0f);

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    mask,
                    CreateMaskReference(),
                    CreateFaceReference());

            Assert.That(result.UsedExpandedRoi, Is.True);
            Assert.That(result.Position.HasValue, Is.True);
            Assert.That(result.Position.Value.y, Is.EqualTo(0.08f).Within(0.015f));
            Assert.That(
                result.Outcome,
                Is.EqualTo(HairlineDetectionContract.OutcomeHighConfidence));
        }

        [Test]
        public void ExplicitReferenceToMaskAffine_IsAppliedDuringBoundaryScan()
        {
            byte[] rotatedMask = CreateClockwiseRotatedBoundaryMask(0.28f);
            HairlineMaskReference rotatedReference = new HairlineMaskReference(
                "seg-rotated",
                321.0,
                325.0,
                Width,
                Height,
                Width,
                Height,
                90,
                new Vector3(0.0f, -1.0f, 1.0f),
                new Vector3(1.0f, 0.0f, 0.0f));

            HairlineDetectionResult result =
                HairlineVisibilityEstimator.Evaluate(
                    rotatedMask,
                    rotatedReference,
                    CreateFaceReference());

            Assert.That(result.Position.HasValue, Is.True);
            Assert.That(result.Position.Value.y, Is.EqualTo(0.28f).Within(0.02f));
            Assert.That(
                result.Outcome,
                Is.EqualTo(HairlineDetectionContract.OutcomeHighConfidence));
        }

        private static HairlineMaskReference CreateMaskReference()
        {
            return HairlineMaskReference.CreateUprightIdentity(
                "seg-test-1",
                123.0,
                125.0,
                Width,
                Height,
                Width,
                Height,
                0);
        }

        private static HairlineFaceReference CreateFaceReference(
            float yawDegrees = 0.0f)
        {
            return new HairlineFaceReference(
                new Vector2(0.20f, 0.50f),
                new Vector2(0.80f, 0.50f),
                new Vector2(0.50f, 0.35f),
                new Vector2(0.50f, 0.70f),
                yawDegrees,
                0.0f,
                0.0f);
        }

        private static byte[] CreateUniformMask(
            float faceSkinProbability,
            float hairProbability)
        {
            byte[] rgba = new byte[Width * Height * 4];
            byte skin = ToByte(faceSkinProbability);
            byte hair = ToByte(hairProbability);
            for (int pixel = 0; pixel < Width * Height; pixel += 1)
            {
                int offset = pixel * 4;
                rgba[offset] = skin;
                rgba[offset + 1] = hair;
                rgba[offset + 3] = 255;
            }
            return rgba;
        }

        private static byte[] CreateBoundaryMask(
            float boundaryY,
            float activeX0,
            float activeX1,
            float hairProbability,
            float skinProbability)
        {
            byte[] rgba = new byte[Width * Height * 4];
            byte hair = ToByte(hairProbability);
            byte skin = ToByte(skinProbability);
            for (int y = 0; y < Height; y += 1)
            {
                float normalizedY = y / (float)(Height - 1);
                for (int x = 0; x < Width; x += 1)
                {
                    float normalizedX = x / (float)(Width - 1);
                    int offset = (y * Width + x) * 4;
                    bool active =
                        normalizedX >= activeX0 && normalizedX <= activeX1;
                    if (active && normalizedY < boundaryY)
                    {
                        rgba[offset + 1] = hair;
                    }
                    else if (active)
                    {
                        rgba[offset] = skin;
                    }
                    rgba[offset + 3] = 255;
                }
            }
            return rgba;
        }

        private static byte[] CreateClockwiseRotatedBoundaryMask(
            float boundaryY)
        {
            byte[] rgba = new byte[Width * Height * 4];
            for (int y = 0; y < Height; y += 1)
            {
                for (int x = 0; x < Width; x += 1)
                {
                    float maskU = x / (float)(Width - 1);
                    int offset = (y * Width + x) * 4;
                    // For maskU = 1 - referenceV, reference hair (V <
                    // boundary) lies to the right of 1-boundary.
                    if (maskU > 1.0f - boundaryY)
                    {
                        rgba[offset + 1] = 255;
                    }
                    else
                    {
                        rgba[offset] = 255;
                    }
                    rgba[offset + 3] = 255;
                }
            }
            return rgba;
        }

        private static byte[] CreateWeakBoundaryMask(
            float boundaryY,
            float activeX0,
            float activeX1)
        {
            byte[] rgba = new byte[Width * Height * 4];
            for (int y = 0; y < Height; y += 1)
            {
                float normalizedY = y / (float)(Height - 1);
                for (int x = 0; x < Width; x += 1)
                {
                    float normalizedX = x / (float)(Width - 1);
                    int offset = (y * Width + x) * 4;
                    bool active =
                        normalizedX >= activeX0 && normalizedX <= activeX1;
                    bool skinVisible =
                        normalizedX >= activeX0 - 0.015f
                        && normalizedX <= activeX1 + 0.015f;
                    if (active && normalizedY < boundaryY)
                    {
                        rgba[offset] = ToByte(0.30f);
                        rgba[offset + 1] = ToByte(0.46f);
                    }
                    else if (skinVisible && normalizedY >= boundaryY)
                    {
                        rgba[offset] = ToByte(0.55f);
                        if (active)
                        {
                            rgba[offset + 1] = ToByte(0.20f);
                        }
                    }
                    rgba[offset + 3] = 255;
                }
            }
            return rgba;
        }

        private static byte ToByte(float value)
        {
            return (byte)Mathf.RoundToInt(Mathf.Clamp01(value) * 255.0f);
        }
    }
}
