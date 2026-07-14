using System;
using System.Collections.Generic;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Aura.Face3D
{
    [Serializable]
    public sealed class Face3DTopologyFingerprintData
    {
        public string algorithm;
        public int vertexCount;
        public int indexCount;
        public int uvCount;
        public string indicesHash;
        public string uvHash;
        public string fingerprint;
    }

    /// <summary>
    /// Identity of an ARKit face-mesh topology. Vertex positions are deliberately excluded:
    /// they deform every frame, while triangle indices and UV layout identify the topology.
    /// </summary>
    public sealed class Face3DTopologyFingerprint : IEquatable<Face3DTopologyFingerprint>
    {
        public const string HashAlgorithm = "sha256-le-v1";

        private Face3DTopologyFingerprint(
            int vertexCount,
            int indexCount,
            int uvCount,
            string indicesHash,
            string uvHash,
            string value)
        {
            Algorithm = HashAlgorithm;
            VertexCount = vertexCount;
            IndexCount = indexCount;
            UvCount = uvCount;
            IndicesHash = indicesHash;
            UvHash = uvHash;
            Value = value;
        }

        public string Algorithm { get; private set; }
        public int VertexCount { get; private set; }
        public int IndexCount { get; private set; }
        public int UvCount { get; private set; }
        public string IndicesHash { get; private set; }
        public string UvHash { get; private set; }
        public string Value { get; private set; }

        public static bool TryCreate(
            Face3DMeshSnapshot snapshot,
            out Face3DTopologyFingerprint fingerprint,
            out string reason)
        {
            fingerprint = null;
            if (!TryValidateSnapshotTopology(snapshot, out reason))
            {
                return false;
            }

            string indicesHash = HashIndices(snapshot.TriangleIndices);
            string uvHash = HashUvs(snapshot.Uvs);
            string composite = string.Join(
                "|",
                HashAlgorithm,
                Face3DContract.Source,
                snapshot.Vertices.Count.ToString(CultureInfo.InvariantCulture),
                snapshot.TriangleIndices.Count.ToString(CultureInfo.InvariantCulture),
                snapshot.Uvs.Count.ToString(CultureInfo.InvariantCulture),
                indicesHash,
                uvHash);
            string value = HashBytes(Encoding.UTF8.GetBytes(composite));

            fingerprint = new Face3DTopologyFingerprint(
                snapshot.Vertices.Count,
                snapshot.TriangleIndices.Count,
                snapshot.Uvs.Count,
                indicesHash,
                uvHash,
                value);
            reason = string.Empty;
            return true;
        }

        public static bool TryFromData(
            Face3DTopologyFingerprintData data,
            out Face3DTopologyFingerprint fingerprint,
            out string reason)
        {
            fingerprint = null;
            if (data == null)
            {
                reason = "semantic_map_topology_missing";
                return false;
            }

            if (!string.Equals(data.algorithm, HashAlgorithm, StringComparison.Ordinal))
            {
                reason = "semantic_map_hash_algorithm_unsupported";
                return false;
            }

            if (data.vertexCount <= 0 || data.indexCount <= 0 || data.uvCount <= 0)
            {
                reason = "semantic_map_topology_counts_invalid";
                return false;
            }

            if (data.indexCount % 3 != 0 || data.uvCount != data.vertexCount)
            {
                reason = "semantic_map_topology_shape_invalid";
                return false;
            }

            if (!IsSha256(data.indicesHash)
                || !IsSha256(data.uvHash)
                || !IsSha256(data.fingerprint))
            {
                reason = "semantic_map_topology_hash_invalid";
                return false;
            }

            string composite = string.Join(
                "|",
                HashAlgorithm,
                Face3DContract.Source,
                data.vertexCount.ToString(CultureInfo.InvariantCulture),
                data.indexCount.ToString(CultureInfo.InvariantCulture),
                data.uvCount.ToString(CultureInfo.InvariantCulture),
                data.indicesHash.ToLowerInvariant(),
                data.uvHash.ToLowerInvariant());
            string expectedValue = HashBytes(Encoding.UTF8.GetBytes(composite));
            if (!string.Equals(expectedValue, data.fingerprint, StringComparison.OrdinalIgnoreCase))
            {
                reason = "semantic_map_topology_fingerprint_inconsistent";
                return false;
            }

            fingerprint = new Face3DTopologyFingerprint(
                data.vertexCount,
                data.indexCount,
                data.uvCount,
                data.indicesHash.ToLowerInvariant(),
                data.uvHash.ToLowerInvariant(),
                data.fingerprint.ToLowerInvariant());
            reason = string.Empty;
            return true;
        }

        public Face3DTopologyFingerprintData ToData()
        {
            return new Face3DTopologyFingerprintData
            {
                algorithm = Algorithm,
                vertexCount = VertexCount,
                indexCount = IndexCount,
                uvCount = UvCount,
                indicesHash = IndicesHash,
                uvHash = UvHash,
                fingerprint = Value
            };
        }

        public bool Equals(Face3DTopologyFingerprint other)
        {
            if (ReferenceEquals(other, null))
            {
                return false;
            }

            return VertexCount == other.VertexCount
                && IndexCount == other.IndexCount
                && UvCount == other.UvCount
                && string.Equals(Algorithm, other.Algorithm, StringComparison.Ordinal)
                && string.Equals(IndicesHash, other.IndicesHash, StringComparison.Ordinal)
                && string.Equals(UvHash, other.UvHash, StringComparison.Ordinal)
                && string.Equals(Value, other.Value, StringComparison.Ordinal);
        }

        public override bool Equals(object obj)
        {
            return Equals(obj as Face3DTopologyFingerprint);
        }

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = 17;
                hash = (hash * 31) + VertexCount;
                hash = (hash * 31) + IndexCount;
                hash = (hash * 31) + UvCount;
                hash = (hash * 31) + (Value == null ? 0 : Value.GetHashCode());
                return hash;
            }
        }

        public override string ToString()
        {
            return Value;
        }

        private static bool TryValidateSnapshotTopology(
            Face3DMeshSnapshot snapshot,
            out string reason)
        {
            if (snapshot == null)
            {
                reason = "mesh_snapshot_missing";
                return false;
            }

            if (snapshot.Vertices.Count <= 0)
            {
                reason = "mesh_vertices_missing";
                return false;
            }

            if (snapshot.TriangleIndices.Count <= 0 || snapshot.TriangleIndices.Count % 3 != 0)
            {
                reason = "mesh_triangle_indices_invalid";
                return false;
            }

            if (snapshot.Uvs.Count != snapshot.Vertices.Count)
            {
                reason = "mesh_uv_layout_invalid";
                return false;
            }

            for (int index = 0; index < snapshot.TriangleIndices.Count; index += 1)
            {
                int vertexIndex = snapshot.TriangleIndices[index];
                if (vertexIndex < 0 || vertexIndex >= snapshot.Vertices.Count)
                {
                    reason = "mesh_triangle_index_out_of_range";
                    return false;
                }
            }

            for (int index = 0; index < snapshot.Uvs.Count; index += 1)
            {
                if (!Face3DNumeric.IsFinite(snapshot.Uvs[index]))
                {
                    reason = "mesh_uv_not_finite";
                    return false;
                }
            }

            reason = string.Empty;
            return true;
        }

        private static string HashIndices(IReadOnlyList<int> indices)
        {
            List<byte> bytes = new List<byte>(4 + (indices.Count * 4));
            AppendInt32LittleEndian(bytes, indices.Count);
            for (int index = 0; index < indices.Count; index += 1)
            {
                AppendInt32LittleEndian(bytes, indices[index]);
            }

            return HashBytes(bytes.ToArray());
        }

        private static string HashUvs(IReadOnlyList<UnityEngine.Vector2> uvs)
        {
            List<byte> bytes = new List<byte>(4 + (uvs.Count * 8));
            AppendInt32LittleEndian(bytes, uvs.Count);
            for (int index = 0; index < uvs.Count; index += 1)
            {
                AppendSingleLittleEndian(bytes, uvs[index].x);
                AppendSingleLittleEndian(bytes, uvs[index].y);
            }

            return HashBytes(bytes.ToArray());
        }

        private static void AppendSingleLittleEndian(List<byte> bytes, float value)
        {
            float normalizedValue = value == 0.0f ? 0.0f : value;
            byte[] floatBytes = BitConverter.GetBytes(normalizedValue);
            int bits = BitConverter.ToInt32(floatBytes, 0);
            AppendInt32LittleEndian(bytes, bits);
        }

        private static void AppendInt32LittleEndian(List<byte> bytes, int value)
        {
            unchecked
            {
                bytes.Add((byte)value);
                bytes.Add((byte)(value >> 8));
                bytes.Add((byte)(value >> 16));
                bytes.Add((byte)(value >> 24));
            }
        }

        private static string HashBytes(byte[] bytes)
        {
            using (SHA256 sha256 = SHA256.Create())
            {
                return ToLowerHex(sha256.ComputeHash(bytes));
            }
        }

        private static string ToLowerHex(byte[] bytes)
        {
            char[] characters = new char[bytes.Length * 2];
            const string Hex = "0123456789abcdef";
            for (int index = 0; index < bytes.Length; index += 1)
            {
                characters[index * 2] = Hex[bytes[index] >> 4];
                characters[(index * 2) + 1] = Hex[bytes[index] & 0x0f];
            }

            return new string(characters);
        }

        private static bool IsSha256(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length != 64)
            {
                return false;
            }

            for (int index = 0; index < value.Length; index += 1)
            {
                char character = value[index];
                bool decimalDigit = character >= '0' && character <= '9';
                bool lowerHex = character >= 'a' && character <= 'f';
                bool upperHex = character >= 'A' && character <= 'F';
                if (!decimalDigit && !lowerHex && !upperHex)
                {
                    return false;
                }
            }

            return true;
        }
    }
}
