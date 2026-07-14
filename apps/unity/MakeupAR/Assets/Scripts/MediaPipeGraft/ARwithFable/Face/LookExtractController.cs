using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using ARMakeup.Bridge;
using Unity.Collections;
using UnityEngine;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
#if MEDIAPIPE
using Mediapipe;
using Mediapipe.Tasks.Vision.FaceLandmarker;
using Mediapipe.Unity;
#endif
using Color = UnityEngine.Color;

namespace ARMakeup.Face
{
    /// <summary>
    /// 사진→룩 추출(#1) — 갤러리 레퍼런스 사진 1장에서 부위별 색을 온디바이스로 측정해
    /// RN에 "숫자"(LookMeasurement)만 넘긴다. RN이 measurementToLook로 컴포저 초안(룩)으로
    /// 번역한다(측정=Unity, 해석=RN 원칙. 네트워크·AI 없음).
    ///
    /// <see cref="MediaEditController"/>의 정지이미지 1회 검출 파이프라인(LoadPhotoUpright→
    /// EXIF 정립 정규화→ImageFileLoader.TryLoad→CapTexture→IMAGE 모드 Detect→ParseResult)을
    /// 선례로 삼는다. 단 라이브 파이프라인을 절대 건드리지 않는다 — 편집 모드처럼 화면을
    /// 뺏지 않고(FaceLandmarkSource.BeginExternalMode 미사용), 디코드한 프레임을 자체 top-first
    /// 버퍼로 만들어 CPU 바이리니어로 직접 샘플링만 하고 사라진다. 라이브 GPU 랜드마커와의
    /// 동시 점유를 피하려 추출용 랜드마커는 CPU delegate를 우선한다(IMAGE 모드, 검출 직후 반납).
    ///
    /// MEDIAPIPE 전용(임의 이미지 랜드마크 필요). 에디터/Android/비MEDIAPIPE에선 error로
    /// 응답한다(라이브 씬은 그대로 돈다). 색은 공막(흰자) 화이트포인트로 그레이월드
    /// 화이트밸런스해 조명 캐스트를 줄이되, raw whitePoint·lightingConf도 함께 실어 RN이
    /// 신뢰도 하향을 판단한다(얼굴분석-설계 §F).
    /// </summary>
    public class LookExtractController : MonoBehaviour
    {
        public static LookExtractController Instance { get; private set; }

        // 색 측정이라 고해상이 불필요 — 긴 변 상한을 낮춰 GetPixels32·Detect 비용을 줄인다.
        const int MaxLongSide = 1400;

        // ── 룩 추출 색 튜닝 상수(처방 A/B/C — 전부 실기기 튜닝 대상) ─────────────────
        // Gamma 색공간 프로젝트라 감마 항등: 여기 값은 순수 선형 스케일·트림 비율이다.
        //
        // 처방 A — 노출(밝기) 정규화. 어두운 사진의 어두운 색을 그대로 보고 전 부위가
        // 어둡게 뽑히는 것이 주범이라, 세 채널 동일 배율로 리프트(hue 불변, 밝기만 상승).
        // 노출 기준은 우선순위: ① 흰자(공막) 검출 신뢰 시 whiteLuma, ② 아니면 피부 luma.
        // 흰자 검출이 실기기서 자주 실패(lightingConf 0.3 폴백)하므로 피부 폴백이 필수.
        const float ExposureWhiteConfMin = 0.5f;     // 이 이상 lightingConf면 흰자 기준(공막 신뢰). 미만이면 피부 폴백.
        const float ExposureTargetWhiteLuma = 0.85f; // 잘 노출된 공막의 목표 luma(순백 근처, 약간 여유 둠).
        const float ExposureTargetSkinLuma = 0.62f;  // 잘 노출된 중간 피부톤 목표 luma(보수적 — 피부톤 편차 감안 과보정 방지).
        const float ExposureRefLumaFloor = 0.15f;    // 기준 luma 하한(근-암부에서 0 나눗셈·과증폭 폭주 방지).
        const float ExposureMax = 2.0f;              // 노출 스케일 상한(하이라이트 클리핑·노이즈 증폭 방어).
        //
        // 처방 C — 립·아이섀도 샘플을 그림자에서 선명한 쪽으로(어두운 표본이 색을 탁·암하게 만듦).
        const float LipTrimLo = 0.40f;   // 립 명도 트림 하한(기존 0.2 → 0.4: 입 틈·치아경계 그림자 상향 배제).
        const float LipTrimHi = 0.95f;   // 립 명도 트림 상한(기존 0.8 → 0.95: 조명 받은 선명한 버밀리언 포함).
        const float EyeshadowMidT = 0.2f; // 상안검↔눈썹아래 보간 t(기존 0.35 → 0.2: 소켓 그림자에서 리드 쪽으로).
        //
        // 처방 D(눈썹) — 색온 보정 감쇠. 눈썹은 채도가 낮은 어두운 털이라, 따뜻한 조명
        // 셀피에서 그레이월드 WB를 온전히 걸면 파랑이 빨강에 근접·역전해 갈색이 '푸른
        // 회색'으로 뜬다(저채도 색의 색상 반전 — 실기기 확인 증상). 밝기(노출)는 유지하되
        // 색온 보정만 이 비율만큼 반영해 눈썹 본래의 따뜻한 갈색 색상을 보존한다.
        const float BrowWbStrength = 0.35f; // 0=WB 무시(노출만) … 1=전량 WB. // 실기기 튜닝 대상

