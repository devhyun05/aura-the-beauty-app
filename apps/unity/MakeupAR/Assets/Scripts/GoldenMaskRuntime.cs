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
/// presentation object. Geometry is never smoothed, mirrored, completed, or
/// depth-exaggerated. Only shading normals, camera, material, and lighting
/// presentation may change.
/// </summary>
public sealed class GoldenMaskRuntime : MonoBehaviour
{
    private const int FallbackGoldenMaskLayer = 31;
    private const string GoldenMaskLayerName = "GoldenMask";
    private const float MaximumYaw = 90.0f;
    private const float MaximumPitch = 40.0f;
    private const float IdleDelaySeconds = 1.4f;
    private const float PresentationShellThicknessMeters = 0.0018f;
    private const float WireframeSurfaceOffsetMeters = 0.00025f;
    private const float ProfileOccluderStartYaw = 42.0f;

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
    private sealed class WireframeVisibilityRequest
    {
        public string requestId;
        public bool visible;
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
    private Mesh shellMesh;
    private Mesh backingMesh;
    private Mesh wireframeMesh;
    private Mesh profileOccluderMesh;
    private Material marbleMaterial;
    private Material shellMaterial;
    private Material cavityMaterial;
    private Material wireframeMaterial;
    private Material profileOccluderMaterial;
    private MeshRenderer faceRenderer;
    private MeshRenderer shellRenderer;
    private MeshRenderer cavityRenderer;
    private MeshRenderer wireframeRenderer;
    private MeshRenderer profileOccluderRenderer;
    private int presentationLayer = FallbackGoldenMaskLayer;
    private string runtimeMode = "live";
    private string activeRequestId = string.Empty;
    private bool hasArtifact;
    private bool wireframeVisible;
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
        float loadStartedAt = Time.realtimeSinceStartup;
        ClearPresentation();
        if (!GoldenMaskArtifactStore.TryLoad(
                request.fileUri,
                out GoldenMaskArtifact artifact,
                out string reason))
        {
            SendFailure(requestId, reason);
            return;
        }
        float artifactLoadedAt = Time.realtimeSinceStartup;

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
            Bounds bounds = faceMesh.bounds;
            Debug.Log(
                "[GoldenMask] load ready"
                + $" request={requestId}"
                + $" vertices={artifact.Vertices.Count}"
                + $" indices={artifact.TriangleIndices.Count}"
                + $" depthMm={bounds.size.z * 1000.0f:F1}"
                + $" parseMs={(artifactLoadedAt - loadStartedAt) * 1000.0f:F0}"
                + $" buildMs={(Time.realtimeSinceStartup - artifactLoadedAt) * 1000.0f:F0}"
                + $" totalMs={(Time.realtimeSinceStartup - loadStartedAt) * 1000.0f:F0}");
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

