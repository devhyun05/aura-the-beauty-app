using System.Collections.Generic;
using UnityEngine;

namespace Aura.Face3D
{
    /// <summary>
    /// Provisional normalized geometry for the Face3D lab. The reference plane and all
    /// semantic points come from the external semantic map, never from built-in indices.
    /// </summary>
    public static class Face3DMetricEvaluator
    {
        private const float GeometryEpsilon = 0.000001f;

        public static Face3DEvaluationResult Evaluate(
            Face3DMeshSnapshot snapshot,
            Face3DSemanticMap semanticMap)
        {
            if (!Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint topology,
                out string reason))
            {
                return Face3DEvaluationResult.Blocked(reason);
            }

            if (semanticMap == null)
            {
                return Face3DEvaluationResult.Blocked("semantic_map_missing", topology);
            }

            if (!semanticMap.MatchesTopology(topology, out reason))
            {
                return Face3DEvaluationResult.Blocked(reason, topology);
            }

            if (!Face3DNumeric.IsFinite(snapshot.TimestampSeconds))
            {
                return Face3DEvaluationResult.Blocked("mesh_timestamp_not_finite", topology);
            }

            IReadOnlyList<Vector3> vertices = snapshot.Vertices;
            if (!TryCentroid(vertices, semanticMap.NoseTipIndices, out Vector3 noseTip)
                || !TryCentroid(vertices, semanticMap.UpperLipIndices, out Vector3 upperLip)
                || !TryCentroid(vertices, semanticMap.LowerLipIndices, out Vector3 lowerLip)
                || !TryCentroid(vertices, semanticMap.MidfaceReferenceLeftIndices, out Vector3 midfaceLeft)
                || !TryCentroid(vertices, semanticMap.MidfaceReferenceRightIndices, out Vector3 midfaceRight)
                || !TryCentroid(vertices, semanticMap.MidfaceReferenceUpperIndices, out Vector3 midfaceUpper)
                || !TryCentroid(vertices, semanticMap.ChinReferenceLeftIndices, out Vector3 chinReferenceLeft)
                || !TryCentroid(vertices, semanticMap.ChinReferenceRightIndices, out Vector3 chinReferenceRight)
                || !TryCentroid(vertices, semanticMap.ChinReferenceUpperIndices, out Vector3 chinReferenceUpper)
                || !TryCentroid(vertices, semanticMap.CentralRegionIndices, out Vector3 centralRegion))
            {
                return Face3DEvaluationResult.Blocked("semantic_landmark_geometry_invalid", topology);
            }

            Vector3 midfaceHorizontal = midfaceRight - midfaceLeft;
            float faceScale = midfaceHorizontal.magnitude;
            if (!Face3DNumeric.IsFinite(faceScale) || faceScale <= GeometryEpsilon)
            {
                return Face3DEvaluationResult.Blocked("reference_face_scale_degenerate", topology);
            }

            if (!TryCreateReferencePlane(
                midfaceLeft,
                midfaceRight,
                midfaceUpper,
                out Vector3 midfaceOrigin,
                out Vector3 midfaceNormal)
                || !TryCreateReferencePlane(
                    chinReferenceLeft,
                    chinReferenceRight,
                    chinReferenceUpper,
                    out Vector3 chinReferenceOrigin,
                    out Vector3 chinReferenceNormal))
            {
                return Face3DEvaluationResult.Blocked("reference_plane_degenerate", topology);
            }

            float noseDepth = Vector3.Dot(noseTip - midfaceOrigin, midfaceNormal);
            if (!Face3DNumeric.IsFinite(noseDepth)
                || Mathf.Abs(noseDepth) <= GeometryEpsilon * faceScale)
            {
                return Face3DEvaluationResult.Blocked("reference_plane_orientation_ambiguous", topology);
            }

            // Keep positive projection facing the nose, independent of source-axis handedness.
            if (noseDepth < 0.0f)
            {
                midfaceNormal = -midfaceNormal;
            }

            float chinPlaneAlignment = Vector3.Dot(chinReferenceNormal, midfaceNormal);
            if (!Face3DNumeric.IsFinite(chinPlaneAlignment)
                || Mathf.Abs(chinPlaneAlignment) <= GeometryEpsilon)
            {
                return Face3DEvaluationResult.Blocked("chin_reference_plane_orientation_ambiguous", topology);
            }

