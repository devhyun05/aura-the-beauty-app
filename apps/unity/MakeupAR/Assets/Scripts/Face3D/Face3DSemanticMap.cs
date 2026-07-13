using System;
using System.Collections.Generic;
using UnityEngine;

namespace Aura.Face3D
{
    /// <summary>
    /// Serializable, versioned semantic-index payload. Index values must come from a
    /// separately reviewed ARKit topology calibration; this package ships no Apple indices.
    /// </summary>
    [Serializable]
    public sealed class Face3DSemanticMapData
    {
        public string schemaVersion;
        public string mapId;
        public string source;
        public string gateVersion;
        public Face3DTopologyFingerprintData topologyFingerprint;
        public int[] noseTipIndices;
        public int[] chinIndices;
        public int[] chinBottomIndices;
        public int[] upperLipIndices;
        public int[] lowerLipIndices;
        public int[] midfaceReferenceLeftIndices;
        public int[] midfaceReferenceRightIndices;
        public int[] midfaceReferenceUpperIndices;
        public int[] chinReferenceLeftIndices;
        public int[] chinReferenceRightIndices;
        public int[] chinReferenceUpperIndices;
        public int[] centralRegionIndices;

        // Tier-2 optional groups (docs/face3d/TIER2_METRIC_CONTRACT.md §1).
        // JsonUtility 는 JSON 에 없는 배열 필드를 null 로 둔다 — null = 부재(g1, 허용),
        // 존재하면 기존 그룹과 동일한 검증(비어있지 않음·범위·disjoint)을 통과해야 한다.
        public int[] nasionIndices;
        public int[] noseBridgeMidlineIndices;
        public int[] alarLeftIndices;
        public int[] alarRightIndices;
        public int[] malarApexLeftIndices;
        public int[] malarApexRightIndices;
    }

    public sealed class Face3DSemanticMap
    {
        private const int LandmarkMinimumCount = 3;
        private const int ReferenceMinimumCount = 8;
        private const int CentralRegionMinimumCount = 16;
        // 콧대 중앙선은 선적합 잔차의 자유도를 위해 landmark 급보다 많이 요구한다.
        private const int MidlineMinimumCount = 4;

        private readonly int[] noseTipIndices;
        private readonly int[] chinIndices;
        private readonly int[] chinBottomIndices;
        private readonly int[] upperLipIndices;
        private readonly int[] lowerLipIndices;
        private readonly int[] midfaceReferenceLeftIndices;
        private readonly int[] midfaceReferenceRightIndices;
        private readonly int[] midfaceReferenceUpperIndices;
        private readonly int[] chinReferenceLeftIndices;
        private readonly int[] chinReferenceRightIndices;
        private readonly int[] chinReferenceUpperIndices;
        private readonly int[] centralRegionIndices;
        // Tier-2 optional — null = 그룹 부재(g1 맵).
        private readonly int[] nasionIndices;
        private readonly int[] noseBridgeMidlineIndices;
        private readonly int[] alarLeftIndices;
        private readonly int[] alarRightIndices;
        private readonly int[] malarApexLeftIndices;
        private readonly int[] malarApexRightIndices;

        private Face3DSemanticMap(
            string mapId,
            Face3DTopologyFingerprint topology,
            Face3DSemanticMapData data)
        {
            SchemaVersion = Face3DContract.SemanticMapSchemaVersion;
            MapId = mapId;
            Source = Face3DContract.Source;
            GateVersion = Face3DContract.GateVersion;
            Topology = topology;
            noseTipIndices = Clone(data.noseTipIndices);
            chinIndices = Clone(data.chinIndices);
            chinBottomIndices = Clone(data.chinBottomIndices);
            upperLipIndices = Clone(data.upperLipIndices);
            lowerLipIndices = Clone(data.lowerLipIndices);
            midfaceReferenceLeftIndices = Clone(data.midfaceReferenceLeftIndices);
            midfaceReferenceRightIndices = Clone(data.midfaceReferenceRightIndices);
            midfaceReferenceUpperIndices = Clone(data.midfaceReferenceUpperIndices);
            chinReferenceLeftIndices = Clone(data.chinReferenceLeftIndices);
            chinReferenceRightIndices = Clone(data.chinReferenceRightIndices);
            chinReferenceUpperIndices = Clone(data.chinReferenceUpperIndices);
            centralRegionIndices = Clone(data.centralRegionIndices);
            nasionIndices = CloneOptional(data.nasionIndices);
            noseBridgeMidlineIndices = CloneOptional(data.noseBridgeMidlineIndices);
            alarLeftIndices = CloneOptional(data.alarLeftIndices);
            alarRightIndices = CloneOptional(data.alarRightIndices);
            malarApexLeftIndices = CloneOptional(data.malarApexLeftIndices);
            malarApexRightIndices = CloneOptional(data.malarApexRightIndices);
        }

