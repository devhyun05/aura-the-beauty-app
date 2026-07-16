using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Aura.Face3D;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARKit;
using UnityEngine.XR.ARSubsystems;

/// <summary>
/// ARFoundation adapter for the pure Aura.Face3D core. It owns only the short-lived
/// analysis session; raw ARFace vertices never cross the RN bridge.
/// </summary>
public sealed class Face3DSessionController : MonoBehaviour
{
    private const int RequestedFaceCount = 2;
    private const int RequiredStableGateFrames = 5;
    private const double AcquisitionTimeoutSeconds = 12.0;
    private const double TrackingStatusIntervalSeconds = 0.25;
    private const float MaximumYawDegrees = 5.0f;
    private const float MaximumPitchDegrees = 7.0f;
    private const float MaximumRollDegrees = 5.0f;
    // G2: a frame whose distorting blend shape exceeds this activation is not neutral.
    // Conservative so a relaxed resting face still passes; tighten only with device evidence.
    private const float MaximumNeutralExpressionActivation = 0.5f;
    private const string NeutralExpressionActiveWarning = "neutral_expression_gate_active_g2";
    private const string NeutralExpressionUnavailableWarning = "neutral_expression_gate_signals_unavailable_g2";
    private const string SemanticMapResourcePath = "Face3D/ARKitFaceSemanticMapV1";

    [Serializable]
    private sealed class StartRequestPayload
    {
        public string requestId;
        public string gateVersion;
        public int maximumDurationMs;
        public int minimumValidFrames;
        public int targetValidFrames;
    }

    [Serializable]
    private sealed class CancelRequestPayload
    {
        public string requestId;
    }

    [Serializable]
    private sealed class StatusEventPayload
    {
        public string type = "face3d_status";
        public string requestId;
        public string status;
        public string message;
        public string gateVersion = Face3DContract.GateVersion;
        public int validFrameCount;
        public int targetFrameCount;
        public string[] warnings = Array.Empty<string>();
        public string topologyFingerprint;
        public int meshVertexCount;
        public int meshIndexCount;
        public int meshUvCount;
        public int supportedFaceCount;
        public int currentMaximumFaceCount;
        public int trackingFaceCount;
        public int totalTrackableCount;
        public float yawDeg;
        public float pitchDeg;
        public float rollDeg;
        public int sessionSequence;
    }

    [SerializeField] private ARFaceManager faceManager;
    [SerializeField] private ARCameraManager cameraManager;
    [SerializeField] private RNBridge rnBridge;
    [SerializeField] private TextAsset semanticMapJson;

    private ARFaceManager subscribedFaceManager;
    private Face3DSemanticMap semanticMap;
    private Face3DCollectionPolicy collectionPolicy;
    private Face3DExpressionGatePolicy expressionGatePolicy;
    private string neutralExpressionWarning = NeutralExpressionActiveWarning;
    private bool expressionSignalsEverAvailable;
    private string multipleFaceGateWarning = string.Empty;
    private Face3DProfileCollector collector;
    private string semanticMapReason = "semantic_map_missing";
    private string activeRequestId = string.Empty;
    private string latestTopologyFingerprint = string.Empty;
    private int latestVertexCount;
    private int latestIndexCount;
    private int latestUvCount;
    private int previousRequestedMaximumFaceCount = 1;
    private int stableGateFrameCount;
    private bool sessionActive;
    private bool faceUpdatePending;
    private bool faceCountRestored = true;
    private double acquisitionDeadlineSeconds;
    private double nextTrackingStatusSeconds;
    // G3: monotonic count of native->Unity->native analysis round trips this process.
    // Surfaced on every status event so a device stress run can prove 10 clean cycles.
    private int sessionSequence;

    public void Configure(ARFaceManager manager, RNBridge bridge)
    {
        UnsubscribeFaceManager();
        faceManager = manager;
        rnBridge = bridge;
        SubscribeFaceManager();
    }

