using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
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
        public string FoundationMode = "uvMask";
        public string FoundationFallbackMode = "uvMask";
        public int FoundationDebugMaskMode;
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
        public int MaxValue;
        public float AverageValue;
        public float AverageDensity;
        public string SampleChannel = "red";
    }

    private sealed class FoundationMaskAreaDiagnostics
    {
        public string Status = "not_run";
        public int Width;
        public int Height;
        public float RawAverage;
        public float RegionWeightAverage;
        public float ExclusionAverage;
        public float BaseAverage;
        public float FinalAverage;
        public float FinalMax;
        public float RawCoverageGt5;
        public float BaseCoverageGt5;
        public float FinalCoverageGt5;
        public string FinalBboxTopLeft = "none";
        public string FinalBboxUv = "none";
        public string FinalWeightedCenterUv = "none";
        public float LowForeheadAverage;
        public float NoseAverage;
        public float LeftCheekAverage;
        public float RightCheekAverage;
        public float ChinAverage;
        public float EyeExclusionAverage;
        public float BrowExclusionAverage;
        public float MouthExclusionAverage;
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
    [SerializeField] private E7HandOcclusionRuntime handOcclusionRuntime;
    [SerializeField] private FoundationMaskRuntime foundationMaskRuntime;
    [SerializeField] private ScreenSpaceFoundationController screenSpaceFoundationController;
    [SerializeField] private bool useMeshMasks = true;

    private const string RendererMode = "smooth-region-mask";
    private const string MaskSource = "smooth_region_mask";
    private const string BoundaryRenderer = "smooth_alpha_mask";
    private const string FoundationSkinMaskId = "foundation-skin-mask-v1";
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
    private const float LipCloseupDiagnosticsIntervalSeconds = 0.50f;
    private const float FoundationDiagnosticsIntervalSeconds = 0.75f;
    private const float FoundationVisibleBoost = 1.0f;
    private const bool FoundationDynamicMaskRuntimeEnabled = false;
    private const float FoundationEyeFeather = 0.52f;
    private const float FoundationBrowFeather = 0.54f;
    private const float FoundationMouthFeather = 0.62f;
    private const float FoundationUpperForeheadStart = 0.735f;
    private const float FoundationUpperForeheadEnd = 0.900f;
    private const float FoundationOuterFalloffStrength = 0.78f;
    private const float FoundationMaskBoostForDebug = 1.45f;
    private static readonly Vector4 FoundationEyeExclusionL = new Vector4(0.355f, 0.674f, 0.235f, 0.125f);
    private static readonly Vector4 FoundationEyeExclusionR = new Vector4(0.645f, 0.674f, 0.235f, 0.125f);
    private static readonly Vector4 FoundationBrowExclusionL = new Vector4(0.355f, 0.770f, 0.230f, 0.090f);
    private static readonly Vector4 FoundationBrowExclusionR = new Vector4(0.645f, 0.770f, 0.230f, 0.090f);
    private static readonly Vector4 FoundationMouthExclusion = new Vector4(0.500f, 0.425f, 0.330f, 0.135f);

    // Foundation neck skirt: a face-anchored mesh extruded down from the
    // jawline of the tracked ARKit face mesh, so the neck tint moves with the
    // head (never with the phone) exactly like the face overlay itself.
    private const string FoundationNeckViewKey = "foundation-neck";
    private const float FoundationNeckLengthFaceHeightFactor = 0.38f;
    private const float FoundationNeckTaper = 0.88f;
    private const float FoundationNeckBackOffsetMeters = 0.020f;
    private const int FoundationNeckColumns = 32;
    private const int FoundationNeckMinColumns = 8;
    private static Texture2D foundationNeckGradientTexture;
    private static Texture2D foundationGeneratedSkinMaskTexture;

    private struct FoundationMaskZone
    {
        public Vector2 Center;
        public Vector2 Radius;
        public bool Valid;
    }

    // Exclusion zones for the generated foundation mask. Defaults are rough
    // canonical-UV estimates; EnsureFoundationSkinMaskCalibration replaces
    // them with values measured from the tracked face mesh (anatomy-accurate
    // and identical for every person because ARKit UVs are canonical).
    private static bool foundationSkinMaskCalibrated;
    private static Vector2 foundationCalUvMin = new Vector2(0.0f, 0.0f);
    private static Vector2 foundationCalUvMax = new Vector2(1.0f, 1.0f);
    private static FoundationMaskZone foundationCalLeftEye = new FoundationMaskZone
    {
        Center = new Vector2(0.355f, 0.674f), Radius = new Vector2(0.074f, 0.032f), Valid = true
    };
    private static FoundationMaskZone foundationCalRightEye = new FoundationMaskZone
    {
        Center = new Vector2(0.645f, 0.674f), Radius = new Vector2(0.074f, 0.032f), Valid = true
    };
    private static FoundationMaskZone foundationCalLeftBrow = new FoundationMaskZone
    {
        Center = new Vector2(0.355f, 0.776f), Radius = new Vector2(0.095f, 0.026f), Valid = true
    };
    private static FoundationMaskZone foundationCalRightBrow = new FoundationMaskZone
    {
        Center = new Vector2(0.645f, 0.776f), Radius = new Vector2(0.095f, 0.026f), Valid = true
    };
    private static FoundationMaskZone foundationCalMouth = new FoundationMaskZone
    {
        Center = new Vector2(0.500f, 0.402f), Radius = new Vector2(0.128f, 0.031f), Valid = true
    };

    // Base/exclusion mask sources for the generated foundation skin mask.
    // The shipped/personal mask is used as the base only when it passes a
    // coverage validity check; the lip region mask is reused as the lips-only
    // exclusion when it is CPU-readable (fallback: calibrated mouth ellipse).
    private static bool foundationBaseMaskEvaluated;
    private static Texture2D foundationValidatedBaseMask;
    private static bool foundationLipMaskEvaluated;
    private static Texture2D foundationLipExclusionMask;

    // Camera-texture skin gate state (hair/brow/clothing suppression).
    private ARCameraManager skinGateCameraManager;
    private int skinGateCameraTextureMode;
    private float skinGateLastTextureAt = -10.0f;
    private Matrix4x4 skinGateDisplayTransform = Matrix4x4.identity;
    private Texture skinGateTextureY;
    private Texture skinGateTextureCbCr;
    private Texture skinGateTextureRgb;
    private Vector4 skinGateSmoothedRefA = new Vector4(0.5f, 0.5f, 0.0f, 0.0f);
    private Vector4 skinGateSmoothedRefB = new Vector4(0.5f, 0.5f, 0.0f, 0.0f);
    private Vector4 skinGateSmoothedRefC = new Vector4(0.5f, 0.5f, 0.0f, 0.0f);
    private static readonly int SkinGateSourceTextureYId = Shader.PropertyToID("_textureY");
    private static readonly int SkinGateSourceTextureCbCrId = Shader.PropertyToID("_textureCbCr");
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
    private static readonly Dictionary<string, Texture2D> RuntimeGeneratedLipGlossMaskTextures =
        new Dictionary<string, Texture2D>();
    private static readonly Dictionary<string, Texture2D> RuntimeGeneratedBrowMaskTextures =
        new Dictionary<string, Texture2D>();
    private static readonly Dictionary<string, MaskTextureDiagnostics> MaskTextureDiagnosticsCache =
        new Dictionary<string, MaskTextureDiagnostics>();
    private static readonly Dictionary<string, FoundationMaskAreaDiagnostics> FoundationMaskAreaDiagnosticsCache =
        new Dictionary<string, FoundationMaskAreaDiagnostics>();
    private static readonly Dictionary<string, MaskTextureSampleData> MaskTextureSampleCache =
        new Dictionary<string, MaskTextureSampleData>();
    private bool overlayRenderingSuppressed;
    private bool visionCaptureSuppressed;
    private float nextLipCloseupDiagnosticsLogAt;
    private float nextFoundationDiagnosticsLogAt;

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
            RuntimeGeneratedLipGlossMaskTextures[maskTextureId] =
                CreateGeneratedLipGlossMaskTexture(maskTextureId, rawBytes, width, height);
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

    private static Texture2D CreateGeneratedLipGlossMaskTexture(
        string maskTextureId,
        byte[] rawBytes,
        int width,
        int height)
    {
        byte[] alpha = new byte[width * height];
        int minX = width;
        int minY = height;
        int maxX = -1;
        int maxY = -1;

        for (int y = 0; y < height; y++)
        {
            for (int x = 0; x < width; x++)
            {
                int pixelIndex = y * width + x;
                int byteIndex = pixelIndex * 4;
                int densityValue = Math.Max(
                    rawBytes[byteIndex + 3],
                    Math.Max(rawBytes[byteIndex], Math.Max(rawBytes[byteIndex + 1], rawBytes[byteIndex + 2])));
                byte density = (byte)densityValue;
                alpha[pixelIndex] = density;
                if (density <= 8)
                {
                    continue;
                }

                minX = Math.Min(minX, x);
                minY = Math.Min(minY, y);
                maxX = Math.Max(maxX, x);
                maxY = Math.Max(maxY, y);
            }
        }

        Color32[] pixels = new Color32[width * height];
        int bboxWidth = Math.Max(1, maxX - minX);
        int bboxHeight = Math.Max(1, maxY - minY);
        bool hasLipPixels = maxX >= minX && maxY >= minY;

        if (hasLipPixels)
        {
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int pixelIndex = y * width + x;
                    float lip = alpha[pixelIndex] / 255.0f;
                    if (lip <= 0.01f)
                    {
                        pixels[pixelIndex] = new Color32(255, 255, 255, 0);
                        continue;
                    }

                    float localX = Mathf.Clamp01((x - minX) / (float)bboxWidth);
                    float localY = Mathf.Clamp01((y - minY) / (float)bboxHeight);
                    float lowerMain = Ellipse01(localX, localY, 0.50f, 0.38f, 0.28f, 0.075f, 0.74f);
                    float lowerWetLine = Ellipse01(localX, localY, 0.53f, 0.43f, 0.22f, 0.035f, 0.48f);
                    float lowerSide = Ellipse01(localX, localY, 0.64f, 0.47f, 0.12f, 0.030f, 0.42f);
                    float upperMain = Ellipse01(localX, localY, 0.48f, 0.61f, 0.18f, 0.045f, 0.60f);
                    float upperFine = Ellipse01(localX, localY, 0.42f, 0.56f, 0.095f, 0.025f, 0.40f);
                    float shardBreakup = 0.72f
                        + 0.18f * Mathf.Sin(localX * 37.0f + localY * 11.0f)
                        + 0.10f * Mathf.Sin(localX * 71.0f - localY * 19.0f);
                    float highlight = Mathf.Clamp01(
                        lowerMain * 0.82f
                        + lowerWetLine
                        + lowerSide * 0.64f
                        + upperMain * 0.48f
                        + upperFine * 0.36f);
                    byte glossAlpha = (byte)Mathf.RoundToInt(255.0f * Mathf.Clamp01(lip * highlight * shardBreakup));
                    pixels[pixelIndex] = new Color32(255, 255, 255, glossAlpha);
                }
            }
        }

        Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, false)
        {
            name = "Generated Lip Gloss Mask " + maskTextureId,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear
        };
        texture.SetPixels32(pixels);
        texture.Apply(false, false);
        return texture;
    }

    private static float Ellipse01(
        float x,
        float y,
        float centerX,
        float centerY,
        float radiusX,
        float radiusY,
        float feather)
    {
        float dx = (x - centerX) / Mathf.Max(radiusX, 0.0001f);
        float dy = (y - centerY) / Mathf.Max(radiusY, 0.0001f);
        float distance = dx * dx + dy * dy;
        return 1.0f - Mathf.SmoothStep(1.0f, 1.0f + Mathf.Max(feather, 0.001f), distance);
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
        SetScreenSpaceFoundationRuntimeRequested(false, null);
    }

    private void Update()
    {
        if (recipes.Count == 0)
        {
            SetHandOcclusionRuntimeRequested(false);
            SetScreenSpaceFoundationRuntimeRequested(false, null);
            return;
        }

        SetHandOcclusionRuntimeRequested(HasEnabledLipRecipe() || HasEnabledFoundationRecipe());
        UpdateScreenSpaceFoundationRuntime();
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
        string foundationMode,
        string foundationFallbackMode,
        int foundationDebugMaskMode,
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
            FoundationMode = NormalizeFoundationMode(region, foundationMode),
            FoundationFallbackMode = NormalizeFoundationFallbackMode(foundationFallbackMode),
            FoundationDebugMaskMode = Mathf.Clamp(foundationDebugMaskMode, 0, 30),
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
        string foundationMode,
        string foundationFallbackMode,
        int foundationDebugMaskMode,
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
            foundationMode,
            foundationFallbackMode,
            foundationDebugMaskMode,
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
            if (IsFoundationRegion(region))
            {
                SetScreenSpaceFoundationRuntimeRequested(false, null);
            }
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

        if (IsFoundationRegion(region) && IsScreenSpaceFoundationRecipe(recipe))
        {
            ScreenSpaceFoundationController.ScreenSpaceFoundationState screenSpaceState =
                UpdateScreenSpaceFoundationRuntime();
            result.MaskSource = "screen_space_skin_mask";
            result.BoundaryRenderer = "ScreenSpaceFoundationController";
            result.StateAction = screenSpaceState.ActiveRenderer;
            result.FaceCount = screenSpaceState.FaceTracked ? 1 : 0;
            result.Applied = screenSpaceState.ScreenSpaceActive;
            result.MeshCullingMode = "screen_space_foundation";
            result.MaskTriangleCount = 0;
            result.MeshTriangleCount = 0;
            result.SourceTriangleCount = 0;
            result.TrackingState = screenSpaceState.FaceTracked ? "Tracking" : "None";

            if (screenSpaceState.ScreenSpaceActive || recipe.FoundationFallbackMode == "off")
            {
                HideRegionViews(region);
                latestRegionResults[region] = result;
                if (emitLog)
                {
                    LogRegionApplyResult(result);
                }

                return result;
            }
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
            if (IsFoundationRegion(region))
            {
                // ROOT CAUSE of the "foundation only shows on the chin" bug:
                // the shipped foundation-skin-mask-v1.png is a premultiplied
                // low-alpha veil whose R channel measures ~0.44 at the jaw,
                // ~0.12 on the cheeks and 0.0 on the forehead/eyes/mouth, so
                // whatever render path was used, only the chin ever tinted.
                // Replace it with a runtime-generated full-face skin mask
                // (eyes/brows/mouth softly excluded) and render through the
                // same generic tint path the lip/cheek masks use. The ARKit
                // face mesh itself clips the mask to each person's outline.
                Material foundationMaterial =
                    view.MeshRenderer != null ? view.MeshRenderer.sharedMaterial : null;
                if (foundationMaterial != null)
                {
                    EnsureFoundationSkinMaskCalibration(face);
                    Texture2D generatedSkinMask = GetFoundationSkinMaskTexture();
                    if (generatedSkinMask != null)
                    {
                        foundationMaterial.SetTexture("_MaskTex", generatedSkinMask);
                        if (foundationMaterial.HasProperty("_GlossMaskTex"))
                        {
                            foundationMaterial.SetTexture("_GlossMaskTex", generatedSkinMask);
                        }
                    }

                    ApplyFoundationGenericTintOverrides(foundationMaterial);
                    ApplyFoundationSkinGate(foundationMaterial, face, false);
                }
            }
            TrackingVisibility visibility = ResolveTrackingVisibility(face, faceState);
            ApplyHandOcclusionRect(view, region, face);
            ApplyFoundationDynamicMask(view, region, recipe, face, visibility);
            ApplyViewAlphaMultiplier(view, visibility.AlphaMultiplier);
            MaybeLogLipCloseupDiagnostics(face, view, region, recipe, visibility);
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
                if (IsFoundationRegion(region)
                    && faceState.Regions.TryGetValue(FoundationNeckViewKey, out RegionOverlayView suppressedNeckView))
                {
                    SetViewVisibility(suppressedNeckView, false);
                }

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
            if (IsFoundationRegion(region))
            {
                UpdateFoundationNeckOverlay(face, faceState, recipe, visibility, meshApplied);
            }

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

        if (handOcclusionRuntime == null)
        {
            handOcclusionRuntime = FindFirstObjectByType<E7HandOcclusionRuntime>();
        }

        if (foundationMaskRuntime == null)
        {
            foundationMaskRuntime = FindFirstObjectByType<FoundationMaskRuntime>();
        }

        if (screenSpaceFoundationController == null)
        {
            screenSpaceFoundationController = FindFirstObjectByType<ScreenSpaceFoundationController>();
        }
    }

    private bool HasEnabledLipRecipe()
    {
        return recipes.TryGetValue("lip", out RegionRecipeState lipRecipe) && lipRecipe.Enabled;
    }

    private bool HasEnabledFoundationRecipe()
    {
        return recipes.TryGetValue("foundation", out RegionRecipeState foundationRecipe)
            && foundationRecipe.Enabled;
    }

    private void EnsureHandOcclusionRuntime()
    {
        if (handOcclusionRuntime != null)
        {
            return;
        }

        handOcclusionRuntime = FindFirstObjectByType<E7HandOcclusionRuntime>();
        if (handOcclusionRuntime == null)
        {
            handOcclusionRuntime = gameObject.AddComponent<E7HandOcclusionRuntime>();
        }
    }

    private void SetHandOcclusionRuntimeRequested(bool requested)
    {
        if (requested)
        {
            EnsureHandOcclusionRuntime();
        }

        if (handOcclusionRuntime != null)
        {
            handOcclusionRuntime.SetRuntimeRequested(requested);
        }
    }

    private void EnsureFoundationMaskRuntime()
    {
        if (foundationMaskRuntime != null)
        {
            return;
        }

        foundationMaskRuntime = FindFirstObjectByType<FoundationMaskRuntime>();
        if (foundationMaskRuntime == null)
        {
            foundationMaskRuntime = gameObject.AddComponent<FoundationMaskRuntime>();
        }
    }

    private void EnsureScreenSpaceFoundationController()
    {
        if (screenSpaceFoundationController != null)
        {
            return;
        }

        screenSpaceFoundationController = FindFirstObjectByType<ScreenSpaceFoundationController>();
        if (screenSpaceFoundationController == null)
        {
            screenSpaceFoundationController = gameObject.AddComponent<ScreenSpaceFoundationController>();
        }
    }

    private void SetScreenSpaceFoundationRuntimeRequested(bool requested, RegionRecipeState recipe)
    {
        if (requested)
        {
            EnsureScreenSpaceFoundationController();
        }

        if (screenSpaceFoundationController == null)
        {
            return;
        }

        if (!requested || recipe == null)
        {
            screenSpaceFoundationController.ConfigureDisabled("not_requested");
            return;
        }

        screenSpaceFoundationController.ConfigureRecipe(
            recipe.Enabled,
            recipe.FoundationMode,
            recipe.FoundationFallbackMode,
            recipe.FoundationDebugMaskMode,
            recipe.Color,
            recipe.SecondaryColor,
            recipe.Intensity,
            recipe.Opacity,
            recipe.Coverage,
            recipe.GlossBoost,
            recipe.Roughness);
    }

    private ScreenSpaceFoundationController.ScreenSpaceFoundationState UpdateScreenSpaceFoundationRuntime()
    {
        RegionRecipeState recipe = null;
        if (recipes.TryGetValue("foundation", out RegionRecipeState foundationRecipe))
        {
            recipe = foundationRecipe;
        }

        bool requested = recipe != null
            && recipe.Enabled
            && IsScreenSpaceFoundationRecipe(recipe)
            && !overlayRenderingSuppressed
            && !visionCaptureSuppressed;
        SetScreenSpaceFoundationRuntimeRequested(requested, recipe);

        if (screenSpaceFoundationController == null)
        {
            return default;
        }

        return screenSpaceFoundationController.UpdateRuntime(faceManager, Camera.main);
    }

    private void ApplyFoundationDynamicMask(
        RegionOverlayView view,
        string region,
        RegionRecipeState recipe,
        ARFace face,
        TrackingVisibility visibility)
    {
        Material material = view.MeshRenderer != null ? view.MeshRenderer.sharedMaterial : null;
        if (!FoundationDynamicMaskRuntimeEnabled
            || !IsFoundationRegion(region)
            || recipe == null
            || !recipe.Enabled
            || material == null)
        {
            ApplyMaterialFoundationDynamicMask(material, false, null);
            return;
        }

        EnsureFoundationMaskRuntime();
        if (foundationMaskRuntime == null)
        {
            ApplyMaterialFoundationDynamicMask(material, false, null);
            return;
        }

        int debugMode = Mathf.RoundToInt(GetMaterialFloat(material, "_DebugMaskMode", 0.0f));
        FoundationMaskRuntime.FoundationMaskState state = visibility.ShouldRender
            ? foundationMaskRuntime.UpdateMask(face, Camera.main, debugMode)
            : foundationMaskRuntime.InvalidateMask(
                face != null && face.trackingState == TrackingState.Tracking,
                debugMode,
                visibility.Action);
        bool valid = state.DynamicMaskValid && foundationMaskRuntime.FoundationMaskTexture != null;
        ApplyMaterialFoundationDynamicMask(material, valid, foundationMaskRuntime.FoundationMaskTexture);
    }

    private void ApplyHandOcclusionRect(RegionOverlayView view, string region, ARFace face)
    {
        Material material = view.MeshRenderer != null ? view.MeshRenderer.sharedMaterial : null;
        bool foundationRegion = IsFoundationRegion(region);
        if ((region != "lip" && !foundationRegion) || face == null)
        {
            ApplyMaterialHandOcclusion(material, false, null, false, Rect.zero);
            return;
        }

        EnsureHandOcclusionRuntime();
        if (handOcclusionRuntime == null)
        {
            ApplyMaterialHandOcclusion(material, false, null, false, Rect.zero);
            return;
        }

        Camera arCamera = Camera.main;
        if (foundationRegion)
        {
            // Foundation covers the whole face, so a hand anywhere over the
            // face (not just near the mouth) must occlude it. The per-pixel
            // hand mask in the shader shapes the actual hidden area.
            if (TryCalculateCurrentFaceScreenBounds(face, arCamera, out Vector2 faceCenter, out Vector2 faceSize)
                && faceSize.x > 1.0f
                && faceSize.y > 1.0f)
            {
                handOcclusionRuntime.UpdateMouthScreenBounds(new Rect(
                    faceCenter.x - faceSize.x * 0.5f,
                    faceCenter.y - faceSize.y * 0.5f,
                    faceSize.x,
                    faceSize.y));
            }
        }
        else if (!HasEnabledFoundationRecipe()
            && TryCalculateApproximateMouthScreenBounds(face, arCamera, out Rect mouthBounds))
        {
            // Lip keeps the tighter mouth ROI only when foundation is off;
            // otherwise the foundation's face-sized ROI stands so the two
            // regions don't fight over the shared runtime every frame.
            handOcclusionRuntime.UpdateMouthScreenBounds(mouthBounds);
        }

        E7HandOcclusionRuntime.HandOcclusionState state = handOcclusionRuntime.CurrentState;
        ApplyMaterialHandOcclusion(
            material,
            state.HandNearMouth && (state.HasHandMask || state.HasOcclusionRect),
            handOcclusionRuntime.HandMaskTexture,
            state.HasOcclusionRect && !state.HasHandMask,
            state.ScreenRect);
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

    private static bool TryCalculateApproximateMouthScreenBounds(
        ARFace face,
        Camera arCamera,
        out Rect mouthBounds)
    {
        mouthBounds = Rect.zero;
        if (!TryCalculateCurrentFaceScreenBounds(face, arCamera, out Vector2 center, out Vector2 size)
            || size.x <= 1.0f
            || size.y <= 1.0f)
        {
            return false;
        }

        float left = center.x - size.x * 0.21f;
        float top = center.y + size.y * 0.10f;
        float width = size.x * 0.42f;
        float height = size.y * 0.22f;
        mouthBounds = new Rect(left, top, width, height);
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
        bool foundationMask = region == "foundation" && maskTextureId == FoundationSkinMaskId;
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
            Threshold = foundationMask || lipStyleAtlas || visionLipBoundary || cheekBlushMask || generatedLipMask || generatedBrowMask ? 0.025f : 0.04f,
            // Eyeliner is a thin line: the default 0.56 feather would blur it
            // into a shadow, so keep its edge tight.
            FeatherUvNormalized = foundationMask
                ? 0.54f
                : region == "eyeliner"
                ? 0.10f
                : lipStyleAtlas
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
            case "foundation":
                return FoundationSkinMaskId;
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

        if (IsGeneratedEyelinerMaskTextureId(mask.MaskTextureId))
        {
            return GetGeneratedEyelinerMaskTexture(mask.MaskTextureId);
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

    private static Texture2D GetGlossMaskTexture(MaskDefinition mask)
    {
        if (mask == null)
        {
            return null;
        }

        if (IsGeneratedLipMaskTextureId(mask.MaskTextureId)
            && RuntimeGeneratedLipGlossMaskTextures.TryGetValue(mask.MaskTextureId, out Texture2D generatedGloss))
        {
            return generatedGloss;
        }

        return GetMaskTexture(mask);
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
            int valueMax = 0;
            long valueSum = 0;
            long densitySum = 0;

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
                    valueSum += value;
                    densitySum += densityValue;
                    valueMax = Mathf.Max(valueMax, value);
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
            diagnostics.MaxValue = valueMax;
            diagnostics.AverageValue = valueSum / (255.0f * totalPixels);
            diagnostics.AverageDensity = densitySum / (255.0f * totalPixels);
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

    private static FoundationMaskAreaDiagnostics GetFoundationMaskAreaDiagnostics(MaskDefinition mask)
    {
        if (mask == null)
        {
            return new FoundationMaskAreaDiagnostics { Status = "mask_missing" };
        }

        string cacheKey = mask.ResourcePath
            + "|foundation-final-v2"
            + "|eye=" + FoundationEyeFeather.ToString("0.###", CultureInfo.InvariantCulture)
            + "|brow=" + FoundationBrowFeather.ToString("0.###", CultureInfo.InvariantCulture)
            + "|mouth=" + FoundationMouthFeather.ToString("0.###", CultureInfo.InvariantCulture)
            + "|forehead=" + FoundationUpperForeheadStart.ToString("0.###", CultureInfo.InvariantCulture)
            + "-" + FoundationUpperForeheadEnd.ToString("0.###", CultureInfo.InvariantCulture)
            + "|outer=" + FoundationOuterFalloffStrength.ToString("0.###", CultureInfo.InvariantCulture);
        if (FoundationMaskAreaDiagnosticsCache.TryGetValue(cacheKey, out FoundationMaskAreaDiagnostics cached))
        {
            return cached;
        }

        FoundationMaskAreaDiagnostics diagnostics = new FoundationMaskAreaDiagnostics();
        Texture2D texture = GetMaskTexture(mask);
        if (texture == null)
        {
            diagnostics.Status = "texture_missing";
            FoundationMaskAreaDiagnosticsCache[cacheKey] = diagnostics;
            return diagnostics;
        }

        diagnostics.Width = texture.width;
        diagnostics.Height = texture.height;

        try
        {
            Color32[] pixels = texture.GetPixels32();
            int totalPixels = Mathf.Max(1, pixels.Length);
            int finalMinX = diagnostics.Width;
            int finalMinY = diagnostics.Height;
            int finalMaxX = -1;
            int finalMaxY = -1;
            int finalCount = 0;
            int rawCount = 0;
            int baseCount = 0;
            float rawSum = 0.0f;
            float regionWeightSum = 0.0f;
            float exclusionSum = 0.0f;
            float baseSum = 0.0f;
            float finalSum = 0.0f;
            float finalMax = 0.0f;
            float weightedX = 0.0f;
            float weightedY = 0.0f;
            float weightedTotal = 0.0f;
            float lowForeheadSum = 0.0f;
            float lowForeheadWeight = 0.0f;
            float noseSum = 0.0f;
            float noseWeight = 0.0f;
            float leftCheekSum = 0.0f;
            float leftCheekWeight = 0.0f;
            float rightCheekSum = 0.0f;
            float rightCheekWeight = 0.0f;
            float chinSum = 0.0f;
            float chinWeight = 0.0f;
            float eyeExclusionSum = 0.0f;
            float eyeExclusionWeight = 0.0f;
            float browExclusionSum = 0.0f;
            float browExclusionWeight = 0.0f;
            float mouthExclusionSum = 0.0f;
            float mouthExclusionWeight = 0.0f;

            for (int y = 0; y < diagnostics.Height; y++)
            {
                float uvY = diagnostics.Height <= 1 ? 0.0f : y / (float)(diagnostics.Height - 1);
                for (int x = 0; x < diagnostics.Width; x++)
                {
                    int pixelIndex = y * diagnostics.Width + x;
                    if (pixelIndex < 0 || pixelIndex >= pixels.Length)
                    {
                        continue;
                    }

                    float uvX = diagnostics.Width <= 1 ? 0.0f : x / (float)(diagnostics.Width - 1);
                    Vector2 uv = new Vector2(uvX, uvY);
                    float raw = pixels[pixelIndex].r / 255.0f;
                    float exclusionPreview;
                    float featureKeep = CalculateFoundationFeatureKeep(uv, out exclusionPreview);
                    float regionWeight = CalculateFoundationRegionWeight(uv);
                    float baseMask = Mathf.Clamp01(raw * regionWeight);
                    float finalMask = Mathf.Clamp01(baseMask * featureKeep);
                    rawSum += raw;
                    regionWeightSum += regionWeight;
                    exclusionSum += exclusionPreview;
                    baseSum += baseMask;
                    finalSum += finalMask;
                    finalMax = Mathf.Max(finalMax, finalMask);

                    if (raw > 0.05f)
                    {
                        rawCount++;
                    }

                    if (baseMask > 0.05f)
                    {
                        baseCount++;
                    }

                    if (finalMask > 0.05f)
                    {
                        finalCount++;
                        finalMinX = Mathf.Min(finalMinX, x);
                        finalMaxX = Mathf.Max(finalMaxX, x);
                        int topLeftY = diagnostics.Height - 1 - y;
                        finalMinY = Mathf.Min(finalMinY, topLeftY);
                        finalMaxY = Mathf.Max(finalMaxY, topLeftY);
                    }

                    weightedX += uvX * finalMask;
                    weightedY += uvY * finalMask;
                    weightedTotal += finalMask;

                    AccumulateFoundationZone(uv, finalMask, FoundationLowForeheadZone(uv), ref lowForeheadSum, ref lowForeheadWeight);
                    AccumulateFoundationZone(uv, finalMask, FoundationNoseZone(uv), ref noseSum, ref noseWeight);
                    AccumulateFoundationZone(uv, finalMask, FoundationLeftCheekZone(uv), ref leftCheekSum, ref leftCheekWeight);
                    AccumulateFoundationZone(uv, finalMask, FoundationRightCheekZone(uv), ref rightCheekSum, ref rightCheekWeight);
                    AccumulateFoundationZone(uv, finalMask, FoundationChinZone(uv), ref chinSum, ref chinWeight);
                    AccumulateFoundationZone(uv, finalMask, FoundationEyeZone(uv), ref eyeExclusionSum, ref eyeExclusionWeight);
                    AccumulateFoundationZone(uv, finalMask, FoundationBrowZone(uv), ref browExclusionSum, ref browExclusionWeight);
                    AccumulateFoundationZone(uv, finalMask, FoundationMouthZone(uv), ref mouthExclusionSum, ref mouthExclusionWeight);
                }
            }

            diagnostics.Status = "ok";
            diagnostics.RawAverage = rawSum / totalPixels;
            diagnostics.RegionWeightAverage = regionWeightSum / totalPixels;
            diagnostics.ExclusionAverage = exclusionSum / totalPixels;
            diagnostics.BaseAverage = baseSum / totalPixels;
            diagnostics.FinalAverage = finalSum / totalPixels;
            diagnostics.FinalMax = finalMax;
            diagnostics.RawCoverageGt5 = rawCount / (float)totalPixels;
            diagnostics.BaseCoverageGt5 = baseCount / (float)totalPixels;
            diagnostics.FinalCoverageGt5 = finalCount / (float)totalPixels;
            diagnostics.FinalBboxTopLeft = finalCount == 0
                ? "none"
                : "left=" + finalMinX.ToString(CultureInfo.InvariantCulture)
                    + ",top=" + finalMinY.ToString(CultureInfo.InvariantCulture)
                    + ",right=" + finalMaxX.ToString(CultureInfo.InvariantCulture)
                    + ",bottom=" + finalMaxY.ToString(CultureInfo.InvariantCulture)
                    + ",width=" + (finalMaxX - finalMinX + 1).ToString(CultureInfo.InvariantCulture)
                    + ",height=" + (finalMaxY - finalMinY + 1).ToString(CultureInfo.InvariantCulture);
            diagnostics.FinalBboxUv = finalCount == 0
                ? "none"
                : "uMin=" + (finalMinX / (float)Mathf.Max(1, diagnostics.Width - 1)).ToString("0.###", CultureInfo.InvariantCulture)
                    + ",uMax=" + (finalMaxX / (float)Mathf.Max(1, diagnostics.Width - 1)).ToString("0.###", CultureInfo.InvariantCulture)
                    + ",vMin=" + ((diagnostics.Height - 1 - finalMaxY) / (float)Mathf.Max(1, diagnostics.Height - 1)).ToString("0.###", CultureInfo.InvariantCulture)
                    + ",vMax=" + ((diagnostics.Height - 1 - finalMinY) / (float)Mathf.Max(1, diagnostics.Height - 1)).ToString("0.###", CultureInfo.InvariantCulture);
            diagnostics.FinalWeightedCenterUv = weightedTotal <= 0.00001f
                ? "none"
                : "u=" + (weightedX / weightedTotal).ToString("0.###", CultureInfo.InvariantCulture)
                    + ",v=" + (weightedY / weightedTotal).ToString("0.###", CultureInfo.InvariantCulture);
            diagnostics.LowForeheadAverage = SafeZoneAverage(lowForeheadSum, lowForeheadWeight);
            diagnostics.NoseAverage = SafeZoneAverage(noseSum, noseWeight);
            diagnostics.LeftCheekAverage = SafeZoneAverage(leftCheekSum, leftCheekWeight);
            diagnostics.RightCheekAverage = SafeZoneAverage(rightCheekSum, rightCheekWeight);
            diagnostics.ChinAverage = SafeZoneAverage(chinSum, chinWeight);
            diagnostics.EyeExclusionAverage = SafeZoneAverage(eyeExclusionSum, eyeExclusionWeight);
            diagnostics.BrowExclusionAverage = SafeZoneAverage(browExclusionSum, browExclusionWeight);
            diagnostics.MouthExclusionAverage = SafeZoneAverage(mouthExclusionSum, mouthExclusionWeight);
        }
        catch (Exception exception)
        {
            diagnostics.Status = "error_" + SanitizeDiagnosticValue(exception.GetType().Name);
        }

        FoundationMaskAreaDiagnosticsCache[cacheKey] = diagnostics;
        return diagnostics;
    }

    private static void AccumulateFoundationZone(
        Vector2 uv,
        float finalMask,
        float zoneWeight,
        ref float sum,
        ref float weight)
    {
        _ = uv;
        float clampedWeight = Mathf.Clamp01(zoneWeight);
        sum += finalMask * clampedWeight;
        weight += clampedWeight;
    }

    private static float SafeZoneAverage(float sum, float weight)
    {
        return weight <= 0.00001f ? 0.0f : sum / weight;
    }

    private static float CalculateFoundationFeatureKeep(Vector2 uv, out float exclusionPreview)
    {
        float leftEye = FoundationEllipse(uv, FoundationEyeExclusionL, FoundationEyeFeather);
        float rightEye = FoundationEllipse(uv, FoundationEyeExclusionR, FoundationEyeFeather);
        float glassesBridge = FoundationEllipse(uv, new Vector4(0.500f, 0.674f, 0.092f, 0.058f), 0.40f) * 0.70f;
        float eyeBand = FoundationEllipse(uv, new Vector4(0.500f, 0.674f, 0.472f, 0.158f), 0.48f) * 0.26f;
        float leftBrow = FoundationEllipse(uv, FoundationBrowExclusionL, FoundationBrowFeather);
        float rightBrow = FoundationEllipse(uv, FoundationBrowExclusionR, FoundationBrowFeather);
        float browBridge = FoundationEllipse(uv, new Vector4(0.500f, 0.748f, 0.355f, 0.090f), 0.50f) * 0.72f;
        float mouth = FoundationEllipse(uv, FoundationMouthExclusion, FoundationMouthFeather);
        float mouthBand = FoundationEllipse(uv, new Vector4(0.500f, 0.472f, 0.300f, 0.078f), 0.58f) * 0.55f;
        float nostril = FoundationEllipse(uv, new Vector4(0.500f, 0.555f, 0.136f, 0.046f), 0.44f) * 0.28f;
        float exclusion = Mathf.Clamp01(Mathf.Max(
            Mathf.Max(Mathf.Max(leftEye, rightEye), Mathf.Max(glassesBridge, Mathf.Max(eyeBand, browBridge))),
            Mathf.Max(Mathf.Max(leftBrow, rightBrow), Mathf.Max(mouth, Mathf.Max(mouthBand, nostril)))));
        exclusionPreview = exclusion;
        return 1.0f - exclusion;
    }

    private static float CalculateFoundationRegionWeight(Vector2 uv)
    {
        Vector2 faceLocal = new Vector2(
            (uv.x - 0.500f) / 0.425f,
            (uv.y - 0.515f) / 0.492f);
        float faceDistance = faceLocal.x * faceLocal.x + faceLocal.y * faceLocal.y;
        float faceCore = 1.0f - ShaderSmoothStep(0.58f, 1.00f, faceDistance);
        float contourFeather = 1.0f - ShaderSmoothStep(0.42f, 0.96f, faceDistance) * Mathf.Clamp01(FoundationOuterFalloffStrength);
        float skinIslands = Mathf.Clamp01(Mathf.Max(
            Mathf.Max(FoundationLeftCheekZone(uv), FoundationRightCheekZone(uv)),
            Mathf.Max(
                Mathf.Max(FoundationNoseZone(uv), FoundationLowerNoseCheekZone(uv) * 0.50f),
                Mathf.Max(FoundationChinZone(uv) * 0.62f, FoundationLowForeheadZone(uv) * 0.28f))));
        float eyeFalloff = 1.0f - FoundationEllipse(uv, new Vector4(0.500f, 0.680f, 0.455f, 0.170f), 0.52f) * 0.64f;
        float mouthFalloff = 1.0f - FoundationEllipse(uv, new Vector4(0.500f, 0.425f, 0.335f, 0.128f), 0.58f) * 0.62f;
        float hairlineFalloff = Mathf.Lerp(
            1.0f,
            0.06f,
            ShaderSmoothStep(FoundationUpperForeheadStart, FoundationUpperForeheadEnd, uv.y));
        float jawFalloff = Mathf.Lerp(0.34f, 1.0f, ShaderSmoothStep(0.145f, 0.250f, uv.y));
        return Mathf.Clamp01(faceCore * skinIslands * contourFeather * eyeFalloff * mouthFalloff * hairlineFalloff * jawFalloff);
    }

    private static float FoundationEllipse(Vector2 uv, Vector4 ellipse, float feather)
    {
        float dx = (uv.x - ellipse.x) / Mathf.Max(ellipse.z, 0.0001f);
        float dy = (uv.y - ellipse.y) / Mathf.Max(ellipse.w, 0.0001f);
        float distance = dx * dx + dy * dy;
        return 1.0f - ShaderSmoothStep(1.0f, 1.0f + Mathf.Max(feather, 0.001f), distance);
    }

    private static float ShaderSmoothStep(float edge0, float edge1, float value)
    {
        float t = Mathf.Clamp01((value - edge0) / Mathf.Max(edge1 - edge0, 0.0001f));
        return t * t * (3.0f - 2.0f * t);
    }

    private static float FoundationLowForeheadZone(Vector2 uv)
    {
        return FoundationEllipse(uv, new Vector4(0.500f, 0.805f, 0.190f, 0.072f), 0.58f);
    }

    private static float FoundationNoseZone(Vector2 uv)
    {
        return FoundationEllipse(uv, new Vector4(0.500f, 0.592f, 0.106f, 0.178f), 0.70f);
    }

    private static float FoundationLowerNoseCheekZone(Vector2 uv)
    {
        return FoundationEllipse(uv, new Vector4(0.500f, 0.505f, 0.236f, 0.162f), 0.82f);
    }

    private static float FoundationLeftCheekZone(Vector2 uv)
    {
        return FoundationEllipse(uv, new Vector4(0.335f, 0.535f, 0.172f, 0.198f), 0.84f);
    }

    private static float FoundationRightCheekZone(Vector2 uv)
    {
        return FoundationEllipse(uv, new Vector4(0.665f, 0.535f, 0.172f, 0.198f), 0.84f);
    }

    private static float FoundationChinZone(Vector2 uv)
    {
        return FoundationEllipse(uv, new Vector4(0.500f, 0.315f, 0.200f, 0.118f), 0.78f);
    }

    private static float FoundationEyeZone(Vector2 uv)
    {
        return Mathf.Max(
            FoundationEllipse(uv, FoundationEyeExclusionL, FoundationEyeFeather),
            FoundationEllipse(uv, FoundationEyeExclusionR, FoundationEyeFeather));
    }

    private static float FoundationBrowZone(Vector2 uv)
    {
        return Mathf.Max(
            FoundationEllipse(uv, FoundationBrowExclusionL, FoundationBrowFeather),
            FoundationEllipse(uv, FoundationBrowExclusionR, FoundationBrowFeather));
    }

    private static float FoundationMouthZone(Vector2 uv)
    {
        return FoundationEllipse(uv, FoundationMouthExclusion, FoundationMouthFeather);
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
        bool foundationRegion = IsFoundationRegion(recipe.Region);
        bool cheekBlushMask = IsCheekBlushRegion(recipe.Region) && IsCheekBlushMask(recipe.MaskTextureId);
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
        if (material.HasProperty("_GlossMaskTex"))
        {
            material.SetTexture("_GlossMaskTex", GetGlossMaskTexture(mask) ?? maskTexture);
        }
        ApplyMaterialBlendMode(material, recipe.BlendMode, cheekBlushMask, foundationRegion);

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

        ApplyMaterialHandOcclusion(material, false, null, false, Rect.zero);

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
            material.SetColor("_GlossColor", new Color(1.0f, 0.965f, 0.92f, 1.0f));
        }

        if (material.HasProperty("_GlossSharpness"))
        {
            material.SetFloat(
                "_GlossSharpness",
                recipe.TextureSample == "gloss_lip"
                    ? Mathf.Lerp(0.70f, 0.94f, recipe.GlossBoost)
                    : 0.0f);
        }

        if (material.HasProperty("_GlossHaloIntensity"))
        {
            material.SetFloat(
                "_GlossHaloIntensity",
                recipe.TextureSample == "gloss_lip"
                    ? Mathf.Lerp(0.018f, 0.050f, recipe.GlossBoost)
                    : 0.0f);
        }

        if (material.HasProperty("_HighlightThreshold"))
        {
            material.SetFloat("_HighlightThreshold", generatedLipMask ? 0.64f : 0.68f);
        }

        if (material.HasProperty("_ExistingHighlightBoost"))
        {
            material.SetFloat("_ExistingHighlightBoost", recipe.TextureSample == "gloss_lip" ? 0.30f : 0.0f);
        }

        if (material.HasProperty("_LowerLipHighlightWeight"))
        {
            material.SetFloat("_LowerLipHighlightWeight", recipe.TextureSample == "gloss_lip" ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_UpperLipHighlightWeight"))
        {
            material.SetFloat("_UpperLipHighlightWeight", recipe.TextureSample == "gloss_lip" ? 0.44f : 0.0f);
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

        if (material.HasProperty("_FoundationMode"))
        {
            material.SetFloat("_FoundationMode", foundationRegion ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_UserSkinBaseColor"))
        {
            material.SetColor("_UserSkinBaseColor", new Color(
                recipe.SecondaryColor.r,
                recipe.SecondaryColor.g,
                recipe.SecondaryColor.b,
                1.0f));
        }

        if (material.HasProperty("_FoundationIntensity"))
        {
            material.SetFloat("_FoundationIntensity", foundationRegion ? Mathf.Clamp01(recipe.Intensity) : 0.0f);
        }

        if (material.HasProperty("_FoundationEvenness"))
        {
            material.SetFloat("_FoundationEvenness", foundationRegion ? Mathf.Clamp01(recipe.GlossBoost) : 0.0f);
        }

        if (material.HasProperty("_FoundationLuminanceInfluence"))
        {
            material.SetFloat("_FoundationLuminanceInfluence", foundationRegion ? Mathf.Clamp01(recipe.Roughness) : 0.0f);
        }

        if (material.HasProperty("_FoundationMaxLumShift"))
        {
            material.SetFloat("_FoundationMaxLumShift", foundationRegion ? 0.14f : 0.0f);
        }

        if (material.HasProperty("_FoundationGlowAmount"))
        {
            material.SetFloat(
                "_FoundationGlowAmount",
                foundationRegion && recipe.TextureSample == "foundation_glow"
                    ? Mathf.Clamp01(recipe.Specular)
                    : 0.0f);
        }

        if (material.HasProperty("_FoundationVisibleBoost"))
        {
            material.SetFloat("_FoundationVisibleBoost", foundationRegion ? FoundationVisibleBoost : 1.0f);
        }

        ApplyFoundationMaskControls(material, foundationRegion);

        if (material.HasProperty("_LipStyleMode"))
        {
            material.SetFloat(
                "_LipStyleMode",
                !foundationRegion && (IsLipStyleAtlasMask(recipe.MaskTextureId) || visionLipBoundary || generatedLipMask)
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

        if (material.HasProperty("_EyelinerMode"))
        {
            // Thin-line alpha path: raw mask sampling + near-full core
            // strength so the liner reads as a drawn line, not a soft stain.
            material.SetFloat(
                "_EyelinerMode",
                recipe.Region == "eyeliner" ? 1.0f : 0.0f);
        }

        MaybeLogFoundationDiagnostics(material, mask, maskTexture, materialColor, recipe, foundationRegion);
    }

    private static void ApplyFoundationMaskControls(Material material, bool foundationRegion)
    {
        if (material == null)
        {
            return;
        }

        if (material.HasProperty("_FoundationExclusionEnabled"))
        {
            material.SetFloat("_FoundationExclusionEnabled", foundationRegion ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_FoundationDebugMode"))
        {
            material.SetFloat("_FoundationDebugMode", 0.0f);
        }

        if (!foundationRegion)
        {
            return;
        }

        if (material.HasProperty("_FoundationEyeExclusionL"))
        {
            material.SetVector("_FoundationEyeExclusionL", FoundationEyeExclusionL);
        }

        if (material.HasProperty("_FoundationEyeExclusionR"))
        {
            material.SetVector("_FoundationEyeExclusionR", FoundationEyeExclusionR);
        }

        if (material.HasProperty("_FoundationBrowExclusionL"))
        {
            material.SetVector("_FoundationBrowExclusionL", FoundationBrowExclusionL);
        }

        if (material.HasProperty("_FoundationBrowExclusionR"))
        {
            material.SetVector("_FoundationBrowExclusionR", FoundationBrowExclusionR);
        }

        if (material.HasProperty("_FoundationMouthExclusion"))
        {
            material.SetVector("_FoundationMouthExclusion", FoundationMouthExclusion);
        }

        if (material.HasProperty("_FoundationEyeFeather"))
        {
            material.SetFloat("_FoundationEyeFeather", FoundationEyeFeather);
        }

        if (material.HasProperty("_FoundationBrowFeather"))
        {
            material.SetFloat("_FoundationBrowFeather", FoundationBrowFeather);
        }

        if (material.HasProperty("_FoundationMouthFeather"))
        {
            material.SetFloat("_FoundationMouthFeather", FoundationMouthFeather);
        }

        if (material.HasProperty("_FoundationUpperForeheadStart"))
        {
            material.SetFloat("_FoundationUpperForeheadStart", FoundationUpperForeheadStart);
        }

        if (material.HasProperty("_FoundationUpperForeheadEnd"))
        {
            material.SetFloat("_FoundationUpperForeheadEnd", FoundationUpperForeheadEnd);
        }

        if (material.HasProperty("_FoundationOuterFalloffStrength"))
        {
            material.SetFloat("_FoundationOuterFalloffStrength", FoundationOuterFalloffStrength);
        }

        if (material.HasProperty("_FoundationMaskBoostForDebug"))
        {
            material.SetFloat("_FoundationMaskBoostForDebug", FoundationMaskBoostForDebug);
        }
    }

    private void MaybeLogFoundationDiagnostics(
        Material material,
        MaskDefinition mask,
        Texture2D maskTexture,
        Color materialColor,
        RegionRecipeState recipe,
        bool foundationRegion)
    {
        if (!foundationRegion || Time.unscaledTime < nextFoundationDiagnosticsLogAt)
        {
            return;
        }

        nextFoundationDiagnosticsLogAt = Time.unscaledTime + FoundationDiagnosticsIntervalSeconds;
        float visibleBoost = GetMaterialFloat(material, "_FoundationVisibleBoost", FoundationVisibleBoost);
        float foundationEffectiveAmount = Mathf.Clamp01(
            recipe.Intensity
            * Mathf.Lerp(0.75f, 1.35f, recipe.Coverage)
            * Mathf.Max(visibleBoost, 0.1f));
        float chromaDelta = CalculateFoundationChromaDelta(recipe.SecondaryColor, recipe.Color);
        float lumDelta = CalculateFoundationLuminanceDelta(recipe.SecondaryColor, recipe.Color);
        MaskTextureDiagnostics maskDiagnostics = GetMaskTextureDiagnostics(mask);
        FoundationMaskAreaDiagnostics areaDiagnostics = GetFoundationMaskAreaDiagnostics(mask);
        FoundationMaskRuntime.FoundationMaskState dynamicMaskState = foundationMaskRuntime != null
            ? foundationMaskRuntime.CurrentState
            : default;
        string foundationBlendPath =
            GetMaterialFloat(material, "_PigmentMultiply", 0.0f) > 0.5f
                ? "toneCorrect_multiply_filter"
                : "normal_alpha_fallback";
        bool shaderPropertiesApplied =
            HasMaterialProperty(material, "_FoundationMode")
            && HasMaterialProperty(material, "_FoundationIntensity")
            && HasMaterialProperty(material, "_FoundationVisibleBoost")
            && HasMaterialProperty(material, "_UserSkinBaseColor")
            && HasMaterialProperty(material, "_FoundationExclusionEnabled")
            && HasMaterialProperty(material, "_FoundationDebugMode");
        string diagnosticMessage =
            "[E7] foundation_material_diagnostics"
            + " enabled=" + recipe.Enabled.ToString().ToLowerInvariant()
            + " region=" + recipe.Region
            + " textureSample=" + recipe.TextureSample
            + " foundationMode=" + recipe.FoundationMode
            + " foundationFallbackMode=" + recipe.FoundationFallbackMode
            + " foundationDebugMaskMode=" + recipe.FoundationDebugMaskMode.ToString(CultureInfo.InvariantCulture)
            + " maskTextureId=" + recipe.MaskTextureId
            + " maskLoaded=" + (maskTexture != null).ToString().ToLowerInvariant()
            + " maskResourcePath=" + (mask != null ? mask.ResourcePath : "none")
            + " maskWidth=" + (maskTexture != null ? maskTexture.width.ToString(CultureInfo.InvariantCulture) : "0")
            + " maskHeight=" + (maskTexture != null ? maskTexture.height.ToString(CultureInfo.InvariantCulture) : "0")
            + " foundationMaskAverage=" + maskDiagnostics.AverageValue.ToString("0.######", CultureInfo.InvariantCulture)
            + " foundationMaskMax=" + (maskDiagnostics.MaxValue / 255.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " foundationMaskActiveCoverage=" + maskDiagnostics.ActiveCoverageGt8.ToString("0.###", CultureInfo.InvariantCulture)
            + " foundationMaskBbox=" + SanitizeDiagnosticValue(maskDiagnostics.ActiveBbox)
            + " finalMaskDiagnosticStatus=" + SanitizeDiagnosticValue(areaDiagnostics.Status)
            + " finalMaskRawAverage=" + areaDiagnostics.RawAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskRegionWeightAverage=" + areaDiagnostics.RegionWeightAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskExclusionAverage=" + areaDiagnostics.ExclusionAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskBaseAverage=" + areaDiagnostics.BaseAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskAverage=" + areaDiagnostics.FinalAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskMax=" + areaDiagnostics.FinalMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskRawCoverageGt5=" + areaDiagnostics.RawCoverageGt5.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskBaseCoverageGt5=" + areaDiagnostics.BaseCoverageGt5.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskCoverageGt5=" + areaDiagnostics.FinalCoverageGt5.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskBboxTopLeft=" + SanitizeDiagnosticValue(areaDiagnostics.FinalBboxTopLeft)
            + " finalMaskBboxUv=" + SanitizeDiagnosticValue(areaDiagnostics.FinalBboxUv)
            + " finalMaskWeightedCenterUv=" + SanitizeDiagnosticValue(areaDiagnostics.FinalWeightedCenterUv)
            + " finalMaskLowForeheadAvg=" + areaDiagnostics.LowForeheadAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskNoseAvg=" + areaDiagnostics.NoseAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskLeftCheekAvg=" + areaDiagnostics.LeftCheekAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskRightCheekAvg=" + areaDiagnostics.RightCheekAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskChinAvg=" + areaDiagnostics.ChinAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskEyeExcludedAvg=" + areaDiagnostics.EyeExclusionAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskBrowExcludedAvg=" + areaDiagnostics.BrowExclusionAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskMouthExcludedAvg=" + areaDiagnostics.MouthExclusionAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " dynamicMaskRuntimeEnabled=" + FoundationDynamicMaskRuntimeEnabled.ToString().ToLowerInvariant()
            + " dynamicMaskValid=" + dynamicMaskState.DynamicMaskValid.ToString().ToLowerInvariant()
            + " staticFallbackUsed=" + (!FoundationDynamicMaskRuntimeEnabled || dynamicMaskState.StaticFallbackUsed).ToString().ToLowerInvariant()
            + " faceTracked=" + dynamicMaskState.FaceTracked.ToString().ToLowerInvariant()
            + " dynamicMaskAverage=" + dynamicMaskState.MaskAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " dynamicMaskMax=" + dynamicMaskState.MaskMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " dynamicMaskAgeMs=" + dynamicMaskState.AgeMs.ToString(CultureInfo.InvariantCulture)
            + " dynamicMaskStatus=" + SanitizeDiagnosticValue(dynamicMaskState.Status)
            + " eyeExclusionApplied=true"
            + " browExclusionApplied=true"
            + " mouthExclusionApplied=true"
            + " foreheadFalloffApplied=true"
            + " edgeFeatherApplied=true"
            + " foundationLayerOrder=0"
            + " material=" + (material != null ? SanitizeDiagnosticValue(material.name) : "none")
            + " shader=" + (material != null && material.shader != null ? SanitizeDiagnosticValue(material.shader.name) : "none")
            + " hasFoundationMode=" + HasMaterialProperty(material, "_FoundationMode").ToString().ToLowerInvariant()
            + " foundationMode=" + GetMaterialFloatForLog(material, "_FoundationMode")
            + " pigmentMultiply=" + GetMaterialFloatForLog(material, "_PigmentMultiply")
            + " srcBlend=" + GetMaterialFloatForLog(material, "_SrcBlend")
            + " dstBlend=" + GetMaterialFloatForLog(material, "_DstBlend")
            + " opacity=" + recipe.Opacity.ToString("0.###", CultureInfo.InvariantCulture)
            + " materialOpacity=" + materialColor.a.ToString("0.###", CultureInfo.InvariantCulture)
            + " foundationMaterialOpacity=" + materialColor.a.ToString("0.###", CultureInfo.InvariantCulture)
            + " intensity=" + recipe.Intensity.ToString("0.###", CultureInfo.InvariantCulture)
            + " coverage=" + recipe.Coverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " evenness=" + recipe.GlossBoost.ToString("0.###", CultureInfo.InvariantCulture)
            + " luminanceInfluence=" + recipe.Roughness.ToString("0.###", CultureInfo.InvariantCulture)
            + " foundationIntensity=" + GetMaterialFloatForLog(material, "_FoundationIntensity")
            + " foundationEvenness=" + GetMaterialFloatForLog(material, "_FoundationEvenness")
            + " foundationLuminanceInfluence=" + GetMaterialFloatForLog(material, "_FoundationLuminanceInfluence")
            + " foundationVisibleBoost=" + GetMaterialFloatForLog(material, "_FoundationVisibleBoost")
            + " foundationEffectiveAmount=" + foundationEffectiveAmount.ToString("0.###", CultureInfo.InvariantCulture)
            + " foundationChromaDelta=" + chromaDelta.ToString("0.###", CultureInfo.InvariantCulture)
            + " foundationLumDelta=" + lumDelta.ToString("0.###", CultureInfo.InvariantCulture)
            + " foundationGlowAmount=" + GetMaterialFloatForLog(material, "_FoundationGlowAmount")
            + " foundationMaxLumShift=" + GetMaterialFloatForLog(material, "_FoundationMaxLumShift")
            + " foundationExclusionEnabled=" + GetMaterialFloatForLog(material, "_FoundationExclusionEnabled")
            + " foundationDebugMode=" + GetMaterialFloatForLog(material, "_FoundationDebugMode")
            + " legacyDebugMaskMode=" + GetMaterialFloatForLog(material, "_DebugMaskMode")
            + " foundationEyeFeather=" + GetMaterialFloatForLog(material, "_FoundationEyeFeather")
            + " foundationBrowFeather=" + GetMaterialFloatForLog(material, "_FoundationBrowFeather")
            + " foundationMouthFeather=" + GetMaterialFloatForLog(material, "_FoundationMouthFeather")
            + " foundationUpperForeheadStart=" + GetMaterialFloatForLog(material, "_FoundationUpperForeheadStart")
            + " foundationUpperForeheadEnd=" + GetMaterialFloatForLog(material, "_FoundationUpperForeheadEnd")
            + " foundationOuterFalloffStrength=" + GetMaterialFloatForLog(material, "_FoundationOuterFalloffStrength")
            + " foundationMaskBoostForDebug=" + GetMaterialFloatForLog(material, "_FoundationMaskBoostForDebug")
            + " foundationBlendPath=" + foundationBlendPath
            + " foundationShaderPropertiesApplied=" + shaderPropertiesApplied.ToString().ToLowerInvariant()
            + " color=#" + ColorUtility.ToHtmlStringRGB(recipe.Color)
            + " skinBase=#" + ColorUtility.ToHtmlStringRGB(recipe.SecondaryColor)
            + " blendMode=" + recipe.BlendMode;
        Debug.Log(diagnosticMessage);
        PersistFoundationDiagnostics(diagnosticMessage);
    }

    private static void PersistFoundationDiagnostics(string diagnosticMessage)
    {
        try
        {
            string directory = Path.Combine(Application.persistentDataPath, "e7-runtime-events");
            Directory.CreateDirectory(directory);
            File.WriteAllText(
                Path.Combine(directory, "foundation_material_diagnostics.latest.log"),
                diagnosticMessage);
            File.AppendAllText(
                Path.Combine(directory, "foundation_material_diagnostics.jsonl"),
                diagnosticMessage + Environment.NewLine);
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[E7] foundation_material_diagnostics_persist_failed error="
                + exception.Message);
        }
    }

    private static bool HasMaterialProperty(Material material, string propertyName)
    {
        return material != null && material.HasProperty(propertyName);
    }

    private static string GetMaterialFloatForLog(Material material, string propertyName)
    {
        if (material == null || !material.HasProperty(propertyName))
        {
            return "missing";
        }

        return material.GetFloat(propertyName).ToString("0.###", CultureInfo.InvariantCulture);
    }

    private static float CalculateFoundationChromaDelta(Color skinBase, Color foundation)
    {
        Color.RGBToHSV(skinBase, out float skinHue, out float skinSaturation, out float skinValue);
        Color.RGBToHSV(foundation, out float foundationHue, out float foundationSaturation, out float foundationValue);
        float hueDelta = Mathf.Abs(foundationHue - skinHue);
        hueDelta = Mathf.Min(hueDelta, 1.0f - hueDelta);
        float saturationDelta = foundationSaturation - skinSaturation;
        return Mathf.Sqrt(hueDelta * hueDelta + saturationDelta * saturationDelta);
    }

    private static float CalculateFoundationLuminanceDelta(Color skinBase, Color foundation)
    {
        return CalculateFoundationLuminance(foundation) - CalculateFoundationLuminance(skinBase);
    }

    private static float CalculateFoundationLuminance(Color color)
    {
        return color.r * 0.299f + color.g * 0.587f + color.b * 0.114f;
    }

    private static bool IsFoundationRegion(string region)
    {
        return region == "foundation" || region == "base";
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
            case "foundation_natural":
            case "foundation_matte":
            case "foundation_glow":
                sampleAlphaScale = Mathf.Lerp(0.56f, 0.74f, recipe.Intensity);
                brightnessScale = 1.0f;
                break;
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

        if (recipe.Region == "eyeliner" && recipe.TextureSample != "shimmer_eye")
        {
            // A drawn liner needs near-opaque pigment: the generic 0.52-0.76
            // scale (times the mask strength) leaves it a translucent gray
            // smudge on device instead of a defined line.
            sampleAlphaScale = Mathf.Lerp(0.74f, 0.96f, recipe.Intensity);
            brightnessScale = 0.9f;
        }

        float materialAlpha = Mathf.Clamp01(recipe.Opacity * sampleAlphaScale);
        if (IsFoundationRegion(recipe.Region) && recipe.Enabled && recipe.Opacity > 0.0f)
        {
            materialAlpha = Mathf.Clamp(materialAlpha, 0.30f, 0.55f);
        }

        return new Color(
            Mathf.Clamp01(recipe.Color.r * brightnessScale),
            Mathf.Clamp01(recipe.Color.g * brightnessScale),
            Mathf.Clamp01(recipe.Color.b * brightnessScale),
            materialAlpha);
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

    private static void ApplyMaterialBlendMode(
        Material material,
        string blendMode,
        bool cheekBlushMask,
        bool foundationRegion)
    {
        if (material == null)
        {
            return;
        }

        BlendMode sourceBlend = BlendMode.SrcAlpha;
        BlendMode destinationBlend = BlendMode.OneMinusSrcAlpha;

        string normalizedBlendMode = NormalizeBlendMode(blendMode);
        switch (normalizedBlendMode)
        {
            case "multiply":
                if (!foundationRegion)
                {
                    sourceBlend = BlendMode.DstColor;
                    destinationBlend = BlendMode.Zero;
                }
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
                normalizedBlendMode == "multiply" && !foundationRegion ? 1.0f : 0.0f);
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

            if (IsFoundationRegion(region)
                && faceState.Regions.TryGetValue(FoundationNeckViewKey, out RegionOverlayView neckView))
            {
                SetViewVisibility(neckView, false);
            }
        }
    }

    private void UpdateFoundationNeckOverlay(
        ARFace face,
        FaceOverlayState faceState,
        RegionRecipeState recipe,
        TrackingVisibility visibility,
        bool faceMeshApplied)
    {
        RegionOverlayView neckView = EnsureRegionOverlayView(face.transform, faceState, FoundationNeckViewKey);
        if (!faceMeshApplied || recipe == null || !recipe.Enabled)
        {
            SetViewVisibility(neckView, false);
            return;
        }

        ApplyRecipeAppearance(neckView, recipe);
        Material material = neckView.MeshRenderer != null ? neckView.MeshRenderer.sharedMaterial : null;
        Texture2D gradient = GetFoundationNeckGradientTexture();
        if (material == null || gradient == null)
        {
            SetViewVisibility(neckView, false);
            return;
        }

        // The neck strip uses its own gradient mask (white at the jaw fading
        // to transparent at the bottom) and the same generic region tint path
        // as the face foundation view, so the two blend into one continuous
        // foundation layer.
        material.SetTexture("_MaskTex", gradient);
        if (material.HasProperty("_GlossMaskTex"))
        {
            material.SetTexture("_GlossMaskTex", gradient);
        }

        ApplyFoundationGenericTintOverrides(material);
        ApplyFoundationSkinGate(material, face, true);
        ApplyViewAlphaMultiplier(neckView, visibility.AlphaMultiplier);
        ApplyHandOcclusionRect(neckView, recipe.Region, face);
        bool neckMeshBuilt = TryBuildFoundationNeckMesh(face, neckView.Mesh);
        SetViewVisibility(neckView, neckMeshBuilt);
    }

    private static void ApplyFoundationGenericTintOverrides(Material material)
    {
        if (material == null)
        {
            return;
        }

        if (material.HasProperty("_FoundationMode"))
        {
            material.SetFloat("_FoundationMode", 0.0f);
        }

        if (material.HasProperty("_FoundationExclusionEnabled"))
        {
            material.SetFloat("_FoundationExclusionEnabled", 0.0f);
        }

        if (material.HasProperty("_UseScreenSpaceMask"))
        {
            material.SetFloat("_UseScreenSpaceMask", 0.0f);
        }

        if (material.HasProperty("_Threshold"))
        {
            // 0.45 (was 0.02): verified in simulation — with the permissive
            // 0.02 threshold, SampleMaskSoft's bleed into the lip/eye holes
            // was amplified to a 0.74-0.88 alpha ring INSIDE the lips. At
            // 0.45/0.12 the ring measures 0.00 while the philtrum and face
            // interior stay at 1.00 and the hairline fade tightens.
            material.SetFloat("_Threshold", 0.45f);
        }

        if (material.HasProperty("_Feather"))
        {
            // Small feather: SampleMaskSoft's blur radius scales with this
            // value, and at 0.35 the soft sampling bled a visible ring into
            // the lip/eye holes of the mask (no re-subtraction exists in this
            // path). 0.12 keeps edges soft while the holes stay clean.
            material.SetFloat("_Feather", 0.12f);
        }

        // The additive gloss pass is lip-oriented highlight math; on a
        // full-face foundation wash it reads as an artificial sheen.
        if (material.HasProperty("_GlossBoost"))
        {
            material.SetFloat("_GlossBoost", 0.0f);
        }

        if (material.HasProperty("_Specular"))
        {
            material.SetFloat("_Specular", 0.0f);
        }
    }

    private static bool TryBuildFoundationNeckMesh(ARFace face, Mesh mesh)
    {
        if (face == null
            || mesh == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0)
        {
            return false;
        }

        var faceVertices = face.vertices;
        Vector3 localMin = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        Vector3 localMax = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        for (int i = 0; i < faceVertices.Length; i++)
        {
            localMin = Vector3.Min(localMin, faceVertices[i]);
            localMax = Vector3.Max(localMax, faceVertices[i]);
        }

        float faceWidth = localMax.x - localMin.x;
        float faceHeight = localMax.y - localMin.y;
        if (faceWidth < 0.01f || faceHeight < 0.01f)
        {
            return false;
        }

        // Jawline extraction: bucket vertices across X and keep the lowest-Y
        // vertex per bucket (restricted to the lower part of the face and the
        // central width so ear/temple boundary vertices are ignored).
        float[] lowestY = new float[FoundationNeckColumns];
        Vector3[] jawPoints = new Vector3[FoundationNeckColumns];
        bool[] hasJawPoint = new bool[FoundationNeckColumns];
        for (int i = 0; i < FoundationNeckColumns; i++)
        {
            lowestY[i] = float.PositiveInfinity;
        }

        float lowerFaceCutY = localMin.y + faceHeight * 0.45f;
        for (int i = 0; i < faceVertices.Length; i++)
        {
            Vector3 vertex = faceVertices[i];
            if (vertex.y > lowerFaceCutY)
            {
                continue;
            }

            float normalizedX = (vertex.x - localMin.x) / faceWidth;
            if (normalizedX < 0.06f || normalizedX > 0.94f)
            {
                continue;
            }

            int column = Mathf.Clamp(
                (int)(normalizedX * FoundationNeckColumns),
                0,
                FoundationNeckColumns - 1);
            if (vertex.y < lowestY[column])
            {
                lowestY[column] = vertex.y;
                jawPoints[column] = vertex;
                hasJawPoint[column] = true;
            }
        }

        List<Vector3> orderedJaw = new List<Vector3>(FoundationNeckColumns);
        for (int i = 0; i < FoundationNeckColumns; i++)
        {
            if (hasJawPoint[i])
            {
                orderedJaw.Add(jawPoints[i]);
            }
        }

        int jawColumnCount = orderedJaw.Count;
        if (jawColumnCount < FoundationNeckMinColumns)
        {
            return false;
        }

        // Smooth the jaw curve (two passes of neighbor averaging) so the
        // skirt edge follows the jawline without bucket-sampling zigzags.
        for (int pass = 0; pass < 2; pass++)
        {
            for (int i = 1; i + 1 < orderedJaw.Count; i++)
            {
                orderedJaw[i] =
                    (orderedJaw[i - 1] + orderedJaw[i] * 2.0f + orderedJaw[i + 1]) * 0.25f;
            }
        }

        float neckLength = faceHeight * FoundationNeckLengthFaceHeightFactor;
        // Small tuck: just enough to close the seam against the face mesh
        // without stacking a second tint band on top of the jawline.
        float tuck = neckLength * 0.02f;
        List<Vector3> vertices = new List<Vector3>(jawColumnCount * 2);
        List<Vector2> uvs = new List<Vector2>(jawColumnCount * 2);
        List<int> triangles = new List<int>((jawColumnCount - 1) * 6);
        for (int i = 0; i < jawColumnCount; i++)
        {
            Vector3 jaw = orderedJaw[i];
            float u = jawColumnCount > 1 ? i / (float)(jawColumnCount - 1) : 0.5f;
            Vector3 top = new Vector3(jaw.x, jaw.y + tuck, jaw.z);
            Vector3 bottom = new Vector3(
                jaw.x * FoundationNeckTaper,
                jaw.y - neckLength,
                jaw.z - FoundationNeckBackOffsetMeters);
            vertices.Add(top);
            uvs.Add(new Vector2(u, 0.98f));
            vertices.Add(bottom);
            uvs.Add(new Vector2(u, 0.02f));

            if (i > 0)
            {
                int topB = vertices.Count - 2;
                int bottomB = vertices.Count - 1;
                int topA = topB - 2;
                int bottomA = bottomB - 2;
                triangles.Add(topA);
                triangles.Add(topB);
                triangles.Add(bottomA);
                triangles.Add(bottomA);
                triangles.Add(topB);
                triangles.Add(bottomB);
            }
        }

        if (triangles.Count < 6)
        {
            return false;
        }

        mesh.Clear();
        mesh.SetVertices(vertices);
        mesh.SetUVs(0, uvs);
        mesh.SetTriangles(triangles, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return true;
    }

    private static float FoundationMaskSmooth01(float edge0, float edge1, float value)
    {
        float t = Mathf.Clamp01((value - edge0) / Mathf.Max(0.0001f, edge1 - edge0));
        return t * t * (3.0f - 2.0f * t);
    }

    private static float FoundationMaskEllipse(
        float u,
        float v,
        float centerU,
        float centerV,
        float radiusU,
        float radiusV,
        float feather)
    {
        float du = (u - centerU) / Mathf.Max(0.0001f, radiusU);
        float dv = (v - centerV) / Mathf.Max(0.0001f, radiusV);
        float distanceSq = du * du + dv * dv;
        return 1.0f - FoundationMaskSmooth01(1.0f, 1.0f + Mathf.Max(0.001f, feather), distanceSq);
    }

    // Measures where the eyes, brows and mouth actually sit in the face UV
    // layout by sampling the tracked mesh: vertices are classified into
    // anatomical zones using their normalized face-local position, and each
    // zone's UV statistics become the exclusion ellipse for the generated
    // mask. This removes hand-tuned UV constants and stays correct for every
    // person, since it is derived from the live mesh itself.
    private static void EnsureFoundationSkinMaskCalibration(ARFace face)
    {
        if (foundationSkinMaskCalibrated
            || face == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0
            || !face.uvs.IsCreated
            || face.uvs.Length < face.vertices.Length)
        {
            return;
        }

        var vertices = face.vertices;
        var uvs = face.uvs;
        Vector3 localMin = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        Vector3 localMax = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        for (int i = 0; i < vertices.Length; i++)
        {
            localMin = Vector3.Min(localMin, vertices[i]);
            localMax = Vector3.Max(localMax, vertices[i]);
        }

        if (localMax.x - localMin.x < 0.01f || localMax.y - localMin.y < 0.01f)
        {
            return;
        }

        Vector2 uvMin = new Vector2(float.PositiveInfinity, float.PositiveInfinity);
        Vector2 uvMax = new Vector2(float.NegativeInfinity, float.NegativeInfinity);
        Vector2[] zoneMin = new Vector2[5];
        Vector2[] zoneMax = new Vector2[5];
        Vector2[] zoneSum = new Vector2[5];
        int[] zoneCount = new int[5];
        for (int z = 0; z < 5; z++)
        {
            zoneMin[z] = new Vector2(float.PositiveInfinity, float.PositiveInfinity);
            zoneMax[z] = new Vector2(float.NegativeInfinity, float.NegativeInfinity);
        }

        for (int i = 0; i < vertices.Length; i++)
        {
            float nx = Mathf.InverseLerp(localMin.x, localMax.x, vertices[i].x);
            float ny = Mathf.InverseLerp(localMin.y, localMax.y, vertices[i].y);
            Vector2 uv = uvs[i];
            uvMin = Vector2.Min(uvMin, uv);
            uvMax = Vector2.Max(uvMax, uv);

            int zone = -1;
            if (nx >= 0.23f && nx <= 0.47f && ny >= 0.585f && ny <= 0.700f)
            {
                zone = 0; // left eye
            }
            else if (nx >= 0.53f && nx <= 0.77f && ny >= 0.585f && ny <= 0.700f)
            {
                zone = 1; // right eye
            }
            else if (nx >= 0.21f && nx <= 0.49f && ny >= 0.705f && ny <= 0.795f)
            {
                zone = 2; // left brow
            }
            else if (nx >= 0.51f && nx <= 0.79f && ny >= 0.705f && ny <= 0.795f)
            {
                zone = 3; // right brow
            }
            else if (nx >= 0.30f && nx <= 0.70f && ny >= 0.350f && ny <= 0.425f)
            {
                zone = 4; // mouth (lips only)
            }

            if (zone >= 0)
            {
                zoneMin[zone] = Vector2.Min(zoneMin[zone], uv);
                zoneMax[zone] = Vector2.Max(zoneMax[zone], uv);
                zoneSum[zone] += uv;
                zoneCount[zone]++;
            }
        }

        for (int z = 0; z < 5; z++)
        {
            if (zoneCount[z] < 8)
            {
                return; // mesh not fully usable yet; retry next frame
            }
        }

        // Eyes: eye opening plus a small safety margin. Brows: taller band so
        // brow hair is fully excluded (centers are measured from the mesh, so
        // widening the band does not eat under-brow skin). Mouth: lips only.
        // Device feedback 2026-07-05: exclusion must hug the eye opening —
        // the skin at the inner/outer corners (left/right of the eyes) gets
        // painted, only the opening itself stays clear.
        foundationCalLeftEye = BuildFoundationMaskZone(
            zoneMin[0], zoneMax[0], zoneSum[0], zoneCount[0], 0.46f, 0.44f, 0.021f, 0.014f);
        foundationCalRightEye = BuildFoundationMaskZone(
            zoneMin[1], zoneMax[1], zoneSum[1], zoneCount[1], 0.46f, 0.44f, 0.021f, 0.014f);
        foundationCalLeftBrow = BuildFoundationMaskZone(
            zoneMin[2], zoneMax[2], zoneSum[2], zoneCount[2], 0.58f, 0.44f, 0.048f, 0.016f);
        foundationCalRightBrow = BuildFoundationMaskZone(
            zoneMin[3], zoneMax[3], zoneSum[3], zoneCount[3], 0.58f, 0.44f, 0.048f, 0.016f);
        foundationCalMouth = BuildFoundationMaskZone(
            zoneMin[4], zoneMax[4], zoneSum[4], zoneCount[4], 0.82f, 0.42f, 0.105f, 0.018f);
        foundationCalUvMin = uvMin;
        foundationCalUvMax = uvMax;
        foundationSkinMaskCalibrated = true;

        if (foundationGeneratedSkinMaskTexture != null)
        {
            UnityEngine.Object.Destroy(foundationGeneratedSkinMaskTexture);
            foundationGeneratedSkinMaskTexture = null;
        }

        // Regenerate eyeliner shapes with the freshly measured eye zones.
        ClearGeneratedEyelinerMasks();

        Debug.Log(
            "[E7] foundation_skin_mask_calibrated"
            + " leftEye=" + FormatFoundationZone(foundationCalLeftEye)
            + " rightEye=" + FormatFoundationZone(foundationCalRightEye)
            + " leftBrow=" + FormatFoundationZone(foundationCalLeftBrow)
            + " rightBrow=" + FormatFoundationZone(foundationCalRightBrow)
            + " mouth=" + FormatFoundationZone(foundationCalMouth)
            + " uvMin=" + foundationCalUvMin.ToString("0.###")
            + " uvMax=" + foundationCalUvMax.ToString("0.###"));
    }

    private static FoundationMaskZone BuildFoundationMaskZone(
        Vector2 min,
        Vector2 max,
        Vector2 sum,
        int count,
        float radiusScaleU,
        float radiusScaleV,
        float minRadiusU,
        float minRadiusV)
    {
        Vector2 center = sum / Mathf.Max(1, count);
        Vector2 halfExtent = (max - min) * 0.5f;
        return new FoundationMaskZone
        {
            Center = center,
            Radius = new Vector2(
                Mathf.Max(minRadiusU, halfExtent.x * radiusScaleU),
                Mathf.Max(minRadiusV, halfExtent.y * radiusScaleV)),
            Valid = true
        };
    }

    private static string FormatFoundationZone(FoundationMaskZone zone)
    {
        return zone.Center.ToString("0.###") + "/" + zone.Radius.ToString("0.###");
    }

    private void EnsureSkinGateCameraFeed()
    {
        if (skinGateCameraManager != null)
        {
            return;
        }

        skinGateCameraManager = FindFirstObjectByType<ARCameraManager>();
        if (skinGateCameraManager != null)
        {
            skinGateCameraManager.frameReceived += OnSkinGateCameraFrame;
        }
    }

    private void OnDestroy()
    {
        if (skinGateCameraManager != null)
        {
            skinGateCameraManager.frameReceived -= OnSkinGateCameraFrame;
            skinGateCameraManager = null;
        }
    }

    private void OnSkinGateCameraFrame(ARCameraFrameEventArgs eventArgs)
    {
        if (eventArgs.textures == null
            || eventArgs.propertyNameIds == null
            || eventArgs.textures.Count == 0
            || eventArgs.propertyNameIds.Count == 0)
        {
            skinGateCameraTextureMode = 0;
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
            if (propertyId == SkinGateSourceTextureYId)
            {
                skinGateTextureY = texture;
                hasTextureY = true;
            }
            else if (propertyId == SkinGateSourceTextureCbCrId)
            {
                skinGateTextureCbCr = texture;
                hasTextureCbCr = true;
            }

            if (firstTexture == null)
            {
                firstTexture = texture;
            }
        }

        if (eventArgs.displayMatrix.HasValue)
        {
            skinGateDisplayTransform = eventArgs.displayMatrix.Value;
        }

        if (hasTextureY && hasTextureCbCr)
        {
            skinGateCameraTextureMode = 2;
        }
        else if (firstTexture != null)
        {
            skinGateTextureRgb = firstTexture;
            skinGateCameraTextureMode = 1;
        }
        else
        {
            skinGateCameraTextureMode = 0;
            return;
        }

        skinGateLastTextureAt = Time.realtimeSinceStartup;
    }

    private void ApplyFoundationSkinGate(Material material, ARFace face, bool isNeck)
    {
        if (material == null || !material.HasProperty("_SkinGateEnabled"))
        {
            return;
        }

        // Fail-safe configuration must be present even when the gate cannot
        // run (camera stale / anchors invalid): the shader then fades the
        // hairline/side zones instead of failing open onto hair.
        if (material.HasProperty("_SkinGateFailSafe"))
        {
            material.SetFloat("_SkinGateFailSafe", 1.0f);
        }

        material.SetVector("_SkinGateUvRect", isNeck
            ? new Vector4(-1.0f, 2.0f, 3.0f, 0.0f)
            : new Vector4(foundationCalUvMin.x, foundationCalUvMax.x, foundationCalUvMax.y, 0.0f));

        EnsureSkinGateCameraFeed();
        Camera arCamera = Camera.main;
        bool cameraFresh = skinGateCameraTextureMode > 0
            && Time.realtimeSinceStartup - skinGateLastTextureAt <= 0.5f;
        if (!cameraFresh || face == null || arCamera == null)
        {
            material.SetFloat("_SkinGateEnabled", 0.0f);
            return;
        }

        UpdateSkinGateReferenceAnchors(face, arCamera);
        if (skinGateSmoothedRefA.z < 0.5f
            && skinGateSmoothedRefB.z < 0.5f
            && skinGateSmoothedRefC.z < 0.5f)
        {
            material.SetFloat("_SkinGateEnabled", 0.0f);
            return;
        }

        material.SetFloat("_SkinGateEnabled", 1.0f);
        material.SetFloat("_SkinGateStrength", 0.85f);
        material.SetFloat("_SkinGateCenterWeight", isNeck ? 1.0f : 0.30f);
        material.SetFloat("_SkinGateTolerance", 0.13f);
        material.SetFloat("_SkinGateCameraMode", skinGateCameraTextureMode);
        material.SetMatrix("_SkinGateDisplayTransform", skinGateDisplayTransform);
        if (skinGateCameraTextureMode == 2)
        {
            if (skinGateTextureY != null)
            {
                material.SetTexture("_SkinGateTexY", skinGateTextureY);
            }

            if (skinGateTextureCbCr != null)
            {
                material.SetTexture("_SkinGateTexCbCr", skinGateTextureCbCr);
            }
        }
        else if (skinGateTextureRgb != null)
        {
            material.SetTexture("_SkinGateCameraTex", skinGateTextureRgb);
        }

        material.SetVector("_SkinGateRefA", skinGateSmoothedRefA);
        material.SetVector("_SkinGateRefB", skinGateSmoothedRefB);
        material.SetVector("_SkinGateRefC", skinGateSmoothedRefC);
        // The neck strip uses synthetic UVs, so no UV-edge zones apply there;
        // its gate runs at full weight via _SkinGateCenterWeight = 1.
        material.SetVector("_SkinGateUvRect", isNeck
            ? new Vector4(-1.0f, 2.0f, 3.0f, 0.0f)
            : new Vector4(foundationCalUvMin.x, foundationCalUvMax.x, foundationCalUvMax.y, 0.0f));
    }

    private void UpdateSkinGateReferenceAnchors(ARFace face, Camera arCamera)
    {
        if (face == null
            || arCamera == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0)
        {
            skinGateSmoothedRefA.z = 0.0f;
            skinGateSmoothedRefB.z = 0.0f;
            skinGateSmoothedRefC.z = 0.0f;
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

        // Stable skin sample points in normalized face-local space:
        // left cheek, right cheek, chin center (near the surface, z high).
        Vector4 anchorA = ProjectSkinGateAnchor(face, arCamera, localMin, localMax, new Vector3(0.30f, 0.52f, 0.80f));
        Vector4 anchorB = ProjectSkinGateAnchor(face, arCamera, localMin, localMax, new Vector3(0.70f, 0.52f, 0.80f));
        Vector4 anchorC = ProjectSkinGateAnchor(face, arCamera, localMin, localMax, new Vector3(0.50f, 0.16f, 0.90f));
        skinGateSmoothedRefA = SmoothSkinGateAnchor(skinGateSmoothedRefA, anchorA);
        skinGateSmoothedRefB = SmoothSkinGateAnchor(skinGateSmoothedRefB, anchorB);
        skinGateSmoothedRefC = SmoothSkinGateAnchor(skinGateSmoothedRefC, anchorC);
    }

    private static Vector4 ProjectSkinGateAnchor(
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

    private static Vector4 SmoothSkinGateAnchor(Vector4 previous, Vector4 current)
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

    /// <summary>
    /// Shared access for the semantic foundation pipeline: runs the per-face
    /// UV calibration when possible and returns the calibrated canonical-UV
    /// skin mask (eyes/brows/lips excluded, hairline faded).
    /// </summary>
    private static UnityEngine.XR.ARSubsystems.TrackableId foundationCalibrationFaceId =
        UnityEngine.XR.ARSubsystems.TrackableId.invalidId;

    public static Texture2D GetSharedFoundationSkinMask(ARFace face)
    {
        if (face != null)
        {
            // Per-person calibration: when a DIFFERENT face is tracked
            // (new trackable id — e.g. handing the phone to someone else),
            // drop the cached calibration and generated mask so the zones
            // are re-measured from the new person's mesh.
            if (face.trackableId != foundationCalibrationFaceId)
            {
                foundationCalibrationFaceId = face.trackableId;
                if (foundationSkinMaskCalibrated)
                {
                    foundationSkinMaskCalibrated = false;
                    if (foundationGeneratedSkinMaskTexture != null)
                    {
                        UnityEngine.Object.Destroy(foundationGeneratedSkinMaskTexture);
                        foundationGeneratedSkinMaskTexture = null;
                    }

                    // Eyeliner shapes are built from the same measured eye
                    // zones — regenerate them for the new person too.
                    ClearGeneratedEyelinerMasks();
                    Debug.Log("[E7] foundation_skin_mask_recalibrating reason=new_face");
                }
            }

            EnsureFoundationSkinMaskCalibration(face);
        }

        return GetFoundationSkinMaskTexture();
    }

    private static float FoundationMaskZoneEllipse(float u, float v, FoundationMaskZone zone, float feather)
    {
        if (!zone.Valid)
        {
            return 0.0f;
        }

        return FoundationMaskEllipse(
            u, v, zone.Center.x, zone.Center.y, zone.Radius.x, zone.Radius.y, feather);
    }

    // ---- Generated eyeliner shape masks -----------------------------------
    // Parametric eyeliner drawn in canonical face-UV space from the SAME
    // measured per-person eye zones used by the foundation exclusions, so
    // every shape hugs THIS user's lash line (no static PNG misalignment).
    // Styles follow the reference chart (v2 model: quadratic thickness
    // profile along the lid, bezier wing, optional inner-corner extension
    // and lower lash band):
    //   e7-eyeliner-gen-cat-v2     : thin line, short steep upward-curled flick
    //   e7-eyeliner-gen-puppy-v2   : soft tail following the eye down-out
    //   e7-eyeliner-gen-sexy-v2    : long near-horizontal wing + inner-corner point
    //   e7-eyeliner-gen-winged-v2  : bold filled triangular wing, crisp edges
    //   e7-eyeliner-gen-colored-v2 : soft basic line (identity carried by color)
    //   e7-eyeliner-gen-doll-v2    : centre-heavy soft line + under-eye shading
    private static readonly Dictionary<string, Texture2D> GeneratedEyelinerMaskTextures =
        new Dictionary<string, Texture2D>();

    // The calibrated eye zone is a foundation-EXCLUSION ellipse padded past
    // the eye opening, so its top edge sits above the real lash line. This
    // scales the vertical radius of the drawn lid curve down to pull the
    // liner onto the lashes. Tune on device if the line still floats.
    private const float EyelinerLidBias = 0.90f;

    private static bool IsGeneratedEyelinerMaskTextureId(string maskTextureId)
    {
        return !string.IsNullOrWhiteSpace(maskTextureId)
            && maskTextureId.StartsWith("e7-eyeliner-gen-", StringComparison.Ordinal);
    }

    private static void ClearGeneratedEyelinerMasks()
    {
        foreach (KeyValuePair<string, Texture2D> entry in GeneratedEyelinerMaskTextures)
        {
            if (entry.Value != null)
            {
                UnityEngine.Object.Destroy(entry.Value);
            }
        }

        GeneratedEyelinerMaskTextures.Clear();
    }

    // Per-style shape parameters. All lengths/thicknesses are face-UV units
    // (eye zone is roughly rx=0.074, ry=0.032); angles are degrees where
    // positive lifts the wing upward (+v is UP the face in this UV space).
    private struct EyelinerStyleParams
    {
        // Upper lash band (3-point quadratic thickness profile inner->outer).
        public float InnerStart;          // t where the band begins (-1 inner corner .. +1 outer)
        public float InnerThickness;
        public float MidThickness;
        public float OuterThickness;
        public float BandSoftness;

        // Wing: quadratic bezier from the outer corner.
        public float WingLength;
        public float WingAngleDeg;        // chord angle; + = upward flick, - = droopy
        public float WingCurl;            // perpendicular bow of the bezier; + = curls upward
        public float WingRootThickness;   // half-width at the root, tapers to a point
        public float WingSoftness;

        // Inner-corner (front-of-eye) extension; 0 length disables.
        public float InnerExtLength;
        public float InnerExtThickness;
        public float InnerExtDropDeg;     // + drops the point below horizontal

        // Lower lash band (under-eye shading); LowerEnd <= LowerStart disables.
        public float LowerStart;
        public float LowerEnd;
        public float LowerThickness;
        public float LowerSoftness;
        public float LowerOpacity;
    }

    // Geometry precomputed once per eye per texture so the per-pixel loop
    // only does cheap distance tests inside a bounding box.
    private struct EyelinerEyeGeometry
    {
        public bool Valid;
        public Vector2 Center;
        public float Rx;
        public float Ry;
        public float OuterSign;
        public Vector2[] WingPoints;
        public float[] WingHalfWidths;
        public Vector2 InnerExtA;
        public Vector2 InnerExtB;
        public Vector2 BoundsMin;
        public Vector2 BoundsMax;
    }

    private static EyelinerStyleParams GetEyelinerStyleParams(string maskTextureId)
    {
        EyelinerStyleParams style = new EyelinerStyleParams
        {
            // Colored: soft basic lash line with a small tail; the style's
            // identity is carried by its burgundy default color on the RN
            // side. Also the graceful fallback for stale/unknown gen ids.
            InnerStart = -0.90f,
            InnerThickness = 0.006f,
            MidThickness = 0.010f,
            OuterThickness = 0.012f,
            BandSoftness = 0.0055f,
            WingLength = 0.028f,
            WingAngleDeg = 18.0f,
            WingCurl = 0.08f,
            WingRootThickness = 0.0045f,
            WingSoftness = 0.0055f
        };

        switch (maskTextureId)
        {
            case "e7-eyeliner-gen-cat-v2":
                // Thin sleek line, short steep flick curling upward.
                style.InnerStart = -0.95f;
                style.InnerThickness = 0.004f;
                style.MidThickness = 0.007f;
                style.OuterThickness = 0.011f;
                style.BandSoftness = 0.0035f;
                style.WingLength = 0.042f;
                style.WingAngleDeg = 52.0f;
                style.WingCurl = 0.22f;
                style.WingRootThickness = 0.0045f;
                style.WingSoftness = 0.0035f;
                break;
            case "e7-eyeliner-gen-puppy-v2":
                // Soft medium band, tail follows the eye down-and-out.
                style.InnerStart = -0.90f;
                style.InnerThickness = 0.006f;
                style.MidThickness = 0.010f;
                style.OuterThickness = 0.014f;
                style.BandSoftness = 0.0065f;
                style.WingLength = 0.048f;
                style.WingAngleDeg = -22.0f;
                style.WingCurl = -0.12f;
                style.WingRootThickness = 0.006f;
                style.WingSoftness = 0.0065f;
                break;
            case "e7-eyeliner-gen-sexy-v2":
                // Horizontal elongation: long near-flat wing plus a pointed
                // inner-corner extension toward the nose.
                style.InnerStart = -1.00f;
                style.InnerThickness = 0.005f;
                style.MidThickness = 0.009f;
                style.OuterThickness = 0.017f;
                style.BandSoftness = 0.0040f;
                style.WingLength = 0.085f;
                style.WingAngleDeg = 8.0f;
                style.WingCurl = 0.06f;
                style.WingRootThickness = 0.0075f;
                style.WingSoftness = 0.0040f;
                style.InnerExtLength = 0.022f;
                style.InnerExtThickness = 0.0055f;
                style.InnerExtDropDeg = 8.0f;
                break;
            case "e7-eyeliner-gen-winged-v2":
                // Bold filled triangle: strongest outer growth, thick wing
                // root, crispest edges.
                style.InnerStart = -0.95f;
                style.InnerThickness = 0.005f;
                style.MidThickness = 0.010f;
                style.OuterThickness = 0.021f;
                style.BandSoftness = 0.0028f;
                style.WingLength = 0.062f;
                style.WingAngleDeg = 30.0f;
                style.WingCurl = 0.10f;
                style.WingRootThickness = 0.010f;
                style.WingSoftness = 0.0028f;
                break;
            case "e7-eyeliner-gen-doll-v2":
                // Centre-heavy profile rounds the eye; softest edges plus an
                // under-eye shading band on the lower lash line.
                style.InnerStart = -0.90f;
                style.InnerThickness = 0.007f;
                style.MidThickness = 0.015f;
                style.OuterThickness = 0.010f;
                style.BandSoftness = 0.0090f;
                style.WingLength = 0.018f;
                style.WingAngleDeg = 8.0f;
                style.WingCurl = 0.0f;
                style.WingRootThickness = 0.0035f;
                style.WingSoftness = 0.0090f;
                style.LowerStart = 0.0f;
                style.LowerEnd = 1.05f;
                style.LowerThickness = 0.0075f;
                style.LowerSoftness = 0.0110f;
                style.LowerOpacity = 0.55f;
                break;
            case "e7-eyeliner-gen-colored-v2":
            default:
                break;
        }

        return style;
    }

    private static EyelinerEyeGeometry BuildEyelinerEyeGeometry(
        FoundationMaskZone eye, float outerSign, EyelinerStyleParams style)
    {
        EyelinerEyeGeometry geo = default;
        if (!eye.Valid)
        {
            return geo;
        }

        geo.Valid = true;
        geo.Center = eye.Center;
        geo.Rx = Mathf.Max(eye.Radius.x, 0.02f);
        geo.Ry = Mathf.Max(eye.Radius.y, 0.012f);
        geo.OuterSign = outerSign;

        // Wing bezier -> short polyline with per-point half-widths. The x
        // component mirrors with outerSign; the curl perpendicular keeps its
        // vertical sense so both wings bow the same way (up or down). The
        // root sits centred in the band at the outer corner (lid height at
        // t=0.97 plus half the band thickness) so the wing grows out of the
        // lash line instead of sagging below it.
        const int wingSamples = 11;
        // Root on the band centreline (the band straddles the lid curve).
        float lidAtCorner =
            geo.Center.y + geo.Ry * EyelinerLidBias * 0.2431f; // sqrt(1 - 0.97^2)
        Vector2 wingRoot = new Vector2(
            geo.Center.x + outerSign * geo.Rx * 0.97f,
            lidAtCorner);
        float theta = style.WingAngleDeg * Mathf.Deg2Rad;
        Vector2 chord = new Vector2(outerSign * Mathf.Cos(theta), Mathf.Sin(theta));
        Vector2 wingTip = wingRoot + style.WingLength * chord;
        Vector2 curlPerp = new Vector2(-outerSign * Mathf.Sin(theta), Mathf.Cos(theta));
        Vector2 wingControl =
            (wingRoot + wingTip) * 0.5f + style.WingCurl * style.WingLength * curlPerp;
        geo.WingPoints = new Vector2[wingSamples];
        geo.WingHalfWidths = new float[wingSamples];
        for (int i = 0; i < wingSamples; i++)
        {
            float s = i / (float)(wingSamples - 1);
            float inv = 1.0f - s;
            geo.WingPoints[i] =
                inv * inv * wingRoot + 2.0f * inv * s * wingControl + s * s * wingTip;
            geo.WingHalfWidths[i] = Mathf.Lerp(
                style.WingRootThickness, 0.0012f, Mathf.Pow(s, 1.2f));
        }

        // Inner-corner extension segment (tapered toward the nose).
        if (style.InnerExtLength > 0.0f)
        {
            float phi = style.InnerExtDropDeg * Mathf.Deg2Rad;
            geo.InnerExtA = new Vector2(
                geo.Center.x - outerSign * geo.Rx * 0.96f,
                geo.Center.y + geo.Ry * 0.10f);
            geo.InnerExtB = geo.InnerExtA + style.InnerExtLength * new Vector2(
                -outerSign * Mathf.Cos(phi), -Mathf.Sin(phi));
        }

        // Early-out bounds: eye ellipse + wing + inner extension, padded by
        // the largest thickness and softness in play.
        float margin = 0.004f
            + Mathf.Max(Mathf.Max(style.BandSoftness, style.WingSoftness), style.LowerSoftness)
            + Mathf.Max(
                Mathf.Max(style.OuterThickness, style.MidThickness),
                Mathf.Max(style.WingRootThickness, style.LowerThickness));
        Vector2 min = new Vector2(geo.Center.x - geo.Rx * 1.1f, geo.Center.y - geo.Ry * 1.1f);
        Vector2 max = new Vector2(geo.Center.x + geo.Rx * 1.1f, geo.Center.y + geo.Ry * 1.1f);
        for (int i = 0; i < wingSamples; i++)
        {
            min = Vector2.Min(min, geo.WingPoints[i]);
            max = Vector2.Max(max, geo.WingPoints[i]);
        }

        if (style.InnerExtLength > 0.0f)
        {
            min = Vector2.Min(min, Vector2.Min(geo.InnerExtA, geo.InnerExtB));
            max = Vector2.Max(max, Vector2.Max(geo.InnerExtA, geo.InnerExtB));
        }

        geo.BoundsMin = min - new Vector2(margin, margin);
        geo.BoundsMax = max + new Vector2(margin, margin);
        return geo;
    }

    // Shared by the runtime texture cache and the editor PNG exporter (a
    // separate assembly, hence public), so parameter tuning can be inspected
    // offline against the reference photo.
    public static Color32[] RasterizeEyelinerMask(string maskTextureId, int size)
    {
        EyelinerStyleParams style = GetEyelinerStyleParams(maskTextureId);
        EyelinerEyeGeometry leftGeo =
            BuildEyelinerEyeGeometry(foundationCalLeftEye, -1.0f, style);
        EyelinerEyeGeometry rightGeo =
            BuildEyelinerEyeGeometry(foundationCalRightEye, 1.0f, style);

        Color32[] pixels = new Color32[size * size];
        for (int y = 0; y < size; y++)
        {
            float v = (y + 0.5f) / size;
            int row = y * size;
            for (int x = 0; x < size; x++)
            {
                float u = (x + 0.5f) / size;
                float weight = Mathf.Max(
                    EvaluateEyelinerWeight(u, v, leftGeo, style),
                    EvaluateEyelinerWeight(u, v, rightGeo, style));
                byte value = (byte)Mathf.RoundToInt(Mathf.Clamp01(weight) * 255.0f);
                pixels[row + x] = new Color32(value, 0, value, value);
            }
        }

        return pixels;
    }

    private static Texture2D GetGeneratedEyelinerMaskTexture(string maskTextureId)
    {
        if (GeneratedEyelinerMaskTextures.TryGetValue(maskTextureId, out Texture2D cached)
            && cached != null)
        {
            return cached;
        }

        // 512 keeps thin curved lines from aliasing (a 0.010-UV line is only
        // ~2.5px at 256). One-time cost per style; cache is cleared whenever
        // the eye zones are (re)calibrated.
        const int size = 512;
        Texture2D texture = new Texture2D(size, size, TextureFormat.RGBA32, false)
        {
            name = "Generated Eyeliner " + maskTextureId,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear
        };
        texture.SetPixels32(RasterizeEyelinerMask(maskTextureId, size));
        texture.Apply(false, true);
        GeneratedEyelinerMaskTextures[maskTextureId] = texture;
        Debug.Log(
            "[E7] generated_eyeliner_mask_created id=" + maskTextureId
            + " calibrated=" + foundationSkinMaskCalibrated.ToString().ToLowerInvariant());
        return texture;
    }

    private static float EvaluateEyelinerWeight(
        float u, float v, in EyelinerEyeGeometry geo, in EyelinerStyleParams style)
    {
        if (!geo.Valid
            || u < geo.BoundsMin.x || u > geo.BoundsMax.x
            || v < geo.BoundsMin.y || v > geo.BoundsMax.y)
        {
            return 0.0f;
        }

        // Eye-local coordinate: t=+1 is always the OUTER corner regardless
        // of which eye, so every shape mirrors automatically.
        float t = (u - geo.Center.x) / geo.Rx * geo.OuterSign;
        float bandSoft = Mathf.Max(style.BandSoftness, 1e-4f);
        float weight = 0.0f;

        // Upper lash band along the lid curve, thickness following a
        // quadratic profile that passes through MidThickness at eye centre.
        // The lid ellipse turns vertical at |t|=1, which would smear a spike
        // below the corner, so the curve height is clamped at |t|=0.97 (the
        // wing root) and the band stops at the corner itself.
        if (t > style.InnerStart && t < 1.0f)
        {
            float clamped = Mathf.Clamp(t, -0.97f, 0.97f);
            float lid = geo.Center.y
                + geo.Ry * EyelinerLidBias
                    * Mathf.Sqrt(Mathf.Max(0.0f, 1.0f - clamped * clamped));
            float s = Mathf.Clamp01((t + 1.0f) * 0.5f);
            float midControl =
                (4.0f * style.MidThickness - style.InnerThickness - style.OuterThickness) * 0.5f;
            float inv = 1.0f - s;
            float bandThickness = Mathf.Max(
                inv * inv * style.InnerThickness
                    + 2.0f * inv * s * midControl
                    + s * s * style.OuterThickness,
                0.0f);
            // Straddle the lash line instead of growing up from it: the face
            // mesh has a hole for the eye opening, so the lower half of the
            // band is clipped at render time and the visible line hugs the
            // lashes (like a real liner) rather than floating on the lid.
            float bandTop = lid + bandThickness * 0.45f;
            float bandBottom = lid - bandThickness * 0.55f;
            float distance = v > bandTop
                ? v - bandTop
                : (v < bandBottom ? bandBottom - v : 0.0f);
            // Outer fade is short: the wing root takes over right at the
            // corner, so a long fade would gray the line before the flick.
            float innerFade = Mathf.Clamp01((t - style.InnerStart) / 0.25f);
            float outerFade = Mathf.Clamp01((1.0f - t) / 0.05f);
            weight = Mathf.Clamp01(1.0f - distance / bandSoft) * innerFade * outerFade;
        }

        // Wing: signed distance to the precomputed bezier polyline with a
        // tapered half-width, so the tip ends in a point.
        if (geo.WingPoints != null && geo.WingPoints.Length > 1)
        {
            Vector2 point = new Vector2(u, v);
            float wingSoft = Mathf.Max(style.WingSoftness, 1e-4f);
            float best = float.MaxValue;
            for (int i = 0; i < geo.WingPoints.Length - 1; i++)
            {
                Vector2 a = geo.WingPoints[i];
                Vector2 ab = geo.WingPoints[i + 1] - a;
                float lengthSq = ab.sqrMagnitude;
                float proj = lengthSq > 1e-12f
                    ? Mathf.Clamp01(Vector2.Dot(point - a, ab) / lengthSq)
                    : 0.0f;
                float halfWidth = Mathf.Lerp(
                    geo.WingHalfWidths[i], geo.WingHalfWidths[i + 1], proj);
                float distance = Vector2.Distance(point, a + proj * ab) - halfWidth;
                if (distance < best)
                {
                    best = distance;
                }
            }

            weight = Mathf.Max(
                weight, Mathf.Clamp01(1.0f - Mathf.Max(0.0f, best) / wingSoft));
        }

        // Inner-corner extension: straight tapered segment toward the nose.
        if (style.InnerExtLength > 0.0f)
        {
            Vector2 point = new Vector2(u, v);
            Vector2 a = geo.InnerExtA;
            Vector2 ab = geo.InnerExtB - a;
            float lengthSq = ab.sqrMagnitude;
            float proj = lengthSq > 1e-12f
                ? Mathf.Clamp01(Vector2.Dot(point - a, ab) / lengthSq)
                : 0.0f;
            float halfWidth = Mathf.Lerp(style.InnerExtThickness, 0.0008f, proj);
            float distance = Vector2.Distance(point, a + proj * ab) - halfWidth;
            weight = Mathf.Max(
                weight, Mathf.Clamp01(1.0f - Mathf.Max(0.0f, distance) / bandSoft));
        }

        // Lower lash band: mirrored lid curve, extends downward, rendered at
        // reduced opacity so it reads as shading rather than solid liner.
        if (style.LowerEnd > style.LowerStart
            && t > style.LowerStart && t < style.LowerEnd)
        {
            // Same corner clamp and lid bias as the upper band.
            float clamped = Mathf.Clamp(t, -0.97f, 0.97f);
            float lidLow = geo.Center.y
                - geo.Ry * EyelinerLidBias
                    * Mathf.Sqrt(Mathf.Max(0.0f, 1.0f - clamped * clamped));
            float distance = v > lidLow
                ? v - lidLow
                : (v < lidLow - style.LowerThickness
                    ? (lidLow - style.LowerThickness) - v
                    : 0.0f);
            float lowerSoft = Mathf.Max(style.LowerSoftness, 1e-4f);
            float startFade = Mathf.Clamp01((t - style.LowerStart) / 0.15f);
            float endFade = Mathf.Clamp01((style.LowerEnd - t) / 0.15f);
            float lower = Mathf.Clamp01(1.0f - distance / lowerSoft)
                * startFade * endFade * style.LowerOpacity;
            weight = Mathf.Max(weight, lower);
        }

        return weight;
    }

    // Runtime replacement for foundation-skin-mask-v1.png (whose R channel is
    // effectively chin-only, see ApplyRegionToTrackedFaces). Full-face skin
    // coverage in ARKit face UV space with soft eye/brow/mouth exclusions,
    // hairline fade at the top and feathered outer edges. The tracked face
    // mesh clips this to the per-person face outline at render time.
    // Validates the shipped/personal foundation mask (usable only if it
    // actually covers the mid-face; the known-broken chin-only asset fails
    // this check) and grabs the lip region mask for lips-only exclusion.
    private static void EnsureFoundationMaskSources()
    {
        if (!foundationBaseMaskEvaluated)
        {
            foundationBaseMaskEvaluated = true;
            foundationValidatedBaseMask = null;
            Texture2D candidate = Resources.Load<Texture2D>("SmoothRegionMasks/" + FoundationSkinMaskId);
            if (candidate != null)
            {
                try
                {
                    float total = 0.0f;
                    int samples = 0;
                    for (int gy = 0; gy < 10; gy++)
                    {
                        for (int gx = 0; gx < 10; gx++)
                        {
                            float sampleU = Mathf.Lerp(0.18f, 0.82f, gx / 9.0f);
                            float sampleV = Mathf.Lerp(0.30f, 0.78f, gy / 9.0f);
                            Color sample = candidate.GetPixelBilinear(sampleU, sampleV);
                            total += Mathf.Max(sample.a, sample.r);
                            samples++;
                        }
                    }

                    float coverage = total / Mathf.Max(1, samples);
                    if (coverage >= 0.30f)
                    {
                        foundationValidatedBaseMask = candidate;
                    }

                    Debug.Log(
                        "[E7] foundation_base_mask_validated"
                        + " coverage=" + coverage.ToString("0.###", CultureInfo.InvariantCulture)
                        + " useAsBase=" + (foundationValidatedBaseMask != null).ToString().ToLowerInvariant());
                }
                catch (Exception)
                {
                    foundationValidatedBaseMask = null;
                }
            }
        }

        if (!foundationLipMaskEvaluated)
        {
            foundationLipMaskEvaluated = true;
            foundationLipExclusionMask = null;
            Texture2D lipMask = Resources.Load<Texture2D>("SmoothRegionMasks/lip-smooth-mask-v1");
            if (lipMask != null)
            {
                try
                {
                    // Sanity check: a usable lip mask is sparse (lips only).
                    // Reject it if it covers most of the UV space (wrong alpha
                    // semantics) or contains no lip content at all.
                    float total = 0.0f;
                    float peak = 0.0f;
                    int samples = 0;
                    for (int gy = 0; gy < 8; gy++)
                    {
                        for (int gx = 0; gx < 8; gx++)
                        {
                            float value = SampleFoundationMaskPixel(
                                lipMask,
                                Mathf.Lerp(0.05f, 0.95f, gx / 7.0f),
                                Mathf.Lerp(0.05f, 0.95f, gy / 7.0f));
                            total += value;
                            peak = Mathf.Max(peak, value);
                            samples++;
                        }
                    }

                    float mean = total / Mathf.Max(1, samples);
                    foundationLipExclusionMask = mean < 0.35f && peak > 0.15f ? lipMask : null;
                }
                catch (Exception)
                {
                    foundationLipExclusionMask = null;
                }
            }

            Debug.Log(
                "[E7] foundation_lip_exclusion_source="
                + (foundationLipExclusionMask != null ? "lip_region_mask" : "calibrated_ellipse"));
        }
    }

    private static float SampleFoundationExclusionMask(Texture2D texture, float u, float v)
    {
        const float dilation = 0.010f;
        float value = SampleFoundationMaskPixel(texture, u, v);
        value = Mathf.Max(value, SampleFoundationMaskPixel(texture, u + dilation, v));
        value = Mathf.Max(value, SampleFoundationMaskPixel(texture, u - dilation, v));
        value = Mathf.Max(value, SampleFoundationMaskPixel(texture, u, v + dilation));
        value = Mathf.Max(value, SampleFoundationMaskPixel(texture, u, v - dilation));
        return value;
    }

    private static float SampleFoundationMaskPixel(Texture2D texture, float u, float v)
    {
        Color sample = texture.GetPixelBilinear(Mathf.Clamp01(u), Mathf.Clamp01(v));
        return Mathf.Max(sample.a, sample.r * sample.a);
    }

    private static Texture2D GetFoundationSkinMaskTexture()
    {
        if (foundationGeneratedSkinMaskTexture != null)
        {
            return foundationGeneratedSkinMaskTexture;
        }

        EnsureFoundationMaskSources();
        const int size = 256;
        foundationGeneratedSkinMaskTexture = new Texture2D(size, size, TextureFormat.RGBA32, false)
        {
            name = "Foundation Generated Skin Mask",
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear
        };

        float minU = foundationCalUvMin.x;
        float maxU = foundationCalUvMax.x;
        float topV = foundationCalUvMax.y;
        float sideFadeWidth = Mathf.Max(0.06f, (maxU - minU) * 0.10f);

        for (int y = 0; y < size; y++)
        {
            float v = (y + 0.5f) / size;
            for (int x = 0; x < size; x++)
            {
                float u = (x + 0.5f) / size;

                // Side fade relative to the measured UV extents keeps tint
                // off sideburn/temple hair for every face.
                float edgeX = FoundationMaskSmooth01(minU + 0.010f, minU + 0.010f + sideFadeWidth, u)
                    * (1.0f - FoundationMaskSmooth01(maxU - 0.010f - sideFadeWidth, maxU - 0.010f, u));
                float bottomFade = FoundationMaskSmooth01(0.0f, 0.05f, v);
                // Forehead stays covered; only the band near the measured mesh
                // top (hairline/bangs) fades out so hair is not tinted.
                float hairlineFade = 1.0f - FoundationMaskSmooth01(topV - 0.155f, topV - 0.015f, v);
                float baseWeight = edgeX * bottomFade * hairlineFade;

                // Calibrated exclusions: eyes and brows stay tight so base
                // foundation remains on the nose bridge and surrounding skin;
                // mouth remains lips-only so the philtrum stays covered.
                float eyes = Mathf.Max(
                    FoundationMaskZoneEllipse(u, v, foundationCalLeftEye, 0.10f),
                    FoundationMaskZoneEllipse(u, v, foundationCalRightEye, 0.10f));
                float brows = Mathf.Max(
                    FoundationMaskZoneEllipse(u, v, foundationCalLeftBrow, 0.14f),
                    FoundationMaskZoneEllipse(u, v, foundationCalRightBrow, 0.14f));

                // Lips-only exclusion: reuse the actual lip region mask when
                // readable (philtrum and around-mouth skin stay covered);
                // fall back to the calibrated lip ellipse otherwise.
                // Earlier onset (0.05) hardens the lip hole so downstream soft
                // sampling can never ring into the lips; the small dilation in
                // SampleFoundationExclusionMask stays modest so the philtrum
                // and the skin just below the lower lip remain covered.
                // The lip region mask has a soft halo that can reach the
                // philtrum / nose base. Keep only the lip core and bound it by
                // the calibrated mouth ellipse so foundation stays on the
                // nose, philtrum and around-mouth skin while lips remain clear.
                // Lip texture DISABLED for this exclusion: its content lives
                // in a different UV convention, so its lip-shaped hole lands
                // on the nose (device screenshot 2026-07-05, cupid's-bow blob
                // above the mouth) — and min()-ing a misplaced texture with
                // the ellipse would instead leave the REAL lips painted.
                // The calibrated ellipse alone is measured from this user's
                // tracked lip vertices every session, so it is always on the
                // lips: lips excluded, philtrum/nose fully painted.
                float mouth = FoundationMaskZoneEllipse(u, v, foundationCalMouth, 0.045f);

                // Hard vertical guard: nothing above the measured mouth zone
                // may be excluded by the lip mask — the philtrum and the
                // whole nose must always receive foundation.
                float mouthGuardTop = foundationCalMouth.Center.y
                    + foundationCalMouth.Radius.y * 0.78f;
                mouth *= 1.0f - FoundationMaskSmooth01(
                    mouthGuardTop,
                    mouthGuardTop + 0.012f,
                    v);

                // The shipped foundation-skin-mask-v1 can contain weak mid-face
                // values, especially around the nose. Do not multiply it into
                // the final CB mask; the ARFace mesh already clips the result to
                // the actual face surface and the calibrated exclusions remove
                // lips, eyes and brows.
                const float baseSample = 1.0f;

                float weight = Mathf.Clamp01(
                    baseWeight
                    * baseSample
                    * (1.0f - eyes)
                    * (1.0f - brows)
                    * (1.0f - mouth));

                // R drives the tint mask, B adds inner density in the generic
                // path, G stays 0 (lip overline channel), A mirrors R.
                foundationGeneratedSkinMaskTexture.SetPixel(
                    x,
                    y,
                    new Color(weight, 0.0f, weight, weight));
            }
        }

        foundationGeneratedSkinMaskTexture.Apply(false, true);
        Debug.Log("[E7] foundation_generated_skin_mask_created size=" + size);
        return foundationGeneratedSkinMaskTexture;
    }

    private static Texture2D GetFoundationNeckGradientTexture()
    {
        if (foundationNeckGradientTexture != null)
        {
            return foundationNeckGradientTexture;
        }

        const int size = 64;
        foundationNeckGradientTexture = new Texture2D(size, size, TextureFormat.RGBA32, false)
        {
            name = "Foundation Neck Gradient Mask",
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear
        };

        for (int y = 0; y < size; y++)
        {
            float v = (y + 0.5f) / size;
            // Full strength at the jaw (v -> 1) fading out toward the bottom,
            // with a slight taper in the topmost band so the small overlap
            // with the face mesh doesn't stack into a darker jawline stripe.
            float vertical = Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(0.05f, 0.55f, v));
            vertical *= 1.0f - 0.15f * Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(0.90f, 1.0f, v));
            for (int x = 0; x < size; x++)
            {
                float u = (x + 0.5f) / size;
                float leftEdge = Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(0.0f, 0.18f, u));
                float rightEdge = Mathf.SmoothStep(0.0f, 1.0f, Mathf.InverseLerp(1.0f, 0.82f, u));
                float weight = vertical * leftEdge * rightEdge;
                // R drives the tint, B matches the face mask so the neck gets
                // the same inner-density formula (same final tone as the face);
                // G stays 0 (lip overline channel).
                foundationNeckGradientTexture.SetPixel(x, y, new Color(weight, 0.0f, weight, weight));
            }
        }

        foundationNeckGradientTexture.Apply(false, true);
        return foundationNeckGradientTexture;
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

    private static void ApplyMaterialHandOcclusion(
        Material material,
        bool enabled,
        Texture handMaskTexture,
        bool useRectFallback,
        Rect topLeftScreenRect)
    {
        if (material == null)
        {
            return;
        }

        if (material.HasProperty("_HandOcclusionEnabled"))
        {
            material.SetFloat("_HandOcclusionEnabled", enabled ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_HandOcclusionMaskTex") && handMaskTexture != null)
        {
            material.SetTexture("_HandOcclusionMaskTex", handMaskTexture);
        }

        if (material.HasProperty("_HandOcclusionUseRect"))
        {
            material.SetFloat("_HandOcclusionUseRect", enabled && useRectFallback ? 1.0f : 0.0f);
        }

        if (!material.HasProperty("_HandOcclusionRect"))
        {
            return;
        }

        if (!enabled || !useRectFallback || topLeftScreenRect.width <= 1.0f || topLeftScreenRect.height <= 1.0f)
        {
            material.SetVector("_HandOcclusionRect", Vector4.zero);
            return;
        }

        float screenWidth = Mathf.Max(1.0f, Screen.width);
        float screenHeight = Mathf.Max(1.0f, Screen.height);
        float xMin = Mathf.Clamp01(topLeftScreenRect.xMin / screenWidth);
        float xMax = Mathf.Clamp01(topLeftScreenRect.xMax / screenWidth);
        float yMin = Mathf.Clamp01(1.0f - topLeftScreenRect.yMax / screenHeight);
        float yMax = Mathf.Clamp01(1.0f - topLeftScreenRect.yMin / screenHeight);
        if (xMax <= xMin || yMax <= yMin)
        {
            if (material.HasProperty("_HandOcclusionEnabled"))
            {
                material.SetFloat("_HandOcclusionEnabled", 0.0f);
            }

            material.SetVector("_HandOcclusionRect", Vector4.zero);
            return;
        }

        material.SetVector("_HandOcclusionRect", new Vector4(xMin, yMin, xMax, yMax));
    }

    private static void ApplyMaterialFoundationDynamicMask(
        Material material,
        bool valid,
        Texture foundationMaskTexture)
    {
        if (material == null)
        {
            return;
        }

        if (material.HasProperty("_FoundationDynamicMaskValid"))
        {
            material.SetFloat("_FoundationDynamicMaskValid", valid ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_FoundationDynamicMaskTex"))
        {
            material.SetTexture(
                "_FoundationDynamicMaskTex",
                valid && foundationMaskTexture != null ? foundationMaskTexture : Texture2D.blackTexture);
        }
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
        if (region == "base")
        {
            return "foundation";
        }

        if (region == "foundation"
            || region == "lip"
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

    private static bool IsScreenSpaceFoundationRecipe(RegionRecipeState recipe)
    {
        return recipe != null
            && IsFoundationRegion(recipe.Region)
            && (recipe.FoundationMode == "screenSpace" || recipe.FoundationMode == "semantic");
    }

    private static string NormalizeFoundationMode(string region, string mode)
    {
        if (!IsFoundationRegion(region))
        {
            return "uvMask";
        }

        if (string.IsNullOrWhiteSpace(mode))
        {
            return "uvMask";
        }

        string value = mode.Trim();
        if (value.Equals("semantic", StringComparison.OrdinalIgnoreCase)
            || value.Equals("segmentation", StringComparison.OrdinalIgnoreCase)
            || value.Equals("semanticFoundation", StringComparison.OrdinalIgnoreCase)
            || value.Equals("segmentationFoundation", StringComparison.OrdinalIgnoreCase))
        {
            return "semantic";
        }

        if (value.Equals("screenSpace", StringComparison.OrdinalIgnoreCase)
            || value.Equals("screen-space", StringComparison.OrdinalIgnoreCase)
            || value.Equals("screenspace", StringComparison.OrdinalIgnoreCase))
        {
            return "screenSpace";
        }

        if (value.Equals("uvMask", StringComparison.OrdinalIgnoreCase)
            || value.Equals("uv-mask", StringComparison.OrdinalIgnoreCase)
            || value.Equals("uv", StringComparison.OrdinalIgnoreCase))
        {
            return "uvMask";
        }

        Debug.LogWarning("[FoundationScreenSpace] unsupported mode=" + value + " fallback=uvMask");
        return "uvMask";
    }

    private static string NormalizeFoundationFallbackMode(string fallbackMode)
    {
        if (string.IsNullOrWhiteSpace(fallbackMode))
        {
            return "uvMask";
        }

        string value = fallbackMode.Trim();
        if (value.Equals("off", StringComparison.OrdinalIgnoreCase)
            || value.Equals("none", StringComparison.OrdinalIgnoreCase))
        {
            return "off";
        }

        if (value.Equals("uvMask", StringComparison.OrdinalIgnoreCase)
            || value.Equals("uv-mask", StringComparison.OrdinalIgnoreCase)
            || value.Equals("uv", StringComparison.OrdinalIgnoreCase))
        {
            return "uvMask";
        }

        Debug.LogWarning("[FoundationScreenSpace] unsupported fallbackMode=" + value + " fallback=uvMask");
        return "uvMask";
    }

    private static string NormalizeTextureSample(string region, string textureSample)
    {
        textureSample = string.IsNullOrWhiteSpace(textureSample)
            ? string.Empty
            : textureSample.Trim().ToLowerInvariant();

        if ((region == "foundation"
                && (textureSample == "foundation_natural"
                    || textureSample == "foundation_matte"
                    || textureSample == "foundation_glow"))
            || (region == "lip"
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
            || (region == "foundation" && maskTextureId == FoundationSkinMaskId)
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

    private void MaybeLogLipCloseupDiagnostics(
        ARFace face,
        RegionOverlayView view,
        string region,
        RegionRecipeState recipe,
        TrackingVisibility visibility)
    {
        if (region != "lip" || Time.realtimeSinceStartup < nextLipCloseupDiagnosticsLogAt)
        {
            return;
        }

        nextLipCloseupDiagnosticsLogAt = Time.realtimeSinceStartup + LipCloseupDiagnosticsIntervalSeconds;
        Camera arCamera = Camera.main;
        Material material = view.MeshRenderer != null ? view.MeshRenderer.sharedMaterial : null;
        bool rendererEnabled = view.MeshRenderer != null && view.MeshRenderer.enabled;
        float materialOpacity = GetMaterialFloat(material, "_Opacity", -1.0f);
        float materialVisibilityAlpha = GetMaterialFloat(material, "_VisibilityAlpha", -1.0f);
        float effectiveMaterialAlpha = Mathf.Clamp01(Mathf.Max(0.0f, materialOpacity))
            * Mathf.Clamp01(Mathf.Max(0.0f, materialVisibilityAlpha))
            * Mathf.Clamp01(visibility.AlphaMultiplier);

        bool faceScreenAvailable = TryCalculateCurrentFaceScreenBounds(face, arCamera, out Vector2 faceScreenCenter, out Vector2 faceScreenSize);
        float faceDistance = arCamera != null && face != null
            ? Vector3.Distance(arCamera.transform.position, face.transform.position)
            : -1.0f;
        float faceCameraZ = arCamera != null && face != null
            ? arCamera.transform.InverseTransformPoint(face.transform.position).z
            : -1.0f;
        float nearClip = arCamera != null ? arCamera.nearClipPlane : -1.0f;

        MaskDefinition mask = ResolveMask(recipe.Region, recipe.MaskTextureId);
        MaskTextureDiagnostics maskDiagnostics = GetMaskTextureDiagnostics(mask);

        string lipBoundaryStatus = "provider_missing";
        bool lipBoundaryDetected = false;
        float lipConfidence = 0.0f;
        long lipBoundaryAgeMs = 0;
        Rect lipBbox = Rect.zero;
        bool lipBboxAvailable = false;
        bool lipBboxOutsideScreen = false;
        if (visionLipBoundaryRuntime == null)
        {
            RefreshSceneReferences();
        }

        if (visionLipBoundaryRuntime != null)
        {
            if (visionLipBoundaryRuntime.TryGetLatestBoundary(Screen.width, Screen.height, out E7VisionLipBoundaryRuntime.BoundarySnapshot boundary))
            {
                E7VisionLipBoundaryRuntime.BoundarySnapshot screenBoundary = TransformVisionBoundaryForScreen(
                    boundary,
                    boundary.ImageWidth,
                    boundary.ImageHeight,
                    VisionBoundaryRuntimeTransform);
                lipBoundaryStatus = string.IsNullOrWhiteSpace(screenBoundary.Status) ? "unknown" : screenBoundary.Status;
                lipBoundaryDetected = screenBoundary.Available;
                lipConfidence = screenBoundary.LipConfidence;
                lipBoundaryAgeMs = screenBoundary.AgeMs;
                lipBboxAvailable = TryCalculatePointsTopLeftBbox(screenBoundary.OuterPoints, out lipBbox);
                lipBboxOutsideScreen = lipBboxAvailable && IsRectOutsideScreen(lipBbox, Screen.width, Screen.height);
            }
            else if (visionLipBoundaryRuntime.TryPeekLatestBoundary(out E7VisionLipBoundaryRuntime.BoundarySnapshot staleBoundary))
            {
                lipBoundaryStatus = "stale_" + (string.IsNullOrWhiteSpace(staleBoundary.Status) ? "unknown" : staleBoundary.Status);
                lipBoundaryDetected = false;
                lipConfidence = staleBoundary.LipConfidence;
                lipBoundaryAgeMs = staleBoundary.AgeMs;
                lipBboxAvailable = staleBoundary.LipBoundsAvailable;
                lipBbox = staleBoundary.LipBounds;
            }
            else
            {
                lipBoundaryStatus = "not_available";
            }
        }

        Debug.Log(
            "[E7] lip_closeup_diagnostics"
            + " arFaceTracked=" + (face != null && face.trackingState == TrackingState.Tracking).ToString().ToLowerInvariant()
            + " arFaceTrackingState=" + (face != null ? face.trackingState.ToString() : "none")
            + " lipBoundaryDetected=" + lipBoundaryDetected.ToString().ToLowerInvariant()
            + " lipBoundaryStatus=" + lipBoundaryStatus
            + " lipBoundaryAgeMs=" + lipBoundaryAgeMs.ToString(CultureInfo.InvariantCulture)
            + " lipConfidence=" + lipConfidence.ToString("0.###", CultureInfo.InvariantCulture)
            + " lipBboxAvailable=" + lipBboxAvailable.ToString().ToLowerInvariant()
            + " lipBbox=" + FormatRect(lipBboxAvailable, lipBbox)
            + " lipBboxWidth=" + (lipBboxAvailable ? lipBbox.width : 0.0f).ToString("0.#", CultureInfo.InvariantCulture)
            + " lipBboxHeight=" + (lipBboxAvailable ? lipBbox.height : 0.0f).ToString("0.#", CultureInfo.InvariantCulture)
            + " lipBboxOutsideScreen=" + lipBboxOutsideScreen.ToString().ToLowerInvariant()
            + " lipMaterialOpacity=" + materialOpacity.ToString("0.###", CultureInfo.InvariantCulture)
            + " lipMaterialVisibilityAlpha=" + materialVisibilityAlpha.ToString("0.###", CultureInfo.InvariantCulture)
            + " lipMaterialEffectiveAlpha=" + effectiveMaterialAlpha.ToString("0.###", CultureInfo.InvariantCulture)
            + " lipRendererEnabled=" + rendererEnabled.ToString().ToLowerInvariant()
            + " lipMaskTextureAverage=" + maskDiagnostics.AverageValue.ToString("0.######", CultureInfo.InvariantCulture)
            + " lipMaskTextureAverageDensity=" + maskDiagnostics.AverageDensity.ToString("0.######", CultureInfo.InvariantCulture)
            + " lipMaskTextureStatus=" + maskDiagnostics.Status
            + " lipMaskTextureSize=" + maskDiagnostics.Width.ToString(CultureInfo.InvariantCulture)
            + "x" + maskDiagnostics.Height.ToString(CultureInfo.InvariantCulture)
            + " faceDistance=" + faceDistance.ToString("0.###", CultureInfo.InvariantCulture)
            + " faceCameraZ=" + faceCameraZ.ToString("0.###", CultureInfo.InvariantCulture)
            + " faceScreenBoundsAvailable=" + faceScreenAvailable.ToString().ToLowerInvariant()
            + " faceScreenHeight=" + (faceScreenAvailable ? faceScreenSize.y : 0.0f).ToString("0.#", CultureInfo.InvariantCulture)
            + " faceScreenHeightRatio=" + (faceScreenAvailable ? faceScreenSize.y / Mathf.Max(1.0f, Screen.height) : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " faceScreenCenter=" + FormatVector(faceScreenAvailable, faceScreenCenter)
            + " arCameraNearClipPlane=" + nearClip.ToString("0.###", CultureInfo.InvariantCulture)
            + " screenSize=" + Screen.width.ToString(CultureInfo.InvariantCulture)
            + "x" + Screen.height.ToString(CultureInfo.InvariantCulture)
            + " stateAction=" + visibility.Action
            + " overlaySuppressed=" + overlayRenderingSuppressed.ToString().ToLowerInvariant()
            + " visionCaptureSuppressed=" + visionCaptureSuppressed.ToString().ToLowerInvariant());
    }

    private static float GetMaterialFloat(Material material, string propertyName, float fallback)
    {
        return material != null && material.HasProperty(propertyName)
            ? material.GetFloat(propertyName)
            : fallback;
    }

    private static bool TryCalculatePointsTopLeftBbox(Vector2[] points, out Rect bbox)
    {
        bbox = Rect.zero;
        if (points == null || points.Length == 0)
        {
            return false;
        }

        float minX = float.MaxValue;
        float minY = float.MaxValue;
        float maxX = float.MinValue;
        float maxY = float.MinValue;
        int count = 0;
        for (int index = 0; index < points.Length; index++)
        {
            Vector2 point = points[index];
            if (float.IsNaN(point.x)
                || float.IsNaN(point.y)
                || float.IsInfinity(point.x)
                || float.IsInfinity(point.y))
            {
                continue;
            }

            minX = Mathf.Min(minX, point.x);
            minY = Mathf.Min(minY, point.y);
            maxX = Mathf.Max(maxX, point.x);
            maxY = Mathf.Max(maxY, point.y);
            count++;
        }

        if (count <= 0 || maxX <= minX || maxY <= minY)
        {
            return false;
        }

        bbox = Rect.MinMaxRect(minX, minY, maxX, maxY);
        return true;
    }

    private static bool IsRectOutsideScreen(Rect rect, int screenWidth, int screenHeight)
    {
        return rect.xMin < 0.0f
            || rect.yMin < 0.0f
            || rect.xMax > screenWidth
            || rect.yMax > screenHeight;
    }

    private static string FormatRect(bool available, Rect rect)
    {
        if (!available)
        {
            return "none";
        }

        return "x=" + rect.x.ToString("0.#", CultureInfo.InvariantCulture)
            + ",y=" + rect.y.ToString("0.#", CultureInfo.InvariantCulture)
            + ",w=" + rect.width.ToString("0.#", CultureInfo.InvariantCulture)
            + ",h=" + rect.height.ToString("0.#", CultureInfo.InvariantCulture);
    }

    private static string FormatVector(bool available, Vector2 value)
    {
        if (!available)
        {
            return "none";
        }

        return "x=" + value.x.ToString("0.#", CultureInfo.InvariantCulture)
            + ",y=" + value.y.ToString("0.#", CultureInfo.InvariantCulture);
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
