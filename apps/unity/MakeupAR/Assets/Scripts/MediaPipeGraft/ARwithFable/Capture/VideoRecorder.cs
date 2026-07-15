using System;
using System.Collections;
using System.IO;
using ARMakeup.Bridge;
using Unity.Collections;
using UnityEngine;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
using AOT;
#endif

namespace ARMakeup.Capture
{
    /// <summary>
    /// 오프스크린 합성(카메라 피드 + 메이크업, UI 없음)을 고정 해상도 H.264 .mov로
    /// 녹화한 뒤 사진 앨범에 저장한다. 인코딩은 네이티브 AVAssetWriter
    /// (VideoRecorder.mm)가 담당하고, 여기서는 매 프레임을 오프스크린 RT에 렌더해
    /// RGBA 픽셀을 네이티브로 넘긴다.
    ///
    /// iOS 전용. 에디터/Android에서는 네이티브 플러그인이 없어 no-op이며, 시작 요청은
    /// error 메시지로 응답한다(씬은 그대로 돈다).
    ///
    /// 프레이밍·해상도는 PhotoCapture와 동일하게 <see cref="CaptureComposite"/>를
    /// 공유하므로 스틸과 영상이 똑같이 나온다.
    /// </summary>
    public class VideoRecorder : MonoBehaviour
    {
        public static VideoRecorder Instance { get; private set; }

        const int Fps = 30;

        bool _recording;
        RenderTexture _rt;
        Texture2D _readback;
        byte[] _frameBuffer;
        string _path;
        int _frameIndex;
        float _startTime;
        bool _flipH; // 녹화 시작 시점의 un-mirror 여부(녹화 중 카메라 전환돼도 일관 유지)

#if UNITY_IOS && !UNITY_EDITOR
        delegate void VideoDoneCallback(int success, string message);

        [DllImport("__Internal")]
        static extern int armakeupVideoBegin(string path, int width, int height, int fps);

        [DllImport("__Internal")]
        static extern int armakeupVideoAppend(byte[] rgba, int length, int frameIndex);

        [DllImport("__Internal")]
        static extern void armakeupVideoEnd(VideoDoneCallback callback);

        // 마셜된 델리게이트를 네이티브 완료 콜백까지 살려 둔다.
        static readonly VideoDoneCallback DoneHandler = OnVideoDone;

        [MonoPInvokeCallback(typeof(VideoDoneCallback))]
        static void OnVideoDone(int success, string message)
        {
            // 네이티브 완료 핸들러 스레드에서 올 수 있으므로 브리지 전송은 Instance가
            // 보관한 경로만 사용(메인 스레드 필요 작업 없음).
            var self = Instance;
            if (self == null) return;
            if (success != 0)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "videoCaptured", path = self._path });
            }
            else
            {
                NativeBridge.Send(new UnityToRNMessage
                {
                    type = "error",
                    message = $"video finalize failed: {message}"
                });
            }
        }
#endif

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (_recording) StopInternal(abort: true);
            if (Instance == this) Instance = null;
        }

        public bool IsRecording => _recording;

        public void StartRecording()
        {
            if (_recording) return;

            var cam = CaptureComposite.SceneCamera;
            if (cam == null)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = "scene camera not ready" });
                return;
            }

            CaptureComposite.ComputeSize(CaptureComposite.DefaultShortEdge, out var w, out var h);

            _path = Path.Combine(
                Application.persistentDataPath,
                $"armakeup_{DateTime.Now:yyyyMMdd_HHmmss_fff}.mov");

#if UNITY_IOS && !UNITY_EDITOR
            if (armakeupVideoBegin(_path, w, h, Fps) == 0)
            {
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = "could not start video encoder" });
                return;
            }
#else
            NativeBridge.Send(new UnityToRNMessage { type = "error", message = "video recording is iOS-only" });
            return;
#endif

            _rt = new RenderTexture(w, h, 24, RenderTextureFormat.ARGB32);
            _rt.Create();
            _readback = new Texture2D(w, h, TextureFormat.RGBA32, false);
            _frameBuffer = new byte[w * h * 4];
            _frameIndex = 0;
            _startTime = Time.unscaledTime;
            _flipH = CaptureComposite.ShouldUnmirror;
            _recording = true;

            NativeBridge.Send(new UnityToRNMessage { type = "recordingStarted" });
            StartCoroutine(RecordLoop());
        }

        public void StopRecording()
        {
            if (!_recording) return;
            StopInternal(abort: false);
        }

        IEnumerator RecordLoop()
        {
            var cam = CaptureComposite.SceneCamera;
            while (_recording && cam != null)
            {
                yield return new WaitForEndOfFrame();
                if (!_recording) break;

                // 벽시계 기준으로 목표 fps에 해당하는 프레임 인덱스를 계산해, 디스플레이가
                // 60fps여도 30fps 타임라인으로 균일하게 샘플한다(프레임 중복/건너뜀 최소화).
                var elapsed = Time.unscaledTime - _startTime;
                var targetIndex = Mathf.FloorToInt(elapsed * Fps);
                if (targetIndex < _frameIndex) continue; // 아직 다음 프레임 시각 전

                var prevActive = RenderTexture.active;
                try
                {
                    CaptureComposite.RenderInto(cam, _rt, _flipH); // active = _rt 로 남음
                    _readback.ReadPixels(new Rect(0, 0, _rt.width, _rt.height), 0, 0);
                    _readback.Apply(false, false);

                    NativeArray<byte> raw = _readback.GetRawTextureData<byte>();
                    raw.CopyTo(_frameBuffer);
                }
                finally
                {
                    RenderTexture.active = prevActive;
                }

#if UNITY_IOS && !UNITY_EDITOR
                armakeupVideoAppend(_frameBuffer, _frameBuffer.Length, _frameIndex);
#endif
                _frameIndex++;
            }
        }

        void StopInternal(bool abort)
        {
            _recording = false;
            StopAllCoroutines();

#if UNITY_IOS && !UNITY_EDITOR
            if (!abort)
                armakeupVideoEnd(DoneHandler); // 비동기 finalize + 앨범 저장 → OnVideoDone
#endif

            if (_rt != null) { _rt.Release(); Destroy(_rt); _rt = null; }
            if (_readback != null) { Destroy(_readback); _readback = null; }
            _frameBuffer = null;
        }
    }
}
