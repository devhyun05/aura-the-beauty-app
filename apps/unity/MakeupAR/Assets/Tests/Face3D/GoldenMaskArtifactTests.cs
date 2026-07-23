using NUnit.Framework;
using UnityEngine;

namespace Aura.Face3D.Tests
{
    public sealed class GoldenMaskArtifactTests
    {
        [Test]
        public void SerializeAndDeserialize_ValidArtifact_RoundTrips()
        {
            Face3DMeshSnapshot snapshot = CreateValidSnapshot();
            GoldenMaskArtifact original = CreateArtifact(snapshot);

            byte[] bytes = GoldenMaskArtifactSerializer.Serialize(original);

            Assert.That(GoldenMaskArtifactSerializer.TryDeserialize(
                bytes,
                out GoldenMaskArtifact restored,
                out string reason), Is.True, reason);
            Assert.That(restored, Is.Not.Null);
            Assert.That(restored.CaptureId, Is.EqualTo(original.CaptureId));
            Assert.That(restored.CreatedAtUnixMs, Is.EqualTo(original.CreatedAtUnixMs));
            Assert.That(restored.Topology, Is.EqualTo(original.Topology));
            Assert.That(restored.TrueDepthHardware, Is.EqualTo(original.TrueDepthHardware));
            Assert.That(restored.DepthDataObserved, Is.EqualTo(original.DepthDataObserved));
            Assert.That(restored.FaceTrackingSupported, Is.EqualTo(original.FaceTrackingSupported));
            Assert.That(restored.DeviceModel, Is.EqualTo(original.DeviceModel));
            CollectionAssert.AreEqual(original.Vertices, restored.Vertices);
            CollectionAssert.AreEqual(original.TriangleIndices, restored.TriangleIndices);
            CollectionAssert.AreEqual(original.Uvs, restored.Uvs);
        }

        [Test]
        public void TryDeserialize_WhenChecksumIsTampered_RejectsArtifact()
        {
            byte[] bytes = GoldenMaskArtifactSerializer.Serialize(
                CreateArtifact(CreateValidSnapshot()));
            bytes[0] ^= 0x01;

            Assert.That(GoldenMaskArtifactSerializer.TryDeserialize(
                bytes,
                out GoldenMaskArtifact artifact,
                out string reason), Is.False);
            Assert.That(artifact, Is.Null);
            Assert.That(reason, Is.EqualTo("golden_mask_checksum_mismatch"));
        }

        [Test]
        public void TryCreate_WhenVertexIsNonFinite_RejectsSnapshot()
        {
            Face3DMeshSnapshot snapshot = new Face3DMeshSnapshot(
                new[]
                {
                    new Vector3(-0.5f, -0.5f, 0.0f),
                    new Vector3(float.NaN, 0.5f, 0.1f),
                    new Vector3(0.5f, -0.5f, 0.0f)
                },
                new[] { 0, 1, 2 },
                CreateValidUvs(),
                1.0);

            Assert.That(GoldenMaskArtifactSerializer.TryCreate(
                snapshot,
                "capture-non-finite",
                true,
                true,
                true,
                "iPhone Test",
                out GoldenMaskArtifact artifact,
                out string reason), Is.False);
            Assert.That(artifact, Is.Null);
            Assert.That(reason, Is.EqualTo("golden_mask_geometry_not_finite"));
        }

        [Test]
        public void TryCreate_WhenTriangleIndexIsOutOfRange_RejectsSnapshot()
        {
            Face3DMeshSnapshot snapshot = new Face3DMeshSnapshot(
                CreateValidVertices(),
                new[] { 0, 1, 3 },
                CreateValidUvs(),
                1.0);

            Assert.That(GoldenMaskArtifactSerializer.TryCreate(
                snapshot,
                "capture-invalid-index",
                true,
                true,
                true,
                "iPhone Test",
                out GoldenMaskArtifact artifact,
                out string reason), Is.False);
            Assert.That(artifact, Is.Null);
            Assert.That(reason, Is.EqualTo("golden_mask_triangle_index_invalid"));
        }

        [Test]
        public void TryCreate_WithoutTrueDepthHardware_RejectsSnapshot()
        {
            Assert.That(GoldenMaskArtifactSerializer.TryCreate(
                CreateValidSnapshot(),
                "capture-without-truedepth",
                false,
                false,
                true,
                "iPhone Test",
                out GoldenMaskArtifact artifact,
                out string reason), Is.False);
            Assert.That(artifact, Is.Null);
            Assert.That(reason, Is.EqualTo("golden_mask_truedepth_unavailable"));
        }

        private static GoldenMaskArtifact CreateArtifact(
            Face3DMeshSnapshot snapshot)
        {
            Assert.That(GoldenMaskArtifactSerializer.TryCreate(
                snapshot,
                "capture-round-trip",
                true,
                true,
                true,
                "iPhone Test",
                out GoldenMaskArtifact artifact,
                out string reason), Is.True, reason);
            return artifact;
        }

        private static Face3DMeshSnapshot CreateValidSnapshot()
        {
            return new Face3DMeshSnapshot(
                CreateValidVertices(),
                new[] { 0, 1, 2 },
                CreateValidUvs(),
                1.0);
        }

        private static Vector3[] CreateValidVertices()
        {
            return new[]
            {
                new Vector3(-0.5f, -0.5f, 0.0f),
                new Vector3(0.0f, 0.5f, 0.1f),
                new Vector3(0.5f, -0.5f, 0.0f)
            };
        }

        private static Vector2[] CreateValidUvs()
        {
            return new[]
            {
                new Vector2(0.0f, 0.0f),
                new Vector2(0.5f, 1.0f),
                new Vector2(1.0f, 0.0f)
            };
        }
    }
}
