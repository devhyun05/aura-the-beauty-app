using System.Globalization;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

/// <summary>
/// Builds the final semantic foundation mask each frame in downsampled
/// screen UV space:
///
///   finalMask = geometryPrior(ARFace mesh + neck skirt, projected)
///             * skinMask (segmentation provider, else chroma skin gate)
///             * confidence
///             * (1 - dilate(hair|lip|eye|brow|segOcclusion))
///             * (1 - handOcclusion)
///             + asymmetric temporal smoothing (shrink fast, grow smooth)
///
/// ARFace is used ONLY as tracking + geometry prior (face ROI, jawline,
/// neck candidate); what actually gets painted is decided by the
/// segmentation/skin masks, per the semantic-foundation design.
/// The compositor runs at ~256px (single pass, ping-pong RTs) and the
/// result is consumed by ScreenSpaceFoundationController's composite quad.
/// </summary>
public sealed class FoundationSemanticMaskCompositor : MonoBehaviour
{
    public struct SemanticMaskState
    {
        public bool MaskValid;
        public bool FaceTracked;
        public bool ProviderActive;

        /// <summary>
        /// True only when the provider exposes a TRUE semantic skin class
        /// (person-segmentation-derived skin does not count). Full foundation
        /// strength is only used when this is true.
        /// </summary>
        public bool SemanticSkinActive;
        public string SkinSource;
        public string Status;
    }

    private const int MaskBaseWidth = 256;
    private const float CameraTextureStaleSeconds = 0.5f;
    private const float MaskHoldSeconds = 0.35f;
    private const float DiagnosticsIntervalSeconds = 1.0f;

    private FoundationMaskRuntime maskRuntime;
    private E7HandOcclusionRuntime handOcclusionRuntime;
    private VisionFaceParsingProvider visionParsingProvider;
    private Material compositeMaterial;
    private Material blurMaterial;
    private RenderTexture maskPing;
    private RenderTexture maskPong;
    private RenderTexture priorBlurTemp;
    private RenderTexture priorSoft;
    private bool pingIsCurrent;
    private SemanticMaskState state;
    private float lastValidAt = -10.0f;
    private float nextDiagnosticsAt;

    private ARCameraManager cameraManager;
    private int cameraTextureMode;
    private float cameraTextureAt = -10.0f;
    private Matrix4x4 cameraDisplayTransform = Matrix4x4.identity;
    private Texture cameraTextureY;
    private Texture cameraTextureCbCr;
    private Texture cameraTextureRgb;

    private Vector4 skinRefA = new Vector4(0.5f, 0.5f, 0.0f, 0.0f);
    private Vector4 skinRefB = new Vector4(0.5f, 0.5f, 0.0f, 0.0f);
    private Vector4 skinRefC = new Vector4(0.5f, 0.5f, 0.0f, 0.0f);

    private static readonly int SourceTextureYId = Shader.PropertyToID("_textureY");
    private static readonly int SourceTextureCbCrId = Shader.PropertyToID("_textureCbCr");

    public Texture FinalMaskTexture => pingIsCurrent ? maskPing : maskPong;
    public SemanticMaskState CurrentState => state;

    private void OnDestroy()
    {
        UnsubscribeCameraManager();
        ReleaseRenderTexture(ref maskPing);
        ReleaseRenderTexture(ref maskPong);
        ReleaseRenderTexture(ref priorBlurTemp);
        ReleaseRenderTexture(ref priorSoft);
    }