    public void StartFace3DAnalysisJson(string json)
    {
        StartRequestPayload request = ParseStartRequest(json, out string requestError);
        if (request == null)
        {
            SendStandaloneBlockedEvent(ExtractRequestId(json), requestError);
            return;
        }

        if (sessionActive)
        {
            FinishSession(false);
        }

        RefreshSceneReferences();
        activeRequestId = request.requestId;
        sessionSequence += 1;

        if (faceManager == null)
        {
            SendStandaloneBlockedEvent(activeRequestId, "face_manager_unavailable");
            activeRequestId = string.Empty;
            return;
        }

        try
        {
            collectionPolicy = new Face3DCollectionPolicy(
                request.maximumDurationMs / 1000.0,
                request.targetValidFrames,
                request.minimumValidFrames);
        }
        catch (Exception)
        {
            SendStandaloneBlockedEvent(activeRequestId, "collection_policy_invalid");
            activeRequestId = string.Empty;
            return;
        }

        expressionGatePolicy = new Face3DExpressionGatePolicy(MaximumNeutralExpressionActivation);
        neutralExpressionWarning = NeutralExpressionActiveWarning;
        expressionSignalsEverAvailable = false;
        multipleFaceGateWarning = string.Empty;
        LoadSemanticMap();
        previousRequestedMaximumFaceCount = Math.Max(1, faceManager.requestedMaximumFaceCount);
        faceCountRestored = false;
        faceManager.requestedMaximumFaceCount = RequestedFaceCount;
        sessionActive = true;
        faceUpdatePending = true;
        stableGateFrameCount = 0;
        collector = null;
        latestTopologyFingerprint = string.Empty;
        latestVertexCount = 0;
        latestIndexCount = 0;
        latestUvCount = 0;
        double now = Time.realtimeSinceStartupAsDouble;
        acquisitionDeadlineSeconds = now + AcquisitionTimeoutSeconds;
        nextTrackingStatusSeconds = now;
        SubscribeFaceManager();
        SendStatus(
            "preparing",
            "ARKit 얼굴 추적과 다중 얼굴 차단 기능을 준비하고 있습니다.",
            0,
            new[] { neutralExpressionWarning });
    }

    public void CancelFace3DAnalysisJson(string json)
    {
        if (!sessionActive)
        {
            return;
        }

        CancelRequestPayload request = null;
        try
        {
            request = JsonUtility.FromJson<CancelRequestPayload>(json ?? string.Empty);
        }
        catch (Exception)
        {
            // An invalid cancel payload must not cancel an unrelated active request.
        }

        if (request == null
            || string.IsNullOrWhiteSpace(request.requestId)
            || !string.Equals(request.requestId, activeRequestId, StringComparison.Ordinal))
        {
            return;
        }

        SendStatus("idle", "3D 얼굴 측정을 취소했습니다.", CurrentValidFrameCount(), Array.Empty<string>());
        FinishSession(false);
    }

    private void Awake()
    {
        RefreshSceneReferences();
    }

    private void OnEnable()
    {
        RefreshSceneReferences();
        SubscribeFaceManager();
    }

    private void OnDisable()
    {
        FinishSession(false);
        UnsubscribeFaceManager();
    }

    private void Update()
    {
        if (!sessionActive)
        {
            return;
        }

        double now = Time.realtimeSinceStartupAsDouble;
        if (now >= acquisitionDeadlineSeconds && collector == null)
        {
            BlockSession("tracking_gate_timeout");
            return;
        }

        ReportMultipleFaceGateCapability(now);

        if (collector != null && collector.ShouldStop(now))
        {
            CompleteCollection(now);
            return;
        }

        if (!faceUpdatePending)
        {
            return;
        }

        faceUpdatePending = false;
        ProcessLatestFaceFrame(now);
    }

    private void OnFaceTrackablesChanged(ARTrackablesChangedEventArgs<ARFace> eventArgs)
    {
        if (sessionActive)
        {
            faceUpdatePending = true;
        }
    }

