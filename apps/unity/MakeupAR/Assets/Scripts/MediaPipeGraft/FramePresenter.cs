using Unity.Collections;
using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 시간 동기 합성(time-locked composition)의 핵심.
    ///
    /// ARCameraBackground(항상 최신 프레임)를 쓰지 않고, MediaPipe가 랜드마크를
    /// 계산한 "바로 그 프레임"을 전체 화면 쿼드로 그린다. 미리보기 전체가
    /// 추론 지연만큼(수십 ms) 균일하게 늦어지는 대신, 메이크업이 얼굴에
    /// 픽셀 단위로 고정된다 — 영상과 랜드마크가 같은 시점이므로 원리적으로
    /// 어긋날 수 없다.
    ///
    /// 좌표 매핑도 이 클래스가 소유한다: 쿼드의 네 꼭짓점을
    /// ImageToViewport(이미지 모서리)로 배치하므로, 영상과 랜드마크가
    /// 항상 같은 변환을 지난다 (displayMatrix 추측 불필요).
    /// </summary>
    public class FramePresenter : MonoBehaviour
    {
        const float QuadDistance = 5f; // 카메라로부터 쿼드까지 (메이크업 메시 0.5m보다 뒤)

        public static FramePresenter Instance { get; private set; }

        /// <summary>
        /// 화면 가로 기준 좌우 반전 (회전 "후" 적용 — 캘리브레이션 UI의 Y플립 버튼).
        /// 전면 센서 이미지는 자체가 거울상이라 회전 270°만으로 셀피 거울 프리뷰가
        /// 되므로 기본 OFF (iPhone 15 Pro 실측).
        /// </summary>
        public bool mirror = false;

        /// <summary>화면에 영상을 세우기 위한 표시 회전 (90° 단위 스텝, 실측 3 = 270°).</summary>
        public int rotationSteps = 3;

        Camera _camera;
        Texture2D _texture;
        Mesh _quad;
        float _imageAspect = 4f / 3f;
        bool _mappingDirty = true;

        // ImageToViewport 파생값 (매핑 파라미터 변경 시 재계산)
        float _coverScale;
        Vector2 _screenUnits;

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void Init(Camera cam)
        {
            _camera = cam;

            var shader = Resources.Load<Shader>("CameraFeed");
            var material = new Material(shader);

            _quad = new Mesh { name = "CameraFeedQuad" };
            _quad.MarkDynamic();

            gameObject.AddComponent<MeshFilter>().sharedMesh = _quad;
            var renderer = gameObject.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = material;
            _material = material;
        }

        Material _material;

        /// <summary>카메라 전환 시 호출. 후면 회전값은 실기기 확인 필요.</summary>
        public void SetUserFacing(bool userFacing)
        {
            mirror = false;
            rotationSteps = userFacing ? 3 : 1;
            _mappingDirty = true;
        }

        public void SetCalibration(bool mirrorOn, int rotSteps)
        {
            mirror = mirrorOn;
            if (rotSteps >= 0) rotationSteps = rotSteps;
            _mappingDirty = true;
        }

        /// <summary>
        /// 추론이 끝난 프레임을 화면에 반영한다. buffer는 RGBA32,
        /// 호출이 끝나면 재사용해도 된다 (LoadRawTextureData가 복사).
        /// </summary>
        public void Present(NativeArray<byte> buffer, int width, int height)
        {
            if (_texture == null || _texture.width != width || _texture.height != height)
            {
                if (_texture != null) Destroy(_texture);
                _texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
                _texture.wrapMode = TextureWrapMode.Clamp;
                _material.mainTexture = _texture;
                _imageAspect = (float)width / height;
                _mappingDirty = true;
            }

            _texture.LoadRawTextureData(buffer);
            _texture.Apply(false, false);

            if (_mappingDirty) RebuildMapping();
        }

        void RebuildMapping()
        {
            _mappingDirty = false;

            // 화면 단위(중심 기준, 높이 1): 회전된 이미지가 화면을 완전히 덮는
            // 최소 배율(aspect-fill)을 구한다.
            _screenUnits = new Vector2(_camera.aspect, 1f);
            var extents = RotateSteps(new Vector2(_imageAspect, 1f), rotationSteps);
            var rw = Mathf.Abs(extents.x);
            var rh = Mathf.Abs(extents.y);
            _coverScale = Mathf.Max(_screenUnits.x / rw, _screenUnits.y / rh);

            // 쿼드 = 이미지 네 모서리를 랜드마크와 같은 변환으로 배치.
            // 텍스처 UV는 (u,v)를 그대로 쓴다: 변환 버퍼의 첫 행(이미지 상단)이
            // LoadRawTextureData로 텍스처 v=0에 올라가므로, 이미지 v와 텍스처 v가
            // 같은 방향이 된다 (모서리별 UV 지정이라 방향은 어차피 여기서 흡수됨).
            var corners = new[]
            {
                new Vector2(0f, 0f), new Vector2(1f, 0f),
                new Vector2(1f, 1f), new Vector2(0f, 1f),
            };
            var vertices = new Vector3[4];
            var uvs = new Vector2[4];
            for (var i = 0; i < 4; i++)
            {
                var vp = ImageToViewport(corners[i]);
                vertices[i] = transform.InverseTransformPoint(
                    _camera.ViewportToWorldPoint(new Vector3(vp.x, vp.y, QuadDistance)));
                uvs[i] = new Vector2(corners[i].x, corners[i].y);
            }

            _quad.Clear();
            _quad.vertices = vertices;
            _quad.uv = uvs;
            _quad.triangles = new[] { 0, 1, 2, 0, 2, 3 };
            _quad.RecalculateBounds();
        }

        /// <summary>
        /// 센서 이미지 UV(원점 좌상단, y 아래) → 화면 뷰포트(원점 좌하단).
        /// 쿼드와 랜드마크가 공유하는 유일한 매핑.
        /// </summary>
        public Vector2 ImageToViewport(Vector2 imageUV)
        {
            var p = new Vector2((imageUV.x - 0.5f) * _imageAspect, 0.5f - imageUV.y);
            p = RotateSteps(p, rotationSteps) * _coverScale;
            // 미러는 회전 후(화면 기준)에 적용해야 좌우 반전으로 보인다
            // (회전 전에 하면 90° 회전을 지나며 상하 반전이 된다)
            if (mirror) p.x = -p.x;
            return new Vector2(p.x / _screenUnits.x + 0.5f, p.y / _screenUnits.y + 0.5f);
        }

        static Vector2 RotateSteps(Vector2 p, int steps)
        {
            switch (((steps % 4) + 4) % 4)
            {
                case 1: return new Vector2(-p.y, p.x);
                case 2: return new Vector2(-p.x, -p.y);
                case 3: return new Vector2(p.y, -p.x);
                default: return p;
            }
        }
    }
}
