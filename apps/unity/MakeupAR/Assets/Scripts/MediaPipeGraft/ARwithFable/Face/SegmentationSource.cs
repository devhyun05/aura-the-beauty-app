using UnityEngine;
using UnityEngine.XR.ARSubsystems;
#if MEDIAPIPE
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Unity.Collections;
using Mediapipe;
using Mediapipe.Tasks.Vision.ImageSegmenter;
using Mediapipe.Unity;
#endif

namespace ARMakeup.Face
{
    /// <summary>
    /// MediaPipe SelfieMulticlass(256×256, 6클래스) 세그멘테이션 소스 — 오클루전 마스크(설계 §11)와
    /// 머리카락 인식(§14)의 공급자.
    ///
    /// 파이프라인 (FaceLandmarkSource 지연 재생 구조의 동승자):
    ///  - 공급: FaceLandmarkSource.CaptureAndDetect가 캡처한 <b>같은 CPU 프레임·같은 타임스탬프</b>를
    ///    OnCameraFrame으로 밀어준다 — §11 시간 동기 불변식. depth API처럼 "최신 프레임" 기준이면
    ///    지연 재생 중인 표시 프레임과 시점이 어긋나므로, 반드시 같은 캡처에서 출발해야 한다.
    ///  - 추론: SegCadenceFps(12fps)로 프레임을 스킵하며 LIVE_STREAM 제출(GPU delegate→CPU 폴백).
    ///    동시 1건(_inFlight)만 — 결과 콜백(워커 스레드)이 6클래스 확률맵을 RGBA32 한 장으로 패킹.
    ///  - 재생: LateUpdate가 표시 프레임(FaceLandmarkSource.PresentedTimestampMs)에 가장 가까운
    ///    타임스탬프의 마스크를 골라(최근접 스냅) 전역 텍스처로 업로드. 마스크가 부드러운
    ///    확률맵이라 절반 이하 케이던스 + 최근접 스냅으로 충분(§11 설계 판단).
    ///
    /// 채널 패킹(RGBA32) — R=face-skin(3) G=hair(1) B=body-skin(2) A=기타(5):
    ///  - 오클루전 게이트(Occlusion.cginc)는 R만 쓰지만, hair(앞머리 오클루전·헤어라인 마스크·
    ///    향후 헤어염색 §14)와 body-skin(목·귀·손 — 목/귀 톤매칭·이마목 스무딩 확장 §11 P3)을
    ///    소비자가 바로 쓸 수 있도록 한 장에 같이 노출한다(사용자 요구: 인식 채널 노출).
    ///  - 배경(0)·옷(4)은 "face-skin이 아님"으로 충분해 채널을 배정하지 않는다.
    ///
    /// 폴백 불변식: 패키지 미설치(MEDIAPIPE 미정의)·모델 부재·생성 실패·추론 死·스테일 —
    /// 어떤 경우에도 전역 _SegOn=0이 유지되어 모든 오클루전 게이트가 1(완전 무영향)이다.
    /// </summary>
    public class SegmentationSource : MonoBehaviour
    {
        public static SegmentationSource Instance { get; private set; }

        // 전역 유니폼 — 프레임당 1회 기록(머티리얼별 중복 세팅 회피).
        static readonly int SegMaskId = Shader.PropertyToID("_SegMask");
        static readonly int SegOnId = Shader.PropertyToID("_SegOn");
        static readonly int SegDebugId = Shader.PropertyToID("_SegDebug");
        static readonly int OccLoId = Shader.PropertyToID("_OccLo");
        static readonly int OccHiId = Shader.PropertyToID("_OccHi");
        static readonly int ScreenToMaskXId = Shader.PropertyToID("_SegScreenToMaskX");
        static readonly int ScreenToMaskYId = Shader.PropertyToID("_SegScreenToMaskY");
        static readonly int ImgToMaskXId = Shader.PropertyToID("_SegImgToMaskX");
        static readonly int ImgToMaskYId = Shader.PropertyToID("_SegImgToMaskY");

        void Awake()
        {
            Instance = this;
            Shader.SetGlobalFloat(SegOnId, 0f);   // 첫 결과 전까지 명시적 폴백(게이트 1)
            Shader.SetGlobalFloat(SegDebugId, 0f);
        }

