using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 쌍꺼풀(크리스) 밴드 렌더러 — 상안검 위 얇은 음영 라인. 구조는
    /// EyelinerStyleRenderer/LowerLidRenderer 밴드 패턴 복제: 상안검(속눈썹) 랜드마크
    /// 체인을 눈썹 방향으로 creaseHeight×눈 세로폭 만큼 오프셋한 크리스 라인을 만들고,
    /// 그 라인을 접힘선(밴드 세로 중심)으로 두는 얇은 밴드를 CR 세분해 얹는다.
    /// DoubleLid.shader가 접힘선 최암·아래로 소프트 페이드하는 자연 음영을 그린다.
    ///
    /// 밴드 세로(uv.y): 0=위(브로우 쪽) → 0.5=크리스 접힘선 → 1=아래(속눈썹 쪽).
    /// 가로(uv.x): 0=안쪽 눈머리 → 1=바깥 눈꼬리. "위" 방향은 눈썹 기준(BrowLower) —
    /// 홍채/눈 중심 기준은 눈 감을 때 부호가 뒤집힌다(기존 눈 밴드 렌더러 공통 규약).
    ///
    /// 상안검 리드 '위' 피부에 놓여 눈알을 침범하지 않으므로 스텐실이 불필요하다
    /// (세그 게이트 + 알파만). 눈꼬리 리프트는 공개 API에 없어 추종하지 않는다(크리스는
    /// 접힘선 자체라 코너 리프트와 독립 — 필요 시 배선 확장 여지).
    ///
    /// 부트스트랩: MakeupController.Init이 TeethRenderer처럼 생성하는 것이 정석이나 해당
    /// 파일은 타 트랙 동결이라 그건 "배선 제안"으로 남기고, 이 파일은 자활 가드(Instance
    /// 싱글턴 + Init(Camera, FaceLandmarkSource))만 준비한다. MediaPipe 경로 전용.
    /// </summary>
    public class DoubleLidRenderer : MonoBehaviour
    {
        public static DoubleLidRenderer Instance { get; private set; }

        // 상안검(속눈썹) 라인: 바깥 눈꼬리 → 안쪽 눈머리.
        // 출처: IrisRenderer.UpperLids 복사 — IrisRenderer는 타 트랙 사용 중이라 공유
        // 상수 승격 보류(값 변경 시 두 곳 동기 필요).
        static readonly int[][] UpperLids =
        {
            new[] { 33, 246, 161, 160, 159, 158, 157, 173, 133 },
            new[] { 263, 466, 388, 387, 386, 385, 384, 398, 362 },
        };
        // 눈썹 하단 — "위" 방향의 안정 기준(EyelinerStyleRenderer/IrisRenderer와 동일 근거).
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };
        // 눈 세로폭(크리스 오프셋·밴드 두께의 정규화 기준) — 상·하안검 중앙 랜드마크 쌍.
        // 출처: IrisRenderer.EyeContours의 C_UPPER(159/386)·C_LOWER(145/374)와 동일 인덱스.
        static readonly int[] UpperLidMid = { 159, 386 };
        static readonly int[] LowerLidMid = { 145, 374 };

        const int Eyes = 2;
        const int LidPts = 9;
        const int Sub = 2;
        const int Seg = (LidPts - 1) * (Sub + 1) + 1; // 25

        // 크리스 기본 높이 = 눈 세로폭 × 이 값 (creaseHeight 배수가 다시 곱해짐).
        const float CreaseOffsetFactor = 0.55f;    // 실기기 튜닝 대상
        // 밴드 두께(접힘선 위아래 총폭) = 눈 세로폭 × 이 값.
        const float CreaseThicknessFactor = 0.28f; // 실기기 튜닝 대상

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _creaseMult = 1f; // 크리스 높이 배수 핸들(1=기본 위치)

        static readonly int IntensityId = Shader.PropertyToID("_DoubleLidIntensity");

        readonly Vector2[] _ctrl = new Vector2[LidPts];
        readonly Vector2[] _crease = new Vector2[Seg]; // 세분된 크리스 접힘선(이미지 좌표)

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("DoubleLid");
            if (shader == null) shader = Shader.Find("ARMakeup/DoubleLid");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.DoubleLid; // 아이섀도 위·아이라인 아래

            _mesh = new Mesh { name = "DoubleLid" };
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
                    uvs[b + 2 * i] = new Vector2(along, 0f);     // 위(브로우 쪽)
                    uvs[b + 2 * i + 1] = new Vector2(along, 1f); // 아래(속눈썹 쪽)
                }
                for (var i = 0; i < Seg - 1; i++)
                {
                    int up0 = b + 2 * i, lo0 = b + 2 * i + 1;
                    int up1 = b + 2 * (i + 1), lo1 = b + 2 * (i + 1) + 1;
                    var t = (e * (Seg - 1) + i) * 6;
                    tris[t] = up0; tris[t + 1] = lo0; tris[t + 2] = up1;
                    tris[t + 3] = lo0; tris[t + 4] = lo1; tris[t + 5] = up1;
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

        /// <summary>쌍꺼풀 크리스 — intensity 0=끔. creaseHeight = 기본 크리스 위치 배수
        /// (1=기본, 생략 0은 미설정 → 1로 보정). 색은 자연 음영 고정(셰이더 기본값).</summary>
        public void ApplyDoubleLid(float intensity, float creaseHeight)
        {
            _intensity = Mathf.Clamp01(intensity);
            // JsonUtility 생략 0은 미설정 → 1(기본 위치). 하한 0.3 = 아주 낮은 크리스까지 허용.
            _creaseMult = creaseHeight <= 0f ? 1f : Mathf.Clamp(creaseHeight, 0.3f, 2f);
            if (_material == null) return;
            _material.SetFloat(IntensityId, _intensity);
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var lm = _source.Landmarks;
            for (var e = 0; e < Eyes; e++)
            {
                var lids = UpperLids[e];
                var brow = BrowLower[e];

                // "위" 기준: 눈썹에서 상안검으로 향하는 방향. 눈썹은 항상 눈 위라 눈을
                // 감아도 부호가 안 뒤집힌다(iris center 기준의 밴드 꼬임 회피).
                var lidMid = ImgPt(lm, lids[4]);
                var up = (ImgPt(lm, brow[2]) - lidMid).normalized;

                // 눈 세로폭 — 크리스 오프셋·밴드 두께의 정규화 기준(얼굴 크기 무관).
                var eyeVert = (ImgPt(lm, UpperLidMid[e]) - ImgPt(lm, LowerLidMid[e])).magnitude;
                var offset = CreaseOffsetFactor * eyeVert * _creaseMult;
                var halfThick = 0.5f * CreaseThicknessFactor * eyeVert;

                // 컨트롤 포인트: 안쪽 → 바깥 (속눈썹 라인), 눈썹 방향으로 크리스 오프셋.
                for (var j = 0; j < LidPts; j++)
                    _ctrl[j] = ImgPt(lm, lids[LidPts - 1 - j]) + up * offset;

                SubdivideArc(_ctrl, LidPts, _crease);

                var depth = Depth(lm[lids[4]].z);
                var b = e * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var a = _crease[Mathf.Max(i - 1, 0)];
                    var bb = _crease[Mathf.Min(i + 1, Seg - 1)];
                    var tangent = (bb - a).normalized;
                    var normal = new Vector2(-tangent.y, tangent.x);
                    if (Vector2.Dot(normal, up) < 0f) normal = -normal; // 위쪽 법선 규약
                    // 접힘선(_crease)을 밴드 세로 중심으로: 위 정점=+법선(브로우), 아래=-법선(속눈썹).
                    _vertices[b + 2 * i] = ImageToWorld(_crease[i] + normal * halfThick, depth);
                    _vertices[b + 2 * i + 1] = ImageToWorld(_crease[i] - normal * halfThick, depth);
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
