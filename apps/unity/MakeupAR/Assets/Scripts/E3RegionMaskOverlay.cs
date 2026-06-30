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
        public int MeshTriangleCount;
        public int MaskTriangleCount;
        public bool UvAvailable;
        public int MeshVertexCount;
        public int MeshIndexCount;
        public int MeshUvCount;
        public string RendererMode;
        public string MaskTextureId;
        public string MaskSource;
        public string BoundaryRenderer;
        public string TrackingState;
        public string StateAction;
        public string TextureSample;
        public string TextureMode;
        public float Intensity;
        public float Feather;
        public string BlendMode;
        public string SecondaryColorHex;
        public string TopologyAuditStatus;
        public string TopologyAuditSummary;
        public float MaskThreshold;
        public float MaskFeatherUvNormalized;
        public float Coverage;
        public string Finish;
        public float TextureAmount;
        public float GradientAmount;
        public bool PreserveDetail;
        public float Roughness;
        public float Specular;
        public float SpecularPower;
        public float GlossBoost;
        public string CandidateId;
        public float CornerReach;
        public float UpperLipTightness;
        public float LowerLipTightness;
        public float VerticalOffset;
        public string OverlaySyncPhase;
        public int OverlaySyncFrame;
        public int TrackablesChangedSequence;
        public float OverlaySyncDurationMs;
        public float OverlaySyncWorstDurationMs;
        public int OverlaySyncCount;
        public bool OverlayTopologyChanged;
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
        public float Intensity = 1.0f;
        public float Feather = 0.0f;
        public string BlendMode = "normal";
        public string MaskTextureId = "lip-smooth-mask-v1";
        public float Coverage = 0.0f;
        public string Finish = "validation-placeholder";
        public float TextureAmount = 0.0f;
        public float GradientAmount = 0.08f;
        public bool PreserveDetail = true;
        public float Roughness = 0.0f;
        public float Specular = 0.0f;
        public float SpecularPower = 0.0f;
        public float GlossBoost = 0.0f;
        public string CandidateId = "lip-smooth-mask-v1";
        public float MaskThreshold = -1.0f;
        public float MaskFeatherUvNormalized = -1.0f;
        public float CornerReach;
        public float UpperLipTightness;
        public float LowerLipTightness;
        public float VerticalOffset;
    }

    private sealed class FaceOverlayState
    {
        public readonly Dictionary<string, RegionOverlayView> Regions =
            new Dictionary<string, RegionOverlayView>();
        public readonly Dictionary<string, string> LastLoggedStateActionByRegion =
            new Dictionary<string, string>();
        public bool WasLimitedOrLost;
        public float TrackingLossStartedAt = -1.0f;
    }

    private struct TrackingVisibility
    {
        public bool ShouldRender;
        public bool UseCachedMesh;
        public float AlphaMultiplier;
        public string Action;
    }

    private sealed class RegionOverlayView
    {
        public Mesh Mesh;
        public MeshRenderer MeshRenderer;
        public Material MaskMaterial;
        public readonly List<Vector3> Vertices = new List<Vector3>();
        public readonly List<Vector2> Uvs = new List<Vector2>();
        public readonly List<int> Triangles = new List<int>();
        public string LastAppearanceSignature = string.Empty;
        public int LastVertexCount = -1;
        public int LastUvCount = -1;
        public int LastIndexCount = -1;
        public int LastTriangleCount = -1;
        public int SyncCount;
        public float WorstSyncDurationMs;
    }

    private sealed class MaskDefinition
    {
        public string Region;
        public string MaskTextureId;
        public string ResourcePath;
        public float Threshold;
        public float FeatherUvNormalized;
    }

    [SerializeField] private ARFaceManager faceManager;
    [SerializeField] private bool useMeshMasks = true;
    [SerializeField, Range(0.0f, 1.0f)] private float trackingLossGraceSeconds =
        DefaultTrackingLossGraceSeconds;
    [SerializeField, Range(0.0f, 1.0f)] private float trackingLossGraceMinAlpha =
        DefaultTrackingLossGraceMinAlpha;

    private const string RendererMode = "smooth-region-mask";
    private const string MaskSource = "smooth_region_mask";
    private const string BoundaryRenderer = "smooth_alpha_mask";
    private const float DefaultTrackingLossGraceSeconds = 0.25f;
    private const float DefaultTrackingLossGraceMinAlpha = 0.35f;
    private static readonly Bounds StableFaceMaskBounds =
        new Bounds(Vector3.zero, new Vector3(0.36f, 0.42f, 0.28f));

    private readonly Dictionary<string, RegionRecipeState> recipes =
        new Dictionary<string, RegionRecipeState>();
    private readonly Dictionary<ARFace, FaceOverlayState> overlays =
        new Dictionary<ARFace, FaceOverlayState>();
    private readonly Dictionary<string, RegionApplyResult> latestRegionResults =
        new Dictionary<string, RegionApplyResult>();
    private static readonly Dictionary<string, Texture2D> MaskTextures =
        new Dictionary<string, Texture2D>();
    private readonly Dictionary<string, Texture2D> generatedMaskTextures =
        new Dictionary<string, Texture2D>();
    private bool overlayRenderingSuppressed;
    private ARFaceManager subscribedFaceManager;
    private int trackablesChangedSequence;

    public void Configure(ARFaceManager manager)
    {
        if (faceManager == null)
        {
            faceManager = manager;
        }
    }

    public bool TryGetLatestRegionApplyResult(string region, out RegionApplyResult result)
    {
        return latestRegionResults.TryGetValue(NormalizeRegion(region), out result);
    }

    public void SetOverlayRenderingSuppressed(bool suppressed, string reason = "manual")
    {
        overlayRenderingSuppressed = suppressed;
        if (suppressed)
        {
            HideAllOverlayViews();
        }

        Debug.Log(
            "[E7] region_overlay_suppression"
            + " suppressed=" + overlayRenderingSuppressed.ToString().ToLowerInvariant()
            + " reason=" + NormalizeLogToken(reason));
    }

    public void ClearRecipesAndHideOverlays()
    {
        recipes.Clear();
        latestRegionResults.Clear();
        HideAllOverlayViews();
    }

    public bool RegisterGeneratedLipMaskTexture(
        string maskTextureId,
        string rawRgbaBase64,
        int width,
        int height)
    {
        maskTextureId = NormalizeGeneratedLipMaskTextureId(maskTextureId);
        if (string.IsNullOrWhiteSpace(rawRgbaBase64))
        {
            throw new ArgumentException("Generated lip mask raw RGBA payload is empty.");
        }

        if (width <= 0 || height <= 0)
        {
            throw new ArgumentException("Generated lip mask texture dimensions are invalid.");
        }

        byte[] bytes = Convert.FromBase64String(StripDataUrlPrefix(rawRgbaBase64));
        int expectedByteCount = checked(width * height * 4);
        if (bytes.Length != expectedByteCount)
        {
            throw new ArgumentException(
                "Generated lip mask raw RGBA byte count mismatch: expected "
                + expectedByteCount.ToString(CultureInfo.InvariantCulture)
                + " got "
                + bytes.Length.ToString(CultureInfo.InvariantCulture));
        }

        Texture2D texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
        texture.LoadRawTextureData(bytes);
        texture.Apply(false, false);
        texture.name = maskTextureId;
        texture.wrapMode = TextureWrapMode.Clamp;
        texture.filterMode = FilterMode.Bilinear;

        if (generatedMaskTextures.TryGetValue(maskTextureId, out Texture2D previous)
            && previous != null)
        {
            Destroy(previous);
        }

        generatedMaskTextures[maskTextureId] = texture;
        Debug.Log(
            "[E7] generated_lip_mask_texture_registered"
            + " maskTextureId=" + maskTextureId
            + " width=" + texture.width.ToString(CultureInfo.InvariantCulture)
            + " height=" + texture.height.ToString(CultureInfo.InvariantCulture));
        return true;
    }

    private void OnEnable()
    {
        RefreshSceneReferences();
    }

    private void OnDisable()
    {
        UnsubscribeFaceManager();
    }

    private void LateUpdate()
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
        float glossBoost)
    {
        region = NormalizeRegion(region);
        opacity = Mathf.Clamp01(opacity);
        recipes[region] = new RegionRecipeState
        {
            Region = region,
            ColorHex = colorHex,
            Color = new Color(color.r, color.g, color.b, opacity),
            SecondaryColorHex = NormalizeSecondaryColorHex(secondaryColorHex, colorHex),
            SecondaryColor = new Color(secondaryColor.r, secondaryColor.g, secondaryColor.b, 1.0f),
            Opacity = opacity,
            Enabled = enabled,
            TextureSample = NormalizeTextureSample(region, textureSample),
            TextureMode = NormalizeTextureMode(textureMode),
            Intensity = Mathf.Clamp01(intensity),
            Feather = Mathf.Clamp01(feather),
            BlendMode = NormalizeBlendMode(blendMode),
            MaskTextureId = NormalizeMaskTextureId(region, maskTextureId),
            CandidateId = NormalizeCandidateId(region, candidateId, maskTextureId),
            MaskThreshold = NormalizeMaskThreshold(maskThreshold),
            MaskFeatherUvNormalized = NormalizeMaskFeather(maskFeatherUvNormalized),
            CornerReach = NormalizeLipAdjustment(region, cornerReach),
            UpperLipTightness = NormalizeLipAdjustment(region, upperLipTightness),
            LowerLipTightness = NormalizeLipAdjustment(region, lowerLipTightness),
            VerticalOffset = NormalizeLipAdjustment(region, verticalOffset),
            Coverage = Mathf.Clamp01(coverage),
            Finish = NormalizeFinish(finish),
            TextureAmount = Mathf.Clamp01(textureAmount),
            GradientAmount = Mathf.Clamp01(gradientAmount),
            PreserveDetail = preserveDetail,
            Roughness = Mathf.Clamp01(roughness),
            Specular = Mathf.Clamp01(specular),
            SpecularPower = Mathf.Clamp(specularPower, 0.0f, 128.0f),
            GlossBoost = Mathf.Clamp01(glossBoost)
        };

        return ApplyRegionToTrackedFaces(region, true);
    }

    private RegionApplyResult ApplyRegionToTrackedFaces(string region, bool emitLog)
    {
        RefreshSceneReferences();
        RegionApplyResult result = CreateResult(region);
        float syncStartedAt = Time.realtimeSinceStartup;
        result.OverlaySyncPhase = emitLog ? "immediate_apply" : "late_update";
        result.OverlaySyncFrame = Time.frameCount;
        result.TrackablesChangedSequence = trackablesChangedSequence;

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
            TrackingVisibility visibility = ResolveTrackingVisibility(face, faceState, view);
            ApplyViewAlphaMultiplier(view, visibility.AlphaMultiplier);
            MaybeLogRegionMaskState(face, faceState, view, region, recipe, visibility);

            result.TrackingState = face.trackingState.ToString();
            result.StateAction = visibility.Action;
            bool usingCachedMesh = visibility.UseCachedMesh && HasRenderableCachedMesh(view);
            result.UvAvailable = result.UvAvailable || HasUsableUv(face) || usingCachedMesh;
            result.MeshVertexCount = Mathf.Max(
                result.MeshVertexCount,
                usingCachedMesh ? view.LastVertexCount : GetVertexCount(face));
            result.MeshIndexCount = Mathf.Max(
                result.MeshIndexCount,
                usingCachedMesh ? view.LastIndexCount : GetIndexCount(face));
            result.MeshUvCount = Mathf.Max(
                result.MeshUvCount,
                usingCachedMesh ? view.LastUvCount : GetUvCount(face));
            result.TopologyAuditStatus = BuildTopologyAuditStatus(face);
            result.TopologyAuditSummary = BuildTopologyAuditSummary(face);

            if (overlayRenderingSuppressed || !visibility.ShouldRender)
            {
                SetViewVisibility(view, false);
                if (overlayRenderingSuppressed)
                {
                    result.StateAction = "suppressed_for_clean_view";
                }
                continue;
            }

            result.FaceCount++;
            int triangleCount = 0;
            bool topologyChanged = false;
            bool meshApplied;
            if (usingCachedMesh && useMeshMasks)
            {
                triangleCount = view.LastTriangleCount;
                meshApplied = true;
            }
            else if (usingCachedMesh)
            {
                meshApplied = false;
            }
            else
            {
                meshApplied = useMeshMasks
                    && TryUpdateFullFaceUvMesh(face, view, recipe, out triangleCount, out topologyChanged);
            }

            result.MeshTriangleCount += triangleCount;
            result.MaskTriangleCount += triangleCount;
            result.OverlayTopologyChanged = result.OverlayTopologyChanged || topologyChanged;
            result.OverlaySyncWorstDurationMs = Mathf.Max(
                result.OverlaySyncWorstDurationMs,
                view.WorstSyncDurationMs);
            result.OverlaySyncCount = Mathf.Max(result.OverlaySyncCount, view.SyncCount);

            SetViewVisibility(view, meshApplied);
            result.Applied = result.Applied || meshApplied;
        }

        result.OverlaySyncDurationMs = (Time.realtimeSinceStartup - syncStartedAt) * 1000.0f;
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
        MaskDefinition mask = ResolveMask(region);
        return new RegionApplyResult
        {
            Region = region,
            Applied = false,
            FaceCount = 0,
            MeshTriangleCount = 0,
            MaskTriangleCount = 0,
            UvAvailable = false,
            MeshVertexCount = 0,
            MeshIndexCount = 0,
            MeshUvCount = 0,
            RendererMode = RendererMode,
            MaskTextureId = maskTextureId,
            MaskSource = MaskSource,
            BoundaryRenderer = BoundaryRenderer,
            TrackingState = "None",
            StateAction = "not_started",
            TextureSample = string.Empty,
            TextureMode = string.Empty,
            Intensity = 0.0f,
            Feather = 0.0f,
            BlendMode = string.Empty,
            SecondaryColorHex = string.Empty,
            TopologyAuditStatus = "not_run",
            TopologyAuditSummary = "none",
            MaskThreshold = mask.Threshold,
            MaskFeatherUvNormalized = mask.FeatherUvNormalized,
            Coverage = 0.0f,
            Finish = "validation-placeholder",
            TextureAmount = 0.0f,
            GradientAmount = 0.0f,
            PreserveDetail = true,
            Roughness = 0.0f,
            Specular = 0.0f,
            SpecularPower = 0.0f,
            GlossBoost = 0.0f,
            CandidateId = mask.MaskTextureId,
            CornerReach = 0.0f,
            UpperLipTightness = 0.0f,
            LowerLipTightness = 0.0f,
            VerticalOffset = 0.0f,
            OverlaySyncPhase = "not_started",
            OverlaySyncFrame = 0,
            TrackablesChangedSequence = 0,
            OverlaySyncDurationMs = 0.0f,
            OverlaySyncWorstDurationMs = 0.0f,
            OverlaySyncCount = 0,
            OverlayTopologyChanged = false,
        };
    }

    private static void ApplyRecipeToResult(RegionRecipeState recipe, ref RegionApplyResult result)
    {
        MaskDefinition mask = ResolveMask(recipe);
        result.TextureSample = recipe.TextureSample;
        result.TextureMode = recipe.TextureMode;
        result.Intensity = recipe.Intensity;
        result.Feather = recipe.Feather;
        result.BlendMode = recipe.BlendMode;
        result.SecondaryColorHex = recipe.SecondaryColorHex;
        result.MaskTextureId = recipe.MaskTextureId;
        result.MaskThreshold = mask.Threshold;
        result.MaskFeatherUvNormalized = ResolveEffectiveFeather(mask, recipe);
        result.Coverage = recipe.Coverage;
        result.Finish = recipe.Finish;
        result.TextureAmount = recipe.TextureAmount;
        result.GradientAmount = recipe.GradientAmount;
        result.PreserveDetail = recipe.PreserveDetail;
        result.Roughness = recipe.Roughness;
        result.Specular = recipe.Specular;
        result.SpecularPower = recipe.SpecularPower;
        result.GlossBoost = recipe.GlossBoost;
        result.CandidateId = recipe.CandidateId;
        result.CornerReach = recipe.CornerReach;
        result.UpperLipTightness = recipe.UpperLipTightness;
        result.LowerLipTightness = recipe.LowerLipTightness;
        result.VerticalOffset = recipe.VerticalOffset;
    }

    private void RefreshSceneReferences()
    {
        if (faceManager == null)
        {
            faceManager = FindFirstObjectByType<ARFaceManager>();
        }

        SubscribeFaceManager();
    }

    private void SubscribeFaceManager()
    {
        if (faceManager == null || subscribedFaceManager == faceManager)
        {
            return;
        }

        UnsubscribeFaceManager();
        subscribedFaceManager = faceManager;
        subscribedFaceManager.trackablesChanged.AddListener(OnFaceTrackablesChanged);
    }

    private void UnsubscribeFaceManager()
    {
        if (subscribedFaceManager == null)
        {
            return;
        }

        subscribedFaceManager.trackablesChanged.RemoveListener(OnFaceTrackablesChanged);
        subscribedFaceManager = null;
    }

    private void OnFaceTrackablesChanged(ARTrackablesChangedEventArgs<ARFace> args)
    {
        trackablesChangedSequence++;
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
        mesh.bounds = StableFaceMaskBounds;

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
        out bool topologyChanged)
    {
        triangleCount = 0;
        topologyChanged = false;
        float syncStartedAt = Time.realtimeSinceStartup;

        if (!HasUsableUv(face) || view.MeshRenderer == null)
        {
            view.Mesh.Clear();
            ResetMeshCacheState(view);
            return false;
        }

        MaskDefinition mask = ResolveMask(recipe);
        Texture2D maskTexture = GetMaskTexture(mask);
        if (maskTexture == null)
        {
            view.Mesh.Clear();
            ResetMeshCacheState(view);
            return false;
        }

        if (view.MeshRenderer.sharedMaterial == null
            || !view.MeshRenderer.sharedMaterial.HasProperty("_MaskTex"))
        {
            view.Mesh.Clear();
            ResetMeshCacheState(view);
            return false;
        }

        int vertexCount = face.vertices.Length;
        int uvCount = face.uvs.Length;
        int indexCount = face.indices.Length;
        topologyChanged = view.LastVertexCount != vertexCount
            || view.LastUvCount != uvCount
            || view.LastIndexCount != indexCount;

        EnsureCapacity(view.Vertices, vertexCount);
        view.Vertices.Clear();
        for (int index = 0; index < vertexCount; index++)
        {
            view.Vertices.Add(face.vertices[index]);
        }

        if (topologyChanged)
        {
            EnsureCapacity(view.Uvs, uvCount);
            EnsureCapacity(view.Triangles, indexCount);
            view.Uvs.Clear();
            view.Triangles.Clear();

            for (int index = 0; index < uvCount; index++)
            {
                view.Uvs.Add(face.uvs[index]);
            }

            for (int index = 0; index + 2 < indexCount; index += 3)
            {
                int sourceA = face.indices[index];
                int sourceB = face.indices[index + 1];
                int sourceC = face.indices[index + 2];

                if (sourceA < 0 || sourceB < 0 || sourceC < 0
                    || sourceA >= vertexCount
                    || sourceB >= vertexCount
                    || sourceC >= vertexCount)
                {
                    continue;
                }

                view.Triangles.Add(sourceA);
                view.Triangles.Add(sourceB);
                view.Triangles.Add(sourceC);
            }

            view.LastVertexCount = vertexCount;
            view.LastUvCount = uvCount;
            view.LastIndexCount = indexCount;
            view.LastTriangleCount = view.Triangles.Count / 3;
        }

        triangleCount = view.LastTriangleCount;
        if (triangleCount == 0)
        {
            view.Mesh.Clear();
            ResetMeshCacheState(view);
            return false;
        }

        if (topologyChanged)
        {
            view.Mesh.Clear(false);
            view.Mesh.SetVertices(view.Vertices);
            view.Mesh.SetUVs(0, view.Uvs);
            view.Mesh.SetTriangles(view.Triangles, 0);
            view.Mesh.bounds = StableFaceMaskBounds;
        }
        else
        {
            view.Mesh.SetVertices(view.Vertices);
        }

        view.SyncCount++;
        view.WorstSyncDurationMs = Mathf.Max(
            view.WorstSyncDurationMs,
            (Time.realtimeSinceStartup - syncStartedAt) * 1000.0f);
        return true;
    }

    private static void ResetMeshCacheState(RegionOverlayView view)
    {
        view.Vertices.Clear();
        view.Uvs.Clear();
        view.Triangles.Clear();
        view.LastVertexCount = -1;
        view.LastUvCount = -1;
        view.LastIndexCount = -1;
        view.LastTriangleCount = 0;
    }

    private static bool HasRenderableCachedMesh(RegionOverlayView view)
    {
        return view != null
            && view.Mesh != null
            && view.MeshRenderer != null
            && view.Mesh.vertexCount > 0
            && view.LastVertexCount > 0
            && view.LastUvCount > 0
            && view.LastIndexCount > 0
            && view.LastTriangleCount > 0;
    }

    private static void EnsureCapacity<T>(List<T> values, int capacity)
    {
        if (values.Capacity < capacity)
        {
            values.Capacity = capacity;
        }
    }

    private static MaskDefinition ResolveMask(string region)
    {
        region = NormalizeRegion(region);
        string maskTextureId = GetDefaultMaskTextureId(region);
        return new MaskDefinition
        {
            Region = region,
            MaskTextureId = maskTextureId,
            ResourcePath = "SmoothRegionMasks/" + maskTextureId,
            Threshold = 0.04f,
            FeatherUvNormalized = 0.56f
        };
    }

    private static MaskDefinition ResolveMask(RegionRecipeState recipe)
    {
        MaskDefinition mask = ResolveMask(recipe.Region);
        mask.MaskTextureId = NormalizeMaskTextureId(recipe.Region, recipe.MaskTextureId);
        mask.ResourcePath = IsGeneratedLipMaskTextureId(mask.MaskTextureId)
            ? "GeneratedLipMasks/" + mask.MaskTextureId
            : "SmoothRegionMasks/" + mask.MaskTextureId;
        if (recipe.MaskThreshold >= 0.0f)
        {
            mask.Threshold = recipe.MaskThreshold;
        }

        if (recipe.MaskFeatherUvNormalized >= 0.0f)
        {
            mask.FeatherUvNormalized = recipe.MaskFeatherUvNormalized;
        }

        return mask;
    }

    private static string GetDefaultMaskTextureId(string region)
    {
        switch (NormalizeRegion(region))
        {
            case "lip":
                return "lip-smooth-mask-v1";
            case "cheek":
            case "blush":
                return "cheek-smooth-mask-v1";
            case "eye":
            case "brow":
            case "eyeliner":
                return "eye-smooth-mask-v1";
            default:
                throw new ArgumentException("Unsupported smooth mask region: " + region);
        }
    }

    private Texture2D GetMaskTexture(MaskDefinition mask)
    {
        if (mask == null || string.IsNullOrWhiteSpace(mask.ResourcePath))
        {
            return null;
        }

        if (IsGeneratedLipMaskTextureId(mask.MaskTextureId))
        {
            if (generatedMaskTextures.TryGetValue(mask.MaskTextureId, out Texture2D generatedTexture)
                && generatedTexture != null)
            {
                return generatedTexture;
            }

            Debug.LogWarning(
                "[E7] generated_lip_mask_texture_missing"
                + " maskTextureId=" + mask.MaskTextureId);
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

    private void ApplyRecipeAppearance(RegionOverlayView view, RegionRecipeState recipe)
    {
        if (view.MeshRenderer == null)
        {
            return;
        }

        Material material = GetOrCreateMaskMaterial(view, recipe.Region);
        MaskDefinition mask = ResolveMask(recipe);
        Texture2D maskTexture = GetMaskTexture(mask);
        Color materialColor = BuildMaterialColor(recipe);

        if (material == null || maskTexture == null || !material.HasProperty("_MaskTex"))
        {
            view.MeshRenderer.enabled = false;
            view.Mesh.Clear();
            return;
        }

        view.MeshRenderer.sharedMaterial = material;
        material.SetTexture("_MaskTex", maskTexture);
        ApplyMaterialBlendMode(material, recipe.BlendMode);

        if (material.HasProperty("_RegionColor"))
        {
            material.SetColor("_RegionColor", new Color(materialColor.r, materialColor.g, materialColor.b, 1.0f));
        }

        if (material.HasProperty("_SecondaryColor"))
        {
            material.SetColor(
                "_SecondaryColor",
                new Color(recipe.SecondaryColor.r, recipe.SecondaryColor.g, recipe.SecondaryColor.b, 1.0f));
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

        if (material.HasProperty("_TextureAmount"))
        {
            material.SetFloat("_TextureAmount", recipe.TextureAmount);
        }

        if (material.HasProperty("_DetailAmount"))
        {
            material.SetFloat("_DetailAmount", recipe.TextureAmount);
        }

        if (material.HasProperty("_FinishMode"))
        {
            material.SetFloat("_FinishMode", GetFinishMode(recipe.Finish));
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

        if (material.HasProperty("_PreserveDetail"))
        {
            material.SetFloat("_PreserveDetail", recipe.PreserveDetail ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_LipStyleMode"))
        {
            material.SetFloat(
                "_LipStyleMode",
                ShouldUseLipStyleMode(recipe)
                    ? ResolveLipStyleMode(recipe.TextureSample)
                    : -1.0f);
        }

        if (material.HasProperty("_UseScreenSpaceMask"))
        {
            material.SetFloat("_UseScreenSpaceMask", 0.0f);
        }

        if (material.HasProperty("_DebugMaskMode"))
        {
            material.SetFloat("_DebugMaskMode", recipe.TextureMode == "debug-mask" ? 1.0f : 0.0f);
        }

        if (material.HasProperty("_CornerReach"))
        {
            material.SetFloat("_CornerReach", recipe.CornerReach);
        }

        if (material.HasProperty("_UpperLipTightness"))
        {
            material.SetFloat("_UpperLipTightness", recipe.UpperLipTightness);
        }

        if (material.HasProperty("_LowerLipTightness"))
        {
            material.SetFloat("_LowerLipTightness", recipe.LowerLipTightness);
        }

        if (material.HasProperty("_VerticalOffset"))
        {
            material.SetFloat("_VerticalOffset", recipe.VerticalOffset);
        }
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
            case "gloss_lip":
            case "gradient_lip":
                sampleAlphaScale = Mathf.Lerp(0.72f, 0.92f, recipe.Intensity);
                brightnessScale = 0.90f;
                break;
            case "full_lip":
                sampleAlphaScale = Mathf.Lerp(0.50f, 0.72f, recipe.Intensity);
                brightnessScale = 0.90f;
                break;
            case "overline_lip":
                sampleAlphaScale = Mathf.Lerp(0.28f, 0.42f, recipe.Intensity);
                brightnessScale = 0.90f;
                break;
            case "soft_blush":
                sampleAlphaScale = Mathf.Lerp(0.32f, 0.52f, recipe.Intensity);
                brightnessScale = 1.02f;
                break;
            case "shimmer_eye":
                sampleAlphaScale = Mathf.Lerp(0.30f, 0.50f, recipe.Intensity);
                brightnessScale = Mathf.Lerp(1.0f, 1.10f, recipe.Intensity);
                break;
            default:
                sampleAlphaScale = Mathf.Lerp(0.52f, 0.76f, recipe.Intensity);
                brightnessScale = recipe.Region == "lip" ? 0.90f : 1.0f;
                break;
        }

        return new Color(
            Mathf.Clamp01(recipe.Color.r * brightnessScale),
            Mathf.Clamp01(recipe.Color.g * brightnessScale),
            Mathf.Clamp01(recipe.Color.b * brightnessScale),
            Mathf.Clamp01(recipe.Opacity * sampleAlphaScale));
    }

    private static float ResolveLipBrightnessScale(RegionRecipeState recipe)
    {
        if (recipe.Region != "lip")
        {
            return 0.95f;
        }

        switch (recipe.Finish)
        {
            case "gloss":
                return 1.0f;
            case "matte":
                return 0.92f;
            case "cream":
                return 0.96f;
            default:
                return 0.95f;
        }
    }

    private static float ResolveFeather(RegionRecipeState recipe, MaskDefinition mask)
    {
        return recipe.Feather > 0.0f ? Mathf.Clamp01(recipe.Feather) : mask.FeatherUvNormalized;
    }

    private static float ResolveEffectiveFeather(MaskDefinition mask, RegionRecipeState recipe)
    {
        if (mask == null)
        {
            return 0.0f;
        }

        if (recipe != null && recipe.Region == "lip" && IsDetailedLipMask(recipe.MaskTextureId))
        {
            float requestedFeather = recipe.Feather > 0.0f
                ? recipe.Feather
                : mask.FeatherUvNormalized;
            if (recipe.TextureSample == "gradient_lip")
            {
                return Mathf.Clamp01(Mathf.Min(0.38f, Mathf.Max(0.28f, requestedFeather)));
            }

            return Mathf.Clamp01(Mathf.Min(0.34f, Mathf.Max(0.22f, requestedFeather)));
        }

        return ResolveFeather(recipe, mask);
    }

    private static float GetFinishMode(string finish)
    {
        switch (finish)
        {
            case "matte":
                return 0.0f;
            case "cream":
                return 1.0f;
            case "gloss":
                return 2.0f;
            default:
                return -1.0f;
        }
    }

    private static bool ShouldUseLipStyleMode(RegionRecipeState recipe)
    {
        return recipe != null
            && recipe.Region == "lip"
            && (IsDetailedLipMask(recipe.MaskTextureId)
                || recipe.TextureSample == "matte_lip"
                || recipe.TextureSample == "gloss_lip"
                || recipe.TextureSample == "full_lip"
                || recipe.TextureSample == "gradient_lip"
                || recipe.TextureSample == "overline_lip");
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

    private static void ApplyMaterialBlendMode(Material material, string blendMode)
    {
        if (material == null)
        {
            return;
        }

        BlendMode sourceBlend = BlendMode.SrcAlpha;
        BlendMode destinationBlend = BlendMode.OneMinusSrcAlpha;
        string normalizedBlendMode = NormalizeBlendMode(blendMode);

        if (normalizedBlendMode == "multiply")
        {
            sourceBlend = BlendMode.DstColor;
            destinationBlend = BlendMode.Zero;
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
            material.SetFloat("_PigmentMultiply", normalizedBlendMode == "multiply" ? 1.0f : 0.0f);
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
            || region == "eye"
            || region == "blush"
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
            || ((region == "cheek" || region == "blush") && textureSample == "soft_blush")
            || ((region == "eye" || region == "brow" || region == "eyeliner") && textureSample == "shimmer_eye"))
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

    private static string NormalizeFinish(string finish)
    {
        finish = string.IsNullOrWhiteSpace(finish)
            ? "validation-placeholder"
            : finish.Trim().ToLowerInvariant();

        if (finish == "validation-placeholder"
            || finish == "matte"
            || finish == "cream"
            || finish == "gloss"
            || finish == "glow"
            || finish == "gradient"
            || finish == "natural-makeup"
            || finish == "soft-powder"
            || finish == "cream-blush"
            || finish == "sheer-glow"
            || finish == "soft-powder-brow"
            || finish == "hair-stroke-brow"
            || finish == "defined-brow"
            || finish == "soft-eye-line"
            || finish == "defined-eye-line"
            || finish == "soft-eye-shimmer")
        {
            return finish;
        }

        return finish;
    }

    private static string NormalizeSecondaryColorHex(string secondaryColorHex, string fallbackColorHex)
    {
        if (!string.IsNullOrWhiteSpace(secondaryColorHex))
        {
            return secondaryColorHex.Trim();
        }

        return string.IsNullOrWhiteSpace(fallbackColorHex) ? "#F29BAA" : fallbackColorHex.Trim();
    }

    private static string NormalizeMaskTextureId(string region, string maskTextureId)
    {
        maskTextureId = string.IsNullOrWhiteSpace(maskTextureId)
            ? string.Empty
            : maskTextureId.Trim();

        string expected = GetDefaultMaskTextureId(region);
        if (maskTextureId == expected)
        {
            return maskTextureId;
        }

        if (NormalizeRegion(region) == "lip"
            && IsGeneratedLipMaskTextureId(maskTextureId))
        {
            return maskTextureId;
        }

        if (NormalizeRegion(region) == "lip"
            && maskTextureId.StartsWith("e7-lip-validation-", StringComparison.Ordinal))
        {
            return maskTextureId;
        }

        if (IsFullFaceRegionMaskTextureId(NormalizeRegion(region), maskTextureId))
        {
            return maskTextureId;
        }

        throw new ArgumentException(
            "Unsupported smooth mask texture id for region " + region + ": " + maskTextureId);
    }

    private static string NormalizeCandidateId(string region, string candidateId, string maskTextureId)
    {
        string value = string.IsNullOrWhiteSpace(candidateId)
            ? maskTextureId
            : candidateId.Trim();
        if (NormalizeRegion(region) == "lip"
            && (value == "lip-smooth-mask-v1"
                || value == "lip-tight-auto-v0"
                || value == "lip-tight-user-v0"
                || value == "lip-safe-v0"
                || IsGeneratedLipMaskTextureId(value)
                || value.StartsWith("cv-", StringComparison.Ordinal)))
        {
            return value;
        }

        if (value == GetDefaultMaskTextureId(region))
        {
            return value;
        }

        if (IsFullFaceRegionCandidateId(NormalizeRegion(region), value))
        {
            return value;
        }

        throw new ArgumentException("Unsupported smooth mask candidate id for region " + region + ": " + value);
    }

    private static float NormalizeMaskThreshold(float threshold)
    {
        return threshold >= 0.0f ? Mathf.Clamp01(threshold) : -1.0f;
    }

    private static float NormalizeMaskFeather(float feather)
    {
        return feather >= 0.0f ? Mathf.Clamp01(feather) : -1.0f;
    }

    private static float NormalizeLipAdjustment(string region, float value)
    {
        return NormalizeRegion(region) == "lip" ? Mathf.Clamp(value, -1.0f, 1.0f) : 0.0f;
    }

    private static bool IsGeneratedLipMaskTextureId(string maskTextureId)
    {
        return !string.IsNullOrWhiteSpace(maskTextureId)
            && maskTextureId.Trim().StartsWith("e7-generated-lip-", StringComparison.Ordinal);
    }

    private static bool IsLipStyleAtlasMask(string maskTextureId)
    {
        if (string.IsNullOrWhiteSpace(maskTextureId))
        {
            return false;
        }

        string value = maskTextureId.Trim();
        return value == "lip-drawn-style-atlas-v1"
            || value == "lip-drawn-gradient-density-atlas-v1"
            || value == "lip-style-atlas-v1";
    }

    private static bool IsDetailedLipMask(string maskTextureId)
    {
        if (string.IsNullOrWhiteSpace(maskTextureId))
        {
            return false;
        }

        string value = maskTextureId.Trim();
        return IsGeneratedLipMaskTextureId(value)
            || IsLipStyleAtlasMask(value)
            || value.StartsWith("e7-lip-", StringComparison.Ordinal)
            || value.StartsWith("lip-", StringComparison.Ordinal);
    }

    private static bool IsFullFaceRegionMaskTextureId(string region, string maskTextureId)
    {
        if (string.IsNullOrWhiteSpace(maskTextureId))
        {
            return false;
        }

        string value = maskTextureId.Trim();
        return (region == "lip" && value.StartsWith("e7-lip-", StringComparison.Ordinal))
            || ((region == "blush" || region == "cheek")
                && (value.StartsWith("e7-blush-", StringComparison.Ordinal)
                    || value.StartsWith("cheek-", StringComparison.Ordinal)))
            || (region == "brow"
                && (value.StartsWith("e7-brow-", StringComparison.Ordinal)
                    || value.StartsWith("brow-", StringComparison.Ordinal)
                    || value.StartsWith("psd-arcore-brow-", StringComparison.Ordinal)))
            || ((region == "eyeliner" || region == "eye")
                && (value.StartsWith("e7-eyeliner-", StringComparison.Ordinal)
                    || value.StartsWith("eye-", StringComparison.Ordinal)));
    }

    private static bool IsFullFaceRegionCandidateId(string region, string candidateId)
    {
        if (string.IsNullOrWhiteSpace(candidateId))
        {
            return false;
        }

        string value = candidateId.Trim();
        return (region == "lip" && value.StartsWith("lip-", StringComparison.Ordinal))
            || (region == "blush" && value.StartsWith("blush-", StringComparison.Ordinal))
            || (region == "brow" && value.StartsWith("brow-", StringComparison.Ordinal))
            || (region == "eyeliner" && value.StartsWith("eyeliner-", StringComparison.Ordinal));
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

    private static string StripDataUrlPrefix(string pngBase64)
    {
        int commaIndex = pngBase64.IndexOf(',');
        if (commaIndex >= 0
            && pngBase64.Substring(0, commaIndex).IndexOf("base64", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return pngBase64.Substring(commaIndex + 1);
        }

        return pngBase64;
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

    private TrackingVisibility ResolveTrackingVisibility(
        ARFace face,
        FaceOverlayState state,
        RegionOverlayView view)
    {
        return ResolveTrackingVisibilityForState(
            face.trackingState,
            HasRenderableCachedMesh(view),
            Time.realtimeSinceStartup,
            trackingLossGraceSeconds,
            trackingLossGraceMinAlpha,
            ref state.WasLimitedOrLost,
            ref state.TrackingLossStartedAt);
    }

    private static TrackingVisibility ResolveTrackingVisibilityForState(
        TrackingState trackingState,
        bool hasCachedMesh,
        float nowSeconds,
        float graceSeconds,
        float graceMinAlpha,
        ref bool wasLimitedOrLost,
        ref float trackingLossStartedAt)
    {
        if (trackingState == TrackingState.Tracking)
        {
            bool recovered = wasLimitedOrLost;
            wasLimitedOrLost = false;
            trackingLossStartedAt = -1.0f;
            return new TrackingVisibility
            {
                ShouldRender = true,
                AlphaMultiplier = 1.0f,
                Action = recovered ? "recovered_restore" : "tracking_render"
            };
        }

        if (trackingLossStartedAt < 0.0f)
        {
            trackingLossStartedAt = nowSeconds;
        }

        wasLimitedOrLost = true;
        graceSeconds = Mathf.Max(0.0f, graceSeconds);
        graceMinAlpha = Mathf.Clamp01(graceMinAlpha);
        float elapsedSeconds = Mathf.Max(0.0f, nowSeconds - trackingLossStartedAt);
        if (hasCachedMesh
            && graceSeconds > 0.0f
            && elapsedSeconds <= graceSeconds)
        {
            float graceProgress = Mathf.Clamp01(elapsedSeconds / graceSeconds);
            return new TrackingVisibility
            {
                ShouldRender = true,
                UseCachedMesh = true,
                AlphaMultiplier = Mathf.Lerp(1.0f, graceMinAlpha, graceProgress),
                Action = GetTrackingGraceAction(trackingState)
            };
        }

        return new TrackingVisibility
        {
            ShouldRender = false,
            AlphaMultiplier = 0.0f,
            Action = GetTrackingHideAction(trackingState)
        };
    }

    private static string GetTrackingGraceAction(TrackingState trackingState)
    {
        return trackingState == TrackingState.Limited ? "limited_grace_hold" : "lost_grace_hold";
    }

    private static string GetTrackingHideAction(TrackingState trackingState)
    {
        return trackingState == TrackingState.Limited ? "limited_hide" : "lost_hide";
    }

#if UNITY_EDITOR
    public struct TrackingVisibilityEditorSmokeResult
    {
        public bool ShouldRender;
        public bool UseCachedMesh;
        public float AlphaMultiplier;
        public string Action;
        public bool WasLimitedOrLost;
        public float TrackingLossStartedAt;
    }

    public static TrackingVisibilityEditorSmokeResult EvaluateTrackingVisibilityForEditorSmoke(
        TrackingState trackingState,
        bool hasCachedMesh,
        float nowSeconds,
        float graceSeconds,
        float graceMinAlpha,
        ref bool wasLimitedOrLost,
        ref float trackingLossStartedAt)
    {
        TrackingVisibility visibility = ResolveTrackingVisibilityForState(
            trackingState,
            hasCachedMesh,
            nowSeconds,
            graceSeconds,
            graceMinAlpha,
            ref wasLimitedOrLost,
            ref trackingLossStartedAt);
        return new TrackingVisibilityEditorSmokeResult
        {
            ShouldRender = visibility.ShouldRender,
            UseCachedMesh = visibility.UseCachedMesh,
            AlphaMultiplier = visibility.AlphaMultiplier,
            Action = visibility.Action,
            WasLimitedOrLost = wasLimitedOrLost,
            TrackingLossStartedAt = trackingLossStartedAt
        };
    }
#endif

    private static void MaybeLogRegionMaskState(
        ARFace face,
        FaceOverlayState state,
        RegionOverlayView view,
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
            + " candidateId=" + recipe.CandidateId
            + " maskTextureId=" + recipe.MaskTextureId
            + " cornerReach=" + recipe.CornerReach.ToString("0.###", CultureInfo.InvariantCulture)
            + " upperLipTightness=" + recipe.UpperLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + " lowerLipTightness=" + recipe.LowerLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + " verticalOffset=" + recipe.VerticalOffset.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskSource=" + MaskSource
            + " region=" + region
            + " trackingState=" + face.trackingState
            + " stateAction=" + visibility.Action
            + " alphaMultiplier=" + visibility.AlphaMultiplier.ToString("0.##", CultureInfo.InvariantCulture)
            + " useCachedMesh=" + visibility.UseCachedMesh.ToString().ToLowerInvariant()
            + " cachedMeshAvailable=" + HasRenderableCachedMesh(view).ToString().ToLowerInvariant()
            + " uvAvailable=" + HasUsableUv(face).ToString().ToLowerInvariant()
            + " meshVertexCount=" + GetVertexCount(face).ToString(CultureInfo.InvariantCulture)
            + " meshIndexCount=" + GetIndexCount(face).ToString(CultureInfo.InvariantCulture)
            + " meshUvCount=" + GetUvCount(face).ToString(CultureInfo.InvariantCulture)
            + " topologyAuditStatus=" + BuildTopologyAuditStatus(face));
    }

    private static void LogRegionApplyResult(RegionApplyResult result)
    {
        Debug.Log(
            "[E7] region_mask_apply"
            + " rendererMode=" + result.RendererMode
            + " candidateId=" + result.CandidateId
            + " maskTextureId=" + result.MaskTextureId
            + " cornerReach=" + result.CornerReach.ToString("0.###", CultureInfo.InvariantCulture)
            + " upperLipTightness=" + result.UpperLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + " lowerLipTightness=" + result.LowerLipTightness.ToString("0.###", CultureInfo.InvariantCulture)
            + " verticalOffset=" + result.VerticalOffset.ToString("0.###", CultureInfo.InvariantCulture)
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
            + " appliedTriangles=" + result.MeshTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " overlaySyncPhase=" + result.OverlaySyncPhase
            + " overlaySyncFrame=" + result.OverlaySyncFrame.ToString(CultureInfo.InvariantCulture)
            + " trackablesChangedSequence=" + result.TrackablesChangedSequence.ToString(CultureInfo.InvariantCulture)
            + " overlaySyncDurationMs=" + result.OverlaySyncDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + " overlaySyncWorstDurationMs=" + result.OverlaySyncWorstDurationMs.ToString("0.###", CultureInfo.InvariantCulture)
            + " overlaySyncCount=" + result.OverlaySyncCount.ToString(CultureInfo.InvariantCulture)
            + " overlayTopologyChanged=" + result.OverlayTopologyChanged.ToString().ToLowerInvariant()
            + " threshold=" + result.MaskThreshold.ToString("0.###", CultureInfo.InvariantCulture)
            + " featherUvNormalized=" + result.MaskFeatherUvNormalized.ToString("0.######", CultureInfo.InvariantCulture)
            + " coverage=" + result.Coverage.ToString("0.##", CultureInfo.InvariantCulture)
            + " finish=" + result.Finish
            + " textureAmount=" + result.TextureAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " gradientAmount=" + result.GradientAmount.ToString("0.##", CultureInfo.InvariantCulture)
            + " preserveDetail=" + result.PreserveDetail.ToString().ToLowerInvariant()
            + " secondaryColor=" + result.SecondaryColorHex
            + " roughness=" + result.Roughness.ToString("0.##", CultureInfo.InvariantCulture)
            + " specular=" + result.Specular.ToString("0.##", CultureInfo.InvariantCulture)
            + " specularPower=" + result.SpecularPower.ToString("0.##", CultureInfo.InvariantCulture)
            + " glossBoost=" + result.GlossBoost.ToString("0.##", CultureInfo.InvariantCulture)
            + " topologyAuditStatus=" + result.TopologyAuditStatus
            + " regionDecision=smooth_mask_runtime"
            + " smoothing=smooth_alpha_mask"
            + " regionsInScope=lip,cheek,eye,blush,brow,eyeliner");
    }

    private static string NormalizeLogToken(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "none";
        }

        char[] chars = value.Trim().ToLowerInvariant().ToCharArray();
        for (int index = 0; index < chars.Length; index++)
        {
            char current = chars[index];
            bool allowed = (current >= 'a' && current <= 'z')
                || (current >= '0' && current <= '9')
                || current == '_'
                || current == '-';
            if (!allowed)
            {
                chars[index] = '_';
            }
        }

        return new string(chars);
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
