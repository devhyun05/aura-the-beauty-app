using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace Aura.Face3D
{
    /// <summary>
    /// Stable names shared by the lab app and the embedded main-app integration.
    /// Semantic indices are versioned and approval-gated. Legacy v1 values remain
    /// face-scale-normalized product proxies. Unified v2 additionally carries separately
    /// aggregated raw-mesh millimeters for internal validation, never clinical claims.
    /// </summary>
    public static class Face3DContract
    {
        public const string ProfileSchemaVersion = "aura.face3d-profile.v1";
        public const string SemanticMapSchemaVersion = "aura.face3d-semantic-map.v1";
        public const string GateVersion = "face3d-gate-v1";
        public const string Source = "arkit_face_mesh";
        public const string UnitNormalized = "normalized";

        public const string NoseTipProjection = "noseTipProjection";
        public const string ChinProjection = "chinProjection";
        public const string UpperLipToELine = "upperLipToELine";
        public const string LowerLipToELine = "lowerLipToELine";
        public const string CentralProjectionScore = "centralProjectionScore";

        // Tier-2 (docs/face3d/TIER2_METRIC_CONTRACT.md). Optional end to end:
        // the semantic-map groups may be absent (g1), in which case these are
        // serialized as value:null. They never gate frame validity.
        public const string NoseLength = "noseLength";
        public const string NasalBridgeStraightness = "nasalBridgeStraightness";
        public const string NasalAxisDeviation = "nasalAxisDeviation";
        public const string AlarWidth = "alarWidth";
        public const string MalarProjectionLeft = "malarProjectionLeft";
        public const string MalarProjectionRight = "malarProjectionRight";
    }

    public enum Face3DTrackingFaceGateStatus
    {
        Missing,
        Ready,
        Multiple
    }

    /// <summary>
    /// Classifies only faces that ARFoundation currently reports as Tracking.
    /// ARFaceManager may retain Limited or None trackables while changing its
    /// requested face count; those stale objects are diagnostics, not people.
    /// </summary>
    public static class Face3DTrackingFaceGate
    {
        public static Face3DTrackingFaceGateStatus Evaluate(int trackingFaceCount)
        {
            if (trackingFaceCount > 1)
            {
                return Face3DTrackingFaceGateStatus.Multiple;
            }

            return trackingFaceCount == 1
                ? Face3DTrackingFaceGateStatus.Ready
                : Face3DTrackingFaceGateStatus.Missing;
        }
    }

    /// <summary>
    /// ARFoundation-independent copy of one ARKit face-mesh frame.
    /// Callers are responsible for copying NativeArray values into these managed arrays.
    /// </summary>
    public sealed class Face3DMeshSnapshot
    {
        private readonly Vector3[] vertices;
        private readonly int[] triangleIndices;
        private readonly Vector2[] uvs;

        public Face3DMeshSnapshot(
            IEnumerable<Vector3> vertices,
            IEnumerable<int> triangleIndices,
            IEnumerable<Vector2> uvs,
            double timestampSeconds)
        {
            this.vertices = Copy(vertices);
            this.triangleIndices = Copy(triangleIndices);
            this.uvs = Copy(uvs);
            TimestampSeconds = timestampSeconds;
        }

        public IReadOnlyList<Vector3> Vertices
        {
            get { return vertices; }
        }

        public IReadOnlyList<int> TriangleIndices
        {
            get { return triangleIndices; }
        }

        public IReadOnlyList<Vector2> Uvs
        {
            get { return uvs; }
        }

        public double TimestampSeconds { get; private set; }

        private static T[] Copy<T>(IEnumerable<T> values)
        {
            if (values == null)
            {
                return Array.Empty<T>();
            }

            T[] array = values as T[];
            if (array != null)
            {
                return (T[])array.Clone();
            }

            return new List<T>(values).ToArray();
        }
    }

    public sealed class Face3DMetrics
    {
        public Face3DMetrics(
            float noseTipProjection,
            float chinProjection,
            float upperLipToELine,
            float lowerLipToELine,
            float centralProjectionScore,
            float? noseLength = null,
            float? nasalBridgeStraightness = null,
            float? nasalAxisDeviation = null,
            float? alarWidth = null,
            float? malarProjectionLeft = null,
            float? malarProjectionRight = null,
            float? noseTipProjectionMeters = null,
            float? chinProjectionMeters = null,
            float? upperLipToELineMeters = null,
            float? lowerLipToELineMeters = null,
            float? centralProjectionScoreMeters = null,
            float? noseLengthMeters = null,
            float? nasalBridgeStraightnessMeters = null,
            float? nasalAxisDeviationMeters = null,
            float? alarWidthMeters = null,
            float? malarProjectionLeftMeters = null,
            float? malarProjectionRightMeters = null)
        {
            NoseTipProjection = noseTipProjection;
            ChinProjection = chinProjection;
            UpperLipToELine = upperLipToELine;
            LowerLipToELine = lowerLipToELine;
            CentralProjectionScore = centralProjectionScore;
            NoseLength = SanitizeOptional(noseLength);
            NasalBridgeStraightness = SanitizeOptional(nasalBridgeStraightness);
            NasalAxisDeviation = SanitizeOptional(nasalAxisDeviation);
            AlarWidth = SanitizeOptional(alarWidth);
            MalarProjectionLeft = SanitizeOptional(malarProjectionLeft);
            MalarProjectionRight = SanitizeOptional(malarProjectionRight);
            NoseTipProjectionMeters = SanitizeOptional(noseTipProjectionMeters);
            ChinProjectionMeters = SanitizeOptional(chinProjectionMeters);
            UpperLipToELineMeters = SanitizeOptional(upperLipToELineMeters);
            LowerLipToELineMeters = SanitizeOptional(lowerLipToELineMeters);
            CentralProjectionScoreMeters = SanitizeOptional(
                centralProjectionScoreMeters);
            NoseLengthMeters = SanitizeOptional(noseLengthMeters);
            NasalBridgeStraightnessMeters = SanitizeOptional(
                nasalBridgeStraightnessMeters);
            NasalAxisDeviationMeters = SanitizeOptional(nasalAxisDeviationMeters);
            AlarWidthMeters = SanitizeOptional(alarWidthMeters);
            MalarProjectionLeftMeters = SanitizeOptional(
                malarProjectionLeftMeters);
            MalarProjectionRightMeters = SanitizeOptional(
                malarProjectionRightMeters);
        }

        public float NoseTipProjection { get; private set; }
        public float ChinProjection { get; private set; }
        public float UpperLipToELine { get; private set; }
        public float LowerLipToELine { get; private set; }
        public float CentralProjectionScore { get; private set; }

        // Tier-2 — null = 그룹 부재(g1) 또는 이 프레임에서 측정 불가.
        public float? NoseLength { get; private set; }
        public float? NasalBridgeStraightness { get; private set; }
        public float? NasalAxisDeviation { get; private set; }
        public float? AlarWidth { get; private set; }
        public float? MalarProjectionLeft { get; private set; }
        public float? MalarProjectionRight { get; private set; }

        // ARFoundation face-mesh vertices use meters. These samples are kept
        // alongside the normalized values so each stream can be robustly
        // aggregated independently; multiplying an aggregate ratio by an
        // aggregate face scale is not equivalent to aggregating raw distances.
        public float? NoseTipProjectionMeters { get; private set; }
        public float? ChinProjectionMeters { get; private set; }
        public float? UpperLipToELineMeters { get; private set; }
        public float? LowerLipToELineMeters { get; private set; }
        public float? CentralProjectionScoreMeters { get; private set; }
        public float? NoseLengthMeters { get; private set; }
        public float? NasalBridgeStraightnessMeters { get; private set; }
        public float? NasalAxisDeviationMeters { get; private set; }
        public float? AlarWidthMeters { get; private set; }
        public float? MalarProjectionLeftMeters { get; private set; }
        public float? MalarProjectionRightMeters { get; private set; }

        // 프레임 유효성은 기본 5지표만으로 판정한다(계약 §0) — Tier-2는 지표 단위로
        // 격리되며 프레임을 Blocked로 만들 수 없다.
        public bool IsFinite
        {
            get
            {
                return Face3DNumeric.IsFinite(NoseTipProjection)
                    && Face3DNumeric.IsFinite(ChinProjection)
                    && Face3DNumeric.IsFinite(UpperLipToELine)
                    && Face3DNumeric.IsFinite(LowerLipToELine)
                    && Face3DNumeric.IsFinite(CentralProjectionScore);
            }
        }

        private static float? SanitizeOptional(float? value)
        {
            return value.HasValue && Face3DNumeric.IsFinite(value.Value) ? value : null;
        }
    }

    public enum Face3DEvaluationStatus
    {
        Valid,
        Blocked
    }

    public sealed class Face3DEvaluationResult
    {
        private Face3DEvaluationResult(
            Face3DEvaluationStatus status,
            string reason,
            Face3DTopologyFingerprint topology,
            Face3DMetrics metrics)
        {
            Status = status;
            Reason = reason ?? string.Empty;
            Topology = topology;
            Metrics = metrics;
        }

        public Face3DEvaluationStatus Status { get; private set; }
        public string Reason { get; private set; }
        public Face3DTopologyFingerprint Topology { get; private set; }
        public Face3DMetrics Metrics { get; private set; }

        public bool IsValid
        {
            get
            {
                return Status == Face3DEvaluationStatus.Valid
                    && Topology != null
                    && Metrics != null
                    && Metrics.IsFinite;
            }
        }

        public static Face3DEvaluationResult Valid(
            Face3DTopologyFingerprint topology,
            Face3DMetrics metrics)
        {
            if (topology == null)
            {
                throw new ArgumentNullException(nameof(topology));
            }

            if (metrics == null || !metrics.IsFinite)
            {
                throw new ArgumentException("Valid Face3D metrics must be finite.", nameof(metrics));
            }

            return new Face3DEvaluationResult(
                Face3DEvaluationStatus.Valid,
                string.Empty,
                topology,
                metrics);
        }

        public static Face3DEvaluationResult Blocked(
            string reason,
            Face3DTopologyFingerprint topology = null)
        {
            return new Face3DEvaluationResult(
                Face3DEvaluationStatus.Blocked,
                string.IsNullOrWhiteSpace(reason) ? "face3d_evaluation_blocked" : reason,
                topology,
                null);
        }
    }

    public sealed class Face3DProfileMetric
    {
        public Face3DProfileMetric(
            float? value,
            float confidence,
            int validFrameCount,
            float mad,
            float? valueMm = null,
            float valueMmConfidence = 0.0f,
            int valueMmValidFrameCount = 0,
            float valueMmMad = 0.0f)
        {
            Value = value.HasValue && Face3DNumeric.IsFinite(value.Value)
                ? value
                : null;
            ValueMm = valueMm.HasValue && Face3DNumeric.IsFinite(valueMm.Value)
                ? valueMm
                : null;
            ValueMmConfidence = Face3DNumeric.IsFinite(valueMmConfidence)
                ? Mathf.Clamp01(valueMmConfidence)
                : 0.0f;
            ValueMmValidFrameCount = Math.Max(0, valueMmValidFrameCount);
            ValueMmMad = Face3DNumeric.IsFinite(valueMmMad) && valueMmMad >= 0.0f
                ? valueMmMad
                : 0.0f;
            Confidence = Face3DNumeric.IsFinite(confidence)
                ? Mathf.Clamp01(confidence)
                : 0.0f;
            Unit = Face3DContract.UnitNormalized;
            ValidFrameCount = Math.Max(0, validFrameCount);
            Mad = Face3DNumeric.IsFinite(mad) && mad >= 0.0f ? mad : 0.0f;
        }

        public float? Value { get; private set; }
        public float? ValueMm { get; private set; }
        public float ValueMmConfidence { get; private set; }
        public int ValueMmValidFrameCount { get; private set; }
        public float ValueMmMad { get; private set; }
        public float Confidence { get; private set; }
        public string Unit { get; private set; }
        public int ValidFrameCount { get; private set; }
        public float Mad { get; private set; }
    }

    public sealed class Face3DProfileMetrics
    {
        public Face3DProfileMetrics(
            Face3DProfileMetric noseTipProjection,
            Face3DProfileMetric chinProjection,
            Face3DProfileMetric upperLipToELine,
            Face3DProfileMetric lowerLipToELine,
            Face3DProfileMetric centralProjectionScore,
            Face3DProfileMetric noseLength = null,
            Face3DProfileMetric nasalBridgeStraightness = null,
            Face3DProfileMetric nasalAxisDeviation = null,
            Face3DProfileMetric alarWidth = null,
            Face3DProfileMetric malarProjectionLeft = null,
            Face3DProfileMetric malarProjectionRight = null)
        {
            NoseTipProjection = noseTipProjection;
            ChinProjection = chinProjection;
            UpperLipToELine = upperLipToELine;
            LowerLipToELine = lowerLipToELine;
            CentralProjectionScore = centralProjectionScore;
            NoseLength = noseLength;
            NasalBridgeStraightness = nasalBridgeStraightness;
            NasalAxisDeviation = nasalAxisDeviation;
            AlarWidth = alarWidth;
            MalarProjectionLeft = malarProjectionLeft;
            MalarProjectionRight = malarProjectionRight;
        }

        public Face3DProfileMetric NoseTipProjection { get; private set; }
        public Face3DProfileMetric ChinProjection { get; private set; }
        public Face3DProfileMetric UpperLipToELine { get; private set; }
        public Face3DProfileMetric LowerLipToELine { get; private set; }
        public Face3DProfileMetric CentralProjectionScore { get; private set; }

        // Tier-2 — null 이어도 직렬화는 value:null 로 항상 키를 내보낸다.
        public Face3DProfileMetric NoseLength { get; private set; }
        public Face3DProfileMetric NasalBridgeStraightness { get; private set; }
        public Face3DProfileMetric NasalAxisDeviation { get; private set; }
        public Face3DProfileMetric AlarWidth { get; private set; }
        public Face3DProfileMetric MalarProjectionLeft { get; private set; }
        public Face3DProfileMetric MalarProjectionRight { get; private set; }
    }

    public sealed class Face3DProfile
    {
        private readonly ReadOnlyCollection<string> warnings;

        public Face3DProfile(
            string topologyFingerprint,
            int validFrameCount,
            int targetFrameCount,
            IEnumerable<string> warnings,
            Face3DProfileMetrics metrics)
        {
            SchemaVersion = Face3DContract.ProfileSchemaVersion;
            Source = Face3DContract.Source;
            TopologyFingerprint = topologyFingerprint ?? string.Empty;
            GateVersion = Face3DContract.GateVersion;
            ValidFrameCount = Math.Max(0, validFrameCount);
            TargetFrameCount = Math.Max(0, targetFrameCount);
            this.warnings = new ReadOnlyCollection<string>(
                warnings == null ? new List<string>() : new List<string>(warnings));
            Metrics = metrics ?? throw new ArgumentNullException(nameof(metrics));
        }

        public string SchemaVersion { get; private set; }
        public string Source { get; private set; }
        public string TopologyFingerprint { get; private set; }
        public string GateVersion { get; private set; }
        public int ValidFrameCount { get; private set; }
        public int TargetFrameCount { get; private set; }
        public IReadOnlyList<string> Warnings
        {
            get { return warnings; }
        }

        public Face3DProfileMetrics Metrics { get; private set; }

        public string ToCanonicalJson()
        {
            return Face3DProfileJson.Serialize(this);
        }
    }

    /// <summary>
    /// JsonUtility cannot emit nullable numbers. This serializer keeps the bridge contract
    /// compact and emits an unavailable metric as JSON null instead of a sentinel value.
    /// </summary>
    public static class Face3DProfileJson
    {
        public static string Serialize(Face3DProfile profile)
        {
            if (profile == null)
            {
                throw new ArgumentNullException(nameof(profile));
            }

            StringBuilder json = new StringBuilder(768);
            json.Append('{');
            AppendString(json, "schemaVersion", profile.SchemaVersion, true);
            AppendString(json, "source", profile.Source, false);
            AppendString(json, "topologyFingerprint", profile.TopologyFingerprint, false);
            AppendString(json, "gateVersion", profile.GateVersion, false);
            AppendInt(json, "validFrameCount", profile.ValidFrameCount);
            AppendInt(json, "targetFrameCount", profile.TargetFrameCount);
            json.Append(",\"warnings\":[");
            for (int index = 0; index < profile.Warnings.Count; index += 1)
            {
                if (index > 0)
                {
                    json.Append(',');
                }

                AppendEscapedValue(json, profile.Warnings[index]);
            }

            json.Append(']');
            json.Append(",\"metrics\":{");
            AppendMetric(json, Face3DContract.NoseTipProjection, profile.Metrics.NoseTipProjection, true);
            AppendMetric(json, Face3DContract.ChinProjection, profile.Metrics.ChinProjection, false);
            AppendMetric(json, Face3DContract.UpperLipToELine, profile.Metrics.UpperLipToELine, false);
            AppendMetric(json, Face3DContract.LowerLipToELine, profile.Metrics.LowerLipToELine, false);
            AppendMetric(json, Face3DContract.CentralProjectionScore, profile.Metrics.CentralProjectionScore, false);
            // Tier-2: 항상 키를 포함하고 미산출이면 value:null (AppendMetric의
            // metric==null 경로) — RN 파서는 이 키들을 optional 로 읽는다.
            AppendMetric(json, Face3DContract.NoseLength, profile.Metrics.NoseLength, false);
            AppendMetric(json, Face3DContract.NasalBridgeStraightness, profile.Metrics.NasalBridgeStraightness, false);
            AppendMetric(json, Face3DContract.NasalAxisDeviation, profile.Metrics.NasalAxisDeviation, false);
            AppendMetric(json, Face3DContract.AlarWidth, profile.Metrics.AlarWidth, false);
            AppendMetric(json, Face3DContract.MalarProjectionLeft, profile.Metrics.MalarProjectionLeft, false);
            AppendMetric(json, Face3DContract.MalarProjectionRight, profile.Metrics.MalarProjectionRight, false);
            json.Append("}}");
            return json.ToString();
        }

        private static void AppendMetric(
            StringBuilder json,
            string name,
            Face3DProfileMetric metric,
            bool first)
        {
            if (!first)
            {
                json.Append(',');
            }

            AppendEscapedValue(json, name);
            json.Append(":{");
            json.Append("\"value\":");
            if (metric != null && metric.Value.HasValue)
            {
                AppendFloatValue(json, metric.Value.Value);
            }
            else
            {
                json.Append("null");
            }

            json.Append(",\"confidence\":");
            AppendFloatValue(json, metric != null ? metric.Confidence : 0.0f);
            json.Append(",\"unit\":\"");
            json.Append(Face3DContract.UnitNormalized);
            json.Append("\",\"validFrameCount\":");
            json.Append(metric != null ? metric.ValidFrameCount : 0);
            json.Append(",\"mad\":");
            AppendFloatValue(json, metric != null ? metric.Mad : 0.0f);
            json.Append('}');
        }

        private static void AppendString(
            StringBuilder json,
            string name,
            string value,
            bool first)
        {
            if (!first)
            {
                json.Append(',');
            }

            AppendEscapedValue(json, name);
            json.Append(':');
            AppendEscapedValue(json, value);
        }

        private static void AppendInt(StringBuilder json, string name, int value)
        {
            json.Append(',');
            AppendEscapedValue(json, name);
            json.Append(':');
            json.Append(value.ToString(CultureInfo.InvariantCulture));
        }

        private static void AppendFloatValue(StringBuilder json, float value)
        {
            json.Append(value.ToString("R", CultureInfo.InvariantCulture));
        }

        private static void AppendEscapedValue(StringBuilder json, string value)
        {
            json.Append('"');
            string safeValue = value ?? string.Empty;
            for (int index = 0; index < safeValue.Length; index += 1)
            {
                char character = safeValue[index];
                switch (character)
                {
                    case '"':
                        json.Append("\\\"");
                        break;
                    case '\\':
                        json.Append("\\\\");
                        break;
                    case '\b':
                        json.Append("\\b");
                        break;
                    case '\f':
                        json.Append("\\f");
                        break;
                    case '\n':
                        json.Append("\\n");
                        break;
                    case '\r':
                        json.Append("\\r");
                        break;
                    case '\t':
                        json.Append("\\t");
                        break;
                    default:
                        if (character < 0x20)
                        {
                            json.Append("\\u");
                            json.Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            json.Append(character);
                        }

                        break;
                }
            }

            json.Append('"');
        }
    }

    internal static class Face3DNumeric
    {
        public static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }

        public static bool IsFinite(double value)
        {
            return !double.IsNaN(value) && !double.IsInfinity(value);
        }

        public static bool IsFinite(Vector2 value)
        {
            return IsFinite(value.x) && IsFinite(value.y);
        }

        public static bool IsFinite(Vector3 value)
        {
            return IsFinite(value.x) && IsFinite(value.y) && IsFinite(value.z);
        }
    }
}
