using System;
using System.Collections;
using System.IO;
using ARMakeup.Bridge;
using ARMakeup.Capture;
using Unity.Collections;
using UnityEngine;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
using AOT;
#endif
#if MEDIAPIPE
using Mediapipe;
using Mediapipe.Tasks.Vision.FaceLandmarker;
using Mediapipe.Unity;
#endif

namespace ARMakeup.Face
{
    /// <summary>
    /// 사전 촬영 미디어 보정 — 갤러리의 사진/영상을 라이브 카메라 대신 편집 대상으로 삼아
    /// 기존 메이크업 스택을 그대로 태운다.
    ///
    /// 핵심은 "프레임 소스 교체": 메이크업 렌더러 15종은 <see cref="FaceLandmarkSource"/>의
    /// 랜드마크 478pt + 표시 프레임에만 의존하므로, 카메라 대신 임포트 미디어를 밀어주면
    /// 나머지 파이프라인(립·눈썹·섀도·워프·저장)이 무변경 재사용된다.
    ///
    /// 사진(IMAGE 모드): 네이티브가 EXIF를 정립으로 정규화 → MediaPipe 1회 검출 →
    ///   FaceLandmarkSource.BeginExternalMode + PushExternalFrame → 사용자가 컴포저로 실시간
    ///   조정 → saveEditedPhoto가 소스 종횡비로 합성 저장.
    /// 영상(VIDEO 모드, 오프라인): enterVideoEdit가 첫 프레임을 편집 스틸로 보여주고(사진과
    ///   동일 UI로 룩 조정), applyVideoEdit가 네이티브 디코더로 전 프레임을 돌며 프레임별
    ///   검출·렌더·인코딩(+원본 오디오 패스스루)한다. 실시간 제약이 없어 디스플레이 레이트에
    ///   구애받지 않고 한 프레임씩 결정적으로 처리한다.
    ///
    /// MEDIAPIPE 전용(임의 이미지 랜드마크 필요). iOS 네이티브(MediaEditor.mm)가 이미지
    /// 정규화·영상 디코드/인코드/오디오 머지를 담당한다. 에디터/Android/비MEDIAPIPE에선
    /// 요청에 error로 응답한다(라이브 씬은 그대로 돈다).
    /// </summary>
    public class MediaEditController : MonoBehaviour
    {
        public static MediaEditController Instance { get; private set; }

        // 오프라인 출력 긴 변 상한(px, 짝수). 4K 소스도 이 이하로 다운스케일해 프레임당
        // RT·리드백·검출 비용을 유계로 만든다(품질/속도 균형, 실기기 튜닝 대상).
        const int MaxLongSide = 1920;

        // 영상 편집: 프레임 몇 개마다 진행률을 RN에 통지(과다 브리지 방지).
        const int ProgressEvery = 12;

        bool _busy;
        bool _inEdit;                 // 편집 스틸 표시 중(사진 또는 영상 첫 프레임)
        string _pendingVideoPath;     // enterVideoEdit로 기억한 소스 영상(applyVideoEdit 대상)

#if UNITY_IOS && !UNITY_EDITOR
        delegate void MediaDoneCallback(int success, string message);

        [DllImport("__Internal")]
        static extern int armakeupNormalizeImage(string srcPath, string dstPath);

        [DllImport("__Internal")]
        static extern int armakeupProbeVideo(
            string srcPath, int maxLongSide,
            out int width, out int height, out int frameCount, out int fpsNum, out int fpsDen);

        [DllImport("__Internal")]
        static extern int armakeupDecodeFirstFrame(
            string srcPath, int maxLongSide, byte[] outRgba, int cap, out int width, out int height);

        [DllImport("__Internal")]
        static extern int armakeupVideoEditBegin(
            string srcPath, string dstPath, int maxLongSide,
            out int width, out int height, out int frameCount, out int fpsNum, out int fpsDen);

        [DllImport("__Internal")]
        static extern int armakeupVideoEditReadFrame(
            byte[] outRgba, int cap, out long ptsValue, out int ptsScale);