    public void SetWireframeVisibleJson(string json)
    {
        WireframeVisibilityRequest request;
        try
        {
            request = JsonUtility.FromJson<WireframeVisibilityRequest>(
                json ?? string.Empty);
        }
        catch (Exception)
        {
            return;
        }
        if (request == null || !MatchesActiveRequest(request.requestId))
        {
            return;
        }
        wireframeVisible = request.visible;
        ApplyWireframeVisibility();
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
        float displayYaw = Mathf.Clamp(
            requestedYaw + idleYaw,
            -MaximumYaw,
            MaximumYaw);
        if (cavityRenderer != null)
        {
            // At a near-profile angle the real opening rims provide their own
            // depth cue; hiding the small recessed caps avoids fan edges at
            // silhouette while preserving the measured face and shell.
            cavityRenderer.enabled = Mathf.Abs(displayYaw) < 72.0f;
        }
        if (profileOccluderRenderer != null)
        {
            // ARKit stores an open facial surface, not a closed head. From a
            // three-quarter view an invisible center partition writes depth
            // before the plaster, so only the camera-near half can render.
            // Unlike fragment clipping, this does not cut triangles into
            // detached wedges or draw a diagonal seam across the face.
            profileOccluderRenderer.enabled =
                Mathf.Abs(displayYaw) >= ProfileOccluderStartYaw;
        }
        Quaternion target = Quaternion.Euler(
            requestedPitch,
            displayYaw,
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
        if (shellMaterial != null)
        {
            Destroy(shellMaterial);
            shellMaterial = null;
        }
        if (cavityMaterial != null)
        {
            Destroy(cavityMaterial);
            cavityMaterial = null;
        }
        if (wireframeMaterial != null)
        {
            Destroy(wireframeMaterial);
            wireframeMaterial = null;
        }
        if (profileOccluderMaterial != null)
        {
            Destroy(profileOccluderMaterial);
            profileOccluderMaterial = null;
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
        EnsureFrontFacingWinding(faceMesh, indices);
        SmoothShadingNormals(faceMesh, indices);
        faceMesh.RecalculateBounds();
        shellMesh = BuildBoundaryShellMesh(
            vertices,
            indices,
            PresentationShellThicknessMeters);
        wireframeMesh = BuildWireframeMesh(faceMesh, indices);

        presentationRoot = new GameObject("Golden Mask Presentation");
        presentationRoot.layer = presentationLayer;
        presentationRoot.transform.SetParent(transform, false);

        profileOccluderMesh = BuildProfileOccluderMesh(faceMesh.bounds);
        GameObject profileOccluder = new GameObject(
            "Golden Mask Far Side Depth Occluder");
        profileOccluder.layer = presentationLayer;
        profileOccluder.transform.SetParent(
            presentationRoot.transform,
            false);
        MeshFilter profileOccluderFilter =
            profileOccluder.AddComponent<MeshFilter>();
        profileOccluderFilter.sharedMesh = profileOccluderMesh;
        profileOccluderRenderer =
            profileOccluder.AddComponent<MeshRenderer>();
        profileOccluderRenderer.sharedMaterial =
            profileOccluderMaterial;
        profileOccluderRenderer.shadowCastingMode =
            ShadowCastingMode.Off;
        profileOccluderRenderer.receiveShadows = false;
        profileOccluderRenderer.enabled = false;

        GameObject face = new GameObject("Measured Face Mesh");
        face.layer = presentationLayer;
        face.transform.SetParent(presentationRoot.transform, false);
        MeshFilter filter = face.AddComponent<MeshFilter>();
        filter.sharedMesh = faceMesh;
        faceRenderer = face.AddComponent<MeshRenderer>();
        faceRenderer.sharedMaterial = marbleMaterial;
        faceRenderer.shadowCastingMode = ShadowCastingMode.Off;
        faceRenderer.receiveShadows = false;

        GameObject wireframe = new GameObject(
            "Optional TrueDepth Mesh Lines");
        wireframe.layer = presentationLayer;
        wireframe.transform.SetParent(presentationRoot.transform, false);
        MeshFilter wireframeFilter = wireframe.AddComponent<MeshFilter>();
        wireframeFilter.sharedMesh = wireframeMesh;
        wireframeRenderer = wireframe.AddComponent<MeshRenderer>();
        wireframeRenderer.sharedMaterial = wireframeMaterial;
        wireframeRenderer.shadowCastingMode = ShadowCastingMode.Off;
        wireframeRenderer.receiveShadows = false;
        wireframeRenderer.enabled = false;

        GameObject shell = new GameObject("Golden Mask Finished Edges");
        shell.layer = presentationLayer;
        shell.transform.SetParent(presentationRoot.transform, false);
        MeshFilter shellFilter = shell.AddComponent<MeshFilter>();
        shellFilter.sharedMesh = shellMesh;
        shellRenderer = shell.AddComponent<MeshRenderer>();
        shellRenderer.sharedMaterial = shellMaterial;
        shellRenderer.shadowCastingMode = ShadowCastingMode.Off;
        shellRenderer.receiveShadows = false;

        // ARKit's measured topology intentionally has eye and mouth openings.
        // A recessed, presentation-only inner surface makes those openings
        // read like cavities in a plaster cast instead of holes in the screen.
        backingMesh = BuildCavityBackingMesh(
            vertices,
            indices,
            PresentationShellThicknessMeters);
        GameObject backing = new GameObject(
            "Non-measurement Eye And Mouth Backing");
        backing.layer = presentationLayer;
        backing.transform.SetParent(presentationRoot.transform, false);
        MeshFilter backingFilter = backing.AddComponent<MeshFilter>();
        backingFilter.sharedMesh = backingMesh;
        cavityRenderer = backing.AddComponent<MeshRenderer>();
        cavityRenderer.sharedMaterial = cavityMaterial;
        cavityRenderer.shadowCastingMode = ShadowCastingMode.Off;
        cavityRenderer.receiveShadows = false;

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
            new Color(0.012f, 0.014f, 0.018f, 1.0f);
        presentationCamera.cullingMask = 1 << presentationLayer;
        // Orthographic projection preserves the measured X:Y proportions.
        // A close perspective camera made the face read wider than the source
        // photo even though the stored TrueDepth vertices were unchanged.
        presentationCamera.orthographic = true;
        presentationCamera.nearClipPlane = 0.01f;
        presentationCamera.farClipPlane = 5.0f;
        presentationCamera.depth = 100.0f;
        presentationCamera.allowHDR = true;
        presentationCamera.allowMSAA = true;
        presentationCamera.renderingPath = RenderingPath.Forward;
        presentationCamera.enabled = false;
    }

    private void EnsureMaterial()
    {
        if (marbleMaterial == null)
        {
            Shader shader = Resources.Load<Shader>("GoldenMaskMarble")
                ?? Shader.Find("AURA/GoldenMaskMarble");
            if (shader == null)
            {
                throw new InvalidOperationException(
                    "Golden Mask marble shader is unavailable.");
            }
            marbleMaterial = new Material(shader)
            {
                name = "Golden Mask Museum Plaster"
            };
            marbleMaterial.SetColor(
                "_Color",
                new Color(0.945f, 0.935f, 0.90f, 1.0f));
            marbleMaterial.SetColor(
                "_ShadowColor",
                new Color(0.026f, 0.029f, 0.036f, 1.0f));
            marbleMaterial.SetFloat("_KeyStrength", 0.92f);
            marbleMaterial.SetFloat("_ShadowDepth", 0.74f);

            shellMaterial = new Material(marbleMaterial)
            {
                name = "Golden Mask Smooth Cut Surface"
            };
            shellMaterial.SetFloat("_CullMode", 0.0f);

            cavityMaterial = new Material(shader)
            {
                name = "Golden Mask Recessed Plaster"
            };
            cavityMaterial.SetColor(
                "_Color",
                new Color(0.34f, 0.335f, 0.33f, 1.0f));
            cavityMaterial.SetColor(
                "_ShadowColor",
                new Color(0.025f, 0.027f, 0.032f, 1.0f));
            cavityMaterial.SetFloat("_KeyStrength", 0.60f);
            cavityMaterial.SetFloat("_ShadowDepth", 0.82f);
        }
        if (wireframeMaterial == null)
        {
            Shader shader = Resources.Load<Shader>("GoldenMaskWireframe")
                ?? Shader.Find("AURA/GoldenMaskWireframe");
            if (shader == null)
            {
                throw new InvalidOperationException(
                    "Golden Mask wireframe shader is unavailable.");
            }
            wireframeMaterial = new Material(shader)
            {
                name = "Golden Mask Optional Mesh Lines"
            };
            wireframeMaterial.SetColor(
                "_Color",
                new Color(0.48f, 0.86f, 0.96f, 0.58f));
        }
        if (profileOccluderMaterial == null)
        {
            Shader shader = Resources.Load<Shader>(
                    "GoldenMaskDepthOccluder")
                ?? Shader.Find("AURA/GoldenMaskDepthOccluder");
            if (shader == null)
            {
                throw new InvalidOperationException(
                    "Golden Mask depth occluder shader is unavailable.");
            }
            profileOccluderMaterial = new Material(shader)
            {
                name = "Golden Mask Invisible Far Side Occluder"
            };
        }
    }

    private static Mesh BuildProfileOccluderMesh(Bounds bounds)
    {
        float yPadding = Mathf.Max(bounds.extents.y * 0.18f, 0.01f);
        float zPadding = Mathf.Max(bounds.extents.z * 0.75f, 0.025f);
        float x = bounds.center.x;
        float minY = bounds.min.y - yPadding;
        float maxY = bounds.max.y + yPadding;
        float minZ = bounds.min.z - zPadding;
        float maxZ = bounds.max.z + zPadding;
        Mesh mesh = new Mesh
        {
            name = "Golden Mask Center Depth Partition"
        };
        mesh.vertices = new[]
        {
            new Vector3(x, minY, minZ),
            new Vector3(x, maxY, minZ),
            new Vector3(x, maxY, maxZ),
            new Vector3(x, minY, maxZ)
        };
        mesh.triangles = new[] {0, 1, 2, 0, 2, 3};
        mesh.RecalculateBounds();
        return mesh;
    }

    private static Mesh BuildWireframeMesh(
        Mesh sourceMesh,
        int[] triangleIndices)
    {
        Vector3[] sourceVertices = sourceMesh.vertices;
        Vector3[] sourceNormals = sourceMesh.normals;
        Vector3[] vertices = new Vector3[sourceVertices.Length];
        for (int index = 0; index < vertices.Length; index += 1)
        {
            Vector3 normal = index < sourceNormals.Length
                ? sourceNormals[index]
                : Vector3.forward;
            vertices[index] = sourceVertices[index]
                + normal * WireframeSurfaceOffsetMeters;
        }

        HashSet<ulong> edges = new HashSet<ulong>();
        List<int> lineIndices = new List<int>(triangleIndices.Length * 2);
        for (int index = 0; index + 2 < triangleIndices.Length; index += 3)
        {
            AddWireframeEdge(
                edges,
                lineIndices,
                triangleIndices[index],
                triangleIndices[index + 1]);
            AddWireframeEdge(
                edges,
                lineIndices,
                triangleIndices[index + 1],
                triangleIndices[index + 2]);
            AddWireframeEdge(
                edges,
                lineIndices,
                triangleIndices[index + 2],
                triangleIndices[index]);
        }

        Mesh mesh = new Mesh
        {
            name = "Golden Mask Wireframe Overlay",
            indexFormat = vertices.Length > ushort.MaxValue
                ? IndexFormat.UInt32
                : IndexFormat.UInt16
        };
        mesh.vertices = vertices;
        mesh.SetIndices(
            lineIndices.ToArray(),
            MeshTopology.Lines,
            0,
            true);
        return mesh;
    }

    private static void AddWireframeEdge(
        HashSet<ulong> edges,
        List<int> lineIndices,
        int first,
        int second)
    {
        if (!edges.Add(EdgeKey(first, second)))
        {
            return;
        }
        lineIndices.Add(first);
        lineIndices.Add(second);
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
        float aspect = presentationCamera.aspect > 0.1f
            ? presentationCamera.aspect
            : 1.0f;
        presentationCamera.transform.localPosition =
            new Vector3(
                bounds.center.x,
                bounds.center.y,
                bounds.max.z + 1.0f);
        presentationCamera.transform.localRotation =
            Quaternion.LookRotation(
                bounds.center - presentationCamera.transform.localPosition,
                Vector3.up);
        presentationCamera.orthographicSize = Mathf.Max(
            bounds.extents.y,
            bounds.extents.x / aspect,
            0.05f) * 1.24f;
        presentationCamera.nearClipPlane = 0.01f;
        presentationCamera.farClipPlane = 2.0f;
    }

    private static void EnsureFrontFacingWinding(
        Mesh mesh,
        int[] indices)
    {
        Vector3[] normals = mesh.normals;
        Vector3 average = Vector3.zero;
        for (int index = 0; index < normals.Length; index += 1)
        {
            average += normals[index];
        }
        if (average.z >= 0.0f)
        {
            return;
        }
        for (int triangle = 0; triangle + 2 < indices.Length; triangle += 3)
        {
            int swap = indices[triangle + 1];
            indices[triangle + 1] = indices[triangle + 2];
            indices[triangle + 2] = swap;
        }
        mesh.triangles = indices;
        mesh.RecalculateNormals();
    }

    private static void SmoothShadingNormals(Mesh mesh, int[] indices)
    {
        Vector3[] normals = mesh.normals;
        Vector3[] sourceNormals = (Vector3[])normals.Clone();
        HashSet<int>[] neighbours = new HashSet<int>[normals.Length];
        Dictionary<ulong, int> edgeCounts = new Dictionary<ulong, int>();
        for (int index = 0; index < neighbours.Length; index += 1)
        {
            neighbours[index] = new HashSet<int>();
        }
        for (int triangle = 0; triangle + 2 < indices.Length; triangle += 3)
        {
            int a = indices[triangle];
            int b = indices[triangle + 1];
            int c = indices[triangle + 2];
            AddNeighbourPair(neighbours, a, b);
            AddNeighbourPair(neighbours, b, c);
            AddNeighbourPair(neighbours, c, a);
            CountEdge(edgeCounts, a, b);
            CountEdge(edgeCounts, b, c);
            CountEdge(edgeCounts, c, a);
        }
        bool[] boundary = new bool[normals.Length];
        foreach (KeyValuePair<ulong, int> edge in edgeCounts)
        {
            if (edge.Value != 1)
            {
                continue;
            }
            boundary[(int)(edge.Key >> 32)] = true;
            boundary[(int)(edge.Key & uint.MaxValue)] = true;
        }
        for (int pass = 0; pass < 2; pass += 1)
        {
            Vector3[] next = new Vector3[normals.Length];
            for (int index = 0; index < normals.Length; index += 1)
            {
                Vector3 average = normals[index] * 2.0f;
                foreach (int neighbour in neighbours[index])
                {
                    average += normals[neighbour];
                }
                average.Normalize();
                float curvature = 1.0f - Mathf.Clamp01(
                    Vector3.Dot(sourceNormals[index], average));
                float featurePreservation = Mathf.SmoothStep(
                    0.0f,
                    1.0f,
                    Mathf.InverseLerp(0.025f, 0.15f, curvature));
                float smoothWeight = boundary[index]
                    ? 0.08f
                    : Mathf.Lerp(0.44f, 0.10f, featurePreservation);
                next[index] = Vector3.Slerp(
                    normals[index],
                    average,
                    smoothWeight).normalized;
            }
            normals = next;
        }
        mesh.normals = normals;
    }

    private static Mesh BuildBoundaryShellMesh(
        Vector3[] vertices,
        int[] triangleIndices,
        float thickness)
    {
        Dictionary<ulong, int> counts = new Dictionary<ulong, int>();
        Dictionary<ulong, Vector2Int> directions =
            new Dictionary<ulong, Vector2Int>();
        for (int triangle = 0;
            triangle + 2 < triangleIndices.Length;
            triangle += 3)
        {
            RegisterBoundaryEdge(
                counts,
                directions,
                triangleIndices[triangle],
                triangleIndices[triangle + 1]);
            RegisterBoundaryEdge(
                counts,
                directions,
                triangleIndices[triangle + 1],
                triangleIndices[triangle + 2]);
            RegisterBoundaryEdge(
                counts,
                directions,
                triangleIndices[triangle + 2],
                triangleIndices[triangle]);
        }
        List<Vector3> shellVertices = new List<Vector3>();
        List<int> shellIndices = new List<int>();
        Dictionary<int, List<int>> boundaryNeighbours =
            new Dictionary<int, List<int>>();
        foreach (KeyValuePair<ulong, int> edge in counts)
        {
            if (edge.Value != 1)
            {
                continue;
            }
            Vector2Int pair = directions[edge.Key];
            AddBoundaryNeighbour(boundaryNeighbours, pair.x, pair.y);
            AddBoundaryNeighbour(boundaryNeighbours, pair.y, pair.x);
        }
        HashSet<ulong> visited = new HashSet<ulong>();
        List<int> outerLoop = null;
        foreach (KeyValuePair<int, List<int>> entry in boundaryNeighbours)
        {
            foreach (int neighbour in entry.Value)
            {
                if (visited.Contains(EdgeKey(entry.Key, neighbour)))
                {
                    continue;
                }
                List<int> loop = TraceBoundaryLoop(
                    entry.Key,
                    neighbour,
                    boundaryNeighbours,
                    visited);
                if (loop.Count >= 3
                    && (outerLoop == null || loop.Count > outerLoop.Count))
                {
                    outerLoop = loop;
                }
            }
        }
        if (outerLoop != null)
        {
            Vector3[] cleanCutRing = BuildCleanCutRing(
                vertices,
                outerLoop,
                thickness);
            int ringCount = outerLoop.Count;
            for (int index = 0; index < ringCount; index += 1)
            {
                shellVertices.Add(vertices[outerLoop[index]]);
            }
            for (int index = 0; index < ringCount; index += 1)
            {
                shellVertices.Add(cleanCutRing[index]);
            }
            for (int index = 0; index < outerLoop.Count; index += 1)
            {
                int next = (index + 1) % outerLoop.Count;
                int rear = ringCount + index;
                int rearNext = ringCount + next;
                shellIndices.Add(index);
                shellIndices.Add(next);
                shellIndices.Add(rearNext);
                shellIndices.Add(index);
                shellIndices.Add(rearNext);
                shellIndices.Add(rear);
            }

        }
        Mesh mesh = new Mesh
        {
            name = "Golden Mask Clean Planar Cut",
            indexFormat = shellVertices.Count > ushort.MaxValue
                ? IndexFormat.UInt32
                : IndexFormat.UInt16
        };
        mesh.SetVertices(shellVertices);
        mesh.SetTriangles(shellIndices, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    private static Vector3[] BuildCleanCutRing(
        Vector3[] sourceVertices,
        List<int> outerLoop,
        float thickness)
    {
        int count = outerLoop.Count;
        Vector3[] smoothed = new Vector3[count];
        Vector2 originalMinimum =
            new Vector2(float.PositiveInfinity, float.PositiveInfinity);
        Vector2 originalMaximum =
            new Vector2(float.NegativeInfinity, float.NegativeInfinity);
        for (int index = 0; index < count; index += 1)
        {
            Vector3 source = sourceVertices[outerLoop[index]];
            Vector2 point = new Vector2(source.x, source.y);
            smoothed[index] = source;
            originalMinimum = Vector2.Min(originalMinimum, point);
            originalMaximum = Vector2.Max(originalMaximum, point);
        }

        // The front ring remains the untouched measured contour. Only the
        // presentation-only rear cut is low-pass filtered into one clean
        // closed curve. Its measured width, height, and thin shell depth are
        // retained so profile inspection never becomes a thick slab.
        Vector3[] scratch = new Vector3[count];
        for (int pass = 0; pass < 6; pass += 1)
        {
            for (int index = 0; index < count; index += 1)
            {
                Vector3 previous =
                    smoothed[(index - 1 + count) % count];
                Vector3 current = smoothed[index];
                Vector3 next = smoothed[(index + 1) % count];
                scratch[index] =
                    previous * 0.25f
                    + current * 0.50f
                    + next * 0.25f;
            }
            Vector3[] swap = smoothed;
            smoothed = scratch;
            scratch = swap;
        }

        Vector2 smoothedMinimum =
            new Vector2(float.PositiveInfinity, float.PositiveInfinity);
        Vector2 smoothedMaximum =
            new Vector2(float.NegativeInfinity, float.NegativeInfinity);
        for (int index = 0; index < count; index += 1)
        {
            Vector2 point = new Vector2(
                smoothed[index].x,
                smoothed[index].y);
            smoothedMinimum = Vector2.Min(
                smoothedMinimum,
                point);
            smoothedMaximum = Vector2.Max(
                smoothedMaximum,
                point);
        }
        Vector2 originalCenter =
            (originalMinimum + originalMaximum) * 0.5f;
        Vector2 smoothedCenter =
            (smoothedMinimum + smoothedMaximum) * 0.5f;
        Vector2 originalSize = originalMaximum - originalMinimum;
        Vector2 smoothedSize = smoothedMaximum - smoothedMinimum;
        float scaleX = smoothedSize.x > 0.000001f
            ? originalSize.x / smoothedSize.x
            : 1.0f;
        float scaleY = smoothedSize.y > 0.000001f
            ? originalSize.y / smoothedSize.y
            : 1.0f;

        Vector3[] ring = new Vector3[count];
        for (int index = 0; index < count; index += 1)
        {
            Vector2 smoothedPoint = new Vector2(
                smoothed[index].x,
                smoothed[index].y);
            Vector2 offset = smoothedPoint - smoothedCenter;
            ring[index] = new Vector3(
                originalCenter.x + offset.x * scaleX,
                originalCenter.y + offset.y * scaleY,
                smoothed[index].z - thickness);
        }
        return ring;
    }

    private static Mesh BuildCavityBackingMesh(
        Vector3[] sourceVertices,
        int[] triangleIndices,
        float thickness)
    {
        Dictionary<ulong, int> counts = new Dictionary<ulong, int>();
        Dictionary<ulong, Vector2Int> directions =
            new Dictionary<ulong, Vector2Int>();
        for (int triangle = 0;
            triangle + 2 < triangleIndices.Length;
            triangle += 3)
        {
            RegisterBoundaryEdge(
                counts,
                directions,
                triangleIndices[triangle],
                triangleIndices[triangle + 1]);
            RegisterBoundaryEdge(
                counts,
                directions,
                triangleIndices[triangle + 1],
                triangleIndices[triangle + 2]);
            RegisterBoundaryEdge(
                counts,
                directions,
                triangleIndices[triangle + 2],
                triangleIndices[triangle]);
        }

        Dictionary<int, List<int>> neighbours =
            new Dictionary<int, List<int>>();
        foreach (KeyValuePair<ulong, int> edge in counts)
        {
            if (edge.Value != 1)
            {
                continue;
            }
            Vector2Int pair = directions[edge.Key];
            AddBoundaryNeighbour(neighbours, pair.x, pair.y);
            AddBoundaryNeighbour(neighbours, pair.y, pair.x);
        }

        HashSet<ulong> visited = new HashSet<ulong>();
        List<List<int>> loops = new List<List<int>>();
        foreach (KeyValuePair<int, List<int>> entry in neighbours)
        {
            foreach (int neighbour in entry.Value)
            {
                ulong firstEdge = EdgeKey(entry.Key, neighbour);
                if (visited.Contains(firstEdge))
                {
                    continue;
                }
                List<int> loop = TraceBoundaryLoop(
                    entry.Key,
                    neighbour,
                    neighbours,
                    visited);
                if (loop.Count >= 3)
                {
                    loops.Add(loop);
                }
            }
        }

        int outerLoopIndex = -1;
        int outerLoopCount = -1;
        for (int index = 0; index < loops.Count; index += 1)
        {
            if (loops[index].Count > outerLoopCount)
            {
                outerLoopIndex = index;
                outerLoopCount = loops[index].Count;
            }
        }

        List<Vector3> vertices = new List<Vector3>();
        List<int> indices = new List<int>();
        Vector3 rimOffset = Vector3.back * thickness * 0.20f;
        Vector3 centerOffset = Vector3.back * thickness * 1.65f;
        for (int loopIndex = 0; loopIndex < loops.Count; loopIndex += 1)
        {
            if (loopIndex == outerLoopIndex)
            {
                continue;
            }
            List<int> loop = loops[loopIndex];
            Vector3 center = Vector3.zero;
            float signedArea = 0.0f;
            for (int index = 0; index < loop.Count; index += 1)
            {
                Vector3 current = sourceVertices[loop[index]];
                Vector3 next =
                    sourceVertices[loop[(index + 1) % loop.Count]];
                center += current;
                signedArea += current.x * next.y - next.x * current.y;
            }
            center /= loop.Count;

            int centerIndex = vertices.Count;
            vertices.Add(center + centerOffset);
            int rimStart = vertices.Count;
            foreach (int sourceIndex in loop)
            {
                vertices.Add(sourceVertices[sourceIndex] + rimOffset);
            }
            for (int index = 0; index < loop.Count; index += 1)
            {
                int current = rimStart + index;
                int next = rimStart + (index + 1) % loop.Count;
                indices.Add(centerIndex);
                if (signedArea >= 0.0f)
                {
                    indices.Add(current);
                    indices.Add(next);
                }
                else
                {
                    indices.Add(next);
                    indices.Add(current);
                }
            }
        }

        Mesh mesh = new Mesh
        {
            name = "Golden Mask Recessed Cavity Backing"
        };
        mesh.SetVertices(vertices);
        mesh.SetTriangles(indices, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    private static void AddBoundaryNeighbour(
        Dictionary<int, List<int>> neighbours,
        int vertex,
        int neighbour)
    {
        if (!neighbours.TryGetValue(vertex, out List<int> connected))
        {
            connected = new List<int>();
            neighbours[vertex] = connected;
        }
        if (!connected.Contains(neighbour))
        {
            connected.Add(neighbour);
        }
    }

    private static List<int> TraceBoundaryLoop(
        int start,
        int first,
        Dictionary<int, List<int>> neighbours,
        HashSet<ulong> visited)
    {
        List<int> loop = new List<int> {start};
        int previous = start;
        int current = first;
        int safety = neighbours.Count + 1;
        while (safety > 0)
        {
            safety -= 1;
            visited.Add(EdgeKey(previous, current));
            if (current == start)
            {
                break;
            }
            loop.Add(current);
            if (!neighbours.TryGetValue(
                    current,
                    out List<int> connected))
            {
                break;
            }

            int next = -1;
            foreach (int candidate in connected)
            {
                if (candidate != previous
                    && !visited.Contains(EdgeKey(current, candidate)))
                {
                    next = candidate;
                    break;
                }
            }
            if (next < 0)
            {
                foreach (int candidate in connected)
                {
                    if (candidate == start)
                    {
                        next = candidate;
                        break;
                    }
                }
            }
            if (next < 0)
            {
                break;
            }
            previous = current;
            current = next;
        }
        return loop;
    }

    private static void RegisterBoundaryEdge(
        Dictionary<ulong, int> counts,
        Dictionary<ulong, Vector2Int> directions,
        int first,
        int second)
    {
        ulong key = EdgeKey(first, second);
        counts.TryGetValue(key, out int count);
        counts[key] = count + 1;
        if (count == 0)
        {
            directions[key] = new Vector2Int(first, second);
        }
    }

    private static void AddNeighbourPair(
        HashSet<int>[] neighbours,
        int first,
        int second)
    {
        neighbours[first].Add(second);
        neighbours[second].Add(first);
    }

    private static void CountEdge(
        Dictionary<ulong, int> counts,
        int first,
        int second)
    {
        ulong key = EdgeKey(first, second);
        counts.TryGetValue(key, out int count);
        counts[key] = count + 1;
    }

    private static ulong EdgeKey(int first, int second)
    {
        uint minimum = (uint)Mathf.Min(first, second);
        uint maximum = (uint)Mathf.Max(first, second);
        return ((ulong)minimum << 32) | maximum;
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
        ApplyWireframeVisibility();
        SetOtherCameraExclusion(visible);
    }

    private void ApplyWireframeVisibility()
    {
        if (wireframeRenderer != null)
        {
            wireframeRenderer.enabled = wireframeVisible
                && hasArtifact
                && string.Equals(
                    runtimeMode,
                    "still",
                    StringComparison.Ordinal);
        }
    }

    private void ClearPresentation()
    {
        hasArtifact = false;
        wireframeVisible = false;
        activeRequestId = string.Empty;
        faceRenderer = null;
        shellRenderer = null;
        cavityRenderer = null;
        wireframeRenderer = null;
        profileOccluderRenderer = null;
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
        if (shellMesh != null)
        {
            Destroy(shellMesh);
            shellMesh = null;
        }
        if (backingMesh != null)
        {
            Destroy(backingMesh);
            backingMesh = null;
        }
        if (wireframeMesh != null)
        {
            Destroy(wireframeMesh);
            wireframeMesh = null;
        }
        if (profileOccluderMesh != null)
        {
            Destroy(profileOccluderMesh);
            profileOccluderMesh = null;
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
