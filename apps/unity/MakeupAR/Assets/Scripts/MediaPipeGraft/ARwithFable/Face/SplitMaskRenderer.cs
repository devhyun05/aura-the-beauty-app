using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 반반 모드 (#split) — 완성본 절반 vs 맨얼굴 절반 비교. 메이크업 셰이더는 전혀
    /// 손대지 않고, 모든 메이크업이 공유하는 원본 피드(_CameraFeed, 메이크업 이전 grab)를
    /// 풀스크린으로 다시 잡아 "맨얼굴 쪽 절반"에만 원본을 복원한다(SplitMask.shader).
    ///
    /// 이 렌더러의 두 역할:
    ///  1) 풀스크린 쿼드로 복원 셰이더를 돌린다(LightingSimRenderer와 동형).
    ///  2) 얼굴 중심축(이마 10 → 턱 152)을 화면 UV로 투영해 전역 유니폼으로 기록한다 —
    ///     복원 셰이더와 가이드 셰이더(StencilGuide)가 같은 분할선을 공유한다.
    ///
    /// 모드 0(전체)일 때도 _SplitMode=0을 계속 써서 가이드가 잘못 잘리지 않게 한다.
    /// 랜드마크가 필요하므로 MediaPipe 경로 전용(MakeupController.Init 부트스트랩).
    /// </summary>
    public class SplitMaskRenderer : MonoBehaviour
    {
        public static SplitMaskRenderer Instance { get; private set; }

        const int ForeheadTop = 10, Chin = 152;
        const float QuadDepthOffset = 0.05f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _quad;
        MeshRenderer _renderer;
        Material _material;
        readonly Vector3[] _verts = new Vector3[4];
        float _lastAspect = -1f;
        int _mode; // 0=전체 1=왼쪽 메이크업 2=오른쪽 메이크업

        static readonly int SplitModeId = Shader.PropertyToID("_SplitMode");
        static readonly int SplitLineId = Shader.PropertyToID("_SplitLine");

        void Awake()
        {
            Instance = this;
            Shader.SetGlobalFloat(SplitModeId, 0f); // 명시 폴백 — 가이드 게이트 0(안 자름)
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            Shader.SetGlobalFloat(SplitModeId, 0f);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("SplitMask");
            if (shader == null) shader = Shader.Find("ARMakeup/SplitMask");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.SplitMask;

            _quad = new Mesh { name = "SplitMaskQuad" };
            _quad.MarkDynamic();
            _quad.vertices = _verts;
            _quad.uv = new[]
            {
                new Vector2(0f, 0f), new Vector2(1f, 0f),
                new Vector2(1f, 1f), new Vector2(0f, 1f),
            };
            _quad.triangles = new[] { 0, 1, 2, 0, 2, 3 };

            gameObject.AddComponent<MeshFilter>().sharedMesh = _quad;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;
        }

        /// <summary>반반 모드 적용 — 0=전체(끔) 1=왼쪽 메이크업 2=오른쪽 메이크업.</summary>
        public void ApplySplit(SplitParams p)
        {
            if (p == null) return;
            _mode = Mathf.Clamp(p.mode, 0, 2);
        }

        void LateUpdate()
        {
            var hasFace = _source != null && _source.HasFace && FramePresenter.Instance != null;
            if (!hasFace)
            {
                Shader.SetGlobalFloat(SplitModeId, 0f); // 얼굴 없으면 아무것도 안 자름
                if (_renderer.enabled) _renderer.enabled = false;
                return;
            }

            // 얼굴 중심축(이마→턱)을 화면 UV로 투영 → 분할선 전역 기록.
            var lm = _source.Landmarks;
            var fp = FramePresenter.Instance;
            var fore = fp.ImageToViewport(new Vector2(lm[ForeheadTop].x, lm[ForeheadTop].y));
            var chin = fp.ImageToViewport(new Vector2(lm[Chin].x, lm[Chin].y));
            var mid = (fore + chin) * 0.5f;
            var dir = chin - fore;
            if (dir.sqrMagnitude < 1e-8f) dir = new Vector2(0f, -1f);
            dir.Normalize();
            var normal = new Vector2(-dir.y, dir.x); // 화면 오른쪽(+)
            Shader.SetGlobalVector(SplitLineId, new Vector4(mid.x, mid.y, normal.x, normal.y));
            Shader.SetGlobalFloat(SplitModeId, _mode);

            var visible = _mode != 0;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            // 화면비 변화 시에만 풀스크린 쿼드 재구성.
            if (!Mathf.Approximately(_camera.aspect, _lastAspect))
            {
                _lastAspect = _camera.aspect;
                var d = _camera.nearClipPlane + QuadDepthOffset;
                _verts[0] = ToLocal(0f, 0f, d);
                _verts[1] = ToLocal(1f, 0f, d);
                _verts[2] = ToLocal(1f, 1f, d);
                _verts[3] = ToLocal(0f, 1f, d);
                _quad.vertices = _verts;
                _quad.RecalculateBounds();
            }
        }

        Vector3 ToLocal(float vx, float vy, float depth)
        {
            var world = _camera.ViewportToWorldPoint(new Vector3(vx, vy, depth));
            return transform.InverseTransformPoint(world);
        }
    }
}