    public SemanticMaskState UpdateSemanticMask(ARFace face, Camera arCamera)
    {
        EnsureResources();
        EnsureCameraSubscription();

        bool faceTracked = face != null && face.trackingState == TrackingState.Tracking;
        state.FaceTracked = faceTracked;

        if (compositeMaterial == null || maskPing == null || maskPong == null || maskRuntime == null)
        {
            state.MaskValid = false;
            state.Status = "resources_unavailable";
            MaybeLog();
            return state;
        }

        // 1. Geometry prior: projected face mesh + neck skirt. The calibrated
        //    canonical-UV skin mask (tight eyes, lip-texture lips, brows,
        //    hairline fade) is projected through the face UVs so the prior
        //    carries precise exclusions in screen space.
        maskRuntime.UvSkinMaskOverride = faceTracked
            ? E3RegionMaskOverlay.GetSharedFoundationSkinMask(face)
            : null;
        FoundationMaskRuntime.FoundationMaskState priorState = faceTracked && arCamera != null
            ? maskRuntime.UpdateMask(face, arCamera, 0)
            : maskRuntime.InvalidateMask(faceTracked, 0, "face_unavailable");
        Texture priorTexture = maskRuntime.FoundationMaskTexture;
        bool priorValid = priorState.DynamicMaskValid && priorTexture != null;

        // 2. Segmentation provider (skin/hair/lip/eye/brow/occlusion masks).
        //    The Vision face-parsing provider registers itself once its first
        //    frame lands; until then the chroma fallback carries the skin
        //    decision. Requesting every frame keeps its capture loop alive
        //    only while semantic foundation is actually active.
        if (visionParsingProvider != null)
        {
            visionParsingProvider.RequestCapture();
        }

        bool providerActive = FoundationSegmentationRegistry.TryGetResult(
            arCamera,
            out FoundationSegmentationResult segmentation);
        state.ProviderActive = providerActive;
        bool semanticSkin = providerActive
            && segmentation.HasSkinClass
            && segmentation.SkinMask != null;
        state.SemanticSkinActive = semanticSkin;
        state.SkinSource = semanticSkin
            ? "semantic_skin:" + FoundationSegmentationRegistry.ActiveProviderName
            : (providerActive
                ? "chroma_gate+region:" + FoundationSegmentationRegistry.ActiveProviderName
                : "chroma_skin_gate_fallback");

        // 3. Live skin reference anchors for the fallback gate.
        UpdateSkinReferenceAnchors(face, arCamera);
        bool cameraFresh = cameraTextureMode > 0
            && Time.realtimeSinceStartup - cameraTextureAt <= CameraTextureStaleSeconds;

        // 4. Composite into the back buffer.
        RenderTexture previous = pingIsCurrent ? maskPing : maskPong;
        RenderTexture target = pingIsCurrent ? maskPong : maskPing;

        // Soft prior: separable 5-tap blur so the geometry silhouette becomes
        // a wide feather instead of a visible edge (exclusions are
        // re-subtracted after the blur inside the composite pass).
        Texture priorInput = priorValid ? priorTexture : (Texture)Texture2D.blackTexture;
        if (blurMaterial != null && priorBlurTemp != null && priorSoft != null)
        {
            blurMaterial.SetVector("_BlurDirection", new Vector4(1.0f, 0.0f, 0.0f, 0.0f));
            Graphics.Blit(priorInput, priorBlurTemp, blurMaterial);
            blurMaterial.SetVector("_BlurDirection", new Vector4(0.0f, 1.0f, 0.0f, 0.0f));
            Graphics.Blit(priorBlurTemp, priorSoft, blurMaterial);
            compositeMaterial.SetTexture("_PriorSoftTex", priorSoft);
        }
        else
        {
            compositeMaterial.SetTexture("_PriorSoftTex", priorInput);
        }

        compositeMaterial.SetTexture("_PriorTex", priorValid ? priorTexture : Texture2D.blackTexture);
        compositeMaterial.SetTexture("_PrevTex", previous);
        compositeMaterial.SetFloat("_SkinGateFallbackEnabled", cameraFresh ? 1.0f : 0.0f);
        compositeMaterial.SetFloat("_SkinGateCameraMode", cameraFresh ? cameraTextureMode : 0.0f);
        compositeMaterial.SetMatrix("_SkinGateDisplayTransform", cameraDisplayTransform);
        if (cameraTextureY != null)
        {
            compositeMaterial.SetTexture("_SkinGateTexY", cameraTextureY);
        }

        if (cameraTextureCbCr != null)
        {
            compositeMaterial.SetTexture("_SkinGateTexCbCr", cameraTextureCbCr);
        }

        if (cameraTextureRgb != null)
        {
            compositeMaterial.SetTexture("_SkinGateCameraTex", cameraTextureRgb);
        }

        compositeMaterial.SetVector("_SkinGateRefA", skinRefA);
        compositeMaterial.SetVector("_SkinGateRefB", skinRefB);
        compositeMaterial.SetVector("_SkinGateRefC", skinRefC);
        compositeMaterial.SetFloat("_SkinGateTolerance", 0.14f);
        compositeMaterial.SetFloat("_SkinSemanticValid", semanticSkin ? 1.0f : 0.0f);

        // Profile-view fade: far-side prior fades as the head yaws so the
        // silhouette never reads as a hard sticker edge from the side.
        float yaw01 = 0.0f;
        float faceCenterU = 0.5f;
        float faceHalfWidthU = 0.25f;
        if (faceTracked && arCamera != null)
        {
            Vector3 faceForward = arCamera.transform.InverseTransformDirection(face.transform.forward);
            float yawDegrees = Mathf.Atan2(
                faceForward.x,
                Mathf.Max(0.001f, Mathf.Abs(faceForward.z))) * Mathf.Rad2Deg;
            yaw01 = Mathf.Clamp(yawDegrees / 45.0f, -1.0f, 1.0f);
            Vector3 faceViewport = arCamera.WorldToViewportPoint(face.transform.position);
            if (faceViewport.z > 0.0f)
            {
                faceCenterU = Mathf.Clamp01(faceViewport.x);
            }

            if (skinRefA.z > 0.5f && skinRefB.z > 0.5f)
            {
                faceHalfWidthU = Mathf.Max(0.08f, Mathf.Abs(skinRefA.x - skinRefB.x) * 0.9f);
            }
        }

        compositeMaterial.SetVector(
            "_ProfileFade",
            new Vector4(yaw01, faceCenterU, faceHalfWidthU, 0.0f));

        BindSegmentationMask(segmentation.SkinMask, providerActive, "_SegSkinTex", "_SegSkinValid");
        BindSegmentationMask(segmentation.HairMask, providerActive, "_SegHairTex", "_SegHairValid");
        BindSegmentationMask(segmentation.LipMask, providerActive, "_SegLipTex", "_SegLipValid");
        BindSegmentationMask(segmentation.EyeMask, providerActive, "_SegEyeTex", "_SegEyeValid");
        BindSegmentationMask(segmentation.EyebrowMask, providerActive, "_SegBrowTex", "_SegBrowValid");
        BindSegmentationMask(segmentation.OcclusionMask, providerActive, "_SegOcclusionTex", "_SegOcclusionValid");
        BindSegmentationMask(segmentation.ConfidenceMask, providerActive, "_SegConfidenceTex", "_SegConfidenceValid");

        ApplyHandOcclusion(face, arCamera);

        float texelU = 1.5f / target.width;
        float texelV = 1.5f / target.height;
        compositeMaterial.SetVector("_FeatherTexel", new Vector4(texelU, texelV, 0.0f, 0.0f));
        compositeMaterial.SetVector(
            "_ExclusionDilateTexel",
            new Vector4(texelU * 1.6f, texelV * 1.6f, 0.0f, 0.0f));
        compositeMaterial.SetFloat("_TemporalRise", 0.38f);
        compositeMaterial.SetFloat("_TemporalFall", 0.62f);

        Graphics.Blit(null, target, compositeMaterial);
        pingIsCurrent = !pingIsCurrent;

        if (priorValid)
        {
            lastValidAt = Time.realtimeSinceStartup;
        }

        // The mask itself fades out via temporal smoothing when the prior
        // disappears; report invalid only after a short hold window.
        state.MaskValid = priorValid
            || (lastValidAt > 0.0f && Time.realtimeSinceStartup - lastValidAt <= MaskHoldSeconds);
        state.Status = priorValid
            ? "composited"
            : (state.MaskValid ? "fading_out" : priorState.Status);
        MaybeLog();
        return state;
    }

