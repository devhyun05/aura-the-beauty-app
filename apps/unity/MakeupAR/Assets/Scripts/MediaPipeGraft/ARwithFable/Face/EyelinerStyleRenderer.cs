using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 아이라인 "스타일" — 미리 그린(또는 사용자 임포트) 아이라인/윙 텍스처를 속눈썹
    /// 라인 밴드에 워프해 얹는다. 눈썹 StyleRenderer와 짝: 눈썹=아치 밴드, 이건 눈매 밴드.
    ///
    /// 밴드 하단(v=0) = 상안검(속눈썹) 라인, 상단(v=1) = 그 위로 오프셋. 바깥 눈꼬리에서
    /// 윙만큼 연장해 텍스처의 윙이 얹힐 캔버스를 준다. UV 가로 0(안쪽 눈머리)→1(바깥 윙).
    /// EyelinerStyle.shader가 알파/luma-key로 라인 모양, _LineColor로 틴트.
    ///
    /// 임포트: SetTextureFromFile(path) 런타임 로드(재빌드 없음). 기본 Resources/default_eyeliner.
    /// 참고: 밴드 높이/윙 길이는 상수 — 실기기 확인 후 튜닝 필요(BandHeightFactor/WingLenFactor).
    /// </summary>
    public class EyelinerStyleRenderer : MonoBehaviour
    {
        public static EyelinerStyleRenderer Instance { get; private set; }

        // 상안검(속눈썹) 라인: 바깥 눈꼬리 → 안쪽 눈머리. IrisRenderer.UpperLids와 동일.
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };
        // 눈썹 하단(항상 눈 위) — 밴드 "위" 방향 기준. iris center 기준은 눈 감을 때
        // 상안검과 겹쳐 법선 부호가 뒤집힌다(IrisRenderer.cs가 같은 이유로 브로우 기준 사용).
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };

        const int Eyes = 2;
        const int LidPts = 9;
        const int CtrlPts = LidPts + 1;              // + 윙 컨트롤 1점
        const int Sub = 2;
        const int Seg = (CtrlPts - 1) * (Sub + 1) + 1; // 28

        const float BandHeightFactor = 0.5f;  // 밴드 높이 = 눈 가로폭 × 이 값
        const float WingLenFactor = 0.32f;    // 윙 연장 = 눈 가로폭 × 이 값
        const float WingRise = 0.6f;          // 윙이 위로 꺾이는 정도
        // 밴드 하단 턱 — 랜드마크 체인과 육안 속눈썹 라인 사이 틈(라이너-눈알 사이 빈 살)
        // 메움. LashRenderer.RibbonRootTuck과 동일 원리 (사용자 판정 2026-07-21).
        const float BandTuck = 0.012f;        // 실기기 튜닝 대상

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;
        const float AlphaCutoutThreshold = 0.02f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _cornerLift; // 눈꼬리 띄우기(R7 워프) — 파라메트릭 라이너와 동일 정규화 리프트
        Texture2D _importedTex;

        static readonly int LineTexId = Shader.PropertyToID("_LineTex");
        static readonly int LineColorId = Shader.PropertyToID("_LineColor");
        static readonly int LineIntensityId = Shader.PropertyToID("_LineIntensity");
        static readonly int LumaKeyId = Shader.PropertyToID("_LumaKey");

        readonly Vector2[] _ctrl = new Vector2[CtrlPts];
        readonly Vector2[] _lo = new Vector2[Seg];
        readonly Vector2[] _up = new Vector2[Seg];
        // 상안검 9점의 점별 수직 지터를 코너 고정 아크 피팅으로 상쇄
        // (하안검 0f63e2c 패턴 — 계수 EMA 근거도 동일).
        const float FitEma = 0.4f;
        readonly LidArcFit[] _lidFit = { new LidArcFit(FitEma), new LidArcFit(FitEma) };

        void Awake() => Instance = this;

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (_importedTex != null) Destroy(_importedTex);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("EyelinerStyle");
            if (shader == null) shader = Shader.Find("ARMakeup/EyelinerStyle");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.EyelinerStyle; // 부위별 고유 큐

            // 기본 아이라인 텍스처(없으면 투명 — 임포트 전 아무것도 안 그려지게).
            var def = Resources.Load<Texture2D>("default_eyeliner");
            _material.SetTexture(LineTexId, def != null ? (Texture)def : ImageFileLoader.ClearTexture);
            _material.SetFloat(LumaKeyId, 0f);

            _mesh = new Mesh { name = "EyelinerStyle" };
            _mesh.MarkDynamic();

            var vc = Eyes * Seg * 2;
            var uvs = new Vector2[vc];
            var tris = new int[Eyes * (Seg - 1) * 6];
            for (var e = 0; e < Eyes; e++)
            {
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1); // 0 안쪽 → 1 바깥 윙
                    uvs[b + 2 * i] = new Vector2(along, 0f);     // 하단(속눈썹 라인)
                    uvs[b + 2 * i + 1] = new Vector2(along, 1f); // 상단
                }
                for (var i = 0; i < Seg - 1; i++)
                {
                    int lo0 = b + 2 * i, up0 = b + 2 * i + 1;
                    int lo1 = b + 2 * (i + 1), up1 = b + 2 * (i + 1) + 1;
                    var t = (e * (Seg - 1) + i) * 6;
                    tris[t] = lo0; tris[t + 1] = up0; tris[t + 2] = lo1;
                    tris[t + 3] = up0; tris[t + 4] = up1; tris[t + 5] = lo1;
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

        public void ApplyParams(string colorHex, float intensity, float cornerLift)
        {
            _intensity = Mathf.Clamp01(intensity);
            _cornerLift = Mathf.Clamp01(cornerLift);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(LineColorId, c);
            _material.SetFloat(LineIntensityId, _intensity);
        }

        /// <summary>사용자 임포트: 투명 PNG면 알파=라인, 흰 배경 그림/JPG면 어두운 픽셀=라인.</summary>
        public void SetTextureFromFile(string path)
        {
            if (_material == null) return;
            if (!ImageFileLoader.TryLoad(path, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"아이라인 스타일 임포트 실패: {error}" });
                return;
            }
            var lumaKey = ImageFileLoader.TransparentFraction(tex) < AlphaCutoutThreshold;
            _material.SetFloat(LumaKeyId, lumaKey ? 1f : 0f);

            if (_importedTex != null) Destroy(_importedTex);
            _importedTex = tex;
            _material.SetTexture(LineTexId, tex);
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible)
            {
                _lidFit[0].Reset(); // 재획득 시 스테일 계수에서 EMA 출발 방지
                _lidFit[1].Reset();
                return;
            }

            var lm = _source.Landmarks;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = UpperLids[e];
                var brow = BrowLower[e];
                var inner = ImgPt(lm, lids[LidPts - 1]);
                var outer = ImgPt(lm, lids[0]);
                var eyeDist = (outer - inner).magnitude;

                // 컨트롤 포인트: 안쪽 → 바깥 (속눈썹 라인).
                for (var j = 0; j < LidPts; j++)
                    _ctrl[j] = ImgPt(lm, lids[LidPts - 1 - j]);

                // "위" 기준: 눈썹에서 상안검으로 향하는 방향. 눈썹은 항상 눈 위라
                // 눈을 감아도 부호가 안 뒤집힌다(iris center 기준의 밴드 꼬임 회피).
                var lidMid = ImgPt(lm, lids[4]);
                var up = (ImgPt(lm, brow[2]) - lidMid).normalized;

                // 아크 피팅 — 9점의 수직 지터를 최소제곱 평균으로 상쇄. 리프트·윙
                // 계산 전에 적용해 이후 지오메트리가 안정된 라인에서 파생되게 한다.
                _lidFit[e].Apply(_ctrl, LidPts, up);

                // 눈꼬리 띄우기(R7 워프) — 바깥꼬리 쪽 컨트롤만 리프트. 윙 컨트롤은
                // 리프트된 코너에서 연장되므로 자동 추종한다.
                if (_cornerLift > 0f)
                    for (var j = 0; j < LidPts; j++)
                        _ctrl[j] = EyeWarp.LiftCorner(
                            _ctrl[j], j / (float)(LidPts - 1), up, eyeDist, _cornerLift);

                // 윙: 바깥 눈꼬리 접선을 위로 살짝 꺾어 연장.
                var outDir = (_ctrl[LidPts - 1] - _ctrl[LidPts - 2]).normalized;
                var wingDir = (outDir + up * WingRise).normalized;
                _ctrl[LidPts] = _ctrl[LidPts - 1] + wingDir * (eyeDist * WingLenFactor);

                SubdivideArc(_ctrl, CtrlPts, _lo);

                // 밴드 하단 턱 — 라이너가 눈알 쪽으로 살짝 내려가 랜드마크-육안 틈을 채운다.
                for (var i = 0; i < Seg; i++) _lo[i] -= up * (eyeDist * BandTuck);

                var width = eyeDist * BandHeightFactor;
                for (var i = 0; i < Seg; i++)
                {
                    var a = _lo[Mathf.Max(i - 1, 0)];
                    var bb = _lo[Mathf.Min(i + 1, Seg - 1)];
                    var tangent = (bb - a).normalized;
                    var normal = new Vector2(-tangent.y, tangent.x);
                    if (Vector2.Dot(normal, up) < 0f) normal = -normal;
                    var wFactor = 0.7f + 0.6f * (i / (float)(Seg - 1)); // 안쪽 얇게 → 윙 두껍게
                    _up[i] = _lo[i] + normal * (width * wFactor);
                }

                var depth = Depth(lm[lids[4]].z);
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    _vertices[b + 2 * i] = ImageToWorld(_lo[i], depth);
                    _vertices[b + 2 * i + 1] = ImageToWorld(_up[i], depth);
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
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

        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 img, float depth)
        {
            var vp = FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }
    }
}
