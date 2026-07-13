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
                || !TryCentroid(vertices, semanticMap.ChinIndices, out Vector3 chin)
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
            // C1: measure chin prominence against the face-spanning MIDFACE plane (the same
            // reference noseTipProjection and centralProjectionScore use), not the chin's own
            // neighbor plane. The neighbor plane differenced away true prominence and only kept
            // local curvature; a labelled 3-subject offline test gave better between-person
            // discriminability (23.7 vs 16.5). The fixed-index chin centroid is kept. The chin
            // reference plane above is retained only as an unchanged frame-admission guard.
            float chinProjection = SignedPlaneProjection(
                chin,
                midfaceOrigin,
                midfaceNormal,
                faceScale);
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

            Face3DMetrics metrics = new Face3DMetrics(
                noseTipProjection,
                chinProjection,
                upperLipToELine,
                lowerLipToELine,
                centralProjectionScore);
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
