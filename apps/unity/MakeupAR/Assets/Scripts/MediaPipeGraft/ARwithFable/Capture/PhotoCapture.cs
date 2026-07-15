using System;
using System.Collections;
using System.IO;
using ARMakeup.Bridge;
using UnityEngine;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
using AOT;
#endif

namespace ARMakeup.Capture
{
    /// <summary>
    /// Captures the rendered frame (camera feed + filters) and saves it as a JPG
    /// under Application.persistentDataPath, then reports the file path to RN.
    /// </summary>
    public class PhotoCapture : MonoBehaviour
    {
        public static PhotoCapture Instance { get; private set; }

        bool _busy;

#if UNITY_IOS && !UNITY_EDITOR
        delegate void AlbumSaveCallback(int success, string message);

        [DllImport("__Internal")]
        static extern void armakeupSaveToPhotoAlbum(string path, AlbumSaveCallback callback);

        // Static instance keeps the marshalled delegate alive for the native side.
        static readonly AlbumSaveCallback AlbumSaveResultHandler = OnAlbumSaveResult;

        [MonoPInvokeCallback(typeof(AlbumSaveCallback))]
        static void OnAlbumSaveResult(int success, string message)
        {
            if (success != 0)
            {
                Debug.Log("[PhotoCapture] Saved to photo album.");
            }
            else
            {
                Debug.LogWarning($"[PhotoCapture] Photo album save failed: {message}");
                NativeBridge.Send(new UnityToRNMessage
                {
                    type = "error",
                    message = $"album save failed: {message}"
                });
            }
        }
#endif

        /// <summary>
        /// Adds the saved JPG to the user's photo album. iOS-only; no-op in the
        /// editor and on Android. Failures are reported via callback and never throw
        /// past this method.
        /// </summary>
        static void SaveToAlbum(string path)
        {
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                armakeupSaveToPhotoAlbum(path, AlbumSaveResultHandler);
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[PhotoCapture] Photo album save call failed: {e.Message}");
            }
#else
            Debug.Log($"[PhotoCapture] Album save skipped (editor/non-iOS): {path}");
#endif
        }

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public void Capture()
        {
            if (_busy) return;
            StartCoroutine(CaptureRoutine());
        }

        IEnumerator CaptureRoutine()
        {
            _busy = true;
            yield return new WaitForEndOfFrame();

            Texture2D tex = null;
            RenderTexture rt = null;
            var prevActive = RenderTexture.active;
            try
            {
                // 오프스크린 합성: 화면을 통째로 잡던 ScreenCapture 대신, AR 카메라를
                // 고정 해상도(짧은 변 1080, 화면 종횡비 유지) RenderTexture에 렌더한 뒤
                // 읽어 온다. 결과가 기기 화면 해상도에 묶이지 않고, 영상 녹화
                // (VideoRecorder)와 프레이밍·해상도 규약이 완전히 동일해진다.
                var cam = CaptureComposite.SceneCamera;
                if (cam == null) throw new Exception("scene camera not ready");

                CaptureComposite.ComputeSize(CaptureComposite.DefaultShortEdge, out var w, out var h);
                rt = RenderTexture.GetTemporary(w, h, 24, RenderTextureFormat.ARGB32);
                CaptureComposite.RenderInto(cam, rt, CaptureComposite.ShouldUnmirror); // active = rt 로 남음

                tex = new Texture2D(w, h, TextureFormat.RGB24, false);
                tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
                tex.Apply(false, false);

                var bytes = tex.EncodeToJPG(92);
                var fileName = $"armakeup_{DateTime.Now:yyyyMMdd_HHmmss_fff}.jpg";
                var path = Path.Combine(Application.persistentDataPath, fileName);
                File.WriteAllBytes(path, bytes);
                NativeBridge.Send(new UnityToRNMessage { type = "photoCaptured", path = path });
                SaveToAlbum(path);
            }
            catch (Exception e)
            {
                Debug.LogError($"[PhotoCapture] {e}");
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = e.Message });
            }
            finally
            {
                RenderTexture.active = prevActive;
                if (rt != null) RenderTexture.ReleaseTemporary(rt);
                if (tex != null) Destroy(tex);
                _busy = false;
            }
        }
    }
}
