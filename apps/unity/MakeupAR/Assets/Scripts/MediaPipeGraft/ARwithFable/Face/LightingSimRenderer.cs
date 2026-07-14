using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 조명 시뮬레이션 (#4) — 같은 메이크업이 형광등/자연광/노을/실내 조명에서 어떻게
    /// 보이는지 미리보기. "매장에선 예뻤는데 밖에선 달랐다"는 실제 페인포인트를 겨냥.
    ///
    /// 방식: 풀스크린 쿼드 + GrabPass. 카메라 피드 + 메이크업이 합성된 화면을 통째로
    /// 잡아(LightingSim.shader) 프리셋별 화이트밸런스·노출·대비·채도 그레이드를 입혀
    /// 불투명으로 다시 그린다. 물리 재조명은 아니지만 "색 캐스트" 미리보기가 사용자
    /// 가치의 핵심이다. 프리셋 그레이드 값은 여기(C#)에서 유니폼으로 넣는다.
    ///
    /// 큐는 MakeupQueues.Lighting(메이크업 위·가이드 아래) — 코치 라인(스텐실·대칭)은
    /// 이 위에 순색으로 남는다. 랜드마크가 필요 없어(화면 그레이드) Camera.main만 있으면
    /// 부트스트랩(MakeupController.Init) — MediaPipe/ARKit 경로 무관.
    /// </summary>
    public class LightingSimRenderer : MonoBehaviour
    {
        public static LightingSimRenderer Instance { get; private set; }

        // 프리셋 그레이드 표 (preset 1..N). 0=끔(렌더 비활성). 실기기 튜닝 대상.
        struct Grade
        {
            public Color wb;      // 화이트밸런스 RGB 게인
            public float exp;     // 노출(밝기) 배수
            public float contrast;
            public float saturation;
            public Grade(Color wb, float exp, float contrast, float saturation)
            { this.wb = wb; this.exp = exp; this.contrast = contrast; this.saturation = saturation; }
        }

        // 인덱스 = preset. [0]은 자리표시(off 경로에서 안 씀).
        static readonly Grade[] Presets =
        {
            new Grade(Color.white, 1f, 1f, 1f),                              // 0 off(미사용)
            new Grade(new Color(1.00f, 1.00f, 1.03f), 1.04f, 1.03f, 1.06f),  // 1 자연광(주광, 맑고 밝게)
            new Grade(new Color(0.95f, 1.02f, 1.06f), 1.00f, 0.96f, 0.93f),  // 2 형광등(쿨+그린, 평평·탈색)
            new Grade(new Color(1.13f, 1.00f, 0.80f), 1.02f, 1.05f, 1.13f),  // 3 노을(골든아워, 따뜻·짙게)
            new Grade(new Color(1.10f, 0.99f, 0.85f), 0.92f, 0.98f, 1.03f),  // 4 실내(텅스텐, 따뜻·어둑)
        };

        const int CustomPreset = 5; // 색온도 슬라이더로 화이트밸런스 직접 조절
        // 커스텀 색온도 끝점(temperature 0=따뜻, 1=차가움). 중립(0.5)=화이트.
        static readonly Color WarmWb = new Color(1.15f, 1.00f, 0.82f);
        static readonly Color CoolWb = new Color(0.86f, 1.00f, 1.14f);

        const float QuadDepthOffset = 0.05f; // 근평면 앞 배치(ZTest Always라 시각엔 무관)

        Camera _camera;
        Mesh _quad;
        MeshRenderer _renderer;
        Material _material;
        readonly Vector3[] _verts = new Vector3[4];
        float _lastAspect = -1f;

        int _preset;
        float _intensity = 1f;
        float _temperature = 0.5f;

        static readonly int IntensityId = Shader.PropertyToID("_Intensity");
        static readonly int WbGainId = Shader.PropertyToID("_WbGain");
        static readonly int ExposureId = Shader.PropertyToID("_Exposure");
        static readonly int ContrastId = Shader.PropertyToID("_Contrast");
        static readonly int SaturationId = Shader.PropertyToID("_Saturation");

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Init(Camera cam)
        {
            _camera = cam;

            var shader = Resources.Load<Shader>("LightingSim");
            if (shader == null) shader = Shader.Find("ARMakeup/LightingSim");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.Lighting;

            _quad = new Mesh { name = "LightingSimQuad" };
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

        /// <summary>
        /// 조명 프리셋 적용 — preset 0 또는 intensity 0 = 끔(렌더 비활성). 프리셋 범위를
        /// 벗어나면 자연광(1)로 폴백. 그레이드 유니폼은 여기서 한 번 기록(화면 그레이드라
        /// 프레임 의존 값 없음).
        /// </summary>
        public void ApplyLighting(LightingParams p)
        {
            if (p == null) return;
            _preset = p.preset;
            _intensity = Mathf.Clamp01(p.intensity);
            _temperature = Mathf.Clamp01(p.temperature);
            if (_material == null) return;

            if (_preset > 0 && _intensity > 0f)
            {
                Color wb; float exp, contrast, saturation;
                if (_preset == CustomPreset)
                {
                    // 색온도 → 화이트밸런스: 0=따뜻 0.5=중립(화이트) 1=차가움. 노출·대비는
                    // 중립, 채도만 살짝 올려 프리셋과 톤을 맞춘다.
                    wb = _temperature < 0.5f
                        ? Color.Lerp(WarmWb, Color.white, _temperature * 2f)
                        : Color.Lerp(Color.white, CoolWb, (_temperature - 0.5f) * 2f);
                    exp = 1f; contrast = 1f; saturation = 1.02f;
                }
                else
                {
                    var g = Presets[_preset >= Presets.Length ? 1 : _preset];
                    wb = g.wb; exp = g.exp; contrast = g.contrast; saturation = g.saturation;
                }
                _material.SetColor(WbGainId, wb);
                _material.SetFloat(ExposureId, exp);
                _material.SetFloat(ContrastId, contrast);
                _material.SetFloat(SaturationId, saturation);
                _material.SetFloat(IntensityId, _intensity);
            }
        }

        void LateUpdate()
        {
            var visible = _camera != null && _preset > 0 && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            // 화면비가 바뀔 때만 풀스크린 쿼드를 재구성(회전·리사이즈 대응).
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
