using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using UnityEngine;

namespace Aura.Face3D
{
    /// <summary>
    /// Builds a privacy-bounded, same-frame photo overlay artifact. It emits only
    /// semantic projected samples and capture-relative depth (0..1); raw mesh
    /// vertices, triangles, UVs, and metric meters never cross the RN bridge.
    /// </summary>
    public static class Face3DPhotoEvidenceBuilder
    {
        private const float Epsilon = 0.000001f;

        private sealed class Sample
        {
            public Vector2 Point;
            public float Depth;
            public float RelativeDepth;
        }

        private sealed class Region
        {
            public string Key;
            public string Label;
            public string PinMetricKey;
            public string[] MetricKeys;
            public List<Sample> Samples;
            public List<Vector2> Hull;
            public Sample Pin;
        }

        private sealed class Guide
        {
            public string Key;
            public string Kind;
            public string Label;
            public string[] MetricKeys;
            public List<Vector2> Points;
        }

        public static bool TryBuild(
            Face3DMeshSnapshot snapshot,
            IReadOnlyList<Vector2> projectedVertices,
            string cameraFrameToken,
            string faceNativeFrameToken,
            double faceNativeTimestampMs,
            int imageWidth,
            int imageHeight,
            Face3DSemanticMap semanticMap,
            string captureId,
            string topologyFingerprint,
            out string json,
            out string reason)
        {
            json = null;
            reason = null;
            if (snapshot == null
                || semanticMap == null
                || string.IsNullOrWhiteSpace(captureId)
                || string.IsNullOrWhiteSpace(topologyFingerprint)
                || string.IsNullOrWhiteSpace(cameraFrameToken)
                || string.IsNullOrWhiteSpace(faceNativeFrameToken)
                || !Finite((float)faceNativeTimestampMs)
                || faceNativeTimestampMs < 0
                || imageWidth <= 0
                || imageHeight <= 0
                || projectedVertices == null
                || projectedVertices.Count != snapshot.Vertices.Count)
            {
                reason = "face3d_photo_evidence_input_invalid";
                return false;
            }

            IReadOnlyList<Vector3> vertices = snapshot.Vertices;
            IReadOnlyList<Vector2> projected = projectedVertices;
            if (!TryCentroid(vertices, semanticMap.MidfaceReferenceLeftIndices, out Vector3 left)
                || !TryCentroid(vertices, semanticMap.MidfaceReferenceRightIndices, out Vector3 right)
                || !TryCentroid(vertices, semanticMap.MidfaceReferenceUpperIndices, out Vector3 upper)
                || !TryCentroid(vertices, semanticMap.NoseTipIndices, out Vector3 noseTip))
            {
                reason = "face3d_photo_evidence_reference_invalid";
                return false;
            }

            Vector3 origin = (left + right) * 0.5f;
            Vector3 horizontal = right - left;
            Vector3 up = upper - origin;
            Vector3 normal = Vector3.Cross(horizontal, up);
            float faceScale = horizontal.magnitude;
            if (!Finite(origin)
                || !Finite(normal)
                || !Finite(faceScale)
                || faceScale <= Epsilon
                || normal.sqrMagnitude <= Epsilon * Epsilon)
            {
                reason = "face3d_photo_evidence_reference_degenerate";
                return false;
            }
            normal.Normalize();
            if (Vector3.Dot(noseTip - origin, normal) < 0.0f)
            {
                normal = -normal;
            }

            List<Region> regions = new List<Region>();
            AddRegion(
                regions,
                "nose",
                "코끝",
                Face3DContract.NoseTipProjection,
                new[]
                {
                    Face3DContract.NoseTipProjection,
                    Face3DContract.NoseLength,
                    Face3DContract.NasalBridgeStraightness,
                    Face3DContract.NasalAxisDeviation,
                    Face3DContract.AlarWidth,
                },
                Merge(
                    semanticMap.NoseTipIndices,
                    semanticMap.NasionIndices,
                    semanticMap.NoseBridgeMidlineIndices,
                    semanticMap.AlarLeftIndices,
                    semanticMap.AlarRightIndices),
                vertices,
                projected,
                origin,
                normal,
                semanticMap.NoseTipIndices);
            AddRegion(
                regions,
                "central",
                "중앙부",
                Face3DContract.CentralProjectionScore,
                new[] {Face3DContract.CentralProjectionScore},
                semanticMap.CentralRegionIndices,
                vertices,
                projected,
                origin,
                normal,
                semanticMap.CentralRegionIndices);
            AddRegion(
                regions,
                "malarLeft",
                "왼쪽 볼",
                Face3DContract.MalarProjectionLeft,
                new[] {Face3DContract.MalarProjectionLeft},
                semanticMap.MalarApexLeftIndices,
                vertices,
                projected,
                origin,
                normal,
                semanticMap.MalarApexLeftIndices);
            AddRegion(
                regions,
                "malarRight",
                "오른쪽 볼",
                Face3DContract.MalarProjectionRight,
                new[] {Face3DContract.MalarProjectionRight},
                semanticMap.MalarApexRightIndices,
                vertices,
                projected,
                origin,
                normal,
                semanticMap.MalarApexRightIndices);
            AddRegion(
                regions,
                "upperLip",
                "윗입술",
                Face3DContract.UpperLipToELine,
                new[] {Face3DContract.UpperLipToELine},
                semanticMap.UpperLipIndices,
                vertices,
                projected,
                origin,
                normal,
                semanticMap.UpperLipIndices);
            AddRegion(
                regions,
                "lowerLip",
                "아랫입술",
                Face3DContract.LowerLipToELine,
                new[] {Face3DContract.LowerLipToELine},
                semanticMap.LowerLipIndices,
                vertices,
                projected,
                origin,
                normal,
                semanticMap.LowerLipIndices);
            AddRegion(
                regions,
                "chin",
                "턱끝",
                Face3DContract.ChinProjection,
                new[] {Face3DContract.ChinProjection},
                Merge(semanticMap.ChinIndices, semanticMap.ChinBottomIndices),
                vertices,
                projected,
                origin,
                normal,
                semanticMap.ChinIndices);
            if (regions.Count == 0)
            {
                reason = "face3d_photo_evidence_regions_unavailable";
                return false;
            }

            float minimumDepth = regions.SelectMany(region => region.Samples)
                .Min(item => item.Depth);
            float maximumDepth = regions.SelectMany(region => region.Samples)
                .Max(item => item.Depth);
            float depthSpan = maximumDepth - minimumDepth;
            foreach (Sample item in regions.SelectMany(region => region.Samples))
            {
                item.RelativeDepth = depthSpan > Epsilon
                    ? Mathf.Clamp01((item.Depth - minimumDepth) / depthSpan)
                    : 0.5f;
            }
            foreach (Region region in regions)
            {
                region.Pin.RelativeDepth = depthSpan > Epsilon
                    ? Mathf.Clamp01((region.Pin.Depth - minimumDepth) / depthSpan)
                    : 0.5f;
            }

            List<Guide> guides = BuildGuides(
                semanticMap,
                vertices,
                projected,
                origin,
                horizontal);
            json = Serialize(
                cameraFrameToken.Trim(),
                faceNativeFrameToken.Trim(),
                faceNativeTimestampMs,
                imageWidth,
                imageHeight,
                captureId.Trim(),
                topologyFingerprint.Trim(),
                regions,
                guides);
            return true;
        }