    private void ReportMultipleFaceGateCapability(double now)
    {
        int supportedFaceCount = faceManager != null ? faceManager.supportedFaceCount : 0;
        int currentMaximumFaceCount = faceManager != null ? faceManager.currentMaximumFaceCount : 0;

        if (supportedFaceCount >= RequestedFaceCount
            && currentMaximumFaceCount >= RequestedFaceCount)
        {
            return;
        }

        // G5 is an independent future validation gate. A device that has not yet
        // activated two-face tracking must not prevent G1 single-face profile
        // extraction. ProcessLatestFaceFrame still rejects a second face whenever
        // ARFoundation actually reports one; the warning keeps the stronger G5
        // guarantee explicitly pending rather than silently claiming it passed.
        // While face frames are flowing, the gate path owns the shared status
        // throttle; sending here every frame would starve pose guidance entirely.
        // Persist the gate state at session scope so CompleteCollection can fold it into the
        // FINAL profile warnings. The throttled status below is skipped entirely while face
        // frames are flowing (faceUpdatePending), so relying on the live status event alone
        // dropped the G5 warning from the extracted profile.
        string warning = supportedFaceCount == 1
            ? "g5_multiple_face_gate_unsupported"
            : "g5_multiple_face_gate_pending";
        multipleFaceGateWarning = warning;

        if (faceUpdatePending)
        {
            return;
        }

        if (now >= nextTrackingStatusSeconds)
        {
            nextTrackingStatusSeconds = now + TrackingStatusIntervalSeconds;
            SendStatus(
                "tracking",
                "다중 얼굴 차단 검증은 보류하고 단일 얼굴 3D 측정을 계속합니다.",
                CurrentValidFrameCount(),
                new[] { warning, neutralExpressionWarning });
        }
    }

