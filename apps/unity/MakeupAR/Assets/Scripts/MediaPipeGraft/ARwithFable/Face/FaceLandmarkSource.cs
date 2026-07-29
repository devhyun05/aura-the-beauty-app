using System;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
#if MEDIAPIPE
using System.Collections;
using Mediapipe;
using Mediapipe.Tasks.Vision.FaceLandmarker;
using Mediapipe.Unity;
#endif

namespace ARMakeup.Face
{
    /// <summary>
    /// MediaPipe Face Landmarker(478pt)를 AR Foundation 카메라 CPU 프레임으로 구동하는
    /// 랜드마크 소스. 전/후면 카메라 모두에서 동작하며, 모든 플랫폼에서 동일한
    /// canonical 토폴로지를 출력한다.
    ///
    /// 표시와 검출을 분리한 지연 재생(delayed playback) 구조:
    ///  - 캡처: 매 프레임 카메라 이미지를 링버퍼에 담는다 (추론과 무관하게 60fps).
    ///  - 검출: 여유가 생길 때마다 최신 프레임을 저해상도로 추론에 보낸다 (~30fps).
    ///  - 재생: 실시간보다 늦은 재생 시계로 프레임을 표시하고, 그 프레임 시각을
    ///    사이에 두는 두 검출 결과를 보간해 Landmarks에 쓴다.
    ///  → 영상은 디스플레이 레이트로 부드럽게 흐르고, 메이크업은 표시 중인 프레임과
    ///    같은 시각의 랜드마크로 그려져 픽셀 고정이 유지된다 (외삽 없음 = 오버슈트 없음).
    ///    대가는 재생 지연(추론 간격 + 결과 나이 + 마진)뿐이다.
    ///
    /// 안전장치: 재생 시계는 최신 검출 결과를 추월하지 못한다 — 추론이 느려지면
    /// 표시가 추론 케이던스로 저하될 뿐 메이크업이 영상에서 떨어지지 않는다.
    /// 추론이 죽으면(콜백 무응답) 워치독이 재제출·재생성하고, 그동안 영상은
    /// 자유 재생하되 메이크업은 숨긴다.
    ///
    /// MEDIAPIPE 디파인은 com.github.homuler.mediapipe 패키지가 설치되면
    /// ARMakeup.Runtime.asmdef의 versionDefines로 자동 활성화된다.
    /// 미설치 시 이 컴포넌트는 비활성 상태로 남고 ARKit/ARCore 폴백 경로가 사용된다.
    /// </summary>
    // 실행 순서 -100: 랜드마크·표시 프레임 생산자(Update에서 Landmarks/Present) —
    // 좌표·스냅 소비자 전부보다 먼저 돌게 고정.
    [DefaultExecutionOrder(-100)]
    public class FaceLandmarkSource : MonoBehaviour
    {
        public const int LandmarkCount = 478;
        public const int MeshVertexCount = 468; // 469~478은 홍채(좌 5 + 우 5)

        public static FaceLandmarkSource Instance { get; private set; }

        /// <summary>표시 중인 프레임에 얼굴이 있는지 (메인 스레드에서 갱신).</summary>
        public bool HasFace { get; private set; }

        /// <summary>
        /// 표시 중인 프레임 시각으로 보간된 랜드마크. MediaPipe 정규화 이미지
        /// 좌표계(x,y ∈ [0,1], 원점 좌상단, z는 상대 깊이). HasFace가 true일 때만 유효.
        /// </summary>
        public Vector3[] Landmarks { get; } = new Vector3[LandmarkCount];

        /// <summary>캘리브레이션용 회전 오버라이드 (-1 = 자동 추정).</summary>
        public int rotationOverride = -1;

        ARCameraManager _cameraManager;
        FaceCameraFrameBroker _frameBroker;

        void Awake()
        {
            Instance = this;
#if MEDIAPIPE
            for (var i = 0; i < _results.Length; i++)
                _results[i].points = new Vector3[LandmarkCount];
#endif
        }

