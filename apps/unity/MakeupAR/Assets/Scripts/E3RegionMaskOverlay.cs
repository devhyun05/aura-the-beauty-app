using System;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public sealed class E3RegionMaskOverlay : MonoBehaviour
{
    public struct RegionApplyResult
    {
        public string Region;
        public bool Applied;
        public int FaceCount;
        public int SourceTriangleCount;
        public int MeshTriangleCount;
        public int MaskTriangleCount;
        public int CulledTriangleCount;
        public string MeshCullingMode;
        public bool UvAvailable;
        public int MeshVertexCount;
        public int MeshIndexCount;
        public int MeshUvCount;
        public bool MaskUvBoundsAvailable;
        public float MaskUvMinX;
        public float MaskUvMinY;
        public float MaskUvMaxX;
        public float MaskUvMaxY;
        public string MaskUvSplitMode;
        public bool MaskNegativeXUvBoundsAvailable;
        public float MaskNegativeXUvMinX;
        public float MaskNegativeXUvMinY;
        public float MaskNegativeXUvMaxX;
        public float MaskNegativeXUvMaxY;
        public int MaskNegativeXTriangleCount;
        public bool MaskPositiveXUvBoundsAvailable;
        public float MaskPositiveXUvMinX;
        public float MaskPositiveXUvMinY;
        public float MaskPositiveXUvMaxX;
        public float MaskPositiveXUvMaxY;
        public int MaskPositiveXTriangleCount;
        public string RendererMode;
        public string MaskTextureId;
        public string MaskSource;
        public string BoundaryRenderer;
        public string TrackingState;
        public string StateAction;
        public string TextureSample;
        public string TextureMode;
        public string LipRenderLayerMode;
        public string GlossHighlightMode;
        public float Intensity;
        public float Feather;
        public string BlendMode;
        public string SecondaryColorHex;
        public float Coverage;
        public string Finish;
        public float Roughness;
        public float Specular;
        public float SpecularPower;
        public float GlossBoost;
        public float TextureAmount;
        public float GradientAmount;
        public bool PreserveDetail;
        public string TopologyAuditStatus;
        public string TopologyAuditSummary;
        public float MaskThreshold;
        public float MaskFeatherUvNormalized;
        public string MaskSoftSampleMode;
        public float MaskFeatherNearRadiusPx;
        public float MaskFeatherFarRadiusPx;
        public string MaskTextureDiagnosticStatus;
        public string MaskTextureSampleChannel;
        public int MaskTextureWidth;
        public int MaskTextureHeight;
        public int MaskTextureActivePixelCountGt8;
        public float MaskTextureActiveCoverageGt8;
        public string MaskTextureActiveBbox;
        public int MaskTextureThresholdPixelCount;
        public float MaskTextureThresholdCoverage;
        public int MaskTextureDensityPixelCountGt8;
        public float MaskTextureDensityCoverageGt8;
        public string MaskTextureDensityBbox;
        public int MaskTextureDensityMax;
        public string VisionBoundaryStatus;
        public string VisionBoundarySource;
        public string VisionBoundaryCoordinateMode;
        public int VisionBoundaryOuterPointCount;
        public int VisionBoundaryInnerPointCount;
        public int VisionBoundaryImageWidth;
        public int VisionBoundaryImageHeight;
        public long VisionBoundaryAgeMs;
        public float VisionBoundaryFaceMotionScore;
        public float VisionBoundaryFaceCenterShiftPx;
        public float VisionBoundaryFaceScaleDelta;
        public string VisionBoundaryFaceMotionRisk;
        public string OverlaySyncPhase;
        public int OverlaySyncFrame;
        public int TrackablesChangedSequence;
        public int OverlaySyncCount;
        public float OverlaySyncDurationMs;
        public float OverlaySyncWorstDurationMs;
        public bool OverlayTopologyChanged;
        public string StabilityMode;
        public float StabilizationDeadZoneMeters;
        public float StabilizationSnapDistanceMeters;
        public int BrowDebugMode;
        public bool BrowDebugShowLeftRight;
        public bool BrowDebugExaggerate;
    }

    private sealed class RegionRecipeState
    {
        public string Region = string.Empty;
        public string ColorHex = "#D94B74";
        public Color Color = new Color(0.85f, 0.29f, 0.45f, 0.65f);
        public string SecondaryColorHex = "#F29BAA";
        public Color SecondaryColor = new Color(0.95f, 0.61f, 0.67f, 1.0f);
        public float Opacity = 0.65f;
        public bool Enabled = true;
        public string TextureSample = "matte_lip";
        public string TextureMode = "sample";
        public string LipRenderLayerMode = "none";
        public string GlossHighlightMode = "none";
        public float Intensity = 1.0f;
        public float Feather = 0.0f;
        public string BlendMode = "normal";
        public string MaskTextureId = LipDrawnStyleAtlasMaskId;
        public float Coverage = 0.62f;
        public string Finish = "matte";
        public float Roughness = 0.88f;
        public float Specular = 0.04f;
        public float SpecularPower = 8.0f;
        public float GlossBoost = 0.0f;
        public float TextureAmount = 0.0f;
        public float GradientAmount = 0.08f;
        public bool PreserveDetail = true;
        public int BrowDebugMode;
        public bool BrowDebugShowLeftRight;
        public bool BrowDebugExaggerate;
    }

    private sealed class FaceOverlayState
    {
        public readonly Dictionary<string, RegionOverlayView> Regions =
            new Dictionary<string, RegionOverlayView>();
        public readonly Dictionary<string, string> LastLoggedStateActionByRegion =
            new Dictionary<string, string>();
        public bool WasLimitedOrLost;
    }

    private struct TrackingVisibility
    {
        public bool ShouldRender;
        public float AlphaMultiplier;
        public string Action;
    }

    private struct MaskUvSplitBounds
    {
        public string Mode;
        public bool NegativeXAvailable;
        public Vector4 NegativeXBounds;
        public int NegativeXTriangleCount;
        public bool PositiveXAvailable;
        public Vector4 PositiveXBounds;
        public int PositiveXTriangleCount;
    }

    private sealed class RegionOverlayView
    {
        public Mesh Mesh;
        public MeshRenderer MeshRenderer;
        public Material MaskMaterial;
        public Texture2D VisionScreenMaskTexture;
        public Color32[] VisionScreenMaskPixels;
        public int VisionScreenMaskSequence;
        public int VisionScreenMaskWidth;
        public int VisionScreenMaskHeight;
        public MaskTextureDiagnostics VisionScreenMaskDiagnostics;
        public Texture2D VisionUvMaskTexture;
        public Color32[] VisionUvMaskPixels;
        public int VisionUvMaskSequence;
        public int VisionUvMaskWidth;
        public int VisionUvMaskHeight;
        public MaskTextureDiagnostics VisionUvMaskDiagnostics;
        public Vector3[] GeneratedBrowStableVertices;
        public float GeneratedBrowLastStableAtSeconds = -1.0f;
    }

    private sealed class MaskDefinition
    {
        public string Region;
        public string MaskTextureId;
        public string ResourcePath;
        public float Threshold;
        public float FeatherUvNormalized;
    }

    private sealed class MaskTextureDiagnostics
    {
        public string Status = "not_run";
        public int Width;
        public int Height;
        public int ActivePixelCountGt8;
        public float ActiveCoverageGt8;
        public string ActiveBbox = "none";
        public int ThresholdPixelCount;
        public float ThresholdCoverage;
        public int DensityPixelCountGt8;
        public float DensityCoverageGt8;
        public string DensityBbox = "none";
        public int DensityMax;
        public string SampleChannel = "red";
    }

    private sealed class MaskTextureSampleData
    {
        public string Status = "not_run";
        public string SampleChannel = "red";
        public int Width;
        public int Height;
        public int ThresholdByte;
        public Color32[] Pixels = new Color32[0];
    }

    private struct VisionBoundaryGateInfo
    {
        public string Status;
        public string Source;
        public string CoordinateMode;
        public int OuterPointCount;
        public int InnerPointCount;
        public int ImageWidth;
        public int ImageHeight;
        public long AgeMs;
        public float FaceMotionScore;
        public float FaceMotionCenterShiftPx;
        public float FaceMotionScaleDelta;
        public string FaceMotionRisk;
    }

    [SerializeField] private ARFaceManager faceManager;
    [SerializeField] private E7VisionLipBoundaryRuntime visionLipBoundaryRuntime;
    [SerializeField] private bool useMeshMasks = true;

    private const string RendererMode = "smooth-region-mask";
    private const string MaskSource = "smooth_region_mask";
    private const string BoundaryRenderer = "smooth_alpha_mask";
    private const string VisionLipBoundaryMaskId = "lip-vision-boundary-v1";
    private const string LipDrawnStyleAtlasMaskId = "lip-drawn-style-atlas-v1";
    private const string LipDrawnGradientDensityAtlasMaskId = "lip-drawn-gradient-density-atlas-v1";
    private const string CheekSessionMask1Id = "cheek-session-mask-1-v1";
    private const string CheekSessionMask2Id = "cheek-session-mask-2-v1";
    private const string CheekSessionMask3Id = "cheek-session-mask-3-v1";
    private const string CheekSessionMask4Id = "cheek-session-mask-4-v1";
    private const string CheekSessionMask5Id = "cheek-session-mask-5-v1";
    private const string CheekBlushMaskSource = "user_session_2d_png_face_local_luminance_multiband";
    private const string CheekBlushBoundaryRenderer = "face_local_skin_aware_cheek_blush_multiband_filter";
    private const string VisionLipBoundarySource = "apple_vision_runtime_lip_landmarks";
    private const string VisionLipBoundaryRenderer = "apple_vision_lip_landmark_arface_uv_baked";
    private const string VisionBoundaryRuntimeTransform = "flip-y";
    private const string GeneratedLipMaskPrefix = "e7-generated-lip";
    private const string GeneratedBrowMaskPrefix = "e7-generated-brow";
    private const int VisionScreenMaskMaxDimension = 1024;
    private const int VisionUvMaskSize = 512;
    private const int VisionUvMaskSoftSplatRadius = 3;
    private const string WideFeatherSoftSampleMode = "feather_scaled_13tap_near_far";
    private const string LegacySoftSampleMode = "legacy_soft_alpha";
    private const float FeatherNearRadiusMinPx = 1.25f;
    private const float FeatherNearRadiusMaxPx = 5.5f;
    private const float FeatherRadiusScale = 2.35f;
    private const float FeatherFarRadiusScale = 1.85f;
    private const float VisionFaceMotionMediumThreshold = 0.18f;
    private const float VisionFaceMotionLargeThreshold = 0.32f;
    private const float GeneratedBrowVertexJitterDeadZoneMeters = 0.00055f;
    private const float GeneratedBrowVertexSnapDistanceMeters = 0.0065f;
    private const float GeneratedBrowVertexFollowHz = 48.0f;

    private readonly Dictionary<string, RegionRecipeState> recipes =
        new Dictionary<string, RegionRecipeState>();
    private readonly Dictionary<ARFace, FaceOverlayState> overlays =
        new Dictionary<ARFace, FaceOverlayState>();
    private readonly Dictionary<string, RegionApplyResult> latestRegionResults =
        new Dictionary<string, RegionApplyResult>();
    private static readonly Dictionary<string, Texture2D> MaskTextures =
        new Dictionary<string, Texture2D>();
    private static readonly Dictionary<string, Texture2D> RuntimeGeneratedLipMaskTextures =
        new Dictionary<string, Texture2D>();
    private static readonly Dictionary<string, Texture2D> RuntimeGeneratedBrowMaskTextures =
        new Dictionary<string, Texture2D>();
    private static readonly Dictionary<string, MaskTextureDiagnostics> MaskTextureDiagnosticsCache =
        new Dictionary<string, MaskTextureDiagnostics>();
    private static readonly Dictionary<string, MaskTextureSampleData> MaskTextureSampleCache =
        new Dictionary<string, MaskTextureSampleData>();
    private bool overlayRenderingSuppressed;
    private bool visionCaptureSuppressed;

    public void Configure(ARFaceManager manager)
    {
        if (faceManager == null)
        {
            faceManager = manager;
        }
    }

    public bool RegisterGeneratedLipMaskTexture(
        string maskTextureId,
        string rawRgbaBase64,
        int width,
        int height)
    {
        maskTextureId = NormalizeGeneratedLipMaskTextureId(maskTextureId);
        if (string.IsNullOrWhiteSpace(rawRgbaBase64) || width <= 0 || height <= 0)
        {
            return false;
        }

        try
        {
            byte[] rawBytes = Convert.FromBase64String(rawRgbaBase64);
            int expectedByteCount = width * height * 4;
            if (rawBytes.Length != expectedByteCount)
            {
                Debug.LogWarning(
                    "[E7] generated_lip_mask_texture_invalid"
                    + " maskTextureId=" + maskTextureId
                    + " expectedBytes=" + expectedByteCount.ToString(CultureInfo.InvariantCulture)
                    + " actualBytes=" + rawBytes.Length.ToString(CultureInfo.InvariantCulture));
                return false;
            }

            Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, false)
            {
                name = "Generated Lip Mask " + maskTextureId,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };
            texture.LoadRawTextureData(rawBytes);
            texture.Apply(false, false);
            RuntimeGeneratedLipMaskTextures[maskTextureId] = texture;
            RemoveMaskTextureCaches("GeneratedLipMasks/" + maskTextureId);

            Debug.Log(
                "[E7] generated_lip_mask_texture_registered"
                + " maskTextureId=" + maskTextureId
                + " width=" + width.ToString(CultureInfo.InvariantCulture)
                + " height=" + height.ToString(CultureInfo.InvariantCulture)
                + " bytes=" + rawBytes.Length.ToString(CultureInfo.InvariantCulture));
            return true;
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[E7] generated_lip_mask_texture_register_failed"
                + " maskTextureId=" + maskTextureId
                + " error=" + exception.Message);
            return false;
        }
    }

    public bool RegisterGeneratedBrowMaskTexture(
        string maskTextureId,
        string rawRgbaBase64,
        int width,
        int height)
    {
        maskTextureId = NormalizeGeneratedBrowMaskTextureId(maskTextureId);
        if (string.IsNullOrWhiteSpace(rawRgbaBase64) || width <= 0 || height <= 0)
        {
            return false;
        }

        try
        {
            byte[] rawBytes = Convert.FromBase64String(rawRgbaBase64);
            int expectedByteCount = width * height * 4;
            if (rawBytes.Length != expectedByteCount)
            {
                Debug.LogWarning(
                    "[E7] generated_brow_mask_texture_invalid"
                    + " maskTextureId=" + maskTextureId
                    + " expectedBytes=" + expectedByteCount.ToString(CultureInfo.InvariantCulture)
                    + " actualBytes=" + rawBytes.Length.ToString(CultureInfo.InvariantCulture));
                return false;
            }

            // Mipmapped + trilinear so the fine directional hair strokes in the
            // blue channel do not crawl/shimmer under head motion when the face
            // minifies (moves away). SetPixelData(mip0) + Apply(updateMipmaps:
            // true) preserves the raw top-left byte layout (unlike SetPixels32,
            // which would flip rows) while generating the mip chain — plain
            // LoadRawTextureData cannot, as it expects the full mip-chain size.
            // Brow-only: this is RuntimeGeneratedBrowMaskTextures, separate from
            // the lip VisionUvMaskTexture path.
            Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, true)
            {
                name = "Generated Brow Mask " + maskTextureId,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Trilinear
            };
            texture.SetPixelData(rawBytes, 0);
            texture.Apply(true, false);
            RuntimeGeneratedBrowMaskTextures[maskTextureId] = texture;
            RemoveMaskTextureCaches("GeneratedBrowMasks/" + maskTextureId);

            Debug.Log(
                "[E7] generated_brow_mask_texture_registered"
                + " maskTextureId=" + maskTextureId
                + " width=" + width.ToString(CultureInfo.InvariantCulture)
                + " height=" + height.ToString(CultureInfo.InvariantCulture)
                + " bytes=" + rawBytes.Length.ToString(CultureInfo.InvariantCulture));
            return true;
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[E7] generated_brow_mask_texture_register_failed"
                + " maskTextureId=" + maskTextureId
                + " error=" + exception.Message);
            return false;
        }
    }

    public bool TryGetLatestRegionApplyResult(string region, out RegionApplyResult result)
    {
        return latestRegionResults.TryGetValue(NormalizeRegion(region), out result);
    }

    private static void RemoveMaskTextureCaches(string resourcePath)
    {
        if (string.IsNullOrWhiteSpace(resourcePath))
        {
            return;
        }

        RemoveCacheEntriesWithResourcePrefix(MaskTextureDiagnosticsCache, resourcePath);
        RemoveCacheEntriesWithResourcePrefix(MaskTextureSampleCache, resourcePath);
    }

    private static void RemoveCacheEntriesWithResourcePrefix<TValue>(
        Dictionary<string, TValue> cache,
        string resourcePath)
    {
        if (cache == null || cache.Count == 0)
        {
            return;
        }

        List<string> keysToRemove = new List<string>();
        foreach (string key in cache.Keys)
        {
            if (key == resourcePath
                || key.StartsWith(resourcePath + "|", StringComparison.Ordinal))
            {
                keysToRemove.Add(key);
            }
        }

        foreach (string key in keysToRemove)
        {
            cache.Remove(key);
        }
    }

    public void SetOverlayRenderingSuppressed(bool suppressed)
    {
        SetOverlayRenderingSuppressed(suppressed, "region_overlay_suppression");
    }

    public void SetOverlayRenderingSuppressed(bool suppressed, string reason)
    {
        overlayRenderingSuppressed = suppressed;
        if (suppressed)
        {
            HideAllOverlayViews();
        }

        Debug.Log(
            "[E7] region_overlay_suppression"
            + " suppressed=" + overlayRenderingSuppressed.ToString().ToLowerInvariant()
            + " reason=" + (string.IsNullOrWhiteSpace(reason) ? "unspecified" : reason));
    }

    public void SetVisionCaptureSuppressed(bool suppressed)
    {
        visionCaptureSuppressed = suppressed;
        if (suppressed)
        {
            HideAllOverlayViews();
        }

        Debug.Log(
            "[E7] vision_lip_boundary_overlay_suppression"
            + " suppressed=" + visionCaptureSuppressed.ToString().ToLowerInvariant());
    }

    public void ClearRecipesAndHideOverlays()
    {
        recipes.Clear();
        latestRegionResults.Clear();
        HideAllOverlayViews();
    }

    private void Update()
    {
        if (recipes.Count == 0)
        {
            return;
        }

        foreach (KeyValuePair<string, RegionRecipeState> entry in recipes)
        {
            if (entry.Value.Enabled)
            {
                ApplyRegionToTrackedFaces(entry.Key, false);
            }
        }
    }

    public RegionApplyResult ApplyRegionRecipe(
        string region,
        string colorHex,
        Color color,
        float opacity,
        bool enabled,
        string textureSample,
        string textureMode,
        float intensity,
        float feather,
        string blendMode,
        string rendererMode,
        string maskTextureId,
        string secondaryColorHex,
        Color secondaryColor,
        float coverage,
        string finish,
        float textureAmount,
        float roughness,
        float specular,
        float specularPower,
        float glossBoost,
        float gradientAmount,
        bool preserveDetail,
        int browDebugMode = 0,
        bool browDebugShowLeftRight = false,
        bool browDebugExaggerate = false)
    {
        region = NormalizeRegion(region);
        opacity = Mathf.Clamp01(opacity);
        recipes[region] = new RegionRecipeState
        {
            Region = region,
            ColorHex = colorHex,
            Color = new Color(color.r, color.g, color.b, opacity),
            Opacity = opacity,
            Enabled = enabled,
            TextureSample = NormalizeTextureSample(region, textureSample),
            TextureMode = NormalizeTextureMode(textureMode),
            Intensity = Mathf.Clamp01(intensity),
            Feather = Mathf.Clamp01(feather),
            BlendMode = NormalizeBlendMode(blendMode),
            MaskTextureId = NormalizeMaskTextureId(region, maskTextureId),
            SecondaryColorHex = string.IsNullOrWhiteSpace(secondaryColorHex)
                ? "#F29BAA"
                : secondaryColorHex.Trim(),
            SecondaryColor = secondaryColor,
            Coverage = Mathf.Clamp01(coverage),
            Finish = NormalizeOptional(finish),
            Roughness = Mathf.Clamp01(roughness),
            Specular = Mathf.Clamp01(specular),
            SpecularPower = Mathf.Max(1.0f, specularPower),
            GlossBoost = Mathf.Clamp01(glossBoost),
            TextureAmount = Mathf.Clamp01(textureAmount),
            GradientAmount = Mathf.Clamp01(gradientAmount),
            PreserveDetail = preserveDetail,
            BrowDebugMode = Mathf.Clamp(browDebugMode, 0, 6),
            BrowDebugShowLeftRight = browDebugShowLeftRight,
            BrowDebugExaggerate = browDebugExaggerate
        };

        return ApplyRegionToTrackedFaces(region, true);
    }

    public RegionApplyResult ApplyRegionRecipe(
        string region,
        string colorHex,
        Color color,
        string secondaryColorHex,
        Color secondaryColor,
        float opacity,
        bool enabled,
        string textureSample,
        string textureMode,
        float intensity,
        float feather,
        string blendMode,
        string rendererMode,
        string maskTextureId,
        string candidateId,
        float maskThreshold,
        float maskFeatherUvNormalized,
        float cornerReach,
        float upperLipTightness,
        float lowerLipTightness,
        float verticalOffset,
        float coverage,
        string finish,
        float textureAmount,
        float gradientAmount,
        bool preserveDetail,
        float roughness,
        float specular,
        float specularPower,
        float glossBoost,
        int browDebugMode = 0,
        bool browDebugShowLeftRight = false,
        bool browDebugExaggerate = false)
    {
        return ApplyRegionRecipe(
            region,
            colorHex,
            color,
            opacity,
            enabled,
            textureSample,
            textureMode,
            intensity,
            feather,
            blendMode,
            rendererMode,
            maskTextureId,
            secondaryColorHex,
            secondaryColor,
            coverage,
            finish,
            textureAmount,
            roughness,
            specular,
            specularPower,
            glossBoost,
            gradientAmount,
            preserveDetail,
            browDebugMode,
            browDebugShowLeftRight,
            browDebugExaggerate);
    }

    private RegionApplyResult ApplyRegionToTrackedFaces(string region, bool emitLog)
    {
        RefreshSceneReferences();
        RegionApplyResult result = CreateResult(region);
        result.OverlaySyncPhase = emitLog ? "immediate_apply" : "late_update";
        result.OverlaySyncFrame = Time.frameCount;

        if (!recipes.TryGetValue(region, out RegionRecipeState recipe))
        {
            return result;
        }

        ApplyRecipeToResult(recipe, ref result);

        if (!recipe.Enabled)
        {
            result.StateAction = "disabled";
            HideRegionViews(region);
            latestRegionResults[region] = result;
            if (emitLog)
            {
                Debug.Log(
                    "[E7] region_mask_disabled"
                    + " region=" + region
                    + " rendererMode=" + RendererMode
                    + " maskTextureId=" + recipe.MaskTextureId);
            }

            return result;
        }

        if (faceManager == null)
        {
            if (emitLog)
            {
                Debug.LogWarning("[E7] region_mask_skipped region=" + region + " reason=faceManager_missing");
            }

            return result;
        }

        foreach (ARFace face in faceManager.trackables)
        {
            if (face == null)
            {
                continue;
            }

            FaceOverlayState faceState = EnsureFaceOverlayState(face);
            RegionOverlayView view = EnsureRegionOverlayView(face.transform, faceState, region);
            ApplyRecipeAppearance(view, recipe);
            TrackingVisibility visibility = ResolveTrackingVisibility(face, faceState);
            ApplyViewAlphaMultiplier(view, visibility.AlphaMultiplier);
            MaybeLogRegionMaskState(face, faceState, region, recipe, visibility);

            result.TrackingState = face.trackingState.ToString();
            result.StateAction = visibility.Action;
            result.UvAvailable = result.UvAvailable || HasUsableUv(face);
            result.MeshVertexCount = Mathf.Max(result.MeshVertexCount, GetVertexCount(face));
            result.MeshIndexCount = Mathf.Max(result.MeshIndexCount, GetIndexCount(face));
            result.MeshUvCount = Mathf.Max(result.MeshUvCount, GetUvCount(face));
            result.TopologyAuditStatus = BuildTopologyAuditStatus(face);
            result.TopologyAuditSummary = BuildTopologyAuditSummary(face);

            if (overlayRenderingSuppressed || visionCaptureSuppressed || !visibility.ShouldRender)
            {
                SetViewVisibility(view, false);
                if (overlayRenderingSuppressed)
                {
                    result.StateAction = "suppressed_for_clean_view";
                }
                else if (visionCaptureSuppressed)
                {
                    result.StateAction = "suppressed_for_vision_capture";
                }
                continue;
            }

            result.FaceCount++;
            int triangleCount = 0;
            int sourceTriangleCount = 0;
            int culledTriangleCount = 0;
            string meshCullingMode = "none";
            bool maskUvBoundsAvailable = false;
            Vector4 maskUvBounds = Vector4.zero;
            MaskUvSplitBounds maskUvSplitBounds = CreateDefaultMaskUvSplitBounds();
            VisionBoundaryGateInfo visionGateInfo = CreateDefaultVisionGateInfo();
            MaskTextureDiagnostics dynamicMaskDiagnostics = null;
            bool meshApplied = useMeshMasks && TryUpdateFullFaceUvMesh(
                face,
                view,
                recipe,
                out triangleCount,
                out sourceTriangleCount,
                out culledTriangleCount,
                out meshCullingMode,
                out maskUvBoundsAvailable,
                out maskUvBounds,
                out maskUvSplitBounds,
                out visionGateInfo,
                out dynamicMaskDiagnostics);
            result.SourceTriangleCount += sourceTriangleCount;
            result.MeshTriangleCount += triangleCount;
            result.MaskTriangleCount += triangleCount;
            result.CulledTriangleCount += culledTriangleCount;
            result.MeshCullingMode = meshCullingMode;
            MergeMaskUvBounds(ref result, maskUvBoundsAvailable, maskUvBounds);
            MergeMaskUvSplitBounds(ref result, maskUvSplitBounds);
            ApplyVisionGateInfo(ref result, visionGateInfo);
            ApplyDynamicMaskDiagnostics(ref result, dynamicMaskDiagnostics);

            SetViewVisibility(view, meshApplied);
            result.Applied = result.Applied || meshApplied;
        }

        latestRegionResults[region] = result;
        if (emitLog)
        {
            LogRegionApplyResult(result);
        }

        return result;
    }

    private static RegionApplyResult CreateResult(string region)
    {
        string maskTextureId = GetDefaultMaskTextureId(region);
        MaskDefinition mask = ResolveMask(region, maskTextureId);
        return new RegionApplyResult
        {
            Region = region,
            Applied = false,
            FaceCount = 0,
            SourceTriangleCount = 0,
            MeshTriangleCount = 0,
            MaskTriangleCount = 0,
            CulledTriangleCount = 0,
            MeshCullingMode = "none",
            UvAvailable = false,
            MeshVertexCount = 0,
            MeshIndexCount = 0,
            MeshUvCount = 0,
            MaskUvBoundsAvailable = false,
            MaskUvMinX = 0.0f,
            MaskUvMinY = 0.0f,
            MaskUvMaxX = 0.0f,
            MaskUvMaxY = 0.0f,
            MaskUvSplitMode = "none",
            MaskNegativeXUvBoundsAvailable = false,
            MaskNegativeXUvMinX = 0.0f,
            MaskNegativeXUvMinY = 0.0f,
            MaskNegativeXUvMaxX = 0.0f,
            MaskNegativeXUvMaxY = 0.0f,
            MaskNegativeXTriangleCount = 0,
            MaskPositiveXUvBoundsAvailable = false,
            MaskPositiveXUvMinX = 0.0f,
            MaskPositiveXUvMinY = 0.0f,
            MaskPositiveXUvMaxX = 0.0f,
            MaskPositiveXUvMaxY = 0.0f,
            MaskPositiveXTriangleCount = 0,
            RendererMode = RendererMode,
            MaskTextureId = maskTextureId,
            MaskSource = MaskSource,
            BoundaryRenderer = BoundaryRenderer,
            TrackingState = "None",
            StateAction = "not_started",
            TextureSample = string.Empty,
            TextureMode = string.Empty,
            LipRenderLayerMode = "none",
            GlossHighlightMode = "none",
            Intensity = 0.0f,
            Feather = 0.0f,
            BlendMode = string.Empty,
            SecondaryColorHex = string.Empty,
            Coverage = 0.0f,
            Finish = string.Empty,
            Roughness = 0.0f,
            Specular = 0.0f,
            SpecularPower = 0.0f,
            GlossBoost = 0.0f,
            TextureAmount = 0.0f,
            GradientAmount = 0.0f,
            PreserveDetail = true,
            TopologyAuditStatus = "not_run",
            TopologyAuditSummary = "none",
            MaskThreshold = mask.Threshold,
            MaskFeatherUvNormalized = mask.FeatherUvNormalized,
            MaskSoftSampleMode = LegacySoftSampleMode,
            MaskFeatherNearRadiusPx = ResolveShaderFeatherNearRadiusPx(mask.FeatherUvNormalized),
            MaskFeatherFarRadiusPx = ResolveShaderFeatherFarRadiusPx(mask.FeatherUvNormalized),
            MaskTextureDiagnosticStatus = "not_run",
            MaskTextureSampleChannel = ResolveMaskCoverageSampleChannel(mask),
            MaskTextureWidth = 0,
            MaskTextureHeight = 0,
            MaskTextureActivePixelCountGt8 = 0,
            MaskTextureActiveCoverageGt8 = 0.0f,
            MaskTextureActiveBbox = "none",
            MaskTextureThresholdPixelCount = 0,
            MaskTextureThresholdCoverage = 0.0f,
            MaskTextureDensityPixelCountGt8 = 0,
            MaskTextureDensityCoverageGt8 = 0.0f,
            MaskTextureDensityBbox = "none",
            MaskTextureDensityMax = 0,
            VisionBoundaryStatus = "not_requested",
            VisionBoundarySource = "none",
            VisionBoundaryCoordinateMode = "none",
            VisionBoundaryOuterPointCount = 0,
            VisionBoundaryInnerPointCount = 0,
            VisionBoundaryImageWidth = 0,
            VisionBoundaryImageHeight = 0,
            VisionBoundaryAgeMs = 0,
            VisionBoundaryFaceMotionScore = 0.0f,
            VisionBoundaryFaceCenterShiftPx = 0.0f,
            VisionBoundaryFaceScaleDelta = 0.0f,
            VisionBoundaryFaceMotionRisk = "none",
            StabilityMode = "none",
            StabilizationDeadZoneMeters = 0.0f,
            StabilizationSnapDistanceMeters = 0.0f,
        };
    }

    private static void ApplyRecipeToResult(RegionRecipeState recipe, ref RegionApplyResult result)
    {
        MaskDefinition mask = ResolveMask(recipe.Region, recipe.MaskTextureId);
        result.TextureSample = recipe.TextureSample;
        result.TextureMode = recipe.TextureMode;
        result.Intensity = recipe.Intensity;
        result.Feather = recipe.Feather;
        result.BlendMode = recipe.BlendMode;
        result.SecondaryColorHex = recipe.SecondaryColorHex;
        result.Coverage = recipe.Coverage;
        result.Finish = recipe.Finish;
        result.Roughness = recipe.Roughness;
        result.Specular = recipe.Specular;
        result.SpecularPower = recipe.SpecularPower;
        result.GlossBoost = recipe.GlossBoost;
        result.TextureAmount = recipe.TextureAmount;
        result.GradientAmount = recipe.GradientAmount;
        result.PreserveDetail = recipe.PreserveDetail;
        result.MaskTextureId = recipe.MaskTextureId;
        result.MaskTextureSampleChannel = ResolveMaskCoverageSampleChannel(mask);
        bool lipStyleAtlas = IsLipStyleAtlasMask(recipe.MaskTextureId);
        bool visionLipBoundary = IsVisionLipBoundaryMask(recipe.MaskTextureId);
        bool generatedBrowMask = IsGeneratedBrowMaskTextureId(recipe.MaskTextureId);
        bool cheekBlushMask = (recipe.Region == "cheek" || recipe.Region == "blush")
            && IsCheekBlushMask(recipe.MaskTextureId);
        bool lipLogicalMultilayer = lipStyleAtlas || visionLipBoundary;
        result.LipRenderLayerMode = lipLogicalMultilayer
            ? "soft_sdf_logical_multilayer"
            : "none";
        result.GlossHighlightMode = lipLogicalMultilayer && recipe.TextureSample == "gloss_lip"
            ? "matte_base_wet_sheen"
            : "none";
        result.MaskSource = visionLipBoundary
            ? VisionLipBoundarySource
            : lipStyleAtlas
            ? "lip_style_atlas_v1_uv_back_projection"
            : cheekBlushMask
            ? CheekBlushMaskSource
            : MaskSource;
        result.BoundaryRenderer = visionLipBoundary
            ? VisionLipBoundaryRenderer
            : lipStyleAtlas
            ? (recipe.BlendMode == "multiply"
                ? "rgba_style_atlas_logical_multilayer_sdf_feather"
                : "rgba_style_atlas_soft_alpha_sdf_feather")
            : cheekBlushMask
            ? CheekBlushBoundaryRenderer
            : BoundaryRenderer;
        result.MaskThreshold = mask.Threshold;
        result.MaskFeatherUvNormalized = ResolveEffectiveFeather(mask, recipe);
        result.MaskSoftSampleMode = lipLogicalMultilayer || cheekBlushMask
            ? WideFeatherSoftSampleMode
            : LegacySoftSampleMode;
        result.MaskFeatherNearRadiusPx = ResolveShaderFeatherNearRadiusPx(result.MaskFeatherUvNormalized);
        result.MaskFeatherFarRadiusPx = ResolveShaderFeatherFarRadiusPx(result.MaskFeatherUvNormalized);
        if (generatedBrowMask)
        {
            result.StabilityMode = "generated_brow_arface_uv_deadband_fast_follow";
            result.StabilizationDeadZoneMeters = GeneratedBrowVertexJitterDeadZoneMeters;
            result.StabilizationSnapDistanceMeters = GeneratedBrowVertexSnapDistanceMeters;
            result.BrowDebugMode = recipe.BrowDebugMode;
            result.BrowDebugShowLeftRight = recipe.BrowDebugShowLeftRight;
            result.BrowDebugExaggerate = recipe.BrowDebugExaggerate;
        }

        ApplyMaskTextureDiagnostics(mask, ref result);
    }

    private void RefreshSceneReferences()
    {
        if (faceManager == null)
        {
            faceManager = FindFirstObjectByType<ARFaceManager>();
        }

        if (visionLipBoundaryRuntime == null)
        {
            visionLipBoundaryRuntime = FindFirstObjectByType<E7VisionLipBoundaryRuntime>();
        }
    }

    private FaceOverlayState EnsureFaceOverlayState(ARFace face)
    {
        if (overlays.TryGetValue(face, out FaceOverlayState state))
        {
            return state;
        }

        state = new FaceOverlayState();
        overlays[face] = state;
        return state;
    }

    private RegionOverlayView EnsureRegionOverlayView(
        Transform faceTransform,
        FaceOverlayState state,
        string region)
    {
        if (state.Regions.TryGetValue(region, out RegionOverlayView view))
        {
            return view;
        }

        view = CreateRegionOverlayView(faceTransform, region);
        state.Regions[region] = view;
        return view;
    }

    private RegionOverlayView CreateRegionOverlayView(Transform faceTransform, string region)
    {
        GameObject root = new GameObject("E3 Region " + region);
        root.transform.SetParent(faceTransform, false);
        root.transform.localPosition = Vector3.zero;
        root.transform.localRotation = Quaternion.identity;
        root.transform.localScale = Vector3.one;

        Mesh mesh = new Mesh
        {
            name = "E3 " + region + " smooth mask"
        };
        mesh.MarkDynamic();

        MeshFilter meshFilter = root.AddComponent<MeshFilter>();
        MeshRenderer meshRenderer = root.AddComponent<MeshRenderer>();
        meshFilter.sharedMesh = mesh;
        ConfigureRenderer(meshRenderer);

        RegionOverlayView view = new RegionOverlayView
        {
            Mesh = mesh,
            MeshRenderer = meshRenderer
        };

        SetViewVisibility(view, false);
        return view;
    }

    private bool TryUpdateFullFaceUvMesh(
        ARFace face,
        RegionOverlayView view,
        RegionRecipeState recipe,
        out int triangleCount,
        out int sourceTriangleCount,
        out int culledTriangleCount,
        out string meshCullingMode,
        out bool maskUvBoundsAvailable,
        out Vector4 maskUvBounds,
        out MaskUvSplitBounds maskUvSplitBounds,
        out VisionBoundaryGateInfo visionGateInfo,
        out MaskTextureDiagnostics dynamicMaskDiagnostics)
    {
        triangleCount = 0;
        sourceTriangleCount = 0;
        culledTriangleCount = 0;
        meshCullingMode = "none";
        maskUvBoundsAvailable = false;
        maskUvBounds = Vector4.zero;
        maskUvSplitBounds = CreateDefaultMaskUvSplitBounds();
        visionGateInfo = CreateDefaultVisionGateInfo();
        dynamicMaskDiagnostics = null;

        if (!HasUsableUv(face) || view.MeshRenderer == null)
        {
            view.Mesh.Clear();
            return false;
        }

        MaskDefinition mask = ResolveMask(recipe.Region, recipe.MaskTextureId);
        Texture2D maskTexture = GetMaskTexture(mask);
        if (maskTexture == null)
        {
            view.Mesh.Clear();
            return false;
        }

        if (view.MeshRenderer.sharedMaterial == null
            || !view.MeshRenderer.sharedMaterial.HasProperty("_MaskTex"))
        {
            view.Mesh.Clear();
            return false;
        }

        bool shouldCullToMask = ShouldCullMeshToMask(recipe);
        bool shouldCullToVisionBoundary = ShouldCullMeshToVisionBoundary(recipe);
        Camera arCamera = Camera.main;
        MaskTextureSampleData sampleData = null;
        if (shouldCullToMask)
        {
            sampleData = GetMaskTextureSampleData(mask);
            meshCullingMode = IsGeneratedBrowMaskTextureId(recipe.MaskTextureId)
                ? "generated_brow_green_alpha_threshold_sample"
                : "lip_atlas_threshold_sample";
            if (sampleData == null || sampleData.Status != "ok")
            {
                meshCullingMode = IsGeneratedBrowMaskTextureId(recipe.MaskTextureId)
                    ? "generated_brow_green_alpha_threshold_sample_unavailable"
                    : "lip_atlas_threshold_sample_unavailable";
                view.Mesh.Clear();
                return false;
            }
        }

        E7VisionLipBoundaryRuntime.BoundarySnapshot visionBoundary = default;
        if (shouldCullToVisionBoundary)
        {
            EnsureVisionLipBoundaryRuntime();
            if (visionLipBoundaryRuntime == null)
            {
                visionGateInfo.Status = "provider_missing";
                meshCullingMode = "apple_vision_lip_landmark_provider_missing";
                view.Mesh.Clear();
                return false;
            }

            visionLipBoundaryRuntime.SetRuntimeRequested(true);
            bool visionReady = visionLipBoundaryRuntime.TryGetLatestBoundary(
                Screen.width,
                Screen.height,
                out visionBoundary);
            visionGateInfo = BuildVisionGateInfo(visionBoundary);
            meshCullingMode = visionReady
                ? "apple_vision_lip_landmark_arface_uv_bake_pending"
                : "apple_vision_lip_landmark_pending";

            if (!visionReady)
            {
                view.Mesh.Clear();
                return false;
            }

            E7VisionLipBoundaryRuntime.BoundarySnapshot screenVisionBoundary =
                TransformVisionBoundaryForScreen(
                    visionBoundary,
                    Screen.width,
                    Screen.height,
                    VisionBoundaryRuntimeTransform);
            screenVisionBoundary = StabilizeVisionBoundaryToCurrentFace(
                face,
                arCamera,
                screenVisionBoundary);
            visionGateInfo = BuildVisionGateInfo(screenVisionBoundary);

            if (!ApplyVisionBoundaryUvMask(
                    face,
                    arCamera,
                    view,
                    visionBoundary,
                    screenVisionBoundary,
                    out dynamicMaskDiagnostics))
            {
                meshCullingMode = "apple_vision_lip_landmark_arface_uv_bake_unavailable";
                view.Mesh.Clear();
                return false;
            }

            screenVisionBoundary.CoordinateMode = AppendCoordinateMode(
                screenVisionBoundary.CoordinateMode,
                "arface-uv-bake");
            meshCullingMode = "apple_vision_lip_landmark_arface_uv_baked";
            visionBoundary = screenVisionBoundary;
            visionGateInfo = BuildVisionGateInfo(visionBoundary);
        }

        bool cheekBlushMask = IsCheekBlushRegion(recipe.Region) && IsCheekBlushMask(recipe.MaskTextureId);
        bool splitGeneratedBrowByFaceLocalX = IsGeneratedBrowRecipe(recipe);
        if (splitGeneratedBrowByFaceLocalX)
        {
            maskUvSplitBounds.Mode = "face_local_x_sign";
        }
        List<Vector3> vertices = new List<Vector3>(face.vertices.Length);
        List<Vector2> textureCoordinates = cheekBlushMask
            ? BuildCheekFaceLocalUvCoordinates(face)
            : new List<Vector2>(face.uvs.Length);
        List<int> triangles = new List<int>(face.indices.Length);

        for (int index = 0; index < face.vertices.Length; index++)
        {
            vertices.Add(face.vertices[index]);
        }

        if (!cheekBlushMask)
        {
            for (int index = 0; index < face.uvs.Length; index++)
            {
                textureCoordinates.Add(face.uvs[index]);
            }
        }

        for (int index = 0; index + 2 < face.indices.Length; index += 3)
        {
            int sourceA = face.indices[index];
            int sourceB = face.indices[index + 1];
            int sourceC = face.indices[index + 2];

            if (sourceA < 0 || sourceB < 0 || sourceC < 0
                || sourceA >= face.vertices.Length
                || sourceB >= face.vertices.Length
                || sourceC >= face.vertices.Length)
            {
                continue;
            }

            sourceTriangleCount++;
            if (shouldCullToVisionBoundary
                && !TriangleIntersectsVisionBoundary(
                    face,
                    arCamera,
                    sourceA,
                    sourceB,
                    sourceC,
                    visionBoundary))
            {
                culledTriangleCount++;
                continue;
            }

            if (shouldCullToMask
                && !TriangleIntersectsMask(
                    face.uvs[sourceA],
                    face.uvs[sourceB],
                    face.uvs[sourceC],
                    sampleData))
            {
                culledTriangleCount++;
                continue;
            }

            triangles.Add(sourceA);
            triangles.Add(sourceB);
            triangles.Add(sourceC);
            AccumulateUvBounds(ref maskUvBoundsAvailable, ref maskUvBounds, textureCoordinates[sourceA]);
            AccumulateUvBounds(ref maskUvBoundsAvailable, ref maskUvBounds, textureCoordinates[sourceB]);
            AccumulateUvBounds(ref maskUvBoundsAvailable, ref maskUvBounds, textureCoordinates[sourceC]);
            if (splitGeneratedBrowByFaceLocalX)
            {
                AccumulateFaceLocalXSplitUvBounds(
                    ref maskUvSplitBounds,
                    face.vertices[sourceA],
                    face.vertices[sourceB],
                    face.vertices[sourceC],
                    textureCoordinates[sourceA],
                    textureCoordinates[sourceB],
                    textureCoordinates[sourceC]);
            }
        }

        triangleCount = triangles.Count / 3;
        if (triangleCount == 0)
        {
            view.Mesh.Clear();
            return false;
        }

        if (IsGeneratedBrowRecipe(recipe))
        {
            StabilizeGeneratedBrowVertices(view, vertices);
        }

        view.Mesh.Clear();
        view.Mesh.SetVertices(vertices);
        view.Mesh.SetUVs(0, textureCoordinates);
        view.Mesh.SetTriangles(triangles, 0);
        view.Mesh.RecalculateNormals();
        view.Mesh.RecalculateBounds();
        return true;
    }

    private static void AccumulateUvBounds(
        ref bool boundsAvailable,
        ref Vector4 bounds,
        Vector2 uv)
    {
        float x = Mathf.Clamp01(uv.x);
        float y = Mathf.Clamp01(uv.y);
        if (!boundsAvailable)
        {
            bounds = new Vector4(x, y, x, y);
            boundsAvailable = true;
            return;
        }

        bounds.x = Mathf.Min(bounds.x, x);
        bounds.y = Mathf.Min(bounds.y, y);
        bounds.z = Mathf.Max(bounds.z, x);
        bounds.w = Mathf.Max(bounds.w, y);
    }

    private static MaskUvSplitBounds CreateDefaultMaskUvSplitBounds()
    {
        return new MaskUvSplitBounds
        {
            Mode = "none",
            NegativeXAvailable = false,
            NegativeXBounds = Vector4.zero,
            NegativeXTriangleCount = 0,
            PositiveXAvailable = false,
            PositiveXBounds = Vector4.zero,
            PositiveXTriangleCount = 0
        };
    }

    private static void AccumulateFaceLocalXSplitUvBounds(
        ref MaskUvSplitBounds splitBounds,
        Vector3 vertexA,
        Vector3 vertexB,
        Vector3 vertexC,
        Vector2 uvA,
        Vector2 uvB,
        Vector2 uvC)
    {
        float centroidX = (vertexA.x + vertexB.x + vertexC.x) / 3.0f;
        if (centroidX < 0.0f)
        {
            splitBounds.NegativeXTriangleCount++;
            AccumulateUvBounds(ref splitBounds.NegativeXAvailable, ref splitBounds.NegativeXBounds, uvA);
            AccumulateUvBounds(ref splitBounds.NegativeXAvailable, ref splitBounds.NegativeXBounds, uvB);
            AccumulateUvBounds(ref splitBounds.NegativeXAvailable, ref splitBounds.NegativeXBounds, uvC);
            return;
        }

        splitBounds.PositiveXTriangleCount++;
        AccumulateUvBounds(ref splitBounds.PositiveXAvailable, ref splitBounds.PositiveXBounds, uvA);
        AccumulateUvBounds(ref splitBounds.PositiveXAvailable, ref splitBounds.PositiveXBounds, uvB);
        AccumulateUvBounds(ref splitBounds.PositiveXAvailable, ref splitBounds.PositiveXBounds, uvC);
    }

    private static void MergeMaskUvBounds(
        ref RegionApplyResult result,
        bool boundsAvailable,
        Vector4 bounds)
    {
        if (!boundsAvailable)
        {
            return;
        }

        if (!result.MaskUvBoundsAvailable)
        {
            result.MaskUvMinX = bounds.x;
            result.MaskUvMinY = bounds.y;
            result.MaskUvMaxX = bounds.z;
            result.MaskUvMaxY = bounds.w;
            result.MaskUvBoundsAvailable = true;
            return;
        }

        result.MaskUvMinX = Mathf.Min(result.MaskUvMinX, bounds.x);
        result.MaskUvMinY = Mathf.Min(result.MaskUvMinY, bounds.y);
        result.MaskUvMaxX = Mathf.Max(result.MaskUvMaxX, bounds.z);
        result.MaskUvMaxY = Mathf.Max(result.MaskUvMaxY, bounds.w);
    }

    private static void MergeMaskUvSplitBounds(
        ref RegionApplyResult result,
        MaskUvSplitBounds splitBounds)
    {
        if (string.IsNullOrWhiteSpace(splitBounds.Mode) || splitBounds.Mode == "none")
        {
            return;
        }

        result.MaskUvSplitMode = splitBounds.Mode;
        result.MaskNegativeXTriangleCount += splitBounds.NegativeXTriangleCount;
        result.MaskPositiveXTriangleCount += splitBounds.PositiveXTriangleCount;
        MergeMaskNegativeXUvBounds(ref result, splitBounds.NegativeXAvailable, splitBounds.NegativeXBounds);
        MergeMaskPositiveXUvBounds(ref result, splitBounds.PositiveXAvailable, splitBounds.PositiveXBounds);
    }

    private static void MergeMaskNegativeXUvBounds(
        ref RegionApplyResult result,
        bool boundsAvailable,
        Vector4 bounds)
    {
        if (!boundsAvailable)
        {
            return;
        }

        if (!result.MaskNegativeXUvBoundsAvailable)
        {
            result.MaskNegativeXUvMinX = bounds.x;
            result.MaskNegativeXUvMinY = bounds.y;
            result.MaskNegativeXUvMaxX = bounds.z;
            result.MaskNegativeXUvMaxY = bounds.w;
            result.MaskNegativeXUvBoundsAvailable = true;
            return;
        }

        result.MaskNegativeXUvMinX = Mathf.Min(result.MaskNegativeXUvMinX, bounds.x);
        result.MaskNegativeXUvMinY = Mathf.Min(result.MaskNegativeXUvMinY, bounds.y);
        result.MaskNegativeXUvMaxX = Mathf.Max(result.MaskNegativeXUvMaxX, bounds.z);
        result.MaskNegativeXUvMaxY = Mathf.Max(result.MaskNegativeXUvMaxY, bounds.w);
    }

    private static void MergeMaskPositiveXUvBounds(
        ref RegionApplyResult result,
        bool boundsAvailable,
        Vector4 bounds)
    {
        if (!boundsAvailable)
        {
            return;
        }

        if (!result.MaskPositiveXUvBoundsAvailable)
        {
            result.MaskPositiveXUvMinX = bounds.x;
            result.MaskPositiveXUvMinY = bounds.y;
            result.MaskPositiveXUvMaxX = bounds.z;
            result.MaskPositiveXUvMaxY = bounds.w;
            result.MaskPositiveXUvBoundsAvailable = true;
            return;
        }

        result.MaskPositiveXUvMinX = Mathf.Min(result.MaskPositiveXUvMinX, bounds.x);
        result.MaskPositiveXUvMinY = Mathf.Min(result.MaskPositiveXUvMinY, bounds.y);
        result.MaskPositiveXUvMaxX = Mathf.Max(result.MaskPositiveXUvMaxX, bounds.z);
        result.MaskPositiveXUvMaxY = Mathf.Max(result.MaskPositiveXUvMaxY, bounds.w);
    }

    private static void StabilizeGeneratedBrowVertices(
        RegionOverlayView view,
        List<Vector3> vertices)
    {
        if (view == null || vertices == null || vertices.Count == 0)
        {
            return;
        }

        float nowSeconds = Time.realtimeSinceStartup;
        if (view.GeneratedBrowStableVertices == null
            || view.GeneratedBrowStableVertices.Length != vertices.Count
            || view.GeneratedBrowLastStableAtSeconds < 0.0f)
        {
            view.GeneratedBrowStableVertices = vertices.ToArray();
            view.GeneratedBrowLastStableAtSeconds = nowSeconds;
            return;
        }

        float deltaTime = Mathf.Clamp(
            nowSeconds - view.GeneratedBrowLastStableAtSeconds,
            1.0f / 120.0f,
            1.0f / 20.0f);
        view.GeneratedBrowLastStableAtSeconds = nowSeconds;
        float followAlpha = 1.0f - Mathf.Exp(-GeneratedBrowVertexFollowHz * deltaTime);

        for (int index = 0; index < vertices.Count; index++)
        {
            Vector3 current = vertices[index];
            Vector3 stable = view.GeneratedBrowStableVertices[index];
            Vector3 delta = current - stable;
            float distance = delta.magnitude;

            if (distance >= GeneratedBrowVertexSnapDistanceMeters)
            {
                stable = current;
            }
            else if (distance > GeneratedBrowVertexJitterDeadZoneMeters)
            {
                stable += delta * followAlpha;
            }

            view.GeneratedBrowStableVertices[index] = stable;
            vertices[index] = stable;
        }
    }

    private void EnsureVisionLipBoundaryRuntime()
    {
        if (visionLipBoundaryRuntime != null)
        {
            return;
        }

        visionLipBoundaryRuntime = FindFirstObjectByType<E7VisionLipBoundaryRuntime>();
        if (visionLipBoundaryRuntime == null)
        {
            visionLipBoundaryRuntime = gameObject.AddComponent<E7VisionLipBoundaryRuntime>();
        }
    }

    private static VisionBoundaryGateInfo CreateDefaultVisionGateInfo()
    {
        return new VisionBoundaryGateInfo
        {
            Status = "not_requested",
            Source = "none",
            CoordinateMode = "none",
            OuterPointCount = 0,
            InnerPointCount = 0,
            ImageWidth = 0,
            ImageHeight = 0,
            AgeMs = 0,
            FaceMotionScore = 0.0f,
            FaceMotionCenterShiftPx = 0.0f,
            FaceMotionScaleDelta = 0.0f,
            FaceMotionRisk = "none"
        };
    }

    private static VisionBoundaryGateInfo BuildVisionGateInfo(
        E7VisionLipBoundaryRuntime.BoundarySnapshot snapshot)
    {
        return new VisionBoundaryGateInfo
        {
            Status = string.IsNullOrWhiteSpace(snapshot.Status) ? "unknown" : snapshot.Status,
            Source = string.IsNullOrWhiteSpace(snapshot.Source) ? VisionLipBoundarySource : snapshot.Source,
            CoordinateMode = string.IsNullOrWhiteSpace(snapshot.CoordinateMode) ? "raw-y" : snapshot.CoordinateMode,
            OuterPointCount = snapshot.OuterPointCount,
            InnerPointCount = snapshot.InnerPointCount,
            ImageWidth = snapshot.ImageWidth,
            ImageHeight = snapshot.ImageHeight,
            AgeMs = snapshot.AgeMs,
            FaceMotionScore = snapshot.FaceMotionScore,
            FaceMotionCenterShiftPx = snapshot.FaceMotionCenterShiftPx,
            FaceMotionScaleDelta = snapshot.FaceMotionScaleDelta,
            FaceMotionRisk = string.IsNullOrWhiteSpace(snapshot.FaceMotionRisk) ? "none" : snapshot.FaceMotionRisk
        };
    }

    private static void ApplyVisionGateInfo(
        ref RegionApplyResult result,
        VisionBoundaryGateInfo info)
    {
        if (string.IsNullOrWhiteSpace(info.Status))
        {
            return;
        }

        result.VisionBoundaryStatus = info.Status;
        result.VisionBoundarySource = info.Source;
        result.VisionBoundaryCoordinateMode = info.CoordinateMode;
        result.VisionBoundaryOuterPointCount = info.OuterPointCount;
        result.VisionBoundaryInnerPointCount = info.InnerPointCount;
        result.VisionBoundaryImageWidth = info.ImageWidth;
        result.VisionBoundaryImageHeight = info.ImageHeight;
        result.VisionBoundaryAgeMs = info.AgeMs;
        result.VisionBoundaryFaceMotionScore = info.FaceMotionScore;
        result.VisionBoundaryFaceCenterShiftPx = info.FaceMotionCenterShiftPx;
        result.VisionBoundaryFaceScaleDelta = info.FaceMotionScaleDelta;
        result.VisionBoundaryFaceMotionRisk = info.FaceMotionRisk;
    }

    private static void ApplyDynamicMaskDiagnostics(
        ref RegionApplyResult result,
        MaskTextureDiagnostics diagnostics)
    {
        if (diagnostics == null)
        {
            return;
        }

        result.MaskTextureDiagnosticStatus = diagnostics.Status;
        result.MaskTextureSampleChannel = diagnostics.SampleChannel;
        result.MaskTextureWidth = diagnostics.Width;
        result.MaskTextureHeight = diagnostics.Height;
        result.MaskTextureActivePixelCountGt8 = diagnostics.ActivePixelCountGt8;
        result.MaskTextureActiveCoverageGt8 = diagnostics.ActiveCoverageGt8;
        result.MaskTextureActiveBbox = diagnostics.ActiveBbox;
        result.MaskTextureThresholdPixelCount = diagnostics.ThresholdPixelCount;
        result.MaskTextureThresholdCoverage = diagnostics.ThresholdCoverage;
        result.MaskTextureDensityPixelCountGt8 = diagnostics.DensityPixelCountGt8;
        result.MaskTextureDensityCoverageGt8 = diagnostics.DensityCoverageGt8;
        result.MaskTextureDensityBbox = diagnostics.DensityBbox;
        result.MaskTextureDensityMax = diagnostics.DensityMax;
    }

    private static bool ApplyVisionBoundaryUvMask(
        ARFace face,
        Camera arCamera,
        RegionOverlayView view,
        E7VisionLipBoundaryRuntime.BoundarySnapshot sourceBoundary,
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary,
        out MaskTextureDiagnostics diagnostics)
    {
        diagnostics = new MaskTextureDiagnostics
        {
            Status = "vision_arface_uv_bake_unavailable"
        };

        if (face == null
            || arCamera == null
            || view == null
            || view.MeshRenderer == null
            || view.MeshRenderer.sharedMaterial == null
            || !HasUsableUv(face)
            || boundary.OuterPoints == null
            || boundary.InnerPoints == null
            || boundary.OuterPoints.Length < 3
            || boundary.InnerPoints.Length < 3
            || boundary.ImageWidth <= 0
            || boundary.ImageHeight <= 0)
        {
            return false;
        }

        EnsureVisionUvMaskStorage(view, VisionUvMaskSize, VisionUvMaskSize);
        if (view.VisionUvMaskTexture == null
            || view.VisionUvMaskPixels == null
            || view.VisionUvMaskPixels.Length != VisionUvMaskSize * VisionUvMaskSize)
        {
            diagnostics.Status = "vision_arface_uv_bake_storage_failed";
            return false;
        }

        BuildVisionUvMaskPixels(
            face,
            arCamera,
            view,
            sourceBoundary,
            boundary,
            VisionUvMaskSize,
            VisionUvMaskSize);

        Material material = view.MeshRenderer.sharedMaterial;
        if (material.HasProperty("_MaskTex"))
        {
            material.SetTexture("_MaskTex", view.VisionUvMaskTexture);
        }

        if (material.HasProperty("_UseScreenSpaceMask"))
        {
            material.SetFloat("_UseScreenSpaceMask", 0.0f);
        }

        diagnostics = view.VisionUvMaskDiagnostics ?? new MaskTextureDiagnostics
        {
            Status = "vision_arface_uv_bake_missing_diagnostics",
            Width = VisionUvMaskSize,
            Height = VisionUvMaskSize
        };
        return diagnostics.ActivePixelCountGt8 > 0;
    }

    private static void EnsureVisionUvMaskStorage(
        RegionOverlayView view,
        int width,
        int height)
    {
        if (view.VisionUvMaskTexture != null
            && view.VisionUvMaskWidth == width
            && view.VisionUvMaskHeight == height
            && view.VisionUvMaskPixels != null
            && view.VisionUvMaskPixels.Length == width * height)
        {
            return;
        }

        if (view.VisionUvMaskTexture != null)
        {
            UnityEngine.Object.Destroy(view.VisionUvMaskTexture);
        }

        view.VisionUvMaskTexture = new Texture2D(width, height, TextureFormat.RGBA32, false)
        {
            name = "E7 Vision Lip Boundary ARFace UV Mask",
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear
        };
        view.VisionUvMaskPixels = new Color32[width * height];
        view.VisionUvMaskWidth = width;
        view.VisionUvMaskHeight = height;
        view.VisionUvMaskSequence = -1;
        view.VisionUvMaskDiagnostics = new MaskTextureDiagnostics
        {
            Status = "vision_arface_uv_bake_allocated",
            Width = width,
            Height = height
        };
    }

    private static void BuildVisionUvMaskPixels(
        ARFace face,
        Camera arCamera,
        RegionOverlayView view,
        E7VisionLipBoundaryRuntime.BoundarySnapshot sourceBoundary,
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary,
        int width,
        int height)
    {
        Color32[] pixels = view.VisionUvMaskPixels;
        Array.Clear(pixels, 0, pixels.Length);

        int screenWidth = Mathf.Max(1, boundary.ImageWidth);
        int screenHeight = Mathf.Max(1, boundary.ImageHeight);
        CalculateBoundaryBbox(
            boundary.OuterPoints,
            screenWidth,
            screenHeight,
            out int boundaryLeft,
            out int boundaryTop,
            out int boundaryRight,
            out int boundaryBottom);

        int sampleStride = ResolveVisionUvBakeSampleStride(screenWidth, screenHeight);
        int candidateTriangles = 0;
        int hitTriangles = 0;
        int testedSamples = 0;
        int hitSamples = 0;
        int skippedDegenerateTriangles = 0;

        for (int index = 0; index + 2 < face.indices.Length; index += 3)
        {
            int sourceA = face.indices[index];
            int sourceB = face.indices[index + 1];
            int sourceC = face.indices[index + 2];
            if (sourceA < 0 || sourceB < 0 || sourceC < 0
                || sourceA >= face.vertices.Length
                || sourceB >= face.vertices.Length
                || sourceC >= face.vertices.Length
                || sourceA >= face.uvs.Length
                || sourceB >= face.uvs.Length
                || sourceC >= face.uvs.Length
                || !TryProjectVertexTopLeft(face, arCamera, sourceA, out Vector2 screenA)
                || !TryProjectVertexTopLeft(face, arCamera, sourceB, out Vector2 screenB)
                || !TryProjectVertexTopLeft(face, arCamera, sourceC, out Vector2 screenC)
                || !CalculateTriangleBbox(
                    screenA,
                    screenB,
                    screenC,
                    screenWidth,
                    screenHeight,
                    out int triangleLeft,
                    out int triangleTop,
                    out int triangleRight,
                    out int triangleBottom))
            {
                continue;
            }

            int left = Mathf.Max(triangleLeft, boundaryLeft);
            int top = Mathf.Max(triangleTop, boundaryTop);
            int right = Mathf.Min(triangleRight, boundaryRight);
            int bottom = Mathf.Min(triangleBottom, boundaryBottom);
            if (right < left || bottom < top)
            {
                continue;
            }

            candidateTriangles++;
            Vector2 uvA = face.uvs[sourceA];
            Vector2 uvB = face.uvs[sourceB];
            Vector2 uvC = face.uvs[sourceC];
            bool triangleHit = false;

            for (int y = top; y <= bottom; y += sampleStride)
            {
                for (int x = left; x <= right; x += sampleStride)
                {
                    Vector2 point = new Vector2(x + 0.5f, y + 0.5f);
                    if (!TryCalculateBarycentric(point, screenA, screenB, screenC, out Vector3 barycentric))
                    {
                        continue;
                    }

                    testedSamples++;
                    if (!IsPointInsideLipBoundary(point, boundary))
                    {
                        continue;
                    }

                    Vector2 uv = uvA * barycentric.x
                        + uvB * barycentric.y
                        + uvC * barycentric.z;
                    if (!WriteVisionUvMaskPixel(pixels, width, height, uv))
                    {
                        continue;
                    }

                    hitSamples++;
                    triangleHit = true;
                }
            }

            if (triangleHit)
            {
                hitTriangles++;
            }
            else if (IsTriangleDegenerate(screenA, screenB, screenC))
            {
                skippedDegenerateTriangles++;
            }
        }

        view.VisionUvMaskTexture.SetPixels32(pixels);
        view.VisionUvMaskTexture.Apply(false, false);
        view.VisionUvMaskSequence = boundary.Sequence;
        MaskTextureDiagnostics bakedDiagnostics = BuildRuntimeMaskDiagnosticsFromPixels(
            hitSamples > 0
                ? "vision_arface_uv_baked_outer_minus_inner_soft_falloff"
                : "vision_arface_uv_baked_empty",
            width,
            height,
            pixels);
        view.VisionUvMaskDiagnostics = bakedDiagnostics;

        Debug.Log(
            "[E7] vision_lip_boundary_arface_uv_bake"
            + " sequence=" + boundary.Sequence.ToString(CultureInfo.InvariantCulture)
            + " selected=" + VisionBoundaryRuntimeTransform
            + " sourceCoordinateMode=" + sourceBoundary.CoordinateMode
            + " bakedCoordinateMode=" + boundary.CoordinateMode + "->arface-uv-bake"
            + " uvSize=" + width.ToString(CultureInfo.InvariantCulture)
            + "x" + height.ToString(CultureInfo.InvariantCulture)
            + " candidateTriangles=" + candidateTriangles.ToString(CultureInfo.InvariantCulture)
            + " hitTriangles=" + hitTriangles.ToString(CultureInfo.InvariantCulture)
            + " testedSamples=" + testedSamples.ToString(CultureInfo.InvariantCulture)
            + " hitSamples=" + hitSamples.ToString(CultureInfo.InvariantCulture)
            + " activePixels=" + bakedDiagnostics.ActivePixelCountGt8.ToString(CultureInfo.InvariantCulture)
            + " activeCoverage=" + bakedDiagnostics.ActiveCoverageGt8.ToString("0.######", CultureInfo.InvariantCulture)
            + " activeBbox=" + bakedDiagnostics.ActiveBbox
            + " softSplatRadius=" + VisionUvMaskSoftSplatRadius.ToString(CultureInfo.InvariantCulture)
            + " sampleStride=" + sampleStride.ToString(CultureInfo.InvariantCulture)
            + " skippedDegenerateTriangles=" + skippedDegenerateTriangles.ToString(CultureInfo.InvariantCulture)
            + " candidates="
            + BuildVisionTransformCandidateSummary(
                sourceBoundary,
                Mathf.Max(1, sourceBoundary.ImageWidth),
                Mathf.Max(1, sourceBoundary.ImageHeight)));
    }

    private static bool ApplyVisionBoundaryScreenMask(
        RegionOverlayView view,
        E7VisionLipBoundaryRuntime.BoundarySnapshot sourceBoundary,
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary,
        out MaskTextureDiagnostics diagnostics)
    {
        diagnostics = new MaskTextureDiagnostics
        {
            Status = "vision_screen_mask_unavailable"
        };

        if (view == null
            || view.MeshRenderer == null
            || view.MeshRenderer.sharedMaterial == null
            || boundary.OuterPoints == null
            || boundary.InnerPoints == null
            || boundary.OuterPoints.Length < 3
            || boundary.InnerPoints.Length < 3
            || boundary.ImageWidth <= 0
            || boundary.ImageHeight <= 0)
        {
            return false;
        }

        ResolveVisionScreenMaskSize(boundary.ImageWidth, boundary.ImageHeight, out int width, out int height);
        EnsureVisionScreenMaskStorage(view, width, height);
        if (view.VisionScreenMaskTexture == null
            || view.VisionScreenMaskPixels == null
            || view.VisionScreenMaskPixels.Length != width * height)
        {
            diagnostics.Status = "vision_screen_mask_storage_failed";
            return false;
        }

        BuildVisionScreenMaskPixels(view, sourceBoundary, boundary, width, height);

        Material material = view.MeshRenderer.sharedMaterial;
        if (material.HasProperty("_MaskTex"))
        {
            material.SetTexture("_MaskTex", view.VisionScreenMaskTexture);
        }

        if (material.HasProperty("_UseScreenSpaceMask"))
        {
            material.SetFloat("_UseScreenSpaceMask", 1.0f);
        }

        diagnostics = view.VisionScreenMaskDiagnostics ?? new MaskTextureDiagnostics
        {
            Status = "vision_screen_mask_missing_diagnostics",
            Width = width,
            Height = height
        };
        return diagnostics.ActivePixelCountGt8 > 0;
    }

    private static void EnsureVisionScreenMaskStorage(
        RegionOverlayView view,
        int width,
        int height)
    {
        if (view.VisionScreenMaskTexture != null
            && view.VisionScreenMaskWidth == width
            && view.VisionScreenMaskHeight == height
            && view.VisionScreenMaskPixels != null
            && view.VisionScreenMaskPixels.Length == width * height)
        {
            return;
        }

        if (view.VisionScreenMaskTexture != null)
        {
            UnityEngine.Object.Destroy(view.VisionScreenMaskTexture);
        }

        view.VisionScreenMaskTexture = new Texture2D(width, height, TextureFormat.RGBA32, false)
        {
            name = "E7 Vision Lip Boundary Screen Mask",
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear
        };
        view.VisionScreenMaskPixels = new Color32[width * height];
        view.VisionScreenMaskWidth = width;
        view.VisionScreenMaskHeight = height;
        view.VisionScreenMaskSequence = -1;
        view.VisionScreenMaskDiagnostics = new MaskTextureDiagnostics
        {
            Status = "vision_screen_mask_allocated",
            Width = width,
            Height = height
        };
    }

    private static void BuildVisionScreenMaskPixels(
        RegionOverlayView view,
        E7VisionLipBoundaryRuntime.BoundarySnapshot sourceBoundary,
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary,
        int width,
        int height)
    {
        Color32[] pixels = view.VisionScreenMaskPixels;
        Array.Clear(pixels, 0, pixels.Length);
        Vector2[] outerPoints = ScaleVisionBoundaryPoints(
            boundary.OuterPoints,
            width / (float)Mathf.Max(1, boundary.ImageWidth),
            height / (float)Mathf.Max(1, boundary.ImageHeight));
        Vector2[] innerPoints = ScaleVisionBoundaryPoints(
            boundary.InnerPoints,
            width / (float)Mathf.Max(1, boundary.ImageWidth),
            height / (float)Mathf.Max(1, boundary.ImageHeight));

        int minX = width;
        int minY = height;
        int maxX = -1;
        int maxY = -1;
        CalculateBoundaryBbox(outerPoints, width, height, out int left, out int top, out int right, out int bottom);
        int activeCount = 0;

        for (int topLeftY = top; topLeftY <= bottom; topLeftY++)
        {
            for (int x = left; x <= right; x++)
            {
                Vector2 point = new Vector2(x + 0.5f, topLeftY + 0.5f);
                if (!IsPointInsideLipBoundary(point, outerPoints, innerPoints))
                {
                    continue;
                }

                int textureY = height - 1 - topLeftY;
                int pixelIndex = textureY * width + x;
                if (pixelIndex < 0 || pixelIndex >= pixels.Length)
                {
                    continue;
                }

                pixels[pixelIndex] = new Color32(255, 0, 255, 255);
                activeCount++;
                minX = Mathf.Min(minX, x);
                maxX = Mathf.Max(maxX, x);
                minY = Mathf.Min(minY, topLeftY);
                maxY = Mathf.Max(maxY, topLeftY);
            }
        }

        view.VisionScreenMaskTexture.SetPixels32(pixels);
        view.VisionScreenMaskTexture.Apply(false, false);
        view.VisionScreenMaskSequence = boundary.Sequence;
        int totalPixels = Mathf.Max(1, width * height);
        Debug.Log(
            "[E7] vision_lip_boundary_transform_candidates"
            + " sequence=" + boundary.Sequence.ToString(CultureInfo.InvariantCulture)
            + " selected=" + VisionBoundaryRuntimeTransform
            + " sourceCoordinateMode=" + sourceBoundary.CoordinateMode
            + " screenCoordinateMode=" + boundary.CoordinateMode
            + " candidates="
            + BuildVisionTransformCandidateSummary(
                sourceBoundary,
                Mathf.Max(1, sourceBoundary.ImageWidth),
                Mathf.Max(1, sourceBoundary.ImageHeight)));
        view.VisionScreenMaskDiagnostics = new MaskTextureDiagnostics
        {
            Status = activeCount > 0
                ? "vision_screen_space_outer_minus_inner"
                : "vision_screen_space_empty",
            Width = width,
            Height = height,
            ActivePixelCountGt8 = activeCount,
            ActiveCoverageGt8 = activeCount / (float)totalPixels,
            ActiveBbox = activeCount == 0
                ? "none"
                : "left=" + minX.ToString(CultureInfo.InvariantCulture)
                    + ",top=" + minY.ToString(CultureInfo.InvariantCulture)
                    + ",right=" + maxX.ToString(CultureInfo.InvariantCulture)
                    + ",bottom=" + maxY.ToString(CultureInfo.InvariantCulture)
                    + ",width=" + (maxX - minX + 1).ToString(CultureInfo.InvariantCulture)
                    + ",height=" + (maxY - minY + 1).ToString(CultureInfo.InvariantCulture),
            ThresholdPixelCount = activeCount,
            ThresholdCoverage = activeCount / (float)totalPixels
        };
    }

    private static void ResolveVisionScreenMaskSize(
        int sourceWidth,
        int sourceHeight,
        out int width,
        out int height)
    {
        sourceWidth = Mathf.Max(1, sourceWidth);
        sourceHeight = Mathf.Max(1, sourceHeight);
        float largest = Mathf.Max(sourceWidth, sourceHeight);
        float scale = Mathf.Min(1.0f, VisionScreenMaskMaxDimension / largest);
        width = Mathf.Max(1, Mathf.RoundToInt(sourceWidth * scale));
        height = Mathf.Max(1, Mathf.RoundToInt(sourceHeight * scale));
    }

    private static Vector2[] ScaleVisionBoundaryPoints(
        Vector2[] points,
        float scaleX,
        float scaleY)
    {
        if (points == null || points.Length == 0)
        {
            return Array.Empty<Vector2>();
        }

        Vector2[] scaled = new Vector2[points.Length];
        for (int index = 0; index < points.Length; index++)
        {
            scaled[index] = new Vector2(points[index].x * scaleX, points[index].y * scaleY);
        }

        return scaled;
    }

    private static E7VisionLipBoundaryRuntime.BoundarySnapshot TransformVisionBoundaryForScreen(
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary,
        int width,
        int height,
        string transformMode)
    {
        E7VisionLipBoundaryRuntime.BoundarySnapshot transformed = boundary;
        width = Mathf.Max(1, width);
        height = Mathf.Max(1, height);
        transformMode = NormalizeVisionTransformMode(transformMode);
        transformed.OuterPoints = TransformVisionBoundaryPoints(
            boundary.OuterPoints,
            width,
            height,
            transformMode);
        transformed.InnerPoints = TransformVisionBoundaryPoints(
            boundary.InnerPoints,
            width,
            height,
            transformMode);
        transformed.ImageWidth = width;
        transformed.ImageHeight = height;
        transformed.CoordinateMode = string.IsNullOrWhiteSpace(boundary.CoordinateMode)
            ? transformMode
            : boundary.CoordinateMode + "->" + transformMode;
        return transformed;
    }

    private static E7VisionLipBoundaryRuntime.BoundarySnapshot StabilizeVisionBoundaryToCurrentFace(
        ARFace face,
        Camera arCamera,
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary)
    {
        if (!boundary.Available
            || !boundary.FaceBoundsAvailable
            || boundary.FaceBoundsSize.x <= 1.0f
            || boundary.FaceBoundsSize.y <= 1.0f
            || !TryCalculateCurrentFaceScreenBounds(face, arCamera, out Vector2 currentCenter, out Vector2 currentSize))
        {
            boundary.StabilizationMode = AppendStabilizationMode(
                boundary.StabilizationMode,
                "face_local_unavailable");
            return boundary;
        }

        float rawScaleX = currentSize.x / Mathf.Max(1.0f, boundary.FaceBoundsSize.x);
        float rawScaleY = currentSize.y / Mathf.Max(1.0f, boundary.FaceBoundsSize.y);
        Vector2 scale = new Vector2(
            Mathf.Clamp(rawScaleX, 0.82f, 1.22f),
            Mathf.Clamp(rawScaleY, 0.82f, 1.22f));
        float centerShiftPx = Vector2.Distance(currentCenter, boundary.FaceBoundsCenter);
        float referenceSize = Mathf.Max(1.0f, Mathf.Max(boundary.FaceBoundsSize.x, boundary.FaceBoundsSize.y));
        float centerShiftNormalized = centerShiftPx / referenceSize;
        float scaleDelta = Mathf.Max(Mathf.Abs(rawScaleX - 1.0f), Mathf.Abs(rawScaleY - 1.0f));
        float motionScore = centerShiftNormalized + scaleDelta * 0.5f;
        boundary.FaceMotionCenterShiftPx = centerShiftPx;
        boundary.FaceMotionScaleDelta = scaleDelta;
        boundary.FaceMotionScore = motionScore;
        boundary.FaceMotionRisk = ResolveVisionFaceMotionRisk(motionScore);
        boundary.OuterPoints = WarpBoundaryPointsToCurrentFace(
            boundary.OuterPoints,
            boundary.FaceBoundsCenter,
            currentCenter,
            scale);
        boundary.InnerPoints = WarpBoundaryPointsToCurrentFace(
            boundary.InnerPoints,
            boundary.FaceBoundsCenter,
            currentCenter,
            scale);
        boundary.CoordinateMode = string.IsNullOrWhiteSpace(boundary.CoordinateMode)
            ? "face-local-warp"
            : boundary.CoordinateMode + "->face-local-warp";
        boundary.StabilizationMode = AppendStabilizationMode(
            boundary.StabilizationMode,
            "face_bbox_translate_scale");
        if (motionScore >= VisionFaceMotionLargeThreshold)
        {
            boundary.StabilizationMode = AppendStabilizationMode(
                boundary.StabilizationMode,
                "large_face_motion_compensated");
        }

        return boundary;
    }

    private static string ResolveVisionFaceMotionRisk(float motionScore)
    {
        if (motionScore >= VisionFaceMotionLargeThreshold)
        {
            return "large_face_motion";
        }

        if (motionScore >= VisionFaceMotionMediumThreshold)
        {
            return "medium_face_motion";
        }

        return "low_face_motion";
    }

    private static bool TryCalculateCurrentFaceScreenBounds(
        ARFace face,
        Camera arCamera,
        out Vector2 center,
        out Vector2 size)
    {
        center = Vector2.zero;
        size = Vector2.zero;
        if (face == null
            || arCamera == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0)
        {
            return false;
        }

        float minX = float.MaxValue;
        float minY = float.MaxValue;
        float maxX = float.MinValue;
        float maxY = float.MinValue;
        int count = 0;
        for (int index = 0; index < face.vertices.Length; index++)
        {
            Vector3 screen = arCamera.WorldToScreenPoint(face.transform.TransformPoint(face.vertices[index]));
            if (screen.z <= 0.0f)
            {
                continue;
            }

            float topLeftY = Screen.height - screen.y;
            minX = Mathf.Min(minX, screen.x);
            maxX = Mathf.Max(maxX, screen.x);
            minY = Mathf.Min(minY, topLeftY);
            maxY = Mathf.Max(maxY, topLeftY);
            count++;
        }

        if (count <= 0 || maxX <= minX || maxY <= minY)
        {
            return false;
        }

        center = new Vector2((minX + maxX) * 0.5f, (minY + maxY) * 0.5f);
        size = new Vector2(maxX - minX, maxY - minY);
        return true;
    }

    private static Vector2[] WarpBoundaryPointsToCurrentFace(
        Vector2[] points,
        Vector2 captureCenter,
        Vector2 currentCenter,
        Vector2 scale)
    {
        if (points == null || points.Length == 0)
        {
            return Array.Empty<Vector2>();
        }

        Vector2[] warped = new Vector2[points.Length];
        for (int index = 0; index < points.Length; index++)
        {
            Vector2 local = points[index] - captureCenter;
            warped[index] = currentCenter + new Vector2(local.x * scale.x, local.y * scale.y);
        }

        return warped;
    }

    private static string AppendStabilizationMode(string current, string addition)
    {
        if (string.IsNullOrWhiteSpace(current))
        {
            return addition;
        }

        return current.Contains(addition) ? current : current + "+" + addition;
    }

    private static string AppendCoordinateMode(string current, string addition)
    {
        if (string.IsNullOrWhiteSpace(current))
        {
            return addition;
        }

        return current.Contains(addition) ? current : current + "->" + addition;
    }

    private static Vector2[] TransformVisionBoundaryPoints(
        Vector2[] points,
        int width,
        int height,
        string transformMode)
    {
        if (points == null || points.Length == 0)
        {
            return Array.Empty<Vector2>();
        }

        Vector2[] transformed = new Vector2[points.Length];
        for (int index = 0; index < points.Length; index++)
        {
            transformed[index] = TransformVisionBoundaryPoint(
                points[index],
                width,
                height,
                transformMode);
        }

        return transformed;
    }

    private static Vector2 TransformVisionBoundaryPoint(
        Vector2 point,
        int width,
        int height,
        string transformMode)
    {
        width = Mathf.Max(1, width);
        height = Mathf.Max(1, height);
        transformMode = NormalizeVisionTransformMode(transformMode);

        float x = point.x;
        float y = point.y;
        if (transformMode == "flip-x" || transformMode == "flip-xy")
        {
            x = width - x;
        }

        if (transformMode == "flip-y" || transformMode == "flip-xy")
        {
            y = height - y;
        }

        return new Vector2(x, y);
    }

    private static string BuildVisionTransformCandidateSummary(
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary,
        int width,
        int height)
    {
        if (boundary.OuterPoints == null || boundary.OuterPoints.Length < 3)
        {
            return "none";
        }

        return "raw=" + BuildVisionBoundaryBboxSummary(boundary.OuterPoints, width, height, "raw")
            + ";flip-y=" + BuildVisionBoundaryBboxSummary(boundary.OuterPoints, width, height, "flip-y")
            + ";flip-x=" + BuildVisionBoundaryBboxSummary(boundary.OuterPoints, width, height, "flip-x")
            + ";flip-xy=" + BuildVisionBoundaryBboxSummary(boundary.OuterPoints, width, height, "flip-xy");
    }

    private static string BuildVisionBoundaryBboxSummary(
        Vector2[] points,
        int width,
        int height,
        string transformMode)
    {
        Vector2[] transformed = TransformVisionBoundaryPoints(
            points,
            width,
            height,
            transformMode);
        CalculateBoundaryBbox(transformed, width, height, out int left, out int top, out int right, out int bottom);
        return "left=" + left.ToString(CultureInfo.InvariantCulture)
            + ",top=" + top.ToString(CultureInfo.InvariantCulture)
            + ",right=" + right.ToString(CultureInfo.InvariantCulture)
            + ",bottom=" + bottom.ToString(CultureInfo.InvariantCulture);
    }

    private static string NormalizeVisionTransformMode(string transformMode)
    {
        transformMode = string.IsNullOrWhiteSpace(transformMode)
            ? "raw"
            : transformMode.Trim().ToLowerInvariant();

        if (transformMode == "raw"
            || transformMode == "flip-y"
            || transformMode == "flip-x"
            || transformMode == "flip-xy")
        {
            return transformMode;
        }

        return "raw";
    }

    private static int ResolveVisionUvBakeSampleStride(int screenWidth, int screenHeight)
    {
        int largest = Mathf.Max(Mathf.Max(1, screenWidth), Mathf.Max(1, screenHeight));
        return Mathf.Clamp(Mathf.RoundToInt(largest / 900.0f), 1, 4);
    }

    private static bool CalculateTriangleBbox(
        Vector2 a,
        Vector2 b,
        Vector2 c,
        int width,
        int height,
        out int left,
        out int top,
        out int right,
        out int bottom)
    {
        const int padding = 1;
        left = Mathf.Clamp(
            Mathf.FloorToInt(Mathf.Min(a.x, Mathf.Min(b.x, c.x))) - padding,
            0,
            Mathf.Max(0, width - 1));
        right = Mathf.Clamp(
            Mathf.CeilToInt(Mathf.Max(a.x, Mathf.Max(b.x, c.x))) + padding,
            0,
            Mathf.Max(0, width - 1));
        top = Mathf.Clamp(
            Mathf.FloorToInt(Mathf.Min(a.y, Mathf.Min(b.y, c.y))) - padding,
            0,
            Mathf.Max(0, height - 1));
        bottom = Mathf.Clamp(
            Mathf.CeilToInt(Mathf.Max(a.y, Mathf.Max(b.y, c.y))) + padding,
            0,
            Mathf.Max(0, height - 1));

        return right >= left
            && bottom >= top
            && !IsTriangleDegenerate(a, b, c);
    }

    private static bool TryCalculateBarycentric(
        Vector2 point,
        Vector2 a,
        Vector2 b,
        Vector2 c,
        out Vector3 weights)
    {
        weights = Vector3.zero;
        float denominator = (b.y - c.y) * (a.x - c.x)
            + (c.x - b.x) * (a.y - c.y);
        if (Mathf.Abs(denominator) < 0.0001f)
        {
            return false;
        }

        float weightA = ((b.y - c.y) * (point.x - c.x)
            + (c.x - b.x) * (point.y - c.y)) / denominator;
        float weightB = ((c.y - a.y) * (point.x - c.x)
            + (a.x - c.x) * (point.y - c.y)) / denominator;
        float weightC = 1.0f - weightA - weightB;
        const float epsilon = -0.02f;
        if (weightA < epsilon || weightB < epsilon || weightC < epsilon)
        {
            return false;
        }

        weights = new Vector3(weightA, weightB, weightC);
        return true;
    }

    private static bool WriteVisionUvMaskPixel(
        Color32[] pixels,
        int width,
        int height,
        Vector2 uv)
    {
        if (pixels == null
            || pixels.Length != width * height
            || width <= 0
            || height <= 0
            || float.IsNaN(uv.x)
            || float.IsNaN(uv.y)
            || float.IsInfinity(uv.x)
            || float.IsInfinity(uv.y))
        {
            return false;
        }

        int centerX = Mathf.Clamp(
            Mathf.RoundToInt(Mathf.Clamp01(uv.x) * (width - 1)),
            0,
            width - 1);
        int centerY = Mathf.Clamp(
            Mathf.RoundToInt(Mathf.Clamp01(uv.y) * (height - 1)),
            0,
            height - 1);

        bool wrote = false;
        for (int offsetY = -VisionUvMaskSoftSplatRadius; offsetY <= VisionUvMaskSoftSplatRadius; offsetY++)
        {
            int y = centerY + offsetY;
            if (y < 0 || y >= height)
            {
                continue;
            }

            for (int offsetX = -VisionUvMaskSoftSplatRadius; offsetX <= VisionUvMaskSoftSplatRadius; offsetX++)
            {
                int x = centerX + offsetX;
                if (x < 0 || x >= width)
                {
                    continue;
                }

                float distance = Mathf.Sqrt(offsetX * offsetX + offsetY * offsetY);
                float falloff = Mathf.Clamp01(1.0f - distance / (VisionUvMaskSoftSplatRadius + 0.5f));
                falloff = falloff * falloff * (3.0f - 2.0f * falloff);
                byte value = (byte)Mathf.RoundToInt(falloff * 255.0f);
                if (value == 0)
                {
                    continue;
                }

                int pixelIndex = y * width + x;
                Color32 current = pixels[pixelIndex];
                byte merged = current.r > value ? current.r : value;
                pixels[pixelIndex] = new Color32(merged, 0, merged, merged);
                wrote = true;
            }
        }

        return wrote;
    }

    private static MaskTextureDiagnostics BuildRuntimeMaskDiagnosticsFromPixels(
        string status,
        int width,
        int height,
        Color32[] pixels)
    {
        MaskTextureDiagnostics diagnostics = new MaskTextureDiagnostics
        {
            Status = status,
            Width = width,
            Height = height,
            ActiveBbox = "none"
        };

        if (pixels == null || pixels.Length != width * height || width <= 0 || height <= 0)
        {
            diagnostics.Status = status + "_invalid_pixels";
            return diagnostics;
        }

        int minX = width;
        int minY = height;
        int maxX = -1;
        int maxY = -1;
        int activeCount = 0;
        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                Color32 pixel = pixels[y * width + x];
                int value = Mathf.Max(
                    Mathf.Max(pixel.r, pixel.g),
                    Mathf.Max(pixel.b, pixel.a));
                if (value <= 8)
                {
                    continue;
                }

                int topLeftY = height - 1 - y;
                activeCount++;
                minX = Mathf.Min(minX, x);
                maxX = Mathf.Max(maxX, x);
                minY = Mathf.Min(minY, topLeftY);
                maxY = Mathf.Max(maxY, topLeftY);
            }
        }

        int totalPixels = Mathf.Max(1, width * height);
        diagnostics.ActivePixelCountGt8 = activeCount;
        diagnostics.ActiveCoverageGt8 = activeCount / (float)totalPixels;
        diagnostics.ThresholdPixelCount = activeCount;
        diagnostics.ThresholdCoverage = activeCount / (float)totalPixels;
        diagnostics.ActiveBbox = activeCount == 0
            ? "none"
            : "left=" + minX.ToString(CultureInfo.InvariantCulture)
                + ",top=" + minY.ToString(CultureInfo.InvariantCulture)
                + ",right=" + maxX.ToString(CultureInfo.InvariantCulture)
                + ",bottom=" + maxY.ToString(CultureInfo.InvariantCulture)
                + ",width=" + (maxX - minX + 1).ToString(CultureInfo.InvariantCulture)
                + ",height=" + (maxY - minY + 1).ToString(CultureInfo.InvariantCulture);
        return diagnostics;
    }

    private static bool IsTriangleDegenerate(Vector2 a, Vector2 b, Vector2 c)
    {
        return Mathf.Abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < 0.0001f;
    }

    private static void CalculateBoundaryBbox(
        Vector2[] points,
        int width,
        int height,
        out int left,
        out int top,
        out int right,
        out int bottom)
    {
        const int padding = 2;
        float minX = width;
        float minY = height;
        float maxX = -1.0f;
        float maxY = -1.0f;

        for (int index = 0; index < points.Length; index++)
        {
            Vector2 point = points[index];
            minX = Mathf.Min(minX, point.x);
            maxX = Mathf.Max(maxX, point.x);
            minY = Mathf.Min(minY, point.y);
            maxY = Mathf.Max(maxY, point.y);
        }

        left = Mathf.Clamp(Mathf.FloorToInt(minX) - padding, 0, width - 1);
        right = Mathf.Clamp(Mathf.CeilToInt(maxX) + padding, 0, width - 1);
        top = Mathf.Clamp(Mathf.FloorToInt(minY) - padding, 0, height - 1);
        bottom = Mathf.Clamp(Mathf.CeilToInt(maxY) + padding, 0, height - 1);
    }

    private static bool TriangleIntersectsVisionBoundary(
        ARFace face,
        Camera arCamera,
        int sourceA,
        int sourceB,
        int sourceC,
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary)
    {
        if (face == null
            || arCamera == null
            || boundary.OuterPoints == null
            || boundary.InnerPoints == null
            || boundary.OuterPoints.Length < 3
            || boundary.InnerPoints.Length < 3)
        {
            return false;
        }

        Vector2 screenA = ProjectVertexTopLeft(face, arCamera, sourceA);
        Vector2 screenB = ProjectVertexTopLeft(face, arCamera, sourceB);
        Vector2 screenC = ProjectVertexTopLeft(face, arCamera, sourceC);
        Vector2 centroid = (screenA + screenB + screenC) / 3.0f;
        Vector2 midAB = (screenA + screenB) * 0.5f;
        Vector2 midBC = (screenB + screenC) * 0.5f;
        Vector2 midCA = (screenC + screenA) * 0.5f;

        return IsPointInsideLipBoundary(screenA, boundary)
            || IsPointInsideLipBoundary(screenB, boundary)
            || IsPointInsideLipBoundary(screenC, boundary)
            || IsPointInsideLipBoundary(centroid, boundary)
            || IsPointInsideLipBoundary(midAB, boundary)
            || IsPointInsideLipBoundary(midBC, boundary)
            || IsPointInsideLipBoundary(midCA, boundary);
    }

    private static bool TryProjectVertexTopLeft(
        ARFace face,
        Camera arCamera,
        int vertexIndex,
        out Vector2 point)
    {
        point = Vector2.zero;
        if (face == null
            || arCamera == null
            || vertexIndex < 0
            || vertexIndex >= face.vertices.Length)
        {
            return false;
        }

        Vector3 world = face.transform.TransformPoint(face.vertices[vertexIndex]);
        Vector3 screen = arCamera.WorldToScreenPoint(world);
        if (screen.z <= 0.0f)
        {
            return false;
        }

        point = new Vector2(screen.x, Screen.height - screen.y);
        return true;
    }

    private static Vector2 ProjectVertexTopLeft(ARFace face, Camera arCamera, int vertexIndex)
    {
        Vector3 world = face.transform.TransformPoint(face.vertices[vertexIndex]);
        Vector3 screen = arCamera.WorldToScreenPoint(world);
        return new Vector2(screen.x, Screen.height - screen.y);
    }

    private static bool IsPointInsideLipBoundary(
        Vector2 point,
        E7VisionLipBoundaryRuntime.BoundarySnapshot boundary)
    {
        return IsPointInsideLipBoundary(point, boundary.OuterPoints, boundary.InnerPoints);
    }

    private static bool IsPointInsideLipBoundary(
        Vector2 point,
        Vector2[] outerPoints,
        Vector2[] innerPoints)
    {
        return IsPointInPolygon(point, outerPoints)
            && !IsPointInPolygon(point, innerPoints);
    }

    private static bool IsPointInPolygon(Vector2 point, Vector2[] polygon)
    {
        bool inside = false;
        int count = polygon != null ? polygon.Length : 0;
        if (count < 3)
        {
            return false;
        }

        for (int current = 0, previous = count - 1; current < count; previous = current++)
        {
            Vector2 a = polygon[current];
            Vector2 b = polygon[previous];
            bool crossesY = (a.y > point.y) != (b.y > point.y);
            if (!crossesY)
            {
                continue;
            }

            float denominator = b.y - a.y;
            if (Mathf.Abs(denominator) < 0.00001f)
            {
                continue;
            }

            float crossingX = (b.x - a.x) * (point.y - a.y) / denominator + a.x;
            if (point.x < crossingX)
            {
                inside = !inside;
            }
        }

        return inside;
    }

    private static MaskDefinition ResolveMask(string region, string requestedMaskTextureId)
    {
        region = NormalizeRegion(region);
        string maskTextureId = NormalizeMaskTextureId(region, requestedMaskTextureId);
        bool lipStyleAtlas = region == "lip" && IsLipStyleAtlasMask(maskTextureId);
        bool visionLipBoundary = region == "lip" && IsVisionLipBoundaryMask(maskTextureId);
        bool generatedLipMask = region == "lip" && IsGeneratedLipMaskTextureId(maskTextureId);
        bool generatedBrowMask = region == "brow" && IsGeneratedBrowMaskTextureId(maskTextureId);
        bool cheekBlushMask = (region == "cheek" || region == "blush")
            && IsCheekBlushMask(maskTextureId);
        return new MaskDefinition
        {
            Region = region,
            MaskTextureId = maskTextureId,
            ResourcePath = generatedLipMask
                ? "GeneratedLipMasks/" + maskTextureId
                : generatedBrowMask
                ? "GeneratedBrowMasks/" + maskTextureId
                : "SmoothRegionMasks/" + maskTextureId,
            Threshold = lipStyleAtlas || visionLipBoundary || cheekBlushMask || generatedLipMask || generatedBrowMask ? 0.025f : 0.04f,
            FeatherUvNormalized = lipStyleAtlas
                ? 0.32f
                : visionLipBoundary
                ? 0.34f
                : generatedLipMask
                ? 0.26f
                : generatedBrowMask
                ? 0.30f
                : cheekBlushMask
                ? 0.78f
                : 0.56f
        };
    }

    private static float ResolveEffectiveFeather(MaskDefinition mask, RegionRecipeState recipe)
    {
        if (mask == null)
        {
            return 0.0f;
        }

        if (recipe != null
            && recipe.Region == "lip"
            && (IsLipStyleAtlasMask(recipe.MaskTextureId)
                || IsVisionLipBoundaryMask(recipe.MaskTextureId)
                || IsGeneratedLipMaskTextureId(recipe.MaskTextureId)))
        {
            if (recipe.TextureSample == "gradient_lip")
            {
                return Mathf.Clamp01(Mathf.Min(
                    0.38f,
                    Mathf.Max(0.28f, recipe.Feather)));
            }

            return Mathf.Clamp01(Mathf.Min(
                mask.FeatherUvNormalized,
                Mathf.Max(0.22f, recipe.Feather)));
        }

        if (recipe != null
            && IsCheekBlushRegion(recipe.Region)
            && IsCheekBlushMask(recipe.MaskTextureId))
        {
            return Mathf.Clamp01(Mathf.Min(
                mask.FeatherUvNormalized,
                Mathf.Max(0.68f, recipe.Feather)));
        }

        return mask.FeatherUvNormalized;
    }

    private static float ResolveShaderFeatherNearRadiusPx(float feather)
    {
        return Mathf.Lerp(
            FeatherNearRadiusMinPx,
            FeatherNearRadiusMaxPx,
            Mathf.Clamp01(feather * FeatherRadiusScale));
    }

    private static float ResolveShaderFeatherFarRadiusPx(float feather)
    {
        return ResolveShaderFeatherNearRadiusPx(feather) * FeatherFarRadiusScale;
    }

    private static List<Vector2> BuildCheekFaceLocalUvCoordinates(ARFace face)
    {
        int count = face != null && face.vertices.IsCreated ? face.vertices.Length : 0;
        List<Vector2> textureCoordinates = new List<Vector2>(Mathf.Max(0, count));
        if (count <= 0)
        {
            return textureCoordinates;
        }

        float[] xs = new float[count];
        float[] ys = new float[count];
        for (int index = 0; index < count; index++)
        {
            Vector3 vertex = face.vertices[index];
            xs[index] = vertex.x;
            ys[index] = vertex.y;
        }

        Array.Sort(xs);
        Array.Sort(ys);
        int lowIndex = Mathf.Clamp(Mathf.FloorToInt((count - 1) * 0.01f), 0, count - 1);
        int highIndex = Mathf.Clamp(Mathf.CeilToInt((count - 1) * 0.99f), 0, count - 1);
        float minX = xs[lowIndex];
        float maxX = xs[highIndex];
        float minY = ys[lowIndex];
        float maxY = ys[highIndex];
        float width = Mathf.Max(maxX - minX, 0.00001f);
        float height = Mathf.Max(maxY - minY, 0.00001f);
        minX -= width * 0.10f;
        maxX += width * 0.10f;
        minY -= height * 0.08f;
        maxY += height * 0.08f;
        width = Mathf.Max(maxX - minX, 0.00001f);
        height = Mathf.Max(maxY - minY, 0.00001f);

        for (int index = 0; index < count; index++)
        {
            Vector3 vertex = face.vertices[index];
            textureCoordinates.Add(new Vector2(
                Mathf.Clamp01((vertex.x - minX) / width),
                Mathf.Clamp01((vertex.y - minY) / height)));
        }

        return textureCoordinates;
    }

    private static string GetDefaultMaskTextureId(string region)
    {
        switch (NormalizeRegion(region))
        {
            case "lip":
                return LipDrawnStyleAtlasMaskId;
            case "cheek":
            case "blush":
                return CheekSessionMask1Id;
            case "eye":
                return "eye-drawn-mask-v1";
            case "brow":
                return "psd-arcore-brow-semi-arch-v1";
            case "eyeliner":
                return "e7-eyeliner-minimal-safe-uv-v0";
            default:
                throw new ArgumentException("Unsupported smooth mask region: " + region);
        }
    }

    private static Texture2D GetMaskTexture(MaskDefinition mask)
    {
        if (mask == null || string.IsNullOrWhiteSpace(mask.ResourcePath))
        {
            return null;
        }

        if (IsVisionLipBoundaryMask(mask.MaskTextureId))
        {
            return GetVisionBoundaryMaskTexture();
        }

        if (IsGeneratedLipMaskTextureId(mask.MaskTextureId))
        {
            if (RuntimeGeneratedLipMaskTextures.TryGetValue(mask.MaskTextureId, out Texture2D generatedTexture))
            {
                return generatedTexture;
            }

            Debug.LogWarning(
                "[E7] generated_lip_mask_texture_missing"
                + " maskTextureId=" + mask.MaskTextureId
                + " resourcePath=" + mask.ResourcePath);
            return null;
        }

        if (IsGeneratedBrowMaskTextureId(mask.MaskTextureId))
        {
            if (RuntimeGeneratedBrowMaskTextures.TryGetValue(mask.MaskTextureId, out Texture2D generatedTexture))
            {
                return generatedTexture;
            }

            Debug.LogWarning(
                "[E7] generated_brow_mask_texture_missing"
                + " maskTextureId=" + mask.MaskTextureId
                + " resourcePath=" + mask.ResourcePath);
            return null;
        }

        if (MaskTextures.TryGetValue(mask.ResourcePath, out Texture2D cached))
        {
            return cached;
        }

        Texture2D texture = Resources.Load<Texture2D>(mask.ResourcePath);
        if (texture == null)
        {
            Debug.LogWarning(
                "[E7] smooth_mask_texture_missing"
                + " maskTextureId=" + mask.MaskTextureId
                + " resourcePath=" + mask.ResourcePath);
            return null;
        }

        texture.wrapMode = TextureWrapMode.Clamp;
        texture.filterMode = FilterMode.Bilinear;
        MaskTextures[mask.ResourcePath] = texture;
        return texture;
    }

    private static Texture2D GetVisionBoundaryMaskTexture()
    {
        const string cacheKey = "runtime:lip-vision-boundary-v1:white-mask";
        if (MaskTextures.TryGetValue(cacheKey, out Texture2D cached))
        {
            return cached;
        }

        Texture2D texture = new Texture2D(1, 1, TextureFormat.RGBA32, false)
        {
            name = "E7 Vision Lip Boundary White Mask",
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Point
        };
        texture.SetPixel(0, 0, Color.white);
        texture.Apply(false, false);
        MaskTextures[cacheKey] = texture;
        return texture;
    }

    private static void ApplyMaskTextureDiagnostics(MaskDefinition mask, ref RegionApplyResult result)
    {
        MaskTextureDiagnostics diagnostics = GetMaskTextureDiagnostics(mask);
        result.MaskTextureDiagnosticStatus = diagnostics.Status;
        result.MaskTextureSampleChannel = diagnostics.SampleChannel;
        result.MaskTextureWidth = diagnostics.Width;
        result.MaskTextureHeight = diagnostics.Height;
        result.MaskTextureActivePixelCountGt8 = diagnostics.ActivePixelCountGt8;
        result.MaskTextureActiveCoverageGt8 = diagnostics.ActiveCoverageGt8;
        result.MaskTextureActiveBbox = diagnostics.ActiveBbox;
        result.MaskTextureThresholdPixelCount = diagnostics.ThresholdPixelCount;
        result.MaskTextureThresholdCoverage = diagnostics.ThresholdCoverage;
        result.MaskTextureDensityPixelCountGt8 = diagnostics.DensityPixelCountGt8;
        result.MaskTextureDensityCoverageGt8 = diagnostics.DensityCoverageGt8;
        result.MaskTextureDensityBbox = diagnostics.DensityBbox;
        result.MaskTextureDensityMax = diagnostics.DensityMax;
    }

    private static bool ShouldCullMeshToMask(RegionRecipeState recipe)
    {
        return recipe != null
            && ((recipe.Region == "lip" && IsLipStyleAtlasMask(recipe.MaskTextureId))
                || (recipe.Region == "brow" && IsGeneratedBrowMaskTextureId(recipe.MaskTextureId)));
    }

    private static bool ShouldCullMeshToVisionBoundary(RegionRecipeState recipe)
    {
        return recipe != null
            && recipe.Region == "lip"
            && IsVisionLipBoundaryMask(recipe.MaskTextureId);
    }

    private static MaskTextureSampleData GetMaskTextureSampleData(MaskDefinition mask)
    {
        if (mask == null)
        {
            return null;
        }

        string sampleChannel = ResolveMaskCoverageSampleChannel(mask);
        string cacheKey = mask.ResourcePath
            + "|sampleChannel=" + sampleChannel
            + "|sampleThreshold=" + mask.Threshold.ToString("0.######", CultureInfo.InvariantCulture);
        if (MaskTextureSampleCache.TryGetValue(cacheKey, out MaskTextureSampleData cached))
        {
            return cached;
        }

        MaskTextureSampleData sampleData = new MaskTextureSampleData
        {
            SampleChannel = sampleChannel,
            ThresholdByte = Mathf.Clamp(Mathf.RoundToInt(mask.Threshold * 255.0f), 0, 255)
        };
        Texture2D texture = GetMaskTexture(mask);
        if (texture == null)
        {
            sampleData.Status = "texture_missing";
            MaskTextureSampleCache[cacheKey] = sampleData;
            return sampleData;
        }

        sampleData.Width = texture.width;
        sampleData.Height = texture.height;

        try
        {
            sampleData.Pixels = texture.GetPixels32();
            sampleData.Status = sampleData.Pixels.Length > 0 ? "ok" : "empty_pixels";
        }
        catch (Exception exception)
        {
            sampleData.Status = "error_" + SanitizeDiagnosticValue(exception.GetType().Name);
        }

        MaskTextureSampleCache[cacheKey] = sampleData;
        return sampleData;
    }

    private static bool TriangleIntersectsMask(
        Vector2 uvA,
        Vector2 uvB,
        Vector2 uvC,
        MaskTextureSampleData sampleData)
    {
        if (sampleData == null || sampleData.Status != "ok")
        {
            return false;
        }

        Vector2 centroid = (uvA + uvB + uvC) / 3.0f;
        Vector2 midAB = (uvA + uvB) * 0.5f;
        Vector2 midBC = (uvB + uvC) * 0.5f;
        Vector2 midCA = (uvC + uvA) * 0.5f;

        return SampleMaskByte(sampleData, uvA) > sampleData.ThresholdByte
            || SampleMaskByte(sampleData, uvB) > sampleData.ThresholdByte
            || SampleMaskByte(sampleData, uvC) > sampleData.ThresholdByte
            || SampleMaskByte(sampleData, centroid) > sampleData.ThresholdByte
            || SampleMaskByte(sampleData, midAB) > sampleData.ThresholdByte
            || SampleMaskByte(sampleData, midBC) > sampleData.ThresholdByte
            || SampleMaskByte(sampleData, midCA) > sampleData.ThresholdByte;
    }

    private static int SampleMaskByte(MaskTextureSampleData sampleData, Vector2 uv)
    {
        if (sampleData == null
            || sampleData.Pixels == null
            || sampleData.Pixels.Length == 0
            || sampleData.Width <= 0
            || sampleData.Height <= 0)
        {
            return 0;
        }

        int x = Mathf.Clamp(
            Mathf.RoundToInt(Mathf.Clamp01(uv.x) * (sampleData.Width - 1)),
            0,
            sampleData.Width - 1);
        int y = Mathf.Clamp(
            Mathf.RoundToInt(Mathf.Clamp01(uv.y) * (sampleData.Height - 1)),
            0,
            sampleData.Height - 1);
        int pixelIndex = y * sampleData.Width + x;
        if (pixelIndex < 0 || pixelIndex >= sampleData.Pixels.Length)
        {
            return 0;
        }

        return SampleMaskCoverageByte(sampleData.Pixels[pixelIndex], sampleData.SampleChannel);
    }

    private static string ResolveMaskCoverageSampleChannel(MaskDefinition mask)
    {
        return mask != null && IsGeneratedBrowMaskTextureId(mask.MaskTextureId)
            ? "generated_brow_green_alpha"
            : "red";
    }

    private static int SampleMaskCoverageByte(Color32 pixel, string sampleChannel)
    {
        // For generated brow the red channel carries the real-brow neutralize
        // region, which extends beyond the green makeup fill. Include red so the
        // mesh keeps the triangles that cover the real brow (where the shader
        // paints skin), otherwise the neutralize area would be culled away.
        return sampleChannel == "generated_brow_green_alpha"
            ? Mathf.Max(pixel.r, Mathf.Max(pixel.g, pixel.a))
            : pixel.r;
    }

    private static MaskTextureDiagnostics GetMaskTextureDiagnostics(MaskDefinition mask)
    {
        if (mask == null)
        {
            return new MaskTextureDiagnostics { Status = "mask_missing" };
        }

        string sampleChannel = ResolveMaskCoverageSampleChannel(mask);
        string cacheKey = mask.ResourcePath
            + "|sampleChannel=" + sampleChannel
            + "|threshold=" + mask.Threshold.ToString("0.######", CultureInfo.InvariantCulture);
        if (MaskTextureDiagnosticsCache.TryGetValue(cacheKey, out MaskTextureDiagnostics cached))
        {
            return cached;
        }

        MaskTextureDiagnostics diagnostics = new MaskTextureDiagnostics();
        diagnostics.SampleChannel = sampleChannel;
        Texture2D texture = GetMaskTexture(mask);
        if (texture == null)
        {
            diagnostics.Status = "texture_missing";
            MaskTextureDiagnosticsCache[cacheKey] = diagnostics;
            return diagnostics;
        }

        diagnostics.Width = texture.width;
        diagnostics.Height = texture.height;

        try
        {
            Color32[] pixels = texture.GetPixels32();
            int totalPixels = Mathf.Max(1, pixels.Length);
            int thresholdByte = Mathf.Clamp(Mathf.RoundToInt(mask.Threshold * 255.0f), 0, 255);
            int minX = diagnostics.Width;
            int minY = diagnostics.Height;
            int maxX = -1;
            int maxY = -1;
            int activeCount = 0;
            int thresholdCount = 0;
            int densityMinX = diagnostics.Width;
            int densityMinY = diagnostics.Height;
            int densityMaxX = -1;
            int densityMaxY = -1;
            int densityCount = 0;
            int densityMax = 0;

            for (int y = 0; y < diagnostics.Height; y++)
            {
                for (int x = 0; x < diagnostics.Width; x++)
                {
                    int pixelIndex = y * diagnostics.Width + x;
                    if (pixelIndex < 0 || pixelIndex >= pixels.Length)
                    {
                        continue;
                    }

                    int value = SampleMaskCoverageByte(pixels[pixelIndex], sampleChannel);
                    int densityValue = pixels[pixelIndex].b;
                    densityMax = Mathf.Max(densityMax, densityValue);
                    if (value > thresholdByte)
                    {
                        thresholdCount++;
                    }

                    int topLeftY = diagnostics.Height - 1 - y;
                    if (densityValue > 8)
                    {
                        densityCount++;
                        densityMinX = Mathf.Min(densityMinX, x);
                        densityMaxX = Mathf.Max(densityMaxX, x);
                        densityMinY = Mathf.Min(densityMinY, topLeftY);
                        densityMaxY = Mathf.Max(densityMaxY, topLeftY);
                    }

                    if (value <= 8)
                    {
                        continue;
                    }

                    activeCount++;
                    minX = Mathf.Min(minX, x);
                    maxX = Mathf.Max(maxX, x);
                    minY = Mathf.Min(minY, topLeftY);
                    maxY = Mathf.Max(maxY, topLeftY);
                }
            }

            diagnostics.Status = "ok";
            diagnostics.ActivePixelCountGt8 = activeCount;
            diagnostics.ActiveCoverageGt8 = activeCount / (float)totalPixels;
            diagnostics.ThresholdPixelCount = thresholdCount;
            diagnostics.ThresholdCoverage = thresholdCount / (float)totalPixels;
            diagnostics.DensityPixelCountGt8 = densityCount;
            diagnostics.DensityCoverageGt8 = densityCount / (float)totalPixels;
            diagnostics.DensityMax = densityMax;
            diagnostics.ActiveBbox = activeCount == 0
                ? "none"
                : "left=" + minX.ToString(CultureInfo.InvariantCulture)
                    + ",top=" + minY.ToString(CultureInfo.InvariantCulture)
                    + ",right=" + maxX.ToString(CultureInfo.InvariantCulture)
                    + ",bottom=" + maxY.ToString(CultureInfo.InvariantCulture)
                    + ",width=" + (maxX - minX + 1).ToString(CultureInfo.InvariantCulture)
                    + ",height=" + (maxY - minY + 1).ToString(CultureInfo.InvariantCulture);
            diagnostics.DensityBbox = densityCount == 0
                ? "none"
                : "left=" + densityMinX.ToString(CultureInfo.InvariantCulture)
                    + ",top=" + densityMinY.ToString(CultureInfo.InvariantCulture)
                    + ",right=" + densityMaxX.ToString(CultureInfo.InvariantCulture)
                    + ",bottom=" + densityMaxY.ToString(CultureInfo.InvariantCulture)
                    + ",width=" + (densityMaxX - densityMinX + 1).ToString(CultureInfo.InvariantCulture)
                    + ",height=" + (densityMaxY - densityMinY + 1).ToString(CultureInfo.InvariantCulture);
        }
        catch (Exception exception)
        {
            diagnostics.Status = "error_" + SanitizeDiagnosticValue(exception.GetType().Name);
        }

        MaskTextureDiagnosticsCache[cacheKey] = diagnostics;
        return diagnostics;
    }

    private void ApplyRecipeAppearance(RegionOverlayView view, RegionRecipeState recipe)
    {
        if (view.MeshRenderer == null)
        {
            return;
        }

        Material material = GetOrCreateMaskMaterial(view, recipe.Region);
        MaskDefinition mask = ResolveMask(recipe.Region, recipe.MaskTextureId);
        Texture2D maskTexture = GetMaskTexture(mask);
        Color materialColor = BuildMaterialColor(recipe);
        bool visionLipBoundary = IsVisionLipBoundaryMask(recipe.MaskTextureId);
        bool generatedLipMask = IsGeneratedLipMaskTextureId(recipe.MaskTextureId);
        bool generatedBrowMask = IsGeneratedBrowMaskTextureId(recipe.MaskTextureId);
        materialColor = ResolveBrowDebugMaterialColor(recipe, materialColor, generatedBrowMask);

        if (material == null || maskTexture == null || !material.HasProperty("_MaskTex"))
        {
            view.MeshRenderer.enabled = false;
            view.Mesh.Clear();
            return;
        }

        view.MeshRenderer.sharedMaterial = material;
        material.SetTexture("_MaskTex", maskTexture);
        ApplyMaterialBlendMode(material, recipe.BlendMode, IsCheekBlushRegion(recipe.Region) && IsCheekBlushMask(recipe.MaskTextureId));

        if (material.HasProperty("_UseScreenSpaceMask"))
        {
            material.SetFloat("_UseScreenSpaceMask", visionLipBoundary ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_RegionColor"))
        {
            material.SetColor("_RegionColor", new Color(materialColor.r, materialColor.g, materialColor.b, 1.0f));
        }

        if (material.HasProperty("_SecondaryColor"))
        {
            material.SetColor("_SecondaryColor", new Color(
                recipe.SecondaryColor.r,
                recipe.SecondaryColor.g,
                recipe.SecondaryColor.b,
                1.0f));
        }

        if (material.HasProperty("_Opacity"))
        {
            material.SetFloat("_Opacity", materialColor.a);
        }

        if (material.HasProperty("_Threshold"))
        {
            material.SetFloat("_Threshold", mask.Threshold);
        }

        if (material.HasProperty("_Feather"))
        {
            material.SetFloat("_Feather", ResolveEffectiveFeather(mask, recipe));
        }

        if (material.HasProperty("_VisibilityAlpha"))
        {
            material.SetFloat("_VisibilityAlpha", 1.0f);
        }

        if (material.HasProperty("_Coverage"))
        {
            material.SetFloat("_Coverage", recipe.Coverage);
        }

        if (material.HasProperty("_BlushIntensity"))
        {
            material.SetFloat("_BlushIntensity", Mathf.Clamp01(recipe.Intensity));
        }

        if (material.HasProperty("_Roughness"))
        {
            material.SetFloat("_Roughness", recipe.Roughness);
        }

        if (material.HasProperty("_Specular"))
        {
            material.SetFloat("_Specular", recipe.Specular);
        }

        if (material.HasProperty("_SpecularPower"))
        {
            material.SetFloat("_SpecularPower", recipe.SpecularPower);
        }

        if (material.HasProperty("_GlossBoost"))
        {
            material.SetFloat("_GlossBoost", recipe.GlossBoost);
        }

        if (material.HasProperty("_GlossColor"))
        {
            material.SetColor("_GlossColor", new Color(1.0f, 0.78f, 0.84f, 1.0f));
        }

        if (material.HasProperty("_GlossSharpness"))
        {
            material.SetFloat(
                "_GlossSharpness",
                recipe.TextureSample == "gloss_lip"
                    ? Mathf.Lerp(0.60f, 0.86f, recipe.GlossBoost)
                    : 0.0f);
        }

        if (material.HasProperty("_GlossHaloIntensity"))
        {
            material.SetFloat(
                "_GlossHaloIntensity",
                recipe.TextureSample == "gloss_lip"
                    ? Mathf.Lerp(0.045f, 0.10f, recipe.GlossBoost)
                    : 0.0f);
        }

        if (material.HasProperty("_GradientAmount"))
        {
            material.SetFloat("_GradientAmount", recipe.GradientAmount);
        }

        if (material.HasProperty("_DetailAmount"))
        {
            material.SetFloat("_DetailAmount", recipe.TextureAmount);
        }

        if (material.HasProperty("_BrowGeneratedMode"))
        {
            material.SetFloat("_BrowGeneratedMode", generatedBrowMask ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_BrowCleanupStrength"))
        {
            material.SetFloat("_BrowCleanupStrength", generatedBrowMask ? recipe.GradientAmount : 0.0f);
        }

        if (material.HasProperty("_BrowNeutralizeStrength"))
        {
            material.SetFloat("_BrowNeutralizeStrength", generatedBrowMask ? recipe.GlossBoost : 0.0f);
        }

        if (material.HasProperty("_PreserveDetail"))
        {
            material.SetFloat("_PreserveDetail", recipe.PreserveDetail ? 1.0f : 0.0f);
        }

        bool cheekBlushMask = IsCheekBlushRegion(recipe.Region) && IsCheekBlushMask(recipe.MaskTextureId);
        if (cheekBlushMask)
        {
            if (material.HasProperty("_DensityPower"))
            {
                material.SetFloat("_DensityPower", 0.74f);
            }

            if (material.HasProperty("_EdgeSoftness"))
            {
                material.SetFloat("_EdgeSoftness", 0.94f);
            }

            if (material.HasProperty("_SkinPreserve"))
            {
                material.SetFloat("_SkinPreserve", 0.74f);
            }

            if (material.HasProperty("_SaturationBoost"))
            {
                material.SetFloat("_SaturationBoost", 0.30f);
            }

            if (material.HasProperty("_Warmth"))
            {
                material.SetFloat("_Warmth", 0.24f);
            }

            if (material.HasProperty("_CheekUvTransform"))
            {
                material.SetVector(
                    "_CheekUvTransform",
                    ResolveCheekBlushUvTransform(recipe.MaskTextureId));
            }

            if (material.HasProperty("_CheekPartUvTransform"))
            {
                material.SetVector(
                    "_CheekPartUvTransform",
                    ResolveCheekBlushPartUvTransform(recipe.MaskTextureId));
            }

            if (material.HasProperty("_CheekPartBlend"))
            {
                material.SetFloat(
                    "_CheekPartBlend",
                    ResolveCheekBlushPartBlend(recipe.MaskTextureId));
            }

            if (material.HasProperty("_CheekDensityGain"))
            {
                material.SetFloat(
                    "_CheekDensityGain",
                    ResolveCheekBlushDensityGain(recipe.MaskTextureId));
            }

            if (material.HasProperty("_CheekCenterGain"))
            {
                material.SetFloat(
                    "_CheekCenterGain",
                    ResolveCheekBlushCenterGain(recipe.MaskTextureId));
            }
        }

        if (material.HasProperty("_LipStyleMode"))
        {
            material.SetFloat(
                "_LipStyleMode",
                IsLipStyleAtlasMask(recipe.MaskTextureId) || visionLipBoundary || generatedLipMask
                    ? ResolveLipStyleMode(recipe.TextureSample)
                    : -1.0f);
        }

        if (material.HasProperty("_CheekBlushMode"))
        {
            material.SetFloat(
                "_CheekBlushMode",
                IsCheekBlushRegion(recipe.Region) && IsCheekBlushMask(recipe.MaskTextureId)
                    ? 1.0f
                    : 0.0f);
        }
    }

    private static bool IsCheekBlushRegion(string region)
    {
        return region == "cheek" || region == "blush";
    }

    private static Material GetOrCreateMaskMaterial(RegionOverlayView view, string region)
    {
        if (view.MaskMaterial != null)
        {
            return view.MaskMaterial;
        }

        Material template = Resources.Load<Material>("SmoothRegionMaskMaterial");
        if (template != null)
        {
            view.MaskMaterial = new Material(template)
            {
                name = "Smooth UV Mask " + NormalizeRegion(region)
            };
            ConfigureTransparentMaterial(view.MaskMaterial);
            return view.MaskMaterial;
        }

        Shader shader = Shader.Find("MakeupAR/SmoothRegionMask");
        if (shader == null)
        {
            Debug.LogWarning(
                "[E7] smooth_mask_shader_missing"
                + " region=" + NormalizeRegion(region)
                + " action=hide_overlay");
            return null;
        }

        view.MaskMaterial = new Material(shader)
        {
            name = "Smooth UV Mask " + NormalizeRegion(region)
        };
        ConfigureTransparentMaterial(view.MaskMaterial);
        return view.MaskMaterial;
    }

    private static Color BuildMaterialColor(RegionRecipeState recipe)
    {
        float sampleAlphaScale = 1.0f;
        float brightnessScale = 1.0f;

        switch (recipe.TextureSample)
        {
            case "matte_lip":
                sampleAlphaScale = Mathf.Lerp(0.72f, 0.92f, recipe.Intensity);
                brightnessScale = 0.9f;
                break;
            case "gloss_lip":
                sampleAlphaScale = Mathf.Lerp(0.72f, 0.92f, recipe.Intensity);
                brightnessScale = 0.9f;
                break;
            case "full_lip":
                sampleAlphaScale = Mathf.Lerp(0.5f, 0.72f, recipe.Intensity);
                brightnessScale = 0.94f;
                break;
            case "gradient_lip":
                sampleAlphaScale = Mathf.Lerp(0.72f, 0.92f, recipe.Intensity);
                brightnessScale = 0.9f;
                break;
            case "overline_lip":
                sampleAlphaScale = Mathf.Lerp(0.28f, 0.42f, recipe.Intensity);
                brightnessScale = 0.96f;
                break;
            case "soft_blush":
            case "blush_session_1":
            case "blush_session_2":
            case "blush_session_3":
            case "blush_session_4":
            case "blush_session_5":
                sampleAlphaScale = 1.0f;
                brightnessScale = 0.98f;
                break;
            case "natural_brow":
                sampleAlphaScale = Mathf.Lerp(0.48f, 0.82f, recipe.Intensity);
                brightnessScale = Mathf.Lerp(0.82f, 0.62f, recipe.Intensity);
                break;
            case "shimmer_eye":
                sampleAlphaScale = Mathf.Lerp(0.3f, 0.5f, recipe.Intensity);
                brightnessScale = Mathf.Lerp(1.0f, 1.1f, recipe.Intensity);
                break;
            default:
                sampleAlphaScale = Mathf.Lerp(0.52f, 0.76f, recipe.Intensity);
                brightnessScale = 0.9f;
                break;
        }

        return new Color(
            Mathf.Clamp01(recipe.Color.r * brightnessScale),
            Mathf.Clamp01(recipe.Color.g * brightnessScale),
            Mathf.Clamp01(recipe.Color.b * brightnessScale),
            Mathf.Clamp01(recipe.Opacity * sampleAlphaScale));
    }

    private static float ResolveLipStyleMode(string textureSample)
    {
        switch (textureSample)
        {
            case "gloss_lip":
                return 1.0f;
            case "full_lip":
                return 2.0f;
            case "gradient_lip":
                return 3.0f;
            case "overline_lip":
                return 4.0f;
            case "matte_lip":
                return 0.0f;
            default:
                return -1.0f;
        }
    }

    private static void ApplyMaterialBlendMode(Material material, string blendMode, bool cheekBlushMask)
    {
        if (material == null)
        {
            return;
        }

        BlendMode sourceBlend = BlendMode.SrcAlpha;
        BlendMode destinationBlend = BlendMode.OneMinusSrcAlpha;

        switch (NormalizeBlendMode(blendMode))
        {
            case "multiply":
                sourceBlend = BlendMode.DstColor;
                destinationBlend = BlendMode.Zero;
                break;
            case "screen":
                sourceBlend = BlendMode.SrcAlpha;
                destinationBlend = BlendMode.OneMinusSrcAlpha;
                break;
        }

        if (material.HasProperty("_SrcBlend"))
        {
            material.SetInt("_SrcBlend", (int)sourceBlend);
        }

        if (material.HasProperty("_DstBlend"))
        {
            material.SetInt("_DstBlend", (int)destinationBlend);
        }

        if (material.HasProperty("_PigmentMultiply"))
        {
            material.SetFloat(
                "_PigmentMultiply",
                NormalizeBlendMode(blendMode) == "multiply" ? 1.0f : 0.0f);
        }

        material.renderQueue = 5000;
    }

    private static void SetViewVisibility(RegionOverlayView view, bool showMesh)
    {
        if (view.MeshRenderer != null)
        {
            view.MeshRenderer.enabled = showMesh;
        }
    }

    private void HideAllOverlayViews()
    {
        foreach (FaceOverlayState faceState in overlays.Values)
        {
            foreach (RegionOverlayView view in faceState.Regions.Values)
            {
                SetViewVisibility(view, false);
            }
        }
    }

    private void HideRegionViews(string region)
    {
        foreach (FaceOverlayState faceState in overlays.Values)
        {
            if (faceState.Regions.TryGetValue(region, out RegionOverlayView view))
            {
                SetViewVisibility(view, false);
            }
        }
    }

    private static void ApplyViewAlphaMultiplier(RegionOverlayView view, float alphaMultiplier)
    {
        ApplyMaterialAlphaMultiplier(view.MeshRenderer != null ? view.MeshRenderer.sharedMaterial : null, alphaMultiplier);
    }

    private static void ApplyMaterialAlphaMultiplier(Material material, float alphaMultiplier)
    {
        if (material == null)
        {
            return;
        }

        if (material.HasProperty("_VisibilityAlpha"))
        {
            material.SetFloat("_VisibilityAlpha", Mathf.Clamp01(alphaMultiplier));
            return;
        }

        Color color = material.color;
        color.a = Mathf.Clamp01(color.a * Mathf.Clamp01(alphaMultiplier));
        ApplyMaterialColor(material, color);
    }

    private static void ConfigureTransparentMaterial(Material material)
    {
        ApplyMaterialColor(material, material.color);
    }

    private static void ConfigureRenderer(MeshRenderer renderer)
    {
        renderer.shadowCastingMode = ShadowCastingMode.Off;
        renderer.receiveShadows = false;
        renderer.allowOcclusionWhenDynamic = false;
        renderer.sortingOrder = 120;
    }

    private static void ApplyMaterialColor(Material material, Color color)
    {
        if (material == null)
        {
            return;
        }

        material.color = color;

        if (material.HasProperty("_BaseColor"))
        {
            material.SetColor("_BaseColor", color);
        }

        if (material.HasProperty("_Color"))
        {
            material.SetColor("_Color", color);
        }

        if (material.HasProperty("_Surface"))
        {
            material.SetFloat("_Surface", 1.0f);
        }

        if (material.HasProperty("_SrcBlend"))
        {
            material.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
        }

        if (material.HasProperty("_DstBlend"))
        {
            material.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
        }

        if (material.HasProperty("_PigmentMultiply"))
        {
            material.SetFloat("_PigmentMultiply", 0.0f);
        }

        if (material.HasProperty("_UseScreenSpaceMask"))
        {
            material.SetFloat("_UseScreenSpaceMask", 0.0f);
        }

        if (material.HasProperty("_ZWrite"))
        {
            material.SetInt("_ZWrite", 0);
        }

        if (material.HasProperty("_ZTest"))
        {
            material.SetInt("_ZTest", (int)CompareFunction.Always);
        }

        material.DisableKeyword("_ALPHATEST_ON");
        material.EnableKeyword("_ALPHABLEND_ON");
        material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
        material.renderQueue = 5000;
    }

    private static string NormalizeRegion(string region)
    {
        region = string.IsNullOrWhiteSpace(region) ? string.Empty : region.Trim().ToLowerInvariant();
        if (region == "lip"
            || region == "cheek"
            || region == "blush"
            || region == "eye"
            || region == "brow"
            || region == "eyeliner")
        {
            return region;
        }

        throw new ArgumentException("Unsupported smooth mask region: " + region);
    }

    private static string NormalizeTextureSample(string region, string textureSample)
    {
        textureSample = string.IsNullOrWhiteSpace(textureSample)
            ? string.Empty
            : textureSample.Trim().ToLowerInvariant();

        if ((region == "lip"
                && (textureSample == "matte_lip"
                    || textureSample == "gloss_lip"
                    || textureSample == "full_lip"
                    || textureSample == "gradient_lip"
                    || textureSample == "overline_lip"))
            || ((region == "cheek" || region == "blush")
                && (textureSample == "soft_blush"
                    || textureSample == "blush_session_1"
                    || textureSample == "blush_session_2"
                    || textureSample == "blush_session_3"
                    || textureSample == "blush_session_4"
                    || textureSample == "blush_session_5"))
            || ((region == "eye" || region == "brow" || region == "eyeliner")
                && textureSample == "shimmer_eye")
            || (region == "brow" && textureSample == "natural_brow"))
        {
            return textureSample;
        }

        throw new ArgumentException(
            "Unsupported smooth mask texture for region " + region + ": " + textureSample);
    }

    private static string NormalizeTextureMode(string textureMode)
    {
        textureMode = string.IsNullOrWhiteSpace(textureMode)
            ? string.Empty
            : textureMode.Trim().ToLowerInvariant();

        if (textureMode == "sample")
        {
            return textureMode;
        }

        throw new ArgumentException("Unsupported smooth mask texture mode: " + textureMode);
    }

    private static string NormalizeBlendMode(string blendMode)
    {
        blendMode = string.IsNullOrWhiteSpace(blendMode)
            ? string.Empty
            : blendMode.Trim().ToLowerInvariant();

        if (blendMode == "normal" || blendMode == "screen" || blendMode == "multiply")
        {
            return blendMode;
        }

        throw new ArgumentException("Unsupported smooth mask blend mode: " + blendMode);
    }

    private static string NormalizeMaskTextureId(string region, string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        string expected = GetDefaultMaskTextureId(region);
        if (maskTextureId == expected
            || (region == "lip" && (maskTextureId == VisionLipBoundaryMaskId
                || maskTextureId == LipDrawnGradientDensityAtlasMaskId
                || maskTextureId == "lip-style-atlas-v1"
                || maskTextureId == "lip-smooth-mask-v1"
                || maskTextureId == "lip-drawn-mask-v1"
                || IsGeneratedLipMaskTextureId(maskTextureId)))
            || ((region == "cheek" || region == "blush") && IsCheekBlushMask(maskTextureId))
            || (region == "eye" && (maskTextureId == "eye-smooth-mask-v1"
                || maskTextureId == "eye-drawn-mask-v1"))
            || (region == "brow" && (maskTextureId.StartsWith("brow-", StringComparison.Ordinal)
                || maskTextureId.StartsWith("psd-arcore-brow-", StringComparison.Ordinal)
                || maskTextureId.StartsWith("e7-brow-", StringComparison.Ordinal)
                || IsGeneratedBrowMaskTextureId(maskTextureId)))
            || (region == "eyeliner" && (maskTextureId.StartsWith("e7-eyeliner-", StringComparison.Ordinal)
                || maskTextureId == "eye-smooth-mask-v1"
                || maskTextureId == "eye-drawn-mask-v1")))
        {
            return maskTextureId;
        }

        throw new ArgumentException(
            "Unsupported smooth mask texture id for region " + region + ": " + maskTextureId);
    }

    private static bool IsLipStyleAtlasMask(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        return maskTextureId == LipDrawnStyleAtlasMaskId
            || maskTextureId == LipDrawnGradientDensityAtlasMaskId
            || maskTextureId == "lip-style-atlas-v1";
    }

    private static bool IsVisionLipBoundaryMask(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        return maskTextureId == VisionLipBoundaryMaskId;
    }

    private static bool IsGeneratedLipMaskTextureId(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        return maskTextureId.StartsWith(GeneratedLipMaskPrefix, StringComparison.Ordinal);
    }

    private static string NormalizeGeneratedLipMaskTextureId(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        if (!IsGeneratedLipMaskTextureId(maskTextureId))
        {
            throw new ArgumentException("Unsupported generated lip mask texture id: " + maskTextureId);
        }

        return maskTextureId;
    }

    private static bool IsGeneratedBrowMaskTextureId(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        return maskTextureId.StartsWith(GeneratedBrowMaskPrefix, StringComparison.Ordinal);
    }

    private static bool IsGeneratedBrowRecipe(RegionRecipeState recipe)
    {
        return recipe != null
            && recipe.Region == "brow"
            && IsGeneratedBrowMaskTextureId(recipe.MaskTextureId);
    }

    private static string NormalizeGeneratedBrowMaskTextureId(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        if (!IsGeneratedBrowMaskTextureId(maskTextureId))
        {
            throw new ArgumentException("Unsupported generated brow mask texture id: " + maskTextureId);
        }

        return maskTextureId;
    }

    private static bool IsCheekBlushMask(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        return maskTextureId == CheekSessionMask1Id
            || maskTextureId == CheekSessionMask2Id
            || maskTextureId == CheekSessionMask3Id
            || maskTextureId == CheekSessionMask4Id
            || maskTextureId == CheekSessionMask5Id;
    }

    private static Vector4 ResolveCheekBlushUvTransform(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        switch (maskTextureId)
        {
            case CheekSessionMask2Id:
                return new Vector4(1.02f, 0.84f, 0.0f, 0.0f);
            case CheekSessionMask3Id:
                return new Vector4(1.28f, 1.72f, 0.0f, -0.015f);
            case CheekSessionMask4Id:
                return new Vector4(1.14f, 1.20f, 0.0f, 0.018f);
            case CheekSessionMask5Id:
                return new Vector4(1.02f, 0.96f, 0.0f, -0.018f);
            default:
                return new Vector4(1.0f, 1.0f, 0.0f, 0.0f);
        }
    }

    private static Vector4 ResolveCheekBlushPartUvTransform(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        switch (maskTextureId)
        {
            case CheekSessionMask4Id:
                return new Vector4(2.038f, 0.981f, 0.0f, -0.037f);
            default:
                return new Vector4(1.0f, 1.0f, 0.0f, 0.0f);
        }
    }

    private static float ResolveCheekBlushPartBlend(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        switch (maskTextureId)
        {
            case CheekSessionMask4Id:
                return 1.0f;
            default:
                return 0.0f;
        }
    }

    private static float ResolveCheekBlushDensityGain(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        switch (maskTextureId)
        {
            case CheekSessionMask1Id:
                return 0.94f;
            case CheekSessionMask2Id:
                return 0.98f;
            case CheekSessionMask3Id:
                return 1.35f;
            case CheekSessionMask4Id:
                return 0.76f;
            case CheekSessionMask5Id:
                return 0.94f;
            default:
                return 1.0f;
        }
    }

    private static float ResolveCheekBlushCenterGain(string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        switch (maskTextureId)
        {
            case CheekSessionMask4Id:
                return 0.08f;
            case CheekSessionMask5Id:
                return 0.36f;
            default:
                return 0.0f;
        }
    }

    private static string NormalizeOptional(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? "none" : value.Trim();
    }

    private static string SanitizeDiagnosticValue(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "unknown";
        }

        return value.Trim()
            .Replace(" ", "_")
            .Replace(",", "_")
            .Replace("\"", string.Empty);
    }

    private static bool HasUsableUv(ARFace face)
    {
        return face != null
            && face.vertices.IsCreated
            && face.uvs.IsCreated
            && face.uvs.Length == face.vertices.Length
            && face.uvs.Length > 0;
    }

    private static int GetVertexCount(ARFace face)
    {
        return face != null && face.vertices.IsCreated ? face.vertices.Length : 0;
    }

    private static int GetIndexCount(ARFace face)
    {
        return face != null && face.indices.IsCreated ? face.indices.Length : 0;
    }

    private static int GetUvCount(ARFace face)
    {
        return face != null && face.uvs.IsCreated ? face.uvs.Length : 0;
    }

    private static TrackingVisibility ResolveTrackingVisibility(ARFace face, FaceOverlayState state)
    {
        if (face.trackingState == TrackingState.Tracking)
        {
            bool recovered = state.WasLimitedOrLost;
            state.WasLimitedOrLost = false;
            return new TrackingVisibility
            {
                ShouldRender = true,
                AlphaMultiplier = 1.0f,
                Action = recovered ? "recovered_restore" : "tracking_render"
            };
        }

        state.WasLimitedOrLost = true;
        string statePrefix = face.trackingState == TrackingState.Limited ? "limited" : "lost";
        return new TrackingVisibility
        {
            ShouldRender = false,
            AlphaMultiplier = 0.0f,
            Action = statePrefix + "_hide"
        };
    }

    private static void MaybeLogRegionMaskState(
        ARFace face,
        FaceOverlayState state,
        string region,
        RegionRecipeState recipe,
        TrackingVisibility visibility)
    {
        if (state.LastLoggedStateActionByRegion.TryGetValue(region, out string lastAction)
            && lastAction == visibility.Action)
        {
            return;
        }

        state.LastLoggedStateActionByRegion[region] = visibility.Action;
        Debug.Log(
            "[E7] region_mask_state"
            + " rendererMode=" + RendererMode
            + " maskTextureId=" + recipe.MaskTextureId
            + " maskSource=" + (IsVisionLipBoundaryMask(recipe.MaskTextureId)
                ? VisionLipBoundarySource
                : IsLipStyleAtlasMask(recipe.MaskTextureId)
                ? "lip_style_atlas_v1_uv_back_projection"
                : IsCheekBlushMask(recipe.MaskTextureId)
                ? CheekBlushMaskSource
                : MaskSource)
            + " region=" + region
            + " trackingState=" + face.trackingState
            + " stateAction=" + visibility.Action
            + " alphaMultiplier=" + visibility.AlphaMultiplier.ToString("0.##", CultureInfo.InvariantCulture)
            + " uvAvailable=" + HasUsableUv(face).ToString().ToLowerInvariant()
            + " meshVertexCount=" + GetVertexCount(face).ToString(CultureInfo.InvariantCulture)
            + " meshIndexCount=" + GetIndexCount(face).ToString(CultureInfo.InvariantCulture)
            + " meshUvCount=" + GetUvCount(face).ToString(CultureInfo.InvariantCulture)
            + " browDebugMode=" + recipe.BrowDebugMode.ToString(CultureInfo.InvariantCulture)
            + " browDebugShowLeftRight=" + recipe.BrowDebugShowLeftRight.ToString().ToLowerInvariant()
            + " browDebugExaggerate=" + recipe.BrowDebugExaggerate.ToString().ToLowerInvariant()
            + " topologyAuditStatus=" + BuildTopologyAuditStatus(face));
    }

    private static void LogRegionApplyResult(RegionApplyResult result)
    {
        Debug.Log(
            "[E7] region_mask_apply"
            + " rendererMode=" + result.RendererMode
            + " maskTextureId=" + result.MaskTextureId
            + " maskSource=" + result.MaskSource
            + " boundaryRenderer=" + result.BoundaryRenderer
            + " region=" + result.Region
            + " trackingState=" + result.TrackingState
            + " stateAction=" + result.StateAction
            + " faceCount=" + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + " meshVertexCount=" + result.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
            + " meshIndexCount=" + result.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
            + " meshUvCount=" + result.MeshUvCount.ToString(CultureInfo.InvariantCulture)
            + " uvAvailable=" + result.UvAvailable.ToString().ToLowerInvariant()
            + " maskUvBoundsAvailable=" + result.MaskUvBoundsAvailable.ToString().ToLowerInvariant()
            + " maskUvBounds="
            + result.MaskUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + " maskUvSplitMode=" + result.MaskUvSplitMode
            + " maskNegativeXTriangles=" + result.MaskNegativeXTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " maskPositiveXTriangles=" + result.MaskPositiveXTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " maskNegativeXUvBoundsAvailable=" + result.MaskNegativeXUvBoundsAvailable.ToString().ToLowerInvariant()
            + " maskNegativeXUvBounds="
            + result.MaskNegativeXUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskNegativeXUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskNegativeXUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskNegativeXUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + " maskPositiveXUvBoundsAvailable=" + result.MaskPositiveXUvBoundsAvailable.ToString().ToLowerInvariant()
            + " maskPositiveXUvBounds="
            + result.MaskPositiveXUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskPositiveXUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskPositiveXUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ","
            + result.MaskPositiveXUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + " sourceTriangles=" + result.SourceTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " appliedTriangles=" + result.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " culledTriangles=" + result.CulledTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " meshCullingMode=" + result.MeshCullingMode
            + " threshold=" + result.MaskThreshold.ToString("0.###", CultureInfo.InvariantCulture)
            + " featherUvNormalized=" + result.MaskFeatherUvNormalized.ToString("0.######", CultureInfo.InvariantCulture)
            + " maskSoftSampleMode=" + result.MaskSoftSampleMode
            + " maskFeatherNearRadiusPx=" + result.MaskFeatherNearRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskFeatherFarRadiusPx=" + result.MaskFeatherFarRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskTextureDiagnosticStatus=" + result.MaskTextureDiagnosticStatus
            + " maskTextureSampleChannel=" + result.MaskTextureSampleChannel
            + " maskTextureSize=" + result.MaskTextureWidth.ToString(CultureInfo.InvariantCulture)
            + "x" + result.MaskTextureHeight.ToString(CultureInfo.InvariantCulture)
            + " maskTextureGt8Pixels=" + result.MaskTextureActivePixelCountGt8.ToString(CultureInfo.InvariantCulture)
            + " maskTextureGt8Coverage=" + result.MaskTextureActiveCoverageGt8.ToString("0.######", CultureInfo.InvariantCulture)
            + " maskTextureGt8Bbox=" + result.MaskTextureActiveBbox
            + " maskTextureThresholdPixels=" + result.MaskTextureThresholdPixelCount.ToString(CultureInfo.InvariantCulture)
            + " maskTextureThresholdCoverage=" + result.MaskTextureThresholdCoverage.ToString("0.######", CultureInfo.InvariantCulture)
            + " maskTextureDensityGt8Pixels=" + result.MaskTextureDensityPixelCountGt8.ToString(CultureInfo.InvariantCulture)
            + " maskTextureDensityGt8Coverage=" + result.MaskTextureDensityCoverageGt8.ToString("0.######", CultureInfo.InvariantCulture)
            + " maskTextureDensityGt8Bbox=" + result.MaskTextureDensityBbox
            + " maskTextureDensityMax=" + result.MaskTextureDensityMax.ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryStatus=" + result.VisionBoundaryStatus
            + " visionBoundarySource=" + result.VisionBoundarySource
            + " visionBoundaryCoordinateMode=" + result.VisionBoundaryCoordinateMode
            + " visionBoundaryOuterPoints=" + result.VisionBoundaryOuterPointCount.ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryInnerPoints=" + result.VisionBoundaryInnerPointCount.ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryImageSize=" + result.VisionBoundaryImageWidth.ToString(CultureInfo.InvariantCulture)
            + "x" + result.VisionBoundaryImageHeight.ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryAgeMs=" + result.VisionBoundaryAgeMs.ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryFaceMotionScore=" + result.VisionBoundaryFaceMotionScore.ToString("0.###", CultureInfo.InvariantCulture)
            + " visionBoundaryFaceCenterShiftPx=" + result.VisionBoundaryFaceCenterShiftPx.ToString("0.#", CultureInfo.InvariantCulture)
            + " visionBoundaryFaceScaleDelta=" + result.VisionBoundaryFaceScaleDelta.ToString("0.###", CultureInfo.InvariantCulture)
            + " visionBoundaryFaceMotionRisk=" + result.VisionBoundaryFaceMotionRisk
            + " coverage=" + result.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
            + " finish=" + result.Finish
            + " lipRenderLayerMode=" + result.LipRenderLayerMode
            + " glossHighlightMode=" + result.GlossHighlightMode
            + " roughness=" + result.Roughness.ToString("0.##", CultureInfo.InvariantCulture)
            + " specular=" + result.Specular.ToString("0.##", CultureInfo.InvariantCulture)
            + " specularPower=" + result.SpecularPower.ToString("0.##", CultureInfo.InvariantCulture)
            + " glossBoost=" + result.GlossBoost.ToString("0.##", CultureInfo.InvariantCulture)
            + " gradientAmount=" + result.GradientAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " topologyAuditStatus=" + result.TopologyAuditStatus
            + " browDebugMode=" + result.BrowDebugMode.ToString(CultureInfo.InvariantCulture)
            + " browDebugShowLeftRight=" + result.BrowDebugShowLeftRight.ToString().ToLowerInvariant()
            + " browDebugExaggerate=" + result.BrowDebugExaggerate.ToString().ToLowerInvariant()
            + " regionDecision=smooth_mask_runtime"
            + " smoothing=soft_sdf_multilayer_mask"
            + " regionsInScope=lip,cheek,eye,brow");
    }

    private static Color ResolveBrowDebugMaterialColor(
        RegionRecipeState recipe,
        Color materialColor,
        bool generatedBrowMask)
    {
        if (!generatedBrowMask || (recipe.BrowDebugMode < 5 && !recipe.BrowDebugExaggerate))
        {
            return materialColor;
        }

        if (recipe.BrowDebugMode == 6 || recipe.BrowDebugShowLeftRight)
        {
            return new Color(0.05f, 0.82f, 1.0f, 0.92f);
        }

        return new Color(1.0f, 0.88f, 0.05f, 0.92f);
    }

    private static string BuildTopologyAuditStatus(ARFace face)
    {
        if (face == null)
        {
            return "face_missing";
        }

        if (!face.vertices.IsCreated || face.vertices.Length <= 0)
        {
            return "vertices_unavailable";
        }

        if (!face.indices.IsCreated || face.indices.Length < 3)
        {
            return "indices_unavailable";
        }

        if (face.indices.Length % 3 != 0)
        {
            return "indices_not_triangles";
        }

        return HasUsableUv(face) ? "pass_uv_topology_ready" : "uv_unavailable";
    }

    private static string BuildTopologyAuditSummary(ARFace face)
    {
        return "vertices=" + GetVertexCount(face).ToString(CultureInfo.InvariantCulture)
            + ";indices=" + GetIndexCount(face).ToString(CultureInfo.InvariantCulture)
            + ";uvs=" + GetUvCount(face).ToString(CultureInfo.InvariantCulture)
            + ";indexMod3=" + (GetIndexCount(face) % 3).ToString(CultureInfo.InvariantCulture)
            + ";stableUv=" + HasUsableUv(face).ToString().ToLowerInvariant();
    }
}
