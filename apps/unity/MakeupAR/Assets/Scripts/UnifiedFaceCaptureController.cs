using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using ARMakeup.Face;
using Aura.Face3D;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

/// <summary>
/// A native capture bridge must implement this interface by reading one ARFrame payload
/// that contains both captured-image metadata and the corresponding face anchor.
/// ARFoundation observation time is intentionally not accepted as a substitute.
/// </summary>
public interface IUnifiedFaceNativeCaptureProvider
{
    bool IsAvailable { get; }
    string CapabilityId { get; }

    bool TryGetSynchronizedSample(
        ARFace face,
        out UnifiedFaceNativeCaptureSample sample);

    bool TryPersistImage(
        UnifiedFaceNativeCaptureSample sample,
        out UnifiedFaceNativeCaptureSample persistedSample);

    void ReleaseSample(UnifiedFaceNativeCaptureSample sample);
    void Reset();
}

public sealed class UnifiedFaceNativeCaptureSample
{
    private readonly Vector2[] projectedVertices;

    public UnifiedFaceNativeCaptureSample(
        string cameraFrameToken,
        double cameraSensorTimestampMs,
        double cameraObservedAtMs,
        string faceNativeFrameToken,
        double faceNativeTimestampMs,
        double faceObservedAtMs,
        string imageUri,
        string imageFormat,
        int imageWidth,
        int imageHeight,
        ulong nativeSampleHandle,
        Face3DMeshSnapshot meshSnapshot,
        IEnumerable<Vector2> projectedVertices)
    {
        CameraFrameToken = cameraFrameToken;
        CameraSensorTimestampMs = cameraSensorTimestampMs;
        CameraObservedAtMs = cameraObservedAtMs;
        FaceNativeFrameToken = faceNativeFrameToken;
        FaceNativeTimestampMs = faceNativeTimestampMs;
        FaceObservedAtMs = faceObservedAtMs;
        ImageUri = imageUri;
        ImageFormat = imageFormat;
        ImageWidth = imageWidth;
        ImageHeight = imageHeight;
        NativeSampleHandle = nativeSampleHandle;
        MeshSnapshot = meshSnapshot;
        this.projectedVertices = projectedVertices == null
            ? Array.Empty<Vector2>()
            : new List<Vector2>(projectedVertices).ToArray();
    }

    public string CameraFrameToken { get; }
    public double CameraSensorTimestampMs { get; }
    public double CameraObservedAtMs { get; }
    public string FaceNativeFrameToken { get; }
    public double FaceNativeTimestampMs { get; }
    public double FaceObservedAtMs { get; }
    public string ImageUri { get; }
    public string ImageFormat { get; }
    public int ImageWidth { get; }
    public int ImageHeight { get; }
    public ulong NativeSampleHandle { get; }
    public Face3DMeshSnapshot MeshSnapshot { get; }
    public IReadOnlyList<Vector2> ProjectedVertices => projectedVertices;
    public string ProjectedVertexCoordinateSpace =>
        "portrait_unmirrored_normalized";

    public UnifiedFaceNativeCaptureSample WithPersistedImage(
        string imageUri,
        string imageFormat,
        int imageWidth,
        int imageHeight)
    {
        return new UnifiedFaceNativeCaptureSample(
            CameraFrameToken,
            CameraSensorTimestampMs,
            CameraObservedAtMs,
            FaceNativeFrameToken,
            FaceNativeTimestampMs,
            FaceObservedAtMs,
            imageUri,
            imageFormat,
            imageWidth,
            imageHeight,
            NativeSampleHandle,
            MeshSnapshot,
            projectedVertices);
    }
}

/// <summary>
/// Unified Face Capture v2 coordinator.
///
/// The 5-of-8 / 500 ms product candidate and exact 1/3/5/8/12/30 diagnostics
/// share one immutable validator and collector. iOS resolves the ARKit session through
/// XRSessionSubsystem.nativePtr and fails closed when that versioned native ABI, the
/// current ARFrame, or a tight broker timestamp match is unavailable.
/// </summary>
public sealed class UnifiedFaceCaptureController : MonoBehaviour
{
    private const string SemanticMapResourcePath = "Face3D/ARKitFaceSemanticMapV1";
    private const int RequestedFaceCount = 2;
    private const float MaximumYawDegrees = 5.0f;
    private const float MaximumPitchDegrees = 7.0f;
    private const float MaximumRollDegrees = 5.0f;
    private const float MaximumNeutralExpressionActivation = 0.5f;
    private const double HairlineFinalizationWaitSeconds = 0.75;
    private const double HairlineSegmentationTimestampToleranceMs = 1.0;
    private const double HairlineAdvisoryMaximumAgeMs = 600.0;
    private const double HairlineAdvisoryStableSeconds = 0.4;
    private const double GateRefreshIntervalSeconds = 0.1;
    private const int MediaPipeLeftFaceIndex = 234;
    private const int MediaPipeRightFaceIndex = 454;
    private const int MediaPipeForeheadTopIndex = 10;
    private const int MediaPipeGlabellaIndexA = 9;
    private const int MediaPipeGlabellaIndexB = 151;

    [Serializable]
    private sealed class CancelPayload
    {
        public string requestId;
        public string reason;
    }

    private sealed class CaptureCandidate
    {
        public CaptureCandidate(
            UnifiedFaceNativeCaptureSample sample,
            Vector3 pose)
        {
            Sample = sample;
            Pose = pose;
        }

        public UnifiedFaceNativeCaptureSample Sample { get; }
        public Vector3 Pose { get; }
    }

    [SerializeField] private ARFaceManager faceManager;
    [SerializeField] private ARCameraManager cameraManager;
    [SerializeField] private FaceCameraFrameBroker frameBroker;
    [SerializeField] private RNBridge rnBridge;
    [SerializeField] private MonoBehaviour nativeCaptureProviderBehaviour;
    [SerializeField] private TextAsset semanticMapJson;