        void OnDestroy()
        {
            UnsubscribeFrameBroker();
            if (Instance == this) Instance = null;
#if MEDIAPIPE
            // Close가 그래프 에러 상태에서 throw해도 버퍼는 반드시 반납한다.
            // 순서 주의: in-flight 검출 이미지가 _detectBuffer를 참조하므로
            // Close(내부 WaitUntilDone)가 끝난 뒤에만 Dispose해야 한다.
            try { _landmarker?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[FaceLandmarkSource] Close 실패: {e.Message}"); }
            _landmarker = null;
            for (var s = 0; s < _frameSlots.Length; s++)
            {
                if (_frameSlots[s].buffer.IsCreated) _frameSlots[s].buffer.Dispose();
            }
            if (_detectBuffer.IsCreated) _detectBuffer.Dispose();
            if (_externalBuffer.IsCreated) _externalBuffer.Dispose();
#endif
        }

        public void Init(ARCameraManager cameraManager)
        {
            _cameraManager = cameraManager;
            TrySubscribeFrameBroker();
        }

        void OnEnable()
        {
            TrySubscribeFrameBroker();
        }

        void OnDisable()
        {
            UnsubscribeFrameBroker();
        }

        /// <summary>
        /// Stops only the live camera pipeline while preserving the prepared
        /// MediaPipe model and its native allocations for a fast AR resume.
        /// Still-image analysis uses a separate IMAGE-mode service and is not
        /// affected by this switch.
        /// </summary>
        public void SetLiveProcessingActive(bool active)
        {
            if (active)
            {
                enabled = true;
                TrySubscribeFrameBroker();
                return;
            }

#if MEDIAPIPE
            ResetTrackingState();
#else
            HasFace = false;
#endif
            enabled = false;
        }

        void TrySubscribeFrameBroker()
        {
            FaceCameraFrameBroker broker = FaceCameraFrameBroker.Instance;
            if (broker == null || broker == _frameBroker)
            {
                return;
            }

            UnsubscribeFrameBroker();
            _frameBroker = broker;
            _frameBroker.FrameReceived += OnBrokerFrame;
        }

        void UnsubscribeFrameBroker()
        {
            if (_frameBroker != null)
            {
                _frameBroker.FrameReceived -= OnBrokerFrame;
                _frameBroker = null;
            }
        }

        void OnBrokerFrame(FaceCameraFrame frame)
        {
#if MEDIAPIPE
            if (!_externalMode)
            {
                CaptureAndDetect(frame);
            }
#endif
        }

#if MEDIAPIPE
        // 표시용은 화질 기준(화면 절반 폭 이상), 검출용은 속도 기준 — FaceLandmarker의
        // 내부 크롭은 192~256px라 640이면 충분하고, 변환·업로드가 4배 가벼워진다.
        // (검출 다운스케일에 따른 립/아이라인 정밀도는 실기기 검증 항목)
        const int DisplayLongSide = 1280;
        const int DetectLongSide = 640;

        // 재생 지연 = 추론 간격 EMA + 결과 나이 EMA + 마진.
        // 표시 프레임 T를 감싸는 미래쪽 결과는 T 직후 제출분(≤ T+간격)이고 그 결과가
        // 나이(캡처→승격 레이턴시)만큼 늦게 도착하므로, 간격+나이보다 덜 늦추면
        // 브래킷이 없어 보간이 최신 스냅으로 얼어붙는다 (리뷰에서 1.25×간격은
        // 수학적으로 부족함이 확인됨).
        const float DelayMarginMs = 10f;
        const float DelayMinMs = 40f;
        const float DelayMaxMs = 150f;
        // 지연 목표가 출렁여도 재생 시계가 역행하지 않도록 슬루 제한 (1ms당 0.5ms).
        const float DelaySlewRate = 0.5f;

        // 60fps × 최대 지연(150ms) ≈ 9프레임 + 여유. 큐가 가득 차면 표시용 캡처를
        // 건너뛰어 추론 케이던스 표시로 우아하게 저하된다.
        const int FrameHistoryCapacity = 14;

        // 보간 브래킷 탐색용 결과 히스토리. 지연이 여러 추론 간격에 달할 수 있어
        // 2칸 페어로는 승격 순간 아직 필요한 과거 브래킷을 버리게 된다 (리뷰 확인).
        const int ResultHistorySize = 6;

        // 추론 워치독: LIVE_STREAM은 입력마다 출력을 보장하지 않고(프레임 드랍),
        // 그래프 에러(예: 백그라운드 전환 시 GPU 중단) 시 콜백이 영영 안 온다.
        // _inFlight가 잠기면 검출만 조용히 죽고 영상은 계속 흐르므로 반드시 회복.
        const float DetectTimeoutMs = 1000f;
        const int MaxDetectFailures = 3;
        // 이보다 오래 결과가 없으면 추론이 죽은 것으로 보고: 재생 클램프를 풀어
        // 영상은 흐르게 하되, 낡은 랜드마크로 메이크업을 그리지 않는다.
        const float DeadInferenceMs = 800f;

        FaceLandmarker _landmarker;
        volatile bool _inFlight;
        bool _ready;
        double _inFlightSinceMs;
        int _consecutiveDetectFailures;

        // 표시 프레임 슬롯은 한 번 할당해 재사용하고, 점유 순서는 고정 용량 원형 큐가
        // 관리한다. head는 다음 표시 프레임이 선택될 때까지 유지되어 CPU 샘플도 안전하다.
        struct FrameSlot
        {
            public NativeArray<byte> buffer;
            public int width, height;
        }

        readonly FrameSlot[] _frameSlots = new FrameSlot[FrameHistoryCapacity];
        readonly TimestampedCircularQueue _frameQueue =
            new TimestampedCircularQueue(FrameHistoryCapacity);
        NativeArray<byte> _detectBuffer; // 단일 in-flight이므로 하나를 재사용

        // ── 카메라 전환 감지 (전면↔후면) ──
        // MakeupController.SetCamera는 requestedFacingDirection만 바꾸고 이 컴포넌트에
        // 알리지 않으므로, 실제 프로바이더 전환(currentFacingDirection 변화)을 여기서
        // 자체 감지해 이전 카메라의 프레임·검출 결과 잔재를 리셋한다.
        bool _facingInitialized;
        bool _lastUserFacing;
        double _facingSwitchMs; // 전환 시각 — 그 전에 캡처된(이전 카메라) 결과 폐기 기준

        // 표시 중인 프레임(엣지 스냅용 CPU 샘플). 원형 큐의 head 슬롯을 참조하며,
        // 더 최신 표시 프레임이 선택될 때까지 그 슬롯을 큐에서 유지한다. LateUpdate
        // 소비자는 이 프레임에서 경계 픽셀을 읽는다(립 색상·속눈썹 라인·홍채 반경 스냅).
        NativeArray<byte> _presentedBuffer;
        int _presentedW, _presentedH;
        bool _hasPresentedFrame;

        // ── 미디어 편집 모드(사진/영상 보정) ──
        // 라이브 카메라 대신 임포트 사진/영상 프레임을 외부(MediaEditController)에서 밀어넣는다.
        // 켜지면 Update의 라이브 파이프라인(캡처·검출·지연재생)을 멈추고, 표시·랜드마크·CPU
        // 샘플 버퍼를 PushExternalFrame이 직접 채운다 — 렌더러는 무변경(같은 표면 소비).
        bool _externalMode;
        NativeArray<byte> _externalBuffer; // 표시/샘플용 소유 사본(top-first RGBA)

        // 콜백은 워커 스레드에서 오므로 백버퍼에 쓰고 메인 스레드에서 승격한다.
        readonly object _resultLock = new object();
        readonly Vector3[] _backBuffer = new Vector3[LandmarkCount];
        bool _pending;
        bool _pendingHasFace;
        long _pendingTimestampMs;

        // 검출 결과 히스토리 (One Euro 필터 통과본, 순환 버퍼, 타임스탬프 오름차순).
        struct ResultFrame
        {
            public Vector3[] points;
            public double timestampMs;
            public bool hasFace;
        }

        readonly ResultFrame[] _results = new ResultFrame[ResultHistorySize];
        int _resultHead = -1; // 최신 결과 인덱스
        int _resultCount;

        // One Euro 필터 — 정지 지터 제거용. 움직임 고정은 아래 raw 블렌드가 담당.
        // minCutoff는 저속 시상수 τ=1/2πfc를 지배한다: 0.1이면 τ=1.6초라 미세
        // 움직임에서 오버레이가 얼굴을 1.6초에 걸쳐 겨우 따라잡아(실기기 "가만히
        // 있어도 뒤처짐") 지연 재생으로도 못 감춘다. 1.5로 올려 τ≈0.1초 —
        // 저속 지연을 10배 이상 줄인다. 실제 움직임의 잔여 지연은 raw 블렌드가 없앤다.
        const float FilterMinCutoff = 1.5f; // Hz — 저속 catch-up 속도(높을수록 지연↓ 지터↑)
        const float FilterBeta = 80.0f;     // 속도 반응 — 빠른 움직임 즉시 통과
        const float FilterDCutoff = 3.0f;   // 속도 추정 응답 — 낮으면 블렌드 게이트가 굼뜸
        readonly Vector3[] _filtered = new Vector3[LandmarkCount];
        readonly Vector3[] _velocity = new Vector3[LandmarkCount];
        readonly Vector3[] _pinned = new Vector3[LandmarkCount]; // 결과 저장용(정지=필터/움직임=raw 블렌드)
        bool _filterPrimed;
        double _lastResultTimestampMs = -1.0;
        // MediaPipe can miss an otherwise stable face for a single inference
        // result. Turning every renderer off for that one miss produces a
        // visible makeup flash. Hold the last filtered landmarks briefly, then
        // hide normally when the loss is sustained.
        const int FaceLossGraceResults = 3;
        int _missingFaceResultStreak;

        // 정지=필터(부드럽게)/움직임=raw(완벽 고정) 블렌드.
        // raw 랜드마크는 "그 검출 프레임의 실제 얼굴 위치"라, 지연 재생 프레임에 raw를
        // 보간하면 오프셋이 원리적으로 0이다 — 필터를 거친 값이 뒤처지는 게 움직일 때
        // 메이크업이 "안 붙는" 정체(립·아이라이너 공통). 반대로 정지 시 raw는 검출
        // 지터가 있으므로 필터된 속도가 임계 이하면 필터값으로 부드럽게 간다.
        // (|raw-filtered|가 아니라 "필터된" 속도로 게이트해 정지 지터엔 덜 반응.)
        // 미세 움직임 지연은 minCutoff=1.5(τ≈0.1초)로 이미 안 보이는 수준이라, 이
        // 블렌드는 눈에 보이는 실제 움직임에서만 raw로 완전 고정을 얹는다.
        const float PinVelThreshold = 0.04f; // 전역 평균 속도(정규화단위/초) 게이트
        // 개별 잔여지연 |raw−filtered| 게이트 — 정지 지터(작음)는 안 걸리고 실제 국소
        // 움직임(입 개폐·깜빡임, 큼)은 즉시 걸리게. 낮출수록 반응↑ 지터↑.
        const float PinDivThreshold = 0.004f;
        // 결맞음(coherent) 속도 게이트 — "정지해도 미세하게 움직이면 흔들흔들"의 사각지대
        // 해결. 위 두 게이트는 sum(|속도|)이라 정지 지터와 미세 실제 움직임을 못 가른다
        // (둘 다 작음). 이건 속도 "벡터 평균"의 크기: 정지 지터는 랜덤 방향이라 상쇄돼
        // ≈0, 얼굴 전체가 같이 미세 이동하면 벡터가 안 상쇄돼 커진다 → 지터엔 안 걸리고
        // 미세 실제 움직임만 raw로 고정. 임계 낮출수록 미세 움직임 고정↑(너무 낮으면 지터↑).
        const float PinCoherentThreshold = 0.007f;

        // ── 예측(외삽) 트래킹 — 실험적 지연 감축 ──
        // 재생을 최신 검출 시각으로 클램프하면(구조상) 카메라가 이미 가진 더 최신 프레임을
        // 못 보여줘 지연이 남는다. 표시를 PredictLeadMs만큼 앞으로 당겨 더 최신 프레임을
        // 표시하고, 최신 검출 너머 간격은 속도 외삽으로 랜드마크를 예측해 메이크업을 맞춘다.
        // 대가: 급격한 방향전환 순간 예측이 빗나가 오버슈트(살짝 튐). 아래 안전장치로 제한.
        //   0으로 두면 완전 비활성(구 동작과 동일) — 실험 롤백 스위치.
        const float PredictLeadMs = 30f;        // 표시를 실시간 쪽으로 당기는 양(지연 감축 목표)
        const float PredictMaxMs = 45f;         // 최신 검출 너머 외삽 상한(예측 신뢰 구간 캡)
        // 결맞음 게이트: 정지 지터를 외삽하면 증폭되므로(지터×lead), 얼굴 전체가 실제로
        // 이동할 때만 예측. 벡터평균 속도가 이 값이면 gain=1(완전 예측), 정지≈0이면 예측 없음.
        const float PredictCoherentFull = 0.02f; // 완전 예측 도달 결맞음 속도(정규화단위/초)
        const float PredictMaxDisp = 0.03f;      // 랜드마크당 예측 변위 캡(오버슈트 제한, 정규화단위)

        // 재생/계측
        double _intervalEmaMs = 66.0; // 추론 간격 EMA (캡처 타임스탬프 기준)
        double _ageEmaMs = 50.0;      // 결과 나이 EMA (캡처→승격 레이턴시)
        double _lastResultArrivalMs;  // 마지막 결과 승격 wall time (죽음 감지)
        float _delayMs = -1f;         // 슬루 적용된 현재 재생 지연
        double _lastPresentedTs = -1.0;
        int _statCaptures, _statPresents, _statResults;
        float _statWindowStart;

        static float FilterAlpha(float cutoff, float dt)
        {
            var tau = 1f / (2f * Mathf.PI * cutoff);
            return 1f / (1f + tau / dt);
        }

        IEnumerator Start()
        {
            // 모델 파일을 StreamingAssets에서 네이티브가 읽을 수 있는 캐시 경로로 복사
            Mediapipe.Unity.IResourceManager resources = new StreamingAssetsResourceManager();
            yield return resources.PrepareAssetAsync("face_landmarker.task");

            // GPU 추론이 CPU보다 수 배 빨라 결과 주기가 짧아지고(계단 현상 감소),
            // 실패하는 기기에서는 CPU로 폴백한다.
            if (!TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU) &&
                !TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU))
            {
                Debug.LogError("[FaceLandmarkSource] FaceLandmarker 생성 실패");
                yield break;
            }
            _ready = true;
        }

