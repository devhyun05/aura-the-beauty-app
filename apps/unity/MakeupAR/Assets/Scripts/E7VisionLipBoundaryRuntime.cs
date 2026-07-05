using System;
using System.Collections;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public sealed class E7VisionLipBoundaryRuntime : MonoBehaviour
{
    public struct BoundarySnapshot
    {
        public bool Available;
        public string Status;
        public string Detail;
        public string Source;
        public string CoordinateMode;
        public int ImageWidth;
        public int ImageHeight;
        public int FaceCount;
        public int OuterPointCount;
        public int InnerPointCount;
        public float LipConfidence;
        public bool LipBoundsAvailable;
        public Rect LipBounds;
        public int Sequence;
        public long DetectedAtMs;
        public long AgeMs;
        public Vector2[] OuterPoints;
        public Vector2[] InnerPoints;
        public bool FaceBoundsAvailable;
        public Vector2 FaceBoundsCenter;
        public Vector2 FaceBoundsSize;
        public string StabilizationMode;
        public float TransitionProgress;
        public long TransitionDurationMs;
        public float FaceMotionScore;
        public float FaceMotionCenterShiftPx;
        public float FaceMotionScaleDelta;
        public string FaceMotionRisk;
    }

    [Serializable]
    private sealed class VisionPointPayload
    {
        public float x;
        public float y;
    }

    [Serializable]
    private sealed class VisionBoundsPayload
    {
        public float x;
        public float y;
        public float width;
        public float height;
    }

    [Serializable]
    private sealed class VisionBoundaryPayload
    {
        public string status;
        public string detail;
        public string source;
        public string coordinateMode;
        public int imageWidth;
        public int imageHeight;
        public int faceCount;
        public int outerPointCount;
        public int innerPointCount;
        public float lipConfidence;
        public VisionBoundsPayload lipBounds;
        public VisionPointPayload[] outer;
        public VisionPointPayload[] inner;
    }

    private struct FaceScreenBounds
    {
        public bool Available;
        public Vector2 Center;
        public Vector2 Size;
    }

    private const float CaptureIntervalSeconds = 0.20f;
    private const long FreshBoundaryMaxAgeMs = 300;
    private const long BoundaryTransitionDurationMs = 160;
    private const float BoundarySmoothBlend = 0.56f;
    private const float BoundaryLargeMotionBlend = 0.86f;
    private const float FaceMotionMediumThreshold = 0.18f;
    private const float FaceMotionLargeThreshold = 0.32f;
    private const string RuntimeSource = "apple_vision_runtime_lip_landmarks";
    private const string CoordinateMode = "raw-y";

    private bool runtimeRequested;
    private bool captureInProgress;
    private float nextCaptureAt;
    private int sequence;
    private BoundarySnapshot latestSnapshot;
    private BoundarySnapshot transitionFromSnapshot;
    private BoundarySnapshot transitionToSnapshot;
    private long transitionStartedAtMs;
    private RNBridge rnBridge;
    private E3RegionMaskOverlay regionMaskOverlay;
    private FaceTrackingStatusReporter statusReporter;
    private ARFaceManager faceManager;

#if UNITY_IOS && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern IntPtr E7VisionDetectLipBoundaryPng(
        byte[] pngBytes,
        int byteCount,
        int imageWidth,
        int imageHeight);

    [DllImport("__Internal")]
    private static extern void E7VisionReleaseCString(IntPtr pointer);