    private ARFaceManager subscribedFaceManager;
    private IUnifiedFaceNativeCaptureProvider nativeCaptureProvider;
    private UnifiedFaceCaptureRequest preparedRequest;
    private UnifiedFaceCaptureRequest activeRequest;
    private UnifiedFace3DProfileCollector collector;
    private Face3DSemanticMap semanticMap;
    private Face3DExpressionGatePolicy expressionGatePolicy;
    private UnifiedFaceNativeCaptureSample anchorSample;
    private FaceLandmarkSource landmarkSource;
    private SegmentationSource segmentationSource;
    private readonly HashSet<string> acceptedNativeFaceTokens =
        new HashSet<string>(StringComparer.Ordinal);
    private readonly HashSet<string> sessionWarnings =
        new HashSet<string>(StringComparer.Ordinal);
    private bool sessionActive;
    private bool collectionFinalizationPending;
    private int previousRequestedMaximumFaceCount = 1;
    private bool faceCountRestored = true;
    private double burstStartedAtSeconds;
    private double collectionEndedAtSeconds;
    private double finalizationDeadlineSeconds;
    private double maximumObservedNativeDeltaMs;
    private Face3DProfileV2 pendingProfile;
    private CaptureCandidate fixedAnchorCandidate;
    private bool fixedAnchorHasAcceptedSegmentationToken;
    private string advisoryCandidateStatus =
        HairlineDetectionContract.AdvisoryUnknown;
    private string advisoryStableStatus =
        HairlineDetectionContract.AdvisoryUnknown;
    private double advisoryCandidateStartedAtSeconds;
    private double advisoryStableStartedAtSeconds;
    private double nextGateRefreshAtSeconds;

    public void Configure(
        ARFaceManager manager,
        ARCameraManager camera,
        FaceCameraFrameBroker broker,
        RNBridge bridge)
    {
        UnsubscribeFaceManager();
        faceManager = manager;
        cameraManager = camera;
        frameBroker = broker;
        rnBridge = bridge;
        ResolveNativeProvider();
        SubscribeFaceManager();
    }

    public void ConfigureNativeProvider(IUnifiedFaceNativeCaptureProvider provider)
    {
        nativeCaptureProvider = provider;
        nativeCaptureProviderBehaviour = provider as MonoBehaviour;
    }

    public void PrepareUnifiedFaceCaptureJson(string json)
    {
        if (!UnifiedFaceCaptureRequestValidator.TryParseJson(
                json,
                out preparedRequest,
                out string reason))
        {
            SendBlocked(ExtractRequestId(json), "capture_failed", reason);
            return;
        }

        RefreshSceneReferences();
        EnsureAdvisorySources();
        ResetHairlineAdvisoryState(
            Time.realtimeSinceStartupAsDouble);
        nextGateRefreshAtSeconds =
            Time.realtimeSinceStartupAsDouble
            + GateRefreshIntervalSeconds;
        SendGate(preparedRequest.RequestId);
    }

    public void StartUnifiedFaceCaptureJson(string json)
    {
        if (!UnifiedFaceCaptureRequestValidator.TryParseJson(
                json,
                out UnifiedFaceCaptureRequest request,
                out string reason))
        {
            SendBlocked(ExtractRequestId(json), "capture_failed", reason);
            return;
        }

        if (sessionActive)
        {
            SendCancelled(activeRequest.RequestId, "superseded");
            FinishSession();
        }

        RefreshSceneReferences();
        ResolveNativeProvider();
        EnsureAdvisorySources();
        preparedRequest = request;

        if (faceManager == null || cameraManager == null || frameBroker == null)
        {
            SendBlocked(request.RequestId, "camera_unavailable", "ar_camera_runtime_unavailable");
            return;
        }

        if (nativeCaptureProvider == null || !nativeCaptureProvider.IsAvailable)
        {
            SendBlocked(
                request.RequestId,
                "native_face_frame_sync_unavailable",
                nativeCaptureProvider != null
                    ? NormalizeDetail(nativeCaptureProvider.CapabilityId)
                    : "unavailable_arfoundation_public_api",
                "native_arkit_frame_provider_required");
            return;
        }
        ReleaseFixedAnchorCandidate();
        nativeCaptureProvider.Reset();

        if (!LoadSemanticMap(out reason))
        {
            SendBlocked(request.RequestId, "capture_failed", reason);
            return;
        }

        activeRequest = request;
        expressionGatePolicy =
            new Face3DExpressionGatePolicy(MaximumNeutralExpressionActivation);
        burstStartedAtSeconds = Time.realtimeSinceStartupAsDouble;
        collector = new UnifiedFace3DProfileCollector(request, burstStartedAtSeconds);
        acceptedNativeFaceTokens.Clear();
        sessionWarnings.Clear();
        anchorSample = null;
        fixedAnchorCandidate = null;
        fixedAnchorHasAcceptedSegmentationToken = false;
        pendingProfile = null;
        collectionFinalizationPending = false;
        collectionEndedAtSeconds = 0.0;
        finalizationDeadlineSeconds = 0.0;
        maximumObservedNativeDeltaMs = 0.0;
        previousRequestedMaximumFaceCount =
            Math.Max(1, faceManager.requestedMaximumFaceCount);
        faceCountRestored = false;
        faceManager.requestedMaximumFaceCount = RequestedFaceCount;
        sessionActive = true;
        SubscribeFaceManager();
        SendGate(request.RequestId);
        ProcessLatestFaceFrame();
    }

    public void CancelUnifiedFaceCaptureJson(string json)
    {
        CancelPayload payload = null;
        try
        {
            payload = JsonUtility.FromJson<CancelPayload>(json ?? string.Empty);
        }
        catch (Exception)
        {
            // Invalid cancellation must never cancel another request.
        }

        if (!sessionActive
            || payload == null
            || string.IsNullOrWhiteSpace(payload.requestId)
            || !string.Equals(
                payload.requestId.Trim(),
                activeRequest.RequestId,
                StringComparison.Ordinal))
        {
            return;
        }

        SendCancelled(
            activeRequest.RequestId,
            string.IsNullOrWhiteSpace(payload.reason)
                ? "user_cancelled"
                : payload.reason.Trim());
        FinishSession();
    }

    private void Awake()
    {
        RefreshSceneReferences();
        ResolveNativeProvider();
    }

    private void OnEnable()
    {
        RefreshSceneReferences();
        ResolveNativeProvider();
        SubscribeFaceManager();
    }

    private void OnDisable()
    {
        FinishSession();
        UnsubscribeFaceManager();
    }

