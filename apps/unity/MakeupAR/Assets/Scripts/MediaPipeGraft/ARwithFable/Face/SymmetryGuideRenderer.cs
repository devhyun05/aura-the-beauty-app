using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 좌우 대칭 가이드 (#6) — 눈썹 그리기·아이라인처럼 좌우를 맞추기 어려운 작업에서
    /// "지금 왼쪽이 오른쪽보다 높다"를 실시간으로 보여주는 측정 오버레이.
    ///
    /// 두 가지를 그린다:
    ///  1) 얼굴 중심축(미드라인) — 이마 정수리(10)→미간(168)→코끝(4)→턱(152)을 잇는
    ///     세로선. 고개를 기울이면 축도 같이 기운다(고정 화면 세로선이 아님).
    ///  2) 대칭 쌍 커넥터 — 눈썹 산·눈꼬리·콧볼·입꼬리의 좌/우 점을 잇는 짧은 선.
    ///     각 점을 축에 투영한 위치 차(axial)를 얼굴 높이로 정규화한 값이 편차이고,
    ///     선 색이 초록(대칭)→빨강(비대칭)으로 변해 한눈에 어디가 틀어졌는지 보인다.
    ///
    /// 라인 드로잉은 StencilGuide.shader(정점색 리본)를 재사용하되 자체 머티리얼로
    /// 펄스·대시를 꺼 "측정선"답게 실선으로 둔다. 리본 빌더는 StencilGuideRenderer와
    /// 같은 구조를 복제했다(공유 승격은 타 렌더러 사용 중이라 보류 — 코드베이스 관행).
    ///
    /// 생성은 MakeupController.Init 부트스트랩(StencilGuide·Teeth 선례), MediaPipe 전용.
    /// </summary>
    public class SymmetryGuideRenderer : MonoBehaviour
    {
        public static SymmetryGuideRenderer Instance { get; private set; }

        // 얼굴 중심축 — 전부 정중선 위 랜드마크(이마→미간→코끝→턱).
        static readonly int[] Midline = { 10, 168, 4, 152 };
        const int ForeheadTop = 10, Chin = 152;

        // 대칭 쌍 (피사체 좌 인덱스, 우 인덱스) — 위→아래.
        static readonly int[,] Pairs =
        {
            { 105, 334 }, // 눈썹 산
            { 33, 263 },  // 눈 바깥꼬리
            { 129, 358 }, // 콧볼(알라)
            { 61, 291 },  // 입꼬리
        };

        const int MidSlot = 0;                 // 슬롯 0 = 미드라인
        const int PairSlot0 = 1;               // 슬롯 1.. = 쌍 커넥터
        const int PairCount = 4;
        const int MaxStrokes = 1 + PairCount;  // 5
        const int Pts = 40;

        const float RibbonWidthFactor = 0.014f; // 리본 반폭 = 눈간거리 × 이 값
        const float DevMax = 0.05f;             // 편차 정규화 상한(이 값에서 완전 빨강)

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;
        const int EyeOuterR = 33, EyeOuterL = 263;

        // 색: 미드라인=시안(중립), 커넥터=초록(대칭)↔빨강(비대칭) 보간.
        static readonly Color ColMidline = new Color(0.50f, 0.85f, 1.00f);
        static readonly Color ColLevel = new Color(0.25f, 0.90f, 0.45f);
        static readonly Color ColOff = new Color(1.00f, 0.32f, 0.32f);

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        Color32[] _colors;

        float _opacity;
        bool _midlineOn = true;
        bool _pairsOn = true;

        readonly Vector2[] _ctrl = new Vector2[8];
        readonly Vector2[] _fine = new Vector2[Pts];

        static readonly int OpacityId = Shader.PropertyToID("_Opacity");
        static readonly int PulseId = Shader.PropertyToID("_Pulse");
        static readonly int DashId = Shader.PropertyToID("_Dash");

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
            _material.SetFloat(PulseId, 0f); // 측정선 — 펄스·대시 끔(실선)
            _material.SetFloat(DashId, 0f);
            _material.SetFloat(Shader.PropertyToID("_SplitFollow"), 0f); // 양쪽 비교라 반반에 안 잘림

            _mesh = new Mesh { name = "SymmetryGuide" };
            _mesh.MarkDynamic();

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
            _colors = new Color32[vc];
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
        /// 대칭 가이드 상태 — 마스터 농도 + 미드라인/쌍 커넥터 on/off. 색은 편차에 따라
        /// 매 프레임 바뀌므로 LateUpdate가 기록하고, 여기선 농도·토글만 반영한다.
        /// </summary>
        public void ApplySymmetry(SymmetryParams p)
        {
            if (p == null) return;
            _opacity = Mathf.Clamp01(p.opacity);
            _midlineOn = p.midline;
            _pairsOn = p.pairs;
            if (_material != null) _material.SetFloat(OpacityId, _opacity);
        }

        void LateUpdate()
        {
            var anyOn = _midlineOn || _pairsOn;
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _opacity > 0f && anyOn;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var lm = _source.Landmarks;
            var eyeSpan = (ImgPt(lm, EyeOuterL) - ImgPt(lm, EyeOuterR)).magnitude;
            var halfW = eyeSpan * RibbonWidthFactor;

            // 얼굴 축(이마→턱) + 높이 — 편차 정규화 기준.
            var origin = ImgPt(lm, ForeheadTop);
            var chin = ImgPt(lm, Chin);
            var axisVec = chin - origin;
            var faceH = Mathf.Max(axisVec.magnitude, 1e-4f);
            var axis = axisVec / faceH;

            // 미드라인 — 정중선 랜드마크 폴리라인.
            if (_midlineOn)
            {
                for (var i = 0; i < Midline.Length; i++) _ctrl[i] = ImgPt(lm, Midline[i]);
                BuildStroke(Midline.Length, false, halfW,
                    DepthOfIndices(lm, Midline), MidSlot, ColMidline);
            }
            else CollapseSlot(MidSlot);

            // 대칭 쌍 커넥터 — 편차로 색을 매긴다(초록↔빨강).
            for (var k = 0; k < PairCount; k++)
            {
                var slot = PairSlot0 + k;
                if (!_pairsOn) { CollapseSlot(slot); continue; }
                var li = Pairs[k, 0];
                var ri = Pairs[k, 1];
                var lp = ImgPt(lm, li);
                var rp = ImgPt(lm, ri);
                var aL = Vector2.Dot(lp - origin, axis);
                var aR = Vector2.Dot(rp - origin, axis);
                var dev = Mathf.Abs(aL - aR) / faceH;
                var col = Color.Lerp(ColLevel, ColOff, Mathf.Clamp01(dev / DevMax));
                _ctrl[0] = lp; _ctrl[1] = rp;
                var depth = Depth((lm[li].z + lm[ri].z) * 0.5f);
                BuildStroke(2, false, halfW, depth, slot, col);
            }

            _mesh.vertices = _vertices;
            _mesh.colors32 = _colors;
            _mesh.RecalculateBounds();
        }

        /// <summary>
        /// _ctrl[0..n)를 Catmull-Rom으로 Pts개 리샘플한 뒤 접선 수직으로 ±halfW 벌려
        /// 리본 스트립을 만든다(슬롯 slot, 색 rgb·알파 불투명). n=2면 직선 커넥터.
        /// StencilGuideRenderer.BuildRing과 동일 구조(복제 — 코드베이스 관행).
        /// </summary>
        void BuildStroke(int n, bool closed, float halfW, float depth, int slot, Color rgb)
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

            var c32 = (Color32)rgb; // 알파는 아래서 255로 덮어씀
            var b = slot * Pts * 2;
            for (var i = 0; i < Pts; i++)
            {
                var prev = _fine[Mathf.Max(i - 1, 0)];
                var next = _fine[Mathf.Min(i + 1, Pts - 1)];
                var tangent = (next - prev);
                if (tangent.sqrMagnitude < 1e-10f) tangent = Vector2.right;
                tangent.Normalize();
                var normal = new Vector2(-tangent.y, tangent.x);
                _vertices[b + 2 * i] = ImageToWorld(_fine[i] + normal * halfW, depth);
                _vertices[b + 2 * i + 1] = ImageToWorld(_fine[i] - normal * halfW, depth);
                var col = new Color32(c32.r, c32.g, c32.b, 255);
                _colors[b + 2 * i] = col;
                _colors[b + 2 * i + 1] = col;
            }
        }

        void CollapseSlot(int slot)
        {
            var b = slot * Pts * 2;
            for (var i = 0; i < Pts * 2; i++)
            {
                _vertices[b + i] = Vector3.zero;
                _colors[b + i] = new Color32(0, 0, 0, 0); // 알파 0 = 안 보임
            }
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
    }
}