        public string SchemaVersion { get; private set; }
        public string MapId { get; private set; }
        public string Source { get; private set; }
        public string GateVersion { get; private set; }
        public Face3DTopologyFingerprint Topology { get; private set; }

        public IReadOnlyList<int> NoseTipIndices
        {
            get { return noseTipIndices; }
        }

        public IReadOnlyList<int> ChinIndices
        {
            get { return chinIndices; }
        }

        public IReadOnlyList<int> ChinBottomIndices
        {
            get { return chinBottomIndices; }
        }

        public IReadOnlyList<int> UpperLipIndices
        {
            get { return upperLipIndices; }
        }

        public IReadOnlyList<int> LowerLipIndices
        {
            get { return lowerLipIndices; }
        }

        public IReadOnlyList<int> MidfaceReferenceLeftIndices
        {
            get { return midfaceReferenceLeftIndices; }
        }

        public IReadOnlyList<int> MidfaceReferenceRightIndices
        {
            get { return midfaceReferenceRightIndices; }
        }

        public IReadOnlyList<int> MidfaceReferenceUpperIndices
        {
            get { return midfaceReferenceUpperIndices; }
        }

        public IReadOnlyList<int> ChinReferenceLeftIndices
        {
            get { return chinReferenceLeftIndices; }
        }

        public IReadOnlyList<int> ChinReferenceRightIndices
        {
            get { return chinReferenceRightIndices; }
        }

        public IReadOnlyList<int> ChinReferenceUpperIndices
        {
            get { return chinReferenceUpperIndices; }
        }

        public IReadOnlyList<int> CentralRegionIndices
        {
            get { return centralRegionIndices; }
        }

        // Tier-2 게터 — 그룹 부재 시 null (호출측은 null 이면 해당 지표를 계산하지 않는다).
        public IReadOnlyList<int> NasionIndices
        {
            get { return nasionIndices; }
        }

        public IReadOnlyList<int> NoseBridgeMidlineIndices
        {
            get { return noseBridgeMidlineIndices; }
        }

        public IReadOnlyList<int> AlarLeftIndices
        {
            get { return alarLeftIndices; }
        }

        public IReadOnlyList<int> AlarRightIndices
        {
            get { return alarRightIndices; }
        }

        public IReadOnlyList<int> MalarApexLeftIndices
        {
            get { return malarApexLeftIndices; }
        }

        public IReadOnlyList<int> MalarApexRightIndices
        {
            get { return malarApexRightIndices; }
        }

        public static bool TryParseJson(
            string json,
            out Face3DSemanticMap semanticMap,
            out string reason)
        {
            semanticMap = null;
            if (string.IsNullOrWhiteSpace(json))
            {
                reason = "semantic_map_json_missing";
                return false;
            }

            try
            {
                Face3DSemanticMapData data = JsonUtility.FromJson<Face3DSemanticMapData>(json);
                return TryCreate(data, out semanticMap, out reason);
            }
            catch (Exception)
            {
                reason = "semantic_map_json_invalid";
                return false;
            }
        }