        private static void AddRegion(
            ICollection<Region> output,
            string key,
            string label,
            string pinMetricKey,
            string[] metricKeys,
            IReadOnlyList<int> indices,
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<Vector2> projected,
            Vector3 origin,
            Vector3 normal,
            IReadOnlyList<int> pinIndices)
        {
            List<Sample> samples = Samples(
                indices,
                vertices,
                projected,
                origin,
                normal);
            List<Sample> pinCandidates = Samples(
                pinIndices,
                vertices,
                projected,
                origin,
                normal);
            if (samples.Count < 3 || pinCandidates.Count == 0)
            {
                return;
            }
            List<Vector2> hull = ConvexHull(
                samples.Select(sample => sample.Point).ToList());
            if (hull.Count < 3)
            {
                hull = BoundsHull(samples.Select(sample => sample.Point));
            }
            if (hull.Count < 3)
            {
                return;
            }
            output.Add(new Region
            {
                Key = key,
                Label = label,
                PinMetricKey = pinMetricKey,
                MetricKeys = metricKeys,
                Samples = samples,
                Hull = hull,
                Pin = pinCandidates
                    .OrderByDescending(candidate => candidate.Depth)
                    .First(),
            });
        }

        private static List<Guide> BuildGuides(
            Face3DSemanticMap semanticMap,
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<Vector2> projected,
            Vector3 origin,
            Vector3 horizontal)
        {
            List<Guide> guides = new List<Guide>();
            if (TryProjectedCentroid(projected, semanticMap.NasionIndices, out Vector2 nasion)
                && TryProjectedCentroid(projected, semanticMap.NoseTipIndices, out Vector2 noseTip))
            {
                guides.Add(new Guide
                {
                    Key = "noseLength",
                    Kind = "length",
                    Label = "코 길이",
                    MetricKeys = new[] {Face3DContract.NoseLength},
                    Points = new List<Vector2> {nasion, noseTip},
                });
            }
            List<Vector2> bridge = ProjectedPoints(
                projected,
                semanticMap.NoseBridgeMidlineIndices);
            if (bridge.Count >= 2)
            {
                guides.Add(new Guide
                {
                    Key = "nasalBridge",
                    Kind = "contour",
                    Label = "콧대와 코축",
                    MetricKeys = new[]
                    {
                        Face3DContract.NasalBridgeStraightness,
                        Face3DContract.NasalAxisDeviation,
                    },
                    Points = bridge,
                });
            }

            Vector3 lateral = horizontal.normalized;
            if (TryExtremeIndex(
                    vertices,
                    semanticMap.AlarLeftIndices,
                    origin,
                    lateral,
                    false,
                    out int alarLeft)
                && TryExtremeIndex(
                    vertices,
                    semanticMap.AlarRightIndices,
                    origin,
                    lateral,
                    true,
                    out int alarRight)
                && ValidPoint(projected[alarLeft])
                && ValidPoint(projected[alarRight]))
            {
                guides.Add(new Guide
                {
                    Key = "alarWidth",
                    Kind = "distance",
                    Label = "콧볼 너비",
                    MetricKeys = new[] {Face3DContract.AlarWidth},
                    Points = new List<Vector2>
                    {
                        projected[alarLeft],
                        projected[alarRight],
                    },
                });
            }
            return guides;
        }

