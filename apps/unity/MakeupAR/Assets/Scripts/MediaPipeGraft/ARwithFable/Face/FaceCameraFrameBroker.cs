using System;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace ARMakeup.Face
{
    /// <summary>
    /// Immutable metadata copied from one broker-owned XRCpuImage.
    ///
    /// Unlike <see cref="FaceCameraFrame"/>, this value does not borrow the image and
    /// can safely be retained. Native ARKit integrations use the short history exposed
    /// by <see cref="FaceCameraFrameBroker.TryResolveFrameMetadata"/> to prove that an
    /// ARFrame timestamp identifies the same camera sample as a broker token.
    /// </summary>
    public readonly struct FaceCameraFrameMetadata
    {
        public FaceCameraFrameMetadata(
            string cameraFrameToken,
            long sequence,
            double sensorTimestampMs,
            double observedAtMs)
        {
            CameraFrameToken = cameraFrameToken;
            Sequence = sequence;
            SensorTimestampMs = sensorTimestampMs;
            ObservedAtMs = observedAtMs;
        }

        public string CameraFrameToken { get; }
        public long Sequence { get; }
        public double SensorTimestampMs { get; }
        public double ObservedAtMs { get; }
    }

    /// <summary>
    /// A synchronously borrowed AR camera CPU image.
    ///
    /// The broker owns <see cref="Image"/> and disposes it immediately after all
    /// subscribers return. Subscribers may convert/copy the image during the callback,
    /// but must never retain or dispose it.
    ///
    /// <see cref="CameraFrameToken"/> identifies only this acquired XRCpuImage. It is
    /// deliberately not an ARFrame/ARFace native-frame token and must not be used to
    /// claim image-to-face-anchor identity.
    /// </summary>
    public readonly struct FaceCameraFrame
    {
        public FaceCameraFrame(
            XRCpuImage image,
            long sequence,
            double sensorTimestampMs,
            double observedAtMs)
        {
            Image = image;
            Sequence = sequence;
            SensorTimestampMs = sensorTimestampMs;
            ObservedAtMs = observedAtMs;
            CameraFrameToken = "xr-camera-cpu-" + sequence.ToString();
        }

        public XRCpuImage Image { get; }
        public long Sequence { get; }
        public double SensorTimestampMs { get; }
        public double ObservedAtMs { get; }
        public string CameraFrameToken { get; }
    }

    /// <summary>
    /// The only runtime owner of ARCameraManager.TryAcquireLatestCpuImage.
    /// It fans the same borrowed image out synchronously to every camera-frame consumer.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class FaceCameraFrameBroker : MonoBehaviour
    {
        private const int MetadataHistoryCapacity = 32;

        public static FaceCameraFrameBroker Instance { get; private set; }

        [SerializeField] private ARCameraManager cameraManager;

        private double lastSensorTimestampSeconds = double.NegativeInfinity;
        private long sequence;
        private readonly FaceCameraFrameMetadata[] metadataHistory =
            new FaceCameraFrameMetadata[MetadataHistoryCapacity];
        private int metadataHistoryCount;
        private int metadataHistoryWriteIndex;

        public event Action<FaceCameraFrame> FrameReceived;

        public bool IsCameraAvailable => cameraManager != null && cameraManager.enabled;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Debug.LogWarning("[FaceCameraFrameBroker] duplicate broker disabled");
                enabled = false;
                return;
            }

            Instance = this;
            RefreshCameraManager();
        }

        private void OnDestroy()
        {
            ClearMetadataHistory();
            if (Instance == this)
            {
                Instance = null;
            }
        }

        public void Configure(ARCameraManager manager)
        {
            if (cameraManager != manager)
            {
                ClearMetadataHistory();
                lastSensorTimestampSeconds = double.NegativeInfinity;
            }
            cameraManager = manager;
        }

        /// <summary>
        /// Resolves the closest recent broker token using the camera sensor clock.
        /// The caller owns the tolerance and must keep it tight enough to reject an
        /// adjacent camera frame. Ties resolve to the newest broker sequence.
        /// </summary>
        public bool TryResolveFrameMetadata(
            double sensorTimestampMs,
            double maximumAbsoluteDeltaMs,
            out FaceCameraFrameMetadata metadata)
        {
            metadata = default;
            if (!IsFiniteNonNegative(sensorTimestampMs)
                || !IsFiniteNonNegative(maximumAbsoluteDeltaMs)
                || metadataHistoryCount <= 0)
            {
                return false;
            }

            double bestDeltaMs = double.PositiveInfinity;
            long bestSequence = long.MinValue;
            bool found = false;
            for (int offset = 0; offset < metadataHistoryCount; offset += 1)
            {
                int index =
                    (metadataHistoryWriteIndex - 1 - offset + MetadataHistoryCapacity)
                    % MetadataHistoryCapacity;
                FaceCameraFrameMetadata candidate = metadataHistory[index];
                if (!IsFiniteNonNegative(candidate.SensorTimestampMs))
                {
                    continue;
                }

                double deltaMs = Math.Abs(
                    candidate.SensorTimestampMs - sensorTimestampMs);
                if (deltaMs < bestDeltaMs
                    || (deltaMs == bestDeltaMs
                        && candidate.Sequence > bestSequence))
                {
                    bestDeltaMs = deltaMs;
                    bestSequence = candidate.Sequence;
                    metadata = candidate;
                    found = true;
                }
            }

            return found && bestDeltaMs <= maximumAbsoluteDeltaMs;
        }

        private void Update()
        {
            if (FrameReceived == null)
            {
                return;
            }

            RefreshCameraManager();
            if (cameraManager == null
                || !cameraManager.TryAcquireLatestCpuImage(out XRCpuImage image))
            {
                return;
            }

            try
            {
                if (image.timestamp == lastSensorTimestampSeconds)
                {
                    return;
                }

                lastSensorTimestampSeconds = image.timestamp;
                sequence += 1;
                double observedAtMs = Time.realtimeSinceStartupAsDouble * 1000.0;
                double sensorTimestampMs =
                    !double.IsNaN(image.timestamp)
                    && !double.IsInfinity(image.timestamp)
                    && image.timestamp >= 0.0
                        ? image.timestamp * 1000.0
                        : double.NaN;
                FaceCameraFrame frame = new FaceCameraFrame(
                    image,
                    sequence,
                    sensorTimestampMs,
                    observedAtMs);
                RecordMetadata(new FaceCameraFrameMetadata(
                    frame.CameraFrameToken,
                    frame.Sequence,
                    frame.SensorTimestampMs,
                    frame.ObservedAtMs));

                Delegate[] subscribers = FrameReceived.GetInvocationList();
                for (int index = 0; index < subscribers.Length; index += 1)
                {
                    try
                    {
                        ((Action<FaceCameraFrame>)subscribers[index]).Invoke(frame);
                    }
                    catch (Exception exception)
                    {
                        Debug.LogWarning(
                            "[FaceCameraFrameBroker] subscriber_failed type="
                            + subscribers[index].Method.DeclaringType?.Name
                            + " error="
                            + exception.GetType().Name);
                    }
                }
            }
            finally
            {
                image.Dispose();
            }
        }

        private void RefreshCameraManager()
        {
            if (cameraManager == null)
            {
                cameraManager = FindFirstObjectByType<ARCameraManager>();
            }
        }

        private void RecordMetadata(FaceCameraFrameMetadata metadata)
        {
            metadataHistory[metadataHistoryWriteIndex] = metadata;
            metadataHistoryWriteIndex =
                (metadataHistoryWriteIndex + 1) % MetadataHistoryCapacity;
            metadataHistoryCount = Math.Min(
                metadataHistoryCount + 1,
                MetadataHistoryCapacity);
        }

        private void ClearMetadataHistory()
        {
            Array.Clear(metadataHistory, 0, metadataHistory.Length);
            metadataHistoryCount = 0;
            metadataHistoryWriteIndex = 0;
        }

        private static bool IsFiniteNonNegative(double value)
        {
            return !double.IsNaN(value)
                && !double.IsInfinity(value)
                && value >= 0.0;
        }
    }
}
