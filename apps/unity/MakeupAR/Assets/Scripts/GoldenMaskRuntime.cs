using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Aura.Face3D;
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// Renders the immutable TrueDepth face mesh as a private, non-measurement
/// presentation object. Geometry is never smoothed, mirrored, or completed;
/// the inset backing disk only makes eye and mouth openings read as marble.
/// </summary>
public sealed class GoldenMaskRuntime : MonoBehaviour
{
    private const int FallbackGoldenMaskLayer = 31;
    private const string GoldenMaskLayerName = "GoldenMask";
    private const float MaximumYaw = 38.0f;
    private const float MaximumPitch = 15.0f;
    private const float IdleDelaySeconds = 1.4f;
    private const int BackingSegmentCount = 64;

    [Serializable]
    private sealed class LoadRequest
    {
        public string requestId;
        public string fileUri;
    }

    [Serializable]
    private sealed class RotationRequest
    {
        public string requestId;
        public float yaw;
        public float pitch;
    }

    [Serializable]
    private sealed class Request
    {
        public string requestId;
    }

    private RNBridge bridge;
    private Camera presentationCamera;
    private GameObject presentationRoot;
    private Mesh faceMesh;
    private Mesh backingMesh;
    private Material marbleMaterial;
    private int presentationLayer = FallbackGoldenMaskLayer;
    private string runtimeMode = "live";
    private string activeRequestId = string.Empty;
    private bool hasArtifact;
    private float requestedYaw;
    private float requestedPitch;
    private float lastInteractionAt;
    private readonly Dictionary<Camera, int> excludedCameraMasks =
        new Dictionary<Camera, int>();

    public void Configure(RNBridge owner)
    {
        bridge = owner;
        presentationLayer = ResolvePresentationLayer();
        EnsurePresentationCamera();
        ApplyVisibility();
    }

    public void SetRuntimeMode(string mode)
    {
        runtimeMode = string.Equals(mode, "still", StringComparison.Ordinal)
            ? "still"
            : string.Equals(mode, "live", StringComparison.Ordinal)
                ? "live"
                : "idle";
        ApplyVisibility();
    }

