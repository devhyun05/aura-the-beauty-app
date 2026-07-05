using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public sealed class E7HandOcclusionRuntime : MonoBehaviour
{
    public struct HandOcclusionState
    {
        public bool HandDetected;
        public bool HandNearMouth;
        public float Overlap;
        public float Confidence;
        public float Visibility;
        public bool HasOcclusionRect;
        public bool HasHandMask;
        public Rect ScreenRect;
        public long AgeMs;
        public string TransformMode;
        public string Status;
        public string Detail;
    }

    [Serializable]
    private sealed class HandPointPayload
    {
        public int index;
        public string name;
        public float x;
        public float y;
        public float confidence;
    }

    [Serializable]
    private sealed class HandBoundsPayload
    {
        public float x;
        public float y;
        public float width;
        public float height;
    }

    [Serializable]
    private sealed class HandPosePayload
    {
        public string status;
        public string detail;
        public bool handDetected;
        public int imageWidth;
        public int imageHeight;
        public int pointCount;
        public float confidence;
        public HandBoundsPayload bounds;
        public HandPointPayload[] points;
    }

    private struct EvaluatedHandPose
    {
        public bool HandDetected;
        public bool HandNearMouth;
        public float Overlap;
        public float Confidence;
        public bool HasOcclusionRect;
        public bool HasLandmarks;
        public Rect ScreenRect;
        public Vector2[] ScreenPoints;
        public float[] PointConfidences;
        public string TransformMode;
        public string Status;
        public string Detail;
        public long TimestampMs;
    }

    private const float CaptureIntervalSeconds = 0.16f;
    private const int MaxConvertedDimension = 288;
    private const int HandLandmarkCount = 21;
    private const int HandMaskBaseWidth = 256;
    private const float MinimumHandConfidence = 0.45f;
    private const float MinimumOverlapRatio = 0.12f;
    private const long StaleResultMs = 500;
    private const float MouthBoundsExpansion = 1.55f;
    private const float MouthOcclusionClipExpansion = 1.16f;
    private const float HandPointSmoothingBase = 0.45f;

    [SerializeField] private ARCameraManager cameraManager;

    private readonly object pendingResultLock = new object();
    private readonly Vector4[] smoothedHandPoints = new Vector4[HandLandmarkCount];
    private readonly Vector4[] handMaskShaderPoints = new Vector4[HandLandmarkCount];
    private bool runtimeRequested;
    private volatile bool detectionInFlight;
    private float nextCaptureAt;
    private Rect latestMouthBounds;
    private bool latestMouthBoundsAvailable;
    private EvaluatedHandPose latestPose;
    private EvaluatedHandPose pendingPose;
    private bool hasPendingPose;
    private bool hasSmoothedHandPoints;
    private bool handMaskActive;
    private bool warnedMissingMaskShader;
    private Rect latestMaskBounds;
    private RenderTexture handMaskTexture;
    private Material handMaskMaterial;
    private string lastLoggedState = string.Empty;

#if UNITY_IOS && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern IntPtr E7VisionDetectHandPoseRgba(
        byte[] rgbaBytes,
        int byteCount,
        int imageWidth,
        int imageHeight);

    [DllImport("__Internal")]
    private static extern void E7VisionReleaseCString(IntPtr pointer);
