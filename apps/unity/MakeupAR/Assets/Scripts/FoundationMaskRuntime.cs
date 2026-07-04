using System;
using System.Collections.Generic;
using System.Globalization;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public sealed class FoundationMaskRuntime : MonoBehaviour
{
    public struct FoundationMaskState
    {
        public bool DynamicMaskValid;
        public bool StaticFallbackUsed;
        public bool FaceTracked;
        public bool EyeExclusion;
        public bool BrowExclusion;
        public bool LipExclusion;
        public bool MouthExclusion;
        public float MaskAverage;
        public float MaskMax;
        public int DebugMode;
        public long AgeMs;
        public Rect ScreenBounds;
        public string Status;
        public string MaskSource;
        public float FaceYaw;
        public bool LeftCheekValid;
        public bool RightCheekValid;
        public bool NoseValid;
        public bool ChinValid;
        public bool LowerForeheadValid;
        public bool EyeExclusionValid;
        public bool BrowExclusionValid;
        public bool LipExclusionValid;
        public float MouthExclusionRadius;
        public float EyeExclusionRadius;
        public bool FinalMaskLooksFilled;
        public bool BaseFaceSurfaceMaskReady;
        public bool NeckExtensionReady;
        public int ProjectedVertexCount;
        public int ProjectedTriangleCount;
        public bool LeftCheekWeightValid;
        public bool RightCheekWeightValid;
        public bool NoseWeightValid;
        public bool ChinWeightValid;
        public bool LowerForeheadWeightValid;
        public string EyeExclusionMode;
        public string MouthExclusionMode;
        public bool ChinLowerClampApplied;
        public bool RegionWeightReady;
        public bool ExclusionMaskReady;
        public float LeftCheekWeightMax;
        public float RightCheekWeightMax;
        public float NoseWeightMax;
        public float ChinWeightMax;
        public float LowerForeheadWeightMax;
        public float EyeExclusionMax;
        public float MouthExclusionMax;
        public Vector2 LeftCheekAnchor;
        public Vector2 RightCheekAnchor;
        public Vector2 NoseAnchor;
        public Vector2 ChinAnchor;
        public Vector2 LowerForeheadAnchor;
        public Vector2 MouthAnchor;
    }

    private const int MaskBaseWidth = 256;
    private const float MaskBoundsExpansionX = 0.060f;
    private const float MaskBoundsExpansionY = 0.050f;
    // The mask lives in screen space, so holding a stale mask while the phone
    // moves paints the OLD face position (e.g. onto the shirt). Hold just
    // long enough to bridge a single dropped frame, nothing more.
    private const float StaleMaskSeconds = 0.04f;
    // Set to true only if a target device/orientation displays the mask
    // horizontally flipped relative to the face.
    private const bool MirrorMaskUvX = false;

    // ---- Display-matrix projection (debug mode 19, "정밀 투영") ----------
    // Projects face vertices world -> camera view space -> SENSOR image
    // coordinates via the ARKit camera intrinsics (orientation-independent)
    // -> display uv via the inverse of the SAME displayMatrix the camera
    // feed is rendered with. Because every stage is either orientation-free
    // or literally shared with the feed, the mask cannot disagree with the
    // feed no matter what interface-orientation state Unity/UaaL believes.
    // Fixed ARKit convention: sensor image y grows DOWNWARD while camera
    // view-space y grows upward; if a device ever proves otherwise, flip
    // this single constant.
    // The display->image matrix direction and mul convention are VERIFIED:
    // they replicate the exact CameraUv() formula that renders the camera
    // feed correctly on screen. The only genuine unknowns are the sensor
    // axis signs, covered by four in-app variants (no rebuild needed):
    //   mode 19: image y down, x right   (expected ARKit convention)
    //   mode 20: image y up,   x right
    //   mode 21: image y down, x left
    //   mode 22: image y up,   x left
    private bool sensorYDownActive = true;
    private bool sensorXRightActive = true;
    private int dmFrameCounter;
    private Matrix4x4 displayTransform = Matrix4x4.identity;
    private bool hasDisplayTransform;
    private Vector2 sensorFocalPx;
    private Vector2 sensorPrincipalPx;
    private Vector2Int sensorResolutionPx;
    private bool hasSensorIntrinsics;
    private bool displayProjectionRequested;
    private bool loggedDisplayProjectionState;

    /// <summary>
    /// True only when mode 19 is on AND the display-matrix projection is
    /// actually running (not silently falling back). Surfaced to the shader
    /// so the probe renders red when active, blue when falling back.
    /// </summary>
    public bool DisplayProjectionActive { get; private set; }

    public void ConfigureDisplayProjection(
        Matrix4x4 displayMatrix,
        bool displayMatrixValid,
        Vector2 focalLengthPx,
        Vector2 principalPointPx,
        Vector2Int resolutionPx,
        bool intrinsicsValid)
    {
        displayTransform = displayMatrix;
        hasDisplayTransform = displayMatrixValid;
        sensorFocalPx = focalLengthPx;
        sensorPrincipalPx = principalPointPx;
        sensorResolutionPx = resolutionPx;
        hasSensorIntrinsics = intrinsicsValid
            && resolutionPx.x > 16
            && resolutionPx.y > 16
            && focalLengthPx.x > 1.0f
            && focalLengthPx.y > 1.0f;
    }

    /// <summary>
    /// world -> display uv using intrinsics + inverse displayMatrix.
    /// Returns false (caller falls back to WorldToViewportPoint) when the
    /// mode is off or the required per-frame data is unavailable.
    /// viewport.z carries the positive view-space depth so existing
    /// near-plane culling keeps working unchanged.
    /// </summary>
    private bool TryProjectDisplayViewport(Camera arCamera, Vector3 world, out Vector3 viewport)
    {
        viewport = default;
        if (!displayProjectionRequested || !hasDisplayTransform || !hasSensorIntrinsics)
        {
            return false;
        }

        Vector3 view = arCamera.worldToCameraMatrix.MultiplyPoint3x4(world);
        float depth = -view.z; // Unity view space looks down -Z.
        if (depth <= arCamera.nearClipPlane)
        {
            return false;
        }

        float invDepth = 1.0f / depth;
        float xNorm = sensorFocalPx.x * view.x * invDepth;
        float uPx = sensorXRightActive
            ? sensorPrincipalPx.x + xNorm
            : sensorPrincipalPx.x - xNorm;
        float yNorm = sensorFocalPx.y * view.y * invDepth;
        float vPx = sensorYDownActive
            ? sensorPrincipalPx.y - yNorm
            : sensorPrincipalPx.y + yNorm;
        Vector2 imageUv = new Vector2(
            uPx / sensorResolutionPx.x,
            vPx / sensorResolutionPx.y);

        // The AR background shader computes image = mul((d.x, d.y, 1, 1), M)
        // with M = displayMatrix, i.e. an affine map from display uv to
        // image uv:  image.x = a*dx + c*dy + tx,  image.y = b*dx + d*dy + ty.
        // Invert it to go image -> display.
        float a = displayTransform.m00;
        float c = displayTransform.m10;
        float tx = displayTransform.m20 + displayTransform.m30;
        float b = displayTransform.m01;
        float d = displayTransform.m11;
        float ty = displayTransform.m21 + displayTransform.m31;
        float det = a * d - c * b;
        if (Mathf.Abs(det) < 1e-6f)
        {
            return false;
        }

        float ix = imageUv.x - tx;
        float iy = imageUv.y - ty;
        viewport = new Vector3(
            (d * ix - c * iy) / det,
            (-b * ix + a * iy) / det,
            depth);
        return true;
    }
    private const float DiagnosticsIntervalSeconds = 0.75f;
    private const int DiagnosticsSampleGrid = 16;

    // Neck extension: how far below the jawline the foundation mask reaches,
    // relative to the projected face height along the face-down axis.
    private const float NeckLengthFactor = 0.60f;
    // Fraction of the neck-strip width kept at the bottom edge (taper toward the throat).
    private const float NeckBottomWidthFactor = 0.84f;
    // Portion of the hull (along the face-down axis) treated as the jawline band.
    private const float NeckJawBandFraction = 0.30f;
    private const int NeckMinJawPoints = 3;
    private const int NeckShaderPassIndex = 2;

    // Motion prediction: ARKit face-anchor poses arrive ~1 frame behind the
    // camera image, so a mask projected with the current pose trails the
    // face whenever the phone moves. We measure the face's on-screen motion
    // between frames and shift the whole projection forward by that amount,
    // cancelling the perceived lag. Clamped so noise can never fling the mask.
    // ARKit face-tracking sessions are device-anchored: the camera image
    // pans with zero latency while the face anchor (the ONLY input to our
    // projection) is updated late and smoothed by ARKit — several frames in
    // practice. During a steady pan, shifting by (anchor velocity x N)
    // exactly cancels an N-frame lag, which is why this constant must match
    // the real lag scale, not just 1-2 frames.
    private const float MotionPredictionFrames = 4.0f;
    private const float MotionPredictionMaxUvShift = 0.12f;
    private Vector2 previousFaceCenterUv;
    private bool hasPreviousFaceCenterUv;
    private Vector2 smoothedFaceVelocityUv;

    // Vision-based 2D stabilization: Apple Vision measures where the face
    // actually is IN THE IMAGE (no anchor lag). We keep a short history of
    // the ARKit-projected face center and, whenever a Vision observation
    // arrives, estimate the systematic projection bias at that capture time.
    // The smoothed bias is added to every mask projection, anchoring the
    // mask to the image instead of the (laggy/offset) 3D anchor alone.
    private const int ProjectionHistoryCapacity = 48;
    private const long VisionMatchMaxAgeMs = 450;
    private const float VisionBiasSmoothing = 0.25f;
    private const float VisionBiasMaxUvShift = 0.05f;
    private readonly long[] projectionHistoryTimesMs = new long[ProjectionHistoryCapacity];
    private readonly Vector2[] projectionHistoryCenters = new Vector2[ProjectionHistoryCapacity];
    private int projectionHistoryCount;
    private int projectionHistoryNext;
    private Vector2 visionBiasUv;
    private bool hasVisionBias;

    /// <summary>
    /// Feed one Vision face-bounds observation (image/screen pixel space,
    /// sized to the given dimensions). The y-axis convention of Vision
    /// output is resolved automatically by picking the candidate closest to
    /// the ARKit projection recorded at capture time.
    /// </summary>
    public void ApplyVisionFaceObservation(long detectedAtMs, Vector2 centerPx, float width, float height)
    {
        if (width <= 1.0f || height <= 1.0f || projectionHistoryCount == 0)
        {
            return;
        }

        long bestDelta = long.MaxValue;
        Vector2 arkitCenter = Vector2.zero;
        for (int i = 0; i < projectionHistoryCount; i++)
        {
            long delta = System.Math.Abs(projectionHistoryTimesMs[i] - detectedAtMs);
            if (delta < bestDelta)
            {
                bestDelta = delta;
                arkitCenter = projectionHistoryCenters[i];
            }
        }

        if (bestDelta > VisionMatchMaxAgeMs)
        {
            return;
        }

        Vector2 candidateA = new Vector2(centerPx.x / width, centerPx.y / height);
        Vector2 candidateB = new Vector2(centerPx.x / width, 1.0f - centerPx.y / height);
        Vector2 biasA = candidateA - arkitCenter;
        Vector2 biasB = candidateB - arkitCenter;
        Vector2 bias = biasA.sqrMagnitude <= biasB.sqrMagnitude ? biasA : biasB;
        bias = Vector2.ClampMagnitude(bias, VisionBiasMaxUvShift);

        visionBiasUv = hasVisionBias
            ? Vector2.Lerp(visionBiasUv, bias, VisionBiasSmoothing)
            : bias;
        hasVisionBias = true;
    }

    private void RecordProjectionHistory(Vector2 faceCenterUv)
    {
        long nowMs = System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        projectionHistoryTimesMs[projectionHistoryNext] = nowMs;
        projectionHistoryCenters[projectionHistoryNext] = faceCenterUv;
        projectionHistoryNext = (projectionHistoryNext + 1) % ProjectionHistoryCapacity;
        if (projectionHistoryCount < ProjectionHistoryCapacity)
        {
            projectionHistoryCount++;
        }
    }

    private RenderTexture foundationMaskTexture;
    private Material foundationMaskMaterial;
    private Material foundationMeshMaskMaterial;
    private Mesh foundationMeshMaskMesh;
    private Mesh foundationBaseSurfaceMesh;
    private Mesh foundationNeckMesh;
    private readonly List<Vector2> latestHullPoints = new List<Vector2>();

    /// <summary>
    /// Optional calibrated canonical-UV skin mask (from E3RegionMaskOverlay).
    /// When set and the face provides UVs, the projected mesh pass samples it
    /// so the screen-space prior carries the precise eye/lip/brow exclusions
    /// and hairline fade instead of the coarse local-weight ellipses.
    /// </summary>
    public Texture2D UvSkinMaskOverride;
    private FoundationMaskState currentState;
    private float lastValidMaskAt = -10.0f;
    private float nextDiagnosticsLogAt;
    private bool warnedMissingShader;

    private struct ProjectedRegion
    {
        public Vector2 Center;
        public Vector2 Radius;
        public int Count;
        public bool Valid => Count >= 4 && Radius.x > 0.001f && Radius.y > 0.001f;
        public Vector4 AsVector => new Vector4(Center.x, Center.y, Radius.x, Radius.y);
    }

    private struct RegionAccumulator
    {
        private Vector2 min;
        private Vector2 max;
        private Vector2 sum;
        private int count;

        public int Count => count;

        public void Add(Vector2 point)
        {
            if (count == 0)
            {
                min = point;
                max = point;
                sum = point;
                count = 1;
                return;
            }

            min = Vector2.Min(min, point);
            max = Vector2.Max(max, point);
            sum += point;
            count++;
        }

        public ProjectedRegion ToRegion(Vector2 minRadius, Vector2 padding, float scale)
        {
            if (count <= 0)
            {
                return default;
            }

            Vector2 center = sum / count;
            Vector2 halfSize = (max - min) * 0.5f * Mathf.Max(0.1f, scale) + padding;
            return new ProjectedRegion
            {
                Center = center,
                Radius = Vector2.Max(halfSize, minRadius),
                Count = count
            };
        }
    }

    private struct ProjectedFoundationRegions
    {
        public ProjectedRegion LeftCheek;
        public ProjectedRegion RightCheek;
        public ProjectedRegion Nose;
        public ProjectedRegion Chin;
        public ProjectedRegion LowerForehead;
        public ProjectedRegion LeftEye;
        public ProjectedRegion RightEye;
        public ProjectedRegion LeftBrow;
        public ProjectedRegion RightBrow;
        public ProjectedRegion Mouth;
        public Rect ScreenBounds;
        public float FaceYaw;
        public float LeftCheekWeight;
        public float RightCheekWeight;

        public bool HasPrimaryRegions =>
            LeftCheek.Valid
            && RightCheek.Valid
            && Nose.Valid
            && Chin.Valid;

        public bool EyeExclusionValid => LeftEye.Valid && RightEye.Valid;
        public bool BrowExclusionValid => LeftBrow.Valid && RightBrow.Valid;
        public bool LipExclusionValid => Mouth.Valid;
    }

    private struct MeshMaskStats
    {
        public bool Ready;
        public bool NeckExtensionReady;
        public int ProjectedVertexCount;
        public int ProjectedTriangleCount;
        public bool LeftCheekWeightValid;
        public bool RightCheekWeightValid;
        public bool NoseWeightValid;
        public bool ChinWeightValid;
        public bool LowerForeheadWeightValid;
        public bool EyeExclusionValid;
        public bool BrowExclusionValid;
        public bool LipExclusionValid;
        public bool ChinLowerClampApplied;
        public float AverageFinalMask;
        public float MaxFinalMask;
        public float MouthExclusionRadius;
        public float EyeExclusionRadius;
        public string FallbackReason;
        public float LeftCheekWeightMax;
        public float RightCheekWeightMax;
        public float NoseWeightMax;
        public float ChinWeightMax;
        public float LowerForeheadWeightMax;
        public float EyeExclusionMax;
        public float MouthExclusionMax;
        public Vector2 LeftCheekAnchor;
        public Vector2 RightCheekAnchor;
        public Vector2 NoseAnchor;
        public Vector2 ChinAnchor;
        public Vector2 LowerForeheadAnchor;
        public Vector2 MouthAnchor;
    }

    public Texture FoundationMaskTexture => foundationMaskTexture;
    public FoundationMaskState CurrentState => currentState;
    public bool HasValidMask => currentState.DynamicMaskValid && foundationMaskTexture != null;

    public FoundationMaskState UpdateMask(ARFace face, Camera arCamera, int debugMode)
    {
        SetSourceOrientationProbe(debugMode);
        displayProjectionRequested = debugMode >= 19 && debugMode <= 22;
        sensorYDownActive = debugMode == 19 || debugMode == 21;
        sensorXRightActive = debugMode == 19 || debugMode == 20;
        DisplayProjectionActive = displayProjectionRequested
            && hasDisplayTransform
            && hasSensorIntrinsics;
        if (displayProjectionRequested && !loggedDisplayProjectionState)
        {
            loggedDisplayProjectionState = true;
            Debug.Log(
                "[FoundationScreenSpace] display_projection_probe"
                + " hasDisplayMatrix=" + hasDisplayTransform.ToString().ToLowerInvariant()
                + " hasIntrinsics=" + hasSensorIntrinsics.ToString().ToLowerInvariant()
                + " sensorRes=" + sensorResolutionPx.x + "x" + sensorResolutionPx.y);
        }

        EnsureResources();
        bool tracked = face != null && face.trackingState == TrackingState.Tracking;
        if (!tracked
            || arCamera == null
            || foundationMaskMaterial == null
            || !TryCalculateFaceScreenBounds(face, arCamera, out Rect screenBounds))
        {
            return InvalidateMask(tracked, debugMode, "face_unavailable");
        }

        EnsureMaskTexture();
        bool meshMaskValid = TryRenderProjectedMeshMask(face, arCamera, screenBounds, debugMode, out MeshMaskStats meshStats);
        bool projectedValid = false;
        ProjectedFoundationRegions projectedRegions = default;
        float maskAverage;
        float maskMax;
        Vector4 centerSize = new Vector4(
            screenBounds.center.x,
            screenBounds.center.y,
            screenBounds.width,
            screenBounds.height);
        if (!meshMaskValid)
        {
            projectedValid = TryBuildProjectedRegions(face, arCamera, screenBounds, out projectedRegions);
            foundationMaskMaterial.SetVector("_FaceCenterSize", centerSize);
            foundationMaskMaterial.SetFloat("_MaskSourceMode", projectedValid ? 1.0f : 0.0f);
            foundationMaskMaterial.SetFloat("_MaskValid", 1.0f);
            foundationMaskMaterial.SetFloat("_DebugMode", debugMode);
            if (projectedValid)
            {
                ApplyProjectedRegionsToMaterial(projectedRegions);
            }

            Graphics.Blit(Texture2D.blackTexture, foundationMaskTexture, foundationMaskMaterial);
        }

        if (meshMaskValid)
        {
            maskAverage = meshStats.AverageFinalMask;
            maskMax = meshStats.MaxFinalMask;
        }
        else
        {
            EvaluateMaskDiagnostics(centerSize, projectedValid, projectedRegions, out maskAverage, out maskMax);
        }

        lastValidMaskAt = Time.realtimeSinceStartup;
        currentState = new FoundationMaskState
        {
            DynamicMaskValid = true,
            StaticFallbackUsed = !meshMaskValid && !projectedValid,
            FaceTracked = true,
            EyeExclusion = meshMaskValid ? meshStats.EyeExclusionValid : projectedValid ? projectedRegions.EyeExclusionValid : true,
            BrowExclusion = meshMaskValid ? meshStats.BrowExclusionValid : projectedValid ? projectedRegions.BrowExclusionValid : true,
            LipExclusion = meshMaskValid ? meshStats.LipExclusionValid : projectedValid ? projectedRegions.LipExclusionValid : true,
            MouthExclusion = meshMaskValid ? meshStats.LipExclusionValid : projectedValid ? projectedRegions.LipExclusionValid : true,
            MaskAverage = maskAverage,
            MaskMax = maskMax,
            DebugMode = debugMode,
            AgeMs = 0,
            ScreenBounds = screenBounds,
            Status = meshMaskValid ? "arface_manager_projected_mesh_ready" : projectedValid ? "bbox_fallback_mask_ready" : "bbox_fallback_mask_ready",
            MaskSource = meshMaskValid ? "arface_manager_projected_mesh" : "bbox_fallback",
            FaceYaw = meshMaskValid ? CalculateFaceYaw(face, arCamera) : projectedValid ? projectedRegions.FaceYaw : 0.0f,
            LeftCheekValid = meshMaskValid ? meshStats.LeftCheekWeightValid : projectedValid && projectedRegions.LeftCheek.Valid,
            RightCheekValid = meshMaskValid ? meshStats.RightCheekWeightValid : projectedValid && projectedRegions.RightCheek.Valid,
            NoseValid = meshMaskValid ? meshStats.NoseWeightValid : projectedValid && projectedRegions.Nose.Valid,
            ChinValid = meshMaskValid ? meshStats.ChinWeightValid : projectedValid && projectedRegions.Chin.Valid,
            LowerForeheadValid = meshMaskValid ? meshStats.LowerForeheadWeightValid : projectedValid && projectedRegions.LowerForehead.Valid,
            EyeExclusionValid = meshMaskValid ? meshStats.EyeExclusionValid : projectedValid && projectedRegions.EyeExclusionValid,
            BrowExclusionValid = meshMaskValid ? meshStats.BrowExclusionValid : projectedValid && projectedRegions.BrowExclusionValid,
            LipExclusionValid = meshMaskValid ? meshStats.LipExclusionValid : projectedValid && projectedRegions.LipExclusionValid,
            MouthExclusionRadius = meshMaskValid ? meshStats.MouthExclusionRadius : projectedValid ? projectedRegions.Mouth.Radius.magnitude : 0.0f,
            EyeExclusionRadius = meshMaskValid ? meshStats.EyeExclusionRadius : projectedValid
                ? Mathf.Max(projectedRegions.LeftEye.Radius.magnitude, projectedRegions.RightEye.Radius.magnitude)
                : 0.0f,
            FinalMaskLooksFilled = LooksFilled(maskAverage, maskMax),
            BaseFaceSurfaceMaskReady = meshMaskValid && meshStats.Ready,
            NeckExtensionReady = meshMaskValid && meshStats.NeckExtensionReady,
            ProjectedVertexCount = meshMaskValid ? meshStats.ProjectedVertexCount : 0,
            ProjectedTriangleCount = meshMaskValid ? meshStats.ProjectedTriangleCount : 0,
            LeftCheekWeightValid = meshMaskValid ? meshStats.LeftCheekWeightValid : projectedValid && projectedRegions.LeftCheek.Valid,
            RightCheekWeightValid = meshMaskValid ? meshStats.RightCheekWeightValid : projectedValid && projectedRegions.RightCheek.Valid,
            NoseWeightValid = meshMaskValid ? meshStats.NoseWeightValid : projectedValid && projectedRegions.Nose.Valid,
            ChinWeightValid = meshMaskValid ? meshStats.ChinWeightValid : projectedValid && projectedRegions.Chin.Valid,
            LowerForeheadWeightValid = meshMaskValid ? meshStats.LowerForeheadWeightValid : projectedValid && projectedRegions.LowerForehead.Valid,
            EyeExclusionMode = meshMaskValid ? "projected_polygon" : projectedValid ? "projected_ellipse" : "ellipse",
            MouthExclusionMode = meshMaskValid ? "projected_polygon" : projectedValid ? "projected_ellipse" : "ellipse",
            ChinLowerClampApplied = meshMaskValid && meshStats.ChinLowerClampApplied,
            RegionWeightReady = meshMaskValid
                ? meshStats.LeftCheekWeightValid
                    && meshStats.RightCheekWeightValid
                    && meshStats.NoseWeightValid
                    && meshStats.ChinWeightValid
                : projectedValid && projectedRegions.HasPrimaryRegions,
            ExclusionMaskReady = meshMaskValid
                ? meshStats.EyeExclusionValid && meshStats.LipExclusionValid
                : projectedValid && projectedRegions.EyeExclusionValid && projectedRegions.LipExclusionValid,
            LeftCheekWeightMax = meshMaskValid ? meshStats.LeftCheekWeightMax : projectedValid && projectedRegions.LeftCheek.Valid ? 1.0f : 0.0f,
            RightCheekWeightMax = meshMaskValid ? meshStats.RightCheekWeightMax : projectedValid && projectedRegions.RightCheek.Valid ? 1.0f : 0.0f,
            NoseWeightMax = meshMaskValid ? meshStats.NoseWeightMax : projectedValid && projectedRegions.Nose.Valid ? 1.0f : 0.0f,
            ChinWeightMax = meshMaskValid ? meshStats.ChinWeightMax : projectedValid && projectedRegions.Chin.Valid ? 1.0f : 0.0f,
            LowerForeheadWeightMax = meshMaskValid ? meshStats.LowerForeheadWeightMax : projectedValid && projectedRegions.LowerForehead.Valid ? 1.0f : 0.0f,
            EyeExclusionMax = meshMaskValid ? meshStats.EyeExclusionMax : projectedValid && projectedRegions.EyeExclusionValid ? 1.0f : 0.0f,
            MouthExclusionMax = meshMaskValid ? meshStats.MouthExclusionMax : projectedValid && projectedRegions.LipExclusionValid ? 1.0f : 0.0f,
            LeftCheekAnchor = meshMaskValid ? meshStats.LeftCheekAnchor : projectedRegions.LeftCheek.Center,
            RightCheekAnchor = meshMaskValid ? meshStats.RightCheekAnchor : projectedRegions.RightCheek.Center,
            NoseAnchor = meshMaskValid ? meshStats.NoseAnchor : projectedRegions.Nose.Center,
            ChinAnchor = meshMaskValid ? meshStats.ChinAnchor : projectedRegions.Chin.Center,
            LowerForeheadAnchor = meshMaskValid ? meshStats.LowerForeheadAnchor : projectedRegions.LowerForehead.Center,
            MouthAnchor = meshMaskValid ? meshStats.MouthAnchor : projectedRegions.Mouth.Center
        };
        MaybeLogDiagnostics(currentState);
        return currentState;
    }

    public FoundationMaskState InvalidateMask(bool faceTracked, int debugMode, string status)
    {
        long ageMs = lastValidMaskAt > 0.0f
            ? (long)((Time.realtimeSinceStartup - lastValidMaskAt) * 1000.0f)
            : 0L;
        bool keepLastMask = lastValidMaskAt > 0.0f
            && Time.realtimeSinceStartup - lastValidMaskAt < StaleMaskSeconds
            && foundationMaskTexture != null;
        if (!keepLastMask)
        {
            ClearMaskTexture();
        }

        // Tracking dropped: restart motion prediction from scratch so the
        // first frame after reacquisition cannot inherit a stale velocity.
        hasPreviousFaceCenterUv = false;

        currentState = new FoundationMaskState
        {
            DynamicMaskValid = keepLastMask,
            StaticFallbackUsed = !keepLastMask,
            FaceTracked = faceTracked,
            EyeExclusion = true,
            BrowExclusion = true,
            LipExclusion = true,
            MouthExclusion = true,
            MaskAverage = keepLastMask ? currentState.MaskAverage : 0.0f,
            MaskMax = keepLastMask ? currentState.MaskMax : 0.0f,
            DebugMode = debugMode,
            AgeMs = ageMs,
            ScreenBounds = keepLastMask ? currentState.ScreenBounds : Rect.zero,
            Status = keepLastMask ? "last_good_mask_held" : status,
            MaskSource = keepLastMask ? currentState.MaskSource : "none",
            FaceYaw = keepLastMask ? currentState.FaceYaw : 0.0f,
            LeftCheekValid = keepLastMask && currentState.LeftCheekValid,
            RightCheekValid = keepLastMask && currentState.RightCheekValid,
            NoseValid = keepLastMask && currentState.NoseValid,
            ChinValid = keepLastMask && currentState.ChinValid,
            LowerForeheadValid = keepLastMask && currentState.LowerForeheadValid,
            EyeExclusionValid = keepLastMask && currentState.EyeExclusionValid,
            BrowExclusionValid = keepLastMask && currentState.BrowExclusionValid,
            LipExclusionValid = keepLastMask && currentState.LipExclusionValid,
            MouthExclusionRadius = keepLastMask ? currentState.MouthExclusionRadius : 0.0f,
            EyeExclusionRadius = keepLastMask ? currentState.EyeExclusionRadius : 0.0f,
            FinalMaskLooksFilled = keepLastMask && currentState.FinalMaskLooksFilled,
            BaseFaceSurfaceMaskReady = keepLastMask && currentState.BaseFaceSurfaceMaskReady,
            NeckExtensionReady = keepLastMask && currentState.NeckExtensionReady,
            ProjectedVertexCount = keepLastMask ? currentState.ProjectedVertexCount : 0,
            ProjectedTriangleCount = keepLastMask ? currentState.ProjectedTriangleCount : 0,
            LeftCheekWeightValid = keepLastMask && currentState.LeftCheekWeightValid,
            RightCheekWeightValid = keepLastMask && currentState.RightCheekWeightValid,
            NoseWeightValid = keepLastMask && currentState.NoseWeightValid,
            ChinWeightValid = keepLastMask && currentState.ChinWeightValid,
            LowerForeheadWeightValid = keepLastMask && currentState.LowerForeheadWeightValid,
            EyeExclusionMode = keepLastMask ? currentState.EyeExclusionMode : "none",
            MouthExclusionMode = keepLastMask ? currentState.MouthExclusionMode : "none",
            ChinLowerClampApplied = keepLastMask && currentState.ChinLowerClampApplied,
            RegionWeightReady = keepLastMask && currentState.RegionWeightReady,
            ExclusionMaskReady = keepLastMask && currentState.ExclusionMaskReady,
            LeftCheekWeightMax = keepLastMask ? currentState.LeftCheekWeightMax : 0.0f,
            RightCheekWeightMax = keepLastMask ? currentState.RightCheekWeightMax : 0.0f,
            NoseWeightMax = keepLastMask ? currentState.NoseWeightMax : 0.0f,
            ChinWeightMax = keepLastMask ? currentState.ChinWeightMax : 0.0f,
            LowerForeheadWeightMax = keepLastMask ? currentState.LowerForeheadWeightMax : 0.0f,
            EyeExclusionMax = keepLastMask ? currentState.EyeExclusionMax : 0.0f,
            MouthExclusionMax = keepLastMask ? currentState.MouthExclusionMax : 0.0f,
            LeftCheekAnchor = keepLastMask ? currentState.LeftCheekAnchor : Vector2.zero,
            RightCheekAnchor = keepLastMask ? currentState.RightCheekAnchor : Vector2.zero,
            NoseAnchor = keepLastMask ? currentState.NoseAnchor : Vector2.zero,
            ChinAnchor = keepLastMask ? currentState.ChinAnchor : Vector2.zero,
            LowerForeheadAnchor = keepLastMask ? currentState.LowerForeheadAnchor : Vector2.zero,
            MouthAnchor = keepLastMask ? currentState.MouthAnchor : Vector2.zero
        };
        MaybeLogDiagnostics(currentState);
        return currentState;
    }

    private void EnsureResources()
    {
        if (foundationMaskMaterial != null)
        {
            return;
        }

        Shader shader = Resources.Load<Shader>("FoundationDynamicMask")
            ?? Shader.Find("Hidden/MakeupAR/FoundationDynamicMask");
        if (shader == null)
        {
            if (!warnedMissingShader)
            {
                warnedMissingShader = true;
                Debug.LogWarning("[FoundationMask] dynamic shader missing; static foundation fallback will be used");
            }

            return;
        }

        foundationMaskMaterial = new Material(shader)
        {
            name = "FoundationDynamicMaskRuntime"
        };

        Shader meshShader = Resources.Load<Shader>("FoundationMeshMask")
            ?? Shader.Find("Hidden/MakeupAR/FoundationMeshMask");
        if (meshShader != null)
        {
            foundationMeshMaskMaterial = new Material(meshShader)
            {
                name = "FoundationMeshMaskRuntime"
            };
        }
    }

    private void EnsureMaskTexture()
    {
        int width = MaskBaseWidth;
        int height = Mathf.Clamp(
            Mathf.RoundToInt(width * Mathf.Max(1.0f, Screen.height) / Mathf.Max(1.0f, Screen.width)),
            192,
            512);
        if (foundationMaskTexture != null
            && foundationMaskTexture.width == width
            && foundationMaskTexture.height == height)
        {
            return;
        }

        if (foundationMaskTexture != null)
        {
            foundationMaskTexture.Release();
            Destroy(foundationMaskTexture);
        }

        foundationMaskTexture = new RenderTexture(width, height, 0, RenderTextureFormat.ARGB32)
        {
            name = "FoundationDynamicMask",
            filterMode = FilterMode.Bilinear,
            wrapMode = TextureWrapMode.Clamp,
            useMipMap = false,
            autoGenerateMips = false
        };
        foundationMaskTexture.Create();
        ClearMaskTexture();
    }

    private void ClearMaskTexture()
    {
        if (foundationMaskTexture == null)
        {
            return;
        }

        RenderTexture previous = RenderTexture.active;
        RenderTexture.active = foundationMaskTexture;
        GL.Clear(false, true, Color.clear);
        RenderTexture.active = previous;
    }

    private static bool TryCalculateFaceScreenBounds(ARFace face, Camera arCamera, out Rect screenBounds)
    {
        screenBounds = Rect.zero;
        if (face == null
            || arCamera == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0)
        {
            return false;
        }

        NativeArray<Vector3> vertices = face.vertices;
        float minX = float.PositiveInfinity;
        float minY = float.PositiveInfinity;
        float maxX = float.NegativeInfinity;
        float maxY = float.NegativeInfinity;
        int visibleCount = 0;
        for (int i = 0; i < vertices.Length; i++)
        {
            Vector3 world = face.transform.TransformPoint(vertices[i]);
            Vector3 viewport = arCamera.WorldToViewportPoint(world);
            if (viewport.z <= arCamera.nearClipPlane)
            {
                continue;
            }

            minX = Mathf.Min(minX, viewport.x);
            minY = Mathf.Min(minY, viewport.y);
            maxX = Mathf.Max(maxX, viewport.x);
            maxY = Mathf.Max(maxY, viewport.y);
            visibleCount++;
        }

        if (visibleCount < 24 || maxX <= minX || maxY <= minY)
        {
            return false;
        }

        float width = maxX - minX;
        float height = maxY - minY;
        minX -= width * MaskBoundsExpansionX;
        maxX += width * MaskBoundsExpansionX;
        minY -= height * MaskBoundsExpansionY;
        maxY += height * MaskBoundsExpansionY;
        if (MirrorMaskUvX)
        {
            // Keep the bbox fallback path in the same coordinate convention as
            // the projected-mesh path (ToMaskUv), otherwise the two mask
            // sources would disagree on the horizontal axis.
            float mirroredMin = 1.0f - maxX;
            maxX = 1.0f - minX;
            minX = mirroredMin;
        }
        minX = Mathf.Clamp01(minX);
        maxX = Mathf.Clamp01(maxX);
        minY = Mathf.Clamp01(minY);
        maxY = Mathf.Clamp01(maxY);
        if (maxX <= minX || maxY <= minY)
        {
            return false;
        }

        screenBounds = Rect.MinMaxRect(minX, minY, maxX, maxY);
        return screenBounds.width > 0.05f && screenBounds.height > 0.08f;
    }

    private bool TryRenderProjectedMeshMask(
        ARFace face,
        Camera arCamera,
        Rect screenBounds,
        int debugMode,
        out MeshMaskStats stats)
    {
        stats = default;
        if (face == null
            || arCamera == null
            || foundationMaskTexture == null
            || foundationMeshMaskMaterial == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0
            || !face.indices.IsCreated
            || face.indices.Length < 3)
        {
            stats.FallbackReason = "mesh_inputs_unavailable";
            return false;
        }

        NativeArray<Vector3> vertices = face.vertices;
        NativeArray<int> indices = face.indices;
        Vector3 localMin = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        Vector3 localMax = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        for (int i = 0; i < vertices.Length; i++)
        {
            Vector3 local = vertices[i];
            localMin = Vector3.Min(localMin, local);
            localMax = Vector3.Max(localMax, local);
        }

        Vector3 localSpan = localMax - localMin;
        if (localSpan.x <= 0.0001f || localSpan.y <= 0.0001f)
        {
            stats.FallbackReason = "invalid_local_bounds";
            return false;
        }

        int[] sourceToMesh = new int[vertices.Length];
        for (int i = 0; i < sourceToMesh.Length; i++)
        {
            sourceToMesh[i] = -1;
        }

        bool faceUvsAvailable = face.uvs.IsCreated && face.uvs.Length >= vertices.Length;
        List<Vector3> meshVertices = new List<Vector3>(vertices.Length);
        List<Vector2> meshMaskData = new List<Vector2>(vertices.Length);
        List<Vector2> meshFaceUvs = new List<Vector2>(vertices.Length);

        // One-frame-ahead motion prediction (see MotionPredictionFrames)
        // plus the Vision-measured absolute bias correction.
        Vector2 predictionShift = Vector2.zero;
        Vector3 faceCenterViewport = arCamera.WorldToViewportPoint(face.transform.position);
        if (faceCenterViewport.z > arCamera.nearClipPlane)
        {
            Vector2 faceCenterUv = ToMaskUv(faceCenterViewport);
            RecordProjectionHistory(faceCenterUv);
            if (hasPreviousFaceCenterUv)
            {
                // EMA-smoothed velocity: with a 4x prediction factor, raw
                // per-frame deltas would amplify tracker noise into jitter.
                Vector2 rawVelocity = faceCenterUv - previousFaceCenterUv;
                smoothedFaceVelocityUv = Vector2.Lerp(smoothedFaceVelocityUv, rawVelocity, 0.5f);
                predictionShift = smoothedFaceVelocityUv * MotionPredictionFrames;
                predictionShift = Vector2.ClampMagnitude(predictionShift, MotionPredictionMaxUvShift);
            }
            else
            {
                smoothedFaceVelocityUv = Vector2.zero;
            }

            previousFaceCenterUv = faceCenterUv;
            hasPreviousFaceCenterUv = true;
        }
        else
        {
            hasPreviousFaceCenterUv = false;
            smoothedFaceVelocityUv = Vector2.zero;
        }

        if (hasVisionBias)
        {
            predictionShift += Vector2.ClampMagnitude(visionBiasUv, VisionBiasMaxUvShift);
        }
        int leftCheekWeighted = 0;
        int rightCheekWeighted = 0;
        int noseWeighted = 0;
        int chinWeighted = 0;
        int foreheadWeighted = 0;
        int eyeExcluded = 0;
        int browExcluded = 0;
        int mouthExcluded = 0;
        float finalTotal = 0.0f;
        float finalMax = 0.0f;
        float leftCheekMax = 0.0f;
        float rightCheekMax = 0.0f;
        float noseMax = 0.0f;
        float chinMax = 0.0f;
        float foreheadMax = 0.0f;
        float eyeMax = 0.0f;
        float mouthMax = 0.0f;
        float mouthRadiusEstimate = 0.0f;
        float eyeRadiusEstimate = 0.0f;
        RegionAccumulator leftCheekAnchor = default;
        RegionAccumulator rightCheekAnchor = default;
        RegionAccumulator noseAnchor = default;
        RegionAccumulator chinAnchor = default;
        RegionAccumulator foreheadAnchor = default;
        RegionAccumulator mouthAnchor = default;
        int dmProjectedCount = 0;
        int dmOobCount = 0;
        Vector2 dmSampleUv = Vector2.zero;
        for (int i = 0; i < vertices.Length; i++)
        {
            Vector3 local = vertices[i];
            Vector3 world = face.transform.TransformPoint(local);
            // Mode 19: orientation-proof projection through intrinsics +
            // inverse display matrix (already display-space, so ToMaskUv's
            // projection-space correction must NOT be applied on top).
            bool displayProjected = TryProjectDisplayViewport(arCamera, world, out Vector3 viewport);
            if (!displayProjected)
            {
                viewport = arCamera.WorldToViewportPoint(world);
            }

            if (viewport.z <= arCamera.nearClipPlane)
            {
                continue;
            }

            Vector2 uv = (displayProjected
                ? new Vector2(viewport.x, viewport.y)
                : ToMaskUv(viewport)) + predictionShift;
            if (displayProjected)
            {
                dmProjectedCount++;
                if (dmProjectedCount == 1)
                {
                    dmSampleUv = uv;
                }
            }

            if (uv.x < -0.08f || uv.x > 1.08f || uv.y < -0.08f || uv.y > 1.08f)
            {
                if (displayProjected)
                {
                    dmOobCount++;
                }

                continue;
            }

            float nx = Mathf.InverseLerp(localMin.x, localMax.x, local.x);
            float ny = Mathf.InverseLerp(localMin.y, localMax.y, local.y);
            EvaluateLocalFoundationWeights(
                nx,
                ny,
                out float rawSkin,
                out float exclusion,
                out float leftCheek,
                out float rightCheek,
                out float nose,
                out float chin,
                out float lowerForehead,
                out float eye,
                out float brow,
                out float mouth);
            float final = Mathf.Clamp01(rawSkin * (1.0f - exclusion));
            if (leftCheek > 0.18f) leftCheekWeighted++;
            if (rightCheek > 0.18f) rightCheekWeighted++;
            if (nose > 0.18f) noseWeighted++;
            if (chin > 0.16f) chinWeighted++;
            if (lowerForehead > 0.08f) foreheadWeighted++;
            if (eye > 0.18f) eyeExcluded++;
            if (brow > 0.18f) browExcluded++;
            if (mouth > 0.18f) mouthExcluded++;
            leftCheekMax = Mathf.Max(leftCheekMax, leftCheek);
            rightCheekMax = Mathf.Max(rightCheekMax, rightCheek);
            noseMax = Mathf.Max(noseMax, nose);
            chinMax = Mathf.Max(chinMax, chin);
            foreheadMax = Mathf.Max(foreheadMax, lowerForehead);
            eyeMax = Mathf.Max(eyeMax, eye);
            mouthMax = Mathf.Max(mouthMax, mouth);
            if (leftCheek > 0.28f) leftCheekAnchor.Add(uv);
            if (rightCheek > 0.28f) rightCheekAnchor.Add(uv);
            if (nose > 0.26f) noseAnchor.Add(uv);
            if (chin > 0.22f) chinAnchor.Add(uv);
            if (lowerForehead > 0.12f) foreheadAnchor.Add(uv);
            if (mouth > 0.28f) mouthAnchor.Add(uv);
            finalTotal += final;
            finalMax = Mathf.Max(finalMax, final);
            mouthRadiusEstimate = Mathf.Max(mouthRadiusEstimate, mouth * screenBounds.width);
            eyeRadiusEstimate = Mathf.Max(eyeRadiusEstimate, eye * screenBounds.width);

            sourceToMesh[i] = meshVertices.Count;
            meshVertices.Add(new Vector3(uv.x * 2.0f - 1.0f, uv.y * 2.0f - 1.0f, 0.0f));
            meshMaskData.Add(new Vector2(rawSkin, exclusion));
            meshFaceUvs.Add(faceUvsAvailable ? face.uvs[i] : Vector2.zero);
        }

        if (displayProjectionRequested)
        {
            dmFrameCounter++;
            if (dmFrameCounter % 60 == 1)
            {
                Debug.Log(
                    "[FoundationProjectionDM]"
                    + " active=" + DisplayProjectionActive.ToString().ToLowerInvariant()
                    + " yDown=" + sensorYDownActive.ToString().ToLowerInvariant()
                    + " xRight=" + sensorXRightActive.ToString().ToLowerInvariant()
                    + " hasIntrinsics=" + hasSensorIntrinsics.ToString().ToLowerInvariant()
                    + " sensorRes=" + sensorResolutionPx.x + "x" + sensorResolutionPx.y
                    + " fx=" + sensorFocalPx.x.ToString("0.#")
                    + " fy=" + sensorFocalPx.y.ToString("0.#")
                    + " cx=" + sensorPrincipalPx.x.ToString("0.#")
                    + " cy=" + sensorPrincipalPx.y.ToString("0.#")
                    + " projected=" + dmProjectedCount
                    + " oob=" + dmOobCount
                    + " oobRatio=" + (dmProjectedCount > 0 ? ((float)dmOobCount / dmProjectedCount).ToString("0.##") : "n/a")
                    + " sampleUv=" + dmSampleUv.x.ToString("0.###") + "," + dmSampleUv.y.ToString("0.###"));
            }
        }

        List<int> meshTriangles = new List<int>(indices.Length);
        for (int i = 0; i + 2 < indices.Length; i += 3)
        {
            int a = indices[i];
            int b = indices[i + 1];
            int c = indices[i + 2];
            if (a < 0 || b < 0 || c < 0 || a >= sourceToMesh.Length || b >= sourceToMesh.Length || c >= sourceToMesh.Length)
            {
                continue;
            }

            int mappedA = sourceToMesh[a];
            int mappedB = sourceToMesh[b];
            int mappedC = sourceToMesh[c];
            if (mappedA < 0 || mappedB < 0 || mappedC < 0)
            {
                continue;
            }

            meshTriangles.Add(mappedA);
            meshTriangles.Add(mappedB);
            meshTriangles.Add(mappedC);
        }

        int triangleCount = meshTriangles.Count / 3;
        if (meshVertices.Count < 64 || triangleCount < 96)
        {
            stats.FallbackReason = "projected_triangle_count_low";
            stats.ProjectedTriangleCount = triangleCount;
            return false;
        }

        if (foundationMeshMaskMesh == null)
        {
            foundationMeshMaskMesh = new Mesh
            {
                name = "Foundation Projected Mesh Mask"
            };
            foundationMeshMaskMesh.MarkDynamic();
        }

        foundationMeshMaskMesh.Clear();
        foundationMeshMaskMesh.SetVertices(meshVertices);
        foundationMeshMaskMesh.SetUVs(0, meshMaskData);
        foundationMeshMaskMesh.SetUVs(1, meshFaceUvs);
        foundationMeshMaskMesh.SetTriangles(meshTriangles, 0, true);
        foundationMeshMaskMesh.RecalculateBounds();

        bool uvSkinMaskUsable = UvSkinMaskOverride != null && faceUvsAvailable;
        foundationMeshMaskMaterial.SetFloat("_UvSkinMaskValid", uvSkinMaskUsable ? 1.0f : 0.0f);
        if (uvSkinMaskUsable)
        {
            foundationMeshMaskMaterial.SetTexture("_UvSkinMaskTex", UvSkinMaskOverride);
        }
        bool baseSurfaceHullReady = TryUpdateBaseSurfaceHull(meshVertices);
        bool neckExtensionReady = baseSurfaceHullReady && TryUpdateNeckExtensionMesh(face, arCamera);

        bool baseSurfaceReady = meshVertices.Count >= 64 && triangleCount >= 96;

        RenderTexture previous = RenderTexture.active;
        RenderTexture.active = foundationMaskTexture;
        GL.Clear(false, true, Color.clear);
        foundationMeshMaskMaterial.SetFloat("_TestBaseSurfaceOnly", debugMode == 1 ? 1.0f : 0.0f);
        if (foundationMeshMaskMaterial.SetPass(0))
        {
            // Draw the projected ARKit face mesh itself so the base surface
            // matches each person's exact face outline. The convex hull is NOT
            // used here anymore: it bulged into hair/background and produced
            // an egg-shaped blob instead of a face-shaped mask. The hull is
            // still computed above, but only to extract the jawline band that
            // anchors the neck extension strip.
            Graphics.DrawMeshNow(foundationMeshMaskMesh, Matrix4x4.identity);
        }

        if (foundationMeshMaskMaterial.SetPass(1))
        {
            Graphics.DrawMeshNow(foundationMeshMaskMesh, Matrix4x4.identity);
        }

        if (neckExtensionReady
            && foundationNeckMesh != null
            && foundationMeshMaskMaterial.passCount > NeckShaderPassIndex
            && foundationMeshMaskMaterial.SetPass(NeckShaderPassIndex))
        {
            Graphics.DrawMeshNow(foundationNeckMesh, Matrix4x4.identity);
        }

        RenderTexture.active = previous;

        float vertexCount = Mathf.Max(1, meshVertices.Count);
        stats = new MeshMaskStats
        {
            Ready = baseSurfaceReady,
            NeckExtensionReady = neckExtensionReady,
            ProjectedVertexCount = meshVertices.Count,
            ProjectedTriangleCount = triangleCount,
            LeftCheekWeightValid = leftCheekWeighted >= 6,
            RightCheekWeightValid = rightCheekWeighted >= 6,
            NoseWeightValid = noseWeighted >= 4,
            ChinWeightValid = chinWeighted >= 4,
            LowerForeheadWeightValid = foreheadWeighted >= 3,
            EyeExclusionValid = eyeExcluded >= 4,
            BrowExclusionValid = browExcluded >= 4,
            LipExclusionValid = mouthExcluded >= 4,
            ChinLowerClampApplied = true,
            AverageFinalMask = finalTotal / vertexCount,
            MaxFinalMask = finalMax,
            MouthExclusionRadius = mouthRadiusEstimate,
            EyeExclusionRadius = eyeRadiusEstimate,
            FallbackReason = "none",
            LeftCheekWeightMax = leftCheekMax,
            RightCheekWeightMax = rightCheekMax,
            NoseWeightMax = noseMax,
            ChinWeightMax = chinMax,
            LowerForeheadWeightMax = foreheadMax,
            EyeExclusionMax = eyeMax,
            MouthExclusionMax = mouthMax,
            LeftCheekAnchor = leftCheekAnchor.ToRegion(Vector2.one * 0.001f, Vector2.zero, 1.0f).Center,
            RightCheekAnchor = rightCheekAnchor.ToRegion(Vector2.one * 0.001f, Vector2.zero, 1.0f).Center,
            NoseAnchor = noseAnchor.ToRegion(Vector2.one * 0.001f, Vector2.zero, 1.0f).Center,
            ChinAnchor = chinAnchor.ToRegion(Vector2.one * 0.001f, Vector2.zero, 1.0f).Center,
            LowerForeheadAnchor = foreheadAnchor.ToRegion(Vector2.one * 0.001f, Vector2.zero, 1.0f).Center,
            MouthAnchor = mouthAnchor.ToRegion(Vector2.one * 0.001f, Vector2.zero, 1.0f).Center
        };
        return stats.LeftCheekWeightValid
            && stats.RightCheekWeightValid
            && stats.NoseWeightValid
            && stats.ChinWeightValid;
    }

    private bool TryUpdateBaseSurfaceHull(List<Vector3> projectedVertices)
    {
        if (projectedVertices == null || projectedVertices.Count < 3)
        {
            return false;
        }

        List<Vector2> points = new List<Vector2>(projectedVertices.Count);
        for (int i = 0; i < projectedVertices.Count; i++)
        {
            Vector3 point = projectedVertices[i];
            if (float.IsNaN(point.x)
                || float.IsNaN(point.y)
                || float.IsInfinity(point.x)
                || float.IsInfinity(point.y))
            {
                continue;
            }

            points.Add(new Vector2(point.x, point.y));
        }

        if (points.Count < 3)
        {
            return false;
        }

        points.Sort((a, b) =>
        {
            int compareX = a.x.CompareTo(b.x);
            return compareX != 0 ? compareX : a.y.CompareTo(b.y);
        });

        List<Vector2> unique = new List<Vector2>(points.Count);
        for (int i = 0; i < points.Count; i++)
        {
            if (unique.Count == 0 || (points[i] - unique[unique.Count - 1]).sqrMagnitude > 0.000001f)
            {
                unique.Add(points[i]);
            }
        }

        if (unique.Count < 3)
        {
            return false;
        }

        List<Vector2> hull = BuildConvexHull(unique);
        if (hull.Count < 3)
        {
            latestHullPoints.Clear();
            return false;
        }

        latestHullPoints.Clear();
        latestHullPoints.AddRange(hull);

        if (foundationBaseSurfaceMesh == null)
        {
            foundationBaseSurfaceMesh = new Mesh
            {
                name = "Foundation Projected Base Surface Hull"
            };
            foundationBaseSurfaceMesh.MarkDynamic();
        }

        Vector2 center = Vector2.zero;
        for (int i = 0; i < hull.Count; i++)
        {
            center += hull[i];
        }

        center /= hull.Count;

        List<Vector3> vertices = new List<Vector3>(hull.Count + 1)
        {
            new Vector3(center.x, center.y, 0.0f)
        };
        List<Vector2> uvs = new List<Vector2>(hull.Count + 1)
        {
            Vector2.zero
        };
        for (int i = 0; i < hull.Count; i++)
        {
            vertices.Add(new Vector3(hull[i].x, hull[i].y, 0.0f));
            uvs.Add(Vector2.zero);
        }

        List<int> triangles = new List<int>(hull.Count * 3);
        for (int i = 0; i < hull.Count; i++)
        {
            int current = i + 1;
            int next = i == hull.Count - 1 ? 1 : i + 2;
            triangles.Add(0);
            triangles.Add(current);
            triangles.Add(next);
        }

        foundationBaseSurfaceMesh.Clear();
        foundationBaseSurfaceMesh.SetVertices(vertices);
        foundationBaseSurfaceMesh.SetUVs(0, uvs);
        foundationBaseSurfaceMesh.SetTriangles(triangles, 0, true);
        foundationBaseSurfaceMesh.RecalculateBounds();
        return true;
    }

    private bool TryUpdateNeckExtensionMesh(ARFace face, Camera arCamera)
    {
        if (latestHullPoints.Count < NeckMinJawPoints)
        {
            return false;
        }

        // "Down" in mask clip space, following head roll/tilt so the strip stays
        // attached to the jaw when the user tilts their head.
        Vector2 down = CalculateFaceDownDirectionClip(face, arCamera);
        Vector2 perp = new Vector2(-down.y, down.x);

        float tMin = float.PositiveInfinity;
        float tMax = float.NegativeInfinity;
        for (int i = 0; i < latestHullPoints.Count; i++)
        {
            float t = Vector2.Dot(latestHullPoints[i], down);
            tMin = Mathf.Min(tMin, t);
            tMax = Mathf.Max(tMax, t);
        }

        float span = tMax - tMin;
        if (span < 0.02f)
        {
            return false;
        }

        float bandStart = tMax - span * NeckJawBandFraction;
        List<Vector2> jawPoints = new List<Vector2>(latestHullPoints.Count);
        for (int i = 0; i < latestHullPoints.Count; i++)
        {
            if (Vector2.Dot(latestHullPoints[i], down) >= bandStart)
            {
                jawPoints.Add(latestHullPoints[i]);
            }
        }

        if (jawPoints.Count < NeckMinJawPoints)
        {
            return false;
        }

        jawPoints.Sort((a, b) => Vector2.Dot(a, perp).CompareTo(Vector2.Dot(b, perp)));

        float lateralCenter = 0.0f;
        for (int i = 0; i < jawPoints.Count; i++)
        {
            lateralCenter += Vector2.Dot(jawPoints[i], perp);
        }

        lateralCenter /= jawPoints.Count;

        float bandWidth = Mathf.Abs(
            Vector2.Dot(jawPoints[jawPoints.Count - 1], perp) - Vector2.Dot(jawPoints[0], perp));
        if (bandWidth < 0.01f)
        {
            return false;
        }

        float neckLength = span * NeckLengthFactor;
        float edgeOffset = bandWidth * 0.08f;

        int columnCount = jawPoints.Count + 2;
        List<Vector3> vertices = new List<Vector3>(columnCount * 2);
        List<Vector2> weights = new List<Vector2>(columnCount * 2);
        AddNeckColumn(
            vertices,
            weights,
            jawPoints[0] - perp * edgeOffset,
            down,
            perp,
            lateralCenter,
            neckLength,
            0.0f);
        for (int i = 0; i < jawPoints.Count; i++)
        {
            AddNeckColumn(vertices, weights, jawPoints[i], down, perp, lateralCenter, neckLength, 1.0f);
        }

        AddNeckColumn(
            vertices,
            weights,
            jawPoints[jawPoints.Count - 1] + perp * edgeOffset,
            down,
            perp,
            lateralCenter,
            neckLength,
            0.0f);

        List<int> triangles = new List<int>((columnCount - 1) * 6);
        for (int c = 0; c + 1 < columnCount; c++)
        {
            int topA = c * 2;
            int bottomA = c * 2 + 1;
            int topB = (c + 1) * 2;
            int bottomB = (c + 1) * 2 + 1;
            triangles.Add(topA);
            triangles.Add(topB);
            triangles.Add(bottomA);
            triangles.Add(bottomA);
            triangles.Add(topB);
            triangles.Add(bottomB);
        }

        if (foundationNeckMesh == null)
        {
            foundationNeckMesh = new Mesh
            {
                name = "Foundation Neck Extension"
            };
            foundationNeckMesh.MarkDynamic();
        }

        foundationNeckMesh.Clear();
        foundationNeckMesh.SetVertices(vertices);
        foundationNeckMesh.SetUVs(0, weights);
        foundationNeckMesh.SetTriangles(triangles, 0, true);
        foundationNeckMesh.RecalculateBounds();
        return true;
    }

    private static void AddNeckColumn(
        List<Vector3> vertices,
        List<Vector2> weights,
        Vector2 top,
        Vector2 down,
        Vector2 perp,
        float lateralCenter,
        float neckLength,
        float topWeight)
    {
        float lateral = Vector2.Dot(top, perp);
        Vector2 bottom = top
            + down * neckLength
            + perp * ((lateralCenter - lateral) * (1.0f - NeckBottomWidthFactor));
        // Tuck the top slightly up into the face hull so there is no seam at the jaw.
        Vector2 tuckedTop = top - down * (neckLength * 0.06f);
        vertices.Add(new Vector3(tuckedTop.x, tuckedTop.y, 0.0f));
        weights.Add(new Vector2(topWeight, 0.0f));
        vertices.Add(new Vector3(bottom.x, bottom.y, 0.0f));
        weights.Add(new Vector2(0.0f, 0.0f));
    }

    private static Vector2 CalculateFaceDownDirectionClip(ARFace face, Camera arCamera)
    {
        if (face == null || arCamera == null)
        {
            return new Vector2(0.0f, -1.0f);
        }

        Vector3 origin = face.transform.position;
        Vector3 below = origin - face.transform.up * 0.08f;
        Vector3 viewportOrigin = arCamera.WorldToViewportPoint(origin);
        Vector3 viewportBelow = arCamera.WorldToViewportPoint(below);
        if (viewportOrigin.z <= arCamera.nearClipPlane || viewportBelow.z <= arCamera.nearClipPlane)
        {
            return new Vector2(0.0f, -1.0f);
        }

        Vector2 delta = ToMaskUv(viewportBelow) - ToMaskUv(viewportOrigin);
        if (delta.sqrMagnitude < 0.000001f)
        {
            return new Vector2(0.0f, -1.0f);
        }

        return delta.normalized;
    }

    private static List<Vector2> BuildConvexHull(List<Vector2> sortedPoints)
    {
        List<Vector2> lower = new List<Vector2>(sortedPoints.Count);
        for (int i = 0; i < sortedPoints.Count; i++)
        {
            Vector2 point = sortedPoints[i];
            while (lower.Count >= 2
                && Cross(lower[lower.Count - 1] - lower[lower.Count - 2], point - lower[lower.Count - 1]) <= 0.0f)
            {
                lower.RemoveAt(lower.Count - 1);
            }

            lower.Add(point);
        }

        List<Vector2> upper = new List<Vector2>(sortedPoints.Count);
        for (int i = sortedPoints.Count - 1; i >= 0; i--)
        {
            Vector2 point = sortedPoints[i];
            while (upper.Count >= 2
                && Cross(upper[upper.Count - 1] - upper[upper.Count - 2], point - upper[upper.Count - 1]) <= 0.0f)
            {
                upper.RemoveAt(upper.Count - 1);
            }

            upper.Add(point);
        }

        lower.RemoveAt(lower.Count - 1);
        upper.RemoveAt(upper.Count - 1);
        lower.AddRange(upper);
        return lower;
    }

    private static float Cross(Vector2 a, Vector2 b)
    {
        return a.x * b.y - a.y * b.x;
    }

    // Source-side orientation probe. Unlike the shader's read-side uv
    // rotations (which distort the mask aspect on a non-square screen), a
    // rotation applied HERE is per-vertex and therefore exact: on the
    // correct setting the mask matches the face in both shape and position.
    // 0 = identity (production), 17 = rotate 90 CW, 18 = rotate 90 CCW.
    // Driven by the foundation debug mode; production default stays 0 until
    // the on-device probe confirms which orientation is correct.
    private static int sourceOrientationProbe;

    public static void SetSourceOrientationProbe(int debugMode)
    {
        sourceOrientationProbe = debugMode == 17 || debugMode == 18 ? debugMode : 0;
    }

    private static Vector2 ToMaskUv(Vector3 viewport)
    {
        // Camera.WorldToViewportPoint returns the on-screen position of the
        // tracked face in the camera's PROJECTION space. Device evidence
        // (2026-07-04): the mask aligns with the face when the phone is held
        // landscape, i.e. the projection space is rotated 90 degrees from
        // the displayed portrait feed, so a quarter-turn correction belongs
        // here at the source (exact, per-vertex).
        float x = MirrorMaskUvX ? 1.0f - viewport.x : viewport.x;
        Vector2 uv = new Vector2(x, viewport.y);
        if (sourceOrientationProbe == 17)
        {
            // Rotate mask content 90 degrees clockwise about uv center.
            return new Vector2(uv.y, 1.0f - uv.x);
        }

        if (sourceOrientationProbe == 18)
        {
            // Rotate mask content 90 degrees counter-clockwise.
            return new Vector2(1.0f - uv.y, uv.x);
        }

        return uv;
    }

    private static bool TryBuildProjectedRegions(
        ARFace face,
        Camera arCamera,
        Rect screenBounds,
        out ProjectedFoundationRegions regions)
    {
        regions = default;
        if (face == null
            || arCamera == null
            || !face.vertices.IsCreated
            || face.vertices.Length == 0)
        {
            return false;
        }

        NativeArray<Vector3> vertices = face.vertices;
        Vector3 localMin = new Vector3(float.PositiveInfinity, float.PositiveInfinity, float.PositiveInfinity);
        Vector3 localMax = new Vector3(float.NegativeInfinity, float.NegativeInfinity, float.NegativeInfinity);
        for (int i = 0; i < vertices.Length; i++)
        {
            Vector3 local = vertices[i];
            localMin = Vector3.Min(localMin, local);
            localMax = Vector3.Max(localMax, local);
        }

        Vector3 localSpan = localMax - localMin;
        if (localSpan.x <= 0.0001f || localSpan.y <= 0.0001f)
        {
            return false;
        }

        RegionAccumulator leftCheek = default;
        RegionAccumulator rightCheek = default;
        RegionAccumulator nose = default;
        RegionAccumulator chin = default;
        RegionAccumulator lowerForehead = default;
        RegionAccumulator leftEye = default;
        RegionAccumulator rightEye = default;
        RegionAccumulator leftBrow = default;
        RegionAccumulator rightBrow = default;
        RegionAccumulator mouth = default;

        int projectedCount = 0;
        for (int i = 0; i < vertices.Length; i++)
        {
            Vector3 local = vertices[i];
            Vector3 world = face.transform.TransformPoint(local);
            Vector3 viewport = arCamera.WorldToViewportPoint(world);
            if (viewport.z <= arCamera.nearClipPlane)
            {
                continue;
            }

            Vector2 uv = ToMaskUv(viewport);
            if (uv.x < -0.10f || uv.x > 1.10f || uv.y < -0.10f || uv.y > 1.10f)
            {
                continue;
            }

            float nx = Mathf.InverseLerp(localMin.x, localMax.x, local.x);
            float ny = Mathf.InverseLerp(localMin.y, localMax.y, local.y);
            projectedCount++;

            if (IsLocalRegion(nx, ny, 0.10f, 0.43f, 0.34f, 0.63f))
            {
                leftCheek.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.57f, 0.90f, 0.34f, 0.63f))
            {
                rightCheek.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.39f, 0.61f, 0.38f, 0.70f))
            {
                nose.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.34f, 0.66f, 0.05f, 0.30f))
            {
                chin.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.34f, 0.66f, 0.72f, 0.88f))
            {
                lowerForehead.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.20f, 0.48f, 0.58f, 0.75f))
            {
                leftEye.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.52f, 0.80f, 0.58f, 0.75f))
            {
                rightEye.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.18f, 0.48f, 0.70f, 0.86f))
            {
                leftBrow.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.52f, 0.82f, 0.70f, 0.86f))
            {
                rightBrow.Add(uv);
            }

            if (IsLocalRegion(nx, ny, 0.28f, 0.72f, 0.25f, 0.45f))
            {
                mouth.Add(uv);
            }
        }

        if (projectedCount < 64)
        {
            return false;
        }

        float faceWidth = Mathf.Max(0.05f, screenBounds.width);
        float faceHeight = Mathf.Max(0.08f, screenBounds.height);
        float yaw = CalculateFaceYaw(face, arCamera);
        float yaw01 = Mathf.Clamp(yaw / 35.0f, -1.0f, 1.0f);
        float leftWeight = Mathf.Clamp(1.0f - yaw01 * 0.12f, 0.82f, 1.12f);
        float rightWeight = Mathf.Clamp(1.0f + yaw01 * 0.12f, 0.82f, 1.12f);

        regions = new ProjectedFoundationRegions
        {
            ScreenBounds = screenBounds,
            FaceYaw = yaw,
            LeftCheekWeight = leftWeight,
            RightCheekWeight = rightWeight,
            LeftCheek = leftCheek.ToRegion(
                new Vector2(faceWidth * 0.110f, faceHeight * 0.092f),
                new Vector2(faceWidth * 0.028f, faceHeight * 0.030f),
                1.42f),
            RightCheek = rightCheek.ToRegion(
                new Vector2(faceWidth * 0.110f, faceHeight * 0.092f),
                new Vector2(faceWidth * 0.028f, faceHeight * 0.030f),
                1.42f),
            Nose = nose.ToRegion(
                new Vector2(faceWidth * 0.060f, faceHeight * 0.120f),
                new Vector2(faceWidth * 0.018f, faceHeight * 0.030f),
                1.32f),
            Chin = chin.ToRegion(
                new Vector2(faceWidth * 0.120f, faceHeight * 0.070f),
                new Vector2(faceWidth * 0.025f, faceHeight * 0.022f),
                1.24f),
            LowerForehead = lowerForehead.ToRegion(
                new Vector2(faceWidth * 0.115f, faceHeight * 0.040f),
                new Vector2(faceWidth * 0.020f, faceHeight * 0.014f),
                1.06f),
            LeftEye = leftEye.ToRegion(
                new Vector2(faceWidth * 0.098f, faceHeight * 0.050f),
                new Vector2(faceWidth * 0.022f, faceHeight * 0.016f),
                1.22f),
            RightEye = rightEye.ToRegion(
                new Vector2(faceWidth * 0.098f, faceHeight * 0.050f),
                new Vector2(faceWidth * 0.022f, faceHeight * 0.016f),
                1.22f),
            LeftBrow = leftBrow.ToRegion(
                new Vector2(faceWidth * 0.098f, faceHeight * 0.028f),
                new Vector2(faceWidth * 0.024f, faceHeight * 0.010f),
                1.14f),
            RightBrow = rightBrow.ToRegion(
                new Vector2(faceWidth * 0.098f, faceHeight * 0.028f),
                new Vector2(faceWidth * 0.024f, faceHeight * 0.010f),
                1.14f),
            Mouth = mouth.ToRegion(
                new Vector2(faceWidth * 0.122f, faceHeight * 0.040f),
                new Vector2(faceWidth * 0.026f, faceHeight * 0.012f),
                1.08f)
        };
        return regions.HasPrimaryRegions;
    }

    private static bool IsLocalRegion(float x, float y, float minX, float maxX, float minY, float maxY)
    {
        return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    private static void EvaluateLocalFoundationWeights(
        float nx,
        float ny,
        out float rawSkin,
        out float exclusion,
        out float leftCheek,
        out float rightCheek,
        out float nose,
        out float chin,
        out float lowerForehead,
        out float eye,
        out float brow,
        out float mouth)
    {
        leftCheek = LocalEllipse(nx, ny, 0.31f, 0.49f, 0.205f, 0.185f, 0.48f);
        rightCheek = LocalEllipse(nx, ny, 0.69f, 0.49f, 0.205f, 0.185f, 0.48f);
        nose = LocalEllipse(nx, ny, 0.50f, 0.55f, 0.115f, 0.210f, 0.42f);
        float centerCheek = LocalEllipse(nx, ny, 0.50f, 0.47f, 0.300f, 0.130f, 0.48f) * 0.48f;
        chin = LocalEllipse(nx, ny, 0.50f, 0.235f, 0.250f, 0.130f, 0.42f) * 0.68f;
        lowerForehead = LocalEllipse(nx, ny, 0.50f, 0.765f, 0.230f, 0.058f, 0.32f) * 0.30f;

        float outerX = SmoothStep01(0.055f, 0.150f, nx) * (1.0f - SmoothStep01(0.850f, 0.945f, nx));
        float chinLowerClamp = Mathf.Lerp(0.05f, 1.0f, SmoothStep01(0.105f, 0.205f, ny));
        float upperForeheadClamp = Mathf.Lerp(1.0f, 0.08f, SmoothStep01(0.820f, 0.935f, ny));
        rawSkin = Mathf.Clamp01(
            Mathf.Max(
                Mathf.Max(leftCheek, rightCheek),
                Mathf.Max(Mathf.Max(nose, centerCheek), Mathf.Max(chin, lowerForehead)))
            * outerX
            * chinLowerClamp
            * upperForeheadClamp);

        // Tightened to the eye OPENING (device feedback 2026-07-05): the
        // vertex-level exclusion unions with the calibrated UV-mask zones,
        // so both must hug the opening or the wider one wins and the skin
        // at the eye corners stays unpainted.
        float leftEye = LocalEllipse(nx, ny, 0.355f, 0.640f, 0.072f, 0.036f, 0.10f);
        float rightEye = LocalEllipse(nx, ny, 0.645f, 0.640f, 0.072f, 0.036f, 0.10f);
        eye = Mathf.Max(leftEye, rightEye);
        float leftBrow = LocalEllipse(nx, ny, 0.355f, 0.733f, 0.118f, 0.030f, 0.16f);
        float rightBrow = LocalEllipse(nx, ny, 0.645f, 0.733f, 0.118f, 0.030f, 0.16f);
        brow = Mathf.Max(leftBrow, rightBrow);
        mouth = Mathf.Max(
            LocalEllipse(nx, ny, 0.500f, 0.370f, 0.150f, 0.044f, 0.20f),
            LocalEllipse(nx, ny, 0.500f, 0.405f, 0.125f, 0.030f, 0.16f) * 0.65f);
        exclusion = Mathf.Clamp01(Mathf.Max(eye, Mathf.Max(brow, mouth)));
    }

    private static float LocalEllipse(float x, float y, float centerX, float centerY, float radiusX, float radiusY, float feather)
    {
        Vector2 uv = new Vector2(x, y);
        return FaceEllipse(uv, new Vector2(centerX, centerY), new Vector2(radiusX, radiusY), feather);
    }

    private static float CalculateFaceYaw(ARFace face, Camera arCamera)
    {
        if (face == null || arCamera == null)
        {
            return 0.0f;
        }

        Vector3 faceForwardInCamera = arCamera.transform.InverseTransformDirection(face.transform.forward);
        return Mathf.Atan2(faceForwardInCamera.x, Mathf.Max(0.001f, Mathf.Abs(faceForwardInCamera.z))) * Mathf.Rad2Deg;
    }

    private void ApplyProjectedRegionsToMaterial(ProjectedFoundationRegions regions)
    {
        foundationMaskMaterial.SetVector("_FoundationLeftCheek", regions.LeftCheek.AsVector);
        foundationMaskMaterial.SetVector("_FoundationRightCheek", regions.RightCheek.AsVector);
        foundationMaskMaterial.SetVector("_FoundationNose", regions.Nose.AsVector);
        foundationMaskMaterial.SetVector("_FoundationChin", regions.Chin.AsVector);
        foundationMaskMaterial.SetVector("_FoundationLowerForehead", regions.LowerForehead.AsVector);
        foundationMaskMaterial.SetVector("_FoundationLeftEye", regions.LeftEye.AsVector);
        foundationMaskMaterial.SetVector("_FoundationRightEye", regions.RightEye.AsVector);
        foundationMaskMaterial.SetVector("_FoundationLeftBrow", regions.LeftBrow.AsVector);
        foundationMaskMaterial.SetVector("_FoundationRightBrow", regions.RightBrow.AsVector);
        foundationMaskMaterial.SetVector("_FoundationMouth", regions.Mouth.AsVector);
        foundationMaskMaterial.SetVector(
            "_FoundationRegionValid",
            new Vector4(
                regions.LeftCheek.Valid ? 1.0f : 0.0f,
                regions.RightCheek.Valid ? 1.0f : 0.0f,
                regions.Nose.Valid ? 1.0f : 0.0f,
                regions.Chin.Valid ? 1.0f : 0.0f));
        foundationMaskMaterial.SetVector(
            "_FoundationRegionValid2",
            new Vector4(regions.LowerForehead.Valid ? 1.0f : 0.0f, 0.0f, 0.0f, 0.0f));
        foundationMaskMaterial.SetVector(
            "_FoundationExclusionValid",
            new Vector4(
                regions.LeftEye.Valid ? 1.0f : 0.0f,
                regions.RightEye.Valid ? 1.0f : 0.0f,
                regions.LeftBrow.Valid ? 1.0f : 0.0f,
                regions.RightBrow.Valid ? 1.0f : 0.0f));
        foundationMaskMaterial.SetFloat("_FoundationMouthValid", regions.Mouth.Valid ? 1.0f : 0.0f);
        foundationMaskMaterial.SetVector(
            "_FoundationRegionWeights",
            new Vector4(regions.LeftCheekWeight, regions.RightCheekWeight, 1.0f, 0.82f));
        foundationMaskMaterial.SetFloat("_FoundationForeheadWeight", 0.34f);
        foundationMaskMaterial.SetFloat("_FaceYaw", regions.FaceYaw);
    }

    private static void EvaluateMaskDiagnostics(
        Vector4 centerSize,
        bool projectedValid,
        ProjectedFoundationRegions regions,
        out float average,
        out float max)
    {
        float total = 0.0f;
        max = 0.0f;
        int count = 0;
        for (int y = 0; y < DiagnosticsSampleGrid; y++)
        {
            for (int x = 0; x < DiagnosticsSampleGrid; x++)
            {
                Vector2 screenUv = new Vector2(
                    (x + 0.5f) / DiagnosticsSampleGrid,
                    (y + 0.5f) / DiagnosticsSampleGrid);
                float sample = projectedValid
                    ? EvaluateProjectedFoundationMask(screenUv, regions)
                    : EvaluateFoundationMask(screenUv, centerSize);
                total += sample;
                max = Mathf.Max(max, sample);
                count++;
            }
        }

        average = count > 0 ? total / count : 0.0f;
    }

    private static float EvaluateFoundationMask(Vector2 screenUv, Vector4 centerSize)
    {
        Vector2 min = new Vector2(centerSize.x - centerSize.z * 0.5f, centerSize.y - centerSize.w * 0.5f);
        Vector2 faceUv = new Vector2(
            Mathf.Clamp01((screenUv.x - min.x) / Mathf.Max(centerSize.z, 0.0001f)),
            Mathf.Clamp01((screenUv.y - min.y) / Mathf.Max(centerSize.w, 0.0001f)));
        float faceCore = FaceEllipse(faceUv, new Vector2(0.5f, 0.50f), new Vector2(0.49f, 0.54f), 0.34f);
        float cheekLeft = FaceEllipse(faceUv, new Vector2(0.34f, 0.50f), new Vector2(0.18f, 0.18f), 0.70f);
        float cheekRight = FaceEllipse(faceUv, new Vector2(0.66f, 0.50f), new Vector2(0.18f, 0.18f), 0.70f);
        float nose = FaceEllipse(faceUv, new Vector2(0.50f, 0.56f), new Vector2(0.13f, 0.20f), 0.60f);
        float chin = FaceEllipse(faceUv, new Vector2(0.50f, 0.31f), new Vector2(0.24f, 0.15f), 0.70f);
        float forehead = FaceEllipse(faceUv, new Vector2(0.50f, 0.80f), new Vector2(0.23f, 0.08f), 0.54f) * 0.38f;
        float skin = Mathf.Clamp01(Mathf.Max(Mathf.Max(cheekLeft, cheekRight), Mathf.Max(Mathf.Max(nose, chin), forehead)));
        float exclusion = Mathf.Max(
            EyeBrowExclusion(faceUv),
            MouthExclusion(faceUv));
        float edge = 1.0f - SmoothStep01(
            0.60f,
            1.02f,
            FaceEllipseDistance(faceUv, new Vector2(0.5f, 0.50f), new Vector2(0.49f, 0.54f)));
        float hairline = Mathf.Lerp(1.0f, 0.08f, SmoothStep01(0.78f, 0.95f, faceUv.y));
        return Mathf.Clamp01(faceCore * skin * (1.0f - exclusion) * edge * hairline);
    }

    private static float EvaluateProjectedFoundationMask(Vector2 screenUv, ProjectedFoundationRegions regions)
    {
        float raw = Mathf.Clamp01(Mathf.Max(
            Mathf.Max(
                RegionMask(screenUv, regions.LeftCheek) * regions.LeftCheekWeight,
                RegionMask(screenUv, regions.RightCheek) * regions.RightCheekWeight),
            Mathf.Max(
                Mathf.Max(RegionMask(screenUv, regions.Nose), RegionMask(screenUv, regions.Chin) * 0.82f),
                RegionMask(screenUv, regions.LowerForehead) * 0.34f)));
        float exclusion = Mathf.Clamp01(Mathf.Max(
            Mathf.Max(RegionMask(screenUv, regions.LeftEye), RegionMask(screenUv, regions.RightEye)),
            Mathf.Max(
                Mathf.Max(RegionMask(screenUv, regions.LeftBrow), RegionMask(screenUv, regions.RightBrow)),
                RegionMask(screenUv, regions.Mouth))));
        float faceFalloff = FaceEllipse(
            new Vector2(
                Mathf.Clamp01((screenUv.x - regions.ScreenBounds.xMin) / Mathf.Max(regions.ScreenBounds.width, 0.0001f)),
                Mathf.Clamp01((screenUv.y - regions.ScreenBounds.yMin) / Mathf.Max(regions.ScreenBounds.height, 0.0001f))),
            new Vector2(0.5f, 0.50f),
            new Vector2(0.50f, 0.54f),
            0.34f);
        return Mathf.Clamp01(raw * (1.0f - exclusion) * faceFalloff);
    }

    private static float RegionMask(Vector2 screenUv, ProjectedRegion region)
    {
        if (!region.Valid)
        {
            return 0.0f;
        }

        return FaceEllipse(screenUv, region.Center, region.Radius, 0.72f);
    }

    private static bool LooksFilled(float average, float max)
    {
        if (max < 0.35f)
        {
            return false;
        }

        return average / Mathf.Max(max, 0.0001f) > 0.018f;
    }

    private static float FaceEllipse(Vector2 uv, Vector2 center, Vector2 radius, float feather)
    {
        float dist = FaceEllipseDistance(uv, center, radius);
        return 1.0f - SmoothStep01(1.0f, 1.0f + Mathf.Max(0.001f, feather), dist);
    }

    private static float SmoothStep01(float edge0, float edge1, float value)
    {
        float denominator = Mathf.Max(0.0001f, edge1 - edge0);
        float t = Mathf.Clamp01((value - edge0) / denominator);
        return t * t * (3.0f - 2.0f * t);
    }

    private static float FaceEllipseDistance(Vector2 uv, Vector2 center, Vector2 radius)
    {
        Vector2 local = new Vector2(
            (uv.x - center.x) / Mathf.Max(radius.x, 0.0001f),
            (uv.y - center.y) / Mathf.Max(radius.y, 0.0001f));
        return Vector2.Dot(local, local);
    }

    private static float EyeBrowExclusion(Vector2 uv)
    {
        float leftEye = FaceEllipse(uv, new Vector2(0.355f, 0.665f), new Vector2(0.230f, 0.125f), 0.48f);
        float rightEye = FaceEllipse(uv, new Vector2(0.645f, 0.665f), new Vector2(0.230f, 0.125f), 0.48f);
        float bridge = FaceEllipse(uv, new Vector2(0.500f, 0.670f), new Vector2(0.080f, 0.056f), 0.35f) * 0.70f;
        float leftBrow = FaceEllipse(uv, new Vector2(0.355f, 0.755f), new Vector2(0.195f, 0.070f), 0.48f);
        float rightBrow = FaceEllipse(uv, new Vector2(0.645f, 0.755f), new Vector2(0.195f, 0.070f), 0.48f);
        return Mathf.Clamp01(Mathf.Max(Mathf.Max(leftEye, rightEye), Mathf.Max(Mathf.Max(leftBrow, rightBrow), bridge)));
    }

    private static float MouthExclusion(Vector2 uv)
    {
        float lip = FaceEllipse(uv, new Vector2(0.500f, 0.410f), new Vector2(0.280f, 0.108f), 0.62f);
        float mouthPocket = FaceEllipse(uv, new Vector2(0.500f, 0.438f), new Vector2(0.245f, 0.085f), 0.54f);
        float philtrum = FaceEllipse(uv, new Vector2(0.500f, 0.493f), new Vector2(0.220f, 0.052f), 0.44f) * 0.35f;
        return Mathf.Clamp01(Mathf.Max(Mathf.Max(lip, mouthPocket), philtrum));
    }

    private void MaybeLogDiagnostics(FoundationMaskState state)
    {
        if (Time.unscaledTime < nextDiagnosticsLogAt)
        {
            return;
        }

        nextDiagnosticsLogAt = Time.unscaledTime + DiagnosticsIntervalSeconds;
        Debug.Log(
            "[FoundationMask]"
            + " dynamicMaskValid=" + state.DynamicMaskValid.ToString().ToLowerInvariant()
            + " staticFallbackUsed=" + state.StaticFallbackUsed.ToString().ToLowerInvariant()
            + " faceTracked=" + state.FaceTracked.ToString().ToLowerInvariant()
            + " eyeExclusion=" + state.EyeExclusion.ToString().ToLowerInvariant()
            + " browExclusion=" + state.BrowExclusion.ToString().ToLowerInvariant()
            + " lipExclusion=" + state.LipExclusion.ToString().ToLowerInvariant()
            + " mouthExclusion=" + state.MouthExclusion.ToString().ToLowerInvariant()
            + " maskAverage=" + state.MaskAverage.ToString("0.###", CultureInfo.InvariantCulture)
            + " maskMax=" + state.MaskMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " debugMode=" + state.DebugMode.ToString(CultureInfo.InvariantCulture)
            + " ageMs=" + state.AgeMs.ToString(CultureInfo.InvariantCulture)
            + " bounds=" + FormatRect(state.ScreenBounds)
            + " maskSource=" + (state.MaskSource ?? "none")
            + " noseAnchorUv=" + state.NoseAnchor.x.ToString("0.###", CultureInfo.InvariantCulture)
            + ":"
            + state.NoseAnchor.y.ToString("0.###", CultureInfo.InvariantCulture)
            + " faceYaw=" + state.FaceYaw.ToString("0.#", CultureInfo.InvariantCulture)
            + " leftCheekValid=" + state.LeftCheekValid.ToString().ToLowerInvariant()
            + " rightCheekValid=" + state.RightCheekValid.ToString().ToLowerInvariant()
            + " noseValid=" + state.NoseValid.ToString().ToLowerInvariant()
            + " chinValid=" + state.ChinValid.ToString().ToLowerInvariant()
            + " lowerForeheadValid=" + state.LowerForeheadValid.ToString().ToLowerInvariant()
            + " eyeExclusionValid=" + state.EyeExclusionValid.ToString().ToLowerInvariant()
            + " browExclusionValid=" + state.BrowExclusionValid.ToString().ToLowerInvariant()
            + " lipExclusionValid=" + state.LipExclusionValid.ToString().ToLowerInvariant()
            + " mouthExclusionRadius=" + state.MouthExclusionRadius.ToString("0.###", CultureInfo.InvariantCulture)
            + " eyeExclusionRadius=" + state.EyeExclusionRadius.ToString("0.###", CultureInfo.InvariantCulture)
            + " finalMaskLooksFilled=" + state.FinalMaskLooksFilled.ToString().ToLowerInvariant()
            + " baseFaceSurfaceMaskReady=" + state.BaseFaceSurfaceMaskReady.ToString().ToLowerInvariant()
            + " neckExtensionReady=" + state.NeckExtensionReady.ToString().ToLowerInvariant()
            + " projectedVertexCount=" + state.ProjectedVertexCount.ToString(CultureInfo.InvariantCulture)
            + " projectedTriangleCount=" + state.ProjectedTriangleCount.ToString(CultureInfo.InvariantCulture)
            + " leftCheekWeightValid=" + state.LeftCheekWeightValid.ToString().ToLowerInvariant()
            + " rightCheekWeightValid=" + state.RightCheekWeightValid.ToString().ToLowerInvariant()
            + " noseWeightValid=" + state.NoseWeightValid.ToString().ToLowerInvariant()
            + " chinWeightValid=" + state.ChinWeightValid.ToString().ToLowerInvariant()
            + " lowerForeheadWeightValid=" + state.LowerForeheadWeightValid.ToString().ToLowerInvariant()
            + " eyeExclusionMode=" + (state.EyeExclusionMode ?? "none")
            + " mouthExclusionMode=" + (state.MouthExclusionMode ?? "none")
            + " chinLowerClampApplied=" + state.ChinLowerClampApplied.ToString().ToLowerInvariant()
            + " regionWeightReady=" + state.RegionWeightReady.ToString().ToLowerInvariant()
            + " exclusionMaskReady=" + state.ExclusionMaskReady.ToString().ToLowerInvariant()
            + " finalMaskFormula=base*region*(1-exclusion)"
            + " leftCheekWeightRange=0-" + state.LeftCheekWeightMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " rightCheekWeightRange=0-" + state.RightCheekWeightMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " noseWeightRange=0-" + state.NoseWeightMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " chinWeightRange=0-" + state.ChinWeightMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " lowerForeheadWeightRange=0-" + state.LowerForeheadWeightMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " eyeExclusionMax=" + state.EyeExclusionMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " mouthExclusionMax=" + state.MouthExclusionMax.ToString("0.###", CultureInfo.InvariantCulture)
            + " fallbackReason=" + (state.StaticFallbackUsed ? state.Status : "none")
            + " status=" + state.Status);
    }

    private static string FormatRect(Rect rect)
    {
        return rect.xMin.ToString("0.###", CultureInfo.InvariantCulture)
            + ":"
            + rect.yMin.ToString("0.###", CultureInfo.InvariantCulture)
            + ":"
            + rect.width.ToString("0.###", CultureInfo.InvariantCulture)
            + ":"
            + rect.height.ToString("0.###", CultureInfo.InvariantCulture);
    }
}
