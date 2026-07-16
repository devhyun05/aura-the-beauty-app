using System;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using ARMakeup.Face;
using Aura.Face3D;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

/// <summary>
/// iOS-only bridge from AR Foundation's XRSessionSubsystem.nativePtr to one
/// internally consistent ARKit ARFrame.
///
/// Each successful sample copies native face geometry immediately but only
/// retains the frame's CVPixelBuffer. JPEG encoding is deferred until the
/// controller selects its single anchor frame. ProjectedVertices preserve the
/// ARFaceGeometry vertex order and use portrait_unmirrored_normalized
/// coordinates (origin top-left, +Y down).
/// </summary>
[DefaultExecutionOrder(-150)]
public sealed class ARKitUnifiedFaceNativeCaptureProvider :
    MonoBehaviour,
    IUnifiedFaceNativeCaptureProvider
{
    private const double MaximumBrokerTimestampDeltaMs = 1.0;
    private const int MaximumVertexCount = 4096;
    private const int MaximumTriangleIndexCount = 32768;
    private const float JpegQuality = 0.94f;
    private const string AvailableCapabilityId =
        "arkit_native_session_v1_current_frame";
    private const string UnavailableCapabilityId =
        "arkit_native_session_v1_unavailable";

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeSampleInfo
    {
        public ulong token;
        public double frameTimestampSeconds;
        public int imageWidth;
        public int imageHeight;
        public int vertexCount;
        public int triangleIndexCount;
        public int textureCoordinateCount;
        public int projectedVertexCount;
    }

#if UNITY_IOS && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern int AuraUnifiedFaceCapture_IsSessionAvailable(
        IntPtr nativeSessionPtr);

    [DllImport("__Internal")]
    private static extern int AuraUnifiedFaceCapture_TryRetainCurrentFrame(
        IntPtr nativeSessionPtr,
        out NativeSampleInfo sampleInfo);

    [DllImport("__Internal")]
    private static extern int AuraUnifiedFaceCapture_CopyVertices(
        ulong token,
        [Out] float[] destination,
        int floatCount);

    [DllImport("__Internal")]
    private static extern int AuraUnifiedFaceCapture_CopyProjectedVertices(
        ulong token,
        [Out] float[] destination,
        int floatCount);

    [DllImport("__Internal")]
    private static extern int AuraUnifiedFaceCapture_CopyTextureCoordinates(
        ulong token,
        [Out] float[] destination,
        int floatCount);

    [DllImport("__Internal")]
    private static extern int AuraUnifiedFaceCapture_CopyTriangleIndices(
        ulong token,
        [Out] int[] destination,
        int indexCount);

    [DllImport("__Internal")]
    private static extern int AuraUnifiedFaceCapture_PersistJpeg(
        ulong token,
        string utf8Path,
        float quality);

    [DllImport("__Internal")]
    private static extern void AuraUnifiedFaceCapture_Release(ulong token);

    [DllImport("__Internal")]
    private static extern void AuraUnifiedFaceCapture_Reset();
