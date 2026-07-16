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
        public float SkinSmoothStrength;
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
    // Temporal smoothing state for the half-face divider endpoints. ARKit
    // forehead/chin anchors carry per-frame tracking noise that makes the
    // centerline shake; a motion-adaptive EMA holds them steady when the head
    // is still and follows real motion without lag.
    private Vector2 smoothedForeheadAnchor;
    private Vector2 smoothedChinAnchor;
    private bool smoothedForeheadInit;
    private bool smoothedChinInit;
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

    // Screen-space lip recipe (Milestone 1). Routed from RN the SAME way as the
    // foundation recipe: E3RegionMaskOverlay reads recipes["lip"] and calls
    // ConfigureLipRecipe, which stashes these and pushes them to the composite
    // material in the recipe-config path. Camera gate tolerances have sane
    // defaults tuned off-device; final values need on-device tuning.
    private bool lipEnabled;
    private Color lipColor = new Color(0.85f, 0.29f, 0.45f, 1.0f);
    private float lipIntensity;
    private float lipGlossBoost;
    private float lipSpecular;
    private float lipMatteAmount;
    private const float LipGlossThreshold = 0.68f;
    // Lip DETAIL enhancement (screen-space ApplyLipTint): moderate, artifact-safe
    // defaults — micro-contrast dimension, high-freq striation texture, and a
    // subtle vermillion ombre. Rim kept low (0.22) so the border never reads muddy.
    private const float LipMicroContrast = 0.45f;
    private const float LipTextureAmount = 0.40f;
    private const float LipRimShade = 0.22f;
    // Open-mouth gate tolerances tuned CONSERVATIVE so the whole lip paints
    // (real lip highlights/creases survive); only extreme gap/teeth pixels drop.
    private const float MouthGapLuma = 0.06f;   // only a deep-dark mouth gap is cut
    private const float TeethLuma = 0.80f;      // only very bright pixels can be teeth
    private const float TeethSat = 0.05f;       // ...and only if near-neutral (lips keep red chroma)
    // Hysteresis for the foundation-independent attach gate: once the lip
    // (or foundation/skin-smooth) is active, keep the pass attached until the
    // intensity falls clearly below a lower threshold, so intensity dithering
    // near zero cannot toggle attach/detach every frame (flicker).
    private const float LipActivateThreshold = 0.02f;
    private const float LipDeactivateThreshold = 0.008f;
    private bool lipActiveHysteresis;

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
        // Milestone 1: the screen-space lip is foundation-independent. If the
        // FOUNDATION is disabled but a lip layer is active, keep the composite
        // pass requested/enabled so the lip still renders (foundation uniforms
        // are already at their off values). Only when the lip is inactive too
        // do we fully disable. Refresh the lip uniforms so _LipEnabled tracks
        // the current recipe even on the foundation-off path.
        EnsureMaterial();
        PushLipUniforms();
        if (LipRenderActive())
        {
            disabledReason = "foundation_off_lip_active";
            state.Requested = true;
            state.Enabled = true;
            // The compositor path is the screen-space renderer; force the mode
            // so UpdateRuntime does not early-out when foundation never set it.
            state.Mode = "screenSpace";
            // Foundation is OFF in this branch: zero its contribution on both
            // the state and the material so a previously-applied foundation
            // tint / skin smoothing does not linger while only the lip renders.
            // The lip tint (ApplyLipTint) is independent of these.
            state.Intensity = 0.0f;
            state.Coverage = 0.0f;
            state.SkinSmoothStrength = 0.0f;
            if (material != null)
            {
                material.SetFloat("_FoundationIntensity", 0.0f);
                material.SetFloat("_FoundationCoverage", 0.0f);
                material.SetFloat("_SkinSmoothStrength", 0.0f);
            }

            return;
        }

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
        float luminanceInfluence,
        float skinSmoothStrength,
        float halfFaceMode = 0.0f)
    {
        state.Requested = true;
        // 잡티 제거(skin smoothing) can run standalone: enable the screen-space
        // pass when the base is on OR when only blemish smoothing is requested,
        // so the slider works even at 0 foundation intensity. Milestone 1: the
        // screen-space LIP is also foundation-independent — the composite pass
        // must attach when the lip is active even if foundation intensity and
        // skin smoothing are both 0 (LipRenderActive carries the hysteresis).
        state.Enabled = (enabled && intensity > 0.0001f && opacity > 0.0001f)
            || skinSmoothStrength > 0.0001f
            || LipRenderActive();
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
        state.SkinSmoothStrength = Mathf.Clamp01(skinSmoothStrength);
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
        material.SetFloat("_SkinSmoothStrength", state.SkinSmoothStrength);
        material.SetFloat("_FoundationDebugMode", state.DebugMaskMode);
        // Half-face makeup flag. The composite frag ignores it (its maskUv is
        // screen space), but FoundationScreenSpaceCompositor reads it back off
        // this composite material each frame and forwards it to the
        // FoundationMaskWrite face/neck materials (which DO see canonical face
        // UV), so the written skin mask covers only one facial half. 0 = off
        // (exact no-op), 1 = keep face UV x < 0.5, 2 = keep x > 0.5.
        material.SetFloat("_HalfFaceMode", Mathf.Clamp(halfFaceMode, 0.0f, 2.0f));
        // Draw the face-following centerline divider whenever half-face mode is
        // active (either half). The composite frag reads this to blend the
        // forehead->chin line on top of the final color; 0 keeps it a no-op.
        // 반반(half-face) 가운데 분할선 제거 (사용자 요청): the left/right makeup
        // split itself is driven by _HalfFaceMode above, so forcing the divider
        // line OFF removes only the visual centerline and keeps 반반 makeup.
        material.SetFloat("_HalfFaceDivider", 0.0f);
        material.SetFloat("_ScreenSpaceUvFlip", DefaultScreenSpaceUvFlip);
        material.SetFloat("_ScreenSpaceUvFlipX", DefaultScreenSpaceUvFlipX);
        material.SetFloat(ActiveRendererModeId, 0.0f);
        material.SetFloat("_ProviderProductionReady", ProviderProductionReady ? 1.0f : 0.0f);
        // Keep the lip uniforms fresh on the composite material whenever the
        // foundation recipe is (re)configured, since foundation and lip share
        // this one material. Lip stays an exact no-op while _LipEnabled = 0.
        PushLipUniforms();
        ApplyBlendModeForDebug(state.DebugMaskMode);
    }

    /// <summary>
    /// Screen-space lip recipe (Milestone 1). Routed from RN via
    /// E3RegionMaskOverlay (mirrors the foundation ConfigureRecipe routing):
    /// the lip layer's color/opacity/glossBoost/specular/finish reach this
    /// controller so the composite shader can render the lip in screen space.
    /// finish glow => glossBoost 0.85 / specular 0.34 / matteAmount 0;
    /// finish matte => glossBoost 0 / matteAmount ~0.6. lipEnabled = a lip
    /// layer is present. All values null-safe; the shader early-outs when the
    /// lip is disabled or the coverage mask is near zero.
    /// </summary>
    public void ConfigureLipRecipe(
        bool enabled,
        Color color,
        float opacity,
        float glossBoost,
        float specular,
        float matteAmount,
        float halfFaceMode)
    {
        lipEnabled = enabled;
        lipColor = new Color(color.r, color.g, color.b, 1.0f);
        lipIntensity = Mathf.Clamp01(opacity);
        lipGlossBoost = Mathf.Clamp01(glossBoost);
        lipSpecular = Mathf.Clamp01(specular);
        lipMatteAmount = Mathf.Clamp01(matteAmount);

        EnsureMaterial();
        // The lip OWNS the half-face split when it drives the composite (lip-only
        // basic mode): the foundation's ConfigureRecipe is not called there, so
        // _HalfFaceMode would otherwise stay STUCK at a prior half-face session's
        // value and split the lip in basic mode. In basic mode halfFaceMode == 0
        // => an exact no-op; in 반반 mode it carries the same left/right split.
        if (material != null)
        {
            material.SetFloat("_HalfFaceMode", Mathf.Clamp(halfFaceMode, 0.0f, 2.0f));
            // 반반(half-face) 가운데 분할선 제거 (사용자 요청): the left/right makeup
        // split itself is driven by _HalfFaceMode above, so forcing the divider
        // line OFF removes only the visual centerline and keeps 반반 makeup.
        material.SetFloat("_HalfFaceDivider", 0.0f);
        }
        PushLipUniforms();
    }

    /// <summary>
    /// Disables the screen-space lip (no lip layer requested). Leaves the
    /// composite material's _LipEnabled at 0 so ApplyLipTint is an exact no-op.
    /// </summary>
    public void ConfigureLipDisabled()
    {
        lipEnabled = false;
        lipIntensity = 0.0f;
        EnsureMaterial();
        PushLipUniforms();
    }

    private void PushLipUniforms()
    {
        if (material == null)
        {
            return;
        }

        material.SetColor("_LipColor", lipColor);
        material.SetFloat("_LipIntensity", lipIntensity);
        material.SetFloat("_LipGlossBoost", lipGlossBoost);
        material.SetFloat("_LipSpecular", lipSpecular);
        material.SetFloat("_LipMatteAmount", lipMatteAmount);
        material.SetFloat("_LipMicroContrast", LipMicroContrast);
        material.SetFloat("_LipTextureAmount", LipTextureAmount);
        material.SetFloat("_LipRimShade", LipRimShade);
        material.SetFloat("_LipGlossThreshold", LipGlossThreshold);
        material.SetFloat("_MouthGapLuma", MouthGapLuma);
        material.SetFloat("_TeethLuma", TeethLuma);
        material.SetFloat("_TeethSat", TeethSat);
        material.SetFloat("_LipEnabled", LipRenderActive() ? 1.0f : 0.0f);
    }

    // Whether the screen-space lip should render this frame, with hysteresis so
    // intensity dithering near zero cannot toggle the tint (and, via the attach
    // gate below, the whole composite pass) every frame.
    private bool LipRenderActive()
    {
        if (!lipEnabled)
        {
            lipActiveHysteresis = false;
            return false;
        }

        if (lipActiveHysteresis)
        {
            // Stay active until intensity drops clearly below the low threshold.
            lipActiveHysteresis = lipIntensity > LipDeactivateThreshold;
        }
        else
        {
            lipActiveHysteresis = lipIntensity > LipActivateThreshold;
        }

        return lipActiveHysteresis;
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
            DebugAnchor(
                SmoothDividerAnchor(
                    maskState.ChinAnchor, maskState.ChinValid,
                    ref smoothedChinAnchor, ref smoothedChinInit),
                maskState.ChinValid));
        material.SetVector(
            "_FoundationDebugForehead",
            DebugAnchor(
                SmoothDividerAnchor(
                    maskState.LowerForeheadAnchor, maskState.LowerForeheadValid,
                    ref smoothedForeheadAnchor, ref smoothedForeheadInit),
                maskState.LowerForeheadValid));
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

    // TRACKED DEFECT (F9): this is the ONLY code that feeds hand-occlusion
    // uniforms into the screen-space foundation material, and it has ZERO
    // callers — screen-space foundation currently renders with hand occlusion
    // permanently disabled (shader defaults). Do NOT call this casually: it
    // unconditionally requests the E7 runtime and lazily AddComponents it,
    // which fights E3RegionMaskOverlay's ownership of SetRuntimeRequested.
    // Wiring this correctly = ownership + lifecycle work, not a hotfix.
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

    // Motion-adaptive EMA for a divider endpoint (screen-uv space). Holds the
    // point still under tracking noise (deadzone), follows real head motion,
    // and resets on (re)acquire so it doesn't lerp across a tracking gap.
    private static Vector2 SmoothDividerAnchor(
        Vector2 raw, bool valid, ref Vector2 smoothed, ref bool init)
    {
        if (!valid)
        {
            init = false;
            return raw;
        }

        if (!init)
        {
            smoothed = raw;
            init = true;
            return smoothed;
        }

        const float deadzone = 0.0015f;   // ~kill idle shimmer
        const float motionScale = 0.02f;  // uv delta at which we mostly snap
        float delta = Vector2.Distance(smoothed, raw);
        float follow = delta < deadzone
            ? 0.0f
            : Mathf.Lerp(0.12f, 0.85f, Mathf.Clamp01(delta / motionScale));
        smoothed = Vector2.Lerp(smoothed, raw, follow);
        return smoothed;
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
