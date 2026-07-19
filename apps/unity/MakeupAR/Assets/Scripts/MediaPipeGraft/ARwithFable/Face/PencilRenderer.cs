using System.Collections.Generic;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 눈썹 펜슬 — 절차적으로 개별 털 스트로크를 그린다("한올한올"). 눈썹 상·하단
    /// 아크로 밴드를 잡고, 그 위에 결 방향으로 가는 테이퍼 쿼드(털)를 뿌린다.
    ///
    /// 결 방향 모델: 앞머리(안쪽)는 수직으로, 꼬리(바깥)로 갈수록 바깥으로 스윕
    /// (부챗살). 각 스트로크는 랜드마크에 고정된 결정론적 해시로 위치·길이·각도를
    /// 조금씩 흔들어 자연스럽게 — 프레임마다 재생성해도 시드가 같아 안 떨린다.
    ///
    /// 색·강도는 파라미터. Pencil.shader가 GrabPass 루마 보존 색소로 칠한다.
    /// 밴드 제품(마스카라/파우더/라이트너)과 별개 컴포넌트로 스택 위에 얹힌다.
    /// </summary>
    public class PencilRenderer : MonoBehaviour
    {
        public static PencilRenderer Instance { get; private set; }

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
        const int ArcPts = 5;
        const int Sub = 3;
        const int Seg = (ArcPts - 1) * (Sub + 1) + 1; // 17
        const int Brows = 2;

        const int StrokesPerBrow = 60;  // 36은 1렬처럼 성김(실기기) — 다층 분포와 함께 증량
        const float LenMult = 0.9f;     // 밴드 높이 대비 털 길이
        const float WidthMult = 0.06f;  // 밴드 높이 대비 뿌리 폭
        // 뿌리 세로 분포(0 하단 → 1 상단) — 한 줄(BaseV 고정)이 아니라 밴드 전체에
        // 다층으로: 하단 밀도가 높도록 h^1.4 편향. 실제 눈썹의 2~3겹 결 재현.
        const float RootVMin = 0.06f;
        const float RootVSpan = 0.62f;
        const float SweepMax = 2.8f;    // 꼬리에서 바깥 스윕(~70°) — 1.8도 덜 누움(실기기 2차)
        const float SweepMin = 0.05f;   // 앞머리에서 거의 수직
        const float SweepCurve = 2.2f;  // u^n 비선형 — 수직 구간을 앞머리 근처로 좁힘

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _thickness = 1f; // R7 두께/아치 — BrowRenderer와 동일 워프(제품 동조)
        float _arch = 0f;
        int _shape = 0;        // 눈썹 모양(#19b) — BrowRenderer와 동일 값 공유
        int _browThicknessProfile;
        float _browExpandUpper;
        float _browExpandLower;

        static readonly int BrowColorId = Shader.PropertyToID("_BrowColor");
        static readonly int BrowIntensityId = Shader.PropertyToID("_BrowIntensity");
        static readonly int PencilFinishId = Shader.PropertyToID("_PencilFinish"); // 마감(Tier B, 0=새틴=기존)
        static readonly int PencilTextureId = Shader.PropertyToID("_PencilTexture"); // 제형(텍스처) GENERIC(0=크림=현행)

        readonly Vector2[] _up = new Vector2[Seg];
        readonly Vector2[] _lo = new Vector2[Seg];
        readonly Vector2[] _rawUp = new Vector2[Seg];
        readonly Vector2[] _rawLo = new Vector2[Seg];
        readonly Vector2[] _coverageLo = new Vector2[Seg];

        void Awake() => Instance = this;
        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (_mesh != null) Destroy(_mesh);
            if (_material != null) Destroy(_material);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("Pencil");
            if (shader == null) shader = Shader.Find("ARMakeup/Pencil");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.BrowPencil; // 부위별 고유 큐(구 +8 4중충돌 해소)

            _mesh = new Mesh { name = "BrowPencil" };
            _mesh.MarkDynamic();

            var strokes = Brows * StrokesPerBrow;
            var uvs = new Vector2[strokes * 4];
            var sideIds = new Vector4[strokes * 4];
            var tris = new int[strokes * 6];
            for (var s = 0; s < strokes; s++)
            {
                var v = s * 4;
                uvs[v] = new Vector2(0f, 0f);     // 뿌리-좌
                uvs[v + 1] = new Vector2(0f, 1f); // 뿌리-우
                uvs[v + 2] = new Vector2(1f, 0f); // 끝-좌
                uvs[v + 3] = new Vector2(1f, 1f); // 끝-우
                var side = s / StrokesPerBrow;
                sideIds[v] = sideIds[v + 1] = sideIds[v + 2] = sideIds[v + 3] =
                    new Vector4(side, 0f, 0f, 0f);
                var t = s * 6;
                tris[t] = v; tris[t + 1] = v + 2; tris[t + 2] = v + 1;
                tris[t + 3] = v + 1; tris[t + 4] = v + 2; tris[t + 5] = v + 3;
            }
            _vertices = new Vector3[strokes * 4];
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.SetUVs(3, new List<Vector4>(sideIds));
            _mesh.triangles = tris;

            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;
        }

        public void ApplyPencilParams(string colorHex, float intensity, float thickness, float arch, int shape, int finish, int texture,
                                      int thicknessProfile, float expandUpper, float expandLower)
        {
            _intensity = Mathf.Clamp01(intensity);
            // R7 두께/아치 — BrowRenderer와 동일 클램프. 밴드가 워프되면 스트로크도 따라간다.
            _thickness = Mathf.Clamp(thickness, 0.4f, 2f);
            _arch = Mathf.Clamp(arch, 0f, 1f);
            _shape = Mathf.Clamp(shape, 0, 5); // 모양(#19b, 슬롯 공통 — 4=상승 5=반달 포함)
            _browThicknessProfile = Mathf.Clamp(thicknessProfile, 0, 6);
            _browExpandUpper = Mathf.Clamp(expandUpper, -0.25f, 0.75f);
            _browExpandLower = Mathf.Clamp(expandLower, -0.25f, 0.75f);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(BrowColorId, c);
            _material.SetFloat(BrowIntensityId, _intensity);
            // 마감(Tier B) — Pencil.shader 인스턴스별 독립(펜슬 전용). 0=새틴=기존 출력.
            _material.SetFloat(PencilFinishId, finish);
            // 제형(텍스처) GENERIC — 펜슬 인스턴스 전용(마스카라 인스턴스는 미설정 0=무영향).
            _material.SetFloat(PencilTextureId, texture);
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var lm = _source.Landmarks;
            BrowResponseReference.Apply(_material, lm);
            var vi = 0;
            for (var e = 0; e < Brows; e++)
            {
                BrowWarp.SubdivideArc(lm, BrowUpper[e], _up);
                BrowWarp.SubdivideArc(lm, BrowLower[e], _lo);
                // R7 두께/아치와 공용 꼬리 테이퍼 — 밴드를 먼저 워프하면 SampleBand 기반
                // 스트로크의 뿌리 분포·길이·폭이 파우더 밴드와 함께 점진 축소된다.
                var shapeBand = _thickness != 1f || _arch != 0f || _shape != 0 ||
                    _browThicknessProfile != 0 || _browExpandUpper != 0f || _browExpandLower != 0f;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1);
                    var rawLo = _lo[i];
                    var rawUp = _up[i];
                    _rawLo[i] = rawLo;
                    _rawUp[i] = rawUp;
                    if (shapeBand)
                        BrowWarp.ShapeBand(
                            ref _lo[i], ref _up[i], along, _thickness, _arch, _shape,
                            _browThicknessProfile, _browExpandUpper, _browExpandLower);
                    BrowWarp.TaperTail(ref _lo[i], ref _up[i], along, _browThicknessProfile,
                        BrowWarp.IsCoverageActive(_browThicknessProfile, _browExpandUpper, _browExpandLower));
                    if (BrowWarp.IsCoverageActive(_browThicknessProfile, _browExpandUpper, _browExpandLower))
                        BrowWarp.EnsureMinimumFinalBandSpan(ref _lo[i], ref _up[i], rawLo, rawUp);
                    _coverageLo[i] = _lo[i];
                }
                // 꼬리 처짐 클램프 — 모양 확정 뒤 최종 얼굴 워프 공간에서 적용.
                var browWarped = BrowWarp.WarpAndLiftDroopingTail(
                    _lo, _up, Seg, lm, FramePresenter.Instance.ImageAspect);
                if (BrowWarp.IsCoverageActive(_browThicknessProfile, _browExpandUpper, _browExpandLower))
                    for (var i = 0; i < Seg; i++)
                        BrowWarp.RestoreCoverageLowerFloor(ref _lo[i], ref _up[i], _coverageLo[i], _rawLo[i], _rawUp[i], browWarped);
                var depth = Depth(lm[BrowUpper[e][2]].z);

                for (var s = 0; s < StrokesPerBrow; s++)
                {
                    // 결정론적 해시(스트로크별 흔들림 — 프레임 무관 시드).
                    var seed = s;
                    var h1 = Hash(seed * 2 + 1);
                    var h2 = Hash(seed * 2 + 7);
                    var h3 = Hash(seed * 2 + 13);
                    var h4 = Hash(seed * 2 + 29);

                    // 밴드 위 위치 u(0 꼬리 → 1 앞머리) + 약간 흔들기
                    var u = Mathf.Clamp01((s + 0.5f) / StrokesPerBrow + (h1 - 0.5f) * 0.5f / StrokesPerBrow);
                    SampleBand(u, e, out var lo, out var up, out var along);

                    var upDir = up - lo;
                    var bandH = upDir.magnitude;
                    if (bandH < 1e-6f) { EmitDegenerate(ref vi, lo, depth, browWarped); continue; }
                    var upN = upDir / bandH;

                    // 다층 뿌리 — 하단 밀도 편향(h^1.4). 위쪽 뿌리 털은 짧게(밴드 밖 삐짐 방지).
                    var rootV = RootVMin + RootVSpan * Mathf.Pow(h2, 1.4f);
                    var baseP = Vector2.Lerp(lo, up, rootV);
                    var tailDir = -along; // 꼬리 방향(u 감소 방향)
                    // 실제 눈썹 결: 수직은 앞머리 바로 근처뿐, 조금만 뒤로 가도 눕기
                    // 시작해 꼬리는 거의 수평. 선형 lerp는 중간 영역이 너무 서 있어서
                    // (실기기 "앞머리 뒤쪽도 다 수직") u^n으로 수직 구간을 앞머리에
                    // 몰아넣는다: u=0.9→32° u=0.8→48° u=0.5→65° 꼬리→70°.
                    var sweep = Mathf.Lerp(SweepMax, SweepMin, Mathf.Pow(u, SweepCurve)) + (h3 - 0.5f) * 0.3f;
                    var dir = (upN + sweep * tailDir).normalized;

                    var len = bandH * LenMult * (0.75f + 0.5f * h4) * (1f - 0.35f * rootV);
                    var tip = baseP + dir * len;
                    var perp = Perp(dir);
                    var w = bandH * WidthMult * (0.7f + 0.6f * h1);
                    var wTip = w * 0.15f;

                    _vertices[vi++] = ImageToWorld(baseP - perp * w, depth, browWarped);
                    _vertices[vi++] = ImageToWorld(baseP + perp * w, depth, browWarped);
                    _vertices[vi++] = ImageToWorld(tip - perp * wTip, depth, browWarped);
                    _vertices[vi++] = ImageToWorld(tip + perp * wTip, depth, browWarped);
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
        }

        void EmitDegenerate(ref int vi, Vector2 p, float depth, bool alreadyWarped)
        {
            var w = ImageToWorld(p, depth, alreadyWarped);
            _vertices[vi++] = w; _vertices[vi++] = w; _vertices[vi++] = w; _vertices[vi++] = w;
        }

        // 밴드를 u(0~1)에서 샘플: 하단·상단 점 + 진행 접선.
        void SampleBand(float u, int browSide, out Vector2 lo, out Vector2 up, out Vector2 along)
        {
            var f = Mathf.Clamp(u, 0f, 0.9999f) * (Seg - 1);
            var j0 = (int)f;
            var j1 = Mathf.Min(j0 + 1, Seg - 1);
            var t = f - j0;
            lo = Vector2.Lerp(_lo[j0], _lo[j1], t);
            up = Vector2.Lerp(_up[j0], _up[j1], t);
            along = _up[j1] - _up[j0];
            if (along.sqrMagnitude < 1e-12f)
            {
                // Closed/occluded landmark pair: search an adjacent valid segment before
                // using a bilateral fallback. The two brows get opposite fallback axes so
                // their tail sweep cannot both point screen-right.
                for (var radius = 1; radius < Seg; radius++)
                {
                    var a = Mathf.Max(0, j0 - radius);
                    var b = Mathf.Min(Seg - 1, j1 + radius);
                    var candidate = _up[b] - _up[a];
                    if (candidate.sqrMagnitude < 1e-12f) continue;
                    along = candidate;
                    break;
                }
                if (along.sqrMagnitude < 1e-12f)
                    along = browSide == 0 ? new Vector2(1f, 0f) : new Vector2(-1f, 0f);
            }
            along.Normalize();
        }

        static float Hash(int n)
        {
            var x = Mathf.Sin(n * 12.9898f) * 43758.5453f;
            return x - Mathf.Floor(x);
        }

        void SubdivideArc(Vector3[] lm, int[] arc, Vector2[] outp)
        {
            var n = arc.Length;
            var mi = 0;
            for (var i = 0; i < n - 1; i++)
            {
                var p1 = ImgPt(lm, arc[i]);
                var p2 = ImgPt(lm, arc[i + 1]);
                var p0 = i == 0 ? p1 : ImgPt(lm, arc[i - 1]);
                var p3 = i + 2 > n - 1 ? p2 : ImgPt(lm, arc[i + 2]);
                outp[mi++] = p1;
                for (var k = 1; k <= Sub; k++)
                    outp[mi++] = CatmullRom(p0, p1, p2, p3, k / (float)(Sub + 1));
            }
            outp[mi++] = ImgPt(lm, arc[n - 1]);
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        static Vector2 Perp(Vector2 v) => new Vector2(-v.y, v.x);
        static Vector2 ImgPt(Vector3[] lm, int idx) => new Vector2(lm[idx].x, lm[idx].y);
        float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 img, float depth, bool alreadyWarped = false)
        {
            var vp = alreadyWarped
                ? FramePresenter.Instance.WarpedImageToViewport(img)
                : FramePresenter.Instance.ImageToViewport(img);
            return _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, depth));
        }
    }
}