        [DllImport("__Internal")]
        static extern int armakeupVideoEditWriteFrame(
            byte[] rgba, int length, long ptsValue, int ptsScale);

        [DllImport("__Internal")]
        static extern void armakeupVideoEditEnd(MediaDoneCallback callback);

        [DllImport("__Internal")]
        static extern void armakeupVideoEditAbort();

        // 사진 앨범 저장 — PhotoCapture와 공유하는 기존 네이티브(PhotoAlbumSaver.mm).
        [DllImport("__Internal")]
        static extern void armakeupSaveToPhotoAlbum(string path, MediaDoneCallback callback);

        static readonly MediaDoneCallback AlbumSaveHandler = OnAlbumSave;

        [MonoPInvokeCallback(typeof(MediaDoneCallback))]
        static void OnAlbumSave(int success, string message)
        {
            if (success == 0)
                Debug.LogWarning($"[MediaEditController] 앨범 저장 실패: {message}");
        }

        // 마셜된 델리게이트를 네이티브 완료 콜백까지 살려 둔다.
        static readonly MediaDoneCallback VideoDoneHandler = OnVideoEditDone;

        [MonoPInvokeCallback(typeof(MediaDoneCallback))]
        static void OnVideoEditDone(int success, string message)
        {
            var self = Instance;
            if (self == null) return;
            if (success != 0)
                NativeBridge.Send(new UnityToRNMessage { type = "videoEditDone", path = self._lastVideoOut });
            else
                NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = $"영상 편집 저장 실패: {message}" });
        }
#endif

        string _lastVideoOut;

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
#if MEDIAPIPE
            CloseLandmarker();
            if (_frameNA.IsCreated) _frameNA.Dispose();
#endif
        }

        void OnEnable() => NativeBridge.MessageReceived += OnMessage;
        void OnDisable() => NativeBridge.MessageReceived -= OnMessage;

        void OnMessage(RNToUnityMessage msg)
        {
            switch (msg.type)
            {
                case "enterPhotoEdit": EnterPhotoEdit(msg.path); break;
                case "enterVideoEdit": EnterVideoEdit(msg.path); break;
                case "saveEditedPhoto": SaveEditedPhoto(); break;
                case "applyVideoEdit": ApplyVideoEdit(); break;
                case "exitEdit": ExitEdit(); break;
            }
        }

#if !MEDIAPIPE
        // MediaPipe 미설치 폴백 — 임의 이미지 랜드마크가 없어 미디어 편집 불가.
        void EnterPhotoEdit(string path) => Unsupported();
        void EnterVideoEdit(string path) => Unsupported();
        void SaveEditedPhoto() => Unsupported();
        void ApplyVideoEdit() => Unsupported();
        void ExitEdit() { }

        static void Unsupported() => NativeBridge.Send(new UnityToRNMessage
        {
            type = "error",
            message = "미디어 보정은 MediaPipe 설치 후 지원됩니다 (scripts/setup-mediapipe.sh).",
        });