    private void BindSegmentationMask(
        Texture texture,
        bool providerActive,
        string textureProperty,
        string validProperty)
    {
        bool valid = providerActive && texture != null;
        compositeMaterial.SetFloat(validProperty, valid ? 1.0f : 0.0f);
        if (valid)
        {
            compositeMaterial.SetTexture(textureProperty, texture);
        }
    }

    private void ApplyHandOcclusion(ARFace face, Camera arCamera)
    {
        if (handOcclusionRuntime == null)
        {
            handOcclusionRuntime = FindFirstObjectByType<E7HandOcclusionRuntime>();
        }

        if (handOcclusionRuntime == null)
        {
            compositeMaterial.SetFloat("_HandOcclusionEnabled", 0.0f);
            return;
        }

        E7HandOcclusionRuntime.HandOcclusionState handState = handOcclusionRuntime.CurrentState;
        bool enabled = handState.HandNearMouth
            && (handState.HasHandMask || handState.HasOcclusionRect);
        compositeMaterial.SetFloat("_HandOcclusionEnabled", enabled ? 1.0f : 0.0f);
        if (!enabled)
        {
            return;
        }

        if (handOcclusionRuntime.HandMaskTexture != null)
        {
            compositeMaterial.SetTexture("_HandOcclusionMaskTex", handOcclusionRuntime.HandMaskTexture);
        }

        bool useRect = handState.HasOcclusionRect && !handState.HasHandMask;
        compositeMaterial.SetFloat("_HandOcclusionUseRect", useRect ? 1.0f : 0.0f);
        if (useRect)
        {
            Rect rect = handState.ScreenRect;
            float screenWidth = Mathf.Max(1.0f, Screen.width);
            float screenHeight = Mathf.Max(1.0f, Screen.height);
            compositeMaterial.SetVector("_HandOcclusionRect", new Vector4(
                Mathf.Clamp01(rect.xMin / screenWidth),
                Mathf.Clamp01(1.0f - rect.yMax / screenHeight),
                Mathf.Clamp01(rect.xMax / screenWidth),
                Mathf.Clamp01(1.0f - rect.yMin / screenHeight)));
        }
    }