    private void ProcessLatestFaceFrame(double now)
    {
        ARFace trackingFace = null;
        int trackingFaceCount = 0;
        int totalTrackableCount = 0;

        foreach (ARFace face in faceManager.trackables)
        {
            if (face == null)
            {
                continue;
            }

            totalTrackableCount += 1;
            if (face.trackingState == TrackingState.Tracking)
            {
                trackingFaceCount += 1;
                trackingFace = trackingFace ?? face;
            }
        }

        Face3DTrackingFaceGateStatus faceGate = Face3DTrackingFaceGate.Evaluate(trackingFaceCount);
        if (faceGate != Face3DTrackingFaceGateStatus.Ready || trackingFace == null)
        {
            stableGateFrameCount = 0;
            SendTrackingStatusIfDue(
                now,
                faceGate == Face3DTrackingFaceGateStatus.Multiple
                    ? "얼굴은 한 명만 프레임 안에 두어야 합니다."
                    : "Tracking 상태의 얼굴을 찾고 있습니다.",
                faceGate == Face3DTrackingFaceGateStatus.Multiple
                    ? "multiple_faces_detected"
                    : "tracking_face_missing",
                null,
                trackingFaceCount,
                totalTrackableCount);
            return;
        }

        Transform cameraTransform = ResolveCameraTransform();
        if (cameraTransform == null)
        {
            stableGateFrameCount = 0;
            SendTrackingStatusIfDue(
                now,
                DescribeReason("camera_pose_unavailable"),
                "camera_pose_unavailable",
                null,
                trackingFaceCount,
                totalTrackableCount);
            return;
        }

        // Session-space euler angles leak device tilt and initial heading into the
        // gate; only the head's deviation from facing the camera matters here.
        Vector3 pose = Face3DHeadPose.CameraRelativeEulerDegrees(
            cameraTransform.rotation,
            trackingFace.transform.rotation);
        if (Mathf.Abs(pose.y) > MaximumYawDegrees
            || Mathf.Abs(pose.x) > MaximumPitchDegrees
            || Mathf.Abs(pose.z) > MaximumRollDegrees)
        {
            stableGateFrameCount = 0;
            SendTrackingStatusIfDue(
                now,
                "고개를 정면으로 맞춰 주세요."
                    + " yaw=" + pose.y.ToString("0.0", CultureInfo.InvariantCulture)
                    + " pitch=" + pose.x.ToString("0.0", CultureInfo.InvariantCulture)
                    + " roll=" + pose.z.ToString("0.0", CultureInfo.InvariantCulture),
                "pose_gate_blocked",
                pose,
                trackingFaceCount,
                totalTrackableCount);
            return;
        }

        Face3DExpressionGateResult expression = Face3DNeutralExpressionGate.Evaluate(
            ReadExpressionSignals(trackingFace),
            expressionGatePolicy);
        if (expression.Status == Face3DExpressionGateStatus.SignalsUnavailable)
        {
            // Fail-open: a device that reports no blend shapes must not turn the working
            // G1 extraction back into 0/30. Record that G2 could not run this session.
            if (!expressionSignalsEverAvailable)
            {
                neutralExpressionWarning = NeutralExpressionUnavailableWarning;
            }
        }
        else
        {
            expressionSignalsEverAvailable = true;
            neutralExpressionWarning = NeutralExpressionActiveWarning;
            if (expression.Status == Face3DExpressionGateStatus.NonNeutral)
            {
                stableGateFrameCount = 0;
                SendTrackingStatusIfDue(
                    now,
                    "무표정을 유지해 주세요."
                        + " " + expression.DominantSignal + "="
                        + expression.DominantActivation.ToString("0.00", CultureInfo.InvariantCulture),
                    "neutral_expression_gate_blocked",
                    pose,
                    trackingFaceCount,
                    totalTrackableCount);
                return;
            }
        }

        stableGateFrameCount += 1;
        if (stableGateFrameCount < RequiredStableGateFrames)
        {
            SendTrackingStatusIfDue(
                now,
                "정면 자세를 안정적으로 유지해 주세요.",
                "pose_gate_stabilizing",
                pose,
                trackingFaceCount,
                totalTrackableCount);
            return;
        }

        if (!ARFaceMeshSnapshotFactory.TryCreate(
                trackingFace,
                now,
                out Face3DMeshSnapshot snapshot,
                out string snapshotReason))
        {
            SendTrackingStatusIfDue(
                now,
                DescribeReason(snapshotReason),
                snapshotReason,
                pose,
                trackingFaceCount,
                totalTrackableCount);
            return;
        }

        Face3DEvaluationResult evaluation = Face3DMetricEvaluator.Evaluate(snapshot, semanticMap);
        if (evaluation.Topology != null)
        {
            latestTopologyFingerprint = evaluation.Topology.Value;
            latestVertexCount = evaluation.Topology.VertexCount;
            latestIndexCount = evaluation.Topology.IndexCount;
            latestUvCount = evaluation.Topology.UvCount;
        }

        if (!evaluation.IsValid)
        {
            // When the map is null the evaluator can only report the generic
            // "semantic_map_missing"; the controller knows the precise cause
            // (truly missing vs. a parse failure) in semanticMapReason, so prefer it.
            string reason = semanticMap == null && !string.IsNullOrWhiteSpace(semanticMapReason)
                ? semanticMapReason
                : string.IsNullOrWhiteSpace(evaluation.Reason)
                    ? semanticMapReason
                    : evaluation.Reason;
            BlockSession(reason);
            return;
        }

        if (collector == null)
        {
            collector = new Face3DProfileCollector(now, collectionPolicy);
            collector.AddWarning(neutralExpressionWarning);
        }

        Face3DCollectionUpdate update = collector.AddEvaluation(evaluation, now);
        if (update.Status == Face3DCollectionAddStatus.RejectedTopologyChanged)
        {
            BlockSession(update.Reason);
            return;
        }

        SendStatus(
            "collecting",
            "유효한 ARKit 얼굴 메시 프레임을 수집하고 있습니다.",
            update.ValidFrameCount,
            new[] { neutralExpressionWarning },
            pose,
            trackingFaceCount,
            totalTrackableCount);

        if (update.ShouldStop)
        {
            CompleteCollection(now);
        }
    }

    private void CompleteCollection(double now)
    {
        if (collector != null && !string.IsNullOrEmpty(multipleFaceGateWarning))
        {
            // G5 multiple-face verification was pending/unsupported this session; fold it into
            // the final profile warnings so it survives past the live status stream.
            collector.AddWarning(multipleFaceGateWarning);
        }

        string reason = "collector_unavailable";
        Face3DProfile profile = null;
        if (collector != null
            && collector.TryBuildProfile(now, out profile, out reason))
        {
            SendAnalyzed(profile);
            FinishSession(false);
            return;
        }

        BlockSession(reason);
    }

