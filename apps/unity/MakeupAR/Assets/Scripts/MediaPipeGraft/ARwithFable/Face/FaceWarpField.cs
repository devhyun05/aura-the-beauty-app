using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 얼굴형 보정 워프의 공유 필드 (설계 섹션 10) — 스크린공간 변위를 한 곳에서 정의해
    /// 배경(역방향)과 메이크업(순방향)이 같은 워프를 공유하게 한다.
    ///
    /// 배경 쿼드 셰이더(CameraFeed)는 각 출력 픽셀이 "원본 어디를 읽을지" 역방향으로
    /// 재샘플하고(순방향의 고정점 반복 역), 메이크업 렌더러는 랜드마크 정점을 순방향으로
    /// 옮긴다(FramePresenter.ImageToViewport 한 곳에 Forward를 심어 전 레이어 무료 상속).
    /// C#(Forward)과 셰이더(warpDisp)가 같은 데이터·공식을 공유해 정확히 정합하며,
    /// 반경 밖 변위 0(smoothstep 경계)이라 배경 코너·먼 부위는 자동 무영향.
    ///
    /// 두 가지 필드로 구성:
    /// ① 범용 오퍼레이터(방사+푸시 통합 공식, 8a029e5 프리미티브 부활):
    ///      disp = ((p−c)·gain + v) · (1−smooth01(t))
    ///      RADIAL: gain=scale−1, v=0 / PUSH: gain=0, v=푸시벡터.
    ///      로브는 원형(B.zw=0) 또는 타원(B.zw=장축, 단축=r×PushAcrossRatio) —
    ///      타원 리본은 콧대·이마·눈썹처럼 "선을 따라 미는" 부위에서 이웃 로브를
    ///      이어붙인다(원형 점 필드는 점 사이가 덜 밀려 울퉁불퉁 — 실기기 교훈).
    /// ② 턱 윤곽 체인(너비·길이·사각턱 통합): 실루엣 폴리라인 15점에 슬라이더별 푸시를
    ///    영역 가중으로 합산해 두고, 픽셀마다 "폴리라인 최근접점까지의 거리 + 그 지점의
    ///    보간 푸시"로 리본형 변위를 만든다 — 점·로브 근사와 달리 윤곽 전체가 이어진
    ///    하나의 매끈한 캡슐 필드(정석 리퀴파이. 점 필드의 울퉁불퉁이 원리적으로 없음).
    ///
    /// 슬라이더: 눈확대(0..1) + 턱 5종 + 입·콧볼 + 콧대·이마·눈썹 3종(−1..+1, 0=원래).
    /// 단일 "턱슬림"은 모든 점을 코끝으로 밀어 기괴한 V가 됐다(실기기) — 부위·방향 분해.
    /// 요(yaw) 가중: 고개를 돌리면 스크린공간 워프가 원근 단축으로 왜곡되므로 강도를
    /// 감쇠(정면=1 → 프로필 YawFloor)해 오퍼레이터·체인 푸시에 균일 베이킹한다.
    /// </summary>
    // 실행 순서 -50: 얼굴형 워프 필드(FramePresenter.ImageToViewport가 Forward를 소비) —
    // 좌표 소비자보다 먼저. 필드 계산은 EnsureFrame이 프레임당 지연·멱등이라 실질 순서
    // 무관하나, Instance 셋업(Awake)을 렌더러보다 앞당기고 의도된 단계를 명시한다.
    [DefaultExecutionOrder(-50)]
    public class FaceWarpField : MonoBehaviour
    {
        public static FaceWarpField Instance { get; private set; }

        // ── 랜드마크 인덱스 (MediaPipe 478 모델) ──
        const int IrisR = 468, IrisL = 473;                 // 홍채 중심
        const int EyeROuter = 33, EyeRInner = 133;          // 눈폭 산출
        const int EyeLOuter = 263, EyeLInner = 362;
        const int NoseTip = 1, Chin = 152;                  // 얼굴 세로축
        const int CheekR = 234, CheekL = 454;               // 얼굴 폭(광대 실루엣)
        const int MouthTop = 13, MouthBottom = 14;          // 입 중심(내측 립 상/하)
        const int MouthCornerR = 61, MouthCornerL = 291;    // 입폭 산출
        const int NoseWingR = 129, NoseWingL = 358;         // 콧볼(알라 바깥)
        // 콧대 미드라인(나지온→미드→하부) — 측벽 인덱스 대신 미드라인±수평 오프셋으로
        // 로브를 놓는다(측벽 랜드마크 선정 오차에 강건).
        static readonly int[] NoseBridgePts = { 168, 197, 5 };
        // 헤어라인 상단(우→중→좌, 얼굴 오벌 상단) — 이마 높이 푸시 지점.
        static readonly int[] HairTopPts = { 109, 10, 338 };
        static readonly float[] HairTopW = { 0.75f, 1f, 0.75f };
        // 눈썹 체인(바깥→안쪽): 우/좌 — 리프트·기울기·간격 로브의 기준점.
        static readonly int[] BrowR = { 70, 63, 105, 66, 107 };
        static readonly int[] BrowL = { 300, 293, 334, 296, 336 };

        // 얼굴 실루엣 체인 — 광대→턱각→턱끝→턱각→광대, 15점 (좌→우).
        static readonly int[] JawChain =
        {
            323, 361, 288, 397, 365, 379, 400, 152, 176, 150, 136, 172, 58, 132, 93,
        };
        const int ChainN = 15;
        // 슬라이더별 체인 점 가중 — 인접 점으로 부드럽게 테이퍼(영역 간 이음 매끈).
        static readonly float[] WCorner =
            { 0f, 0.3f, 1f, 0.9f, 0.3f, 0f, 0f, 0f, 0f, 0f, 0.3f, 0.9f, 1f, 0.3f, 0f };
        static readonly float[] WWidth =
            { 0f, 0f, 0f, 0.35f, 1f, 1f, 0.35f, 0f, 0.35f, 1f, 1f, 0.35f, 0f, 0f, 0f };
        static readonly float[] WLength =
            { 0f, 0f, 0f, 0f, 0f, 0.3f, 0.8f, 1f, 0.8f, 0.3f, 0f, 0f, 0f, 0f, 0f };
        // 하관 크기 — 하안부 실루엣 전체(동안: 줄이면 좁고 짧아짐). 끝은 볼로 블렌드.
        static readonly float[] WLowerFace =
            { 0f, 0.3f, 0.6f, 0.8f, 1f, 1f, 1f, 1f, 1f, 1f, 1f, 0.8f, 0.6f, 0.3f, 0f };
        // 광대 폭 — 체인 위쪽 끝(광대 실루엣)만, 아래로 갈수록 턱과 블렌드.
        static readonly float[] WCheek =
            { 1f, 0.6f, 0.2f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f, 0.2f, 0.6f, 1f };

        // ── 강도 스케일 (슬라이더 1.0 기준) — 실기기 튜닝 대상 ──
        const float MaxEyeScale = 0.30f;      // 눈확대: 1.30배
        const float EyeRadiusFactor = 1.3f;   // 눈 워프 반경 = 눈폭 × 1.3
        const float ChinScaleMax = 0.12f;     // 턱끝 방사 ±12%
        const float JawWidthMax = 0.028f;     // 너비 푸시 = 얼굴폭 × 2.8%
        const float ChinLenMax = 0.035f;      // 길이 푸시 = 얼굴폭 × 3.5%
        // 하관 = 실루엣 전체를 안(좁게)+위(짧게)로 — 방사 수축은 입이 아래로 끌려
        // "오그라드는" 느낌이었고, 동안 효과는 하안부가 좁고 짧아져야(실기기 피드백).
        const float LowerNarrowMax = 0.030f;  // 하관 좁힘 = 얼굴폭 × 3%
        const float LowerShortMax = 0.040f;   // 하관 짧힘 = 얼굴폭 × 4%
        const float JawCornerMax = 0.03f;     // 턱각 푸시 = 얼굴폭 × 3%
        const float CheekWidthMax = 0.025f;   // 광대 푸시 = 얼굴폭 × 2.5%
        const float MouthScaleMax = 0.15f;    // 입 크기 방사 ±15%
        const float NoseWingMax = 0.15f;      // 콧볼 방사 ±15%
        // ── 신규 부위(콧대·이마·눈썹) — "절반이 답" 교훈: 기존 유사 부위의 절반에서
        //    시작. 전부 실기기 튜닝 대상. ──
        const float NoseBridgeMax = 0.014f;   // 콧대 푸시 = 얼굴폭 × 1.4% (턱너비 2.8%의 절반)
        const float NoseBridgeLobe = 0.30f;   // 로브 중심 오프셋 = 콧볼폭 × 이 값 (실기기 튜닝 대상)
        const float NoseBridgeR = 0.50f;      // 로브 반경 = 콧볼폭 × 이 값 (실기기 튜닝 대상)
        const float ForeheadMax = 0.018f;     // 이마 푸시 = 얼굴폭 × 1.8% (턱길이 3.5%의 절반)
        const float ForeheadR = 0.20f;        // 이마 로브 반경 = 얼굴폭 × 이 값 (실기기 튜닝 대상)
        const float BrowLiftMax = 0.015f;     // 눈썹 리프트 = 얼굴폭 × 1.5% (실기기 튜닝 대상)
        const float BrowTiltMax = 0.012f;     // 눈썹 꼬리 = 얼굴폭 × 1.2% (실기기 튜닝 대상)
        const float BrowGapMax = 0.012f;      // 눈썹 간격 = 얼굴폭 × 1.2% (실기기 튜닝 대상)
        // 타원 로브의 단축/장축 비 — 셰이더 PUSH_ACROSS_RATIO와 일치(8a029e5 원값).
        const float PushAcrossRatio = 0.5f;
        const float ChainRadiusFactor = 0.20f; // 리본 반경 = 얼굴폭 × 이 값
        // 슬라이더 중첩 시 총 푸시 상한 — 변위/반경 비를 눌러 배경 역변환(고정점
        // 4회)의 수렴 여유 확보 (극단 조합에서 정합 오차 방지).
        const float ChainPushCap = 0.08f;     // 얼굴폭 × 8%
        // 요(yaw) 가중 — 고개를 돌리면 스크린공간 워프가 원근 단축으로 왜곡되므로 강도를
        // 감쇠(정면=1, 프로필로 갈수록 YawFloor). yaw 프록시 = 코가 두 눈꼬리 사이 어디
        // (HeadPoseSource와 동일 공식, 정면≈0, 좌/우 ~±0.5). 전부 실기기 튜닝 대상.
        const float YawEma = 0.3f;        // yaw 프록시 평활(워프 팝 억제)
        const float YawFadeStart = 0.08f; // 이 |yaw| 이하는 감쇠 없음(정면 여유대)
        const float YawFadeEnd = 0.34f;   // 이 |yaw| 이상은 YawFloor로 포화
        const float YawFloor = 0.25f;     // 최대 감쇠 시 잔여 강도(0이면 급소실 → 바닥값)

        // 상한 산정: 눈2+턱끝1+입1+콧볼2+콧대6+이마3+눈썹6 = 21 (여유 3).
        const int MaxOps = 24; // 오퍼레이터 상한 — 셰이더 MAX_WARP_OPS와 일치

        FaceLandmarkSource _source;
        float _eyeEnlarge;   // 0..1
        float _chinScale;    // −1..+1 (+=확대)
        float _jawWidth;     // −1..+1 (+=넓게)
        float _chinLength;   // −1..+1 (+=길게)
        float _lowerFace;    // −1..+1 (+=확대)
        float _jawCorner;    // −1..+1 (+=각지게)
        float _cheekWidth;   // −1..+1 (+=넓게)
        float _mouthScale;   // −1..+1 (+=확대)
        float _noseWing;     // −1..+1 (+=확대)
        float _noseBridge;   // −1..+1 (−=슬림, +=넓게)
        float _forehead;     // −1..+1 (+=높게)
        float _browLift;     // −1..+1 (+=올림)
        float _browTilt;     // −1..+1 (+=꼬리 위)
        float _browGap;      // −1..+1 (+=넓게)

        // 프레임당 1회 계산 캐시 (Forward가 여러 렌더러에서 불려도 landmark 재샘플 1회)
        int _frame = -1;
        bool _active;
        float _aspect = 1f;
        int _opCount;
        readonly Vector4[] _opA = new Vector4[MaxOps];      // (cx, cy, r, gain)
        readonly Vector4[] _opB = new Vector4[MaxOps];      // (푸시 raw UV xy, 로브 장축 아스펙트 zw)
        bool _chainActive;
        float _chainR;
        readonly Vector4[] _chainPtA = new Vector4[ChainN];  // 아스펙트 공간 점 (xy)
        readonly Vector4[] _chainPush = new Vector4[ChainN]; // raw UV 푸시 (xy)
        float _yawWeight = 1f;  // 요 가중(1=정면 무감쇠). AddRadial/AddPush/체인에 곱해짐
        float _yawSmooth;       // 평활 yaw 프록시
        bool _yawPrimed;

        static readonly int WarpActiveId = Shader.PropertyToID("_WarpActive");
        static readonly int WarpAspectId = Shader.PropertyToID("_WarpAspect");
        static readonly int WarpCountId = Shader.PropertyToID("_WarpCount");
        static readonly int WarpAId = Shader.PropertyToID("_WarpA");
        static readonly int WarpBId = Shader.PropertyToID("_WarpB");
        static readonly int ChainOnId = Shader.PropertyToID("_JawChainOn");
        static readonly int ChainRId = Shader.PropertyToID("_JawChainR");
        static readonly int ChainPtId = Shader.PropertyToID("_JawPtA");
        static readonly int ChainPushId = Shader.PropertyToID("_JawPush");

        void Awake() => Instance = this;

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void Init(FaceLandmarkSource source) => _source = source;

        /// <summary>워프 강도 갱신 — 형태 보정이라 전역 농도 스케일 대상 아님.</summary>
        public void ApplyParams(FilterParams p)
        {
            _eyeEnlarge = Mathf.Clamp01(p.eyeEnlarge);
            _chinScale = Mathf.Clamp(p.chinScale, -1f, 1f);
            _jawWidth = Mathf.Clamp(p.jawWidth, -1f, 1f);
            _chinLength = Mathf.Clamp(p.chinLength, -1f, 1f);
            _lowerFace = Mathf.Clamp(p.lowerFaceScale, -1f, 1f);
            _jawCorner = Mathf.Clamp(p.jawCorner, -1f, 1f);
            _cheekWidth = Mathf.Clamp(p.cheekWidth, -1f, 1f);
            _mouthScale = Mathf.Clamp(p.mouthScale, -1f, 1f);
            _noseWing = Mathf.Clamp(p.noseWingScale, -1f, 1f);
            _noseBridge = Mathf.Clamp(p.noseBridge, -1f, 1f);
            _forehead = Mathf.Clamp(p.foreheadHeight, -1f, 1f);
            _browLift = Mathf.Clamp(p.browLift, -1f, 1f);
            _browTilt = Mathf.Clamp(p.browTilt, -1f, 1f);
            _browGap = Mathf.Clamp(p.browGap, -1f, 1f);
        }

        bool AnyActive =>
            _eyeEnlarge > 0f || _chinScale != 0f || _jawWidth != 0f ||
            _chinLength != 0f || _lowerFace != 0f || _jawCorner != 0f ||
            _cheekWidth != 0f || _mouthScale != 0f || _noseWing != 0f ||
            _noseBridge != 0f || _forehead != 0f || _browLift != 0f ||
            _browTilt != 0f || _browGap != 0f;

        void EnsureFrame()
        {
            if (Time.frameCount == _frame) return;
            _frame = Time.frameCount;
            _opCount = 0;
            _chainActive = false;
            _active = AnyActive && _source != null && _source.HasFace &&
                      FramePresenter.Instance != null;
            if (!_active)
            {
                // 얼굴 소실·워프 꺼짐 — 요 평활 재프라임(재획득 시 첫 raw부터), 가중 1 복귀.
                _yawPrimed = false;
                _yawWeight = 1f;
                return;
            }

            _aspect = FramePresenter.Instance.ImageAspect;
            var lm = _source.Landmarks;

            // 공통 기하 — 아스펙트 공간(픽셀 비례)에서 축·거리 계산 후 raw UV로 환산.
            var chinA = ToA(ImgPt(lm, Chin));
            var noseA = ToA(ImgPt(lm, NoseTip));
            var axisUp = (noseA - chinA).normalized; // 얼굴 세로축(롤 추종)
            var faceW = (ToA(ImgPt(lm, CheekR)) - ToA(ImgPt(lm, CheekL))).magnitude;

            // ── 요(yaw) 가중 — 이후 모든 Add*·체인 푸시에 곱해 워프 강도 감쇠 ──
            var eyeRx = lm[EyeROuter].x; var eyeLx = lm[EyeLOuter].x;
            var yawSpan = Mathf.Max(Mathf.Abs(eyeLx - eyeRx), 1e-4f);
            var yawRaw = ((lm[NoseTip].x - eyeRx) / yawSpan) - 0.5f;
            _yawSmooth = _yawPrimed ? Mathf.Lerp(_yawSmooth, yawRaw, YawEma) : yawRaw;
            _yawPrimed = true;
            var yawOver = Mathf.Clamp01(
                (Mathf.Abs(_yawSmooth) - YawFadeStart) / Mathf.Max(YawFadeEnd - YawFadeStart, 1e-4f));
            _yawWeight = Mathf.Lerp(1f, YawFloor, yawOver);

            // ── 방사 오퍼레이터 ──
            if (_eyeEnlarge > 0f)
            {
                var gain = _eyeEnlarge * MaxEyeScale;
                AddRadial(ImgPt(lm, IrisR),
                    EyeSpan(lm, EyeROuter, EyeRInner) * EyeRadiusFactor, gain);
                AddRadial(ImgPt(lm, IrisL),
                    EyeSpan(lm, EyeLOuter, EyeLInner) * EyeRadiusFactor, gain);
            }
            if (_chinScale != 0f) // 턱끝 살짝 위 중심 — 끝이 모이거나 퍼짐
                AddRadial(FromA(chinA + axisUp * (0.06f * faceW)), 0.18f * faceW,
                    _chinScale * ChinScaleMax);
            if (_mouthScale != 0f) // 입 중심 방사 — 입 크기
            {
                var mouthC = (ImgPt(lm, MouthTop) + ImgPt(lm, MouthBottom)) * 0.5f;
                var mouthW = EyeSpan(lm, MouthCornerR, MouthCornerL);
                AddRadial(mouthC, mouthW * 0.9f, _mouthScale * MouthScaleMax);
            }
            if (_noseWing != 0f) // 콧볼 좌우 각각 방사 — 콧볼 축소/확대
            {
                var noseW = EyeSpan(lm, NoseWingR, NoseWingL);
                AddRadial(ImgPt(lm, NoseWingR), noseW * 0.55f, _noseWing * NoseWingMax);
                AddRadial(ImgPt(lm, NoseWingL), noseW * 0.55f, _noseWing * NoseWingMax);
            }

            // ── 푸시 오퍼레이터(신규 부위) — 타원 리본 로브 ──
            var horiz = new Vector2(-axisUp.y, axisUp.x); // 얼굴 수평축(롤 추종)

            if (_noseBridge != 0f)
            {
                // 콧대: 미드라인(나지온→하부) 각 높이에서 좌우 측벽 위치에 로브를 놓고
                // 수평으로 민다(−=양쪽을 코축으로=슬림). 로브 장축=콧대 방향 리본.
                var noseW = EyeSpan(lm, NoseWingR, NoseWingL);
                var bridgeDir =
                    (ToA(ImgPt(lm, NoseBridgePts[0])) - ToA(ImgPt(lm, NoseBridgePts[2])))
                    .normalized;
                var mag = _noseBridge * NoseBridgeMax * faceW;
                foreach (var idx in NoseBridgePts)
                {
                    var mA = ToA(ImgPt(lm, idx));
                    var off = horiz * (NoseBridgeLobe * noseW);
                    // 오른쪽 로브: 중심 m+off, 바깥 = +horiz / 왼쪽 로브: 반대.
                    AddPush(FromA(mA + off), FromADir(horiz * mag),
                        NoseBridgeR * noseW, bridgeDir);
                    AddPush(FromA(mA - off), FromADir(-horiz * mag),
                        NoseBridgeR * noseW, bridgeDir);
                }
            }

            if (_forehead != 0f)
            {
                // 이마 높이: 헤어라인 상단 3점을 세로축 위(+)/아래(−)로.
                // 로브 장축=수평 — 이웃 로브가 헤어라인 리본으로 이어진다.
                var mag = _forehead * ForeheadMax * faceW;
                for (var i = 0; i < HairTopPts.Length; i++)
                    AddPush(ImgPt(lm, HairTopPts[i]),
                        FromADir(axisUp * (mag * HairTopW[i])),
                        ForeheadR * faceW, horiz);
            }

            if (_browLift != 0f || _browTilt != 0f || _browGap != 0f)
            {
                AddBrowOps(lm, BrowR, axisUp, horiz, faceW);
                AddBrowOps(lm, BrowL, axisUp, horiz, faceW);
            }

            // ── 얼굴 실루엣 체인 (광대·턱각·너비·길이·하관 통합 리본) ──
            if (_jawWidth == 0f && _chinLength == 0f && _jawCorner == 0f &&
                _lowerFace == 0f && _cheekWidth == 0f) return;
            _chainActive = true;
            _chainR = faceW * ChainRadiusFactor;
            var wMag = _jawWidth * JawWidthMax * faceW;
            var lMag = _chinLength * ChinLenMax * faceW;
            var cMag = _jawCorner * JawCornerMax * faceW;
            var ckMag = _cheekWidth * CheekWidthMax * faceW;
            var lfN = _lowerFace * LowerNarrowMax * faceW; // +=넓게, −=좁게
            var lfS = _lowerFace * LowerShortMax * faceW;  // +=길게, −=짧게
            for (var i = 0; i < ChainN; i++)
            {
                var pt = ImgPt(lm, JawChain[i]);
                var ptA = ToA(pt);
                _chainPtA[i] = new Vector4(ptA.x, ptA.y, 0f, 0f);

                // 바깥 방향 = 세로축의 수평 성분 (턱끝 근처는 퇴화 → 0, 세로만 작용)
                var rel = ptA - chinA;
                var perp = rel - axisUp * Vector2.Dot(rel, axisUp);
                var outward = perp.sqrMagnitude > 1e-12f ? perp.normalized : Vector2.zero;

                // 점별 푸시 = 너비·사각턱·하관좁힘(바깥±) + 길이·하관짧힘(세로축 아래±).
                // 하관은 실루엣 전체 가중 — 줄이면 좁고 짧아져 동안 효과(실기기 피드백).
                var pushA =
                    outward * (wMag * WWidth[i] + cMag * WCorner[i] +
                               lfN * WLowerFace[i] + ckMag * WCheek[i])
                    - axisUp * (lMag * WLength[i] + lfS * WLowerFace[i]);
                var cap = ChainPushCap * faceW;
                if (pushA.sqrMagnitude > cap * cap) pushA = pushA.normalized * cap;
                var push = FromADir(pushA) * _yawWeight;
                _chainPush[i] = new Vector4(push.x, push.y, 0f, 0f);
            }
        }

        void AddRadial(Vector2 c, float r, float gain)
        {
            if (_opCount >= MaxOps) return;
            _opA[_opCount] = new Vector4(c.x, c.y, r, gain * _yawWeight);
            _opB[_opCount] = Vector4.zero;
            _opCount++;
        }

        /// <summary>방향 푸시 오퍼레이터(8a029e5 프리미티브 부활) — 중심 c에서 반경 r
        /// 로브 안을 pushRaw(raw UV 변위)만큼 민다. lobeAxisA(아스펙트 공간 단위벡터)를
        /// 주면 장축 r·단축 r×PushAcrossRatio 타원 리본.</summary>
        void AddPush(Vector2 c, Vector2 pushRaw, float r, Vector2 lobeAxisA)
        {
            if (_opCount >= MaxOps) return;
            _opA[_opCount] = new Vector4(c.x, c.y, r, 0f);
            _opB[_opCount] = new Vector4(pushRaw.x * _yawWeight, pushRaw.y * _yawWeight, lobeAxisA.x, lobeAxisA.y);
            _opCount++;
        }

        /// <summary>눈썹 한 쪽의 리프트·기울기·간격 로브 — 눈썹당 슬라이더별 1로브.
        /// 로브 장축 = 눈썹 방향(바깥→안) 리본. 강도 상수는 전부 실기기 튜닝 대상.</summary>
        void AddBrowOps(Vector3[] lm, int[] brow, Vector2 axisUp, Vector2 horiz, float faceW)
        {
            var outerA = ToA(ImgPt(lm, brow[0]));
            var innerA = ToA(ImgPt(lm, brow[brow.Length - 1]));
            var span = (outerA - innerA).magnitude;
            if (span < 1e-6f) return;
            var along = (outerA - innerA) / span; // 안→바깥 방향(로브 장축·간격 푸시 방향)

            if (_browLift != 0f)
            {
                // 리프트: 눈썹 중앙(가운데 3점 평균) 로브 — 전체를 세로축 위로.
                var midA = (ToA(ImgPt(lm, brow[1])) + ToA(ImgPt(lm, brow[2])) +
                            ToA(ImgPt(lm, brow[3]))) / 3f;
                AddPush(FromA(midA),
                    FromADir(axisUp * (_browLift * BrowLiftMax * faceW)),
                    span * 0.65f, along);
            }
            if (_browTilt != 0f)
            {
                // 기울기: 꼬리(바깥 1/3) 로브만 — 꼬리 올림/내림으로 인상 각도 변화.
                var tailA = Vector2.Lerp(outerA, innerA, 0.2f);
                AddPush(FromA(tailA),
                    FromADir(axisUp * (_browTilt * BrowTiltMax * faceW)),
                    span * 0.45f, along);
            }
            if (_browGap != 0f)
            {
                // 간격: 눈썹머리(안쪽) 로브 — 바깥(+)/미간 쪽(−)으로 수평 이동.
                var headA = Vector2.Lerp(innerA, outerA, 0.12f);
                AddPush(FromA(headA),
                    FromADir(along * (_browGap * BrowGapMax * faceW)),
                    span * 0.40f, along);
            }
        }

        /// <summary>
        /// 순방향 워프 — 랜드마크 이미지점을 워프된 위치로(메이크업 정점용). 변위는 원점
        /// p 기준 합산(셰이더 warpDisp와 동일)이라 배경 역함수와 정확히 대응한다.
        /// </summary>
        public Vector2 Forward(Vector2 p)
        {
            EnsureFrame();
            if (!_active) return p;
            var d = Vector2.zero;

            for (var i = 0; i < _opCount; i++)
            {
                var a = _opA[i];
                var b = _opB[i];
                var dc = p - new Vector2(a.x, a.y);
                var r = Mathf.Max(a.z, 1e-6f);
                float t;
                if (b.z != 0f || b.w != 0f)
                {
                    // 타원 로브 — 장축(b.zw, 아스펙트 공간) 반경 r, 단축 r×비율.
                    var dcA = new Vector2(dc.x * _aspect, dc.y);
                    var u = dcA.x * b.z + dcA.y * b.w;
                    var cross = dcA - new Vector2(b.z, b.w) * u;
                    var tu = u / r;
                    var tc = cross.magnitude / (r * PushAcrossRatio);
                    t = Mathf.Sqrt(tu * tu + tc * tc);
                }
                else
                {
                    t = AspectLen(dc) / r;
                }
                if (t >= 1f) continue;
                d += (dc * a.w + new Vector2(b.x, b.y)) * (1f - Smooth01(t));
            }

            if (_chainActive)
            {
                // 폴리라인 최근접 세그먼트 탐색 (아스펙트 공간) → 리본 가중 푸시.
                var pA = new Vector2(p.x * _aspect, p.y);
                float bestD2 = float.MaxValue, bestS = 0f;
                var bestI = 0;
                for (var i = 0; i < ChainN - 1; i++)
                {
                    var a0 = new Vector2(_chainPtA[i].x, _chainPtA[i].y);
                    var ab = new Vector2(_chainPtA[i + 1].x, _chainPtA[i + 1].y) - a0;
                    var s = Mathf.Clamp01(
                        Vector2.Dot(pA - a0, ab) / Mathf.Max(ab.sqrMagnitude, 1e-12f));
                    var q = a0 + ab * s;
                    var d2 = (pA - q).sqrMagnitude;
                    if (d2 < bestD2)
                    {
                        bestD2 = d2;
                        bestS = s;
                        bestI = i;
                    }
                }
                var t = Mathf.Sqrt(bestD2) / Mathf.Max(_chainR, 1e-6f);
                if (t < 1f)
                {
                    var push = Vector2.Lerp(
                        new Vector2(_chainPush[bestI].x, _chainPush[bestI].y),
                        new Vector2(_chainPush[bestI + 1].x, _chainPush[bestI + 1].y),
                        bestS);
                    d += push * (1f - Smooth01(t));
                }
            }
            return p + d;
        }

        /// <summary>배경 셰이더에 현재 워프 유니폼 기록 (프레임당 1회, 렌더 전).</summary>
        public void WriteToMaterial(Material mat)
        {
            EnsureFrame();
            mat.SetFloat(WarpActiveId, _active ? 1f : 0f);
            if (!_active) return;
            mat.SetFloat(WarpAspectId, _aspect);
            mat.SetFloat(WarpCountId, _opCount);
            mat.SetVectorArray(WarpAId, _opA);
            mat.SetVectorArray(WarpBId, _opB);
            mat.SetFloat(ChainOnId, _chainActive ? 1f : 0f);
            if (!_chainActive) return;
            mat.SetFloat(ChainRId, _chainR);
            mat.SetVectorArray(ChainPtId, _chainPtA);
            mat.SetVectorArray(ChainPushId, _chainPush);
        }

        // ── 좌표 헬퍼: 아스펙트 공간(x×aspect, 픽셀 비례) ↔ raw 이미지 UV ──
        Vector2 ToA(Vector2 p) => new Vector2(p.x * _aspect, p.y);
        Vector2 FromA(Vector2 pA) => new Vector2(pA.x / Mathf.Max(_aspect, 1e-6f), pA.y);
        /// <summary>아스펙트 공간 "방향/변위"를 raw UV 변위로 환산 (점 아님).</summary>
        Vector2 FromADir(Vector2 dA) => new Vector2(dA.x / Mathf.Max(_aspect, 1e-6f), dA.y);

        float EyeSpan(Vector3[] lm, int a, int b) =>
            AspectLen(ImgPt(lm, a) - ImgPt(lm, b));

        float AspectLen(Vector2 d) => Mathf.Sqrt(d.x * d.x * _aspect * _aspect + d.y * d.y);
        static float Smooth01(float t) => t * t * (3f - 2f * t);
        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
    }
}
