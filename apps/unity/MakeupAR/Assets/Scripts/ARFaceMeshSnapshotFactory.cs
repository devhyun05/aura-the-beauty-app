using Aura.Face3D;
using UnityEngine;
using UnityEngine.XR.ARFoundation;

/// <summary>
/// Single ARFoundation adapter for copying ARFace NativeArrays into the immutable
/// Aura.Face3D core snapshot. The supplied timestamp is a caller-owned observation
/// time; this factory does not claim it is an ARKit ARFrame native timestamp.
/// </summary>
public static class ARFaceMeshSnapshotFactory
{
    public static bool TryCreate(
        ARFace face,
        double observedTimestampSeconds,
        out Face3DMeshSnapshot snapshot,
        out string reason)
    {
        snapshot = null;
        if (face == null
            || !face.vertices.IsCreated
            || !face.indices.IsCreated
            || !face.uvs.IsCreated)
        {
            reason = "face_mesh_not_ready";
            return false;
        }

        Vector3[] vertices = new Vector3[face.vertices.Length];
        int[] indices = new int[face.indices.Length];
        Vector2[] uvs = new Vector2[face.uvs.Length];
        for (int index = 0; index < vertices.Length; index += 1)
        {
            vertices[index] = face.vertices[index];
        }
        for (int index = 0; index < indices.Length; index += 1)
        {
            indices[index] = face.indices[index];
        }
        for (int index = 0; index < uvs.Length; index += 1)
        {
            uvs[index] = face.uvs[index];
        }

        snapshot = new Face3DMeshSnapshot(
            vertices,
            indices,
            uvs,
            observedTimestampSeconds);
        reason = string.Empty;
        return true;
    }

    public static bool TryCreateTopologyFingerprint(
        ARFace face,
        out Face3DTopologyFingerprintData topology,
        out string reason)
    {
        topology = null;
        if (!TryCreate(face, 0.0, out Face3DMeshSnapshot snapshot, out reason)
            || !Face3DTopologyFingerprint.TryCreate(
                snapshot,
                out Face3DTopologyFingerprint fingerprint,
                out reason))
        {
            return false;
        }

        topology = fingerprint.ToData();
        reason = string.Empty;
        return true;
    }
}