    private void UpdateSkinReferenceAnchors(ARFace face, Camera arCamera)
    {
        if (face == null
            || arCamera == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0)
        {
            skinRefA.z = 0.0f;
            skinRefB.z = 0.0f;
            skinRefC.z = 0.0f;
            return;
        }

        var faceVertices = face.vertices;
        Vector3 localMin = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        Vector3 localMax = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        for (int i = 0; i < faceVertices.Length; i++)
        {
            localMin = Vector3.Min(localMin, faceVertices[i]);
            localMax = Vector3.Max(localMax, faceVertices[i]);
        }

        skinRefA = SmoothAnchor(skinRefA, ProjectAnchor(face, arCamera, localMin, localMax, new Vector3(0.30f, 0.52f, 0.80f)));
        skinRefB = SmoothAnchor(skinRefB, ProjectAnchor(face, arCamera, localMin, localMax, new Vector3(0.70f, 0.52f, 0.80f)));
        skinRefC = SmoothAnchor(skinRefC, ProjectAnchor(face, arCamera, localMin, localMax, new Vector3(0.50f, 0.16f, 0.90f)));
    }

    private static Vector4 ProjectAnchor(
        ARFace face,
        Camera arCamera,
        Vector3 localMin,
        Vector3 localMax,
        Vector3 normalized)
    {
        Vector3 local = new Vector3(
            Mathf.Lerp(localMin.x, localMax.x, normalized.x),
            Mathf.Lerp(localMin.y, localMax.y, normalized.y),
            Mathf.Lerp(localMin.z, localMax.z, normalized.z));
        Vector3 world = face.transform.TransformPoint(local);
        Vector3 viewport = arCamera.WorldToViewportPoint(world);
        if (viewport.z <= arCamera.nearClipPlane
            || viewport.x < 0.03f
            || viewport.x > 0.97f
            || viewport.y < 0.03f
            || viewport.y > 0.97f)
        {
            return new Vector4(0.5f, 0.5f, 0.0f, 0.0f);
        }

        return new Vector4(viewport.x, viewport.y, 1.0f, 0.0f);
    }

