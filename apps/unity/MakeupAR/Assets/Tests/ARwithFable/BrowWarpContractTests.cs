using ARMakeup.Face;
using ARMakeup.Bridge;
using NUnit.Framework;
using UnityEngine;

namespace Aura.ARwithFable.Tests
{
    public sealed class BrowWarpContractTests
    {
        static readonly int[] Arc = { 70, 63, 105, 66, 107 };

        [Test]
        public void BrowReplacementAlwaysRendersAfterConceal()
        {
            Assert.That(MakeupQueues.BrowConceal, Is.LessThan(MakeupQueues.BrowLightener));
            Assert.That(MakeupQueues.BrowLightener, Is.LessThan(MakeupQueues.BrowPowder));
            Assert.That(MakeupQueues.BrowPowder, Is.LessThan(MakeupQueues.BrowMascara));
            Assert.That(MakeupQueues.BrowMascara, Is.LessThan(MakeupQueues.BrowPencil));
            Assert.That(MakeupQueues.BrowPencil, Is.LessThan(MakeupQueues.BrowStyle));
        }

        [Test]
        public void AutomaticReplacementIsSeparateFromExplicitEraser()
        {
            var parameters = new FilterParams();
            Assert.That(parameters.browConcealIntensity, Is.Zero);
            Assert.That(parameters.browReplacementIntensity, Is.Zero);

            parameters.browConcealIntensity = 0.4f;
            parameters.browReplacementIntensity = 1f;
            Assert.That(Mathf.Max(
                parameters.browConcealIntensity,
                parameters.browReplacementIntensity), Is.EqualTo(1f));
        }

        [Test]
        public void BrowConcealShaderExposesReplacementContract()
        {
            var shader = Shader.Find("ARMakeup/BrowConceal");
            Assert.That(shader, Is.Not.Null);
            var material = new Material(shader);
            try
            {
                Assert.That(material.HasProperty("_BrowReplacementIntensity"), Is.True);
                Assert.That(material.GetFloat("_FeatherV"),
                    Is.GreaterThanOrEqualTo(BrowRenderer.ConcealFeatherVMin));
                Assert.That(material.GetFloat("_FeatherH"),
                    Is.GreaterThanOrEqualTo(BrowRenderer.ConcealFeatherHMin));
            }
            finally
            {
                Object.DestroyImmediate(material);
            }
        }

        [Test]
        public void EveryBrowShapeKeepsADistinctVisibleProfile()
        {
            const int samples = BrowWarp.BandSegments;
            const float browSpan = 0.24f;
            var profiles = new float[6][];
            for (var shape = 0; shape < profiles.Length; shape++)
            {
                profiles[shape] = new float[samples * 2];
                var lo = new Vector2[samples];
                var up = new Vector2[samples];
                for (var i = 0; i < samples; i++)
                {
                    var along = i / (samples - 1f);
                    var x = 0.2f + browSpan * along;
                    // 원래 얼굴도 이미 아치인 상태에서 시작해야 "일자"가 실제로
                    // 펴지는지, 아치/반달이 원래 곡선에 묻히지 않는지를 검증한다.
                    var centerY = 0.42f - 0.025f * Mathf.Sin(along * Mathf.PI);
                    lo[i] = new Vector2(x, centerY + 0.012f);
                    up[i] = new Vector2(x, centerY - 0.012f);
                }
                BrowWarp.ShapeArcProfile(lo, up, samples, shape, 0.75f);
                for (var i = 0; i < samples; i++)
                {
                    profiles[shape][i * 2] =
                        (0.5f * (lo[i].y + up[i].y) - 0.42f) / browSpan;
                    profiles[shape][i * 2 + 1] = (lo[i].y - up[i].y) / browSpan;
                }
            }

            for (var left = 0; left < profiles.Length; left++)
            for (var right = left + 1; right < profiles.Length; right++)
            {
                var meanDifference = 0f;
                var maxDifference = 0f;
                for (var i = 0; i < profiles[left].Length; i++)
                {
                    var difference = Mathf.Abs(profiles[left][i] - profiles[right][i]);
                    meanDifference += difference;
                    maxDifference = Mathf.Max(maxDifference, difference);
                }
                meanDifference /= profiles[left].Length;
                Assert.That(meanDifference, Is.GreaterThan(0.006f),
                    $"brow shape {left} and {right} collapsed to the same visible profile");
                Assert.That(maxDifference, Is.GreaterThan(0.02f),
                    $"brow shape {left} and {right} have no locally visible silhouette difference");
            }
        }

        [Test]
        public void StraightProfileFlattensAnAlreadyArchedNaturalBrow()
        {
            const int samples = BrowWarp.BandSegments;
            var lo = new Vector2[samples];
            var up = new Vector2[samples];
            for (var i = 0; i < samples; i++)
            {
                var along = i / (samples - 1f);
                var centerY = 0.42f - 0.030f * Mathf.Sin(along * Mathf.PI);
                lo[i] = new Vector2(0.2f + 0.24f * along, centerY + 0.012f);
                up[i] = new Vector2(0.2f + 0.24f * along, centerY - 0.012f);
            }

            BrowWarp.ShapeArcProfile(lo, up, samples, 1, 0.75f);

            var tail = 0.5f * (lo[0] + up[0]);
            var head = 0.5f * (lo[samples - 1] + up[samples - 1]);
            var maxDeviation = 0f;
            for (var i = 0; i < samples; i++)
            {
                var along = i / (samples - 1f);
                var chord = Vector2.Lerp(tail, head, along);
                var center = 0.5f * (lo[i] + up[i]);
                maxDeviation = Mathf.Max(maxDeviation, Mathf.Abs(center.y - chord.y));
            }
            Assert.That(maxDeviation, Is.LessThan(0.004f));
        }

