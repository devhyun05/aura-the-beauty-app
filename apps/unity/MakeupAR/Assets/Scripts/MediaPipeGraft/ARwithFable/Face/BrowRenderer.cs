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
        // 새 커버 프로필의 하단 안전 상한. 0.55h보다 넓히면 짙은 쌍꺼풀/아이라인을
        // 털로 오인할 위험이 커진다. 바깥 경계는 셰이더의 기존 0.20 페더를 유지한다.
        const float ConcealExpandDownCoverage = 0.55f;
        // 피부색 샘플 오프셋 — 확장된 밴드 상단에서 위(이마)로 눈썹폭 × 이 값만큼 떨어진
        // 지점을 그 세로줄이 칠할 피부색으로 쓴다(눈썹 털 밖 보장, 조명 그라데이션 추종).
        const float ConcealSkinSampleUp = 0.8f; // 실기기 튜닝 대상

        // 셰이핑(공유, 파라미터): 두께 배수·아치 올림. 1.0/0.0 = 원래 모양.
        float _thickness = 1f;
        float _arch = 0f;
        int _shape = 0; // 눈썹 모양(#19b, 슬롯 공통): 0내추럴 1일자 2아치 3각진
        int _thicknessProfile;
        float _expandUpper;
        float _expandLower;
        float _coverageMode;

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
        // uv2/TEXCOORD2: 확장 컨실 밴드 안에서 새 눈썹 제품이 차지하는 하·상 범위.
        // 컨실 셰이더가 이 구간을 보호해 "지우고 다시 그리기"의 백탁을 막는다.
        List<Vector2> _concealProtectRange;

        static readonly int BrowColorId = Shader.PropertyToID("_BrowColor");
        static readonly int BrowIntensityId = Shader.PropertyToID("_BrowIntensity");
        static readonly int SkinColorId = Shader.PropertyToID("_SkinColor");
        static readonly int BrowProductMaxId = Shader.PropertyToID("_BrowProductMax");
        static readonly int BrowCoverageModeId = Shader.PropertyToID("_BrowCoverageMode");
        static readonly int BrowCoverageDownId = Shader.PropertyToID("_BrowCoverageDown");
        static readonly int BrowProtectStyleTexId = Shader.PropertyToID("_BrowProtectStyleTex");
        static readonly int BrowProtectStyleVMinId = Shader.PropertyToID("_BrowProtectStyleVMin");
        static readonly int BrowProtectStyleVMaxId = Shader.PropertyToID("_BrowProtectStyleVMax");
        static readonly int BrowProtectStyleLumaKeyId = Shader.PropertyToID("_BrowProtectStyleLumaKey");
        static readonly int BrowProtectStyleWeightId = Shader.PropertyToID("_BrowProtectStyleWeight");
        static readonly int BrowProtectPowderWeightId = Shader.PropertyToID("_BrowProtectPowderWeight");
        static readonly int BrowProtectPencilWeightId = Shader.PropertyToID("_BrowProtectPencilWeight");
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
        static readonly int HairLoId = Shader.PropertyToID("_HairLo");
        static readonly int HairHiId = Shader.PropertyToID("_HairHi");
        static readonly int FillFloorId = Shader.PropertyToID("_FillFloor");
        static readonly int FeatherVId = Shader.PropertyToID("_FeatherV");
        static readonly int FeatherHId = Shader.PropertyToID("_FeatherH");

        readonly Vector2[] _up = new Vector2[Seg];
        readonly Vector2[] _lo = new Vector2[Seg];
        // 워프+꼬리 클램프된 아크(그리는 제품용) — 원시 _up/_lo는 컨실이 사용.
        readonly Vector2[] _upW = new Vector2[Seg];
        readonly Vector2[] _loW = new Vector2[Seg];
        readonly Vector2[] _coverageLo = new Vector2[Seg];

        void Awake() => Instance = this;
        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            var mesh = _mesh;
            var concealMesh = _concealMesh;
            var lightenerMaterial = _lightener.material;
            var powderMaterial = _powder.material;
            var mascaraMaterial = _mascara.material;
            var concealMaterial = _conceal.material;
            _mesh = null;
            _concealMesh = null;
            _lightener.material = null;
            _powder.material = null;
            _mascara.material = null;
            _conceal.material = null;
            DestroyOwned(mesh);
            DestroyOwned(concealMesh);
            DestroyOwned(lightenerMaterial);
            DestroyOwned(powderMaterial);
            DestroyOwned(mascaraMaterial);
            DestroyOwned(concealMaterial);
        }

        static void DestroyOwned(UnityEngine.Object owned)
        {
            if (owned == null) return;
            if (Application.isPlaying) Destroy(owned);
            else DestroyImmediate(owned);
        }

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
            _conceal.material.SetTexture(BrowProtectStyleTexId, Texture2D.blackTexture);
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
            var sideIds = new Vector4[vc];
            var tris = new int[Brows * (Seg - 1) * 6];
            for (var e = 0; e < Brows; e++)
            {
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1);
                    uvs[b + 2 * i] = new Vector2(0f, along);
                    uvs[b + 2 * i + 1] = new Vector2(1f, along);
                    sideIds[b + 2 * i] = new Vector4(e, 0f, 0f, 0f);
                    sideIds[b + 2 * i + 1] = new Vector4(e, 0f, 0f, 0f);
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
            _concealProtectRange = new List<Vector2>(new Vector2[vc]);
            _concealMesh.vertices = _concealVertices;
            _concealMesh.uv = uvs;
            _concealMesh.SetUVs(1, _concealSkinPos);
            _concealMesh.SetUVs(2, _concealProtectRange);
            _concealMesh.SetUVs(3, new List<Vector4>(sideIds));
            _concealMesh.triangles = tris;
        }

        void BuildTopology()
        {
            var vc = Brows * Seg * 2;
            var uvs = new Vector2[vc];
            var sideIds = new Vector4[vc];
            var tris = new int[Brows * (Seg - 1) * 6];
            for (var e = 0; e < Brows; e++)
            {
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1);
                    uvs[b + 2 * i] = new Vector2(0f, along);
                    uvs[b + 2 * i + 1] = new Vector2(1f, along);
                    sideIds[b + 2 * i] = new Vector4(e, 0f, 0f, 0f);
                    sideIds[b + 2 * i + 1] = new Vector4(e, 0f, 0f, 0f);
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
            _mesh.SetUVs(3, new List<Vector4>(sideIds));
            _mesh.triangles = tris;
        }

        public void ApplyBrowParams(FilterParams p)
        {
            _thickness = Mathf.Clamp(p.browThickness, 0.4f, 2f);
            _arch = Mathf.Clamp(p.browArch, 0f, 1f);
            _shape = Mathf.Clamp(p.browShape, 0, 5);
            ApplyBrowCoverage(p.browThicknessProfile, p.browExpandUpper, p.browExpandLower);
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
            // 커버 모드에서는 제품별 실제/보수적 실루엣만 보호한다. 스타일은 같은
            // 알파 텍스처, 파우더는 채움 밴드, 펜슬은 성긴 결 근사를 사용한다.
            // profile0은 모두 0이라 기존 전역 감쇠 출력이 정확히 유지된다.
            _conceal.material.SetFloat(BrowProtectStyleWeightId,
                Mathf.Clamp01(p.browStyleIntensity) * _coverageMode);
            _conceal.material.SetFloat(BrowProtectPowderWeightId,
                Mathf.Max(Mathf.Clamp01(p.browIntensity), Mathf.Clamp01(p.browPowderIntensity))
                * _coverageMode);
            _conceal.material.SetFloat(BrowProtectPencilWeightId,
                Mathf.Clamp01(p.browPencilIntensity) * _coverageMode);
        }

        public void ApplyExpertParams(float hairLo, float hairHi, float powderFillFloor,
                                      float lightenerHairLo, float lightenerHairHi,
                                      float concealHairLo, float concealHairHi,
                                      float concealFeatherV, float concealFeatherH)
        {
            _mascara.material.SetFloat(HairLoId, hairLo);
            _mascara.material.SetFloat(HairHiId, hairHi);
            _powder.material.SetFloat(FillFloorId, powderFillFloor);
            _lightener.material.SetFloat(HairLoId, lightenerHairLo);
            _lightener.material.SetFloat(HairHiId, lightenerHairHi);
            _conceal.material.SetFloat(HairLoId, concealHairLo);
            _conceal.material.SetFloat(HairHiId, concealHairHi);
            _conceal.material.SetFloat(FeatherVId, concealFeatherV);
            _conceal.material.SetFloat(FeatherHId, concealFeatherH);
        }

        /// <summary>StyleRenderer가 실제 표시 텍스처와 동일한 알파 계약을 명시 전달한다.</summary>
        public void SetStyleProtectMask(Texture styleTexture, float cropVMin, float cropVMax, bool lumaKey)
        {
            if (_conceal.material == null) return;
            _conceal.material.SetTexture(BrowProtectStyleTexId,
                styleTexture != null ? styleTexture : Texture2D.blackTexture);
            _conceal.material.SetFloat(BrowProtectStyleVMinId, Mathf.Clamp01(cropVMin));
            _conceal.material.SetFloat(BrowProtectStyleVMaxId,
                Mathf.Clamp(Mathf.Max(cropVMin, cropVMax), 0f, 1f));
            _conceal.material.SetFloat(BrowProtectStyleLumaKeyId, lumaKey ? 1f : 0f);
        }

        /// <summary>
        /// 공유 브리지의 두께 프로필/개인 상·하 커버 값을 제품 스택에 적용한다.
        /// profile 0 + delta 0은 기존 머티리얼 출력과 컨실 지오메트리를 정확히 유지한다.
        /// </summary>
        public void ApplyBrowCoverage(int thicknessProfile, float expandUpper, float expandLower)
        {
            _thicknessProfile = Mathf.Clamp(thicknessProfile, 0, 6);
            _expandUpper = Mathf.Clamp(expandUpper, -0.25f, 0.75f);
            _expandLower = Mathf.Clamp(expandLower, -0.25f, 0.75f);
            // 새 프로필은 즉시 정규 모드, profile0의 작은 개인 델타는 5% 구간에서
            // 페더/컨실 폭을 연속 전환해 슬라이더 첫 움직임의 팝을 없앤다.
            var manualCoverage = Mathf.Max(Mathf.Abs(_expandUpper), Mathf.Abs(_expandLower));
            _coverageMode = _thicknessProfile > 0 ? 1f : Mathf.Clamp01(manualCoverage / 0.05f);
            SetCoverageMaterial(_mascara.material);
            SetCoverageMaterial(_powder.material);
            SetCoverageMaterial(_lightener.material);
            SetCoverageMaterial(_conceal.material);
        }

        void SetCoverageMaterial(Material material)
        {
            material.SetFloat(BrowCoverageModeId, _coverageMode);
            material.SetFloat(BrowCoverageDownId,
                BrowWarp.EffectiveLowerCoverage(_thicknessProfile, _expandLower));
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
            BrowResponseReference.Apply(_conceal.material, lm);
            BrowResponseReference.Apply(_lightener.material, lm);
            BrowResponseReference.Apply(_powder.material, lm);
            BrowResponseReference.Apply(_mascara.material, lm);

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
                BrowWarp.SubdivideArc(lm, BrowUpper[e], _up);
                BrowWarp.SubdivideArc(lm, BrowLower[e], _lo);
                // R7 두께/아치 + 모양 + 꼬리 처짐 클램프 — 그리는 제품은 워프·클램프된
                // 아크(_loW/_upW), 컨실은 원시 아크(_lo/_up) 유지. 클램프까지 별도
                // 배열인 이유: 컨실은 사용자의 실제(처진) 털 위치를 덮어야 하므로
                // 이상화된 밴드를 따라가면 진짜 꼬리 털을 놓친다(§15와 동일 논리).
                for (var i = 0; i < Seg; i++)
                {
                    _loW[i] = _lo[i];
                    _upW[i] = _up[i];
                    var rawLo = _loW[i];
                    var rawUp = _upW[i];
                    var along = i / (float)(Seg - 1);
                    BrowWarp.ShapeBand(
                        ref _loW[i], ref _upW[i], along, _thickness, _arch, _shape,
                        _thicknessProfile, _expandUpper, _expandLower);
                    BrowWarp.TaperTail(ref _loW[i], ref _upW[i], along, _thicknessProfile,
                        BrowWarp.IsCoverageActive(_thicknessProfile, _expandUpper, _expandLower));
                    if (BrowWarp.IsCoverageActive(_thicknessProfile, _expandUpper, _expandLower))
                        BrowWarp.EnsureMinimumFinalBandSpan(ref _loW[i], ref _upW[i], rawLo, rawUp);
                    _coverageLo[i] = _loW[i];
                }
                var browWarped = BrowWarp.WarpAndLiftDroopingTail(
                    _loW, _upW, Seg, lm, FramePresenter.Instance.ImageAspect);
                if (BrowWarp.IsCoverageActive(_thicknessProfile, _expandUpper, _expandLower))
                    for (var i = 0; i < Seg; i++)
                        BrowWarp.RestoreCoverageLowerFloor(ref _loW[i], ref _upW[i], _coverageLo[i], _lo[i], _up[i], browWarped);
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
                        var concealExpandDown = Mathf.Lerp(
                            ConcealExpandDown, ConcealExpandDownCoverage, _coverageMode);
                        var loC = lo - thick * concealExpandDown;
                        var upC = _up[i] + thick * ConcealExpandUp;
                        var skinWorld = ImageToWorld(upC + thick * ConcealSkinSampleUp, depth);
                        _concealVertices[b + 2 * i] = ImageToWorld(loC, depth);
                        _concealVertices[b + 2 * i + 1] = ImageToWorld(upC, depth);
                        // 세로줄의 두 정점이 같은 샘플점 공유 → 줄 안은 균일, 가로로는
                        // 이마 조명 그라데이션을 따라간다.
                        _concealSkinPos[b + 2 * i] = skinWorld;
                        _concealSkinPos[b + 2 * i + 1] = skinWorld;

                        // 새 제품 밴드와 컨실 밴드를 최종 표시(FaceWarp) 공간으로 맞춘 뒤
                        // 컨실 세로 uv상의 target 범위를 구한다. 꼬리 안티-드룹까지 끝난
                        // _loW/_upW를 쓰므로 꼬리 제품 아래가 다시 하얘지지 않는다.
                        var loTarget = browWarped ? _loW[i] : DisplayedImagePoint(_loW[i]);
                        var upTarget = browWarped ? _upW[i] : DisplayedImagePoint(_upW[i]);
                        var protectRange = ProjectProtectRange(
                            DisplayedImagePoint(loC), DisplayedImagePoint(upC),
                            loTarget, upTarget, FramePresenter.Instance.ImageAspect);
                        _concealProtectRange[b + 2 * i] = protectRange;
                        _concealProtectRange[b + 2 * i + 1] = protectRange;
                    }
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
            if (_conceal.intensity > 0f)
            {
                _concealMesh.vertices = _concealVertices;
                _concealMesh.SetUVs(1, _concealSkinPos);
                _concealMesh.SetUVs(2, _concealProtectRange);
                _concealMesh.RecalculateBounds();
            }
        }

        static Vector2 DisplayedImagePoint(Vector2 point)
        {
            var warp = FaceWarpField.Instance;
            if (warp == null) return point;
            var warped = warp.Forward(point);
            return IsFinite(warped) ? warped : point;
        }

        static Vector2 ProjectProtectRange(
            Vector2 concealLo, Vector2 concealUp,
            Vector2 targetLo, Vector2 targetUp, float imageAspect)
        {
            if (!IsFinite(concealLo) || !IsFinite(concealUp) ||
                !IsFinite(targetLo) || !IsFinite(targetUp) ||
                !IsFinite(imageAspect) || imageAspect <= 1e-6f)
                return Vector2.zero;

            var basePoint = new Vector2(concealLo.x * imageAspect, concealLo.y);
            var axis = new Vector2(
                (concealUp.x - concealLo.x) * imageAspect,
                concealUp.y - concealLo.y);
            var axisSq = axis.sqrMagnitude;
            if (!IsFinite(axisSq) || axisSq <= 1e-12f) return Vector2.zero;

            var targetLoMetric = new Vector2(targetLo.x * imageAspect, targetLo.y) - basePoint;
            var targetUpMetric = new Vector2(targetUp.x * imageAspect, targetUp.y) - basePoint;
            var loUv = Vector2.Dot(targetLoMetric, axis) / axisSq;
            var upUv = Vector2.Dot(targetUpMetric, axis) / axisSq;
            if (!IsFinite(loUv) || !IsFinite(upUv)) return Vector2.zero;
            var minUv = Mathf.Clamp01(Mathf.Min(loUv, upUv));
            var maxUv = Mathf.Clamp01(Mathf.Max(loUv, upUv));
            return maxUv - minUv > 1e-4f ? new Vector2(minUv, maxUv) : Vector2.zero;
        }

        static bool IsFinite(float value) =>
            !float.IsNaN(value) && !float.IsInfinity(value);

        static bool IsFinite(Vector2 value) => IsFinite(value.x) && IsFinite(value.y);

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