        /// <summary>세그 채널 컬러 오버레이 토글(setCalibration.debugSeg) — CameraFeed.shader가 소비.</summary>
        public void SetDebug(bool on)
        {
            Shader.SetGlobalFloat(SegDebugId, on ? 1f : 0f);
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            Shader.SetGlobalFloat(SegOnId, 0f); // 소비자 게이트 즉시 폴백(1)
#if MEDIAPIPE
            // FaceLandmarkSource와 동일 순서 규칙: Close(내부 WaitUntilDone)가 in-flight
            // 이미지의 _inputBuffer 참조를 끝낸 뒤에만 Dispose.
            try { _segmenter?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[SegmentationSource] Close 실패: {e.Message}"); }
            _segmenter = null;
            DisposeOrphanBuffers(); // Close() 이후 — 네이티브 참조 종료 보장 후에만 안전
            if (_inputBuffer.IsCreated) _inputBuffer.Dispose();
            if (_maskTexture != null) Destroy(_maskTexture);
#endif
        }

#if MEDIAPIPE
        // ── 스테이지 ③: 추론 케이던스·해상도 — 명명 상수(기본값) + 런타임 훅 ──
        // 케이던스는 CalibrationParams(브리지)에 넣지 않는다 — 코드 이 한 곳의 상수가 진실이고,
        // 실측 튜닝은 이 값 수정 또는 아래 SetCadence/SetResolution 훅으로. // 실기기 튜닝 대상
        public const float SegCadenceFps = 12f; // §11 "절반 케이던스" — GPU 예산 실측 후 조정
        public const int SegResolution = 256;   // 추론 입력 긴 변(px) — 모델 내부가 256²라 이 이상은 낭비

        // 오클루전 페더 임계(전역 _OccLo/_OccHi — Occlusion.cginc smoothstep).
        // face-skin 확률 ≤ Lo = 완전 제외, ≥ Hi = 완전 표시. 이마 헤어라인에서 face-skin이
        // 낮게 나와 눈썹 위 끝이 페이드되는 부작용(§14)은 Lo를 낮춰 완화한다.
        const float OccFeatherLo = 0.15f; // 실기기 튜닝 대상
        const float OccFeatherHi = 0.45f; // 실기기 튜닝 대상

        // 표시 프레임과 마스크 ts의 최근접 스냅 허용 나이 — 넘으면 스테일: 낡은 마스크로
        // 지우는 것보다 안 지우는 쪽이 안전하므로 게이트를 1로 되돌린다(_SegOn=0).
        const float SegStaleMs = 600f; // 실기기 튜닝 대상

        // 추론 워치독 — FaceLandmarkSource와 동일 근거: LIVE_STREAM은 입력마다 출력을
        // 보장하지 않고, 그래프 에러 시 콜백이 영영 안 온다. 잠기면 세그만 조용히 죽는다.
        const float DetectTimeoutMs = 2000f;
        const int MaxDetectFailures = 3;

        // SelfieMulticlass confidenceMasks 클래스 인덱스 (0=배경 4=옷은 미사용 — 클래스 주석 참조).
        const int ClassHair = 1;
        const int ClassBodySkin = 2;  // 목·귀·손 포함
        const int ClassFaceSkin = 3;
        const int ClassOthers = 5;
        const int ClassCount = 6;

        const string ModelFile = "selfie_multiclass_256x256.tflite";

        // 마스크 히스토리(최근접 ts 스냅용) — 12fps 결과 × 재생 지연 ≤150ms → 4장이면 여유.
        const int HistorySize = 4;

        ImageSegmenter _segmenter;
        bool _ready;
        volatile bool _inFlight;
        double _inFlightSinceMs;
        int _consecutiveFailures;
        double _lastSubmitMs = double.NegativeInfinity;
        float _cadenceFps = SegCadenceFps;
        int _resolution = SegResolution;

        // 제출 세대 가드 — ImageSegmenter.SegmentAsync는 제출별 콜백을 받지 않는다(세그멘터
        // 생성 시 1회 등록된 resultCallback을 모든 제출이 공유, 콜백엔 timestampMs만 돌아옴).
        // 그래서 "이 콜백이 지금 추적 중인 제출의 것인가"는 세대 번호(_submitGen)에 대응하는
        // 제출 timestampMs(_inFlightSubmitTs)로 상관시킨다. 워치독 타임아웃으로 _inFlight를
        // 강제 해제해도 이 두 필드는 그대로 두므로: 그 뒤 새 제출 전에 지연 콜백이 오면
        // timestampMs가 아직 일치해 _inFlight=false를 다시 쓰지만 이미 false라 무해하고,
        // 새 제출 이후에 지연 콜백이 오면 timestampMs 불일치로 가드되어 최신 제출의
        // _inFlight를 잘못 풀지 않는다(OnResult 참조).
        int _submitGen;
        long _inFlightSubmitTs = long.MinValue;
        // 카메라 전환 리셋 시각(ms) — 이전 카메라에서 제출된 인플라이트 결과가 리셋 뒤
        // 도착해 승격되는 것을 차단(FaceLandmarkSource._facingSwitchMs와 동일 패턴·클럭).
        double _resetMs = -1.0;

        // 단일 in-flight 규약 — 정상 콜백 경로는 _inFlight가 재사용을 막는다. 단, 워치독
        // 타임아웃으로 _inFlight가 강제 해제될 때는 네이티브 그래프가 죽은 게 아니라 스톨된
        // 것뿐일 수 있어(제로카피 참조 지속) 이 필드를 그대로 재사용/Dispose하면 위험하다 —
        // 그 경로는 버퍼를 _orphanBuffers로 옮기고 이 필드를 미할당으로 리셋한다(OnCameraFrame
        // 워치독 분기 참조). 즉 "콜백 전 재사용 차단"은 정상 완료 경로에서만 성립한다.
        NativeArray<byte> _inputBuffer;
        int _inputW, _inputH, _inputRotation;

        // 워치독 타임아웃으로 고아가 된 입력 버퍼 — 스톨된 네이티브 그래프가 아직 제로카피로
        // 참조 중일 수 있어 즉시 Dispose하지 않는다. RecreateSegmenter/OnDestroy가 Close()
        // 이후(네이티브 참조 종료 보장 후)에만 일괄 Dispose한다.
        readonly List<(double ts, NativeArray<byte> buf)> _orphanBuffers =
            new List<(double, NativeArray<byte>)>();

        struct MaskFrame
        {
            public byte[] rgba;         // RGBA32 패킹(행0=마스크 상단 — 업로드·샘플 방향 주석 참조)
            public int width, height;   // 마스크 치수(회전 공간이면 입력 w/h 스왑)
            public int inputW, inputH;  // 제출 입력 치수 — 회전 여부 판별용
            public int rotationDegrees; // 제출 시 회전 — 마스크가 회전 공간으로 나오는 특성 보정용
            public double timestampMs;
            public bool valid;
        }

        readonly object _resultLock = new object();
        MaskFrame _pending;  // 워커 스레드가 패킹, 메인 스레드가 히스토리로 스왑 승격
        bool _hasPending;
        float[] _chFace, _chHair, _chBody, _chOther; // 콜백 재사용 채널 버퍼(무할당 정상 상태)

        readonly MaskFrame[] _history = new MaskFrame[HistorySize];
        int _historyHead = -1;
        int _historyCount;

        Texture2D _maskTexture;
        double _uploadedTs = -1.0;

        // 계측(스테이지 ③) — 추론 소요 EMA(캡처 ts→메인 스레드 승격: 순수 추론 + ≤1프레임).
        double _inferEmaMs = -1.0;
        int _statSubmits, _statResults;
        float _statWindowStart;

        IEnumerator Start()
        {
            // 모델 부재 = 완전 무영향 폴백. iOS/에디터는 StreamingAssets가 실제 파일시스템이라
            // 미리 확인한다(없으면 PrepareAssetAsync가 코루틴을 예외로 끊어 로그가 험악함).
            // Android는 apk 내부라 File.Exists 불가 — 준비 실패 → 생성 실패 → 같은 폴백.
#if !UNITY_ANDROID || UNITY_EDITOR
            if (!File.Exists(Path.Combine(Application.streamingAssetsPath, ModelFile)))
            {
                Debug.LogWarning(
                    $"[SegmentationSource] {ModelFile} 없음 — 세그 비활성(오클루전 게이트 항상 1). " +
                    "scripts/setup-mediapipe.sh 실행 후 재익스포트.");
                yield break;
            }
#endif
            // FaceLandmarkSource와 같은 리소스 매니저 경로(StreamingAssets → 네이티브 캐시).
            IResourceManager resources = new StreamingAssetsResourceManager();
            yield return resources.PrepareAssetAsync(ModelFile);

            if (!TryCreateSegmenter(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU) &&
                !TryCreateSegmenter(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU))
            {
                Debug.LogError("[SegmentationSource] ImageSegmenter 생성 실패 — 세그 비활성(게이트 1)");
                yield break;
            }
            _ready = true;
        }

        bool TryCreateSegmenter(Mediapipe.Tasks.Core.BaseOptions.Delegate del)
        {
            try
            {
                var options = new ImageSegmenterOptions(
                    new Mediapipe.Tasks.Core.BaseOptions(del, modelAssetPath: ModelFile),
                    runningMode: Mediapipe.Tasks.Vision.Core.RunningMode.LIVE_STREAM,
                    outputConfidenceMasks: true, // 확률맵 — 페더 가능한 소프트 게이트(§11)
                    outputCategoryMask: false,
                    resultCallback: OnResult);
                _segmenter = ImageSegmenter.CreateFromOptions(options);
                Debug.Log($"[SegmentationSource] ImageSegmenter ready ({del}, LIVE_STREAM)");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[SegmentationSource] {del} delegate 실패: {e.Message}");
                return false;
            }
        }

        /// <summary>추론이 회복 불가로 보이면 세그멘터를 닫고 다시 만든다(랜드마커와 동일 패턴).</summary>
        void RecreateSegmenter()
        {
            _consecutiveFailures = 0;
            _ready = false;
            try { _segmenter?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[SegmentationSource] Close 실패: {e.Message}"); }
            _segmenter = null;
            _inFlight = false;
            DisposeOrphanBuffers(); // Close() 이후 — 네이티브 참조 종료 보장 후에만 안전

            Debug.LogWarning("[SegmentationSource] 세그멘터 재생성 (연속 추론 실패)");
            if (TryCreateSegmenter(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU) ||
                TryCreateSegmenter(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU))
                _ready = true;
            else
                Debug.LogError("[SegmentationSource] 세그멘터 재생성 실패 — 세그 중단(게이트 1)");
        }

        /// <summary>
        /// 고아 입력 버퍼 일괄 Dispose — 반드시 _segmenter.Close() 이후(네이티브 제로카피
        /// 참조 종료가 보장된 뒤)에만 호출할 것(RecreateSegmenter/OnDestroy 전용).
        /// </summary>
        void DisposeOrphanBuffers()
        {
            for (var i = 0; i < _orphanBuffers.Count; i++)
                if (_orphanBuffers[i].buf.IsCreated) _orphanBuffers[i].buf.Dispose();
            _orphanBuffers.Clear();
        }

        /// <summary>
        /// ts 이전에 제출된 고아 버퍼 해제 — 그래프가 ts 결과를 정상 반환했다는 것은
        /// 단조 타임스탬프 순차 처리(mediapipe 그래프 규약)상 그 이전 제출의 네이티브
        /// 참조가 끝났다는 뜻이라 안전하다. '스톨→회복' 반복에서 고아가 무한 누적되던
        /// 문제의 드레인 경로(적대 리뷰 확정). 메인 스레드(PromotePendingResult) 전용.
        /// </summary>
        void DrainOrphansBefore(double ts)
        {
            for (var i = _orphanBuffers.Count - 1; i >= 0; i--)
            {
                if (_orphanBuffers[i].ts >= ts) continue;
                if (_orphanBuffers[i].buf.IsCreated) _orphanBuffers[i].buf.Dispose();
                _orphanBuffers.RemoveAt(i);
            }
        }

        // ── 스테이지 ③ 런타임 변경 훅 — 실측 튜닝용(브리지 미노출, 코드/디버거에서 호출) ──

        /// <summary>추론 케이던스 변경(fps). 기본 SegCadenceFps=12.</summary>
        public void SetCadence(float fps) => _cadenceFps = Mathf.Clamp(fps, 1f, 60f);

        /// <summary>추론 입력 긴 변 변경(px). 기본 SegResolution=256. 다음 제출부터 적용.</summary>
        public void SetResolution(int longSide) => _resolution = Mathf.Clamp(longSide, 96, 512);

        /// <summary>
        /// FaceLandmarkSource.CaptureAndDetect가 매 캡처 프레임 호출 — 랜드마크와 같은
        /// XRCpuImage·같은 nowMs 타임스탬프(§11 시간 동기 불변식). 케이던스 스킵과
        /// 인플라이트/워치독 판단은 전부 여기서 한다(호출측은 무조건 밀어주기만).
        /// </summary>
        public void OnCameraFrame(XRCpuImage cpuImage, double nowMs, int rotationDegrees)
        {
            if (!_ready) return;

            // 워치독: 콜백이 안 오는 채로 잠기면 세그만 조용히 죽는다 — 회복.
            // 주의: 강제로 _inFlight를 풀어도 네이티브 그래프가 죽은 게 아니라 스톨된(느리지만
            // 살아있는) 경우엔 _inputBuffer(제로카피)를 계속 참조 중일 수 있다 — 그대로 두면
            // 다음 제출의 Convert가 사용 중 메모리를 덮어쓰거나(오염), 크기 증가 시 Dispose가
            // 댕글링을 만든다. 그래서 버퍼는 _orphanBuffers로 옮기고 이 필드는 미할당으로
            // 리셋한다(다음 제출이 새 NativeArray를 할당) — 고아 버퍼는 RecreateSegmenter나
            // OnDestroy가 Close() 이후에만 일괄 Dispose한다.
            if (_inFlight && nowMs - _inFlightSinceMs > DetectTimeoutMs)
            {
                _inFlight = false;
                _consecutiveFailures++;
                if (_inputBuffer.IsCreated)
                {
                    _orphanBuffers.Add(((double)_inFlightSubmitTs, _inputBuffer));
                    _inputBuffer = default;
                }
                Debug.LogWarning($"[SegmentationSource] 추론 결과 타임아웃 — 재제출 (gen {_submitGen})");
                if (_consecutiveFailures >= MaxDetectFailures)
                {
                    RecreateSegmenter();
                    return;
                }
            }
            if (_inFlight) return;
            if (nowMs - _lastSubmitMs < 1000.0 / _cadenceFps) return; // 케이던스 스킵(기본 12fps)

            // 긴 변 _resolution(256)으로 다운스케일 — 마스크가 입력 해상도로 돌아오므로
            // 여기서 줄여야 콜백의 채널 리드·패킹·텍스처 업로드도 같이 가벼워진다.
            var down = Mathf.Max(1, Mathf.RoundToInt(
                Mathf.Max(cpuImage.width, cpuImage.height) / (float)_resolution));
            var conv = new XRCpuImage.ConversionParams(
                cpuImage, TextureFormat.RGBA32, XRCpuImage.Transformation.None);
            conv.outputDimensions = new Vector2Int(cpuImage.width / down, cpuImage.height / down);

            var size = cpuImage.GetConvertedDataSize(conv);
            if (!_inputBuffer.IsCreated || _inputBuffer.Length < size)
            {
                if (_inputBuffer.IsCreated) _inputBuffer.Dispose();
                _inputBuffer = new NativeArray<byte>(size, Allocator.Persistent);
            }
            cpuImage.Convert(conv, _inputBuffer);

            var image = new Image(
                ImageFormat.Types.Format.Srgba,
                conv.outputDimensions.x, conv.outputDimensions.y,
                conv.outputDimensions.x * 4, _inputBuffer);

            _inputW = conv.outputDimensions.x;
            _inputH = conv.outputDimensions.y;
            _inputRotation = ((rotationDegrees % 360) + 360) % 360;

            _inFlight = true;
            _inFlightSinceMs = nowMs;
            _lastSubmitMs = nowMs;
            _submitGen++;
            _inFlightSubmitTs = (long)nowMs; // OnResult가 자기 세대인지 판별하는 상관 키
            try
            {
                // 회전: 모델이 직립 인물 학습이라 랜드마커와 같은 회전 신호가 필수(0으로 두면
                // 옆으로 누운 인물에서 정확도 급락). 단 세그 그래프는 마스크를 입력 방향으로
                // 되돌리지 않아(플러그인 샘플 주석 — SelfieSegmenter 계열 특성) 마스크가
                // 회전 공간으로 나온다 → 재생 시 _SegImgToMask 아핀으로 보정(TryComputeImgToMask).
                var processing = new Mediapipe.Tasks.Vision.Core.ImageProcessingOptions(
                    rotationDegrees: _inputRotation);
                _segmenter.SegmentAsync(image, (long)nowMs, processing);
                _statSubmits++;
            }
            catch (Exception e)
            {
                _inFlight = false;
                _consecutiveFailures++;
                Debug.LogWarning($"[SegmentationSource] SegmentAsync 실패: {e.Message}");
                if (_consecutiveFailures >= MaxDetectFailures) RecreateSegmenter();
            }
        }

        // 워커 스레드 — Unity 오브젝트 API 호출 금지(Mathf·Debug.Log는 스레드 안전).
        // 어떤 경우에도 마스크는 Dispose하고 _inFlight는 풀어준다.
        void OnResult(ImageSegmenterResult result, Image image, long timestampMs)
        {
            try
            {
                var masks = result.confidenceMasks;
                if (masks == null || masks.Count < ClassCount) return; // 빈 결과 — 스테일 폴백에 맡김

                var w = masks[ClassFaceSkin].Width();
                var h = masks[ClassFaceSkin].Height();
                var n = w * h;
                if (_chFace == null || _chFace.Length != n)
                {
                    _chFace = new float[n];
                    _chHair = new float[n];
                    _chBody = new float[n];
                    _chOther = new float[n];
                }

                // isVerticallyFlipped=true → 저장 순서 그대로(행0=마스크 상단). 패킹 배열의
                // 행0이 LoadRawTextureData로 텍스처 v=0에 올라가므로, "원점 좌상단·y 아래"
                // 마스크 UV로 tex2D하면 방향이 맞는다 — FramePresenter가 카메라 프레임을
                // 다루는 것과 동일한 규약(행0=상단=v0).
                if (!masks[ClassFaceSkin].TryReadChannel(0, _chFace, false, true) ||
                    !masks[ClassHair].TryReadChannel(0, _chHair, false, true) ||
                    !masks[ClassBodySkin].TryReadChannel(0, _chBody, false, true) ||
                    !masks[ClassOthers].TryReadChannel(0, _chOther, false, true))
                {
                    Debug.LogWarning("[SegmentationSource] 마스크 채널 리드 실패");
                    return;
                }

                lock (_resultLock)
                {
                    if (_pending.rgba == null || _pending.rgba.Length != n * 4)
                        _pending.rgba = new byte[n * 4];
                    var dst = _pending.rgba;
                    for (int i = 0, o = 0; i < n; i++, o += 4)
                    {
                        // 채널 패킹 근거는 클래스 주석 참조 — R=face G=hair B=body A=기타.
                        dst[o] = (byte)(Mathf.Clamp01(_chFace[i]) * 255f);
                        dst[o + 1] = (byte)(Mathf.Clamp01(_chHair[i]) * 255f);
                        dst[o + 2] = (byte)(Mathf.Clamp01(_chBody[i]) * 255f);
                        dst[o + 3] = (byte)(Mathf.Clamp01(_chOther[i]) * 255f);
                    }
                    _pending.width = w;
                    _pending.height = h;
                    _pending.inputW = _inputW;       // 단일 인플라이트 — 제출값이 이 결과의 것
                    _pending.inputH = _inputH;
                    _pending.rotationDegrees = _inputRotation;
                    _pending.timestampMs = timestampMs;
                    _pending.valid = true;
                    _hasPending = true;
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[SegmentationSource] 결과 처리 실패: {e.Message}");
            }
            finally
            {
                var masks = result.confidenceMasks;
                if (masks != null)
                {
                    for (var i = 0; i < masks.Count; i++) masks[i]?.Dispose();
                }
                // 세대 가드(필드 주석 참조): 워치독 타임아웃으로 이미 버려진 제출의 지연
                // 콜백이 그 사이 새로 제출된(최신 세대) _inFlight를 잘못 풀지 않도록,
                // 자신의 timestampMs가 현재 추적 중인 제출과 일치할 때만 해제한다.
                if (timestampMs == _inFlightSubmitTs) _inFlight = false;
            }
        }

        /// <summary>카메라 전환(FaceLandmarkSource.ResetTrackingState) — 이전 카메라 마스크 폐기.</summary>
        public void OnTrackingReset()
        {
            lock (_resultLock)
            {
                _hasPending = false;
                _pending.valid = false;
            }
            _historyHead = -1;
            _historyCount = 0;
            _uploadedTs = -1.0;
            _resetMs = Time.realtimeSinceStartupAsDouble * 1000.0;
            Shader.SetGlobalFloat(SegOnId, 0f);
        }

        void LateUpdate()
        {
            PromotePendingResult();
            PublishMask();
            LogStats();
        }

        /// <summary>워커 스레드 결과를 히스토리로 승격한다(버퍼 스왑 — 정상 상태 무할당).</summary>
        void PromotePendingResult()
        {
            lock (_resultLock)
            {
                if (!_hasPending) return;
                _hasPending = false;
                // 리셋(카메라 전환) 이전 캡처분은 폐기 — 이전 카메라 마스크가 새 카메라
                // 매핑과 합성되는 것을 차단(적대 리뷰 확정).
                if (_pending.timestampMs < _resetMs) return;
                _consecutiveFailures = 0;
                _statResults++;

                // 계측(스테이지 ③): 캡처 ts → 승격. 순수 추론 + ≤1프레임 승격 지연 포함 —
                // GPU 예산 실측(§11 "실측 필수")의 1차 지표로 충분.
                var age = Time.realtimeSinceStartupAsDouble * 1000.0 - _pending.timestampMs;
                if (age > 0 && age < 2000)
                    _inferEmaMs = _inferEmaMs < 0
                        ? age
                        : Mathf.Lerp((float)_inferEmaMs, (float)age, 0.2f);

                _historyHead = (_historyHead + 1) % HistorySize;
                if (_historyCount < HistorySize) _historyCount++;
                var evicted = _history[_historyHead].rgba; // 밀려나는 슬롯의 버퍼를 pending으로 재사용
                var promotedTs = _pending.timestampMs;
                _history[_historyHead] = _pending;
                _pending = new MaskFrame { rgba = evicted };
                DrainOrphansBefore(promotedTs); // 정상 결과 도착 = 이전 제출 참조 종료
            }
        }

        /// <summary>
        /// 렌더 프레임 공급: 표시 프레임 시각에 최근접한 마스크를 골라 전역 텍스처·좌표
        /// 아핀·게이트 플래그를 프레임당 1회 기록한다. 실패 경로는 전부 _SegOn=0.
        /// </summary>
        void PublishMask()
        {
            // 페더 임계는 매 프레임 기록(값싼 float 2개) — 초기화 순서 무관하게 항상 유효.
            Shader.SetGlobalFloat(OccLoId, OccFeatherLo);
            Shader.SetGlobalFloat(OccHiId, OccFeatherHi);

            var presenter = FramePresenter.Instance;
            if (_historyCount == 0 || presenter == null)
            {
                Shader.SetGlobalFloat(SegOnId, 0f);
                return;
            }

            // 최근접 타임스탬프 스냅(§11) — 표시 프레임이 없으면(기동 직후) 최신 마스크.
            var source = FaceLandmarkSource.Instance;
            var targetTs = source != null ? source.PresentedTimestampMs : -1.0;
            var best = -1;
            for (var k = 0; k < _historyCount; k++)
            {
                var idx = (_historyHead - k + HistorySize) % HistorySize;
                if (!_history[idx].valid) continue;
                if (best < 0)
                {
                    best = idx;
                    if (targetTs < 0) break; // 표시 시각 없음 → 최신(첫 유효)로 확정
                    continue;
                }
                if (Math.Abs(_history[idx].timestampMs - targetTs) <
                    Math.Abs(_history[best].timestampMs - targetTs))
                    best = idx;
            }
            if (best < 0)
            {
                Shader.SetGlobalFloat(SegOnId, 0f);
                return;
            }

            // 스테일 가드 — 낡은 마스크로 지우느니 안 지운다(게이트 1).
            var refTs = targetTs >= 0 ? targetTs : Time.realtimeSinceStartupAsDouble * 1000.0;
            if (Math.Abs(refTs - _history[best].timestampMs) > SegStaleMs)
            {
                Shader.SetGlobalFloat(SegOnId, 0f);
                return;
            }

            // 좌표 아핀(프레임당 재계산 — 수십 flop, 캘리브레이션/카메라 전환 자동 추종):
            //  ① 이미지 UV→마스크 UV: 제출 회전 보정(TryComputeImgToMask 주석).
            //     CameraFeed.shader 디버그 오버레이가 소비 — 배경은 i.uv(워프 시 src)가
            //     이미 이미지 UV라 이 아핀만 지나면 된다.
            //  ② 뷰포트 UV→마스크 UV: FramePresenter 역매핑(뷰포트→이미지) ∘ ① 합성.
            //     메이크업 셰이더(Occlusion.cginc)가 grabPos 뷰포트 UV로 소비.
            if (!TryComputeImgToMask(_history[best], out var imX, out var imY) ||
                !presenter.TryGetViewportToImage(out var viU, out var viV))
            {
                Shader.SetGlobalFloat(SegOnId, 0f);
                return;
            }
            Shader.SetGlobalVector(ImgToMaskXId, imX);
            Shader.SetGlobalVector(ImgToMaskYId, imY);

            // 합성: maskU = imX·(imgU, imgV, 1), imgU = viU·(vx, vy, 1), imgV = viV·(vx, vy, 1)
            Shader.SetGlobalVector(ScreenToMaskXId, new Vector4(
                imX.x * viU.x + imX.y * viV.x,
                imX.x * viU.y + imX.y * viV.y,
                imX.x * viU.z + imX.y * viV.z + imX.z, 0f));
            Shader.SetGlobalVector(ScreenToMaskYId, new Vector4(
                imY.x * viU.x + imY.y * viV.x,
                imY.x * viU.y + imY.y * viV.y,
                imY.x * viU.z + imY.y * viV.z + imY.z, 0f));

            UploadIfNeeded(_history[best]);
            Shader.SetGlobalFloat(SegOnId, 1f);
        }

        /// <summary>
        /// 이미지 UV(원점 좌상단·y 아래) → 마스크 UV 아핀 행. 세그 그래프는 rotationDegrees로
        /// 돌린 "직립" 공간에서 마스크를 내고 입력 방향으로 되돌리지 않으므로(플러그인 샘플
        /// 주석), 마스크 = "이미지를 r° 시계방향 회전한 그림"으로 보고 샘플점을 같은 회전으로
        /// 보낸다. (양수 rotationDegrees = 시계방향: NormalizedRect.Rotation = −r(CCW 규약)이고,
        /// iOS 전면 실측 — 표시 270°(FramePresenter FrontRotationSteps=3, 반시계)와 검출 90°가
        /// 짝인 것과 정합.) 마스크 치수가 입력과 같으면(r=0이거나 그래프가 되돌린 경우) 항등 —
        /// 치수로 실제 회전 여부를 판별해 두 동작 모두에 안전하다.
        /// 치수 규약(적대 리뷰 확정, 플러그인 0.16.3 + mediapipe v0.10.22 소스 대조):
        /// ImageSegmenter가 OUTPUT_SIZE를 배선하지 않아 그래프는 마스크를 항상 "입력
        /// 치수 그대로"(비스왑)로 리사이즈해 내고, 내용은 회전 공간 그대로다. 따라서
        /// r=90/270에서 비스왑·동치수가 정상 케이스이고 회전 매핑을 적용해야 한다
        /// (정규화 UV라 아스펙트 스트레치는 흡수). 스왑 치수로 오는 다른 그래프 변형도
        /// 계속 허용. 둘 다 아니면 예상 밖 → 폴백(_SegOn=0).
        /// 주의: 90↔270 매핑 공식과 방향 부호(양수=CW)는 검증 완료 — 맞바꾸지 말 것.
        /// </summary>
        static bool TryComputeImgToMask(in MaskFrame f, out Vector4 rowX, out Vector4 rowY)
        {
            rowX = new Vector4(1f, 0f, 0f, 0f); // maskU = imgU
            rowY = new Vector4(0f, 1f, 0f, 0f); // maskV = imgV
            var r = f.rotationDegrees;
            if (r == 0) return true;

            var swapped = f.width == f.inputH && f.height == f.inputW;
            var sameDims = f.width == f.inputW && f.height == f.inputH;
            switch (r)
            {
                case 90:
                    if (!swapped && !sameDims) return false; // 스왑도 동치수도 아님 = 예상 밖 → 폴백
                    rowX = new Vector4(0f, -1f, 1f, 0f); // maskU = 1 − imgV
                    rowY = new Vector4(1f, 0f, 0f, 0f);  // maskV = imgU
                    return true;
                case 180:
                    if (!sameDims) return false;
                    rowX = new Vector4(-1f, 0f, 1f, 0f); // maskU = 1 − imgU
                    rowY = new Vector4(0f, -1f, 1f, 0f); // maskV = 1 − imgV
                    return true;
                case 270:
                    if (!swapped && !sameDims) return false;
                    rowX = new Vector4(0f, 1f, 0f, 0f);  // maskU = imgV
                    rowY = new Vector4(-1f, 0f, 1f, 0f); // maskV = 1 − imgU
                    return true;
                default:
                    return false; // 90° 단위 아님 — 폴백
            }
        }

        void UploadIfNeeded(in MaskFrame f)
        {
            if (_maskTexture != null && _uploadedTs == f.timestampMs) return;
            if (_maskTexture == null || _maskTexture.width != f.width || _maskTexture.height != f.height)
            {
                if (_maskTexture != null) Destroy(_maskTexture);
                _maskTexture = new Texture2D(f.width, f.height, TextureFormat.RGBA32, false)
                {
                    wrapMode = TextureWrapMode.Clamp,  // 워프 src가 살짝 밖으로 나가도 가장자리 값
                    filterMode = FilterMode.Bilinear,  // 256px 소프트 확률맵 — 페더가 매끈해진다
                };
                Shader.SetGlobalTexture(SegMaskId, _maskTexture);
            }
            _maskTexture.LoadRawTextureData(f.rgba);
            _maskTexture.Apply(false, false);
            _uploadedTs = f.timestampMs;
        }

        // 계측용(§11 케이던스·해상도 실측) — 예산 확정 후 제거 대상.
        void LogStats()
        {
#if !(UNITY_EDITOR || DEVELOPMENT_BUILD)
            // 프로덕션 빌드 무출력(적대 리뷰) — 계측(스테이지 ③)은 개발 빌드 전용.
            return;
#endif
            if (!_ready) return; // Start가 yield break한 상태(모델 부재·생성 실패)면 정보량 0인 로그 금지

            if (_statWindowStart == 0f) _statWindowStart = Time.realtimeSinceStartup;
            var elapsed = Time.realtimeSinceStartup - _statWindowStart;
            if (elapsed < 5f) return;

            // GPU 부하 계측(스테이지 ③) — infer = 추론 소요 ms EMA(승격 지연 ≤1프레임 포함).
            Debug.Log(
                $"[Segmentation] submit {_statSubmits / elapsed:F1}/s " +
                $"results {_statResults / elapsed:F1}/s infer {_inferEmaMs:F0}ms " +
                $"cadence {_cadenceFps:F0}fps res {_resolution}px");
            _statSubmits = _statResults = 0;
            _statWindowStart = Time.realtimeSinceStartup;
        }
#endif
    }
}
