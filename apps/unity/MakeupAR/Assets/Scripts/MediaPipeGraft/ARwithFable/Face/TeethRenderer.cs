using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 치아 미백 — MediaPipe 내측 립 링(LipsInner 20점) 안쪽을 채우고,
    /// TeethWhiten.shader가 GrabPass 피드에서 밝은 픽셀(치아)만 루마 게이트로 골라
    /// 미백(채도 감소 + 소폭 밝기 가산)한다.
    ///
    /// 삼각분할은 중심점 팬이 아니라 코너 고정 "밴드 스트립"이다: 링을 입꼬리 코너
    /// (인덱스 0=78, 10=308) 기준 상변·하변으로 나눠 대응점끼리 잇는다(LipRenderer의
    /// 링 스트립 방식 준용). 근거 — 미소 지으며 살짝 벌린 입(치아 미백 대표 포즈)에서
    /// 내측 링은 위로 휜 초승달이 되고, 그때 링 중심(20점 산술평균)이 폴리곤 밖으로
    /// 나가 팬 삼각형이 링 밖(윗입술)을 덮고(미백 얼룩) Cull Off+알파블렌드로 자기
    /// 겹침이 k회 합성된다. 스트립은 상·하 변 사이만 채우므로 초승달에서도 유출·
    /// 겹침이 원리적으로 없다.
    ///
    /// 입을 다물면 상·하 변이 붙어 스트립 폭 ≈ 0 → 자동 무효과. 스트립 자체가 입
    /// 열림을 추종하므로 눈 영역(EyeStencil)과 달리 별도 스텐실이 불필요하다. 코너
    /// 근처는 상·하 변이 만나 폭 0 — 자동 테이퍼. 랜드마크 접근은 LateUpdate
    /// 프레임당 1회(프레임 캐시 규약).
    ///
    /// 생성은 MakeupController.Init이 담당 — 렌더러 부트스트랩(ARBootstrap)은 타
    /// 트랙이 사용 중이라 동결이고, 컨트롤러는 랜드마크 소스보다 나중에 생성되어
    /// 싱글턴이 이미 살아 있다. 큐는 MakeupQueues.Teeth(립 링 바로 아래) — 립·라이너
    /// 엣지가 치아 존 경계 위에서 또렷하게 남는다. MediaPipe 경로 전용.
    /// </summary>
    public class TeethRenderer : MonoBehaviour
    {
        public static TeethRenderer Instance { get; private set; }

        // 내측 립 링 20점 (index 정렬, 닫힌 루프).
        // 출처: LipRenderer.LipsInner 복사 — LipRenderer는 타 트랙 사용 중이라 공유
        // 상수 승격 보류(값 변경 시 두 곳 동기 필요).
        static readonly int[] LipsInner =
            { 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95 };
        const int Ring = 20;
        // 랜드마크 사이 스플라인 세분 — 링 경계 각짐(다각형) 제거(LipRenderer 선례).
        const int Sub = 3;
        const int RingFine = Ring * Sub; // 60
        // 밴드 스트립 컬럼 — 코너(링 인덱스 0↔10) 사이 상변 세분점 수. 컬럼 c의
        // 상변 = 세분 링 인덱스 c, 하변 = (RingFine − c) % RingFine (반대 방향 대응점).
        const int HalfFine = Ring / 2 * Sub; // 30
        const int Cols = HalfFine + 1;       // 31 (양끝 컬럼 = 코너, 폭 0 = 자동 테이퍼)

        const float DistanceFromCamera = 0.5f; // 다른 랜드마크 렌더러와 동일
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices; // 컬럼당 2정점 — [2c]=상변, [2c+1]=하변 (밴드 스트립)
        float _intensity;

        static readonly int WhitenIntensityId = Shader.PropertyToID("_WhitenIntensity");

        readonly Vector2[] _ctrl = new Vector2[Ring];
        readonly float[] _ctrlDepth = new float[Ring];
        readonly Vector2[] _fine = new Vector2[RingFine];  // 세분된 닫힌 링(이미지 좌표)
        readonly float[] _fineDepth = new float[RingFine];

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("TeethWhiten");
            if (shader == null) shader = Shader.Find("ARMakeup/TeethWhiten");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.Teeth; // 립 링 아래(부위별 고유 큐)

            _mesh = new Mesh { name = "TeethZone" };
            _mesh.MarkDynamic();

            // 밴드 스트립 토폴로지: 컬럼당 상·하변 2정점, 인접 컬럼끼리 쿼드(2삼각형).
            // uv.x = 상↔하 세로 파라미터(0=상변, 1=하변) — 셰이더 양끝 페더 기준.
            // uv.y = 가로(0 코너 78 → 1 코너 308).
            var uvs = new Vector2[Cols * 2];
            for (var c = 0; c < Cols; c++)
            {
                var along = c / (float)HalfFine;
                uvs[2 * c] = new Vector2(0f, along);
                uvs[2 * c + 1] = new Vector2(1f, along);
            }
            var tris = new int[HalfFine * 6];
            for (var c = 0; c < HalfFine; c++)
            {
                int t0 = 2 * c, b0 = 2 * c + 1;
                int t1 = 2 * (c + 1), b1 = 2 * (c + 1) + 1;
                var t = c * 6;
                tris[t] = t0; tris[t + 1] = b0; tris[t + 2] = t1;
                tris[t + 3] = b0; tris[t + 4] = b1; tris[t + 5] = t1;
            }
            _vertices = new Vector3[Cols * 2];
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.triangles = tris;

            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;
        }

        public void ApplyParams(float intensity)
        {
            _intensity = Mathf.Clamp01(intensity);
            if (_material == null) return;
            _material.SetFloat(WhitenIntensityId, _intensity);
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var lm = _source.Landmarks;

            for (var i = 0; i < Ring; i++)
            {
                _ctrl[i] = ImgPt(lm, LipsInner[i]);
                _ctrlDepth[i] = Depth(lm[LipsInner[i]].z);
            }

            // 닫힌 루프 Catmull-Rom 세분 — 매끈한 내측 링 경계(깊이는 선형 보간).
            for (var k = 0; k < Ring; k++)
            {
                var p0 = _ctrl[(k - 1 + Ring) % Ring];
                var p1 = _ctrl[k];
                var p2 = _ctrl[(k + 1) % Ring];
                var p3 = _ctrl[(k + 2) % Ring];
                var d1 = _ctrlDepth[k];
                var d2 = _ctrlDepth[(k + 1) % Ring];
                for (var j = 0; j < Sub; j++)
                {
                    var u = j / (float)Sub;
                    _fine[k * Sub + j] = CatmullRom(p0, p1, p2, p3, u);
                    _fineDepth[k * Sub + j] = Mathf.Lerp(d1, d2, u);
                }
            }

            // 상변(코너 78→308 정방향)과 하변(같은 코너 사이 역방향) 대응점을 잇는
            // 스트립 — 초승달(미소 개구)에서도 링 밖 유출·자기 겹침 없음.
            for (var c = 0; c < Cols; c++)
            {
                var bi = (RingFine - c) % RingFine;
                _vertices[2 * c] = ImageToWorld(_fine[c], _fineDepth[c]);
                _vertices[2 * c + 1] = ImageToWorld(_fine[bi], _fineDepth[bi]);
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
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