        bool TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate del)
        {
            try
            {
                var options = new FaceLandmarkerOptions(
                    new Mediapipe.Tasks.Core.BaseOptions(
                        del, modelAssetPath: "face_landmarker.task"),
                    runningMode: Mediapipe.Tasks.Vision.Core.RunningMode.LIVE_STREAM,
                    numFaces: 1,
                    resultCallback: OnResult);

                _landmarker = FaceLandmarker.CreateFromOptions(options);
                Debug.Log($"[FaceLandmarkSource] MediaPipe FaceLandmarker ready ({del}, LIVE_STREAM)");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[FaceLandmarkSource] {del} delegate 실패: {e.Message}");
                return false;
            }
        }

        /// <summary>추론이 회복 불가로 보이면 랜드마커를 닫고 다시 만든다.</summary>
        void RecreateLandmarker()
        {
            _consecutiveDetectFailures = 0;
            _ready = false;
            try { _landmarker?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[FaceLandmarkSource] Close 실패: {e.Message}"); }
            _landmarker = null;
            _inFlight = false;

            Debug.LogWarning("[FaceLandmarkSource] 랜드마커 재생성 (연속 추론 실패)");
            if (TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU) ||
                TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU))
                _ready = true;
            else
                Debug.LogError("[FaceLandmarkSource] 랜드마커 재생성 실패 — 검출 중단");
        }

        void Update()
        {
            // 미디어 편집(사진/영상 보정) 모드: 라이브 카메라 파이프라인을 멈추고,
            // 표시·랜드마크·CPU 샘플 버퍼를 외부(MediaEditController)가 PushExternalFrame로
            // 직접 채운다. 렌더러는 같은 공개 표면(HasFace/Landmarks/샘플)을 그대로 소비.
            if (_externalMode) return;

            TrySubscribeFrameBroker();
            DetectFacingSwitch();
            PromotePendingResult();
            MaintainDetectionWatchdog();
            PresentDelayed();
        }

        /// <summary>워커 스레드 결과를 필터에 통과시켜 결과 히스토리로 승격한다.</summary>
        void PromotePendingResult()
        {
            lock (_resultLock)
            {
                if (!_pending) return;
                _pending = false;
                _consecutiveDetectFailures = 0;

                var nowMs = Time.realtimeSinceStartupAsDouble * 1000.0;
                _lastResultArrivalMs = nowMs; // 추론 생존 신호 — 아래 폐기 여부와 무관

                // 카메라 전환 전에 캡처된(이전 카메라 얼굴) 결과는 폐기 —
                // 리셋된 히스토리·One Euro 필터를 낡은 랜드마크로 오염시키지 않는다.
                if (_pendingTimestampMs < _facingSwitchMs) return;
                _statResults++;

                // 지연 산정용 EMA — 결과 나이(캡처→승격)와 추론 간격(캡처 시각 기준)
                var age = nowMs - _pendingTimestampMs;
                if (age > 0 && age < 500)
                    _ageEmaMs = Mathf.Lerp((float)_ageEmaMs, (float)age, 0.1f);
                if (_lastResultTimestampMs > 0)
                {
                    var interval = _pendingTimestampMs - _lastResultTimestampMs;
                    if (interval > 0 && interval < 500)
                        _intervalEmaMs = Mathf.Lerp((float)_intervalEmaMs, (float)interval, 0.1f);
                }

                var effectiveHasFace = _pendingHasFace;
                if (_pendingHasFace)
                {
                    _missingFaceResultStreak = 0;
                    // 필터 dt는 도착 시각이 아니라 캡처 타임스탬프 간격 — 결과 도착
                    // 지터가 속도 추정에 섞이지 않는다.
                    var dt = _lastResultTimestampMs > 0
                        ? Mathf.Clamp(
                            (float)((_pendingTimestampMs - _lastResultTimestampMs) / 1000.0),
                            1e-3f, 0.2f)
                        : 0.033f;

                    if (!_filterPrimed)
                    {
                        _filterPrimed = true;
                        Array.Copy(_backBuffer, _filtered, LandmarkCount);
                        Array.Clear(_velocity, 0, LandmarkCount);
                        Array.Copy(_filtered, _pinned, LandmarkCount); // 속도 0 → raw==filtered
                    }
                    else
                    {
                        var aVel = FilterAlpha(FilterDCutoff, dt);
                        var sumSpeed = 0f;
                        var sumVel = Vector3.zero; // 속도 벡터합 → 결맞음 속도(방향 상쇄)
                        for (var i = 0; i < LandmarkCount; i++)
                        {
                            var raw = _backBuffer[i];
                            _velocity[i] = Vector3.Lerp(
                                _velocity[i], (raw - _filtered[i]) / dt, aVel);
                            var cutoff = FilterMinCutoff + FilterBeta * _velocity[i].magnitude;
                            _filtered[i] = Vector3.Lerp(
                                _filtered[i], raw, FilterAlpha(cutoff, dt));
                            sumSpeed += _velocity[i].magnitude;
                            sumVel += _velocity[i];
                        }

                        // 게이트 = max(전역 움직임, 결맞음 미세이동, 개별 잔여지연).
                        //  - 전역(평균 속도): yaw 회전 시 축 근처 저속 랜드마크(눈 앞머리·
                        //    입술·코)까지 전부 고정 — 개별 속도만으론 떠 보인다.
                        //  - 결맞음(벡터평균 크기): 정지 지터(랜덤방향 상쇄≈0)와 미세 실제
                        //    이동(방향 일치→큼)을 구분 — "정지해도 미세 움직이면 흔들흔들" 해결.
                        //  - 개별 잔여지연 |raw−filtered|: 필터 속도는 개폐 시작 순간 몇
                        //    프레임 늦게 올라와 입 여닫기가 느리다. 잔여지연은 raw가 벌어지는
                        //    즉시 커져 지연 0으로 국소 움직임(입·눈깜빡임)을 바로 고정한다.
                        var globalSpeed = sumSpeed / LandmarkCount;
                        var coherentSpeed = (sumVel / LandmarkCount).magnitude;
                        var globalGate = Mathf.Max(
                            globalSpeed / PinVelThreshold, coherentSpeed / PinCoherentThreshold);
                        for (var i = 0; i < LandmarkCount; i++)
                        {
                            var div = (_backBuffer[i] - _filtered[i]).magnitude; // 잔여지연=즉각반응
                            var w = Mathf.Clamp01(Mathf.Max(globalGate, div / PinDivThreshold));
                            _pinned[i] = Vector3.LerpUnclamped(_filtered[i], _backBuffer[i], w);
                        }
                    }
                }
                else
                {
                    _missingFaceResultStreak++;
                    effectiveHasFace = _filterPrimed
                        && _missingFaceResultStreak <= FaceLossGraceResults;
                    if (!effectiveHasFace)
                    {
                        _filterPrimed = false; // 지속 상실 뒤 재인식할 때 필터 리셋
                    }
                }

                _lastResultTimestampMs = _pendingTimestampMs;

                // 히스토리 순환 버퍼에 추가 (points 배열 재사용, 무할당)
                _resultHead = (_resultHead + 1) % _results.Length;
                if (_resultCount < _results.Length) _resultCount++;
                _results[_resultHead].timestampMs = _pendingTimestampMs;
                _results[_resultHead].hasFace = effectiveHasFace;
                if (effectiveHasFace)
                    Array.Copy(_pinned, _results[_resultHead].points, LandmarkCount);
            }
        }

        /// <summary>
        /// 브로커가 소유한 카메라 이미지를 표시 원형 큐의 tail 슬롯에 복사하고, 추론이 놀고 있으면
        /// 같은 borrowed 이미지를 저해상도로 변환해 검출에 보낸다.
        /// </summary>
        void CaptureAndDetect(FaceCameraFrame frame)
        {
            XRCpuImage cpuImage = frame.Image;
            double nowMs = frame.ObservedAtMs;

            // ---- 표시용 캡처 (고정 용량 원형 큐) ----
            if (_frameQueue.TryGetEnqueueSlot(out var slot))
            {
                var conv = new XRCpuImage.ConversionParams(
                    cpuImage, TextureFormat.RGBA32, XRCpuImage.Transformation.None);
                var down = Mathf.Max(1, Mathf.RoundToInt(
                    Mathf.Max(cpuImage.width, cpuImage.height) / (float)DisplayLongSide));
                conv.outputDimensions = new Vector2Int(
                    cpuImage.width / down, cpuImage.height / down);

                var size = cpuImage.GetConvertedDataSize(conv);
                if (!_frameSlots[slot].buffer.IsCreated || _frameSlots[slot].buffer.Length < size)
                {
                    if (_frameSlots[slot].buffer.IsCreated) _frameSlots[slot].buffer.Dispose();
                    _frameSlots[slot].buffer = new NativeArray<byte>(size, Allocator.Persistent);
                }
                cpuImage.Convert(conv, _frameSlots[slot].buffer);

                _frameSlots[slot].width = conv.outputDimensions.x;
                _frameSlots[slot].height = conv.outputDimensions.y;
                _frameQueue.CommitEnqueue(slot, nowMs);
                _statCaptures++;
            }
            // 큐가 가득 차면 이 프레임 표시는 건너뛴다 (검출은 계속)

            // ---- 검출용 변환 + 제출 ----
            if (_ready && !_inFlight)
            {
                var dconv = new XRCpuImage.ConversionParams(
                    cpuImage, TextureFormat.RGBA32, XRCpuImage.Transformation.None);
                var ddown = Mathf.Max(1, Mathf.RoundToInt(
                    Mathf.Max(cpuImage.width, cpuImage.height) / (float)DetectLongSide));
                dconv.outputDimensions = new Vector2Int(
                    cpuImage.width / ddown, cpuImage.height / ddown);

                var dsize = cpuImage.GetConvertedDataSize(dconv);
                if (!_detectBuffer.IsCreated || _detectBuffer.Length < dsize)
                {
                    if (_detectBuffer.IsCreated) _detectBuffer.Dispose();
                    _detectBuffer = new NativeArray<byte>(dsize, Allocator.Persistent);
                }
                cpuImage.Convert(dconv, _detectBuffer);

                var image = new Image(
                    ImageFormat.Types.Format.Srgba,
                    dconv.outputDimensions.x, dconv.outputDimensions.y,
                    dconv.outputDimensions.x * 4, _detectBuffer);

                // _inFlight가 콜백 전 버퍼 재사용을 막는다 (동시 1프레임만 추론).
                // DetectAsync는 에러 그래프에서 throw할 수 있다 — 잠김 방지.
                _inFlight = true;
                _inFlightSinceMs = nowMs;
                try
                {
                    var processing = new Mediapipe.Tasks.Vision.Core.ImageProcessingOptions(
                        rotationDegrees: GuessRotationDegrees(
                            dconv.outputDimensions.x, dconv.outputDimensions.y));
                    _landmarker.DetectAsync(image, (long)nowMs, processing);
                }
                catch (Exception e)
                {
                    _inFlight = false;
                    _consecutiveDetectFailures++;
                    Debug.LogWarning($"[FaceLandmarkSource] DetectAsync 실패: {e.Message}");
                    if (_consecutiveDetectFailures >= MaxDetectFailures) RecreateLandmarker();
                }
            }
        }

        void MaintainDetectionWatchdog()
        {
            if (!_inFlight
                || Time.realtimeSinceStartupAsDouble * 1000.0 - _inFlightSinceMs
                    <= DetectTimeoutMs)
            {
                return;
            }

            _inFlight = false;
            _consecutiveDetectFailures++;
            Debug.LogWarning("[FaceLandmarkSource] 추론 결과 타임아웃 — 재제출");
            if (_consecutiveDetectFailures >= MaxDetectFailures)
            {
                RecreateLandmarker();
            }
        }

        /// <summary>
        /// 재생 시계(실시간 − 지연)에 해당하는 프레임을 표시하고, 그 시각으로
        /// 랜드마크를 보간한다. 영상과 메이크업이 항상 같은 시각을 가리킨다.
        /// </summary>
        void PresentDelayed()
        {
            var nowMs = Time.realtimeSinceStartupAsDouble * 1000.0;

            // 지연 목표: 간격 + 나이 + 마진 (도출은 상수 주석 참고). 슬루로 부드럽게
            // 추종해 재생 시계의 역행/급점프를 막는다.
            var target = Mathf.Clamp(
                (float)(_intervalEmaMs + _ageEmaMs) + DelayMarginMs, DelayMinMs, DelayMaxMs);
            _delayMs = _delayMs < 0f
                ? target
                : Mathf.MoveTowards(_delayMs, target, DelaySlewRate * Time.unscaledDeltaTime * 1000f);
            // 표시를 PredictLeadMs만큼 앞으로 당겨 더 최신 카메라 프레임을 보여준다(지연 감축).
            // 최신 검출 너머 간격은 InterpolateLandmarks가 속도 외삽으로 채운다.
            var presentTs = nowMs - _delayMs + PredictLeadMs;

            // 재생 시계가 (최신 검출 + 예측 상한)을 넘지 못하게 클램프 — 예측을 신뢰 구간
            // 안으로 제한한다. 예측 비활성(Lead=0·Max=0)이면 구 동작(newest로 스냅)과 동일.
            // 추론이 죽었을 때만 클램프를 풀어 영상은 계속 흐르게 한다.
            var inferenceDead = nowMs - _lastResultArrivalMs > DeadInferenceMs;
            var newestTs = _resultCount > 0 ? _results[_resultHead].timestampMs : -1.0;
            if (!inferenceDead && newestTs >= 0 && presentTs > newestTs + PredictMaxMs)
                presentTs = newestTs + PredictMaxMs;

            // 시간순 원형 큐의 head를 재생 시각 이전의 가장 최신 프레임까지 전진한다.
            // 선택된 head는 다음 프레임으로 전진할 때까지 점유해 CPU 샘플 참조를 보호한다.
            if (_frameQueue.TryAdvanceToLatestAtOrBefore(
                    presentTs, out var selectedSlot, out var selectedTimestampMs)
                && selectedTimestampMs > _lastPresentedTs)
            {
                if (FramePresenter.Instance != null)
                    FramePresenter.Instance.Present(
                        _frameSlots[selectedSlot].buffer,
                        _frameSlots[selectedSlot].width,
                        _frameSlots[selectedSlot].height);
                _lastPresentedTs = selectedTimestampMs;
                _presentedBuffer = _frameSlots[selectedSlot].buffer;
                _presentedW = _frameSlots[selectedSlot].width;
                _presentedH = _frameSlots[selectedSlot].height;
                _hasPresentedFrame = true;
                _statPresents++;
            }

            if (_lastPresentedTs >= 0) InterpolateLandmarks(_lastPresentedTs, inferenceDead);

            // 눈가 시간축 안정화(One-Euro) — 실기기에서 속눈썹·라이너가 랜드마크 지터에
            // 직결돼 떨리던 문제(사용자 0723). 얼굴 상실 시 상태 리셋(재획득 팝 방지).
            if (HasFace && !_externalMode) SmoothEyeLandmarks(Time.deltaTime);
            else _euroInit = false;

            LogStats();
        }

        // ── 눈 랜드마크 시간축 안정화(One-Euro 필터) ──
        // MediaPipe 지터(프레임당 1~2px)가 눈꺼풀 체인에 직결된 속눈썹·라이너에서
        // 증폭돼 보이던 문제(실기기, 사용자 0723). 정지 시 저역통과로 떨림을 흡수하고
        // 이동 속도에 비례해 컷오프를 올려 지연을 최소화하는 표준 레시피.
        // 대상: 상·하안검 체인(양눈 32점)만 — 다른 부위 트래킹에 영향 없음.
        // 라이브 전용(외부 주입 모드는 정지 사진 = 무의미, 리그 결정론 유지).
        static readonly int[] EyeSmoothIdx =
        {
            33, 246, 161, 160, 159, 158, 157, 173, 133,   // 우 상안검
            7, 163, 144, 145, 153, 154, 155,              // 우 하안검(코너 중복 제외)
            263, 466, 388, 387, 386, 385, 384, 398, 362,  // 좌 상안검
            249, 390, 373, 374, 380, 381, 382,            // 좌 하안검
        };
        const float EyeEuroMinCutoff = 1.5f; // Hz — 정지 떨림 억제 강도(낮을수록 강함) // 실기기 튜닝 대상
        const float EyeEuroBeta = 30f;       // 속도(정규화/s)→컷오프 가중(빠른 이동 시 지연 제거) // 실기기 튜닝 대상
        const float EyeEuroDCutoff = 1f;     // 속도 추정 자체의 저역통과
        Vector3[] _euroX;
        Vector3[] _euroDx;
        bool _euroInit;

        void SmoothEyeLandmarks(float dt)
        {
            if (dt <= 0f) return;
            if (_euroX == null)
            {
                _euroX = new Vector3[EyeSmoothIdx.Length];
                _euroDx = new Vector3[EyeSmoothIdx.Length];
            }
            if (!_euroInit)
            {
                for (var k = 0; k < EyeSmoothIdx.Length; k++)
                {
                    _euroX[k] = Landmarks[EyeSmoothIdx[k]];
                    _euroDx[k] = Vector3.zero;
                }
                _euroInit = true;
                return;
            }
            var ad = EuroAlpha(EyeEuroDCutoff, dt);
            for (var k = 0; k < EyeSmoothIdx.Length; k++)
            {
                var i = EyeSmoothIdx[k];
                var x = Landmarks[i];
                var dx = (x - _euroX[k]) / dt;
                var dxf = _euroDx[k] + (dx - _euroDx[k]) * ad;
                var cutoff = EyeEuroMinCutoff + EyeEuroBeta * dxf.magnitude;
                var xf = _euroX[k] + (x - _euroX[k]) * EuroAlpha(cutoff, dt);
                _euroX[k] = xf;
                _euroDx[k] = dxf;
                Landmarks[i] = xf;
            }
        }

        static float EuroAlpha(float cutoff, float dt)
        {
            var tau = 1f / (2f * Mathf.PI * Mathf.Max(cutoff, 1e-3f));
            return 1f / (1f + tau / dt);
        }

        /// <summary>
        /// 표시 중인 프레임 시각을 사이에 두는 두 검출 결과를 히스토리에서 찾아
        /// lerp한다. 실측 사이 보간이므로 오버슈트가 없다.
        /// </summary>
        void InterpolateLandmarks(double presentedTs, bool inferenceDead)
        {
            // 최신부터 과거로: 처음 만나는 ts ≤ presentedTs가 L(과거쪽 브래킷),
            // 직전에 지나친 것이 R(미래쪽 브래킷 중 가장 이른 것).
            var li = -1;
            var ri = -1;
            for (var k = 0; k < _resultCount; k++)
            {
                var idx = (_resultHead - k + _results.Length) % _results.Length;
                if (_results[idx].timestampMs > presentedTs)
                {
                    ri = idx;
                    continue;
                }
                li = idx;
                break;
            }

            if (li < 0) { HasFace = false; return; } // 첫 검출 이전 프레임

            if (ri < 0)
            {
                // 미래쪽 브래킷 없음 = 표시 프레임이 최신 검출보다 미래(예측 구간).
                // 추론이 죽은 채 영상만 흐르는 중이면 낡은 랜드마크로 그리지 않는다.
                if (inferenceDead) { HasFace = false; return; }
                HasFace = _results[li].hasFace;
                if (!HasFace) return;
                var newest = _results[li].points;

                // 속도 외삽: 두 최신 검출로 속도를 재고 표시 시각까지 예측(지연 감축).
                // 결맞음 게이트로 정지 지터 증폭을 막고, 변위 캡으로 오버슈트를 제한한다.
                var prevIdx = (li - 1 + _results.Length) % _results.Length;
                var dtLeadMs = (float)(presentedTs - _results[li].timestampMs); // >0 (예측 구간)
                if (_resultCount >= 2 && _results[prevIdx].hasFace && dtLeadMs > 0f)
                {
                    var prev = _results[prevIdx].points;
                    var dtDet = (float)(_results[li].timestampMs - _results[prevIdx].timestampMs) / 1000f;
                    if (dtDet > 1e-3f)
                    {
                        // 결맞음 속도(벡터평균 크기): 정지 지터는 상쇄≈0, 실제 이동만 큼.
                        Vector3 meanDisp = Vector3.zero;
                        for (var i = 0; i < LandmarkCount; i++) meanDisp += newest[i] - prev[i];
                        meanDisp /= LandmarkCount;
                        var coherent = meanDisp.magnitude / dtDet; // 정규화단위/초
                        var gain = Mathf.Clamp01(coherent / PredictCoherentFull);
                        var lead = Mathf.Min(dtLeadMs, PredictMaxMs) / 1000f * gain; // 초
                        for (var i = 0; i < LandmarkCount; i++)
                        {
                            var disp = (newest[i] - prev[i]) / dtDet * lead; // 속도×리드
                            if (disp.magnitude > PredictMaxDisp)
                                disp = disp.normalized * PredictMaxDisp; // 오버슈트 캡
                            Landmarks[i] = newest[i] + disp;
                        }
                        return;
                    }
                }
                Array.Copy(newest, Landmarks, LandmarkCount); // 폴백: 예측 불가 → 스냅
                return;
            }

            // 얼굴 상실/재획득이 걸친 브래킷은 모호 구간 — 표시 시각과 어긋난
            // 팝인/아웃 대신 브래킷 동안(최대 추론 간격 하나) 숨긴다.
            if (!_results[li].hasFace || !_results[ri].hasFace)
            {
                HasFace = false;
                return;
            }

            HasFace = true;
            var lt = _results[li].timestampMs;
            var rt = _results[ri].timestampMs;
            var frac = rt > lt
                ? Mathf.Clamp01((float)((presentedTs - lt) / (rt - lt)))
                : 1f;
            var a = _results[li].points;
            var b = _results[ri].points;
            if (frac >= 1f)
            {
                Array.Copy(b, Landmarks, LandmarkCount);
            }
            else if (frac <= 0f)
            {
                Array.Copy(a, Landmarks, LandmarkCount);
            }
            else
            {
                for (var i = 0; i < LandmarkCount; i++)
                    Landmarks[i] = Vector3.LerpUnclamped(a[i], b[i], frac);
            }
        }

        // ── 엣지 스냅용 프레임 샘플러 (LateUpdate에서만 유효) ──
        // 정규화 이미지 좌표(랜드마크 Landmarks[i].x/.y와 동일계)로 표시 프레임을
        // 바이리니어 샘플. 립 색상 모델·속눈썹 최암 탐색·홍채 반경 탐색이 공유.

        /// <summary>
        /// 표시 중 프레임의 캡처 타임스탬프(ms) — 세그 마스크 최근접 스냅(§11)의 기준 시각.
        /// 아직 표시 전이면 -1.
        /// </summary>
        public double PresentedTimestampMs => _lastPresentedTs;

        /// <summary>표시 프레임에 유효한 CPU 픽셀이 있는지.</summary>
        public bool HasPresentedFrame => _hasPresentedFrame && _presentedBuffer.IsCreated;

        public bool TrySampleColor(float nx, float ny, out float r, out float g, out float b)
        {
            r = g = b = 0f;
            if (!HasPresentedFrame) return false;
            int w = _presentedW, h = _presentedH;
            var fx = Mathf.Clamp01(nx) * (w - 1);
            var fy = Mathf.Clamp01(ny) * (h - 1);
            int x0 = (int)fx, y0 = (int)fy;
            int x1 = Mathf.Min(x0 + 1, w - 1), y1 = Mathf.Min(y0 + 1, h - 1);
            float tx = fx - x0, ty = fy - y0;
            Px(x0, y0, out var r00, out var g00, out var b00);
            Px(x1, y0, out var r10, out var g10, out var b10);
            Px(x0, y1, out var r01, out var g01, out var b01);
            Px(x1, y1, out var r11, out var g11, out var b11);
            r = Mathf.Lerp(Mathf.Lerp(r00, r10, tx), Mathf.Lerp(r01, r11, tx), ty);
            g = Mathf.Lerp(Mathf.Lerp(g00, g10, tx), Mathf.Lerp(g01, g11, tx), ty);
            b = Mathf.Lerp(Mathf.Lerp(b00, b10, tx), Mathf.Lerp(b01, b11, tx), ty);
            return true;
        }

        /// <summary>정규화 좌표의 명도(luma). 속눈썹 라인·홍채 경계 탐색용.</summary>
        public bool TrySampleLuma(float nx, float ny, out float luma)
        {
            luma = 0f;
            if (!TrySampleColor(nx, ny, out var r, out var g, out var b)) return false;
            luma = 0.299f * r + 0.587f * g + 0.114f * b;
            return true;
        }

        void Px(int x, int y, out float r, out float g, out float b)
        {
            var idx = (y * _presentedW + x) * 4; // RGBA32, 행0 = 이미지 상단
            r = _presentedBuffer[idx] / 255f;
            g = _presentedBuffer[idx + 1] / 255f;
            b = _presentedBuffer[idx + 2] / 255f;
        }

        // ── 미디어 편집 모드 API (MediaEditController가 구동) ──

        /// <summary>미디어 편집(사진/영상 보정) 모드인지 — 라이브 파이프라인 정지 상태.</summary>
        public bool ExternalMode => _externalMode;

        /// <summary>
        /// 편집 모드 진입 — 라이브 카메라 파이프라인을 멈추고 라이브 랜드마커를 닫아
        /// (GPU 반납) 외부 프레임 주입 대기 상태로 전환한다. FramePresenter는 정립(비회전·
        /// 비미러·레터박스 핏)으로 세운다 — 임포트 사진/영상은 EXIF 정규화로 이미 똑바로
        /// 서 있고, 편집 화면은 전체가 보이도록 화면에 맞춘다(크롭 없음).
        /// </summary>
        public void BeginExternalMode()
        {
            if (_externalMode) return;
            _externalMode = true;

            // 라이브 잔재 정리 — 남은 표시 프레임/검출 결과가 편집 화면에 새지 않게.
            ResetTrackingState();
            HasFace = false;
            _hasPresentedFrame = false;

            // 라이브 랜드마커를 닫아 GPU를 편집용 랜드마커(MediaEditController)에 양보.
            try { _landmarker?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[FaceLandmarkSource] 라이브 Close 실패: {e.Message}"); }
            _landmarker = null;
            _ready = false;
            _inFlight = false;

            if (FramePresenter.Instance != null) FramePresenter.Instance.BeginExternal();
        }

        /// <summary>
        /// 편집 모드 종료 — 라이브 카메라 파이프라인을 되살린다(랜드마커 재생성,
        /// FramePresenter 복귀). 편집 버퍼는 반납한다.
        /// </summary>
        public void EndExternalMode()
        {
            if (!_externalMode) return;
            _externalMode = false;
            HasFace = false;
            _hasPresentedFrame = false;
            if (_externalBuffer.IsCreated) { _externalBuffer.Dispose(); _externalBuffer = default; }
            if (FramePresenter.Instance != null) FramePresenter.Instance.EndExternal();
            ResetTrackingState();
            RecreateLandmarker(); // 라이브 랜드마커 재생성 (GPU→CPU 폴백 포함)
        }

        /// <summary>
        /// 외부(임포트 사진/영상) 프레임 한 장을 표시·랜드마크·CPU 샘플에 반영한다.
        /// rgba는 top-first RGBA32(라이브 경로와 동일 레이아웃), landmarks는 그 프레임의
        /// MediaPipe 정규화 좌표(478pt, x/y∈[0,1] 원점 좌상단, z 상대깊이). ExternalMode에서만
        /// 유효. buffer는 호출 후 재사용 가능(내부 소유 사본에 복사).
        /// </summary>
        public void PushExternalFrame(
            NativeArray<byte> rgba, int width, int height, Vector3[] landmarks, bool hasFace)
        {
            if (!_externalMode) return;
            var size = width * height * 4;
            if (size <= 0 || rgba.Length < size) return;

            if (!_externalBuffer.IsCreated || _externalBuffer.Length < size)
            {
                if (_externalBuffer.IsCreated) _externalBuffer.Dispose();
                _externalBuffer = new NativeArray<byte>(size, Allocator.Persistent);
            }
            NativeArray<byte>.Copy(rgba, _externalBuffer, size);

            if (FramePresenter.Instance != null)
                FramePresenter.Instance.Present(_externalBuffer, width, height);

            // CPU 샘플러(립 색·속눈썹·홍채 스냅)가 이 프레임을 읽는다 (라이브와 동일 계약).
            _presentedBuffer = _externalBuffer;
            _presentedW = width;
            _presentedH = height;
            _hasPresentedFrame = true;
            _lastPresentedTs = 0.0;

            HasFace = hasFace;
            if (hasFace && landmarks != null)
            {
                var n = Mathf.Min(landmarks.Length, LandmarkCount);
                Array.Copy(landmarks, Landmarks, n);
            }
        }

        void LogStats()
        {
            if (_statWindowStart == 0f) _statWindowStart = Time.realtimeSinceStartup;
            var elapsed = Time.realtimeSinceStartup - _statWindowStart;
            if (elapsed < 5f) return;

            Debug.Log(
                $"[Tracking] cap {_statCaptures / elapsed:F1}fps " +
                $"present {_statPresents / elapsed:F1}fps " +
                $"results {_statResults / elapsed:F1}/s " +
                $"interval {_intervalEmaMs:F0}ms age {_ageEmaMs:F0}ms delay {_delayMs:F0}ms");
            _statCaptures = _statPresents = _statResults = 0;
            _statWindowStart = Time.realtimeSinceStartup;
        }

        // 워커 스레드 — Unity API 호출 금지. 어떤 경우에도 _inFlight는 풀어준다.
        void OnResult(FaceLandmarkerResult result, Image image, long timestampMs)
        {
            try
            {
                lock (_resultLock)
                {
                    var faces = result.faceLandmarks;
                    _pendingHasFace = faces != null && faces.Count > 0;
                    if (_pendingHasFace)
                    {
                        var landmarks = faces[0].landmarks;
                        var count = Mathf.Min(landmarks.Count, LandmarkCount);
                        for (var i = 0; i < count; i++)
                        {
                            var lm = landmarks[i];
                            _backBuffer[i] = new Vector3(lm.x, lm.y, lm.z);
                        }
                    }
                    _pendingTimestampMs = timestampMs;
                    _pending = true;
                }
            }
            finally
            {
                _inFlight = false;
            }
        }

        /// <summary>실제 카메라 방향 — 프로바이더 미확정(None)이면 요청값 폴백.</summary>
        bool IsUserFacing()
        {
            if (_cameraManager == null) return true;
            var current = _cameraManager.currentFacingDirection;
            if (current != CameraFacingDirection.None)
                return current == CameraFacingDirection.User;
            return _cameraManager.requestedFacingDirection == CameraFacingDirection.User;
        }

        /// <summary>
        /// 전면↔후면 전환을 실제 프레임 공급 기준(currentFacingDirection)으로 감지해
        /// 트래킹 상태를 리셋한다. 요청 시점이 아니라 프로바이더가 실제로 전환된
        /// 시점에 걸리므로, 리셋 이후 캡처분은 전부 새 카메라 프레임이다.
        /// </summary>
        void DetectFacingSwitch()
        {
            var userFacing = IsUserFacing();
            if (!_facingInitialized)
            {
                _facingInitialized = true;
                _lastUserFacing = userFacing;
                return;
            }
            if (userFacing == _lastUserFacing) return;
            _lastUserFacing = userFacing;
            ResetTrackingState();
            Debug.Log(
                $"[FaceLandmarkSource] 카메라 전환 감지 → {(userFacing ? "front" : "rear")}" +
                " — 트래킹 상태 리셋");
        }

        /// <summary>
        /// 카메라 전환 시 이전 카메라의 잔재 — 표시 링버퍼·검출 결과 히스토리(보간
        /// 브래킷·예측 외삽 근거)·One Euro 필터 — 가 새 카메라 영상 위에 그려지지
        /// 않게 상태만 비운다. 버퍼 메모리와 지연 EMA(추론 케이던스는 카메라와
        /// 무관)는 유지해 전환 후 재수렴 비용을 줄인다.
        /// </summary>
        void ResetTrackingState()
        {
            _facingSwitchMs = Time.realtimeSinceStartupAsDouble * 1000.0;

            lock (_resultLock)
            {
                _pending = false;            // 이전 카메라의 미승격 결과 폐기
                _resultHead = -1;            // 보간(브래킷) 히스토리 비움
                _resultCount = 0;
                _filterPrimed = false;       // One Euro 필터 — 다음 결과에서 재프라임
                _missingFaceResultStreak = 0;
                _lastResultTimestampMs = -1.0;
            }

            _frameQueue.Reset();             // 표시 프레임 점유 순서만 폐기(할당 메모리는 재사용)
            _lastPresentedTs = -1.0;         // 새 프레임 표시 전까지 보간·외삽 중단
            _hasPresentedFrame = false;      // 엣지 스냅 샘플러의 이전 프레임 참조 차단
            HasFace = false;

            // 세그 마스크도 이전 카메라 잔재 — 같이 폐기(게이트는 새 마스크까지 1로 폴백).
            if (SegmentationSource.Instance != null) SegmentationSource.Instance.OnTrackingReset();
        }

        // ── MediaPipe 검출 회전 자동 추정값 (세로 고정 기준, facing별) ──
        // AR Foundation CPU 이미지 경로에는 WebCamTexture.videoRotationAngle 같은
        // 회전 API가 없다. 기기에서 얻을 수 있는 신호는 실제 facing
        // (currentFacingDirection)과 센서 버퍼의 가로/세로 방향뿐이라, 버퍼 방향을
        // 1차 신호로 쓰고 90/270 모호함만 아래 상수가 정한다.
        // 캘리브레이션 오버라이드(rotationOverride ≥ 0)는 항상 이 전부보다 우선.
        const int FrontDetectRotationIOS = 90;      // 실기기 확정 (iPhone 15 Pro)
        const int RearDetectRotationIOS = 90;       // 실기기 튜닝 대상 — 후면 미검증
        const int FrontDetectRotationAndroid = 270; // 통상 규칙 (기존 동작 유지, 미실측)
        const int RearDetectRotationAndroid = 90;   // 실기기 튜닝 대상 — 후면 미검증

        /// <summary>
        /// 센서 원본 프레임에서 얼굴이 똑바로 서도록 MediaPipe에 알려줄 회전값.
        /// 우선순위: 캘리브레이션 오버라이드 > 버퍼 방향(기기 신호) > facing별 상수.
        /// </summary>
        int GuessRotationDegrees(int bufferWidth, int bufferHeight)
        {
            if (rotationOverride >= 0) return rotationOverride;

            // 기기 신호 1차: 세로 고정 화면에서 버퍼가 이미 세로(h ≥ w)면 센서가
            // 서 있는 것 — 회전 불필요. (통상 모바일 센서는 가로 장착이라 드묾)
            if (bufferHeight >= bufferWidth) return 0;

            // 가로 버퍼: 90 vs 270의 모호함은 facing별 상수로 결정.
#if UNITY_IOS
            return IsUserFacing() ? FrontDetectRotationIOS : RearDetectRotationIOS;
#else
            return IsUserFacing() ? FrontDetectRotationAndroid : RearDetectRotationAndroid;
#endif
        }

        public int GetDetectionRotationDegrees(int bufferWidth, int bufferHeight)
        {
            return GuessRotationDegrees(bufferWidth, bufferHeight);
        }
#endif
    }
}
