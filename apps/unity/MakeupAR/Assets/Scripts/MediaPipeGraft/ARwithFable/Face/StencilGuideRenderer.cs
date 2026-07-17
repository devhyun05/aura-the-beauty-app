using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 튜토리얼 스텐실 렌더러 (#2) — 메이크업 완성본을 "보여주는" AR에서 한 걸음 더,
    /// "어디에·어떤 모양으로 바르는지"를 얼굴 위에 얇은 가이드 라인으로 그린다.
    /// 초보자가 완성본을 따라 바를 수 있게 하는 코치 오버레이.
    ///
    /// 각 부위(립·눈썹·아이섀도·블러셔·컨투어)는 랜드마크에서 매 프레임 재구성한
    /// 폴리라인이고, 그 위에 얇은 리본(스트립)을 얹어 외곽선/존 경계를 만든다.
    /// 색을 칠하지 않는 안내선이라 GrabPass(피드 샘플)가 없고, 정점 색이 곧 라인 색이다
    /// (StencilGuide.shader와 계약). 펄스(호흡)·대시(마칭 앤츠)는 셰이더가 _Time으로.
    ///
    /// 토폴로지는 고정(슬롯 MaxStrokes개 × Pts 컬럼) — TeethRenderer/LowerLidRenderer
    /// 선례대로 Init에서 한 번 만들고 LateUpdate는 정점 위치만 옮긴다. 꺼진 부위 슬롯은
    /// 정점 알파 0(ApplyStencil이 기록) → 렌더는 되지만 안 보인다(슬롯 수가 적어 무해).
    ///
    /// 생성은 MakeupController.Init 부트스트랩(TeethRenderer·DoubleLid 선례) — 랜드마크
    /// 소스가 살아 있는 MediaPipe 경로 전용(ARKit 폴백에선 생성 생략). 큐는 전 메이크업
    /// 위(MakeupQueues.StencilGuide).
    /// </summary>
    public class StencilGuideRenderer : MonoBehaviour
    {
        public static StencilGuideRenderer Instance { get; private set; }

        // ── 부위별 랜드마크 링(다른 렌더러에서 복사 — 공유 상수 승격은 타 트랙 사용 중이라 보류) ──
        // 립 외곽 20점 (LipRenderer.LipsOuter / RegionMaskSource와 동일 규약).
        static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 };
        static readonly int[] LipsInner =
            { 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95 };
        // 눈썹 상·하단 (BrowRenderer와 동일). 상단+하단 역순 = 눈썹 외곽 닫힌 링.
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
        // 상안검 lash 라인 (IrisRenderer.UpperLids — [0]=바깥꼬리 → [끝]=안쪽머리).
        // 아이섀도 밴드 + 아이라인(상) 가이드 공용.
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };
        // 하안검 lash 라인 (LowerLidRenderer.LowerLids) — 애교살(하) 가이드용.
        static readonly int[][] LowerLids =
        {
            new[] { 33, 7, 163, 144, 145, 153, 154, 155, 133 },
            new[] { 263, 249, 390, 373, 374, 380, 381, 382, 362 },
        };
        // 눈 윤곽 — IrisRenderer의 아이라인 두께/윙 길이 기준인 등방 eyeRadius 계산용.
        static readonly int[][] EyeContours =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249 },
        };
        // 눈썹 아래 라인 — 아이섀도 "위" 방향(눈→눈썹) 판정 기준 (IrisRenderer와 동일 근거).
        static readonly int[][] EyeBrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };
        // 블러셔 존 중심(사과볼 근사) — 좌/우 볼. 실기기 튜닝 대상.
        // 눈 바깥꼬리(전역 스케일 = 안쪽 눈간 거리 기준).
        const int EyeOuterR = 33, EyeOuterL = 263;

        // 얼굴 오벌 실루엣(MediaPipe FACEMESH_FACE_OVAL 36점, 이마~턱) — 파운데 seg 게이트용
        // 방향 타원(공분산 PCA) 계산 소스. 랜드마크 기반 정적 기하(이미지 재탐색 없음).
        static readonly int[] FaceOval =
        {
            10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
            397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
            172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
        };

        // ── 부위 라인 색(고정 팔레트 — 서로 구분되는 코치 색) ──
        static readonly Color ColLips = new Color(1.00f, 0.35f, 0.55f);   // 로즈
        static readonly Color ColBrows = new Color(0.62f, 0.44f, 0.30f);  // 브라운
        static readonly Color ColShadow = new Color(0.66f, 0.45f, 0.90f); // 퍼플
        static readonly Color ColLiner = new Color(0.30f, 0.28f, 0.42f);  // 다크 인디고(아이라인)
        static readonly Color ColAegyo = new Color(0.95f, 0.68f, 0.78f);  // 핑크(애교살)
        static readonly Color ColBlush = new Color(1.00f, 0.55f, 0.45f);  // 코랄
        static readonly Color ColContour = new Color(0.45f, 0.60f, 0.75f);// 슬레이트
        static readonly Color ColHighlight = new Color(1.00f, 0.93f, 0.70f); // 펄 골드(하이라이터)

        // 마스크 기반 부위 캐노니컬 존 — MaskGenerator(MediaPipe UV) 복사. 드리프트 시
        // 동기화. (cx, cy, rx, ry) 캐노니컬 UV. UV 리졸버로 마스크와 동일하게 화면 투영.
        // v0 = 포크 5존(MaskGenerator.HighlightRegion 실측 사본 — 드리프트 동기화). 옛 좌표
        // (0.305/0.42 볼·6존)는 마스크와 어긋나 있었다. C존(볼) 상향·코끝 분리 반영.
        static readonly Vector4[] HighlightZonesV0 =
        {
            new Vector4(0.27f,  0.52f, 0.082f, 0.050f), // 광대뼈 C존 L
            new Vector4(0.73f,  0.52f, 0.082f, 0.050f), // 광대뼈 C존 R
            new Vector4(0.50f,  0.46f, 0.035f, 0.120f), // 콧대
            new Vector4(0.50f,  0.335f,0.038f, 0.030f), // 코끝
            new Vector4(0.50f,  0.28f, 0.055f, 0.030f), // 큐피드보우
            new Vector4(0.35f,  0.55f, 0.058f, 0.040f), // 눈썹뼈 L
            new Vector4(0.65f,  0.55f, 0.058f, 0.040f), // 눈썹뼈 R
        };
        // v1 = upstream 9존 재설계(MaskGenerator.HighlightRegionV1 사본). 존 순서 고정.
        static readonly Vector4[] HighlightZonesV1 =
        {
            new Vector4(0.27f, 0.52f, 0.082f, 0.050f), // 광대뼈 C존 L
            new Vector4(0.73f, 0.52f, 0.082f, 0.050f), // 광대뼈 C존 R
            new Vector4(0.50f, 0.55f, 0.032f, 0.070f), // 콧대(축소)
            new Vector4(0.50f, 0.45f, 0.028f, 0.030f), // 코끝
            new Vector4(0.47f, 0.36f, 0.024f, 0.016f), // 큐피드보우 L
            new Vector4(0.53f, 0.36f, 0.024f, 0.016f), // 큐피드보우 R
            new Vector4(0.36f, 0.68f, 0.060f, 0.030f), // 눈썹뼈 L(재배치)
            new Vector4(0.64f, 0.68f, 0.060f, 0.030f), // 눈썹뼈 R
            new Vector4(0.50f, 0.11f, 0.048f, 0.048f), // 턱끝(신설)
        };
        static readonly Vector4[] ContourZones = // MaskGenerator.ContourRegion
        {
            new Vector4(0.255f, 0.35f, 0.080f, 0.080f), // 볼 꺼짐 L
            new Vector4(0.745f, 0.35f, 0.080f, 0.080f), // 볼 꺼짐 R
            new Vector4(0.455f, 0.44f, 0.024f, 0.105f), // 콧벽 L
            new Vector4(0.545f, 0.44f, 0.024f, 0.105f), // 콧벽 R
            new Vector4(0.135f, 0.50f, 0.068f, 0.100f), // 관자 L
            new Vector4(0.865f, 0.50f, 0.068f, 0.100f), // 관자 R
            new Vector4(0.255f, 0.20f, 0.082f, 0.058f), // 턱선 L
            new Vector4(0.745f, 0.20f, 0.082f, 0.058f), // 턱선 R
        };
        // 블러셔 모양 프리셋별 존 — MaskGenerator BlushRegion/Igari/Drape 복사(캐노니컬 UV).
        // 프리셋마다 존 개수가 다르다(클래식2·이가리3·드레이핑4). 리프트/퍼짐은 셰이더와
        // 동일하게 경계점마다 UV 워프해 투영(정적 아님 → 값 바뀔 때 재해석).
        // ★클래식만 구운 마스크(Masks/blush.png)를 쓴다 — BlushRegion 좌표(0.38)가 아니라
        // 구운 텍스처 실측값(중심 0.468·rx0.075·ry0.055). 이가리/드레이핑은 구운 파일이 없어
        // 좌표대로 생성돼 아래 값과 일치. (blush.png 재도색 시 재측정 필요)
        static readonly Vector4[] BlushClassic =
        {
            new Vector4(0.277f, 0.468f, 0.075f, 0.055f), new Vector4(0.722f, 0.468f, 0.075f, 0.055f),
        };
        static readonly Vector4[] BlushIgari =
        {
            new Vector4(0.35f, 0.44f, 0.085f, 0.045f), new Vector4(0.65f, 0.44f, 0.085f, 0.045f),
            new Vector4(0.50f, 0.45f, 0.090f, 0.030f),
        };
        static readonly Vector4[] BlushDrape =
        {
            new Vector4(0.25f, 0.42f, 0.085f, 0.055f), new Vector4(0.75f, 0.42f, 0.085f, 0.055f),
            new Vector4(0.16f, 0.49f, 0.055f, 0.045f), new Vector4(0.84f, 0.49f, 0.055f, 0.045f),
        };
        // HlZones = 존 슬롯 예약 수 = 두 버전 중 최대(v0 7존, v1 9존 → 9). 활성 버전이
        // 쓰는 존만 그리고 나머지는 접는다(블러셔 프리셋 가변과 같은 규약).
        const int HlZonesV0 = 7;   // 포크 5존(볼·콧대·코끝·큐피드·눈썹뼈L/R)
        const int HlZonesV1 = 9;   // upstream 9존 재설계
        const int HlZones = 9;     // 예약 슬롯(최대)
        const int CtZones = 8;
        const int BlMaxZones = 4;
        const int ZoneTotal = HlZones + CtZones + BlMaxZones; // 캐시 크기
        const int BlCache = HlZones + CtZones;                // 블러셔 캐시 시작 존 인덱스
        const int HlPts = 16; // 존 경계 샘플 수

        // ── 슬롯 배치(고정 순서) ──
        // 0=립, 1·2=눈썹, 3·4=아이섀도, 5·6=블러셔(랜드마크·미사용), 7·8=컨투어(랜드마크·미사용),
        // 9·10=아이라인, 11·12=애교살, 13~21=하이라이터(9존 예약), 22~29=컨투어 UV, 30~33=블러셔 UV
        const int MaxStrokes = 34;
        const int S_LIP = 0, S_BROW = 1, S_SHADOW = 3, S_BLUSH = 5, S_CONTOUR = 7,
                  S_LINER = 9, S_AEGYO = 11, S_HL = 13, S_CTZ = 22, S_BLZ = 30;
        const int Pts = 40;      // 스트로크당 리샘플 컬럼 수(외곽 매끈)

        const float RibbonWidthFactor = 0.007f; // 리본 반폭 = 눈간거리 × 이 값 (가이드라인 얇게 — 0.013→0.007)
        const float ShadowCreaseFactor = 0.50f; // 아이섀도 존 높이 = 눈 가로폭 × 이 값
        // 아이라인 윙(꼬리) 연장 — EyelinerStyleRenderer와 동일 상수(가이드=실제 라이너 일치).
        // 랜드마크 33/263은 눈 '트임' 꼬리라 뜬 눈에선 실제 라인 꼬리보다 안쪽에서 끝난다.
        const float LinerWingFactor = 0.32f; // 윙 연장 = 눈 가로폭 × 이 값(스타일 길이 비율에 곱)
        // 애교살 존 높이 = 눈 가로폭 × 이 값 — LowerLid 밴드(0.45) × 셰이더 밑선(섀도)
        // 페이드 끝(vv 0.82) ≈ 0.37: 하이라이트+밑선을 감싸는 실제 애교살 범위. // 실기기 튜닝 대상
        const float AegyoBandFactor = 0.37f;
        // 핏 핸들은 가이드 외곽이 아니라 실제 LowerLid 밴드의 하이라이트 피크에 둔다.
        const float AegyoRenderBandFactor = 0.45f; // LowerLidRenderer.BandHeightFactor
        const float AegyoHighlightPeakV = 0.32f;   // LowerLid.shader hiAmt 최대 평탄부(.24~.40) 중앙

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        Color32[] _colors;

        // 상태(ApplyStencil이 기록) — 어떤 부위가 켜졌는지 + 마스터 농도.
        readonly bool[] _slotOn = new bool[MaxStrokes];
        float _opacity;

        // 룩 핏 배수(ApplyLookShapes가 기록, 1=원래) — 가이드가 현재 룩의 핏(모양 조절)을
        // 따라가게 한다. 클램프는 각 소비 렌더러와 동일(LowerLid/IrisRenderer 규약).
        float _aegyoHeightMult = 1f;   // 애교살 두께 (aegyoHeight)
        float _shadowHeightMult = 1f;  // 아이섀도 밴드 높이 (eyeshadowHeight)
        float _wingLenMult = 1f;       // 아이라인 윙 길이 (eyelinerWingLength)
        float _eyeCornerLift;           // 아이라인/섀도 눈꼬리 리프트 (eyeCornerLift)
        float _linerThickness = 1f;     // 아이라인 리본 두께 (eyelinerThickness)
        float _innerLiftOverride = -1f; // 아이라인 앞머리 리프트 (<0=IrisRenderer 기본값)
        float _browThickness = 1f;     // 눈썹 두께 (browThickness)
        float _browArch = 0f;          // 눈썹 아치 (browArch)
        int _browShape;                // 눈썹 모양 프리셋 (browShape)
        float _lipOverline;            // 립 오버라인 0..1 (lipOverline)
        float _lipLinerWidth = 1f;      // 립라이너 폭 (lipLinerWidth)
        int _eyelinerStyle;            // 아이라인 스타일 프리셋 (eyelinerStyle)
        float _blushLift;              // 블러셔 리프트 (blushLift, UV 워프)
        float _blushSpread;            // 블러셔 퍼짐 (blushSpread, UV 워프)
        float _highlightLift, _highlightSpread; // 하이라이터 UV 워프
        float _contourLift, _contourSpread;     // 컨투어 UV 워프
        int _blushShape;               // 블러셔 모양 프리셋 (blushShape: 클래식/이가리/드레이핑)
        int _blushCount;               // 현재 프리셋 존 개수(2~4)
        bool _blushDirty = true;       // 프리셋/리프트/퍼짐 변경 시 재해석 플래그

        // 립/아이라인 스타일 상수 — 실제 렌더러와 동일값(가이드=메이크업 일치).
        const float LipMaxOverline = 0.12f; // LipRenderer.MaxOverline
        const float LipUpperOuterBias = 0.13f * 0.48f; // LipRenderer 중앙 골(landmark 0) 바깥 바이어스
        const float LipLinerWidthFrac = 0.10f; // LipRenderer.LinerWidthFrac
        const float EyelinerThicknessFactor = 0.26f; // IrisRenderer.EyelinerThickness
        const float EyelinerInnerLiftDefault = 0.055f; // IrisRenderer.InnerCornerLiftImg
        const float EyeClosedSnapFloor = 0.25f; // IrisRenderer.EyeClosedSnapFloor
        static readonly float[] StyleAngleDeg = { 28f, -22f, 0f };  // IrisRenderer와 동일
        static readonly float[] StyleTailLen = { 0.45f, 0.4f, 0.7f };

        // 재사용 버퍼.
        readonly Vector2[] _ctrl = new Vector2[24]; // 최대 컨트롤 점(립 20·아이섀도 18)
        readonly Vector2[] _fine = new Vector2[Pts];
        // 눈썹 밴드 스크래치 — 안티-드룹(BrowWarp.WarpAndLiftDroopingTail)을 링 조립 전에
        // 적용하려면 상·하단을 배열로 잡아야 한다(제품 렌더러와 동일 처리 → 가이드 일치).
        readonly Vector2[] _browUp = new Vector2[BrowUpper[0].Length];
        readonly Vector2[] _browLo = new Vector2[BrowUpper[0].Length];

        // 마스크 존 경계점 UV→메시정점 캐시(정적 UV라 1회 해석). 매 프레임 뷰포트 보간.
        // 0..HlZones-1=하이라이터, HlZones..=컨투어(플랫, 존×HlPts 인덱스).
        readonly int[] _zA = new int[ZoneTotal * HlPts];
        readonly int[] _zB = new int[ZoneTotal * HlPts];
        readonly int[] _zC = new int[ZoneTotal * HlPts];
        readonly Vector3[] _zBary = new Vector3[ZoneTotal * HlPts];
        readonly bool[] _zOk = new bool[ZoneTotal * HlPts];
        bool _hlDirty = true;          // 하이라이터 존 재해석 플래그(커스텀 마스크 교체 포함)
        bool _ctDirty = true;          // 컨투어 존 재해석 플래그
        // 활성 하이라이터 존 세트(highlightZoneVersion) — 기본 v0(포크 5존). 버전이 바뀌면
        // 배열·개수를 교체하고 _hlDirty로 재해석한다(마스크와 동일 존을 오버레이).
        Vector4[] _hlZones = HighlightZonesV0;
        int _hlCount = HlZonesV0;
        int _hlVersion = 0;

        // 디자이너 커스텀 마스크(#2 C) — 임포트되면 캐노니컬 타원 대신 이 마스크의 실제
        // 경계를 존 중심에서 레이캐스트 추적. MakeupController.SetRegionMaskFromFile이 통지.
        // 슬롯 규약(MakeupController.MaskRegion): 0=Blush, 1=Highlight, 2=Contour.
        Texture2D _customHl, _customCt, _customBl;
        Vector2 _customHlCenterL, _customHlCenterR;
        Vector2 _customCtCenterL, _customCtCenterR;
        bool _customHlHasL, _customHlHasR;
        bool _customCtHasL, _customCtHasR;

        /// <summary>
        /// 부위 커스텀 마스크 통지(null=기본 마스크 복귀). 해당 그룹 재해석 예약.
        /// 슬롯: 0=블러셔, 1=하이라이터, 2=컨투어(MakeupController.MaskRegion과 동일).
        /// </summary>
        public void SetCustomMask(int slot, Texture2D mask)
        {
            switch (slot)
            {
                case 0: _customBl = mask; _blushDirty = true; break;
                case 1:
                    _customHl = mask;
                    CacheMaskHalfCenters(mask, out _customHlCenterL, out _customHlHasL,
                        out _customHlCenterR, out _customHlHasR);
                    _hlDirty = true;
                    break;
                case 2:
                    _customCt = mask;
                    CacheMaskHalfCenters(mask, out _customCtCenterL, out _customCtHasL,
                        out _customCtCenterR, out _customCtHasR);
                    _ctDirty = true;
                    break;
            }
        }

        // 커스텀 마스크를 받는 순간에만 활성 픽셀 중심을 계산한다. 픽셀 인덱스를
        // UV 픽셀 중심으로 바꾸며, x<0.5=L / x>=0.5=R로 단순 분리한다.
        static void CacheMaskHalfCenters(Texture2D mask,
            out Vector2 centerL, out bool hasL, out Vector2 centerR, out bool hasR)
        {
            centerL = centerR = Vector2.zero;
            hasL = hasR = false;
            if (mask == null || mask.width <= 0 || mask.height <= 0) return;

            var pixels = mask.GetPixels32();
            long countL = 0, countR = 0;
            double sumLx = 0.0, sumLy = 0.0, sumRx = 0.0, sumRy = 0.0;
            var invW = 1.0 / mask.width;
            var invH = 1.0 / mask.height;
            for (var y = 0; y < mask.height; y++)
            {
                var uvY = (y + 0.5) * invH;
                var row = y * mask.width;
                for (var x = 0; x < mask.width; x++)
                {
                    if (pixels[row + x].r < MaskZoneThreshold * 255f) continue;
                    var uvX = (x + 0.5) * invW;
                    if (uvX < 0.5)
                    {
                        sumLx += uvX; sumLy += uvY; countL++;
                    }
                    else
                    {
                        sumRx += uvX; sumRy += uvY; countR++;
                    }
                }
            }
            if (countL > 0)
            {
                centerL = new Vector2((float)(sumLx / countL), (float)(sumLy / countL));
                hasL = true;
            }
            if (countR > 0)
            {
                centerR = new Vector2((float)(sumRx / countR), (float)(sumRy / countR));
                hasR = true;
            }
        }

        static readonly int OpacityId = Shader.PropertyToID("_Opacity");
        static readonly int PulseId = Shader.PropertyToID("_Pulse");
        static readonly int DashId = Shader.PropertyToID("_Dash");

        // 얼굴 오벌 게이트(파운데 seg 코어 제외 대체) — CameraFeed.shader가 소비하는 전역.
        // 가이드 슬롯 on/off와 독립: 트래킹 중이면 매 프레임 기록, 소실 시 무효(z=0)로 폴백.
        static readonly int FndOvalId = Shader.PropertyToID("_FndOval");
        static readonly int FndOvalAxisId = Shader.PropertyToID("_FndOvalAxis");
        static readonly Vector4 OvalInactive = Vector4.zero; // z=0 = 타원 무효 → seg 파운데 off

        // ── A17 온페이스 핏 핸들 (좌표 방출; 터치는 RN 소관) ──
        // 가이드(setStencil) on/off와 독립. 켜져 있으면 트래킹 중 FitHandleInterval 프레임마다
        // 각 메이크업 부위의 모양 결정점 뷰포트 좌표 + 눈꼬리간 거리(eyeVp)를 방출.
        const int FitHandleInterval = 6;
        bool _fitHandlesEnabled;
        int _fhFrame;

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("StencilGuide");
            if (shader == null) shader = Shader.Find("ARMakeup/StencilGuide");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.StencilGuide;
            _material.SetFloat(Shader.PropertyToID("_SplitFollow"), 1f); // 반반 모드 추종

            _mesh = new Mesh { name = "StencilGuide" };
            _mesh.MarkDynamic();

            // 고정 토폴로지: 슬롯당 Pts 컬럼 × 2정점(리본 양변), 인접 컬럼끼리 쿼드.
            var vc = MaxStrokes * Pts * 2;
            var uvs = new Vector2[vc];
            var tris = new int[MaxStrokes * (Pts - 1) * 6];
            for (var s = 0; s < MaxStrokes; s++)
            {
                var b = s * Pts * 2;
                for (var c = 0; c < Pts; c++)
                {
                    var along = c / (float)(Pts - 1);
                    uvs[b + 2 * c] = new Vector2(along, 0f);
                    uvs[b + 2 * c + 1] = new Vector2(along, 1f);
                }
                for (var c = 0; c < Pts - 1; c++)
                {
                    int a0 = b + 2 * c, a1 = b + 2 * c + 1;
                    int n0 = b + 2 * (c + 1), n1 = b + 2 * (c + 1) + 1;
                    var t = (s * (Pts - 1) + c) * 6;
                    tris[t] = a0; tris[t + 1] = a1; tris[t + 2] = n0;
                    tris[t + 3] = a1; tris[t + 4] = n1; tris[t + 5] = n0;
                }
            }
            _vertices = new Vector3[vc];
            _colors = new Color32[vc]; // 초기 전부 알파 0(안 보임)
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.colors32 = _colors;
            _mesh.triangles = tris;

            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;

            // 얼굴 오벌 게이트 초기값 = 무효(첫 LateUpdate 전·얼굴 소실 시 seg 파운데 off).
            Shader.SetGlobalVector(FndOvalAxisId, OvalInactive);
        }

        /// <summary>
        /// 튜토리얼 가이드 상태 적용 — 부위 on/off·마스터 농도·펄스/대시.
        /// 정점 색(부위 색 + 알파=on?1:0)은 여기서 한 번 기록하고, 위치는 LateUpdate가
        /// 매 프레임 갱신한다(색은 위치와 독립이라 메시지 때만 써도 정합).
        /// </summary>
        public void ApplyStencil(StencilParams p)
        {
            if (p == null) return;
            _opacity = Mathf.Clamp01(p.opacity);

            _slotOn[S_LIP] = p.lips;
            _slotOn[S_BROW] = _slotOn[S_BROW + 1] = p.brows;
            _slotOn[S_SHADOW] = _slotOn[S_SHADOW + 1] = p.eyeshadow;
            _slotOn[S_BLUSH] = _slotOn[S_BLUSH + 1] = false; // 블러셔=UV 존으로 이관(랜드마크 미사용)
            _slotOn[S_CONTOUR] = _slotOn[S_CONTOUR + 1] = false; // 컨투어=UV 존으로 이관(랜드마크 미사용)
            _slotOn[S_LINER] = _slotOn[S_LINER + 1] = p.eyeliner;
            _slotOn[S_AEGYO] = _slotOn[S_AEGYO + 1] = p.aegyo;
            for (var z = 0; z < HlZones; z++) _slotOn[S_HL + z] = p.highlighter;
            for (var z = 0; z < CtZones; z++) _slotOn[S_CTZ + z] = p.contour;
            for (var z = 0; z < BlMaxZones; z++) _slotOn[S_BLZ + z] = p.blush;

            WriteSlotColor(S_LIP, ColLips);
            WriteSlotColor(S_BROW, ColBrows); WriteSlotColor(S_BROW + 1, ColBrows);
            WriteSlotColor(S_SHADOW, ColShadow); WriteSlotColor(S_SHADOW + 1, ColShadow);
            WriteSlotColor(S_LINER, ColLiner); WriteSlotColor(S_LINER + 1, ColLiner);
            WriteSlotColor(S_AEGYO, ColAegyo); WriteSlotColor(S_AEGYO + 1, ColAegyo);
            for (var z = 0; z < HlZones; z++) WriteSlotColor(S_HL + z, ColHighlight);
            for (var z = 0; z < CtZones; z++) WriteSlotColor(S_CTZ + z, ColContour);
            for (var z = 0; z < BlMaxZones; z++) WriteSlotColor(S_BLZ + z, ColBlush);
            if (_mesh != null) _mesh.colors32 = _colors;

            if (_material != null)
            {
                _material.SetFloat(OpacityId, _opacity);
                _material.SetFloat(PulseId, p.pulse ? 1f : 0f);
                _material.SetFloat(DashId, p.dash ? 1f : 0f);
            }
        }

        /// <summary>
        /// 현재 룩의 핏(모양 조절) 배수 반영 — MakeupController.ApplyTo가 메이크업 파라미터를
        /// 뿌릴 때 함께 호출한다. 가이드 존이 "핏으로 조절한 그 모양"을 따라가게(사용자 지적).
        /// 클램프·기본값(JsonUtility 생략 0 → 1)은 각 소비 렌더러와 동일.
        /// </summary>
        public void ApplyLookShapes(FilterParams p)
        {
            if (p == null) return;
            _aegyoHeightMult = p.aegyoHeight <= 0f ? 1f : Mathf.Clamp(p.aegyoHeight, 0.25f, 2f);
            _shadowHeightMult = p.eyeshadowHeight <= 0f ? 1f : Mathf.Clamp(p.eyeshadowHeight, 0.3f, 2f);
            _wingLenMult = p.eyelinerWingLength <= 0f ? 1f : Mathf.Clamp(p.eyelinerWingLength, 0.2f, 2.5f);
            _eyeCornerLift = Mathf.Clamp01(p.eyeCornerLift);
            _linerThickness = p.eyelinerThickness <= 0f
                ? 1f : Mathf.Clamp(p.eyelinerThickness, 0.3f, 2.5f);
            _innerLiftOverride = p.eyelinerInnerLift < 0f
                ? -1f : Mathf.Clamp(p.eyelinerInnerLift, 0f, 0.15f);
            // 눈썹 — BrowRenderer와 동일 클램프. 가이드가 BrowWarp.ShapeBand로 실제 눈썹 일치.
            _browThickness = Mathf.Clamp(p.browThickness, 0.4f, 2f);
            _browArch = Mathf.Clamp(p.browArch, 0f, 1f);
            _browShape = Mathf.Clamp(p.browShape, 0, 5);
            _lipOverline = Mathf.Clamp01(p.lipOverline);
            _lipLinerWidth = p.lipLinerWidth <= 0f
                ? 1f : Mathf.Clamp(p.lipLinerWidth, 0.4f, 2.5f);
            _eyelinerStyle = Mathf.Clamp(p.eyelinerStyle, 0, StyleAngleDeg.Length - 1);
            // 존 세트 버전 스위치 — 마스크(MaskGenerator)와 같은 존을 가이드가 따라간다.
            var hlVersion = p.highlightZoneVersion == 1 ? 1 : 0;
            if (hlVersion != _hlVersion)
            {
                _hlVersion = hlVersion;
                _hlZones = hlVersion == 1 ? HighlightZonesV1 : HighlightZonesV0;
                _hlCount = hlVersion == 1 ? HlZonesV1 : HlZonesV0;
                _hlDirty = true;
            }
            var highlightLift = Mathf.Clamp(p.highlightLift, -0.15f, 0.15f);
            var highlightSpread = Mathf.Clamp(p.highlightSpread, -0.15f, 0.15f);
            if (!Mathf.Approximately(highlightLift, _highlightLift)
                || !Mathf.Approximately(highlightSpread, _highlightSpread))
                _hlDirty = true;
            _highlightLift = highlightLift; _highlightSpread = highlightSpread;
            var contourLift = Mathf.Clamp(p.contourLift, -0.15f, 0.15f);
            var contourSpread = Mathf.Clamp(p.contourSpread, -0.15f, 0.15f);
            if (!Mathf.Approximately(contourLift, _contourLift)
                || !Mathf.Approximately(contourSpread, _contourSpread))
                _ctDirty = true;
            _contourLift = contourLift; _contourSpread = contourSpread;
            // 블러셔 — 프리셋/리프트/퍼짐 중 하나라도 바뀌면 UV 존 재해석(정적 아님).
            var lift = Mathf.Clamp(p.blushLift, -0.15f, 0.15f);
            var spread = Mathf.Clamp(p.blushSpread, -0.15f, 0.15f);
            var shape = Mathf.Clamp(p.blushShape, 0, 2);
            if (shape != _blushShape || !Mathf.Approximately(lift, _blushLift)
                || !Mathf.Approximately(spread, _blushSpread))
                _blushDirty = true;
            _blushShape = shape; _blushLift = lift; _blushSpread = spread;
        }

        void WriteSlotColor(int slot, Color rgb)
        {
            var a = (byte)(_slotOn[slot] ? 255 : 0);
            var c = new Color32((byte)(rgb.r * 255), (byte)(rgb.g * 255), (byte)(rgb.b * 255), a);
            var b = slot * Pts * 2;
            for (var i = 0; i < Pts * 2; i++) _colors[b + i] = c;
        }

        bool AnyOn()
        {
            for (var s = 0; s < MaxStrokes; s++) if (_slotOn[s]) return true;
            return false;
        }

        void LateUpdate()
        {
            var tracking = _source != null && _source.HasFace && FramePresenter.Instance != null;
            var visible = tracking && _opacity > 0f && AnyOn();
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (visible) DrawGuides();
            // 얼굴 오벌 게이트(파운데 seg 코어 제외) — 가이드 슬롯 on/off와 독립. 트래킹 중이면
            // 매 프레임 타원을 기록하고, 소실 시 무효(z=0)로 폴백해 seg 파운데를 끈다.
            if (tracking) WriteFaceOval(_source.Landmarks);
            else Shader.SetGlobalVector(FndOvalAxisId, OvalInactive);
            // A17 온페이스 핏 핸들 — 가이드 슬롯 on/off와 독립. 트래킹 중이면 6프레임마다 좌표 방출.
            if (_fitHandlesEnabled && tracking) EmitFitHandles(_source.Landmarks);
        }

        /// <summary>
        /// 얼굴 오벌 랜드마크의 이미지 UV 무게중심·공분산으로 방향 타원(중심·반경·주축)을
        /// 만들어 CameraFeed 파운데 seg 게이트에 전역으로 넘긴다. 이미지 UV 공간은 표시 회전
        /// 전이라 얼굴이 눕고 기울 수 있어 축정렬 대신 2×2 공분산 주축(PCA)으로 타원을
        /// 회전시킨다. 셰이더의 src(워프 역샘플 이미지 UV)와 같은 공간이라 그대로 비교된다.
        /// 랜드마크 기반 정적 기하 — 이미지 재탐색(엣지 스냅) 없음(울렁임 방지 원칙).
        /// </summary>
        void WriteFaceOval(Vector3[] lm)
        {
            var n = FaceOval.Length;
            var c = Vector2.zero;
            for (var i = 0; i < n; i++) c += ImgPt(lm, FaceOval[i]);
            c /= n;
            float cxx = 0f, cxy = 0f, cyy = 0f;
            for (var i = 0; i < n; i++)
            {
                var d = ImgPt(lm, FaceOval[i]) - c;
                cxx += d.x * d.x; cxy += d.x * d.y; cyy += d.y * d.y;
            }
            // 주축 각도 = 2×2 공분산 고유벡터 방향. cxy≈0·cxx≈cyy(원형)면 θ=0이라 안전.
            var theta = 0.5f * Mathf.Atan2(2f * cxy, cxx - cyy);
            var cos = Mathf.Cos(theta);
            var sin = Mathf.Sin(theta);
            // 반경 = 주축·부축 방향 최대 투영(오벌 경계점을 감싸는 타원). 셰이더 sizeMul(기본
            // 1.1)이 이 위에 여유를 더해 메시 오벌보다 살짝 넉넉히 덮는다.
            float rx = 0f, ry = 0f;
            for (var i = 0; i < n; i++)
            {
                var d = ImgPt(lm, FaceOval[i]) - c;
                rx = Mathf.Max(rx, Mathf.Abs(d.x * cos + d.y * sin));
                ry = Mathf.Max(ry, Mathf.Abs(-d.x * sin + d.y * cos));
            }
            Shader.SetGlobalVector(FndOvalId,
                new Vector4(c.x, c.y, Mathf.Max(rx, 1e-4f), Mathf.Max(ry, 1e-4f)));
            Shader.SetGlobalVector(FndOvalAxisId, new Vector4(cos, sin, 1f, 0f)); // z=1 = active
        }

        /// <summary>setStencil로 켜진 슬롯의 가이드 스트로크/존을 매 프레임 재구성해 리본
        /// 정점을 갱신한다(핏 핸들 방출과 독립 — visible일 때만 호출).</summary>
        void DrawGuides()
        {
            var lm = _source.Landmarks;
            var eyeSpan = (ImgPt(lm, EyeOuterL) - ImgPt(lm, EyeOuterR)).magnitude;
            var halfW = eyeSpan * RibbonWidthFactor;

            // 립 — 외곽 닫힌 링. 오버라인(overline)이면 중심에서 바깥으로 확장(LipRenderer와
            // 동일 계수 MaxOverline) → 오버립 그린 모양 일치.
            if (_slotOn[S_LIP])
            {
                var nlip = LipsOuter.Length;
                var lipC = Vector2.zero;
                for (var i = 0; i < nlip; i++) lipC += ImgPt(lm, LipsOuter[i]);
                lipC /= nlip;
                var rad = 0f;
                for (var i = 0; i < nlip; i++) rad += (ImgPt(lm, LipsOuter[i]) - lipC).magnitude;
                rad /= nlip;
                var expand = _lipOverline * LipMaxOverline * rad;
                for (var i = 0; i < nlip; i++)
                {
                    var p2 = ImgPt(lm, LipsOuter[i]);
                    _ctrl[i] = expand > 0f ? p2 + (p2 - lipC).normalized * expand : p2;
                }
                BuildRing(nlip, true, halfW, DepthOfIndices(lm, LipsOuter), S_LIP);
            }

            // 눈썹 — 상단·하단(모양·두께·아치 반영) 역순 = 외곽 닫힌 링(좌/우).
            // 두 엣지를 BrowRenderer와 동일한 BrowWarp.ShapeBand로 변형해 실제 눈썹 일치.
            for (var e = 0; e < 2; e++)
            {
                if (!_slotOn[S_BROW + e]) continue;
                var up = BrowUpper[e];
                var lowr = BrowLower[e];
                var m = up.Length;
                // 상·하단 쌍을 함께 셰이핑하고 꼬리 폭 테이퍼 후 안티-드룹 적용 → 링 정점으로
                // 조립. 제품 렌더러(BrowRenderer 등)와 동일 순서라 가이드 일치.
                for (var i = 0; i < m; i++)
                {
                    var loP = ImgPt(lm, lowr[i]);
                    var upP = ImgPt(lm, up[i]);
                    var along = i / (float)(m - 1);
                    BrowWarp.ShapeBand(
                        ref loP, ref upP, along, _browThickness, _browArch, _browShape);
                    BrowWarp.TaperTail(ref loP, ref upP, along);
                    _browLo[i] = loP;
                    _browUp[i] = upP;
                }
                var browWarped = BrowWarp.WarpAndLiftDroopingTail(
                    _browLo, _browUp, m, lm, FramePresenter.Instance.ImageAspect); // 제품과 동일 안티-드룹
                // 상단 정순 [0..m-1] + 하단 역순 [2m-1..m] = 닫힌 외곽 링.
                for (var i = 0; i < m; i++)
                {
                    _ctrl[i] = _browUp[i];
                    _ctrl[2 * m - 1 - i] = _browLo[i];
                }
                BuildRing(
                    2 * m, true, halfW, DepthOfIndices(lm, up), S_BROW + e,
                    warpedImage: browWarped);
            }

            // 아이섀도 존 — lash 라인 + 그 위(눈→눈썹 방향)로 밀어올린 크리스 = 닫힌 밴드.
            for (var e = 0; e < 2; e++)
            {
                if (!_slotOn[S_SHADOW + e]) continue;
                var lids = UpperLids[e];
                var np = lids.Length;
                var eyeW = (ImgPt(lm, lids[0]) - ImgPt(lm, lids[np - 1])).magnitude;
                var lidMid = ImgPt(lm, lids[np / 2]);
                var up = (ImgPt(lm, EyeBrowLower[e][2]) - lidMid).normalized; // 눈→눈썹
                var creaseH = eyeW * ShadowCreaseFactor * _shadowHeightMult; // 핏(높이) 추종
                var n = 0;
                for (var i = 0; i < np; i++) _ctrl[n++] = ImgPt(lm, lids[i]);                // 바깥→안쪽(lash)
                for (var i = np - 1; i >= 0; i--) _ctrl[n++] = ImgPt(lm, lids[i]) + up * creaseH; // 안쪽→바깥(크리스)
                BuildRing(n, true, halfW, DepthOfIndices(lm, lids), S_SHADOW + e);
            }

            // (블러셔·컨투어는 아래 마스크 UV 존 투영으로 그린다 — 랜드마크 근사 미사용)

            // 아이라인 — 상안검 lash 라인 + 바깥 꼬리(윙) 연장(좌/우). 랜드마크 꼬리점은
            // 눈 '트임' 기준이라 뜬 눈에선 실제 라인 꼬리보다 안쪽 — 실제 라이너
            // (EyelinerStyleRenderer)와 동일하게 바깥 접선을 위로 꺾어 연장한다.
            for (var e = 0; e < 2; e++)
            {
                if (!_slotOn[S_LINER + e]) continue;
                var lids = UpperLids[e];
                var np = lids.Length;
                // 안쪽 눈머리 → 바깥 꼬리 순으로 채우고 끝에 윙 1점 추가.
                for (var i = 0; i < np; i++) _ctrl[i] = ImgPt(lm, lids[np - 1 - i]);
                var eyeW = (_ctrl[0] - _ctrl[np - 1]).magnitude;
                var lidMid = ImgPt(lm, lids[np / 2]);
                var up = (ImgPt(lm, EyeBrowLower[e][2]) - lidMid).normalized; // 눈→눈썹(감아도 안정)
                // 스타일(윙업/퍼피/롱) — IrisRenderer와 동일: 바깥축 기준 각도로 윙 방향,
                // 스타일별 꼬리 길이 비율. 윙업=위로 28°, 퍼피=아래 -22°, 롱=0°.
                var axis = (_ctrl[np - 1] - _ctrl[np - 2]).normalized;       // 바깥 방향
                var u = (up - Vector2.Dot(up, axis) * axis).normalized;      // axis 수직 "위"
                var theta = StyleAngleDeg[_eyelinerStyle] * Mathf.Deg2Rad;
                var wingDir = (Mathf.Cos(theta) * axis + Mathf.Sin(theta) * u).normalized;
                var wingLen = eyeW * LinerWingFactor * _wingLenMult
                              * (StyleTailLen[_eyelinerStyle] / StyleTailLen[0]); // 스타일 길이 비율
                _ctrl[np] = _ctrl[np - 1] + wingDir * wingLen;
                BuildRing(np + 1, false, halfW, DepthOfIndices(lm, lids), S_LINER + e);
            }

            // 애교살 — 위=하안검 lash 라인(눈을 따라), 아래=lash와 독립한 매끈한 초승달
            // 아크. 밑라인을 lash에 평행 오프셋하면 밑바닥이 평평하고 코너서 꺾여 '보트'가
            // 된다(사용자 지적). 두 눈꼬리(현)를 잇고 중앙만 아래로 부풀린 포물선으로 그려
            // 단일 곡률의 초승달을 만든다. 중앙 깊이 = lash 처짐 + 두께(핏 추종).
            const int AegyoArc = 11; // 밑 아크 샘플 수(BuildRing가 다시 매끈하게 리샘플)
            for (var e = 0; e < 2; e++)
            {
                if (!_slotOn[S_AEGYO + e]) continue;
                var lids = LowerLids[e];
                var np = lids.Length;
                var outer = ImgPt(lm, lids[0]);       // 눈꼬리
                var inner = ImgPt(lm, lids[np - 1]);  // 눈앞머리
                var chord = inner - outer;
                var chordDir = chord.normalized;
                var brow = ImgPt(lm, EyeBrowLower[e][2]);
                var lidMid = ImgPt(lm, lids[np / 2]);
                var downRef = (lidMid - brow).normalized;          // 아래 방향 기준(감아도 안정)
                var normal = new Vector2(-chordDir.y, chordDir.x); // 현의 수직
                if (Vector2.Dot(normal, downRef) < 0f) normal = -normal; // 아래쪽으로
                // lash 중앙이 현보다 아래로 처진 양 + 두께 = 중앙 아크 깊이.
                var dip = Mathf.Max(0f, Vector2.Dot(lidMid - (outer + inner) * 0.5f, normal));
                var sag = dip + chord.magnitude * AegyoBandFactor * _aegyoHeightMult;
                var n = 0;
                for (var i = 0; i < np; i++) _ctrl[n++] = ImgPt(lm, lids[i]); // 위: lash 라인
                for (var j = AegyoArc - 1; j >= 0; j--) // 아래: 눈꼬리→눈앞 포물선(중앙만 부풀림)
                {
                    var t = j / (float)(AegyoArc - 1);
                    _ctrl[n++] = outer + chord * t + normal * (4f * sag * t * (1f - t));
                }
                BuildRing(n, true, halfW, DepthOfIndices(lm, lids), S_AEGYO + e);
            }

            // 마스크 UV 존 가이드(하이라이터·컨투어) — 캐노니컬 UV 존을 UV 리졸버로 화면
            // 투영(마스크와 동일 좌표). UV 토폴로지 정적 → 존 경계점의 (메시정점3·bary)를
            // 1회 해석 캐시하고, 매 프레임 메시 뷰포트로 보간해 싸게 그린다.
            if (AnyZoneOn())
            {
                var mesh = CanonicalFaceMesh.Instance;
                if (mesh != null && mesh.TopologyReady)
                {
                    // 그룹별 dirty일 때만 재해석(정적 UV·커스텀 마스크 교체 시).
                    if (_hlDirty) { ResolveGroup(mesh, _hlZones, _hlCount, 0, _customHl,
                        _highlightLift, _highlightSpread); _hlDirty = false; }
                    if (_ctDirty) { ResolveGroup(mesh, ContourZones, CtZones, HlZones, _customCt,
                        _contourLift, _contourSpread); _ctDirty = false; }
                    if (_blushDirty) ResolveBlush(mesh); // 프리셋/리프트/퍼짐/커스텀 변경 시만
                    var eyeVp = (mesh.ViewportOfVertex(EyeOuterL) - mesh.ViewportOfVertex(EyeOuterR)).magnitude;
                    var halfWVp = eyeVp * RibbonWidthFactor;
                    var zDepth = Depth(lm[1].z);
                    DrawZones(mesh, 0, _hlCount, S_HL, halfWVp, zDepth);          // 하이라이터(활성 버전)
                    for (var z = _hlCount; z < HlZones; z++) CollapseSlot(S_HL + z); // 미사용 존 정리(v0=7)
                    DrawZones(mesh, HlZones, CtZones, S_CTZ, halfWVp, zDepth);    // 컨투어
                    DrawZones(mesh, BlCache, _blushCount, S_BLZ, halfWVp, zDepth);// 블러셔(프리셋별)
                    for (var z = _blushCount; z < BlMaxZones; z++) CollapseSlot(S_BLZ + z); // 미사용 존 정리
                }
            }

            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
        }

        bool AnyZoneOn()
        {
            for (var z = 0; z < HlZones; z++) if (_slotOn[S_HL + z]) return true;
            for (var z = 0; z < CtZones; z++) if (_slotOn[S_CTZ + z]) return true;
            for (var z = 0; z < BlMaxZones; z++) if (_slotOn[S_BLZ + z]) return true;
            return false;
        }

        // 블러셔 존 재해석 — 프리셋 세트 선택 + 리프트/퍼짐을 셰이더와 동일하게 경계점마다
        // UV 워프(buv.y-=lift → +lift 위, spread는 좌우 미러 바깥·중앙 페이드). 값 바뀔 때만.
        void ResolveBlush(CanonicalFaceMesh mesh)
        {
            var zones = _blushShape == 1 ? BlushIgari : _blushShape == 2 ? BlushDrape : BlushClassic;
            _blushCount = zones.Length;
            for (var z = 0; z < _blushCount; z++)
            {
                var zn = zones[z];
                var center = new Vector2(zn.x, zn.y);
                // 커스텀 블러셔 마스크(#2 C)면 프리셋 존 중심에서 실제 경계 레이캐스트,
                // 중심이 마스크 밖이면 해당 존 접기(리프트/퍼짐 워프는 커스텀 모양이 대체).
                var centerInside = _customBl == null || MaskAt(_customBl, center) >= MaskZoneThreshold;
                for (var i = 0; i < HlPts; i++)
                {
                    var ang = i / (float)HlPts * Mathf.PI * 2f;
                    var idx = (BlCache + z) * HlPts + i;
                    if (!centerInside) { _zOk[idx] = false; continue; }
                    Vector2 edge;
                    if (_customBl != null)
                    {
                        var dir = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang));
                        edge = dir * RayBoundary(_customBl, center, dir, zn.z, zn.w);
                    }
                    else
                    {
                        var uvx = zn.x + Mathf.Cos(ang) * zn.z;
                        var uvy = zn.y + Mathf.Sin(ang) * zn.w;
                        // 셰이더 워프 역: 리프트=+y, 퍼짐=바깥(x<0.5 왼쪽/그 외 오른쪽) · 중앙 페이드.
                        // spreadW = HLSL smoothstep(0.04, 0.22, |x-0.5|)를 수동 계산(Mathf.SmoothStep은 시그니처 다름).
                        var st = Mathf.Clamp01((Mathf.Abs(uvx - 0.5f) - 0.04f) / (0.22f - 0.04f));
                        var spreadW = st * st * (3f - 2f * st);
                        uvy += _blushLift;
                        uvx += (uvx < 0.5f ? -_blushSpread : _blushSpread) * spreadW;
                        edge = new Vector2(uvx, uvy) - center;
                    }
                    var got = false;
                    for (var s = 0; s < 5 && !got; s++)
                    {
                        var uv = center + edge * (1f - s * 0.2f);
                        got = mesh.TryResolveUv(uv, out _zA[idx], out _zB[idx], out _zC[idx], out _zBary[idx]);
                    }
                    _zOk[idx] = got;
                }
            }
            _blushDirty = false;
        }

        // 존 그룹 그리기 — 캐시(cacheZ0부터 count개 존) → 슬롯(slotBase부터). 메시 뷰포트 보간.
        void DrawZones(CanonicalFaceMesh mesh, int cacheZ0, int count, int slotBase, float halfWVp, float depth)
        {
            for (var z = 0; z < count; z++)
            {
                if (!_slotOn[slotBase + z]) continue;
                var ok = true;
                for (var i = 0; i < HlPts; i++)
                {
                    var idx = (cacheZ0 + z) * HlPts + i;
                    if (!_zOk[idx]) { ok = false; break; }
                    _ctrl[i] = _zBary[idx].x * mesh.ViewportOfVertex(_zA[idx])
                             + _zBary[idx].y * mesh.ViewportOfVertex(_zB[idx])
                             + _zBary[idx].z * mesh.ViewportOfVertex(_zC[idx]);
                }
                if (ok) BuildRing(HlPts, true, halfWVp, depth, slotBase + z, vp: true);
                else CollapseSlot(slotBase + z);
            }
        }

        // 마스크 존 경계점 UV → (메시정점3, bary) 해석. 하이라이터·컨투어 플랫 캐시.
        // customMask!=null(디자이너 임포트, #2 C)이면 캐노니컬 타원 대신 이 마스크의
        // 실제 경계를 존 중심에서 레이캐스트로 추적한다(마칭스퀘어 없이 B 인프라 재사용).
        void ResolveGroup(CanonicalFaceMesh mesh, Vector4[] zones, int count, int cacheZ0,
                          Texture2D customMask, float lift, float spread)
        {
            for (var z = 0; z < count; z++)
            {
                var zn = zones[z];
                var center = new Vector2(zn.x, zn.y);
                // 커스텀 마스크가 이 존 중심을 안 덮으면(존 밖) 접어 숨긴다.
                var centerInside = customMask == null || MaskAt(customMask, center) >= MaskZoneThreshold;
                for (var i = 0; i < HlPts; i++)
                {
                    var ang = i / (float)HlPts * Mathf.PI * 2f;
                    var idx = (cacheZ0 + z) * HlPts + i;
                    if (!centerInside) { _zOk[idx] = false; continue; }
                    var dir = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang));
                    var edge = customMask == null
                        ? new Vector2(dir.x * zn.z, dir.y * zn.w)                 // 캐노니컬 타원
                        : dir * RayBoundary(customMask, center, dir, zn.z, zn.w); // 커스텀 경계 추적
                    // 경계점이 메시 밖(얼굴 가장자리·눈 구멍)이면 중심 쪽으로 당겨 재시도.
                    var got = false;
                    for (var s = 0; s < 5 && !got; s++)
                    {
                        var sourceUv = center + edge * (1f - s * 0.2f);
                        var uv = SourceMaskUvToDisplayUv(sourceUv, lift, spread);
                        got = mesh.TryResolveUv(uv, out _zA[idx], out _zB[idx], out _zC[idx], out _zBary[idx]);
                    }
                    _zOk[idx] = got;
                }
            }
        }

        // 마스크 세기 임계(0~1) — 이보다 진하면 존 안. R8 마스크(.r) 이중선형 샘플.
        const float MaskZoneThreshold = 0.30f;

        static float MaskAt(Texture2D m, Vector2 uv) => m.GetPixelBilinear(uv.x, uv.y).r;

        // 중심에서 dir 방향으로 마칭해 마스크 경계(세기<임계)까지의 반경을 찾는다.
        // 캐노니컬 타원 반경(rx·ry)을 방향별 상한으로 써 폭주를 막고, 경계 못 찾으면
        // 타원 반경으로 폴백(마스크가 이 방향으로 열려 있으면 원래 존 크기 유지).
        static float RayBoundary(Texture2D m, Vector2 center, Vector2 dir, float rx, float ry)
        {
            var maxR = Mathf.Max(rx, ry) * 2.2f; // 타원보다 넉넉히(디자이너 마스크가 더 클 수 있음)
            var last = 0f;
            for (var r = MaskStep; r <= maxR; r += MaskStep)
            {
                if (MaskAt(m, center + dir * r) < MaskZoneThreshold) return r; // 경계 도달
                last = r;
            }
            return last > 0f ? last : Mathf.Max(rx, ry); // 끝까지 존 안 → 최외곽 샘플 반경
        }

        const float MaskStep = 0.006f; // 레이캐스트 진행 간격(UV)

        /// <summary>
        /// _ctrl[0..n)를 Catmull-Rom으로 Pts개 리샘플한 뒤, 각 점에서 접선의 수직으로
        /// ±halfW 벌려 얇은 리본 스트립을 만든다(슬롯 slot). closed=true면 링이 시점으로
        /// 되돌아와 리본이 닫힌다(fine[Pts-1]=fine[0]). depth는 슬롯 균일(얇은 라인이라 충분).
        /// </summary>
        void BuildRing(
            int n, bool closed, float halfW, float depth, int slot,
            bool vp = false, bool warpedImage = false)
        {
            if (n < 2) { CollapseSlot(slot); return; }

            var segs = closed ? n : n - 1;
            for (var i = 0; i < Pts; i++)
            {
                var s = i / (float)(Pts - 1) * segs;
                var k = Mathf.FloorToInt(s);
                if (k >= segs) k = segs - 1;
                var t = s - k;
                Vector2 p0, p1, p2, p3;
                if (closed)
                {
                    p0 = _ctrl[(k - 1 + n) % n]; p1 = _ctrl[k % n];
                    p2 = _ctrl[(k + 1) % n]; p3 = _ctrl[(k + 2) % n];
                }
                else
                {
                    p0 = _ctrl[Mathf.Max(k - 1, 0)]; p1 = _ctrl[k];
                    p2 = _ctrl[Mathf.Min(k + 1, n - 1)]; p3 = _ctrl[Mathf.Min(k + 2, n - 1)];
                }
                _fine[i] = CatmullRom(p0, p1, p2, p3, t);
            }

            var b = slot * Pts * 2;
            for (var i = 0; i < Pts; i++)
            {
                var prev = _fine[Mathf.Max(i - 1, 0)];
                var next = _fine[Mathf.Min(i + 1, Pts - 1)];
                var tangent = (next - prev);
                if (tangent.sqrMagnitude < 1e-10f) tangent = Vector2.right;
                tangent.Normalize();
                var normal = new Vector2(-tangent.y, tangent.x);
                if (vp) // _ctrl가 뷰포트 좌표(하이라이터 UV 투영) — ImageToViewport 건너뜀
                {
                    _vertices[b + 2 * i] = _camera.ViewportToWorldPoint(
                        new Vector3(_fine[i].x + normal.x * halfW, _fine[i].y + normal.y * halfW, depth));
                    _vertices[b + 2 * i + 1] = _camera.ViewportToWorldPoint(
                        new Vector3(_fine[i].x - normal.x * halfW, _fine[i].y - normal.y * halfW, depth));
                }
                else
                {
                    _vertices[b + 2 * i] = ImageToWorld(
                        _fine[i] + normal * halfW, depth, warpedImage);
                    _vertices[b + 2 * i + 1] = ImageToWorld(
                        _fine[i] - normal * halfW, depth, warpedImage);
                }
            }
        }

        void CollapseSlot(int slot)
        {
            var b = slot * Pts * 2;
            for (var i = 0; i < Pts * 2; i++) _vertices[b + i] = Vector3.zero;
        }

        float DepthOfIndices(Vector3[] lm, int[] idx)
        {
            var z = 0f;
            for (var i = 0; i < idx.Length; i++) z += lm[idx[i]].z;
            return Depth(z / idx.Length);
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 img, float depth, bool alreadyWarped = false)
        {
            var vp = alreadyWarped
                ? FramePresenter.Instance.WarpedImageToViewport(img)
                : FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }

        // ── A17 온페이스 핏 핸들 ──

        /// <summary>온페이스 핏 핸들(A17) 좌표 방출 on/off. 가이드(setStencil)와 독립.</summary>
        public void SetFitHandlesEnabled(bool on)
        {
            _fitHandlesEnabled = on;
            if (!on) _fhFrame = 0;
        }

        /// <summary>A17 — FitHandleInterval 프레임마다 모든 모양 결정 핸들의 뷰포트 좌표와
        /// 눈꼬리간 거리(eyeVp)를 RN으로 방출한다. 가이드 슬롯 on/off와 무관하게 좌표를
        /// 독립 계산(핸들만 켜도 나와야 함). 마스크 존은 현재 핏 값을 매번 적용해 해석한다.</summary>
        void EmitFitHandles(Vector3[] lm)
        {
            if (_fhFrame++ % FitHandleInterval != 0) return;

            var mesh = CanonicalFaceMesh.Instance;
            if (mesh == null || !mesh.TopologyReady) return;

            // 부위 앵커 전수(§5 A17 v2 — "6개 가지고 뭘 하겠냐" 확장). RN이 현재 룩의
            // 겹 수만큼 점을 펼치고(겹마다 점) 룩에 없는 부위는 필터하므로, Unity는
            // 모든 앵커를 방출한다. 리스트 할당은 6프레임당 1회라 무해.
            var list = new System.Collections.Generic.List<FitHandle>(32);
            void Add(string key, Vector2 vp)
            {
                if (vp == Vector2.zero) return; // 해석 실패 앵커는 생략
                list.Add(new FitHandle { key = key, x = vp.x, y = vp.y });
            }
            Vector2 ToVp(Vector2 img) => FramePresenter.Instance.ImageToViewport(img);

            // 마스크 존 L/R — 셰이더의 역샘플 워프와 같은 +lift/+outward 표시 좌표.
            // 프리셋이 바뀌는 블러셔도 현재 첫 두 볼 존을 매 방출 시 resolve해 stale 캐시 없음.
            var blushZones = _blushShape == 1 ? BlushIgari : _blushShape == 2 ? BlushDrape : BlushClassic;
            Add("blushL", MaskZoneHandleVp(mesh, blushZones[0], _blushLift, _blushSpread));
            Add("blushR", MaskZoneHandleVp(mesh, blushZones[1], _blushLift, _blushSpread));
            if (_customHl == null)
            {
                Add("highlightL", MaskZoneHandleVp(mesh, _hlZones[0], _highlightLift, _highlightSpread));
                Add("highlightR", MaskZoneHandleVp(mesh, _hlZones[1], _highlightLift, _highlightSpread));
            }
            else
            {
                if (_customHlHasL) Add("highlightL",
                    MaskZoneHandleVp(mesh, _customHlCenterL, _highlightLift, _highlightSpread));
                if (_customHlHasR) Add("highlightR",
                    MaskZoneHandleVp(mesh, _customHlCenterR, _highlightLift, _highlightSpread));
            }
            if (_customCt == null)
            {
                Add("contourL", MaskZoneHandleVp(mesh, ContourZones[0], _contourLift, _contourSpread));
                Add("contourR", MaskZoneHandleVp(mesh, ContourZones[1], _contourLift, _contourSpread));
            }
            else
            {
                if (_customCtHasL) Add("contourL",
                    MaskZoneHandleVp(mesh, _customCtCenterL, _contourLift, _contourSpread));
                if (_customCtHasR) Add("contourR",
                    MaskZoneHandleVp(mesh, _customCtCenterR, _contourLift, _contourSpread));
            }

            // 눈 부위 앵커 — e=1(EyeOuterL=263)=L, e=0(EyeOuterR=33)=R (const 규약).
            var irisRenderer = IrisRenderer.Instance;
            var aegyoRenderer = AegyoRenderer.Instance;
            for (var e = 0; e < 2; e++)
            {
                var side = e == 1 ? "L" : "R";
                var wingVp = Vector2.zero;
                var thicknessVp = Vector2.zero;
                var innerVp = Vector2.zero;
                var haveEyeliner = irisRenderer != null && irisRenderer.TryGetEyelinerFitHandles(
                    e, out wingVp, out thicknessVp, out innerVp);
                Add("wing" + side, haveEyeliner ? wingVp : WingTipVp(lm, e));
                Add("eyelinerThickness" + side,
                    haveEyeliner ? thicknessVp : EyelinerThicknessHandleVp(lm, e));
                Add("eyelinerInner" + side,
                    haveEyeliner ? innerVp : EyelinerInnerHandleVp(lm, e));

                var aegyoVp = Vector2.zero;
                if (aegyoRenderer != null &&
                    aegyoRenderer.TryGetAegyoFitHandle(e, out aegyoVp))
                    Add("aegyo" + side, aegyoVp);
                else
                    Add("aegyo" + side, ToVp(AegyoCenterImg(lm, e)));

                // 하안검 밴드 3부위 — 렌더러 실제 밴드점 우선, 비활성 시 라인 기준 v 오프셋 폴백.
                var linerLowerVp = Vector2.zero;
                if (lowerLidRenderer != null &&
                    lowerLidRenderer.TryGetEyelinerLowerFitHandle(e, out linerLowerVp))
                    Add("eyelinerLower" + side, linerLowerVp);
                else
                    Add("eyelinerLower" + side, ToVp(LowerBandImg(lm, e, 0.5f, 0.10f)));
                var shadowLowerVp = Vector2.zero;
                if (lowerLidRenderer != null &&
                    lowerLidRenderer.TryGetEyeshadowLowerFitHandle(e, out shadowLowerVp))
                    Add("eyeshadowLower" + side, shadowLowerVp);
                else
                    Add("eyeshadowLower" + side, ToVp(LowerBandImg(lm, e, 0.5f, 0.25f)));
                var triZoneVp = Vector2.zero;
                if (lowerLidRenderer != null &&
                    lowerLidRenderer.TryGetTriangleZoneFitHandle(e, out triZoneVp))
                    Add("triangleZone" + side, triZoneVp);
                else
                    Add("triangleZone" + side, ToVp(LowerBandImg(lm, e, 0.85f, 0.25f)));
                var lids = UpperLids[e];
                var np = lids.Length;
                var lidMid = ImgPt(lm, lids[np / 2]);
                var eyeW = (ImgPt(lm, lids[np - 1]) - ImgPt(lm, lids[0])).magnitude;
                var up = (ImgPt(lm, EyeBrowLower[e][2]) - lidMid).normalized;
                // 실제 메시의 안정된 lash 하단 중앙을 우선 사용한다. 렌더러가 비활성이라
                // 캐시가 없을 때만 height=1 기준으로 폴백해 자기참조를 만들지 않는다.
                var shadowVp = Vector2.zero;
                var haveShadow = irisRenderer != null &&
                                 irisRenderer.TryGetEyeshadowFitHandle(e, out shadowVp);
                Add("eyeshadow" + side, haveShadow
                    ? shadowVp
                    : ToVp(lidMid + up * (eyeW * ShadowCreaseFactor * 0.55f)));
                Add("doubleLid" + side, ToVp(lidMid + up * (eyeW * 0.16f)));
                Add("mascara" + side, ToVp(lidMid + up * (eyeW * 0.06f)));
                var low = LowerLids[e];
                var lowMid = ImgPt(lm, low[low.Length / 2]);
                Add("lowerMascara" + side, ToVp(lowMid - up * (eyeW * 0.10f)));
                BrowHandleVps(lm, e, out var browCenter, out var browUpper);
                Add("brow" + side, browCenter);
                Add("browThickness" + side, browUpper);
            }

            // 립 — 오버립은 실제 윗외곽, 라이너는 그 외곽에서 현재 폭의 절반만큼 안쪽인
            // 밴드 중심. 같은 부위 안에 있으면서 두 핸들이 겹치지 않는다.
            var lipOuter = Vector2.zero;
            var lipLiner = Vector2.zero;
            var lipRenderer = LipRenderer.Instance;
            if (lipRenderer == null || !lipRenderer.TryGetLipFitHandles(out lipOuter, out lipLiner))
                LipHandleVps(lm, out lipOuter, out lipLiner);
            Add("lip", lipOuter);
            Add("lipLiner", lipLiner);
            // 립 베이스·글로스 오버라인 핸들 — 립 외곽과 같은 지점(신규 계산 없이 재사용).
            Add("lipBase", lipOuter);
            Add("lipGloss", lipOuter);

            // 데코 겹 — 오버레이 배치(캐노니컬 UV)를 그대로 투영. 겹마다 진짜 별개 핸들.
            var ovs = MakeupController.CurrentOverlayLayers;
            if (ovs != null)
            {
                for (var i = 0; i < ovs.Length && i < 4; i++)
                {
                    var o = ovs[i];
                    if (o == null || string.IsNullOrEmpty(o.path)) continue;
                    if (!mesh.TryResolveUv(new Vector2(o.x, o.y), out var a, out var b, out var c,
                            out var bary)) continue;
                    Add("deco" + i,
                        bary.x * mesh.ViewportOfVertex(a) + bary.y * mesh.ViewportOfVertex(b)
                        + bary.z * mesh.ViewportOfVertex(c));
                }
            }

            var eyeVp = (mesh.ViewportOfVertex(EyeOuterL) - mesh.ViewportOfVertex(EyeOuterR)).magnitude;
            NativeBridge.Send(new UnityToRNMessage
            { type = "fitHandles", handles = list.ToArray(), eyeVp = eyeVp });
        }

        // 캐노니컬 마스크 존 중심 c를 실제 표시점 q로 역산한다. 셰이더는 표시점에서
        // c = q + sampleSign*spread*W(q)를 샘플하므로 W를 c가 아닌 갱신 중인 q로 평가해야
        // 한다. inward만 0.5 완화한 fixed-point 5회 + 얼굴 반쪽 경계 clamp로 발산을 막는다.
        static Vector2 SourceMaskUvToDisplayUv(Vector2 sourceUv, float lift, float spread)
        {
            var displayUv = sourceUv;
            displayUv.y += lift;
            var sourceX = sourceUv.x;
            var outwardSign = sourceX < 0.5f ? -1f : sourceX > 0.5f ? 1f : 0f;
            var displayX = sourceX;
            if (outwardSign != 0f)
            {
                var lo = outwardSign < 0f ? 0f : 0.5f;
                var hi = outwardSign < 0f ? 0.5f : 1f;
                for (var i = 0; i < 5; i++)
                {
                    var st = Mathf.Clamp01(
                        (Mathf.Abs(displayX - 0.5f) - 0.04f) / (0.22f - 0.04f));
                    var spreadW = st * st * (3f - 2f * st);
                    var solved = Mathf.Clamp(sourceX + outwardSign * spread * spreadW, lo, hi);
                    // inward(spread<0)은 W가 작아지는 방향이라 단순 반복이 왕복할 수 있어 완화.
                    // outward는 W가 커지는 단조 방향이므로 완화 없이 빠르게 수렴한다.
                    displayX = Mathf.Lerp(displayX, solved, spread < 0f ? 0.5f : 1f);
                }
            }
            displayUv.x = displayX;
            return displayUv;
        }

        Vector2 MaskZoneHandleVp(CanonicalFaceMesh mesh, Vector4 zone, float lift, float spread)
        {
            return MaskZoneHandleVp(mesh, new Vector2(zone.x, zone.y), lift, spread);
        }

        Vector2 MaskZoneHandleVp(CanonicalFaceMesh mesh, Vector2 sourceUv, float lift, float spread)
        {
            var uv = SourceMaskUvToDisplayUv(sourceUv, lift, spread);
            if (!mesh.TryResolveUv(uv, out var a, out var b, out var c, out var bary))
                return Vector2.zero;
            return bary.x * mesh.ViewportOfVertex(a)
                 + bary.y * mesh.ViewportOfVertex(b)
                 + bary.z * mesh.ViewportOfVertex(c);
        }

        float EyeIsoAspect()
        {
            var iris = IrisRenderer.Instance;
            if (iris != null && iris.TryGetIsoAspect(out var irisAspect)) return irisAspect;
            var aspect = _camera != null ? _camera.aspect : 0f;
            return aspect > 1e-5f && !float.IsNaN(aspect) && !float.IsInfinity(aspect)
                ? aspect
                : 1f;
        }

        Vector2 ImageToIso(Vector2 img)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return new Vector2(vp.x * EyeIsoAspect(), vp.y);
        }

        Vector2 IsoToViewport(Vector2 iso)
        {
            return new Vector2(iso.x / EyeIsoAspect(), iso.y);
        }

        void EyeMetricsIso(Vector3[] lm, int e, out Vector2 centroid, out float radius,
                           out Vector2 browUp)
        {
            var contour = EyeContours[e];
            centroid = Vector2.zero;
            for (var i = 0; i < contour.Length; i++) centroid += ImageToIso(ImgPt(lm, contour[i]));
            centroid /= contour.Length;
            radius = 0f;
            for (var i = 0; i < contour.Length; i++)
                radius += Vector2.Distance(ImageToIso(ImgPt(lm, contour[i])), centroid);
            radius /= contour.Length;
            var brow = Vector2.zero;
            for (var i = 0; i < EyeBrowLower[e].Length; i++)
                brow += ImageToIso(ImgPt(lm, EyeBrowLower[e][i]));
            brow /= EyeBrowLower[e].Length;
            browUp = (brow - centroid).normalized;
        }

        // IrisRenderer가 이번/직전 프레임에 만든 스냅+아크 라인을 우선 사용한다.
        // 비활성·스테일이면 안정 랜드마크로 폴백하되 앞머리 끝 리프트는 동일하게 재현한다.
        Vector2 CurrentLidPointImg(Vector3[] lm, int e, int i)
        {
            var iris = IrisRenderer.Instance;
            if (iris != null && iris.LidSnapFrame == Time.frameCount)
            {
                var snap = iris.GetLidSnap(e);
                if (snap != null && i >= 0 && i < snap.Length) return snap[i];
            }
            if (i == UpperLids[e].Length - 1) return EyelinerInnerFallbackImg(lm, e);
            return ImgPt(lm, UpperLids[e][i]);
        }

        Vector2 LiftedLidIso(Vector3[] lm, int e, int i)
        {
            var lids = UpperLids[e];
            var outer = ImageToIso(CurrentLidPointImg(lm, e, 0));
            var inner = ImageToIso(CurrentLidPointImg(lm, e, lids.Length - 1));
            var mid = ImageToIso(CurrentLidPointImg(lm, e, lids.Length / 2));
            var up = (ImageToIso(ImgPt(lm, EyeBrowLower[e][2])) - mid).normalized;
            var s = 1f - i / (float)(lids.Length - 1); // 0=앞머리, 1=바깥꼬리
            return EyeWarp.LiftCorner(
                ImageToIso(CurrentLidPointImg(lm, e, i)), s, up,
                Vector2.Distance(outer, inner), _eyeCornerLift);
        }

        // 실제 IrisRenderer 윙: 리프트된 코너 + 눈 윤곽 eyeRadius × 스타일 길이.
        Vector2 WingTipVp(Vector3[] lm, int e)
        {
            EyeMetricsIso(lm, e, out var centroid, out var eyeRadius, out var browUp);
            var corner = LiftedLidIso(lm, e, 0);
            var inner = ImageToIso(ImgPt(lm, UpperLids[e][UpperLids[e].Length - 1]));
            var axis = (corner - inner).normalized;
            var u = (browUp - Vector2.Dot(browUp, axis) * axis).normalized;
            var theta = StyleAngleDeg[_eyelinerStyle] * Mathf.Deg2Rad;
            var wingDir = (Mathf.Cos(theta) * axis + Mathf.Sin(theta) * u).normalized;
            var tip = corner + wingDir * (StyleTailLen[_eyelinerStyle] * eyeRadius * _wingLenMult);
            return IsoToViewport(tip);
        }

        // 상안검 중앙의 실제 리본 바깥 경계. 중앙 taper=lerp(1,.3,.5)=.65.
        Vector2 EyelinerThicknessHandleVp(Vector3[] lm, int e)
        {
            EyeMetricsIso(lm, e, out _, out var eyeRadius, out var browUp);
            var mid = UpperLids[e].Length / 2;
            var p = LiftedLidIso(lm, e, mid);
            var tangent = LiftedLidIso(lm, e, mid + 1) - LiftedLidIso(lm, e, mid - 1);
            if (tangent.sqrMagnitude < 1e-12f) tangent = new Vector2(1f, 0f);
            tangent.Normalize();
            var normal = new Vector2(-tangent.y, tangent.x);
            if (Vector2.Dot(normal, browUp) < 0f) normal = -normal;
            var outer = p + normal * (EyelinerThicknessFactor * eyeRadius * _linerThickness * 0.65f);
            return IsoToViewport(outer);
        }

        Vector2 EyelinerInnerHandleVp(Vector3[] lm, int e) =>
            FramePresenter.Instance.ImageToViewport(
                CurrentLidPointImg(lm, e, UpperLids[e].Length - 1));

        Vector2 EyelinerInnerFallbackImg(Vector3[] lm, int e)
        {
            var lids = UpperLids[e];
            var i = lids.Length - 1;
            var p = ImgPt(lm, lids[i]);
            var tangent = p - ImgPt(lm, lids[i - 1]);
            var normal = new Vector2(-tangent.y, tangent.x).normalized;
            var center = Vector2.zero;
            for (var j = 0; j < EyeContours[e].Length; j++)
                center += ImgPt(lm, EyeContours[e][j]);
            center /= EyeContours[e].Length;
            if (Vector2.Dot(normal, center - p) < 0f) normal = -normal;
            var eyeH = Vector2.Distance(ImgPt(lm, EyeContours[e][4]), ImgPt(lm, EyeContours[e][12]));
            var eyeW = Vector2.Distance(ImgPt(lm, EyeContours[e][0]), ImgPt(lm, EyeContours[e][8]));
            var snapScale = Mathf.Max(eyeH, EyeClosedSnapFloor * eyeW);
            var lift = _innerLiftOverride >= 0f ? _innerLiftOverride : EyelinerInnerLiftDefault;
            return p - normal * (lift * snapScale);
        }

        // BrowRenderer와 같은 ShapeBand→TaperTail→최종 얼굴 워프/안티드룹 순서.
        // brow=중심선(arch), browThickness=상단 경계(현재 두께가 직접 보임).
        void BrowHandleVps(Vector3[] lm, int e, out Vector2 centerVp, out Vector2 upperVp)
        {
            var n = BrowUpper[e].Length;
            for (var i = 0; i < n; i++)
            {
                var lo = ImgPt(lm, BrowLower[e][i]);
                var up = ImgPt(lm, BrowUpper[e][i]);
                var along = i / (float)(n - 1);
                BrowWarp.ShapeBand(ref lo, ref up, along, _browThickness, _browArch, _browShape);
                BrowWarp.TaperTail(ref lo, ref up, along);
                _browLo[i] = lo;
                _browUp[i] = up;
            }
            var warped = BrowWarp.WarpAndLiftDroopingTail(
                _browLo, _browUp, n, lm, FramePresenter.Instance.ImageAspect);
            var mid = n / 2;
            var center = 0.5f * (_browLo[mid] + _browUp[mid]);
            centerVp = warped
                ? FramePresenter.Instance.WarpedImageToViewport(center)
                : FramePresenter.Instance.ImageToViewport(center);
            upperVp = warped
                ? FramePresenter.Instance.WarpedImageToViewport(_browUp[mid])
                : FramePresenter.Instance.ImageToViewport(_browUp[mid]);
        }

        // LipRenderer의 결정론적 윗입술 중앙 바이어스·오버라인·라이너 폭을 재현한다.
        // 픽셀 엣지 스냅은 렌더러 내부 EMA라 여기서는 랜드마크 기준으로 안전하게 폴백한다.
        void LipHandleVps(Vector3[] lm, out Vector2 outerVp, out Vector2 linerVp)
        {
            var center = Vector2.zero;
            for (var i = 0; i < LipsOuter.Length; i++)
                center += ImgPt(lm, LipsOuter[i]) + ImgPt(lm, LipsInner[i]);
            center /= LipsOuter.Length * 2f;
            var radius = 0f;
            for (var i = 0; i < LipsOuter.Length; i++)
                radius += Vector2.Distance(ImgPt(lm, LipsOuter[i]), center);
            radius /= LipsOuter.Length;
            var top = ImgPt(lm, 0);
            var outward = (top - center).normalized;
            var outer = top + outward * (radius * (LipUpperOuterBias + _lipOverline * LipMaxOverline));
            var liner = Vector2.Lerp(outer, center, 0.5f * LipLinerWidthFrac * _lipLinerWidth);
            outerVp = FramePresenter.Instance.ImageToViewport(outer);
            linerVp = FramePresenter.Instance.ImageToViewport(liner);
        }

        // 애교살 실제 하이라이트 피크(이미지 좌표). 가이드 외곽 sag 공식과 의도적으로 분리.
        Vector2 AegyoCenterImg(Vector3[] lm, int e)
        {
            var lids = LowerLids[e];
            var np = lids.Length;
            var outer = ImgPt(lm, lids[0]);       // 눈꼬리
            var inner = ImgPt(lm, lids[np - 1]);  // 눈앞머리
            var chord = inner - outer;
            var chordDir = chord.normalized;
            var brow = ImgPt(lm, EyeBrowLower[e][2]);
            var lidMid = ImgPt(lm, lids[np / 2]);
            var downRef = (lidMid - brow).normalized;
            var normal = new Vector2(-chordDir.y, chordDir.x);
            if (Vector2.Dot(normal, downRef) < 0f) normal = -normal;
            var dip = Mathf.Max(0f, Vector2.Dot(lidMid - (outer + inner) * 0.5f, normal));
            // LowerLid 밴드 폭(eyeW*.45*height) 안에서 hiAmt 최대 평탄부 중앙 vv=.32.
            var peak = dip + chord.magnitude * AegyoRenderBandFactor
                       * _aegyoHeightMult * AegyoHighlightPeakV;
            return (outer + inner) * 0.5f + normal * peak;
        }

        // 하안검 밴드 임의 (along,v) 점의 이미지 좌표 — 렌더러 캐시가 없을 때의 폴백.
        // along: 0=눈앞머리 → 1=눈꼬리(LowerLidRenderer FitArc 규약), v: lash(0)→밴드하단(1).
        // 밴드 폭 기준은 애교살과 공용(AegyoRenderBandFactor·_aegyoHeightMult).
        Vector2 LowerBandImg(Vector3[] lm, int e, float along, float v)
        {
            var lids = LowerLids[e];
            var np = lids.Length;
            var outer = ImgPt(lm, lids[0]);       // 눈꼬리
            var inner = ImgPt(lm, lids[np - 1]);  // 눈앞머리
            var chord = inner - outer;
            var chordDir = chord.normalized;
            var brow = ImgPt(lm, EyeBrowLower[e][2]);
            var lidMid = ImgPt(lm, lids[np / 2]);
            var downRef = (lidMid - brow).normalized;
            var normal = new Vector2(-chordDir.y, chordDir.x);
            if (Vector2.Dot(normal, downRef) < 0f) normal = -normal;
            var dip = Mathf.Max(0f, Vector2.Dot(lidMid - (outer + inner) * 0.5f, normal));
            var basePt = Vector2.Lerp(inner, outer, along); // 눈앞머리 → 눈꼬리
            var off = dip + chord.magnitude * AegyoRenderBandFactor * _aegyoHeightMult * v;
            return basePt + normal * off;
        }
    }
}
