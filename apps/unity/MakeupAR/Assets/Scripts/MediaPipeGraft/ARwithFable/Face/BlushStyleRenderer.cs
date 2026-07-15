using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 볼 "그림" — 사용자가 그린 블러셔 아트(소프트 원/그라데이션/하트 등)를 양 광대에
    /// 워프해 얹는다. 칠한 블러셔 마스크(단색 틴트)와 짝: 이건 여러 색·모양 그림용(데칼).
    ///
    /// 광대 사과(landmark 50/280)에 앵커한 쿼드를 얼굴 방향(눈 라인)·크기(눈 가로폭)에
    /// 맞춰 놓고, 사각형 그림을 UV로 얹는다. 볼은 또렷한 엣지가 없어 쿼드 하나로 충분하고,
    /// 캐노니컬 마스크처럼 부드러운 면 추종이면 된다. RegionDecal.shader가 그린 색을 피부
    /// 루마 보존해 얹는다. 임포트: SetTextureFromFile(투명 배경 PNG).
    /// 참고: 패치 크기는 상수(WidthFactor/HeightFactor) — 실기기 확인 후 튜닝.
    /// </summary>
    public class BlushStyleRenderer : MonoBehaviour
    {
        public static BlushStyleRenderer Instance { get; private set; }

        static readonly int[] CheekCenters = { 50, 280 }; // 좌/우 광대 사과
        const int EyeOuterL = 33;
        const int EyeOuterR = 263;
        const int Cheeks = 2;

        const float WidthFactor = 0.28f;  // 패치 반가로 = 눈 가로폭 × 이 값
        const float HeightFactor = 0.24f; // 패치 반세로

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;
        const float DecalMinTransparent = 0.05f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        float _intensity;
        Texture2D _importedTex;

        static readonly int DecalTexId = Shader.PropertyToID("_DecalTex");
        static readonly int IntensityId = Shader.PropertyToID("_Intensity");
        static readonly int DecalSparkleId = Shader.PropertyToID("_DecalSparkle"); // 글리터 명멸(0=끔)

        // 코너 오프셋 (du, dv): TL, TR, BL, BR. dv<0 = 눈쪽(위), dv>0 = 턱쪽(아래).
        static readonly Vector2[] Corner =
            { new Vector2(-1, -1), new Vector2(1, -1), new Vector2(-1, 1), new Vector2(1, 1) };

        void Awake() => Instance = this;

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
            if (_importedTex != null) Destroy(_importedTex);
        }

        public void Init(Camera cam, FaceLandmarkSource source)
        {
            _camera = cam;
            _source = source;

            var shader = Resources.Load<Shader>("RegionDecal");
            if (shader == null) shader = Shader.Find("ARMakeup/RegionDecal");
            _material = new Material(shader);
            // 볼 그림은 베이스 캔버스 바로 위 — RegionDecal 셰이더를 립 데칼과 공유하므로 큐는 여기서 지정.
            _material.renderQueue = MakeupQueues.BlushDecal;
            _material.SetTexture(DecalTexId, ImageFileLoader.ClearTexture);

            _mesh = new Mesh { name = "BlushStyle" };
            _mesh.MarkDynamic();

            var vc = Cheeks * 4;
            var uvs = new Vector2[vc];
            var tris = new int[Cheeks * 6];
            for (var e = 0; e < Cheeks; e++)
            {
                var b = e * 4;
                // UV: u=(du+1)/2, v=(1-dv)/2 → 눈쪽 위(v=1), 턱쪽 아래(v=0).
                for (var k = 0; k < 4; k++)
                    uvs[b + k] = new Vector2((Corner[k].x + 1f) * 0.5f, (1f - Corner[k].y) * 0.5f);
                var t = e * 6;
                tris[t] = b + 0; tris[t + 1] = b + 1; tris[t + 2] = b + 2;
                tris[t + 3] = b + 1; tris[t + 4] = b + 3; tris[t + 5] = b + 2;
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

        public void ApplyParams(float intensity, float sparkle = 0f)
        {
            _intensity = Mathf.Clamp01(intensity);
            if (_material != null)
            {
                _material.SetFloat(IntensityId, _intensity);
                _material.SetFloat(DecalSparkleId, Mathf.Clamp01(sparkle)); // 0=끔(하위호환)
            }
        }

        /// <summary>사용자 임포트: 블러셔 아트(투명 배경 PNG). 불투명이면 거부.</summary>
        public void SetTextureFromFile(string path)
        {
            if (_material == null) return;
            if (!ImageFileLoader.TryLoadDecal(path, DecalMinTransparent, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"볼 그림 임포트 실패: {error}" });
                return;
            }
            if (_importedTex != null) Destroy(_importedTex);
            _importedTex = tex;
            _material.SetTexture(DecalTexId, tex);
        }

        void LateUpdate()
        {
            var visible = _source != null && _source.HasFace &&
                          FramePresenter.Instance != null && _intensity > 0f;
            if (_renderer.enabled != visible) _renderer.enabled = visible;
            if (!visible) return;

            var lm = _source.Landmarks;
            var eyeL = ImgPt(lm, EyeOuterL);
            var eyeR = ImgPt(lm, EyeOuterR);
            var right = (eyeR - eyeL).normalized;
            var faceW = (eyeR - eyeL).magnitude;
            var down = new Vector2(-right.y, right.x);
            if (down.y < 0f) down = -down; // 이미지 y는 아래로 증가 → 턱 방향
            var halfW = faceW * WidthFactor;
            var halfH = faceW * HeightFactor;

            for (var e = 0; e < Cheeks; e++)
            {
                var center = ImgPt(lm, CheekCenters[e]);
                var depth = Depth(lm[CheekCenters[e]].z);
                var b = e * 4;
                for (var k = 0; k < 4; k++)
                {
                    var img = center + Corner[k].x * halfW * right + Corner[k].y * halfH * down;
                    _vertices[b + k] = ImageToWorld(img, depth);
                }
            }
            _mesh.vertices = _vertices;
            _mesh.RecalculateBounds();
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
