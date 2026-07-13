using System.Collections.Generic;
using NUnit.Framework;
using UnityEngine;

namespace Aura.Face3D.Tests
{
    public sealed class Face3DCoreTests
    {
        [TestCase(0, Face3DTrackingFaceGateStatus.Missing)]
        [TestCase(1, Face3DTrackingFaceGateStatus.Ready)]
        [TestCase(2, Face3DTrackingFaceGateStatus.Multiple)]
        public void TrackingFaceGate_UsesOnlyCurrentlyTrackingFaces(
            int trackingFaceCount,
            Face3DTrackingFaceGateStatus expected)
        {
            Assert.That(Face3DTrackingFaceGate.Evaluate(trackingFaceCount), Is.EqualTo(expected));
        }

        [Test]
        public void TopologyFingerprint_IgnoresDeformingVertices_ButDetectsTopologyChanges()
        {
            Face3DMeshSnapshot original = CreateSnapshot(0.0f, false, false);
            Face3DMeshSnapshot deformed = CreateSnapshot(0.25f, false, false);
            Face3DMeshSnapshot changedIndices = CreateSnapshot(0.0f, true, false);
            Face3DMeshSnapshot changedUvs = CreateSnapshot(0.0f, false, true);

            Assert.That(Face3DTopologyFingerprint.TryCreate(
                original,
                out Face3DTopologyFingerprint originalFingerprint,
                out string originalReason), Is.True, originalReason);
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                deformed,
                out Face3DTopologyFingerprint deformedFingerprint,
                out string deformedReason), Is.True, deformedReason);
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                changedIndices,
                out Face3DTopologyFingerprint changedIndexFingerprint,
                out string indexReason), Is.True, indexReason);
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                changedUvs,
                out Face3DTopologyFingerprint changedUvFingerprint,
                out string uvReason), Is.True, uvReason);

            Assert.That(originalFingerprint, Is.EqualTo(deformedFingerprint));
            Assert.That(originalFingerprint.Value, Has.Length.EqualTo(64));
            Assert.That(originalFingerprint.IndicesHash, Has.Length.EqualTo(64));
            Assert.That(originalFingerprint.UvHash, Has.Length.EqualTo(64));
            Assert.That(originalFingerprint, Is.Not.EqualTo(changedIndexFingerprint));
            Assert.That(originalFingerprint, Is.Not.EqualTo(changedUvFingerprint));
        }

        [Test]
        public void Evaluate_BlocksWhenSemanticMapIsMissingOrTopologyIsUnknown()
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Face3DEvaluationResult missingMap = Face3DMetricEvaluator.Evaluate(snapshot, null);

            Assert.That(missingMap.Status, Is.EqualTo(Face3DEvaluationStatus.Blocked));
            Assert.That(missingMap.Reason, Is.EqualTo("semantic_map_missing"));

            Face3DSemanticMap semanticMap = CreateSemanticMap(snapshot);
            Face3DMeshSnapshot changedTopology = CreateSnapshot(0.0f, false, true);
            Face3DEvaluationResult unknownTopology = Face3DMetricEvaluator.Evaluate(
                changedTopology,
                semanticMap);

            Assert.That(unknownTopology.Status, Is.EqualTo(Face3DEvaluationStatus.Blocked));
            Assert.That(unknownTopology.Reason, Is.EqualTo("unknown_face_mesh_topology"));
        }

        [Test]
        public void Evaluate_ComputesNormalizedProjectionMetricsFromMappedIndices()
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Face3DSemanticMap semanticMap = CreateSemanticMap(snapshot);

            Face3DEvaluationResult result = Face3DMetricEvaluator.Evaluate(snapshot, semanticMap);

            Assert.That(result.IsValid, Is.True, result.Reason);
            Assert.That(
                semanticMap.ChinBottomIndices,
                Is.EqualTo(CreateIndexRange(70, 3)));
            Assert.That(result.Metrics.NoseTipProjection, Is.EqualTo(0.5f).Within(0.00001f));
            // C1: chin is now projected onto the midface plane (like noseTip), so in this
            // synthetic mesh where chin and nose share z=1.0 it reads 0.5, not the old 0.25
            // that the chin-neighbor plane produced.
            Assert.That(result.Metrics.ChinProjection, Is.EqualTo(0.5f).Within(0.00001f));
            Assert.That(result.Metrics.UpperLipToELine, Is.EqualTo(-0.1f).Within(0.00001f));
            Assert.That(result.Metrics.LowerLipToELine, Is.EqualTo(-0.15f).Within(0.00001f));
            Assert.That(result.Metrics.CentralProjectionScore, Is.EqualTo(0.375f).Within(0.00001f));
        }

        [Test]
        public void SemanticMap_RejectsUnsupportedSchemaAndInventedOutOfRangeIndex()
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint topology,
                out string fingerprintReason), Is.True, fingerprintReason);
            Face3DSemanticMapData data = CreateSemanticMapData(topology);
            data.schemaVersion = "aura.face3d-semantic-map.v999";

            Assert.That(Face3DSemanticMap.TryCreate(
                data,
                out Face3DSemanticMap ignoredVersionMap,
                out string versionReason), Is.False);
            Assert.That(ignoredVersionMap, Is.Null);
            Assert.That(versionReason, Is.EqualTo("semantic_map_schema_version_unsupported"));

            data = CreateSemanticMapData(topology);
            data.noseTipIndices = new[] { topology.VertexCount };
            Assert.That(Face3DSemanticMap.TryCreate(
                data,
                out Face3DSemanticMap ignoredIndexMap,
                out string indexReason), Is.False);
            Assert.That(ignoredIndexMap, Is.Null);
            Assert.That(indexReason, Is.EqualTo("semantic_map_indices_invalid"));

            data = CreateSemanticMapData(topology);
            data.chinBottomIndices = null;
            Assert.That(Face3DSemanticMap.TryCreate(
                data,
                out Face3DSemanticMap ignoredMissingMentonMap,
                out string missingMentonReason), Is.False);
            Assert.That(ignoredMissingMentonMap, Is.Null);
            Assert.That(missingMentonReason, Is.EqualTo("semantic_map_indices_invalid"));
        }

        [TestCase("noseTipIndices", 2)]
        [TestCase("chinIndices", 2)]
        [TestCase("chinBottomIndices", 2)]
        [TestCase("upperLipIndices", 2)]
        [TestCase("lowerLipIndices", 2)]
        [TestCase("midfaceReferenceLeftIndices", 7)]
        [TestCase("midfaceReferenceRightIndices", 7)]
        [TestCase("midfaceReferenceUpperIndices", 7)]
        [TestCase("chinReferenceLeftIndices", 7)]
        [TestCase("chinReferenceRightIndices", 7)]
        [TestCase("chinReferenceUpperIndices", 7)]
        [TestCase("centralRegionIndices", 15)]
        public void SemanticMap_RejectsEveryGroupBelowRequiredMinimum(
            string groupName,
            int invalidCount)
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint topology,
                out string fingerprintReason), Is.True, fingerprintReason);
            Face3DSemanticMapData data = CreateSemanticMapData(topology);
            int[] invalidIndices = CreateIndexRange(0, invalidCount);

            switch (groupName)
            {
                case "noseTipIndices":
                    data.noseTipIndices = invalidIndices;
                    break;
                case "chinIndices":
                    data.chinIndices = invalidIndices;
                    break;
                case "chinBottomIndices":
                    data.chinBottomIndices = invalidIndices;
                    break;
                case "upperLipIndices":
                    data.upperLipIndices = invalidIndices;
                    break;
                case "lowerLipIndices":
                    data.lowerLipIndices = invalidIndices;
                    break;
                case "midfaceReferenceLeftIndices":
                    data.midfaceReferenceLeftIndices = invalidIndices;
                    break;
                case "midfaceReferenceRightIndices":
                    data.midfaceReferenceRightIndices = invalidIndices;
                    break;
                case "midfaceReferenceUpperIndices":
                    data.midfaceReferenceUpperIndices = invalidIndices;
                    break;
                case "chinReferenceLeftIndices":
                    data.chinReferenceLeftIndices = invalidIndices;
                    break;
                case "chinReferenceRightIndices":
                    data.chinReferenceRightIndices = invalidIndices;
                    break;
                case "chinReferenceUpperIndices":
                    data.chinReferenceUpperIndices = invalidIndices;
                    break;
                case "centralRegionIndices":
                    data.centralRegionIndices = invalidIndices;
                    break;
                default:
                    Assert.Fail("Unknown semantic group fixture: " + groupName);
                    break;
            }

            Assert.That(Face3DSemanticMap.TryCreate(
                data,
                out Face3DSemanticMap rejectedMap,
                out string reason), Is.False);
            Assert.That(rejectedMap, Is.Null);
            Assert.That(reason, Is.EqualTo("semantic_map_indices_invalid"));
        }

        [Test]
        public void SemanticMap_RejectsEveryMeasurementLandmarkReferencePlaneOverlap()
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint topology,
                out string fingerprintReason), Is.True, fingerprintReason);
            string[] measurementLandmarkGroups =
            {
                "noseTipIndices",
                "chinIndices",
                "chinBottomIndices",
                "upperLipIndices",
                "lowerLipIndices"
            };
            string[] referencePlaneGroups =
            {
                "midfaceReferenceLeftIndices",
                "midfaceReferenceRightIndices",
                "midfaceReferenceUpperIndices",
                "chinReferenceLeftIndices",
                "chinReferenceRightIndices",
                "chinReferenceUpperIndices"
            };

            foreach (string measurementGroupName in measurementLandmarkGroups)
            {
                foreach (string referenceGroupName in referencePlaneGroups)
                {
                    Face3DSemanticMapData data = CreateSemanticMapData(topology);
                    int[] measurementIndices = GetSemanticGroup(
                        data,
                        measurementGroupName);
                    int[] referenceIndices = GetSemanticGroup(
                        data,
                        referenceGroupName);
                    measurementIndices[0] = referenceIndices[0];

                    Assert.That(Face3DSemanticMap.TryCreate(
                        data,
                        out Face3DSemanticMap rejectedMap,
                        out string reason), Is.False,
                        measurementGroupName + " ↔ " + referenceGroupName);
                    Assert.That(rejectedMap, Is.Null);
                    Assert.That(
                        reason,
                        Is.EqualTo("semantic_map_indices_invalid"),
                        measurementGroupName + " ↔ " + referenceGroupName);
                }
            }
        }

        [Test]
        public void RobustAggregator_UsesMedianAndRejectsBeyondThreeMad()
        {
            List<float> samples = new List<float>();
            for (int index = 0; index < 20; index += 1)
            {
                samples.Add(1.0f);
            }

            samples.Add(100.0f);
            Face3DRobustAggregationResult result = Face3DRobustMetricAggregator.Aggregate(samples);

            Assert.That(result.InputCount, Is.EqualTo(21));
            Assert.That(result.OutlierCount, Is.EqualTo(1));
            Assert.That(result.Metric.Value.HasValue, Is.True);
            Assert.That(result.Metric.Value.Value, Is.EqualTo(1.0f));
            Assert.That(result.Metric.ValidFrameCount, Is.EqualTo(20));
            Assert.That(result.Metric.Mad, Is.EqualTo(0.0f));
            Assert.That(result.Metric.Confidence, Is.GreaterThan(0.6f));
            Assert.That(result.Metric.Confidence, Is.LessThan(0.7f));
        }

        [Test]
        public void Collector_BuildsAtThirtyFramesWithCanonicalProfileContract()
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Face3DEvaluationResult evaluation = Face3DMetricEvaluator.Evaluate(
                snapshot,
                CreateSemanticMap(snapshot));
            Face3DProfileCollector collector = new Face3DProfileCollector(10.0);

            Face3DCollectionUpdate update = null;
            for (int index = 0; index < 30; index += 1)
            {
                update = collector.AddEvaluation(evaluation, 10.0 + (index * 0.05));
            }

            Assert.That(update, Is.Not.Null);
            Assert.That(update.Status, Is.EqualTo(Face3DCollectionAddStatus.AcceptedTargetReached));
            Assert.That(update.ShouldStop, Is.True);
            Assert.That(collector.TryBuildProfile(
                11.5,
                out Face3DProfile profile,
                out string reason), Is.True, reason);
            Assert.That(profile.SchemaVersion, Is.EqualTo("aura.face3d-profile.v1"));
            Assert.That(profile.Source, Is.EqualTo("arkit_face_mesh"));
            Assert.That(profile.GateVersion, Is.EqualTo("face3d-gate-v1"));
            Assert.That(profile.ValidFrameCount, Is.EqualTo(30));
            Assert.That(profile.TargetFrameCount, Is.EqualTo(30));
            Assert.That(profile.Metrics.NoseTipProjection.ValidFrameCount, Is.EqualTo(30));
            Assert.That(profile.Metrics.NoseTipProjection.Confidence, Is.EqualTo(1.0f));

            string json = profile.ToCanonicalJson();
            Assert.That(json, Does.Contain("\"schemaVersion\":\"aura.face3d-profile.v1\""));
            Assert.That(json, Does.Contain("\"gateVersion\":\"face3d-gate-v1\""));
            Assert.That(json, Does.Contain("\"noseTipProjection\""));
            Assert.That(json, Does.Contain("\"unit\":\"normalized\""));
            Assert.That(json, Does.Contain("\"validFrameCount\":30"));
        }

        [Test]
        public void Collector_RefusesProfileBelowMinimumAtThreeSecondDeadline()
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Face3DEvaluationResult evaluation = Face3DMetricEvaluator.Evaluate(
                snapshot,
                CreateSemanticMap(snapshot));
            Face3DProfileCollector collector = new Face3DProfileCollector(0.0);
            for (int index = 0; index < 19; index += 1)
            {
                collector.AddEvaluation(evaluation, index * 0.1);
            }

            Assert.That(collector.ShouldStop(3.0), Is.True);
            Assert.That(collector.TryBuildProfile(
                3.0,
                out Face3DProfile profile,
                out string reason), Is.False);
            Assert.That(profile, Is.Null);
            Assert.That(reason, Is.EqualTo("insufficient_valid_frames"));
        }

        [Test]
        public void ProfileJson_EmitsNullForUnavailableMetric()
        {
            Face3DProfileMetric unavailable = new Face3DProfileMetric(null, 0.0f, 0, 0.0f);
            Face3DProfile profile = new Face3DProfile(
                "topology",
                0,
                30,
                new[] { "not_available" },
                new Face3DProfileMetrics(
                    unavailable,
                    unavailable,
                    unavailable,
                    unavailable,
                    unavailable));

            string json = profile.ToCanonicalJson();

            Assert.That(json, Does.Contain("\"value\":null"));
            Assert.That(json, Does.Not.Contain("NaN"));
        }

        private static Face3DMeshSnapshot CreateSnapshot(
            float deformation,
            bool alterIndices,
            bool alterUvs)
        {
            List<Vector3> vertices = new List<Vector3>();
            AppendRepeated(vertices, new Vector3(-1.0f, 0.0f, deformation), 8);
            AppendRepeated(vertices, new Vector3(1.0f, 0.0f, -deformation), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 1.0f, 0.0f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 0.5f, 1.0f + deformation), 3);
            AppendRepeated(vertices, new Vector3(0.0f, -1.0f, 1.0f + deformation), 3);
            AppendRepeated(vertices, new Vector3(0.0f, 0.0f, 0.8f + deformation), 8);
            AppendRepeated(vertices, new Vector3(0.0f, -0.4f, 0.7f + deformation), 8);
            AppendRepeated(vertices, new Vector3(-1.0f, -0.5f, 0.5f), 8);
            AppendRepeated(vertices, new Vector3(1.0f, -0.5f, 0.5f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 0.5f, 0.5f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 0.5f, 0.5f), 3);

            int[] indices = alterIndices
                ? new[] { 8, 0, 16, 24, 27, 30, 24, 30, 38, 46, 54, 62 }
                : new[] { 0, 8, 16, 24, 27, 30, 24, 30, 38, 46, 54, 62 };
            Vector2[] uvs = new Vector2[vertices.Count];
            for (int index = 0; index < uvs.Length; index += 1)
            {
                float x = (float)index / (uvs.Length - 1);
                float y = (index % 10) * 0.05f;
                if (alterUvs && index == 6)
                {
                    y += 0.2f;
                }

                uvs[index] = new Vector2(x, y);
            }

            return new Face3DMeshSnapshot(vertices, indices, uvs, 1.0);
        }

        private static Face3DSemanticMap CreateSemanticMap(Face3DMeshSnapshot snapshot)
        {
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint topology,
                out string fingerprintReason), Is.True, fingerprintReason);
            Assert.That(Face3DSemanticMap.TryCreate(
                CreateSemanticMapData(topology),
                out Face3DSemanticMap semanticMap,
                out string mapReason), Is.True, mapReason);
            return semanticMap;
        }

        private static Face3DSemanticMapData CreateSemanticMapData(
            Face3DTopologyFingerprint topology)
        {
            return new Face3DSemanticMapData
            {
                schemaVersion = Face3DContract.SemanticMapSchemaVersion,
                mapId = "test-map-v1",
                source = Face3DContract.Source,
                gateVersion = Face3DContract.GateVersion,
                topologyFingerprint = topology.ToData(),
                noseTipIndices = CreateIndexRange(24, 3),
                chinIndices = CreateIndexRange(27, 3),
                chinBottomIndices = CreateIndexRange(70, 3),
                upperLipIndices = CreateIndexRange(30, 3),
                lowerLipIndices = CreateIndexRange(38, 3),
                midfaceReferenceLeftIndices = CreateIndexRange(0, 8),
                midfaceReferenceRightIndices = CreateIndexRange(8, 8),
                midfaceReferenceUpperIndices = CreateIndexRange(16, 8),
                chinReferenceLeftIndices = CreateIndexRange(46, 8),
                chinReferenceRightIndices = CreateIndexRange(54, 8),
                chinReferenceUpperIndices = CreateIndexRange(62, 8),
                centralRegionIndices = CreateIndexRange(30, 16)
            };
        }

        private static int[] GetSemanticGroup(
            Face3DSemanticMapData data,
            string groupName)
        {
            switch (groupName)
            {
                case "noseTipIndices":
                    return data.noseTipIndices;
                case "chinIndices":
                    return data.chinIndices;
                case "chinBottomIndices":
                    return data.chinBottomIndices;
                case "upperLipIndices":
                    return data.upperLipIndices;
                case "lowerLipIndices":
                    return data.lowerLipIndices;
                case "midfaceReferenceLeftIndices":
                    return data.midfaceReferenceLeftIndices;
                case "midfaceReferenceRightIndices":
                    return data.midfaceReferenceRightIndices;
                case "midfaceReferenceUpperIndices":
                    return data.midfaceReferenceUpperIndices;
                case "chinReferenceLeftIndices":
                    return data.chinReferenceLeftIndices;
                case "chinReferenceRightIndices":
                    return data.chinReferenceRightIndices;
                case "chinReferenceUpperIndices":
                    return data.chinReferenceUpperIndices;
                default:
                    Assert.Fail("Unknown semantic group fixture: " + groupName);
                    return null;
            }
        }

        private static void AppendRepeated(
            List<Vector3> target,
            Vector3 value,
            int count)
        {
            for (int index = 0; index < count; index += 1)
            {
                target.Add(value);
            }
        }

        private static int[] CreateIndexRange(int start, int count)
        {
            int[] indices = new int[count];
            for (int index = 0; index < count; index += 1)
            {
                indices[index] = start + index;
            }

            return indices;
        }
    }
}