    public void LoadJson(string json)
    {
        LoadRequest request;
        try
        {
            request = JsonUtility.FromJson<LoadRequest>(json ?? string.Empty);
        }
        catch (Exception)
        {
            SendFailure(string.Empty, "golden_mask_request_invalid");
            return;
        }

        string requestId = NormalizeRequestId(request?.requestId);
        if (request == null
            || string.IsNullOrWhiteSpace(requestId)
            || string.IsNullOrWhiteSpace(request.fileUri))
        {
            SendFailure(requestId, "golden_mask_request_invalid");
            return;
        }

        // A new correlated request owns the presentation immediately. Never
        // retain a previous report's biometric mesh when replacement loading
        // fails.
        ClearPresentation();
        if (!GoldenMaskArtifactStore.TryLoad(
                request.fileUri,
                out GoldenMaskArtifact artifact,
                out string reason))
        {
            SendFailure(requestId, reason);
            return;
        }

        try
        {
            BuildPresentation(artifact);
            activeRequestId = requestId;
            hasArtifact = true;
            requestedYaw = 0.0f;
            requestedPitch = 0.0f;
            lastInteractionAt = Time.unscaledTime;
            ApplyVisibility();
            SendReady(requestId, artifact);
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[GoldenMask] presentation build failed: "
                + exception.GetType().Name);
            ClearPresentation();
            SendFailure(requestId, "golden_mask_render_failed");
        }
    }

    public void SetRotationJson(string json)
    {
        RotationRequest request;
        try
        {
            request = JsonUtility.FromJson<RotationRequest>(
                json ?? string.Empty);
        }
        catch (Exception)
        {
            return;
        }
        if (request == null
            || !MatchesActiveRequest(request.requestId)
            || !IsFinite(request.yaw)
            || !IsFinite(request.pitch))
        {
            return;
        }
        requestedYaw = Mathf.Clamp(
            request.yaw,
            -MaximumYaw,
            MaximumYaw);
        requestedPitch = Mathf.Clamp(
            request.pitch,
            -MaximumPitch,
            MaximumPitch);
        lastInteractionAt = Time.unscaledTime;
    }

    public void ResetViewJson(string json)
    {
        Request request = ParseRequest(json);
        if (request == null || !MatchesActiveRequest(request.requestId))
        {
            return;
        }
        requestedYaw = 0.0f;
        requestedPitch = 0.0f;
        lastInteractionAt = Time.unscaledTime;
    }

    public void UnloadJson(string json)
    {
        Request request = ParseRequest(json);
        if (request != null
            && !string.IsNullOrWhiteSpace(request.requestId)
            && !MatchesActiveRequest(request.requestId))
        {
            return;
        }
        ClearPresentation();
    }

    public void CapturePosterJson(string json)
    {
        Request request = ParseRequest(json);
        if (request == null
            || !MatchesActiveRequest(request.requestId)
            || !hasArtifact
            || presentationCamera == null)
        {
            SendPosterFailure(
                request?.requestId,
                "golden_mask_not_loaded");
            return;
        }

        RenderTexture renderTexture = null;
        Texture2D texture = null;
        RenderTexture previousActive = RenderTexture.active;
        RenderTexture previousTarget = presentationCamera.targetTexture;
        float previousAspect = presentationCamera.aspect;
        try
        {
            const int width = 1024;
            const int height = 1280;
            renderTexture = RenderTexture.GetTemporary(
                width,
                height,
                24,
                RenderTextureFormat.ARGB32);
            presentationCamera.targetTexture = renderTexture;
            presentationCamera.aspect = (float)width / height;
            presentationCamera.Render();
            RenderTexture.active = renderTexture;
            texture = new Texture2D(
                width,
                height,
                TextureFormat.RGB24,
                false);
            texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
            texture.Apply(false, false);

            string directory = Path.Combine(
                Application.temporaryCachePath,
                "golden-mask",
                "posters");
            Directory.CreateDirectory(directory);
            string path = Path.Combine(
                directory,
                SanitizeFileStem(activeRequestId) + ".png");
            File.WriteAllBytes(path, texture.EncodeToPNG());
            Uri fileUri = new Uri(path);
            SendEvent(
                "{\"type\":\"golden_mask_poster_ready\""
                + ",\"requestId\":"
                + Quote(activeRequestId)
                + ",\"fileUri\":"
                + Quote(fileUri.AbsoluteUri)
                + ",\"width\":1024,\"height\":1280}");
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[GoldenMask] poster capture failed: "
                + exception.GetType().Name);
            SendPosterFailure(
                activeRequestId,
                "golden_mask_poster_failed");
        }
        finally
        {
            presentationCamera.targetTexture = previousTarget;
            presentationCamera.aspect = previousAspect;
            RenderTexture.active = previousActive;
            if (renderTexture != null)
            {
                RenderTexture.ReleaseTemporary(renderTexture);
            }
            if (texture != null)
            {
                Destroy(texture);
            }
            FrameCamera();
        }
    }

    private void Update()
    {
        if (presentationRoot == null || !presentationRoot.activeSelf)
        {
            return;
        }
        float idleYaw = Time.unscaledTime - lastInteractionAt
            >= IdleDelaySeconds
                ? Mathf.Sin(Time.unscaledTime * 0.42f) * 6.0f
                : 0.0f;
        Quaternion target = Quaternion.Euler(
            requestedPitch,
            requestedYaw + idleYaw,
            0.0f);
        presentationRoot.transform.localRotation = Quaternion.Slerp(
            presentationRoot.transform.localRotation,
            target,
            1.0f - Mathf.Exp(-Time.unscaledDeltaTime * 8.0f));
    }

    private void OnDestroy()
    {
        ClearPresentation();
        if (presentationCamera != null)
        {
            Destroy(presentationCamera.gameObject);
            presentationCamera = null;
        }
        if (marbleMaterial != null)
        {
            Destroy(marbleMaterial);
            marbleMaterial = null;
        }
    }

    private void BuildPresentation(GoldenMaskArtifact artifact)
    {
        ClearPresentation();
        EnsurePresentationCamera();
        EnsureMaterial();

        Vector3 center = CalculateCenter(artifact.Vertices);
        Vector3[] vertices = new Vector3[artifact.Vertices.Count];
        for (int index = 0; index < vertices.Length; index += 1)
        {
            vertices[index] = artifact.Vertices[index] - center;
        }
        int[] indices = Copy(artifact.TriangleIndices);
        Vector2[] uvs = Copy(artifact.Uvs);

        faceMesh = new Mesh
        {
            name = "Golden Mask TrueDepth Mesh",
            indexFormat = vertices.Length > ushort.MaxValue
                ? IndexFormat.UInt32
                : IndexFormat.UInt16
        };
        faceMesh.vertices = vertices;
        faceMesh.triangles = indices;
        faceMesh.uv = uvs;
        faceMesh.RecalculateNormals();
        faceMesh.RecalculateBounds();

        presentationRoot = new GameObject("Golden Mask Presentation");
        presentationRoot.layer = presentationLayer;
        presentationRoot.transform.SetParent(transform, false);

        GameObject face = new GameObject("Measured Face Mesh");
        face.layer = presentationLayer;
        face.transform.SetParent(presentationRoot.transform, false);
        MeshFilter filter = face.AddComponent<MeshFilter>();
        filter.sharedMesh = faceMesh;
        MeshRenderer renderer = face.AddComponent<MeshRenderer>();
        renderer.sharedMaterial = marbleMaterial;
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = false;

        Bounds bounds = faceMesh.bounds;
        backingMesh = CreateBackingMesh(bounds);
        GameObject backing = new GameObject(
            "Non-measurement Eye And Mouth Backing");
        backing.layer = presentationLayer;
        backing.transform.SetParent(presentationRoot.transform, false);
        MeshFilter backingFilter = backing.AddComponent<MeshFilter>();
        backingFilter.sharedMesh = backingMesh;
        MeshRenderer backingRenderer =
            backing.AddComponent<MeshRenderer>();
        backingRenderer.sharedMaterial = marbleMaterial;
        backingRenderer.shadowCastingMode = ShadowCastingMode.Off;
        backingRenderer.receiveShadows = false;

        FrameCamera();
    }

    private void EnsurePresentationCamera()
    {
        if (presentationCamera != null)
        {
            presentationCamera.gameObject.layer = presentationLayer;
            presentationCamera.cullingMask = 1 << presentationLayer;
            return;
        }
        GameObject cameraObject = new GameObject(
            "Golden Mask Presentation Camera");
        cameraObject.layer = presentationLayer;
        cameraObject.transform.SetParent(transform, false);
        presentationCamera = cameraObject.AddComponent<Camera>();
        presentationCamera.clearFlags = CameraClearFlags.SolidColor;
        presentationCamera.backgroundColor =
            new Color(0.075f, 0.068f, 0.060f, 1.0f);
        presentationCamera.cullingMask = 1 << presentationLayer;
        presentationCamera.orthographic = true;
        presentationCamera.nearClipPlane = 0.01f;
        presentationCamera.farClipPlane = 5.0f;
        presentationCamera.depth = 100.0f;
        presentationCamera.allowHDR = true;
        presentationCamera.allowMSAA = true;
        presentationCamera.enabled = false;
    }

    private void EnsureMaterial()
    {
        if (marbleMaterial != null)
        {
            return;
        }
        Shader shader = Resources.Load<Shader>("GoldenMaskMarble");
        if (shader == null)
        {
            shader = Shader.Find("AURA/GoldenMaskMarble");
        }
        if (shader == null)
        {
            shader = Shader.Find("Standard");
        }
        if (shader == null)
        {
            throw new InvalidOperationException(
                "Golden Mask shader is unavailable.");
        }
        marbleMaterial = new Material(shader)
        {
            name = "Golden Mask Warm Marble"
        };
        Color marble = new Color(0.975f, 0.97f, 0.95f, 1.0f);
        if (marbleMaterial.HasProperty("_Color"))
        {
            marbleMaterial.SetColor("_Color", marble);
        }
        if (marbleMaterial.HasProperty("_Warmth"))
        {
            marbleMaterial.SetFloat("_Warmth", 0.14f);
        }
        if (marbleMaterial.HasProperty("_Smoothness"))
        {
            marbleMaterial.SetFloat("_Smoothness", 0.72f);
        }
        if (marbleMaterial.HasProperty("_Glossiness"))
        {
            marbleMaterial.SetFloat("_Glossiness", 0.72f);
        }
        if (marbleMaterial.HasProperty("_Metallic"))
        {
            marbleMaterial.SetFloat("_Metallic", 0.0f);
        }
    }

    private void FrameCamera()
    {
        if (presentationCamera == null
            || faceMesh == null
            || presentationRoot == null)
        {
            return;
        }
        Bounds bounds = faceMesh.bounds;
        float maximumExtent = Mathf.Max(
            bounds.extents.x,
            bounds.extents.y,
            bounds.extents.z,
            0.05f);
        presentationCamera.transform.localPosition =
            new Vector3(0.0f, 0.0f, maximumExtent * 5.0f);
        presentationCamera.transform.localRotation =
            Quaternion.LookRotation(Vector3.back, Vector3.up);
        float aspect = presentationCamera.aspect > 0.1f
            ? presentationCamera.aspect
            : 1.0f;
        presentationCamera.orthographicSize = Mathf.Max(
            bounds.extents.y * 1.24f,
            bounds.extents.x * 1.24f / aspect,
            0.08f);
    }

    private static Mesh CreateBackingMesh(Bounds bounds)
    {
        Vector3[] vertices = new Vector3[BackingSegmentCount + 1];
        int[] triangles = new int[BackingSegmentCount * 3];
        float radiusX = Mathf.Max(bounds.extents.x * 0.72f, 0.035f);
        float radiusY = Mathf.Max(bounds.extents.y * 0.62f, 0.045f);
        float centerY = bounds.center.y - bounds.extents.y * 0.08f;
        float z = bounds.min.z - 0.004f;
        vertices[0] = new Vector3(bounds.center.x, centerY, z);
        for (int segment = 0;
            segment < BackingSegmentCount;
            segment += 1)
        {
            float radians =
                Mathf.PI * 2.0f * segment / BackingSegmentCount;
            vertices[segment + 1] = new Vector3(
                bounds.center.x + Mathf.Cos(radians) * radiusX,
                centerY + Mathf.Sin(radians) * radiusY,
                z);
            int triangle = segment * 3;
            triangles[triangle] = 0;
            triangles[triangle + 1] = segment + 1;
            triangles[triangle + 2] =
                ((segment + 1) % BackingSegmentCount) + 1;
        }

        Mesh mesh = new Mesh
        {
            name = "Golden Mask Non-measurement Backing"
        };
        mesh.vertices = vertices;
        mesh.triangles = triangles;
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    private void ApplyVisibility()
    {
        bool visible = hasArtifact
            && string.Equals(
                runtimeMode,
                "still",
                StringComparison.Ordinal);
        if (presentationRoot != null)
        {
            presentationRoot.SetActive(visible);
        }
        if (presentationCamera != null)
        {
            presentationCamera.enabled = visible;
        }
        SetOtherCameraExclusion(visible);
    }

    private void ClearPresentation()
    {
        hasArtifact = false;
        activeRequestId = string.Empty;
        if (presentationRoot != null)
        {
            presentationRoot.SetActive(false);
            Destroy(presentationRoot);
            presentationRoot = null;
        }
        if (faceMesh != null)
        {
            Destroy(faceMesh);
            faceMesh = null;
        }
        if (backingMesh != null)
        {
            Destroy(backingMesh);
            backingMesh = null;
        }
        ApplyVisibility();
    }

    private void SetOtherCameraExclusion(bool excluded)
    {
        int layerMask = 1 << presentationLayer;
        if (!excluded)
        {
            foreach (KeyValuePair<Camera, int> entry
                in excludedCameraMasks)
            {
                if (entry.Key != null)
                {
                    entry.Key.cullingMask =
                        (entry.Key.cullingMask & ~layerMask)
                        | (entry.Value & layerMask);
                }
            }
            excludedCameraMasks.Clear();
            return;
        }

        Camera[] cameras = FindObjectsByType<Camera>(
            FindObjectsInactive.Include,
            FindObjectsSortMode.None);
        foreach (Camera camera in cameras)
        {
            if (camera == null
                || camera == presentationCamera
                || !camera.gameObject.scene.IsValid()
                || excludedCameraMasks.ContainsKey(camera))
            {
                continue;
            }
            excludedCameraMasks[camera] = camera.cullingMask;
            camera.cullingMask &= ~layerMask;
        }
    }

    private static int ResolvePresentationLayer()
    {
        int namedLayer = LayerMask.NameToLayer(
            GoldenMaskLayerName);
        return namedLayer >= 0
            ? namedLayer
            : FallbackGoldenMaskLayer;
    }

    private bool MatchesActiveRequest(string requestId)
    {
        return hasArtifact
            && string.Equals(
                NormalizeRequestId(requestId),
                activeRequestId,
                StringComparison.Ordinal);
    }

    private static Request ParseRequest(string json)
    {
        try
        {
            return JsonUtility.FromJson<Request>(json ?? string.Empty);
        }
        catch (Exception)
        {
            return null;
        }
    }

    private void SendReady(
        string requestId,
        GoldenMaskArtifact artifact)
    {
        SendEvent(
            "{\"type\":\"golden_mask_ready\""
            + ",\"requestId\":"
            + Quote(requestId)
            + ",\"schemaVersion\":"
            + Quote(GoldenMaskContract.SchemaVersion)
            + ",\"vertexCount\":"
            + artifact.Vertices.Count.ToString(
                CultureInfo.InvariantCulture)
            + ",\"indexCount\":"
            + artifact.TriangleIndices.Count.ToString(
                CultureInfo.InvariantCulture)
            + "}");
    }

    private void SendFailure(string requestId, string reason)
    {
        SendEvent(
            "{\"type\":\"golden_mask_failed\""
            + ",\"requestId\":"
            + Quote(NormalizeRequestId(requestId))
            + ",\"reason\":"
            + Quote(
                string.IsNullOrWhiteSpace(reason)
                    ? "golden_mask_unavailable"
                    : reason.Trim())
            + "}");
    }

    private void SendPosterFailure(string requestId, string reason)
    {
        SendEvent(
            "{\"type\":\"golden_mask_poster_failed\""
            + ",\"requestId\":"
            + Quote(NormalizeRequestId(requestId))
            + ",\"reason\":"
            + Quote(
                string.IsNullOrWhiteSpace(reason)
                    ? "golden_mask_poster_failed"
                    : reason.Trim())
            + "}");
    }

    private void SendEvent(string json)
    {
        if (bridge != null)
        {
            bridge.SendGoldenMaskEvent(json);
        }
        else
        {
            Debug.LogWarning(
                "[GoldenMask] RNBridge unavailable for event.");
        }
    }

    private static Vector3 CalculateCenter(
        IReadOnlyList<Vector3> vertices)
    {
        Vector3 minimum = vertices[0];
        Vector3 maximum = vertices[0];
        for (int index = 1; index < vertices.Count; index += 1)
        {
            minimum = Vector3.Min(minimum, vertices[index]);
            maximum = Vector3.Max(maximum, vertices[index]);
        }
        return (minimum + maximum) * 0.5f;
    }

    private static int[] Copy(IReadOnlyList<int> source)
    {
        int[] result = new int[source.Count];
        for (int index = 0; index < source.Count; index += 1)
        {
            result[index] = source[index];
        }
        return result;
    }

    private static Vector2[] Copy(IReadOnlyList<Vector2> source)
    {
        Vector2[] result = new Vector2[source.Count];
        for (int index = 0; index < source.Count; index += 1)
        {
            result[index] = source[index];
        }
        return result;
    }

    private static string NormalizeRequestId(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }
        string trimmed = value.Trim();
        return trimmed.Length <= 200
            ? trimmed
            : trimmed.Substring(0, 200);
    }

    private static bool IsFinite(float value)
    {
        return !float.IsNaN(value) && !float.IsInfinity(value);
    }

    private static string SanitizeFileStem(string value)
    {
        StringBuilder result = new StringBuilder();
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
            : "golden-mask";
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