        [Test]
        public void BrowArcExtendsBothTailAndInnerHead()
        {
            var landmarks = BuildLandmarks();
            var output = new Vector2[BrowWarp.BandSegments];

            BrowWarp.SubdivideArc(landmarks, Arc, output);

            Assert.That(output[0].x, Is.LessThan(landmarks[Arc[0]].x - 0.01f));
            Assert.That(output[output.Length - 1].x,
                Is.GreaterThanOrEqualTo(landmarks[Arc[Arc.Length - 1]].x + 0.005f));
        }

        [Test]
        public void BrowArcDepthFollowsFaceCurveInsteadOfOneFlatPlane()
        {
            var landmarks = BuildLandmarks();
            landmarks[Arc[0]].z = -0.08f;
            landmarks[Arc[1]].z = -0.04f;
            landmarks[Arc[2]].z = 0.02f;
            landmarks[Arc[3]].z = 0.07f;
            landmarks[Arc[4]].z = 0.11f;
            var output = new float[BrowWarp.BandSegments];

            BrowWarp.SubdivideArcDepth(landmarks, Arc, output);

            var min = output[0];
            var max = output[0];
            foreach (var value in output)
            {
                min = Mathf.Min(min, value);
                max = Mathf.Max(max, value);
            }
            Assert.That(max - min, Is.GreaterThan(0.15f));
        }

        [Test]
        public void ReferenceTextureBandExtendsTailAndAddsSlightThickness()
        {
            const int samples = BrowWarp.BandSegments;
            const float imageAspect = 0.75f;
            const float textureAspect = 160f / 512f;
            var lo = new Vector2[samples];
            var up = new Vector2[samples];
            for (var i = 0; i < samples; i++)
            {
                var along = i / (samples - 1f);
                var centerY = 0.42f - 0.045f * Mathf.Sin(along * Mathf.PI);
                lo[i] = new Vector2(0.20f + 0.24f * along, centerY + 0.012f);
                up[i] = new Vector2(0.20f + 0.24f * along, centerY - 0.012f);
            }

            var originalTail = Metric(0.5f * (lo[0] + up[0]), imageAspect);
            var originalHead = Metric(
                0.5f * (lo[samples - 1] + up[samples - 1]), imageAspect);
            var originalAxis = originalHead - originalTail;
            var originalSpan = originalAxis.magnitude;
            var originalTangent = originalAxis.normalized;

            Assert.That(BrowWarp.BuildReferenceTextureBand(
                lo, up, samples, imageAspect, textureAspect, 1f), Is.True);

            var tail = Metric(0.5f * (lo[0] + up[0]), imageAspect);
            var head = Metric(0.5f * (lo[samples - 1] + up[samples - 1]), imageAspect);
            var axis = head - tail;
            var maxDistanceFromChord = 0f;
            for (var i = 0; i < samples; i++)
            {
                var center = Metric(0.5f * (lo[i] + up[i]), imageAspect);
                maxDistanceFromChord = Mathf.Max(maxDistanceFromChord,
                    Mathf.Abs(Cross(center - tail, axis.normalized)));
            }

            var bandHeight = (Metric(up[samples / 2], imageAspect) -
                              Metric(lo[samples / 2], imageAspect)).magnitude;
            Assert.That(maxDistanceFromChord, Is.LessThan(0.00001f));
            Assert.That(Vector2.Dot(originalTail - tail, originalTangent),
                Is.EqualTo(originalSpan * BrowWarp.ReferenceMaskTailExtension)
                    .Within(0.0001f));
            Assert.That(Vector2.Dot(head - originalHead, originalTangent),
                Is.EqualTo(originalSpan * BrowWarp.ReferenceMaskHeadExtension)
                    .Within(0.0001f));
            Assert.That(BrowWarp.ReferenceMaskTailExtension,
                Is.GreaterThan(BrowWarp.ReferenceMaskHeadExtension));
            Assert.That(bandHeight / axis.magnitude,
                Is.EqualTo(
                    textureAspect * BrowWarp.ReferenceMaskThicknessScale /
                    (1f + BrowWarp.ReferenceMaskTailExtension +
                     BrowWarp.ReferenceMaskHeadExtension)).Within(0.0001f));
        }

        static Vector2 Metric(Vector2 point, float imageAspect) =>
            new Vector2(point.x * imageAspect, point.y);

        static float Cross(Vector2 left, Vector2 right) =>
            left.x * right.y - left.y * right.x;

        static Vector3[] BuildLandmarks()
        {
            var landmarks = new Vector3[478];
            landmarks[Arc[0]] = new Vector3(0.20f, 0.40f, 0f);
            landmarks[Arc[1]] = new Vector3(0.25f, 0.39f, 0f);
            landmarks[Arc[2]] = new Vector3(0.30f, 0.38f, 0f);
            landmarks[Arc[3]] = new Vector3(0.35f, 0.38f, 0f);
            landmarks[Arc[4]] = new Vector3(0.40f, 0.39f, 0f);
            landmarks[33] = new Vector3(0.18f, 0.53f, 0f);
            landmarks[263] = new Vector3(0.82f, 0.53f, 0f);
            landmarks[129] = new Vector3(0.42f, 0.70f, 0f);
            landmarks[358] = new Vector3(0.58f, 0.70f, 0f);
            return landmarks;
        }
    }
}