#else
        FaceLandmarker _landmarker;
        Mediapipe.Tasks.Vision.Core.RunningMode _landmarkerMode;
        NativeArray<byte> _frameNA;        // 편집 프레임(top-first RGBA) — Image·PushExternalFrame 공용
        readonly Vector3[] _landmarks = new Vector3[FaceLandmarkSource.LandmarkCount];
        bool _assetReady;

        // 모델 파일을 네이티브가 읽을 캐시 경로로 준비(FaceLandmarkSource.Start와 동일 자원).
        // 라이브 소스가 기동 시 이미 준비했지만, 편집 진입이 그보다 이를 수 있어 자체 보장.
        IEnumerator PrepareAsset()
        {
            if (_assetReady) yield break;
            Mediapipe.Unity.IResourceManager resources = new StreamingAssetsResourceManager();
            yield return resources.PrepareAssetAsync("face_landmarker.task");
            _assetReady = true;
        }

        // 지정 running mode의 랜드마커를 보장한다(모드가 다르면 재생성). IMAGE=사진,
        // VIDEO=영상 오프라인(프레임간 시간 상태 유지). LIVE_STREAM은 라이브 소스 몫.
        bool EnsureLandmarker(Mediapipe.Tasks.Vision.Core.RunningMode mode)
        {
            if (_landmarker != null && _landmarkerMode == mode) return true;
            CloseLandmarker();
            if (TryCreate(mode, Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU) ||
                TryCreate(mode, Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU))
            {
                _landmarkerMode = mode;
                return true;
            }
            Debug.LogError($"[MediaEditController] FaceLandmarker 생성 실패 ({mode})");
            return false;
        }

        bool TryCreate(
            Mediapipe.Tasks.Vision.Core.RunningMode mode, Mediapipe.Tasks.Core.BaseOptions.Delegate del)
        {
            try
            {
                var options = new FaceLandmarkerOptions(
                    new Mediapipe.Tasks.Core.BaseOptions(del, modelAssetPath: "face_landmarker.task"),
                    runningMode: mode,
                    numFaces: 1);
                _landmarker = FaceLandmarker.CreateFromOptions(options);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[MediaEditController] {del}/{mode} 생성 실패: {e.Message}");
                return false;
            }
        }

        void CloseLandmarker()
        {
            try { _landmarker?.Close(); }
            catch (Exception e) { Debug.LogWarning($"[MediaEditController] Close 실패: {e.Message}"); }
            _landmarker = null;
        }

        // MediaPipe 결과 → _landmarks. hasFace 반환.
        static bool ParseResult(FaceLandmarkerResult result, Vector3[] outLandmarks)
        {
            var faces = result.faceLandmarks;
            if (faces == null || faces.Count == 0) return false;
            var landmarks = faces[0].landmarks;
            var count = Mathf.Min(landmarks.Count, FaceLandmarkSource.LandmarkCount);
            for (var i = 0; i < count; i++)
            {
                var lm = landmarks[i];
                outLandmarks[i] = new Vector3(lm.x, lm.y, lm.z);
            }
            return true;
        }

        // ── 사진 ──────────────────────────────────────────────────────────────

        void EnterPhotoEdit(string path)
        {
            if (_busy) return;
            StartCoroutine(EnterStillRoutine(path, null));
        }

        void EnterVideoEdit(string path)
        {
            if (_busy) return;
            StartCoroutine(EnterStillRoutine(null, path));
        }

        // 사진 경로(photoPath!=null) 또는 영상 첫 프레임(videoPath!=null)을 편집 스틸로 로드.
        IEnumerator EnterStillRoutine(string photoPath, string videoPath)
        {
            _busy = true;
            var w = 0; var h = 0;
            NativeArray<byte> top = default;
            try
            {
                if (photoPath != null)
                {
                    if (!LoadPhotoUpright(photoPath, out top, out w, out h))
                    {
                        NativeBridge.Send(new UnityToRNMessage
                        { type = "error", message = "사진을 불러오지 못했습니다." });
                        yield break;
                    }
                }
                else
                {
                    if (!LoadVideoFirstFrame(videoPath, out top, out w, out h))
                    {
                        NativeBridge.Send(new UnityToRNMessage
                        { type = "error", message = "영상을 불러오지 못했습니다." });
                        yield break;
                    }
                    _pendingVideoPath = videoPath;
                }
            }
            finally
            {
                if (w == 0 && top.IsCreated) top.Dispose();
                if (w == 0) _busy = false;
            }
            if (w == 0) yield break;

            yield return PrepareAsset();

            var hasFace = false;
            try
            {
                var source = FaceLandmarkSource.Instance;
                if (source == null)
                {
                    NativeBridge.Send(new UnityToRNMessage
                    { type = "error", message = "랜드마크 소스가 없습니다 (MediaPipe 경로 전용)." });
                    yield break;
                }
                // 라이브 랜드마커를 먼저 닫아(GPU 반납) 편집용 랜드마커와 동시 점유를 피한다.
                source.BeginExternalMode();

                if (EnsureLandmarker(Mediapipe.Tasks.Vision.Core.RunningMode.IMAGE))
                {
                    using var image = new Image(ImageFormat.Types.Format.Srgba, w, h, w * 4, top);
                    var result = _landmarker.Detect(image, null); // 정립 이미지 → 회전 0
                    hasFace = ParseResult(result, _landmarks);
                }

                source.PushExternalFrame(top, w, h, _landmarks, hasFace);
                _inEdit = true;
                NativeBridge.Send(new UnityToRNMessage { type = "editReady", tracked = hasFace });
            }
            finally
            {
                if (top.IsCreated) top.Dispose(); // PushExternalFrame이 내부 사본을 보유
                _busy = false;
            }
        }

        // 네이티브 EXIF 정립 정규화 → 로드 → top-first RGBA. 실패 시 원본 그대로 시도(폴백).
        bool LoadPhotoUpright(string path, out NativeArray<byte> top, out int w, out int h)
        {
            top = default; w = 0; h = 0;
            var src = ResolvePath(path);
            var upright = Path.Combine(Application.temporaryCachePath,
                $"edit_src_{Guid.NewGuid():N}.jpg");
            var loadPath = src;
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                if (armakeupNormalizeImage(src, upright) != 0 && File.Exists(upright))
                    loadPath = upright;
            }
            catch (Exception e) { Debug.LogWarning($"[MediaEditController] 정규화 실패: {e.Message}"); }
