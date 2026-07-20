using ARMakeup.Bridge;
using ARMakeup.Face;
using NUnit.Framework;
using UnityEngine;

namespace Aura.ARwithFable.Tests
{
    public sealed class BlushMaskContractTests
    {
        [Test]
        public void ShapeContractClampsToLegacyAndReferenceRange()
        {
            Assert.That(FilterParams.MinBlushShape, Is.EqualTo(0));
            Assert.That(FilterParams.MaxBlushShape, Is.EqualTo(7));
            Assert.That(MaskGenerator.ClampBlushShape(-3), Is.EqualTo(0));
            Assert.That(MaskGenerator.ClampBlushShape(4), Is.EqualTo(4));
            Assert.That(MaskGenerator.ClampBlushShape(99), Is.EqualTo(7));
        }

        [Test]
        public void EveryShapeHasADistinctGaussianProfile()
        {
            const int samples = 33;
            var profiles = new float[FilterParams.MaxBlushShape + 1][];
            for (var shape = FilterParams.MinBlushShape;
                 shape <= FilterParams.MaxBlushShape;
                 shape++)
            {
                profiles[shape] = new float[samples * samples];
                var offset = 0;
                for (var y = 0; y < samples; y++)
                for (var x = 0; x < samples; x++)
                    profiles[shape][offset++] = MaskGenerator.EvaluateBlushShape(
                        shape, x / (samples - 1f), y / (samples - 1f));
            }

            for (var left = 0; left < profiles.Length; left++)
            for (var right = left + 1; right < profiles.Length; right++)
            {
                var meanAbsoluteDifference = 0f;
                for (var i = 0; i < profiles[left].Length; i++)
                    meanAbsoluteDifference += Mathf.Abs(profiles[left][i] - profiles[right][i]);
                meanAbsoluteDifference /= profiles[left].Length;
                Assert.That(meanAbsoluteDifference, Is.GreaterThan(0.004f),
                    $"blush shape {left} and {right} collapsed to the same profile");
            }
        }

        [Test]
        public void ReferenceShapesKeepTheirAnatomicalIntent()
        {
            var drapeTemple = MaskGenerator.EvaluateBlushShape(2, 0.135f, 0.540f);
            var classicTemple = MaskGenerator.EvaluateBlushShape(0, 0.135f, 0.540f);
            Assert.That(drapeTemple, Is.GreaterThan(classicTemple + 0.20f));

            var underEyeHigh = MaskGenerator.EvaluateBlushShape(5, 0.335f, 0.552f);
            var underEyeLow = MaskGenerator.EvaluateBlushShape(5, 0.335f, 0.350f);
            Assert.That(underEyeHigh, Is.GreaterThan(underEyeLow + 0.70f));

            var softNose = MaskGenerator.EvaluateBlushShape(6, 0.500f, 0.460f);
            var bandNose = MaskGenerator.EvaluateBlushShape(7, 0.500f, 0.460f);
            Assert.That(bandNose, Is.GreaterThan(softNose + 0.20f));

            var sunKissedOuterCheek = MaskGenerator.EvaluateBlushShape(6, 0.272f, 0.460f);
            var sunKissedInnerCheek = MaskGenerator.EvaluateBlushShape(6, 0.290f, 0.460f);
            Assert.That(sunKissedOuterCheek, Is.GreaterThan(sunKissedInnerCheek));
        }

        [Test]
        public void ClassicMaskUsesProceduralCacheInsteadOfBundledSmallCircleMask()
        {
            var first = MaskGenerator.BlushShapeMask(0, 0f);
            var second = MaskGenerator.BlushShapeMask(0, 0f);
            var bundled = Resources.Load<Texture2D>("Masks/blush");

            Assert.That(first, Is.Not.Null);
            Assert.That(first.width, Is.EqualTo(256));
            Assert.That(first.height, Is.EqualTo(256));
            Assert.That(first.name, Is.EqualTo("Blush_classic_Soft0"));
            Assert.That(second, Is.SameAs(first));
            Assert.That(first, Is.Not.SameAs(bundled));
        }

        [Test]
        public void BlushIntensityContractAllowsHighPigmentHeadroom()
        {
            Assert.That(FilterParams.MaxBlushIntensity, Is.EqualTo(1.2f).Within(0.0001f));
        }
    }
}
