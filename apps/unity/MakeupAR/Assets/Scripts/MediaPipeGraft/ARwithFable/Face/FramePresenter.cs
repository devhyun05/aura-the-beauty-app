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
    // 실행 순서 -50: 좌표 매핑 소유·LateUpdate에서 배경 워프 기록 —
    // ImageToViewport를 쓰는 메이크업 렌더러(-10 이상)보다 먼저.
    [DefaultExecutionOrder(-50)]
    public class FramePresenter : MonoBehaviour
    {
        const float QuadDistance = 5f; // 카메라로부터 쿼드까지 (메이크업 메시 0.5m보다 뒤)

        public static FramePresenter Instance { get; private set; }

        // ── facing별 표시 매핑 자동 추정값 (세로 고정 기준) ──
        // 캘리브레이션 오버라이드(setCalibration의 flipY/matrixMode)가 항상 우선이고,
        // 아래는 오버라이드가 없을 때 SetUserFacing이 적용하는 facing별 기본값.
        const int FrontRotationSteps = 3;  // 270° — 실기기 확정 (iPhone 15 Pro)
        const bool FrontMirror = false;    // 전면 센서 이미지 자체가 거울상 → 추가 미러 불필요 — 실기기 확정
        const int RearRotationSteps = 3;   // 270° — 실기기 확정 (iPhone 15 Pro Max, 90°였을 때 상하 반전)
        const bool RearMirror = false;     // 후면은 미러 없음 — 실기기 확정 (좌우 정상)

        /// <summary>
        /// 화면 가로 기준 좌우 반전 (회전 "후" 적용 — 캘리브레이션 UI의 Y플립 버튼).
        /// 전면 센서 이미지는 자체가 거울상이라 회전 270°만으로 셀피 거울 프리뷰가
        /// 되므로 기본 OFF (iPhone 15 Pro 실측).
        /// </summary>
        public bool mirror = FrontMirror;

        /// <summary>화면에 영상을 세우기 위한 표시 회전 (90° 단위 스텝, 실측 3 = 270°).</summary>
        public int rotationSteps = FrontRotationSteps;

        bool _userFacing = true; // ARBootstrap 초기 요청이 전면

        /// <summary>현재 전면(셀피) 카메라인지 — 저장 시 un-mirror 판정용(CaptureComposite).</summary>
        public bool IsFront => _userFacing;
        bool _mirrorOverridden;   // setCalibration이 명시한 값은 자동 추정으로 되돌리지 않음
        bool _rotationOverridden;

        Camera _camera;
        Texture2D _texture;
        Mesh _quad;
        float _imageAspect = 4f / 3f;
        bool _mappingDirty = true;

        // ── 미디어 편집 모드(사진/영상 보정) ──
        // 임포트 미디어는 EXIF 정규화로 이미 정립(비회전)·비미러라 라이브 facing 매핑을
        // 쓰지 않는다. 또 편집 화면은 전체가 보이도록 커버(fill) 대신 핏(fit=레터박스)으로
        // 맞춘다. 오프라인 렌더 시엔 소스 종횡비의 RT에 정확히 채워지도록(핏==필) 매핑
        // 종횡비를 화면이 아니라 소스로 오버라이드한다.
        bool _externalUpright;
        float _aspectOverride = -1f; // >0이면 이 종횡비로 매핑(오프라인 렌더), -1=카메라(화면)
        // 편집 진입 전 라이브 매핑(캘리브레이션 오버라이드 포함)을 그대로 되살리기 위한 캐시.
        bool _savedMirror;
        int _savedRotationSteps;
        bool _savedMirrorOverridden, _savedRotationOverridden;

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

            // The embedded AURA scene can activate the makeup graph before the
            // first delayed camera frame reaches Present(). Initialise the
            // coordinate map from the default camera aspect immediately so
            // face vertices never go through a 0 / 0 viewport transform.
            RebuildMapping();
        }

        Material _material;

        /// <summary>
        /// 카메라 전환 시 호출(MakeupController.SetCamera). facing별 자동 추정값만
        /// 갱신하고, setCalibration으로 명시된 오버라이드는 유지한다(항상 우선).
        /// 후면 회전/미러는 실기기 확인 필요 — 상수 주석 참고.
        /// </summary>
        public void SetUserFacing(bool userFacing)
        {
            _userFacing = userFacing;
            if (_externalUpright) return; // 편집 모드에선 정립 매핑 고정(라이브 facing 무시)
            if (!_mirrorOverridden) mirror = userFacing ? FrontMirror : RearMirror;
            if (!_rotationOverridden)
                rotationSteps = userFacing ? FrontRotationSteps : RearRotationSteps;
            _mappingDirty = true;
        }

        /// <summary>
        /// 캘리브레이션 오버라이드 — 자동 추정보다 항상 우선.
        /// rotSteps = -1이면 회전은 자동 추정(facing별 기본값)으로 복귀한다.
        /// mirrorOn(flipY)은 bool이라 언제나 명시값 취급.
        /// </summary>
        public void SetCalibration(bool mirrorOn, int rotSteps)
        {
            if (_externalUpright) return; // 편집 모드에선 캘리브레이션 회전/미러 무시(정립 고정)
            mirror = mirrorOn;
            _mirrorOverridden = true;
            if (rotSteps >= 0)
            {
                rotationSteps = rotSteps;
                _rotationOverridden = true;
            }
            else
            {
                _rotationOverridden = false; // -1 = 자동 추정 복귀
                rotationSteps = _userFacing ? FrontRotationSteps : RearRotationSteps;
            }
            _mappingDirty = true;
        }

        /// <summary>
        /// 미디어 편집 모드 진입 — 정립(비회전·비미러)·핏(레터박스) 매핑으로 전환.
        /// FaceLandmarkSource.BeginExternalMode가 호출한다.
        /// </summary>
        public void BeginExternal()
        {
            if (!_externalUpright) // 재진입 시엔 이미 저장된 라이브 값을 덮지 않는다
            {
                _savedMirror = mirror;
                _savedRotationSteps = rotationSteps;
                _savedMirrorOverridden = _mirrorOverridden;
                _savedRotationOverridden = _rotationOverridden;
            }
            _externalUpright = true;
            mirror = false;
            rotationSteps = 0;
            _aspectOverride = -1f;
            _mappingDirty = true;
        }

        /// <summary>
        /// 편집 모드 종료 — 편집 진입 전 라이브 매핑을 그대로 복원한다. 사용자가 이전에
        /// setCalibration으로 회전/미러를 오버라이드했다면(플래그가 살아 있으면) SetUserFacing이
        /// 복원을 건너뛰므로, 캐시한 값을 직접 되돌린다(적대 리뷰 confirmed).
        /// </summary>
        public void EndExternal()
        {
            _externalUpright = false;
            _aspectOverride = -1f;
            mirror = _savedMirror;
            rotationSteps = _savedRotationSteps;
            _mirrorOverridden = _savedMirrorOverridden;
            _rotationOverridden = _savedRotationOverridden;
            _mappingDirty = true;
        }

        /// <summary>
        /// 오프라인 렌더용 매핑 종횡비 오버라이드(편집 모드 전용). 소스 프레임 종횡비의
        /// RenderTexture에 정확히 채워지도록(핏==필) 화면 대신 소스 종횡비로 매핑을 굽는다.
        /// aspect ≤ 0이면 화면(카메라) 종횡비로 복귀. 호출 즉시 매핑을 다시 굽는다.
        /// </summary>
        public void SetExternalRenderAspect(float aspect)
        {
            _aspectOverride = aspect > 0f ? aspect : -1f;
            _mappingDirty = true;
            if (_texture != null) RebuildMapping();
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

            if (_camera == null || float.IsNaN(_camera.aspect) || float.IsInfinity(_camera.aspect) || _camera.aspect <= 0.001f)
            {
                _screenUnits = new Vector2(1f, 1f);
                _coverScale = 1f;
                return;
            }

            // 화면 단위(중심 기준, 높이 1): 회전된 이미지가 화면을 덮는 배율.
            //  - 라이브: aspect-fill(max) — 화면을 꽉 채운다(가장자리 크롭).
            //  - 편집(_externalUpright): aspect-fit(min) — 전체가 보이게 화면에 맞춘다(레터박스).
            //    오프라인 렌더 시 RT 종횡비를 소스로 오버라이드하면 min==exact-fill이 돼
            //    출력이 소스 프레이밍 그대로(크롭 없음) 나온다.
            var mapAspect = _aspectOverride > 0f ? _aspectOverride : _camera.aspect;
            _screenUnits = new Vector2(mapAspect, 1f);
            var extents = RotateSteps(new Vector2(_imageAspect, 1f), rotationSteps);
            var rw = Mathf.Abs(extents.x);
            var rh = Mathf.Abs(extents.y);
            _coverScale = _externalUpright
                ? Mathf.Min(_screenUnits.x / rw, _screenUnits.y / rh)
                : Mathf.Max(_screenUnits.x / rw, _screenUnits.y / rh);

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
                // 배경 쿼드 코너는 워프 미적용(raw) — 코너 배치는 그대로 두고, 픽셀
                // 재샘플 워프는 CameraFeed 셰이더가 담당한다. (코너는 눈 반경 밖이라
                // Forward도 사실상 identity지만 명시적으로 raw를 쓴다.)
                var vp = ImageToViewportRaw(corners[i]);
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

        /// <summary>표시 프레임의 이미지 가로세로비 (텍스처 w/h) — 워프 아스펙트 보정용.</summary>
        public float ImageAspect => _imageAspect;

        /// <summary>
        /// 센서 이미지 UV(원점 좌상단, y 아래) → 화면 뷰포트(원점 좌하단).
        /// 쿼드와 랜드마크가 공유하는 유일한 매핑. 얼굴형 보정 워프(FaceWarpField)를
        /// 순방향으로 먼저 적용해 모든 메이크업 정점이 배경 재샘플 워프와 정합한다.
        /// </summary>
        public Vector2 ImageToViewport(Vector2 imageUV)
        {
            EnsureMapping();
            if (FaceWarpField.Instance != null)
            {
                var warped = FaceWarpField.Instance.Forward(imageUV);
                // 유한한 원본을 NaN/Infinity 워프로 덮지 않는다. 원본 자체가 비유한이면
                // 기존 계약대로 Forward 결과를 그대로 흘려 raw 매핑에서도 비유한 상태를 보존한다.
                if (IsFinite(warped) || !IsFinite(imageUV)) imageUV = warped;
            }
            return ImageToViewportRaw(imageUV);
        }

        /// <summary>
        /// FaceWarpField.Forward가 이미 적용된 이미지 UV → 화면 뷰포트.
        /// BrowWarp.WarpAndLiftDroopingTail처럼 최종 워프 공간에서 기하를 만든 경로만
        /// 사용한다. ImageToViewport를 호출하면 얼굴형 워프가 두 번 적용되므로 금지한다.
        /// </summary>
        public Vector2 WarpedImageToViewport(Vector2 warpedImageUV)
        {
            EnsureMapping();
            return ImageToViewportRaw(warpedImageUV);
        }

        void EnsureMapping()
        {
            if (!float.IsNaN(_coverScale) && !float.IsInfinity(_coverScale)
                && _coverScale > 1e-6f
                && IsFinite(_screenUnits)
                && Mathf.Abs(_screenUnits.x) > 1e-6f
                && Mathf.Abs(_screenUnits.y) > 1e-6f)
            {
                return;
            }

            RebuildMapping();
        }

        static bool IsFinite(Vector2 value) =>
            !float.IsNaN(value.x) && !float.IsInfinity(value.x) &&
            !float.IsNaN(value.y) && !float.IsInfinity(value.y);

        /// <summary>워프 미적용 매핑 — 배경 쿼드 코너 배치용(픽셀 워프는 셰이더 담당).</summary>
        Vector2 ImageToViewportRaw(Vector2 imageUV)
        {
            var p = new Vector2((imageUV.x - 0.5f) * _imageAspect, 0.5f - imageUV.y);
            p = RotateSteps(p, rotationSteps) * _coverScale;
            // 미러는 회전 후(화면 기준)에 적용해야 좌우 반전으로 보인다
            // (회전 전에 하면 90° 회전을 지나며 상하 반전이 된다)
            if (mirror) p.x = -p.x;
            return new Vector2(p.x / _screenUnits.x + 0.5f, p.y / _screenUnits.y + 0.5f);
        }

        /// <summary>ImageToViewportRaw의 정확한 역 — 화면 뷰포트 UV(원점 좌하단) → 이미지 UV(원점 좌상단, y 아래).</summary>
        Vector2 ViewportToImageRaw(Vector2 vp)
        {
            var p = new Vector2((vp.x - 0.5f) * _screenUnits.x, (vp.y - 0.5f) * _screenUnits.y);
            if (mirror) p.x = -p.x;
            p = RotateSteps(p, -rotationSteps) / Mathf.Max(_coverScale, 1e-6f);
            return new Vector2(p.x / _imageAspect + 0.5f, 0.5f - p.y);
        }

        /// <summary>
        /// 뷰포트 UV → 이미지 UV 역매핑의 아핀 행 계수: imgU = rowU·(vx, vy, 1), imgV = rowV·(vx, vy, 1).
        /// 세그 오클루전 마스크(카메라 이미지 UV 정렬 — SegmentationSource)를 스크린 공간
        /// 셰이더(메이크업 GrabPass)에서 샘플하기 위한 것. 90° 스텝 회전·미러·커버스케일이
        /// 전부 아핀이므로 기저 3점(원점·x축·y축)의 수치 변환으로 케이스 분기 없이 얻는다.
        /// 워프(FaceWarpField)는 포함하지 않는다 — 역워프는 프래그먼트당 24옵×4회 반복이라
        /// 마스크 게이트에는 과중하고, 미포함 오차는 워프 변위로 유계(Occlusion.cginc 주석).
        /// </summary>
        public bool TryGetViewportToImage(out Vector3 rowU, out Vector3 rowV)
        {
            rowU = new Vector3(1f, 0f, 0f);
            rowV = new Vector3(0f, 1f, 0f);
            if (_coverScale <= 0f) return false; // 첫 프레임 표시(RebuildMapping) 전

            var o = ViewportToImageRaw(new Vector2(0f, 0f));
            var ex = ViewportToImageRaw(new Vector2(1f, 0f)) - o;
            var ey = ViewportToImageRaw(new Vector2(0f, 1f)) - o;
            rowU = new Vector3(ex.x, ey.x, o.x);
            rowV = new Vector3(ex.y, ey.y, o.y);
            return true;
        }

        // 배경 쿼드 셰이더에 워프 유니폼을 프레임당 기록 (렌더 전). 배경이 워프된 픽셀을
        // 그리면 GrabPass 소비자(메이크업 셰이더)도 자동으로 보정된 픽셀 위에서 동작.
        void LateUpdate()
        {
            if (_material != null && FaceWarpField.Instance != null)
                FaceWarpField.Instance.WriteToMaterial(_material);
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