    // Reads the tracked face's ARKit blend shapes and folds the distorting ones into the
    // pure gate's signal map. Returns an empty map on any platform/device without ARKit
    // blend shapes so the neutral gate fails open instead of blocking extraction.
    private Dictionary<string, float> ReadExpressionSignals(ARFace face)
    {
        Dictionary<string, float> signals = new Dictionary<string, float>(StringComparer.Ordinal);
        if (face == null || faceManager == null)
        {
            return signals;
        }

        if (!(faceManager.subsystem is ARKitFaceSubsystem arkitFaceSubsystem))
        {
            return signals;
        }

        NativeArray<ARKitBlendShapeCoefficient> coefficients = default;
        try
        {
#pragma warning disable 618
            coefficients = arkitFaceSubsystem.GetBlendShapeCoefficients(face.trackableId, Allocator.Temp);
#pragma warning restore 618
            for (int index = 0; index < coefficients.Length; index += 1)
            {
                ARKitBlendShapeCoefficient coefficient = coefficients[index];
                string signal = MapBlendShapeSignal(coefficient.blendShapeLocation);
                if (signal != null)
                {
                    AccumulateSignal(signals, signal, coefficient.coefficient);
                }
            }
        }
        catch (Exception)
        {
            // Any native failure means no usable expression signal; fail open.
            return new Dictionary<string, float>(StringComparer.Ordinal);
        }
        finally
        {
            if (coefficients.IsCreated)
            {
                coefficients.Dispose();
            }
        }

        return signals;
    }

    private static void AccumulateSignal(Dictionary<string, float> signals, string signal, float activation)
    {
        if (float.IsNaN(activation) || float.IsInfinity(activation))
        {
            return;
        }

        // A left/right pair collapses to one signal by its strongest side.
        if (!signals.TryGetValue(signal, out float existing) || activation > existing)
        {
            signals[signal] = activation;
        }
    }

    private static string MapBlendShapeSignal(ARKitBlendShapeLocation location)
    {
        switch (location)
        {
            case ARKitBlendShapeLocation.JawOpen:
                return Face3DExpressionSignal.JawOpen;
            case ARKitBlendShapeLocation.MouthClose:
                return Face3DExpressionSignal.MouthClose;
            case ARKitBlendShapeLocation.MouthSmileLeft:
            case ARKitBlendShapeLocation.MouthSmileRight:
                return Face3DExpressionSignal.MouthSmile;
            case ARKitBlendShapeLocation.MouthFrownLeft:
            case ARKitBlendShapeLocation.MouthFrownRight:
                return Face3DExpressionSignal.MouthFrown;
            case ARKitBlendShapeLocation.MouthPucker:
                return Face3DExpressionSignal.MouthPucker;
            case ARKitBlendShapeLocation.BrowInnerUp:
                return Face3DExpressionSignal.BrowInnerUp;
            case ARKitBlendShapeLocation.BrowDownLeft:
            case ARKitBlendShapeLocation.BrowDownRight:
                return Face3DExpressionSignal.BrowDown;
            case ARKitBlendShapeLocation.CheekPuff:
                return Face3DExpressionSignal.CheekPuff;
            default:
                return null;
        }
    }

    private void LoadSemanticMap()
    {
        TextAsset mapAsset = semanticMapJson != null
            ? semanticMapJson
            : Resources.Load<TextAsset>(SemanticMapResourcePath);
        if (mapAsset == null)
        {
            semanticMap = null;
            semanticMapReason = "semantic_map_missing";
            return;
        }

        if (!Face3DSemanticMap.TryParseJson(mapAsset.text, out semanticMap, out semanticMapReason))
        {
            semanticMap = null;
        }
    }

    private void BlockSession(string reason)
    {
        string normalizedReason = string.IsNullOrWhiteSpace(reason)
            ? "face3d_session_blocked"
            : reason.Trim();
        SendStatus(
            "blocked",
            DescribeReason(normalizedReason),
            CurrentValidFrameCount(),
            new[] { normalizedReason, neutralExpressionWarning });
        FinishSession(false);
    }