    private void Update()
    {
        if (!sessionActive)
        {
            if (preparedRequest != null
                && Time.realtimeSinceStartupAsDouble >= nextGateRefreshAtSeconds)
            {
                nextGateRefreshAtSeconds =
                    Time.realtimeSinceStartupAsDouble
                    + GateRefreshIntervalSeconds;
                SendGate(preparedRequest.RequestId);
            }
            return;
        }

        if (collectionFinalizationPending)
        {
            TryFinalizePendingCollection(
                Time.realtimeSinceStartupAsDouble);
            return;
        }

        // ARTrackableManager callbacks can run before the broker's Update. Sampling
        // once more here lets the broker record the matching XRCpuImage timestamp
        // first; native frame tokens deduplicate this path against the callback.
        ProcessLatestFaceFrame();
        if (!sessionActive)
        {
            return;
        }

        double now = Time.realtimeSinceStartupAsDouble;
        if (collector.ShouldStop(now))
        {
            BeginCollectionFinalization(now);
        }
    }

    private void OnFaceTrackablesChanged(ARTrackablesChangedEventArgs<ARFace> eventArgs)
    {
        if (sessionActive)
        {
            ProcessLatestFaceFrame();
        }
        else if (preparedRequest != null
            && Time.realtimeSinceStartupAsDouble
                >= nextGateRefreshAtSeconds)
        {
            nextGateRefreshAtSeconds =
                Time.realtimeSinceStartupAsDouble
                + GateRefreshIntervalSeconds;
            SendGate(preparedRequest.RequestId);
        }
    }

    private void ProcessLatestFaceFrame()
    {
        if (!sessionActive || collectionFinalizationPending)
        {
            return;
        }

        ARFace trackingFace = null;
        int trackingFaceCount = 0;
        foreach (ARFace face in faceManager.trackables)
        {
            if (face != null && face.trackingState == TrackingState.Tracking)
            {
                trackingFaceCount += 1;
                trackingFace = trackingFace ?? face;
            }
        }

        Face3DTrackingFaceGateStatus faceGate =
            Face3DTrackingFaceGate.Evaluate(trackingFaceCount);
        if (faceGate == Face3DTrackingFaceGateStatus.Multiple)
        {
            SendBlocked(
                activeRequest.RequestId,
                "multiple_faces",
                "multiple_tracking_faces");
            FinishSession();
            return;
        }
        if (faceGate != Face3DTrackingFaceGateStatus.Ready || trackingFace == null)
        {
            return;
        }

        Transform cameraTransform = ResolveCameraTransform();
        if (cameraTransform == null)
        {
            return;
        }

        Vector3 pose = Face3DHeadPose.CameraRelativeEulerDegrees(
            cameraTransform.rotation,
            trackingFace.transform.rotation);
        if (!IsPoseReady(pose))
        {
            return;
        }

        Face3DExpressionGateResult expression = Face3DNeutralExpressionGate.Evaluate(
            ARKitFaceExpressionSignalReader.Read(faceManager, trackingFace),
            expressionGatePolicy);
        if (expression.Status == Face3DExpressionGateStatus.NonNeutral)
        {
            sessionWarnings.Add("neutral_expression_frame_rejected");
            return;
        }
        if (expression.Status == Face3DExpressionGateStatus.SignalsUnavailable)
        {
            sessionWarnings.Add("neutral_expression_signals_unavailable");
        }

        IUnifiedFaceNativeCaptureProvider provider = nativeCaptureProvider;
        if (provider == null
            || !provider.TryGetSynchronizedSample(
                trackingFace,
                out UnifiedFaceNativeCaptureSample nativeSample))
        {
            sessionWarnings.Add("native_face_frame_sample_rejected");
            return;
        }

        bool retainedByController = false;
        try
        {
            if (!TryValidateNativeSample(nativeSample, out double nativeDeltaMs))
            {
                sessionWarnings.Add("native_face_frame_sample_rejected");
                return;
            }
            if (!acceptedNativeFaceTokens.Add(nativeSample.FaceNativeFrameToken))
            {
                return;
            }

            Face3DEvaluationResult evaluation =
                Face3DMetricEvaluator.Evaluate(
                    nativeSample.MeshSnapshot,
                    semanticMap);
            if (!evaluation.IsValid)
            {
                sessionWarnings.Add(
                    string.IsNullOrWhiteSpace(evaluation.Reason)
                        ? "face3d_evaluation_blocked"
                        : evaluation.Reason);
                return;
            }

            maximumObservedNativeDeltaMs =
                Math.Max(maximumObservedNativeDeltaMs, nativeDeltaMs);
            Face3DCollectionUpdate update = collector.AddEvaluation(
                evaluation,
                Time.realtimeSinceStartupAsDouble);
            if (update.Status == Face3DCollectionAddStatus.RejectedTopologyChanged)
            {
                SendBlocked(
                    activeRequest.RequestId,
                    "capture_failed",
                    update.Reason);
                FinishSession();
                return;
            }

            bool acceptedEvaluation =
                update.Status == Face3DCollectionAddStatus.Accepted
                || update.Status
                    == Face3DCollectionAddStatus.AcceptedTargetReached;
            int anchorOrdinal = Math.Min(
                4,
                activeRequest.Policy.TargetValidFrames);
            if (acceptedEvaluation
                && collector.ValidFrameCount >= anchorOrdinal)
            {
                ResolveAdvisorySources();
                bool segmentationAccepted =
                    segmentationSource != null
                    && segmentationSource.HasAcceptedFrameToken(
                        nativeSample.CameraFrameToken);
                if (fixedAnchorCandidate == null)
                {
                    fixedAnchorCandidate =
                        new CaptureCandidate(nativeSample, pose);
                    fixedAnchorHasAcceptedSegmentationToken =
                        segmentationAccepted;
                    retainedByController = true;
                }
                else if (!fixedAnchorHasAcceptedSegmentationToken
                    && segmentationAccepted)
                {
                    provider.ReleaseSample(fixedAnchorCandidate.Sample);
                    fixedAnchorCandidate =
                        new CaptureCandidate(nativeSample, pose);
                    fixedAnchorHasAcceptedSegmentationToken = true;
                    retainedByController = true;
                }
            }

            if (update.ShouldStop)
            {
                BeginCollectionFinalization(
                    Time.realtimeSinceStartupAsDouble);
            }
        }
        finally
        {
            if (!retainedByController)
            {
                provider.ReleaseSample(nativeSample);
            }
        }
    }