#endif
            if (!ImageFileLoader.TryLoad(loadPath, out var tex, out var error))
            {
                Debug.LogWarning($"[MediaEditController] 사진 로드 실패: {error}");
                TryDelete(upright);
                return false;
            }
            tex = CapTexture(tex, MaxLongSide); // 영상 경로와 동일하게 긴 변 상한(대용량 사진 방어)
            top = ToTopFirstRGBA(tex, out w, out h);
            UnityEngine.Object.Destroy(tex);
            TryDelete(upright);
            return true;
        }

        // 영상 첫 프레임(top-first RGBA)을 캡드 해상도로 디코드.
        bool LoadVideoFirstFrame(string path, out NativeArray<byte> top, out int w, out int h)
        {
            top = default; w = 0; h = 0;
#if UNITY_IOS && !UNITY_EDITOR
            var src = ResolvePath(path);
            if (armakeupProbeVideo(src, MaxLongSide, out var pw, out var ph, out _, out _, out _) == 0)
                return false;
            if (pw <= 0 || ph <= 0) return false;
            var buf = new byte[pw * ph * 4];
            var written = armakeupDecodeFirstFrame(src, MaxLongSide, buf, buf.Length, out w, out h);
            if (written <= 0 || w <= 0 || h <= 0) return false;
            top = new NativeArray<byte>(w * h * 4, Allocator.Persistent);
            top.CopyFrom(buf);
            return true;
#else
            Debug.LogWarning("[MediaEditController] 영상 디코드는 iOS 전용");
            return false;
#endif
        }

        void SaveEditedPhoto()
        {
            if (!_inEdit || _busy)
            {
                if (!_inEdit) NativeBridge.Send(new UnityToRNMessage
                { type = "error", message = "편집 중인 사진이 없습니다." });
                return;
            }
            StartCoroutine(SavePhotoRoutine());
        }

        IEnumerator SavePhotoRoutine()
        {
            _busy = true;
            yield return new WaitForEndOfFrame();

            var cam = CaptureComposite.SceneCamera;
            var presenter = FramePresenter.Instance;
            if (cam == null || presenter == null)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = "장면 카메라가 준비되지 않았습니다." });
                _busy = false;
                yield break;
            }

            // 편집 스틸의 표시 종횡비(=소스 프레임 종횡비)로 오프스크린 렌더 → 소스 프레이밍 그대로.
            var aspect = presenter.ImageAspect;
            EvenSize(aspect, MaxLongSide, out var w, out var h);

            Texture2D tex = null;
            RenderTexture rt = null;
            var prevActive = RenderTexture.active;
            try
            {
                cam.aspect = (float)w / h;
                presenter.SetExternalRenderAspect((float)w / h);

                rt = RenderTexture.GetTemporary(w, h, 24, RenderTextureFormat.ARGB32);
                CaptureComposite.RenderInto(cam, rt, false); // 편집 미디어는 미러 안 함(셀피 아님)

                tex = new Texture2D(w, h, TextureFormat.RGB24, false);
                tex.ReadPixels(new UnityEngine.Rect(0, 0, w, h), 0, 0);
                tex.Apply(false, false);

                var bytes = tex.EncodeToJPG(92);
                var fileName = $"armakeup_edit_{DateTime.Now:yyyyMMdd_HHmmss_fff}.jpg";
                var outPath = Path.Combine(Application.persistentDataPath, fileName);
                File.WriteAllBytes(outPath, bytes);
                NativeBridge.Send(new UnityToRNMessage { type = "editPhotoSaved", path = outPath });
                SaveImageToAlbum(outPath);
            }
            catch (Exception e)
            {
                Debug.LogError($"[MediaEditController] 사진 저장 실패: {e}");
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = e.Message });
            }
            finally
            {
                cam.ResetAspect(); // 자동(화면) 종횡비로 복귀
                presenter.SetExternalRenderAspect(-1f); // 프리뷰는 화면 종횡비(레터박스 핏)로 복귀
                RenderTexture.active = prevActive;
                if (rt != null) RenderTexture.ReleaseTemporary(rt);
                if (tex != null) UnityEngine.Object.Destroy(tex);
                _busy = false;
            }
        }

        // ── 영상(오프라인) ─────────────────────────────────────────────────────

        void ApplyVideoEdit()
        {
            if (_busy) return;
            if (string.IsNullOrEmpty(_pendingVideoPath))
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = "적용할 영상이 없습니다." });
                return;
            }
            StartCoroutine(ProcessVideoRoutine(_pendingVideoPath));
        }

        IEnumerator ProcessVideoRoutine(string srcPath)
        {
#if UNITY_IOS && !UNITY_EDITOR
            _busy = true;
            var src = ResolvePath(srcPath);
            _lastVideoOut = Path.Combine(
                Application.persistentDataPath, $"armakeup_edit_{DateTime.Now:yyyyMMdd_HHmmss_fff}.mov");

            var cam = CaptureComposite.SceneCamera;
            var presenter = FramePresenter.Instance;
            var source = FaceLandmarkSource.Instance;
            if (cam == null || presenter == null || source == null)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = "장면이 준비되지 않았습니다." });
                _busy = false;
                yield break;
            }

            int w = 0, h = 0, frameCount = 0, fpsNum = 30, fpsDen = 1;
            if (armakeupVideoEditBegin(src, _lastVideoOut, MaxLongSide,
                    out w, out h, out frameCount, out fpsNum, out fpsDen) == 0 || w <= 0 || h <= 0)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = "영상을 열지 못했습니다." });
                _busy = false;
                yield break;
            }
            // 이 아래는 네이티브 세션(gReader/gWriter)이 열린 상태 → 어떤 예외·중단에도 반드시
            // 정리한다(_busy 해제·미완료 세션 abort·RT 반납·종횡비 복구). 프레임 루프 중 예외가
            // 컨트롤러를 영구 잠그거나 세션·텍스처를 누수하지 않게 try/finally로 감싼다(적대 리뷰).
            RenderTexture rt = null;
            Texture2D readback = null;
            var aborted = false;
            var finalized = false;
            try
            {
                // VIDEO 모드 랜드마커·버퍼·RT를 이 패스 동안 유지.
                yield return PrepareAsset();
                if (!EnsureLandmarker(Mediapipe.Tasks.Vision.Core.RunningMode.VIDEO))
                {
                    NativeBridge.Send(new UnityToRNMessage { type = "error", message = "검출기 생성 실패." });
                    yield break; // finally가 abort + 정리
                }

                if (!source.ExternalMode) source.BeginExternalMode();
                var size = w * h * 4;
                // NativeArray.CopyFrom(byte[])는 길이가 정확히 같아야 하므로 크기가 다르면 재할당.
                if (!_frameNA.IsCreated || _frameNA.Length != size)
                {
                    if (_frameNA.IsCreated) _frameNA.Dispose();
                    _frameNA = new NativeArray<byte>(size, Allocator.Persistent);
                }
                var readBuf = new byte[size];
                var writeBuf = new byte[size];
                var frameDurMs = fpsNum > 0 ? 1000.0 * fpsDen / fpsNum : 33.3;

                rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32);
                rt.Create();
                readback = new Texture2D(w, h, TextureFormat.RGBA32, false);
                cam.aspect = (float)w / h;
                presenter.SetExternalRenderAspect((float)w / h);

                var index = 0;
                while (true)
                {
                    long ptsValue; int ptsScale;
                    var read = armakeupVideoEditReadFrame(readBuf, readBuf.Length, out ptsValue, out ptsScale);
                    if (read == 0) break;      // EOF
                    if (read < 0) { aborted = true; break; }

                    // 검출 (VIDEO 모드, 단조 증가 타임스탬프).
                    _frameNA.CopyFrom(readBuf);
                    var hasFace = false;
                    try
                    {
                        using var image = new Image(ImageFormat.Types.Format.Srgba, w, h, w * 4, _frameNA);
                        var ts = (long)(index * frameDurMs);
                        var result = _landmarker.DetectForVideo(image, ts, null);
                        hasFace = ParseResult(result, _landmarks);
                    }
                    catch (Exception e)
                    {
                        Debug.LogWarning($"[MediaEditController] 프레임 {index} 검출 실패: {e.Message}");
                    }

                    // 표시·랜드마크 반영 → 렌더러가 이 프레임에 메이크업을 얹는다.
                    source.PushExternalFrame(_frameNA, w, h, _landmarks, hasFace);
                    yield return new WaitForEndOfFrame(); // LateUpdate(렌더러 갱신) 이후로 진행

                    // 오프스크린 합성 → 리드백(bottom-first) → 네이티브 인코더(수직 플립은 네이티브).
                    var prevActive = RenderTexture.active;
                    try
                    {
                        CaptureComposite.RenderInto(cam, rt, false); // active=rt
                        readback.ReadPixels(new UnityEngine.Rect(0, 0, w, h), 0, 0);
                        readback.Apply(false, false);
                        readback.GetRawTextureData<byte>().CopyTo(writeBuf);
                    }
                    finally
                    {
                        RenderTexture.active = prevActive;
                    }

                    if (armakeupVideoEditWriteFrame(writeBuf, writeBuf.Length, ptsValue, ptsScale) == 0)
                        Debug.LogWarning($"[MediaEditController] 프레임 {index} 기록 드롭");

                    index++;
                    if (index % ProgressEvery == 0)
                    {
                        var prog = frameCount > 0 ? Mathf.Clamp01((float)index / frameCount) : 0f;
                        NativeBridge.Send(new UnityToRNMessage { type = "videoEditProgress", progress = prog });
                    }
                }

                if (!aborted)
                {
                    NativeBridge.Send(new UnityToRNMessage { type = "videoEditProgress", progress = 1f });
                    // 비동기 finalize + 오디오 머지 + 앨범 → OnVideoEditDone. 성공 경로라 finally에서 abort 안 함.
                    armakeupVideoEditEnd(VideoDoneHandler);
                    finalized = true;
                }
            }
            finally
            {
                cam.ResetAspect(); // 자동(화면) 종횡비로 복귀
                presenter.SetExternalRenderAspect(-1f); // 프리뷰는 화면 종횡비(레터박스 핏)로 복귀
                if (rt != null) { rt.Release(); Destroy(rt); }
                if (readback != null) Destroy(readback);
                if (!finalized) armakeupVideoEditAbort(); // 미완료(중단·예외) 세션 정리
                _busy = false;
            }

            if (aborted)
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = "영상 디코드 중단." });
#else
            NativeBridge.Send(new UnityToRNMessage { type = "error", message = "영상 편집은 iOS 전용입니다." });
            yield break;
