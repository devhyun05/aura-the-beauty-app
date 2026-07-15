using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 립 "그림" — 사용자가 그린 입술 아트(옴브레/글리터/패턴 등)를 입술 메시에 워프해
    /// 얹는다. LipRenderer(단색 틴트)와 짝: 이건 여러 색이 들어가는 그림용(데칼).
    ///
    /// LipRenderer와 같은 외곽·내곽 링 메시를 쓰되, UV를 매 프레임 입술 바운딩박스로
    /// 정규화해(가로=좌우, 세로=상하) 사각형 그림이 입술 모양으로 휜다. RegionDecal.shader가
    /// 텍스처 RGB(그린 색)를 피부 루마 보존해 얹고 알파=칠한 영역.
    /// 임포트: SetTextureFromFile(투명 배경 PNG). 입 벌림·미소에 따라 입술과 함께 움직인다.
    /// </summary>
    public class LipStyleRenderer : MonoBehaviour
    {
        public static LipStyleRenderer Instance { get; private set; }

        // LipRenderer와 동일 윤곽(외곽/내곽 20쌍).
        static readonly int[] LipsOuter =
            { 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 };
        static readonly int[] LipsInner =
            { 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95 };
        const int Ring = 20;

        const float DistanceFromCamera = 0.5f;
        const float DepthScale = 1.0f;
        const float DecalMinTransparent = 0.05f;

        Camera _camera;
        FaceLandmarkSource _source;
        Mesh _mesh;
        MeshRenderer _renderer;
        Material _material;
        Vector3[] _vertices;
        Vector2[] _uvs;
        float _intensity;
        Texture2D _importedTex;

        static readonly int DecalTexId = Shader.PropertyToID("_DecalTex");
        static readonly int IntensityId = Shader.PropertyToID("_Intensity");
        static readonly int DecalSparkleId = Shader.PropertyToID("_DecalSparkle"); // 글리터 명멸(0=끔)

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
            // 립 그림은 립 링 위에 — RegionDecal 셰이더를 볼 데칼과 공유하므로 큐는 여기서 지정.
            _material.renderQueue = MakeupQueues.LipDecal;
            _material.SetTexture(DecalTexId, ImageFileLoader.ClearTexture);

            _mesh = new Mesh { name = "LipStyle" };
            _mesh.MarkDynamic();

            var tris = new int[Ring * 6];
            for (var i = 0; i < Ring; i++)
            {
                int a = 2 * i, b = 2 * i + 1;
                int c = 2 * ((i + 1) % Ring), d = 2 * ((i + 1) % Ring) + 1;
                var t = i * 6;
                tris[t] = a; tris[t + 1] = b; tris[t + 2] = c;
                tris[t + 3] = b; tris[t + 4] = d; tris[t + 5] = c;
            }
            _vertices = new Vector3[Ring * 2];
            _uvs = new Vector2[Ring * 2];
            _mesh.vertices = _vertices;
            _mesh.uv = _uvs;
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

        /// <summary>사용자 임포트: 입술 아트(투명 배경 PNG). 불투명이면 거부.</summary>
        public void SetTextureFromFile(string path)
        {
            if (_material == null) return;
            if (!ImageFileLoader.TryLoadDecal(path, DecalMinTransparent, out var tex, out var error))
            {
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"립 그림 임포트 실패: {error}" });
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

            // 입술 바운딩박스(이미지 공간).
            float minX = float.MaxValue, maxX = float.MinValue, minY = float.MaxValue, maxY = float.MinValue;
            for (var i = 0; i < Ring; i++)
            {
                Accum(ImgPt(lm, LipsOuter[i]), ref minX, ref maxX, ref minY, ref maxY);
                Accum(ImgPt(lm, LipsInner[i]), ref minX, ref maxX, ref minY, ref maxY);
            }
            var w = Mathf.Max(maxX - minX, 1e-5f);
            var h = Mathf.Max(maxY - minY, 1e-5f);

            for (var i = 0; i < Ring; i++)
            {
                var outer = ImgPt(lm, LipsOuter[i]);
                var inner = ImgPt(lm, LipsInner[i]);
                _vertices[2 * i] = ImageToWorld(outer, Depth(lm[LipsOuter[i]].z));
                _vertices[2 * i + 1] = ImageToWorld(inner, Depth(lm[LipsInner[i]].z));
                // u = 좌→우, v = 상(1)→하(0). 이미지 y는 아래로 증가하므로 뒤집어 맞춘다.
                _uvs[2 * i] = new Vector2((outer.x - minX) / w, (maxY - outer.y) / h);
                _uvs[2 * i + 1] = new Vector2((inner.x - minX) / w, (maxY - inner.y) / h);
            }
            _mesh.vertices = _vertices;
            _mesh.uv = _uvs;
            _mesh.RecalculateBounds();
        }

        static void Accum(Vector2 p, ref float minX, ref float maxX, ref float minY, ref float maxY)
        {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
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