    private bool TryValidateNativeSample(
        UnifiedFaceNativeCaptureSample sample,
        out double absoluteDeltaMs)
    {
        absoluteDeltaMs = double.PositiveInfinity;
        if (sample == null
            || string.IsNullOrWhiteSpace(sample.CameraFrameToken)
            || string.IsNullOrWhiteSpace(sample.FaceNativeFrameToken)
            || sample.NativeSampleHandle == 0
            || sample.MeshSnapshot == null
            || sample.MeshSnapshot.Vertices.Count <= 0
            || sample.MeshSnapshot.TriangleIndices.Count <= 0
            || sample.MeshSnapshot.Uvs.Count != sample.MeshSnapshot.Vertices.Count
            || sample.ProjectedVertices.Count != sample.MeshSnapshot.Vertices.Count
            || sample.ProjectedVertexCoordinateSpace
                != "portrait_unmirrored_normalized"
            || sample.ImageFormat != "jpg"
            || sample.ImageWidth <= 0
            || sample.ImageHeight <= 0
            || !IsFiniteNonNegative(sample.CameraSensorTimestampMs)
            || !IsFiniteNonNegative(sample.FaceNativeTimestampMs)
            || !IsFiniteNonNegative(sample.CameraObservedAtMs)
            || !IsFiniteNonNegative(sample.FaceObservedAtMs))
        {
            return false;
        }

        absoluteDeltaMs = Math.Abs(
            sample.CameraSensorTimestampMs - sample.FaceNativeTimestampMs);
        return absoluteDeltaMs <= activeRequest.MaxAbsFaceSensorDeltaMs;
    }

    private static bool IsPersistedImageSampleValid(
        UnifiedFaceNativeCaptureSample sample)
    {
        return sample != null
            && !string.IsNullOrWhiteSpace(sample.ImageUri)
            && sample.ImageFormat == "jpg"
            && sample.ImageWidth > 0
            && sample.ImageHeight > 0;
    }

    private void BeginCollectionFinalization(double now)
    {
        if (!sessionActive || collectionFinalizationPending)
        {
            return;
        }

        foreach (string warning in sessionWarnings)
        {
            collector.AddWarning(warning);
        }

        if (!collector.TryBuildProfile(
                now,
                out Face3DProfileV2 profile,
                out string reason))
        {
            SendBlocked(
                activeRequest.RequestId,
                reason == "insufficient_valid_frames"
                    ? "insufficient_valid_frames"
                    : "capture_failed",
                reason,
                sessionWarnings);
            FinishSession();
            return;
        }

        if (fixedAnchorCandidate == null)
        {
            SendBlocked(
                activeRequest.RequestId,
                "capture_failed",
                "synchronized_anchor_candidate_missing");
            FinishSession();
            return;
        }

        pendingProfile = profile;
        collectionEndedAtSeconds = now;
        finalizationDeadlineSeconds =
            now + HairlineFinalizationWaitSeconds;
        collectionFinalizationPending = true;
        TryFinalizePendingCollection(now);
    }

    private void TryFinalizePendingCollection(double now)
    {
        if (!sessionActive
            || !collectionFinalizationPending
            || pendingProfile == null
            || fixedAnchorCandidate == null)
        {
            return;
        }

        bool hasExactSegmentation = TryEvaluateFixedAnchorHairline(
            out SegmentationSource.SegmentationFrameSnapshot segmentationSnapshot,
            out HairlineDetectionResult hairlineResult);
        if (!hasExactSegmentation && now < finalizationDeadlineSeconds)
        {
            return;
        }

        IUnifiedFaceNativeCaptureProvider provider = nativeCaptureProvider;
        if (provider == null
            || !provider.TryPersistImage(
                fixedAnchorCandidate.Sample,
                out UnifiedFaceNativeCaptureSample persistedSample)
            || !IsPersistedImageSampleValid(persistedSample))
        {
            SendBlocked(
                activeRequest.RequestId,
                "capture_failed",
                "synchronized_anchor_image_persist_failed",
                sessionWarnings);
            FinishSession();
            return;
        }

        anchorSample = persistedSample;
        try
        {
            SendCompleted(
                pendingProfile,
                collectionEndedAtSeconds,
                hairlineResult,
                segmentationSnapshot);
        }
        finally
        {
            FinishSession();
        }
    }

    private bool TryEvaluateFixedAnchorHairline(
        out SegmentationSource.SegmentationFrameSnapshot segmentationSnapshot,
        out HairlineDetectionResult hairlineResult)
    {
        segmentationSnapshot = null;
        hairlineResult = null;
        ResolveAdvisorySources();
        if (segmentationSource == null
            || fixedAnchorCandidate == null)
        {
            return false;
        }

        UnifiedFaceNativeCaptureSample sample =
            fixedAnchorCandidate.Sample;
        if (!segmentationSource.TryCopyFrame(
                sample.CameraFrameToken,
                out SegmentationSource.SegmentationFrameSnapshot snapshot)
            || Math.Abs(
                snapshot.SensorTimestampMs
                - sample.CameraSensorTimestampMs)
                > HairlineSegmentationTimestampToleranceMs
            || !TryCreateNativeHairlineFaceReference(
                fixedAnchorCandidate,
                out HairlineFaceReference faceReference))
        {
            return false;
        }

        segmentationSnapshot = snapshot;
        hairlineResult = HairlineVisibilityEstimator.Evaluate(
            snapshot.Rgba,
            CreateHairlineMaskReference(snapshot),
            faceReference);
        return hairlineResult != null;
    }

