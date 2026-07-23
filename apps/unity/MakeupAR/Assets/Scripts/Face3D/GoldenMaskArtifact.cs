using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace Aura.Face3D
{
    public static class GoldenMaskContract
    {
        public const string SchemaVersion = "aura.golden-mask.v1";
        public const string FileExtension = ".auragm";
        public const int FormatVersion = 1;
        public const int MaximumArtifactBytes = 1024 * 1024;
        public const int MaximumVertexCount = 4096;
        public const int MaximumTriangleIndexCount = 32768;
        internal static readonly byte[] Magic = Encoding.ASCII.GetBytes("AUGM");
    }

    public sealed class GoldenMaskArtifact
    {
        private readonly Vector3[] vertices;
        private readonly int[] triangleIndices;
        private readonly Vector2[] uvs;

        public GoldenMaskArtifact(
            string captureId,
            long createdAtUnixMs,
            Face3DTopologyFingerprint topology,
            IEnumerable<Vector3> vertices,
            IEnumerable<int> triangleIndices,
            IEnumerable<Vector2> uvs,
            bool trueDepthHardware,
            bool depthDataObserved,
            bool faceTrackingSupported,
            string deviceModel)
        {
            CaptureId = captureId;
            CreatedAtUnixMs = createdAtUnixMs;
            Topology = topology;
            this.vertices = Copy(vertices);
            this.triangleIndices = Copy(triangleIndices);
            this.uvs = Copy(uvs);
            TrueDepthHardware = trueDepthHardware;
            DepthDataObserved = depthDataObserved;
            FaceTrackingSupported = faceTrackingSupported;
            DeviceModel = string.IsNullOrWhiteSpace(deviceModel)
                ? string.Empty
                : deviceModel.Trim();
        }

        public string CaptureId { get; }
        public long CreatedAtUnixMs { get; }
        public Face3DTopologyFingerprint Topology { get; }
        public IReadOnlyList<Vector3> Vertices => vertices;
        public IReadOnlyList<int> TriangleIndices => triangleIndices;
        public IReadOnlyList<Vector2> Uvs => uvs;
        public bool TrueDepthHardware { get; }
        public bool DepthDataObserved { get; }
        public bool FaceTrackingSupported { get; }
        public string DeviceModel { get; }

        private static T[] Copy<T>(IEnumerable<T> values)
        {
            if (values == null)
            {
                return Array.Empty<T>();
            }

            T[] array = values as T[];
            return array != null
                ? (T[])array.Clone()
                : new List<T>(values).ToArray();
        }
    }

    public sealed class GoldenMaskArtifactDescriptor
    {
        public GoldenMaskArtifactDescriptor(
            string localUri,
            long byteSize,
            GoldenMaskArtifact artifact)
        {
            LocalUri = localUri;
            ByteSize = byteSize;
            CaptureId = artifact.CaptureId;
            CreatedAtUnixMs = artifact.CreatedAtUnixMs;
            TopologyFingerprint = artifact.Topology.Value;
            VertexCount = artifact.Vertices.Count;
            TriangleIndexCount = artifact.TriangleIndices.Count;
            UvCount = artifact.Uvs.Count;
            TrueDepthHardware = artifact.TrueDepthHardware;
        }

        public string SchemaVersion => GoldenMaskContract.SchemaVersion;
        public string LocalUri { get; }
        public long ByteSize { get; }
        public string CaptureId { get; }
        public long CreatedAtUnixMs { get; }
        public string TopologyFingerprint { get; }
        public int VertexCount { get; }
        public int TriangleIndexCount { get; }
        public int UvCount { get; }
        public bool TrueDepthHardware { get; }

        public string ToJson()
        {
            StringBuilder json = new StringBuilder(384);
            json.Append('{');
            json.Append("\"schemaVersion\":").Append(Quote(SchemaVersion));
            json.Append(",\"uri\":").Append(Quote(LocalUri));
            json.Append(",\"byteSize\":").Append(
                ByteSize.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"captureId\":").Append(Quote(CaptureId));
            json.Append(",\"createdAtUnixMs\":").Append(
                CreatedAtUnixMs.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"topologyFingerprint\":").Append(
                Quote(TopologyFingerprint));
            json.Append(",\"vertexCount\":").Append(
                VertexCount.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"triangleIndexCount\":").Append(
                TriangleIndexCount.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"uvCount\":").Append(
                UvCount.ToString(CultureInfo.InvariantCulture));
            json.Append(",\"trueDepthHardware\":").Append(
                TrueDepthHardware ? "true" : "false");
            json.Append('}');
            return json.ToString();
        }

        private static string Quote(string value)
        {
            if (value == null)
            {
                return "null";
            }

            StringBuilder escaped = new StringBuilder(value.Length + 2);
            escaped.Append('"');
            foreach (char character in value)
            {
                switch (character)
                {
                    case '"':
                        escaped.Append("\\\"");
                        break;
                    case '\\':
                        escaped.Append("\\\\");
                        break;
                    case '\n':
                        escaped.Append("\\n");
                        break;
                    case '\r':
                        escaped.Append("\\r");
                        break;
                    case '\t':
                        escaped.Append("\\t");
                        break;
                    default:
                        if (character < 0x20)
                        {
                            escaped.Append("\\u")
                                .Append(((int)character).ToString("x4"));
                        }
                        else
                        {
                            escaped.Append(character);
                        }
                        break;
                }
            }
            escaped.Append('"');
            return escaped.ToString();
        }
    }

    public static class GoldenMaskArtifactSerializer
    {
        private const int ChecksumBytes = 32;

        public static bool TryCreate(
            Face3DMeshSnapshot snapshot,
            string captureId,
            bool trueDepthHardware,
            bool depthDataObserved,
            bool faceTrackingSupported,
            string deviceModel,
            out GoldenMaskArtifact artifact,
            out string reason)
        {
            artifact = null;
            if (snapshot == null)
            {
                reason = "golden_mask_snapshot_missing";
                return false;
            }
            if (string.IsNullOrWhiteSpace(captureId) || captureId.Length > 200)
            {
                reason = "golden_mask_capture_id_invalid";
                return false;
            }
            if (!trueDepthHardware || !faceTrackingSupported)
            {
                reason = "golden_mask_truedepth_unavailable";
                return false;
            }
            if (snapshot.Vertices.Count <= 0
                || snapshot.Vertices.Count > GoldenMaskContract.MaximumVertexCount)
            {
                reason = "golden_mask_vertex_count_invalid";
                return false;
            }
            if (snapshot.TriangleIndices.Count <= 0
                || snapshot.TriangleIndices.Count
                    > GoldenMaskContract.MaximumTriangleIndexCount
                || snapshot.TriangleIndices.Count % 3 != 0)
            {
                reason = "golden_mask_index_count_invalid";
                return false;
            }
            if (snapshot.Uvs.Count != snapshot.Vertices.Count)
            {
                reason = "golden_mask_uv_count_invalid";
                return false;
            }

            for (int index = 0; index < snapshot.Vertices.Count; index += 1)
            {
                if (!IsFinite(snapshot.Vertices[index])
                    || !IsFinite(snapshot.Uvs[index]))
                {
                    reason = "golden_mask_geometry_not_finite";
                    return false;
                }
            }
            for (int index = 0;
                index < snapshot.TriangleIndices.Count;
                index += 1)
            {
                int vertexIndex = snapshot.TriangleIndices[index];
                if (vertexIndex < 0
                    || vertexIndex >= snapshot.Vertices.Count)
                {
                    reason = "golden_mask_triangle_index_invalid";
                    return false;
                }
            }

            if (!Face3DTopologyFingerprint.TryCreate(
                    snapshot,
                    out Face3DTopologyFingerprint topology,
                    out string topologyReason))
            {
                reason = "golden_mask_" + topologyReason;
                return false;
            }

            artifact = new GoldenMaskArtifact(
                captureId.Trim(),
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                topology,
                snapshot.Vertices,
                snapshot.TriangleIndices,
                snapshot.Uvs,
                trueDepthHardware,
                depthDataObserved,
                faceTrackingSupported,
                deviceModel);
            reason = string.Empty;
            return true;
        }

        public static byte[] Serialize(GoldenMaskArtifact artifact)
        {
            if (artifact == null)
            {
                throw new ArgumentNullException(nameof(artifact));
            }

            byte[] payload;
            using (MemoryStream payloadStream = new MemoryStream())
            using (BinaryWriter writer = new BinaryWriter(
                payloadStream,
                Encoding.UTF8,
                true))
            {
                writer.Write(GoldenMaskContract.Magic);
                writer.Write(GoldenMaskContract.FormatVersion);
                writer.Write(GoldenMaskContract.SchemaVersion);
                writer.Write(artifact.CaptureId);
                writer.Write(artifact.CreatedAtUnixMs);
                writer.Write(artifact.Topology.Algorithm);
                writer.Write(artifact.Topology.IndicesHash);
                writer.Write(artifact.Topology.UvHash);
                writer.Write(artifact.Topology.Value);
                writer.Write(artifact.TrueDepthHardware);
                writer.Write(artifact.DepthDataObserved);
                writer.Write(artifact.FaceTrackingSupported);
                writer.Write(artifact.DeviceModel ?? string.Empty);
                writer.Write(artifact.Vertices.Count);
                writer.Write(artifact.TriangleIndices.Count);
                writer.Write(artifact.Uvs.Count);

                for (int index = 0; index < artifact.Vertices.Count; index += 1)
                {
                    Vector3 vertex = artifact.Vertices[index];
                    writer.Write(vertex.x);
                    writer.Write(vertex.y);
                    writer.Write(vertex.z);
                }
                for (int index = 0;
                    index < artifact.TriangleIndices.Count;
                    index += 1)
                {
                    writer.Write(artifact.TriangleIndices[index]);
                }
                for (int index = 0; index < artifact.Uvs.Count; index += 1)
                {
                    Vector2 uv = artifact.Uvs[index];
                    writer.Write(uv.x);
                    writer.Write(uv.y);
                }
                writer.Flush();
                payload = payloadStream.ToArray();
            }

            byte[] checksum;
            using (SHA256 sha256 = SHA256.Create())
            {
                checksum = sha256.ComputeHash(payload);
            }
            byte[] result = new byte[payload.Length + checksum.Length];
            Buffer.BlockCopy(payload, 0, result, 0, payload.Length);
            Buffer.BlockCopy(
                checksum,
                0,
                result,
                payload.Length,
                checksum.Length);
            if (result.Length > GoldenMaskContract.MaximumArtifactBytes)
            {
                throw new InvalidDataException(
                    "Golden Mask artifact exceeds its size limit.");
            }
            return result;
        }

        public static bool TryDeserialize(
            byte[] bytes,
            out GoldenMaskArtifact artifact,
            out string reason)
        {
            artifact = null;
            if (bytes == null
                || bytes.Length <= GoldenMaskContract.Magic.Length
                    + sizeof(int)
                    + ChecksumBytes
                || bytes.Length > GoldenMaskContract.MaximumArtifactBytes)
            {
                reason = "golden_mask_file_size_invalid";
                return false;
            }

            int payloadLength = bytes.Length - ChecksumBytes;
            byte[] expectedChecksum = new byte[ChecksumBytes];
            Buffer.BlockCopy(
                bytes,
                payloadLength,
                expectedChecksum,
                0,
                ChecksumBytes);
            byte[] actualChecksum;
            using (SHA256 sha256 = SHA256.Create())
            {
                actualChecksum = sha256.ComputeHash(bytes, 0, payloadLength);
            }
            if (!ConstantTimeEquals(expectedChecksum, actualChecksum))
            {
                reason = "golden_mask_checksum_mismatch";
                return false;
            }

            try
            {
                using (MemoryStream stream = new MemoryStream(
                    bytes,
                    0,
                    payloadLength,
                    false))
                using (BinaryReader reader = new BinaryReader(
                    stream,
                    Encoding.UTF8,
                    true))
                {
                    byte[] magic = reader.ReadBytes(
                        GoldenMaskContract.Magic.Length);
                    if (!BytesEqual(magic, GoldenMaskContract.Magic))
                    {
                        reason = "golden_mask_magic_invalid";
                        return false;
                    }
                    if (reader.ReadInt32() != GoldenMaskContract.FormatVersion
                        || reader.ReadString()
                            != GoldenMaskContract.SchemaVersion)
                    {
                        reason = "golden_mask_schema_unsupported";
                        return false;
                    }

                    string captureId = reader.ReadString();
                    long createdAtUnixMs = reader.ReadInt64();
                    Face3DTopologyFingerprintData topologyData =
                        new Face3DTopologyFingerprintData
                        {
                            algorithm = reader.ReadString(),
                            indicesHash = reader.ReadString(),
                            uvHash = reader.ReadString(),
                            fingerprint = reader.ReadString()
                        };
                    bool trueDepthHardware = reader.ReadBoolean();
                    bool depthDataObserved = reader.ReadBoolean();
                    bool faceTrackingSupported = reader.ReadBoolean();
                    if (!trueDepthHardware || !faceTrackingSupported)
                    {
                        reason = "golden_mask_truedepth_unavailable";
                        return false;
                    }
                    string deviceModel = reader.ReadString();
                    topologyData.vertexCount = reader.ReadInt32();
                    topologyData.indexCount = reader.ReadInt32();
                    topologyData.uvCount = reader.ReadInt32();

                    if (!ValidateCounts(topologyData, out reason))
                    {
                        return false;
                    }

                    Vector3[] vertices =
                        new Vector3[topologyData.vertexCount];
                    int[] indices =
                        new int[topologyData.indexCount];
                    Vector2[] uvs =
                        new Vector2[topologyData.uvCount];
                    for (int index = 0; index < vertices.Length; index += 1)
                    {
                        vertices[index] = new Vector3(
                            reader.ReadSingle(),
                            reader.ReadSingle(),
                            reader.ReadSingle());
                        if (!IsFinite(vertices[index]))
                        {
                            reason = "golden_mask_vertex_not_finite";
                            return false;
                        }
                    }
                    for (int index = 0; index < indices.Length; index += 1)
                    {
                        indices[index] = reader.ReadInt32();
                        if (indices[index] < 0
                            || indices[index] >= vertices.Length)
                        {
                            reason = "golden_mask_triangle_index_invalid";
                            return false;
                        }
                    }
                    for (int index = 0; index < uvs.Length; index += 1)
                    {
                        uvs[index] = new Vector2(
                            reader.ReadSingle(),
                            reader.ReadSingle());
                        if (!IsFinite(uvs[index]))
                        {
                            reason = "golden_mask_uv_not_finite";
                            return false;
                        }
                    }
                    if (stream.Position != payloadLength)
                    {
                        reason = "golden_mask_trailing_payload";
                        return false;
                    }

                    if (!Face3DTopologyFingerprint.TryFromData(
                            topologyData,
                            out Face3DTopologyFingerprint topology,
                            out string topologyReason))
                    {
                        reason = "golden_mask_" + topologyReason;
                        return false;
                    }

                    Face3DMeshSnapshot snapshot =
                        new Face3DMeshSnapshot(
                            vertices,
                            indices,
                            uvs,
                            0.0);
                    if (!Face3DTopologyFingerprint.TryCreate(
                            snapshot,
                            out Face3DTopologyFingerprint actualTopology,
                            out string actualTopologyReason)
                        || !actualTopology.Equals(topology))
                    {
                        reason = "golden_mask_topology_"
                            + (string.IsNullOrEmpty(actualTopologyReason)
                                ? "mismatch"
                                : actualTopologyReason);
                        return false;
                    }

                    artifact = new GoldenMaskArtifact(
                        captureId,
                        createdAtUnixMs,
                        topology,
                        vertices,
                        indices,
                        uvs,
                        trueDepthHardware,
                        depthDataObserved,
                        faceTrackingSupported,
                        deviceModel);
                    reason = string.Empty;
                    return true;
                }
            }
            catch (Exception exception)
                when (exception is EndOfStreamException
                    || exception is IOException
                    || exception is ArgumentException
                    || exception is DecoderFallbackException
                    || exception is FormatException
                    || exception is OverflowException)
            {
                reason = "golden_mask_payload_invalid";
                return false;
            }
        }

        private static bool ValidateCounts(
            Face3DTopologyFingerprintData topology,
            out string reason)
        {
            if (topology.vertexCount <= 0
                || topology.vertexCount
                    > GoldenMaskContract.MaximumVertexCount
                || topology.indexCount <= 0
                || topology.indexCount
                    > GoldenMaskContract.MaximumTriangleIndexCount
                || topology.indexCount % 3 != 0
                || topology.uvCount != topology.vertexCount)
            {
                reason = "golden_mask_topology_counts_invalid";
                return false;
            }
            reason = string.Empty;
            return true;
        }

        private static bool ConstantTimeEquals(byte[] left, byte[] right)
        {
            if (left == null
                || right == null
                || left.Length != right.Length)
            {
                return false;
            }
            int difference = 0;
            for (int index = 0; index < left.Length; index += 1)
            {
                difference |= left[index] ^ right[index];
            }
            return difference == 0;
        }

        private static bool BytesEqual(byte[] left, byte[] right)
        {
            if (left == null
                || right == null
                || left.Length != right.Length)
            {
                return false;
            }
            for (int index = 0; index < left.Length; index += 1)
            {
                if (left[index] != right[index])
                {
                    return false;
                }
            }
            return true;
        }

        private static bool IsFinite(Vector3 value)
        {
            return IsFinite(value.x)
                && IsFinite(value.y)
                && IsFinite(value.z);
        }

        private static bool IsFinite(Vector2 value)
        {
            return IsFinite(value.x) && IsFinite(value.y);
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }

    public static class GoldenMaskArtifactStore
    {
        private const string RootDirectoryName = "golden-mask";
        private const string PendingDirectoryName = "pending";
        private const int MaximumPendingArtifactCount = 4;
        private static readonly TimeSpan MaximumPendingArtifactAge =
            TimeSpan.FromHours(24.0);

        public static bool TryPersist(
            Face3DMeshSnapshot snapshot,
            string captureId,
            bool trueDepthHardware,
            bool depthDataObserved,
            bool faceTrackingSupported,
            string deviceModel,
            out GoldenMaskArtifactDescriptor descriptor,
            out string reason)
        {
            descriptor = null;
            if (!GoldenMaskArtifactSerializer.TryCreate(
                    snapshot,
                    captureId,
                    trueDepthHardware,
                    depthDataObserved,
                    faceTrackingSupported,
                    deviceModel,
                    out GoldenMaskArtifact artifact,
                    out reason))
            {
                return false;
            }

            try
            {
                byte[] bytes =
                    GoldenMaskArtifactSerializer.Serialize(artifact);
                string directory = Path.Combine(
                    Application.persistentDataPath,
                    RootDirectoryName,
                    PendingDirectoryName);
                Directory.CreateDirectory(directory);
                string fileName = SanitizeFileStem(captureId)
                    + GoldenMaskContract.FileExtension;
                string path = Path.Combine(directory, fileName);
                File.WriteAllBytes(path, bytes);
#if UNITY_IOS && !UNITY_EDITOR
                UnityEngine.iOS.Device.SetNoBackupFlag(path);
#endif
                descriptor = new GoldenMaskArtifactDescriptor(
                    new Uri(path).AbsoluteUri,
                    bytes.LongLength,
                    artifact);
                PrunePendingArtifacts();
                reason = string.Empty;
                return true;
            }
            catch (Exception exception)
                when (exception is IOException
                    || exception is UnauthorizedAccessException
                    || exception is InvalidDataException
                    || exception is UriFormatException)
            {
                reason = "golden_mask_file_write_failed";
                return false;
            }
        }

        public static void PrunePendingArtifacts()
        {
            try
            {
                string directory = Path.Combine(
                    Application.persistentDataPath,
                    RootDirectoryName,
                    PendingDirectoryName);
                DirectoryInfo directoryInfo =
                    new DirectoryInfo(directory);
                if (!directoryInfo.Exists)
                {
                    return;
                }

                List<FileInfo> files = new List<FileInfo>(
                    directoryInfo.GetFiles(
                        "*" + GoldenMaskContract.FileExtension,
                        SearchOption.TopDirectoryOnly));
                files.Sort((left, right) =>
                    right.LastWriteTimeUtc.CompareTo(
                        left.LastWriteTimeUtc));
                DateTime cutoff =
                    DateTime.UtcNow - MaximumPendingArtifactAge;
                for (int index = 0; index < files.Count; index += 1)
                {
                    FileInfo file = files[index];
                    if (index < MaximumPendingArtifactCount
                        && file.LastWriteTimeUtc >= cutoff)
                    {
                        continue;
                    }
                    try
                    {
                        file.Delete();
                    }
                    catch (Exception exception)
                        when (exception is IOException
                            || exception
                                is UnauthorizedAccessException)
                    {
                        // Cleanup is best-effort and must never affect face
                        // capture completion.
                    }
                }
            }
            catch (Exception exception)
                when (exception is IOException
                    || exception is UnauthorizedAccessException
                    || exception is ArgumentException
                    || exception is NotSupportedException)
            {
                // The next launch/capture retries cleanup.
            }
        }

        public static bool TryLoad(
            string uriOrPath,
            out GoldenMaskArtifact artifact,
            out string reason)
        {
            artifact = null;
            if (!TryResolvePath(uriOrPath, out string path))
            {
                reason = "golden_mask_uri_invalid";
                return false;
            }
            try
            {
                FileInfo info = new FileInfo(path);
                if (!info.Exists
                    || info.Length <= 0
                    || info.Length
                        > GoldenMaskContract.MaximumArtifactBytes)
                {
                    reason = "golden_mask_file_size_invalid";
                    return false;
                }
                return GoldenMaskArtifactSerializer.TryDeserialize(
                    File.ReadAllBytes(path),
                    out artifact,
                    out reason);
            }
            catch (Exception exception)
                when (exception is IOException
                    || exception is UnauthorizedAccessException
                    || exception is ArgumentException
                    || exception is NotSupportedException)
            {
                reason = "golden_mask_file_read_failed";
                return false;
            }
        }

        private static bool TryResolvePath(
            string uriOrPath,
            out string path)
        {
            path = null;
            if (string.IsNullOrWhiteSpace(uriOrPath))
            {
                return false;
            }
            string trimmed = uriOrPath.Trim();
            if (Uri.TryCreate(trimmed, UriKind.Absolute, out Uri uri)
                && uri.IsFile)
            {
                path = uri.LocalPath;
                return !string.IsNullOrWhiteSpace(path);
            }
            if (Path.IsPathRooted(trimmed))
            {
                path = trimmed;
                return true;
            }
            return false;
        }

        private static string SanitizeFileStem(string value)
        {
            StringBuilder result = new StringBuilder(
                Math.Min(value?.Length ?? 0, 120));
            foreach (char character in value ?? string.Empty)
            {
                if (result.Length >= 120)
                {
                    break;
                }
                if ((character >= 'a' && character <= 'z')
                    || (character >= 'A' && character <= 'Z')
                    || (character >= '0' && character <= '9')
                    || character == '-'
                    || character == '_')
                {
                    result.Append(character);
                }
            }
            return result.Length > 0
                ? result.ToString()
                : Guid.NewGuid().ToString("N");
        }
    }
}
