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
        // 눈썹 아래 라인 — 아이섀도 "위" 방향(눈→눈썹) 판정 기준 (IrisRenderer와 동일 근거).
        static readonly int[][] EyeBrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };
        // 블러셔 존 중심(사과볼 근사) — 좌/우 볼. 실기기 튜닝 대상.
        // 눈 바깥꼬리(전역 스케일 = 안쪽 눈간 거리 기준).
        const int EyeOuterR = 33, EyeOuterL = 263;

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
        static readonly Vector4[] HighlightZones =
        {
            new Vector4(0.305f, 0.42f, 0.078f, 0.058f), // 광대뼈 L
            new Vector4(0.695f, 0.42f, 0.078f, 0.058f), // 광대뼈 R
            new Vector4(0.50f,  0.46f, 0.035f, 0.120f), // 콧대
            new Vector4(0.50f,  0.28f, 0.055f, 0.030f), // 큐피드보우
            new Vector4(0.35f,  0.55f, 0.058f, 0.040f), // 눈썹뼈 L
            new Vector4(0.65f,  0.55f, 0.058f, 0.040f), // 눈썹뼈 R
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
        const int HlZones = 6;
        const int CtZones = 8;
        const int BlMaxZones = 4;
        const int ZoneTotal = HlZones + CtZones + BlMaxZones; // 캐시 크기
        const int BlCache = HlZones + CtZones;                // 블러셔 캐시 시작 존 인덱스
        const int HlPts = 16; // 존 경계 샘플 수

        // ── 슬롯 배치(고정 순서) ──
        // 0=립, 1·2=눈썹, 3·4=아이섀도, 5·6=블러셔(랜드마크·미사용), 7·8=컨투어(랜드마크·미사용),
        // 9·10=아이라인, 11·12=애교살, 13~18=하이라이터, 19~26=컨투어 UV, 27~30=블러셔 UV
        const int MaxStrokes = 31;
        const int S_LIP = 0, S_BROW = 1, S_SHADOW = 3, S_BLUSH = 5, S_CONTOUR = 7,
                  S_LINER = 9, S_AEGYO = 11, S_HL = 13, S_CTZ = 19, S_BLZ = 27;
        const int Pts = 40;      // 스트로크당 리샘플 컬럼 수(외곽 매끈)

        const float RibbonWidthFactor = 0.007f; // 리본 반폭 = 눈간거리 × 이 값 (가이드라인 얇게 — 0.013→0.007)
        const float ShadowCreaseFactor = 0.50f; // 아이섀도 존 높이 = 눈 가로폭 × 이 값
        // 아이라인 윙(꼬리) 연장 — EyelinerStyleRenderer와 동일 상수(가이드=실제 라이너 일치).
        // 랜드마크 33/263은 눈 '트임' 꼬리라 뜬 눈에선 실제 라인 꼬리보다 안쪽에서 끝난다.
        const float LinerWingFactor = 0.32f; // 윙 연장 = 눈 가로폭 × 이 값(스타일 길이 비율에 곱)
        // 애교살 존 높이 = 눈 가로폭 × 이 값 — LowerLid 밴드(0.45) × 셰이더 밑선(섀도)
        // 페이드 끝(vv 0.82) ≈ 0.37: 하이라이트+밑선을 감싸는 실제 애교살 범위. // 실기기 튜닝 대상
        const float AegyoBandFactor = 0.37f;

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
        float _browThickness = 1f;     // 눈썹 두께 (browThickness)
        float _browArch = 0f;          // 눈썹 아치 (browArch)
        int _browShape;                // 눈썹 모양 프리셋 (browShape)
        float _lipOverline;            // 립 오버라인 0..1 (lipOverline)
        int _eyelinerStyle;            // 아이라인 스타일 프리셋 (eyelinerStyle)
        float _blushLift;              // 블러셔 리프트 (blushLift, UV 워프)
        float _blushSpread;            // 블러셔 퍼짐 (blushSpread, UV 워프)
        int _blushShape;               // 블러셔 모양 프리셋 (blushShape: 클래식/이가리/드레이핑)
        int _blushCount;               // 현재 프리셋 존 개수(2~4)
        bool _blushDirty = true;       // 프리셋/리프트/퍼짐 변경 시 재해석 플래그

        // 립/아이라인 스타일 상수 — 실제 렌더러와 동일값(가이드=메이크업 일치).
        const float LipMaxOverline = 0.12f; // LipRenderer.MaxOverline
        static readonly float[] StyleAngleDeg = { 28f, -22f, 0f };  // IrisRenderer와 동일
        static readonly float[] StyleTailLen = { 0.45f, 0.4f, 0.7f };

        // 재사용 버퍼.
        readonly Vector2[] _ctrl = new Vector2[24]; // 최대 컨트롤 점(립 20·아이섀도 18)
        readonly Vector2[] _fine = new Vector2[Pts];
        // 눈썹 밴드 스크래치 — 안티-드룹(BrowWarp.LiftDroopingTail)을 링 조립 전에
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

        // 디자이너 커스텀 마스크(#2 C) — 임포트되면 캐노니컬 타원 대신 이 마스크의 실제
        // 경계를 존 중심에서 레이캐스트 추적. MakeupController.SetRegionMaskFromFile이 통지.
        // 슬롯 규약(MakeupController.MaskRegion): 0=Blush, 1=Highlight, 2=Contour.
        Texture2D _customHl, _customCt, _customBl;

        /// <summary>
        /// 부위 커스텀 마스크 통지(null=기본 마스크 복귀). 해당 그룹 재해석 예약.
        /// 슬롯: 0=블러셔, 1=하이라이터, 2=컨투어(MakeupController.MaskRegion과 동일).
        /// </summary>
        public void SetCustomMask(int slot, Texture2D mask)
        {
            switch (slot)
            {
                case 0: _customBl = mask; _blushDirty = true; break;
                case 1: _customHl = mask; _hlDirty = true; break;
                case 2: _customCt = mask; _ctDirty = true; break;
            }
        }

        static readonly int OpacityId = Shader.PropertyToID("_Opacity");
        static readonly int PulseId = Shader.PropertyToID("_Pulse");
        static readonly int DashId = Shader.PropertyToID("_Dash");

        // ── A17 온페이스 핏 핸들 (좌표 방출; 터치는 RN 소관) ──
        // 가이드(setStencil) on/off와 독립. 켜져 있으면 트래킹 중 FitHandleInterval 프레임마다
        // 6종 핸들(블러셔·윙·애교살 좌/우)의 뷰포트 좌표 + 눈꼬리간 거리(eyeVp)를 방출.
        const int FitHandleInterval = 6;
        bool _fitHandlesEnabled;
        int _fhFrame;
        // 블러셔 두 존 중심(캐노니컬 UV) → (정점3·bary) 1회 해석 캐시. 매회 뷰포트 bary 보간.
        readonly int[] _fhBlA = new int[2];
        readonly int[] _fhBlB = new int[2];
        readonly int[] _fhBlC = new int[2];
        readonly Vector3[] _fhBlBary = new Vector3[2];
        readonly bool[] _fhBlOk = new bool[2];
        bool _fhBlResolved;

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
            // 눈썹 — BrowRenderer와 동일 클램프. 가이드가 BrowWarp.ShapeBand로 실제 눈썹 일치.
            _browThickness = Mathf.Clamp(p.browThickness, 0.4f, 2f);
            _browArch = Mathf.Clamp(p.browArch, 0f, 1f);
            _browShape = p.browShape;
            _lipOverline = Mathf.Clamp01(p.lipOverline);
            _eyelinerStyle = Mathf.Clamp(p.eyelinerStyle, 0, StyleAngleDeg.Length - 1);
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
            // A17 온페이스 핏 핸들 — 가이드 슬롯 on/off와 독립. 트래킹 중이면 6프레임마다 좌표 방출.
            if (_fitHandlesEnabled && tracking) EmitFitHandles(_source.Landmarks);
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
                // 상·하단 쌍을 함께 셰이핑(ShapeBand: 두 엣지 이동) 후 안티-드룹 적용 →
                // 링 정점으로 조립. 제품 렌더러(BrowRenderer 등)와 동일 순서라 가이드 일치.
                for (var i = 0; i < m; i++)
                {
                    var loP = ImgPt(lm, lowr[i]);
                    var upP = ImgPt(lm, up[i]);
                    BrowWarp.ShapeBand(
                        ref loP, ref upP, i / (float)(m - 1), _browThickness, _browArch, _browShape);
                    _browLo[i] = loP;
                    _browUp[i] = upP;
                }
                BrowWarp.LiftDroopingTail(_browLo, _browUp, m); // 꼬리 안티-드룹(제품과 동일)
                // 상단 정순 [0..m-1] + 하단 역순 [2m-1..m] = 닫힌 외곽 링.
                for (var i = 0; i < m; i++)
                {
                    _ctrl[i] = _browUp[i];
                    _ctrl[2 * m - 1 - i] = _browLo[i];
                }
                BuildRing(2 * m, true, halfW, DepthOfIndices(lm, up), S_BROW + e);
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
                    if (_hlDirty) { ResolveGroup(mesh, HighlightZones, HlZones, 0, _customHl); _hlDirty = false; }
                    if (_ctDirty) { ResolveGroup(mesh, ContourZones, CtZones, HlZones, _customCt); _ctDirty = false; }
                    if (_blushDirty) ResolveBlush(mesh); // 프리셋/리프트/퍼짐/커스텀 변경 시만
                    var eyeVp = (mesh.ViewportOfVertex(EyeOuterL) - mesh.ViewportOfVertex(EyeOuterR)).magnitude;
                    var halfWVp = eyeVp * RibbonWidthFactor;
                    var zDepth = Depth(lm[1].z);
                    DrawZones(mesh, 0, HlZones, S_HL, halfWVp, zDepth);           // 하이라이터
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
        void ResolveGroup(CanonicalFaceMesh mesh, Vector4[] zones, int count, int cacheZ0, Texture2D customMask)
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
                        var uv = center + edge * (1f - s * 0.2f);
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
        void BuildRing(int n, bool closed, float halfW, float depth, int slot, bool vp = false)
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
                    _vertices[b + 2 * i] = ImageToWorld(_fine[i] + normal * halfW, depth);
                    _vertices[b + 2 * i + 1] = ImageToWorld(_fine[i] - normal * halfW, depth);
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

        Vector3 ImageToWorld(Vector2 img, float depth)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }

        // ── A17 온페이스 핏 핸들 ──

        /// <summary>온페이스 핏 핸들(A17) 좌표 방출 on/off. 가이드(setStencil)와 독립.
        /// 끄면 프레임 카운터·블러셔 캐시를 리셋(재획득/메시 재초기화 대비).</summary>
        public void SetFitHandlesEnabled(bool on)
        {
            _fitHandlesEnabled = on;
            if (!on) { _fhFrame = 0; _fhBlResolved = false; }
        }

        /// <summary>A17 — FitHandleInterval 프레임마다 핏 핸들 6종의 뷰포트 좌표와 눈꼬리간
        /// 뷰포트 거리(eyeVp)를 RN으로 방출한다. 가이드 슬롯 on/off와 무관하게 좌표를 독립
        /// 계산(핸들만 켜도 나와야 함). 캐노니컬 메시가 준비돼야 블러셔 존·eyeVp 해석 가능.</summary>
        void EmitFitHandles(Vector3[] lm)
        {
            if (_fhFrame++ % FitHandleInterval != 0) return;

            var mesh = CanonicalFaceMesh.Instance;
            if (mesh == null || !mesh.TopologyReady) return;

            // 블러셔 두 존 중심(캐노니컬 UV) 1회 해석 → 매회 뷰포트 bary 보간(DrawZones 패턴).
            if (!_fhBlResolved)
            {
                for (var z = 0; z < 2; z++)
                {
                    var c = new Vector2(BlushClassic[z].x, BlushClassic[z].y);
                    _fhBlOk[z] = mesh.TryResolveUv(
                        c, out _fhBlA[z], out _fhBlB[z], out _fhBlC[z], out _fhBlBary[z]);
                }
                _fhBlResolved = true;
            }

            // 부위 앵커 전수(§5 A17 v2 — "6개 가지고 뭘 하겠냐" 확장). RN이 현재 룩의
            // 겹 수만큼 점을 펼치고(겹마다 점) 룩에 없는 부위는 필터하므로, Unity는
            // 모든 앵커를 방출한다. 리스트 할당은 6프레임당 1회라 무해.
            var list = new System.Collections.Generic.List<FitHandle>(20);
            void Add(string key, Vector2 vp)
            {
                if (vp == Vector2.zero) return; // 해석 실패 앵커는 생략
                list.Add(new FitHandle { key = key, x = vp.x, y = vp.y });
            }
            Vector2 ToVp(Vector2 img) => FramePresenter.Instance.ImageToViewport(img);

            // 블러셔 L/R — 캐노니컬 x 낮음=L·높음=R (HighlightZones 라벨 규약).
            Add("blushL", BlushHandleVp(mesh, 0));
            Add("blushR", BlushHandleVp(mesh, 1));
            // 눈 부위 앵커 — e=1(EyeOuterL=263)=L, e=0(EyeOuterR=33)=R (const 규약).
            for (var e = 0; e < 2; e++)
            {
                var side = e == 1 ? "L" : "R";
                Add("wing" + side, ToVp(WingTipImg(lm, e)));
                Add("aegyo" + side, ToVp(AegyoCenterImg(lm, e)));
                var lids = UpperLids[e];
                var np = lids.Length;
                var lidMid = ImgPt(lm, lids[np / 2]);
                var eyeW = (ImgPt(lm, lids[np - 1]) - ImgPt(lm, lids[0])).magnitude;
                var up = (ImgPt(lm, EyeBrowLower[e][2]) - lidMid).normalized;
                // 앵커 오프셋 배수는 근사(드래그는 델타만 쓰므로 정확도 불필요) // 실기기 튜닝 대상
                Add("eyeshadow" + side,
                    ToVp(lidMid + up * (eyeW * ShadowCreaseFactor * 0.55f * _shadowHeightMult)));
                Add("doubleLid" + side, ToVp(lidMid + up * (eyeW * 0.16f)));
                Add("mascara" + side, ToVp(lidMid + up * (eyeW * 0.06f)));
                var low = LowerLids[e];
                var lowMid = ImgPt(lm, low[low.Length / 2]);
                Add("lowerMascara" + side, ToVp(lowMid - up * (eyeW * 0.10f)));
                Add("brow" + side, ToVp(ImgPt(lm, BrowUpper[e][2])));
            }
            // 립(오버립) — 윗입술 중앙(랜드마크 0), 입 높이만큼 살짝 위.
            var lipTop = ImgPt(lm, 0);
            var lipUp = (lipTop - ImgPt(lm, 17));
            Add("lip", ToVp(lipTop + lipUp.normalized * (lipUp.magnitude * 0.25f)));
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

        // 블러셔 존 중심(캐시 z) → 현재 뷰포트(정점3 bary 보간, DrawZones 패턴).
        Vector2 BlushHandleVp(CanonicalFaceMesh mesh, int z)
        {
            if (!_fhBlOk[z]) return Vector2.zero;
            return _fhBlBary[z].x * mesh.ViewportOfVertex(_fhBlA[z])
                 + _fhBlBary[z].y * mesh.ViewportOfVertex(_fhBlB[z])
                 + _fhBlBary[z].z * mesh.ViewportOfVertex(_fhBlC[z]);
        }

        // 아이라인 윙 끝점(이미지 좌표) — 아이라인 렌더 블록과 동일 계산. 핸들용 독립 산출.
        Vector2 WingTipImg(Vector3[] lm, int e)
        {
            var lids = UpperLids[e];
            var np = lids.Length;
            var innerHead = ImgPt(lm, lids[np - 1]); // 안쪽 눈머리
            var outerTail = ImgPt(lm, lids[0]);      // 바깥 꼬리
            var prevTail = ImgPt(lm, lids[1]);       // 꼬리 직전
            var eyeW = (innerHead - outerTail).magnitude;
            var lidMid = ImgPt(lm, lids[np / 2]);
            var up = (ImgPt(lm, EyeBrowLower[e][2]) - lidMid).normalized;   // 눈→눈썹
            var axis = (outerTail - prevTail).normalized;                  // 바깥 방향
            var u = (up - Vector2.Dot(up, axis) * axis).normalized;        // axis 수직 "위"
            var theta = StyleAngleDeg[_eyelinerStyle] * Mathf.Deg2Rad;
            var wingDir = (Mathf.Cos(theta) * axis + Mathf.Sin(theta) * u).normalized;
            var wingLen = eyeW * LinerWingFactor * _wingLenMult
                          * (StyleTailLen[_eyelinerStyle] / StyleTailLen[0]);
            return outerTail + wingDir * wingLen;
        }

        // 애교살 스트로크 중앙점(이미지 좌표) — 밑 아크 t=0.5 정점(애교살 렌더 블록과 동일). 핸들용 독립 산출.
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
            var sag = dip + chord.magnitude * AegyoBandFactor * _aegyoHeightMult;
            // 밑 아크 t=0.5: outer + chord*0.5 + normal*(4*sag*0.25) = 현 중점 + normal*sag.
            return (outer + inner) * 0.5f + normal * sag;
        }
    }
}
