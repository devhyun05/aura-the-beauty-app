using System.Collections.Generic;
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
    [DefaultExecutionOrder(-20)]
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
        // 눈꼬리 밖 연장 캔버스(눈꼬리 연장 테크닉) — 코너 접선 직선 연장 컬럼.
        // uv.x(along)가 1을 넘어 1+ExtFrac까지 이어지는 관례로 셰이더가 구간을 식별하고
        // 부위별로 게이트한다(컨실러·애교살 정지, 언더섀도 엣지 연장, 라이너 옵트인).
        const int ExtPts = 4;          // 연장 컬럼 수
        const float ExtFrac = 0.22f;   // 연장 길이(눈폭 배수) = along 1→1.22
        const float ExtHeightTaper = 0.4f; // 연장 far end 밴드 높이 비율(소멸감)
        const int Cols = Seg + ExtPts; // 총 컬럼 수(눈 + 연장)
        const int MaxLowerEyeshadowLayers = 8;

        const float BandHeightFactor = 0.45f; // 밴드 높이 = 눈 가로폭 × 이 값
        // LowerLid.shader 능선(하이라이트) 피크의 대표 raw v — 재설계로 롤이 얇아지고
        // lash 라인 쪽으로 붙어 피크가 위로 올라왔다(aegyoV 0.32 × AEGYO_BAND 0.50 ≈ 0.16).
        const float AegyoHighlightPeakV = 0.16f;
        // 온페이스 핏 핸들 대표 vv(밴드 상단 v=0 lash → 하단 v=1). 애교살 피크(.32)와
        // 겹치지 않게 세로로 분리한다: 아이라인(하)=lash 바로 아래, 아이섀도(하)=그 아래.
        const float EyelinerLowerPeakV = 0.10f;  // lash 라인 바로 아래
        const float EyeshadowLowerPeakV = 0.25f; // 섀도 밴드 대표
        const float TriangleZonePeakV = 0.25f;   // 삼각존(눈꼬리 쪽) 대표
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
        Texture2D _importedAegyo;
        Texture2D _runtimeConcealerFallback;
        Texture2D _importedLowerShadowMask; // 소유(교체·해제 시 파기)
        Texture2D _bundledLowerShadowMask;  // Resources 번들(lower_smoky_mask) — 파기 금지, 해제 복원용
        MakeupController _lowerLayerController;
        EyeshadowLayerParams[] _lastPendingLowerEyeshadowLayers;
        int _lowerEyeshadowLayerCount;
        RegionAffine _linerAffine = new RegionAffine { region = "eyelinerLower" };
        RegionAffine _aegyoAffine = new RegionAffine { region = "aegyo" };
        RegionAffine _triAffine = new RegionAffine { region = "triangleZone" };

        static readonly int LinerColorId = Shader.PropertyToID("_LinerColor");
        static readonly int LinerIntensityId = Shader.PropertyToID("_LinerIntensity");
        static readonly int AegyoHiColorId = Shader.PropertyToID("_AegyoHiColor");
        static readonly int AegyoShColorId = Shader.PropertyToID("_AegyoShColor");
        static readonly int AegyoIntensityId = Shader.PropertyToID("_AegyoIntensity");
        static readonly int AegyoProfileId = Shader.PropertyToID("_AegyoProfile");
        static readonly int AegyoTexId = Shader.PropertyToID("_AegyoTex");
        static readonly int AegyoStyleIntensityId = Shader.PropertyToID("_AegyoStyleIntensity");
        static readonly int AegyoHeightId = Shader.PropertyToID("_AegyoHeight");
        static readonly int TriColorId = Shader.PropertyToID("_TriColor");
        static readonly int TriIntensityId = Shader.PropertyToID("_TriIntensity");
        static readonly int ConcealerColorId = Shader.PropertyToID("_ConcealerColor");
        static readonly int ConcealerIntensityId = Shader.PropertyToID("_ConcealerIntensity");
        static readonly int ConcealerMaskId = Shader.PropertyToID("_ConcealerMask");
        static readonly int LowerSmokyMaskId = Shader.PropertyToID("_LowerSmokyMask");
        static readonly int LowerShadowColorId = Shader.PropertyToID("_LowerShadowColor");
        static readonly int LowerShadowIntensityId = Shader.PropertyToID("_LowerShadowIntensity");
        // 마감 — 애교살(하이라이트 밴드)·아이섀도 하. 블러셔와 동일 enum(0=새틴=기존 출력).
        static readonly int AegyoFinishId = Shader.PropertyToID("_AegyoFinish");
        static readonly int AegyoShimmerId = Shader.PropertyToID("_AegyoShimmer");
        static readonly int LowerShadowFinishId = Shader.PropertyToID("_LowerShadowFinish");
        static readonly int LowerShadowShimmerId = Shader.PropertyToID("_LowerShadowShimmer");
        // 아이라인(하)·삼각존·컨실러 마감 — 0=새틴=기존 출력(하위호환).
        static readonly int LinerFinishId = Shader.PropertyToID("_LinerFinish");
        static readonly int LinerShimmerId = Shader.PropertyToID("_LinerShimmer");
        static readonly int TriFinishId = Shader.PropertyToID("_TriFinish");
        static readonly int TriShimmerId = Shader.PropertyToID("_TriShimmer");
        static readonly int ConcealerFinishId = Shader.PropertyToID("_ConcealerFinish");
        // 핏(개인 공간 델타) 배수 — 자기 제품 세로 프로파일 폭만 스케일(1=원래).
        static readonly int LinerThicknessId = Shader.PropertyToID("_LinerThickness");
        static readonly int TriHeightId = Shader.PropertyToID("_TriHeight");
        static readonly int LowerShadowHeightId = Shader.PropertyToID("_LowerShadowHeight");
        // 제형(텍스처) — RN 부위별 template enum. -1=필드 부재/레거시 무변조.
        static readonly int LinerTextureId = Shader.PropertyToID("_LinerTexture");
        static readonly int AegyoTextureId = Shader.PropertyToID("_AegyoTexture");
        static readonly int TriTextureId = Shader.PropertyToID("_TriTexture");
        static readonly int LowerShadowTextureId = Shader.PropertyToID("_LowerShadowTexture");
        static readonly int ConcealerTextureId = Shader.PropertyToID("_ConcealerTexture");
        // 모양 축(W1+W2) — 부위별 실루엣 프리셋 enum. 0=현행 프로파일과 바이트 동일(하위호환).
        static readonly int AegyoShapeId = Shader.PropertyToID("_AegyoShape");
        static readonly int LinerSegmentId = Shader.PropertyToID("_LinerSegment");
        static readonly int LowerExtSpanId = Shader.PropertyToID("_LowerExtSpan");
        static readonly int LinerTailTraceId = Shader.PropertyToID("_LinerTailTrace");
        static readonly int LinerTailLenId = Shader.PropertyToID("_LinerTailLen");
        static readonly int TriShapeId = Shader.PropertyToID("_TriShape");
        static readonly int LowerShadowShapeId = Shader.PropertyToID("_LowerShadowShape");
        static readonly int LowerEsLayerColorId = Shader.PropertyToID("_LowerEsLayerColor");
        static readonly int LowerEsLayerColor2Id = Shader.PropertyToID("_LowerEsLayerColor2");
        static readonly int LowerEsLayerParamId = Shader.PropertyToID("_LowerEsLayerParam");
        static readonly int LowerEsLayerPhysicalId = Shader.PropertyToID("_LowerEsLayerPhysical");
        static readonly int LowerEsLayerFinishId = Shader.PropertyToID("_LowerEsLayerFinish");
        static readonly int LowerEsLayerParticleId = Shader.PropertyToID("_LowerEsLayerParticle");
        static readonly int LowerEsLayerMaterialId = Shader.PropertyToID("_LowerEsLayerMaterial");
        static readonly int LowerEsLayerParticleStyleId = Shader.PropertyToID("_LowerEsLayerParticleStyle");
        static readonly int LowerEsLayerParticleColorId = Shader.PropertyToID("_LowerEsLayerParticleColor");
        static readonly int LowerEsLayerCountId = Shader.PropertyToID("_LowerEsLayerCount");
        static readonly int LinerAffineId = Shader.PropertyToID("_LinerAffine");
        static readonly int LinerAffineRotId = Shader.PropertyToID("_LinerAffineRot");
        static readonly int AegyoAffineId = Shader.PropertyToID("_AegyoAffine");
        static readonly int AegyoAffineRotId = Shader.PropertyToID("_AegyoAffineRot");
        static readonly int TriAffineId = Shader.PropertyToID("_TriAffine");
        static readonly int TriAffineRotId = Shader.PropertyToID("_TriAffineRot");

        readonly Vector4[] _lowerEsLayerColors = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerColor2s = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerParams = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerPhysical = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerFinish = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerParticle = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerMaterial = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerParticleStyle = new Vector4[MaxLowerEyeshadowLayers];
        readonly Vector4[] _lowerEsLayerParticleColor = new Vector4[MaxLowerEyeshadowLayers];

        // 애교살 기본 색(LowerLid.shader Properties와 동치) — aegyoColor 빈 값일 때 되돌림.
        static readonly Color AegyoHiDefault = new Color(1.0f, 0.95f, 0.88f);
        static readonly Color AegyoShDefault = new Color(0.69f, 0.54f, 0.41f);

        readonly Vector2[] _ctrl = new Vector2[LidPts];
        readonly Vector2[] _lash = new Vector2[Seg];
        readonly float[][] _fitEma = { new float[2], new float[2] }; // [eye][k0, k1]
        bool _fitPrimed;
        // 애교살 SDF — FitArc가 이번 눈에 쓴 기준 프레임(밴드 로컬 좌표계 정의용). 곡선
        // 피팅을 재사용하되, 셰이더가 픽셀당 거리장을 계산할 수 있게 프레임·계수를 정점에
        // 실어 보낸다. FitArc(e) 직후 같은 e에서만 참조하는 스크래치라 눈당 한 벌로 충분.
        Vector2 _arcInner, _arcXAxis, _arcYAxis;
        float _arcL, _arcK0, _arcK1;
        // 정점당 밴드 로컬 좌표(uv1)와 눈당 곡선 계수(uv2, k0/k1/L/bandWidth). SetUVs로
        // 매 프레임 갱신(BrowRenderer concealSkinPos 선례와 동일 List 재사용 패턴).
        List<Vector2> _sdfLocalXY;
        List<Vector4> _sdfCurve;
        readonly Vector2[] _fitAegyoPeakVp = new Vector2[Eyes];
        readonly int[] _fitAegyoPeakFrame = { -1, -1 };
        readonly bool[] _fitAegyoPeakValid = new bool[Eyes];
        // 신규 핏 핸들 캐시(애교살 패턴 복제) — 아이라인(하)·아이섀도(하)·삼각존.
        readonly Vector2[] _fitEyelinerLowerVp = new Vector2[Eyes];
        readonly int[] _fitEyelinerLowerFrame = { -1, -1 };
        readonly bool[] _fitEyelinerLowerValid = new bool[Eyes];
        readonly Vector2[] _fitEyeshadowLowerVp = new Vector2[Eyes];
        readonly int[] _fitEyeshadowLowerFrame = { -1, -1 };
        readonly bool[] _fitEyeshadowLowerValid = new bool[Eyes];
        readonly Vector2[] _fitTriangleZoneVp = new Vector2[Eyes];
        readonly int[] _fitTriangleZoneFrame = { -1, -1 };
        readonly bool[] _fitTriangleZoneValid = new bool[Eyes];

        void Awake() => Instance = this;

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            ReleaseOwned(_importedAegyo);
            ReleaseOwned(_runtimeConcealerFallback);
            ReleaseOwned(_importedLowerShadowMask);
            ReleaseOwned(_material);
            ReleaseOwned(_mesh);
            _importedAegyo = null;
            _runtimeConcealerFallback = null;
            _importedLowerShadowMask = null;
            _material = null;
            _mesh = null;
        }

        static void ReleaseOwned(Object owned)
        {
            if (owned == null) return;
            if (Application.isPlaying) Destroy(owned);
            else DestroyImmediate(owned);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("LowerLid");
            if (shader == null) shader = Shader.Find("ARMakeup/LowerLid");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.LowerLid; // 부위별 고유 큐(섀도 위·스텐실 아래)
            // 애교살 베이크드 프로파일(절차 SDF 대체) — R 하이라이트 / G 아래그림자 / B 중앙펄.
            // 누락 시 "black"(전부 0)으로 남아 애교살이 안 그려질 뿐 크래시 없음.
            var aegyoProfile = Resources.Load<Texture2D>("aegyo_profile");
            if (aegyoProfile != null) _material.SetTexture(AegyoProfileId, aegyoProfile);
            // 임포트 전엔 투명 — 그림 없이 강도만 올라가도 아무것도 안 그려지게.
            _material.SetTexture(AegyoTexId, ImageFileLoader.ClearTexture);
            var concealerMask = Resources.Load<Texture2D>("Masks/concealer_under_eye");
            if (concealerMask == null)
            {
                _runtimeConcealerFallback = CreateConcealerFallbackMask();
                concealerMask = _runtimeConcealerFallback;
            }
            _material.SetTexture(ConcealerMaskId, concealerMask);
            // 스모키 언더 모양 마스크(profile 6). scripts/generate-lower-smoky-mask.py 생성.
            // 누락 시 셰이더 기본 "black"(전부 0)이라 스모키가 안 그려질 뿐 크래시 없음.
            // 임포트 마스크 해제 시 복원 원본으로 보관(SetLowerShadowMaskFromFile).
            _bundledLowerShadowMask = Resources.Load<Texture2D>("lower_smoky_mask");
            if (_bundledLowerShadowMask != null)
            {
                // 연장 캔버스(along>1)가 우측 엣지를 클램프 샘플하는 계약 — 임포터 기본
                // Repeat면 마스크 안쪽이 연장부로 타일링되므로 샘플러를 강제 고정.
                _bundledLowerShadowMask.wrapMode = TextureWrapMode.Clamp;
                _material.SetTexture(LowerSmokyMaskId, _bundledLowerShadowMask);
            }
            PushAffine(LinerAffineId, LinerAffineRotId, _linerAffine);
            PushAffine(AegyoAffineId, AegyoAffineRotId, _aegyoAffine);
            PushAffine(TriAffineId, TriAffineRotId, _triAffine);
            // 연장 캔버스 span — 셰이더 게이트가 along>1 구간 폭을 알도록 미러.
            _material.SetFloat(LowerExtSpanId, ExtFrac);

            _mesh = new Mesh { name = "LowerLid" };
            _mesh.MarkDynamic();

            var vc = Eyes * Cols * 2;
            var uvs = new Vector2[vc];
            var tris = new int[Eyes * (Cols - 1) * 6];
            for (var e = 0; e < Eyes; e++)
            {
                var b = e * Cols * 2;
                for (var i = 0; i < Cols; i++)
                {
                    // 눈 구간 0..1(코너), 연장 구간 1..1+ExtFrac — along>1이 셰이더의
                    // 연장 식별자. 연장은 물리 길이(눈폭 배수)에 비례해 균등 증가.
                    var along = i < Seg
                        ? i / (float)(Seg - 1)
                        : 1f + ExtFrac * (i - Seg + 1) / (float)ExtPts;
                    uvs[b + 2 * i] = new Vector2(along, 0f);     // 상단(하안검 lash 라인)
                    uvs[b + 2 * i + 1] = new Vector2(along, 1f); // 하단(아래 페이드 끝)
                }
                for (var i = 0; i < Cols - 1; i++)
                {
                    int la0 = b + 2 * i, lo0 = b + 2 * i + 1;
                    int la1 = b + 2 * (i + 1), lo1 = b + 2 * (i + 1) + 1;
                    var t = (e * (Cols - 1) + i) * 6;
                    tris[t] = la0; tris[t + 1] = lo0; tris[t + 2] = la1;
                    tris[t + 3] = lo0; tris[t + 4] = lo1; tris[t + 5] = la1;
                }
            }
            _vertices = new Vector3[vc];
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.triangles = tris;
            // 애교살 SDF 정점 채널 — 초기값은 0(애교살 강도 0이면 미사용). LateUpdate가 매
            // 프레임 실제 밴드 로컬 좌표·곡선 계수로 덮어쓴다.
            _sdfLocalXY = new List<Vector2>(new Vector2[vc]);
            _sdfCurve = new List<Vector4>(new Vector4[vc]);
            _mesh.SetUVs(1, _sdfLocalXY);
            _mesh.SetUVs(2, _sdfCurve);

            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;
        }

        /// <summary>공유 메시의 제품별 역아핀 유니폼만 갱신한다. 다른 하안검 부위는 유지된다.</summary>
        public void SetRegionAffine(RegionAffine source)
        {
            if (source == null) return;
            var affine = RegionAffineUtility.Sanitize(source);
            switch (affine.region)
            {
                case "eyelinerLower":
                    _linerAffine = affine;
                    PushAffine(LinerAffineId, LinerAffineRotId, affine);
                    break;
                case "aegyo":
                    _aegyoAffine = affine;
                    PushAffine(AegyoAffineId, AegyoAffineRotId, affine);
                    break;
                case "triangleZone":
                    _triAffine = affine;
                    PushAffine(TriAffineId, TriAffineRotId, affine);
                    break;
            }
        }

        void PushAffine(int vectorId, int rotationId, RegionAffine affine)
        {
            if (_material == null) return;
            _material.SetVector(vectorId, RegionAffineUtility.ToShaderVector(affine));
            _material.SetFloat(rotationId, affine.rot);
        }

        /// <summary>밴드가 살아있어 눈 열림 스텐실이 필요한가 (IrisRenderer가 조회).</summary>
        public bool NeedsEyeMask =>
            _aegyoIntensity > 0f || _linerIntensity > 0f || _aegyoStyleIntensity > 0f ||
            _triIntensity > 0f || _concealerIntensity > 0f || _lowerShadowIntensity > 0f ||
            _lowerEyeshadowLayerCount > 0;

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

        /// <summary>아이라인(하) 핏 핸들 — lash 라인 바로 아래(vv≈0.10) 중앙점(뷰포트).
        /// TryGetAegyoFitHandle과 동일한 스테일 가드(현재/직전 프레임만).</summary>
        public bool TryGetEyelinerLowerFitHandle(int eye, out Vector2 peakVp)
        {
            peakVp = Vector2.zero;
            if (eye < 0 || eye >= Eyes || _source == null || !_source.HasFace ||
                FramePresenter.Instance == null || !_fitEyelinerLowerValid[eye]) return false;
            var frame = _fitEyelinerLowerFrame[eye];
            if (frame < Time.frameCount - 1 || frame > Time.frameCount) return false;
            peakVp = _fitEyelinerLowerVp[eye];
            return true;
        }

        /// <summary>아이섀도(하) 핏 핸들 — 섀도 밴드 대표(vv≈0.25) 중앙점(뷰포트).</summary>
        public bool TryGetEyeshadowLowerFitHandle(int eye, out Vector2 peakVp)
        {
            peakVp = Vector2.zero;
            if (eye < 0 || eye >= Eyes || _source == null || !_source.HasFace ||
                FramePresenter.Instance == null || !_fitEyeshadowLowerValid[eye]) return false;
            var frame = _fitEyeshadowLowerFrame[eye];
            if (frame < Time.frameCount - 1 || frame > Time.frameCount) return false;
            peakVp = _fitEyeshadowLowerVp[eye];
            return true;
        }

        /// <summary>삼각존 핏 핸들 — 눈꼬리 쪽(along≈0.85, vv≈0.25) 밴드점(뷰포트).</summary>
        public bool TryGetTriangleZoneFitHandle(int eye, out Vector2 peakVp)
        {
            peakVp = Vector2.zero;
            if (eye < 0 || eye >= Eyes || _source == null || !_source.HasFace ||
                FramePresenter.Instance == null || !_fitTriangleZoneValid[eye]) return false;
            var frame = _fitTriangleZoneFrame[eye];
            if (frame < Time.frameCount - 1 || frame > Time.frameCount) return false;
            peakVp = _fitTriangleZoneVp[eye];
            return true;
        }

        /// <summary>삼각존 — 눈꼬리 바로 아래 좁은 삼각 음영(눈밑 전체 아님). 하안검 밴드의
        /// 꼬리 쪽(u 바깥 1/3)에 가중된 어두운 섀도 텀. 색·강도 독립(0=끔), 애교살/아이라인
        /// (하)과 같은 밴드에서 블렌드. 기본 딥브라운(#4A342A 계열)은 셰이더 기본값.</summary>
        public void ApplyTriangleZone(string colorHex, float intensity, int finish, float shimmer,
                                      float heightMult, int texture, int shape)
        {
            _triIntensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(TriColorId, c);
            _material.SetFloat(TriIntensityId, _triIntensity);
            // 마감 — 애교살과 동일 enum. 생략(0)=새틴=기존 출력(하위호환).
            _material.SetFloat(TriFinishId, finish);
            // 시머 게인은 finish=3에서만 실효. 다른 마감에서는 0을 명시해 스테일 누수도 차단한다.
            _material.SetFloat(TriShimmerId, finish == 3 ? Mathf.Clamp01(shimmer) : 0f);
            // 밴드 높이 배수(핏) — 생략 0은 미설정 → 1(원래). eyeshadowHeight 선례 클램프(0.3~2).
            _material.SetFloat(TriHeightId, heightMult <= 0f ? 1f : Mathf.Clamp(heightMult, 0.3f, 2f));
            // 삼각존 템플릿 — -1=필드 부재/레거시 무변조, 0=파우더, 1=크림.
            _material.SetFloat(TriTextureId, texture);
            // 모양(triangleZoneShape) — 0=기본=현행 바이트 동일 1=좁게 2=넓게.
            _material.SetFloat(TriShapeId, shape);
        }

        /// <summary>눈밑 컨실러(§08) — 언더아이 홀로우(눈물고랑)를 밝히는 넓고 부드러운
        /// 브라이튼. 애교살 하이라이트(도톰한 리본)보다 세로로 넓고 페더 강한 벨 프로파일로
        /// lash 라인 아래 홀로우를 해부학 마스크로 덮는다. concealerColor 색조 + 피드 명암 보존 타깃,
        /// concealerIntensity 강도. 애교살과 독립(둘 다 켜도 밴드에서 자연 합성). 색은 밝은
        /// 톤이라 색 반전 없음(FaceMakeup 눈밑 존 마스크 경로의 밴드 정식판). 0=끔.
        /// shape=1(붉은기 자동)은 FaceMakeup 전담이라 여기 강도는 0으로 들어온다.</summary>
        public void ApplyConcealer(string colorHex, float intensity, int finish, int texture)
        {
            if (float.IsNaN(intensity) || float.IsInfinity(intensity)) intensity = 0f;
            _concealerIntensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var c))
                _material.SetColor(ConcealerColorId, c);
            _material.SetFloat(ConcealerIntensityId, _concealerIntensity);
            // 마감 — FaceMakeup 붉은기 자동 경로와 같은 필드(concealerFinish) 공용. 0=새틴=기존.
            _material.SetFloat(ConcealerFinishId, finish);
            // 컨실러 템플릿 — -1=필드 부재/레거시 무변조, FaceMakeup 경로와 enum 값 공유.
            _material.SetFloat(ConcealerTextureId, texture);
        }

        /// <summary>Resources 마스크 누락 시에도 물선·눈꼬리·볼을 피하는 유한 해부학 밴드.</summary>
        static Texture2D CreateConcealerFallbackMask()
        {
            const int width = 128;
            const int height = 64;
            var texture = new Texture2D(width, height, TextureFormat.R8, false, true)
            {
                name = "ConcealerUnderEye_AnalyticFallback",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };
            var pixels = new byte[width * height];
            for (var y = 0; y < height; y++)
            {
                var textureV = y / (float)(height - 1);
                var anatomicalV = 1f - textureV; // PNG top=waterline, Unity texture bottom=cheek
                var vertical = SmoothGate(0.16f, 0.28f, anatomicalV) *
                               (1f - SmoothGate(0.60f, 0.72f, anatomicalV));
                for (var x = 0; x < width; x++)
                {
                    var along = x / (float)(width - 1);
                    var horizontal = SmoothGate(0.10f, 0.22f, along) *
                                     (1f - SmoothGate(0.66f, 0.78f, along));
                    var troughCenter = 0.34f + 0.12f * along;
                    var delta = (anatomicalV - troughCenter) / 0.20f;
                    var trough = Mathf.Exp(-0.5f * delta * delta);
                    pixels[y * width + x] = (byte)Mathf.RoundToInt(
                        Mathf.Clamp01(horizontal * vertical * trough) * 255f);
                }
            }
            texture.SetPixelData(pixels, 0);
            texture.Apply(false, false);
            return texture;
        }

        static float SmoothGate(float lo, float hi, float value) =>
            Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(lo, hi, value));

        /// <summary>Phase B lower/both 아이섀도 배열을 하안검 단일 드로우콜 유니폼으로 기록.</summary>
        public void SetEyeshadowLayers(EyeshadowLayerParams[] layers)
        {
            if (_material == null) return;
            var count = 0;
            var sourceCount = layers != null ? layers.Length : 0;
            for (var sourceIndex = 0;
                 sourceIndex < sourceCount && count < MaxLowerEyeshadowLayers;
                 sourceIndex++)
            {
                var item = layers[sourceIndex];
                if (item == null || !(item.surface == 1 || item.surface == 2)) continue;

                var profile = item.profile == 0 && item.shape != 0 ? item.shape : item.profile;
                var color = Color.white;
                if (!string.IsNullOrEmpty(item.color) &&
                    !ColorUtility.TryParseHtmlString(item.color, out color)) color = Color.white;
                var color2 = color;
                if (!string.IsNullOrEmpty(item.color2) &&
                    !ColorUtility.TryParseHtmlString(item.color2, out color2)) color2 = color;

                _lowerEsLayerColors[count] = new Vector4(
                    color.r, color.g, color.b,
                    Mathf.Clamp(FiniteOrLower(item.intensity, 0f), 0f, 1.5f));
                _lowerEsLayerColor2s[count] = new Vector4(color2.r, color2.g, color2.b, 1f);
                _lowerEsLayerParams[count] = new Vector4(
                    Mathf.Clamp(profile, 0, 11),
                    Mathf.Clamp(item.finish, 0, 3),
                    Mathf.Clamp01(FiniteOrLower(item.gradient, 0f)),
                    Mathf.Clamp(FiniteOrLower(item.height, 1f), 0.25f, 2f));
                _lowerEsLayerPhysical[count] = new Vector4(
                    Mathf.Clamp(item.texture, -1, 2),
                    Mathf.Clamp01(FiniteOrLower(item.shimmer, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.glossLo, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.glossGain, 0f)));
                _lowerEsLayerFinish[count] = new Vector4(
                    Mathf.Clamp01(FiniteOrLower(item.shimmerSize, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.shimmerDensity, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.matte, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.sheen, 0f)));
                _lowerEsLayerParticle[count] = new Vector4(
                    Mathf.Clamp01(FiniteOrLower(item.particleSize, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.particleDensity, 0f)), 0f, 0f);
                _lowerEsLayerMaterial[count] = new Vector4(
                    Mathf.Clamp(item.material, 0, 4),
                    Mathf.Clamp01(FiniteOrLower(item.materialStrength, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.particleBrightness, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.particleTwinkle, 0f)));
                _lowerEsLayerParticleStyle[count] = new Vector4(
                    Mathf.Clamp01(FiniteOrLower(item.particleShape, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.particleFeather, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.particleParallax, 0f)),
                    Mathf.Clamp01(FiniteOrLower(item.particleConfetti, 0f)));
                Color particleColor = new Color32(255, 242, 217, 255);
                if (!string.IsNullOrEmpty(item.particleColor) &&
                    ColorUtility.TryParseHtmlString(item.particleColor, out var parsedParticleColor))
                    particleColor = parsedParticleColor;
                _lowerEsLayerParticleColor[count] = new Vector4(
                    particleColor.r, particleColor.g, particleColor.b, particleColor.a);
                count++;
            }

            for (var slot = count; slot < MaxLowerEyeshadowLayers; slot++)
            {
                _lowerEsLayerColors[slot] = Vector4.zero;
                _lowerEsLayerColor2s[slot] = Vector4.zero;
                _lowerEsLayerParams[slot] = Vector4.zero;
                _lowerEsLayerPhysical[slot] = new Vector4(-1f, 0f, 0f, 0f);
                _lowerEsLayerFinish[slot] = Vector4.zero;
                _lowerEsLayerParticle[slot] = Vector4.zero;
                _lowerEsLayerMaterial[slot] = Vector4.zero;
                _lowerEsLayerParticleStyle[slot] = Vector4.zero;
                _lowerEsLayerParticleColor[slot] = Vector4.zero;
            }

            _lowerEyeshadowLayerCount = count;
            _material.SetVectorArray(LowerEsLayerColorId, _lowerEsLayerColors);
            _material.SetVectorArray(LowerEsLayerColor2Id, _lowerEsLayerColor2s);
            _material.SetVectorArray(LowerEsLayerParamId, _lowerEsLayerParams);
            _material.SetVectorArray(LowerEsLayerPhysicalId, _lowerEsLayerPhysical);
            _material.SetVectorArray(LowerEsLayerFinishId, _lowerEsLayerFinish);
            _material.SetVectorArray(LowerEsLayerParticleId, _lowerEsLayerParticle);
            _material.SetVectorArray(LowerEsLayerMaterialId, _lowerEsLayerMaterial);
            _material.SetVectorArray(LowerEsLayerParticleStyleId, _lowerEsLayerParticleStyle);
            _material.SetVectorArray(LowerEsLayerParticleColorId, _lowerEsLayerParticleColor);
            _material.SetInt(LowerEsLayerCountId, count);
        }

        static float FiniteOrLower(float value, float fallback) =>
            float.IsNaN(value) || float.IsInfinity(value) ? fallback : value;

        void SyncPendingLowerEyeshadowLayers()
        {
            var controller = _lowerLayerController;
            if (controller == null)
            {
                controller = FindAnyObjectByType<MakeupController>();
                _lowerLayerController = controller;
            }
            if (controller == null) return;
            var pending = controller.PendingLowerEyeshadowLayers;
            if (ReferenceEquals(pending, _lastPendingLowerEyeshadowLayers)) return;
            _lastPendingLowerEyeshadowLayers = pending;
            SetEyeshadowLayers(pending);
        }

        /// <summary>A3 아이섀도 하 — 하안검 lash 라인 아래로 부드럽게 페이드하는 섀도 밴드.
        /// 애교살/아이라인보다 아래(먼저)에 곱 블렌드로 깔려 위 제품이 섀도 위로 뜬다. 색·강도
        /// 독립(0=끔, 기존 룩 불변). ApplyConcealer와 동일 패턴.</summary>
        public void ApplyLowerShadow(string colorHex, float intensity, int finish, float shimmer, float heightMult, int texture, int shape)
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
            // 밴드 높이 배수(핏) — 생략 0은 미설정 → 1(원래). eyeshadowHeight 선례 클램프(0.3~2).
            _material.SetFloat(LowerShadowHeightId, heightMult <= 0f ? 1f : Mathf.Clamp(heightMult, 0.3f, 2f));
            // 하단 아이섀도 템플릿 — -1=필드 부재/레거시 무변조, eyeshadowLowerTexture enum 값.
            _material.SetFloat(LowerShadowTextureId, texture);
            // 모양(eyeshadowLowerShape) — 0=기본밴드=현행 바이트 동일 1=넓게 2=꼬리집중.
            _material.SetFloat(LowerShadowShapeId, shape);
        }

        /// <summary>아이라인(하) 색은 상안검 아이라이너와 공용(eyelinerColor). aegyoColor는
        /// 애교살 틴트 — 빈 값이면 기본 상수로 되돌리고(룩 전환 시 이전 색 누수 방지), 값이
        /// 있으면 하이라이트=그 색·섀도=파생(톤다운).</summary>
        public void ApplyParams(
            float aegyoIntensity, string linerColorHex, float linerIntensity, float cornerLift,
            float heightMult, float aegyoStyleIntensity, string aegyoColor,
            int aegyoFinish, float aegyoShimmer, float linerThickness,
            int linerFinish, float linerShimmer, int linerTexture, int aegyoTexture,
            int aegyoShape, int linerSegment,
            float linerTailTrace = 0f, float linerTailLen = 0f)
        {
            _aegyoIntensity = Mathf.Clamp01(aegyoIntensity);
            _linerIntensity = Mathf.Clamp01(linerIntensity);
            _aegyoStyleIntensity = Mathf.Clamp01(aegyoStyleIntensity);
            _cornerLift = Mathf.Clamp01(cornerLift);
            // 밴드 높이 배수 핸들(애교살 두께) — JsonUtility 생략 0은 미설정 → 1(원래).
            // 하한 0.25 = "아주 얇은 애교살"까지 허용 (RN 슬라이더 하한 0.3보다 여유).
            var aegyoHeight = heightMult <= 0f ? 1f : Mathf.Clamp(heightMult, 0.25f, 2f);
            if (_material == null) return;
            // 애교살 높이는 공유 메시가 아니라 애교살 SDF 두께에만 적용한다. 컨실러·하라이너·
            // 삼각존·하섀도의 해부학적 캔버스가 애교살 설정에 따라 늘어나는 것을 방지한다.
            _material.SetFloat(AegyoHeightId, aegyoHeight);
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
            _material.SetFloat(AegyoStyleIntensityId, _aegyoStyleIntensity);
            // 마감 — 애교살 하이라이트 밴드(시머=펄 애교살). 0=새틴=기존 출력(하위호환).
            _material.SetFloat(AegyoFinishId, aegyoFinish);
            _material.SetFloat(AegyoShimmerId, Mathf.Clamp01(aegyoShimmer));
            // 아이라이너(하) 두께 배수(핏) — 생략 0은 미설정 → 1(원래). eyelinerThickness 선례 클램프(0.3~2.5).
            _material.SetFloat(LinerThicknessId, linerThickness <= 0f ? 1f : Mathf.Clamp(linerThickness, 0.3f, 2.5f));
            // 아이라인(하) 마감 — 시머 게인은 finish=3에서만 실효.
            _material.SetFloat(LinerFinishId, linerFinish);
            _material.SetFloat(LinerShimmerId, linerFinish == 3 ? Mathf.Clamp01(linerShimmer) : 0f);
            // -1=필드 부재/레거시 무변조, 명시 0/1/2만 펜슬/스머지/글리터 시드 적용.
            _material.SetFloat(LinerTextureId, linerTexture);
            // 제형(텍스처, 애교살) — -1=필드 부재/레거시 무변조.
            _material.SetFloat(AegyoTextureId, aegyoTexture);
            // 모양 — 애교살 실루엣(0=초승달=현행 바이트 동일 1=일자 2=중앙도톰) + 하안검
            // 라이너 구간(0=전체=현행 바이트 동일 1=꼬리만 2=앞+꼬리).
            _material.SetFloat(AegyoShapeId, aegyoShape);
            _material.SetFloat(LinerSegmentId, linerSegment);
            // 눈꼬리 연장 테크닉 — 트레이스(삼각존 하단 따라 그리기)·꼬리 연장 길이.
            // JsonUtility 생략 0 = 끔(현행 바이트 동일).
            _material.SetFloat(LinerTailTraceId, Mathf.Clamp01(linerTailTrace));
            _material.SetFloat(LinerTailLenId, Mathf.Clamp01(linerTailLen));
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

        /// <summary>아래 섀도 실루엣 마스크 임포트(§16 하부 확장) — 하안검 밴드 UV
        /// (x=안쪽 눈머리0→바깥 눈꼬리1, PNG 상단=lash 라인, 셰이더가 1-v 플립)로 샘플하는
        /// 흑백/알파 스텐실. 전 하부 룩이 공용하는 _LowerSmokyMask 실루엣을 런타임 스왑한다 —
        /// 색·강도·핏높이(_LowerShadowHeight) 축은 앱이 유지(마스크=색 없는 존). 컬러 아트면
        /// TryLoadMask가 거부. 빈 경로 = 번들 기본(lower_smoky_mask) 복원(회귀 0).
        /// setRegionMask region="eyeshadowLower"로 라우팅.</summary>
        public void SetLowerShadowMaskFromFile(string path)
        {
            if (_material == null) return;
            if (string.IsNullOrEmpty(path))
            {
                ReleaseOwned(_importedLowerShadowMask);
                _importedLowerShadowMask = null;
                // 번들 부재 시 셰이더 기본과 동일한 black — 스모키만 안 그려질 뿐 안전.
                _material.SetTexture(LowerSmokyMaskId,
                    _bundledLowerShadowMask != null ? _bundledLowerShadowMask : Texture2D.blackTexture);
                return;
            }
            if (!ImageFileLoader.TryLoadMask(path, out var mask, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"아래 섀도 마스크 임포트 실패: {error}" });
                return;
            }
            ReleaseOwned(_importedLowerShadowMask);
            _importedLowerShadowMask = mask;
            _material.SetTexture(LowerSmokyMaskId, mask);
        }

        void LateUpdate()
        {
            SyncPendingLowerEyeshadowLayers();
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null &&
                          (_aegyoIntensity > 0f || _linerIntensity > 0f ||
                           _aegyoStyleIntensity > 0f || _triIntensity > 0f ||
                           _concealerIntensity > 0f || _lowerShadowIntensity > 0f ||
                           _lowerEyeshadowLayerCount > 0);
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

                var width = eyeDist * BandHeightFactor; // 공유 캔버스는 제품별 높이 핸들과 독립
                var depth = Depth(lm[lids[4]].z);
                var b = e * Cols * 2;
                var triIdx = Mathf.RoundToInt(0.85f * (Seg - 1)); // 삼각존(눈꼬리 쪽)
                var eyeXAxis = (_lash[Seg - 1] - _lash[0]).normalized;
                // 연장 컬럼과 공유하는 현(chord) 법선 — 코너 진입 구간 블렌드 기준.
                var chordNrm = new Vector2(-eyeXAxis.y, eyeXAxis.x);
                if (Vector2.Dot(chordNrm, down) < 0f) chordNrm = -chordNrm;
                var affineCenter = Vector2.zero;
                // 애교살 SDF 곡선 계수(눈당 상수) — bandWidth = 이번 눈의 밴드 세로 폭(width).
                var curveVec = new Vector4(_arcK0, _arcK1, _arcL, width);
                for (var i = 0; i < Seg; i++)
                {
                    var a = _lash[Mathf.Max(i - 1, 0)];
                    var bb = _lash[Mathf.Min(i + 1, Seg - 1)];
                    var tangent = (bb - a).normalized;
                    var normal = new Vector2(-tangent.y, tangent.x);
                    if (Vector2.Dot(normal, down) < 0f) normal = -normal; // 아래쪽 법선 규약
                    // 코너 진입 구간(마지막 4컬럼)은 법선을 연장 컬럼의 현 법선으로 블렌드.
                    // 국소 법선(코너에서 회전)↔연장 현 법선의 불연속으로 밴드 하단이
                    // 경계에서 겹쳐 접히는 것 방지(실기기: 꼬리 연장 고강도에서 재현).
                    if (i >= Seg - 4)
                        normal = Vector2.Lerp(normal, chordNrm, (i - (Seg - 4)) / 3f).normalized;
                    var bottom = _lash[i] + normal * width;
                    _vertices[b + 2 * i] = ImageToWorld(_lash[i], depth);
                    _vertices[b + 2 * i + 1] = ImageToWorld(bottom, depth);
                    // 애교살 SDF 정점 채널 — 밴드 로컬 좌표(현축 X, 아래축 Y)를 이미지 공간에서
                    // 실어 보낸다. X/Y는 위치의 아핀 함수라 프래그 보간이 픽셀 실좌표와 정확히
                    // 일치 → 곡선까지 수직거리를 각 없이 잰다. 곡선 계수는 눈당 상수로 동봉.
                    var topRel = _lash[i] - _arcInner;
                    var botRel = bottom - _arcInner;
                    _sdfLocalXY[b + 2 * i] = new Vector2(
                        Vector2.Dot(topRel, _arcXAxis), Vector2.Dot(topRel, _arcYAxis));
                    _sdfLocalXY[b + 2 * i + 1] = new Vector2(
                        Vector2.Dot(botRel, _arcXAxis), Vector2.Dot(botRel, _arcYAxis));
                    _sdfCurve[b + 2 * i] = curveVec;
                    _sdfCurve[b + 2 * i + 1] = curveVec;
                    if (i == Seg / 2)
                    {
                        affineCenter = Vector2.Lerp(_lash[i], bottom, 0.5f);
                        var peakImg = Vector2.Lerp(_lash[i], bottom, AegyoHighlightPeakV);
                        peakImg = RegionAffineUtility.TransformBandPoint(
                            peakImg, affineCenter, eyeXAxis, -down,
                            eyeDist, width, _aegyoAffine);
                        _fitAegyoPeakVp[e] = FramePresenter.Instance.ImageToViewport(peakImg);
                        _fitAegyoPeakFrame[e] = Time.frameCount;
                        _fitAegyoPeakValid[e] = true;

                        var linerImg = Vector2.Lerp(_lash[i], bottom, EyelinerLowerPeakV);
                        linerImg = RegionAffineUtility.TransformBandPoint(
                            linerImg, affineCenter, eyeXAxis, -down,
                            eyeDist, width, _linerAffine);
                        _fitEyelinerLowerVp[e] = FramePresenter.Instance.ImageToViewport(linerImg);
                        _fitEyelinerLowerFrame[e] = Time.frameCount;
                        _fitEyelinerLowerValid[e] = true;

                        var shadowImg = Vector2.Lerp(_lash[i], bottom, EyeshadowLowerPeakV);
                        _fitEyeshadowLowerVp[e] = FramePresenter.Instance.ImageToViewport(shadowImg);
                        _fitEyeshadowLowerFrame[e] = Time.frameCount;
                        _fitEyeshadowLowerValid[e] = true;
                    }
                    if (i == triIdx)
                    {
                        var triImg = Vector2.Lerp(_lash[i], bottom, TriangleZonePeakV);
                        triImg = RegionAffineUtility.TransformBandPoint(
                            triImg, affineCenter, eyeXAxis, -down,
                            eyeDist, width, _triAffine);
                        _fitTriangleZoneVp[e] = FramePresenter.Instance.ImageToViewport(triImg);
                        _fitTriangleZoneFrame[e] = Time.frameCount;
                        _fitTriangleZoneValid[e] = true;
                    }
                }

                // 연장 컬럼(눈꼬리 밖) — 눈 장축(현) 방향 직선 연장("거의 1자"). 하안검
                // 코너 접선은 코너로 갈수록 위로 상승해 연장이 다시 올라가 보이므로
                // (실기기: 디태치 라인 끝이 들림), 거의 수평인 현 방향을 쓴다. 방향을
                // 꺾지 않아 밴드 접힘 없음(상안검 윙 캔버스와 동일 교훈), 모양은 셰이더 몫.
                {
                    for (var j = 0; j < ExtPts; j++)
                    {
                        var i = Seg + j;
                        var tt = (j + 1) / (float)ExtPts; // (0,1], far=1
                        var basePt = _lash[Seg - 1] + eyeXAxis * (eyeDist * ExtFrac * tt);
                        var h = width * Mathf.Lerp(1f, ExtHeightTaper, tt); // far end 소멸감
                        var bottom = basePt + chordNrm * h;
                        _vertices[b + 2 * i] = ImageToWorld(basePt, depth);
                        _vertices[b + 2 * i + 1] = ImageToWorld(bottom, depth);
                        // 애교살 SDF 채널 — 로컬 좌표는 위치의 아핀 함수라 그대로 외삽된다.
                        // (셰이더 애교살은 연장 구간에서 게이트되므로 실사용은 없음 — 채널을
                        //  0으로 두면 보간 경계에서 값이 급변하므로 일관 좌표를 싣는다.)
                        var topRel = basePt - _arcInner;
                        var botRel = bottom - _arcInner;
                        _sdfLocalXY[b + 2 * i] = new Vector2(
                            Vector2.Dot(topRel, _arcXAxis), Vector2.Dot(topRel, _arcYAxis));
                        _sdfLocalXY[b + 2 * i + 1] = new Vector2(
                            Vector2.Dot(botRel, _arcXAxis), Vector2.Dot(botRel, _arcYAxis));
                        _sdfCurve[b + 2 * i] = curveVec;
                        _sdfCurve[b + 2 * i + 1] = curveVec;
                    }
                }
            }
            _mesh.vertices = _vertices;
            _mesh.SetUVs(1, _sdfLocalXY); // 애교살 SDF 밴드 로컬 좌표
            _mesh.SetUVs(2, _sdfCurve);   // 애교살 SDF 곡선 계수(눈당)
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
                // 애교살 SDF 기준 프레임 — 축퇴 폴백(셰이더에서 Lc·Troll 클램프로 무해).
                _arcInner = inner; _arcXAxis = Vector2.right; _arcYAxis = down;
                _arcL = 1e-5f; _arcK0 = 0f; _arcK1 = 0f;
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

            // 애교살 SDF 기준 프레임을 이 눈의 값으로 확정 — 셰이더가 정점 로컬 좌표에서
            // 같은 곡선 v(u)=k0·u(1−u)+k1·u²(1−u)을 재구성해 픽셀당 수직거리를 잰다.
            _arcInner = inner; _arcXAxis = xAxis; _arcYAxis = yAxis;
            _arcL = L; _arcK0 = k0; _arcK1 = k1;
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
