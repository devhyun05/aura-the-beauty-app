using System;
using System.Globalization;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public sealed class ScreenSpaceFoundationController : MonoBehaviour
{
    public struct ScreenSpaceFoundationState
    {
        public bool Requested;
        public bool Enabled;
        public bool ProviderReady;
        public bool RawMaskAvailable;
        public bool FinalMaskAvailable;
        public bool CameraTextureAvailable;
        public bool ScreenSpaceActive;
        public bool FaceTracked;
        public bool ArFaceManagerFound;
        public bool MaskChannelRFinalNonZero;
        public bool MaskChannelABaseNonZero;
        public bool NormalCorrectionEnabled;
        public int FaceCount;
        public int MaskWidth;
        public int MaskHeight;
        public int CameraTextureCount;
        public int DebugMaskMode;
        public int ProjectedVertexCount;
        public int ProjectedTriangleCount;
        public float Intensity;
        public float Coverage;
        public float Evenness;
        public float LuminanceInfluence;
        public float MaskChannelRMax;
        public float MaskAverage;
        public string Mode;
        public string FallbackMode;
        public string ProviderType;
        public string CameraTextureSource;
        public string FallbackReason;
        public string ActiveRenderer;
        public string ShaderPath;
        public string TrackingState;
        public string MaskSource;
    }

    private const string ProviderType = "DebugSkinMaskProvider";
    private const bool ProviderProductionReady = false;
    private const float DiagnosticsIntervalSeconds = 0.75f;
    private const float CameraTextureStaleSeconds = 0.45f;
    private const int FoundationRenderQueue = 4300;
    private static readonly int CameraTextureModeId = Shader.PropertyToID("_CameraTextureMode");
    private static readonly int CameraTexId = Shader.PropertyToID("_CameraTex");
    private static readonly int DisplayTransformId = Shader.PropertyToID("_UnityDisplayTransform");
    private static readonly int TextureYId = Shader.PropertyToID("_textureY");
    private static readonly int TextureCbCrId = Shader.PropertyToID("_textureCbCr");

    private FoundationMaskRuntime maskRuntime;
    private Material material;
    private MeshRenderer quadRenderer;
    private MeshFilter quadFilter;
    private Mesh quadMesh;
    private Camera currentCamera;
    private ARCameraManager cameraManager;
    private ScreenSpaceFoundationState state;
    private float nextDiagnosticsLogAt;
    private float lastCameraTextureAt = -10.0f;
    private string lastStateSignature = string.Empty;
    private string disabledReason = "not_requested";
    private int cameraTextureMode;
    private int cameraTextureCount;
    private string cameraTextureSource = "none";

    public ScreenSpaceFoundationState CurrentState => state;

    private void OnDisable()
    {
        UnsubscribeCameraManager();
        SetQuadVisible(false);
    }

    private void OnDestroy()
    {
        UnsubscribeCameraManager();
    }

    public void ConfigureDisabled(string reason)
    {
        disabledReason = string.IsNullOrWhiteSpace(reason) ? "disabled" : reason;
        state.Requested = false;
        state.Enabled = false;
        state.CameraTextureAvailable = false;
        state.ScreenSpaceActive = false;
        state.MaskChannelRFinalNonZero = false;
        state.MaskChannelABaseNonZero = false;
        state.NormalCorrectionEnabled = false;
        state.MaskChannelRMax = 0.0f;
        state.MaskAverage = 0.0f;
        state.ActiveRenderer = "off";
        state.CameraTextureSource = cameraTextureSource;
        state.FallbackReason = disabledReason;
        state.ShaderPath = "off";
        SetQuadVisible(false);
    }

    public void ConfigureRecipe(
        bool enabled,
        string mode,
        string fallbackMode,
        int debugMaskMode,
        Color shadeColor,
        Color userSkinBaseColor,
        float intensity,
        float opacity,
        float coverage,
        float evenness,
        float luminanceInfluence)
    {
        state.Requested = true;
        state.Enabled = enabled && intensity > 0.0001f && opacity > 0.0001f;
        state.Mode = NormalizeMode(mode);
        state.FallbackMode = NormalizeFallbackMode(fallbackMode);
        state.DebugMaskMode = Mathf.Clamp(debugMaskMode, 0, 6);
        state.Intensity = Mathf.Clamp01(intensity) * Mathf.Clamp01(opacity);
        state.Coverage = Mathf.Clamp01(coverage);
        state.Evenness = Mathf.Clamp01(evenness);
        state.LuminanceInfluence = Mathf.Clamp01(luminanceInfluence);
        state.ProviderType = ProviderType;
        state.CameraTextureSource = cameraTextureSource;

        EnsureMaterial();
        if (material == null)
        {
            state.FallbackReason = "screen_space_shader_missing";
            state.ActiveRenderer = ResolveFallbackRenderer();
            state.ShaderPath = "fallback";
            SetQuadVisible(false);
            return;
        }

        material.SetColor("_FoundationColor", new Color(shadeColor.r, shadeColor.g, shadeColor.b, 1.0f));
        material.SetColor("_UserSkinBaseColor", new Color(userSkinBaseColor.r, userSkinBaseColor.g, userSkinBaseColor.b, 1.0f));
        material.SetFloat("_FoundationIntensity", state.Intensity);
        material.SetFloat("_FoundationCoverage", state.Coverage);
        material.SetFloat("_FoundationEvenness", state.Evenness);
        material.SetFloat("_FoundationLuminanceInfluence", state.LuminanceInfluence);
        material.SetFloat("_FoundationDebugMode", state.DebugMaskMode);
        material.SetFloat("_ProviderProductionReady", ProviderProductionReady ? 1.0f : 0.0f);
        ApplyBlendModeForDebug(state.DebugMaskMode);
    }

    public ScreenSpaceFoundationState UpdateRuntime(ARFaceManager faceManager, Camera arCamera)
    {
        state.NormalCorrectionEnabled = false;
        if (!state.Requested || !state.Enabled || state.Mode != "screenSpace")
        {
            state.ScreenSpaceActive = false;
            state.ActiveRenderer = "off";
            state.FallbackReason = state.Requested ? "disabled_or_not_screen_space" : disabledReason;
            state.ShaderPath = "off";
            state.MaskChannelRFinalNonZero = false;
            state.MaskChannelABaseNonZero = false;
            SetQuadVisible(false);
            MaybeLogState();
            return state;
        }

        EnsureMaterial();
        EnsureMaskRuntime();
        EnsureCameraSubscription(arCamera);
        if (material == null)
        {
            state.ScreenSpaceActive = false;
            state.ActiveRenderer = ResolveFallbackRenderer();
            state.FallbackReason = "screen_space_shader_missing";
            state.ShaderPath = "fallback";
            SetQuadVisible(false);
            MaybeLogState();
            return state;
        }

        if (maskRuntime == null)
        {
            state.ScreenSpaceActive = false;
            state.ProviderReady = false;
            state.RawMaskAvailable = false;
            state.FinalMaskAvailable = false;
            state.ActiveRenderer = ResolveFallbackRenderer();
            state.FallbackReason = "provider_missing";
            state.ShaderPath = "fallback";
            SetQuadVisible(false);
            MaybeLogState();
            return state;
        }

        ARFaceManager activeFaceManager = ResolveFaceManager(faceManager);
        state.ArFaceManagerFound = activeFaceManager != null;
        state.FaceCount = CountFaces(activeFaceManager);
        ARFace face = FindTrackingFace(activeFaceManager);
        state.FaceTracked = face != null && face.trackingState == TrackingState.Tracking;
        state.TrackingState = face != null ? face.trackingState.ToString() : "None";
        FoundationMaskRuntime.FoundationMaskState maskState = state.FaceTracked
            ? maskRuntime.UpdateMask(face, arCamera, state.DebugMaskMode)
            : maskRuntime.InvalidateMask(false, state.DebugMaskMode, "face_unavailable");
        state.MaskChannelRMax = maskState.MaskMax;
        state.MaskAverage = maskState.MaskAverage;
        state.MaskChannelRFinalNonZero = maskState.MaskMax > 0.025f;
        state.MaskChannelABaseNonZero = maskState.BaseFaceSurfaceMaskReady && maskState.ProjectedVertexCount > 0;
        state.MaskSource = maskState.MaskSource;
        state.ProjectedVertexCount = maskState.ProjectedVertexCount;
        state.ProjectedTriangleCount = maskState.ProjectedTriangleCount;
        state.NormalCorrectionEnabled = false;

        Texture maskTexture = maskRuntime.FoundationMaskTexture;
        bool maskValid = maskState.DynamicMaskValid && maskTexture != null;
        state.ProviderReady = true;
        state.RawMaskAvailable = maskValid;
        state.FinalMaskAvailable = maskValid;
        state.MaskWidth = maskTexture != null ? maskTexture.width : 0;
        state.MaskHeight = maskTexture != null ? maskTexture.height : 0;
        bool cameraTextureAvailable = HasFreshCameraTexture();
        state.CameraTextureAvailable = cameraTextureAvailable;
        state.CameraTextureSource = cameraTextureSource;
        state.CameraTextureCount = cameraTextureCount;

        if (!maskValid)
        {
            state.FallbackReason = maskState.Status;
            state.ActiveRenderer = ResolveFallbackRenderer();
            state.ScreenSpaceActive = false;
            state.ShaderPath = "fallback";
            SetQuadVisible(false);
            MaybeLogState();
            return state;
        }

        if (!cameraTextureAvailable)
        {
            state.FallbackReason = "camera_texture_unavailable";
            state.ActiveRenderer = ResolveFallbackRenderer();
            state.ScreenSpaceActive = false;
            state.ShaderPath = "fallback";
            SetQuadVisible(false);
            MaybeLogState();
            return state;
        }

        if (arCamera == null)
        {
            state.FallbackReason = "camera_unavailable";
            state.ActiveRenderer = ResolveFallbackRenderer();
            state.ScreenSpaceActive = false;
            state.ShaderPath = "fallback";
            SetQuadVisible(false);
            MaybeLogState();
            return state;
        }

        state.FallbackReason = "none";
        state.ActiveRenderer = "screenSpace";
        state.ScreenSpaceActive = true;
        state.ShaderPath = "real_screen_space_pixel_correction";
        state.NormalCorrectionEnabled = state.DebugMaskMode == 0;
        currentCamera = arCamera;
        EnsureQuad(arCamera);
        UpdateQuadGeometry(arCamera);
        material.SetTexture("_SkinMaskTex", maskTexture);
        material.SetFloat(CameraTextureModeId, cameraTextureMode);
        material.SetFloat("_RawMaskAvailable", maskValid ? 1.0f : 0.0f);
        material.SetFloat("_FinalMaskAvailable", maskValid ? 1.0f : 0.0f);
        material.SetFloat("_FoundationDebugMode", state.DebugMaskMode);
        material.SetVector(
            "_FoundationDebugLeftCheek",
            DebugAnchor(maskState.LeftCheekAnchor, maskState.LeftCheekValid));
        material.SetVector(
            "_FoundationDebugRightCheek",
            DebugAnchor(maskState.RightCheekAnchor, maskState.RightCheekValid));
        material.SetVector(
            "_FoundationDebugNose",
            DebugAnchor(maskState.NoseAnchor, maskState.NoseValid));
        material.SetVector(
            "_FoundationDebugChin",
            DebugAnchor(maskState.ChinAnchor, maskState.ChinValid));
        material.SetVector(
            "_FoundationDebugForehead",
            DebugAnchor(maskState.LowerForeheadAnchor, maskState.LowerForeheadValid));
        material.SetVector(
            "_FoundationDebugMouth",
            DebugAnchor(maskState.MouthAnchor, maskState.LipExclusionValid));
        ApplyBlendModeForDebug(state.DebugMaskMode);
        SetQuadVisible(true);
        MaybeLogState();
        return state;
    }

    private void EnsureCameraSubscription(Camera arCamera)
    {
        ARCameraManager nextManager = null;
        if (arCamera != null)
        {
            nextManager = arCamera.GetComponent<ARCameraManager>();
        }

        if (nextManager == null)
        {
            nextManager = FindFirstObjectByType<ARCameraManager>();
        }

        if (nextManager == cameraManager)
        {
            return;
        }

        UnsubscribeCameraManager();
        cameraManager = nextManager;
        if (cameraManager != null)
        {
            cameraManager.frameReceived += OnCameraFrameReceived;
        }
    }

    private void UnsubscribeCameraManager()
    {
        if (cameraManager != null)
        {
            cameraManager.frameReceived -= OnCameraFrameReceived;
            cameraManager = null;
        }
    }

    private void OnCameraFrameReceived(ARCameraFrameEventArgs eventArgs)
    {
        if (material == null
            || eventArgs.textures == null
            || eventArgs.propertyNameIds == null
            || eventArgs.textures.Count == 0
            || eventArgs.propertyNameIds.Count == 0)
        {
            cameraTextureMode = 0;
            cameraTextureCount = 0;
            cameraTextureSource = "none";
            return;
        }

        int count = Mathf.Min(eventArgs.textures.Count, eventArgs.propertyNameIds.Count);
        bool hasTextureY = false;
        bool hasTextureCbCr = false;
        Texture firstTexture = null;
        for (int i = 0; i < count; i++)
        {
            Texture2D texture = eventArgs.textures[i];
            if (texture == null)
            {
                continue;
            }

            int propertyId = eventArgs.propertyNameIds[i];
            material.SetTexture(propertyId, texture);
            if (firstTexture == null)
            {
                firstTexture = texture;
            }

            if (propertyId == TextureYId)
            {
                hasTextureY = true;
            }
            else if (propertyId == TextureCbCrId)
            {
                hasTextureCbCr = true;
            }
        }

        if (eventArgs.displayMatrix.HasValue)
        {
            material.SetMatrix(DisplayTransformId, eventArgs.displayMatrix.Value);
        }

        if (hasTextureY && hasTextureCbCr)
        {
            cameraTextureMode = 2;
            cameraTextureSource = "ARCameraManager.frameReceived:arkit_ycbcr";
        }
        else if (firstTexture != null)
        {
            material.SetTexture(CameraTexId, firstTexture);
            cameraTextureMode = 1;
            cameraTextureSource = "ARCameraManager.frameReceived:rgb_texture";
        }
        else
        {
            cameraTextureMode = 0;
            cameraTextureSource = "none";
            return;
        }

        cameraTextureCount = count;
        lastCameraTextureAt = Time.realtimeSinceStartup;
    }

    private bool HasFreshCameraTexture()
    {
        return cameraTextureMode > 0
            && lastCameraTextureAt > 0.0f
            && Time.realtimeSinceStartup - lastCameraTextureAt <= CameraTextureStaleSeconds;
    }

    private void EnsureMaskRuntime()
    {
        if (maskRuntime != null)
        {
            return;
        }

        maskRuntime = FindFirstObjectByType<FoundationMaskRuntime>();
        if (maskRuntime == null)
        {
            maskRuntime = gameObject.AddComponent<FoundationMaskRuntime>();
        }
    }

    private void EnsureMaterial()
    {
        if (material != null)
        {
            return;
        }

        Shader shader = Resources.Load<Shader>("ScreenSpaceFoundation")
            ?? Shader.Find("Hidden/MakeupAR/ScreenSpaceFoundation");
        if (shader == null)
        {
            return;
        }

        material = new Material(shader)
        {
            name = "ScreenSpaceFoundationMaterial"
        };
        material.renderQueue = FoundationRenderQueue;
        material.SetFloat("_FoundationMaskStrength", 1.0f);
        material.SetFloat("_FoundationMaskFeather", 0.0f);
    }

    private void EnsureQuad(Camera arCamera)
    {
        if (quadRenderer != null && quadFilter != null && quadMesh != null)
        {
            if (quadRenderer.sharedMaterial != material)
            {
                quadRenderer.sharedMaterial = material;
            }

            if (quadRenderer.transform.parent != arCamera.transform)
            {
                quadRenderer.transform.SetParent(arCamera.transform, false);
            }

            return;
        }

        GameObject quad = new GameObject("Screen Space Foundation");
        quad.transform.SetParent(arCamera.transform, false);
        quadFilter = quad.AddComponent<MeshFilter>();
        quadRenderer = quad.AddComponent<MeshRenderer>();
        quadRenderer.shadowCastingMode = ShadowCastingMode.Off;
        quadRenderer.receiveShadows = false;
        quadRenderer.allowOcclusionWhenDynamic = false;
        quadRenderer.sortingOrder = 70;
        quadRenderer.sharedMaterial = material;
        quadMesh = new Mesh
        {
            name = "Screen Space Foundation Quad"
        };
        quadMesh.MarkDynamic();
        quadFilter.sharedMesh = quadMesh;
        UpdateQuadGeometry(arCamera);
    }

    private void UpdateQuadGeometry(Camera arCamera)
    {
        if (quadMesh == null || arCamera == null)
        {
            return;
        }

        float distance = Mathf.Max(arCamera.nearClipPlane + 0.035f, 0.05f);
        float height = 2.0f * distance * Mathf.Tan(arCamera.fieldOfView * Mathf.Deg2Rad * 0.5f);
        float width = height * Mathf.Max(0.1f, arCamera.aspect);
        quadMesh.Clear();
        quadMesh.SetVertices(new[]
        {
            new Vector3(-width * 0.5f, -height * 0.5f, distance),
            new Vector3(width * 0.5f, -height * 0.5f, distance),
            new Vector3(-width * 0.5f, height * 0.5f, distance),
            new Vector3(width * 0.5f, height * 0.5f, distance),
        });
        quadMesh.SetUVs(0, new[]
        {
            new Vector2(0.0f, 0.0f),
            new Vector2(1.0f, 0.0f),
            new Vector2(0.0f, 1.0f),
            new Vector2(1.0f, 1.0f),
        });
        quadMesh.SetTriangles(new[] { 0, 2, 1, 2, 3, 1 }, 0);
        quadMesh.RecalculateBounds();
    }

    private void ApplyBlendModeForDebug(int debugMaskMode)
    {
        if (material == null)
        {
            return;
        }

        bool debugPreview = debugMaskMode > 0;
        material.SetInt("_SrcBlend", debugPreview ? (int)BlendMode.SrcAlpha : (int)BlendMode.One);
        material.SetInt("_DstBlend", debugPreview ? (int)BlendMode.OneMinusSrcAlpha : (int)BlendMode.Zero);
        material.SetInt("_ZWrite", 0);
        material.SetInt("_ZTest", (int)CompareFunction.Always);
        material.renderQueue = FoundationRenderQueue;
    }

    private void SetQuadVisible(bool visible)
    {
        if (quadRenderer != null)
        {
            quadRenderer.enabled = visible;
        }
    }

    private static Vector4 DebugAnchor(Vector2 anchor, bool valid)
    {
        return new Vector4(anchor.x, anchor.y, valid ? 1.0f : 0.0f, 0.0f);
    }

    private static ARFaceManager ResolveFaceManager(ARFaceManager faceManager)
    {
        return faceManager != null ? faceManager : FindFirstObjectByType<ARFaceManager>();
    }

    private static int CountFaces(ARFaceManager faceManager)
    {
        if (faceManager == null)
        {
            return 0;
        }

        int count = 0;
        foreach (ARFace face in faceManager.trackables)
        {
            if (face != null)
            {
                count++;
            }
        }

        return count;
    }

    private static ARFace FindTrackingFace(ARFaceManager faceManager)
    {
        if (faceManager == null)
        {
            return null;
        }

        foreach (ARFace face in faceManager.trackables)
        {
            if (face != null && face.trackingState == TrackingState.Tracking)
            {
                return face;
            }
        }

        return null;
    }

    private string ResolveFallbackRenderer()
    {
        return state.FallbackMode == "off" ? "off" : "uvMask";
    }

    private static string NormalizeMode(string mode)
    {
        return string.Equals(mode, "screenSpace", StringComparison.OrdinalIgnoreCase)
            || string.Equals(mode, "screen-space", StringComparison.OrdinalIgnoreCase)
            || string.Equals(mode, "screenspace", StringComparison.OrdinalIgnoreCase)
            ? "screenSpace"
            : "uvMask";
    }

    private static string NormalizeFallbackMode(string fallbackMode)
    {
        return string.Equals(fallbackMode, "off", StringComparison.OrdinalIgnoreCase)
            || string.Equals(fallbackMode, "none", StringComparison.OrdinalIgnoreCase)
            ? "off"
            : "uvMask";
    }

    private void MaybeLogState()
    {
        string signature =
            state.Enabled.ToString()
            + "|"
            + state.Mode
            + "|"
            + state.FallbackMode
            + "|"
            + state.ScreenSpaceActive.ToString()
            + "|"
            + state.CameraTextureAvailable.ToString()
            + "|"
            + state.ActiveRenderer
            + "|"
            + state.FallbackReason
            + "|"
            + state.DebugMaskMode.ToString(CultureInfo.InvariantCulture);
        if (signature == lastStateSignature && Time.unscaledTime < nextDiagnosticsLogAt)
        {
            return;
        }

        lastStateSignature = signature;
        nextDiagnosticsLogAt = Time.unscaledTime + DiagnosticsIntervalSeconds;
        Debug.Log(
            "[FoundationScreenSpace]"
            + " foundation.mode=" + state.Mode
            + " enabled=" + state.Enabled.ToString().ToLowerInvariant()
            + " mode=" + state.Mode
            + " fallbackMode=" + state.FallbackMode
            + " intensity=" + state.Intensity.ToString("0.###", CultureInfo.InvariantCulture)
            + " coverage=" + state.Coverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " evenness=" + state.Evenness.ToString("0.###", CultureInfo.InvariantCulture)
            + " luminanceInfluence=" + state.LuminanceInfluence.ToString("0.###", CultureInfo.InvariantCulture)
            + " debugMaskMode=" + state.DebugMaskMode.ToString(CultureInfo.InvariantCulture)
            + " opacityIncludedIntensity=" + state.Intensity.ToString("0.###", CultureInfo.InvariantCulture)
            + " provider=" + state.ProviderType
            + " providerReady=" + state.ProviderReady.ToString().ToLowerInvariant()
            + " productionReady=" + ProviderProductionReady.ToString().ToLowerInvariant()
            + " cameraTextureAvailable=" + state.CameraTextureAvailable.ToString().ToLowerInvariant()
            + " cameraTextureSource=" + state.CameraTextureSource
            + " cameraTextureCount=" + state.CameraTextureCount.ToString(CultureInfo.InvariantCulture)
            + " arFaceManagerFound=" + state.ArFaceManagerFound.ToString().ToLowerInvariant()
            + " faceCount=" + state.FaceCount.ToString(CultureInfo.InvariantCulture)
            + " trackingState=" + (state.TrackingState ?? "None")
            + " maskSource=" + (state.MaskSource ?? "none")
            + " projectedVertexCount=" + state.ProjectedVertexCount.ToString(CultureInfo.InvariantCulture)
            + " projectedTriangleCount=" + state.ProjectedTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " rawMaskAvailable=" + state.RawMaskAvailable.ToString().ToLowerInvariant()
            + " skinMaskAvailable=" + state.FinalMaskAvailable.ToString().ToLowerInvariant()
            + " finalMaskAvailable=" + state.FinalMaskAvailable.ToString().ToLowerInvariant()
            + " maskTextureAvailable=" + state.FinalMaskAvailable.ToString().ToLowerInvariant()
            + " maskChannelRFinalNonZero=" + state.MaskChannelRFinalNonZero.ToString().ToLowerInvariant()
            + " maskChannelABaseNonZero=" + state.MaskChannelABaseNonZero.ToString().ToLowerInvariant()
            + " maskChannelRMax=" + state.MaskChannelRMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskAverage=" + state.MaskAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " normalCorrectionEnabled=" + state.NormalCorrectionEnabled.ToString().ToLowerInvariant()
            + " maskResolution=" + state.MaskWidth.ToString(CultureInfo.InvariantCulture)
            + "x"
            + state.MaskHeight.ToString(CultureInfo.InvariantCulture)
            + " faceTracked=" + state.FaceTracked.ToString().ToLowerInvariant()
            + " activeRenderer=" + state.ActiveRenderer
            + " shaderPath=" + state.ShaderPath
            + " fallbackReason=" + state.FallbackReason);
    }
}
