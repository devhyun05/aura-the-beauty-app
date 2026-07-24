using System.Collections.Generic;
using Aura.Face3D;
using NUnit.Framework;
using UnityEngine;

namespace Aura.Face3D.Tests
{
    public sealed class Face3DPhotoEvidenceBuilderTests
    {
        [Test]
        public void BuildsBoundedSameFrameEvidenceWithoutRawMesh()
        {
            TextAsset asset = Resources.Load<TextAsset>(
                "Face3D/ARKitFaceSemanticMapV1");
            Assert.That(asset, Is.Not.Null);
            Assert.That(
                Face3DSemanticMap.TryParseJson(
                    asset.text,
                    out Face3DSemanticMap map,
                    out string reason),
                Is.True,
                reason);

            const int vertexCount = 1220;
            Vector3[] vertices = new Vector3[vertexCount];
            Vector2[] projected = new Vector2[vertexCount];
            Vector2[] uvs = new Vector2[vertexCount];
            for (int index = 0; index < vertexCount; index += 1)
            {
                projected[index] = new Vector2(0.5f, 0.5f);
                uvs[index] = new Vector2(
                    (index % 32) / 31.0f,
                    (index / 32) / 38.0f);
            }

            SetGroup(vertices, projected, map.CentralRegionIndices, new Vector3(0, 0, 0.012f), new Vector2(0.5f, 0.5f));
            SetGroup(vertices, projected, map.MidfaceReferenceLeftIndices, new Vector3(-0.05f, 0, 0), new Vector2(0.34f, 0.5f));
            SetGroup(vertices, projected, map.MidfaceReferenceRightIndices, new Vector3(0.05f, 0, 0), new Vector2(0.66f, 0.5f));
            SetGroup(vertices, projected, map.MidfaceReferenceUpperIndices, new Vector3(0, 0.05f, 0), new Vector2(0.5f, 0.36f));
            SetGroup(vertices, projected, map.NasionIndices, new Vector3(0, 0.03f, 0.01f), new Vector2(0.5f, 0.42f));
            SetGroup(vertices, projected, map.NoseBridgeMidlineIndices, new Vector3(0, 0.01f, 0.02f), new Vector2(0.5f, 0.49f));
            SetGroup(vertices, projected, map.AlarLeftIndices, new Vector3(-0.018f, -0.01f, 0.018f), new Vector2(0.45f, 0.56f));
            SetGroup(vertices, projected, map.AlarRightIndices, new Vector3(0.018f, -0.01f, 0.018f), new Vector2(0.55f, 0.56f));
            SetGroup(vertices, projected, map.NoseTipIndices, new Vector3(0, -0.006f, 0.05f), new Vector2(0.5f, 0.57f));
            SetGroup(vertices, projected, map.MalarApexLeftIndices, new Vector3(-0.04f, -0.005f, 0.02f), new Vector2(0.38f, 0.58f));
            SetGroup(vertices, projected, map.MalarApexRightIndices, new Vector3(0.04f, -0.005f, 0.02f), new Vector2(0.62f, 0.58f));
            SetGroup(vertices, projected, map.UpperLipIndices, new Vector3(0, -0.04f, 0.025f), new Vector2(0.5f, 0.65f));
            SetGroup(vertices, projected, map.LowerLipIndices, new Vector3(0, -0.05f, 0.023f), new Vector2(0.5f, 0.68f));
            SetGroup(vertices, projected, map.ChinIndices, new Vector3(0, -0.1f, 0.02f), new Vector2(0.5f, 0.8f));
            SetGroup(vertices, projected, map.ChinBottomIndices, new Vector3(0, -0.12f, 0.01f), new Vector2(0.5f, 0.84f));

            Face3DMeshSnapshot snapshot = new Face3DMeshSnapshot(
                vertices,
                new[] {0, 1, 2},
                uvs,
                1.0);
            Assert.That(
                Face3DPhotoEvidenceBuilder.TryBuild(
                    snapshot,
                    projected,
                    "camera-4",
                    "face-4",
                    1234,
                    1080,
                    1920,
                    map,
                    "capture-1",
                    "topology-1",
                    out string json,
                    out reason),
                Is.True,
                reason);
            Assert.That(json, Does.Contain("\"schemaVersion\":\"aura.face3d-photo-evidence.v1\""));
            Assert.That(json, Does.Contain("\"relativeDepth\""));
            Assert.That(json, Does.Contain("\"signedDepthNormalized\""));
            Assert.That(json, Does.Contain("\"noseLength\""));
            Assert.That(
                json,
                Does.Contain(
                    "\"nose\":{\"metricKeys\":[\"noseTipProjection\"]"));
            Assert.That(json, Does.Not.Contain("\"vertices\""));
            Assert.That(json, Does.Not.Contain("\"triangles\""));
            Assert.That(json, Does.Not.Contain("\"valueMm\""));
        }

        [Test]
        public void RejectsProjectionCountMismatch()
        {
            TextAsset asset = Resources.Load<TextAsset>(
                "Face3D/ARKitFaceSemanticMapV1");
            Assert.That(
                Face3DSemanticMap.TryParseJson(
                    asset.text,
                    out Face3DSemanticMap map,
                    out string reason),
                Is.True,
                reason);
            Face3DMeshSnapshot snapshot = new Face3DMeshSnapshot(
                new[] {Vector3.zero, Vector3.right, Vector3.up},
                new[] {0, 1, 2},
                new[] {Vector2.zero, Vector2.right, Vector2.up},
                1.0);
            Assert.That(
                Face3DPhotoEvidenceBuilder.TryBuild(
                    snapshot,
                    new[] {Vector2.zero},
                    "camera",
                    "face",
                    1,
                    100,
                    100,
                    map,
                    "capture",
                    "topology",
                    out _,
                    out reason),
                Is.False);
            Assert.That(reason, Is.EqualTo("face3d_photo_evidence_input_invalid"));
        }

        private static void SetGroup(
            IList<Vector3> vertices,
            IList<Vector2> projected,
            IReadOnlyList<int> indices,
            Vector3 center3D,
            Vector2 center2D)
        {
            if (indices == null) return;
            for (int offset = 0; offset < indices.Count; offset += 1)
            {
                int index = indices[offset];
                float angle = (Mathf.PI * 2.0f * offset) / indices.Count;
                vertices[index] = center3D + new Vector3(
                    Mathf.Cos(angle) * 0.001f,
                    Mathf.Sin(angle) * 0.001f,
                    0);
                projected[index] = center2D + new Vector2(
                    Mathf.Cos(angle) * 0.008f,
                    Mathf.Sin(angle) * 0.008f);
            }
        }
    }
}