        private static List<Sample> Samples(
            IReadOnlyList<int> indices,
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<Vector2> projected,
            Vector3 origin,
            Vector3 normal)
        {
            List<Sample> result = new List<Sample>();
            if (indices == null) return result;
            HashSet<int> seen = new HashSet<int>();
            foreach (int index in indices)
            {
                if (!seen.Add(index)
                    || index < 0
                    || index >= vertices.Count
                    || index >= projected.Count
                    || !Finite(vertices[index])
                    || !ValidPoint(projected[index]))
                {
                    continue;
                }
                result.Add(new Sample
                {
                    Point = projected[index],
                    Depth = Vector3.Dot(vertices[index] - origin, normal),
                });
            }
            return result;
        }

        private static List<Vector2> ProjectedPoints(
            IReadOnlyList<Vector2> projected,
            IReadOnlyList<int> indices)
        {
            List<Vector2> result = new List<Vector2>();
            if (indices == null) return result;
            foreach (int index in indices)
            {
                if (index >= 0
                    && index < projected.Count
                    && ValidPoint(projected[index]))
                {
                    result.Add(projected[index]);
                }
            }
            return result;
        }

        private static bool TryCentroid(
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<int> indices,
            out Vector3 centroid)
        {
            centroid = Vector3.zero;
            if (indices == null || indices.Count == 0) return false;
            foreach (int index in indices)
            {
                if (index < 0 || index >= vertices.Count || !Finite(vertices[index]))
                {
                    return false;
                }
                centroid += vertices[index];
            }
            centroid /= indices.Count;
            return Finite(centroid);
        }

        private static bool TryProjectedCentroid(
            IReadOnlyList<Vector2> projected,
            IReadOnlyList<int> indices,
            out Vector2 centroid)
        {
            centroid = Vector2.zero;
            if (indices == null || indices.Count == 0) return false;
            foreach (int index in indices)
            {
                if (index < 0 || index >= projected.Count || !ValidPoint(projected[index]))
                {
                    return false;
                }
                centroid += projected[index];
            }
            centroid /= indices.Count;
            return ValidPoint(centroid);
        }