    private bool TryCreateNativeHairlineFaceReference(
        CaptureCandidate candidate,
        out HairlineFaceReference reference)
    {
        reference = null;
        if (candidate?.Sample?.ProjectedVertices == null
            || semanticMap == null)
        {
            return false;
        }

        IReadOnlyList<Vector2> projected =
            candidate.Sample.ProjectedVertices;
        if (!TryProjectedCentroid(
                projected,
                semanticMap.MidfaceReferenceLeftIndices,
                out Vector2 left)
            || !TryProjectedCentroid(
                projected,
                semanticMap.MidfaceReferenceRightIndices,
                out Vector2 right)
            || !TryProjectedCentroid(
                projected,
                semanticMap.NasionIndices
                    ?? semanticMap.MidfaceReferenceUpperIndices,
                out Vector2 glabella))
        {
            return false;
        }

        if (left.x > right.x)
        {
            (left, right) = (right, left);
        }
        float faceWidth = right.x - left.x;
        if (!IsFiniteNormalized(left)
            || !IsFiniteNormalized(right)
            || !IsFiniteNormalized(glabella)
            || faceWidth <= 0.05f)
        {
            return false;
        }

        float faceCenterX = (left.x + right.x) * 0.5f;
        float centralHalfWidth = faceWidth * 0.24f;
        List<float> centralY = new List<float>();
        for (int index = 0; index < projected.Count; index += 1)
        {
            Vector2 point = projected[index];
            if (IsFiniteNormalized(point)
                && Mathf.Abs(point.x - faceCenterX) <= centralHalfWidth
                && point.y < glabella.y)
            {
                centralY.Add(point.y);
            }
        }
        if (centralY.Count < 8)
        {
            return false;
        }

        centralY.Sort();
        int foreheadPercentileIndex = Mathf.Clamp(
            Mathf.FloorToInt((centralY.Count - 1) * 0.1f),
            0,
            centralY.Count - 1);
        Vector2 foreheadTop = new Vector2(
            faceCenterX,
            centralY[foreheadPercentileIndex]);
        if (!IsFiniteNormalized(foreheadTop)
            || foreheadTop.y >= glabella.y - 0.02f)
        {
            return false;
        }

        Vector3 pose = candidate.Pose;
        reference = new HairlineFaceReference(
            new Vector2(left.x, glabella.y),
            new Vector2(right.x, glabella.y),
            foreheadTop,
            glabella,
            pose.y,
            pose.x,
            pose.z);
        return true;
    }

    private static bool TryProjectedCentroid(
        IReadOnlyList<Vector2> projected,
        IReadOnlyList<int> indices,
        out Vector2 centroid)
    {
        centroid = Vector2.zero;
        if (projected == null || indices == null || indices.Count == 0)
        {
            return false;
        }

        int count = 0;
        for (int index = 0; index < indices.Count; index += 1)
        {
            int vertexIndex = indices[index];
            if (vertexIndex < 0 || vertexIndex >= projected.Count)
            {
                return false;
            }
            Vector2 point = projected[vertexIndex];
            if (!IsFiniteNormalized(point))
            {
                return false;
            }
            centroid += point;
            count += 1;
        }

        centroid /= Math.Max(1, count);
        return count > 0;
    }

    private static HairlineMaskReference CreateHairlineMaskReference(
        SegmentationSource.SegmentationFrameSnapshot snapshot)
    {
        return new HairlineMaskReference(
            snapshot.FrameToken,
            snapshot.SensorTimestampMs,
            snapshot.ObservedAtMs,
            snapshot.InputWidth,
            snapshot.InputHeight,
            snapshot.Width,
            snapshot.Height,
            snapshot.RotationDegrees,
            snapshot.ReferenceToMaskX,
            snapshot.ReferenceToMaskY);
    }

    private void ReleaseFixedAnchorCandidate()
    {
        if (fixedAnchorCandidate != null)
        {
            nativeCaptureProvider?.ReleaseSample(
                fixedAnchorCandidate.Sample);
        }
        fixedAnchorCandidate = null;
        fixedAnchorHasAcceptedSegmentationToken = false;
    }

    private void SendGate(string requestId)
    {
        RefreshSceneReferences();
        ResolveNativeProvider();
        bool cameraReady = cameraManager != null
            && frameBroker != null
            && frameBroker.IsCameraAvailable;
        bool faceReady = TryGetSingleTrackingFace(out ARFace face);
        bool poseReady = false;
        Vector3 pose = Vector3.zero;
        if (faceReady)
        {
            Transform cameraTransform = ResolveCameraTransform();
            if (cameraTransform != null)
            {
                pose = Face3DHeadPose.CameraRelativeEulerDegrees(
                    cameraTransform.rotation,
                    face.transform.rotation);
                poseReady = IsPoseReady(pose);
            }
        }
        bool nativeSyncReady =
            nativeCaptureProvider != null && nativeCaptureProvider.IsAvailable;
        string hairlineStatus =
            HairlineDetectionContract.AdvisoryUnknown;
        float? hairlineConfidence = null;
        string hairlineFrameToken = null;
        double? hairlineSensorTimestampMs = null;
        double now = Time.realtimeSinceStartupAsDouble;
        if (faceReady && poseReady)
        {
            if (TryEvaluateLiveHairlineAdvisory(
                    pose,
                    out HairlineDetectionResult liveHairline))
            {
                UpdateHairlineAdvisoryState(
                    liveHairline.AdvisoryStatus,
                    now);
                hairlineStatus = advisoryStableStatus;
                if (string.Equals(
                        advisoryStableStatus,
                        liveHairline.AdvisoryStatus,
                        StringComparison.Ordinal))
                {
                    hairlineConfidence = liveHairline.Confidence;
                    hairlineFrameToken = liveHairline.FrameToken;
                    hairlineSensorTimestampMs =
                        liveHairline.SensorTimestampMs;
                }
            }
            else
            {
                UpdateHairlineAdvisoryState(
                    HairlineDetectionContract.AdvisoryUnknown,
                    now);
                hairlineStatus = advisoryStableStatus;
            }
        }
        else
        {
            ResetHairlineAdvisoryState(now);
        }
        double stableDurationMs = Math.Max(
            0.0,
            (now - advisoryStableStartedAtSeconds) * 1000.0);

        StringBuilder json = new StringBuilder(512);
        json.Append("{\"type\":\"unified_face_capture_gate\"");
        json.Append(",\"requestId\":").Append(Quote(requestId));
        json.Append(",\"cameraReady\":").Append(Bool(cameraReady));
        json.Append(",\"faceReady\":").Append(Bool(faceReady));
        json.Append(",\"poseReady\":").Append(Bool(poseReady));
        // Hairline is advisory only and is intentionally absent from this
        // greenlight expression. Unknown/omitted H never locks the shutter.
        json.Append(",\"finalCaptureGreenlight\":").Append(Bool(
            cameraReady && faceReady && poseReady && nativeSyncReady));
        json.Append(",\"hairline\":{");
        json.Append("\"status\":").Append(Quote(hairlineStatus));
        json.Append(",\"confidence\":").Append(
            hairlineConfidence.HasValue
                ? Number(hairlineConfidence.Value)
                : "null");
        json.Append(",\"frameToken\":").Append(
            string.IsNullOrWhiteSpace(hairlineFrameToken)
                ? "null"
                : Quote(hairlineFrameToken));
        json.Append(",\"sensorTimestampMs\":").Append(
            hairlineSensorTimestampMs.HasValue
                ? Number(hairlineSensorTimestampMs.Value)
                : "null");
        json.Append(",\"stableDurationMs\":").Append(
            Number(stableDurationMs));
        if (string.Equals(
                hairlineStatus,
                HairlineDetectionContract.AdvisoryLikelyOccluded,
                StringComparison.Ordinal))
        {
            json.Append(",\"actionableReason\":\"hairline_occluded\"");
            json.Append(",\"messageCode\":\"show_hairline_for_full_ratio\"");
        }
        json.Append("}}");
        SendEvent(json.ToString());
    }