        public static bool TryCreate(
            Face3DSemanticMapData data,
            out Face3DSemanticMap semanticMap,
            out string reason)
        {
            semanticMap = null;
            if (data == null)
            {
                reason = "semantic_map_missing";
                return false;
            }

            if (!string.Equals(
                data.schemaVersion,
                Face3DContract.SemanticMapSchemaVersion,
                StringComparison.Ordinal))
            {
                reason = "semantic_map_schema_version_unsupported";
                return false;
            }

            if (string.IsNullOrWhiteSpace(data.mapId))
            {
                reason = "semantic_map_id_missing";
                return false;
            }

            if (!string.Equals(data.source, Face3DContract.Source, StringComparison.Ordinal))
            {
                reason = "semantic_map_source_unsupported";
                return false;
            }

            if (!string.Equals(data.gateVersion, Face3DContract.GateVersion, StringComparison.Ordinal))
            {
                reason = "semantic_map_gate_version_unsupported";
                return false;
            }

            if (!Face3DTopologyFingerprint.TryFromData(
                data.topologyFingerprint,
                out Face3DTopologyFingerprint topology,
                out reason))
            {
                return false;
            }

            if (!TryValidateIndexGroup(
                    data.noseTipIndices,
                    topology.VertexCount,
                    LandmarkMinimumCount)
                || !TryValidateIndexGroup(
                    data.chinIndices,
                    topology.VertexCount,
                    LandmarkMinimumCount)
                || !TryValidateIndexGroup(
                    data.chinBottomIndices,
                    topology.VertexCount,
                    LandmarkMinimumCount)
                || !TryValidateIndexGroup(
                    data.upperLipIndices,
                    topology.VertexCount,
                    LandmarkMinimumCount)
                || !TryValidateIndexGroup(
                    data.lowerLipIndices,
                    topology.VertexCount,
                    LandmarkMinimumCount)
                || !TryValidateIndexGroup(
                    data.midfaceReferenceLeftIndices,
                    topology.VertexCount,
                    ReferenceMinimumCount)
                || !TryValidateIndexGroup(
                    data.midfaceReferenceRightIndices,
                    topology.VertexCount,
                    ReferenceMinimumCount)
                || !TryValidateIndexGroup(
                    data.midfaceReferenceUpperIndices,
                    topology.VertexCount,
                    ReferenceMinimumCount)
                || !TryValidateIndexGroup(
                    data.chinReferenceLeftIndices,
                    topology.VertexCount,
                    ReferenceMinimumCount)
                || !TryValidateIndexGroup(
                    data.chinReferenceRightIndices,
                    topology.VertexCount,
                    ReferenceMinimumCount)
                || !TryValidateIndexGroup(
                    data.chinReferenceUpperIndices,
                    topology.VertexCount,
                    ReferenceMinimumCount)
                || !TryValidateIndexGroup(
                    data.centralRegionIndices,
                    topology.VertexCount,
                    CentralRegionMinimumCount)
                || !TryValidateLandmarkReferenceDisjointness(data))
            {
                reason = "semantic_map_indices_invalid";
                return false;
            }

            // Tier-2 optional 그룹: 부재(null)는 허용(g1 호환), 존재하면 기존 규칙으로 검증.
            if (!TryValidateOptionalIndexGroup(data.nasionIndices, topology.VertexCount, LandmarkMinimumCount)
                || !TryValidateOptionalIndexGroup(data.noseBridgeMidlineIndices, topology.VertexCount, MidlineMinimumCount)
                || !TryValidateOptionalIndexGroup(data.alarLeftIndices, topology.VertexCount, LandmarkMinimumCount)
                || !TryValidateOptionalIndexGroup(data.alarRightIndices, topology.VertexCount, LandmarkMinimumCount)
                || !TryValidateOptionalIndexGroup(data.malarApexLeftIndices, topology.VertexCount, LandmarkMinimumCount)
                || !TryValidateOptionalIndexGroup(data.malarApexRightIndices, topology.VertexCount, LandmarkMinimumCount)
                || !TryValidateTier2Disjointness(data))
            {
                reason = "semantic_map_tier2_indices_invalid";
                return false;
            }

            semanticMap = new Face3DSemanticMap(data.mapId.Trim(), topology, data);
            reason = string.Empty;
            return true;
        }

        public bool MatchesTopology(
            Face3DTopologyFingerprint observedTopology,
            out string reason)
        {
            if (observedTopology == null)
            {
                reason = "observed_topology_missing";
                return false;
            }

            if (!Topology.Equals(observedTopology))
            {
                reason = "unknown_face_mesh_topology";
                return false;
            }

            reason = string.Empty;
            return true;
        }

        public Face3DSemanticMapData ToData()
        {
            return new Face3DSemanticMapData
            {
                schemaVersion = SchemaVersion,
                mapId = MapId,
                source = Source,
                gateVersion = GateVersion,
                topologyFingerprint = Topology.ToData(),
                noseTipIndices = Clone(noseTipIndices),
                chinIndices = Clone(chinIndices),
                chinBottomIndices = Clone(chinBottomIndices),
                upperLipIndices = Clone(upperLipIndices),
                lowerLipIndices = Clone(lowerLipIndices),
                midfaceReferenceLeftIndices = Clone(midfaceReferenceLeftIndices),
                midfaceReferenceRightIndices = Clone(midfaceReferenceRightIndices),
                midfaceReferenceUpperIndices = Clone(midfaceReferenceUpperIndices),
                chinReferenceLeftIndices = Clone(chinReferenceLeftIndices),
                chinReferenceRightIndices = Clone(chinReferenceRightIndices),
                chinReferenceUpperIndices = Clone(chinReferenceUpperIndices),
                centralRegionIndices = Clone(centralRegionIndices),
                nasionIndices = CloneOptional(nasionIndices),
                noseBridgeMidlineIndices = CloneOptional(noseBridgeMidlineIndices),
                alarLeftIndices = CloneOptional(alarLeftIndices),
                alarRightIndices = CloneOptional(alarRightIndices),
                malarApexLeftIndices = CloneOptional(malarApexLeftIndices),
                malarApexRightIndices = CloneOptional(malarApexRightIndices)
            };
        }

