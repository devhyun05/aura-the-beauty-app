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
            if (Instance == this) Instance = null;
#if MEDIAPIPE
            // Close가 그래프 에러 상태에서 throw해도 버퍼는 반드시 반납한다.
            // 순서 주의: in-flight 검출 이미지가 _detectBuffer를 참조하므로
            // Close(내부 WaitUntilDone)가 끝난 뒤에만 Dispose해야 한다.
            try { _landmarker?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[FaceLandmarkSource] Close 실패: {e.Message}"); }
            _landmarker = null;
            for (var s = 0; s < _ring.Length; s++)
            {
                if (_ring[s].buffer.IsCreated) _ring[s].buffer.Dispose();
            }
            if (_detectBuffer.IsCreated) _detectBuffer.Dispose();
#endif
        }

        public void Init(ARCameraManager cameraManager)
        {
            _cameraManager = cameraManager;
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

        // 60fps × 최대 지연(150ms) ≈ 9프레임 + 여유. 슬롯이 고갈되면 캡처를
        // 건너뛰어 추론 케이던스 표시로 우아하게 저하된다.
        const int RingSize = 14;

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

        // 표시 프레임 링버퍼: 캡처 시각 순으로 쌓이고, 재생 시계가 지나가며 반납한다.
        struct FrameSlot
        {
            public NativeArray<byte> buffer;
            public double timestampMs;
            public int width, height;
            public bool inUse;
        }

        readonly FrameSlot[] _ring = new FrameSlot[RingSize];
        NativeArray<byte> _detectBuffer; // 단일 in-flight이므로 하나를 재사용
        double _lastCpuImageTimestamp = -1.0; // 같은 센서 프레임 중복 캡처 방지

        // 표시 중인 프레임(엣지 스냅용 CPU 샘플). 링 슬롯을 참조만 하며, 반납돼도
        // 데이터는 다음 Update 캡처 전까지 유효 — LateUpdate 소비자가 이 프레임에서
        // 경계 픽셀을 읽는다(립 색상·속눈썹 라인·홍채 반경 스냅).
        NativeArray<byte> _presentedBuffer;
        int _presentedW, _presentedH;
        bool _hasPresentedFrame;

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
            PromotePendingResult();
            CaptureAndDetect();
            PresentDelayed();
        }

        /// <summary>워커 스레드 결과를 필터에 통과시켜 결과 히스토리로 승격한다.</summary>
        void PromotePendingResult()
        {
            lock (_resultLock)
            {
                if (!_pending) return;
                _pending = false;
                _statResults++;
                _consecutiveDetectFailures = 0;

                var nowMs = Time.realtimeSinceStartupAsDouble * 1000.0;
                _lastResultArrivalMs = nowMs;

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

                if (_pendingHasFace)
                {
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
                    _filterPrimed = false; // 얼굴을 잃으면 다음 인식 때 필터 리셋
                }

                _lastResultTimestampMs = _pendingTimestampMs;

                // 히스토리 순환 버퍼에 추가 (points 배열 재사용, 무할당)
                _resultHead = (_resultHead + 1) % _results.Length;
                if (_resultCount < _results.Length) _resultCount++;
                _results[_resultHead].timestampMs = _pendingTimestampMs;
                _results[_resultHead].hasFace = _pendingHasFace;
                if (_pendingHasFace)
                    Array.Copy(_pinned, _results[_resultHead].points, LandmarkCount);
            }
        }

        /// <summary>
        /// 매 프레임: 카메라 이미지를 표시 링버퍼에 캡처하고, 추론이 놀고 있으면
        /// 같은 이미지를 저해상도로 변환해 검출에 보낸다.
        /// </summary>
        void CaptureAndDetect()
        {
            if (_cameraManager == null) return;

            // 워치독: 콜백이 안 오는 채로 잠기면 검출만 조용히 죽는다 — 회복.
            if (_inFlight &&
                Time.realtimeSinceStartupAsDouble * 1000.0 - _inFlightSinceMs > DetectTimeoutMs)
            {
                _inFlight = false;
                _consecutiveDetectFailures++;
                Debug.LogWarning("[FaceLandmarkSource] 추론 결과 타임아웃 — 재제출");
                if (_consecutiveDetectFailures >= MaxDetectFailures)
                {
                    RecreateLandmarker();
                    return;
                }
            }

            if (!_cameraManager.TryAcquireLatestCpuImage(out var cpuImage)) return;

            using (cpuImage)
            {
                // Update가 카메라보다 빠를 때 같은 센서 프레임을 두 번 담지 않는다
                if (cpuImage.timestamp == _lastCpuImageTimestamp) return;
                _lastCpuImageTimestamp = cpuImage.timestamp;

                var nowMs = Time.realtimeSinceStartupAsDouble * 1000.0;

                // ---- 표시용 캡처 (링버퍼) ----
                var slot = -1;
                for (var s = 0; s < _ring.Length; s++)
                {
                    if (_ring[s].inUse) continue;
                    slot = s;
                    break;
                }
                if (slot >= 0)
                {
                    var conv = new XRCpuImage.ConversionParams(
                        cpuImage, TextureFormat.RGBA32, XRCpuImage.Transformation.None);
                    var down = Mathf.Max(1, Mathf.RoundToInt(
                        Mathf.Max(cpuImage.width, cpuImage.height) / (float)DisplayLongSide));
                    conv.outputDimensions = new Vector2Int(
                        cpuImage.width / down, cpuImage.height / down);

                    var size = cpuImage.GetConvertedDataSize(conv);
                    if (!_ring[slot].buffer.IsCreated || _ring[slot].buffer.Length < size)
                    {
                        if (_ring[slot].buffer.IsCreated) _ring[slot].buffer.Dispose();
                        _ring[slot].buffer = new NativeArray<byte>(size, Allocator.Persistent);
                    }
                    cpuImage.Convert(conv, _ring[slot].buffer);

                    _ring[slot].width = conv.outputDimensions.x;
                    _ring[slot].height = conv.outputDimensions.y;
                    _ring[slot].timestampMs = nowMs;
                    _ring[slot].inUse = true;
                    _statCaptures++;
                }
                // 슬롯 고갈 시 이 프레임 표시는 건너뛴다 (검출은 계속)

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
                            rotationDegrees: GuessRotationDegrees());
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
            var presentTs = nowMs - _delayMs;

            // 재생 시계가 최신 검출을 추월하지 못하게 클램프 — 추론이 느려지면
            // 표시가 추론 케이던스로 저하되며 픽셀 고정은 유지된다 (구버전 보장).
            // 추론이 죽었을 때만 클램프를 풀어 영상은 계속 흐르게 한다.
            var inferenceDead = nowMs - _lastResultArrivalMs > DeadInferenceMs;
            var newestTs = _resultCount > 0 ? _results[_resultHead].timestampMs : -1.0;
            if (!inferenceDead && newestTs >= 0 && presentTs > newestTs)
                presentTs = newestTs;

            // 재생 시각 이전의 가장 최신 프레임
            var best = -1;
            for (var s = 0; s < _ring.Length; s++)
            {
                if (!_ring[s].inUse || _ring[s].timestampMs > presentTs) continue;
                if (best < 0 || _ring[s].timestampMs > _ring[best].timestampMs) best = s;
            }

            if (best >= 0)
            {
                if (FramePresenter.Instance != null)
                    FramePresenter.Instance.Present(
                        _ring[best].buffer, _ring[best].width, _ring[best].height);
                _lastPresentedTs = _ring[best].timestampMs;
                _presentedBuffer = _ring[best].buffer; // 참조만 — 다음 캡처 전까지 유효
                _presentedW = _ring[best].width;
                _presentedH = _ring[best].height;
                _hasPresentedFrame = true;
                _statPresents++;

                // 표시했거나 재생 시계가 지나친 프레임 반납
                // (Present는 LoadRawTextureData로 즉시 복사하므로 반납해도 안전)
                for (var s = 0; s < _ring.Length; s++)
                {
                    if (_ring[s].inUse && _ring[s].timestampMs <= _lastPresentedTs)
                        _ring[s].inUse = false;
                }
            }

            if (_lastPresentedTs >= 0) InterpolateLandmarks(_lastPresentedTs, inferenceDead);

            LogStats();
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
                // 미래쪽 브래킷 없음. 재생 클램프 덕에 보통 presentedTs == 최신 결과
                // 시각(스냅 = 구버전 시간 동기와 동일). 추론이 죽은 채 영상만 흐르는
                // 중이면 낡은 랜드마크로 그리지 않는다.
                if (inferenceDead) { HasFace = false; return; }
                HasFace = _results[li].hasFace;
                if (HasFace) Array.Copy(_results[li].points, Landmarks, LandmarkCount);
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

        /// <summary>
        /// 센서 원본 프레임에서 얼굴이 똑바로 서도록 MediaPipe에 알려줄 회전값.
        /// TODO(기기 캘리브레이션): 기기·카메라별 실측으로 확정할 것.
        /// 세로 모드 기준 대부분의 안드로이드 후면 90°, 전면 270°, iOS ARKit 90°.
        /// </summary>
        int GuessRotationDegrees()
        {
            if (rotationOverride >= 0) return rotationOverride;
#if UNITY_IOS
            return 90;
#else
            var facing = _cameraManager != null &&
                         _cameraManager.requestedFacingDirection == CameraFacingDirection.User;
            return facing ? 270 : 90;
#endif
        }
#endif
    }
}