#endif

    [SerializeField] private ARSession arSession;
    [SerializeField] private FaceCameraFrameBroker frameBroker;

    private FaceCameraFrameBroker subscribedBroker;

    public bool IsAvailable
    {
        get
        {
#if UNITY_IOS && !UNITY_EDITOR
            RefreshReferences();
            IntPtr nativeSessionPtr = ResolveNativeSessionPtr();
            if (nativeSessionPtr == IntPtr.Zero)
            {
                return false;
            }

            try
            {
                return AuraUnifiedFaceCapture_IsSessionAvailable(
                    nativeSessionPtr) == 1;
            }
            catch (Exception exception)
                when (exception is DllNotFoundException
                    || exception is EntryPointNotFoundException)
            {
                return false;
            }
#else
            return false;
#endif
        }
    }

    public string CapabilityId =>
        IsAvailable ? AvailableCapabilityId : UnavailableCapabilityId;

    public void Configure(
        ARSession session,
        FaceCameraFrameBroker broker)
    {
        arSession = session;
        frameBroker = broker;
        SubscribeBroker();
    }

    public bool TryGetSynchronizedSample(
        ARFace face,
        out UnifiedFaceNativeCaptureSample sample)
    {
        sample = null;
#if UNITY_IOS && !UNITY_EDITOR
        if (face == null || face.trackingState != TrackingState.Tracking)
        {
            return false;
        }

        RefreshReferences();
        SubscribeBroker();
        IntPtr nativeSessionPtr = ResolveNativeSessionPtr();
        if (nativeSessionPtr == IntPtr.Zero || frameBroker == null)
        {
            return false;
        }

        NativeSampleInfo info;
        int result;
        try
        {
            result = AuraUnifiedFaceCapture_TryRetainCurrentFrame(
                nativeSessionPtr,
                out info);
        }
        catch (Exception exception)
            when (exception is DllNotFoundException
                || exception is EntryPointNotFoundException)
        {
            return false;
        }

        if (result != 1 || !IsValidSampleInfo(info))
        {
            if (result == 1 && info.token != 0)
            {
                AuraUnifiedFaceCapture_Release(info.token);
            }
            return false;
        }

        try
        {
            double nativeTimestampMs = info.frameTimestampSeconds * 1000.0;
            if (!frameBroker.TryResolveFrameMetadata(
                    nativeTimestampMs,
                    MaximumBrokerTimestampDeltaMs,
                    out FaceCameraFrameMetadata cameraMetadata))
            {
                return false;
            }

            float[] nativeVertices = new float[info.vertexCount * 3];
            float[] projectedVertices = new float[info.projectedVertexCount * 2];
            float[] textureCoordinates =
                new float[info.textureCoordinateCount * 2];
            int[] triangleIndices = new int[info.triangleIndexCount];
            if (AuraUnifiedFaceCapture_CopyVertices(
                    info.token,
                    nativeVertices,
                    nativeVertices.Length) != 1
                || AuraUnifiedFaceCapture_CopyProjectedVertices(
                    info.token,
                    projectedVertices,
                    projectedVertices.Length) != 1
                || AuraUnifiedFaceCapture_CopyTextureCoordinates(
                    info.token,
                    textureCoordinates,
                    textureCoordinates.Length) != 1
                || AuraUnifiedFaceCapture_CopyTriangleIndices(
                    info.token,
                    triangleIndices,
                    triangleIndices.Length) != 1)
            {
                return false;
            }

            Vector3[] vertices = new Vector3[info.vertexCount];
            Vector2[] portraitProjectedVertices =
                new Vector2[info.projectedVertexCount];
            Vector2[] uvs = new Vector2[info.textureCoordinateCount];
            for (int index = 0; index < vertices.Length; index += 1)
            {
                int offset = index * 3;
                vertices[index] = new Vector3(
                    nativeVertices[offset],
                    nativeVertices[offset + 1],
                    nativeVertices[offset + 2]);
            }
            for (int index = 0;
                index < portraitProjectedVertices.Length;
                index += 1)
            {
                int offset = index * 2;
                portraitProjectedVertices[index] = new Vector2(
                    projectedVertices[offset],
                    projectedVertices[offset + 1]);
            }
            for (int index = 0; index < uvs.Length; index += 1)
            {
                int offset = index * 2;
                uvs[index] = new Vector2(
                    textureCoordinates[offset],
                    textureCoordinates[offset + 1]);
            }

            Face3DMeshSnapshot meshSnapshot = new Face3DMeshSnapshot(
                vertices,
                triangleIndices,
                uvs,
                info.frameTimestampSeconds);
            double observedAtMs =
                Time.realtimeSinceStartupAsDouble * 1000.0;
            string nativeFrameToken =
                "arkit-frame-"
                + info.frameTimestampSeconds.ToString(
                    "F9",
                    CultureInfo.InvariantCulture);
            sample = new UnifiedFaceNativeCaptureSample(
                cameraMetadata.CameraFrameToken,
                cameraMetadata.SensorTimestampMs,
                cameraMetadata.ObservedAtMs,
                nativeFrameToken,
                nativeTimestampMs,
                observedAtMs,
                string.Empty,
                "jpg",
                info.imageWidth,
                info.imageHeight,
                info.token,
                meshSnapshot,
                portraitProjectedVertices);
            return true;
        }
        finally
        {
            if (sample == null)
            {
                AuraUnifiedFaceCapture_Release(info.token);
            }
        }
#else
        return false;
#endif
    }

    public bool TryPersistImage(
        UnifiedFaceNativeCaptureSample sample,
        out UnifiedFaceNativeCaptureSample persistedSample)
    {
        persistedSample = null;
#if UNITY_IOS && !UNITY_EDITOR
        if (sample == null || sample.NativeSampleHandle == 0)
        {
            return false;
        }

        string fileName =
            "aura_unified_face_"
            + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                .ToString(CultureInfo.InvariantCulture)
            + "_"
            + sample.NativeSampleHandle.ToString(CultureInfo.InvariantCulture)
            + ".jpg";
        string path = Path.Combine(
            Application.temporaryCachePath,
            fileName);
        try
        {
            if (AuraUnifiedFaceCapture_PersistJpeg(
                    sample.NativeSampleHandle,
                    path,
                    JpegQuality) != 1)
            {
                return false;
            }
        }
        catch (Exception exception)
            when (exception is DllNotFoundException
                || exception is EntryPointNotFoundException)
        {
            return false;
        }

        persistedSample = sample.WithPersistedImage(
            new Uri(path).AbsoluteUri,
            "jpg",
            sample.ImageWidth,
            sample.ImageHeight);
        return true;
#else
        return false;
#endif
    }

    public void ReleaseSample(UnifiedFaceNativeCaptureSample sample)
    {
#if UNITY_IOS && !UNITY_EDITOR
        if (sample != null && sample.NativeSampleHandle != 0)
        {
            try
            {
                AuraUnifiedFaceCapture_Release(sample.NativeSampleHandle);
            }
            catch (Exception exception)
                when (exception is DllNotFoundException
                    || exception is EntryPointNotFoundException)
            {
                // The provider already reports unavailable when native symbols
                // are absent. Release must not replace the capture failure.
            }
        }
#endif
    }

    public void Reset()
    {
#if UNITY_IOS && !UNITY_EDITOR
        try
        {
            AuraUnifiedFaceCapture_Reset();
        }
        catch (Exception exception)
            when (exception is DllNotFoundException
                || exception is EntryPointNotFoundException)
        {
            // A missing native symbol makes the provider unavailable. Reset remains
            // idempotent so session cleanup never masks the original failure.
        }
#endif
    }

    private void Awake()
    {
        RefreshReferences();
        SubscribeBroker();
    }

    private void OnEnable()
    {
        RefreshReferences();
        SubscribeBroker();
    }

    private void OnDisable()
    {
        UnsubscribeBroker();
        Reset();
    }

    private void OnDestroy()
    {
        UnsubscribeBroker();
        Reset();
    }

    private void Update()
    {
        RefreshReferences();
        SubscribeBroker();
    }

    private void RefreshReferences()
    {
        if (arSession == null)
        {
            arSession = FindFirstObjectByType<ARSession>();
        }
        if (frameBroker == null)
        {
            frameBroker = FaceCameraFrameBroker.Instance;
        }
    }

    private void SubscribeBroker()
    {
        if (frameBroker == null || subscribedBroker == frameBroker)
        {
            return;
        }

        UnsubscribeBroker();
        subscribedBroker = frameBroker;
        // The broker acquires only while it has at least one subscriber. This
        // no-op subscription keeps its short timestamp/token history populated.
        subscribedBroker.FrameReceived += OnBrokerFrame;
    }

    private void UnsubscribeBroker()
    {
        if (subscribedBroker != null)
        {
            subscribedBroker.FrameReceived -= OnBrokerFrame;
            subscribedBroker = null;
        }
    }

    private static void OnBrokerFrame(FaceCameraFrame frame)
    {
        // Metadata is copied by FaceCameraFrameBroker before callbacks run.
    }

    private IntPtr ResolveNativeSessionPtr()
    {
        return arSession != null && arSession.subsystem != null
            ? arSession.subsystem.nativePtr
            : IntPtr.Zero;
    }

    private static bool IsValidSampleInfo(NativeSampleInfo info)
    {
        return info.token != 0
            && IsFiniteNonNegative(info.frameTimestampSeconds)
            && info.imageWidth > 0
            && info.imageHeight > 0
            && info.vertexCount > 0
            && info.vertexCount <= MaximumVertexCount
            && info.projectedVertexCount == info.vertexCount
            && info.textureCoordinateCount == info.vertexCount
            && info.triangleIndexCount > 0
            && info.triangleIndexCount <= MaximumTriangleIndexCount
            && info.triangleIndexCount % 3 == 0;
    }

    private static bool IsFiniteNonNegative(double value)
    {
        return !double.IsNaN(value)
            && !double.IsInfinity(value)
            && value >= 0.0;
    }
}
