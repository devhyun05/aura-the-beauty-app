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
        public void Evaluate_SelectsMostAnteriorPogonionCandidateForProjectionAndELine()
        {
            Face3DMeshSnapshot snapshot = CreateSnapshot(
                0.0f,
                false,
                false,
                varyChinDepth: true);
            Face3DSemanticMap semanticMap = CreateSemanticMap(snapshot);

            Face3DEvaluationResult result = Face3DMetricEvaluator.Evaluate(snapshot, semanticMap);

            Assert.That(result.IsValid, Is.True, result.Reason);
            // faceScale=2 and the most anterior chin candidate has z=1.4.
            Assert.That(result.Metrics.ChinProjection, Is.EqualTo(0.7f).Within(0.00001f));
            // E-line must use that same candidate, not the old chin-patch centroid.
            Assert.That(result.Metrics.UpperLipToELine, Is.EqualTo(-0.16103916f).Within(0.00001f));
            Assert.That(result.Metrics.LowerLipToELine, Is.EqualTo(-0.26088343f).Within(0.00001f));
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

        // ── Tier-2 (docs/face3d/TIER2_METRIC_CONTRACT.md) ──────────────────────────

        [Test]
        public void SemanticMap_AcceptsAbsentTier2GroupsAndKeepsGettersNull()
        {
            // g1 호환 회귀: tier2 필드가 없는(null) 맵은 지금과 동일하게 로드된다.
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Face3DSemanticMap semanticMap = CreateSemanticMap(snapshot);

            Assert.That(semanticMap.NasionIndices, Is.Null);
            Assert.That(semanticMap.NoseBridgeMidlineIndices, Is.Null);
            Assert.That(semanticMap.AlarLeftIndices, Is.Null);
            Assert.That(semanticMap.AlarRightIndices, Is.Null);
            Assert.That(semanticMap.MalarApexLeftIndices, Is.Null);
            Assert.That(semanticMap.MalarApexRightIndices, Is.Null);
            // ToData 왕복에서도 "부재"가 빈 배열로 승격되면 안 된다.
            Assert.That(semanticMap.ToData().nasionIndices, Is.Null);
        }

        [Test]
        public void SemanticMap_RejectsInvalidTier2Groups()
        {
            Face3DMeshSnapshot snapshot = CreateTier2Snapshot();
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint topology,
                out string fingerprintReason), Is.True, fingerprintReason);

            // 범위 밖 인덱스
            Face3DSemanticMapData data = CreateTier2SemanticMapData(topology);
            data.nasionIndices = new[] { 9999 };
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out string reason), Is.False);
            Assert.That(reason, Is.EqualTo("semantic_map_tier2_indices_invalid"));

            // 기존 그룹과 겹침 (noseTip 24 재사용)
            data = CreateTier2SemanticMapData(topology);
            data.nasionIndices = new[] { 24 };
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("semantic_map_tier2_indices_invalid"));

            // tier2 그룹끼리 겹침
            data = CreateTier2SemanticMapData(topology);
            data.alarLeftIndices = new[] { 78, 79, 80, 81, 74 };
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("semantic_map_tier2_indices_invalid"));

            // 콧대 중앙선 최소 4점 미달
            data = CreateTier2SemanticMapData(topology);
            data.noseBridgeMidlineIndices = new[] { 76, 77, 78 };
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("semantic_map_tier2_indices_invalid"));

            // alar/malar surface patch 최소 5점 미달
            data = CreateTier2SemanticMapData(topology);
            data.malarApexLeftIndices = new[] { 88, 89, 90, 91 };
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("semantic_map_tier2_indices_invalid"));

            // G1과의 overlap은 제품 승인 allowlist에 든 nasal midline만 허용한다.
            data = CreateTier2SemanticMapData(topology);
            data.nasionIndices = new[] { 15 };
            data.noseBridgeMidlineIndices = new[] { 10, 11, 12, 14 };
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out reason), Is.True, reason);

            data = CreateTier2SemanticMapData(topology);
            data.noseBridgeMidlineIndices = new[] { 10, 11, 12, 13 };
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("semantic_map_tier2_indices_invalid"));

            // legacy G1은 여섯 그룹이 모두 null이어야 하며, 일부만 빠진 G2는 거부한다.
            data = CreateTier2SemanticMapData(topology);
            data.malarApexRightIndices = null;
            Assert.That(Face3DSemanticMap.TryCreate(data, out _, out reason), Is.False);
            Assert.That(reason, Is.EqualTo("semantic_map_tier2_indices_invalid"));
        }

        [Test]
        public void Evaluator_EmitsNullTier2MetricsWhenGroupsAbsent()
        {
            // 기본 5지표 회귀 + tier2 null 격리: g1 맵으로는 절대 Blocked 가 아니다.
            Face3DMeshSnapshot snapshot = CreateSnapshot(0.0f, false, false);
            Face3DEvaluationResult evaluation = Face3DMetricEvaluator.Evaluate(
                snapshot,
                CreateSemanticMap(snapshot));

            Assert.That(evaluation.IsValid, Is.True, evaluation.Reason);
            Assert.That(evaluation.Metrics.IsFinite, Is.True);
            Assert.That(evaluation.Metrics.NoseLength, Is.Null);
            Assert.That(evaluation.Metrics.NasalBridgeStraightness, Is.Null);
            Assert.That(evaluation.Metrics.NasalAxisDeviation, Is.Null);
            Assert.That(evaluation.Metrics.AlarWidth, Is.Null);
            Assert.That(evaluation.Metrics.MalarProjectionLeft, Is.Null);
            Assert.That(evaluation.Metrics.MalarProjectionRight, Is.Null);
        }

        [Test]
        public void Evaluator_ComputesTier2MetricsFromOptionalGroups()
        {
            Face3DMeshSnapshot snapshot = CreateTier2Snapshot();
            Face3DEvaluationResult evaluation = Face3DMetricEvaluator.Evaluate(
                snapshot,
                CreateTier2SemanticMap(snapshot));

            Assert.That(evaluation.IsValid, Is.True, evaluation.Reason);

            // 합성 기하 기지값 (faceScale=2):
            // noseLength = |(0,0.5,1)-(0,0.8,0.4)| / 2 = sqrt(0.45)/2
            Assert.That(evaluation.Metrics.NoseLength.HasValue, Is.True);
            Assert.That(
                evaluation.Metrics.NoseLength.Value,
                Is.EqualTo(Mathf.Sqrt(0.45f) / 2.0f).Within(0.0001f));
            // 중앙선 4점은 nasion→noseTip 직선에서 x+0.2 평행 이동 → 잔차 0.2/2
            Assert.That(evaluation.Metrics.NasalBridgeStraightness.HasValue, Is.True);
            Assert.That(
                evaluation.Metrics.NasalBridgeStraightness.Value,
                Is.EqualTo(0.1f).Within(0.0001f));
            // 중선 평면 부호거리 평균 = +0.2/2 (양수 = midfaceReferenceRight 쪽)
            Assert.That(evaluation.Metrics.NasalAxisDeviation.HasValue, Is.True);
            Assert.That(
                evaluation.Metrics.NasalAxisDeviation.Value,
                Is.EqualTo(0.1f).Within(0.0001f));
            // alarWidth는 centroid가 아니라 face-local 최외측점 pair다.
            // 양쪽 extreme이 두 점씩 동률이어도 작은 vertex index(79, 84)를 골라
            // y/z가 같은 두 점 사이 0.85/2가 된다.
            Assert.That(evaluation.Metrics.AlarWidth.HasValue, Is.True);
            Assert.That(
                evaluation.Metrics.AlarWidth.Value,
                Is.EqualTo(0.425f).Within(0.0001f));
            // malar = ROI 내 전후 투영 "최댓값" (z 최대 vertex): 0.62/2, 0.55/2
            Assert.That(evaluation.Metrics.MalarProjectionLeft.HasValue, Is.True);
            Assert.That(
                evaluation.Metrics.MalarProjectionLeft.Value,
                Is.EqualTo(0.31f).Within(0.0001f));
            Assert.That(evaluation.Metrics.MalarProjectionRight.HasValue, Is.True);
            Assert.That(
                evaluation.Metrics.MalarProjectionRight.Value,
                Is.EqualTo(0.275f).Within(0.0001f));
        }

        [Test]
        public void Collector_AggregatesOptionalTier2AndEmitsNullWhenAbsent()
        {
            // tier2 있는 맵: 값이 중앙값으로 집계된다.
            Face3DMeshSnapshot tier2Snapshot = CreateTier2Snapshot();
            Face3DEvaluationResult tier2Evaluation = Face3DMetricEvaluator.Evaluate(
                tier2Snapshot,
                CreateTier2SemanticMap(tier2Snapshot));
            Face3DProfileCollector tier2Collector = new Face3DProfileCollector(0.0);
            for (int index = 0; index < 30; index += 1)
            {
                tier2Collector.AddEvaluation(tier2Evaluation, index * 0.05);
            }

            Assert.That(tier2Collector.TryBuildProfile(
                3.0,
                out Face3DProfile tier2Profile,
                out string tier2Reason), Is.True, tier2Reason);
            Assert.That(tier2Profile.Metrics.AlarWidth.Value.HasValue, Is.True);
            Assert.That(
                tier2Profile.Metrics.AlarWidth.Value.Value,
                Is.EqualTo(0.425f).Within(0.0001f));
            Assert.That(tier2Profile.Metrics.AlarWidth.ValidFrameCount, Is.EqualTo(30));

            // g1 맵: tier2 는 value:null 이고, 부재는 경고를 만들지 않는다.
            Face3DMeshSnapshot baseSnapshot = CreateSnapshot(0.0f, false, false);
            Face3DEvaluationResult baseEvaluation = Face3DMetricEvaluator.Evaluate(
                baseSnapshot,
                CreateSemanticMap(baseSnapshot));
            Face3DProfileCollector baseCollector = new Face3DProfileCollector(0.0);
            for (int index = 0; index < 30; index += 1)
            {
                baseCollector.AddEvaluation(baseEvaluation, index * 0.05);
            }

            Assert.That(baseCollector.TryBuildProfile(
                3.0,
                out Face3DProfile baseProfile,
                out string baseReason), Is.True, baseReason);
            Assert.That(baseProfile.Metrics.NoseLength.Value.HasValue, Is.False);
            Assert.That(baseProfile.Metrics.NoseLength.ValidFrameCount, Is.EqualTo(0));
            foreach (string warning in baseProfile.Warnings)
            {
                Assert.That(warning, Does.Not.Contain("noseLength"));
                Assert.That(warning, Does.Not.Contain("alarWidth"));
            }
        }

        [Test]
        public void ProfileJson_AlwaysEmitsTier2KeysWithNullWhenAbsent()
        {
            Face3DProfileMetric available = new Face3DProfileMetric(0.2f, 1.0f, 30, 0.0f);
            Face3DProfile profile = new Face3DProfile(
                "topology",
                30,
                30,
                new string[0],
                new Face3DProfileMetrics(
                    available,
                    available,
                    available,
                    available,
                    available));

            string json = profile.ToCanonicalJson();

            // v1 파서(기존 5키 필수)와 신규 파서(6키 optional) 모두가 읽을 수 있는 형태.
            Assert.That(json, Does.Contain("\"noseLength\":{\"value\":null"));
            Assert.That(json, Does.Contain("\"nasalBridgeStraightness\":{\"value\":null"));
            Assert.That(json, Does.Contain("\"nasalAxisDeviation\":{\"value\":null"));
            Assert.That(json, Does.Contain("\"alarWidth\":{\"value\":null"));
            Assert.That(json, Does.Contain("\"malarProjectionLeft\":{\"value\":null"));
            Assert.That(json, Does.Contain("\"malarProjectionRight\":{\"value\":null"));
            Assert.That(json, Does.Not.Contain("NaN"));
        }

        // tier2 그룹용 vertex 클러스터를 뒤에 덧붙인 합성 메시 — 기존 그룹 인덱스는
        // CreateSnapshot 과 동일해 기본 5지표 기하가 변하지 않는다.
        private static Face3DMeshSnapshot CreateTier2Snapshot()
        {
            List<Vector3> vertices = new List<Vector3>();
            AppendRepeated(vertices, new Vector3(-1.0f, 0.0f, 0.0f), 8);
            AppendRepeated(vertices, new Vector3(1.0f, 0.0f, 0.0f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 1.0f, 0.0f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 0.5f, 1.0f), 3);
            AppendRepeated(vertices, new Vector3(0.0f, -1.0f, 1.0f), 3);
            AppendRepeated(vertices, new Vector3(0.0f, 0.0f, 0.8f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, -0.4f, 0.7f), 8);
            AppendRepeated(vertices, new Vector3(-1.0f, -0.5f, 0.5f), 8);
            AppendRepeated(vertices, new Vector3(1.0f, -0.5f, 0.5f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 0.5f, 0.5f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 0.5f, 0.5f), 3);

            // 73: nasion 고정 중앙점
            vertices.Add(new Vector3(0.0f, 0.8f, 0.4f));
            // 74-77: 콧대 중앙선 — nasion→noseTip 직선을 x+0.2 평행 이동한 4점
            for (int step = 1; step <= 4; step += 1)
            {
                float t = step * 0.2f;
                vertices.Add(new Vector3(0.2f, 0.8f - (0.3f * t), 0.4f + (0.6f * t)));
            }

            // 78-87: alar 좌/우 5점 patch. extreme 동률 후보는 y/z를 다르게 해
            // 작은 vertex index tie-break가 실제 width 결과로 검증되게 한다.
            vertices.Add(new Vector3(-0.30f, 0.2f, 0.6f));
            vertices.Add(new Vector3(-0.40f, 0.2f, 0.6f));
            vertices.Add(new Vector3(-0.25f, 0.2f, 0.6f));
            vertices.Add(new Vector3(-0.40f, 0.9f, 0.9f));
            vertices.Add(new Vector3(-0.20f, 0.2f, 0.6f));
            vertices.Add(new Vector3(0.30f, 0.2f, 0.6f));
            vertices.Add(new Vector3(0.45f, 0.2f, 0.6f));
            vertices.Add(new Vector3(0.20f, 0.2f, 0.6f));
            vertices.Add(new Vector3(0.45f, 0.9f, 0.9f));
            vertices.Add(new Vector3(0.25f, 0.2f, 0.6f));

            // 88-97: malar 좌/우 ROI (z 최대가 각각 0.62 / 0.55)
            vertices.Add(new Vector3(-0.8f, 0.1f, 0.5f));
            vertices.Add(new Vector3(-0.8f, 0.1f, 0.62f));
            vertices.Add(new Vector3(-0.8f, 0.1f, 0.3f));
            vertices.Add(new Vector3(-0.8f, 0.1f, 0.61f));
            vertices.Add(new Vector3(-0.8f, 0.1f, 0.4f));
            vertices.Add(new Vector3(0.8f, 0.1f, 0.4f));
            vertices.Add(new Vector3(0.8f, 0.1f, 0.55f));
            vertices.Add(new Vector3(0.8f, 0.1f, 0.2f));
            vertices.Add(new Vector3(0.8f, 0.1f, 0.54f));
            vertices.Add(new Vector3(0.8f, 0.1f, 0.3f));

            int[] indices = { 0, 8, 16, 24, 27, 30, 24, 30, 38, 46, 54, 62 };
            Vector2[] uvs = new Vector2[vertices.Count];
            for (int index = 0; index < uvs.Length; index += 1)
            {
                float x = (float)index / (uvs.Length - 1);
                float y = (index % 10) * 0.05f;
                uvs[index] = new Vector2(x, y);
            }

            return new Face3DMeshSnapshot(vertices, indices, uvs, 1.0);
        }

        private static Face3DSemanticMap CreateTier2SemanticMap(Face3DMeshSnapshot snapshot)
        {
            Assert.That(Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint topology,
                out string fingerprintReason), Is.True, fingerprintReason);
            Assert.That(Face3DSemanticMap.TryCreate(
                CreateTier2SemanticMapData(topology),
                out Face3DSemanticMap semanticMap,
                out string mapReason), Is.True, mapReason);
            return semanticMap;
        }

        private static Face3DSemanticMapData CreateTier2SemanticMapData(
            Face3DTopologyFingerprint topology)
        {
            Face3DSemanticMapData data = CreateSemanticMapData(topology);
            data.nasionIndices = new[] { 73 };
            data.noseBridgeMidlineIndices = CreateIndexRange(74, 4);
            data.alarLeftIndices = CreateIndexRange(78, 5);
            data.alarRightIndices = CreateIndexRange(83, 5);
            data.malarApexLeftIndices = CreateIndexRange(88, 5);
            data.malarApexRightIndices = CreateIndexRange(93, 5);
            return data;
        }

        private static Face3DMeshSnapshot CreateSnapshot(
            float deformation,
            bool alterIndices,
            bool alterUvs,
            bool varyChinDepth = false)
        {
            List<Vector3> vertices = new List<Vector3>();
            AppendRepeated(vertices, new Vector3(-1.0f, 0.0f, deformation), 8);
            AppendRepeated(vertices, new Vector3(1.0f, 0.0f, -deformation), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 1.0f, 0.0f), 8);
            AppendRepeated(vertices, new Vector3(0.0f, 0.5f, 1.0f + deformation), 3);
            AppendRepeated(vertices, new Vector3(0.0f, -1.0f, 1.0f + deformation), 3);
            if (varyChinDepth)
            {
                vertices[27] = new Vector3(0.0f, -1.0f, 0.6f);
                vertices[28] = new Vector3(0.0f, -1.0f, 1.4f);
                vertices[29] = new Vector3(0.0f, -1.0f, 0.9f);
            }
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