    private static Vector4 SmoothAnchor(Vector4 previous, Vector4 current)
    {
        if (current.z < 0.5f || previous.z < 0.5f)
        {
            return current;
        }

        Vector2 blended = Vector2.Lerp(
            new Vector2(previous.x, previous.y),
            new Vector2(current.x, current.y),
            0.25f);
        return new Vector4(blended.x, blended.y, 1.0f, 0.0f);
    }

    private void EnsureResources()
    {
        if (maskRuntime == null)
        {
            maskRuntime = FindFirstObjectByType<FoundationMaskRuntime>();
            if (maskRuntime == null)
            {
                maskRuntime = gameObject.AddComponent<FoundationMaskRuntime>();
            }
        }

        if (visionParsingProvider == null)
        {
            visionParsingProvider = FindFirstObjectByType<VisionFaceParsingProvider>();
            if (visionParsingProvider == null)
            {
                visionParsingProvider = gameObject.AddComponent<VisionFaceParsingProvider>();
            }
        }

        if (compositeMaterial == null)
        {
            Shader shader = Resources.Load<Shader>("FoundationSemanticComposite")
                ?? Shader.Find("Hidden/MakeupAR/FoundationSemanticComposite");
            if (shader != null)
            {
                compositeMaterial = new Material(shader)
                {
                    name = "FoundationSemanticCompositeMaterial"
                };
            }
        }

        if (blurMaterial == null)
        {
            Shader blurShader = Resources.Load<Shader>("FoundationMaskBlur")
                ?? Shader.Find("Hidden/MakeupAR/FoundationMaskBlur");
            if (blurShader != null)
            {
                blurMaterial = new Material(blurShader)
                {
                    name = "FoundationMaskBlurMaterial"
                };
            }
        }

        int width = MaskBaseWidth;
        int height = Mathf.Clamp(
            Mathf.RoundToInt(width * Mathf.Max(1.0f, Screen.height) / Mathf.Max(1.0f, Screen.width)),
            192,
            512);
        EnsureRenderTexture(ref maskPing, width, height, "FoundationSemanticMaskA");
        EnsureRenderTexture(ref maskPong, width, height, "FoundationSemanticMaskB");
        EnsureSingleChannelRenderTexture(ref priorBlurTemp, width, height, "FoundationPriorBlurTemp");
        EnsureSingleChannelRenderTexture(ref priorSoft, width, height, "FoundationPriorSoft");
    }