        bool _busy;
        // 개발용: 그레이월드 화이트밸런스 끄기(setExtractDebug로 토글). true면 Measure가 gain을
        // 단위행렬로 두고 raw 색을 반환한다(색 왜곡이 WB 탓인지 원색과 비교). MEDIAPIPE 유무와
        // 무관하게 유지되도록 #if 밖에 둔다(OnMessage도 공통).
        bool _disableWhiteBalance;

#if UNITY_IOS && !UNITY_EDITOR
        // MediaEditor.mm의 같은 네이티브 심볼을 재선언(여러 C#에서 extern 선언 허용).
        [DllImport("__Internal")]
        static extern int armakeupNormalizeImage(string srcPath, string dstPath);
#endif

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
#if MEDIAPIPE
            CloseLandmarker();
            if (_frame.IsCreated) _frame.Dispose();
#endif
        }

        void OnEnable() => NativeBridge.MessageReceived += OnMessage;
        void OnDisable() => NativeBridge.MessageReceived -= OnMessage;

        void OnMessage(RNToUnityMessage msg)
        {
            switch (msg.type)
            {
                case "extractLook": ExtractLook(msg.path); break;
                case "setExtractDebug": _disableWhiteBalance = msg.disableWhiteBalance; break;
            }
        }

#if !MEDIAPIPE
        // MediaPipe 미설치 폴백 — 임의 이미지 랜드마크가 없어 추출 불가.
        void ExtractLook(string path) => NativeBridge.Send(new UnityToRNMessage
        {
            type = "error",
            message = "룩 추출은 MediaPipe 설치 후 지원됩니다 (scripts/setup-mediapipe.sh).",
        });
#else
        FaceLandmarker _landmarker;
        NativeArray<byte> _frame; // 레퍼런스 프레임(top-first RGBA) — Image·CPU 샘플러 공용
        int _frameW, _frameH;
        readonly Vector3[] _landmarks = new Vector3[FaceLandmarkSource.LandmarkCount];
        bool _assetReady;

