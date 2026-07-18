using System.Collections.Generic;
using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 눈썹 메이크업 "제품 스택". 눈썹 상·하단 랜드마크 아크로 만든 밴드 메시(공유)를
    /// 제품별 렌더러로 여러 번 그린다 — 실제로 여러 제품을 겹쳐 쓰듯이.
    ///
    /// 제품(아래→위 순서, 셰이더 Queue로 정렬):
    ///   컨실(BrowConceal) — "눈썹 지우기"(전체 컨실, 1급 기능): 자연 털 전체를 주변
    ///     피부색(GrabPass 오프셋 샘플)으로 지움. 제품 밴드보다 넓은 전용 무(無)셰이핑
    ///     밴드 — 큐 순서로 "지우고 그 위에 그리기" 밑작업. §15의 삐침 정리(자연눈썹
    ///     ∩ ¬새눈썹모양 protect 구멍 — 새 모양을 정점 채널에 베이크)는 미구현 후속
    ///     이며, 그 근사로 제품 최대 강도에 비례한 전역 감쇠(_BrowProductMax)만 적용.
    ///   라이트너 — 어두운 털을 피부톤으로 덮어 옅게 (밑작업/옅은 눈썹)
    ///   파우더   — 털 사이 빈 곳까지 부드럽게 채움
    ///   마스카라/젤 — 있는 털에만 색·볼륨 (결 보존)
    /// 각 제품은 독립 {색, 강도}로 켜고 겹칠 수 있다. 강도 0이면 그 제품 렌더 끔.
    ///
    /// 컨실을 별도 렌더러가 아니라 이 파일의 4번째 제품으로 넣은 근거: 아크 세분·
    /// 밴드 토폴로지·좌표 변환을 전부 공유하고(§15 "셰이핑식 공유 — 중복 구현 금지"),
    /// 부트스트랩(ARBootstrap — 타 트랙 사용 중이라 동결)에 새 배선이 필요 없다.
    ///
    /// 펜슬(절차적 스트로크)·스타일(텍스처 워프)은 밴드-필이 아니라 별도 지오메트리라
    /// 이 스택 밖의 컴포넌트로 추가 예정. 결 보존 틴트는 각 셰이더가 GrabPass 루마 보존.
    /// 좌표 매핑은 FramePresenter 공유. MediaPipe 전용.
    /// </summary>
    public class BrowRenderer : MonoBehaviour
    {
        public static BrowRenderer Instance { get; private set; }

        // 눈썹 아크 (바깥꼬리 → 안쪽머리). MediaPipe FACEMESH_*_EYEBROW 기준.
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
        // 라이트너용 피부색 샘플 (눈썹 위 이마 — 털 아닌 피부).
        static readonly int[] ForeheadSkin = { 9, 108, 337, 109, 338, 151 };

        const int ArcPts = 5;
        const int Sub = 3;
        const int Seg = (ArcPts - 1) * (Sub + 1) + 1; // 17
        const int Brows = 2;

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        // ── 눈썹 지우기(BrowConceal — 전체 컨실. §15 protect 구멍은 미구현 후속) ──
        // 컨실 밴드는 제품 밴드보다 넓게 — 그린 모양 밖으로 삐져나온 자연 털까지 덮는다.
        // 확장량은 로컬 밴드 두께(상·하 아크 거리, "눈썹폭") 대비 비율.
        const float ConcealExpandUp = 0.45f;    // 위(이마)쪽 확장 비율 // 실기기 튜닝 대상
        const float ConcealExpandDown = 0.35f;  // 아래(눈꺼풀)쪽 확장 비율 // 실기기 튜닝 대상
        // 피부색 샘플 오프셋 — 확장된 밴드 상단에서 위(이마)로 눈썹폭 × 이 값만큼 떨어진
        // 지점을 그 세로줄이 칠할 피부색으로 쓴다(눈썹 털 밖 보장, 조명 그라데이션 추종).
        const float ConcealSkinSampleUp = 0.8f; // 실기기 튜닝 대상

        // 셰이핑(공유, 파라미터): 두께 배수·아치 올림. 1.0/0.0 = 원래 모양.
        float _thickness = 1f;
        float _arch = 0f;
        int _shape = 0; // 눈썹 모양(#19b, 슬롯 공통): 0내추럴 1일자 2아치 3각진

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        Vector3[] _vertices;

        struct Product
        {
            public MeshRenderer renderer;
            public Material material;
            public float intensity;
        }
        Product _lightener, _powder, _mascara, _conceal;
        // 컨실 전용 밴드(제품 밴드보다 넓음, 셰이핑 미반영). uv1 = 피부 샘플 월드 좌표.
        Mesh _concealMesh;
        Vector3[] _concealVertices;
        List<Vector3> _concealSkinPos;

        static readonly int BrowColorId = Shader.PropertyToID("_BrowColor");
        static readonly int BrowIntensityId = Shader.PropertyToID("_BrowIntensity");
        static readonly int SkinColorId = Shader.PropertyToID("_SkinColor");
        static readonly int BrowProductMaxId = Shader.PropertyToID("_BrowProductMax");
        // 채움(파우더) 제형·마감 — 0=파우더/새틴=기존 출력(하위호환).
        static readonly int BrowPowderTextureId = Shader.PropertyToID("_BrowPowderTexture");
        static readonly int BrowPowderFinishId = Shader.PropertyToID("_BrowPowderFinish");
        static readonly int BrowPowderShimmerId = Shader.PropertyToID("_BrowPowderShimmer");
        // 마감(Tier B) — 결/지우개/라이트너. 0=새틴=기존 출력(하위호환). 세 머티리얼 독립.
        static readonly int BrowFinishId = Shader.PropertyToID("_BrowFinish");
        static readonly int ConcealFinishId = Shader.PropertyToID("_ConcealFinish");
        static readonly int LightenerFinishId = Shader.PropertyToID("_LightenerFinish");
        // 제형(텍스처) GENERIC — 결 틴트·눈썹 지우기·라이트너(세 머티리얼 독립). 0=크림=현행.
        static readonly int BrowTextureId = Shader.PropertyToID("_BrowTexture");
        static readonly int ConcealTextureId = Shader.PropertyToID("_ConcealTexture");
        static readonly int LightenerTextureId = Shader.PropertyToID("_LightenerTexture");

        readonly Vector2[] _up = new Vector2[Seg];
        readonly Vector2[] _lo = new Vector2[Seg];
        // 워프+꼬리 클램프된 아크(그리는 제품용) — 원시 _up/_lo는 컨실이 사용.
        readonly Vector2[] _upW = new Vector2[Seg];
        readonly Vector2[] _loW = new Vector2[Seg];

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            _mesh = new Mesh { name = "BrowBand" };
            _mesh.MarkDynamic();
            BuildTopology();

            // 컨실 밴드 — 제품 밴드와 지오메트리가 달라(넓은 무셰이핑 밴드 + 피부 샘플
            // 정점 채널) 전용 메시. 토폴로지(인덱스·uv0)는 제품 밴드와 동일 규약.
            _concealMesh = new Mesh { name = "BrowConcealBand" };
            _concealMesh.MarkDynamic();
            BuildConcealTopology();

            // 제품별 렌더러 4개 — 컨실만 전용 메시, 나머지는 밴드 메시 공유. Queue로 스택.
            _conceal = MakeProduct("BrowConceal", "BrowConceal", _concealMesh);
            _lightener = MakeProduct("BrowLightener", "BrowLightener", _mesh);
            _powder = MakeProduct("BrowPowder", "BrowPowder", _mesh);
            _mascara = MakeProduct("BrowMascara", "Brow", _mesh);
            // 부위별 고유 큐(MakeupQueues) — 컨실 → 라이트너 → 파우더 → 마스카라 순서 고정.
            _conceal.material.renderQueue = MakeupQueues.BrowConceal;
            _lightener.material.renderQueue = MakeupQueues.BrowLightener;
            _powder.material.renderQueue = MakeupQueues.BrowPowder;
            _mascara.material.renderQueue = MakeupQueues.BrowMascara;
        }

        Product MakeProduct(string goName, string shaderName, Mesh mesh)
        {
            var shader = Resources.Load<Shader>(shaderName);
            if (shader == null) shader = Shader.Find("ARMakeup/" + shaderName);
            var mat = new Material(shader);

            var go = new GameObject(goName);
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.enabled = false;
            return new Product { renderer = mr, material = mat, intensity = 0f };
        }

        // 컨실 밴드 토폴로지 — 제품 밴드(BuildTopology)와 동일 배열(브로우×Seg×2,
        // uv0.x=세로 0하→1상, uv0.y=가로) + uv1(TEXCOORD1)에 피부 샘플 월드 좌표.
        // 셰이더가 uv1을 GrabPass UV로 변환해 "그 세로줄 위 이마 픽셀"을 칠한다.
        void BuildConcealTopology()
        {
            var vc = Brows * Seg * 2;
            var uvs = new Vector2[vc];
            var tris = new int[Brows * (Seg - 1) * 6];
            for (var e = 0; e < Brows; e++)
            {
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1);
                    uvs[b + 2 * i] = new Vector2(0f, along);
                    uvs[b + 2 * i + 1] = new Vector2(1f, along);
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
            _concealVertices = new Vector3[vc];
            _concealSkinPos = new List<Vector3>(new Vector3[vc]);
            _concealMesh.vertices = _concealVertices;
            _concealMesh.uv = uvs;
            _concealMesh.SetUVs(1, _concealSkinPos);
            _concealMesh.triangles = tris;
        }

        void BuildTopology()
        {
            var vc = Brows * Seg * 2;
            var uvs = new Vector2[vc];
            var tris = new int[Brows * (Seg - 1) * 6];
            for (var e = 0; e < Brows; e++)
            {
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1);
                    uvs[b + 2 * i] = new Vector2(0f, along);
                    uvs[b + 2 * i + 1] = new Vector2(1f, along);
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
        }

        public void ApplyBrowParams(FilterParams p)
        {
            _thickness = Mathf.Clamp(p.browThickness, 0.4f, 2f);
            _arch = Mathf.Clamp(p.browArch, 0f, 1f);
            _shape = Mathf.Clamp(p.browShape, 0, 5);
            SetProduct(ref _mascara, p.browColor, p.browIntensity);
            // 결(마스카라/젤) 마감 — 0=새틴=기존 출력(하위호환).
            _mascara.material.SetFloat(BrowFinishId, p.browFinish);
            // 제형(텍스처) 결 틴트 — GENERIC(0=크림=현행, 하위호환).
            _mascara.material.SetFloat(BrowTextureId, p.browTexture);
            SetProduct(ref _powder, p.browPowderColor, p.browPowderIntensity);
            // 채움 제형(파우더/포마드/젤)·마감 — 생략(0)=기존 출력(하위호환).
            _powder.material.SetFloat(BrowPowderTextureId, p.browPowderTexture);
            _powder.material.SetFloat(BrowPowderFinishId, p.browPowderFinish);
            _powder.material.SetFloat(BrowPowderShimmerId, Mathf.Clamp01(p.browPowderShimmer));
            // 라이트너는 색이 아니라 피부톤을 쓰므로 강도만.
            _lightener.intensity = Mathf.Clamp01(p.browLightenerIntensity);
            _lightener.material.SetFloat(BrowIntensityId, _lightener.intensity);
            _lightener.material.SetFloat(LightenerFinishId, p.browLightenerFinish);
            // 제형(텍스처) 라이트너 — GENERIC(0=크림=현행, 하위호환).
            _lightener.material.SetFloat(LightenerTextureId, p.browLightenerTexture);
            // 컨실(눈썹 지우기)도 색 없음 — 피부색은 셰이더가 GrabPass 오프셋 UV에서 직접 샘플.
            _conceal.intensity = Mathf.Clamp01(p.browConcealIntensity);
            _conceal.material.SetFloat(BrowIntensityId, _conceal.intensity);
            _conceal.material.SetFloat(ConcealFinishId, p.browConcealFinish);
            // 제형(텍스처) 눈썹 지우기 — GENERIC(0=크림=현행, 하위호환).
            _conceal.material.SetFloat(ConcealTextureId, p.browConcealTexture);
            // 워시드아웃 완화(전역 근사 protect) — 제품을 진하게 그릴수록 그 아래
            // 컨실을 약화해 "피부 덮고 반투명 제품 얹기" 이중 처리를 완화한다. 감쇠
            // 계수는 셰이더 PROTECT_DAMP. 컨실 단독(제품 0)일 땐 감쇠 0 = 완전 지우개.
            // 공간 불균일 protect(새 눈썹 모양 베이크, §15 정식판)는 모양 텍스처가
            // 생기는 후속에서. 라이트너는 그 자체가 피부 커버라 제외.
            var maxProduct = Mathf.Max(
                Mathf.Max(Mathf.Clamp01(p.browIntensity), Mathf.Clamp01(p.browPowderIntensity)),
                Mathf.Max(Mathf.Clamp01(p.browPencilIntensity), Mathf.Clamp01(p.browStyleIntensity)));
            _conceal.material.SetFloat(BrowProductMaxId, maxProduct);
        }

        static void SetProduct(ref Product prod, string hex, float intensity)
        {
            prod.intensity = Mathf.Clamp01(intensity);
            if (!string.IsNullOrEmpty(hex) && ColorUtility.TryParseHtmlString(hex, out var c))
                prod.material.SetColor(BrowColorId, c);
            prod.material.SetFloat(BrowIntensityId, prod.intensity);
        }

        void LateUpdate()
        {
            var faceOn = _source != null && _source.HasFace && FramePresenter.Instance != null;
            var anyOn = faceOn && (_lightener.intensity > 0f || _powder.intensity > 0f ||
                                   _mascara.intensity > 0f || _conceal.intensity > 0f);

            SetEnabled(ref _lightener, anyOn && _lightener.intensity > 0f);
            SetEnabled(ref _powder, anyOn && _powder.intensity > 0f);
            SetEnabled(ref _mascara, anyOn && _mascara.intensity > 0f);
            SetEnabled(ref _conceal, anyOn && _conceal.intensity > 0f);
            if (!anyOn) return;

            var lm = _source.Landmarks;

            // 라이트너용 피부색 (이마 평균) — 프레임 있을 때만 갱신.
            if (_lightener.intensity > 0f && _source.HasPresentedFrame)
            {
                Vector3 sum = Vector3.zero;
                var n = 0;
                foreach (var idx in ForeheadSkin)
                {
                    var pt = lm[idx];
                    if (_source.TrySampleColor(pt.x, pt.y, out var r, out var g, out var bl))
                    {
                        sum += new Vector3(r, g, bl);
                        n++;
                    }
                }
                if (n > 0) _lightener.material.SetColor(SkinColorId,
                    new Color(sum.x / n, sum.y / n, sum.z / n, 1f));
            }

            // 밴드 정점 갱신 (모든 제품이 공유)
            for (var e = 0; e < Brows; e++)
            {
                SubdivideArc(lm, BrowUpper[e], _up);
                SubdivideArc(lm, BrowLower[e], _lo);
                // R7 두께/아치 + 모양 + 꼬리 처짐 클램프 — 그리는 제품은 워프·클램프된
                // 아크(_loW/_upW), 컨실은 원시 아크(_lo/_up) 유지. 클램프까지 별도
                // 배열인 이유: 컨실은 사용자의 실제(처진) 털 위치를 덮어야 하므로
                // 이상화된 밴드를 따라가면 진짜 꼬리 털을 놓친다(§15와 동일 논리).
                for (var i = 0; i < Seg; i++)
                {
                    _loW[i] = _lo[i];
                    _upW[i] = _up[i];
                    var along = i / (float)(Seg - 1);
                    BrowWarp.ShapeBand(
                        ref _loW[i], ref _upW[i], along, _thickness, _arch, _shape);
                    BrowWarp.TaperTail(ref _loW[i], ref _upW[i], along);
                }
                var browWarped = BrowWarp.WarpAndLiftDroopingTail(
                    _loW, _upW, Seg, lm, FramePresenter.Instance.ImageAspect);
                var depth = Depth(lm[BrowUpper[e][2]].z);
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    _vertices[b + 2 * i] = ImageToWorld(_loW[i], depth, browWarped);
                    _vertices[b + 2 * i + 1] = ImageToWorld(_upW[i], depth, browWarped);

                    // 컨실 밴드 — §15: 셰이핑(_thickness/_arch) 미반영(반영하면 그린
                    // 모양 밖으로 삐친 자연 털을 또 놓침). 원시 아크(_lo/_up)를 위·
                    // 아래로 확장하고, 세로줄마다 피부 샘플점(밴드 위 이마)을 uv1에 기록.
                    if (_conceal.intensity > 0f)
                    {
                        var lo = _lo[i];
                        var thick = _up[i] - lo; // 아래→위 로컬 두께 벡터
                        var loC = lo - thick * ConcealExpandDown;
                        var upC = _up[i] + thick * ConcealExpandUp;
                        var skinWorld = ImageToWorld(upC + thick * ConcealSkinSampleUp, depth);
                        _concealVertices[b + 2 * i] = ImageToWorld(loC, depth);
                        _concealVertices[b + 2 * i + 1] = ImageToWorld(upC, depth);
                        // 세로줄의 두 정점이 같은 샘플점 공유 → 줄 안은 균일, 가로로는
                        // 이마 조명 그라데이션을 따라간다.
                        _concealSkinPos[b + 2 * i] = skinWorld;
                        _concealSkinPos[b + 2 * i + 1] = skinWorld;
                    }
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
            if (_conceal.intensity > 0f)
            {
                _concealMesh.vertices = _concealVertices;
                _concealMesh.SetUVs(1, _concealSkinPos);
                _concealMesh.RecalculateBounds();
            }
        }

        static void SetEnabled(ref Product prod, bool on)
        {
            if (prod.renderer.enabled != on) prod.renderer.enabled = on;
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