    private static void EnsureSingleChannelRenderTexture(
        ref RenderTexture texture,
        int width,
        int height,
        string name)
    {
        if (texture != null && texture.width == width && texture.height == height)
        {
            return;
        }

        ReleaseRenderTexture(ref texture);

        // Soft prior / blur RTs: at least 16-bit single channel to avoid
        // banding in the wide feather gradient (spec: R16 or ARGB32; never
        // the platform default). R8 only as a last-resort fallback.
        RenderTextureFormat format = SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.R16)
            ? RenderTextureFormat.R16
            : (SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGB32)
                ? RenderTextureFormat.ARGB32
                : RenderTextureFormat.R8);
        texture = new RenderTexture(width, height, 0, format, RenderTextureReadWrite.Linear)
        {
            name = name,
            filterMode = FilterMode.Bilinear,
            wrapMode = TextureWrapMode.Clamp,
            useMipMap = false,
            autoGenerateMips = false
        };
        texture.Create();
    }

    private static void EnsureRenderTexture(ref RenderTexture texture, int width, int height, string name)
    {
        if (texture != null && texture.width == width && texture.height == height)
        {
            return;
        }

        ReleaseRenderTexture(ref texture);

        // Temporal ping-pong + final mask: ARGB32 linear (explicit format —
        // spec 10; R and A both carry the mask because the composite quad
        // reads both channels; linear so sRGB conversion never skews values).
        texture = new RenderTexture(width, height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear)
        {
            name = name,
            filterMode = FilterMode.Bilinear,
            wrapMode = TextureWrapMode.Clamp,
            useMipMap = false,
            autoGenerateMips = false
        };
        texture.Create();
        RenderTexture active = RenderTexture.active;
        RenderTexture.active = texture;
        GL.Clear(false, true, Color.clear);
        RenderTexture.active = active;
    }

    private static void ReleaseRenderTexture(ref RenderTexture texture)
    {
        if (texture == null)
        {
            return;
        }

        texture.Release();
        Destroy(texture);
        texture = null;
    }

    private void EnsureCameraSubscription()
    {
        if (cameraManager != null)
        {
            return;
        }

        cameraManager = FindFirstObjectByType<ARCameraManager>();
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
        if (eventArgs.textures == null
            || eventArgs.propertyNameIds == null
            || eventArgs.textures.Count == 0
            || eventArgs.propertyNameIds.Count == 0)
        {
            cameraTextureMode = 0;
            return;
        }

        Texture firstTexture = null;
        bool hasTextureY = false;
        bool hasTextureCbCr = false;
        int count = Mathf.Min(eventArgs.textures.Count, eventArgs.propertyNameIds.Count);
        for (int i = 0; i < count; i++)
        {
            Texture2D texture = eventArgs.textures[i];
            if (texture == null)
            {
                continue;
            }

            int propertyId = eventArgs.propertyNameIds[i];
            if (propertyId == SourceTextureYId)
            {
                cameraTextureY = texture;
                hasTextureY = true;
            }
            else if (propertyId == SourceTextureCbCrId)
            {
                cameraTextureCbCr = texture;
                hasTextureCbCr = true;
            }

            if (firstTexture == null)
            {
                firstTexture = texture;
            }
        }

        if (eventArgs.displayMatrix.HasValue)
        {
            cameraDisplayTransform = eventArgs.displayMatrix.Value;
        }

        if (hasTextureY && hasTextureCbCr)
        {
            cameraTextureMode = 2;
        }
        else if (firstTexture != null)
        {
            cameraTextureRgb = firstTexture;
            cameraTextureMode = 1;
        }
        else
        {
            cameraTextureMode = 0;
            return;
        }

        cameraTextureAt = Time.realtimeSinceStartup;
    }

    private void MaybeLog()
    {
        if (Time.unscaledTime < nextDiagnosticsAt)
        {
            return;
        }

        nextDiagnosticsAt = Time.unscaledTime + DiagnosticsIntervalSeconds;
        Debug.Log(
            "[FoundationSemantic]"
            + " maskValid=" + state.MaskValid.ToString().ToLowerInvariant()
            + " faceTracked=" + state.FaceTracked.ToString().ToLowerInvariant()
            + " providerActive=" + state.ProviderActive.ToString().ToLowerInvariant()
            + " skinSource=" + (state.SkinSource ?? "none")
            + " cameraMode=" + cameraTextureMode.ToString(CultureInfo.InvariantCulture)
            + " status=" + (state.Status ?? "none"));
    }
}