        // ── 부위별 샘플 랜드마크(렌더러 상수 인용) ─────────────────────────────
        // 입술 외곽/내곽 (index 정렬 20쌍) — LipRenderer.LipsOuter/LipsInner.
        static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 };
        static readonly int[] LipsInner =
            { 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95 };
        // 광대 사과 좌/우 — BlushStyleRenderer.CheekCenters.
        static readonly int[] CheekCenters = { 50, 280 };
        // 상안검 체인(속눈썹 라인) 좌/우 — IrisRenderer.UpperLids.
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };
        // 눈썹 아치(위/아래) 좌/우 — BrowRenderer.BrowUpper/BrowLower.
        static readonly int[][] BrowUpper =
        {
            new[] { 70, 63, 105, 66, 107 },
            new[] { 300, 293, 334, 296, 336 },
        };
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };
        // 홍채 중심·링 좌/우 — IrisRenderer.IrisCenters/IrisRings.
        static readonly int[] IrisCenters = { 468, 473 };
        static readonly int[][] IrisRings =
        {
            new[] { 469, 470, 471, 472 },
            new[] { 474, 475, 476, 477 },
        };
        // 눈 안/바깥 꼬리 — IrisRenderer.EyeContours의 C_OUTER(0)/C_INNER(8).
        static readonly int[] EyeOuter = { 33, 263 };
        static readonly int[] EyeInner = { 133, 362 };
        // 맨피부 기준 — BrowRenderer.ForeheadSkin(이마) + 턱 점.
        static readonly int[] ForeheadSkin = { 9, 108, 337, 109, 338, 151 };
        static readonly int[] ChinSkin = { 152, 175, 199, 148, 377 };

        // 모델 파일 준비(FaceLandmarkSource.Start와 동일 자원). 라이브가 이미 준비했겠지만
        // 추출 요청이 그보다 이를 수 있어 자체 보장(MediaEditController.PrepareAsset 선례).
        IEnumerator PrepareAsset()
        {
            if (_assetReady) yield break;
            Mediapipe.Unity.IResourceManager resources = new StreamingAssetsResourceManager();
            yield return resources.PrepareAssetAsync("face_landmarker.task");
            _assetReady = true;
        }

        // IMAGE 모드 랜드마커 보장 — CPU delegate 우선(라이브 LIVE_STREAM이 GPU 점유 중이라
        // 동시 GPU 생성 리스크 회피). 실패 시 GPU 폴백.
        bool EnsureLandmarker()
        {
            if (_landmarker != null) return true;
            if (TryCreate(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU) ||
                TryCreate(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU))
                return true;
            Debug.LogError("[LookExtractController] FaceLandmarker 생성 실패");
            return false;
        }

        bool TryCreate(Mediapipe.Tasks.Core.BaseOptions.Delegate del)
        {
            try
            {
                var options = new FaceLandmarkerOptions(
                    new Mediapipe.Tasks.Core.BaseOptions(del, modelAssetPath: "face_landmarker.task"),
                    runningMode: Mediapipe.Tasks.Vision.Core.RunningMode.IMAGE,
                    numFaces: 1);
                _landmarker = FaceLandmarker.CreateFromOptions(options);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[LookExtractController] {del} 생성 실패: {e.Message}");
                return false;
            }
        }

        void CloseLandmarker()
        {
            try { _landmarker?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[LookExtractController] Close 실패: {e.Message}"); }
            _landmarker = null;
        }

        // MediaPipe 결과 → _landmarks. hasFace 반환(MediaEditController.ParseResult 이식).
        static bool ParseResult(FaceLandmarkerResult result, Vector3[] outLandmarks)
        {
            var faces = result.faceLandmarks;
            if (faces == null || faces.Count == 0) return false;
            var landmarks = faces[0].landmarks;
            var count = Mathf.Min(landmarks.Count, FaceLandmarkSource.LandmarkCount);
            for (var i = 0; i < count; i++)
            {
                var lm = landmarks[i];
                outLandmarks[i] = new Vector3(lm.x, lm.y, lm.z);
            }
            return true;
        }

        void ExtractLook(string path)
        {
            if (_busy) return;
            StartCoroutine(ExtractRoutine(path));
        }

        IEnumerator ExtractRoutine(string path)
        {
            _busy = true;
            var w = 0; var h = 0;
            NativeArray<byte> top = default;
            try
            {
                if (!LoadPhotoUpright(path, out top, out w, out h))
                {
                    NativeBridge.Send(new UnityToRNMessage
                    { type = "error", message = "레퍼런스 사진을 불러오지 못했습니다." });
                    yield break;
                }
            }
            finally
            {
                if (w == 0)
                {
                    if (top.IsCreated) top.Dispose();
                    _busy = false;
                }
            }
            if (w == 0) yield break;

            // 이전 프레임 버퍼를 이 프레임으로 교체(추출은 순차 — _busy로 직렬화됨).
            if (_frame.IsCreated) _frame.Dispose();
            _frame = top;
            _frameW = w;
            _frameH = h;

            yield return PrepareAsset();

            // 검출 — 라이브 LIVE_STREAM 랜드마커가 GPU를 점유 중이라, 자체 랜드마커를 만들기 전에
            // BeginExternalMode로 라이브를 닫아 GPU를 양보한다(MediaEditController.EnterStillRoutine
            // 선례). Detect/Image 생성 예외를 잡아 error로 응답하고, 성공·실패·예외 모든 경로에서
            // CloseLandmarker + (우리가 연 경우) EndExternalMode를 보장한다.
            //   ▸ 코루틴 try-catch 제약: 이 블록엔 yield가 없다 — 결과 Send·yield break는 블록을
            //     빠져나온 뒤에 한다. 측정은 _frame이 살아 있는 블록 안에서 끝내 로컬(measurement)에
            //     담아, finally의 _frame.Dispose 이후 참조 문제를 피한다.
            //   ▸ 재진입 방어: 이미 외부모드면(사진/영상 편집 진행 중) 우리가 연 게 아니므로 닫지도
            //     않는다 — MediaEditController의 편집 세션을 무너뜨리지 않게(EndExternalMode는 라이브
            //     재개+랜드마커 재생성이라 편집 중 호출은 파괴적).
            var hasFace = false;
            string extractError = null;
            LookMeasurement measurement = null;
            var source = FaceLandmarkSource.Instance;
            var enteredExternal = false;
            try
            {
                if (source != null && !source.ExternalMode)
                {
                    source.BeginExternalMode();
                    enteredExternal = true;
                }
                if (EnsureLandmarker())
                {
                    using var image = new Image(ImageFormat.Types.Format.Srgba, w, h, w * 4, _frame);
                    var result = _landmarker.Detect(image, null); // 정립 이미지 → 회전 0
                    hasFace = ParseResult(result, _landmarks);
                }
                if (hasFace) measurement = Measure(); // _frame이 살아 있는 동안 측정
            }
            catch (Exception e)
            {
                extractError = "룩 추출 실패: " + e.Message;
            }
            finally
            {
                CloseLandmarker();                             // 검출용 랜드마커 반납(GPU/CPU)
                if (enteredExternal) source.EndExternalMode(); // 라이브 파이프라인 재개
                if (_frame.IsCreated) _frame.Dispose();
                _frameW = _frameH = 0;
                _busy = false;
            }

            if (extractError != null)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = extractError });
                yield break;
            }
            if (!hasFace)
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "lookExtracted", lookMeasurement = new LookMeasurement { hasFace = false } });
                yield break;
            }
            NativeBridge.Send(new UnityToRNMessage
            { type = "lookExtracted", lookMeasurement = measurement });
        }

        // 네이티브 EXIF 정립 정규화 → 로드 → top-first RGBA(MediaEditController.LoadPhotoUpright).
        bool LoadPhotoUpright(string path, out NativeArray<byte> top, out int w, out int h)
        {
            top = default; w = 0; h = 0;
            var src = ResolvePath(path);
            var upright = Path.Combine(Application.temporaryCachePath,
                $"look_src_{Guid.NewGuid():N}.jpg");
            var loadPath = src;
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                if (armakeupNormalizeImage(src, upright) != 0 && File.Exists(upright))
                    loadPath = upright;
            }
            catch (Exception e) { Debug.LogWarning($"[LookExtractController] 정규화 실패: {e.Message}"); }