#endif

    public void Configure(RNBridge bridge)
    {
        if (rnBridge == null)
        {
            rnBridge = bridge;
        }
    }

    public void SetRuntimeRequested(bool requested)
    {
        if (runtimeRequested == requested)
        {
            return;
        }

        runtimeRequested = requested;
        if (runtimeRequested)
        {
            nextCaptureAt = 0.0f;
        }

        Debug.Log(
            "[E7] vision_lip_boundary_runtime"
            + " requested=" + runtimeRequested.ToString().ToLowerInvariant()
            + " source=" + RuntimeSource
            + " coordinateMode=" + CoordinateMode);
    }

    public bool TryGetLatestBoundary(
        int targetWidth,
        int targetHeight,
        out BoundarySnapshot snapshot)
    {
        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        snapshot = BuildInterpolatedSnapshot(nowMs);
        snapshot.AgeMs = snapshot.DetectedAtMs > 0
            ? nowMs - snapshot.DetectedAtMs
            : 0;

        if (!snapshot.Available
            || snapshot.OuterPoints == null
            || snapshot.InnerPoints == null
            || snapshot.OuterPoints.Length < 3
            || snapshot.InnerPoints.Length < 3
            || snapshot.AgeMs > FreshBoundaryMaxAgeMs)
        {
            return false;
        }

        if (targetWidth <= 0
            || targetHeight <= 0
            || snapshot.ImageWidth <= 0
            || snapshot.ImageHeight <= 0)
        {
            return true;
        }

        if (targetWidth == snapshot.ImageWidth && targetHeight == snapshot.ImageHeight)
        {
            return true;
        }

        float scaleX = targetWidth / (float)snapshot.ImageWidth;
        float scaleY = targetHeight / (float)snapshot.ImageHeight;
        snapshot.OuterPoints = ScalePoints(snapshot.OuterPoints, scaleX, scaleY);
        snapshot.InnerPoints = ScalePoints(snapshot.InnerPoints, scaleX, scaleY);
        if (snapshot.LipBoundsAvailable)
        {
            snapshot.LipBounds = new Rect(
                snapshot.LipBounds.x * scaleX,
                snapshot.LipBounds.y * scaleY,
                snapshot.LipBounds.width * scaleX,
                snapshot.LipBounds.height * scaleY);
        }

        if (snapshot.FaceBoundsAvailable)
        {
            snapshot.FaceBoundsCenter = new Vector2(
                snapshot.FaceBoundsCenter.x * scaleX,
                snapshot.FaceBoundsCenter.y * scaleY);
            snapshot.FaceBoundsSize = new Vector2(
                snapshot.FaceBoundsSize.x * scaleX,
                snapshot.FaceBoundsSize.y * scaleY);
        }

        snapshot.ImageWidth = targetWidth;
        snapshot.ImageHeight = targetHeight;
        return true;
    }

    public bool TryPeekLatestBoundary(out BoundarySnapshot snapshot)
    {
        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        snapshot = BuildInterpolatedSnapshot(nowMs);
        snapshot.AgeMs = snapshot.DetectedAtMs > 0
            ? nowMs - snapshot.DetectedAtMs
            : 0;
        return snapshot.Available;
    }

    private void Awake()
    {
        RefreshSceneReferences();
    }

    private void Update()
    {
        if (!runtimeRequested || captureInProgress || Time.realtimeSinceStartup < nextCaptureAt)
        {
            return;
        }

        StartCoroutine(CaptureAndDetectRoutine());
    }

    private IEnumerator CaptureAndDetectRoutine()
    {
        captureInProgress = true;
        RefreshSceneReferences();
        bool originalDebugOverlayVisible = statusReporter != null && statusReporter.DebugOverlayVisible;

        if (regionMaskOverlay != null)
        {
            regionMaskOverlay.SetVisionCaptureSuppressed(true);
        }

        if (statusReporter != null)
        {
            statusReporter.SetDebugOverlayVisible(false);
        }

        yield return new WaitForEndOfFrame();

        int width = Screen.width;
        int height = Screen.height;
        string status = "unknown";
        string detail = "none";
        Texture2D frameTexture = null;

        try
        {
            if (width <= 0 || height <= 0)
            {
                status = "invalid_screen_size";
                detail = "screen_width_or_height_zero";
                ApplyBoundaryPayload(BuildFailurePayload(status, detail, width, height), default);
                yield break;
            }

            FaceScreenBounds faceBounds = CaptureCurrentFaceBounds();
            frameTexture = new Texture2D(width, height, TextureFormat.RGB24, false);
            frameTexture.ReadPixels(new Rect(0, 0, width, height), 0, 0, false);
            frameTexture.Apply(false, false);
            byte[] pngBytes = EncodeRgbPngTopLeft(frameTexture);

            string json = DetectLipBoundaryJson(pngBytes, width, height);
            VisionBoundaryPayload payload = JsonUtility.FromJson<VisionBoundaryPayload>(json);
            if (payload == null)
            {
                ApplyBoundaryPayload(BuildFailurePayload(
                    "parse_failed",
                    "native_vision_json_empty",
                    width,
                    height),
                    faceBounds);
            }
            else
            {
                ApplyBoundaryPayload(payload, faceBounds);
            }
        }
        catch (Exception exception)
        {
            status = "exception";
            detail = exception.GetType().Name + ":" + exception.Message;
            ApplyBoundaryPayload(BuildFailurePayload(status, detail, width, height), default);
        }
        finally
        {
            if (frameTexture != null)
            {
                Destroy(frameTexture);
            }

            if (regionMaskOverlay != null)
            {
                regionMaskOverlay.SetVisionCaptureSuppressed(false);
            }

            if (statusReporter != null)
            {
                statusReporter.SetDebugOverlayVisible(originalDebugOverlayVisible);
            }

            nextCaptureAt = Time.realtimeSinceStartup + CaptureIntervalSeconds;
            captureInProgress = false;
        }
    }

    private void RefreshSceneReferences()
    {
        if (rnBridge == null)
        {
            rnBridge = FindFirstObjectByType<RNBridge>();
        }

        if (regionMaskOverlay == null)
        {
            regionMaskOverlay = FindFirstObjectByType<E3RegionMaskOverlay>();
        }

        if (statusReporter == null)
        {
            statusReporter = FindFirstObjectByType<FaceTrackingStatusReporter>();
        }

        if (faceManager == null)
        {
            faceManager = FindFirstObjectByType<ARFaceManager>();
        }
    }

    private string DetectLipBoundaryJson(byte[] pngBytes, int width, int height)
    {
#if UNITY_IOS && !UNITY_EDITOR
        IntPtr resultPointer = E7VisionDetectLipBoundaryPng(
            pngBytes,
            pngBytes != null ? pngBytes.Length : 0,
            width,
            height);
        if (resultPointer == IntPtr.Zero)
        {
            return "{\"status\":\"native_result_null\",\"source\":\""
                + RuntimeSource
                + "\",\"coordinateMode\":\""
                + CoordinateMode
                + "\"}";
        }

        try
        {
            return Marshal.PtrToStringAnsi(resultPointer) ?? string.Empty;
        }
        finally
        {
            E7VisionReleaseCString(resultPointer);
        }
#else
        return "{\"status\":\"unsupported_platform\",\"detail\":\"requires_ios_device_runtime\",\"source\":\""
            + RuntimeSource
            + "\",\"coordinateMode\":\""
            + CoordinateMode
            + "\",\"imageWidth\":"
            + width.ToString(CultureInfo.InvariantCulture)
            + ",\"imageHeight\":"
            + height.ToString(CultureInfo.InvariantCulture)
            + ",\"faceCount\":0,\"outerPointCount\":0,\"innerPointCount\":0,\"outer\":[],\"inner\":[]}";
#endif
    }

    private void ApplyBoundaryPayload(VisionBoundaryPayload payload, FaceScreenBounds faceBounds)
    {
        sequence++;
        long detectedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        string status = NormalizeOptional(payload.status, "unknown");
        Vector2[] outerPoints = ConvertPoints(payload.outer);
        Vector2[] innerPoints = ConvertPoints(payload.inner);
        bool available = status == "ok"
            && outerPoints.Length >= 3
            && innerPoints.Length >= 3;

        BoundarySnapshot rawSnapshot = new BoundarySnapshot
        {
            Available = available,
            Status = status,
            Detail = NormalizeOptional(payload.detail, "none"),
            Source = NormalizeOptional(payload.source, RuntimeSource),
            CoordinateMode = NormalizeOptional(payload.coordinateMode, CoordinateMode),
            ImageWidth = payload.imageWidth,
            ImageHeight = payload.imageHeight,
            FaceCount = payload.faceCount,
            OuterPointCount = payload.outerPointCount > 0 ? payload.outerPointCount : outerPoints.Length,
            InnerPointCount = payload.innerPointCount > 0 ? payload.innerPointCount : innerPoints.Length,
            LipConfidence = Mathf.Clamp01(payload.lipConfidence),
            LipBoundsAvailable = payload.lipBounds != null
                && payload.lipBounds.width > 0.0f
                && payload.lipBounds.height > 0.0f,
            LipBounds = payload.lipBounds != null
                ? new Rect(
                    payload.lipBounds.x,
                    payload.lipBounds.y,
                    payload.lipBounds.width,
                    payload.lipBounds.height)
                : Rect.zero,
            Sequence = sequence,
            DetectedAtMs = detectedAtMs,
            AgeMs = 0,
            OuterPoints = outerPoints,
            InnerPoints = innerPoints,
            FaceBoundsAvailable = faceBounds.Available,
            FaceBoundsCenter = faceBounds.Center,
            FaceBoundsSize = faceBounds.Size,
            StabilizationMode = available
                ? "temporal_smooth_transition"
                : "unavailable",
            TransitionProgress = 1.0f,
            TransitionDurationMs = BoundaryTransitionDurationMs,
            FaceMotionScore = 0.0f,
            FaceMotionCenterShiftPx = 0.0f,
            FaceMotionScaleDelta = 0.0f,
            FaceMotionRisk = faceBounds.Available
                ? "initial_face_motion_reference"
                : "face_motion_unavailable"
        };

        PrepareBoundaryTransition(rawSnapshot);
        BoundarySnapshot eventSnapshot = BuildInterpolatedSnapshot(detectedAtMs);

        Debug.Log(
            "[E7] vision_lip_boundary_result"
            + " status=" + eventSnapshot.Status
            + " source=" + eventSnapshot.Source
            + " coordinateMode=" + eventSnapshot.CoordinateMode
            + " sequence=" + eventSnapshot.Sequence.ToString(CultureInfo.InvariantCulture)
            + " imageSize=" + eventSnapshot.ImageWidth.ToString(CultureInfo.InvariantCulture)
            + "x" + eventSnapshot.ImageHeight.ToString(CultureInfo.InvariantCulture)
            + " faceCount=" + eventSnapshot.FaceCount.ToString(CultureInfo.InvariantCulture)
            + " outerPoints=" + eventSnapshot.OuterPointCount.ToString(CultureInfo.InvariantCulture)
            + " innerPoints=" + eventSnapshot.InnerPointCount.ToString(CultureInfo.InvariantCulture)
            + " available=" + eventSnapshot.Available.ToString().ToLowerInvariant()
            + " lipConfidence=" + eventSnapshot.LipConfidence.ToString("0.###", CultureInfo.InvariantCulture)
            + " lipBounds=" + FormatRect(eventSnapshot.LipBoundsAvailable, eventSnapshot.LipBounds)
            + " stabilization=" + eventSnapshot.StabilizationMode
            + " transitionMs=" + eventSnapshot.TransitionDurationMs.ToString(CultureInfo.InvariantCulture)
            + " faceBoundsAvailable=" + eventSnapshot.FaceBoundsAvailable.ToString().ToLowerInvariant()
            + " faceMotionScore=" + eventSnapshot.FaceMotionScore.ToString("0.###", CultureInfo.InvariantCulture)
            + " faceMotionRisk=" + eventSnapshot.FaceMotionRisk
            + " rawCameraFrameStored=false"
            + " offDeviceUpload=false"
            + " detail=" + SanitizeLogValue(eventSnapshot.Detail));

        if (rnBridge != null)
        {
            rnBridge.SendE7VisionLipBoundaryEvent(BuildBoundaryEventJson(eventSnapshot));
        }
    }

    private void PrepareBoundaryTransition(BoundarySnapshot rawSnapshot)
    {
        if (!rawSnapshot.Available)
        {
            latestSnapshot = rawSnapshot;
            transitionFromSnapshot = rawSnapshot;
            transitionToSnapshot = rawSnapshot;
            transitionStartedAtMs = rawSnapshot.DetectedAtMs;
            return;
        }

        bool canBlend = latestSnapshot.Available
            && CanInterpolatePoints(latestSnapshot.OuterPoints, rawSnapshot.OuterPoints)
            && CanInterpolatePoints(latestSnapshot.InnerPoints, rawSnapshot.InnerPoints);
        if (!canBlend)
        {
            ApplyFaceMotionDiagnostics(latestSnapshot, ref rawSnapshot);
            latestSnapshot = rawSnapshot;
            transitionFromSnapshot = rawSnapshot;
            transitionToSnapshot = rawSnapshot;
            transitionStartedAtMs = rawSnapshot.DetectedAtMs;
            return;
        }

        float blend = ResolveTemporalBlend(latestSnapshot, rawSnapshot);
        BoundarySnapshot target = rawSnapshot;
        ApplyFaceMotionDiagnostics(latestSnapshot, ref target);
        target.OuterPoints = LerpPoints(latestSnapshot.OuterPoints, rawSnapshot.OuterPoints, blend);
        target.InnerPoints = LerpPoints(latestSnapshot.InnerPoints, rawSnapshot.InnerPoints, blend);
        target.StabilizationMode = "temporal_smooth_transition";
        if (target.FaceMotionRisk == "large_face_motion")
        {
            target.StabilizationMode += "|large_face_motion_smooth";
        }

        target.TransitionProgress = 0.0f;
        target.TransitionDurationMs = BoundaryTransitionDurationMs;

        transitionFromSnapshot = latestSnapshot;
        transitionToSnapshot = target;
        transitionStartedAtMs = rawSnapshot.DetectedAtMs;
        latestSnapshot = target;
    }

    private BoundarySnapshot BuildInterpolatedSnapshot(long nowMs)
    {
        if (!transitionToSnapshot.Available
            || !transitionFromSnapshot.Available
            || !CanInterpolatePoints(transitionFromSnapshot.OuterPoints, transitionToSnapshot.OuterPoints)
            || !CanInterpolatePoints(transitionFromSnapshot.InnerPoints, transitionToSnapshot.InnerPoints))
        {
            BoundarySnapshot snapshot = latestSnapshot;
            snapshot.TransitionProgress = snapshot.Available ? 1.0f : 0.0f;
            snapshot.TransitionDurationMs = BoundaryTransitionDurationMs;
            return snapshot;
        }

        float progress = BoundaryTransitionDurationMs <= 0
            ? 1.0f
            : Mathf.Clamp01((nowMs - transitionStartedAtMs) / (float)BoundaryTransitionDurationMs);
        progress = progress * progress * (3.0f - 2.0f * progress);

        BoundarySnapshot interpolated = transitionToSnapshot;
        interpolated.OuterPoints = LerpPoints(
            transitionFromSnapshot.OuterPoints,
            transitionToSnapshot.OuterPoints,
            progress);
        interpolated.InnerPoints = LerpPoints(
            transitionFromSnapshot.InnerPoints,
            transitionToSnapshot.InnerPoints,
            progress);
        interpolated.TransitionProgress = progress;
        interpolated.TransitionDurationMs = BoundaryTransitionDurationMs;
        return interpolated;
    }

    private static VisionBoundaryPayload BuildFailurePayload(
        string status,
        string detail,
        int width,
        int height)
    {
        return new VisionBoundaryPayload
        {
            status = status,
            detail = detail,
            source = RuntimeSource,
            coordinateMode = CoordinateMode,
            imageWidth = width,
            imageHeight = height,
            faceCount = 0,
            outerPointCount = 0,
            innerPointCount = 0,
            lipConfidence = 0.0f,
            lipBounds = new VisionBoundsPayload(),
            outer = new VisionPointPayload[0],
            inner = new VisionPointPayload[0]
        };
    }

    private static Vector2[] ConvertPoints(VisionPointPayload[] points)
    {
        if (points == null || points.Length == 0)
        {
            return Array.Empty<Vector2>();
        }

        Vector2[] converted = new Vector2[points.Length];
        for (int index = 0; index < points.Length; index++)
        {
            VisionPointPayload point = points[index];
            converted[index] = new Vector2(point != null ? point.x : 0.0f, point != null ? point.y : 0.0f);
        }

        return converted;
    }

    private static Vector2[] ScalePoints(Vector2[] points, float scaleX, float scaleY)
    {
        Vector2[] scaled = new Vector2[points.Length];
        for (int index = 0; index < points.Length; index++)
        {
            scaled[index] = new Vector2(points[index].x * scaleX, points[index].y * scaleY);
        }

        return scaled;
    }

    private static string BuildBoundaryEventJson(BoundarySnapshot snapshot)
    {
        return "{\"type\":\"e7_vision_lip_boundary\""
            + ",\"status\":\"" + EscapeJsonString(snapshot.Status) + "\""
            + ",\"source\":\"" + EscapeJsonString(snapshot.Source) + "\""
            + ",\"coordinateMode\":\"" + EscapeJsonString(snapshot.CoordinateMode) + "\""
            + ",\"sequence\":" + snapshot.Sequence.ToString(CultureInfo.InvariantCulture)
            + ",\"imageWidth\":" + snapshot.ImageWidth.ToString(CultureInfo.InvariantCulture)
            + ",\"imageHeight\":" + snapshot.ImageHeight.ToString(CultureInfo.InvariantCulture)
            + ",\"faceCount\":" + snapshot.FaceCount.ToString(CultureInfo.InvariantCulture)
            + ",\"outerPointCount\":" + snapshot.OuterPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"innerPointCount\":" + snapshot.InnerPointCount.ToString(CultureInfo.InvariantCulture)
            + ",\"lipConfidence\":" + snapshot.LipConfidence.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"lipBoundsAvailable\":" + snapshot.LipBoundsAvailable.ToString().ToLowerInvariant()
            + ",\"lipBounds\":{\"x\":" + snapshot.LipBounds.x.ToString("0.#", CultureInfo.InvariantCulture)
            + ",\"y\":" + snapshot.LipBounds.y.ToString("0.#", CultureInfo.InvariantCulture)
            + ",\"width\":" + snapshot.LipBounds.width.ToString("0.#", CultureInfo.InvariantCulture)
            + ",\"height\":" + snapshot.LipBounds.height.ToString("0.#", CultureInfo.InvariantCulture)
            + "}"
            + ",\"available\":" + snapshot.Available.ToString().ToLowerInvariant()
            + ",\"stabilizationMode\":\"" + EscapeJsonString(snapshot.StabilizationMode) + "\""
            + ",\"transitionProgress\":" + snapshot.TransitionProgress.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"transitionDurationMs\":" + snapshot.TransitionDurationMs.ToString(CultureInfo.InvariantCulture)
            + ",\"faceBoundsAvailable\":" + snapshot.FaceBoundsAvailable.ToString().ToLowerInvariant()
            + ",\"visionBoundaryFaceMotionScore\":" + snapshot.FaceMotionScore.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceCenterShiftPx\":" + snapshot.FaceMotionCenterShiftPx.ToString("0.#", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceScaleDelta\":" + snapshot.FaceMotionScaleDelta.ToString("0.###", CultureInfo.InvariantCulture)
            + ",\"visionBoundaryFaceMotionRisk\":\"" + EscapeJsonString(snapshot.FaceMotionRisk) + "\""
            + ",\"rawCameraFrameStored\":false"
            + ",\"offDeviceUpload\":false"
            + ",\"detail\":\"" + EscapeJsonString(snapshot.Detail) + "\""
            + "}";
    }

    private FaceScreenBounds CaptureCurrentFaceBounds()
    {
        if (faceManager == null)
        {
            RefreshSceneReferences();
        }

        Camera camera = Camera.main;
        if (faceManager == null || camera == null)
        {
            return default;
        }

        foreach (ARFace face in faceManager.trackables)
        {
            if (face == null || face.trackingState != TrackingState.Tracking)
            {
                continue;
            }

            if (TryProjectFaceBounds(face, camera, out FaceScreenBounds bounds))
            {
                return bounds;
            }
        }

        return default;
    }

    private static bool TryProjectFaceBounds(ARFace face, Camera camera, out FaceScreenBounds bounds)
    {
        bounds = default;
        if (face == null
            || camera == null
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
            Vector3 screen = camera.WorldToScreenPoint(face.transform.TransformPoint(face.vertices[index]));
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

        bounds = new FaceScreenBounds
        {
            Available = true,
            Center = new Vector2((minX + maxX) * 0.5f, (minY + maxY) * 0.5f),
            Size = new Vector2(maxX - minX, maxY - minY)
        };
        return true;
    }

    private static float ResolveTemporalBlend(BoundarySnapshot previous, BoundarySnapshot next)
    {
        CalculatePointBbox(previous.OuterPoints, out Vector2 previousCenter, out Vector2 previousSize);
        CalculatePointBbox(next.OuterPoints, out Vector2 nextCenter, out Vector2 nextSize);
        float reference = Mathf.Max(1.0f, Mathf.Max(previousSize.x, previousSize.y));
        float centerMotion = Vector2.Distance(previousCenter, nextCenter) / reference;
        float sizeMotion = Mathf.Abs(nextSize.magnitude - previousSize.magnitude) / Mathf.Max(1.0f, previousSize.magnitude);
        return centerMotion > 0.22f || sizeMotion > 0.18f
            ? BoundaryLargeMotionBlend
            : BoundarySmoothBlend;
    }

    private static void ApplyFaceMotionDiagnostics(BoundarySnapshot previous, ref BoundarySnapshot next)
    {
        if (!next.FaceBoundsAvailable)
        {
            next.FaceMotionScore = 0.0f;
            next.FaceMotionCenterShiftPx = 0.0f;
            next.FaceMotionScaleDelta = 0.0f;
            next.FaceMotionRisk = "face_motion_unavailable";
            return;
        }

        if (!previous.Available || !previous.FaceBoundsAvailable)
        {
            next.FaceMotionScore = 0.0f;
            next.FaceMotionCenterShiftPx = 0.0f;
            next.FaceMotionScaleDelta = 0.0f;
            next.FaceMotionRisk = "initial_face_motion_reference";
            return;
        }

        float centerShiftPx = Vector2.Distance(previous.FaceBoundsCenter, next.FaceBoundsCenter);
        float referenceSize = Mathf.Max(1.0f, Mathf.Max(previous.FaceBoundsSize.x, previous.FaceBoundsSize.y));
        float centerShiftNormalized = centerShiftPx / referenceSize;
        float scaleDeltaX = Mathf.Abs(next.FaceBoundsSize.x - previous.FaceBoundsSize.x)
            / Mathf.Max(1.0f, previous.FaceBoundsSize.x);
        float scaleDeltaY = Mathf.Abs(next.FaceBoundsSize.y - previous.FaceBoundsSize.y)
            / Mathf.Max(1.0f, previous.FaceBoundsSize.y);
        float scaleDelta = Mathf.Max(scaleDeltaX, scaleDeltaY);
        float motionScore = centerShiftNormalized + scaleDelta * 0.5f;
        next.FaceMotionScore = motionScore;
        next.FaceMotionCenterShiftPx = centerShiftPx;
        next.FaceMotionScaleDelta = scaleDelta;
        next.FaceMotionRisk = ResolveFaceMotionRisk(motionScore);
    }

    private static string ResolveFaceMotionRisk(float motionScore)
    {
        if (motionScore >= FaceMotionLargeThreshold)
        {
            return "large_face_motion";
        }

        if (motionScore >= FaceMotionMediumThreshold)
        {
            return "medium_face_motion";
        }

        return "low_face_motion";
    }

    private static void CalculatePointBbox(Vector2[] points, out Vector2 center, out Vector2 size)
    {
        center = Vector2.zero;
        size = Vector2.zero;
        if (points == null || points.Length == 0)
        {
            return;
        }

        float minX = float.MaxValue;
        float minY = float.MaxValue;
        float maxX = float.MinValue;
        float maxY = float.MinValue;
        for (int index = 0; index < points.Length; index++)
        {
            Vector2 point = points[index];
            minX = Mathf.Min(minX, point.x);
            maxX = Mathf.Max(maxX, point.x);
            minY = Mathf.Min(minY, point.y);
            maxY = Mathf.Max(maxY, point.y);
        }

        center = new Vector2((minX + maxX) * 0.5f, (minY + maxY) * 0.5f);
        size = new Vector2(maxX - minX, maxY - minY);
    }

    private static bool CanInterpolatePoints(Vector2[] a, Vector2[] b)
    {
        return a != null && b != null && a.Length == b.Length && a.Length >= 3;
    }

    private static Vector2[] LerpPoints(Vector2[] from, Vector2[] to, float amount)
    {
        if (!CanInterpolatePoints(from, to))
        {
            return to ?? Array.Empty<Vector2>();
        }

        Vector2[] blended = new Vector2[to.Length];
        amount = Mathf.Clamp01(amount);
        for (int index = 0; index < to.Length; index++)
        {
            blended[index] = Vector2.Lerp(from[index], to[index], amount);
        }

        return blended;
    }

    private static string NormalizeOptional(string value, string fallback)
    {
        return string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();
    }

    private static string SanitizeLogValue(string value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? "none"
            : value.Trim().Replace(" ", "_").Replace(",", "_").Replace("\"", string.Empty);
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

    private static string EscapeJsonString(string value)
    {
        return string.IsNullOrEmpty(value)
            ? string.Empty
            : value.Replace("\\", "\\\\").Replace("\"", "\\\"");
    }

    private static byte[] EncodeRgbPngTopLeft(Texture2D texture)
    {
        int width = texture.width;
        int height = texture.height;
        Color32[] pixels = texture.GetPixels32();
        byte[] raw = new byte[(width * 3 + 1) * height];
        int offset = 0;

        for (int y = height - 1; y >= 0; y--)
        {
            raw[offset++] = 0;
            int rowStart = y * width;
            for (int x = 0; x < width; x++)
            {
                Color32 pixel = pixels[rowStart + x];
                raw[offset++] = pixel.r;
                raw[offset++] = pixel.g;
                raw[offset++] = pixel.b;
            }
        }

        using (MemoryStream stream = new MemoryStream())
        {
            stream.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, 0, 8);

            using (MemoryStream ihdr = new MemoryStream())
            {
                WriteBigEndianUInt32(ihdr, (uint)width);
                WriteBigEndianUInt32(ihdr, (uint)height);
                ihdr.WriteByte(8);
                ihdr.WriteByte(2);
                ihdr.WriteByte(0);
                ihdr.WriteByte(0);
                ihdr.WriteByte(0);
                WritePngChunk(stream, "IHDR", ihdr.ToArray());
            }

            WritePngChunk(stream, "IDAT", BuildStoredZlibPayload(raw));
            WritePngChunk(stream, "IEND", Array.Empty<byte>());
            return stream.ToArray();
        }
    }

    private static byte[] BuildStoredZlibPayload(byte[] raw)
    {
        using (MemoryStream stream = new MemoryStream())
        {
            stream.WriteByte(0x78);
            stream.WriteByte(0x01);

            int offset = 0;
            while (offset < raw.Length)
            {
                int blockLength = Math.Min(65535, raw.Length - offset);
                bool isFinal = offset + blockLength >= raw.Length;
                stream.WriteByte(isFinal ? (byte)0x01 : (byte)0x00);
                WriteLittleEndianUInt16(stream, (ushort)blockLength);
                WriteLittleEndianUInt16(stream, (ushort)~blockLength);
                stream.Write(raw, offset, blockLength);
                offset += blockLength;
            }

            WriteBigEndianUInt32(stream, CalculateAdler32(raw));
            return stream.ToArray();
        }
    }

    private static void WritePngChunk(Stream stream, string type, byte[] data)
    {
        byte[] typeBytes = Encoding.ASCII.GetBytes(type);
        WriteBigEndianUInt32(stream, (uint)data.Length);
        stream.Write(typeBytes, 0, typeBytes.Length);
        stream.Write(data, 0, data.Length);

        byte[] crcInput = new byte[typeBytes.Length + data.Length];
        Buffer.BlockCopy(typeBytes, 0, crcInput, 0, typeBytes.Length);
        Buffer.BlockCopy(data, 0, crcInput, typeBytes.Length, data.Length);
        WriteBigEndianUInt32(stream, CalculateCrc32(crcInput));
    }

    private static uint CalculateAdler32(byte[] data)
    {
        const uint modulus = 65521;
        uint a = 1;
        uint b = 0;
        for (int index = 0; index < data.Length; index++)
        {
            a = (a + data[index]) % modulus;
            b = (b + a) % modulus;
        }

        return (b << 16) | a;
    }

    private static uint CalculateCrc32(byte[] data)
    {
        uint crc = 0xffffffff;
        for (int index = 0; index < data.Length; index++)
        {
            crc ^= data[index];
            for (int bit = 0; bit < 8; bit++)
            {
                bool lsb = (crc & 1) != 0;
                crc >>= 1;
                if (lsb)
                {
                    crc ^= 0xedb88320;
                }
            }
        }

        return ~crc;
    }

    private static void WriteBigEndianUInt32(Stream stream, uint value)
    {
        stream.WriteByte((byte)((value >> 24) & 0xff));
        stream.WriteByte((byte)((value >> 16) & 0xff));
        stream.WriteByte((byte)((value >> 8) & 0xff));
        stream.WriteByte((byte)(value & 0xff));
    }

    private static void WriteLittleEndianUInt16(Stream stream, ushort value)
    {
        stream.WriteByte((byte)(value & 0xff));
        stream.WriteByte((byte)((value >> 8) & 0xff));
    }
}