    private bool TryEvaluateLiveHairlineAdvisory(
        Vector3 pose,
        out HairlineDetectionResult result)
    {
        result = null;
        ResolveAdvisorySources();
        if (landmarkSource == null
            || !landmarkSource.HasFace
            || landmarkSource.Landmarks == null
            || landmarkSource.Landmarks.Length
                <= MediaPipeRightFaceIndex
            || segmentationSource == null
            || !segmentationSource.TryCopyLatestFrame(
                Time.realtimeSinceStartupAsDouble * 1000.0,
                HairlineAdvisoryMaximumAgeMs,
                out SegmentationSource.SegmentationFrameSnapshot snapshot))
        {
            return false;
        }

        Vector3[] landmarks = landmarkSource.Landmarks;
        Vector2 left = landmarks[MediaPipeLeftFaceIndex];
        Vector2 right = landmarks[MediaPipeRightFaceIndex];
        Vector2 foreheadTop = landmarks[MediaPipeForeheadTopIndex];
        Vector2 glabella = (
            (Vector2)landmarks[MediaPipeGlabellaIndexA]
            + (Vector2)landmarks[MediaPipeGlabellaIndexB]) * 0.5f;
        if (left.x > right.x)
        {
            (left, right) = (right, left);
        }
        if (!IsFiniteNormalized(left)
            || !IsFiniteNormalized(right)
            || !IsFiniteNormalized(foreheadTop)
            || !IsFiniteNormalized(glabella))
        {
            return false;
        }

        HairlineFaceReference faceReference =
            new HairlineFaceReference(
                left,
                right,
                foreheadTop,
                glabella,
                pose.y,
                pose.x,
                pose.z);
        result = HairlineVisibilityEstimator.Evaluate(
            snapshot.Rgba,
            CreateHairlineMaskReference(snapshot),
            faceReference);
        return result != null;
    }

    private void UpdateHairlineAdvisoryState(
        string rawStatus,
        double now)
    {
        string normalizedStatus =
            string.Equals(
                rawStatus,
                HairlineDetectionContract.AdvisoryLikelyVisible,
                StringComparison.Ordinal)
            || string.Equals(
                rawStatus,
                HairlineDetectionContract.AdvisoryLikelyOccluded,
                StringComparison.Ordinal)
                ? rawStatus
                : HairlineDetectionContract.AdvisoryUnknown;
        if (!string.Equals(
                normalizedStatus,
                advisoryCandidateStatus,
                StringComparison.Ordinal))
        {
            advisoryCandidateStatus = normalizedStatus;
            advisoryCandidateStartedAtSeconds = now;
        }

        if (!string.Equals(
                advisoryStableStatus,
                advisoryCandidateStatus,
                StringComparison.Ordinal)
            && now - advisoryCandidateStartedAtSeconds
                >= HairlineAdvisoryStableSeconds)
        {
            advisoryStableStatus = advisoryCandidateStatus;
            advisoryStableStartedAtSeconds = now;
        }
    }

    private void ResetHairlineAdvisoryState(double now)
    {
        advisoryCandidateStatus =
            HairlineDetectionContract.AdvisoryUnknown;
        advisoryStableStatus =
            HairlineDetectionContract.AdvisoryUnknown;
        advisoryCandidateStartedAtSeconds = now;
        advisoryStableStartedAtSeconds = now;
    }

    private void SendBlocked(
        string requestId,
        string blockedReason,
        string detail,
        params string[] warnings)
    {
        SendBlocked(
            requestId,
            blockedReason,
            detail,
            (IEnumerable<string>)warnings);
    }

    private void SendBlocked(
        string requestId,
        string blockedReason,
        string detail,
        IEnumerable<string> warnings)
    {
        List<string> normalizedWarnings = new List<string>();
        if (warnings != null)
        {
            foreach (string warning in warnings)
            {
                if (!string.IsNullOrWhiteSpace(warning))
                {
                    normalizedWarnings.Add(warning.Trim());
                }
            }
        }
        normalizedWarnings.Sort(StringComparer.Ordinal);

        StringBuilder json = new StringBuilder(256);
        json.Append("{\"type\":\"unified_face_capture_blocked\"");
        json.Append(",\"requestId\":").Append(Quote(
            string.IsNullOrWhiteSpace(requestId)
                ? "unified-invalid-request"
                : requestId.Trim()));
        json.Append(",\"reason\":").Append(Quote(blockedReason));
        json.Append(",\"detail\":").Append(Quote(NormalizeDetail(detail)));
        AppendWarnings(json, normalizedWarnings);
        json.Append('}');
        SendEvent(json.ToString());
        if (preparedRequest != null
            && string.Equals(
                preparedRequest.RequestId,
                requestId,
                StringComparison.Ordinal))
        {
            preparedRequest = null;
        }
    }

    private void SendCancelled(string requestId, string reason)
    {
        SendEvent(
            "{\"type\":\"unified_face_capture_cancelled\""
            + ",\"requestId\":" + Quote(requestId)
            + ",\"reason\":" + Quote(reason)
            + "}");
    }

