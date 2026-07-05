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
    // SODA-style neck extension: how strongly neck/edge pixels are gated by
    // skin-chroma similarity, the chroma distance tolerance, and the maximum
    // foundation strength applied on the neck relative to the face.
    private const float NeckChromaGate = 0.85f;
    private const float NeckChromaTolerance = 0.16f;
    private const float NeckMaskStrength = 0.90f;
    private const float FaceChromaGate = 0.85f;
    private const float DefaultScreenSpaceUvFlip = 0.0f;
    private const float DefaultScreenSpaceUvFlipX = 0.0f;
    private static readonly int CameraTextureModeId = Shader.PropertyToID("_CameraTextureMode");
    private static readonly int CameraTexId = Shader.PropertyToID("_CameraTex");
    private static readonly int DisplayTransformId = Shader.PropertyToID("_UnityDisplayTransform");
    private static readonly int ActiveRendererModeId = Shader.PropertyToID("_FoundationActiveRendererMode");
    private static readonly int TextureYId = Shader.PropertyToID("_textureY");
    private static readonly int TextureCbCrId = Shader.PropertyToID("_textureCbCr");

    private FoundationMaskRuntime maskRuntime;
    private FoundationSemanticMaskCompositor semanticCompositor;
    private FoundationScreenSpaceCompositor screenSpaceCompositor;
    private VisionFaceParsingProvider visionParsingProvider;
    private E7VisionLipBoundaryRuntime visionStabilizerRuntime;
    private E7HandOcclusionRuntime handOcclusionRuntime;
    private int lastVisionStabilizerSequence = -1;
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
    private bool hasDisplayMatrix;
    private Matrix4x4 lastDisplayMatrix = Matrix4x4.identity;
    private float lastQuadDistance;
    private float lastQuadWidth;
    private float lastQuadHeight;

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
        // Modes 8-11 are mask-orientation probes used while calibrating the
        // screen-space mask against the ARKit camera feed. Mode 12 bypasses
        // the generated mask entirely and draws a shader-only asymmetric test
        // mask so we can distinguish display-path flips from mask-generation
        // flips. Modes 13-16 are 90-degree orientation probes. Mode 19 is a
        // shader-path confirmation fill.
        state.DebugMaskMode = Mathf.Clamp(debugMaskMode, 0, 42);
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
        material.SetFloat("_ScreenSpaceUvFlip", DefaultScreenSpaceUvFlip);
        material.SetFloat("_ScreenSpaceUvFlipX", DefaultScreenSpaceUvFlipX);
        material.SetFloat(ActiveRendererModeId, 0.0f);
        material.SetFloat("_ProviderProductionReady", ProviderProductionReady ? 1.0f : 0.0f);
        ApplyBlendModeForDebug(state.DebugMaskMode);
    }

    public ScreenSpaceFoundationState UpdateRuntime(ARFaceManager faceManager, Camera arCamera)
    {
        state.NormalCorrectionEnabled = false;
        bool semanticMode = state.Mode == "semantic";
        if (!state.Requested || !state.Enabled || (state.Mode != "screenSpace" && !semanticMode))
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

        Texture maskTexture;
        bool maskValid;
        string maskInvalidReason;
        bool semanticProviderActive = false;
        FoundationMaskRuntime.FoundationMaskState maskState = default;
        if (semanticMode)
        {
            // Semantic foundation: ARFace acts only as tracking + geometry
            // prior; the compositor decides the painted pixels from the
            // segmentation/skin masks (per-frame, screen UV space).
            EnsureSemanticCompositor();
            FoundationSemanticMaskCompositor.SemanticMaskState semanticState =
                semanticCompositor != null
                    ? semanticCompositor.UpdateSemanticMask(face, arCamera)
                    : default;
            maskTexture = semanticCompositor != null ? semanticCompositor.FinalMaskTexture : null;
            maskValid = semanticState.MaskValid && maskTexture != null;
            maskInvalidReason = semanticState.Status ?? "semantic_unavailable";
            // Full strength only with a TRUE semantic skin class; person-
            // segmentation-derived or chroma-fallback skin gets attenuated.
            semanticProviderActive = semanticState.SemanticSkinActive;
            state.MaskSource = "semantic_segmentation_composite:" + (semanticState.SkinSource ?? "none");
            state.MaskChannelRMax = maskValid ? 1.0f : 0.0f;
            state.MaskAverage = 0.0f;
            state.MaskChannelRFinalNonZero = maskValid;
            state.MaskChannelABaseNonZero = maskValid;
            state.ProjectedVertexCount = 0;
            state.ProjectedTriangleCount = 0;
        }
        else
        {
            // Vision face-parsing exclusions (async v2): the provider now
            // captures via a downscaled RT + AsyncGPUReadback and runs
            // Vision on a background queue, so requesting it here costs no
            // main-thread time (the old PNG path stalled the GPU pipeline
            // and encoded on the main thread — visible hitches). Hair/brow
            // masks land in the composite as exclusions; an exposed
            // forehead carries no hair pixels and stays painted.
            EnsureVisionParsingProvider();
            if (visionParsingProvider != null)
            {
                visionParsingProvider.RequestCapture();
            }

            bool segmentationActive = FoundationSegmentationRegistry.TryGetResult(
                arCamera, out FoundationSegmentationResult segmentation);
            bool hairMaskValid = segmentationActive
                && segmentation.HasHairClass
                && segmentation.HairMask != null;
            bool browMaskValid = segmentationActive
                && segmentation.HasEyebrowClass
                && segmentation.EyebrowMask != null;
            material.SetFloat("_SegHairValid", hairMaskValid ? 1.0f : 0.0f);
            if (hairMaskValid)
            {
                material.SetTexture("_SegHairTex", segmentation.HairMask);
            }

            material.SetFloat("_SegBrowValid", browMaskValid ? 1.0f : 0.0f);
            if (browMaskValid)
            {
                material.SetTexture("_SegBrowTex", segmentation.EyebrowMask);
            }

            // With live hair exclusion the static UV hairline fade narrows so
            // the upper forehead keeps coverage (the semantic mask owns hair).
            E3RegionMaskOverlay.SetFoundationSemanticHairActive(hairMaskValid);

            // Screen-space mode: project the calibrated canonical-UV skin
            // mask (tight eye openings, lip-texture lips, brow bands,
            // hairline fade) through the face UVs so the screen-space mask
            // carries precise exclusions — lips/eyes/brows stay clean.
            maskRuntime.UvSkinMaskOverride = state.FaceTracked
                ? E3RegionMaskOverlay.GetSharedFoundationSkinMask(face)
                : null;
            UpdateDisplayProjectionInputs();
            maskState = state.FaceTracked
                ? maskRuntime.UpdateMask(face, arCamera, state.DebugMaskMode)
                : maskRuntime.InvalidateMask(false, state.DebugMaskMode, "face_unavailable");
            // Probe self-diagnosis: mode 19 renders RED when the
            // display-matrix projection is live, BLUE when it silently fell
            // back to the legacy projection (missing intrinsics/matrix).
            material.SetFloat(
                "_DisplayProjectionActive",
                maskRuntime.DisplayProjectionActive ? 1.0f : 0.0f);
            state.MaskChannelRMax = maskState.MaskMax;
            state.MaskAverage = maskState.MaskAverage;
            state.MaskChannelRFinalNonZero = maskState.MaskMax > 0.025f;
            state.MaskChannelABaseNonZero = maskState.BaseFaceSurfaceMaskReady && maskState.ProjectedVertexCount > 0;
            state.MaskSource = maskState.MaskSource;
            state.ProjectedVertexCount = maskState.ProjectedVertexCount;
            state.ProjectedTriangleCount = maskState.ProjectedTriangleCount;
            maskTexture = maskRuntime.FoundationMaskTexture;
            // The compositor projects the real face mesh, so it needs no
            // screen-bounds validity: gate ONLY on live tracking. The old
            // DynamicMaskValid gate required the whole face inside the frame
            // (visible-vertex/bounds minimums), which wrongly disabled the
            // foundation when the face was half out of frame.
            maskValid = state.FaceTracked;
            maskInvalidReason = state.FaceTracked ? "none" : "face_not_tracking";
        }

        state.NormalCorrectionEnabled = false;
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
            state.FallbackReason = maskInvalidReason;
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

        // Fallback attenuation: without a real segmentation provider the mask
        // boundary is only prior+chroma-gate accurate, so reduce strength to
        // keep edges unobtrusive; full strength returns with a provider.
        if (semanticMode)
        {
            float opacityScale = semanticProviderActive ? 1.0f : 0.55f;
            float coverageScale = semanticProviderActive ? 1.0f : 0.65f;
            material.SetFloat("_FoundationIntensity", state.Intensity * opacityScale);
            material.SetFloat("_FoundationCoverage", state.Coverage * coverageScale);
        }

        material.SetTexture("_SkinMaskTex", maskTexture);
        // Reset the compositor's sampling-compensation uniforms so leaving
        // mode 24 never leaves a stale shift/scale on the quad path; the
        // compositor re-sets them every frame while it is active.
        material.SetVector("_MaskSampleShift", Vector4.zero);
        material.SetFloat("_MaskSampleScaleY", 1.0f);
        material.SetFloat("_MaskFaceCenterY", 0.5f);
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

        // Prefer the CommandBuffer + DrawRenderer compositor for all normal
        // screen-space foundation rendering. It draws the live ARFace mesh in
        // the AR camera pass, so the mask uses the same final camera matrices
        // as the visible frame. The old near-camera Quad remains a fallback
        // only when the compositor cannot run.
        bool cbCompositeActive = false;
        if (!semanticMode && state.FaceTracked && face != null)
        {
            EnsureScreenSpaceCompositor();
            material.SetFloat(ActiveRendererModeId, 1.0f);
            cbCompositeActive = screenSpaceCompositor != null
                && screenSpaceCompositor.UpdateCompositor(
                    arCamera,
                    face,
                    material,
                    E3RegionMaskOverlay.GetSharedFoundationSkinMask(face));
            if (cbCompositeActive)
            {
                state.ActiveRenderer = "screenSpaceCommandBuffer";
                state.ShaderPath = "command_buffer_draw_renderer";
                state.FallbackReason = "none";
            }
            else
            {
                state.FallbackReason = "command_buffer_unavailable_quad_fallback";
                material.SetFloat(ActiveRendererModeId, 0.0f);
            }
        }
        else if (screenSpaceCompositor != null)
        {
            screenSpaceCompositor.Deactivate();
        }

        material.SetFloat(ActiveRendererModeId, cbCompositeActive ? 1.0f : 0.0f);
        if (!cbCompositeActive)
        {
            EnsureQuad(arCamera);
            UpdateQuadGeometry(arCamera);
        }

        SetQuadVisible(!cbCompositeActive);
        MaybeLogState();
        return state;
    }

    /// <summary>
    /// Feeds the mask runtime the ARKit display matrix (the exact transform
    /// the camera feed is rendered with) and the sensor intrinsics for the
    /// orientation-proof projection path (debug mode 19). Intrinsics can be
    /// momentarily unavailable; the runtime falls back to the legacy
    /// WorldToViewportPoint projection in that case.
    /// </summary>
    private void UpdateDisplayProjectionInputs()
    {
        if (maskRuntime == null)
        {
            return;
        }

        bool intrinsicsValid = false;
        Vector2 focal = Vector2.zero;
        Vector2 principal = Vector2.zero;
        Vector2Int resolution = Vector2Int.zero;
        if (cameraManager != null
            && cameraManager.TryGetIntrinsics(out XRCameraIntrinsics intrinsics))
        {
            focal = intrinsics.focalLength;
            principal = intrinsics.principalPoint;
            resolution = intrinsics.resolution;
            intrinsicsValid = true;
        }

        maskRuntime.ConfigureDisplayProjection(
            lastDisplayMatrix,
            hasDisplayMatrix,
            focal,
            principal,
            resolution,
            intrinsicsValid);
    }

    private bool cameraPoseUpdateModeApplied;

    /// <summary>
    /// The screen-space mask is projected with the camera pose available at
    /// Update time, but TrackedPoseDriver by default applies one more pose
    /// update right before rendering ("Update &amp; Before Render"). That gap
    /// makes the mask trail the face whenever the phone moves. Forcing the
    /// driver to Update-only keeps the rendered camera pose identical to the
    /// pose the mask was projected with, so the mask stays glued.
    /// </summary>
    private void EnsureCameraPoseUpdateOnly(Camera arCamera)
    {
        if (cameraPoseUpdateModeApplied || arCamera == null)
        {
            return;
        }

        cameraPoseUpdateModeApplied = true;

        UnityEngine.InputSystem.XR.TrackedPoseDriver inputSystemDriver =
            arCamera.GetComponent<UnityEngine.InputSystem.XR.TrackedPoseDriver>();
        if (inputSystemDriver != null
            && inputSystemDriver.updateType != UnityEngine.InputSystem.XR.TrackedPoseDriver.UpdateType.Update)
        {
            inputSystemDriver.updateType = UnityEngine.InputSystem.XR.TrackedPoseDriver.UpdateType.Update;
            Debug.Log("[FoundationScreenSpace] camera_pose_update_mode=update_only source=input_system");
        }

        UnityEngine.SpatialTracking.TrackedPoseDriver legacyDriver =
            arCamera.GetComponent<UnityEngine.SpatialTracking.TrackedPoseDriver>();
        if (legacyDriver != null
            && legacyDriver.updateType != UnityEngine.SpatialTracking.TrackedPoseDriver.UpdateType.Update)
        {
            legacyDriver.updateType = UnityEngine.SpatialTracking.TrackedPoseDriver.UpdateType.Update;
            Debug.Log("[FoundationScreenSpace] camera_pose_update_mode=update_only source=legacy");
        }
    }

    private void UpdateVisionStabilizer()
    {
        if (visionStabilizerRuntime == null)
        {
            visionStabilizerRuntime = FindFirstObjectByType<E7VisionLipBoundaryRuntime>();
            if (visionStabilizerRuntime == null)
            {
                visionStabilizerRuntime = gameObject.AddComponent<E7VisionLipBoundaryRuntime>();
                visionStabilizerRuntime.Configure(FindFirstObjectByType<RNBridge>());
            }
        }

        // Keep the 5fps Vision capture loop alive while foundation is active.
        visionStabilizerRuntime.SetRuntimeRequested(true);

        if (!visionStabilizerRuntime.TryGetLatestBoundary(
                Screen.width,
                Screen.height,
                out E7VisionLipBoundaryRuntime.BoundarySnapshot snapshot))
        {
            return;
        }

        if (!snapshot.FaceBoundsAvailable || snapshot.Sequence == lastVisionStabilizerSequence)
        {
            return;
        }

        lastVisionStabilizerSequence = snapshot.Sequence;
        maskRuntime.ApplyVisionFaceObservation(
            snapshot.DetectedAtMs,
            snapshot.FaceBoundsCenter,
            Screen.width,
            Screen.height);
        if (screenSpaceCompositor != null)
        {
            screenSpaceCompositor.ApplyVisionFaceObservation(
                snapshot.DetectedAtMs,
                snapshot.FaceBoundsCenter,
                snapshot.FaceBoundsSize,
                Screen.width,
                Screen.height);
        }
    }

    private void UpdateHandOcclusion(Rect faceViewportBounds)
    {
        if (handOcclusionRuntime == null)
        {
            handOcclusionRuntime = FindFirstObjectByType<E7HandOcclusionRuntime>();
            if (handOcclusionRuntime == null)
            {
                handOcclusionRuntime = gameObject.AddComponent<E7HandOcclusionRuntime>();
            }
        }

        handOcclusionRuntime.SetRuntimeRequested(true);

        // ROI = whole face area (top-left pixel rect), so a hand anywhere
        // over the face counts as occluding — not just near the mouth.
        float screenWidth = Mathf.Max(1.0f, Screen.width);
        float screenHeight = Mathf.Max(1.0f, Screen.height);
        if (faceViewportBounds.width > 0.01f && faceViewportBounds.height > 0.01f)
        {
            handOcclusionRuntime.UpdateMouthScreenBounds(new Rect(
                faceViewportBounds.xMin * screenWidth,
                (1.0f - faceViewportBounds.yMax) * screenHeight,
                faceViewportBounds.width * screenWidth,
                faceViewportBounds.height * screenHeight));
        }

        E7HandOcclusionRuntime.HandOcclusionState handState = handOcclusionRuntime.CurrentState;
        bool enabled = handState.HandNearMouth
            && (handState.HasHandMask || handState.HasOcclusionRect);
        material.SetFloat("_HandOcclusionEnabled", enabled ? 1.0f : 0.0f);
        if (!enabled)
        {
            return;
        }

        if (handOcclusionRuntime.HandMaskTexture != null)
        {
            material.SetTexture("_HandOcclusionMaskTex", handOcclusionRuntime.HandMaskTexture);
        }

        bool useRect = handState.HasOcclusionRect && !handState.HasHandMask;
        material.SetFloat("_HandOcclusionUseRect", useRect ? 1.0f : 0.0f);
        if (useRect)
        {
            Rect rect = handState.ScreenRect;
            material.SetVector("_HandOcclusionRect", new Vector4(
                Mathf.Clamp01(rect.xMin / screenWidth),
                Mathf.Clamp01(1.0f - rect.yMax / screenHeight),
                Mathf.Clamp01(rect.xMax / screenWidth),
                Mathf.Clamp01(1.0f - rect.yMin / screenHeight)));
        }
    }

    private void EnsureCameraSubscription(Camera arCamera)
    {
        EnsureCameraPoseUpdateOnly(arCamera);
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
            lastDisplayMatrix = eventArgs.displayMatrix.Value;
            hasDisplayMatrix = true;
            material.SetMatrix(DisplayTransformId, lastDisplayMatrix);
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

    private void EnsureSemanticCompositor()
    {
        if (semanticCompositor != null)
        {
            return;
        }

        semanticCompositor = FindFirstObjectByType<FoundationSemanticMaskCompositor>();
        if (semanticCompositor == null)
        {
            semanticCompositor = gameObject.AddComponent<FoundationSemanticMaskCompositor>();
        }
    }

    private void EnsureVisionParsingProvider()
    {
        if (visionParsingProvider != null)
        {
            return;
        }

        visionParsingProvider = FindFirstObjectByType<VisionFaceParsingProvider>();
        if (visionParsingProvider == null)
        {
            visionParsingProvider = gameObject.AddComponent<VisionFaceParsingProvider>();
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
        // Widens the silhouette blur in the composite shader (~15px fade
        // band) so the face outline reads as painted skin, not a pasted-on
        // mask edge.
        material.SetFloat("_FoundationMaskFeather", 0.35f);
        material.SetFloat("_ScreenSpaceUvFlip", DefaultScreenSpaceUvFlip);
        material.SetFloat("_ScreenSpaceUvFlipX", DefaultScreenSpaceUvFlipX);
        material.SetFloat(ActiveRendererModeId, 0.0f);
        material.SetFloat("_NeckChromaGate", NeckChromaGate);
        material.SetFloat("_NeckChromaTolerance", NeckChromaTolerance);
        material.SetFloat("_NeckMaskStrength", NeckMaskStrength);
        // Per-pixel live skin gate over the whole face: locks the visible
        // foundation boundary to the camera image (no anchor-jitter shake)
        // and keeps bangs/glasses/background clean between Vision updates.
        material.SetFloat("_FaceChromaGate", FaceChromaGate);
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
        lastQuadDistance = distance;
        lastQuadWidth = width;
        lastQuadHeight = height;
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

        if (!visible && screenSpaceCompositor != null && !state.ScreenSpaceActive)
        {
            screenSpaceCompositor.Deactivate();
        }
    }

    private void EnsureScreenSpaceCompositor()
    {
        if (screenSpaceCompositor != null)
        {
            return;
        }

        screenSpaceCompositor = FindFirstObjectByType<FoundationScreenSpaceCompositor>();
        if (screenSpaceCompositor == null)
        {
            screenSpaceCompositor = gameObject.AddComponent<FoundationScreenSpaceCompositor>();
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
        if (string.Equals(mode, "semantic", StringComparison.OrdinalIgnoreCase)
            || string.Equals(mode, "segmentation", StringComparison.OrdinalIgnoreCase)
            || string.Equals(mode, "semanticFoundation", StringComparison.OrdinalIgnoreCase)
            || string.Equals(mode, "segmentationFoundation", StringComparison.OrdinalIgnoreCase))
        {
            return "semantic";
        }

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
            + " fallbackReason=" + state.FallbackReason
            + " materialShader="
            + (material != null && material.shader != null ? material.shader.name : "none")
            + " srcBlend="
            + (material != null ? material.GetInt("_SrcBlend").ToString(CultureInfo.InvariantCulture) : "none")
            + " dstBlend="
            + (material != null ? material.GetInt("_DstBlend").ToString(CultureInfo.InvariantCulture) : "none")
            + " activeRendererMode="
            + (material != null
                ? material.GetFloat(ActiveRendererModeId).ToString("0.###", CultureInfo.InvariantCulture)
                : "none"));
        MaybeLogProjectionDiagnostics();
    }

    private void MaybeLogProjectionDiagnostics()
    {
        Camera arCamera = currentCamera;
        if (arCamera == null)
        {
            Debug.Log("[FoundationProjection] camera=null");
            return;
        }

        Matrix4x4 projection = arCamera.projectionMatrix;
        float matrixAspect = Mathf.Abs(projection.m00) > 0.000001f
            ? Mathf.Abs(projection.m11 / projection.m00)
            : 0.0f;
        float verticalFovFromProjection = Mathf.Abs(projection.m11) > 0.000001f
            ? 2.0f * Mathf.Atan(1.0f / Mathf.Abs(projection.m11)) * Mathf.Rad2Deg
            : 0.0f;
        float horizontalFovFromProjection = Mathf.Abs(projection.m00) > 0.000001f
            ? 2.0f * Mathf.Atan(1.0f / Mathf.Abs(projection.m00)) * Mathf.Rad2Deg
            : 0.0f;
        float cameraAspect = Mathf.Max(0.0001f, arCamera.aspect);
        float screenAspect = Screen.height > 0 ? Screen.width / (float)Screen.height : 0.0f;
        float pixelAspect = arCamera.pixelHeight > 0
            ? arCamera.pixelWidth / (float)arCamera.pixelHeight
            : 0.0f;
        float quadAspect = lastQuadHeight > 0.000001f ? lastQuadWidth / lastQuadHeight : 0.0f;
        float maskAspect = state.MaskHeight > 0 ? state.MaskWidth / (float)state.MaskHeight : 0.0f;
        float fovDelta = arCamera.fieldOfView - verticalFovFromProjection;
        float cameraMatrixAspectDelta = cameraAspect - matrixAspect;
        float quadMatrixAspectDelta = quadAspect - matrixAspect;
        bool asymmetricProjection =
            Mathf.Abs(projection.m02) > 0.0005f
            || Mathf.Abs(projection.m12) > 0.0005f;
        bool fovMismatch = Mathf.Abs(fovDelta) > 0.05f;
        bool aspectMismatch =
            Mathf.Abs(cameraMatrixAspectDelta) > 0.002f
            || Mathf.Abs(quadMatrixAspectDelta) > 0.002f;

        Debug.Log(
            "[FoundationProjection]"
            + " arFov=" + arCamera.fieldOfView.ToString("0.###", CultureInfo.InvariantCulture)
            + " projectionFovV=" + verticalFovFromProjection.ToString("0.###", CultureInfo.InvariantCulture)
            + " projectionFovH=" + horizontalFovFromProjection.ToString("0.###", CultureInfo.InvariantCulture)
            + " fovDelta=" + fovDelta.ToString("0.###", CultureInfo.InvariantCulture)
            + " arAspect=" + cameraAspect.ToString("0.####", CultureInfo.InvariantCulture)
            + " matrixAspect=" + matrixAspect.ToString("0.####", CultureInfo.InvariantCulture)
            + " pixelAspect=" + pixelAspect.ToString("0.####", CultureInfo.InvariantCulture)
            + " screenAspect=" + screenAspect.ToString("0.####", CultureInfo.InvariantCulture)
            + " quadAspect=" + quadAspect.ToString("0.####", CultureInfo.InvariantCulture)
            + " cameraMatrixAspectDelta=" + cameraMatrixAspectDelta.ToString("0.####", CultureInfo.InvariantCulture)
            + " quadMatrixAspectDelta=" + quadMatrixAspectDelta.ToString("0.####", CultureInfo.InvariantCulture)
            + " projectionM00=" + projection.m00.ToString("0.#####", CultureInfo.InvariantCulture)
            + " projectionM11=" + projection.m11.ToString("0.#####", CultureInfo.InvariantCulture)
            + " projectionM02=" + projection.m02.ToString("0.#####", CultureInfo.InvariantCulture)
            + " projectionM12=" + projection.m12.ToString("0.#####", CultureInfo.InvariantCulture)
            + " asymmetricProjection=" + asymmetricProjection.ToString().ToLowerInvariant()
            + " fovMismatch=" + fovMismatch.ToString().ToLowerInvariant()
            + " aspectMismatch=" + aspectMismatch.ToString().ToLowerInvariant()
            + " near=" + arCamera.nearClipPlane.ToString("0.###", CultureInfo.InvariantCulture)
            + " far=" + arCamera.farClipPlane.ToString("0.###", CultureInfo.InvariantCulture)
            + " quadDistance=" + lastQuadDistance.ToString("0.###", CultureInfo.InvariantCulture)
            + " quadSize=" + lastQuadWidth.ToString("0.###", CultureInfo.InvariantCulture)
            + "x"
            + lastQuadHeight.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskAspect=" + maskAspect.ToString("0.####", CultureInfo.InvariantCulture)
            + " maskResolution=" + state.MaskWidth.ToString(CultureInfo.InvariantCulture)
            + "x"
            + state.MaskHeight.ToString(CultureInfo.InvariantCulture)
            + " cameraPixel=" + arCamera.pixelWidth.ToString(CultureInfo.InvariantCulture)
            + "x"
            + arCamera.pixelHeight.ToString(CultureInfo.InvariantCulture)
            + " screen=" + Screen.width.ToString(CultureInfo.InvariantCulture)
            + "x"
            + Screen.height.ToString(CultureInfo.InvariantCulture)
            + " cameraRect=" + FormatRect(arCamera.rect)
            + " pixelRect=" + FormatRect(arCamera.pixelRect)
            + " poseDriver=" + ResolvePoseDriverMode(arCamera)
            + " displayMatrix=" + (hasDisplayMatrix ? FormatDisplayMatrix(lastDisplayMatrix) : "none"));
    }

    private static string ResolvePoseDriverMode(Camera arCamera)
    {
        if (arCamera == null)
        {
            return "none";
        }

        string inputMode = "none";
        UnityEngine.InputSystem.XR.TrackedPoseDriver inputSystemDriver =
            arCamera.GetComponent<UnityEngine.InputSystem.XR.TrackedPoseDriver>();
        if (inputSystemDriver != null)
        {
            inputMode = inputSystemDriver.updateType.ToString();
        }

        string legacyMode = "none";
        UnityEngine.SpatialTracking.TrackedPoseDriver legacyDriver =
            arCamera.GetComponent<UnityEngine.SpatialTracking.TrackedPoseDriver>();
        if (legacyDriver != null)
        {
            legacyMode = legacyDriver.updateType.ToString();
        }

        return "input=" + inputMode + ",legacy=" + legacyMode;
    }

    private static string FormatDisplayMatrix(Matrix4x4 matrix)
    {
        return "m00:"
            + matrix.m00.ToString("0.####", CultureInfo.InvariantCulture)
            + ",m01:"
            + matrix.m01.ToString("0.####", CultureInfo.InvariantCulture)
            + ",m03:"
            + matrix.m03.ToString("0.####", CultureInfo.InvariantCulture)
            + ",m10:"
            + matrix.m10.ToString("0.####", CultureInfo.InvariantCulture)
            + ",m11:"
            + matrix.m11.ToString("0.####", CultureInfo.InvariantCulture)
            + ",m13:"
            + matrix.m13.ToString("0.####", CultureInfo.InvariantCulture);
    }

    private static string FormatRect(Rect rect)
    {
        return rect.x.ToString("0.###", CultureInfo.InvariantCulture)
            + ":"
            + rect.y.ToString("0.###", CultureInfo.InvariantCulture)
            + ":"
            + rect.width.ToString("0.###", CultureInfo.InvariantCulture)
            + ":"
            + rect.height.ToString("0.###", CultureInfo.InvariantCulture);
    }
}