        private static bool TryValidateIndexGroup(
            int[] indices,
            int vertexCount,
            int minimumCount)
        {
            if (indices == null || indices.Length < minimumCount)
            {
                return false;
            }

            HashSet<int> uniqueIndices = new HashSet<int>();
            for (int index = 0; index < indices.Length; index += 1)
            {
                int vertexIndex = indices[index];
                if (vertexIndex < 0
                    || vertexIndex >= vertexCount
                    || !uniqueIndices.Add(vertexIndex))
                {
                    return false;
                }
            }

            return true;
        }

        private static bool TryValidateOptionalIndexGroup(
            int[] indices,
            int vertexCount,
            int minimumCount)
        {
            // null = JSON 에 필드 자체가 없음(g1) — 유효. 존재하면 기존 규칙 그대로.
            return indices == null
                || TryValidateIndexGroup(indices, vertexCount, minimumCount);
        }

        // Tier-2 그룹은 서로·기존 12그룹 전부와 겹치면 안 된다(계약 §1) —
        // 겹침은 authoring 실수이며 지표 간 독립성이 깨진다.
        private static bool TryValidateTier2Disjointness(Face3DSemanticMapData data)
        {
            HashSet<int> baseIndices = new HashSet<int>();
            AddIndices(baseIndices, data.noseTipIndices);
            AddIndices(baseIndices, data.chinIndices);
            AddIndices(baseIndices, data.chinBottomIndices);
            AddIndices(baseIndices, data.upperLipIndices);
            AddIndices(baseIndices, data.lowerLipIndices);
            AddIndices(baseIndices, data.midfaceReferenceLeftIndices);
            AddIndices(baseIndices, data.midfaceReferenceRightIndices);
            AddIndices(baseIndices, data.midfaceReferenceUpperIndices);
            AddIndices(baseIndices, data.chinReferenceLeftIndices);
            AddIndices(baseIndices, data.chinReferenceRightIndices);
            AddIndices(baseIndices, data.chinReferenceUpperIndices);
            AddIndices(baseIndices, data.centralRegionIndices);

            int[][] tier2Groups =
            {
                data.nasionIndices,
                data.noseBridgeMidlineIndices,
                data.alarLeftIndices,
                data.alarRightIndices,
                data.malarApexLeftIndices,
                data.malarApexRightIndices
            };

            HashSet<int> seenTier2Indices = new HashSet<int>();
            for (int group = 0; group < tier2Groups.Length; group += 1)
            {
                int[] indices = tier2Groups[group];
                if (indices == null)
                {
                    continue;
                }

                for (int index = 0; index < indices.Length; index += 1)
                {
                    int vertexIndex = indices[index];
                    if (baseIndices.Contains(vertexIndex)
                        || !seenTier2Indices.Add(vertexIndex))
                    {
                        return false;
                    }
                }
            }

            return true;
        }

        private static bool TryValidateLandmarkReferenceDisjointness(
            Face3DSemanticMapData data)
        {
            HashSet<int> referenceIndices = new HashSet<int>();
            AddIndices(referenceIndices, data.midfaceReferenceLeftIndices);
            AddIndices(referenceIndices, data.midfaceReferenceRightIndices);
            AddIndices(referenceIndices, data.midfaceReferenceUpperIndices);
            AddIndices(referenceIndices, data.chinReferenceLeftIndices);
            AddIndices(referenceIndices, data.chinReferenceRightIndices);
            AddIndices(referenceIndices, data.chinReferenceUpperIndices);

            return !Overlaps(referenceIndices, data.noseTipIndices)
                && !Overlaps(referenceIndices, data.chinIndices)
                && !Overlaps(referenceIndices, data.chinBottomIndices)
                && !Overlaps(referenceIndices, data.upperLipIndices)
                && !Overlaps(referenceIndices, data.lowerLipIndices);
        }

        private static void AddIndices(HashSet<int> target, int[] indices)
        {
            for (int index = 0; index < indices.Length; index += 1)
            {
                target.Add(indices[index]);
            }
        }

        private static bool Overlaps(HashSet<int> values, int[] indices)
        {
            for (int index = 0; index < indices.Length; index += 1)
            {
                if (values.Contains(indices[index]))
                {
                    return true;
                }
            }

            return false;
        }

        private static int[] Clone(int[] values)
        {
            return values == null ? Array.Empty<int>() : (int[])values.Clone();
        }

        // optional 그룹 전용: null(부재)을 빈 배열로 승격하지 않고 그대로 보존한다 —
        // "부재"와 "존재하지만 비어있음(무효)"을 구분해야 g1 호환이 성립한다.
        private static int[] CloneOptional(int[] values)
        {
            return values == null ? null : (int[])values.Clone();
        }
    }
}