    private void SendStandaloneBlockedEvent(string requestId, string reason)
    {
        string previousRequestId = activeRequestId;
        activeRequestId = string.IsNullOrWhiteSpace(requestId) ? "face3d-invalid-request" : requestId;
        SendStatus(
            "blocked",
            DescribeReason(reason),
            0,
            new[] { string.IsNullOrWhiteSpace(reason) ? "face3d_request_invalid" : reason });
        activeRequestId = previousRequestId;
    }

    private void SendTrackingStatusIfDue(
        double now,
        string message,
        string warning,
        Vector3? pose = null,
        int trackingFaceCount = 0,
        int totalTrackableCount = 0)
    {
        if (now < nextTrackingStatusSeconds)
        {
            return;
        }

        nextTrackingStatusSeconds = now + TrackingStatusIntervalSeconds;
        SendStatus(
            "tracking",
            message,
            CurrentValidFrameCount(),
            new[] { warning, neutralExpressionWarning },
            pose,
            trackingFaceCount,
            totalTrackableCount);
    }

    private void SendStatus(
        string status,
        string message,
        int validFrameCount,
        string[] warnings,
        Vector3? pose = null,
        int trackingFaceCount = 0,
        int totalTrackableCount = 0)
    {
        RefreshSceneReferences();
        if (rnBridge == null)
        {
            Debug.LogWarning("[Face3D] RNBridge unavailable status=" + status);
            return;
        }

        Vector3 resolvedPose = pose ?? Vector3.zero;
        StatusEventPayload payload = new StatusEventPayload
        {
            requestId = activeRequestId,
            status = status,
            message = message,
            validFrameCount = Math.Max(0, validFrameCount),
            targetFrameCount = collectionPolicy != null
                ? collectionPolicy.TargetFrameCount
                : Face3DCollectionPolicy.ProvisionalTargetFrameCount,
            warnings = warnings ?? Array.Empty<string>(),
            topologyFingerprint = latestTopologyFingerprint,
            meshVertexCount = latestVertexCount,
            meshIndexCount = latestIndexCount,
            meshUvCount = latestUvCount,
            supportedFaceCount = faceManager != null ? faceManager.supportedFaceCount : 0,
            currentMaximumFaceCount = faceManager != null ? faceManager.currentMaximumFaceCount : 0,
            trackingFaceCount = trackingFaceCount,
            totalTrackableCount = totalTrackableCount,
            pitchDeg = resolvedPose.x,
            yawDeg = resolvedPose.y,
            rollDeg = resolvedPose.z,
            sessionSequence = sessionSequence
        };
        rnBridge.SendFace3DEvent(JsonUtility.ToJson(payload));
    }

    private void SendAnalyzed(Face3DProfile profile)
    {
        RefreshSceneReferences();
        if (rnBridge == null || profile == null)
        {
            return;
        }

        string json = "{\"type\":\"face3d_analyzed\",\"requestId\":"
            + QuoteJson(activeRequestId)
            + ",\"profile\":"
            + profile.ToCanonicalJson()
            + "}";
        rnBridge.SendFace3DEvent(json);
    }

    private void FinishSession(bool emitCancelled)
    {
        if (emitCancelled && sessionActive)
        {
            SendStatus("idle", "3D 얼굴 측정을 취소했습니다.", CurrentValidFrameCount(), Array.Empty<string>());
        }

        RestoreRequestedFaceCount();
        sessionActive = false;
        faceUpdatePending = false;
        stableGateFrameCount = 0;
        collector = null;
        collectionPolicy = null;
        activeRequestId = string.Empty;
    }

    private void RestoreRequestedFaceCount()
    {
        if (!faceCountRestored && faceManager != null)
        {
            faceManager.requestedMaximumFaceCount = Math.Max(1, previousRequestedMaximumFaceCount);
        }

        faceCountRestored = true;
    }

    private int CurrentValidFrameCount()
    {
        return collector != null ? collector.ValidFrameCount : 0;
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

        if (rnBridge == null)
        {
            rnBridge = FindFirstObjectByType<RNBridge>();
        }
    }

    private Transform ResolveCameraTransform()
    {
        if (cameraManager == null)
        {
            RefreshSceneReferences();
        }

        if (cameraManager != null)
        {
            return cameraManager.transform;
        }

        Camera mainCamera = Camera.main;
        return mainCamera != null ? mainCamera.transform : null;
    }