            if (chinPlaneAlignment < 0.0f)
            {
                chinReferenceNormal = -chinReferenceNormal;
            }

            // Soft-tissue Pogonion is the most anterior midline point on the chin, not
            // the centroid of a fixed set and not Menton (the inferior chin endpoint).
            // Keep a fixed topology patch, then select its person-specific anterior
            // extreme against the same oriented midface plane used by chinProjection.
            if (!TryMaxSignedPlaneProjectionPoint(
                vertices,
                semanticMap.ChinIndices,
                midfaceOrigin,
                midfaceNormal,
                faceScale,
                out Vector3 chin,
                out float chinProjection))
            {
                return Face3DEvaluationResult.Blocked(
                    "semantic_landmark_geometry_invalid",
                    topology);
            }

            Vector3 eLine = chin - noseTip;
            float eLineLength = eLine.magnitude;
            if (!Face3DNumeric.IsFinite(eLineLength) || eLineLength <= GeometryEpsilon)
            {
                return Face3DEvaluationResult.Blocked("esthetic_line_degenerate", topology);
            }

            Vector3 eLineDirection = eLine / eLineLength;
            Vector3 eLineDepthAxis = midfaceNormal
                - (Vector3.Dot(midfaceNormal, eLineDirection) * eLineDirection);
            if (!Face3DNumeric.IsFinite(eLineDepthAxis)
                || eLineDepthAxis.sqrMagnitude <= GeometryEpsilon * GeometryEpsilon)
            {
                return Face3DEvaluationResult.Blocked("esthetic_line_depth_axis_degenerate", topology);
            }

            eLineDepthAxis.Normalize();
            if (Vector3.Dot(eLineDepthAxis, midfaceNormal) < 0.0f)
            {
                eLineDepthAxis = -eLineDepthAxis;
            }

            float noseTipProjection = SignedPlaneProjection(
                noseTip,
                midfaceOrigin,
                midfaceNormal,
                faceScale);
            // C1/C2: chinProjection is the selected soft-tissue Pogonion's projection
            // against the face-spanning midface plane. The same selected point anchors
            // E-line above. The chin neighbor plane remains only a frame-admission guard.
            float upperLipToELine = SignedDistanceToLine(
                upperLip,
                noseTip,
                eLineDirection,
                eLineDepthAxis,
                faceScale);
            float lowerLipToELine = SignedDistanceToLine(
                lowerLip,
                noseTip,
                eLineDirection,
                eLineDepthAxis,
                faceScale);
            float centralProjectionScore = SignedPlaneProjection(
                centralRegion,
                midfaceOrigin,
                midfaceNormal,
                faceScale);

            // ── Tier-2 (optional 그룹) — 부재·퇴화는 해당 지표만 null, 절대 Blocked 아님.
            // 정규화는 각 헬퍼/SignedPlaneProjection 내부 1곳에서만 수행한다(계약 §0-2).

            // 중선(midsagittal) 평면: origin=midfaceOrigin, normal=정규화 midfaceHorizontal.
            // 전후 기준면(midfaceNormal)과 다른, 좌/우 부호를 갖는 유일한 평면.
            // 양수 = 맵의 midfaceReferenceRight 쪽 — 부호 방향은 G1 오버레이 검증에서 확정.
            Vector3 midsagittalNormal = midfaceHorizontal / faceScale;

            float? noseLength = null;
            float? nasalBridgeStraightness = null;
            float? nasalAxisDeviation = null;
            float? alarWidth = null;
            float? malarProjectionLeft = null;
            float? malarProjectionRight = null;

            bool hasNasion = TryCentroid(vertices, semanticMap.NasionIndices, out Vector3 nasion);
            if (hasNasion)
            {
                noseLength = NormalizedDistance(nasion, noseTip, faceScale);
            }

            List<Vector3> bridgePoints = CollectPoints(vertices, semanticMap.NoseBridgeMidlineIndices);
            if (bridgePoints != null)
            {
                // 직선은 nasion 중심→noseTip 중심의 "이상적 콧대 축"에 고정한다(계약 §2) —
                // nasion 그룹이 없으면 축을 정의할 수 없어 straightness 도 null.
                if (hasNasion)
                {
                    nasalBridgeStraightness = NormalizedResidualRmsToLine(
                        bridgePoints,
                        nasion,
                        noseTip - nasion,
                        faceScale);
                }

                nasalAxisDeviation = MeanSignedPlaneProjection(
                    bridgePoints,
                    midfaceOrigin,
                    midsagittalNormal,
                    faceScale);
            }