        private static bool TryExtremeIndex(
            IReadOnlyList<Vector3> vertices,
            IReadOnlyList<int> indices,
            Vector3 origin,
            Vector3 normal,
            bool maximum,
            out int selectedIndex)
        {
            selectedIndex = -1;
            if (indices == null) return false;
            float selected = maximum
                ? float.NegativeInfinity
                : float.PositiveInfinity;
            foreach (int index in indices)
            {
                if (index < 0 || index >= vertices.Count || !Finite(vertices[index]))
                {
                    continue;
                }
                float value = Vector3.Dot(vertices[index] - origin, normal);
                bool better = maximum ? value > selected : value < selected;
                if (better || (Mathf.Abs(value - selected) <= Epsilon
                    && (selectedIndex < 0 || index < selectedIndex)))
                {
                    selected = value;
                    selectedIndex = index;
                }
            }
            return selectedIndex >= 0;
        }

        private static IReadOnlyList<int> Merge(
            params IReadOnlyList<int>[] groups)
        {
            List<int> result = new List<int>();
            HashSet<int> seen = new HashSet<int>();
            foreach (IReadOnlyList<int> group in groups)
            {
                if (group == null) continue;
                foreach (int index in group)
                {
                    if (seen.Add(index)) result.Add(index);
                }
            }
            return result;
        }

        private static List<Vector2> ConvexHull(List<Vector2> points)
        {
            List<Vector2> sorted = points
                .Distinct()
                .OrderBy(point => point.x)
                .ThenBy(point => point.y)
                .ToList();
            if (sorted.Count < 3) return sorted;
            List<Vector2> lower = new List<Vector2>();
            foreach (Vector2 point in sorted)
            {
                while (lower.Count >= 2
                    && Cross(lower[lower.Count - 2], lower[lower.Count - 1], point) <= 0)
                {
                    lower.RemoveAt(lower.Count - 1);
                }
                lower.Add(point);
            }
            List<Vector2> upper = new List<Vector2>();
            for (int index = sorted.Count - 1; index >= 0; index -= 1)
            {
                Vector2 point = sorted[index];
                while (upper.Count >= 2
                    && Cross(upper[upper.Count - 2], upper[upper.Count - 1], point) <= 0)
                {
                    upper.RemoveAt(upper.Count - 1);
                }
                upper.Add(point);
            }
            lower.RemoveAt(lower.Count - 1);
            upper.RemoveAt(upper.Count - 1);
            lower.AddRange(upper);
            return lower;
        }

        private static List<Vector2> BoundsHull(IEnumerable<Vector2> points)
        {
            List<Vector2> list = points.ToList();
            if (list.Count == 0) return new List<Vector2>();
            float minX = Mathf.Max(0, list.Min(point => point.x) - 0.006f);
            float maxX = Mathf.Min(1, list.Max(point => point.x) + 0.006f);
            float minY = Mathf.Max(0, list.Min(point => point.y) - 0.006f);
            float maxY = Mathf.Min(1, list.Max(point => point.y) + 0.006f);
            return new List<Vector2>
            {
                new Vector2(minX, minY),
                new Vector2(maxX, minY),
                new Vector2(maxX, maxY),
                new Vector2(minX, maxY),
            };
        }

        private static float Cross(Vector2 a, Vector2 b, Vector2 c)
        {
            return (b.x - a.x) * (c.y - a.y)
                - (b.y - a.y) * (c.x - a.x);
        }

