using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 립 틴트를 입술 윤곽 랜드마크로 만든 링(도넛) 메시로 렌더한다.
    ///
    /// 칠한 UV 마스크(대략적 타원 + 색 판별 보정)를 대체한다. 아이라이너(E1)가 색 추측이
    /// 아니라 속눈썹 라인 랜드마크를 실제 엣지로 스냅해 잘 됐던 것과 같은 원리를 립에 적용:
    ///   외곽·내곽 립 윤곽(각 20점, index 정렬)을 iso→월드로 올려 그 사이 버밀리언을
    ///   링 메시로 채운다. 링은 실제 입술 그 자체라 (1) 경계가 입술에 맞고(스필 없음),
    ///   (2) 안쪽 윤곽이 입 안쪽·치아를 애초에 제외한다(입 벌려도 링은 입술만).
    ///   색 기반 판별의 치아/스필/입술산 한계를 기하로 해소.
    ///
    /// 색 로직은 버리지 않는다 — Lip.shader가 GrabPass로 실제 입술 픽셀을 루마 보존
    /// 틴트하므로 "색소 얹힌 느낌"은 그대로. 하이브리드(기하 1차 + 색 2차).
    ///
    /// 외곽 엣지 스냅(버밀리언 경계=붉은기 급락 지점)은 ComputeOuterSnap이 담당 —
    /// 랜드마크의 관례점 편향을 실제 경계로 당겨 입술산·스필을 마저 정리한다.
    /// 그 이전 단계로 ApplyCornerArcFix가 입꼬리 접착(요 회전 시 코너 근처 랜드마크
    /// 처짐)을 코너 고정 아크 피팅으로 보정한다 — 랜드마크만 입력(픽셀 재탐색 없음).
    /// 좌표 매핑은 FramePresenter를 공유(배경 영상·얼굴 메시와 동일 변환). MediaPipe 전용.
    /// </summary>
    public class LipRenderer : MonoBehaviour
    {
        public static LipRenderer Instance { get; private set; }

        // 입술 외곽/내곽 윤곽 (index 정렬 20쌍: outer[i] ↔ inner[i]가 반경 방향 쌍).
        static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 };
        static readonly int[] LipsInner =
            { 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95 };
        const int Ring = 20; // 랜드마크 표본 수 (외곽/내곽 각 20점)
        // 랜드마크 사이를 스플라인으로 세분해 직선 각짐(다각형)을 없앤 매끈한 링.
        const int Sub = 6;               // 세그먼트당 세분 수
        const int RingFine = Ring * Sub; // 실제 메시 슬라이스 수 (120)

        const float DistanceFromCamera = 0.5f; // CanonicalFaceMesh와 동일
        const float DepthScale = 1.0f;

        // 외곽 엣지 스냅: 립→피부 붉은기(R−max(G,B)) 급락 지점으로 외곽점을 당긴다.
        const bool EnableSnap = true;
        const float SnapInRange = 0.18f;   // 립 반경(이미지) 대비 안쪽 탐색
        const float SnapOutRange = 0.28f;  // 바깥(피부쪽) 탐색
        const int SnapSteps = 12;
        const float SnapMinDrop = 0.04f;   // 붉은기 낙차 이 이상이어야 스냅(약하면 랜드마크)
        const float SnapEma = 0.12f;       // 낮을수록 안정(꿀렁임 방지) — 아이라이너 E1과 동일
        // 코너 무스냅 테이퍼 — 입꼬리(코너 인덱스 0=61, 10=291) 근처는 붉은기 급락 지점이
        // 실제 립 경계가 아니라 입꼬리 크리스(구각) 그림자라, 스냅이 링을 크리스로 끌어당겨
        // 요/틸트 시 옆끝이 처지거나 뜬다(아이라인 카런클 그림자와 동일 실패,
        // IrisRenderer.ComputeLidSnaps 709-714). 스냅 오프셋을 코너에서 0, 코너 옆 0.5,
        // 2스텝부터 1로 테이퍼해 코너는 아크 보정된 랜드마크(_outerFixed)에 정확히 머물게 한다.
        const float CornerSnapTaperSteps = 2f;  // 코너에서 0→1 도달까지 링 스텝 수(아이라인 준용, 실기기 튜닝)
        // 코너 근처 오프셋 추가 시간 안정화 — 고개 회전 후 들뜸 방지(아이라인 SnapOffEmaFront=0.08 준용).
        const float SnapEmaCorner = 0.06f;      // 코너 ≤2스텝 점에 적용(중앙 SnapEma=0.12보다 강함, 실기기 튜닝)

        // 윗입술 채움 보정: 윗입술 밴드(외곽-top↔내곽-top)가 너무 좁게 잡혀 위(입술산
        // 가장자리)·아래(마우스라인) 모두 덜 칠해진다(실기기 픽셀 확인). 윗입술 점만 골라
        // 외곽은 경계 쪽(바깥)으로, 내곽은 마우스라인 쪽(립 중심)으로 소폭 이동해 밴드를
        // 넓힌다. 코너·아랫입술(가중 0)은 안 건드려 과칠·치아 침범 위험을 최소화한다.
        const float UpperOuterBias = 0.13f;  // 윗입술 외곽 바깥 밀기(립 반경 대비). 입술산까지 올림
        const float UpperInnerShrink = 0.12f; // 윗입술 내곽을 립 중심으로 당기는 비율(구멍 축소)
        // 오버립(R7 명명 워프): 외곽 링을 바깥 법선으로 전 둘레 균일 확장 → 입술을 크게
        // (오버라인). 립 색이 실제 입술선 밖 피부까지 얹혀 "오버라인" 효과(실제 화장 기법).
        // 정규화(평균 반경 대비)라 얼굴 크기·표정 무관(설계 섹션 09 워프 규칙). 0 = 원래.
        const float MaxOverline = 0.12f;     // 최대 확장 = 평균 반경 × 이 값
        // 립라이너(섹션 12 step 4) — 외곽 스냅 곡선을 그대로 재사용한 얇은 안쪽 링.
        // 폭 = 외곽→립중심 거리의 비율(반경 비례라 얼굴 크기 무관).
        const float LinerWidthFrac = 0.10f;

        // ── 입꼬리 접착: 코너 고정 아크 피팅 ─────────────────────────────────
        // 문제: 고개 요(yaw) 회전 시 입꼬리 근처 랜드마크(코너 61·291 주변의
        // 185·409·146·375 등)가 안쪽으로 처지거나 떠서, 외곽 링이 실제 버밀리언
        // 경계에서 분리된다(입꼬리 페인트가 입술에서 떨어져 보임). 코너 자체는
        // 안정 앵커로 남는 반면 그 옆 점들이 흔들리는 것이 원인.
        // 해법: 이미지 엣지 재탐색(매 프레임 픽셀 스냅)은 울렁거림 원인으로 폐기된
        // 방식(커밋 0f63e2c)이라 금지 — 하안검 LowerLidRenderer.FitArc에서 검증된
        // "랜드마크 아크 피팅"을 준용한다. 외곽 링을 코너 기준 상·하 두 반원으로
        // 나눠 각각 코너 고정 저차 곡선 v(u)=k0·u(1−u)+k1·u²(1−u)를 최소제곱
        // 피팅(기저가 u=0,1에서 0이라 코너를 정확히 통과, 3차 저차라 꺾임 불가)하고,
        // (피팅−원시) 차이를 코너 근처에서만 블렌드해 적용한다. 중앙부(입술산 등)는
        // 원시 랜드마크 유지 — 기존 접착·M자 성형 로직 무손상. 계수만 EMA 시간
        // 평활(정점 위치는 raw) — 하안검과 동일 규약.
        const float LipFitEma = 0.4f;        // 계수 EMA — 하안검 FitEma 준용. 실기기 튜닝 대상
        const float CornerBlendSpan = 0.25f; // 코너 블렌드 폭(u 기준). 코너 1→중앙 0. 실기기 튜닝 대상
        const int ArcPts = Ring / 2 + 1;     // 반원 표본 수 (코너 2 + 사이 9 = 11)

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _overline; // 오버립 워프 강도 0..1 (0 = 원래)
        float _baseIntensity;  // 베이스립 커버리지 (0 = 끔) — 립 색과 독립으로 켜짐
        float _glossIntensity; // 립글로스 강도 (0 = 끔) — 립 색과 독립으로 켜짐
        // 립라이너 — 외곽 곡선을 공유하는 별도 얇은 링(색·강도 독립, 매트 연필 질감).
        Mesh _linerMesh;
        MeshRenderer _linerRenderer;
        Material _linerMaterial;
        Vector3[] _linerVertices;
        float _linerIntensity;
        float _linerWidthMult = 1f; // 라이너 폭 배수 핸들 (1=원래)

        static readonly int LipColorId = Shader.PropertyToID("_LipColor");
        static readonly int LipIntensityId = Shader.PropertyToID("_LipIntensity");
        static readonly int LipFinishId = Shader.PropertyToID("_LipFinish");
        static readonly int LipShimmerId = Shader.PropertyToID("_LipShimmer");
        static readonly int LipTextureId = Shader.PropertyToID("_LipTexture"); // 제형 텍스처(①) — 립 메시 전용
        static readonly int LipColor2Id = Shader.PropertyToID("_LipColor2");       // R2 그라데 스톱B
        static readonly int LipGradientId = Shader.PropertyToID("_LipGradient");   // R2 그라데 강도
        static readonly int LipBaseColorId = Shader.PropertyToID("_LipBaseColor");
        static readonly int LipBaseIntensityId = Shader.PropertyToID("_LipBaseIntensity");
        static readonly int LipGlossColorId = Shader.PropertyToID("_LipGlossColor");
        static readonly int LipGlossIntensityId = Shader.PropertyToID("_LipGlossIntensity");
        // 제형 스튜디오(#21) — 마감 세부(0=미지정=enum 기존 동작). 립 메시 전용(라이너 무영향).
        static readonly int LipGlossLoId = Shader.PropertyToID("_LipGlossLo");
        static readonly int LipGlossGainId = Shader.PropertyToID("_LipGlossGain");
        static readonly int LipShimmerSizeId = Shader.PropertyToID("_LipShimmerSize");
        static readonly int LipShimmerDensityId = Shader.PropertyToID("_LipShimmerDensity");
        static readonly int LipMatteId = Shader.PropertyToID("_LipMatte");
        static readonly int LipSheenId = Shader.PropertyToID("_LipSheen"); // 벨벳 시(0=무효, 머티리얼 기본과 동일)
        static readonly int LipMaterialId = Shader.PropertyToID("_LipMaterial");                 // 재질(0=없음 하위호환)
        static readonly int LipMaterialStrengthId = Shader.PropertyToID("_LipMaterialStrength");
        // 입자 레이어(글리터) 9축 — density 0=끔.
        static readonly int LipParticleSizeId = Shader.PropertyToID("_LipParticleSize");
        static readonly int LipParticleDensityId = Shader.PropertyToID("_LipParticleDensity");
        static readonly int LipParticleBrightnessId = Shader.PropertyToID("_LipParticleBrightness");
        static readonly int LipParticleColorId = Shader.PropertyToID("_LipParticleColor");
        static readonly int LipParticleTwinkleId = Shader.PropertyToID("_LipParticleTwinkle");
        static readonly int LipParticleShapeId = Shader.PropertyToID("_LipParticleShape");
        static readonly int LipParticleFeatherId = Shader.PropertyToID("_LipParticleFeather");
        static readonly int LipParticleParallaxId = Shader.PropertyToID("_LipParticleParallax");
        static readonly int LipParticleConfettiId = Shader.PropertyToID("_LipParticleConfetti");
        // 질감 맵(#22) — 픽셀별 광 지도 슬롯(립 메시 전용, 라이너 무영향).
        static readonly int LipFinishMapId = Shader.PropertyToID("_LipFinishMap");
        static readonly int LipHasFinishMapId = Shader.PropertyToID("_LipHasFinishMap");
        Texture2D _finishMap; // 소유(교체·해제 시 파기)

        readonly Vector2[] _outerSnap = new Vector2[Ring];
        readonly float[] _outerOffEma = new float[Ring];
        bool _snapPrimed;
        // 입꼬리 아크 보정 — 보정된 외곽 랜드마크(이미지 좌표). ApplyCornerArcFix가
        // 채우고, ComputeOuterSnap이 원시 랜드마크 대신 이것을 입력으로 사용한다.
        readonly Vector2[] _outerFixed = new Vector2[Ring];
        // 아크 계수 [상 반원, 하 반원][k0, k1] — 반원별 독립 EMA 버퍼.
        readonly float[][] _lipFitK = { new float[2], new float[2] };
        bool _lipFitPrimed;
        Vector2 _lipCenter; // 립 중심(이미지) — 내곽 구멍 축소 방향 기준. ComputeOuterSnap이 갱신.
        Vector2 _fitLipOuterVp;
        Vector2 _fitLipLinerVp;
        int _fitLipFrame = -1;
        bool _fitLipValid;

        // 윗입술 채움 가중: 링 인덱스 1..9 = 윗입술. 코너(0,10)·아랫입술(11..19)=0.
        // 내곽 구멍 축소(마우스라인)용 — 넓게 균일. 잘 맞아 유지.
        static float UpperWeight(int i)
        {
            if (i >= 2 && i <= 8) return 1f;   // 40·39·37·0·267·269·270 (입술산 포함)
            if (i == 1 || i == 9) return 0.5f; // 185·409 (코너 근처 테이퍼)
            return 0f;
        }
        // 외곽 바이어스 전용 가중 — 입술산 M자 모양 성형. 봉우리(37·267)는 기준 유지,
        // 골(0)만 낮춰 중앙 dip 생성, 옆(코너쪽)은 완만히 감쇠해 방사 바이어스가 만든
        // 옆라인 볼록·꺾임을 편다. (과한 봉우리 상향 프로파일과 반대 — 골 낮춤·옆 완화.)
        static float OuterBiasWeight(int i)
        {
            switch (i)
            {
                case 4: case 6: return 0.9f;  // 봉우리(37·267) — 아주 조금 낮춤
                case 5: return 0.48f;         // 골(0) — 낮춤 → 중앙 dip
                case 3: case 7: return 0.9f;  // 39·269
                case 2: case 8: return 0.78f; // 40·270 — 옆라인 완화(직선화)
                case 1: case 9: return 0.5f;  // 185·409 (코너 근처)
                default: return 0f;
            }
        }
        // 링 위에서 가장 가까운 입꼬리(코너 인덱스 0 또는 10)까지의 스텝 거리. 아이라인은 열린
        // 체인이라 min(i, n-1-i)였지만, 립은 닫힌 20링·코너 2개라 두 코너까지 링 거리(wrap 고려)
        // 최소값을 쓴다. 예: i=19 → 코너 0에서 1스텝, i=9/11 → 코너 10에서 1스텝.
        static int CornerRingDist(int i)
        {
            var a0 = Mathf.Abs(i - 0);
            var a10 = Mathf.Abs(i - 10);
            var d0 = Mathf.Min(a0, Ring - a0);
            var d10 = Mathf.Min(a10, Ring - a10);
            return Mathf.Min(d0, d10);
        }
        // 스냅 2-pass 임시 버퍼 (점 위치·바깥방향·원시 오프셋).
        readonly Vector2[] _outerPtmp = new Vector2[Ring];
        readonly Vector2[] _outerDtmp = new Vector2[Ring];
        readonly float[] _outerRawTmp = new float[Ring];

        // 스플라인 컨트롤점(이미지 x,y + 깊이 z). 매 프레임 20점 채운 뒤 세분 리샘플.
        readonly Vector3[] _outerCtrl = new Vector3[Ring];
        readonly Vector3[] _innerCtrl = new Vector3[Ring];

        void Awake() => Instance = this;
        void OnDestroy()
        {
            if (_finishMap != null) Destroy(_finishMap);
            if (Instance == this) Instance = null;
        }

        /// <summary>질감 맵 임포트(#22) — 픽셀별 광 지도(R 광게인·G 시머밀도)를 립 마감에
        /// 변조. straight 텍스처라 판정 없이 로드(#20 마스크와 달리). 빈 경로 = 맵 해제
        /// (스칼라 균일 복원, 하위호환). 립 메시 전용(라이너 머티리얼 무영향).</summary>
        public void SetFinishMapFromFile(string path)
        {
            if (_material == null) return;
            if (string.IsNullOrEmpty(path)) { ClearFinishMap(); return; }
            if (!ImageFileLoader.TryLoad(path, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"립 질감 맵 임포트 실패: {error}" });
                return;
            }
            if (_finishMap != null) Destroy(_finishMap);
            _finishMap = tex;
            _material.SetTexture(LipFinishMapId, tex);
            _material.SetFloat(LipHasFinishMapId, 1f);
        }

        void ClearFinishMap()
        {
            if (_finishMap != null) { Destroy(_finishMap); _finishMap = null; }
            _material.SetTexture(LipFinishMapId, Texture2D.whiteTexture);
            _material.SetFloat(LipHasFinishMapId, 0f);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("Lip");
            if (shader == null) shader = Shader.Find("ARMakeup/Lip");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.Lip; // 부위별 고유 큐(구 +8 4중충돌 해소)

            _mesh = new Mesh { name = "LipRing" };
            _mesh.MarkDynamic();

            var uvs = new Vector2[RingFine * 2];
            var tris = new int[RingFine * 6];
            for (var i = 0; i < RingFine; i++)
            {
                uvs[2 * i] = new Vector2(0f, 0f);     // 바깥(반경 0)
                uvs[2 * i + 1] = new Vector2(1f, 0f); // 안쪽(반경 1)
            }
            for (var i = 0; i < RingFine; i++)
            {
                int a = 2 * i, b = 2 * i + 1;
                int c = 2 * ((i + 1) % RingFine), d = 2 * ((i + 1) % RingFine) + 1;
                var t = i * 6;
                tris[t] = a; tris[t + 1] = b; tris[t + 2] = c;
                tris[t + 3] = b; tris[t + 4] = d; tris[t + 5] = c;
            }
            _vertices = new Vector3[RingFine * 2];
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.triangles = tris;

            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;

            // 립라이너 링 — 동일 토폴로지(외곽=립 외곽 곡선, 내곽=중심 쪽 얇게).
            // Lip.shader 재사용(루마 보존 색소), 매트 고정 = 연필 질감. 라이너 엣지가
            // 립 색·그림 위에서 또렷하도록 자기 큐(LipLiner)로 맨 위에 그린다.
            _linerMaterial = new Material(shader);
            _linerMaterial.renderQueue = MakeupQueues.LipLiner;
            _linerMaterial.SetFloat(LipFinishId, 1f);

            var linerGO = new GameObject("LipLiner");
            linerGO.transform.SetParent(transform, false);
            _linerMesh = new Mesh { name = "LipLinerRing" };
            _linerMesh.MarkDynamic();
            _linerVertices = new Vector3[RingFine * 2];
            _linerMesh.vertices = _linerVertices;
            _linerMesh.uv = uvs;          // 동일 토폴로지 재사용 (Unity가 복사 보관)
            _linerMesh.triangles = tris;
            linerGO.AddComponent<MeshFilter>().sharedMesh = _linerMesh;
            _linerRenderer = linerGO.AddComponent<MeshRenderer>();
            _linerRenderer.sharedMaterial = _linerMaterial;
            _linerRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _linerRenderer.enabled = false;
        }

        public void ApplyLipParams(string colorHex, float intensity, int finish, float shimmer, float overline,
                                   string color2Hex, float gradient, int texture)
        {
            _intensity = Mathf.Clamp01(intensity);
            _overline = Mathf.Clamp01(overline);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(LipColorId, c);
            _material.SetFloat(LipIntensityId, _intensity);
            // 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머. 셰이더 분기값과 1:1.
            _material.SetFloat(LipFinishId, finish);
            _material.SetFloat(LipShimmerId, Mathf.Clamp01(shimmer));
            // 제형 텍스처(①): 0=립스틱(기본) 1=벨벳틴트 2=워터틴트. 셰이더 분기값과 1:1.
            // 립라이너 머티리얼은 미설정 — 기본 0(립스틱)이라 라이너 룩 불변.
            _material.SetFloat(LipTextureId, texture);
            // ── R2 그라데이션(§3.1) — 스톱B(안쪽=입 라인 진한 색) + 강도. 빈 색(생략)은
            // 스톱A와 동일 취급 → 강도가 켜져도 단색(안전). hex 파싱은 기존 파서 재사용.
            // 립라이너 머티리얼은 의도적으로 미설정 — _LipGradient 기본 0이라 기존 그대로.
            var stopB = string.IsNullOrEmpty(color2Hex) ? colorHex : color2Hex;
            if (!string.IsNullOrEmpty(stopB) &&
                ColorUtility.TryParseHtmlString(stopB, out var c2))
                _material.SetColor(LipColor2Id, c2);
            _material.SetFloat(LipGradientId, Mathf.Clamp01(gradient));
        }

        /// <summary>베이스립 — luma 보존 커버(입술 원색을 누드/스킨톤으로 보간). 색·강도
        /// 독립(0=끔). 메인 틴트·마감·글로스의 "맨 아래" 캔버스. 립 메시 전용(라이너 무영향).
        /// 기존 ApplyLipParams 시그니처는 무변경 — 이 메서드만 추가 라우팅.</summary>
        public void ApplyLipBase(string colorHex, float intensity)
        {
            _baseIntensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(LipBaseColorId, c);
            _material.SetFloat(LipBaseIntensityId, _baseIntensity);
        }

        /// <summary>립글로스 — 마감과 독립된 "맨 위" 가산 광 레이어(매트 위에도 얹힘).
        /// 색·강도 독립(0=끔), 기본 흰색=무색 광. 립 메시 전용(라이너 무영향).</summary>
        public void ApplyLipGloss(string colorHex, float intensity)
        {
            _glossIntensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(LipGlossColorId, c);
            _material.SetFloat(LipGlossIntensityId, _glossIntensity);
        }

        /// <summary>제형 스튜디오(#21) 마감 세부 — 광 임계·게인·펄 크기·밀도·억제 + 벨벳 시(sheen).
        /// 여섯 축 전부 0=미지정=enum 기존 동작(Finish.cginc customAmt 합이 0이면 레거시 enum
        /// 경로 분기). sheen(④)도 그 합 게이트에 포함(sheen만 켜도 커스텀 경로)되나, sheen 항이
        /// sheen에 선형이라 0=무효(머티리얼 기본과 동일)=바이트 동일. 립 메시 전용(_LipSheen;
        /// 라이너 머티리얼은 매트 고정이라 무설정).</summary>
        public void ApplyLipFinish(float glossLo, float glossGain, float shimmerSize,
                                   float shimmerDensity, float matte, float sheen)
        {
            if (_material == null) return;
            _material.SetFloat(LipGlossLoId, Mathf.Clamp01(glossLo));
            _material.SetFloat(LipGlossGainId, Mathf.Clamp01(glossGain));
            _material.SetFloat(LipShimmerSizeId, Mathf.Clamp01(shimmerSize));
            _material.SetFloat(LipShimmerDensityId, Mathf.Clamp01(shimmerDensity));
            _material.SetFloat(LipMatteId, Mathf.Clamp01(matte));
            _material.SetFloat(LipSheenId, Mathf.Clamp01(sheen));
        }

        /// <summary>재질 아키타입(벨벳/메탈/홀로) — 0=없음(무변조 하위호환).</summary>
        public void ApplyLipMaterial(int matType, float strength)
        {
            if (_material == null) return;
            _material.SetFloat(LipMaterialId, Mathf.Clamp(matType, 0, 3));
            _material.SetFloat(LipMaterialStrengthId, Mathf.Clamp01(strength));
        }

        /// <summary>입자 레이어(글리터) 9축 — density 0=끔.</summary>
        public void ApplyLipParticle(float size, float density, float brightness, string colorHex,
                                     float twinkle, float shape, float feather, float parallax, float confetti)
        {
            if (_material == null) return;
            _material.SetFloat(LipParticleSizeId, Mathf.Clamp01(size));
            _material.SetFloat(LipParticleDensityId, Mathf.Clamp01(density));
            _material.SetFloat(LipParticleBrightnessId, Mathf.Clamp01(brightness));
            if (!string.IsNullOrEmpty(colorHex) && ColorUtility.TryParseHtmlString(colorHex, out var pc))
                _material.SetColor(LipParticleColorId, pc);
            _material.SetFloat(LipParticleTwinkleId, Mathf.Clamp01(twinkle));
            _material.SetFloat(LipParticleShapeId, Mathf.Clamp01(shape));
            _material.SetFloat(LipParticleFeatherId, Mathf.Clamp01(feather));
            _material.SetFloat(LipParticleParallaxId, Mathf.Clamp01(parallax));
            _material.SetFloat(LipParticleConfettiId, Mathf.Clamp01(confetti));
        }

        /// <summary>립라이너 — 색·강도 독립(0=끔). 외곽 곡선은 립과 공유(오버립 포함).</summary>
        public void ApplyLinerParams(string colorHex, float intensity, float widthMult)
        {
            _linerIntensity = Mathf.Clamp01(intensity);
            // 폭 배수 핸들 — JsonUtility 생략 0은 미설정 → 1(원래).
            _linerWidthMult = widthMult <= 0f ? 1f : Mathf.Clamp(widthMult, 0.4f, 2.5f);
            if (_linerMaterial == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _linerMaterial.SetColor(LipColorId, c);
            _linerMaterial.SetFloat(LipIntensityId, _linerIntensity);
        }

        /// <summary>실제 립 메시의 윗입술 중앙 외곽과 실제 라이너 밴드 중앙
        /// (뷰포트 좌표). 현재/직전 프레임만 허용하고 얼굴 소실 시 거부한다.</summary>
        public bool TryGetLipFitHandles(out Vector2 outerVp, out Vector2 linerVp)
        {
            outerVp = linerVp = Vector2.zero;
            if (_source == null || !_source.HasFace || FramePresenter.Instance == null ||
                !_fitLipValid || _fitLipFrame < Time.frameCount - 1 ||
                _fitLipFrame > Time.frameCount) return false;
            outerVp = _fitLipOuterVp;
            linerVp = _fitLipLinerVp;
            return true;
        }

        void LateUpdate()
        {
            var tracked = _source != null && _source.HasFace && FramePresenter.Instance != null;
            // 베이스립·글로스는 립 색(틴트)과 독립으로도 켜질 수 있어 립 메시가 살아야 한다
            // (누드 베이스만, 클리어 글로스만 = 유효 사용).
            var visible = tracked && (_intensity > 0f || _baseIntensity > 0f || _glossIntensity > 0f);
            var linerVisible = tracked && _linerIntensity > 0f; // 라이너는 립 색과 독립으로 켜짐
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (_linerRenderer.enabled != linerVisible) _linerRenderer.enabled = linerVisible;
            if (!visible && !linerVisible)
            {
                _lipFitPrimed = false; // 재획득 시 옛 아크 계수에서 EMA 출발 방지(하안검과 동일)
                return;
            }

            var lm = _source.Landmarks;

            // 적용 지점: 랜드마크→링 정점 생성 직전, 스냅 이전. 여기서 외곽 랜드마크를
            // 아크 보정해 두면 ComputeOuterSnap(방사 스냅)·M자 바이어스·오버립·립라이너가
            // 전부 보정된 점을 공통 기준으로 물려받는다 — 스냅 이후에 더하면 스냅 오프셋과
            // 아크 델타가 같은 처짐을 이중 보정하거나, 스냅 탐색이 처진 원점에서 출발해
            // 엉뚱한 경계를 잡는다. 프레임당 1회(LateUpdate 단일 진입) 계산.
            ApplyCornerArcFix(lm);

            ComputeOuterSnap(lm);

            // 20개 랜드마크(외곽 스냅 + 내곽)를 이미지 공간 컨트롤점으로.
            for (var i = 0; i < Ring; i++)
            {
                var outer = _outerSnap[i]; // 이미지 좌표(스냅)
                var inner = ImgPt(lm, LipsInner[i]);
                // 윗입술만 내곽을 마우스라인(립 중심) 쪽으로 소폭 당겨 구멍을 줄인다
                // → 윗입술 아래 가장자리·입술 사이 덜참을 채움. 코너·아랫입술은 무보정.
                inner = Vector2.Lerp(inner, _lipCenter, UpperInnerShrink * UpperWeight(i));
                _outerCtrl[i] = new Vector3(outer.x, outer.y, Depth(lm[LipsOuter[i]].z));
                _innerCtrl[i] = new Vector3(inner.x, inner.y, Depth(lm[LipsInner[i]].z));
            }

            // 닫힌 루프 중심분리 Catmull-Rom으로 세분 리샘플 → 각짐 없는 매끈한 곡선.
            for (var k = 0; k < Ring; k++)
            {
                var o0 = _outerCtrl[(k - 1 + Ring) % Ring];
                var o1 = _outerCtrl[k];
                var o2 = _outerCtrl[(k + 1) % Ring];
                var o3 = _outerCtrl[(k + 2) % Ring];
                var n0 = _innerCtrl[(k - 1 + Ring) % Ring];
                var n1 = _innerCtrl[k];
                var n2 = _innerCtrl[(k + 1) % Ring];
                var n3 = _innerCtrl[(k + 2) % Ring];
                for (var j = 0; j < Sub; j++)
                {
                    var u = j / (float)Sub;
                    var f = k * Sub + j;
                    var op = CatmullRom(o0, o1, o2, o3, u);
                    var ip = CatmullRom(n0, n1, n2, n3, u);
                    _vertices[2 * f] = ImageToWorld(new Vector2(op.x, op.y), op.z);
                    _vertices[2 * f + 1] = ImageToWorld(new Vector2(ip.x, ip.y), ip.z);
                    // 립라이너 — 외곽은 립 곡선 공유(오버립 포함), 내곽은 중심 쪽으로
                    // 반경 비례만큼 당긴 얇은 링.
                    var lp = Vector2.Lerp(new Vector2(op.x, op.y), _lipCenter,
                                          LinerWidthFrac * _linerWidthMult);
                    _linerVertices[2 * f] = _vertices[2 * f];
                    _linerVertices[2 * f + 1] = ImageToWorld(lp, op.z);
                    // k=5,j=0은 LipsOuter[5]=랜드마크 0의 실제 스냅된 윗입술 중앙.
                    // 라이너 핸들은 외곽~내곽 사이 실제 밴드 중앙에 둔다.
                    if (k == 5 && j == 0)
                    {
                        var outerImg = new Vector2(op.x, op.y);
                        _fitLipOuterVp = FramePresenter.Instance.ImageToViewport(outerImg);
                        _fitLipLinerVp = FramePresenter.Instance.ImageToViewport(
                            Vector2.Lerp(outerImg, lp, 0.5f));
                        _fitLipFrame = Time.frameCount;
                        _fitLipValid = true;
                    }
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
            _mesh.RecalculateNormals();   // 재질(메탈/홀로/멀티크롬)이 입술 굴곡에 반응하도록
            _linerMesh.vertices = _linerVertices;
            _linerMesh.RecalculateBounds();
        }

        /// <summary>
        /// 입꼬리 접착 보정 — 외곽 랜드마크에 코너 고정 아크 피팅을 적용해 _outerFixed를
        /// 채운다. 입력은 랜드마크뿐(이미지 픽셀 재탐색 없음 — 울렁거림 원인이라 금지).
        /// LipsOuter를 코너(인덱스 0=61, 10=291) 기준 두 반원(상: 61→윗외곽→291,
        /// 하: 291→아랫외곽→61)으로 나눠 각각 코너 현(chord)을 x축으로 두고 수직 오프셋
        /// v를 v(u)=k0·u(1−u)+k1·u²(1−u)로 최소제곱 근사한다(LowerLidRenderer.FitArc와
        /// 동일 기저·동일 정규방정식). 그 뒤 (피팅−원시) 차이를
        /// w(u)=1−smoothstep(0, CornerBlendSpan, min(u,1−u))로 가중해 더한다 —
        /// 코너 근처(요 회전 때 처지는 점들)만 매끈한 아크로 끌려오고, 중앙부는 w=0이라
        /// 원시 랜드마크 그대로(기존 접착 로직 무손상). 코너 자체는 델타 0이라 불변.
        /// </summary>
        void ApplyCornerArcFix(Vector3[] lm)
        {
            for (var i = 0; i < Ring; i++)
                _outerFixed[i] = ImgPt(lm, LipsOuter[i]);

            for (var arc = 0; arc < 2; arc++)
            {
                // 반원 표본의 링 인덱스: 상=0..10, 하=10..20(mod 20 → 10..19,0).
                int RingIdx(int j) => (arc == 0 ? j : Ring / 2 + j) % Ring;

                var ca = _outerFixed[RingIdx(0)];           // 시작 코너
                var cb = _outerFixed[RingIdx(ArcPts - 1)];  // 끝 코너
                var chord = cb - ca;
                var len = chord.magnitude;
                if (len < 1e-6f) continue; // 퇴화(추적 붕괴) — 이 프레임 보정 생략

                var xAxis = chord / len;
                var yAxis = new Vector2(-xAxis.y, xAxis.x); // 부호 무관 — v가 부호째 피팅됨

                // 정규방정식 [[a00 a01][a01 a11]]·[k0 k1]ᵀ = [r0 r1]ᵀ
                // (φ0=u(1−u), φ1=u²(1−u); 코너는 φ=0·v=0이라 기여 없음)
                float a00 = 0f, a01 = 0f, a11 = 0f, r0 = 0f, r1 = 0f;
                for (var j = 0; j < ArcPts; j++)
                {
                    var rel = _outerFixed[RingIdx(j)] - ca;
                    var u = Mathf.Clamp01(Vector2.Dot(rel, xAxis) / len);
                    var v = Vector2.Dot(rel, yAxis);
                    var p0 = u * (1f - u);
                    var p1 = u * u * (1f - u);
                    a00 += p0 * p0; a01 += p0 * p1; a11 += p1 * p1;
                    r0 += p0 * v; r1 += p1 * v;
                }
                var det = a00 * a11 - a01 * a01;
                float k0 = 0f, k1 = 0f;
                if (Mathf.Abs(det) > 1e-12f)
                {
                    k0 = (a11 * r0 - a01 * r1) / det;
                    k1 = (a00 * r1 - a01 * r0) / det;
                }

                // 계수만 EMA 시간 평활 — 첫 프레임은 시드(_fitPrimed 패턴, 하안검 준용).
                if (!_lipFitPrimed)
                {
                    _lipFitK[arc][0] = k0;
                    _lipFitK[arc][1] = k1;
                }
                else
                {
                    _lipFitK[arc][0] = Mathf.Lerp(_lipFitK[arc][0], k0, LipFitEma);
                    _lipFitK[arc][1] = Mathf.Lerp(_lipFitK[arc][1], k1, LipFitEma);
                }
                k0 = _lipFitK[arc][0];
                k1 = _lipFitK[arc][1];

                // (피팅−원시) 차이를 코너 근처에서만 적용(현 수직 방향만 — 처짐은
                // 수직 성분). 끝점 j=0,ArcPts−1(코너)은 델타 0이라 루프 제외.
                for (var j = 1; j < ArcPts - 1; j++)
                {
                    var idx = RingIdx(j);
                    var rel = _outerFixed[idx] - ca;
                    var u = Mathf.Clamp01(Vector2.Dot(rel, xAxis) / len);
                    var v = Vector2.Dot(rel, yAxis);
                    var vFit = k0 * u * (1f - u) + k1 * u * u * (1f - u);
                    var t = Mathf.Clamp01(Mathf.Min(u, 1f - u) / CornerBlendSpan);
                    var w = 1f - t * t * (3f - 2f * t); // 1−smoothstep: 코너 1 → 중앙 0
                    _outerFixed[idx] += yAxis * ((vFit - v) * w);
                }
            }
            _lipFitPrimed = true;
        }

        /// <summary>외곽점을 버밀리언 경계(붉은기 급락)로 스냅. 이미지 공간.
        /// 외곽 입력은 원시 랜드마크가 아니라 아크 보정된 _outerFixed(입꼬리 접착).</summary>
        void ComputeOuterSnap(Vector3[] lm)
        {
            var haveFrame = EnableSnap && _source.HasPresentedFrame;

            Vector2 center = Vector2.zero;
            for (var i = 0; i < Ring; i++)
                center += _outerFixed[i] + ImgPt(lm, LipsInner[i]);
            center /= Ring * 2;
            _lipCenter = center; // 내곽 구멍 축소가 참조
            var rad = 0f;
            for (var i = 0; i < Ring; i++)
                rad += Vector2.Distance(_outerFixed[i], center);
            rad /= Ring;

            // 1차: 점별 원시 스냅 오프셋 (+ 점 위치·바깥방향 임시 저장)
            for (var i = 0; i < Ring; i++)
            {
                var p = _outerFixed[i]; // 아크 보정된 외곽점(입꼬리 접착)에서 출발
                _outerPtmp[i] = p;
                var outward = p - center;
                if (outward.sqrMagnitude < 1e-12f)
                {
                    _outerDtmp[i] = Vector2.zero;
                    _outerRawTmp[i] = 0f;
                    continue;
                }
                outward.Normalize();
                _outerDtmp[i] = outward;

                var rawOff = 0f; // 기본 = 랜드마크 유지
                if (haveFrame && rad > 1e-5f)
                {
                    float bestOff = 0f, bestDrop = 0f, prevRed = -1f, prevT = 0f;
                    var found = false;
                    for (var s = 0; s <= SnapSteps; s++)
                    {
                        var t = Mathf.Lerp(-SnapInRange, SnapOutRange, s / (float)SnapSteps);
                        var q = p + outward * (t * rad);
                        var red = 0f;
                        if (_source.TrySampleColor(q.x, q.y, out var r, out var g, out var b))
                            red = r - Mathf.Max(g, b);
                        if (prevRed >= 0f)
                        {
                            var drop = prevRed - red; // 바깥으로 붉은기 감소 = 경계
                            if (drop > bestDrop)
                            {
                                bestDrop = drop;
                                bestOff = (prevT + t) * 0.5f * rad; // 두 샘플 사이
                                found = true;
                            }
                        }
                        prevRed = red;
                        prevT = t;
                    }
                    if (found && bestDrop >= SnapMinDrop) rawOff = bestOff;
                }
                _outerRawTmp[i] = rawOff;
            }

            // 2차: 오프셋을 인접점끼리 공간 스무딩(닫힌 루프) 후 시간 EMA — 촘촘한
            // 스플라인에서 인접점 독립 요동('꿀렁임')을 막는다(아이라이너 E1과 동일).
            for (var i = 0; i < Ring; i++)
            {
                var a = _outerRawTmp[(i - 1 + Ring) % Ring];
                var b = _outerRawTmp[(i + 1) % Ring];
                var sm = 0.5f * _outerRawTmp[i] + 0.25f * (a + b);
                var cd = CornerRingDist(i);
                // 코너 근처(≤2스텝)는 더 강한 EMA로 요 회전 후 들뜸 억제(아이라인 앞머리 준용).
                var ema = cd <= 2 ? SnapEmaCorner : SnapEma;
                if (!_snapPrimed) _outerOffEma[i] = sm;
                else _outerOffEma[i] = Mathf.Lerp(_outerOffEma[i], sm, ema);
                // 코너 무스냅 테이퍼: 코너 0 → 옆 0.5 → 2스텝부터 1. 아이라인 cornerTaper 준용.
                // 스냅 오프셋에만 곱한다(bias는 무테이퍼) — 오버립·M자 바이어스는 코너에서도
                // 유효해야 하고, OuterBiasWeight(0)=OuterBiasWeight(10)=0이라 M자는 이미 코너 제외.
                var taper = Mathf.Min(cd / CornerSnapTaperSteps, 1f);
                var bias = UpperOuterBias * rad * OuterBiasWeight(i) + _overline * MaxOverline * rad;
                _outerSnap[i] = _outerPtmp[i] + _outerDtmp[i] * (_outerOffEma[i] * taper + bias);
            }
            _snapPrimed = true;
        }

        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        // 중심분리(centripetal, α=0.5) Catmull-Rom. 오버슈트·자기교차 없이 P1→P2 구간을
        // 보간한다. 매개화는 이미지 평면(x,y) 거리 기반 — 깊이(z)는 스케일이 달라 매듭
        // 계산에서 제외하고 값만 함께 보간한다. u∈[0,1]이 P1→P2 구간.
        static Vector3 CatmullRom(Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3, float u)
        {
            float Knot(float t, Vector3 a, Vector3 b)
            {
                float dx = a.x - b.x, dy = a.y - b.y;
                return t + Mathf.Pow(Mathf.Sqrt(dx * dx + dy * dy) + 1e-5f, 0.5f);
            }
            float t0 = 0f;
            float t1 = Knot(t0, p1, p0);
            float t2 = Knot(t1, p2, p1);
            float t3 = Knot(t2, p3, p2);
            float t = Mathf.Lerp(t1, t2, u);

            var a1 = Vector3.LerpUnclamped(p0, p1, (t - t0) / (t1 - t0));
            var a2 = Vector3.LerpUnclamped(p1, p2, (t - t1) / (t2 - t1));
            var a3 = Vector3.LerpUnclamped(p2, p3, (t - t2) / (t3 - t2));
            var b1 = Vector3.LerpUnclamped(a1, a2, (t - t0) / (t2 - t0));
            var b2 = Vector3.LerpUnclamped(a2, a3, (t - t1) / (t3 - t1));
            return Vector3.LerpUnclamped(b1, b2, (t - t1) / (t2 - t1));
        }

        Vector3 ImageToWorld(Vector2 img, float depth)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }
    }
}