            if (TryCentroid(vertices, semanticMap.AlarLeftIndices, out Vector3 alarLeft)
                && TryCentroid(vertices, semanticMap.AlarRightIndices, out Vector3 alarRight))
            {
                alarWidth = NormalizedDistance(alarLeft, alarRight, faceScale);
            }

            // malar 는 ROI 내 vertex 별 전후 투영의 최댓값(표면 최고점) — 좌우 평균 금지(계약 §2).
            malarProjectionLeft = MaxSignedPlaneProjection(
                vertices,
                semanticMap.MalarApexLeftIndices,
                midfaceOrigin,
                midfaceNormal,
                faceScale);
            malarProjectionRight = MaxSignedPlaneProjection(
                vertices,
                semanticMap.MalarApexRightIndices,
                midfaceOrigin,
                midfaceNormal,
                faceScale);

            Face3DMetrics metrics = new Face3DMetrics(
                noseTipProjection,
                chinProjection,
                upperLipToELine,
                lowerLipToELine,
                centralProjectionScore,
                noseLength,
                nasalBridgeStraightness,
                nasalAxisDeviation,
                alarWidth,
                malarProjectionLeft,
                malarProjectionRight);
            if (!metrics.IsFinite)
            {
                return Face3DEvaluationResult.Blocked("face3d_metric_not_finite", topology);
            }

            return Face3DEvaluationResult.Valid(topology, metrics);
        }

        private static float SignedPlaneProjection(
            Vector3 point,
            Vector3 planeOrigin,
            Vector3 planeNormal,
            float faceScale)
        {
            return Vector3.Dot(point - planeOrigin, planeNormal) / faceScale;
        }

        private static float SignedDistanceToLine(
            Vector3 point,
            Vector3 lineOrigin,
            Vector3 lineDirection,
            Vector3 depthAxis,
            float faceScale)
        {
            Vector3 closestPoint = lineOrigin
                + (Vector3.Dot(point - lineOrigin, lineDirection) * lineDirection);
            return Vector3.Dot(point - closestPoint, depthAxis) / faceScale;
        }

        private static bool TryCreateReferencePlane(
            Vector3 left,
            Vector3 right,
            Vector3 upper,
            out Vector3 origin,
            out Vector3 normal)
        {
            origin = (left + right) * 0.5f;
            Vector3 horizontal = right - left;
            Vector3 up = upper - origin;
            normal = Vector3.Cross(horizontal, up);
            if (!Face3DNumeric.IsFinite(origin)
                || !Face3DNumeric.IsFinite(normal)
                || normal.sqrMagnitude <= GeometryEpsilon * GeometryEpsilon)
            {
                normal = Vector3.zero;
                return false;
            }

            normal.Normalize();
            return true;
        }

        // ── Tier-2 헬퍼 — 나눗셈(faceScale 정규화)은 여기 내부 1곳씩만. 반환 null =
        //    입력 퇴화(호출측은 지표 null 로 격리).

        private static float? NormalizedDistance(Vector3 a, Vector3 b, float faceScale)
        {
            float distance = (b - a).magnitude / faceScale;
            return Face3DNumeric.IsFinite(distance) ? distance : (float?)null;
        }

        private static float? NormalizedResidualRmsToLine(
            List<Vector3> points,
            Vector3 lineOrigin,
            Vector3 lineAxis,
            float faceScale)
        {
            float axisLength = lineAxis.magnitude;
            if (!Face3DNumeric.IsFinite(axisLength) || axisLength <= GeometryEpsilon)
            {
                return null;
            }

            Vector3 direction = lineAxis / axisLength;
            float sumSquared = 0.0f;
            for (int index = 0; index < points.Count; index += 1)
            {
                Vector3 offset = points[index] - lineOrigin;
                Vector3 residual = offset - (Vector3.Dot(offset, direction) * direction);
                sumSquared += residual.sqrMagnitude;
            }

            float rms = Mathf.Sqrt(sumSquared / points.Count) / faceScale;
            return Face3DNumeric.IsFinite(rms) ? rms : (float?)null;
        }

