using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Collections;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.ARFoundation;

public sealed class RNBridge : MonoBehaviour
{
    private static readonly string[] FeatureSnapshotRegions = MakeupRegionRendererRoutes.Regions;

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
        public string lipRenderLayerMode;
        public string glossHighlightMode;
        public float intensity;
        public float feather;
        public string blendMode;
        public string rendererMode;
        public float coverage;
        public float maskSpreadX;
        public float maskOffsetY;
        public string finish;
        public float textureAmount;
        public float roughness;
        public float specular;
        public float specularPower;
        public float glossBoost;
        public float gradientAmount;
        public float detailAmount;
        public float shimmer;
        public string shimmerColor;
        public bool skinAdaptive;
        public bool preserveDetail;
        public string materialId;
        public string shaderMode;
        public int passCount;
        public string maskTextureId;
        public bool cameraBackdropAvailable;
        public bool lightEstimateAvailable;
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
        public float maskSpreadX;
        public float maskOffsetY;
        public string finish;
        public float textureAmount;
        public float roughness;
        public float specular;
        public float specularPower;
        public float glossBoost;
        public float gradientAmount;
        public float detailAmount;
        public float shimmer;
        public string shimmerColor;
        public bool skinAdaptive;
        public bool preserveDetail;
        public string materialId;
        public string shaderMode;
        public int passCount;
        public string maskTextureId;
        public bool cameraBackdropAvailable;
        public bool lightEstimateAvailable;
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
        public bool maskOverlayVisible = true;
        public bool guideOverlayVisible = true;
        public bool meshOverlayVisible = false;
        public bool diagnosticsHudVisible = true;
        public string guideOverlayMode = "mesh_landmarks";
        public string meshRenderMode = "wireframe";
        public string maskDebugViewMode = "final";
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
        public string RegionRendererId;
        public float Intensity;
        public float Feather;
        public string BlendMode;
        public string RendererMode;
        public bool Enabled;
        public float Coverage;
        public float MaskSpreadX;
        public float MaskOffsetY;
        public string Finish;
        public float TextureAmount;
        public float Roughness;
        public float Specular;
        public float SpecularPower;
        public float GlossBoost;
        public float GradientAmount;
        public float DetailAmount;
        public float Shimmer;
        public string ShimmerColor;
        public bool SkinAdaptive;
        public bool PreserveDetail;
        public string MaterialId;
        public string ShaderMode;
        public int PassCount;
        public string MaskTextureId;
        public bool CameraBackdropAvailable;
        public bool LightEstimateAvailable;
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
        public string LipRenderLayerMode = "none";
        public string GlossHighlightMode = "none";
        public string BlendMode = string.Empty;
        public float Intensity;
        public float Feather;
        public string RecipeBatchId = "none";
        public string LookId = "lip_makeup_validation_v1";
        public string ActiveRegions = "none";
        public int LayerCount;
        public int EnabledLayerCount;
        public int PayloadBytes;
        public string RendererMode = "smooth-region-mask";
        public string RegionRendererId = "none";
        public float Coverage;
        public float MaskSpreadX;
        public float MaskOffsetY;
        public string Finish = "validation-placeholder";
        public float TextureAmount;
        public float Roughness;
        public float Specular;
        public float SpecularPower;
        public float GlossBoost;
        public float GradientAmount;
        public float DetailAmount;
        public float Shimmer;
        public string ShimmerColor = "#FFFFFF";
        public bool SkinAdaptive;
        public bool PreserveDetail = true;
        public string MaterialId = "none";
        public string ShaderMode = "unlit-alpha-validation";
        public int PassCount;
        public string MaskTextureId = "none";
        public string MaskSoftSampleMode = "legacy_soft_alpha";
        public float MaskFeatherNearRadiusPx;
        public float MaskFeatherFarRadiusPx;
        public bool CameraBackdropAvailable;
        public bool LightEstimateAvailable;
        public string MaskSource = "smooth_region_mask";
        public string BoundaryRenderer = "smooth_alpha_mask";
        public string VisionBoundaryStatus = "not_requested";
        public string VisionBoundarySource = "none";
        public string VisionBoundaryCoordinateMode = "none";
        public int VisionBoundaryOuterPointCount;
        public int VisionBoundaryInnerPointCount;
        public int VisionBoundaryImageWidth;
        public int VisionBoundaryImageHeight;
        public long VisionBoundaryAgeMs;
        public float VisionBoundaryFaceMotionScore;
        public float VisionBoundaryFaceCenterShiftPx;
        public float VisionBoundaryFaceScaleDelta;
        public string VisionBoundaryFaceMotionRisk = "none";
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
        public long LastUpdatedMs;
    }

    [SerializeField] private ARFaceManager faceManager;
    [SerializeField] private Material overlayMaterial;
    [SerializeField] private E7SynchronizedCaptureExporter referenceCaptureExporter;
    [SerializeField] private FaceTrackingStatusReporter statusReporter;

    private E3RegionMaskOverlay regionMaskOverlay;
    private Material faceMeshOverlayMaterial;
    private readonly Dictionary<Renderer, bool> suppressedFaceRendererStates =
        new Dictionary<Renderer, bool>();
    private readonly Dictionary<ARFaceMeshVisualizer, bool> suppressedFaceVisualizerStates =
        new Dictionary<ARFaceMeshVisualizer, bool>();
    private readonly Dictionary<string, RegionFeatureState> latestRegionFeatureStates =
        new Dictionary<string, RegionFeatureState>();
    private bool faceRenderersSuppressed = true;
    private bool faceMeshOverlayVisible;
    private int lastSuppressedFaceTrackableCount = -1;

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

    private void LateUpdate()
    {
        if (faceMeshOverlayVisible)
        {
            if (ShouldRefreshFaceRendererSuppression())
            {
                ApplyFaceMeshOverlay();
            }

            return;
        }

        if (faceRenderersSuppressed && ShouldRefreshFaceRendererSuppression())
        {
            ApplyFaceRendererSuppression();
        }
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
                    + " rendererId=" + layer.RegionRendererId
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

            Debug.LogError("[E4] recipe_parse_failed raw=" + json + " error=" + exception.Message);
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
            bool hasMaskOverlayField = json.IndexOf("\"maskOverlayVisible\"", StringComparison.Ordinal) >= 0;
            bool hasGuideOverlayField = json.IndexOf("\"guideOverlayVisible\"", StringComparison.Ordinal) >= 0;
            bool hasMeshOverlayField = json.IndexOf("\"meshOverlayVisible\"", StringComparison.Ordinal) >= 0;
            bool hasDiagnosticsHudField = json.IndexOf("\"diagnosticsHudVisible\"", StringComparison.Ordinal) >= 0;
            bool hasMaskDebugViewField = json.IndexOf("\"maskDebugViewMode\"", StringComparison.Ordinal) >= 0;
            bool maskOverlayVisible = payload == null || !hasMaskOverlayField || payload.maskOverlayVisible;
            bool guideOverlayVisible = payload == null || !hasGuideOverlayField || payload.guideOverlayVisible;
            bool meshOverlayVisible = payload != null && hasMeshOverlayField && payload.meshOverlayVisible;
            bool diagnosticsHudVisible = payload == null || !hasDiagnosticsHudField || payload.diagnosticsHudVisible;
            string validationViewMode = payload != null ? NormalizeOptional(payload.validationViewMode) : "unknown";
            string maskDebugViewMode = hasMaskDebugViewField
                ? NormalizeMaskDebugViewMode(payload != null ? payload.maskDebugViewMode : string.Empty)
                : "final";
            bool regionOverlayVisible = visible && maskOverlayVisible;
            bool faceGuideVisible = visible && guideOverlayVisible;
            bool faceMeshVisible = visible && meshOverlayVisible;
            bool unityDebugVisible = visible && diagnosticsHudVisible && validationViewMode == "full";
            string guideOverlayMode = NormalizeOptional(payload != null ? payload.guideOverlayMode : string.Empty);
            string meshRenderMode = NormalizeOptional(payload != null ? payload.meshRenderMode : string.Empty);
            guideOverlayMode = guideOverlayMode == "none" ? "mesh_landmarks" : guideOverlayMode;
            meshRenderMode = meshRenderMode == "none" ? "wireframe" : meshRenderMode;

            EnsureRegionMaskOverlay();
            if (regionMaskOverlay == null)
            {
                throw new InvalidOperationException("E3 region mask overlay is unavailable.");
            }

            regionMaskOverlay.SetOverlayRenderingSuppressed(!regionOverlayVisible);
            regionMaskOverlay.SetMaskDebugViewMode(maskDebugViewMode);
            SetFaceMeshOverlayVisible(faceMeshVisible);

            if (statusReporter != null)
            {
                statusReporter.SetDebugOverlayVisible(unityDebugVisible);
                statusReporter.SetGuideOverlayVisible(faceGuideVisible);
                statusReporter.SetMeshOverlayVisible(faceMeshVisible);
            }

            Debug.Log(
                "[E7] region_overlay_visibility"
                + " visible=" + regionOverlayVisible.ToString().ToLowerInvariant()
                + " maskOverlayVisible=" + maskOverlayVisible.ToString().ToLowerInvariant()
                + " guideOverlayVisible=" + guideOverlayVisible.ToString().ToLowerInvariant()
                + " meshOverlayVisible=" + meshOverlayVisible.ToString().ToLowerInvariant()
                + " diagnosticsHudVisible=" + diagnosticsHudVisible.ToString().ToLowerInvariant()
                + " maskDebugViewMode=" + maskDebugViewMode
                + " guideColor=green"
                + " meshColor=yellow"
                + " meshRenderMode=" + meshRenderMode
                + " guideOverlayMode=" + guideOverlayMode
                + " faceDebugSurfaceSuppressed=" + (!faceMeshVisible).ToString().ToLowerInvariant()
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
        if (suppressed)
        {
            faceMeshOverlayVisible = false;
        }

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

    private void SetFaceMeshOverlayVisible(bool visible)
    {
        RefreshSceneReferences();
        faceMeshOverlayVisible = visible;

        if (visible)
        {
            lastSuppressedFaceTrackableCount = -1;
            ApplyFaceMeshOverlay();
            return;
        }

        SetFaceRenderersSuppressed(true);
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

    private void ApplyFaceMeshOverlay()
    {
        if (faceManager == null)
        {
            return;
        }

        lastSuppressedFaceTrackableCount = CountFaceTrackables();
        Material meshMaterial = GetOrCreateFaceMeshOverlayMaterial();

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

                visualizer.enabled = true;
            }

            Renderer[] renderers = face.GetComponentsInChildren<Renderer>(true);
            foreach (Renderer renderer in renderers)
            {
                if (renderer == null || IsRegionOverlayRenderer(renderer))
                {
                    continue;
                }

                if (!suppressedFaceRendererStates.ContainsKey(renderer))
                {
                    suppressedFaceRendererStates[renderer] = renderer.enabled;
                }

                renderer.enabled = true;
                renderer.sharedMaterial = meshMaterial;
            }
        }
    }

    private Material GetOrCreateFaceMeshOverlayMaterial()
    {
        if (faceMeshOverlayMaterial != null)
        {
            return faceMeshOverlayMaterial;
        }

        Shader shader = Shader.Find("Universal Render Pipeline/Unlit");
        if (shader == null)
        {
            shader = Shader.Find("Unlit/Color");
        }

        if (shader == null)
        {
            shader = Shader.Find("Sprites/Default");
        }

        faceMeshOverlayMaterial = new Material(shader)
        {
            name = "E7 Yellow Face Mesh Overlay"
        };

        ApplyFaceMeshOverlayMaterialColor(faceMeshOverlayMaterial, new Color(1.0f, 0.85f, 0.05f, 0.32f));
        faceMeshOverlayMaterial.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
        faceMeshOverlayMaterial.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
        faceMeshOverlayMaterial.SetInt("_ZWrite", 0);
        faceMeshOverlayMaterial.DisableKeyword("_ALPHATEST_ON");
        faceMeshOverlayMaterial.EnableKeyword("_ALPHABLEND_ON");
        faceMeshOverlayMaterial.DisableKeyword("_ALPHAPREMULTIPLY_ON");
        faceMeshOverlayMaterial.renderQueue = (int)RenderQueue.Transparent;

        return faceMeshOverlayMaterial;
    }

    private static void ApplyFaceMeshOverlayMaterialColor(Material material, Color color)
    {
        material.color = color;
        if (material.HasProperty("_BaseColor"))
        {
            material.SetColor("_BaseColor", color);
        }

        if (material.HasProperty("_Color"))
        {
            material.SetColor("_Color", color);
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

    private E3RegionMaskOverlay.RegionApplyResult ApplyRegionLayer(ParsedRecipeLayer layer)
    {
        EnsureRegionMaskOverlay();

        return regionMaskOverlay.ApplyRegionRecipe(
            layer.Region,
            layer.ColorHex,
            layer.Color,
            layer.Opacity,
            layer.Enabled,
            layer.TextureSample,
            layer.TextureMode,
            layer.Intensity,
            layer.Feather,
            layer.BlendMode,
            layer.RendererMode,
            layer.MaskTextureId,
            layer.SecondaryColorHex,
            layer.SecondaryColor,
            layer.Coverage,
            layer.MaskSpreadX,
            layer.MaskOffsetY,
            layer.Finish,
            layer.Roughness,
            layer.Specular,
            layer.SpecularPower,
            layer.GlossBoost,
            layer.GradientAmount,
            layer.DetailAmount,
            layer.PreserveDetail);
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
            LipRenderLayerMode = result.LipRenderLayerMode,
            GlossHighlightMode = result.GlossHighlightMode,
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
            RegionRendererId = result.RegionRendererId,
            Coverage = layer.Coverage,
            MaskSpreadX = result.MaskSpreadX,
            MaskOffsetY = result.MaskOffsetY,
            Finish = layer.Finish,
            TextureAmount = layer.TextureAmount,
            Roughness = layer.Roughness,
            Specular = layer.Specular,
            SpecularPower = layer.SpecularPower,
            GlossBoost = layer.GlossBoost,
            GradientAmount = layer.GradientAmount,
            DetailAmount = layer.DetailAmount,
            Shimmer = layer.Shimmer,
            ShimmerColor = layer.ShimmerColor,
            SkinAdaptive = layer.SkinAdaptive,
            PreserveDetail = layer.PreserveDetail,
            MaterialId = layer.MaterialId,
            ShaderMode = layer.ShaderMode,
            PassCount = layer.PassCount,
            MaskTextureId = layer.MaskTextureId,
            MaskSoftSampleMode = result.MaskSoftSampleMode,
            MaskFeatherNearRadiusPx = result.MaskFeatherNearRadiusPx,
            MaskFeatherFarRadiusPx = result.MaskFeatherFarRadiusPx,
            CameraBackdropAvailable = layer.CameraBackdropAvailable,
            LightEstimateAvailable = layer.LightEstimateAvailable,
            MaskSource = result.MaskSource,
            BoundaryRenderer = result.BoundaryRenderer,
            VisionBoundaryStatus = result.VisionBoundaryStatus,
            VisionBoundarySource = result.VisionBoundarySource,
            VisionBoundaryCoordinateMode = result.VisionBoundaryCoordinateMode,
            VisionBoundaryOuterPointCount = result.VisionBoundaryOuterPointCount,
            VisionBoundaryInnerPointCount = result.VisionBoundaryInnerPointCount,
            VisionBoundaryImageWidth = result.VisionBoundaryImageWidth,
            VisionBoundaryImageHeight = result.VisionBoundaryImageHeight,
            VisionBoundaryAgeMs = result.VisionBoundaryAgeMs,
            VisionBoundaryFaceMotionScore = result.VisionBoundaryFaceMotionScore,
            VisionBoundaryFaceCenterShiftPx = result.VisionBoundaryFaceCenterShiftPx,
            VisionBoundaryFaceScaleDelta = result.VisionBoundaryFaceScaleDelta,
            VisionBoundaryFaceMotionRisk = result.VisionBoundaryFaceMotionRisk,
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
            state.LipRenderLayerMode = result.LipRenderLayerMode;
            state.GlossHighlightMode = result.GlossHighlightMode;
            state.BlendMode = result.BlendMode;
            state.Intensity = result.Intensity;
            state.Feather = result.Feather;
            state.RendererMode = result.RendererMode;
            state.RegionRendererId = result.RegionRendererId;
            state.MaskSource = result.MaskSource;
            state.BoundaryRenderer = result.BoundaryRenderer;
            state.VisionBoundaryStatus = result.VisionBoundaryStatus;
            state.VisionBoundarySource = result.VisionBoundarySource;
            state.VisionBoundaryCoordinateMode = result.VisionBoundaryCoordinateMode;
            state.VisionBoundaryOuterPointCount = result.VisionBoundaryOuterPointCount;
            state.VisionBoundaryInnerPointCount = result.VisionBoundaryInnerPointCount;
            state.VisionBoundaryImageWidth = result.VisionBoundaryImageWidth;
            state.VisionBoundaryImageHeight = result.VisionBoundaryImageHeight;
            state.VisionBoundaryAgeMs = result.VisionBoundaryAgeMs;
            state.VisionBoundaryFaceMotionScore = result.VisionBoundaryFaceMotionScore;
            state.VisionBoundaryFaceCenterShiftPx = result.VisionBoundaryFaceCenterShiftPx;
            state.VisionBoundaryFaceScaleDelta = result.VisionBoundaryFaceScaleDelta;
            state.VisionBoundaryFaceMotionRisk = result.VisionBoundaryFaceMotionRisk;
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
                + ",\"lipRenderLayerMode\":\"" + EscapeJsonString(state.LipRenderLayerMode) + "\""
                + ",\"glossHighlightMode\":\"" + EscapeJsonString(state.GlossHighlightMode) + "\""
                + ",\"blendMode\":\"" + EscapeJsonString(state.BlendMode) + "\""
                + ",\"secondaryColor\":\"" + EscapeJsonString(state.SecondaryColorHex) + "\""
                + ",\"coverage\":" + state.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"finish\":\"" + EscapeJsonString(state.Finish) + "\""
                + ",\"roughness\":" + state.Roughness.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"specular\":" + state.Specular.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"specularPower\":" + state.SpecularPower.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"glossBoost\":" + state.GlossBoost.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"gradientAmount\":" + state.GradientAmount.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"rendererMode\":\"" + EscapeJsonString(state.RendererMode) + "\""
                + ",\"rendererId\":\"" + EscapeJsonString(state.RegionRendererId) + "\""
                + ",\"maskTextureId\":\"" + EscapeJsonString(state.MaskTextureId) + "\""
                + ",\"maskSoftSampleMode\":\"" + EscapeJsonString(state.MaskSoftSampleMode) + "\""
                + ",\"maskFeatherNearRadiusPx\":" + state.MaskFeatherNearRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"maskFeatherFarRadiusPx\":" + state.MaskFeatherFarRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"maskSource\":\"" + EscapeJsonString(state.MaskSource) + "\""
                + ",\"boundaryRenderer\":\"" + EscapeJsonString(state.BoundaryRenderer) + "\""
                + ",\"visionBoundaryStatus\":\"" + EscapeJsonString(state.VisionBoundaryStatus) + "\""
                + ",\"visionBoundarySource\":\"" + EscapeJsonString(state.VisionBoundarySource) + "\""
                + ",\"visionBoundaryCoordinateMode\":\"" + EscapeJsonString(state.VisionBoundaryCoordinateMode) + "\""
                + ",\"visionBoundaryOuterPointCount\":" + state.VisionBoundaryOuterPointCount.ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryInnerPointCount\":" + state.VisionBoundaryInnerPointCount.ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryImageWidth\":" + state.VisionBoundaryImageWidth.ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryImageHeight\":" + state.VisionBoundaryImageHeight.ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryAgeMs\":" + state.VisionBoundaryAgeMs.ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceMotionScore\":" + state.VisionBoundaryFaceMotionScore.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceCenterShiftPx\":" + state.VisionBoundaryFaceCenterShiftPx.ToString("0.#", CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceScaleDelta\":" + state.VisionBoundaryFaceScaleDelta.ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceMotionRisk\":\"" + EscapeJsonString(state.VisionBoundaryFaceMotionRisk) + "\""
                + ",\"trackingState\":\"" + EscapeJsonString(state.TrackingState) + "\""
                + ",\"stateAction\":\"" + EscapeJsonString(state.StateAction) + "\""
                + ",\"intensity\":" + state.Intensity.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"feather\":" + state.Feather.ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"applied\":" + state.Applied.ToString().ToLowerInvariant()
                + ",\"faceCount\":" + state.FaceCount.ToString(CultureInfo.InvariantCulture)
                + ",\"meshTriangles\":" + state.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
                + ",\"appliedTriangles\":" + state.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
                + ",\"uvAvailable\":" + state.UvAvailable.ToString().ToLowerInvariant()
                + ",\"meshVertexCount\":" + state.MeshVertexCount.ToString(CultureInfo.InvariantCulture)
                + ",\"meshIndexCount\":" + state.MeshIndexCount.ToString(CultureInfo.InvariantCulture)
                + ",\"meshUvCount\":" + state.MeshUvCount.ToString(CultureInfo.InvariantCulture)
                + ",\"topologyAuditStatus\":\"" + EscapeJsonString(state.TopologyAuditStatus) + "\""
                + ",\"topologyAuditSummary\":\"" + EscapeJsonString(state.TopologyAuditSummary) + "\""
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
            string lipRenderLayerMode = state != null && !string.IsNullOrWhiteSpace(state.LipRenderLayerMode)
                ? state.LipRenderLayerMode
                : "none";
            string glossHighlightMode = state != null && !string.IsNullOrWhiteSpace(state.GlossHighlightMode)
                ? state.GlossHighlightMode
                : "none";
            string maskSoftSampleMode = state != null && !string.IsNullOrWhiteSpace(state.MaskSoftSampleMode)
                ? state.MaskSoftSampleMode
                : "legacy_soft_alpha";
            string rendererMode = state != null && !string.IsNullOrWhiteSpace(state.RendererMode)
                ? state.RendererMode
                : "smooth-region-mask";
            string maskSource = state != null && !string.IsNullOrWhiteSpace(state.MaskSource)
                ? state.MaskSource
                : "smooth_region_mask";
            string boundaryRenderer = state != null && !string.IsNullOrWhiteSpace(state.BoundaryRenderer)
                ? state.BoundaryRenderer
                : "smooth_alpha_mask";
            string visionBoundaryStatus = state != null && !string.IsNullOrWhiteSpace(state.VisionBoundaryStatus)
                ? state.VisionBoundaryStatus
                : "not_requested";
            string visionBoundarySource = state != null && !string.IsNullOrWhiteSpace(state.VisionBoundarySource)
                ? state.VisionBoundarySource
                : "none";
            string visionBoundaryCoordinateMode = state != null && !string.IsNullOrWhiteSpace(state.VisionBoundaryCoordinateMode)
                ? state.VisionBoundaryCoordinateMode
                : "none";
            string qaStatus = "smooth_mask_runtime";

            regions.Add("\"" + EscapeJsonString(region) + "\":{"
                + "\"available\":true"
                + ",\"active\":" + active.ToString().ToLowerInvariant()
                + ",\"lastApplied\":" + (state != null && state.Applied).ToString().ToLowerInvariant()
                + ",\"rendererMode\":\"" + EscapeJsonString(rendererMode) + "\""
                + ",\"maskSource\":\"" + EscapeJsonString(maskSource) + "\""
                + ",\"boundaryRenderer\":\"" + EscapeJsonString(boundaryRenderer) + "\""
                + ",\"visionBoundaryStatus\":\"" + EscapeJsonString(visionBoundaryStatus) + "\""
                + ",\"visionBoundarySource\":\"" + EscapeJsonString(visionBoundarySource) + "\""
                + ",\"visionBoundaryCoordinateMode\":\"" + EscapeJsonString(visionBoundaryCoordinateMode) + "\""
                + ",\"visionBoundaryOuterPointCount\":" + (state != null ? state.VisionBoundaryOuterPointCount : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryInnerPointCount\":" + (state != null ? state.VisionBoundaryInnerPointCount : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryImageWidth\":" + (state != null ? state.VisionBoundaryImageWidth : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryImageHeight\":" + (state != null ? state.VisionBoundaryImageHeight : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryAgeMs\":" + (state != null ? state.VisionBoundaryAgeMs : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceMotionScore\":" + (state != null ? state.VisionBoundaryFaceMotionScore : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceCenterShiftPx\":" + (state != null ? state.VisionBoundaryFaceCenterShiftPx : 0.0f).ToString("0.#", CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceScaleDelta\":" + (state != null ? state.VisionBoundaryFaceScaleDelta : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"visionBoundaryFaceMotionRisk\":\"" + EscapeJsonString(state != null ? state.VisionBoundaryFaceMotionRisk : "none") + "\""
                + ",\"qaStatus\":\"" + EscapeJsonString(qaStatus) + "\""
                + ",\"validationScope\":\"debug\""
                + ",\"texture\":\"" + EscapeJsonString(textureSample) + "\""
                + ",\"sample\":\"" + EscapeJsonString(textureSample) + "\""
                + ",\"textureMode\":\"" + EscapeJsonString(textureMode) + "\""
                + ",\"lipRenderLayerMode\":\"" + EscapeJsonString(lipRenderLayerMode) + "\""
                + ",\"glossHighlightMode\":\"" + EscapeJsonString(glossHighlightMode) + "\""
                + ",\"maskSoftSampleMode\":\"" + EscapeJsonString(maskSoftSampleMode) + "\""
                + ",\"maskFeatherNearRadiusPx\":" + (state != null ? state.MaskFeatherNearRadiusPx : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"maskFeatherFarRadiusPx\":" + (state != null ? state.MaskFeatherFarRadiusPx : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
                + ",\"coverage\":" + (state != null ? state.Coverage : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"finish\":\"" + EscapeJsonString(state != null ? state.Finish : "none") + "\""
                + ",\"gradientAmount\":" + (state != null ? state.GradientAmount : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
                + ",\"meshTriangles\":" + (state != null ? state.MeshTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"appliedTriangles\":" + (state != null ? state.MaskTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
                + ",\"uvAvailable\":" + (state != null && state.UvAvailable).ToString().ToLowerInvariant()
                + ",\"topologyAuditStatus\":\"" + EscapeJsonString(state != null ? state.TopologyAuditStatus : "not_run") + "\""
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
            + " lipRenderLayerMode=" + (state != null ? state.LipRenderLayerMode : "none")
            + " glossHighlightMode=" + (state != null ? state.GlossHighlightMode : "none")
            + " materialId=" + (state != null ? state.MaterialId : "none")
            + " shaderMode=" + (state != null ? state.ShaderMode : "unlit-alpha-validation")
            + " passCount=" + (state != null ? state.PassCount : 0).ToString(CultureInfo.InvariantCulture)
            + " maskTextureId=" + (state != null ? state.MaskTextureId : "none")
            + " maskSoftSampleMode=" + (state != null ? state.MaskSoftSampleMode : "legacy_soft_alpha")
            + " maskFeatherNearRadiusPx=" + (state != null ? state.MaskFeatherNearRadiusPx : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " maskFeatherFarRadiusPx=" + (state != null ? state.MaskFeatherFarRadiusPx : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " cameraBackdropAvailable=" + (state != null && state.CameraBackdropAvailable).ToString().ToLowerInvariant()
            + " lightEstimateAvailable=" + (state != null && state.LightEstimateAvailable).ToString().ToLowerInvariant()
            + " color=" + colorHex
            + " secondaryColor=" + (state != null ? state.SecondaryColorHex : "none")
            + " opacity=" + opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + " coverage=" + (state != null ? state.Coverage : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + " finish=" + (state != null ? state.Finish : "none")
            + " roughness=" + (state != null ? state.Roughness : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + " specular=" + (state != null ? state.Specular : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + " specularPower=" + (state != null ? state.SpecularPower : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + " glossBoost=" + (state != null ? state.GlossBoost : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + " gradientAmount=" + (state != null ? state.GradientAmount : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + " maskSource=" + (state != null ? state.MaskSource : "smooth_region_mask")
            + " boundaryRenderer=" + (state != null ? state.BoundaryRenderer : "smooth_alpha_mask")
            + " visionBoundaryStatus=" + (state != null ? state.VisionBoundaryStatus : "not_requested")
            + " visionBoundarySource=" + (state != null ? state.VisionBoundarySource : "none")
            + " visionBoundaryCoordinateMode=" + (state != null ? state.VisionBoundaryCoordinateMode : "none")
            + " visionBoundaryOuterPoints=" + (state != null ? state.VisionBoundaryOuterPointCount : 0).ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryInnerPoints=" + (state != null ? state.VisionBoundaryInnerPointCount : 0).ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryImageSize=" + (state != null ? state.VisionBoundaryImageWidth : 0).ToString(CultureInfo.InvariantCulture)
            + "x" + (state != null ? state.VisionBoundaryImageHeight : 0).ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryAgeMs=" + (state != null ? state.VisionBoundaryAgeMs : 0).ToString(CultureInfo.InvariantCulture)
            + " visionBoundaryFaceMotionScore=" + (state != null ? state.VisionBoundaryFaceMotionScore : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " visionBoundaryFaceCenterShiftPx=" + (state != null ? state.VisionBoundaryFaceCenterShiftPx : 0.0f).ToString("0.#", CultureInfo.InvariantCulture)
            + " visionBoundaryFaceScaleDelta=" + (state != null ? state.VisionBoundaryFaceScaleDelta : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + " visionBoundaryFaceMotionRisk=" + (state != null ? state.VisionBoundaryFaceMotionRisk : "none")
            + " maskStatus=smooth_mask_runtime"
            + " regionTrackingState=" + (state != null ? state.TrackingState : "None")
            + " regionStateAction=" + (state != null ? state.StateAction : "not_started")
            + " regionUvAvailable=" + (state != null && state.UvAvailable).ToString().ToLowerInvariant()
            + " regionMaskTriangles=" + (state != null ? state.MaskTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + " regionAppliedTriangles=" + (state != null ? state.MeshTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + " topologyAuditStatus=" + (state != null ? state.TopologyAuditStatus : "not_run")
            + " topologyAuditSummary=" + SanitizeLogValue(state != null ? state.TopologyAuditSummary : "none");
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
            + ",\"lipRenderLayerMode\":\"" + EscapeJsonString(state != null ? state.LipRenderLayerMode : "none") + "\""
            + ",\"glossHighlightMode\":\"" + EscapeJsonString(state != null ? state.GlossHighlightMode : "none") + "\""
            + ",\"materialId\":\"" + EscapeJsonString(state != null ? state.MaterialId : "none") + "\""
            + ",\"shaderMode\":\"" + EscapeJsonString(state != null ? state.ShaderMode : "unlit-alpha-validation") + "\""
            + ",\"passCount\":" + (state != null ? state.PassCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"maskTextureId\":\"" + EscapeJsonString(state != null ? state.MaskTextureId : "none") + "\""
            + ",\"maskSoftSampleMode\":\"" + EscapeJsonString(state != null ? state.MaskSoftSampleMode : "legacy_soft_alpha") + "\""
            + ",\"maskFeatherNearRadiusPx\":" + (state != null ? state.MaskFeatherNearRadiusPx : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskFeatherFarRadiusPx\":" + (state != null ? state.MaskFeatherFarRadiusPx : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"cameraBackdropAvailable\":" + (state != null && state.CameraBackdropAvailable).ToString().ToLowerInvariant()
            + ",\"lightEstimateAvailable\":" + (state != null && state.LightEstimateAvailable).ToString().ToLowerInvariant()
            + ",\"color\":\"" + EscapeJsonString(colorHex) + "\""
            + ",\"secondaryColor\":\"" + EscapeJsonString(state != null ? state.SecondaryColorHex : "none") + "\""
            + ",\"opacity\":" + opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"coverage\":" + (state != null ? state.Coverage : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"finish\":\"" + EscapeJsonString(state != null ? state.Finish : "none") + "\""
            + ",\"roughness\":" + (state != null ? state.Roughness : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"specular\":" + (state != null ? state.Specular : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"specularPower\":" + (state != null ? state.SpecularPower : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"glossBoost\":" + (state != null ? state.GlossBoost : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"gradientAmount\":" + (state != null ? state.GradientAmount : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"detailAmount\":" + (state != null ? state.DetailAmount : 0.0f).ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"maskSource\":\"" + EscapeJsonString(state != null ? state.MaskSource : "smooth_region_mask") + "\""
            + ",\"boundaryRenderer\":\"" + EscapeJsonString(state != null ? state.BoundaryRenderer : "smooth_alpha_mask") + "\""
            + ",\"visionBoundaryStatus\":\"" + EscapeJsonString(state != null ? state.VisionBoundaryStatus : "not_requested") + "\""
            + ",\"visionBoundarySource\":\"" + EscapeJsonString(state != null ? state.VisionBoundarySource : "none") + "\""
            + ",\"visionBoundaryCoordinateMode\":\"" + EscapeJsonString(state != null ? state.VisionBoundaryCoordinateMode : "none") + "\""
            + ",\"visionBoundaryOuterPointCount\":" + (state != null ? state.VisionBoundaryOuterPointCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryInnerPointCount\":" + (state != null ? state.VisionBoundaryInnerPointCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryImageWidth\":" + (state != null ? state.VisionBoundaryImageWidth : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryImageHeight\":" + (state != null ? state.VisionBoundaryImageHeight : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryAgeMs\":" + (state != null ? state.VisionBoundaryAgeMs : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceMotionScore\":" + (state != null ? state.VisionBoundaryFaceMotionScore : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceCenterShiftPx\":" + (state != null ? state.VisionBoundaryFaceCenterShiftPx : 0.0f).ToString("0.#", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceScaleDelta\":" + (state != null ? state.VisionBoundaryFaceScaleDelta : 0.0f).ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceMotionRisk\":\"" + EscapeJsonString(state != null ? state.VisionBoundaryFaceMotionRisk : "none") + "\""
            + ",\"maskStatus\":\"smooth_mask_runtime\""
            + ",\"regionTrackingState\":\"" + EscapeJsonString(state != null ? state.TrackingState : "None") + "\""
            + ",\"regionStateAction\":\"" + EscapeJsonString(state != null ? state.StateAction : "not_started") + "\""
            + ",\"regionUvAvailable\":" + (state != null && state.UvAvailable).ToString().ToLowerInvariant()
            + ",\"regionMaskTriangles\":" + (state != null ? state.MaskTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"regionAppliedTriangles\":" + (state != null ? state.MeshTriangleCount : 0).ToString(CultureInfo.InvariantCulture)
            + ",\"topologyAuditStatus\":\"" + EscapeJsonString(state != null ? state.TopologyAuditStatus : "not_run") + "\""
            + ",\"topologyAuditSummary\":\"" + EscapeJsonString(state != null ? state.TopologyAuditSummary : "none") + "\"";
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
        string phase = GetPhaseForRenderer(layer.Region, layer.RendererMode);
        string runId = GetRunIdForRenderer(layer.Region, layer.RendererMode);
        string visualLatencyObservation = "pending_lip_makeup_visual_review";
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
            + " lipRenderLayerMode=" + result.LipRenderLayerMode
            + " glossHighlightMode=" + result.GlossHighlightMode
            + " intensity=" + layer.Intensity.ToString("0.##", CultureInfo.InvariantCulture)
            + " feather=" + layer.Feather.ToString("0.##", CultureInfo.InvariantCulture)
            + " blendMode=" + layer.BlendMode
            + " color=" + layer.ColorHex
            + " secondaryColor=" + layer.SecondaryColorHex
            + " opacity=" + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
            + " applied=" + applied
            + " appliedRegion=" + result.Region
            + " rendererMode=" + result.RendererMode
            + " rendererId=" + result.RegionRendererId
            + " materialId=" + layer.MaterialId
            + " shaderMode=" + layer.ShaderMode
            + " passCount=" + layer.PassCount.ToString(CultureInfo.InvariantCulture)
            + " maskTextureId=" + layer.MaskTextureId
            + " coverage=" + layer.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
            + " maskSpreadX=" + result.MaskSpreadX.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskOffsetY=" + result.MaskOffsetY.ToString("0.###", CultureInfo.InvariantCulture)
            + " finish=" + layer.Finish
            + " textureAmount=" + layer.TextureAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " roughness=" + layer.Roughness.ToString("0.##", CultureInfo.InvariantCulture)
            + " specular=" + layer.Specular.ToString("0.##", CultureInfo.InvariantCulture)
            + " specularPower=" + layer.SpecularPower.ToString("0.##", CultureInfo.InvariantCulture)
            + " glossBoost=" + layer.GlossBoost.ToString("0.##", CultureInfo.InvariantCulture)
            + " gradientAmount=" + layer.GradientAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " detailAmount=" + layer.DetailAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " shimmer=" + layer.Shimmer.ToString("0.##", CultureInfo.InvariantCulture)
            + " shimmerColor=" + layer.ShimmerColor
            + " skinAdaptive=" + layer.SkinAdaptive.ToString().ToLowerInvariant()
            + " preserveDetail=" + layer.PreserveDetail.ToString().ToLowerInvariant()
            + " cameraBackdropAvailable=" + layer.CameraBackdropAvailable.ToString().ToLowerInvariant()
            + " lightEstimateAvailable=" + layer.LightEstimateAvailable.ToString().ToLowerInvariant()
            + " maskSource=" + result.MaskSource
            + " boundaryRenderer=" + result.BoundaryRenderer
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
            + " maskSoftSampleMode=" + result.MaskSoftSampleMode
            + " maskFeatherNearRadiusPx=" + result.MaskFeatherNearRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskFeatherFarRadiusPx=" + result.MaskFeatherFarRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskTextureDiagnosticStatus=" + result.MaskTextureDiagnosticStatus
            + " maskTextureSize=" + result.MaskTextureWidth.ToString(CultureInfo.InvariantCulture)
            + "x" + result.MaskTextureHeight.ToString(CultureInfo.InvariantCulture)
            + " maskTextureGt8Pixels=" + result.MaskTextureActivePixelCountGt8.ToString(CultureInfo.InvariantCulture)
            + " maskTextureGt8Coverage=" + result.MaskTextureActiveCoverageGt8.ToString("0.######", CultureInfo.InvariantCulture)
            + " maskTextureGt8Bbox=" + result.MaskTextureActiveBbox
            + " maskTextureThresholdPixels=" + result.MaskTextureThresholdPixelCount.ToString(CultureInfo.InvariantCulture)
            + " maskTextureThresholdCoverage=" + result.MaskTextureThresholdCoverage.ToString("0.######", CultureInfo.InvariantCulture)
            + " trackingState=" + result.TrackingState
            + " stateAction=" + result.StateAction
            + " faceCount=" + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + " sourceTriangles=" + result.SourceTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " meshTriangles=" + result.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " maskTriangles=" + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " culledTriangles=" + result.CulledTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " meshCullingMode=" + result.MeshCullingMode
            + " uvAvailable=" + result.UvAvailable.ToString().ToLowerInvariant()
            + " topologyAuditStatus=" + result.TopologyAuditStatus
            + " topologyAuditSummary=" + SanitizeLogValue(result.TopologyAuditSummary));

        Debug.Log(
            "[E7] recipe_latency"
            + " source=unity_applied"
            + " runId=" + runId
            + " phase=" + phase
            + " timestampMs=" + appliedAtMs.ToString(CultureInfo.InvariantCulture)
            + " rendererMode=" + result.RendererMode
            + " rendererId=" + result.RegionRendererId
            + " lookId=" + layer.LookId
            + " recipeId=" + layer.RecipeId
            + " recipeBatchId=" + layer.RecipeBatchId
            + " activeRegions=" + layer.ActiveRegions
            + " layerCount=" + layer.LayerCount.ToString(CultureInfo.InvariantCulture)
            + " enabledLayerCount=" + layer.EnabledLayerCount.ToString(CultureInfo.InvariantCulture)
            + " payloadBytes=" + layer.PayloadBytes.ToString(CultureInfo.InvariantCulture)
            + " region=" + layer.Region
            + " texture=" + layer.TextureSample
            + " sentAtMs=" + layer.SentAtMs.ToString("0", CultureInfo.InvariantCulture)
            + " appliedAtMs=" + appliedAtMs.ToString(CultureInfo.InvariantCulture)
            + " appliedFrame=" + appliedFrame.ToString(CultureInfo.InvariantCulture)
            + " receivedAtMs=0"
            + " sendToAckLatencyMs=0"
            + " visualLatencyConfirmedByRecording=false"
            + " visualLatencyObservation=" + visualLatencyObservation
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
            + "\",\"lipRenderLayerMode\":\""
            + EscapeJsonString(result.LipRenderLayerMode)
            + "\",\"glossHighlightMode\":\""
            + EscapeJsonString(result.GlossHighlightMode)
            + "\",\"blendMode\":\""
            + EscapeJsonString(layer.BlendMode)
            + "\",\"applied\":"
            + result.Applied.ToString().ToLowerInvariant()
            + ",\"rendererMode\":\""
            + EscapeJsonString(result.RendererMode)
            + "\",\"rendererId\":\""
            + EscapeJsonString(result.RegionRendererId)
            + "\",\"runId\":\""
            + EscapeJsonString(GetRunIdForRenderer(layer.Region, layer.RendererMode))
            + "\",\"phase\":\""
            + EscapeJsonString(GetPhaseForRenderer(layer.Region, layer.RendererMode))
            + "\",\"maskSource\":\""
            + EscapeJsonString(result.MaskSource)
            + "\",\"boundaryRenderer\":\""
            + EscapeJsonString(result.BoundaryRenderer)
            + "\",\"visionBoundaryStatus\":\""
            + EscapeJsonString(result.VisionBoundaryStatus)
            + "\",\"visionBoundarySource\":\""
            + EscapeJsonString(result.VisionBoundarySource)
            + "\",\"visionBoundaryCoordinateMode\":\""
            + EscapeJsonString(result.VisionBoundaryCoordinateMode)
            + "\",\"visionBoundaryOuterPointCount\":"
            + result.VisionBoundaryOuterPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryInnerPointCount\":"
            + result.VisionBoundaryInnerPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryImageWidth\":"
            + result.VisionBoundaryImageWidth.ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryImageHeight\":"
            + result.VisionBoundaryImageHeight.ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryAgeMs\":"
            + result.VisionBoundaryAgeMs.ToString(CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceMotionScore\":"
            + result.VisionBoundaryFaceMotionScore.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceCenterShiftPx\":"
            + result.VisionBoundaryFaceCenterShiftPx.ToString("0.#", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceScaleDelta\":"
            + result.VisionBoundaryFaceScaleDelta.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceMotionRisk\":\""
            + EscapeJsonString(result.VisionBoundaryFaceMotionRisk)
            + "\""
            + ",\"maskSoftSampleMode\":\""
            + EscapeJsonString(result.MaskSoftSampleMode)
            + "\",\"maskFeatherNearRadiusPx\":"
            + result.MaskFeatherNearRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskFeatherFarRadiusPx\":"
            + result.MaskFeatherFarRadiusPx.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskTextureDiagnosticStatus\":\""
            + EscapeJsonString(result.MaskTextureDiagnosticStatus)
            + "\",\"maskTextureWidth\":"
            + result.MaskTextureWidth.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTextureHeight\":"
            + result.MaskTextureHeight.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTextureActivePixelCountGt8\":"
            + result.MaskTextureActivePixelCountGt8.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTextureActiveCoverageGt8\":"
            + result.MaskTextureActiveCoverageGt8.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"maskTextureActiveBbox\":\""
            + EscapeJsonString(result.MaskTextureActiveBbox)
            + "\",\"maskTextureThresholdPixelCount\":"
            + result.MaskTextureThresholdPixelCount.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTextureThresholdCoverage\":"
            + result.MaskTextureThresholdCoverage.ToString("0.######", CultureInfo.InvariantCulture)
            + ",\"trackingState\":\""
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
            + EscapeJsonString("pending_lip_makeup_visual_review")
            + "\""
            + ",\"faceCount\":"
            + result.FaceCount.ToString(CultureInfo.InvariantCulture)
            + ",\"sourceTriangles\":"
            + result.SourceTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshTriangles\":"
            + result.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"maskTriangles\":"
            + result.MaskTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"culledTriangles\":"
            + result.CulledTriangleCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshCullingMode\":\""
            + EscapeJsonString(result.MeshCullingMode)
            + "\""
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
            + ",\"color\":\""
            + EscapeJsonString(layer.ColorHex)
            + "\",\"secondaryColor\":\""
            + EscapeJsonString(layer.SecondaryColorHex)
            + "\",\"opacity\":"
            + layer.Opacity.ToString("0.##", CultureInfo.InvariantCulture)
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
            + ",\"maskTextureId\":\""
            + EscapeJsonString(layer.MaskTextureId)
            + "\",\"coverage\":"
            + layer.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"maskSpreadX\":"
            + result.MaskSpreadX.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"maskOffsetY\":"
            + result.MaskOffsetY.ToString("0.###", CultureInfo.InvariantCulture)
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
            + ",\"gradientAmount\":"
            + layer.GradientAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + ",\"detailAmount\":"
            + layer.DetailAmount.ToString("0.##", CultureInfo.InvariantCulture)
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

        if (recipe.layers == null || recipe.layers.Length != FeatureSnapshotRegions.Length)
        {
            int actualLayerCount = recipe.layers != null ? recipe.layers.Length : 0;
            throw new ArgumentException(
                "Recipe batch must include exactly "
                + FeatureSnapshotRegions.Length.ToString(CultureInfo.InvariantCulture)
                + " layers; received "
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
        string secondaryColorHex = NormalizeSecondaryColor(
            layer.secondaryColor,
            recipe.secondaryColor,
            colorHex);
        float opacity = Mathf.Clamp01(layer.opacity);
        string textureSample = NormalizeTextureSample(region, layer.texture, layer.sample);

        if (!ColorUtility.TryParseHtmlString(colorHex, out Color parsedColor))
        {
            throw new ArgumentException("Recipe color is not a valid HTML color: " + colorHex);
        }

        if (!ColorUtility.TryParseHtmlString(secondaryColorHex, out Color parsedSecondaryColor))
        {
            throw new ArgumentException("Recipe secondary color is not a valid HTML color: " + secondaryColorHex);
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
            RegionRendererId = MakeupRegionRendererRoutes.Resolve(region).RendererId,
            Intensity = NormalizeIntensity(layer.intensity),
            Feather = NormalizeFeather(layer.feather),
            BlendMode = NormalizeBlendMode(layer.blendMode, textureSample),
            RendererMode = NormalizeRendererMode(layer.rendererMode, recipe.rendererMode, region),
            Enabled = layer.enabled,
            Coverage = Mathf.Max(0.0f, layer.coverage),
            MaskSpreadX = NormalizeMaskSpread(layer.maskSpreadX),
            MaskOffsetY = NormalizeMaskOffset(layer.maskOffsetY),
            Finish = NormalizeOptional(layer.finish, recipe.finish, "validation-placeholder"),
            TextureAmount = NormalizeTextureAmount(layer.textureAmount, recipe.textureAmount, NormalizeIntensity(layer.intensity)),
            Roughness = Mathf.Max(0.0f, layer.roughness),
            Specular = Mathf.Max(0.0f, layer.specular),
            SpecularPower = Mathf.Max(0.0f, layer.specularPower),
            GlossBoost = Mathf.Max(0.0f, layer.glossBoost),
            GradientAmount = Mathf.Max(0.0f, layer.gradientAmount),
            DetailAmount = Mathf.Clamp01(layer.detailAmount > 0.0f
                ? layer.detailAmount
                : recipe.detailAmount),
            Shimmer = Mathf.Max(0.0f, layer.shimmer),
            ShimmerColor = NormalizeOptional(layer.shimmerColor, recipe.shimmerColor, "#FFFFFF"),
            SkinAdaptive = layer.skinAdaptive || recipe.skinAdaptive,
            PreserveDetail = layer.preserveDetail,
            MaterialId = NormalizeOptional(layer.materialId, recipe.materialId, textureSample + "-validation-material"),
            ShaderMode = NormalizeOptional(layer.shaderMode, recipe.shaderMode, "unlit-alpha-validation"),
            PassCount = layer.passCount > 0 ? layer.passCount : (recipe.passCount > 0 ? recipe.passCount : 1),
            MaskTextureId = NormalizeMaskTextureId(layer.maskTextureId, recipe.maskTextureId, region),
            CameraBackdropAvailable = layer.cameraBackdropAvailable || recipe.cameraBackdropAvailable,
            LightEstimateAvailable = layer.lightEstimateAvailable || recipe.lightEstimateAvailable
        };
    }

    private static string NormalizeRegion(string region, string legacyLayer)
    {
        string value = !string.IsNullOrWhiteSpace(region) ? region : legacyLayer;
        value = string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim().ToLowerInvariant();

        return MakeupRegionRendererRoutes.NormalizeRegion(value);
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
        if (!string.IsNullOrWhiteSpace(preferred))
        {
            return preferred.Trim();
        }

        if (!string.IsNullOrWhiteSpace(secondary))
        {
            return secondary.Trim();
        }

        return fallback;
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

        return "lip-style-v1-" + region + "-" + index.ToString(CultureInfo.InvariantCulture);
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

        return "lip_makeup_validation_v1";
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

        if ((region == "lip"
                && (value == "matte_lip"
                    || value == "gloss_lip"
                    || value == "full_lip"
                    || value == "gradient_lip"
                    || value == "overline_lip"))
            || (region == "cheek" && value == "soft_blush")
            || (region == "eye" && value == "shimmer_eye")
            || (region == "brow" && (value == "natural_brow" || value == "soft_brow")))
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

    private static float NormalizeMaskOffset(float maskOffset)
    {
        return Mathf.Clamp(maskOffset, -0.08f, 0.08f);
    }

    private static float NormalizeMaskSpread(float maskSpread)
    {
        return Mathf.Clamp(maskSpread, -0.34f, 0.34f);
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

    private static string NormalizeRendererMode(string preferred, string secondary, string region)
    {
        return MakeupRegionRendererRoutes.NormalizeRendererMode(preferred, secondary, region);
    }

    private static string GetPhaseForRenderer(string region, string rendererMode)
    {
        MakeupRegionRendererRoute route = MakeupRegionRendererRoutes.Resolve(region);
        MakeupRegionRendererRoutes.NormalizeRendererMode(rendererMode, rendererMode, route.Region);
        return route.Phase;
    }

    private static string GetRunIdForRenderer(string region, string rendererMode)
    {
        string date = DateTimeOffset.Now.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        MakeupRegionRendererRoute route = MakeupRegionRendererRoutes.Resolve(region);
        MakeupRegionRendererRoutes.NormalizeRendererMode(rendererMode, rendererMode, route.Region);
        return route.RunIdPrefix + "-" + date;
    }

    private static string NormalizeMaskTextureId(string preferred, string secondary, string region)
    {
        if (string.IsNullOrWhiteSpace(preferred))
        {
            throw new ArgumentException("Recipe mask texture id is missing for region " + region + ".");
        }

        string value = preferred.Trim();
        string expected = GetDefaultMaskTextureId(region);
        if (value == expected
            || (region == "lip" && (value == "lip-vision-boundary-v1"
                || value == "lip-drawn-style-atlas-v1"
                || value == "lip-drawn-gradient-density-atlas-v1"
                || value == "lip-style-atlas-v1"
                || value == "lip-smooth-mask-v1"
                || value == "lip-drawn-mask-v1"))
            || (region == "cheek" && (value == "cheek-daily-mask-v1"
                || value == "cheek-lovely-mask-v1"
                || value == "cheek-sunkissed-mask1-v1"
                || value == "cheek-sunkissed-mask2-v1"
                || value == "cheek-under-eye-mask-v1"
                || value == "cheek-drawn-mask-v1"
                || value == "cheek-smooth-mask-v1"))
            || (region == "eye" && value == "eye-smooth-mask-v1")
            || (region == "brow" && (value == "brow-soft-arch-fine-hair-v1"
                || value == "brow-back-arch-soft-mix-v1"
                || value == "brow-slim-tail-fine-hair-v1"
                || value == "brow-png-dailyflat-hair-v1"
                || value == "brow-png-dailyflat-sharp-v1"
                || value == "brow-png-dailyflat-multiply-v1"
                || value == "brow-png-daily-hair-v1"
                || value == "brow-png-natural-hair-v1"
                || value == "brow-png-narrow-hair-v1"
                || value == "brow-png-lightbrown-hair-v1"
                || value == "brow-drawn-mask-v1")))
        {
            return value;
        }

        throw new ArgumentException(
            "Unsupported mask texture id for region " + region + ": " + value);
    }

    private static string GetDefaultMaskTextureId(string region)
    {
        switch (region)
        {
            case "cheek":
                return "cheek-daily-mask-v1";
            case "eye":
                return "eye-drawn-mask-v1";
            case "brow":
                return "brow-png-dailyflat-sharp-v1";
            default:
                return "lip-drawn-style-atlas-v1";
        }
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

    private static string NormalizeMaskDebugViewMode(string value)
    {
        string normalized = string.IsNullOrWhiteSpace(value)
            ? "final"
            : value.Trim().ToLowerInvariant();
        switch (normalized)
        {
            case "raw":
            case "processed":
            case "final":
                return normalized;
            default:
                return "final";
        }
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
