using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 마스카라(속눈썹) — PencilRenderer의 절차적 스트로크 모델을 lash 파라미터로
    /// 일반화한 것(설계 섹션 12 step 4). 상안검 lash 라인을 밴드 삼아 위·바깥으로
    /// 뻗는 가는 테이퍼 쿼드(속눈썹)를 뿌린다.
    ///
    /// 결 방향: 앞머리(안쪽)는 거의 수직, 바깥 눈꼬리로 갈수록 바깥 스윕(부챗살) —
    /// 펜슬과 동일 모델, 계수만 lash용. 결정론적 해시로 위치·길이·각도를 흔들어
    /// 자연스럽게(시드 고정이라 프레임 간 안 떨림). Pencil.shader 재사용(루마 보존).
    ///
    /// 눈꼬리 띄우기(eyeCornerLift)를 다른 눈 제품과 동일하게 적용 — 리프트 시
    /// 라이너·섀도와 함께 속눈썹도 올라간다. MediaPipe 경로 전용.
    ///
    /// 아래 속눈썹(lowerLashIntensity)도 이 파일의 분기로 그린다 — 스트로크 모델
    /// (테이퍼 쿼드·결정론 해시 변이·부챗살 스윕·아크 리샘플)이 위 속눈썹과 동일해
    /// 새 렌더러면 전부 중복이고, 부트스트랩(ARBootstrap — 타 트랙 사용 중이라 동결)
    /// 배선도 불필요. 위보다 짧고 성기게(자연 기본), 방향만 아래·색은 mascaraColor 공용.
    /// </summary>
    // 실행 순서 +10: IrisRenderer(-10)의 LidSnap 소비자 — 스냅 생산 뒤에 돌아 같은
    // 프레임 값을 읽는다. LidSnapFrame 스테일 허용 가드는 안전망으로 유지.
    [DefaultExecutionOrder(10)]
    public class LashRenderer : MonoBehaviour
    {
        public static LashRenderer Instance { get; private set; }

        // 상안검 lash 라인: 바깥 눈꼬리 → 안쪽 눈머리 (EyelinerStyleRenderer와 동일).
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };
        // 하안검 lash 라인: 바깥 눈꼬리 → 안쪽 눈머리.
        // 출처: LowerLidRenderer.LowerLids 복사 — 공유 상수 승격은 타 트랙과 충돌
        // 위험해 보류(값 변경 시 두 곳 동기 필요).
        static readonly int[][] LowerLids =
        {
            new[] { 33, 7, 163, 144, 145, 153, 154, 155, 133 },
            new[] { 263, 249, 390, 373, 374, 380, 381, 382, 362 },
        };
        // 눈썹 하단 — "위" 방향 기준(눈 감아도 부호 안정).
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };

        const int Eyes = 2;
        const int LidPts = 9;
        const int Sub = 2;
        const int Seg = (LidPts - 1) * (Sub + 1) + 1; // 25

        const int LashesPerEye = 24;
        const float LenFactor = 0.115f;  // 속눈썹 길이 = 눈 가로폭 × 이 값
        const float WidthMult = 0.032f;  // 길이 대비 뿌리 폭
        // 컬 0 = 직선. 볼록 아크 방식은 찌그러져(실기기) 폐기 — 깨끗한 컬은 속눈썹 텍스처
        // 에셋으로 별도 구현 예정. 그때까진 직선이 낫다(사용자 요청).
        const float UpperCurl = 0f;      // 위 속눈썹 컬(0=직선)
        const float LowerCurl = 0f;      // 아래 속눈썹 컬(0=직선)
        // 부챗살 대칭 규약: 앞머리(u=0)=코쪽(앞, 음수), 중앙(u=0.5)=수직(0), 눈꼬리(u=1)=
        // 뒤쪽(양수). |SweepMin|=|SweepMax|라 0 교차가 정확히 중앙에 와서 중앙이 수직으로
        // 선다(비대칭이면 전체가 한쪽으로 쏠려 "전부 뒷방향" 인상 — 실기기). 스타일별로
        // StyleProfile이 이 기본 부챗살을 배수/바이어스한다(캣아이만 전 구간 꼬리 쏠림).
        const float SweepMax = 0.4f;     // 눈꼬리쪽(뒤)
        const float SweepMin = -0.4f;    // 앞머리쪽(앞) — 대칭
        const float SweepJitter = 0.18f;
        const float LocalNormalBlend = 0.28f;
        const float OpenEyeMinUpDot = 0.42f;
        const float RootLiftImg = 0.08f; // 상안검 높이 대비, 마스카라 전용 뿌리선 브로우쪽 보정
        const float EdgeFade = 0.06f;    // 양끝(코너) 근처 길이 테이퍼 구간

        // 아래 속눈썹 — 위보다 짧고 성기게(자연 기본). 폭·엣지 테이퍼는 위와 공유.
        const float LowerRootDrop = 0.06f;    // 아래 속눈썹 뿌리를 하안검보다 아래로(눈폭 배수) 실기기 튜닝 대상
        const int LowerLashesPerEye = 14;     // 개수 (위보다 성기게) // 실기기 튜닝 대상
        const float LowerLenFactor = 0.07f;   // 길이 = 눈 가로폭 × 이 값 (위보다 짧게) // 실기기 튜닝 대상
        const float LowerSweepMax = 0.7f;     // 바깥 눈꼬리 스윕 (위 0.9보다 완만) // 실기기 튜닝 대상
        const float LowerSweepMin = -0.25f;   // 앞머리는 살짝 코쪽(위 SweepMin과 동일 근거) // 실기기 튜닝 대상
        // 위 속눈썹과 다른 변이 패턴을 얻기 위한 해시 시드 오프셋(위: 0..2*28-1 사용).
        const int LowerSeedOffset = 1000;

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _cornerLift; // 눈꼬리 띄우기(R7 워프) — 라이너·섀도와 동일 정규화 리프트
        float _lengthMult = 1f; // 속눈썹 길이 배수 핸들 (1=원래)
        int _style;             // 모양: 0=내추럴 1=돌리 2=캣아이 3=오픈아이 4=위스피
        // 아래 속눈썹 — 전용 메시/머티리얼(강도·길이 독립, 색은 mascaraColor 공용).
        Mesh _lowerMesh;
        MeshRenderer _lowerRenderer;
        Material _lowerMaterial;
        Vector3[] _lowerVertices;
        float _lowerIntensity;
        float _lowerLengthMult = 1f; // 아래 속눈썹 길이 배수 (mascaraLength와 독립)
        int _lowerStyle;             // 아래 속눈썹 모양 — 위와 같은 5종, 값 독립

        static readonly int ColorId = Shader.PropertyToID("_BrowColor");
        static readonly int IntensityId = Shader.PropertyToID("_BrowIntensity");
        static readonly int FinishId = Shader.PropertyToID("_PencilFinish"); // 마감(Tier B) — 위·아래 머티리얼 독립
        static readonly int MainTexId = Shader.PropertyToID("_MainTex");

        // 텍스처 속눈썹(리본) — 절차 쿼드의 대안. mascaraTexStyle>0이면 절차 대신 활성.
        // 상안검 lash 라인을 따라 리본을 세우고 곡선 스트로크 PNG(lash_natural/volume)를 매핑한다.
        const int RibbonCols = Seg;          // 리본 세로 컬럼 수 = lash 라인 점 수(25)
        const float RibbonLenMult = 1.5f;    // 리본 높이 배수(텍스처 결이 다 보이게 절차보다 김) — 실기기 튜닝
        // 리본 뿌리 턱 — 랜드마크 체인과 육안 래시라인 사이 슬리버(피부 띠) 제거용.
        // 뿌리를 눈쪽(브로우 반대)으로 눈폭 대비 이 비율만큼 내려 라이너 밑으로 파고들게 한다.
        const float RibbonRootTuck = 0.008f; // 실기기 튜닝 대상 (0.02는 눈알 침범 — 사용자 판정)
        // 아래 리본 뿌리 리프트 — 0.03은 상하 반전 텍스처 시절 튜닝값. 방향 규약(뿌리=v0) 수정 후
        // 털 뿌리가 눈알 위로 올라가는 침범이 생겨 위 리본 RootTuck 수준으로 축소 (사용자 침범 판정).
        const float LowerRibbonLift = 0.008f;
        // 아래 텍스처 리본 전용 기본 비례 — 절차식(LowerLenFactor 0.07)과 독립.
        // 0.10은 화면 ~25px = 128행 텍스처의 5:1 축소로 가는 털 팁이 밉맵에서 침식됨
        // (사용자 "짧고 떡짐" 판정) → 0.15로 상향해 3:1로 완화 + 도안 비례 회복.
        const float LowerTexLenFactor = 0.15f;
        // 뿌리줄 오프셋(리본 확장) — 도안에서 뿌리선 '아래'로 처지는 꼬리 결까지 표현.
        // 텍스처의 뿌리줄은 v=rootV(추출기 lash_extract.py 사이드카 JSON의 rootV)이고,
        // 리본을 눈 라인 밖으로 len×rootV만큼 연장해 그 줄이 정확히 눈 라인에 오게 한다.
        // 재추출 시 사이드카 값으로 갱신할 것(tools/glam2-lash/out/lash_glam_*.json).
        // 위 리본 꼬리 발산 억제(0723 v15 사용자 판정) — 탈출 레일 하향 ≈12° + 끝 기둥 테이퍼.
        const float TailExitDropTan = 0.3f;  // 탈출 방향 하향(tan22°) — 굵은선 기울기(사용자 0723)
        const int TailTaperCols = 10;         // 꼬리쪽(c=0부터) 길이 테이퍼 기둥 수 — 넓고 완만하게
        const float TailTaperMin = 0.7f;    // 맨 끝 기둥 길이 배율 — 가는 아치선 트림 기준(사용자 0723)
        const float TailExitStretch = 1.2f;  // 탈출 구간 간격 배율 — 1.4는 실효 5%뿐, 굵은선 끝(~15% 눈폭)까지
        const float TailSlideFrac = 0.16f;   // 눈 곡선 슬라이드 이동량(눈폭 배수) — 도안 통째 바깥 이동(사용자 0723)
        const int FrontTaperCols = 3;        // 앞머리(안쪽 c 큰 쪽) 테이퍼 기둥 수(사용자 0723)
        const float FrontTaperMin = 0.75f;   // 앞머리 끝 기둥 길이 배율
        // 아래 리본 바깥 끝 가닥 축소(사용자 0723: "가장 바깥 한 가닥 40% 줄이기")
        const int LowerTailTaperCols = 3;    // 바깥쪽(c=0부터) 테이퍼 기둥 수(한 가닥 폭)
        const float LowerTailTaperMin = 0.6f;// 맨 끝 기둥 길이 배율(-40%)
        const float UpperTexRootV = 0.0448f; // 0723 위 초록선(펜연장 32°)+국소 회전 재산출값
        const float LowerTexRootV = 0.1f;    // 0723 급전환(틈 x=3113) 재산출값
        Mesh _texMesh;
        MeshRenderer _texRenderer;
        Material _texMaterial;
        Vector3[] _texVertices;
        int _texStyle;                       // 0=off(절차) 1=natural 2=volume 3=glam
        readonly Texture2D[] _texCache = new Texture2D[4];
        Texture2D _lowerGlamTex;             // 스타일 3 전용 아래 리본 텍스처 (lash_glam_lower)
        bool _lowerTexFromStyle;             // 아래 오버라이드가 스타일 3 자동 장착분인지 (수동 SetLowerTexOverride와 구분)
        // 아래 속눈썹 텍스처 리본 — 위 리본과 동일 구조를 하안검 체인에 세움(끝은 아래로).
        // 오버라이드 텍스처가 설정된 동안 절차 아래 속눈썹을 대체한다(SetLowerTexOverride).
        Mesh _lowerTexMesh;
        MeshRenderer _lowerTexRenderer;
        Material _lowerTexMaterial;
        Vector3[] _lowerTexVertices;
        bool _lowerTexOn;

        readonly Vector2[] _ctrl = new Vector2[LidPts];
        readonly Vector2[] _lash = new Vector2[Seg];
        // 텍스처 리본 컬럼 법선 — 전역 up 단일 방향은 눈꼬리(급커브)에서 기둥-라인 직각이
        // 무너져 텍스처 전단(가닥 일그러짐, 사용자 판정 0723). 라이너와 동일 레시피:
        // ±2 스텐실 접선 + 2패스 스무딩(EyelinerStyleRenderer._nrm 이식).
        readonly Vector2[] _ribNrm = new Vector2[Seg];
        // 눈 곡선 슬라이드용 임시 버퍼 + 탈출 방향(TailTangentExit가 기록)
        readonly Vector2[] _ribTmp = new Vector2[Seg];
        Vector2 _exitDir;
        // 위 텍스처 리본 꼬리 연장용 컨트롤(+1점) — 눈꼬리 너머 스윕 (SODA 판정 반영)
        readonly Vector2[] _ctrlExt = new Vector2[LidPts + 1];
        // 꼬리 연장 비율(눈폭 대비) — 얼굴 무관 스타일 파라미터. 어떤 도안이든 눈길이+α 커버.
        const float UpperTailExt = 0.18f;

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("Pencil");
            if (shader == null) shader = Shader.Find("ARMakeup/Pencil");

            // 위 속눈썹(마스카라) — 이 GO 자체에.
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.Mascara; // 라이너 위에 털
            _mesh = BuildStrokeMesh("Mascara", Eyes * LashesPerEye, out _vertices);
            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;

            // 아래 속눈썹 — 자식 GO. 같은 Pencil 셰이더(루마 보존), 강도·길이 독립이라
            // 전용 머티리얼. 큐는 하안검 밴드(애교살·아이라인 하) 바로 위(LowerLash).
            _lowerMaterial = new Material(shader);
            _lowerMaterial.renderQueue = MakeupQueues.LowerLash;
            _lowerMesh = BuildStrokeMesh("LowerLash", Eyes * LowerLashesPerEye, out _lowerVertices);
            var lowerGO = new GameObject("LowerLash");
            lowerGO.transform.SetParent(transform, false);
            lowerGO.AddComponent<MeshFilter>().sharedMesh = _lowerMesh;
            _lowerRenderer = lowerGO.AddComponent<MeshRenderer>();
            _lowerRenderer.sharedMaterial = _lowerMaterial;
            _lowerRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _lowerRenderer.enabled = false;

            // 텍스처 속눈썹(리본) — 자식 GO. 전용 셰이더(알파 텍스처, 루마 보존 아님).
            var texShader = Resources.Load<Shader>("LashTexture");
            if (texShader == null) texShader = Shader.Find("ARMakeup/LashTexture");
            _texMaterial = new Material(texShader);
            _texMaterial.renderQueue = MakeupQueues.Mascara;
            _texMesh = BuildRibbonMesh("MascaraTex", Eyes, out _texVertices);
            var texGO = new GameObject("MascaraTex");
            texGO.transform.SetParent(transform, false);
            texGO.AddComponent<MeshFilter>().sharedMesh = _texMesh;
            _texRenderer = texGO.AddComponent<MeshRenderer>();
            _texRenderer.sharedMaterial = _texMaterial;
            _texRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _texRenderer.enabled = false;

            // 아래 속눈썹 텍스처 리본 — 위 리본과 같은 셰이더/토폴로지, 하안검 체인 전용.
            _lowerTexMaterial = new Material(texShader);
            _lowerTexMaterial.renderQueue = MakeupQueues.LowerLash;
            _lowerTexMesh = BuildRibbonMesh("LowerLashTex", Eyes, out _lowerTexVertices);
            var lowerTexGO = new GameObject("LowerLashTex");
            lowerTexGO.transform.SetParent(transform, false);
            lowerTexGO.AddComponent<MeshFilter>().sharedMesh = _lowerTexMesh;
            _lowerTexRenderer = lowerTexGO.AddComponent<MeshRenderer>();
            _lowerTexRenderer.sharedMaterial = _lowerTexMaterial;
            _lowerTexRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _lowerTexRenderer.enabled = false;
        }

        /// <summary>아래 속눈썹 텍스처 오버라이드 — null이면 절차 아래 속눈썹으로 복귀.
        /// 색·알파는 절차 아래 머티리얼과 동기(ApplyLowerParams에서 함께 갱신).</summary>
        public void SetLowerTexOverride(Texture2D tex)
        {
            _lowerTexOn = tex != null;
            if (_lowerTexMaterial != null && tex != null)
            {
                tex.wrapMode = TextureWrapMode.Clamp;
                _lowerTexMaterial.SetTexture(MainTexId, tex);
                // 색·알파를 현재 절차 아래 머티리얼과 맞춘다.
                if (_lowerMaterial != null)
                {
                    _lowerTexMaterial.SetColor(ColorId, _lowerMaterial.GetColor(ColorId));
                    _lowerTexMaterial.SetFloat(IntensityId, _lowerMaterial.GetFloat(IntensityId));
                }
            }
        }

        // 텍스처 속눈썹 리본 메시 — 컬럼당 뿌리(v=0)·끝(v=1) 2정점, 눈당 (RibbonCols-1) 쿼드.
        // UV.x(텍스처 가로)=바깥꼬리(1)→안쪽머리(0). PNG는 x=0 머리(수직)·x=1 꼬리(눕힘)이라
        // lash 인덱스 0(바깥)→texU 1, 인덱스 끝(안쪽)→texU 0. 두 눈 모두 동일 매핑 —
        // "texU 증가=바깥"이 각 눈의 자기 바깥쪽이라 결 눕힘이 자동으로 좌우 대칭이 된다.
        /// <summary>꼬리 접선 탈출 — 눈꺼풀 랜드마크 체인은 눈꼬리(인덱스 0 쪽)에서
        /// 코너 최저점을 향해 급강하하는데, 실제 인조속눈썹 밴드는 그 지점에서 라인의
        /// 흐름(접선)대로 곧게 빠져나간다. 라이너 v5 코너 윙과 동일 취지(사용자 확정 형태).
        /// 코너 영향권 밖 접선으로 바깥쪽 점들을 점진 대체(간격 유지 → u 매핑 보존).</summary>
        void TailTangentExit(float dropTan = 0f, float stretch = 1f)
        {
            // v9 실패 교훈(픽셀 diff 270px = 사실상 무변화): ①블렌드가 교정을 희석
            // ②구간(5점)이 급강하 몸통(~8점)보다 짧음 ③접선 측정점(5~8)이 이미 꺾인 구간.
            // → 구간 8점, 접선은 코너 영향권 밖(8~12)에서 측정, 블렌드 없이 통째 교체.
            // dropTan: 탈출 방향 하향 바이어스(+y) — 원본 밴드는 꼬리에서 32~42° 급강하해
            // 클러스터를 낮게 데려가는데 접선 그대로면 출발점이 높아 꼬리가 위로 발산
            // (사용자 판정 0723 v15). 위 리본만 사용, 아래는 0.
            const int Pivot = 8;
            var d = (_lash[Pivot] - _lash[Pivot + 4]).normalized; // 안 꺾인 구간의 진행 방향
            if (dropTan != 0f) d = (d + new Vector2(0f, dropTan)).normalized;
            _exitDir = d; // 슬라이드(SlideAlongChain)의 체인 밖 연장 방향
            for (var i = Pivot - 1; i >= 0; i--)
            {
                // stretch>1이면 간격을 늘려 꼬리가 눈꼬리 너머까지 길게 빠진다(사용자 요청 —
                // "속눈썹이 너무 빨리 사라짐"). 텍스처 u 매핑상 꼬리 내용이 옆으로 완만히 늘어남.
                var step = (_lash[i] - _lash[i + 1]).magnitude * stretch;
                _lash[i] = _lash[i + 1] + d * step;               // 가던 방향(+하향) 직진
            }
        }

        /// <summary>눈 곡선 슬라이드(사용자 0723) — 텍스처는 그대로 두고 기둥 앵커를
        /// 체인 폴리라인을 따라 바깥(꼬리)으로 dist만큼 민다. 구슬을 레일 따라 밀듯이 —
        /// 체인을 벗어나면 탈출 방향(_exitDir)으로 직선 연장. 텍스처 쪽 이동(좌측 패드)은
        /// 종횡비 축소 부작용으로 이동이 상쇄돼 기각(v21 판정).</summary>
        void SlideAlongChain(float dist)
        {
            for (var c = 0; c < Seg; c++) _ribTmp[c] = _lash[c];
            for (var c = 0; c < Seg; c++)
            {
                var remaining = dist;
                var i = c;
                var p = _ribTmp[c];
                while (i > 0 && remaining > 0f)
                {
                    var seg = (_ribTmp[i - 1] - _ribTmp[i]).magnitude;
                    if (remaining <= seg)
                    {
                        p = Vector2.Lerp(_ribTmp[i], _ribTmp[i - 1], remaining / Mathf.Max(seg, 1e-5f));
                        remaining = 0f;
                        break;
                    }
                    remaining -= seg;
                    i--;
                    p = _ribTmp[i];
                }
                if (remaining > 0f) p = _ribTmp[0] + _exitDir * remaining; // 체인 밖 연장
                _lash[c] = p;
            }
        }

        /// <summary>텍스처 리본 컬럼 법선 — _lash 체인에서 ±2 스텐실 접선의 수직을 구해
        /// 2패스 스무딩(라이너 검증 레시피). up 쪽으로 부호 정렬.</summary>
        void SmoothedRibbonNormals(Vector2 up)
        {
            for (var i = 0; i < Seg; i++)
            {
                var a = _lash[Mathf.Max(i - 2, 0)];
                var b = _lash[Mathf.Min(i + 2, Seg - 1)];
                var t = (b - a).normalized;
                var n = new Vector2(-t.y, t.x);
                if (Vector2.Dot(n, up) < 0f) n = -n;
                _ribNrm[i] = n;
            }
            for (var pass = 0; pass < 2; pass++)
                for (var i = 1; i < Seg - 1; i++)
                    _ribNrm[i] = (_ribNrm[i - 1] + _ribNrm[i] * 2f + _ribNrm[i + 1]).normalized;
        }

        static Mesh BuildRibbonMesh(string name, int eyes, out Vector3[] vertices)
        {
            var mesh = new Mesh { name = name };
            mesh.MarkDynamic();
            var vpe = RibbonCols * 2;
            var uvs = new Vector2[eyes * vpe];
            var tris = new int[eyes * (RibbonCols - 1) * 6];
            var ti = 0;
            for (var e = 0; e < eyes; e++)
            {
                var baseV = e * vpe;
                for (var c = 0; c < RibbonCols; c++)
                {
                    var texU = 1f - c / (float)(RibbonCols - 1); // 바깥(c=0)=1=꼬리
                    uvs[baseV + c * 2] = new Vector2(texU, 0f);      // 뿌리
                    uvs[baseV + c * 2 + 1] = new Vector2(texU, 1f);  // 끝
                }
                for (var c = 0; c < RibbonCols - 1; c++)
                {
                    var b0 = baseV + c * 2; var t0 = b0 + 1;
                    var b1 = baseV + (c + 1) * 2; var t1 = b1 + 1;
                    tris[ti++] = b0; tris[ti++] = t0; tris[ti++] = b1;
                    tris[ti++] = b1; tris[ti++] = t0; tris[ti++] = t1;
                }
            }
            vertices = new Vector3[eyes * vpe];
            mesh.vertices = vertices;
            mesh.uv = uvs;
            mesh.triangles = tris;
            return mesh;
        }

        Texture2D LoadLashTex(int style)
        {
            if (style < 1 || style > 3) return null;
            if (_texCache[style] == null)
                _texCache[style] = Resources.Load<Texture2D>(
                    style == 3 ? "lash_glam" : style == 2 ? "lash_volume" : "lash_natural");
            return _texCache[style];
        }

        // 스트로크(3단면 곡선 스트립) 메시 토폴로지 — 위/아래 속눈썹 공용. 뿌리(0)·중간(2)·
        // 끝(4) 세 단면 × 좌우 = 6정점, 2쿼드(4삼각). 직선 쿼드였을 땐 속눈썹이 곧은 스파이크로
        // 보였다(실기기) → 중간 단면을 컬 방향으로 꺾어 곡선(마스카라 컬)을 만든다.
        const int LashVerts = 6;
        static Mesh BuildStrokeMesh(string name, int strokes, out Vector3[] vertices)
        {
            var mesh = new Mesh { name = name };
            mesh.MarkDynamic();

            var uvs = new Vector2[strokes * LashVerts];
            var tris = new int[strokes * 12];
            for (var s = 0; s < strokes; s++)
            {
                var v = s * LashVerts;
                uvs[v] = new Vector2(0f, 0f);       // 뿌리-좌
                uvs[v + 1] = new Vector2(0f, 1f);   // 뿌리-우
                uvs[v + 2] = new Vector2(0.5f, 0f); // 중간-좌
                uvs[v + 3] = new Vector2(0.5f, 1f); // 중간-우
                uvs[v + 4] = new Vector2(1f, 0f);   // 끝-좌
                uvs[v + 5] = new Vector2(1f, 1f);   // 끝-우
                var t = s * 12;
                // 쿼드1 뿌리→중간
                tris[t] = v; tris[t + 1] = v + 2; tris[t + 2] = v + 1;
                tris[t + 3] = v + 1; tris[t + 4] = v + 2; tris[t + 5] = v + 3;
                // 쿼드2 중간→끝
                tris[t + 6] = v + 2; tris[t + 7] = v + 4; tris[t + 8] = v + 3;
                tris[t + 9] = v + 3; tris[t + 10] = v + 4; tris[t + 11] = v + 5;
            }
            vertices = new Vector3[strokes * LashVerts];
            mesh.vertices = vertices;
            mesh.uv = uvs;
            mesh.triangles = tris;
            return mesh;
        }

        /// <summary>마스카라는 더 이상 아이라이너용 스냅 라인을 공유하지 않는다.
        /// 스냅 라인은 눈 쪽 최암선/폴백 드롭을 포함해 속눈썹 뿌리로 쓰면 열린 눈에서도
        /// 아래로 깔리는 원인이 된다. IrisRenderer의 수요 게이트는 라이너·섀도 전용.</summary>
        public bool WantsLidSnaps => false;

        public void ApplyParams(string colorHex, float intensity, float cornerLift, float lengthMult, int style, int finish, int texStyle)
        {
            _intensity = Mathf.Clamp01(intensity);
            _cornerLift = Mathf.Clamp01(cornerLift);
            // 길이 배수 핸들 — JsonUtility 생략 0은 미설정 → 1(원래).
            _lengthMult = lengthMult <= 0f ? 1f : Mathf.Clamp(lengthMult, 0.4f, 2.5f);
            _style = Mathf.Clamp(style, 0, 5); // 모양(생략 0=내추럴=기존 출력, 5=처짐 위 전용)
            _texStyle = Mathf.Clamp(texStyle, 0, 3); // 0=절차(기본) 1=텍스처 내추럴 2=텍스처 볼륨 3=텍스처 글램
            if (_material != null)
            {
                if (!string.IsNullOrEmpty(colorHex) &&
                    ColorUtility.TryParseHtmlString(colorHex, out var c))
                    _material.SetColor(ColorId, c);
                _material.SetFloat(IntensityId, LashAlpha(_intensity));
                // 마감(Tier B) — 위 속눈썹 머티리얼 전용(하 속눈썹과 독립). 0=새틴=기존 출력.
                _material.SetFloat(FinishId, finish);
            }
            // 텍스처 리본 머티리얼 — 색·알파 공유, 텍스처는 스타일별.
            if (_texMaterial != null)
            {
                if (!string.IsNullOrEmpty(colorHex) &&
                    ColorUtility.TryParseHtmlString(colorHex, out var tc))
                    _texMaterial.SetColor(ColorId, tc);
                _texMaterial.SetFloat(IntensityId, LashAlpha(_intensity));
                var tex = LoadLashTex(_texStyle);
                if (tex != null) _texMaterial.SetTexture(MainTexId, tex);
            }
            // 스타일 3(글램)은 아래 리본 텍스처를 자동 동반 장착 — 수동 오버라이드와 충돌하지
            // 않게 자동 장착분만 플래그로 추적해 스타일 이탈 시 해제한다.
            if (_texStyle == 3)
            {
                if (_lowerGlamTex == null) _lowerGlamTex = Resources.Load<Texture2D>("lash_glam_lower");
                if (_lowerGlamTex != null) { SetLowerTexOverride(_lowerGlamTex); _lowerTexFromStyle = true; }
            }
            else if (_lowerTexFromStyle)
            {
                SetLowerTexOverride(null);
                _lowerTexFromStyle = false;
            }
        }

        /// <summary>아래 속눈썹 — 색은 mascaraColor 공용, 길이 배수는 mascaraLength와
        /// 독립(lowerLashLength). 눈꼬리 리프트는 ApplyParams가 공유 필드로 설정.</summary>
        public void ApplyLowerParams(string colorHex, float intensity, float lengthMult, int style, int finish)
        {
            _lowerIntensity = Mathf.Clamp01(intensity);
            // 길이 배수 핸들 — JsonUtility 생략 0은 미설정 → 1(원래).
            _lowerLengthMult = lengthMult <= 0f ? 1f : Mathf.Clamp(lengthMult, 0.4f, 2.5f);
            _lowerStyle = Mathf.Clamp(style, 0, 4); // 모양(생략 0=내추럴, 5=처짐은 위 전용 — 법선 반전이 눈 침범)
            if (_lowerMaterial == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _lowerMaterial.SetColor(ColorId, c);
            _lowerMaterial.SetFloat(IntensityId, LashAlpha(_lowerIntensity));
            // 마감(Tier B) — 아래 속눈썹 머티리얼 전용(위 속눈썹과 독립). 0=새틴=기존 출력.
            _lowerMaterial.SetFloat(FinishId, finish);
            // 아래 텍스처 리본 머티리얼 색·알파 동기 (오버라이드 활성 시 사용).
            if (_lowerTexMaterial != null)
            {
                _lowerTexMaterial.SetColor(ColorId, _lowerMaterial.GetColor(ColorId));
                _lowerTexMaterial.SetFloat(IntensityId, _lowerMaterial.GetFloat(IntensityId));
            }
        }

        void LateUpdate()
        {
            var tracked = _source != null && _source.HasFace && FramePresenter.Instance != null;
            var upperOn = tracked && _intensity > 0f;
            var lowerOn = tracked && _lowerIntensity > 0f;
            // 위 속눈썹은 텍스처 스타일이면 리본, 아니면 절차 — 둘 중 하나만 켠다.
            var texOn = upperOn && _texStyle > 0;
            var procOn = upperOn && _texStyle == 0;
            // 아래도 동일 원칙 — 오버라이드 텍스처가 있으면 리본, 없으면 절차.
            var lowerTexOn = lowerOn && _lowerTexOn;
            var lowerProcOn = lowerOn && !_lowerTexOn;
            if (_renderer.enabled != procOn) _renderer.enabled = procOn;
            if (_texRenderer.enabled != texOn) _texRenderer.enabled = texOn;
            if (_lowerRenderer.enabled != lowerProcOn) _lowerRenderer.enabled = lowerProcOn;
            if (_lowerTexRenderer != null && _lowerTexRenderer.enabled != lowerTexOn)
                _lowerTexRenderer.enabled = lowerTexOn;
            if (!upperOn && !lowerOn) return;

            var lm = _source.Landmarks;
            if (procOn) UpdateUpper(lm);
            if (texOn) UpdateUpperTex(lm);
            if (lowerProcOn) UpdateLower(lm);
            if (lowerTexOn) UpdateLowerTex(lm);
        }

        void UpdateUpper(Vector3[] lm)
        {
            var vi = 0;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = UpperLids[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;

                var lidMid = ImgPt(lm, lids[4]);
                var up = (ImgPt(lm, BrowLower[e][2]) - lidMid).normalized;
                var eyeOpen = Vector2.Distance(lidMid, ImgPt(lm, LowerLids[e][4]));

                // 뿌리는 아이라이너 스냅(IrisRenderer.GetLidSnap)이 아니라 원시 상안검에서
                // 시작한다. 아이라이너 스냅은 "눈 쪽 최암선"으로 내려가는 폴백/탐색이 있어
                // 마스카라 뿌리로 쓰면 처짐 스타일이 아니어도 속눈썹이 눈 안쪽에 깔린다.
                // 마스카라는 실제 털이 피부 쪽에서 솟아나야 하므로 브로우 방향으로 아주
                // 얕게 올린 별도 뿌리선을 쓴다. 코너는 떠 보이지 않게 리프트를 줄인다.
                var rootLift = RootLiftImg * Mathf.Max(eyeOpen, eyeDist * 0.08f);
                for (var j = 0; j < LidPts; j++)
                {
                    var uRoot = j / (float)(LidPts - 1);
                    var centerT = 1f - Mathf.Abs(uRoot * 2f - 1f);
                    var liftT = Mathf.Lerp(0.4f, 1f, centerT);
                    _ctrl[j] = ImgPt(lm, lids[LidPts - 1 - j]) + up * rootLift * liftT; // 안쪽 → 바깥
                }

                // 눈 감김 — 반쯤 감긴 눈에서는 방향을 뒤집지 않고 투영상 길이만
                // 눌렀다가, 실제 폐구에 가까워진 뒤에만 눈꺼풀을 따라 아래로 접는다.
                // 개방도 = 상·하안검 중앙 거리 / 눈폭(스케일 불변 정규화).
                // 주의: Unity Mathf.SmoothStep(from,to,t)는 HLSL smoothstep(edge0,edge1,x)와
                // 달리 임계 리맵이 아니라 t를 [0,1] 보간계수로 쓰는 부드러운 lerp다. 개방도
                // 게이트에 Mathf.SmoothStep을 쓰면 openRatio와 무관하게 결과가 항상 ~edge라
                // foldT가 늘 ~1이 되어 뜬 눈에서도 속눈썹이 아래로 접혔다(실기기 규명). 임계
                // 리맵은 SmoothThreshold로 직접 구현.
                var openRatio = eyeOpen / Mathf.Max(eyeDist, 1e-6f);
                var closureT = 1f - SmoothThreshold(0.06f, 0.20f, openRatio);
                // 눈 감을 때 속눈썹이 눈꺼풀 따라 아래로 내려깔리게 — 문턱을 넓혀 반쯤 감겨도
                // 폴드가 시작되게 한다. 랜드마크 159↔145는 완전 폐구에서도 openRatio가 ~0.10~0.15에
                // 머물러(실기기), 0.04~0.14 문턱으론 아예 발동을 못 했다. 0.10~0.24로 올려 그 값에서 발동.
                var foldT = 1f - SmoothThreshold(0.10f, 0.24f, openRatio);
                var midCloseSquash = Mathf.Sin(Mathf.Clamp01(closureT) * Mathf.PI);

                // 눈꼬리 띄우기 — 라이너·섀도·하안검과 동일 리프트로 속눈썹도 추종.
                if (_cornerLift > 0f)
                    for (var j = 0; j < LidPts; j++)
                        _ctrl[j] = EyeWarp.LiftCorner(
                            _ctrl[j], j / (float)(LidPts - 1), up, eyeDist, _cornerLift);

                SubdivideArc(_ctrl, LidPts, _lash);

                var len = eyeDist * LenFactor * _lengthMult; // 길이 핸들
                var depth = Depth(lm[lids[4]].z);
                for (var s = 0; s < LashesPerEye; s++)
                {
                    // 결정론적 해시(속눈썹별 흔들림 — 프레임 무관 시드). 눈별 시드 분리.
                    var seed = e * LashesPerEye + s;
                    var h1 = Hash(seed * 2 + 1);
                    var h2 = Hash(seed * 2 + 7);
                    var h3 = Hash(seed * 2 + 13);

                    // lash 라인 위 위치 u(0 안쪽 → 1 바깥) + 약간 흔들기.
                    var u = Mathf.Clamp01((s + 0.5f) / LashesPerEye + (h1 - 0.5f) * 0.5f / LashesPerEye);
                    SampleLash(u, out var root, out var along);

                    // 바깥으로 갈수록 부챗살 스윕. 접선(along)은 안쪽→바깥 방향.
                    // 기준축은 눈썹 방향 up을 주축으로 두고 아크 로컬 법선은 아주 조금만
                    // 섞는다. 로컬 법선을 그대로 쓰면 눈꺼풀 곡률·스냅 노이즈 때문에
                    // 열린 눈에서도 가닥이 눈 안쪽/아래로 꽂히는 "뒤집힌 빗살"이 된다.
                    var lnrm = Perp(along);
                    if (Vector2.Dot(lnrm, up) < 0f) lnrm = -lnrm;
                    lnrm = StableLashNormal(up, lnrm);
                    var sweep = Mathf.Lerp(SweepMin, SweepMax, u) + (h2 - 0.5f) * SweepJitter;
                    var nrmScale = 1f;
                    var lenProf = StyleProfile(_style, u, ref sweep, ref nrmScale);
                    // 감김 블렌드 — 방향 접힘은 late fold만 사용한다. 중간 감김용
                    // closureT는 길이 squash에만 관여해 기본 마스카라 조기 반전을 막는다
                    // (처짐 style 5의 열린 눈 nrmScale=-0.65 동작은 그대로 보존).
                    // foldT 선형 적용(제곱 제거) — 제곱은 부분 폴드를 죽여 반쯤 감겨도 안 깔렸다(실기기).
                    nrmScale = Mathf.Lerp(nrmScale, -1f, foldT);
                    var dirV = lnrm * nrmScale + along * (sweep * Mathf.Lerp(1f, 0.7f, foldT));
                    var dir = dirV.sqrMagnitude < 1e-10f ? along : dirV.normalized;
                    if (_style != 5)
                    {
                        var minUpDot = Mathf.Lerp(OpenEyeMinUpDot, -0.85f, foldT);
                        dir = KeepAboveLid(dir, up, minUpDot);
                    }

                    // 양끝 코너 근처는 짧게(경계 삐짐 방지) + 개체 변이.
                    var edge = Mathf.Clamp01(u / EdgeFade) * Mathf.Clamp01((1f - u) / EdgeFade);
                    // 길이 프로파일 — 앞머리 ≈45%에서 시작해 중간(u≈0.55)부터 최대.
                    // 균일 길이는 앞머리가 길어 보여 부자연(실기기). EdgeFade(6%)와
                    // 별개로 안쪽 절반 전체에 걸리는 완만한 램프. 반쯤 감긴 눈은
                    // 투영상 압축으로 가장 짧게 보이고, 실제로 감기면 일부 길이가
                    // 돌아와 눈꺼풀에 접힌 느낌을 유지한다.
                    var lenBase = Mathf.Lerp(0.45f, 1f, Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(u / 0.55f)));
                    var closureLen = (1f - 0.38f * midCloseSquash) * Mathf.Lerp(1f, 0.92f, foldT);
                    var lashLen = len * lenBase * lenProf * (0.7f + 0.6f * h3) * Mathf.Lerp(0.5f, 1f, edge)
                                  * closureLen;
                    var w = lashLen * WidthMult;
                    // 곡선(컬) — 끝을 눈썹 방향(up)으로 꺾는다. 감김(fold)이면 컬을 줄여
                    // 눕는 결을 살린다.
                    WriteCurvedLash(_vertices, ref vi, root, dir, up, lashLen, w,
                        UpperCurl * Mathf.Lerp(1f, 0.3f, foldT), depth);
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
        }

        // 텍스처 리본(위 속눈썹) — 절차와 같은 이미지 공간 파이프라인. lash 라인 각 점에서
        // 뿌리(라인)+up*길이(끝)로 리본을 세우고, 정적 UV로 곡선 스트로크 PNG를 매핑한다.
        // 방향 폴드(눈 감김)는 텍스처 경로에선 적용하지 않는다(정적 리본).
        void UpdateUpperTex(Vector3[] lm)
        {
            var vpe = RibbonCols * 2;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = UpperLids[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;
                var lidMid = ImgPt(lm, lids[4]);
                var up = (ImgPt(lm, BrowLower[e][2]) - lidMid).normalized;

                for (var j = 0; j < LidPts; j++) _ctrl[j] = ImgPt(lm, lids[j]);
                if (_cornerLift > 0f)
                    for (var j = 0; j < LidPts; j++)
                        _ctrl[j] = EyeWarp.LiftCorner(
                            _ctrl[j], j / (float)(LidPts - 1), up, eyeDist, _cornerLift);
                // (이전 UpperTailExt 꼬리 연장은 _ctrlExt(10점) 서브디비전이 _lash[25]를
                // 오버플로해 매 프레임 IndexOutOfRange로 상단 리본을 무력화 → 제거. 꼬리 연장은
                // 새 래시 아키텍처(실제 속눈썹 증폭)에서 배열 크기와 함께 제대로 재구현할 것.)
                SubdivideArc(_ctrl, LidPts, _lash);
                TailTangentExit(TailExitDropTan, TailExitStretch); // 접선 탈출 + 하향 + 연장
                SlideAlongChain(eyeDist * TailSlideFrac);          // 눈 곡선 따라 통째 바깥 이동

                // 종횡비 잠금 — 리본 높이 = 눈폭 × 도안(h/w). 가로·세로가 같은 비율로
                // 줄어 도안의 털 각도가 수학적으로 보존된다(비등방 축소가 모든 각도를
                // 수직으로 쏠리게 해 "다 똑같아지던" 문제 제거 — 사용자 판정 0722).
                var texUp = _texMaterial != null ? _texMaterial.mainTexture : null;
                var aspectUp = texUp != null && texUp.width > 0
                    ? (float)texUp.height / texUp.width
                    : LenFactor * RibbonLenMult;
                var len = eyeDist * aspectUp * _lengthMult;
                var depth = Depth(lm[lids[4]].z);
                var baseV = e * vpe;
                SmoothedRibbonNormals(up); // 컬럼별 국소 법선 — 눈꼬리 전단 제거
                for (var c = 0; c < RibbonCols; c++)
                {
                    var n = _ribNrm[c];
                    // 뿌리 턱(슬리버 제거) + 뿌리줄 오프셋: 텍스처 v=RootV 줄이 눈 라인에
                    // 오도록 v0 변을 len×RootV만큼 라인 아래로 내림(처지는 꼬리 결 표현).
                    var root = _lash[c] - n * (eyeDist * RibbonRootTuck + len * UpperTexRootV);
                    // 컬럼 길이 균일(계약 복원) — 차등 길이는 걸친 가닥을 휘게 한다
                    // (0723 재확인). 길이 다듬기는 텍스처 가위질(trim_heights)이 담당.
                    var lashLen = len;
                    var top = root + n * lashLen;
                    _texVertices[baseV + c * 2] = ImageToWorld(root, depth);
                    _texVertices[baseV + c * 2 + 1] = ImageToWorld(top, depth);
                }
            }
            _texMesh.vertices = _texVertices;
            _texMesh.RecalculateBounds();
        }

        // 아래 속눈썹 텍스처 리본 — UpdateUpperTex의 하안검판. 뿌리=하안검 체인(v=0),
        // 끝은 아래(브로우 반대) 방향. 텍스처 계약: 뿌리=텍스처 하단(v=0), 털이 위로 자라는
        // 이미지를 그대로 쓰면 리본이 아래로 뒤집어 그린다(왼오/꼬리 규약은 위와 동일).
        void UpdateLowerTex(Vector3[] lm)
        {
            var vpe = RibbonCols * 2;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = LowerLids[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;
                var lidMid = ImgPt(lm, lids[4]);
                var up = (ImgPt(lm, BrowLower[e][2]) - lidMid).normalized;

                for (var j = 0; j < LidPts; j++) _ctrl[j] = ImgPt(lm, lids[j]);
                SubdivideArc(_ctrl, LidPts, _lash);
                TailTangentExit(); // 아래 리본도 동일 — 코너 급커브로 뿌리선이 말려드는 것 방지

                // 종횡비 잠금 — 위 리본과 동일 원칙(도안 h/w가 높이 소유, 각도 보존).
                var texLo = _lowerTexMaterial != null ? _lowerTexMaterial.mainTexture : null;
                var aspectLo = texLo != null && texLo.width > 0
                    ? (float)texLo.height / texLo.width
                    : LowerTexLenFactor * RibbonLenMult;
                var len = eyeDist * aspectLo * _lowerLengthMult;
                var depth = Depth(lm[lids[4]].z);
                var baseV = e * vpe;
                SmoothedRibbonNormals(up); // 컬럼별 국소 법선(부호는 up 기준, 사용은 반전)
                for (var c = 0; c < RibbonCols; c++)
                {
                    var downN = -_ribNrm[c];
                    // 뿌리 리프트 + 뿌리줄 오프셋(위 리본과 동일 원칙, 값은 아래 도안 소유)
                    var root = _lash[c] - downN * (eyeDist * LowerRibbonLift + len * LowerTexRootV);
                    // 컬럼 길이 균일 — 도안 텍스처는 자체 길이 변화를 갖고 있어 컬럼별 차등
                    // 길이(안쪽 0.5·가장자리 0.6 변조)를 겹치면 비스듬한 털이 컬럼 경계에서
                    // 계단으로 끊긴다(사용자 "중간 잘림" 판정). 절차식 경로만 변조 유지.
                    // 길이 균일(계약) — 바깥 끝 -40%는 텍스처 가위질로 이관(휨 방지, 0723)
                    var tip = root + downN * len;
                    _lowerTexVertices[baseV + c * 2] = ImageToWorld(root, depth);
                    _lowerTexVertices[baseV + c * 2 + 1] = ImageToWorld(tip, depth);
                }
            }
            _lowerTexMesh.vertices = _lowerTexVertices;
            _lowerTexMesh.RecalculateBounds();
        }

        /// <summary>모양(mascaraStyle/lowerLashStyle) — 길이·스윕·법선 프로파일 변조,
        /// 위·아래 속눈썹 공유. 0=내추럴은 무변조(기존 출력). 시술 용어 대응:
        /// 돌리(중앙 길게·세움), 캣아이(꼬리 길게·눕힘), 오픈아이(전체 길게·수직 —
        /// 눈 커 보임), 위스피(주기 다발의 긴 스파이크 뭉침), 처짐(위 전용 — 내리깐
        /// 속눈썹, 법선 반전으로 아래를 봄. 아래 속눈썹은 clamp 0..4로 차단: 법선
        /// 반전 시 눈 안으로 침범). u: 0 안쪽 → 1 바깥. nrmScale: 법선 배수(1=위).</summary>
        static float StyleProfile(int style, float u, ref float sweep, ref float nrmScale)
        {
            if (style == 1)      // 돌리 — 중앙 강조 벨, 스윕 축소
            {
                var bell = 1f - Mathf.Abs(u * 2f - 1f);
                sweep *= 0.55f;
                return 1f + 0.5f * bell * bell;
            }
            if (style == 2)      // 캣아이(리프트) — 앞머리까지 전 구간을 눈꼬리로 눕힘
            {
                // 대칭 부챗살에 양(+) 바이어스를 더해 0 교차를 없앤다 → 앞머리도 코쪽이
                // 아니라 꼬리쪽을 본다("전부 눈꼬리" 리프트 룩). 다른 스타일의 대칭 결과
                // 구별되는 유일한 케이스.
                sweep = sweep * 0.9f + 0.32f;
                return 1f + 0.7f * Mathf.SmoothStep(0f, 1f, (u - 0.5f) * 2f);
            }
            if (style == 3)      // 오픈아이 — 전체 길고 수직에 가깝게
            {
                sweep *= 0.4f;
                return 1.25f;
            }
            if (style == 4)      // 위스피 — 주기 다발(긴 스파이크 뭉침)
            {
                var cl = Mathf.Abs(Mathf.Sin(u * Mathf.PI * 5.5f));
                return 0.8f + 0.65f * cl * cl * cl;
            }
            if (style == 5)      // 처짐 — 내리깐 속눈썹(법선 아래 반전, 살짝 길게)
            {
                nrmScale = -0.65f;
                sweep *= 0.8f;
                return 1.05f;
            }
            return 1f;
        }

        // 아래 속눈썹 — 위(UpdateUpper)와 같은 스트로크 모델, 계수만 lower용:
        // 하안검 체인 위에서 아래(down) 방향으로, 짧고 성기게 뿌린다.
        void UpdateLower(Vector3[] lm)
        {
            var vi = 0;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = LowerLids[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;

                // "아래" 기준: 눈썹→하안검 방향 — 눈을 감아도 부호가 안 뒤집힌다
                // (LowerLidRenderer와 동일 근거).
                var lidMid = ImgPt(lm, lids[4]);
                var down = (lidMid - ImgPt(lm, BrowLower[e][2])).normalized;

                // 아래 속눈썹 뿌리를 하안검 랜드마크(흰자 바로 아래·워터라인 근처)보다 down으로
                // 소폭 내린다 — 랜드마크에서 바로 나면 눈에 너무 붙어 어색(실기기). 실제 아래
                // 속눈썹은 그보다 살짝 아래 lash 라인에서 난다.
                var rootDrop = eyeDist * LowerRootDrop;
                for (var j = 0; j < LidPts; j++)
                    _ctrl[j] = ImgPt(lm, lids[LidPts - 1 - j]) + down * rootDrop; // 안쪽 → 바깥

                // 눈꼬리 띄우기 — 하안검 밴드(LowerLidRenderer)와 동일 리프트로
                // 코너 접점을 유지한다(리프트 방향은 위 = -down).
                if (_cornerLift > 0f)
                    for (var j = 0; j < LidPts; j++)
                        _ctrl[j] = EyeWarp.LiftCorner(
                            _ctrl[j], j / (float)(LidPts - 1), -down, eyeDist, _cornerLift);

                SubdivideArc(_ctrl, LidPts, _lash);

                var len = eyeDist * LowerLenFactor * _lowerLengthMult; // 길이 핸들(독립)
                var depth = Depth(lm[lids[4]].z);
                for (var s = 0; s < LowerLashesPerEye; s++)
                {
                    // 결정론적 해시 — 위 속눈썹과 시드 대역 분리(같은 u에서 겹침 방지).
                    var seed = LowerSeedOffset + e * LowerLashesPerEye + s;
                    var h1 = Hash(seed * 2 + 1);
                    var h2 = Hash(seed * 2 + 7);
                    var h3 = Hash(seed * 2 + 13);

                    var u = Mathf.Clamp01(
                        (s + 0.5f) / LowerLashesPerEye + (h1 - 0.5f) * 0.5f / LowerLashesPerEye);
                    SampleLash(u, out var root, out var along);

                    // 바깥으로 갈수록 부챗살 스윕(아래 방향 기준) — 위와 동일 모델.
                    // 위와 같은 이유로 전역 down을 주축으로 두고 아크 로컬 법선은 일부만 섞는다.
                    var lnrm = Perp(along);
                    if (Vector2.Dot(lnrm, down) < 0f) lnrm = -lnrm;
                    lnrm = StableLashNormal(down, lnrm);
                    var sweep = Mathf.Lerp(LowerSweepMin, LowerSweepMax, u) + (h2 - 0.5f) * SweepJitter;
                    var lowerNrm = 1f; // clamp 0..4라 항상 1(처짐 차단)
                    var lenProf = StyleProfile(_lowerStyle, u, ref sweep, ref lowerNrm); // 모양 — 위와 공유 프로파일
                    var dir = KeepAboveLid((lnrm + sweep * along).normalized, down, OpenEyeMinUpDot);

                    var edge = Mathf.Clamp01(u / EdgeFade) * Mathf.Clamp01((1f - u) / EdgeFade);
                    // 길이 프로파일 — 위와 동일 근거(앞머리 짧게), 아래는 완만하게.
                    var lenBase = Mathf.Lerp(0.55f, 1f, Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(u / 0.5f)));
                    var lashLen = len * lenBase * lenProf * (0.7f + 0.6f * h3) * Mathf.Lerp(0.5f, 1f, edge);
                    var w = lashLen * WidthMult;
                    // 곡선(컬) — 아래 속눈썹은 소폭만, 끝을 눈 쪽(-down)으로 살짝 꺾는다.
                    WriteCurvedLash(_lowerVertices, ref vi, root, dir, -down, lashLen, w, LowerCurl, depth);
                }
            }
            _lowerMesh.vertices = _lowerVertices;
            _lowerMesh.RecalculateBounds();
        }

        // lash 라인을 u(0~1)에서 샘플: 뿌리 점 + 진행 접선(안쪽→바깥).
        void SampleLash(float u, out Vector2 root, out Vector2 along)
        {
            var f = Mathf.Clamp(u, 0f, 0.9999f) * (Seg - 1);
            var j0 = (int)f;
            var t = f - j0;
            root = Vector2.Lerp(_lash[j0], _lash[j0 + 1], t);
            along = (_lash[Mathf.Min(j0 + 1, Seg - 1)] - _lash[Mathf.Max(j0 - 1, 0)]).normalized;
        }

        void SubdivideArc(Vector2[] ctrl, int n, Vector2[] outp)
        {
            var mi = 0;
            for (var i = 0; i < n - 1; i++)
            {
                var p1 = ctrl[i];
                var p2 = ctrl[i + 1];
                var p0 = i == 0 ? p1 : ctrl[i - 1];
                var p3 = i + 2 > n - 1 ? p2 : ctrl[i + 2];
                outp[mi++] = p1;
                for (var k = 1; k <= Sub; k++)
                    outp[mi++] = CatmullRom(p0, p1, p2, p3, k / (float)(Sub + 1));
            }
            outp[mi++] = ctrl[n - 1];
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        static float Hash(int n)
        {
            unchecked
            {
                var h = (uint)n * 2654435761u;
                h ^= h >> 13; h *= 2246822519u; h ^= h >> 16;
                return (h & 0xFFFFFF) / (float)0x1000000;
            }
        }

        // HLSL/GLSL smoothstep(edge0,edge1,x)와 동일한 임계 리맵 — x를 [edge0,edge1]에서
        // [0,1]로 부드럽게 정규화. Unity Mathf.SmoothStep(from,to,t)는 이것과 다른(부드러운
        // lerp) 함수라, 개방도처럼 '값을 문턱으로 판정'하는 용도엔 반드시 이걸 쓴다.
        static float SmoothThreshold(float edge0, float edge1, float x)
        {
            var t = Mathf.Clamp01((x - edge0) / Mathf.Max(edge1 - edge0, 1e-6f));
            return t * t * (3f - 2f * t);
        }

        // 속눈썹 알파 게인 — 셰이더 amt = taper·edge·intensity라 상한이 낮아 얇은 가닥이
        // 흐릿하게 보인다(실기기: "내추럴이 눈에 안 보임"). 감마(<1)로 저·중 강도를 크게
        // 끌어올려 훨씬 진하게. 0은 그대로 0(활성 게이트는 _intensity로 별도 판정). 튜닝 대상.
        static float LashAlpha(float intensity) =>
            intensity <= 0f ? 0f : Mathf.Clamp01(Mathf.Pow(intensity, 0.55f) * 1.5f);

        static Vector2 StableLashNormal(Vector2 stable, Vector2 local)
        {
            if (stable.sqrMagnitude < 1e-10f) return local.normalized;
            if (local.sqrMagnitude < 1e-10f) return stable.normalized;
            stable.Normalize();
            local.Normalize();
            if (Vector2.Dot(local, stable) < 0f) local = -local;
            return Vector2.Lerp(stable, local, LocalNormalBlend).normalized;
        }

        static Vector2 KeepAboveLid(Vector2 dir, Vector2 up, float minUpDot)
        {
            if (dir.sqrMagnitude < 1e-10f) return up.normalized;
            if (up.sqrMagnitude < 1e-10f) return dir.normalized;
            dir.Normalize();
            up.Normalize();

            var current = Vector2.Dot(dir, up);
            if (current >= minUpDot) return dir;

            var side = dir - up * current;
            if (side.sqrMagnitude < 1e-10f) return up;
            side.Normalize();

            var sideScale = Mathf.Sqrt(Mathf.Max(0f, 1f - minUpDot * minUpDot));
            return (up * minUpDot + side * sideScale).normalized;
        }

        // 곡선 속눈썹 한 가닥 — 뿌리→중간→끝 3단면, 끝으로 갈수록 curlToward로 꺾어 컬을 만든다.
        // 폭은 뿌리(w)→중간(0.5w)→끝(0.12w) 테이퍼. 직선 쿼드였을 때의 스파이크 인상을 없앤다.
        void WriteCurvedLash(Vector3[] verts, ref int vi, Vector2 root, Vector2 dir,
                             Vector2 curlToward, float len, float w, float curl, float depth)
        {
            // 끝은 직선 진행(root+dir*len), 중간을 진행방향 수직으로 볼록하게 밀어 C자 아크를
            // 만든다 — 방향을 up으로 회전만 하면 dir이 이미 위라 커브가 안 보였다(실기기).
            // 볼록 방향은 curlToward 쪽(위로 휘는 컬).
            var tip = root + dir * len;
            var bulge = Perp(dir);
            if (Vector2.Dot(bulge, curlToward) < 0f) bulge = -bulge;
            var mid = (root + tip) * 0.5f + bulge * (len * curl);
            var dirMid = (tip - root).normalized;
            var pR = Perp(dir); var pM = Perp(dirMid); var pT = Perp(dir);
            verts[vi++] = ImageToWorld(root - pR * w, depth);
            verts[vi++] = ImageToWorld(root + pR * w, depth);
            verts[vi++] = ImageToWorld(mid - pM * w * 0.5f, depth);
            verts[vi++] = ImageToWorld(mid + pM * w * 0.5f, depth);
            verts[vi++] = ImageToWorld(tip - pT * w * 0.12f, depth);
            verts[vi++] = ImageToWorld(tip + pT * w * 0.12f, depth);
        }

        static Vector2 Perp(Vector2 v) => new Vector2(-v.y, v.x);
        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 img, float depth)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }
    }
}