#endif

    public float CurrentVisibility => 1.0f;
    public Texture HandMaskTexture => handMaskTexture;
    public bool IsHandMaskActive => handMaskActive;

    public HandOcclusionState CurrentState
    {
        get
        {
            long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            long ageMs = latestPose.TimestampMs > 0 ? nowMs - latestPose.TimestampMs : 0;
            bool freshOcclusion = IsLatestPoseFresh(nowMs)
                && latestPose.HandNearMouth
                && latestPose.HasLandmarks;
            return new HandOcclusionState
            {
                HandDetected = latestPose.HandDetected,
                HandNearMouth = freshOcclusion,
                Overlap = latestPose.Overlap,
                Confidence = latestPose.Confidence,
                Visibility = 1.0f,
                HasOcclusionRect = freshOcclusion && latestPose.HasOcclusionRect,
                HasHandMask = freshOcclusion && handMaskActive,
                ScreenRect = freshOcclusion && latestPose.HasOcclusionRect ? latestPose.ScreenRect : Rect.zero,
                AgeMs = ageMs,
                TransformMode = latestPose.TransformMode,
                Status = latestPose.Status,
                Detail = latestPose.Detail
            };
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
        else
        {
            latestMouthBoundsAvailable = false;
        }

        Debug.Log(
            "[E7] hand_occlusion_runtime"
            + " requested=" + runtimeRequested.ToString().ToLowerInvariant()
            + " source=ar_camera_cpu_image"
            + " detector=apple_vision_hand_pose"
            + " maxDimension=" + MaxConvertedDimension.ToString(CultureInfo.InvariantCulture));
    }

    public void UpdateMouthScreenBounds(Rect mouthBounds)
    {
        if (mouthBounds.width <= 1.0f || mouthBounds.height <= 1.0f)
        {
            latestMouthBoundsAvailable = false;
            return;
        }

        latestMouthBounds = mouthBounds;
        latestMouthBoundsAvailable = true;
    }

    private void Awake()
    {
        RefreshSceneReferences();
        latestPose = new EvaluatedHandPose
        {
            Status = "not_started",
            Detail = "runtime_not_requested",
            TransformMode = "none",
            TimestampMs = 0
        };
    }

    private void Update()
    {
        ConsumePendingPose();
        UpdateOcclusionState();
        UpdateHandMaskTexture();

        if (!runtimeRequested || detectionInFlight || Time.realtimeSinceStartup < nextCaptureAt)
        {
            return;
        }

        CaptureAndDetectAsync();
    }

    private void OnDestroy()
    {
        if (handMaskTexture != null)
        {
            handMaskTexture.Release();
            Destroy(handMaskTexture);
            handMaskTexture = null;
        }

        if (handMaskMaterial != null)
        {
            Destroy(handMaskMaterial);
            handMaskMaterial = null;
        }
    }

    private void RefreshSceneReferences()
    {
        if (cameraManager == null)
        {
            cameraManager = FindFirstObjectByType<ARCameraManager>();
        }
    }

    private void CaptureAndDetectAsync()
    {
        RefreshSceneReferences();
        if (cameraManager == null || !cameraManager.TryAcquireLatestCpuImage(out XRCpuImage image))
        {
            nextCaptureAt = Time.realtimeSinceStartup + CaptureIntervalSeconds;
            return;
        }

        byte[] rgbaBytes = null;
        int outputWidth = 0;
        int outputHeight = 0;
        try
        {
            ResolveOutputDimensions(image.width, image.height, out outputWidth, out outputHeight);
            XRCpuImage.ConversionParams conversionParams = new XRCpuImage.ConversionParams
            {
                inputRect = new RectInt(0, 0, image.width, image.height),
                outputDimensions = new Vector2Int(outputWidth, outputHeight),
                outputFormat = TextureFormat.RGBA32,
                transformation = XRCpuImage.Transformation.MirrorY
            };
            int dataSize = image.GetConvertedDataSize(conversionParams);
            using (NativeArray<byte> buffer = new NativeArray<byte>(dataSize, Allocator.Temp))
            {
                image.Convert(conversionParams, new NativeSlice<byte>(buffer));
                rgbaBytes = buffer.ToArray();
            }
        }
        catch (Exception exception)
        {
            Debug.LogWarning(
                "[E7] hand_occlusion_capture_failed"
                + " error=" + exception.GetType().Name
                + " detail=" + SanitizeLogValue(exception.Message));
        }
        finally
        {
            image.Dispose();
        }

        nextCaptureAt = Time.realtimeSinceStartup + CaptureIntervalSeconds;
        if (rgbaBytes == null || rgbaBytes.Length == 0 || outputWidth <= 0 || outputHeight <= 0)
        {
            return;
        }

        detectionInFlight = true;
        byte[] capturedBytes = rgbaBytes;
        int capturedWidth = outputWidth;
        int capturedHeight = outputHeight;
        int capturedScreenWidth = Screen.width;
        int capturedScreenHeight = Screen.height;
        bool capturedMouthAvailable = latestMouthBoundsAvailable;
        Rect capturedMouthBounds = latestMouthBounds;
        Task.Run(() =>
        {
            try
            {
                EvaluatedHandPose pose = DetectAndEvaluateHandPose(
                    capturedBytes,
                    capturedWidth,
                    capturedHeight,
                    capturedScreenWidth,
                    capturedScreenHeight,
                    capturedMouthAvailable,
                    capturedMouthBounds);
                lock (pendingResultLock)
                {
                    pendingPose = pose;
                    hasPendingPose = true;
                }
            }
            catch (Exception exception)
            {
                lock (pendingResultLock)
                {
                    pendingPose = new EvaluatedHandPose
                    {
                        HandDetected = false,
                        HandNearMouth = false,
                        Overlap = 0.0f,
                        Confidence = 0.0f,
                        HasOcclusionRect = false,
                        HasLandmarks = false,
                        ScreenRect = Rect.zero,
                        ScreenPoints = null,
                        PointConfidences = null,
                        TransformMode = "exception",
                        Status = "exception",
                        Detail = exception.GetType().Name,
                        TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                    };
                    hasPendingPose = true;
                }
            }
            finally
            {
                detectionInFlight = false;
            }
        });
    }

    private EvaluatedHandPose DetectAndEvaluateHandPose(
        byte[] rgbaBytes,
        int width,
        int height,
        int screenWidth,
        int screenHeight,
        bool mouthBoundsAvailable,
        Rect mouthBounds)
    {
        long timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        HandPosePayload payload = null;
        string rawJson = DetectHandPoseJson(rgbaBytes, width, height);
        try
        {
            payload = JsonUtility.FromJson<HandPosePayload>(rawJson);
        }
        catch (Exception exception)
        {
            return new EvaluatedHandPose
            {
                HandDetected = false,
                HandNearMouth = false,
                Overlap = 0.0f,
                Confidence = 0.0f,
                HasOcclusionRect = false,
                HasLandmarks = false,
                ScreenRect = Rect.zero,
                ScreenPoints = null,
                PointConfidences = null,
                TransformMode = "parse_failed",
                Status = "parse_failed",
                Detail = exception.GetType().Name,
                TimestampMs = timestampMs
            };
        }

        if (payload == null)
        {
            return new EvaluatedHandPose
            {
                HandDetected = false,
                HandNearMouth = false,
                Overlap = 0.0f,
                Confidence = 0.0f,
                HasOcclusionRect = false,
                HasLandmarks = false,
                ScreenRect = Rect.zero,
                ScreenPoints = null,
                PointConfidences = null,
                TransformMode = "empty_payload",
                Status = "empty_payload",
                Detail = "native_json_empty",
                TimestampMs = timestampMs
            };
        }

        EvaluatedHandPose evaluated = EvaluateHandPose(
            payload,
            screenWidth,
            screenHeight,
            mouthBoundsAvailable,
            mouthBounds);
        evaluated.TimestampMs = timestampMs;
        return evaluated;
    }

    private string DetectHandPoseJson(byte[] rgbaBytes, int width, int height)
    {
#if UNITY_IOS && !UNITY_EDITOR
        IntPtr resultPointer = E7VisionDetectHandPoseRgba(
            rgbaBytes,
            rgbaBytes != null ? rgbaBytes.Length : 0,
            width,
            height);
        if (resultPointer == IntPtr.Zero)
        {
            return "{\"status\":\"native_result_null\",\"handDetected\":false,\"pointCount\":0,\"confidence\":0,\"points\":[]}";
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
        return "{\"status\":\"unsupported_platform\",\"handDetected\":false,\"detail\":\"requires_ios_device\",\"imageWidth\":"
            + width.ToString(CultureInfo.InvariantCulture)
            + ",\"imageHeight\":"
            + height.ToString(CultureInfo.InvariantCulture)
            + ",\"pointCount\":0,\"confidence\":0,\"points\":[]}";
#endif
    }

    private EvaluatedHandPose EvaluateHandPose(
        HandPosePayload payload,
        int screenWidth,
        int screenHeight,
        bool mouthBoundsAvailable,
        Rect mouthBounds)
    {
        EvaluatedHandPose evaluated = new EvaluatedHandPose
        {
            HandDetected = payload.handDetected,
            HandNearMouth = false,
            Overlap = 0.0f,
            Confidence = Mathf.Clamp01(payload.confidence),
            HasOcclusionRect = false,
            HasLandmarks = false,
            ScreenRect = Rect.zero,
            ScreenPoints = null,
            PointConfidences = null,
            TransformMode = "none",
            Status = string.IsNullOrWhiteSpace(payload.status) ? "unknown" : payload.status,
            Detail = string.IsNullOrWhiteSpace(payload.detail) ? "none" : payload.detail,
            TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        if (!payload.handDetected
            || payload.points == null
            || payload.points.Length < 5
            || payload.imageWidth <= 0
            || payload.imageHeight <= 0
            || payload.confidence < MinimumHandConfidence
            || !mouthBoundsAvailable)
        {
            return evaluated;
        }

        Rect expandedMouth = ExpandRect(mouthBounds, MouthBoundsExpansion);
        float bestScore = 0.0f;
        float bestOverlap = 0.0f;
        int bestInsideCount = 0;
        Rect bestHandRect = Rect.zero;
        string bestMode = "none";
        string[] modes =
        {
            "raw",
            "flip-x",
            "flip-y",
            "flip-xy",
            "rot-cw",
            "rot-ccw",
            "rot-cw-flip-x",
            "rot-ccw-flip-x"
        };

        for (int modeIndex = 0; modeIndex < modes.Length; modeIndex++)
        {
            string mode = modes[modeIndex];
            Rect handRect = BuildTransformedHandRect(
                payload.points,
                payload.imageWidth,
                payload.imageHeight,
                screenWidth,
                screenHeight,
                expandedMouth,
                mode,
                out int insideCount);
            if (handRect.width <= 1.0f || handRect.height <= 1.0f)
            {
                continue;
            }

            float overlap = CalculateOverlapRatio(handRect, expandedMouth);
            float centerScore = expandedMouth.Contains(handRect.center) ? 0.14f : 0.0f;
            float pointScore = Mathf.Clamp01(insideCount / 4.0f) * 0.18f;
            float score = overlap + centerScore + pointScore;
            if (score > bestScore)
            {
                bestScore = score;
                bestOverlap = overlap;
                bestInsideCount = insideCount;
                bestHandRect = handRect;
                bestMode = mode;
            }
        }

        evaluated.Overlap = bestOverlap;
        evaluated.TransformMode = bestMode;
        evaluated.HandNearMouth = bestOverlap >= MinimumOverlapRatio
            || (bestInsideCount >= 2 && bestScore >= 0.18f);
        if (evaluated.HandNearMouth)
        {
            Vector2[] screenPoints = new Vector2[HandLandmarkCount];
            float[] pointConfidences = new float[HandLandmarkCount];
            int transformedPointCount = BuildTransformedHandPoints(
                payload.points,
                payload.imageWidth,
                payload.imageHeight,
                screenWidth,
                screenHeight,
                bestMode,
                screenPoints,
                pointConfidences);
            if (transformedPointCount >= 5)
            {
                evaluated.HasLandmarks = true;
                evaluated.ScreenPoints = screenPoints;
                evaluated.PointConfidences = pointConfidences;
            }
        }

        if (evaluated.HandNearMouth && bestHandRect.width > 1.0f && bestHandRect.height > 1.0f)
        {
            Rect clipBounds = ExpandRect(mouthBounds, MouthOcclusionClipExpansion);
            Rect clippedHandRect = IntersectRect(bestHandRect, clipBounds);
            if (clippedHandRect.width > 1.0f && clippedHandRect.height > 1.0f)
            {
                evaluated.HasOcclusionRect = true;
                evaluated.ScreenRect = clippedHandRect;
            }
        }

        return evaluated;
    }

    private void ConsumePendingPose()
    {
        lock (pendingResultLock)
        {
            if (!hasPendingPose)
            {
                return;
            }

            latestPose = pendingPose;
            hasPendingPose = false;
        }
    }

    private void UpdateOcclusionState()
    {
        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        bool freshOcclusion = IsLatestPoseFresh(nowMs)
            && latestPose.HandNearMouth
            && latestPose.HasLandmarks;
        MaybeLogOcclusionState(nowMs, freshOcclusion);
    }

    private bool IsLatestPoseFresh(long nowMs)
    {
        return latestPose.TimestampMs > 0 && nowMs - latestPose.TimestampMs <= StaleResultMs;
    }

    private void UpdateHandMaskTexture()
    {
        long nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        bool shouldRenderMask = runtimeRequested
            && IsLatestPoseFresh(nowMs)
            && latestPose.HandNearMouth
            && latestPose.HasLandmarks
            && latestPose.ScreenPoints != null
            && latestPose.PointConfidences != null;

        if (!EnsureHandMaskResources())
        {
            handMaskActive = false;
            return;
        }

        if (!shouldRenderMask)
        {
            hasSmoothedHandPoints = false;
            handMaskActive = false;
            ClearHandMaskTexture();
            return;
        }

        UpdateSmoothedHandPoints(latestPose);
        float scaleX = handMaskTexture.width / Mathf.Max(1.0f, Screen.width);
        float scaleY = handMaskTexture.height / Mathf.Max(1.0f, Screen.height);
        float averageScale = (scaleX + scaleY) * 0.5f;
        float handSizePx = Mathf.Max(latestMaskBounds.width, latestMaskBounds.height) * averageScale;
        float fingerRadiusPx = Mathf.Clamp(handSizePx * 0.060f, 4.5f, 14.0f);
        float palmRadiusPx = Mathf.Clamp(handSizePx * 0.135f, 9.0f, 30.0f);
        float featherPx = Mathf.Clamp(handSizePx * 0.042f, 6.0f, 12.0f);

        handMaskMaterial.SetVectorArray("_HandPoints", handMaskShaderPoints);
        handMaskMaterial.SetInt("_HandPointCount", HandLandmarkCount);
        handMaskMaterial.SetVector(
            "_TargetSize",
            new Vector4(handMaskTexture.width, handMaskTexture.height, scaleX, scaleY));
        handMaskMaterial.SetFloat("_FingerRadiusPx", fingerRadiusPx);
        handMaskMaterial.SetFloat("_PalmRadiusPx", palmRadiusPx);
        handMaskMaterial.SetFloat("_FeatherPx", featherPx);
        Graphics.Blit(Texture2D.blackTexture, handMaskTexture, handMaskMaterial, 0);
        handMaskActive = true;
    }

    private bool EnsureHandMaskResources()
    {
        if (handMaskMaterial == null)
        {
            Shader shader = Resources.Load<Shader>("HandOcclusionMask")
                ?? Shader.Find("Hidden/MakeupAR/HandOcclusionMask");
            if (shader == null)
            {
                if (!warnedMissingMaskShader)
                {
                    warnedMissingMaskShader = true;
                    Debug.LogWarning("[E7] hand_occlusion_mask_shader_missing");
                }

                return false;
            }

            handMaskMaterial = new Material(shader)
            {
                hideFlags = HideFlags.HideAndDontSave
            };
        }

        int targetWidth = HandMaskBaseWidth;
        int targetHeight = Mathf.Clamp(
            Mathf.RoundToInt(targetWidth * Screen.height / Mathf.Max(1.0f, Screen.width)),
            128,
            768);
        if (handMaskTexture != null
            && handMaskTexture.width == targetWidth
            && handMaskTexture.height == targetHeight)
        {
            return true;
        }

        if (handMaskTexture != null)
        {
            handMaskTexture.Release();
            Destroy(handMaskTexture);
        }

        handMaskTexture = new RenderTexture(targetWidth, targetHeight, 0, RenderTextureFormat.ARGB32)
        {
            name = "E7HandOcclusionMask",
            filterMode = FilterMode.Bilinear,
            wrapMode = TextureWrapMode.Clamp,
            useMipMap = false,
            autoGenerateMips = false
        };
        handMaskTexture.Create();
        ClearHandMaskTexture();
        return true;
    }

    private void ClearHandMaskTexture()
    {
        if (handMaskTexture == null)
        {
            return;
        }

        RenderTexture previous = RenderTexture.active;
        RenderTexture.active = handMaskTexture;
        GL.Clear(false, true, Color.clear);
        RenderTexture.active = previous;
    }

    private void UpdateSmoothedHandPoints(EvaluatedHandPose pose)
    {
        Rect bounds = Rect.zero;
        bool boundsStarted = false;
        for (int index = 0; index < HandLandmarkCount; index++)
        {
            float confidence = pose.PointConfidences[index];
            if (confidence <= 0.0f)
            {
                handMaskShaderPoints[index] = Vector4.zero;
                smoothedHandPoints[index].w = 0.0f;
                continue;
            }

            Vector2 screenPoint = pose.ScreenPoints[index];
            Vector4 target = new Vector4(
                Mathf.Clamp01(screenPoint.x / Mathf.Max(1.0f, Screen.width)),
                Mathf.Clamp01(1.0f - screenPoint.y / Mathf.Max(1.0f, Screen.height)),
                confidence,
                1.0f);
            if (!hasSmoothedHandPoints || smoothedHandPoints[index].w <= 0.0f)
            {
                smoothedHandPoints[index] = target;
            }
            else
            {
                float smoothing = Mathf.Lerp(0.25f, HandPointSmoothingBase, confidence);
                smoothedHandPoints[index] = new Vector4(
                    Mathf.Lerp(smoothedHandPoints[index].x, target.x, smoothing),
                    Mathf.Lerp(smoothedHandPoints[index].y, target.y, smoothing),
                    Mathf.Lerp(smoothedHandPoints[index].z, target.z, smoothing),
                    1.0f);
            }

            handMaskShaderPoints[index] = smoothedHandPoints[index];
            Vector2 topLeftPoint = new Vector2(
                handMaskShaderPoints[index].x * Screen.width,
                (1.0f - handMaskShaderPoints[index].y) * Screen.height);
            if (!boundsStarted)
            {
                bounds = new Rect(topLeftPoint, Vector2.zero);
                boundsStarted = true;
            }
            else
            {
                bounds = Rect.MinMaxRect(
                    Mathf.Min(bounds.xMin, topLeftPoint.x),
                    Mathf.Min(bounds.yMin, topLeftPoint.y),
                    Mathf.Max(bounds.xMax, topLeftPoint.x),
                    Mathf.Max(bounds.yMax, topLeftPoint.y));
            }
        }

        latestMaskBounds = boundsStarted ? bounds : pose.ScreenRect;
        hasSmoothedHandPoints = true;
    }

    private static Rect BuildTransformedHandRect(
        HandPointPayload[] points,
        int imageWidth,
        int imageHeight,
        int screenWidth,
        int screenHeight,
        Rect expandedMouth,
        string mode,
        out int insideCount)
    {
        insideCount = 0;
        float minX = float.MaxValue;
        float minY = float.MaxValue;
        float maxX = float.MinValue;
        float maxY = float.MinValue;
        for (int index = 0; index < points.Length; index++)
        {
            HandPointPayload point = points[index];
            if (point == null || point.confidence < 0.22f)
            {
                continue;
            }

            Vector2 transformed = TransformPointToScreen(
                point.x / Mathf.Max(1.0f, imageWidth),
                point.y / Mathf.Max(1.0f, imageHeight),
                screenWidth,
                screenHeight,
                mode);
            if (expandedMouth.Contains(transformed))
            {
                insideCount++;
            }

            minX = Mathf.Min(minX, transformed.x);
            maxX = Mathf.Max(maxX, transformed.x);
            minY = Mathf.Min(minY, transformed.y);
            maxY = Mathf.Max(maxY, transformed.y);
        }

        if (maxX <= minX || maxY <= minY)
        {
            return Rect.zero;
        }

        return Rect.MinMaxRect(
            Mathf.Clamp(minX, 0.0f, screenWidth),
            Mathf.Clamp(minY, 0.0f, screenHeight),
            Mathf.Clamp(maxX, 0.0f, screenWidth),
            Mathf.Clamp(maxY, 0.0f, screenHeight));
    }

    private static int BuildTransformedHandPoints(
        HandPointPayload[] points,
        int imageWidth,
        int imageHeight,
        int screenWidth,
        int screenHeight,
        string mode,
        Vector2[] screenPoints,
        float[] pointConfidences)
    {
        if (points == null || screenPoints == null || pointConfidences == null)
        {
            return 0;
        }

        int count = 0;
        for (int pointIndex = 0; pointIndex < points.Length; pointIndex++)
        {
            HandPointPayload point = points[pointIndex];
            if (point == null || point.confidence < 0.22f)
            {
                continue;
            }

            int landmarkIndex = point.index >= 0 && point.index < HandLandmarkCount
                ? point.index
                : pointIndex;
            if (landmarkIndex < 0 || landmarkIndex >= HandLandmarkCount)
            {
                continue;
            }

            Vector2 transformed = TransformPointToScreen(
                point.x / Mathf.Max(1.0f, imageWidth),
                point.y / Mathf.Max(1.0f, imageHeight),
                screenWidth,
                screenHeight,
                mode);
            screenPoints[landmarkIndex] = transformed;
            pointConfidences[landmarkIndex] = Mathf.Clamp01(point.confidence);
            count++;
        }

        return count;
    }

    private static Vector2 TransformPointToScreen(
        float x,
        float y,
        int screenWidth,
        int screenHeight,
        string mode)
    {
        x = Mathf.Clamp01(x);
        y = Mathf.Clamp01(y);
        switch (mode)
        {
            case "flip-x":
                x = 1.0f - x;
                break;
            case "flip-y":
                y = 1.0f - y;
                break;
            case "flip-xy":
                x = 1.0f - x;
                y = 1.0f - y;
                break;
            case "rot-cw":
                return new Vector2((1.0f - y) * screenWidth, x * screenHeight);
            case "rot-ccw":
                return new Vector2(y * screenWidth, (1.0f - x) * screenHeight);
            case "rot-cw-flip-x":
                return new Vector2(y * screenWidth, x * screenHeight);
            case "rot-ccw-flip-x":
                return new Vector2((1.0f - y) * screenWidth, (1.0f - x) * screenHeight);
        }

        return new Vector2(x * screenWidth, y * screenHeight);
    }

    private static float CalculateOverlapRatio(Rect handRect, Rect mouthRect)
    {
        Rect intersection = Rect.MinMaxRect(
            Mathf.Max(handRect.xMin, mouthRect.xMin),
            Mathf.Max(handRect.yMin, mouthRect.yMin),
            Mathf.Min(handRect.xMax, mouthRect.xMax),
            Mathf.Min(handRect.yMax, mouthRect.yMax));
        if (intersection.width <= 0.0f || intersection.height <= 0.0f)
        {
            return 0.0f;
        }

        float intersectionArea = intersection.width * intersection.height;
        float mouthArea = Mathf.Max(1.0f, mouthRect.width * mouthRect.height);
        float handArea = Mathf.Max(1.0f, handRect.width * handRect.height);
        return Mathf.Max(intersectionArea / mouthArea, intersectionArea / handArea);
    }

    private static Rect IntersectRect(Rect first, Rect second)
    {
        float minX = Mathf.Max(first.xMin, second.xMin);
        float minY = Mathf.Max(first.yMin, second.yMin);
        float maxX = Mathf.Min(first.xMax, second.xMax);
        float maxY = Mathf.Min(first.yMax, second.yMax);
        if (maxX <= minX || maxY <= minY)
        {
            return Rect.zero;
        }

        return Rect.MinMaxRect(minX, minY, maxX, maxY);
    }

    private static Rect ExpandRect(Rect rect, float scale)
    {
        scale = Mathf.Max(1.0f, scale);
        Vector2 center = rect.center;
        Vector2 size = rect.size * scale;
        return new Rect(center - size * 0.5f, size);
    }

    private static void ResolveOutputDimensions(int sourceWidth, int sourceHeight, out int width, out int height)
    {
        sourceWidth = Mathf.Max(1, sourceWidth);
        sourceHeight = Mathf.Max(1, sourceHeight);
        float scale = MaxConvertedDimension / (float)Mathf.Max(sourceWidth, sourceHeight);
        width = Mathf.Max(16, Mathf.RoundToInt(sourceWidth * scale));
        height = Mathf.Max(16, Mathf.RoundToInt(sourceHeight * scale));
    }

    private void MaybeLogOcclusionState(long nowMs, bool freshOcclusion)
    {
        string state = freshOcclusion
            ? "occluded"
            : "clear";
        if (state == lastLoggedState)
        {
            return;
        }

        lastLoggedState = state;
        long ageMs = latestPose.TimestampMs > 0 ? nowMs - latestPose.TimestampMs : 0;
        Debug.Log(
            "[E7] hand_occlusion_state"
            + " state=" + state
            + " handDetected=" + latestPose.HandDetected.ToString().ToLowerInvariant()
            + " handNearMouth=" + latestPose.HandNearMouth.ToString().ToLowerInvariant()
            + " overlap=" + latestPose.Overlap.ToString("0.###", CultureInfo.InvariantCulture)
            + " confidence=" + latestPose.Confidence.ToString("0.###", CultureInfo.InvariantCulture)
            + " rect=" + FormatRect(latestPose.ScreenRect)
            + " ageMs=" + ageMs.ToString(CultureInfo.InvariantCulture)
            + " transform=" + latestPose.TransformMode
            + " status=" + latestPose.Status);
    }

    private static string FormatRect(Rect rect)
    {
        if (rect.width <= 1.0f || rect.height <= 1.0f)
        {
            return "none";
        }

        return rect.xMin.ToString("0.#", CultureInfo.InvariantCulture)
            + ","
            + rect.yMin.ToString("0.#", CultureInfo.InvariantCulture)
            + ","
            + rect.xMax.ToString("0.#", CultureInfo.InvariantCulture)
            + ","
            + rect.yMax.ToString("0.#", CultureInfo.InvariantCulture);
    }

    private static string SanitizeLogValue(string value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? "none"
            : value.Trim().Replace(" ", "_").Replace(",", "_").Replace("\"", string.Empty);
    }
}
