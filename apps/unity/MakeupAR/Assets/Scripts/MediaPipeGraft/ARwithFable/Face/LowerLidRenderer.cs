using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 하안검 밴드 렌더러 (설계 섹션 12 step 2 정식판) — 하안검 lash 라인에서 아래로
    /// 확장한 밴드 메시 하나로 아이라인(하)·애교살 2줄(하이라이트+섀도)을 그린다.
    ///
    /// 밴드 상단(v=0) = 하안검 lash 라인, 하단(v=1) = 아래로 오프셋 — 상안검 밴드
    /// (EyelinerStyleRenderer)와 법선 부호만 반대("아래쪽 법선 규약"). "아래" 기준은
    /// 눈썹→하안검 방향: 눈썹은 항상 눈 위라 눈을 감아도 부호가 안 뒤집힌다.
    /// UV 가로 0(안쪽 눈머리)→1(바깥 눈꼬리). 세로/가로 프로파일은 셰이더 담당.
    ///
    /// lash 라인은 코너 고정 3차식 최소제곱 피팅(FitArc)으로 그린다 — 랜드마크는
    /// 이미 상류에서 One-Euro 필터링돼 안정적이라, 그 위에 이미지 경계 스냅 같은
    /// 프레임별 재탐색을 얹으면 오히려 요동친다(실기기 확인). 저차 곡선 + 계수 EMA로
    /// "안 울렁거리고 매끈한 아크"를 보장한다.
    /// </summary>
    public class LowerLidRenderer : MonoBehaviour
    {
        public static LowerLidRenderer Instance { get; private set; }

        // 하안검 라인: 바깥 눈꼬리 → 안쪽 눈머리 (IrisRenderer 눈 링의 하단 절반과 동일).
        static readonly int[][] LowerLids =
        {
            new[] { 33, 7, 163, 144, 145, 153, 154, 155, 133 },
            new[] { 263, 249, 390, 373, 374, 380, 381, 382, 362 },
        };
        // 눈썹 하단 — "아래" 방향의 안정 기준(EyelinerStyleRenderer와 동일 근거).
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };

        const int Eyes = 2;
        const int LidPts = 9;
        const int Seg = 25; // lash 아크 리샘플 밀도

        const float BandHeightFactor = 0.45f; // 밴드 높이 = 눈 가로폭 × 이 값
        const float AegyoHighlightPeakV = 0.32f; // LowerLid.shader hiAmt 최대 구간의 대표 vv
        // 아크 계수 시간 평활. 랜드마크가 이미 필터링돼 있어 가벼운 EMA로 충분하고,
        // 잔여 미세 흔들림만 눌러 준다(값이 낮을수록 안정·반응 느림).
        const float FitEma = 0.4f;

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        // 임포트 애교살 그림은 립/블러셔처럼 밴드 채움성이라 데칼 가드를 건다.
        // 투명 배경 미달(불투명 JPG/배경째 PNG)이면 밴드 전체가 사각형으로 덮이므로 거부.
        const float DecalMinTransparent = 0.05f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _aegyoIntensity;
        float _linerIntensity;
        float _aegyoStyleIntensity; // 임포트 애교살 그림(데칼) 강도
        float _triIntensity; // 삼각존(눈꼬리 아래 삼각 음영) 강도 — 애교살과 독립 (0=끔)
        float _concealerIntensity; // 눈밑 컨실러(언더아이 홀로우 브라이튼) 강도 — 독립 (0=끔)
        float _lowerShadowIntensity; // A3 아이섀도 하(하안검 아래 섀도) 강도 — 애교살보다 아래 깔림 (0=끔)
        float _cornerLift; // 눈꼬리 띄우기(R7 워프) — 상안검 코너와 접점 유지용 동일 리프트
        float _heightMult = 1f; // 밴드 높이 배수 핸들(애교살 두께, 1=원래)
        Texture2D _importedAegyo;

        static readonly int LinerColorId = Shader.PropertyToID("_LinerColor");
        static readonly int LinerIntensityId = Shader.PropertyToID("_LinerIntensity");
        static readonly int LowerLinerStyleId = Shader.PropertyToID("_LowerLinerStyle");
        static readonly int LowerLinerFinishId = Shader.PropertyToID("_LowerLinerFinish");
        static readonly int LowerLinerShimmerId = Shader.PropertyToID("_LowerLinerShimmer");
        static readonly int AegyoHiColorId = Shader.PropertyToID("_AegyoHiColor");
        static readonly int AegyoShColorId = Shader.PropertyToID("_AegyoShColor");
        static readonly int AegyoIntensityId = Shader.PropertyToID("_AegyoIntensity");
        static readonly int AegyoTexId = Shader.PropertyToID("_AegyoTex");
        static readonly int AegyoStyleIntensityId = Shader.PropertyToID("_AegyoStyleIntensity");
        static readonly int TriColorId = Shader.PropertyToID("_TriColor");
        static readonly int TriIntensityId = Shader.PropertyToID("_TriIntensity");
        static readonly int ConcealerColorId = Shader.PropertyToID("_ConcealerColor");
        static readonly int ConcealerIntensityId = Shader.PropertyToID("_ConcealerIntensity");
        static readonly int LowerShadowColorId = Shader.PropertyToID("_LowerShadowColor");
        static readonly int LowerShadowIntensityId = Shader.PropertyToID("_LowerShadowIntensity");
        // 마감 — 애교살(하이라이트 밴드)·아이섀도 하. 블러셔와 동일 enum(0=새틴=기존 출력).
        static readonly int AegyoFinishId = Shader.PropertyToID("_AegyoFinish");
        static readonly int AegyoShimmerId = Shader.PropertyToID("_AegyoShimmer");
        static readonly int LowerShadowFinishId = Shader.PropertyToID("_LowerShadowFinish");
        static readonly int LowerShadowShimmerId = Shader.PropertyToID("_LowerShadowShimmer");

        // 애교살 기본 색(LowerLid.shader Properties와 동치) — aegyoColor 빈 값일 때 되돌림.
        static readonly Color AegyoHiDefault = new Color(1.0f, 0.95f, 0.88f);
        static readonly Color AegyoShDefault = new Color(0.69f, 0.54f, 0.41f);

        readonly Vector2[] _ctrl = new Vector2[LidPts];
        readonly Vector2[] _lash = new Vector2[Seg];
        readonly float[][] _fitEma = { new float[2], new float[2] }; // [eye][k0, k1]
        bool _fitPrimed;
        readonly Vector2[] _fitAegyoPeakVp = new Vector2[Eyes];
        readonly int[] _fitAegyoPeakFrame = { -1, -1 };
        readonly bool[] _fitAegyoPeakValid = new bool[Eyes];

        void Awake() => Instance = this;

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (_importedAegyo != null) Destroy(_importedAegyo);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("LowerLid");
            if (shader == null) shader = Shader.Find("ARMakeup/LowerLid");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.LowerLid; // 부위별 고유 큐(섀도 위·스텐실 아래)
            // 임포트 전엔 투명 — 그림 없이 강도만 올라가도 아무것도 안 그려지게.
            _material.SetTexture(AegyoTexId, ImageFileLoader.ClearTexture);

            _mesh = new Mesh { name = "LowerLid" };
            _mesh.MarkDynamic();

            var vc = Eyes * Seg * 2;
            var uvs = new Vector2[vc];
            var tris = new int[Eyes * (Seg - 1) * 6];
            for (var e = 0; e < Eyes; e++)
            {
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1); // 0 안쪽 → 1 바깥
                    uvs[b + 2 * i] = new Vector2(along, 0f);     // 상단(하안검 lash 라인)
                    uvs[b + 2 * i + 1] = new Vector2(along, 1f); // 하단(아래 페이드 끝)
                }
                for (var i = 0; i < Seg - 1; i++)
                {
                    int la0 = b + 2 * i, lo0 = b + 2 * i + 1;
                    int la1 = b + 2 * (i + 1), lo1 = b + 2 * (i + 1) + 1;
                    var t = (e * (Seg - 1) + i) * 6;
                    tris[t] = la0; tris[t + 1] = lo0; tris[t + 2] = la1;
                    tris[t + 3] = lo0; tris[t + 4] = lo1; tris[t + 5] = la1;
                }
            }
            _vertices = new Vector3[vc];
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.triangles = tris;

            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;
        }

        /// <summary>밴드가 살아있어 눈 열림 스텐실이 필요한가 (IrisRenderer가 조회).</summary>
        public bool NeedsEyeMask =>
            _aegyoIntensity > 0f || _linerIntensity > 0f || _aegyoStyleIntensity > 0f ||
            _triIntensity > 0f || _concealerIntensity > 0f || _lowerShadowIntensity > 0f;

        /// <summary>실제 하안검 메시에서 셰이더 하이라이트 피크(vv=0.32)에 해당하는
        /// 중앙점(뷰포트 좌표). 현재/직전 프레임만 허용하고 얼굴 소실 시 거부한다.</summary>
        public bool TryGetAegyoFitHandle(int eye, out Vector2 peakVp)
        {
            peakVp = Vector2.zero;
            if (eye < 0 || eye >= Eyes || _source == null || !_source.HasFace ||
                FramePresenter.Instance == null || !_fitAegyoPeakValid[eye]) return false;
            var frame = _fitAegyoPeakFrame[eye];
            if (frame < Time.frameCount - 1 || frame > Time.frameCount) return false;
            peakVp = _fitAegyoPeakVp[eye];
            return true;
        }

        /// <summary>삼각존 — 눈꼬리 바로 아래 좁은 삼각 음영(눈밑 전체 아님). 하안검 밴드의
        /// 꼬리 쪽(u 바깥 1/3)에 가중된 어두운 섀도 텀. 색·강도 독립(0=끔), 애교살/아이라인
        /// (하)과 같은 밴드에서 블렌드. 기본 딥브라운(#4A342A 계열)은 셰이더 기본값.</summary>
        public void ApplyTriangleZone(string colorHex, float intensity)
        {
            _triIntensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(TriColorId, c);
            _material.SetFloat(TriIntensityId, _triIntensity);
        }

        /// <summary>눈밑 컨실러(§08) — 언더아이 홀로우(눈물고랑)를 밝히는 넓고 부드러운
        /// 브라이튼. 애교살 하이라이트(도톰한 리본)보다 세로로 넓고 페더 강한 벨 프로파일로
        /// lash 라인 아래 홀로우 전체를 덮는다. concealerColor 틴트 + 스크린(가산) 합성,
        /// concealerIntensity 강도. 애교살과 독립(둘 다 켜도 밴드에서 자연 합성). 색은 밝은
        /// 톤이라 색 반전 없음(FaceMakeup 눈밑 존 마스크 경로의 밴드 정식판). 0=끔.
        /// shape=1(붉은기 자동)은 FaceMakeup 전담이라 여기 강도는 0으로 들어온다.</summary>
        public void ApplyConcealer(string colorHex, float intensity)
        {
            _concealerIntensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(ConcealerColorId, c);
            _material.SetFloat(ConcealerIntensityId, _concealerIntensity);
        }

        /// <summary>A3 아이섀도 하 — 하안검 lash 라인 아래로 부드럽게 페이드하는 섀도 밴드.
        /// 애교살/아이라인보다 아래(먼저)에 곱 블렌드로 깔려 위 제품이 섀도 위로 뜬다. 색·강도
        /// 독립(0=끔, 기존 룩 불변). ApplyConcealer와 동일 패턴.</summary>
        public void ApplyLowerShadow(string colorHex, float intensity, int finish, float shimmer)
        {
            _lowerShadowIntensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(LowerShadowColorId, c);
            _material.SetFloat(LowerShadowIntensityId, _lowerShadowIntensity);
            // 마감 — 블러셔와 동일 enum. 생략(0)=새틴=기존 출력(하위호환).
            _material.SetFloat(LowerShadowFinishId, finish);
            _material.SetFloat(LowerShadowShimmerId, Mathf.Clamp01(shimmer));
        }

        /// <summary>아이라인(하) 색은 상안검 아이라이너와 공용(eyelinerColor). aegyoColor는
        /// 애교살 틴트 — 빈 값이면 기본 상수로 되돌리고(룩 전환 시 이전 색 누수 방지), 값이
        /// 있으면 하이라이트=그 색·섀도=파생(톤다운).</summary>
        public void ApplyParams(
            float aegyoIntensity, string linerColorHex, float linerIntensity, float cornerLift,
            float heightMult, float aegyoStyleIntensity, string aegyoColor,
            int aegyoFinish, float aegyoShimmer, float linerStyle,
            float linerFinish, float linerShimmer)
        {
            _aegyoIntensity = Mathf.Clamp01(aegyoIntensity);
            _linerIntensity = Mathf.Clamp01(linerIntensity);
            _aegyoStyleIntensity = Mathf.Clamp01(aegyoStyleIntensity);
            _cornerLift = Mathf.Clamp01(cornerLift);
            // 밴드 높이 배수 핸들(애교살 두께) — JsonUtility 생략 0은 미설정 → 1(원래).
            // 하한 0.25 = "아주 얇은 애교살"까지 허용 (RN 슬라이더 하한 0.3보다 여유).
            _heightMult = heightMult <= 0f ? 1f : Mathf.Clamp(heightMult, 0.25f, 2f);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(linerColorHex) &&
                ColorUtility.TryParseHtmlString(linerColorHex, out var c))
                _material.SetColor(LinerColorId, c);
            // 애교살 틴트(린너색 파싱 패턴 재사용). 값이 있고 파싱되면 하이라이트=그 색·
            // 섀도=파생, 아니면(빈 값/파싱 실패) 기본 상수로 복원(룩 전환 시 이전 색 누수 방지).
            if (!string.IsNullOrEmpty(aegyoColor) &&
                ColorUtility.TryParseHtmlString(aegyoColor, out var ac))
            {
                // 섀도 = 파싱색을 감광(×0.62)한 뒤 기본 브라운으로 35% 러프 — 볼록 정의용
                // 톤다운. (수식 튜닝 대상: 0.62 감광 계수 / 0.35 브라운 러프 비율)
                var sh = Color.Lerp(ac * 0.62f, new Color(0.69f, 0.54f, 0.41f), 0.35f);
                _material.SetColor(AegyoHiColorId, ac);
                _material.SetColor(AegyoShColorId, sh);
            }
            else
            {
                _material.SetColor(AegyoHiColorId, AegyoHiDefault);
                _material.SetColor(AegyoShColorId, AegyoShDefault);
            }
            _material.SetFloat(AegyoIntensityId, _aegyoIntensity);
            _material.SetFloat(LinerIntensityId, _linerIntensity);
            _material.SetFloat(LowerLinerStyleId, Mathf.Clamp(Mathf.RoundToInt(linerStyle), 0, 2));
            _material.SetFloat(LowerLinerFinishId, Mathf.Clamp(Mathf.RoundToInt(linerFinish), 0, 3));
            _material.SetFloat(LowerLinerShimmerId, Mathf.Clamp01(linerShimmer));
            _material.SetFloat(AegyoStyleIntensityId, _aegyoStyleIntensity);
            // 마감 — 애교살 하이라이트 밴드(시머=펄 애교살). 0=새틴=기존 출력(하위호환).
            _material.SetFloat(AegyoFinishId, aegyoFinish);
            _material.SetFloat(AegyoShimmerId, Mathf.Clamp01(aegyoShimmer));
        }

        /// <summary>사용자 임포트 애교살 그림 — 밴드 (가로×세로) UV에 워프. 투명 배경 PNG
        /// 필수(알파=그린 영역), 불투명이면 거부(밴드 채움이라 립/블러셔와 동일 데칼 가드).
        /// 색은 그린 그대로(스티커) — 애교살은 밝은 펄이라 색 반전 없음.</summary>
        public void SetAegyoTextureFromFile(string path)
        {
            if (_material == null) return;
            if (!ImageFileLoader.TryLoadDecal(path, DecalMinTransparent, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"애교살 그림 임포트 실패: {error}" });
                return;
            }
            if (_importedAegyo != null) Destroy(_importedAegyo);
            _importedAegyo = tex;
            _material.SetTexture(AegyoTexId, tex);
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null &&
                          (_aegyoIntensity > 0f || _linerIntensity > 0f ||
                           _aegyoStyleIntensity > 0f || _triIntensity > 0f ||
                           _concealerIntensity > 0f || _lowerShadowIntensity > 0f);
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible)
            {
                _fitPrimed = false; // 재획득 시 옛 아크 계수에서 EMA 출발 방지
                return;
            }

            var lm = _source.Landmarks;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = LowerLids[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;

                // 컨트롤 포인트: 안쪽 → 바깥 (하안검 lash 라인).
                for (var j = 0; j < LidPts; j++)
                    _ctrl[j] = ImgPt(lm, lids[LidPts - 1 - j]);

                // "아래" 기준: 눈썹에서 하안검으로 향하는 방향. 눈썹은 항상 눈 위라
                // 눈을 감아도 부호가 안 뒤집힌다(상안검 밴드와 동일 근거, 부호 반대).
                var lidMid = ImgPt(lm, lids[4]);
                var down = (lidMid - ImgPt(lm, BrowLower[e][2])).normalized;

                // 눈꼬리 띄우기(R7 워프) — 하안검 바깥 끝도 같은 리프트로 올려
                // 상안검 라이너 코너(같은 랜드마크 33/263)와 접점을 유지한다.
                if (_cornerLift > 0f)
                    for (var j = 0; j < LidPts; j++)
                        _ctrl[j] = EyeWarp.LiftCorner(
                            _ctrl[j], j / (float)(LidPts - 1), -down, eyeDist, _cornerLift);

                FitArc(e, down); // _ctrl → 매끈한 lash 아크 _lash

                var width = eyeDist * BandHeightFactor * _heightMult; // 높이 핸들
                var depth = Depth(lm[lids[4]].z);
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var a = _lash[Mathf.Max(i - 1, 0)];
                    var bb = _lash[Mathf.Min(i + 1, Seg - 1)];
                    var tangent = (bb - a).normalized;
                    var normal = new Vector2(-tangent.y, tangent.x);
                    if (Vector2.Dot(normal, down) < 0f) normal = -normal; // 아래쪽 법선 규약
                    var bottom = _lash[i] + normal * width;
                    _vertices[b + 2 * i] = ImageToWorld(_lash[i], depth);
                    _vertices[b + 2 * i + 1] = ImageToWorld(bottom, depth);
                    if (i == Seg / 2)
                    {
                        var peakImg = Vector2.Lerp(_lash[i], bottom, AegyoHighlightPeakV);
                        _fitAegyoPeakVp[e] = FramePresenter.Instance.ImageToViewport(peakImg);
                        _fitAegyoPeakFrame[e] = Time.frameCount;
                        _fitAegyoPeakValid[e] = true;
                    }
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
            _fitPrimed = true;
        }

        /// <summary>
        /// 하안검 9점(_ctrl, 안쪽→바깥)에 코너 고정 3차식을 최소제곱 피팅해 매끈한
        /// 아크로 리샘플한다. 눈머리→눈꼬리 현(chord)을 x축으로 두고 각 점의 수직
        /// 오프셋 v를 v(u) = k0·u(1−u) + k1·u²(1−u)로 근사한다 — u=0,1(코너)에서
        /// 0이라 눈머리·눈꼬리를 정확히 통과(상안검 라이너 접점 유지), 저차라 꺾임 불가.
        /// 계수 [k0,k1]는 2×2 정규방정식으로 풀고 EMA로 프레임 간 평활한다.
        /// </summary>
        void FitArc(int e, Vector2 down)
        {
            var inner = _ctrl[0];
            var outer = _ctrl[LidPts - 1];
            var chord = outer - inner;
            var L = chord.magnitude;
            if (L < 1e-6f)
            {
                for (var i = 0; i < Seg; i++) _lash[i] = inner;
                return;
            }
            var xAxis = chord / L;
            var yAxis = new Vector2(-xAxis.y, xAxis.x);
            if (Vector2.Dot(yAxis, down) < 0f) yAxis = -yAxis; // v>0 = 아래(피부) 방향

            // 정규방정식 [[a00 a01][a01 a11]]·[k0 k1]ᵀ = [r0 r1]ᵀ (φ0=u(1−u), φ1=u²(1−u))
            float a00 = 0f, a01 = 0f, a11 = 0f, r0 = 0f, r1 = 0f;
            for (var j = 0; j < LidPts; j++)
            {
                var rel = _ctrl[j] - inner;
                var u = Mathf.Clamp01(Vector2.Dot(rel, xAxis) / L);
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

            if (!_fitPrimed)
            {
                _fitEma[e][0] = k0;
                _fitEma[e][1] = k1;
            }
            else
            {
                _fitEma[e][0] = Mathf.Lerp(_fitEma[e][0], k0, FitEma);
                _fitEma[e][1] = Mathf.Lerp(_fitEma[e][1], k1, FitEma);
            }
            k0 = _fitEma[e][0];
            k1 = _fitEma[e][1];

            for (var i = 0; i < Seg; i++)
            {
                var u = i / (float)(Seg - 1);
                var v = k0 * u * (1f - u) + k1 * u * u * (1f - u);
                _lash[i] = inner + xAxis * (u * L) + yAxis * v;
            }
        }

        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 img, float depth)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }
    }
}