        private static float? MeanSignedPlaneProjection(
            List<Vector3> points,
            Vector3 planeOrigin,
            Vector3 planeNormal,
            float faceScale)
        {
            float sum = 0.0f;
            for (int index = 0; index < points.Count; index += 1)
            {
                sum += SignedPlaneProjection(points[index], planeOrigin, planeNormal, faceScale);
            }

            float mean = sum / points.Count;
            return Face3DNumeric.IsFinite(mean) ? mean : (float?)null;
        }

        private static float? MaxSignedPlaneProjection(
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<int> indices,
            Vector3 planeOrigin,
            Vector3 planeNormal,
            float faceScale)
        {
            List<Vector3> points = CollectPoints(vertices, indices);
            if (points == null)
            {
                return null;
            }

            float max = float.NegativeInfinity;
            for (int index = 0; index < points.Count; index += 1)
            {
                float projection = SignedPlaneProjection(
                    points[index],
                    planeOrigin,
                    planeNormal,
                    faceScale);
                if (projection > max)
                {
                    max = projection;
                }
            }

            return Face3DNumeric.IsFinite(max) ? max : (float?)null;
        }

        private static bool TryMaxSignedPlaneProjectionPoint(
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<int> indices,
            Vector3 planeOrigin,
            Vector3 planeNormal,
            float faceScale,
            out Vector3 selectedPoint,
            out float selectedProjection)
        {
            selectedPoint = Vector3.zero;
            selectedProjection = float.NegativeInfinity;
            if (vertices == null || indices == null || indices.Count == 0)
            {
                return false;
            }

            float maximumProjection = float.NegativeInfinity;
            for (int index = 0; index < indices.Count; index += 1)
            {
                int vertexIndex = indices[index];
                if (vertexIndex < 0 || vertexIndex >= vertices.Count)
                {
                    return false;
                }

                Vector3 point = vertices[vertexIndex];
                if (!Face3DNumeric.IsFinite(point))
                {
                    return false;
                }

                float projection = SignedPlaneProjection(
                    point,
                    planeOrigin,
                    planeNormal,
                    faceScale);
                if (!Face3DNumeric.IsFinite(projection))
                {
                    return false;
                }

                if (projection > maximumProjection)
                {
                    maximumProjection = projection;
                }
            }

            int selectedVertexIndex = int.MaxValue;
            for (int index = 0; index < indices.Count; index += 1)
            {
                int vertexIndex = indices[index];
                Vector3 point = vertices[vertexIndex];
                float projection = SignedPlaneProjection(
                    point,
                    planeOrigin,
                    planeNormal,
                    faceScale);
                if (maximumProjection - projection <= GeometryEpsilon
                    && vertexIndex < selectedVertexIndex)
                {
                    selectedPoint = point;
                    selectedProjection = projection;
                    selectedVertexIndex = vertexIndex;
                }
            }

            return selectedVertexIndex != int.MaxValue
                && Face3DNumeric.IsFinite(selectedPoint)
                && Face3DNumeric.IsFinite(selectedProjection);
        }

        // 그룹 부재(null)·빈 그룹·범위 밖·비유한 vertex 는 전부 null 반환 — Tier-2 는
        // 프레임을 Blocked 로 만들지 않고 지표 단위로만 빠진다.
        private static List<Vector3> CollectPoints(
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<int> indices)
        {
            if (vertices == null || indices == null || indices.Count == 0)
            {
                return null;
            }

            List<Vector3> points = new List<Vector3>(indices.Count);
            for (int index = 0; index < indices.Count; index += 1)
            {
                int vertexIndex = indices[index];
                if (vertexIndex < 0 || vertexIndex >= vertices.Count)
                {
                    return null;
                }

                Vector3 vertex = vertices[vertexIndex];
                if (!Face3DNumeric.IsFinite(vertex))
                {
                    return null;
                }

                points.Add(vertex);
            }

            return points;
        }

        private static bool TryCentroid(
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<int> indices,
            out Vector3 centroid)
        {
            centroid = Vector3.zero;
            if (vertices == null || indices == null || indices.Count == 0)
            {
                return false;
            }

            for (int index = 0; index < indices.Count; index += 1)
            {
                int vertexIndex = indices[index];
                if (vertexIndex < 0 || vertexIndex >= vertices.Count)
                {
                    return false;
                }

                Vector3 vertex = vertices[vertexIndex];
                if (!Face3DNumeric.IsFinite(vertex))
                {
                    return false;
                }

                centroid += vertex;
            }

            centroid /= indices.Count;
            return Face3DNumeric.IsFinite(centroid);
        }
    }
}