    private void SendCompleted(
        Face3DProfileV2 profile,
        double endedAtSeconds,
        HairlineDetectionResult hairlineResult,
        SegmentationSource.SegmentationFrameSnapshot segmentationSnapshot)
    {
        bool hasActualHairline =
            hairlineResult != null
            && hairlineResult.HasActualMeasurement
            && hairlineResult.Confidence.HasValue;
        bool hairlineAnalysisEligible =
            hasActualHairline && hairlineResult.AnalysisEligible;
        string hairlineOutcome = hasActualHairline
            ? hairlineResult.Outcome
            : HairlineDetectionContract.OutcomeOmitted;
        string hairlineProvider = hasActualHairline
            ? HairlineDetectionContract.Provider
            : "none";
        bool retryRecommended = false;
        string retryReason = null;
        if (!hasActualHairline
            && activeRequest.RetryAttemptCount == 0)
        {
            if (hairlineResult != null
                && string.Equals(
                    hairlineResult.AdvisoryStatus,
                    HairlineDetectionContract.AdvisoryLikelyOccluded,
                    StringComparison.Ordinal))
            {
                retryRecommended = true;
                retryReason = "hairline_occluded";
            }
            else if (hairlineResult == null
                && segmentationSource != null
                && segmentationSource.IsReady)
            {
                retryRecommended = true;
                retryReason = "segmentation_temporarily_unavailable";
            }
        }

        HashSet<string> warningSet = new HashSet<string>(
            profile.Warnings,
            StringComparer.Ordinal);
        if (!hasActualHairline)
        {
            warningSet.Add("hairline_omitted");
        }
        else if (!hairlineAnalysisEligible)
        {
            warningSet.Add("hairline_low_confidence");
        }
        List<string> warnings = new List<string>(warningSet);
        warnings.Sort(StringComparer.Ordinal);
        string captureId = activeRequest.RequestId
            + "-"
            + DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                .ToString(CultureInfo.InvariantCulture);

        StringBuilder json = new StringBuilder(2048);
        json.Append("{\"type\":\"unified_face_capture_completed\"");
        json.Append(",\"requestId\":").Append(Quote(activeRequest.RequestId));
        json.Append(",\"schemaVersion\":\"aura.unified-face-capture.v1\"");
        json.Append(",\"captureId\":").Append(Quote(captureId));
        json.Append(",\"status\":").Append(Quote(
            hairlineAnalysisEligible
                ? "full_success"
                : "partial_success"));
        json.Append(",\"image\":{");
        json.Append("\"uri\":").Append(Quote(anchorSample.ImageUri));
        json.Append(",\"format\":").Append(Quote(anchorSample.ImageFormat));
        json.Append(",\"width\":").Append(anchorSample.ImageWidth);
        json.Append(",\"height\":").Append(anchorSample.ImageHeight);
        json.Append(",\"orientation\":\"upright\",\"mirrored\":false}");
        json.Append(",\"face3d\":").Append(profile.ToCanonicalJson());
        json.Append(",\"hairline\":{");
        json.Append("\"analysisEligible\":").Append(
            Bool(hairlineAnalysisEligible));
        json.Append(",\"confidence\":").Append(
            hasActualHairline
                ? Number(hairlineResult.Confidence.Value)
                : "null");
        if (hasActualHairline && hairlineResult.Position.HasValue)
        {
            Vector2 point = hairlineResult.Position.Value;
            json.Append(",\"normalizedPoint\":{\"x\":")
                .Append(Number(point.x))
                .Append(",\"y\":")
                .Append(Number(point.y))
                .Append('}');
        }
        json.Append(",\"outcome\":").Append(Quote(hairlineOutcome));
        json.Append(",\"provider\":").Append(Quote(hairlineProvider));
        json.Append(",\"retryRecommendation\":{\"attemptCount\":")
            .Append(activeRequest.RetryAttemptCount);
        if (retryRecommended)
        {
            json.Append(",\"reason\":").Append(Quote(retryReason));
        }
        json.Append(",\"recommended\":")
            .Append(Bool(retryRecommended))
            .Append("}}");
        json.Append(",\"timestamps\":{");
        json.Append("\"cameraFrameToken\":").Append(Quote(anchorSample.CameraFrameToken));
        json.Append(",\"cameraSensorTimestampMs\":").Append(Number(anchorSample.CameraSensorTimestampMs));
        json.Append(",\"cameraObservedAtMs\":").Append(Number(anchorSample.CameraObservedAtMs));
        json.Append(",\"faceNativeFrameToken\":").Append(Quote(anchorSample.FaceNativeFrameToken));
        json.Append(",\"anchorFaceNativeTimestampMs\":").Append(Number(anchorSample.FaceNativeTimestampMs));
        json.Append(",\"faceObservedAtMs\":").Append(Number(anchorSample.FaceObservedAtMs));
        json.Append(",\"burstStartObservedAtMs\":").Append(Number(burstStartedAtSeconds * 1000.0));
        json.Append(",\"burstEndObservedAtMs\":").Append(Number(endedAtSeconds * 1000.0));
        json.Append(",\"maxAbsFaceSensorDeltaMs\":").Append(Number(maximumObservedNativeDeltaMs));
        if (segmentationSnapshot != null)
        {
            json.Append(",\"segmentationFrameToken\":").Append(
                Quote(segmentationSnapshot.FrameToken));
            json.Append(",\"segmentationSensorTimestampMs\":").Append(
                Number(segmentationSnapshot.SensorTimestampMs));
        }
        json.Append('}');
        AppendWarnings(json, warnings);
        json.Append('}');
        SendEvent(json.ToString());
    }

    private void SendEvent(string json)
    {
        RefreshSceneReferences();
        if (rnBridge != null)
        {
            rnBridge.SendUnifiedFaceCaptureEvent(json);
        }
        else
        {
            Debug.LogWarning("[UnifiedFaceCapture] RNBridge unavailable");
        }
    }

    private bool LoadSemanticMap(out string reason)
    {
        TextAsset mapAsset = semanticMapJson != null
            ? semanticMapJson
            : Resources.Load<TextAsset>(SemanticMapResourcePath);
        if (mapAsset == null)
        {
            semanticMap = null;
            reason = "semantic_map_missing";
            return false;
        }
        return Face3DSemanticMap.TryParseJson(mapAsset.text, out semanticMap, out reason);
    }

    private void EnsureAdvisorySources()
    {
        if (cameraManager == null)
        {
            return;
        }

        landmarkSource =
            cameraManager.GetComponent<FaceLandmarkSource>();
        if (landmarkSource == null)
        {
            landmarkSource =
                cameraManager.gameObject.AddComponent<FaceLandmarkSource>();
        }
        landmarkSource.Init(cameraManager);

        segmentationSource =
            cameraManager.GetComponent<SegmentationSource>();
        if (segmentationSource == null)
        {
            segmentationSource =
                cameraManager.gameObject.AddComponent<SegmentationSource>();
        }
    }

