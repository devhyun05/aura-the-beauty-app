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

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;

        static readonly int LipColorId = Shader.PropertyToID("_LipColor");
        static readonly int LipIntensityId = Shader.PropertyToID("_LipIntensity");

        readonly Vector2[] _outerSnap = new Vector2[Ring];
        readonly float[] _outerOffEma = new float[Ring];
        bool _snapPrimed;
        // 스냅 2-pass 임시 버퍼 (점 위치·바깥방향·원시 오프셋).
        readonly Vector2[] _outerPtmp = new Vector2[Ring];
        readonly Vector2[] _outerDtmp = new Vector2[Ring];
        readonly float[] _outerRawTmp = new float[Ring];

        // 스플라인 컨트롤점(이미지 x,y + 깊이 z). 매 프레임 20점 채운 뒤 세분 리샘플.
        readonly Vector3[] _outerCtrl = new Vector3[Ring];
        readonly Vector3[] _innerCtrl = new Vector3[Ring];

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("Lip");
            if (shader == null) shader = Shader.Find("ARMakeup/Lip");
            _material = new Material(shader);

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
        }

        public void ApplyLipParams(string colorHex, float intensity)
        {
            _intensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(LipColorId, c);
            _material.SetFloat(LipIntensityId, _intensity);
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var lm = _source.Landmarks;

            ComputeOuterSnap(lm);

            // 20개 랜드마크(외곽 스냅 + 내곽)를 이미지 공간 컨트롤점으로.
            for (var i = 0; i < Ring; i++)
            {
                var outer = _outerSnap[i]; // 이미지 좌표(스냅)
                var inner = ImgPt(lm, LipsInner[i]);
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
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
        }

        /// <summary>외곽점을 버밀리언 경계(붉은기 급락)로 스냅. 이미지 공간.</summary>
        void ComputeOuterSnap(Vector3[] lm)
        {
            var haveFrame = EnableSnap && _source.HasPresentedFrame;

            Vector2 center = Vector2.zero;
            for (var i = 0; i < Ring; i++)
                center += ImgPt(lm, LipsOuter[i]) + ImgPt(lm, LipsInner[i]);
            center /= Ring * 2;
            var rad = 0f;
            for (var i = 0; i < Ring; i++)
                rad += Vector2.Distance(ImgPt(lm, LipsOuter[i]), center);
            rad /= Ring;

            // 1차: 점별 원시 스냅 오프셋 (+ 점 위치·바깥방향 임시 저장)
            for (var i = 0; i < Ring; i++)
            {
                var p = ImgPt(lm, LipsOuter[i]);
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
                if (!_snapPrimed) _outerOffEma[i] = sm;
                else _outerOffEma[i] = Mathf.Lerp(_outerOffEma[i], sm, SnapEma);
                _outerSnap[i] = _outerPtmp[i] + _outerDtmp[i] * _outerOffEma[i];
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
