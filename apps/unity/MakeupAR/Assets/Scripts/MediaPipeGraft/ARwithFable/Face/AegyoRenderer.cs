using System.Collections.Generic;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 하안검 피부 위 애교살 전용 렌더러. 하단 라이너/섀도와 메시 높이를 공유하지 않고,
    /// 실제 하안검 아크를 따라 자연 볼륨광과 바로 아래의 부드러운 음영을 합성한다.
    /// </summary>
    public class AegyoRenderer : MonoBehaviour
    {
        public static AegyoRenderer Instance { get; private set; }

        static readonly int[][] LowerLids =
        {
            new[] { 33, 7, 163, 144, 145, 153, 154, 155, 133 },
            new[] { 263, 249, 390, 373, 374, 380, 381, 382, 362 },
        };
        static readonly int[][] BrowLower =
        {
            new[] { 46, 53, 52, 65, 55 },
            new[] { 276, 283, 282, 295, 285 },
        };

        const int Eyes = 2;
        const int LidPts = 9;
        const int Seg = 25;
        const float BandHeightFactor = 0.34f;
        // 능선(하이라이트) 피크의 대표 raw v(핏 핸들 캡처용). SDF 롤 재설계로 롤이 얇아지고
        // lash 라인 쪽으로 붙어 피크가 위로 올라왔다(aegyoV 0.32 × AEGYO_BAND 0.50 ≈ 0.16).
        const float HighlightPeakV = 0.16f;
        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1f;

        static readonly int ColorId = Shader.PropertyToID("_AegyoColor");
        static readonly int IntensityId = Shader.PropertyToID("_AegyoIntensity");
        static readonly int ShadowIntensityId = Shader.PropertyToID("_AegyoShadowIntensity");
        static readonly int ModeId = Shader.PropertyToID("_AegyoMode");
        static readonly int ShimmerId = Shader.PropertyToID("_AegyoShimmer");
        static readonly int TextureId = Shader.PropertyToID("_AegyoTexture");
        static readonly int ShapeId = Shader.PropertyToID("_AegyoShape");
        static readonly Color DefaultColor = new Color(0.95f, 0.82f, 0.78f, 1f);

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        float _shadowIntensity;
        float _height = 1f;

        readonly Vector2[] _ctrl = new Vector2[LidPts];
        readonly Vector2[] _curve = new Vector2[Seg];
        readonly LidArcFit[] _arcFits = { new LidArcFit(0.4f), new LidArcFit(0.4f) };
        // 애교살 SDF(3d71a28) — 정점당 밴드 로컬 좌표(uv1)와 눈당 곡선 계수(uv2, k0/k1/L/bandWidth).
        // 셰이더가 픽셀당 FitArc 곡선까지 수직거리를 재도록 정점에 실어 보낸다. SetUVs로 매 프레임 갱신.
        List<Vector2> _sdfLocalXY;
        List<Vector4> _sdfCurve;
        readonly Vector2[] _fitPeakVp = new Vector2[Eyes];
        readonly int[] _fitPeakFrame = { -1, -1 };
        readonly bool[] _fitPeakValid = new bool[Eyes];

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
            var shader = Resources.Load<Shader>("Aegyo");
            if (shader == null) shader = Shader.Find("ARMakeup/Aegyo");
            _material = new Material(shader);
            _material.renderQueue = MakeupQueues.Aegyo;

            _mesh = new Mesh { name = "Aegyo" };
            _mesh.MarkDynamic();
            var vertexCount = Eyes * Seg * 2;
            _vertices = new Vector3[vertexCount];
            var uvs = new Vector2[vertexCount];
            var tris = new int[Eyes * (Seg - 1) * 6];
            for (var eye = 0; eye < Eyes; eye++)
            {
                var b = eye * Seg * 2;
                for (var i = 0; i < Seg; i++)
                {
                    var along = i / (float)(Seg - 1);
                    uvs[b + i * 2] = new Vector2(along, 0f);
                    uvs[b + i * 2 + 1] = new Vector2(along, 1f);
                }
                for (var i = 0; i < Seg - 1; i++)
                {
                    var q = b + i * 2;
                    var t = (eye * (Seg - 1) + i) * 6;
                    tris[t] = q; tris[t + 1] = q + 1; tris[t + 2] = q + 2;
                    tris[t + 3] = q + 1; tris[t + 4] = q + 3; tris[t + 5] = q + 2;
                }
            }
            _mesh.vertices = _vertices;
            _mesh.uv = uvs;
            _mesh.triangles = tris;
            // 애교살 SDF 정점 채널 — 초기값 0(강도 0이면 미사용). LateUpdate가 매 프레임
            // 실제 밴드 로컬 좌표·곡선 계수로 덮어쓴다.
            _sdfLocalXY = new List<Vector2>(new Vector2[vertexCount]);
            _sdfCurve = new List<Vector4>(new Vector4[vertexCount]);
            _mesh.SetUVs(1, _sdfLocalXY);
            _mesh.SetUVs(2, _sdfCurve);
            gameObject.AddComponent<MeshFilter>().sharedMesh = _mesh;
            _renderer = gameObject.AddComponent<MeshRenderer>();
            _renderer.sharedMaterial = _material;
            _renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            _renderer.enabled = false;
        }

        public bool NeedsEyeMask => _intensity > 0f || _shadowIntensity > 0f;

        public void ApplyParams(
            float intensity, string colorHex, float height, int mode,
            float shadowIntensity, float shimmer, int texture, int shape)
        {
            _intensity = Mathf.Clamp01(intensity);
            _shadowIntensity = Mathf.Clamp01(shadowIntensity);
            _height = height <= 0f ? 1f : Mathf.Clamp(height, 0.3f, 1.4f);
            if (_material == null) return;
            if (!string.IsNullOrEmpty(colorHex) &&
                ColorUtility.TryParseHtmlString(colorHex, out var color))
                _material.SetColor(ColorId, color);
            else
                _material.SetColor(ColorId, DefaultColor);
            _material.SetFloat(IntensityId, _intensity);
            _material.SetFloat(ShadowIntensityId, _shadowIntensity);
            _material.SetFloat(ModeId, Mathf.Clamp(mode, 0, 1));
            _material.SetFloat(ShimmerId, Mathf.Clamp01(shimmer));
            _material.SetFloat(TextureId, Mathf.Max(0, texture)); // 제형 GENERIC enum(0=크림)
            _material.SetFloat(ShapeId, Mathf.Clamp(shape, 0, 2)); // 모양(0 초승달 1 일자 2 중앙)
        }

        public bool TryGetAegyoFitHandle(int eye, out Vector2 peakVp)
        {
            peakVp = Vector2.zero;
            if (eye < 0 || eye >= Eyes || _source == null || !_source.HasFace ||
                FramePresenter.Instance == null || !_fitPeakValid[eye]) return false;
            var frame = _fitPeakFrame[eye];
            if (frame < Time.frameCount - 1 || frame > Time.frameCount) return false;
            peakVp = _fitPeakVp[eye];
            return true;
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && NeedsEyeMask;
            if (_renderer != null && _renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible)
            {
                for (var eye = 0; eye < Eyes; eye++)
                {
                    _arcFits[eye].Reset();
                    _fitPeakValid[eye] = false;
                }
                return;
            }

            var landmarks = _source.Landmarks;
            for (var eye = 0; eye < Eyes; eye++)
            {
                var lids = LowerLids[eye];
                var inner = ImgPt(landmarks, lids[LidPts - 1]);
                var outer = ImgPt(landmarks, lids[0]);
                var eyeWidth = Vector2.Distance(inner, outer);
                for (var j = 0; j < LidPts; j++)
                    _ctrl[j] = ImgPt(landmarks, lids[LidPts - 1 - j]);

                var lidMid = ImgPt(landmarks, lids[4]);
                var down = (lidMid - ImgPt(landmarks, BrowLower[eye][2])).normalized;
                _arcFits[eye].Apply(_ctrl, LidPts, down);
                ResampleCurve();

                var bandHeight = eyeWidth * BandHeightFactor * _height;
                var depth = Depth(landmarks[lids[4]].z);
                var b = eye * Seg * 2;
                // 애교살 SDF 곡선 계수(눈당 상수) — LidArcFit이 확정한 프레임·계수. 셰이더가
                // 정점 로컬 좌표에서 v(u)=k0·u(1−u)+k1·u²(1−u)을 재구성해 픽셀당 수직거리를 잰다.
                var fit = _arcFits[eye];
                var arcInner = fit.Inner;
                var arcX = fit.XAxis;
                var arcY = fit.YAxis;
                var curveVec = new Vector4(fit.K0, fit.K1, fit.ChordLength, bandHeight);
                for (var i = 0; i < Seg; i++)
                {
                    var prev = _curve[Mathf.Max(0, i - 1)];
                    var next = _curve[Mathf.Min(Seg - 1, i + 1)];
                    var tangent = next - prev;
                    if (tangent.sqrMagnitude < 1e-12f) tangent = outer - inner;
                    tangent.Normalize();
                    var normal = new Vector2(-tangent.y, tangent.x);
                    if (Vector2.Dot(normal, down) < 0f) normal = -normal;
                    var bottom = _curve[i] + normal * bandHeight;
                    _vertices[b + i * 2] = ImageToWorld(_curve[i], depth);
                    _vertices[b + i * 2 + 1] = ImageToWorld(bottom, depth);
                    // 밴드 로컬 좌표(현축 X=눈머리→눈꼬리, 아래축 Y=피부)를 이미지 공간에서 실어
                    // 보낸다. X/Y는 위치의 아핀 함수라 프래그 보간이 픽셀 실좌표와 정확히 일치.
                    var topRel = _curve[i] - arcInner;
                    var botRel = bottom - arcInner;
                    _sdfLocalXY[b + i * 2] = new Vector2(
                        Vector2.Dot(topRel, arcX), Vector2.Dot(topRel, arcY));
                    _sdfLocalXY[b + i * 2 + 1] = new Vector2(
                        Vector2.Dot(botRel, arcX), Vector2.Dot(botRel, arcY));
                    _sdfCurve[b + i * 2] = curveVec;
                    _sdfCurve[b + i * 2 + 1] = curveVec;
                    if (i == Seg / 2)
                    {
                        var peak = Vector2.Lerp(_curve[i], bottom, HighlightPeakV);
                        _fitPeakVp[eye] = FramePresenter.Instance.ImageToViewport(peak);
                        _fitPeakFrame[eye] = Time.frameCount;
                        _fitPeakValid[eye] = true;
                    }
                }
            }
            _mesh.vertices = _vertices;
            _mesh.SetUVs(1, _sdfLocalXY); // 애교살 SDF 밴드 로컬 좌표
            _mesh.SetUVs(2, _sdfCurve);   // 애교살 SDF 곡선 계수(눈당)
            _mesh.RecalculateBounds();
        }

        void ResampleCurve()
        {
            for (var i = 0; i < Seg; i++)
            {
                var span = i / (float)(Seg - 1) * (LidPts - 1);
                var k = Mathf.Min(Mathf.FloorToInt(span), LidPts - 2);
                var t = span - k;
                var p0 = _ctrl[Mathf.Max(0, k - 1)];
                var p1 = _ctrl[k];
                var p2 = _ctrl[k + 1];
                var p3 = _ctrl[Mathf.Min(LidPts - 1, k + 2)];
                _curve[i] = CatmullRom(p0, p1, p2, p3, t);
            }
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * ((2f * p1) + (-p0 + p2) * t +
                           (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2 +
                           (-p0 + 3f * p1 - 3f * p2 + p3) * t3);
        }

        static Vector2 ImgPt(Vector3[] landmarks, int index) =>
            new Vector2(landmarks[index].x, landmarks[index].y);
        static float Depth(float z) => DistanceFromCamera * (1f + z * DepthScale);

        Vector3 ImageToWorld(Vector2 imagePoint, float depth)
        {
            var viewport = FramePresenter.Instance.ImageToViewport(imagePoint);
            return _camera.ViewportToWorldPoint(new Vector3(viewport.x, viewport.y, depth));
        }
    }
}
