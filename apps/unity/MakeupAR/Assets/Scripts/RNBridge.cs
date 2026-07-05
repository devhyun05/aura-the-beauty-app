using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public sealed class RNBridge : MonoBehaviour
{
    private static readonly string[] FeatureSnapshotRegions =
        { "foundation", "lip", "cheek", "eye", "blush", "brow", "eyeliner" };

    [Serializable]
    private sealed class RecipePayload
    {
        public int version;
        public string recipeId;
        public string recipeBatchId;
        public string lookId;
        public double sentAtMs;
        public string activeRegions;
        public int layerCount;
        public int enabledLayerCount;
        public string region;
        public string layer;
        public string color;
        public string secondaryColor;
        public float opacity;
        public string texture;
        public string sample;
        public string textureMode;
        public float intensity;
        public float feather;
        public string blendMode;
        public string rendererMode;
        public float coverage;
        public string finish;
        public float textureAmount;
        public float gradientAmount;
        public float roughness;
        public float specular;
        public float specularPower;
        public float glossBoost;
        public float shimmer;
        public string shimmerColor;
        public bool skinAdaptive;
        public bool preserveDetail;
        public string materialId;
        public string shaderMode;
        public int passCount;
        public string candidateId;
        public string maskTextureId;
        public float maskThreshold;
        public float maskFeatherUvNormalized;
        public float cornerReach;
        public float upperLipTightness;
        public float lowerLipTightness;
        public float verticalOffset;
        public bool cameraBackdropAvailable;
        public bool lightEstimateAvailable;
        public string mode;
        public string fallbackMode;
        public int debugMaskMode;
        public string foundationMode;
        public string foundationFallbackMode;
        public RecipeLayerPayload[] layers;
    }

    [Serializable]
    private sealed class RecipeLayerPayload
    {
        public string id;
        public string recipeId;
        public string recipeBatchId;
        public string lookId;
        public double sentAtMs;
        public string activeRegions;
        public int layerCount;
        public int enabledLayerCount;
        public string region;
        public string layer;
        public string color;
        public string secondaryColor;
        public float opacity;
        public string texture;
        public string sample;
        public string textureMode;
        public float intensity;
        public float feather;
        public string blendMode;
        public string rendererMode;
        public bool enabled;
        public float coverage;
        public string finish;
        public float textureAmount;
        public float gradientAmount;
        public float roughness;
        public float specular;
        public float specularPower;
        public float glossBoost;
        public float shimmer;
        public string shimmerColor;
        public bool skinAdaptive;
        public bool preserveDetail;
        public string materialId;
        public string shaderMode;
        public int passCount;
        public string candidateId;
        public string maskTextureId;
        public float maskThreshold;
        public float maskFeatherUvNormalized;
        public float cornerReach;
        public float upperLipTightness;
        public float lowerLipTightness;
        public float verticalOffset;
        public bool cameraBackdropAvailable;
        public bool lightEstimateAvailable;
        public string mode;
        public string fallbackMode;
        public int debugMaskMode;
        public string foundationMode;
        public string foundationFallbackMode;
    }

    [Serializable]
    private sealed class LipAdjustmentPayload
    {
        public float cornerReach;
        public float upperLipTightness;
        public float lowerLipTightness;
        public float verticalOffset;
    }

    [Serializable]
    private sealed class GeneratedLipMaskPayload
    {
        public string schemaVersion;
        public string generatedMaskId;
        public string captureSetId;
        public string provider;
        public string expressionMode;
        public LipAdjustmentPayload adjustment;
        public string maskTexturePath;
        public string maskTextureId;
        public string maskTextureEncoding;
        public string maskPngBase64;
        public string maskRawRgbaBase64;
        public int maskTextureWidth;
        public int maskTextureHeight;
        public float maskThreshold;
        public float maskFeatherUvNormalized;
        public bool localOnly;
        public bool offDeviceUpload;
        public bool longTermRawFrameStored;
        public bool runtimeReady;
        public bool visible = true;
        public bool maskVisible = true;
        public bool validationVisible = true;
        public bool enabled = true;
        public bool strongValidationMode;
        public bool validationStrongMode;
        public bool validationStrong;
        public bool strongMode;
        public string validationMode;
        public string validationViewMode;
        public string color;
        public string colorHex;
        public string secondaryColor;
        public string secondaryColorHex;
        public string validationColor;
        public string validationColorHex;
        public string texture;
        public string sample;
        public string finish;
        public float intensity = -1.0f;
        public float coverage = -1.0f;
        public float feather = -1.0f;
        public float textureAmount = -1.0f;
        public float gradientAmount = -1.0f;
        public float roughness = -1.0f;
        public float specular = -1.0f;
        public float specularPower = -1.0f;
        public float glossBoost = -1.0f;
        public string blendMode;
        public bool preserveDetail = true;
        public float opacity = -1.0f;
        public float maskOpacity = -1.0f;
        public float validationOpacity = -1.0f;
        public bool boundaryDebugVisible;
        public bool boundaryDebug;
        public bool debugBoundary;
        public bool showBoundary;
        public bool debugOverlayVisible;
        public int controlRequestId;
        public int validationControlRequestId;
        public int controlRevision;
        public int validationControlRevision;
    }

    [Serializable]
    private sealed class GeneratedBrowMaskPayload
    {
        public string schemaVersion;
        public string generatedMaskId;
        public string captureSetId;
        public string provider;
        public string shapeId;
        public string maskTexturePath;
        public string maskTextureId;
        public string maskTextureEncoding;
        public string maskPngBase64;
        public string maskRawRgbaBase64;
        public int maskTextureWidth;
        public int maskTextureHeight;
        public float maskThreshold;
        public float maskFeatherUvNormalized;
        public int softEdgeTexels;
        public bool localOnly;
        public bool offDeviceUpload;
        public bool longTermRawFrameStored;
        public bool runtimeReady;
        public bool visible = true;
        public bool maskVisible = true;
        public bool validationVisible = true;
        public bool enabled = true;
        public bool strongValidationMode;
        public bool validationStrongMode;
        public bool validationStrong;
        public bool strongMode;
        public string anchorStabilizationMode;
        public int browAnchorPointCount;
        public int browCorePointCount;
        public int browShapeBasePointCount;
        public int eyeAnchorPointCount;
        public string eyeExclusionMode;
        public float expectedMaskUvMaxX;
        public float expectedMaskUvMaxY;
        public float expectedMaskUvMinX;
        public float expectedMaskUvMinY;
        public int faceOvalPointCount;
        public int noseBridgeAnchorPointCount;
        public int surroundAnchorPointCount;
        public int templeAnchorPointCount;
        public int upperEyelidAnchorPointCount;
        public string validationMode;
        public string validationViewMode;
        public string color;
        public string colorHex;
        public string validationColor;
        public string validationColorHex;
        public string texture;
        public string sample;
        public string finish;
        public float intensity = -1.0f;
        public float coverage = -1.0f;
        public float feather = -1.0f;
        public float textureAmount = -1.0f;
        public float strandTextureAmount = -1.0f;
        public float cleanupStrength = -1.0f;
        public float neutralizeStrength = -1.0f;
        public float roughness = -1.0f;
        public float specular = -1.0f;
        public float specularPower = -1.0f;
        public string blendMode;
        public bool preserveDetail = true;
        public float opacity = -1.0f;
        public float maskOpacity = -1.0f;
        public float validationOpacity = -1.0f;
        public bool boundaryDebugVisible;
        public bool boundaryDebug;
        public bool debugBoundary;
        public bool showBoundary;
        public bool debugOverlayVisible;
        public int debugMode;
        public bool debugShowLeftRight;
        public bool debugExaggerate;
        public int controlRequestId;
        public int validationControlRequestId;
        public int controlRevision;
        public int validationControlRevision;
    }

    [Serializable]
    private sealed class RecipeAckPayload
    {
        public string type;
        public string runId;
        public string phase;
        public string rendererMode;
        public string lookId;
        public string recipeId;
        public string recipeBatchId;
        public string activeRegions;
        public int layerCount;
        public int enabledLayerCount;
        public int payloadBytes;
        public string region;
        public string texture;
        public string finish;
        public float textureAmount;
        public float glossBoost;
        public float coverage;
        public float feather;
        public double sentAtMs;
        public double appliedAtMs;
        public int appliedFrame;
        public double receivedAtMs;
        public bool visualLatencyConfirmedByRecording;
        public string visualLatencyObservation;
    }

    [Serializable]
    private sealed class RegionOverlayVisibilityPayload
    {
        public bool visible = true;
        public string validationViewMode;
        public string reason;
    }

    private struct ParsedRecipeLayer
    {
        public string Id;
        public string Region;
        public string LegacyLayer;
        public string ColorHex;
        public Color Color;
        public string SecondaryColorHex;
        public Color SecondaryColor;
        public float Opacity;
        public string RecipeId;
        public string RecipeBatchId;
        public string LookId;
        public double SentAtMs;
        public string ActiveRegions;
        public int LayerCount;
        public int EnabledLayerCount;
        public int PayloadBytes;
        public string TextureSample;
        public string TextureMode;
        public float Intensity;
        public float Feather;
        public string BlendMode;
        public string RendererMode;
        public bool Enabled;
        public float Coverage;
        public string Finish;
        public float TextureAmount;
        public float GradientAmount;
        public float Roughness;
        public float Specular;
        public float SpecularPower;
        public float GlossBoost;
        public float Shimmer;
        public string ShimmerColor;
        public bool SkinAdaptive;
        public bool PreserveDetail;
        public string MaterialId;
        public string ShaderMode;
        public int PassCount;
        public string CandidateId;
        public string MaskTextureId;
        public float MaskThreshold;
        public float MaskFeatherUvNormalized;
        public float CornerReach;
        public float UpperLipTightness;
        public float LowerLipTightness;
        public float VerticalOffset;
        public bool CameraBackdropAvailable;
        public bool LightEstimateAvailable;
        public string FoundationMode;
        public string FoundationFallbackMode;
        public int FoundationDebugMaskMode;
        public bool ValidationVisible;
        public bool ValidationStrongMode;
        public string ValidationMode;
        public float ValidationOpacity;
        public bool BoundaryDebugVisible;
        public string BoundaryDebugMode;
        public int ValidationControlRequestId;
        public int ValidationControlRevision;
        public int DebugMode;
        public bool DebugShowLeftRight;
        public bool DebugExaggerate;
    }

    private sealed class RegionFeatureState
    {
        public string Region = string.Empty;
        public bool Enabled;
        public bool Applied;
        public string ColorHex = string.Empty;
        public string SecondaryColorHex = string.Empty;
        public float Opacity;
        public string TextureSample = string.Empty;
        public string TextureMode = string.Empty;
        public string BlendMode = string.Empty;
        public float Intensity;
        public float Feather;
        public string RecipeBatchId = "none";
        public string LookId = "smooth_region_mask";
        public string ActiveRegions = "none";
        public int LayerCount;
        public int EnabledLayerCount;
        public int PayloadBytes;
        public string RendererMode = "smooth-region-mask";
        public float Coverage;
        public string Finish = "validation-placeholder";
        public float TextureAmount;
        public float GradientAmount;
        public float Roughness;
        public float Specular;
        public float SpecularPower;
        public float GlossBoost;
        public float Shimmer;
        public string ShimmerColor = "#FFFFFF";
        public bool SkinAdaptive;
        public bool PreserveDetail = true;
        public string MaterialId = "none";
        public string ShaderMode = "unlit-alpha-validation";
        public int PassCount;
        public string CandidateId = "none";
        public string MaskTextureId = "none";
        public float MaskThreshold;
        public float MaskFeatherUvNormalized;
        public float CornerReach;
        public float UpperLipTightness;
        public float LowerLipTightness;
        public float VerticalOffset;
        public bool CameraBackdropAvailable;
        public bool LightEstimateAvailable;
        public string MaskSource = "smooth_region_mask";
        public string BoundaryRenderer = "smooth_alpha_mask";
        public string TrackingState = "None";
        public string StateAction = "not_started";
        public int MaskTriangleCount;
        public bool UvAvailable;
        public int MeshVertexCount;
        public int MeshIndexCount;
        public int MeshUvCount;
        public int FaceCount;
        public int MeshTriangleCount;
        public string TopologyAuditStatus = "not_run";
        public string TopologyAuditSummary = "none";
        public string OverlaySyncPhase = "not_started";
        public int OverlaySyncFrame;
        public int TrackablesChangedSequence;
        public float OverlaySyncDurationMs;
        public float OverlaySyncWorstDurationMs;
        public int OverlaySyncCount;
        public bool OverlayTopologyChanged;
        public string StabilityMode = "none";
        public float StabilizationDeadZoneMeters;
        public float StabilizationSnapDistanceMeters;
        public bool ValidationVisible = true;
        public bool ValidationStrongMode;
        public string ValidationMode = "standard";
        public float ValidationOpacity;
        public bool BoundaryDebugVisible;
        public string BoundaryDebugMode = "none";
        public int DebugMode;
        public bool DebugShowLeftRight;
        public bool DebugExaggerate;
        public string BlockedReason = "none";
        public long LastUpdatedMs;
    }

    private sealed class PendingGeneratedLipMaskApply
    {
        public GeneratedLipMaskPayload Payload;
        public ParsedRecipeLayer Layer;
        public int PayloadBytes;
        public bool RawMaskProvided;
        public float ReceivedAtSeconds;
        public float LastAttemptAtSeconds = -1000.0f;
        public float LastAckAtSeconds = -1000.0f;
        public int AttemptCount;
    }

    private sealed class PendingGeneratedBrowMaskApply
    {
        public GeneratedBrowMaskPayload Payload;
        public ParsedRecipeLayer Layer;
        public int PayloadBytes;
        public bool RawMaskProvided;
        public float ReceivedAtSeconds;
        public float LastAttemptAtSeconds = -1000.0f;
        public float LastAckAtSeconds = -1000.0f;
        public int AttemptCount;
    }

    [SerializeField] private ARFaceManager faceManager;
    [SerializeField] private Material overlayMaterial;
    [SerializeField] private E7SynchronizedCaptureExporter referenceCaptureExporter;
    [SerializeField] private FaceTrackingStatusReporter statusReporter;

    private E3RegionMaskOverlay regionMaskOverlay;
    private readonly Dictionary<Renderer, bool> suppressedFaceRendererStates =
        new Dictionary<Renderer, bool>();
    private readonly Dictionary<ARFaceMeshVisualizer, bool> suppressedFaceVisualizerStates =
        new Dictionary<ARFaceMeshVisualizer, bool>();
    private readonly Dictionary<string, RegionFeatureState> latestRegionFeatureStates =
        new Dictionary<string, RegionFeatureState>();
    private bool faceRenderersSuppressed = true;
    private int lastSuppressedFaceTrackableCount = -1;
    private PendingGeneratedLipMaskApply pendingGeneratedLipMaskApply;
    private PendingGeneratedBrowMaskApply pendingGeneratedBrowMaskApply;
    private GeneratedBrowMaskPayload activeGeneratedBrowMaskPayload;
    private ParsedRecipeLayer activeGeneratedBrowMaskLayer;
    private bool hasActiveGeneratedBrowMaskLayer;
    private ARFaceManager subscribedGeneratedLipFaceManager;
    private bool generatedLipMaskRetryRequested;
    private bool generatedBrowMaskRetryRequested;
    private float lastGeneratedBrowRuntimeSampleAtSeconds = -1000.0f;
    private int generatedBrowRuntimeSampleCount;

    private const float GeneratedLipMaskRetryIntervalSeconds = 0.12f;
    private const float GeneratedLipMaskAckIntervalSeconds = 0.75f;
    private const float GeneratedLipMaskBlockedAfterSeconds = 8.0f;
    private const float GeneratedBrowMaskRetryIntervalSeconds = 0.12f;
    private const float GeneratedBrowMaskAckIntervalSeconds = 0.75f;
    private const float GeneratedBrowMaskBlockedAfterSeconds = 8.0f;
    private const float GeneratedBrowRuntimeSampleIntervalSeconds = 0.25f;

#if UNITY_IOS && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void sendMessageToMobileApp(string message);
#endif

    private void Awake()
    {
        RefreshSceneReferences();
        EnsureRegionMaskOverlay();
        EnsureReferenceCaptureExporter();
        SetFaceRenderersSuppressed(true);
    }

    private IEnumerator Start()
    {
        yield return null;
        yield return new WaitForSeconds(0.25f);
        SendUnityEvent("{\"type\":\"unity_initialized\"}");
    }

    private void OnDisable()
    {
        UnsubscribeGeneratedLipFaceManager();
    }

    private void LateUpdate()
    {
        if (faceRenderersSuppressed && ShouldRefreshFaceRendererSuppression())
        {
            ApplyFaceRendererSuppression();
        }

        TryApplyPendingGeneratedLipMask("late_update", false);
        TryApplyPendingGeneratedBrowMask("late_update", false);
        TryEmitGeneratedBrowRuntimeSample();
    }

    public void ApplyRecipeJson(string json)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Recipe JSON is empty.");
            }

            RecipePayload recipe = JsonUtility.FromJson<RecipePayload>(json);
            if (recipe == null)
            {
                throw new ArgumentException("Recipe JSON did not parse into a payload.");
            }

            int payloadBytes = json.Length;
            List<ParsedRecipeLayer> layers = ParseRecipeLayers(recipe, payloadBytes);
            string recipeBatchId = NormalizeRecipeBatchId(recipe.recipeBatchId, recipe.recipeId);
            string activeRegions = NormalizeActiveRegions(recipe.activeRegions, layers);
            int layerCount = recipe.layerCount > 0 ? recipe.layerCount : layers.Count;
            int enabledLayerCount = recipe.enabledLayerCount > 0
                ? recipe.enabledLayerCount
                : CountEnabledLayers(layers);
            ApplyBatchMetadata(
                layers,
                recipeBatchId,
                activeRegions,
                layerCount,
                enabledLayerCount,
                payloadBytes);
            Debug.Log(
                "[E4] recipe_parse"
                + " version=" + recipe.version.ToString(CultureInfo.InvariantCulture)
                + " layerCount=" + layers.Count.ToString(CultureInfo.InvariantCulture)
                + " declaredLayerCount=" + layerCount.ToString(CultureInfo.InvariantCulture)
                + " enabledLayerCount=" + enabledLayerCount.ToString(CultureInfo.InvariantCulture)
                + " activeRegions=" + activeRegions
                + " recipeBatchId=" + recipeBatchId
                + " payloadBytes=" + payloadBytes.ToString(CultureInfo.InvariantCulture)
                + " region=" + NormalizeOptional(recipe.region)
                + " texture=" + NormalizeOptional(recipe.texture)
                + " sample=" + NormalizeOptional(recipe.sample)
                + " textureMode=" + NormalizeOptional(recipe.textureMode)
                + " maskTextureId=" + NormalizeOptional(recipe.maskTextureId));

            foreach (ParsedRecipeLayer layer in layers)
            {
                Debug.Log(
                    "[E4] region_dispatch"
                    + " region=" + layer.Region
                    + " legacyLayer=" + layer.LegacyLayer
                    + " id=" + layer.Id
                    + " color=" + layer.ColorHex
                    + " opacity=" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
                    + " texture=" + layer.TextureSample
                    + " textureMode=" + layer.TextureMode
                    + " blendMode=" + layer.BlendMode
                    + " recipeBatchId=" + layer.RecipeBatchId
                    + " activeRegions=" + layer.ActiveRegions
                    + " enabledLayerCount=" + layer.EnabledLayerCount.ToString(CultureInfo.InvariantCulture)
                    + " payloadBytes=" + layer.PayloadBytes.ToString(CultureInfo.InvariantCulture)
                    + " rendererMode=" + layer.RendererMode
                    + " maskTextureId=" + layer.MaskTextureId
                    + " enabled=" + layer.Enabled.ToString().ToLowerInvariant());

                Debug.Log(
                    "[E4] texture_dispatch"
                    + " region=" + layer.Region
                    + " texture=" + layer.TextureSample
                    + " sample=" + layer.TextureSample
                    + " mode=" + layer.TextureMode
                    + " intensity=" + layer.Intensity.ToString("0.##", CultureInfo.InvariantCulture)
                    + " feather=" + layer.Feather.ToString("0.##", CultureInfo.InvariantCulture)
                    + " blendMode=" + layer.BlendMode);

                E3RegionMaskOverlay.RegionApplyResult result = ApplyRegionLayer(layer);
                long appliedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                int appliedFrame = Time.frameCount;
                RememberRegionFeatureState(layer, result);
                LogRecipeApplied("message", layer, result, appliedAtMs, appliedFrame);
                SendRecipeAppliedEvent(layer, result, appliedAtMs, appliedFrame);
            }
        }
        catch (Exception exception)
        {
            if (regionMaskOverlay != null)
            {
                regionMaskOverlay.ClearRecipesAndHideOverlays();
            }

            string rawPreview = json.Length > 768 ? json.Substring(0, 768) + "..." : json;
            Debug.LogError(
                "[E4] recipe_parse_failed"
                + " error=" + exception.Message
                + " payloadBytes=" + json.Length.ToString(CultureInfo.InvariantCulture)
                + " rawPreview=" + rawPreview);
        }
    }

    [Serializable]
    private sealed class FoundationParsingFramePayload
    {
        public int width;
        public int height;
        public string skinMaskBase64;
        public string hairMaskBase64;
        public string lipMaskBase64;
        public string eyeMaskBase64;
        public string browMaskBase64;
        public string occlusionMaskBase64;
        public string confidenceBase64;
    }

    /// <summary>
    /// Receives one face-parsing frame from the native CoreML/Vision module
    /// (single-channel R8 buffers per class, base64-encoded, screen-aligned,
    /// bottom-up row order). See BridgeFaceParsingProvider for the contract.
    /// </summary>
    public void ApplyFoundationParsingFrameJson(string json)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Foundation parsing frame JSON is empty.");
            }

            FoundationParsingFramePayload payload =
                JsonUtility.FromJson<FoundationParsingFramePayload>(json);
            if (payload == null)
            {
                throw new ArgumentException("Foundation parsing frame JSON did not parse.");
            }

            BridgeFaceParsingProvider.IngestFrame(
                payload.width,
                payload.height,
                DecodeMaskBase64(payload.skinMaskBase64),
                DecodeMaskBase64(payload.hairMaskBase64),
                DecodeMaskBase64(payload.lipMaskBase64),
                DecodeMaskBase64(payload.eyeMaskBase64),
                DecodeMaskBase64(payload.browMaskBase64),
                DecodeMaskBase64(payload.occlusionMaskBase64),
                DecodeMaskBase64(payload.confidenceBase64));
        }
        catch (Exception exception)
        {
            Debug.LogError(
                "[FoundationSegmentation] parsing_frame_apply_failed error=" + exception.Message
                + " payloadBytes=" + (json == null ? 0 : json.Length).ToString(CultureInfo.InvariantCulture));
        }
    }

    private static byte[] DecodeMaskBase64(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        try
        {
            return Convert.FromBase64String(value);
        }
        catch (FormatException)
        {
            return null;
        }
    }

    public void ApplyGeneratedLipMaskJson(string json)
    {
        GeneratedLipMaskPayload payload = null;
        string maskTextureId = "none";

        try
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Generated lip mask JSON is empty.");
            }

            payload = JsonUtility.FromJson<GeneratedLipMaskPayload>(json);
            if (payload == null)
            {
                throw new ArgumentException("Generated lip mask JSON did not parse into a payload.");
            }

            if (payload.schemaVersion != "e7-generated-lip-mask-runtime-payload-v0")
            {
                throw new ArgumentException("Unsupported generated lip mask schemaVersion: " + NormalizeOptional(payload.schemaVersion));
            }

            if (!payload.localOnly)
            {
                throw new ArgumentException("Generated lip mask payload must be localOnly=true.");
            }

            if (payload.offDeviceUpload)
            {
                throw new ArgumentException("Generated lip mask payload must be offDeviceUpload=false.");
            }

            if (payload.longTermRawFrameStored)
            {
                throw new ArgumentException("Generated lip mask payload must be longTermRawFrameStored=false.");
            }

            if (payload.provider != "vision" && payload.provider != "mediapipe")
            {
                throw new ArgumentException("Unsupported generated lip mask provider: " + NormalizeOptional(payload.provider));
            }

            if (payload.expressionMode != "uvOnly" && payload.expressionMode != "blendshapeAssist")
            {
                throw new ArgumentException("Unsupported generated lip mask expressionMode: " + NormalizeOptional(payload.expressionMode));
            }

            bool hasRawMaskPayload = !string.IsNullOrWhiteSpace(payload.maskRawRgbaBase64);
            if (hasRawMaskPayload && payload.maskTextureEncoding != "raw_rgba_base64")
            {
                throw new ArgumentException("Generated lip mask texture encoding must be raw_rgba_base64 when raw RGBA is provided.");
            }

            maskTextureId = NormalizeOptional(payload.maskTextureId, payload.generatedMaskId, "none");
            EnsureRegionMaskOverlay();
            if (regionMaskOverlay == null)
            {
                throw new InvalidOperationException("E3 region mask overlay is unavailable.");
            }

            regionMaskOverlay.SetOverlayRenderingSuppressed(false, "generated_lip_mask_apply");

            if (hasRawMaskPayload)
            {
                regionMaskOverlay.RegisterGeneratedLipMaskTexture(
                    maskTextureId,
                    payload.maskRawRgbaBase64,
                    payload.maskTextureWidth,
                    payload.maskTextureHeight);
            }

            ParsedRecipeLayer layer = BuildGeneratedLipMaskLayer(payload, maskTextureId, json.Length);
            pendingGeneratedLipMaskApply = new PendingGeneratedLipMaskApply
            {
                Payload = payload,
                Layer = layer,
                PayloadBytes = json.Length,
                RawMaskProvided = hasRawMaskPayload,
                ReceivedAtSeconds = Time.realtimeSinceStartup
            };
            generatedLipMaskRetryRequested = true;
            TryApplyPendingGeneratedLipMask("received", true);

            Debug.Log(
                "[E7] generated_lip_mask_apply_received"
                + " provider=" + payload.provider
                + " expressionMode=" + payload.expressionMode
                + " generatedMaskId=" + NormalizeOptional(payload.generatedMaskId)
                + " maskTextureId=" + maskTextureId
                + " runtimeReady=" + payload.runtimeReady.ToString().ToLowerInvariant()
                + " rawMaskProvided=" + hasRawMaskPayload.ToString().ToLowerInvariant()
                + " validationVisible=" + layer.ValidationVisible.ToString().ToLowerInvariant()
                + " validationStrongMode=" + layer.ValidationStrongMode.ToString().ToLowerInvariant()
                + " validationMode=" + layer.ValidationMode
                + " validationColor=" + layer.ColorHex
                + " validationOpacity=" + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
                + " effectiveOpacity=" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
                + " boundaryDebugVisible=" + layer.BoundaryDebugVisible.ToString().ToLowerInvariant()
                + " queued=true");
        }
        catch (Exception exception)
        {
            Debug.LogError(
                "[E7] generated_lip_mask_apply_failed"
                + " payloadBytes=" + (json == null ? 0 : json.Length).ToString(CultureInfo.InvariantCulture)
                + " error=" + exception.Message);
            SendAndPersistGeneratedLipMaskAppliedEvent(
                "{\"type\":\"generated_lip_mask_applied\",\"status\":\"blocked\""
                + ",\"blockedReason\":\"" + EscapeJsonString(BuildGeneratedLipMaskExceptionBlockedReason(exception)) + "\""
                + ",\"error\":\""
                + EscapeJsonString(exception.Message)
                + "\",\"provider\":\"" + EscapeJsonString(payload != null ? NormalizeOptional(payload.provider) : "none") + "\""
                + ",\"expressionMode\":\"" + EscapeJsonString(payload != null ? NormalizeOptional(payload.expressionMode) : "none") + "\""
                + ",\"generatedMaskId\":\"" + EscapeJsonString(payload != null ? NormalizeOptional(payload.generatedMaskId) : "none") + "\""
                + ",\"captureSetId\":\"" + EscapeJsonString(payload != null ? NormalizeOptional(payload.captureSetId) : "none") + "\""
                + ",\"maskTextureId\":\"" + EscapeJsonString(maskTextureId) + "\""
                + ",\"payloadBytes\":" + (json == null ? 0 : json.Length).ToString(CultureInfo.InvariantCulture)
                + ",\"faceCount\":0"
                + ",\"maskTriangles\":0"
                + ",\"uvAvailable\":false"
                + ",\"trackingState\":\"None\""
                + ",\"meshVertexCount\":0"
                + ",\"meshIndexCount\":0"
                + ",\"meshUvCount\":0"
                + "}");
        }
    }

    public void ApplyGeneratedBrowMaskJson(string json)
    {
        GeneratedBrowMaskPayload payload = null;
        string maskTextureId = "none";

        try
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Generated brow mask JSON is empty.");
            }

            payload = JsonUtility.FromJson<GeneratedBrowMaskPayload>(json);
            if (payload == null)
            {
                throw new ArgumentException("Generated brow mask JSON did not parse into a payload.");
            }

            if (payload.schemaVersion != "e7-generated-brow-mask-runtime-payload-v0")
            {
                throw new ArgumentException("Unsupported generated brow mask schemaVersion: " + NormalizeOptional(payload.schemaVersion));
            }

            if (!payload.localOnly)
            {
                throw new ArgumentException("Generated brow mask payload must be localOnly=true.");
            }

            if (payload.offDeviceUpload)
            {
                throw new ArgumentException("Generated brow mask payload must be offDeviceUpload=false.");
            }

            if (payload.longTermRawFrameStored)
            {
                throw new ArgumentException("Generated brow mask payload must be longTermRawFrameStored=false.");
            }

            if (payload.provider != "vision" && payload.provider != "mediapipe")
            {
                throw new ArgumentException("Unsupported generated brow mask provider: " + NormalizeOptional(payload.provider));
            }

            bool hasRawMaskPayload = !string.IsNullOrWhiteSpace(payload.maskRawRgbaBase64);
            if (hasRawMaskPayload && payload.maskTextureEncoding != "raw_rgba_base64")
            {
                throw new ArgumentException("Generated brow mask texture encoding must be raw_rgba_base64 when raw RGBA is provided.");
            }

            maskTextureId = NormalizeOptional(payload.maskTextureId, payload.generatedMaskId, "none");
            EnsureRegionMaskOverlay();
            if (regionMaskOverlay == null)
            {
                throw new InvalidOperationException("E3 region mask overlay is unavailable.");
            }

            regionMaskOverlay.SetOverlayRenderingSuppressed(false, "generated_brow_mask_apply");

            if (hasRawMaskPayload)
            {
                bool registered = regionMaskOverlay.RegisterGeneratedBrowMaskTexture(
                    maskTextureId,
                    payload.maskRawRgbaBase64,
                    payload.maskTextureWidth,
                    payload.maskTextureHeight);
                if (!registered)
                {
                    throw new InvalidOperationException("Generated brow mask texture registration failed.");
                }
            }

            ParsedRecipeLayer layer = BuildGeneratedBrowMaskLayer(payload, maskTextureId, json.Length);
            pendingGeneratedBrowMaskApply = new PendingGeneratedBrowMaskApply
            {
                Payload = payload,
                Layer = layer,
                PayloadBytes = json.Length,
                RawMaskProvided = hasRawMaskPayload,
                ReceivedAtSeconds = Time.realtimeSinceStartup
            };
            generatedBrowMaskRetryRequested = true;
            TryApplyPendingGeneratedBrowMask("received", true);

            Debug.Log(
                "[E7] generated_brow_mask_apply_received"
                + " provider=" + payload.provider
                + " generatedMaskId=" + NormalizeOptional(payload.generatedMaskId)
                + " maskTextureId=" + maskTextureId
                + " shapeId=" + NormalizeOptional(payload.shapeId)
                + " runtimeReady=" + payload.runtimeReady.ToString().ToLowerInvariant()
                + " rawMaskProvided=" + hasRawMaskPayload.ToString().ToLowerInvariant()
                + " validationVisible=" + layer.ValidationVisible.ToString().ToLowerInvariant()
                + " validationStrongMode=" + layer.ValidationStrongMode.ToString().ToLowerInvariant()
                + " validationMode=" + layer.ValidationMode
                + " validationColor=" + layer.ColorHex
                + " validationOpacity=" + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
                + " effectiveOpacity=" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
                + " strandTextureAmount=" + layer.TextureAmount.ToString("0.##", CultureInfo.InvariantCulture)
                + " debugMode=" + payload.debugMode.ToString(CultureInfo.InvariantCulture)
                + " debugShowLeftRight=" + payload.debugShowLeftRight.ToString().ToLowerInvariant()
                + " debugExaggerate=" + payload.debugExaggerate.ToString().ToLowerInvariant()
                + " queued=true");
        }
        catch (Exception exception)
        {
            Debug.LogError(
                "[E7] generated_brow_mask_apply_failed"
                + " payloadBytes=" + (json == null ? 0 : json.Length).ToString(CultureInfo.InvariantCulture)
                + " error=" + exception.Message);
            SendAndPersistGeneratedBrowMaskAppliedEvent(
                "{\"type\":\"generated_brow_mask_applied\",\"status\":\"blocked\""
                + ",\"blockedReason\":\"" + EscapeJsonString(BuildGeneratedBrowMaskExceptionBlockedReason(exception)) + "\""
                + ",\"error\":\""
                + EscapeJsonString(exception.Message)
                + "\",\"provider\":\"" + EscapeJsonString(payload != null ? NormalizeOptional(payload.provider) : "none") + "\""
                + ",\"generatedMaskId\":\"" + EscapeJsonString(payload != null ? NormalizeOptional(payload.generatedMaskId) : "none") + "\""
                + ",\"captureSetId\":\"" + EscapeJsonString(payload != null ? NormalizeOptional(payload.captureSetId) : "none") + "\""
                + ",\"maskTextureId\":\"" + EscapeJsonString(maskTextureId) + "\""
                + ",\"payloadBytes\":" + (json == null ? 0 : json.Length).ToString(CultureInfo.InvariantCulture)
                + ",\"faceCount\":0"
                + ",\"maskTriangles\":0"
                + ",\"uvAvailable\":false"
                + ",\"trackingState\":\"None\""
                + ",\"meshVertexCount\":0"
                + ",\"meshIndexCount\":0"
                + ",\"meshUvCount\":0"
                + "}");
        }
    }

    public void SendFaceDetectedEvent(
        bool tracked,
        int faceCount,
        int totalTrackables,
        string trackingStates)
    {
        SendUnityEvent(
            "{\"type\":\"face_detected\",\"tracked\":"
            + tracked.ToString().ToLowerInvariant()
            + ",\"faceCount\":"
            + faceCount.ToString(CultureInfo.InvariantCulture)
            + ",\"totalTrackables\":"
            + totalTrackables.ToString(CultureInfo.InvariantCulture)
            + ",\"trackingStates\":\""
            + EscapeJsonString(trackingStates)
            + "\""
            + "}");
    }

    public void SendFaceLifecycleEvent(string json)
    {
        SendUnityEvent(json, "[E2]");
    }

    public void SendFaceFeatureSnapshotEvent(string json)
    {
        SendUnityEvent(json, "[E5]");
    }

    public void SendE7MetricSampleEvent(string json)
    {
        SendUnityEvent(json, "[E7]");
    }

    public void SendE7ReferenceCaptureEvent(string json)
    {
        SendUnityEvent(json, "[E7]");
    }

    public void SendE7VisionLipBoundaryEvent(string json)
    {
        SendUnityEvent(json, "[E7]");
    }

    public void SetE7RegionOverlayVisibleJson(string json)
    {
        try
        {
            RegionOverlayVisibilityPayload payload =
                JsonUtility.FromJson<RegionOverlayVisibilityPayload>(json);
            bool visible = payload == null || payload.visible;
            string validationViewMode = payload != null ? NormalizeOptional(payload.validationViewMode) : "unknown";
            bool unityDebugVisible = visible && validationViewMode == "full";

            EnsureRegionMaskOverlay();
            if (regionMaskOverlay == null)
            {
                throw new InvalidOperationException("E3 region mask overlay is unavailable.");
            }

            regionMaskOverlay.SetOverlayRenderingSuppressed(
                !visible,
                payload != null ? payload.reason : "region_overlay_visibility");
            SetFaceRenderersSuppressed(true);

            if (statusReporter != null)
            {
                statusReporter.SetDebugOverlayVisible(unityDebugVisible);
            }

            Debug.Log(
                "[E7] region_overlay_visibility"
                + " visible=" + visible.ToString().ToLowerInvariant()
                + " faceDebugSurfaceSuppressed=true"
                + " unityDebugVisible=" + unityDebugVisible.ToString().ToLowerInvariant()
                + " validationViewMode=" + validationViewMode
                + " reason=" + NormalizeOptional(payload != null ? payload.reason : string.Empty));
        }
        catch (Exception exception)
        {
            Debug.LogError("[E7] region_overlay_visibility_failed raw=" + json + " error=" + exception.Message);
        }
    }

    public void CaptureE7ReferenceFrameJson(string json)
    {
        try
        {
            EnsureReferenceCaptureExporter();

            if (referenceCaptureExporter == null)
            {
                throw new InvalidOperationException("E7 reference capture exporter is unavailable.");
            }

            referenceCaptureExporter.CaptureReferenceFrameJson(json);
        }
        catch (Exception exception)
        {
            Debug.LogError("[E7] reference_capture_request_failed raw=" + json + " error=" + exception.Message);
            SendE7ReferenceCaptureEvent(
                "{\"type\":\"e7_reference_capture\""
                + ",\"status\":\"failed\""
                + ",\"capturePairId\":\"pair_face_0001\""
                + ",\"regions\":[\"lip\",\"eye\",\"cheek\"]"
                + ",\"relativeDirectory\":\"\""
                + ",\"detail\":\""
                + EscapeJsonString(exception.Message)
                + "\""
                + ",\"meshVertexCount\":0"
                + ",\"meshIndexCount\":0"
                + ",\"meshUvCount\":0"
                + ",\"frameWidth\":0"
                + ",\"coordinateSpaceValidated\":false"
                + ",\"coordinateSpaceValidationStatus\":\"request_failed\""
                + "}");
        }
    }

    public void LogRecipeAck(string json)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ArgumentException("Recipe ack JSON is empty.");
            }

            RecipeAckPayload ack = JsonUtility.FromJson<RecipeAckPayload>(json);
            if (ack == null)
            {
                throw new ArgumentException("Recipe ack JSON did not parse into a payload.");
            }

            double sendToAckLatencyMs = CalculateLatencyMs(ack.sentAtMs, ack.receivedAtMs);
            double unityApplyLatencyMs = CalculateLatencyMs(ack.sentAtMs, ack.appliedAtMs);
            double unityToRnReceiveLatencyMs = CalculateLatencyMs(ack.appliedAtMs, ack.receivedAtMs);

            Debug.Log(
                "[E7] recipe_latency"
                + " source=rn_ack"
                + " runId=" + NormalizeOptional(ack.runId)
                + " phase=" + NormalizeOptional(ack.phase)
                + " timestampMs=" + ack.receivedAtMs.ToString("0", CultureInfo.InvariantCulture)
                + " rendererMode=" + NormalizeOptional(ack.rendererMode)
                + " lookId=" + NormalizeOptional(ack.lookId)
                + " recipeId=" + NormalizeOptional(ack.recipeId)
                + " recipeBatchId=" + NormalizeOptional(ack.recipeBatchId)
                + " activeRegions=" + NormalizeOptional(ack.activeRegions)
                + " layerCount=" + ack.layerCount.ToString(CultureInfo.InvariantCulture)
                + " enabledLayerCount=" + ack.enabledLayerCount.ToString(CultureInfo.InvariantCulture)
                + " payloadBytes=" + ack.payloadBytes.ToString(CultureInfo.InvariantCulture)
                + " region=" + NormalizeOptional(ack.region)
                + " texture=" + NormalizeOptional(ack.texture)
                + " finish=" + NormalizeOptional(ack.finish)
                + " textureAmount=" + ack.textureAmount.ToString("0.##", CultureInfo.InvariantCulture)
                + " glossBoost=" + ack.glossBoost.ToString("0.##", CultureInfo.InvariantCulture)
                + " coverage=" + ack.coverage.ToString("0.##", CultureInfo.InvariantCulture)
                + " feather=" + ack.feather.ToString("0.##", CultureInfo.InvariantCulture)
                + " sentAtMs=" + ack.sentAtMs.ToString("0", CultureInfo.InvariantCulture)
                + " appliedAtMs=" + ack.appliedAtMs.ToString("0", CultureInfo.InvariantCulture)
                + " appliedFrame=" + ack.appliedFrame.ToString(CultureInfo.InvariantCulture)
                + " receivedAtMs=" + ack.receivedAtMs.ToString("0", CultureInfo.InvariantCulture)
                + " sendToAckLatencyMs=" + sendToAckLatencyMs.ToString("0", CultureInfo.InvariantCulture)
                + " unityApplyLatencyMs=" + unityApplyLatencyMs.ToString("0", CultureInfo.InvariantCulture)
                + " unityToRnReceiveLatencyMs=" + unityToRnReceiveLatencyMs.ToString("0", CultureInfo.InvariantCulture)
                + " visualLatencyConfirmedByRecording="
                + ack.visualLatencyConfirmedByRecording.ToString().ToLowerInvariant()
                + " visualLatencyObservation="
                + NormalizeOptional(ack.visualLatencyObservation));
        }
        catch (Exception exception)
        {
            Debug.LogError("[E7] recipe_latency_ack_failed raw=" + json + " error=" + exception.Message);
        }
    }

    public string BuildFaceFeatureRegionSnapshotJsonFragment()
    {
        string activeRegionSummary = BuildActiveRegionSummary();
        string appliedTextureSampleSummary = BuildAppliedTextureSampleSummary();

        return "\"activeRegions\":" + BuildActiveRegionsJson()
            + ",\"appliedTextureSamples\":" + BuildAppliedTextureSamplesJson()
            + ",\"activeRegionSummary\":\"" + EscapeJsonString(activeRegionSummary) + "\""
            + ",\"appliedTextureSampleSummary\":\"" + EscapeJsonString(appliedTextureSampleSummary) + "\""
            + ",\"regions\":" + BuildRegionsJson();
    }

    public string BuildFaceFeatureRegionSnapshotLogFields()
    {
        return " activeRegions=" + NormalizeOptional(BuildActiveRegionSummary())
            + " appliedTextureSampleSummary=" + NormalizeOptional(BuildAppliedTextureSampleSummary());
    }

    private void RefreshSceneReferences()
    {
        if (faceManager == null)
        {
            faceManager = FindFirstObjectByType<ARFaceManager>();
        }

        SubscribeGeneratedLipFaceManager();

        if (statusReporter == null)
        {
            statusReporter = FindFirstObjectByType<FaceTrackingStatusReporter>();
        }

        if (overlayMaterial == null && faceManager != null && faceManager.facePrefab != null)
        {
            MeshRenderer prefabRenderer = faceManager.facePrefab.GetComponentInChildren<MeshRenderer>(true);
            if (prefabRenderer != null)
            {
                overlayMaterial = prefabRenderer.sharedMaterial;
            }
        }

        SuppressFacePrefabDebugSurface();
    }

    private void SubscribeGeneratedLipFaceManager()
    {
        if (faceManager == null || subscribedGeneratedLipFaceManager == faceManager)
        {
            return;
        }

        UnsubscribeGeneratedLipFaceManager();
        subscribedGeneratedLipFaceManager = faceManager;
        subscribedGeneratedLipFaceManager.trackablesChanged.AddListener(OnGeneratedLipFaceTrackablesChanged);
    }

    private void UnsubscribeGeneratedLipFaceManager()
    {
        if (subscribedGeneratedLipFaceManager == null)
        {
            return;
        }

        subscribedGeneratedLipFaceManager.trackablesChanged.RemoveListener(OnGeneratedLipFaceTrackablesChanged);
        subscribedGeneratedLipFaceManager = null;
    }

    private void OnGeneratedLipFaceTrackablesChanged(ARTrackablesChangedEventArgs<ARFace> args)
    {
        generatedLipMaskRetryRequested = true;
        generatedBrowMaskRetryRequested = true;
        TryApplyPendingGeneratedLipMask("faces_changed", true);
        TryApplyPendingGeneratedBrowMask("faces_changed", true);
    }

    private void EnsureRegionMaskOverlay()
    {
        RefreshSceneReferences();

        if (regionMaskOverlay == null)
        {
            regionMaskOverlay = FindFirstObjectByType<E3RegionMaskOverlay>();
        }

        if (regionMaskOverlay == null)
        {
            regionMaskOverlay = gameObject.AddComponent<E3RegionMaskOverlay>();
        }

        regionMaskOverlay.Configure(faceManager);
    }

    private void EnsureReferenceCaptureExporter()
    {
        RefreshSceneReferences();

        if (referenceCaptureExporter == null)
        {
            referenceCaptureExporter = FindFirstObjectByType<E7SynchronizedCaptureExporter>();
        }

        if (referenceCaptureExporter == null)
        {
            referenceCaptureExporter = gameObject.AddComponent<E7SynchronizedCaptureExporter>();
        }

        referenceCaptureExporter.Configure(
            faceManager,
            Camera.main,
            statusReporter,
            this);
    }

    private void SetFaceRenderersSuppressed(bool suppressed)
    {
        RefreshSceneReferences();
        faceRenderersSuppressed = suppressed;

        if (suppressed)
        {
            lastSuppressedFaceTrackableCount = -1;
            ApplyFaceRendererSuppression();
            return;
        }

        foreach (KeyValuePair<Renderer, bool> entry in suppressedFaceRendererStates)
        {
            if (entry.Key != null)
            {
                entry.Key.enabled = entry.Value;
            }
        }

        foreach (KeyValuePair<ARFaceMeshVisualizer, bool> entry in suppressedFaceVisualizerStates)
        {
            if (entry.Key != null)
            {
                entry.Key.enabled = entry.Value;
            }
        }

        suppressedFaceRendererStates.Clear();
        suppressedFaceVisualizerStates.Clear();
        lastSuppressedFaceTrackableCount = -1;
    }

    private bool ShouldRefreshFaceRendererSuppression()
    {
        if (faceManager == null)
        {
            RefreshSceneReferences();
            return faceManager != null;
        }

        int faceCount = CountFaceTrackables();
        if (faceCount != lastSuppressedFaceTrackableCount)
        {
            return true;
        }

        return false;
    }

    private void ApplyFaceRendererSuppression()
    {
        if (faceManager == null)
        {
            return;
        }

        lastSuppressedFaceTrackableCount = CountFaceTrackables();

        foreach (ARFace face in faceManager.trackables)
        {
            if (face == null)
            {
                continue;
            }

            ARFaceMeshVisualizer[] visualizers = face.GetComponentsInChildren<ARFaceMeshVisualizer>(true);
            foreach (ARFaceMeshVisualizer visualizer in visualizers)
            {
                if (visualizer == null)
                {
                    continue;
                }

                if (!suppressedFaceVisualizerStates.ContainsKey(visualizer))
                {
                    suppressedFaceVisualizerStates[visualizer] = visualizer.enabled;
                }

                visualizer.enabled = false;
            }

            Renderer[] renderers = face.GetComponentsInChildren<Renderer>(true);
            foreach (Renderer renderer in renderers)
            {
                if (renderer == null)
                {
                    continue;
                }

                if (IsRegionOverlayRenderer(renderer))
                {
                    continue;
                }

                if (!suppressedFaceRendererStates.ContainsKey(renderer))
                {
                    suppressedFaceRendererStates[renderer] = renderer.enabled;
                }

                renderer.enabled = false;
            }
        }
    }

    private void SuppressFacePrefabDebugSurface()
    {
        if (faceManager == null || faceManager.facePrefab == null)
        {
            return;
        }

        ARFaceMeshVisualizer[] visualizers = faceManager.facePrefab.GetComponentsInChildren<ARFaceMeshVisualizer>(true);
        foreach (ARFaceMeshVisualizer visualizer in visualizers)
        {
            if (visualizer != null)
            {
                visualizer.enabled = false;
            }
        }

        Renderer[] renderers = faceManager.facePrefab.GetComponentsInChildren<Renderer>(true);
        foreach (Renderer renderer in renderers)
        {
            if (renderer != null)
            {
                renderer.enabled = false;
            }
        }
    }

    private int CountFaceTrackables()
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

    private static bool IsRegionOverlayRenderer(Renderer renderer)
    {
        Transform current = renderer.transform;
        while (current != null)
        {
            if (current.name.StartsWith("E3 Region ", StringComparison.Ordinal))
            {
                return true;
            }

            current = current.parent;
        }

        return false;
    }

    private static ParsedRecipeLayer BuildGeneratedLipMaskLayer(
        GeneratedLipMaskPayload payload,
        string maskTextureId,
        int payloadBytes)
    {
        bool validationVisible = ResolveGeneratedLipValidationVisible(payload);
        bool strongValidationMode = ResolveGeneratedLipStrongValidationMode(payload);
        bool boundaryDebugVisible = ResolveGeneratedLipBoundaryDebugVisible(payload);
        string validationMode = ResolveGeneratedLipValidationMode(payload, strongValidationMode);
        string colorHex = ResolveGeneratedLipColorHex(payload, strongValidationMode);
        if (!ColorUtility.TryParseHtmlString(colorHex, out Color color))
        {
            throw new ArgumentException("invalid_validation_color_hex: " + NormalizeOptional(colorHex));
        }

        string textureSample = ResolveGeneratedLipTextureSample(payload);
        string finish = ResolveGeneratedLipFinish(payload, textureSample);
        string secondaryColorHex = ResolveGeneratedLipSecondaryColorHex(payload, colorHex, textureSample);
        if (!ColorUtility.TryParseHtmlString(secondaryColorHex, out Color secondaryColor))
        {
            secondaryColor = BuildGeneratedLipSecondaryColor(color);
        }

        double sentAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        float maskThreshold = payload.maskThreshold > 0.0f ? payload.maskThreshold : 0.5f;
        float maskFeather = payload.maskFeatherUvNormalized > 0.0f
            ? payload.maskFeatherUvNormalized
            : 0.07f;
        float validationOpacity = ResolveGeneratedLipValidationOpacity(payload, strongValidationMode);
        float effectiveOpacity = validationVisible ? validationOpacity : 0.0f;
        LipAdjustmentPayload adjustment = payload != null ? payload.adjustment : null;

        return new ParsedRecipeLayer
        {
            Id = "lip-generated-mask",
            Region = "lip",
            LegacyLayer = "lip",
            ColorHex = colorHex,
            Color = color,
            SecondaryColorHex = secondaryColorHex,
            SecondaryColor = secondaryColor,
            Opacity = effectiveOpacity,
            RecipeId = "e7-generated-lip-mask",
            RecipeBatchId = "e7-generated-lip-batch-" + Math.Round(sentAtMs).ToString(CultureInfo.InvariantCulture),
            LookId = "e7_generated_lip",
            SentAtMs = sentAtMs,
            ActiveRegions = "lip",
            LayerCount = 1,
            EnabledLayerCount = 1,
            PayloadBytes = payloadBytes,
            TextureSample = textureSample,
            TextureMode = "sample",
            Intensity = ResolveGeneratedLipPositive01(payload.intensity, 0.86f),
            Feather = payload.feather >= 0.0f
                ? Mathf.Clamp01(payload.feather)
                : (textureSample == "gradient_lip" ? 0.32f : 0.24f),
            BlendMode = NormalizeOptional(payload.blendMode, "multiply").Trim().ToLowerInvariant(),
            RendererMode = "smooth-region-mask",
            Enabled = true,
            Coverage = ResolveGeneratedLipPositive01(payload.coverage, 0.84f),
            Finish = finish,
            TextureAmount = ResolveGeneratedLipPositive01(
                payload.textureAmount,
                ResolveGeneratedLipDefaultTextureAmount(textureSample)),
            GradientAmount = ResolveGeneratedLipPositive01(
                payload.gradientAmount,
                textureSample == "gradient_lip" ? 0.82f : 0.08f),
            Roughness = ResolveGeneratedLipPositive01(
                payload.roughness,
                textureSample == "gloss_lip" ? 0.08f : 0.28f),
            Specular = ResolveGeneratedLipPositive01(
                payload.specular,
                textureSample == "gloss_lip" ? 0.34f : 0.08f),
            SpecularPower = payload.specularPower > 0.0f
                ? Mathf.Clamp(payload.specularPower, 1.0f, 128.0f)
                : (textureSample == "gloss_lip" ? 48.0f : 18.0f),
            GlossBoost = ResolveGeneratedLipPositive01(
                payload.glossBoost,
                textureSample == "gloss_lip" ? 0.34f : 0.0f),
            Shimmer = 0.0f,
            ShimmerColor = "#FFFFFF",
            SkinAdaptive = false,
            PreserveDetail = payload.preserveDetail,
            MaterialId = strongValidationMode
                ? "e7-generated-lip-strong-validation-material"
                : "e7-generated-lip-validation-material",
            ShaderMode = boundaryDebugVisible
                ? "smooth-region-mask-generated-uv-boundary-debug"
                : "smooth-region-mask-generated-uv",
            PassCount = 1,
            CandidateId = maskTextureId,
            MaskTextureId = maskTextureId,
            MaskThreshold = maskThreshold,
            MaskFeatherUvNormalized = maskFeather,
            CornerReach = adjustment != null ? Mathf.Clamp(adjustment.cornerReach, -1.0f, 1.0f) : 0.0f,
            UpperLipTightness = adjustment != null ? Mathf.Clamp(adjustment.upperLipTightness, -1.0f, 1.0f) : 0.0f,
            LowerLipTightness = adjustment != null ? Mathf.Clamp(adjustment.lowerLipTightness, -1.0f, 1.0f) : 0.0f,
            VerticalOffset = adjustment != null ? Mathf.Clamp(adjustment.verticalOffset, -1.0f, 1.0f) : 0.0f,
            CameraBackdropAvailable = false,
            LightEstimateAvailable = false,
            ValidationVisible = validationVisible,
            ValidationStrongMode = strongValidationMode,
            ValidationMode = validationMode,
            ValidationOpacity = validationOpacity,
            BoundaryDebugVisible = boundaryDebugVisible,
            BoundaryDebugMode = boundaryDebugVisible
                ? "requested_no_separate_boundary_renderer"
                : "none",
            ValidationControlRequestId = payload.controlRequestId != 0
                ? payload.controlRequestId
                : payload.validationControlRequestId,
            ValidationControlRevision = payload.controlRevision != 0
                ? payload.controlRevision
                : payload.validationControlRevision
        };
    }

    private static bool ResolveGeneratedLipValidationVisible(GeneratedLipMaskPayload payload)
    {
        return payload == null
            || (payload.visible
                && payload.maskVisible
                && payload.validationVisible
                && payload.enabled);
    }

    private static bool ResolveGeneratedLipStrongValidationMode(GeneratedLipMaskPayload payload)
    {
        if (payload == null)
        {
            return false;
        }

        return payload.strongValidationMode
            || payload.validationStrongMode
            || payload.validationStrong
            || payload.strongMode
            || IsStrongValidationToken(payload.validationMode)
            || IsStrongValidationToken(payload.validationViewMode);
    }

    private static bool ResolveGeneratedLipBoundaryDebugVisible(GeneratedLipMaskPayload payload)
    {
        return payload != null
            && (payload.boundaryDebugVisible
                || payload.boundaryDebug
                || payload.debugBoundary
                || payload.showBoundary
                || payload.debugOverlayVisible
                || IsBoundaryDebugToken(payload.validationMode)
                || IsBoundaryDebugToken(payload.validationViewMode));
    }

    private static string ResolveGeneratedLipValidationMode(
        GeneratedLipMaskPayload payload,
        bool strongValidationMode)
    {
        string value = NormalizeOptional(
            payload != null ? payload.validationMode : string.Empty,
            payload != null ? payload.validationViewMode : string.Empty,
            strongValidationMode ? "strong" : "standard");

        value = value.Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(value)
            ? (strongValidationMode ? "strong" : "standard")
            : SanitizeLogValue(value);
    }

    private static string ResolveGeneratedLipColorHex(
        GeneratedLipMaskPayload payload,
        bool strongValidationMode)
    {
        string value = NormalizeOptional(
            payload != null ? payload.validationColorHex : string.Empty,
            payload != null ? payload.validationColor : string.Empty,
            payload != null ? payload.colorHex : string.Empty,
            payload != null ? payload.color : string.Empty,
            strongValidationMode ? "#FF2D55" : "#C76B74");

        value = value.Trim();
        if (!value.StartsWith("#", StringComparison.Ordinal)
            && (value.Length == 6 || value.Length == 8))
        {
            value = "#" + value;
        }

        return value.ToUpperInvariant();
    }

    private static float ResolveGeneratedLipValidationOpacity(
        GeneratedLipMaskPayload payload,
        bool strongValidationMode)
    {
        float defaultOpacity = 0.88f;

        if (payload == null)
        {
            return defaultOpacity;
        }

        if (payload.validationOpacity >= 0.0f)
        {
            return Mathf.Clamp01(payload.validationOpacity);
        }

        if (payload.maskOpacity >= 0.0f)
        {
            return Mathf.Clamp01(payload.maskOpacity);
        }

        if (payload.opacity >= 0.0f)
        {
            return Mathf.Clamp01(payload.opacity);
        }

        return defaultOpacity;
    }

    private static string ResolveGeneratedLipTextureSample(GeneratedLipMaskPayload payload)
    {
        string value = NormalizeOptional(
            payload != null ? payload.texture : string.Empty,
            payload != null ? payload.sample : string.Empty,
            "matte_lip");
        value = value.Trim().ToLowerInvariant();

        if (value == "matte"
            || value == "matte-lip"
            || value == "matte_lip")
        {
            return "matte_lip";
        }

        if (value == "glow"
            || value == "gloss"
            || value == "gloss-lip"
            || value == "gloss_lip")
        {
            return "gloss_lip";
        }

        if (value == "gradient"
            || value == "gradient-lip"
            || value == "gradient_lip")
        {
            return "gradient_lip";
        }

        if (value == "full"
            || value == "full-lip"
            || value == "full_lip")
        {
            return "full_lip";
        }

        if (value == "overline"
            || value == "overline-lip"
            || value == "overline_lip")
        {
            return "overline_lip";
        }

        return "matte_lip";
    }

    private static string ResolveGeneratedLipFinish(GeneratedLipMaskPayload payload, string textureSample)
    {
        string value = NormalizeOptional(payload != null ? payload.finish : string.Empty, string.Empty);
        value = value.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(value) && value != "none")
        {
            return value;
        }

        switch (textureSample)
        {
            case "gloss_lip":
                return "gloss";
            case "gradient_lip":
                return "gradient";
            case "full_lip":
                return "cream";
            default:
                return "matte";
        }
    }

    private static string ResolveGeneratedLipSecondaryColorHex(
        GeneratedLipMaskPayload payload,
        string colorHex,
        string textureSample)
    {
        string value = NormalizeOptional(
            payload != null ? payload.secondaryColorHex : string.Empty,
            payload != null ? payload.secondaryColor : string.Empty,
            string.Empty);
        value = value.Trim();
        if (!string.IsNullOrWhiteSpace(value) && value != "none")
        {
            if (!value.StartsWith("#", StringComparison.Ordinal)
                && (value.Length == 6 || value.Length == 8))
            {
                value = "#" + value;
            }

            return value.ToUpperInvariant();
        }

        if (ColorUtility.TryParseHtmlString(colorHex, out Color color))
        {
            Color secondaryColor = BuildGeneratedLipSecondaryColor(color);
            return "#"
                + Mathf.RoundToInt(secondaryColor.r * 255.0f).ToString("X2", CultureInfo.InvariantCulture)
                + Mathf.RoundToInt(secondaryColor.g * 255.0f).ToString("X2", CultureInfo.InvariantCulture)
                + Mathf.RoundToInt(secondaryColor.b * 255.0f).ToString("X2", CultureInfo.InvariantCulture);
        }

        return textureSample == "gradient_lip" ? "#F29BAA" : colorHex;
    }

    private static Color BuildGeneratedLipSecondaryColor(Color color)
    {
        return new Color(
            Mathf.Clamp01(color.r + (1.0f - color.r) * 0.34f),
            Mathf.Clamp01(color.g + (1.0f - color.g) * 0.34f),
            Mathf.Clamp01(color.b + (1.0f - color.b) * 0.34f),
            1.0f);
    }

    private static float ResolveGeneratedLipPositive01(float value, float defaultValue)
    {
        return value >= 0.0f ? Mathf.Clamp01(value) : Mathf.Clamp01(defaultValue);
    }

    private static float ResolveGeneratedLipDefaultTextureAmount(string textureSample)
    {
        switch (textureSample)
        {
            case "gloss_lip":
                return 0.26f;
            case "gradient_lip":
                return 0.22f;
            case "full_lip":
                return 0.18f;
            case "overline_lip":
                return 0.10f;
            default:
                return 0.16f;
        }
    }

    private static ParsedRecipeLayer BuildGeneratedBrowMaskLayer(
        GeneratedBrowMaskPayload payload,
        string maskTextureId,
        int payloadBytes)
    {
        bool validationVisible = ResolveGeneratedBrowValidationVisible(payload);
        bool strongValidationMode = ResolveGeneratedBrowStrongValidationMode(payload);
        string validationMode = ResolveGeneratedBrowValidationMode(payload, strongValidationMode);
        string colorHex = ResolveGeneratedBrowColorHex(payload, strongValidationMode);
        if (!ColorUtility.TryParseHtmlString(colorHex, out Color color))
        {
            throw new ArgumentException("invalid_validation_color_hex: " + NormalizeOptional(colorHex));
        }

        double sentAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        float maskThreshold = payload.maskThreshold > 0.0f ? payload.maskThreshold : 0.34f;
        float maskFeather = payload.maskFeatherUvNormalized > 0.0f
            ? payload.maskFeatherUvNormalized
            : 0.30f;
        float validationOpacity = ResolveGeneratedBrowValidationOpacity(payload, strongValidationMode);
        float effectiveOpacity = validationVisible ? validationOpacity : 0.0f;
        float strandTextureAmount = ResolveGeneratedBrowPositive01(
            payload.strandTextureAmount,
            ResolveGeneratedBrowPositive01(payload.textureAmount, 0.72f));
        string textureSample = ResolveGeneratedBrowTextureSample(payload);
        string finish = ResolveGeneratedBrowFinish(payload, textureSample);

        return new ParsedRecipeLayer
        {
            Id = "brow-generated-mask",
            Region = "brow",
            LegacyLayer = "brow",
            ColorHex = colorHex,
            Color = color,
            SecondaryColorHex = colorHex,
            SecondaryColor = color,
            Opacity = effectiveOpacity,
            RecipeId = "e7-generated-brow-mask",
            RecipeBatchId = "e7-generated-brow-batch-" + Math.Round(sentAtMs).ToString(CultureInfo.InvariantCulture),
            LookId = "e7_generated_brow",
            SentAtMs = sentAtMs,
            ActiveRegions = "brow",
            LayerCount = 1,
            EnabledLayerCount = 1,
            PayloadBytes = payloadBytes,
            TextureSample = textureSample,
            TextureMode = "sample",
            Intensity = ResolveGeneratedBrowPositive01(payload.intensity, 0.78f),
            Feather = payload.feather >= 0.0f
                ? Mathf.Clamp01(payload.feather)
                : 0.34f,
            BlendMode = NormalizeOptional(payload.blendMode, "normal").Trim().ToLowerInvariant(),
            RendererMode = "smooth-region-mask",
            Enabled = validationVisible,
            Coverage = ResolveGeneratedBrowPositive01(payload.coverage, 0.90f),
            Finish = finish,
            TextureAmount = strandTextureAmount,
            GradientAmount = ResolveGeneratedBrowPositive01(payload.cleanupStrength, 0.0f),
            Roughness = ResolveGeneratedBrowPositive01(payload.roughness, 0.36f),
            Specular = ResolveGeneratedBrowPositive01(payload.specular, 0.03f),
            SpecularPower = payload.specularPower > 0.0f
                ? Mathf.Clamp(payload.specularPower, 1.0f, 128.0f)
                : 10.0f,
            GlossBoost = ResolveGeneratedBrowPositive01(payload.neutralizeStrength, 0.0f),
            Shimmer = 0.0f,
            ShimmerColor = "#FFFFFF",
            SkinAdaptive = false,
            PreserveDetail = payload.preserveDetail,
            MaterialId = "e7-generated-brow-validation-material",
            ShaderMode = "smooth-region-mask-generated-brow-uv",
            PassCount = 1,
            CandidateId = maskTextureId,
            MaskTextureId = maskTextureId,
            MaskThreshold = maskThreshold,
            MaskFeatherUvNormalized = maskFeather,
            CornerReach = 0.0f,
            UpperLipTightness = 0.0f,
            LowerLipTightness = 0.0f,
            VerticalOffset = 0.0f,
            CameraBackdropAvailable = false,
            LightEstimateAvailable = false,
            ValidationVisible = validationVisible,
            ValidationStrongMode = strongValidationMode,
            ValidationMode = validationMode,
            ValidationOpacity = validationOpacity,
            BoundaryDebugVisible = false,
            BoundaryDebugMode = "none",
            ValidationControlRequestId = payload.controlRequestId != 0
                ? payload.controlRequestId
                : payload.validationControlRequestId,
            ValidationControlRevision = payload.controlRevision != 0
                ? payload.controlRevision
                : payload.validationControlRevision,
            DebugMode = Mathf.Clamp(payload.debugMode, 0, 6),
            DebugShowLeftRight = payload.debugShowLeftRight,
            DebugExaggerate = payload.debugExaggerate
        };
    }

    private static bool ResolveGeneratedBrowValidationVisible(GeneratedBrowMaskPayload payload)
    {
        return payload == null
            || (payload.visible
                && payload.maskVisible
                && payload.validationVisible
                && payload.enabled);
    }

    private static bool ResolveGeneratedBrowStrongValidationMode(GeneratedBrowMaskPayload payload)
    {
        if (payload == null)
        {
            return false;
        }

        return payload.strongValidationMode
            || payload.validationStrongMode
            || payload.validationStrong
            || payload.strongMode
            || IsStrongValidationToken(payload.validationMode)
            || IsStrongValidationToken(payload.validationViewMode);
    }

    private static string ResolveGeneratedBrowValidationMode(
        GeneratedBrowMaskPayload payload,
        bool strongValidationMode)
    {
        string value = NormalizeOptional(
            payload != null ? payload.validationMode : string.Empty,
            payload != null ? payload.validationViewMode : string.Empty,
            strongValidationMode ? "strong" : "standard");

        value = value.Trim().ToLowerInvariant();
        return string.IsNullOrWhiteSpace(value)
            ? (strongValidationMode ? "strong" : "standard")
            : SanitizeLogValue(value);
    }

    private static string ResolveGeneratedBrowColorHex(
        GeneratedBrowMaskPayload payload,
        bool strongValidationMode)
    {
        string value = NormalizeOptional(
            payload != null ? payload.validationColorHex : string.Empty,
            payload != null ? payload.validationColor : string.Empty,
            payload != null ? payload.colorHex : string.Empty,
            payload != null ? payload.color : string.Empty,
            strongValidationMode ? "#2B1F1A" : "#4A342B");

        value = value.Trim();
        if (!value.StartsWith("#", StringComparison.Ordinal)
            && (value.Length == 6 || value.Length == 8))
        {
            value = "#" + value;
        }

        return value.ToUpperInvariant();
    }

    private static float ResolveGeneratedBrowValidationOpacity(
        GeneratedBrowMaskPayload payload,
        bool strongValidationMode)
    {
        float defaultOpacity = strongValidationMode ? 0.92f : 0.78f;

        if (payload == null)
        {
            return defaultOpacity;
        }

        if (payload.validationOpacity >= 0.0f)
        {
            return Mathf.Clamp01(payload.validationOpacity);
        }

        if (payload.maskOpacity >= 0.0f)
        {
            return Mathf.Clamp01(payload.maskOpacity);
        }

        if (payload.opacity >= 0.0f)
        {
            return Mathf.Clamp01(payload.opacity);
        }

        return defaultOpacity;
    }

    private static string ResolveGeneratedBrowTextureSample(GeneratedBrowMaskPayload payload)
    {
        string value = NormalizeOptional(
            payload != null ? payload.texture : string.Empty,
            payload != null ? payload.sample : string.Empty,
            "natural_brow");
        value = value.Trim().ToLowerInvariant();

        if (value == "natural"
            || value == "natural-brow"
            || value == "natural_brow"
            || value == "hair"
            || value == "hair-stroke-brow"
            || value == "hair_stroke_brow")
        {
            return "natural_brow";
        }

        return "natural_brow";
    }

    private static string ResolveGeneratedBrowFinish(GeneratedBrowMaskPayload payload, string textureSample)
    {
        string value = NormalizeOptional(payload != null ? payload.finish : string.Empty, string.Empty);
        value = value.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(value) && value != "none")
        {
            return value;
        }

        return textureSample == "natural_brow" ? "hair-stroke-brow" : "soft-powder-brow";
    }

    private static float ResolveGeneratedBrowPositive01(float value, float defaultValue)
    {
        return value >= 0.0f ? Mathf.Clamp01(value) : Mathf.Clamp01(defaultValue);
    }

    private static bool IsStrongValidationToken(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        value = value.Trim().ToLowerInvariant();
        return value == "strong"
            || value == "validation-strong"
            || value == "validation_strong"
            || value == "high-contrast"
            || value == "high_contrast"
            || value == "debug-strong"
            || value == "debug_strong";
    }

    private static bool IsBoundaryDebugToken(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        value = value.Trim().ToLowerInvariant();
        return value == "boundary"
            || value == "boundary-debug"
            || value == "boundary_debug"
            || value == "debug"
            || value == "debug-sheet"
            || value == "debug_sheet";
    }

    private void TryApplyPendingGeneratedLipMask(string trigger, bool forceAck)
    {
        if (pendingGeneratedLipMaskApply == null)
        {
            return;
        }

        float nowSeconds = Time.realtimeSinceStartup;
        bool shouldRetry = forceAck
            || generatedLipMaskRetryRequested
            || pendingGeneratedLipMaskApply.AttemptCount == 0
            || nowSeconds - pendingGeneratedLipMaskApply.LastAttemptAtSeconds >= GeneratedLipMaskRetryIntervalSeconds;
        if (!shouldRetry)
        {
            return;
        }

        generatedLipMaskRetryRequested = false;
        pendingGeneratedLipMaskApply.LastAttemptAtSeconds = nowSeconds;
        pendingGeneratedLipMaskApply.AttemptCount++;

        ParsedRecipeLayer layer = pendingGeneratedLipMaskApply.Layer;
        E3RegionMaskOverlay.RegionApplyResult result;
        long appliedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        int appliedFrame = Time.frameCount;

        try
        {
            result = ApplyRegionLayer(layer);
        }
        catch (Exception exception)
        {
            Debug.LogError(
                "[E7] generated_lip_mask_pending_apply_failed"
                + " trigger=" + SanitizeLogValue(trigger)
                + " attempt=" + pendingGeneratedLipMaskApply.AttemptCount.ToString(CultureInfo.InvariantCulture)
                + " error=" + exception.Message);
            SendAndPersistGeneratedLipMaskAppliedEvent(
                "{\"type\":\"generated_lip_mask_applied\",\"status\":\"blocked\""
                + ",\"blockedReason\":\"generated_lip_mask_pending_apply_exception\""
                + ",\"error\":\"" + EscapeJsonString(exception.Message) + "\""
                + ",\"provider\":\"" + EscapeJsonString(NormalizeOptional(pendingGeneratedLipMaskApply.Payload.provider)) + "\""
                + ",\"expressionMode\":\"" + EscapeJsonString(NormalizeOptional(pendingGeneratedLipMaskApply.Payload.expressionMode)) + "\""
                + ",\"generatedMaskId\":\"" + EscapeJsonString(NormalizeOptional(pendingGeneratedLipMaskApply.Payload.generatedMaskId)) + "\""
                + ",\"captureSetId\":\"" + EscapeJsonString(NormalizeOptional(pendingGeneratedLipMaskApply.Payload.captureSetId)) + "\""
                + ",\"maskTextureId\":\"" + EscapeJsonString(layer.MaskTextureId) + "\""
                + ",\"payloadBytes\":" + pendingGeneratedLipMaskApply.PayloadBytes.ToString(CultureInfo.InvariantCulture)
                + ",\"faceCount\":0"
                + ",\"maskTriangles\":0"
                + ",\"uvAvailable\":false"
                + ",\"trackingState\":\"None\""
                + ",\"meshVertexCount\":0"
                + ",\"meshIndexCount\":0"
                + ",\"meshUvCount\":0"
                + ",\"attemptCount\":" + pendingGeneratedLipMaskApply.AttemptCount.ToString(CultureInfo.InvariantCulture)
                + ",\"applyTrigger\":\"" + EscapeJsonString(trigger) + "\""
                + "}");
            pendingGeneratedLipMaskApply = null;
            return;
        }

        RememberRegionFeatureState(layer, result);

        bool ready = IsGeneratedLipMaskRuntimeReady(result);
        string blockedReason = BuildGeneratedLipMaskApplyBlockedReason(layer, result);
        float pendingAgeSeconds = nowSeconds - pendingGeneratedLipMaskApply.ReceivedAtSeconds;
        string status = ready
            ? "ready"
            : (pendingAgeSeconds >= GeneratedLipMaskBlockedAfterSeconds ? "blocked" : "queued");
        bool shouldAck = forceAck
            || ready
            || pendingGeneratedLipMaskApply.AttemptCount == 1
            || nowSeconds - pendingGeneratedLipMaskApply.LastAckAtSeconds >= GeneratedLipMaskAckIntervalSeconds;

        Debug.Log(
            "[E7] generated_lip_mask_pending_apply"
            + " trigger=" + SanitizeLogValue(trigger)
            + " status=" + status
            + " blockedReason=" + blockedReason
            + " attempt=" + pendingGeneratedLipMaskApply.AttemptCount.ToString(CultureInfo.InvariantCulture)
            + " ageSeconds=" + pendingAgeSeconds.ToString("0.###", CultureInfo.InvariantCulture)
            + " trackingState=" + result.TrackingState
            + " faceCount=" + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + " uvAvailable=" + result.UvAvailable.ToString().ToLowerInvariant()
            + " maskTriangles=" + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " meshVertexCount=" + result.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
            + " meshIndexCount=" + result.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
            + " meshUvCount=" + result.MeshUvCount.ToString(CultureInfo.InvariantCulture));

        if (!shouldAck)
        {
            return;
        }

        pendingGeneratedLipMaskApply.LastAckAtSeconds = nowSeconds;
        if (ready)
        {
            LogRecipeApplied("generated_lip_mask", layer, result, appliedAtMs, appliedFrame);
            SendRecipeAppliedEvent(layer, result, appliedAtMs, appliedFrame);
        }

        SendGeneratedLipMaskAppliedEvent(
            pendingGeneratedLipMaskApply.Payload,
            layer,
            result,
            appliedAtMs,
            appliedFrame,
            status,
            blockedReason,
            pendingGeneratedLipMaskApply.AttemptCount,
            trigger);

        if (ready)
        {
            pendingGeneratedLipMaskApply = null;
        }
    }

    private void TryApplyPendingGeneratedBrowMask(string trigger, bool forceAck)
    {
        if (pendingGeneratedBrowMaskApply == null)
        {
            return;
        }

        float nowSeconds = Time.realtimeSinceStartup;
        bool shouldRetry = forceAck
            || generatedBrowMaskRetryRequested
            || pendingGeneratedBrowMaskApply.AttemptCount == 0
            || nowSeconds - pendingGeneratedBrowMaskApply.LastAttemptAtSeconds >= GeneratedBrowMaskRetryIntervalSeconds;
        if (!shouldRetry)
        {
            return;
        }

        generatedBrowMaskRetryRequested = false;
        pendingGeneratedBrowMaskApply.LastAttemptAtSeconds = nowSeconds;
        pendingGeneratedBrowMaskApply.AttemptCount++;

        ParsedRecipeLayer layer = pendingGeneratedBrowMaskApply.Layer;
        E3RegionMaskOverlay.RegionApplyResult result;
        long appliedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        int appliedFrame = Time.frameCount;

        try
        {
            result = ApplyRegionLayer(layer);
        }
        catch (Exception exception)
        {
            Debug.LogError(
                "[E7] generated_brow_mask_pending_apply_failed"
                + " trigger=" + SanitizeLogValue(trigger)
                + " attempt=" + pendingGeneratedBrowMaskApply.AttemptCount.ToString(CultureInfo.InvariantCulture)
                + " error=" + exception.Message);
            SendAndPersistGeneratedBrowMaskAppliedEvent(
                "{\"type\":\"generated_brow_mask_applied\",\"status\":\"blocked\""
                + ",\"blockedReason\":\"generated_brow_mask_pending_apply_exception\""
                + ",\"error\":\"" + EscapeJsonString(exception.Message) + "\""
                + ",\"provider\":\"" + EscapeJsonString(NormalizeOptional(pendingGeneratedBrowMaskApply.Payload.provider)) + "\""
                + ",\"generatedMaskId\":\"" + EscapeJsonString(NormalizeOptional(pendingGeneratedBrowMaskApply.Payload.generatedMaskId)) + "\""
                + ",\"captureSetId\":\"" + EscapeJsonString(NormalizeOptional(pendingGeneratedBrowMaskApply.Payload.captureSetId)) + "\""
                + ",\"maskTextureId\":\"" + EscapeJsonString(layer.MaskTextureId) + "\""
                + ",\"payloadBytes\":" + pendingGeneratedBrowMaskApply.PayloadBytes.ToString(CultureInfo.InvariantCulture)
                + ",\"faceCount\":0"
                + ",\"maskTriangles\":0"
                + ",\"uvAvailable\":false"
                + ",\"trackingState\":\"None\""
                + ",\"meshVertexCount\":0"
                + ",\"meshIndexCount\":0"
                + ",\"meshUvCount\":0"
                + ",\"attemptCount\":" + pendingGeneratedBrowMaskApply.AttemptCount.ToString(CultureInfo.InvariantCulture)
                + ",\"applyTrigger\":\"" + EscapeJsonString(trigger) + "\""
                + "}");
            pendingGeneratedBrowMaskApply = null;
            return;
        }

        RememberRegionFeatureState(layer, result);

        bool ready = IsGeneratedBrowMaskRuntimeReady(result);
        string blockedReason = BuildGeneratedBrowMaskApplyBlockedReason(layer, result);
        bool disabledByPayload = !layer.Enabled;
        float pendingAgeSeconds = nowSeconds - pendingGeneratedBrowMaskApply.ReceivedAtSeconds;
        string status = disabledByPayload
            ? "disabled"
            : ready
            ? "ready"
            : (pendingAgeSeconds >= GeneratedBrowMaskBlockedAfterSeconds ? "blocked" : "queued");
        bool shouldAck = forceAck
            || disabledByPayload
            || ready
            || pendingGeneratedBrowMaskApply.AttemptCount == 1
            || nowSeconds - pendingGeneratedBrowMaskApply.LastAckAtSeconds >= GeneratedBrowMaskAckIntervalSeconds;

        Debug.Log(
            "[E7] generated_brow_mask_pending_apply"
            + " trigger=" + SanitizeLogValue(trigger)
            + " status=" + status
            + " blockedReason=" + blockedReason
            + " attempt=" + pendingGeneratedBrowMaskApply.AttemptCount.ToString(CultureInfo.InvariantCulture)
            + " ageSeconds=" + pendingAgeSeconds.ToString("0.###", CultureInfo.InvariantCulture)
            + " trackingState=" + result.TrackingState
            + " faceCount=" + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + " uvAvailable=" + result.UvAvailable.ToString().ToLowerInvariant()
            + " maskTriangles=" + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " meshVertexCount=" + result.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
            + " meshIndexCount=" + result.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
            + " meshUvCount=" + result.MeshUvCount.ToString(CultureInfo.InvariantCulture));

        if (!shouldAck)
        {
            return;
        }

        pendingGeneratedBrowMaskApply.LastAckAtSeconds = nowSeconds;
        if (ready)
        {
            LogRecipeApplied("generated_brow_mask", layer, result, appliedAtMs, appliedFrame);
            SendRecipeAppliedEvent(layer, result, appliedAtMs, appliedFrame);
            activeGeneratedBrowMaskPayload = pendingGeneratedBrowMaskApply.Payload;
            activeGeneratedBrowMaskLayer = layer;
            hasActiveGeneratedBrowMaskLayer = true;
            lastGeneratedBrowRuntimeSampleAtSeconds = nowSeconds;
            generatedBrowRuntimeSampleCount = 0;
        }
        else if (disabledByPayload)
        {
            activeGeneratedBrowMaskPayload = null;
            activeGeneratedBrowMaskLayer = default(ParsedRecipeLayer);
            hasActiveGeneratedBrowMaskLayer = false;
            generatedBrowRuntimeSampleCount = 0;
        }

        SendGeneratedBrowMaskAppliedEvent(
            pendingGeneratedBrowMaskApply.Payload,
            layer,
            result,
            appliedAtMs,
            appliedFrame,
            status,
            blockedReason,
            pendingGeneratedBrowMaskApply.AttemptCount,
            trigger);

        if (ready || disabledByPayload)
        {
            pendingGeneratedBrowMaskApply = null;
        }
    }

    private void TryEmitGeneratedBrowRuntimeSample()
    {
        if (activeGeneratedBrowMaskPayload == null || !hasActiveGeneratedBrowMaskLayer)
        {
            return;
        }

        ParsedRecipeLayer layer = activeGeneratedBrowMaskLayer;
        if (!layer.Enabled)
        {
            activeGeneratedBrowMaskPayload = null;
            activeGeneratedBrowMaskLayer = default(ParsedRecipeLayer);
            hasActiveGeneratedBrowMaskLayer = false;
            generatedBrowRuntimeSampleCount = 0;
            return;
        }

        float nowSeconds = Time.realtimeSinceStartup;
        if (nowSeconds - lastGeneratedBrowRuntimeSampleAtSeconds < GeneratedBrowRuntimeSampleIntervalSeconds)
        {
            return;
        }

        EnsureRegionMaskOverlay();
        if (regionMaskOverlay == null
            || !regionMaskOverlay.TryGetLatestRegionApplyResult(
                layer.Region,
                out E3RegionMaskOverlay.RegionApplyResult result))
        {
            return;
        }

        lastGeneratedBrowRuntimeSampleAtSeconds = nowSeconds;
        generatedBrowRuntimeSampleCount++;
        RememberRegionFeatureState(layer, result);

        bool ready = IsGeneratedBrowMaskRuntimeReady(result);
        string blockedReason = BuildGeneratedBrowMaskApplyBlockedReason(layer, result);
        SendGeneratedBrowMaskAppliedEvent(
            activeGeneratedBrowMaskPayload,
            layer,
            result,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Time.frameCount,
            ready ? "ready" : "partial",
            blockedReason,
            generatedBrowRuntimeSampleCount,
            "runtime_sample");
    }

    private static bool IsGeneratedLipMaskRuntimeReady(E3RegionMaskOverlay.RegionApplyResult result)
    {
        return result.Applied
            && result.FaceCount > 0
            && result.TrackingState == "Tracking"
            && result.UvAvailable
            && result.MeshVertexCount > 0
            && result.MeshIndexCount >= 3
            && result.MeshUvCount > 0
            && result.MaskTriangleCount > 0;
    }

    private static bool IsGeneratedBrowMaskRuntimeReady(E3RegionMaskOverlay.RegionApplyResult result)
    {
        return result.Applied
            && result.FaceCount > 0
            && result.TrackingState == "Tracking"
            && result.UvAvailable
            && result.MeshVertexCount > 0
            && result.MeshIndexCount >= 3
            && result.MeshUvCount > 0
            && result.MaskTriangleCount > 0;
    }

    private static string BuildGeneratedLipMaskApplyBlockedReason(
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result)
    {
        if (IsGeneratedLipMaskRuntimeReady(result))
        {
            return "none";
        }

        if (!layer.Enabled)
        {
            return "layer_disabled_by_payload";
        }

        if (result.StateAction == "suppressed_for_clean_view")
        {
            return "overlay_suppressed_for_clean_view";
        }

        if (result.FaceCount <= 0)
        {
            if (result.TrackingState == "None" || result.MeshVertexCount == 0)
            {
                return "no_tracked_arface_or_face_manager_missing";
            }

            return "face_not_renderable_for_generated_lip_mask";
        }

        if (result.TrackingState != "Tracking")
        {
            return "face_tracking_not_ready_" + SanitizeLogValue(result.TrackingState);
        }

        if (result.MeshVertexCount <= 0 || result.MeshIndexCount < 3)
        {
            return "arface_mesh_unavailable";
        }

        if (!result.UvAvailable || result.MeshUvCount <= 0)
        {
            return "arface_uv_unavailable";
        }

        if (result.MaskTriangleCount <= 0)
        {
            if (IsGeneratedLipMaskTextureId(layer.MaskTextureId))
            {
                return "generated_mask_texture_not_registered_or_no_alpha_triangles";
            }

            if (IsGeneratedBrowMaskTextureId(layer.MaskTextureId))
            {
                return "generated_brow_mask_texture_not_registered_or_no_alpha_triangles";
            }

            return "mask_triangles_zero";
        }

        return BuildRegionApplyBlockedReason(layer, result);
    }

    private static string BuildGeneratedBrowMaskApplyBlockedReason(
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result)
    {
        if (IsGeneratedBrowMaskRuntimeReady(result))
        {
            return "none";
        }

        if (!layer.Enabled)
        {
            return "layer_disabled_by_payload";
        }

        if (result.StateAction == "suppressed_for_clean_view")
        {
            return "overlay_suppressed_for_clean_view";
        }

        if (result.FaceCount <= 0)
        {
            if (result.TrackingState == "None" || result.MeshVertexCount == 0)
            {
                return "no_tracked_arface_or_face_manager_missing";
            }

            return "face_not_renderable_for_generated_brow_mask";
        }

        if (result.TrackingState != "Tracking")
        {
            return "face_tracking_not_ready_" + SanitizeLogValue(result.TrackingState);
        }

        if (result.MeshVertexCount <= 0 || result.MeshIndexCount < 3)
        {
            return "arface_mesh_unavailable";
        }

        if (!result.UvAvailable || result.MeshUvCount <= 0)
        {
            return "arface_uv_unavailable";
        }

        if (result.MaskTriangleCount <= 0)
        {
            return "generated_brow_mask_texture_not_registered_or_no_alpha_triangles";
        }

        return BuildRegionApplyBlockedReason(layer, result);
    }

    private static string BuildRegionApplyBlockedReason(
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result)
    {
        if (result.Applied && result.UvAvailable && result.MaskTriangleCount > 0)
        {
            return "none";
        }

        if (!layer.Enabled)
        {
            return "layer_disabled_by_payload";
        }

        if (result.StateAction == "suppressed_for_clean_view")
        {
            return "overlay_suppressed_for_clean_view";
        }

        if (result.StateAction == "limited_hide" || result.StateAction == "lost_hide")
        {
            return "face_tracking_" + result.StateAction;
        }

        if (!result.UvAvailable)
        {
            return result.FaceCount == 0 && result.MeshVertexCount == 0
                ? "no_tracked_arface_or_face_manager_missing"
                : "arface_uv_unavailable";
        }

        if (result.MaskTriangleCount <= 0)
        {
            if (IsGeneratedLipMaskTextureId(layer.MaskTextureId))
            {
                return "generated_mask_texture_not_registered_or_no_alpha_triangles";
            }

            if (IsGeneratedBrowMaskTextureId(layer.MaskTextureId))
            {
                return "generated_brow_mask_texture_not_registered_or_no_alpha_triangles";
            }

            return "mask_triangles_zero";
        }

        return "runtime_apply_not_visible";
    }

    private static string BuildGeneratedLipMaskExceptionBlockedReason(Exception exception)
    {
        string message = exception != null && exception.Message != null
            ? exception.Message
            : string.Empty;

        if (message.Contains("localOnly", StringComparison.Ordinal))
        {
            return "privacy_local_only_false";
        }

        if (message.Contains("offDeviceUpload", StringComparison.Ordinal))
        {
            return "privacy_off_device_upload_true";
        }

        if (message.Contains("longTermRawFrameStored", StringComparison.Ordinal))
        {
            return "privacy_long_term_raw_frame_stored_true";
        }

        if (message.Contains("schemaVersion", StringComparison.Ordinal))
        {
            return "unsupported_schema_version";
        }

        if (message.Contains("provider", StringComparison.Ordinal))
        {
            return "unsupported_provider";
        }

        if (message.Contains("expressionMode", StringComparison.Ordinal))
        {
            return "unsupported_expression_mode";
        }

        if (message.Contains("texture encoding", StringComparison.Ordinal))
        {
            return "unsupported_mask_texture_encoding";
        }

        if (message.Contains("raw RGBA payload is empty", StringComparison.Ordinal))
        {
            return "raw_rgba_payload_missing";
        }

        if (message.Contains("texture dimensions", StringComparison.Ordinal))
        {
            return "mask_texture_dimensions_invalid";
        }

        if (message.Contains("byte count mismatch", StringComparison.Ordinal))
        {
            return "raw_rgba_byte_count_mismatch";
        }

        if (message.Contains("Unsupported generated lip mask texture id", StringComparison.Ordinal)
            || message.Contains("Unsupported mask texture id", StringComparison.Ordinal))
        {
            return "unsupported_mask_texture_id";
        }

        if (message.Contains("invalid_validation_color_hex", StringComparison.Ordinal)
            || message.Contains("valid HTML color", StringComparison.Ordinal))
        {
            return "invalid_validation_color_hex";
        }

        if (message.Contains("Base-64", StringComparison.Ordinal)
            || message.Contains("base64", StringComparison.OrdinalIgnoreCase))
        {
            return "invalid_base64_mask_payload";
        }

        if (message.Contains("overlay is unavailable", StringComparison.Ordinal))
        {
            return "region_mask_overlay_unavailable";
        }

        return "generated_lip_mask_apply_exception";
    }

    private static string BuildGeneratedBrowMaskExceptionBlockedReason(Exception exception)
    {
        string message = exception != null && exception.Message != null
            ? exception.Message
            : string.Empty;

        if (message.Contains("localOnly", StringComparison.Ordinal))
        {
            return "privacy_local_only_false";
        }

        if (message.Contains("offDeviceUpload", StringComparison.Ordinal))
        {
            return "privacy_off_device_upload_true";
        }

        if (message.Contains("longTermRawFrameStored", StringComparison.Ordinal))
        {
            return "privacy_long_term_raw_frame_stored_true";
        }

        if (message.Contains("schemaVersion", StringComparison.Ordinal))
        {
            return "unsupported_schema_version";
        }

        if (message.Contains("provider", StringComparison.Ordinal))
        {
            return "unsupported_provider";
        }

        if (message.Contains("texture encoding", StringComparison.Ordinal))
        {
            return "unsupported_mask_texture_encoding";
        }

        if (message.Contains("raw RGBA payload is empty", StringComparison.Ordinal))
        {
            return "raw_rgba_payload_missing";
        }

        if (message.Contains("texture dimensions", StringComparison.Ordinal))
        {
            return "mask_texture_dimensions_invalid";
        }

        if (message.Contains("byte count mismatch", StringComparison.Ordinal))
        {
            return "raw_rgba_byte_count_mismatch";
        }

        if (message.Contains("texture registration failed", StringComparison.Ordinal))
        {
            return "texture_registration_failed";
        }

        if (message.Contains("Unsupported generated brow mask texture id", StringComparison.Ordinal)
            || message.Contains("Unsupported mask texture id", StringComparison.Ordinal))
        {
            return "unsupported_mask_texture_id";
        }

        if (message.Contains("invalid_validation_color_hex", StringComparison.Ordinal)
            || message.Contains("valid HTML color", StringComparison.Ordinal))
        {
            return "invalid_validation_color_hex";
        }

        if (message.Contains("Base-64", StringComparison.Ordinal)
            || message.Contains("base64", StringComparison.OrdinalIgnoreCase))
        {
            return "invalid_base64_mask_payload";
        }

        if (message.Contains("overlay is unavailable", StringComparison.Ordinal))
        {
            return "region_mask_overlay_unavailable";
        }

        return "generated_brow_mask_apply_exception";
    }

    private void SendGeneratedLipMaskAppliedEvent(
        GeneratedLipMaskPayload payload,
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result,
        long appliedAtMs,
        int appliedFrame,
        string statusOverride = null,
        string blockedReasonOverride = null,
        int attemptCount = 0,
        string applyTrigger = "immediate")
    {
        bool hasRuntimeTexture = IsGeneratedLipMaskRuntimeReady(result);
        string status = !string.IsNullOrWhiteSpace(statusOverride)
            ? statusOverride
            : (hasRuntimeTexture ? "ready" : "blocked");
        string blockedReason = !string.IsNullOrWhiteSpace(blockedReasonOverride)
            ? blockedReasonOverride
            : BuildGeneratedLipMaskApplyBlockedReason(layer, result);
        string eventJson =
            "{\"type\":\"generated_lip_mask_applied\",\"status\":\"" + status + "\""
            + ",\"provider\":\"" + EscapeJsonString(payload.provider) + "\""
            + ",\"expressionMode\":\"" + EscapeJsonString(payload.expressionMode) + "\""
            + ",\"generatedMaskId\":\"" + EscapeJsonString(payload.generatedMaskId) + "\""
            + ",\"captureSetId\":\"" + EscapeJsonString(NormalizeOptional(payload.captureSetId)) + "\""
            + ",\"maskTextureId\":\"" + EscapeJsonString(layer.MaskTextureId) + "\""
            + ",\"rawMaskProvided\":" + (!string.IsNullOrWhiteSpace(payload.maskRawRgbaBase64)).ToString().ToLowerInvariant()
            + ",\"maskTextureWidth\":" + payload.maskTextureWidth.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTextureHeight\":" + payload.maskTextureHeight.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTextureEncoding\":\"" + EscapeJsonString(NormalizeOptional(payload.maskTextureEncoding)) + "\""
            + ",\"runtimeReady\":" + hasRuntimeTexture.ToString().ToLowerInvariant()
            + ",\"applied\":" + result.Applied.ToString().ToLowerInvariant()
            + ",\"faceCount\":" + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTriangles\":" + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"uvAvailable\":" + result.UvAvailable.ToString().ToLowerInvariant()
            + ",\"maskUvBoundsAvailable\":" + result.MaskUvBoundsAvailable.ToString().ToLowerInvariant()
            + ",\"maskUvMinX\":" + result.MaskUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskUvMinY\":" + result.MaskUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskUvMaxX\":" + result.MaskUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskUvMaxY\":" + result.MaskUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"blockedReason\":\"" + EscapeJsonString(blockedReason) + "\""
            + ",\"trackingState\":\"" + EscapeJsonString(result.TrackingState) + "\""
            + ",\"stateAction\":\"" + EscapeJsonString(result.StateAction) + "\""
            + ",\"meshVertexCount\":" + result.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshIndexCount\":" + result.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshUvCount\":" + result.MeshUvCount.ToString(CultureInfo.InvariantCulture)
            + ",\"attemptCount\":" + attemptCount.ToString(CultureInfo.InvariantCulture)
            + ",\"applyTrigger\":\"" + EscapeJsonString(applyTrigger) + "\""
            + ",\"color\":\"" + EscapeJsonString(layer.ColorHex) + "\""
            + ",\"opacity\":" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"validationVisible\":" + layer.ValidationVisible.ToString().ToLowerInvariant()
            + ",\"validationStrongMode\":" + layer.ValidationStrongMode.ToString().ToLowerInvariant()
            + ",\"validationMode\":\"" + EscapeJsonString(layer.ValidationMode) + "\""
            + ",\"validationColor\":\"" + EscapeJsonString(layer.ColorHex) + "\""
            + ",\"validationOpacity\":" + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"effectiveOpacity\":" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"boundaryDebugVisible\":" + layer.BoundaryDebugVisible.ToString().ToLowerInvariant()
            + ",\"boundaryDebugMode\":\"" + EscapeJsonString(layer.BoundaryDebugMode) + "\""
            + ",\"controlRequestId\":" + layer.ValidationControlRequestId.ToString(CultureInfo.InvariantCulture)
            + ",\"validationControlRequestId\":" + layer.ValidationControlRequestId.ToString(CultureInfo.InvariantCulture)
            + ",\"controlRevision\":" + layer.ValidationControlRevision.ToString(CultureInfo.InvariantCulture)
            + ",\"validationControlRevision\":" + layer.ValidationControlRevision.ToString(CultureInfo.InvariantCulture)
            + ",\"validationControls\":{"
            + "\"visible\":" + layer.ValidationVisible.ToString().ToLowerInvariant()
            + ",\"controlRequestId\":" + layer.ValidationControlRequestId.ToString(CultureInfo.InvariantCulture)
            + ",\"controlRevision\":" + layer.ValidationControlRevision.ToString(CultureInfo.InvariantCulture)
            + ",\"strongMode\":" + layer.ValidationStrongMode.ToString().ToLowerInvariant()
            + ",\"mode\":\"" + EscapeJsonString(layer.ValidationMode) + "\""
            + ",\"color\":\"" + EscapeJsonString(layer.ColorHex) + "\""
            + ",\"opacity\":" + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"effectiveOpacity\":" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"boundaryDebugVisible\":" + layer.BoundaryDebugVisible.ToString().ToLowerInvariant()
            + "}"
            + ",\"maskThreshold\":" + layer.MaskThreshold.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskFeatherUvNormalized\":" + layer.MaskFeatherUvNormalized.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"cornerReach\":" + layer.CornerReach.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"upperLipTightness\":" + layer.UpperLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"lowerLipTightness\":" + layer.LowerLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"verticalOffset\":" + layer.VerticalOffset.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"appliedAtMs\":" + appliedAtMs.ToString(CultureInfo.InvariantCulture)
            + ",\"appliedFrame\":" + appliedFrame.ToString(CultureInfo.InvariantCulture)
            + ",\"overlaySyncPhase\":\"" + EscapeJsonString(result.OverlaySyncPhase) + "\""
            + ",\"overlaySyncFrame\":" + result.OverlaySyncFrame.ToString(CultureInfo.InvariantCulture)
            + ",\"trackablesChangedSequence\":" + result.TrackablesChangedSequence.ToString(CultureInfo.InvariantCulture)
            + ",\"overlaySyncDurationMs\":" + result.OverlaySyncDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncWorstDurationMs\":" + result.OverlaySyncWorstDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncCount\":" + result.OverlaySyncCount.ToString(CultureInfo.InvariantCulture)
            + ",\"overlayTopologyChanged\":" + result.OverlayTopologyChanged.ToString().ToLowerInvariant()
            + "}";
        SendAndPersistGeneratedLipMaskAppliedEvent(eventJson);
    }

    private void SendAndPersistGeneratedLipMaskAppliedEvent(string eventJson)
    {
        PersistGeneratedLipMaskAppliedEvent(eventJson);
        SendUnityEvent(eventJson);
    }

    private void SendGeneratedBrowMaskAppliedEvent(
        GeneratedBrowMaskPayload payload,
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result,
        long appliedAtMs,
        int appliedFrame,
        string statusOverride = null,
        string blockedReasonOverride = null,
        int attemptCount = 0,
        string applyTrigger = "immediate")
    {
        bool hasRuntimeTexture = IsGeneratedBrowMaskRuntimeReady(result);
        string status = !string.IsNullOrWhiteSpace(statusOverride)
            ? statusOverride
            : (hasRuntimeTexture ? "ready" : "blocked");
        string blockedReason = !string.IsNullOrWhiteSpace(blockedReasonOverride)
            ? blockedReasonOverride
            : BuildGeneratedBrowMaskApplyBlockedReason(layer, result);
        string eventJson =
            "{\"type\":\"generated_brow_mask_applied\",\"status\":\"" + status + "\""
            + ",\"provider\":\"" + EscapeJsonString(payload.provider) + "\""
            + ",\"shapeId\":\"" + EscapeJsonString(NormalizeOptional(payload.shapeId)) + "\""
            + ",\"generatedMaskId\":\"" + EscapeJsonString(payload.generatedMaskId) + "\""
            + ",\"captureSetId\":\"" + EscapeJsonString(NormalizeOptional(payload.captureSetId)) + "\""
            + ",\"maskTextureId\":\"" + EscapeJsonString(layer.MaskTextureId) + "\""
            + ",\"maskTextureSampleChannel\":\"" + EscapeJsonString(result.MaskTextureSampleChannel) + "\""
            + ",\"runtimeReady\":" + hasRuntimeTexture.ToString().ToLowerInvariant()
            + ",\"applied\":" + result.Applied.ToString().ToLowerInvariant()
            + ",\"faceCount\":" + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTriangles\":" + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"uvAvailable\":" + result.UvAvailable.ToString().ToLowerInvariant()
            + ",\"maskUvBoundsAvailable\":" + result.MaskUvBoundsAvailable.ToString().ToLowerInvariant()
            + ",\"maskUvMinX\":" + result.MaskUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskUvMinY\":" + result.MaskUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskUvMaxX\":" + result.MaskUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskUvMaxY\":" + result.MaskUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"expectedMaskUvMinX\":" + payload.expectedMaskUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"expectedMaskUvMinY\":" + payload.expectedMaskUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"expectedMaskUvMaxX\":" + payload.expectedMaskUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"expectedMaskUvMaxY\":" + payload.expectedMaskUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskUvSplitMode\":\"" + EscapeJsonString(result.MaskUvSplitMode) + "\""
            + ",\"maskNegativeXTriangleCount\":" + result.MaskNegativeXTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"maskPositiveXTriangleCount\":" + result.MaskPositiveXTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"maskNegativeXUvBoundsAvailable\":" + result.MaskNegativeXUvBoundsAvailable.ToString().ToLowerInvariant()
            + ",\"maskNegativeXUvMinX\":" + result.MaskNegativeXUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskNegativeXUvMinY\":" + result.MaskNegativeXUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskNegativeXUvMaxX\":" + result.MaskNegativeXUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskNegativeXUvMaxY\":" + result.MaskNegativeXUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskPositiveXUvBoundsAvailable\":" + result.MaskPositiveXUvBoundsAvailable.ToString().ToLowerInvariant()
            + ",\"maskPositiveXUvMinX\":" + result.MaskPositiveXUvMinX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskPositiveXUvMinY\":" + result.MaskPositiveXUvMinY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskPositiveXUvMaxX\":" + result.MaskPositiveXUvMaxX.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskPositiveXUvMaxY\":" + result.MaskPositiveXUvMaxY.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"blockedReason\":\"" + EscapeJsonString(blockedReason) + "\""
            + ",\"trackingState\":\"" + EscapeJsonString(result.TrackingState) + "\""
            + ",\"stateAction\":\"" + EscapeJsonString(result.StateAction) + "\""
            + ",\"stabilityMode\":\"" + EscapeJsonString(result.StabilityMode) + "\""
            + ",\"anchorStabilizationMode\":\"" + EscapeJsonString(NormalizeOptional(payload.anchorStabilizationMode)) + "\""
            + ",\"surroundAnchorPointCount\":" + payload.surroundAnchorPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"browAnchorPointCount\":" + payload.browAnchorPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"browCorePointCount\":" + payload.browCorePointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"browShapeBasePointCount\":" + payload.browShapeBasePointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"eyeAnchorPointCount\":" + payload.eyeAnchorPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"upperEyelidAnchorPointCount\":" + payload.upperEyelidAnchorPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"templeAnchorPointCount\":" + payload.templeAnchorPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"noseBridgeAnchorPointCount\":" + payload.noseBridgeAnchorPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"faceOvalPointCount\":" + payload.faceOvalPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"eyeExclusionMode\":\"" + EscapeJsonString(NormalizeOptional(payload.eyeExclusionMode)) + "\""
            + ",\"debugMode\":" + payload.debugMode.ToString(CultureInfo.InvariantCulture)
            + ",\"debugShowLeftRight\":" + payload.debugShowLeftRight.ToString().ToLowerInvariant()
            + ",\"debugExaggerate\":" + payload.debugExaggerate.ToString().ToLowerInvariant()
            + ",\"stabilizationDeadZoneMeters\":" + result.StabilizationDeadZoneMeters.ToString("0.#####", CultureInfo.InvariantCulture)
            + ",\"stabilizationSnapDistanceMeters\":" + result.StabilizationSnapDistanceMeters.ToString("0.#####", CultureInfo.InvariantCulture)
            + ",\"meshVertexCount\":" + result.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshIndexCount\":" + result.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshUvCount\":" + result.MeshUvCount.ToString(CultureInfo.InvariantCulture)
            + ",\"attemptCount\":" + attemptCount.ToString(CultureInfo.InvariantCulture)
            + ",\"applyTrigger\":\"" + EscapeJsonString(applyTrigger) + "\""
            + ",\"color\":\"" + EscapeJsonString(layer.ColorHex) + "\""
            + ",\"opacity\":" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"validationVisible\":" + layer.ValidationVisible.ToString().ToLowerInvariant()
            + ",\"validationStrongMode\":" + layer.ValidationStrongMode.ToString().ToLowerInvariant()
            + ",\"validationMode\":\"" + EscapeJsonString(layer.ValidationMode) + "\""
            + ",\"validationColor\":\"" + EscapeJsonString(layer.ColorHex) + "\""
            + ",\"validationOpacity\":" + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"effectiveOpacity\":" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"strandTextureAmount\":" + layer.TextureAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"maskThreshold\":" + layer.MaskThreshold.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskFeatherUvNormalized\":" + layer.MaskFeatherUvNormalized.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"softEdgeTexels\":" + payload.softEdgeTexels.ToString(CultureInfo.InvariantCulture)
            + ",\"cleanupStrength\":" + Mathf.Clamp01(payload.cleanupStrength).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"neutralizeStrength\":" + Mathf.Clamp01(payload.neutralizeStrength).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"controlRequestId\":" + layer.ValidationControlRequestId.ToString(CultureInfo.InvariantCulture)
            + ",\"validationControlRequestId\":" + layer.ValidationControlRequestId.ToString(CultureInfo.InvariantCulture)
            + ",\"controlRevision\":" + layer.ValidationControlRevision.ToString(CultureInfo.InvariantCulture)
            + ",\"validationControlRevision\":" + layer.ValidationControlRevision.ToString(CultureInfo.InvariantCulture)
            + ",\"appliedAtMs\":" + appliedAtMs.ToString(CultureInfo.InvariantCulture)
            + ",\"appliedFrame\":" + appliedFrame.ToString(CultureInfo.InvariantCulture)
            + ",\"overlaySyncPhase\":\"" + EscapeJsonString(result.OverlaySyncPhase) + "\""
            + ",\"overlaySyncFrame\":" + result.OverlaySyncFrame.ToString(CultureInfo.InvariantCulture)
            + ",\"trackablesChangedSequence\":" + result.TrackablesChangedSequence.ToString(CultureInfo.InvariantCulture)
            + ",\"overlaySyncDurationMs\":" + result.OverlaySyncDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncWorstDurationMs\":" + result.OverlaySyncWorstDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncCount\":" + result.OverlaySyncCount.ToString(CultureInfo.InvariantCulture)
            + ",\"overlayTopologyChanged\":" + result.OverlayTopologyChanged.ToString().ToLowerInvariant()
            + "}";
        SendAndPersistGeneratedBrowMaskAppliedEvent(eventJson);
    }

    private void SendAndPersistGeneratedBrowMaskAppliedEvent(string eventJson)
    {
        PersistGeneratedBrowMaskAppliedEvent(eventJson);
        SendUnityEvent(eventJson);
    }

    private void PersistGeneratedLipMaskAppliedEvent(string eventJson)
    {
        try
        {
            string directory = Path.Combine(Application.persistentDataPath, "e7-runtime-events");
            Directory.CreateDirectory(directory);
            File.WriteAllText(
                Path.Combine(directory, "generated_lip_mask_applied.latest.json"),
                eventJson);
            File.AppendAllText(
                Path.Combine(directory, "generated_lip_mask_applied.jsonl"),
                eventJson + Environment.NewLine);
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[E7] generated_lip_mask_applied_persist_failed error="
                + exception.Message);
        }
    }

    private void PersistGeneratedBrowMaskAppliedEvent(string eventJson)
    {
        try
        {
            string directory = Path.Combine(Application.persistentDataPath, "e7-runtime-events");
            Directory.CreateDirectory(directory);
            File.WriteAllText(
                Path.Combine(directory, "generated_brow_mask_applied.latest.json"),
                eventJson);
            File.AppendAllText(
                Path.Combine(directory, "generated_brow_mask_applied.jsonl"),
                eventJson + Environment.NewLine);
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[E7] generated_brow_mask_applied_persist_failed error="
                + exception.Message);
        }
    }

    private E3RegionMaskOverlay.RegionApplyResult ApplyRegionLayer(ParsedRecipeLayer layer)
    {
        EnsureRegionMaskOverlay();

        return regionMaskOverlay.ApplyRegionRecipe(
            layer.Region,
            layer.ColorHex,
            layer.Color,
            layer.SecondaryColorHex,
            layer.SecondaryColor,
            layer.Opacity,
            layer.Enabled,
            layer.TextureSample,
            layer.TextureMode,
            layer.Intensity,
            layer.Feather,
            layer.BlendMode,
            layer.RendererMode,
            layer.MaskTextureId,
            layer.CandidateId,
            layer.MaskThreshold,
            layer.MaskFeatherUvNormalized,
            layer.CornerReach,
            layer.UpperLipTightness,
            layer.LowerLipTightness,
            layer.VerticalOffset,
            layer.Coverage,
            layer.Finish,
            layer.TextureAmount,
            layer.GradientAmount,
            layer.PreserveDetail,
            layer.Roughness,
            layer.Specular,
            layer.SpecularPower,
            layer.GlossBoost,
            layer.FoundationMode,
            layer.FoundationFallbackMode,
            layer.FoundationDebugMaskMode,
            layer.DebugMode,
            layer.DebugShowLeftRight,
            layer.DebugExaggerate);
    }

    private void RememberRegionFeatureState(
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result)
    {
        latestRegionFeatureStates[layer.Region] = new RegionFeatureState
        {
            Region = layer.Region,
            Enabled = layer.Enabled,
            Applied = result.Applied,
            ColorHex = layer.ColorHex,
            SecondaryColorHex = layer.SecondaryColorHex,
            Opacity = layer.Opacity,
            TextureSample = result.TextureSample,
            TextureMode = result.TextureMode,
            BlendMode = result.BlendMode,
            Intensity = result.Intensity,
            Feather = result.Feather,
            RecipeBatchId = layer.RecipeBatchId,
            LookId = layer.LookId,
            ActiveRegions = layer.ActiveRegions,
            LayerCount = layer.LayerCount,
            EnabledLayerCount = layer.EnabledLayerCount,
            PayloadBytes = layer.PayloadBytes,
            RendererMode = result.RendererMode,
            Coverage = layer.Coverage,
            Finish = layer.Finish,
            TextureAmount = layer.TextureAmount,
            GradientAmount = layer.GradientAmount,
            Roughness = layer.Roughness,
            Specular = layer.Specular,
            SpecularPower = layer.SpecularPower,
            GlossBoost = layer.GlossBoost,
            Shimmer = layer.Shimmer,
            ShimmerColor = layer.ShimmerColor,
            SkinAdaptive = layer.SkinAdaptive,
            PreserveDetail = layer.PreserveDetail,
            MaterialId = layer.MaterialId,
            ShaderMode = layer.ShaderMode,
            PassCount = layer.PassCount,
            CandidateId = layer.CandidateId,
            MaskTextureId = layer.MaskTextureId,
            MaskThreshold = result.MaskThreshold,
            MaskFeatherUvNormalized = result.MaskFeatherUvNormalized,
            CornerReach = layer.CornerReach,
            UpperLipTightness = layer.UpperLipTightness,
            LowerLipTightness = layer.LowerLipTightness,
            VerticalOffset = layer.VerticalOffset,
            CameraBackdropAvailable = layer.CameraBackdropAvailable,
            LightEstimateAvailable = layer.LightEstimateAvailable,
            MaskSource = result.MaskSource,
            BoundaryRenderer = result.BoundaryRenderer,
            TrackingState = result.TrackingState,
            StateAction = result.StateAction,
            MaskTriangleCount = result.MaskTriangleCount,
            UvAvailable = result.UvAvailable,
            MeshVertexCount = result.MeshVertexCount,
            MeshIndexCount = result.MeshIndexCount,
            MeshUvCount = result.MeshUvCount,
            FaceCount = result.FaceCount,
            MeshTriangleCount = result.MeshTriangleCount,
            TopologyAuditStatus = result.TopologyAuditStatus,
            TopologyAuditSummary = result.TopologyAuditSummary,
            OverlaySyncPhase = result.OverlaySyncPhase,
            OverlaySyncFrame = result.OverlaySyncFrame,
            TrackablesChangedSequence = result.TrackablesChangedSequence,
            OverlaySyncDurationMs = result.OverlaySyncDurationMs,
            OverlaySyncWorstDurationMs = result.OverlaySyncWorstDurationMs,
            OverlaySyncCount = result.OverlaySyncCount,
            OverlayTopologyChanged = result.OverlayTopologyChanged,
            StabilityMode = result.StabilityMode,
            StabilizationDeadZoneMeters = result.StabilizationDeadZoneMeters,
            StabilizationSnapDistanceMeters = result.StabilizationSnapDistanceMeters,
            ValidationVisible = layer.ValidationVisible,
            ValidationStrongMode = layer.ValidationStrongMode,
            ValidationMode = layer.ValidationMode,
            ValidationOpacity = layer.ValidationOpacity,
            BoundaryDebugVisible = layer.BoundaryDebugVisible,
            BoundaryDebugMode = layer.BoundaryDebugMode,
            DebugMode = layer.DebugMode,
            DebugShowLeftRight = layer.DebugShowLeftRight,
            DebugExaggerate = layer.DebugExaggerate,
            BlockedReason = BuildRegionApplyBlockedReason(layer, result),
            LastUpdatedMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
    }

    private void RefreshLatestOverlayRegionResults()
    {
        if (regionMaskOverlay == null)
        {
            return;
        }

        foreach (string region in FeatureSnapshotRegions)
        {
            if (!latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state)
                || !state.Enabled
                || !regionMaskOverlay.TryGetLatestRegionApplyResult(region, out E3RegionMaskOverlay.RegionApplyResult result))
            {
                continue;
            }

            state.Applied = result.Applied;
            state.TextureSample = result.TextureSample;
            state.TextureMode = result.TextureMode;
            state.BlendMode = result.BlendMode;
            state.Intensity = result.Intensity;
            state.Feather = result.Feather;
            state.RendererMode = result.RendererMode;
            state.MaskSource = result.MaskSource;
            state.BoundaryRenderer = result.BoundaryRenderer;
            state.TrackingState = result.TrackingState;
            state.StateAction = result.StateAction;
            state.MaskTriangleCount = result.MaskTriangleCount;
            state.UvAvailable = result.UvAvailable;
            state.MeshVertexCount = result.MeshVertexCount;
            state.MeshIndexCount = result.MeshIndexCount;
            state.MeshUvCount = result.MeshUvCount;
            state.FaceCount = result.FaceCount;
            state.MeshTriangleCount = result.MeshTriangleCount;
            state.TopologyAuditStatus = result.TopologyAuditStatus;
            state.TopologyAuditSummary = result.TopologyAuditSummary;
            state.MaskThreshold = result.MaskThreshold;
            state.MaskFeatherUvNormalized = result.MaskFeatherUvNormalized;
            state.OverlaySyncPhase = result.OverlaySyncPhase;
            state.OverlaySyncFrame = result.OverlaySyncFrame;
            state.TrackablesChangedSequence = result.TrackablesChangedSequence;
            state.OverlaySyncDurationMs = result.OverlaySyncDurationMs;
            state.OverlaySyncWorstDurationMs = result.OverlaySyncWorstDurationMs;
            state.OverlaySyncCount = result.OverlaySyncCount;
            state.OverlayTopologyChanged = result.OverlayTopologyChanged;
            state.StabilityMode = result.StabilityMode;
            state.StabilizationDeadZoneMeters = result.StabilizationDeadZoneMeters;
            state.StabilizationSnapDistanceMeters = result.StabilizationSnapDistanceMeters;
            state.DebugMode = result.BrowDebugMode;
            state.DebugShowLeftRight = result.BrowDebugShowLeftRight;
            state.DebugExaggerate = result.BrowDebugExaggerate;
        }
    }

    private string BuildActiveRegionSummary()
    {
        RefreshLatestOverlayRegionResults();

        List<string> activeRegions = new List<string>();
        foreach (string region in FeatureSnapshotRegions)
        {
            if (latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state)
                && state.Enabled)
            {
                activeRegions.Add(region);
            }
        }

        return activeRegions.Count == 0 ? "none" : string.Join(",", activeRegions);
    }

    private string BuildAppliedTextureSampleSummary()
    {
        RefreshLatestOverlayRegionResults();

        List<string> appliedSamples = new List<string>();
        foreach (string region in FeatureSnapshotRegions)
        {
            if (latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state)
                && state.Enabled)
            {
                appliedSamples.Add(region + ":" + state.TextureSample + ":applied=" + state.Applied.ToString().ToLowerInvariant());
            }
        }

        return appliedSamples.Count == 0 ? "none" : string.Join(",", appliedSamples);
    }

    private string BuildActiveRegionsJson()
    {
        RefreshLatestOverlayRegionResults();

        List<string> activeRegions = new List<string>();
        foreach (string region in FeatureSnapshotRegions)
        {
            if (latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state)
                && state.Enabled)
            {
                activeRegions.Add("\"" + EscapeJsonString(region) + "\"");
            }
        }

        return "[" + string.Join(",", activeRegions) + "]";
    }

    private string BuildAppliedTextureSamplesJson()
    {
        RefreshLatestOverlayRegionResults();

        List<string> samples = new List<string>();
        foreach (string region in FeatureSnapshotRegions)
        {
            if (!latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state)
                || !state.Enabled)
            {
                continue;
            }

            samples.Add("{"
                + "\"region\":\"" + EscapeJsonString(region) + "\""
                + ",\"texture\":\"" + EscapeJsonString(state.TextureSample) + "\""
                + ",\"sample\":\"" + EscapeJsonString(state.TextureSample) + "\""
                + ",\"textureMode\":\"" + EscapeJsonString(state.TextureMode) + "\""
                + ",\"blendMode\":\"" + EscapeJsonString(state.BlendMode) + "\""
                + ",\"rendererMode\":\"" + EscapeJsonString(state.RendererMode) + "\""
                + ",\"candidateId\":\"" + EscapeJsonString(state.CandidateId) + "\""
                + ",\"maskTextureId\":\"" + EscapeJsonString(state.MaskTextureId) + "\""
                + ",\"maskThreshold\":" + state.MaskThreshold.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"maskFeatherUvNormalized\":" + state.MaskFeatherUvNormalized.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"cornerReach\":" + state.CornerReach.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"upperLipTightness\":" + state.UpperLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"lowerLipTightness\":" + state.LowerLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"verticalOffset\":" + state.VerticalOffset.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"maskSource\":\"" + EscapeJsonString(state.MaskSource) + "\""
                + ",\"boundaryRenderer\":\"" + EscapeJsonString(state.BoundaryRenderer) + "\""
                + ",\"trackingState\":\"" + EscapeJsonString(state.TrackingState) + "\""
                + ",\"stateAction\":\"" + EscapeJsonString(state.StateAction) + "\""
                + ",\"intensity\":" + state.Intensity.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"feather\":" + state.Feather.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"applied\":" + state.Applied.ToString().ToLowerInvariant()
                + ",\"validationVisible\":" + state.ValidationVisible.ToString().ToLowerInvariant()
                + ",\"validationStrongMode\":" + state.ValidationStrongMode.ToString().ToLowerInvariant()
                + ",\"validationMode\":\"" + EscapeJsonString(state.ValidationMode) + "\""
                + ",\"validationOpacity\":" + state.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"boundaryDebugVisible\":" + state.BoundaryDebugVisible.ToString().ToLowerInvariant()
                + ",\"boundaryDebugMode\":\"" + EscapeJsonString(state.BoundaryDebugMode) + "\""
                + ",\"debugMode\":" + state.DebugMode.ToString(CultureInfo.InvariantCulture)
                + ",\"debugShowLeftRight\":" + state.DebugShowLeftRight.ToString().ToLowerInvariant()
                + ",\"debugExaggerate\":" + state.DebugExaggerate.ToString().ToLowerInvariant()
                + ",\"blockedReason\":\"" + EscapeJsonString(state.BlockedReason) + "\""
                + ",\"faceCount\":" + state.FaceCount.ToString(CultureInfo.InvariantCulture)
                + ",\"meshTriangles\":" + state.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
                + ",\"appliedTriangles\":" + state.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
                + ",\"uvAvailable\":" + state.UvAvailable.ToString().ToLowerInvariant()
                + ",\"meshVertexCount\":" + state.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
                + ",\"meshIndexCount\":" + state.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
                + ",\"meshUvCount\":" + state.MeshUvCount.ToString(CultureInfo.InvariantCulture)
                + ",\"topologyAuditStatus\":\"" + EscapeJsonString(state.TopologyAuditStatus) + "\""
                + ",\"topologyAuditSummary\":\"" + EscapeJsonString(state.TopologyAuditSummary) + "\""
                + ",\"overlaySyncPhase\":\"" + EscapeJsonString(state.OverlaySyncPhase) + "\""
                + ",\"overlaySyncFrame\":" + state.OverlaySyncFrame.ToString(CultureInfo.InvariantCulture)
                + ",\"trackablesChangedSequence\":" + state.TrackablesChangedSequence.ToString(CultureInfo.InvariantCulture)
                + ",\"overlaySyncDurationMs\":" + state.OverlaySyncDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"overlaySyncWorstDurationMs\":" + state.OverlaySyncWorstDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"overlaySyncCount\":" + state.OverlaySyncCount.ToString(CultureInfo.InvariantCulture)
                + ",\"overlayTopologyChanged\":" + state.OverlayTopologyChanged.ToString().ToLowerInvariant()
                + "}");
        }

        return "[" + string.Join(",", samples) + "]";
    }

    private string BuildRegionsJson()
    {
        RefreshLatestOverlayRegionResults();

        List<string> regions = new List<string>();
        foreach (string region in FeatureSnapshotRegions)
        {
            latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state);
            bool active = state != null && state.Enabled;
            string textureSample = state != null && !string.IsNullOrWhiteSpace(state.TextureSample)
                ? state.TextureSample
                : "none";
            string textureMode = state != null && !string.IsNullOrWhiteSpace(state.TextureMode)
                ? state.TextureMode
                : "sample";
            string rendererMode = state != null && !string.IsNullOrWhiteSpace(state.RendererMode)
                ? state.RendererMode
                : "smooth-region-mask";
            string maskSource = state != null && !string.IsNullOrWhiteSpace(state.MaskSource)
                ? state.MaskSource
                : "smooth_region_mask";
            string boundaryRenderer = state != null && !string.IsNullOrWhiteSpace(state.BoundaryRenderer)
                ? state.BoundaryRenderer
                : "smooth_alpha_mask";
            string qaStatus = "smooth_mask_runtime";

            regions.Add("\"" + EscapeJsonString(region) + "\":{"
                + "\"available\":true"
                + ",\"active\":" + active.ToString().ToLowerInvariant()
                + ",\"lastApplied\":" + (state != null && state.Applied).ToString().ToLowerInvariant()
                + ",\"rendererMode\":\"" + EscapeJsonString(rendererMode) + "\""
                + ",\"candidateId\":\"" + EscapeJsonString(state != null ? state.CandidateId : "none") + "\""
                + ",\"maskTextureId\":\"" + EscapeJsonString(state != null ? state.MaskTextureId : "none") + "\""
                + ",\"maskThreshold\":" + (state != null ? state.MaskThreshold : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"maskFeatherUvNormalized\":" + (state != null ? state.MaskFeatherUvNormalized : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"cornerReach\":" + (state != null ? state.CornerReach : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"upperLipTightness\":" + (state != null ? state.UpperLipTightness : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"lowerLipTightness\":" + (state != null ? state.LowerLipTightness : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"verticalOffset\":" + (state != null ? state.VerticalOffset : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"maskSource\":\"" + EscapeJsonString(maskSource) + "\""
                + ",\"boundaryRenderer\":\"" + EscapeJsonString(boundaryRenderer) + "\""
                + ",\"qaStatus\":\"" + EscapeJsonString(qaStatus) + "\""
                + ",\"validationScope\":\"debug\""
                + ",\"texture\":\"" + EscapeJsonString(textureSample) + "\""
                + ",\"sample\":\"" + EscapeJsonString(textureSample) + "\""
                + ",\"textureMode\":\"" + EscapeJsonString(textureMode) + "\""
                + ",\"color\":\"" + EscapeJsonString(state != null ? state.ColorHex : "none") + "\""
                + ",\"opacity\":" + (state != null ? state.Opacity : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"validationVisible\":" + (state != null && state.ValidationVisible).ToString().ToLowerInvariant()
                + ",\"validationStrongMode\":" + (state != null && state.ValidationStrongMode).ToString().ToLowerInvariant()
                + ",\"validationMode\":\"" + EscapeJsonString(state != null ? state.ValidationMode : "standard") + "\""
                + ",\"validationOpacity\":" + (state != null ? state.ValidationOpacity : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"boundaryDebugVisible\":" + (state != null && state.BoundaryDebugVisible).ToString().ToLowerInvariant()
                + ",\"boundaryDebugMode\":\"" + EscapeJsonString(state != null ? state.BoundaryDebugMode : "none") + "\""
                + ",\"debugMode\":" + (state != null ? state.DebugMode : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"debugShowLeftRight\":" + (state != null && state.DebugShowLeftRight).ToString().ToLowerInvariant()
                + ",\"debugExaggerate\":" + (state != null && state.DebugExaggerate).ToString().ToLowerInvariant()
                + ",\"blockedReason\":\"" + EscapeJsonString(state != null ? state.BlockedReason : "none") + "\""
                + ",\"meshTriangles\":" + (state != null ? state.MeshTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"appliedTriangles\":" + (state != null ? state.MaskTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"uvAvailable\":" + (state != null && state.UvAvailable).ToString().ToLowerInvariant()
                + ",\"topologyAuditStatus\":\"" + EscapeJsonString(state != null ? state.TopologyAuditStatus : "not_run") + "\""
                + ",\"overlaySyncPhase\":\"" + EscapeJsonString(state != null ? state.OverlaySyncPhase : "not_started") + "\""
                + ",\"overlaySyncDurationMs\":" + (state != null ? state.OverlaySyncDurationMs : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"overlaySyncWorstDurationMs\":" + (state != null ? state.OverlaySyncWorstDurationMs : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"lastUpdatedMs\":" + (state != null ? state.LastUpdatedMs : 0L).ToString(CultureInfo.InvariantCulture)
                + "}");
        }

        return "{" + string.Join(",", regions) + "}";
    }

    public string BuildE7SmoothMaskStateLogFields()
    {
        RefreshLatestOverlayRegionResults();

        RegionFeatureState state = GetLatestActiveRegionFeatureState();
        string region = state != null ? state.Region : "none";
        string activeRegions = BuildActiveRegionSummary();
        int layerCount = CountKnownRegionFeatureStates();
        int enabledLayerCount = CountEnabledRegionFeatureStates();
        int payloadBytes = state != null ? state.PayloadBytes : 0;
        string recipeBatchId = state != null ? state.RecipeBatchId : "none";
        string textureSample = state != null && !string.IsNullOrWhiteSpace(state.TextureSample)
            ? state.TextureSample
            : "none";
        string colorHex = state != null && !string.IsNullOrWhiteSpace(state.ColorHex)
            ? state.ColorHex
            : "none";
        float opacity = state != null ? state.Opacity : 0.0f;
        string rendererMode = state != null && !string.IsNullOrWhiteSpace(state.RendererMode)
            ? state.RendererMode
            : "smooth-region-mask";
        string lookId = state != null && !string.IsNullOrWhiteSpace(state.LookId)
            ? state.LookId
            : "smooth_region_mask";

        return " rendererMode=" + rendererMode
            + " lookId=" + lookId
            + " region=" + region
            + " activeRegions=" + activeRegions
            + " recipeBatchId=" + recipeBatchId
            + " layerCount=" + layerCount.ToString(CultureInfo.InvariantCulture)
            + " enabledLayerCount=" + enabledLayerCount.ToString(CultureInfo.InvariantCulture)
            + " payloadBytes=" + payloadBytes.ToString(CultureInfo.InvariantCulture)
            + " texture=" + textureSample
            + " sample=" + textureSample
            + " materialId=" + (state != null ? state.MaterialId : "none")
            + " shaderMode=" + (state != null ? state.ShaderMode : "unlit-alpha-validation")
            + " passCount=" + (state != null ? state.PassCount : 0).ToString(CultureInfo.InvariantCulture)
            + " candidateId=" + (state != null ? state.CandidateId : "none")
            + " maskTextureId=" + (state != null ? state.MaskTextureId : "none")
            + " maskThreshold=" + (state != null ? state.MaskThreshold : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " maskFeatherUvNormalized=" + (state != null ? state.MaskFeatherUvNormalized : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " cornerReach=" + (state != null ? state.CornerReach : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " upperLipTightness=" + (state != null ? state.UpperLipTightness : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " lowerLipTightness=" + (state != null ? state.LowerLipTightness : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " verticalOffset=" + (state != null ? state.VerticalOffset : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " cameraBackdropAvailable=" + (state != null && state.CameraBackdropAvailable).ToString().ToLowerInvariant()
            + " lightEstimateAvailable=" + (state != null && state.LightEstimateAvailable).ToString().ToLowerInvariant()
            + " color=" + colorHex
            + " opacity=" + opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + " validationVisible=" + (state != null && state.ValidationVisible).ToString().ToLowerInvariant()
            + " validationStrongMode=" + (state != null && state.ValidationStrongMode).ToString().ToLowerInvariant()
            + " validationMode=" + (state != null ? state.ValidationMode : "standard")
            + " validationOpacity=" + (state != null ? state.ValidationOpacity : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + " boundaryDebugVisible=" + (state != null && state.BoundaryDebugVisible).ToString().ToLowerInvariant()
            + " boundaryDebugMode=" + (state != null ? state.BoundaryDebugMode : "none")
            + " blockedReason=" + (state != null ? state.BlockedReason : "none")
            + " maskSource=" + (state != null ? state.MaskSource : "smooth_region_mask")
            + " boundaryRenderer=" + (state != null ? state.BoundaryRenderer : "smooth_alpha_mask")
            + " maskStatus=smooth_mask_runtime"
            + " regionTrackingState=" + (state != null ? state.TrackingState : "None")
            + " regionStateAction=" + (state != null ? state.StateAction : "not_started")
            + " regionUvAvailable=" + (state != null && state.UvAvailable).ToString().ToLowerInvariant()
            + " regionMaskTriangles=" + (state != null ? state.MaskTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + " regionAppliedTriangles=" + (state != null ? state.MeshTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + " topologyAuditStatus=" + (state != null ? state.TopologyAuditStatus : "not_run")
            + " topologyAuditSummary=" + SanitizeLogValue(state != null ? state.TopologyAuditSummary : "none")
            + " overlaySyncPhase=" + (state != null ? state.OverlaySyncPhase : "not_started")
            + " overlaySyncFrame=" + (state != null ? state.OverlaySyncFrame : 0).ToString(CultureInfo.InvariantCulture)
            + " trackablesChangedSequence=" + (state != null ? state.TrackablesChangedSequence : 0).ToString(CultureInfo.InvariantCulture)
            + " overlaySyncDurationMs=" + (state != null ? state.OverlaySyncDurationMs : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " overlaySyncWorstDurationMs=" + (state != null ? state.OverlaySyncWorstDurationMs : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " overlaySyncCount=" + (state != null ? state.OverlaySyncCount : 0).ToString(CultureInfo.InvariantCulture)
            + " overlayTopologyChanged=" + (state != null && state.OverlayTopologyChanged).ToString().ToLowerInvariant();
    }

    public string BuildE7SmoothMaskStateJsonFragment()
    {
        RefreshLatestOverlayRegionResults();

        RegionFeatureState state = GetLatestActiveRegionFeatureState();
        string region = state != null ? state.Region : "none";
        string activeRegions = BuildActiveRegionSummary();
        int layerCount = CountKnownRegionFeatureStates();
        int enabledLayerCount = CountEnabledRegionFeatureStates();
        int payloadBytes = state != null ? state.PayloadBytes : 0;
        string recipeBatchId = state != null ? state.RecipeBatchId : "none";
        string textureSample = state != null && !string.IsNullOrWhiteSpace(state.TextureSample)
            ? state.TextureSample
            : "none";
        string colorHex = state != null && !string.IsNullOrWhiteSpace(state.ColorHex)
            ? state.ColorHex
            : "none";
        float opacity = state != null ? state.Opacity : 0.0f;
        string rendererMode = state != null && !string.IsNullOrWhiteSpace(state.RendererMode)
            ? state.RendererMode
            : "smooth-region-mask";
        string lookId = state != null && !string.IsNullOrWhiteSpace(state.LookId)
            ? state.LookId
            : "smooth_region_mask";

        return "\"rendererMode\":\"" + EscapeJsonString(rendererMode) + "\""
            + ",\"lookId\":\"" + EscapeJsonString(lookId) + "\""
            + ",\"region\":\"" + EscapeJsonString(region) + "\""
            + ",\"activeRegions\":\"" + EscapeJsonString(activeRegions) + "\""
            + ",\"recipeBatchId\":\"" + EscapeJsonString(recipeBatchId) + "\""
            + ",\"layerCount\":" + layerCount.ToString(CultureInfo.InvariantCulture)
            + ",\"enabledLayerCount\":" + enabledLayerCount.ToString(CultureInfo.InvariantCulture)
            + ",\"payloadBytes\":" + payloadBytes.ToString(CultureInfo.InvariantCulture)
            + ",\"texture\":\"" + EscapeJsonString(textureSample) + "\""
            + ",\"sample\":\"" + EscapeJsonString(textureSample) + "\""
            + ",\"materialId\":\"" + EscapeJsonString(state != null ? state.MaterialId : "none") + "\""
            + ",\"shaderMode\":\"" + EscapeJsonString(state != null ? state.ShaderMode : "unlit-alpha-validation") + "\""
            + ",\"passCount\":" + (state != null ? state.PassCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"candidateId\":\"" + EscapeJsonString(state != null ? state.CandidateId : "none") + "\""
            + ",\"maskTextureId\":\"" + EscapeJsonString(state != null ? state.MaskTextureId : "none") + "\""
            + ",\"maskThreshold\":" + (state != null ? state.MaskThreshold : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskFeatherUvNormalized\":" + (state != null ? state.MaskFeatherUvNormalized : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"cornerReach\":" + (state != null ? state.CornerReach : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"upperLipTightness\":" + (state != null ? state.UpperLipTightness : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"lowerLipTightness\":" + (state != null ? state.LowerLipTightness : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"verticalOffset\":" + (state != null ? state.VerticalOffset : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"cameraBackdropAvailable\":" + (state != null && state.CameraBackdropAvailable).ToString().ToLowerInvariant()
            + ",\"lightEstimateAvailable\":" + (state != null && state.LightEstimateAvailable).ToString().ToLowerInvariant()
            + ",\"color\":\"" + EscapeJsonString(colorHex) + "\""
            + ",\"opacity\":" + opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"validationVisible\":" + (state != null && state.ValidationVisible).ToString().ToLowerInvariant()
            + ",\"validationStrongMode\":" + (state != null && state.ValidationStrongMode).ToString().ToLowerInvariant()
            + ",\"validationMode\":\"" + EscapeJsonString(state != null ? state.ValidationMode : "standard") + "\""
            + ",\"validationOpacity\":" + (state != null ? state.ValidationOpacity : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"boundaryDebugVisible\":" + (state != null && state.BoundaryDebugVisible).ToString().ToLowerInvariant()
            + ",\"boundaryDebugMode\":\"" + EscapeJsonString(state != null ? state.BoundaryDebugMode : "none") + "\""
            + ",\"blockedReason\":\"" + EscapeJsonString(state != null ? state.BlockedReason : "none") + "\""
            + ",\"maskSource\":\"" + EscapeJsonString(state != null ? state.MaskSource : "smooth_region_mask") + "\""
            + ",\"boundaryRenderer\":\"" + EscapeJsonString(state != null ? state.BoundaryRenderer : "smooth_alpha_mask") + "\""
            + ",\"maskStatus\":\"smooth_mask_runtime\""
            + ",\"regionTrackingState\":\"" + EscapeJsonString(state != null ? state.TrackingState : "None") + "\""
            + ",\"regionStateAction\":\"" + EscapeJsonString(state != null ? state.StateAction : "not_started") + "\""
            + ",\"regionUvAvailable\":" + (state != null && state.UvAvailable).ToString().ToLowerInvariant()
            + ",\"regionMaskTriangles\":" + (state != null ? state.MaskTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"regionAppliedTriangles\":" + (state != null ? state.MeshTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"topologyAuditStatus\":\"" + EscapeJsonString(state != null ? state.TopologyAuditStatus : "not_run") + "\""
            + ",\"topologyAuditSummary\":\"" + EscapeJsonString(state != null ? state.TopologyAuditSummary : "none") + "\""
            + ",\"overlaySyncPhase\":\"" + EscapeJsonString(state != null ? state.OverlaySyncPhase : "not_started") + "\""
            + ",\"overlaySyncFrame\":" + (state != null ? state.OverlaySyncFrame : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"trackablesChangedSequence\":" + (state != null ? state.TrackablesChangedSequence : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"overlaySyncDurationMs\":" + (state != null ? state.OverlaySyncDurationMs : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncWorstDurationMs\":" + (state != null ? state.OverlaySyncWorstDurationMs : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncCount\":" + (state != null ? state.OverlaySyncCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"overlayTopologyChanged\":" + (state != null && state.OverlayTopologyChanged).ToString().ToLowerInvariant();
    }

    public string GetE7MetricPhase()
    {
        return "smooth_mask";
    }

    private RegionFeatureState GetLatestActiveRegionFeatureState()
    {
        RegionFeatureState latest = null;
        foreach (string region in FeatureSnapshotRegions)
        {
            if (!latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state)
                || !state.Enabled)
            {
                continue;
            }

            if (latest == null || state.LastUpdatedMs > latest.LastUpdatedMs)
            {
                latest = state;
            }
        }

        return latest;
    }

    private int CountKnownRegionFeatureStates()
    {
        int count = 0;
        foreach (string region in FeatureSnapshotRegions)
        {
            if (latestRegionFeatureStates.ContainsKey(region))
            {
                count++;
            }
        }

        return count;
    }

    private int CountEnabledRegionFeatureStates()
    {
        int count = 0;
        foreach (string region in FeatureSnapshotRegions)
        {
            if (latestRegionFeatureStates.TryGetValue(region, out RegionFeatureState state)
                && state.Enabled)
            {
                count++;
            }
        }

        return count;
    }

    private void LogRecipeApplied(
        string source,
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result,
        long appliedAtMs,
        int appliedFrame)
    {
        string applied = result.Applied ? "true" : "false";
        string phase = GetPhaseForRenderer(layer.RendererMode);
        string runId = GetRunIdForRenderer(layer.RendererMode);
        string visualLatencyObservation = "pending_smooth_mask_visual_review";
        Debug.Log(
            "[E4] recipe_applied"
            + " source=" + source
            + " recipeBatchId=" + layer.RecipeBatchId
            + " activeRegions=" + layer.ActiveRegions
            + " layerCount=" + layer.LayerCount.ToString(CultureInfo.InvariantCulture)
            + " enabledLayerCount=" + layer.EnabledLayerCount.ToString(CultureInfo.InvariantCulture)
            + " payloadBytes=" + layer.PayloadBytes.ToString(CultureInfo.InvariantCulture)
            + " region=" + layer.Region
            + " legacyLayer=" + layer.LegacyLayer
            + " texture=" + layer.TextureSample
            + " appliedTexture=" + result.TextureSample
            + " textureMode=" + layer.TextureMode
            + " intensity=" + layer.Intensity.ToString("0.##", CultureInfo.InvariantCulture)
            + " feather=" + layer.Feather.ToString("0.##", CultureInfo.InvariantCulture)
            + " blendMode=" + layer.BlendMode
            + " color=" + layer.ColorHex
            + " secondaryColor=" + layer.SecondaryColorHex
            + " opacity=" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + " applied=" + applied
            + " appliedRegion=" + result.Region
            + " rendererMode=" + result.RendererMode
            + " materialId=" + layer.MaterialId
            + " shaderMode=" + layer.ShaderMode
            + " passCount=" + layer.PassCount.ToString(CultureInfo.InvariantCulture)
            + " candidateId=" + layer.CandidateId
            + " maskTextureId=" + layer.MaskTextureId
            + " maskThreshold=" + layer.MaskThreshold.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskFeatherUvNormalized=" + layer.MaskFeatherUvNormalized.ToString("0.###", CultureInfo.InvariantCulture)
            + " cornerReach=" + layer.CornerReach.ToString("0.###", CultureInfo.InvariantCulture)
            + " upperLipTightness=" + layer.UpperLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + " lowerLipTightness=" + layer.LowerLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + " verticalOffset=" + layer.VerticalOffset.ToString("0.###", CultureInfo.InvariantCulture)
            + " coverage=" + layer.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
            + " finish=" + layer.Finish
            + " textureAmount=" + layer.TextureAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " gradientAmount=" + layer.GradientAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " roughness=" + layer.Roughness.ToString("0.##", CultureInfo.InvariantCulture)
            + " specular=" + layer.Specular.ToString("0.##", CultureInfo.InvariantCulture)
            + " specularPower=" + layer.SpecularPower.ToString("0.##", CultureInfo.InvariantCulture)
            + " glossBoost=" + layer.GlossBoost.ToString("0.##", CultureInfo.InvariantCulture)
            + " shimmer=" + layer.Shimmer.ToString("0.##", CultureInfo.InvariantCulture)
            + " shimmerColor=" + layer.ShimmerColor
            + " skinAdaptive=" + layer.SkinAdaptive.ToString().ToLowerInvariant()
            + " preserveDetail=" + layer.PreserveDetail.ToString().ToLowerInvariant()
            + " cameraBackdropAvailable=" + layer.CameraBackdropAvailable.ToString().ToLowerInvariant()
            + " lightEstimateAvailable=" + layer.LightEstimateAvailable.ToString().ToLowerInvariant()
            + " validationVisible=" + layer.ValidationVisible.ToString().ToLowerInvariant()
            + " validationStrongMode=" + layer.ValidationStrongMode.ToString().ToLowerInvariant()
            + " validationMode=" + layer.ValidationMode
            + " validationOpacity=" + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
            + " boundaryDebugVisible=" + layer.BoundaryDebugVisible.ToString().ToLowerInvariant()
            + " boundaryDebugMode=" + layer.BoundaryDebugMode
            + " blockedReason=" + BuildRegionApplyBlockedReason(layer, result)
            + " maskSource=" + result.MaskSource
            + " boundaryRenderer=" + result.BoundaryRenderer
            + " trackingState=" + result.TrackingState
            + " stateAction=" + result.StateAction
            + " faceCount=" + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + " meshTriangles=" + result.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " maskTriangles=" + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " uvAvailable=" + result.UvAvailable.ToString().ToLowerInvariant()
            + " topologyAuditStatus=" + result.TopologyAuditStatus
            + " topologyAuditSummary=" + SanitizeLogValue(result.TopologyAuditSummary)
            + " overlaySyncPhase=" + result.OverlaySyncPhase
            + " overlaySyncFrame=" + result.OverlaySyncFrame.ToString(CultureInfo.InvariantCulture)
            + " trackablesChangedSequence=" + result.TrackablesChangedSequence.ToString(CultureInfo.InvariantCulture)
            + " overlaySyncDurationMs=" + result.OverlaySyncDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + " overlaySyncWorstDurationMs=" + result.OverlaySyncWorstDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + " overlaySyncCount=" + result.OverlaySyncCount.ToString(CultureInfo.InvariantCulture)
            + " overlayTopologyChanged=" + result.OverlayTopologyChanged.ToString().ToLowerInvariant());

        if (layer.Region == "foundation" || layer.Region == "base")
        {
            Debug.Log(
                "[E7] foundation_recipe_applied"
                + " source=" + source
                + " recipeBatchId=" + layer.RecipeBatchId
                + " activeRegions=" + layer.ActiveRegions
                + " enabled=" + layer.Enabled.ToString().ToLowerInvariant()
                + " validationVisible=" + layer.ValidationVisible.ToString().ToLowerInvariant()
                + " applied=" + applied
                + " blockedReason=" + BuildRegionApplyBlockedReason(layer, result)
                + " maskTextureId=" + layer.MaskTextureId
                + " texture=" + layer.TextureSample
                + " blendMode=" + layer.BlendMode
                + " color=" + layer.ColorHex
                + " skinBase=" + layer.SecondaryColorHex
                + " opacity=" + layer.Opacity.ToString("0.###", CultureInfo.InvariantCulture)
                + " intensity=" + layer.Intensity.ToString("0.###", CultureInfo.InvariantCulture)
                + " coverage=" + layer.Coverage.ToString("0.###", CultureInfo.InvariantCulture)
                + " finish=" + layer.Finish
                + " roughness=" + layer.Roughness.ToString("0.###", CultureInfo.InvariantCulture)
                + " glossBoost=" + layer.GlossBoost.ToString("0.###", CultureInfo.InvariantCulture)
                + " resultRegion=" + result.Region
                + " resultTexture=" + result.TextureSample
                + " maskTriangles=" + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
                + " meshTriangles=" + result.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
                + " uvAvailable=" + result.UvAvailable.ToString().ToLowerInvariant()
                + " trackingState=" + result.TrackingState
                + " faceCount=" + result.FaceCount.ToString(CultureInfo.InvariantCulture));
        }

        Debug.Log(
            "[E7] recipe_latency"
            + " source=unity_applied"
            + " runId=" + runId
            + " phase=" + phase
            + " timestampMs=" + appliedAtMs.ToString(CultureInfo.InvariantCulture)
            + " rendererMode=" + result.RendererMode
            + " candidateId=" + layer.CandidateId
            + " maskTextureId=" + layer.MaskTextureId
            + " lookId=" + layer.LookId
            + " recipeId=" + layer.RecipeId
            + " recipeBatchId=" + layer.RecipeBatchId
            + " activeRegions=" + layer.ActiveRegions
            + " layerCount=" + layer.LayerCount.ToString(CultureInfo.InvariantCulture)
            + " enabledLayerCount=" + layer.EnabledLayerCount.ToString(CultureInfo.InvariantCulture)
            + " payloadBytes=" + layer.PayloadBytes.ToString(CultureInfo.InvariantCulture)
            + " region=" + layer.Region
            + " texture=" + layer.TextureSample
            + " finish=" + layer.Finish
            + " textureAmount=" + layer.TextureAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " glossBoost=" + layer.GlossBoost.ToString("0.##", CultureInfo.InvariantCulture)
            + " coverage=" + layer.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
            + " feather=" + layer.Feather.ToString("0.##", CultureInfo.InvariantCulture)
            + " sentAtMs=" + layer.SentAtMs.ToString("0", CultureInfo.InvariantCulture)
            + " appliedAtMs=" + appliedAtMs.ToString(CultureInfo.InvariantCulture)
            + " appliedFrame=" + appliedFrame.ToString(CultureInfo.InvariantCulture)
            + " receivedAtMs=0"
            + " sendToAckLatencyMs=0"
            + " visualLatencyConfirmedByRecording=false"
            + " visualLatencyObservation=" + visualLatencyObservation
            + " validationVisible=" + layer.ValidationVisible.ToString().ToLowerInvariant()
            + " validationStrongMode=" + layer.ValidationStrongMode.ToString().ToLowerInvariant()
            + " validationMode=" + layer.ValidationMode
            + " validationOpacity=" + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
            + " boundaryDebugVisible=" + layer.BoundaryDebugVisible.ToString().ToLowerInvariant()
            + " blockedReason=" + BuildRegionApplyBlockedReason(layer, result)
            + " topologyAuditStatus=" + result.TopologyAuditStatus);
    }

    private void SendRecipeAppliedEvent(
        ParsedRecipeLayer layer,
        E3RegionMaskOverlay.RegionApplyResult result,
        long appliedAtMs,
        int appliedFrame)
    {
        SendUnityEvent(
            "{\"type\":\"recipe_applied\",\"region\":\""
            + EscapeJsonString(layer.Region)
            + "\",\"layer\":\""
            + EscapeJsonString(layer.LegacyLayer)
            + "\",\"recipeBatchId\":\""
            + EscapeJsonString(layer.RecipeBatchId)
            + "\",\"activeRegions\":\""
            + EscapeJsonString(layer.ActiveRegions)
            + "\",\"layerCount\":"
            + layer.LayerCount.ToString(CultureInfo.InvariantCulture)
            + ",\"enabledLayerCount\":"
            + layer.EnabledLayerCount.ToString(CultureInfo.InvariantCulture)
            + ",\"payloadBytes\":"
            + layer.PayloadBytes.ToString(CultureInfo.InvariantCulture)
            + ",\"appliedRegion\":\""
            + EscapeJsonString(result.Region)
            + "\",\"texture\":\""
            + EscapeJsonString(layer.TextureSample)
            + "\",\"sample\":\""
            + EscapeJsonString(layer.TextureSample)
            + "\",\"appliedTexture\":\""
            + EscapeJsonString(result.TextureSample)
            + "\",\"textureMode\":\""
            + EscapeJsonString(layer.TextureMode)
            + "\",\"blendMode\":\""
            + EscapeJsonString(layer.BlendMode)
            + "\",\"applied\":"
            + result.Applied.ToString().ToLowerInvariant()
            + ",\"rendererMode\":\""
            + EscapeJsonString(result.RendererMode)
            + "\",\"runId\":\""
            + EscapeJsonString(GetRunIdForRenderer(layer.RendererMode))
            + "\",\"phase\":\""
            + EscapeJsonString(GetPhaseForRenderer(layer.RendererMode))
            + "\",\"maskSource\":\""
            + EscapeJsonString(result.MaskSource)
            + "\",\"boundaryRenderer\":\""
            + EscapeJsonString(result.BoundaryRenderer)
            + "\",\"trackingState\":\""
            + EscapeJsonString(result.TrackingState)
            + "\",\"stateAction\":\""
            + EscapeJsonString(result.StateAction)
            + "\",\"lookId\":\""
            + EscapeJsonString(layer.LookId)
            + "\",\"recipeId\":\""
            + EscapeJsonString(layer.RecipeId)
            + "\",\"sentAtMs\":"
            + layer.SentAtMs.ToString("0", CultureInfo.InvariantCulture)
            + ",\"appliedAtMs\":"
            + appliedAtMs.ToString(CultureInfo.InvariantCulture)
            + ",\"appliedFrame\":"
            + appliedFrame.ToString(CultureInfo.InvariantCulture)
            + ",\"visualLatencyConfirmedByRecording\":false"
            + ",\"visualLatencyObservation\":\""
            + EscapeJsonString("pending_smooth_mask_visual_review")
            + "\""
            + ",\"faceCount\":"
            + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshTriangles\":"
            + result.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTriangles\":"
            + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"uvAvailable\":"
            + result.UvAvailable.ToString().ToLowerInvariant()
            + ",\"meshVertexCount\":"
            + result.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshIndexCount\":"
            + result.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshUvCount\":"
            + result.MeshUvCount.ToString(CultureInfo.InvariantCulture)
            + ",\"topologyAuditStatus\":\""
            + EscapeJsonString(result.TopologyAuditStatus)
            + "\",\"topologyAuditSummary\":\""
            + EscapeJsonString(result.TopologyAuditSummary)
            + "\""
            + ",\"overlaySyncPhase\":\""
            + EscapeJsonString(result.OverlaySyncPhase)
            + "\",\"overlaySyncFrame\":"
            + result.OverlaySyncFrame.ToString(CultureInfo.InvariantCulture)
            + ",\"trackablesChangedSequence\":"
            + result.TrackablesChangedSequence.ToString(CultureInfo.InvariantCulture)
            + ",\"overlaySyncDurationMs\":"
            + result.OverlaySyncDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncWorstDurationMs\":"
            + result.OverlaySyncWorstDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"overlaySyncCount\":"
            + result.OverlaySyncCount.ToString(CultureInfo.InvariantCulture)
            + ",\"overlayTopologyChanged\":"
            + result.OverlayTopologyChanged.ToString().ToLowerInvariant()
            + ",\"color\":\""
            + EscapeJsonString(layer.ColorHex)
            + "\",\"opacity\":"
            + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"validationVisible\":"
            + layer.ValidationVisible.ToString().ToLowerInvariant()
            + ",\"validationStrongMode\":"
            + layer.ValidationStrongMode.ToString().ToLowerInvariant()
            + ",\"validationMode\":\""
            + EscapeJsonString(layer.ValidationMode)
            + "\",\"validationOpacity\":"
            + layer.ValidationOpacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"boundaryDebugVisible\":"
            + layer.BoundaryDebugVisible.ToString().ToLowerInvariant()
            + ",\"boundaryDebugMode\":\""
            + EscapeJsonString(layer.BoundaryDebugMode)
            + "\",\"blockedReason\":\""
            + EscapeJsonString(BuildRegionApplyBlockedReason(layer, result))
            + "\""
            + ",\"intensity\":"
            + layer.Intensity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"feather\":"
            + layer.Feather.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"materialId\":\""
            + EscapeJsonString(layer.MaterialId)
            + "\",\"shaderMode\":\""
            + EscapeJsonString(layer.ShaderMode)
            + "\",\"passCount\":"
            + layer.PassCount.ToString(CultureInfo.InvariantCulture)
            + ",\"candidateId\":\""
            + EscapeJsonString(layer.CandidateId)
            + "\""
            + ",\"maskTextureId\":\""
            + EscapeJsonString(layer.MaskTextureId)
            + "\",\"maskThreshold\":"
            + layer.MaskThreshold.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskFeatherUvNormalized\":"
            + layer.MaskFeatherUvNormalized.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"cornerReach\":"
            + layer.CornerReach.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"upperLipTightness\":"
            + layer.UpperLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"lowerLipTightness\":"
            + layer.LowerLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"verticalOffset\":"
            + layer.VerticalOffset.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"coverage\":"
            + layer.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"finish\":\""
            + EscapeJsonString(layer.Finish)
            + "\",\"textureAmount\":"
            + layer.TextureAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"roughness\":"
            + layer.Roughness.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"specular\":"
            + layer.Specular.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"specularPower\":"
            + layer.SpecularPower.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"glossBoost\":"
            + layer.GlossBoost.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"shimmer\":"
            + layer.Shimmer.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"shimmerColor\":\""
            + EscapeJsonString(layer.ShimmerColor)
            + "\",\"skinAdaptive\":"
            + layer.SkinAdaptive.ToString().ToLowerInvariant()
            + ",\"preserveDetail\":"
            + layer.PreserveDetail.ToString().ToLowerInvariant()
            + ",\"cameraBackdropAvailable\":"
            + layer.CameraBackdropAvailable.ToString().ToLowerInvariant()
            + ",\"lightEstimateAvailable\":"
            + layer.LightEstimateAvailable.ToString().ToLowerInvariant()
            + "}");
    }

    private static List<ParsedRecipeLayer> ParseRecipeLayers(RecipePayload recipe, int payloadBytes)
    {
        List<ParsedRecipeLayer> layers = new List<ParsedRecipeLayer>();

        if (recipe.layers == null || recipe.layers.Length == 0)
        {
            int actualLayerCount = recipe.layers != null ? recipe.layers.Length : 0;
            throw new ArgumentException(
                "Recipe batch must include at least one layer; received "
                + actualLayerCount.ToString(CultureInfo.InvariantCulture)
                + ".");
        }

        for (int index = 0; index < recipe.layers.Length; index++)
        {
            layers.Add(ParseRecipeLayer(recipe.layers[index], recipe, index, payloadBytes));
        }

        return layers;
    }

    private static void ApplyBatchMetadata(
        List<ParsedRecipeLayer> layers,
        string recipeBatchId,
        string activeRegions,
        int layerCount,
        int enabledLayerCount,
        int payloadBytes)
    {
        for (int index = 0; index < layers.Count; index++)
        {
            ParsedRecipeLayer layer = layers[index];
            layer.RecipeBatchId = recipeBatchId;
            layer.ActiveRegions = activeRegions;
            layer.LayerCount = layerCount;
            layer.EnabledLayerCount = enabledLayerCount;
            layer.PayloadBytes = payloadBytes;
            layers[index] = layer;
        }
    }

    private static int CountEnabledLayers(List<ParsedRecipeLayer> layers)
    {
        int count = 0;
        foreach (ParsedRecipeLayer layer in layers)
        {
            if (layer.Enabled)
            {
                count++;
            }
        }

        return count;
    }

    private static ParsedRecipeLayer ParseRecipeLayer(RecipeLayerPayload layer, RecipePayload recipe, int index, int payloadBytes)
    {
        if (layer == null)
        {
            throw new ArgumentException("Recipe layer " + index.ToString(CultureInfo.InvariantCulture) + " is null.");
        }

        string region = NormalizeRegion(layer.region, layer.layer);
        string colorHex = NormalizeColor(layer.color);
        string secondaryColorHex = NormalizeSecondaryColor(layer.secondaryColor, recipe.secondaryColor, colorHex);
        float opacity = Mathf.Clamp01(layer.opacity);
        string textureSample = NormalizeTextureSample(region, layer.texture, layer.sample);

        if (!ColorUtility.TryParseHtmlString(colorHex, out Color parsedColor))
        {
            throw new ArgumentException("Recipe color is not a valid HTML color: " + colorHex);
        }

        if (!ColorUtility.TryParseHtmlString(secondaryColorHex, out Color parsedSecondaryColor))
        {
            parsedSecondaryColor = parsedColor;
        }

        return new ParsedRecipeLayer
        {
            Id = string.IsNullOrWhiteSpace(layer.id) ? region + "-e3" : layer.id,
            Region = region,
            LegacyLayer = string.IsNullOrWhiteSpace(layer.layer) ? region : layer.layer,
            ColorHex = colorHex,
            Color = parsedColor,
            SecondaryColorHex = secondaryColorHex,
            SecondaryColor = parsedSecondaryColor,
            Opacity = opacity,
            RecipeId = NormalizeRecipeId(layer.recipeId, recipe.recipeId, region, index),
            RecipeBatchId = NormalizeRecipeBatchId(layer.recipeBatchId, recipe.recipeBatchId, recipe.recipeId),
            LookId = NormalizeLookId(layer.lookId, recipe.lookId),
            SentAtMs = NormalizeSentAtMs(layer.sentAtMs, recipe.sentAtMs),
            ActiveRegions = NormalizeActiveRegions(layer.activeRegions, recipe.activeRegions),
            LayerCount = layer.layerCount > 0 ? layer.layerCount : recipe.layerCount,
            EnabledLayerCount = layer.enabledLayerCount > 0
                ? layer.enabledLayerCount
                : recipe.enabledLayerCount,
            PayloadBytes = payloadBytes,
            TextureSample = textureSample,
            TextureMode = NormalizeTextureMode(layer.textureMode),
            Intensity = NormalizeIntensity(layer.intensity),
            Feather = NormalizeFeather(layer.feather),
            BlendMode = NormalizeBlendMode(layer.blendMode, textureSample),
            RendererMode = NormalizeRendererMode(layer.rendererMode, recipe.rendererMode),
            Enabled = layer.enabled,
            Coverage = NormalizeNonNegativeFloat(layer.coverage, recipe.coverage),
            Finish = NormalizeOptional(layer.finish, recipe.finish, "validation-placeholder"),
            TextureAmount = NormalizeTextureAmount(layer.textureAmount, recipe.textureAmount, NormalizeIntensity(layer.intensity)),
            GradientAmount = NormalizeTextureAmount(layer.gradientAmount, recipe.gradientAmount, 0.0f),
            Roughness = NormalizeNonNegativeFloat(layer.roughness, recipe.roughness),
            Specular = NormalizeNonNegativeFloat(layer.specular, recipe.specular),
            SpecularPower = NormalizeNonNegativeFloat(layer.specularPower, recipe.specularPower),
            GlossBoost = NormalizeNonNegativeFloat(layer.glossBoost, recipe.glossBoost),
            Shimmer = NormalizeNonNegativeFloat(layer.shimmer, recipe.shimmer),
            ShimmerColor = NormalizeOptional(layer.shimmerColor, recipe.shimmerColor, "#FFFFFF"),
            SkinAdaptive = layer.skinAdaptive || recipe.skinAdaptive,
            PreserveDetail = layer.preserveDetail || recipe.preserveDetail || true,
            MaterialId = NormalizeOptional(layer.materialId, recipe.materialId, textureSample + "-validation-material"),
            ShaderMode = NormalizeOptional(layer.shaderMode, recipe.shaderMode, "unlit-alpha-validation"),
            PassCount = layer.passCount > 0 ? layer.passCount : (recipe.passCount > 0 ? recipe.passCount : 1),
            CandidateId = NormalizeCandidateId(layer.candidateId, recipe.candidateId, region),
            MaskTextureId = NormalizeMaskTextureId(layer.maskTextureId, recipe.maskTextureId, region),
            MaskThreshold = NormalizeMaskThreshold(layer.maskThreshold, recipe.maskThreshold),
            MaskFeatherUvNormalized = NormalizeMaskFeather(layer.maskFeatherUvNormalized, recipe.maskFeatherUvNormalized),
            CornerReach = NormalizeLipAdjustment(layer.cornerReach, recipe.cornerReach, region),
            UpperLipTightness = NormalizeLipAdjustment(layer.upperLipTightness, recipe.upperLipTightness, region),
            LowerLipTightness = NormalizeLipAdjustment(layer.lowerLipTightness, recipe.lowerLipTightness, region),
            VerticalOffset = NormalizeLipAdjustment(layer.verticalOffset, recipe.verticalOffset, region),
            CameraBackdropAvailable = layer.cameraBackdropAvailable || recipe.cameraBackdropAvailable,
            LightEstimateAvailable = layer.lightEstimateAvailable || recipe.lightEstimateAvailable,
            FoundationMode = NormalizeFoundationMode(
                layer.foundationMode,
                layer.mode,
                recipe.foundationMode,
                recipe.mode,
                region),
            FoundationFallbackMode = NormalizeFoundationFallbackMode(
                layer.foundationFallbackMode,
                layer.fallbackMode,
                recipe.foundationFallbackMode,
                recipe.fallbackMode,
                region),
            FoundationDebugMaskMode = NormalizeFoundationDebugMaskMode(
                layer.debugMaskMode,
                recipe.debugMaskMode,
                region),
            ValidationVisible = layer.enabled,
            ValidationStrongMode = false,
            ValidationMode = "standard",
            ValidationOpacity = opacity,
            BoundaryDebugVisible = false,
            BoundaryDebugMode = "none"
        };
    }

    private static string NormalizeRegion(string region, string legacyLayer)
    {
        string value = !string.IsNullOrWhiteSpace(region) ? region : legacyLayer;
        value = string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim().ToLowerInvariant();

        if (value == "base")
        {
            return "foundation";
        }

        if (value == "foundation"
            || value == "lip"
            || value == "cheek"
            || value == "eye"
            || value == "blush"
            || value == "brow"
            || value == "eyeliner")
        {
            return value;
        }

        throw new ArgumentException("Unsupported E4 region: " + value);
    }

    private static string NormalizeFoundationMode(
        string preferred,
        string secondary,
        string recipePreferred,
        string recipeSecondary,
        string region)
    {
        if (region != "foundation")
        {
            return "uvMask";
        }

        string value = FirstNonBlank(preferred, secondary, recipePreferred, recipeSecondary);
        if (string.IsNullOrWhiteSpace(value))
        {
            return "uvMask";
        }

        value = value.Trim();
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

    private static string NormalizeFoundationFallbackMode(
        string preferred,
        string secondary,
        string recipePreferred,
        string recipeSecondary,
        string region)
    {
        if (region != "foundation")
        {
            return "uvMask";
        }

        string value = FirstNonBlank(preferred, secondary, recipePreferred, recipeSecondary);
        if (string.IsNullOrWhiteSpace(value))
        {
            return "uvMask";
        }

        value = value.Trim();
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

    private static int NormalizeFoundationDebugMaskMode(int preferred, int secondary, string region)
    {
        // 0-16: modes 8-11 are the in-app mask orientation probes
        // (8=none, 9=X, 10=Y, 11=XY). This entry clamp MUST match the
        // controller/E3 clamps or the probe buttons silently degrade to 8.
        // Mode 12 is a shader-only asymmetric basic-mask test. Modes 13-16
        // test clockwise/counter-clockwise 90-degree display rotations. Mode
        // 19 is a shader-path confirmation fill.
        return region == "foundation" ? Mathf.Clamp(preferred != 0 ? preferred : secondary, 0, 24) : 0;
    }

    private static string FirstNonBlank(params string[] values)
    {
        foreach (string value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return string.Empty;
    }

    private static string NormalizeColor(string color)
    {
        if (string.IsNullOrWhiteSpace(color))
        {
            throw new ArgumentException("Recipe color is missing.");
        }

        return color.Trim();
    }

    private static string NormalizeSecondaryColor(string preferred, string secondary, string fallback)
    {
        string value = NormalizeOptional(preferred, secondary, fallback);
        value = string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
        if (!value.StartsWith("#", StringComparison.Ordinal)
            && (value.Length == 6 || value.Length == 8))
        {
            value = "#" + value;
        }

        return value;
    }

    private static string NormalizeRecipeId(string preferred, string secondaryRecipeId, string region, int index)
    {
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred.Trim();
        }

        if (!string.IsNullOrWhiteSpace(secondaryRecipeId))
        {
            return secondaryRecipeId.Trim();
        }

        return "smooth-mask-" + region + "-" + index.ToString(CultureInfo.InvariantCulture);
    }

    private static string NormalizeRecipeBatchId(params string[] values)
    {
        foreach (string value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return "none";
    }

    private static string NormalizeActiveRegions(string preferred, string secondarySummary)
    {
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return SanitizeLogValue(preferred);
        }

        if (!string.IsNullOrWhiteSpace(secondarySummary))
        {
            return SanitizeLogValue(secondarySummary);
        }

        return "none";
    }

    private static string NormalizeActiveRegions(string preferred, List<ParsedRecipeLayer> layers)
    {
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return SanitizeLogValue(preferred);
        }

        List<string> activeRegions = new List<string>();
        foreach (ParsedRecipeLayer layer in layers)
        {
            if (layer.Enabled)
            {
                activeRegions.Add(layer.Region);
            }
        }

        return activeRegions.Count > 0 ? string.Join(",", activeRegions) : "none";
    }

    private static string NormalizeLookId(string preferred, string secondaryLookId)
    {
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred.Trim();
        }

        if (!string.IsNullOrWhiteSpace(secondaryLookId))
        {
            return secondaryLookId.Trim();
        }

        return "smooth_region_mask";
    }

    private static double NormalizeSentAtMs(double preferred, double secondarySentAtMs)
    {
        if (preferred > 0.0)
        {
            return preferred;
        }

        return secondarySentAtMs > 0.0 ? secondarySentAtMs : 0.0;
    }

    private static string NormalizeTextureSample(string region, string texture, string sample)
    {
        if (string.IsNullOrWhiteSpace(texture))
        {
            throw new ArgumentException("Recipe texture is missing for region " + region + ".");
        }

        string value = texture.Trim().ToLowerInvariant();
        if (!string.IsNullOrWhiteSpace(sample)
            && sample.Trim().ToLowerInvariant() != value)
        {
            throw new ArgumentException(
                "Recipe sample does not match texture for region " + region + ": " + sample);
        }

        if ((region == "foundation"
                && (value == "foundation_natural"
                    || value == "foundation_matte"
                    || value == "foundation_glow"))
            || (region == "lip"
                && (value == "matte_lip"
                    || value == "gloss_lip"
                    || value == "full_lip"
                    || value == "gradient_lip"
                    || value == "overline_lip"))
            || ((region == "cheek" || region == "blush") && IsCheekBlushTextureSample(value))
            || (region == "brow" && value == "natural_brow")
            || ((region == "eye" || region == "eyeliner") && value == "shimmer_eye"))
        {
            return value;
        }

        throw new ArgumentException("Unsupported E4 texture sample for region " + region + ": " + value);
    }

    private static string NormalizeTextureMode(string textureMode)
    {
        string value = string.IsNullOrWhiteSpace(textureMode)
            ? "sample"
            : textureMode.Trim().ToLowerInvariant();

        if (value == "sample")
        {
            return value;
        }

        throw new ArgumentException("Unsupported E4 texture mode: " + value);
    }

    private static float NormalizeIntensity(float intensity)
    {
        if (intensity <= 0.0f)
        {
            return 1.0f;
        }

        return Mathf.Clamp01(intensity);
    }

    private static float NormalizeNonNegativeFloat(float preferred, float secondary)
    {
        float value = preferred > 0.0f ? preferred : secondary;
        return Mathf.Max(0.0f, value);
    }

    private static float NormalizeTextureAmount(float preferred, float secondary, float defaultValue)
    {
        if (preferred > 0.0f)
        {
            return Mathf.Clamp01(preferred);
        }

        if (secondary > 0.0f)
        {
            return Mathf.Clamp01(secondary);
        }

        return Mathf.Clamp01(defaultValue);
    }

    private static float NormalizeFeather(float feather)
    {
        return Mathf.Clamp01(feather);
    }

    private static string NormalizeBlendMode(string blendMode, string textureSample)
    {
        if (string.IsNullOrWhiteSpace(blendMode))
        {
            throw new ArgumentException("Recipe blend mode is missing for texture " + textureSample + ".");
        }

        string value = blendMode.Trim().ToLowerInvariant();

        if (value == "normal" || value == "multiply" || value == "screen")
        {
            return value;
        }

        throw new ArgumentException("Unsupported E4 blend mode: " + value);
    }

    private static string NormalizeRendererMode(string preferred, string secondary)
    {
        string value = !string.IsNullOrWhiteSpace(preferred) ? preferred : secondary;
        value = string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().ToLowerInvariant();
        if (value == "smooth-region-mask")
        {
            return value;
        }

        throw new ArgumentException("Unsupported renderer mode: " + value);
    }

    private static string GetPhaseForRenderer(string rendererMode)
    {
        return "smooth_mask";
    }

    private static string GetRunIdForRenderer(string rendererMode)
    {
        string date = DateTimeOffset.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        return "smooth-mask-" + date;
    }

    private static string NormalizeMaskTextureId(string preferred, string secondary, string region)
    {
        if (string.IsNullOrWhiteSpace(preferred))
        {
            throw new ArgumentException("Recipe mask texture id is missing for region " + region + ".");
        }

        string value = preferred.Trim();
        string expected = GetDefaultMaskTextureId(region);
        if (value == expected)
        {
            return value;
        }

        if (region == "lip"
            && (value.StartsWith("e7-lip-validation-", StringComparison.Ordinal)
                || IsGeneratedLipMaskTextureId(value)))
        {
            return value;
        }

        if (IsFullFaceRegionMaskTextureId(region, value))
        {
            return value;
        }

        throw new ArgumentException(
            "Unsupported mask texture id for region " + region + ": " + value);
    }

    private static string NormalizeCandidateId(string preferred, string secondary, string region)
    {
        string value = !string.IsNullOrWhiteSpace(preferred) ? preferred : secondary;
        value = string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim();
        if (region == "lip"
            && (value == "lip-smooth-mask-v1"
                || value == "lip-tight-auto-v0"
                || value == "lip-tight-user-v0"
                || value == "lip-safe-v0"
                || value.StartsWith("cv-", StringComparison.Ordinal)))
        {
            return value;
        }

        string expected = GetDefaultMaskTextureId(region);
        if (value == expected)
        {
            return value;
        }

        if (IsFullFaceRegionCandidateId(region, value))
        {
            return value;
        }

        throw new ArgumentException("Unsupported candidate id for region " + region + ": " + value);
    }

    private static float NormalizeMaskThreshold(float preferred, float secondary)
    {
        float value = preferred > 0.0f ? preferred : secondary;
        return value > 0.0f ? Mathf.Clamp01(value) : -1.0f;
    }

    private static float NormalizeMaskFeather(float preferred, float secondary)
    {
        float value = preferred > 0.0f ? preferred : secondary;
        return value > 0.0f ? Mathf.Clamp01(value) : -1.0f;
    }

    private static float NormalizeLipAdjustment(float preferred, float secondary, string region)
    {
        if (region != "lip")
        {
            return 0.0f;
        }

        float value = Math.Abs(preferred) > 0.0001f ? preferred : secondary;
        return Mathf.Clamp(value, -1.0f, 1.0f);
    }

    private static string GetDefaultMaskTextureId(string region)
    {
        switch (region)
        {
            case "foundation":
                return "foundation-skin-mask-v1";
            case "cheek":
            case "blush":
                return "cheek-session-mask-1-v1";
            case "eye":
            case "brow":
            case "eyeliner":
                return "eye-smooth-mask-v1";
            default:
                return "lip-smooth-mask-v1";
        }
    }

    private static bool IsFullFaceRegionMaskTextureId(string region, string maskTextureId)
    {
        if (string.IsNullOrWhiteSpace(maskTextureId))
        {
            return false;
        }

        string value = maskTextureId.Trim();
        return (region == "foundation" && value == "foundation-skin-mask-v1")
            || (region == "lip" && value.StartsWith("e7-lip-", StringComparison.Ordinal))
            || ((region == "blush" || region == "cheek")
                && (value.StartsWith("e7-blush-", StringComparison.Ordinal)
                    || value.StartsWith("cheek-", StringComparison.Ordinal)))
            || (region == "brow"
                && (value.StartsWith("e7-brow-", StringComparison.Ordinal)
                    || IsGeneratedBrowMaskTextureId(value)
                    || value.StartsWith("brow-", StringComparison.Ordinal)
                    || value.StartsWith("psd-arcore-brow-", StringComparison.Ordinal)))
            || ((region == "eyeliner" || region == "eye")
                && (value.StartsWith("e7-eyeliner-", StringComparison.Ordinal)
                    || value.StartsWith("eye-", StringComparison.Ordinal)));
    }

    private static bool IsCheekBlushTextureSample(string value)
    {
        return value == "soft_blush"
            || value == "blush_session_1"
            || value == "blush_session_2"
            || value == "blush_session_3"
            || value == "blush_session_4"
            || value == "blush_session_5";
    }

    private static bool IsGeneratedLipMaskTextureId(string maskTextureId)
    {
        return !string.IsNullOrWhiteSpace(maskTextureId)
            && maskTextureId.Trim().StartsWith("e7-generated-lip-", StringComparison.Ordinal);
    }

    private static bool IsGeneratedBrowMaskTextureId(string maskTextureId)
    {
        return !string.IsNullOrWhiteSpace(maskTextureId)
            && maskTextureId.Trim().StartsWith("e7-generated-brow-", StringComparison.Ordinal);
    }

    private static bool IsFullFaceRegionCandidateId(string region, string candidateId)
    {
        if (string.IsNullOrWhiteSpace(candidateId))
        {
            return false;
        }

        string value = candidateId.Trim();
        return (region == "foundation" && value.StartsWith("foundation-", StringComparison.Ordinal))
            || (region == "lip" && value.StartsWith("lip-", StringComparison.Ordinal))
            || ((region == "blush" || region == "cheek")
                && (value.StartsWith("blush-", StringComparison.Ordinal)
                    || value.StartsWith("blush_", StringComparison.Ordinal)))
            || (region == "brow" && (value.StartsWith("brow-", StringComparison.Ordinal)
                || IsGeneratedBrowMaskTextureId(value)))
            || (region == "eyeliner" && value.StartsWith("eyeliner-", StringComparison.Ordinal));
    }

    private static double CalculateLatencyMs(double startMs, double endMs)
    {
        if (startMs <= 0.0 || endMs <= 0.0)
        {
            return 0.0;
        }

        return Math.Max(0.0, endMs - startMs);
    }

    private static string NormalizeOptional(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? "none" : value.Trim();
    }

    private static string NormalizeOptional(string preferred, string secondary, string defaultValue)
    {
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred.Trim();
        }

        if (!string.IsNullOrWhiteSpace(secondary))
        {
            return secondary.Trim();
        }

        return defaultValue;
    }

    private static string NormalizeOptional(params string[] values)
    {
        if (values == null)
        {
            return "none";
        }

        foreach (string value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value.Trim();
            }
        }

        return "none";
    }

    private static string SanitizeLogValue(string value)
    {
        return NormalizeOptional(value).Replace(" ", "_").Replace("\n", "_").Replace("\r", "_");
    }

    private static void SendUnityEvent(string message)
    {
        SendUnityEvent(message, "[M6]");
    }

    private static void SendUnityEvent(string message, string logPrefix)
    {
        string logSummary = BuildUnityEventLogSummary(message);
        Debug.Log(logPrefix + " unity_to_rn_send " + logSummary);

#if UNITY_IOS && !UNITY_EDITOR
        try
        {
            sendMessageToMobileApp(message);
        }
        catch (Exception exception)
        {
            Debug.LogError(logPrefix + " unity_to_rn_send_failed error=" + exception.Message + " " + logSummary);
        }
#else
            Debug.Log(logPrefix + " unity_to_rn_editor_event " + logSummary);
#endif
    }

    private static string BuildUnityEventLogSummary(string message)
    {
        return "type=" + SanitizeLogValue(ExtractJsonStringField(message, "type"))
            + " region=" + SanitizeLogValue(ExtractJsonStringField(message, "region"))
            + " recipeBatchId=" + SanitizeLogValue(ExtractJsonStringField(message, "recipeBatchId"))
            + " activeRegions=" + SanitizeLogValue(ExtractJsonStringField(message, "activeRegions"))
            + " payloadBytes=" + (message != null ? message.Length : 0).ToString(CultureInfo.InvariantCulture);
    }

    private static string ExtractJsonStringField(string json, string key)
    {
        if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key))
        {
            return "none";
        }

        string needle = "\"" + key + "\":\"";
        int start = json.IndexOf(needle, StringComparison.Ordinal);
        if (start < 0)
        {
            return "none";
        }

        start += needle.Length;
        int end = json.IndexOf('"', start);
        if (end < 0 || end <= start)
        {
            return "none";
        }

        return json.Substring(start, end - start);
    }

    private static string EscapeJsonString(string value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"");
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

        if (material.HasProperty("_ZWrite"))
        {
            material.SetInt("_ZWrite", 0);
        }

        material.DisableKeyword("_ALPHATEST_ON");
        material.EnableKeyword("_ALPHABLEND_ON");
        material.DisableKeyword("_ALPHAPREMULTIPLY_ON");
        material.renderQueue = (int)RenderQueue.Transparent;
    }
}