    private void ResolveAdvisorySources()
    {
        if (landmarkSource == null)
        {
            landmarkSource = FaceLandmarkSource.Instance;
        }
        if (segmentationSource == null)
        {
            segmentationSource = SegmentationSource.Instance;
        }
        if (cameraManager != null)
        {
            landmarkSource ??=
                cameraManager.GetComponent<FaceLandmarkSource>();
            segmentationSource ??=
                cameraManager.GetComponent<SegmentationSource>();
        }
    }

    private void RefreshSceneReferences()
    {
        if (faceManager == null)
        {
            faceManager = FindFirstObjectByType<ARFaceManager>();
        }
        if (cameraManager == null)
        {
            cameraManager = FindFirstObjectByType<ARCameraManager>();
        }
        if (frameBroker == null)
        {
            frameBroker = FaceCameraFrameBroker.Instance;
        }
        if (rnBridge == null)
        {
            rnBridge = FindFirstObjectByType<RNBridge>();
        }
    }

    private void ResolveNativeProvider()
    {
        if (nativeCaptureProvider == null)
        {
            nativeCaptureProvider =
                nativeCaptureProviderBehaviour
                as IUnifiedFaceNativeCaptureProvider;
        }

#if UNITY_IOS && !UNITY_EDITOR
        if (nativeCaptureProvider == null)
        {
            ARKitUnifiedFaceNativeCaptureProvider arkitProvider =
                GetComponent<ARKitUnifiedFaceNativeCaptureProvider>();
            if (arkitProvider == null)
            {
                arkitProvider =
                    gameObject.AddComponent<
                        ARKitUnifiedFaceNativeCaptureProvider>();
            }
            nativeCaptureProviderBehaviour = arkitProvider;
            nativeCaptureProvider = arkitProvider;
        }
#endif

        if (nativeCaptureProvider
            is ARKitUnifiedFaceNativeCaptureProvider provider)
        {
            provider.Configure(
                FindFirstObjectByType<ARSession>(),
                frameBroker);
        }
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
        if (subscribedFaceManager != null)
        {
            subscribedFaceManager.trackablesChanged.RemoveListener(OnFaceTrackablesChanged);
            subscribedFaceManager = null;
        }
    }

    private void FinishSession()
    {
        ReleaseFixedAnchorCandidate();
        nativeCaptureProvider?.Reset();
        if (!faceCountRestored && faceManager != null)
        {
            faceManager.requestedMaximumFaceCount =
                Math.Max(1, previousRequestedMaximumFaceCount);
        }
        faceCountRestored = true;
        sessionActive = false;
        collectionFinalizationPending = false;
        activeRequest = null;
        preparedRequest = null;
        collector = null;
        pendingProfile = null;
        anchorSample = null;
        collectionEndedAtSeconds = 0.0;
        finalizationDeadlineSeconds = 0.0;
        acceptedNativeFaceTokens.Clear();
        sessionWarnings.Clear();
        ResetHairlineAdvisoryState(
            Time.realtimeSinceStartupAsDouble);
    }

    private bool TryGetSingleTrackingFace(out ARFace trackingFace)
    {
        trackingFace = null;
        if (faceManager == null)
        {
            return false;
        }

        int count = 0;
        foreach (ARFace face in faceManager.trackables)
        {
            if (face != null && face.trackingState == TrackingState.Tracking)
            {
                count += 1;
                trackingFace = trackingFace ?? face;
            }
        }
        return count == 1 && trackingFace != null;
    }

    private Transform ResolveCameraTransform()
    {
        if (cameraManager != null)
        {
            return cameraManager.transform;
        }
        Camera mainCamera = Camera.main;
        return mainCamera != null ? mainCamera.transform : null;
    }

    private static bool IsPoseReady(Vector3 pose)
    {
        return Mathf.Abs(pose.y) <= MaximumYawDegrees
            && Mathf.Abs(pose.x) <= MaximumPitchDegrees
            && Mathf.Abs(pose.z) <= MaximumRollDegrees;
    }

    private static bool IsFiniteNonNegative(double value)
    {
        return !double.IsNaN(value)
            && !double.IsInfinity(value)
            && value >= 0.0;
    }

    private static bool IsFiniteNormalized(Vector2 value)
    {
        return !float.IsNaN(value.x)
            && !float.IsInfinity(value.x)
            && !float.IsNaN(value.y)
            && !float.IsInfinity(value.y)
            && value.x >= 0.0f
            && value.x <= 1.0f
            && value.y >= 0.0f
            && value.y <= 1.0f;
    }

    private static string ExtractRequestId(string json)
    {
        try
        {
            UnifiedFaceCaptureRequestData data =
                JsonUtility.FromJson<UnifiedFaceCaptureRequestData>(json ?? string.Empty);
            return data != null ? data.requestId : string.Empty;
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }

    private static string NormalizeDetail(string value)
    {
        return string.IsNullOrWhiteSpace(value) ? "unspecified" : value.Trim();
    }

    private static void AppendWarnings(StringBuilder json, IEnumerable<string> warnings)
    {
        json.Append(",\"warnings\":[");
        bool first = true;
        foreach (string warning in warnings ?? Array.Empty<string>())
        {
            if (!first)
            {
                json.Append(',');
            }
            first = false;
            json.Append(Quote(warning));
        }
        json.Append(']');
    }

    private static string Bool(bool value)
    {
        return value ? "true" : "false";
    }

    private static string Number(double value)
    {
        return value.ToString("R", CultureInfo.InvariantCulture);
    }

    private static string Quote(string value)
    {
        StringBuilder json = new StringBuilder();
        json.Append('"');
        string safe = value ?? string.Empty;
        for (int index = 0; index < safe.Length; index += 1)
        {
            char character = safe[index];
            switch (character)
            {
                case '"':
                    json.Append("\\\"");
                    break;
                case '\\':
                    json.Append("\\\\");
                    break;
                case '\n':
                    json.Append("\\n");
                    break;
                case '\r':
                    json.Append("\\r");
                    break;
                case '\t':
                    json.Append("\\t");
                    break;
                default:
                    json.Append(character);
                    break;
            }
        }
        json.Append('"');
        return json.ToString();
    }
}