#endif
        }

        void ExitEdit()
        {
            if (!_inEdit) return;
            _inEdit = false;
            _pendingVideoPath = null;
            CloseLandmarker();
            if (FaceLandmarkSource.Instance != null) FaceLandmarkSource.Instance.EndExternalMode();
            NativeBridge.Send(new UnityToRNMessage { type = "editExited" });
        }

        // ── 헬퍼 ────────────────────────────────────────────────────────────────

        // Unity Texture2D(GetPixels32 = bottom-first) → top-first RGBA NativeArray.
        // 라이브 카메라 버퍼(행0=이미지 상단)와 같은 레이아웃으로 맞춰 FramePresenter·MediaPipe·
        // CPU 샘플러가 전부 정합한다.
        static NativeArray<byte> ToTopFirstRGBA(Texture2D tex, out int w, out int h)
        {
            w = tex.width; h = tex.height;
            var px = tex.GetPixels32();
            var buf = new NativeArray<byte>(w * h * 4, Allocator.Persistent);
            for (var y = 0; y < h; y++)
            {
                var srcRow = (h - 1 - y) * w; // 세로 뒤집기(bottom→top)
                var dstRow = y * w;
                for (var x = 0; x < w; x++)
                {
                    var c = px[srcRow + x];
                    var di = (dstRow + x) * 4;
                    buf[di] = c.r;
                    buf[di + 1] = c.g;
                    buf[di + 2] = c.b;
                    buf[di + 3] = c.a;
                }
            }
            return buf;
        }

        // 긴 변이 maxLong을 넘으면 바이리니어 다운스케일한 새 텍스처를 반환(원본 파기).
        // 이하이면 원본 그대로. 대용량(예: 12MP) 사진의 NativeArray·Detect 비용을 유계로.
        static Texture2D CapTexture(Texture2D src, int maxLong)
        {
            int w = src.width, h = src.height;
            var longSide = Mathf.Max(w, h);
            if (longSide <= maxLong) return src;
            var scale = (float)maxLong / longSide;
            var nw = Mathf.Max(2, Mathf.RoundToInt(w * scale));
            var nh = Mathf.Max(2, Mathf.RoundToInt(h * scale));
            var rt = RenderTexture.GetTemporary(nw, nh, 0, RenderTextureFormat.ARGB32);
            var prev = RenderTexture.active;
            Graphics.Blit(src, rt);
            RenderTexture.active = rt;
            var dst = new Texture2D(nw, nh, TextureFormat.RGBA32, false);
            dst.ReadPixels(new UnityEngine.Rect(0, 0, nw, nh), 0, 0);
            dst.Apply(false, false);
            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);
            UnityEngine.Object.Destroy(src);
            return dst;
        }

        // 종횡비 aspect(=w/h), 긴 변 상한 maxLong → 짝수 (w,h). H.264/RT는 짝수 요구.
        static void EvenSize(float aspect, int maxLong, out int w, out int h)
        {
            if (aspect >= 1f) { w = maxLong; h = Mathf.RoundToInt(maxLong / aspect); }
            else { h = maxLong; w = Mathf.RoundToInt(maxLong * aspect); }
            w = Mathf.Max(2, w & ~1);
            h = Mathf.Max(2, h & ~1);
        }
#endif

        static string ResolvePath(string path)
        {
            if (string.IsNullOrEmpty(path)) return path;
            return path.StartsWith("file://") ? path.Substring(7) : path;
        }

        static void TryDelete(string path)
        {
            try { if (!string.IsNullOrEmpty(path) && File.Exists(path)) File.Delete(path); }
            catch { /* best-effort */ }
        }

        static void SaveImageToAlbum(string path)
        {
#if UNITY_IOS && !UNITY_EDITOR
            try { armakeupSaveToPhotoAlbum(path, AlbumSaveHandler); }
            catch (Exception e) { Debug.LogWarning($"[MediaEditController] 앨범 저장 실패: {e.Message}"); }
#else
            Debug.Log($"[MediaEditController] 앨범 저장 스킵(에디터/비iOS): {path}");
#endif
        }
    }
}