    private void SubscribeFaceManager()
    {
        if (faceManager == null || subscribedFaceManager == faceManager)
        {
            return;
        }

        UnsubscribeFaceManager();
        faceManager.trackablesChanged.AddListener(OnFaceTrackablesChanged);
        subscribedFaceManager = faceManager;
    }

    private void UnsubscribeFaceManager()
    {
        if (subscribedFaceManager != null)
        {
            subscribedFaceManager.trackablesChanged.RemoveListener(OnFaceTrackablesChanged);
            subscribedFaceManager = null;
        }
    }

    private static StartRequestPayload ParseStartRequest(string json, out string reason)
    {
        StartRequestPayload request;
        try
        {
            request = JsonUtility.FromJson<StartRequestPayload>(json ?? string.Empty);
        }
        catch (Exception)
        {
            reason = "face3d_request_json_invalid";
            return null;
        }

        if (request == null || string.IsNullOrWhiteSpace(request.requestId))
        {
            reason = "face3d_request_id_missing";
            return null;
        }

        request.requestId = request.requestId.Trim();
        if (!string.Equals(request.gateVersion, Face3DContract.GateVersion, StringComparison.Ordinal))
        {
            reason = "face3d_gate_version_unsupported";
            return null;
        }

        if (request.maximumDurationMs < 1000
            || request.maximumDurationMs > 10000
            || request.targetValidFrames < 20
            || request.targetValidFrames > 90
            || request.minimumValidFrames < 1
            || request.minimumValidFrames > request.targetValidFrames)
        {
            reason = "face3d_collection_policy_invalid";
            return null;
        }

        reason = string.Empty;
        return request;
    }

    private static string ExtractRequestId(string json)
    {
        try
        {
            StartRequestPayload request = JsonUtility.FromJson<StartRequestPayload>(json ?? string.Empty);
            return request != null ? request.requestId : string.Empty;
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }

    private static string DescribeReason(string reason)
    {
        switch (reason)
        {
            case "semantic_map_missing":
            case "semantic_map_json_missing":
                return "Topology 확인 후 검증된 ARFaceSemanticMap v1을 등록해야 합니다.";
            case "unknown_face_mesh_topology":
                return "현재 ARKit 얼굴 메시 topology가 등록된 semantic map과 다릅니다.";
            case "multiple_face_gate_unsupported":
                return "이 기기에서는 두 번째 얼굴 감지 여부를 보장할 수 없어 측정을 차단했습니다.";
            case "insufficient_valid_frames":
                return "3초 안에 최소 20개의 유효 프레임을 모으지 못했습니다.";
            case "tracking_gate_timeout":
                return "정면 Tracking 조건을 제한 시간 안에 만족하지 못했습니다.";
            case "camera_pose_unavailable":
                return "AR 카메라 자세를 읽을 수 없어 정면 판정을 보류하고 있습니다.";
            case "face_manager_unavailable":
                return "Unity ARFaceManager를 찾을 수 없습니다. UnityFramework를 다시 빌드해 주세요.";
            case "face3d_gate_version_unsupported":
                return "Face3D gate 계약 버전이 일치하지 않습니다.";
            default:
                return "3D 얼굴 측정을 진행할 수 없습니다. (" + reason + ")";
        }
    }

    private static string QuoteJson(string value)
    {
        StringBuilder builder = new StringBuilder((value ?? string.Empty).Length + 2);
        builder.Append('"');
        string safeValue = value ?? string.Empty;
        for (int index = 0; index < safeValue.Length; index += 1)
        {
            char character = safeValue[index];
            switch (character)
            {
                case '"':
                    builder.Append("\\\"");
                    break;
                case '\\':
                    builder.Append("\\\\");
                    break;
                case '\n':
                    builder.Append("\\n");
                    break;
                case '\r':
                    builder.Append("\\r");
                    break;
                case '\t':
                    builder.Append("\\t");
                    break;
                default:
                    if (character < 0x20)
                    {
                        builder.Append("\\u");
                        builder.Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        builder.Append(character);
                    }
                    break;
            }
        }
        builder.Append('"');
        return builder.ToString();
    }
}