        private static string Serialize(
            string cameraFrameToken,
            string faceNativeFrameToken,
            double faceNativeTimestampMs,
            int imageWidth,
            int imageHeight,
            string captureId,
            string topologyFingerprint,
            IReadOnlyList<Region> regions,
            IReadOnlyList<Guide> guides)
        {
            StringBuilder json = new StringBuilder(8192);
            json.Append("{\"schemaVersion\":\"aura.face3d-photo-evidence.v1\"");
            json.Append(",\"captureId\":").Append(Quote(captureId));
            json.Append(",\"coordinateSpace\":\"portrait_unmirrored_normalized\"");
            json.Append(",\"topologyFingerprint\":").Append(Quote(topologyFingerprint));
            json.Append(",\"image\":{\"width\":").Append(imageWidth)
                .Append(",\"height\":").Append(imageHeight).Append('}');
            json.Append(",\"frame\":{\"cameraFrameToken\":")
                .Append(Quote(cameraFrameToken))
                .Append(",\"faceNativeFrameToken\":")
                .Append(Quote(faceNativeFrameToken))
                .Append(",\"faceNativeTimestampMs\":")
                .Append(Number(faceNativeTimestampMs))
                .Append('}');
            json.Append(",\"regions\":{");
            for (int index = 0; index < regions.Count; index += 1)
            {
                if (index > 0) json.Append(',');
                Region region = regions[index];
                json.Append(Quote(region.Key)).Append(":{\"metricKeys\":");
                AppendStrings(json, region.MetricKeys);
                json.Append(",\"samples\":");
                AppendSamples(json, region.Samples);
                json.Append(",\"hull\":");
                AppendPoints(json, region.Hull);
                json.Append(",\"pin\":{\"x\":").Append(Number(region.Pin.Point.x))
                    .Append(",\"y\":").Append(Number(region.Pin.Point.y))
                    .Append(",\"relativeDepth\":").Append(Number(region.Pin.RelativeDepth))
                    .Append(",\"label\":").Append(Quote(region.Label))
                    .Append(",\"metricKey\":").Append(Quote(region.PinMetricKey))
                    .Append("}}");
            }
            json.Append("},\"guides\":[");
            for (int index = 0; index < guides.Count; index += 1)
            {
                if (index > 0) json.Append(',');
                Guide guide = guides[index];
                json.Append("{\"key\":").Append(Quote(guide.Key))
                    .Append(",\"kind\":").Append(Quote(guide.Kind))
                    .Append(",\"label\":").Append(Quote(guide.Label))
                    .Append(",\"metricKeys\":");
                AppendStrings(json, guide.MetricKeys);
                json.Append(",\"points\":");
                AppendPoints(json, guide.Points);
                json.Append('}');
            }
            json.Append("]}");
            return json.ToString();
        }

        private static void AppendSamples(StringBuilder json, IReadOnlyList<Sample> samples)
        {
            json.Append('[');
            for (int index = 0; index < samples.Count; index += 1)
            {
                if (index > 0) json.Append(',');
                Sample sample = samples[index];
                json.Append("{\"x\":").Append(Number(sample.Point.x))
                    .Append(",\"y\":").Append(Number(sample.Point.y))
                    .Append(",\"relativeDepth\":").Append(Number(sample.RelativeDepth))
                    .Append('}');
            }
            json.Append(']');
        }

        private static void AppendPoints(StringBuilder json, IReadOnlyList<Vector2> points)
        {
            json.Append('[');
            for (int index = 0; index < points.Count; index += 1)
            {
                if (index > 0) json.Append(',');
                json.Append("{\"x\":").Append(Number(points[index].x))
                    .Append(",\"y\":").Append(Number(points[index].y))
                    .Append('}');
            }
            json.Append(']');
        }

        private static void AppendStrings(StringBuilder json, IReadOnlyList<string> values)
        {
            json.Append('[');
            for (int index = 0; index < values.Count; index += 1)
            {
                if (index > 0) json.Append(',');
                json.Append(Quote(values[index]));
            }
            json.Append(']');
        }

        private static bool Finite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        private static bool Finite(Vector3 value)
        {
            return Finite(value.x) && Finite(value.y) && Finite(value.z);
        }

        private static bool ValidPoint(Vector2 point)
        {
            return Finite(point.x)
                && Finite(point.y)
                && point.x >= 0
                && point.x <= 1
                && point.y >= 0
                && point.y <= 1;
        }

        private static string Number(double value)
        {
            return value.ToString("0.############", CultureInfo.InvariantCulture);
        }

        private static string Quote(string value)
        {
            if (value == null) return "null";
            return "\"" + value
                .Replace("\\", "\\\\")
                .Replace("\"", "\\\"")
                .Replace("\n", "\\n")
                .Replace("\r", "\\r") + "\"";
        }
    }
}