#endif
            if (!ImageFileLoader.TryLoad(loadPath, out var tex, out var error))
            {
                Debug.LogWarning($"[LookExtractController] 사진 로드 실패: {error}");
                TryDelete(upright);
                return false;
            }
            tex = CapTexture(tex, MaxLongSide);
            top = ToTopFirstRGBA(tex, out w, out h);
            UnityEngine.Object.Destroy(tex);
            TryDelete(upright);
            return true;
        }

        // ── 측정 ────────────────────────────────────────────────────────────────

        // 부위별 색 샘플링 → 화이트밸런스 → LookMeasurement. 각 색은 공막 화이트포인트로
        // 그레이월드 보정(캐스트 제거)하되 raw whitePoint·lightingConf도 함께 반환한다.
        LookMeasurement Measure()
        {
            var m = new LookMeasurement { hasFace = true };

            // 공막 화이트포인트 — 후보 중 최고 명도(가장 흰 흰자). 눈 감김·저조도면 명도↓.
            var whiteFound = WhitePoint(out var white, out var whiteLuma, out var whiteSat);
            // 화이트포인트 명도·무채색도가 조명 신뢰도. 흰자가 흐리거나(감김) 색이 강하면(오염) 하향.
            var lightingConf = whiteFound
                ? Mathf.Clamp01((whiteLuma - 0.25f) / 0.5f) * Mathf.Clamp01(1f - whiteSat * 2f)
                : 0.3f;
            m.lightingConf = lightingConf;
            m.whitePoint = Hex(white.r, white.g, white.b);

            // 그레이월드 게인 — 화이트포인트를 무채색으로 끌되, 신뢰도만큼만 보정(과보정 방어).
            ComputeGain(white, whiteFound, lightingConf, out var gain);
            // 개발용 WB 끄기 — 단위행렬로 두면 HexGain이 raw 색을 그대로 반환(whitePoint hex는
            // 항상 raw라 무영향). 색 왜곡이 그레이월드 보정 탓인지 원색과 비교하는 통로.
            if (_disableWhiteBalance) gain = Vector3.one;

            // 맨피부 기준(이마+턱) — 강도 추정의 대조군 + 노출 폴백 기준(피부는 항상 검출·면적 큼).
            var skinPts = new List<Vector2>();
            AddPts(skinPts, ForeheadSkin);
            AddPts(skinPts, ChinSkin);
            var skinOk = TrimmedSample(skinPts, 0f, 1f, out var skin, out _);

            // 처방 A — 노출(밝기) 정규화. 세 채널 동일 배율 → hue 불변, 밝기만 상승.
            // 노출은 WB(gain 색온)와 독립 축이라 WB 끄기(gain=Vector3.one) 분기 이후에 곱한다
            // (WB off여도 노출 정규화는 적용됨). gain은 처방 B로 luma=1 정규화돼 있어, 곱 후
            // gain의 luma가 곧 노출 배율이 된다(밝기는 전적으로 노출 축이 담당).
            var exposure = ComputeExposure(whiteFound, lightingConf, whiteLuma, skinOk, skin);
            gain *= exposure;

            m.skinBase = HexGain(skin, gain);

            // 립 본체 — 외곽/내곽 중점(버밀리언 엣지·입 구멍 회피). 처방 C: 밝은(선명한) 상위
            // 밴드만 취해 입 틈·치아경계 그림자를 배제(어두운 표본이 립을 탁·암하게 만드는 것 방지).
            var lipPts = new List<Vector2>();
            for (var i = 0; i < LipsOuter.Length; i++) lipPts.Add(Mid(LipsOuter[i], LipsInner[i], 0.5f));
            var lipOk = TrimmedSample(lipPts, LipTrimLo, LipTrimHi, out var lip, out var lipConf);
            m.lip = lipOk ? HexGain(lip, gain) : "";
            m.lipConf = lipOk ? lipConf * lightingConf : 0f;

            // 립 안쪽(입 라인) 진한 색 — 내곽 쪽으로 치우친 점(t=0.8)의 하위 명도 평균.
            // 없으면 빈 값(RN이 lip에서 20% 어둡게 파생).
            var linePts = new List<Vector2>();
            for (var i = 0; i < LipsOuter.Length; i++) linePts.Add(Mid(LipsOuter[i], LipsInner[i], 0.8f));
            var lineOk = TrimmedSample(linePts, 0f, 0.4f, out var lipLine, out _) && lipOk;
            m.lipLine = lineOk ? HexGain(lipLine, gain) : "";

            // 볼/블러셔 — 광대 사과 중심 + 반경 근방 평균(좌/우 합).
            var blushPts = new List<Vector2>();
            foreach (var c in CheekCenters) AddDisc(blushPts, c, 0.012f);
            var blushOk = TrimmedSample(blushPts, 0.1f, 0.9f, out var blush, out var blushConf);
            m.blush = blushOk ? HexGain(blush, gain) : "";
            m.blushConf = blushOk ? blushConf * lightingConf : 0f;

            // 눈두덩/아이섀도 — 상안검 lash 라인과 눈썹 아래 사이 lid 피부 밴드(리드~크리스).
            var esPts = new List<Vector2>();
            for (var e = 0; e < 2; e++)
            {
                var up = UpperLids[e];
                var lo = BrowLower[e];
                // 상안검 중앙부(눈동자 위) 몇 점 ↔ 눈썹 아래 대응점 사이. 처방 C: 소켓 그림자에서
                // 리드(속눈썹 라인) 쪽으로 t를 당겨(0.35→0.2) 눈두덩 그림자에 색이 어두워지는 것 방지.
                esPts.Add(Mid(up[3], lo[1], EyeshadowMidT));
                esPts.Add(Mid(up[4], lo[2], EyeshadowMidT));
                esPts.Add(Mid(up[5], lo[3], EyeshadowMidT));
            }
            var esOk = TrimmedSample(esPts, 0.1f, 0.9f, out var es, out var esConf);
            m.eyeshadow = esOk ? HexGain(es, gain) : "";
            m.eyeshadowConf = esOk ? esConf * lightingConf : 0f;

            // 눈썹 — 위/아래 아치 중점(눈썹 심=털). 하위 명도(가장 어두운=털) 우선 평균(피부 틈 배제).
            var browPts = new List<Vector2>();
            for (var e = 0; e < 2; e++)
            {
                var bu = BrowUpper[e];
                var bl = BrowLower[e];
                var n = Mathf.Min(bu.Length, bl.Length);
                for (var i = 0; i < n; i++) browPts.Add(Mid(bu[i], bl[i], 0.5f));
            }
            // 처방 D — 눈썹은 색온 보정을 BrowWbStrength만큼만 반영(밝기=노출은 유지).
            // gain = wbGain × exposure(스칼라)라, exposure 항과 gain 사이를 lerp하면 색온
            // 성분만 감쇠되고 노출(밝기)은 두 항 공통이라 보존된다.
            var browGain = Vector3.Lerp(
                new Vector3(exposure, exposure, exposure), gain, BrowWbStrength);
            var browOk = TrimmedSample(browPts, 0f, 0.6f, out var brow, out var browConf);
            m.brow = browOk ? HexGain(brow, browGain) : "";
            m.browConf = browOk ? browConf * lightingConf : 0f;

            // 홍채 — 중심→링 0.5 지점 median(동공 최암·스펙큘러 회피).
            var irisPts = new List<Vector2>();
            for (var e = 0; e < 2; e++)
            {
                var ctr = IrisCenters[e];
                foreach (var r in IrisRings[e]) irisPts.Add(Mid(ctr, r, 0.5f));
            }
            var irisOk = TrimmedSample(irisPts, 0.35f, 0.65f, out var iris, out var irisConf);
            m.iris = irisOk ? HexGain(iris, gain) : "";
            m.irisConf = irisOk ? irisConf * lightingConf : 0f;

            return m;
        }

        // 공막 화이트포인트 — 우/좌안 iris중심→눈꼬리 방향 중점 후보 중 최고 명도.
        bool WhitePoint(out Color white, out float luma, out float sat)
        {
            white = Color.white; luma = 0f; sat = 0f;
            var found = false;
            for (var e = 0; e < 2; e++)
            {
                TryCandidate(Mid(IrisCenters[e], EyeOuter[e], 0.55f), ref white, ref luma, ref sat, ref found);
                TryCandidate(Mid(IrisCenters[e], EyeInner[e], 0.55f), ref white, ref luma, ref sat, ref found);
            }
            return found;
        }

        void TryCandidate(Vector2 p, ref Color best, ref float bestLuma, ref float bestSat, ref bool found)
        {
            if (!Sample(p.x, p.y, out var r, out var g, out var b)) return;
            var c = new Color(r, g, b, 1f);
            var l = Luma(c);
            if (!found || l > bestLuma)
            {
                found = true; best = c; bestLuma = l; bestSat = Sat(c);
            }
        }

        // 그레이월드 게인 — gray/채널. 신뢰도만큼만 identity에서 보간(저신뢰=거의 무보정),
        // 극단 게인은 [0.5,2.0]로 클램프(어두운 오탐 흰자 방어). 처방 B: 최종 게인을 luma로
        // 정규화해 색온만 돌리고 전체 밝기·채도를 안 깎게 한다(붉은 립·블러셔 탁화 완화).
        static void ComputeGain(Color white, bool found, float conf, out Vector3 gain)
        {
            gain = Vector3.one;
            if (!found) return;
            var gray = (white.r + white.g + white.b) / 3f;
            if (gray <= 1e-4f) return;
            var gr = Mathf.Clamp(white.r > 1e-4f ? gray / white.r : 1f, 0.5f, 2f);
            var gg = Mathf.Clamp(white.g > 1e-4f ? gray / white.g : 1f, 0.5f, 2f);
            var gb = Mathf.Clamp(white.b > 1e-4f ? gray / white.b : 1f, 0.5f, 2f);
            gain = new Vector3(
                Mathf.Lerp(1f, gr, conf),
                Mathf.Lerp(1f, gg, conf),
                Mathf.Lerp(1f, gb, conf));
            // 처방 B — luma 보존: WB가 색온만 돌리고 밝기는 처방 A(노출)가 전담하게 정규화.
            var gl = 0.299f * gain.x + 0.587f * gain.y + 0.114f * gain.z;
            if (gl > 1e-4f) gain /= gl;
        }

        // 처방 A — 노출 배율. 흰자 검출 신뢰(lightingConf ≥ ExposureWhiteConfMin) 시 whiteLuma를,
        // 아니면 피부 luma를 기준으로 targetLuma/refLuma를 [1, ExposureMax]로 클램프해 반환한다.
        // 기준이 없으면 1(무보정). 세 채널 동일 곱으로 쓰이므로 hue 불변.
        static float ComputeExposure(bool whiteFound, float lightingConf, float whiteLuma,
                                     bool skinOk, Color skin)
        {
            float refLuma, target;
            if (whiteFound && lightingConf >= ExposureWhiteConfMin)
            {
                refLuma = whiteLuma;
                target = ExposureTargetWhiteLuma;
            }
            else if (skinOk)
            {
                refLuma = Luma(skin);
                target = ExposureTargetSkinLuma;
            }
            else
            {
                return 1f; // 노출 기준 없음 → 무보정
            }
            var e = target / Mathf.Max(refLuma, ExposureRefLumaFloor);
            return Mathf.Clamp(e, 1f, ExposureMax);
        }

        // ── CPU 샘플러(top-first 버퍼 바이리니어, FaceLandmarkSource.TrySampleColor/Px 이식) ──

        Vector2 N(int i) => new Vector2(_landmarks[i].x, _landmarks[i].y);
        Vector2 Mid(int a, int b, float t) => Vector2.Lerp(N(a), N(b), t);

        void AddPts(List<Vector2> dst, int[] idx)
        {
            foreach (var i in idx) dst.Add(N(i));
        }

        // 중심점 + 상하좌우 4점(정규화 반경 rad)으로 국소 평균 안정화.
        void AddDisc(List<Vector2> dst, int center, float rad)
        {
            var c = N(center);
            dst.Add(c);
            dst.Add(c + new Vector2(rad, 0));
            dst.Add(c + new Vector2(-rad, 0));
            dst.Add(c + new Vector2(0, rad));
            dst.Add(c + new Vector2(0, -rad));
        }

        // 정규화 이미지 좌표(원점 좌상단, 랜드마크 x/y와 동일계) 4-tap 바이리니어.
        bool Sample(float nx, float ny, out float r, out float g, out float b)
        {
            r = g = b = 0f;
            if (!_frame.IsCreated || _frameW <= 0 || _frameH <= 0) return false;
            int w = _frameW, h = _frameH;
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

        void Px(int x, int y, out float r, out float g, out float b)
        {
            var idx = (y * _frameW + x) * 4; // top-first RGBA(행0 = 이미지 상단) — y 뒤집기 불필요
            r = _frame[idx] / 255f;
            g = _frame[idx + 1] / 255f;
            b = _frame[idx + 2] / 255f;
        }

        static float Luma(Color c) => 0.299f * c.r + 0.587f * c.g + 0.114f * c.b;

        static float Sat(Color c)
        {
            var max = Mathf.Max(c.r, Mathf.Max(c.g, c.b));
            var min = Mathf.Min(c.r, Mathf.Min(c.g, c.b));
            return max <= 1e-4f ? 0f : (max - min) / max;
        }

        // 점들을 샘플 → 명도로 정렬 → [loFrac, hiFrac] 슬라이스만 평균(오염 배제).
        // conf = 1 - 슬라이스 색분산(RMS)로 산출 → 표본이 흩어질수록 신뢰도↓.
        bool TrimmedSample(List<Vector2> pts, float loFrac, float hiFrac, out Color avg, out float conf)
        {
            avg = Color.clear; conf = 0f;
            var samples = new List<Color>(pts.Count);
            foreach (var p in pts)
                if (Sample(p.x, p.y, out var r, out var g, out var b))
                    samples.Add(new Color(r, g, b, 1f));
            if (samples.Count == 0) return false;

            samples.Sort((a, b) => Luma(a).CompareTo(Luma(b)));
            var lo = Mathf.Clamp(Mathf.FloorToInt(samples.Count * loFrac), 0, samples.Count - 1);
            var hi = Mathf.Clamp(Mathf.CeilToInt(samples.Count * hiFrac), lo + 1, samples.Count);

            float sr = 0, sg = 0, sb = 0;
            var n = hi - lo;
            for (var i = lo; i < hi; i++) { sr += samples[i].r; sg += samples[i].g; sb += samples[i].b; }
            avg = new Color(sr / n, sg / n, sb / n, 1f);

            float vr = 0, vg = 0, vb = 0;
            for (var i = lo; i < hi; i++)
            {
                vr += (samples[i].r - avg.r) * (samples[i].r - avg.r);
                vg += (samples[i].g - avg.g) * (samples[i].g - avg.g);
                vb += (samples[i].b - avg.b) * (samples[i].b - avg.b);
            }
            var rms = Mathf.Sqrt((vr + vg + vb) / (3f * n));
            conf = Mathf.Clamp01(1f - rms * 3f); // 분산이 작을수록(균일) 신뢰↑
            return true;
        }

        static string Hex(float r, float g, float b)
        {
            var R = Mathf.Clamp(Mathf.RoundToInt(r * 255f), 0, 255);
            var G = Mathf.Clamp(Mathf.RoundToInt(g * 255f), 0, 255);
            var B = Mathf.Clamp(Mathf.RoundToInt(b * 255f), 0, 255);
            return $"#{R:X2}{G:X2}{B:X2}";
        }

        static string HexGain(Color c, Vector3 gain) =>
            Hex(c.r * gain.x, c.g * gain.y, c.b * gain.z);

        // ── 헬퍼(MediaEditController 이식) ──────────────────────────────────────

        // Unity Texture2D(GetPixels32 = bottom-first) → top-first RGBA NativeArray.
        static NativeArray<byte> ToTopFirstRGBA(Texture2D tex, out int w, out int h)
        {
            w = tex.width; h = tex.height;
            var px = tex.GetPixels32();
            var buf = new NativeArray<byte>(w * h * 4, Allocator.Persistent);
            for (var y = 0; y < h; y++)
            {
                var srcRow = (h - 1 - y) * w; // 세로 뒤집기(bottom→top)
                var dstRow = y * w;
                for (var x = 0; x < w; x++)
                {
                    var c = px[srcRow + x];
                    var di = (dstRow + x) * 4;
                    buf[di] = c.r;
                    buf[di + 1] = c.g;
                    buf[di + 2] = c.b;
                    buf[di + 3] = c.a;
                }
            }
            return buf;
        }

        // 긴 변이 maxLong을 넘으면 바이리니어 다운스케일(원본 파기). 이하이면 원본 그대로.
        static Texture2D CapTexture(Texture2D src, int maxLong)
        {
            int w = src.width, h = src.height;
            var longSide = Mathf.Max(w, h);
            if (longSide <= maxLong) return src;
            var scale = (float)maxLong / longSide;
            var nw = Mathf.Max(2, Mathf.RoundToInt(w * scale));
            var nh = Mathf.Max(2, Mathf.RoundToInt(h * scale));
            var rt = RenderTexture.GetTemporary(nw, nh, 0, RenderTextureFormat.ARGB32);
            var prev = RenderTexture.active;
            Graphics.Blit(src, rt);
            RenderTexture.active = rt;
            var dst = new Texture2D(nw, nh, TextureFormat.RGBA32, false);
            dst.ReadPixels(new UnityEngine.Rect(0, 0, nw, nh), 0, 0);
            dst.Apply(false, false);
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);
            UnityEngine.Object.Destroy(src);
            return dst;
        }
#endif

        static string ResolvePath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            return path.StartsWith("file://") ? path.Substring(7) : path;
        }

        static void TryDelete(string path)
        {
            try { if (!string.IsNullOrEmpty(path) && File.Exists(path)) File.Delete(path); }
            catch { /* best-effort */ }
        }
    }
}
