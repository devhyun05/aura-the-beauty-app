using System;
using System.Collections;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Unity.Collections;
using UnityEngine;
#if MEDIAPIPE
using Mediapipe;
using Mediapipe.Tasks.Vision.FaceLandmarker;
using Mediapipe.Unity;
#endif

namespace ARMakeup.Face
{
    /// <summary>
    /// 정지영상(파일) 1장에 대한 MediaPipe 얼굴 랜드마크 검출 서비스.
    ///
    /// CocoaPods MediaPipeTasksVision 은 이 Unity homuler MediaPipe 와 중복 로드되어
    /// 크래시를 일으켜 제거됐다(020cb33). 그 pod 에 의존하던 iOS 정지영상 분석기
    /// 2종(퍼스널 컬러 AURAPersonalColorAnalyzer, 얼굴 세로비율 AURAFaceRatioAnalyzer)의
    /// 랜드마크 검출을 이 서비스가 대신한다. 요청 1종이 두 소비자를 모두 커버한다.
    ///
    /// 프로토콜 (RN unityMakeupBridge.ts 의 requestFaceLandmarks 와 계약):
    ///  - RN → Unity: UnitySendMessage("AuraStillFaceLandmarks", "AnalyzeStillJson",
    ///      {"requestId","imagePath","maxFaces"})
    ///  - Unity → RN: sendMessageToMobileApp(UnityMakeupEvent) 로
    ///      {"type":"faceLandmarks","requestId","status","faceCount",
    ///       "imageWidth","imageHeight","landmarks":[{"i","x","y","z"}...],"pose":{...}}
    ///
    /// 좌표계 불변식: iOS 네이티브 분석기는 EXIF 를 적용한 upright 프레임에서 색을
    /// 샘플링한다. 촬영 JPEG 은 EXIF 회전 플래그를 담고 있고 Unity 의 LoadImage 는
    /// EXIF 를 무시하므로, 여기서 EXIF orientation 을 직접 파싱해 픽셀에 구워 넣은 뒤
    /// 검출한다 — 좌표와 pose 모두 upright 기준이 된다. imageWidth/Height 도
    /// upright(원본 해상도) 기준으로 보고한다.
    ///
    /// 라이브 AR 의 FaceLandmarkSource(LIVE_STREAM)와는 별개의 IMAGE 모드 인스턴스를
    /// 쓴다. IMAGE 모드는 동기·무상태이며 AR 카메라를 점유하지 않으므로 AR 세션과
    /// 충돌하지 않는다.
    ///
    /// 어떤 실패든 requestId 를 반향한 error/no_face 응답을 즉시 보낸다 — RN 쪽
    /// 타임아웃(8s)까지 기다리게 하지 않는다.
    /// </summary>
    public sealed class StillFaceLandmarkService : MonoBehaviour
    {
        public const string GameObjectName = "AuraStillFaceLandmarks";

        // 검출 입력 긴 변 상한. 정규화 좌표는 해상도 무관이므로 원본(최대 12MP)을
        // 그대로 넣을 이유가 없다. 1280 이면 face_landmarker 내부 입력(수백 px)보다
        // 충분히 크고, 변환 버퍼도 ~6.5MB 로 억제된다.
        const int DetectLongSide = 1280;

        static bool _spawned;

#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern void sendMessageToMobileApp(string message);
#endif

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Spawn()
        {
            if (_spawned)
            {
                return;
            }
            _spawned = true;
            var go = new GameObject(GameObjectName);
            DontDestroyOnLoad(go);
            go.AddComponent<StillFaceLandmarkService>();
            Debug.Log("[StillFaceLandmarks] service spawned");
        }

        [Serializable]
        sealed class StillRequest
        {
            public string requestId;
            public string imagePath;
            public int maxFaces = 1;
        }

#if MEDIAPIPE
        FaceLandmarker _landmarker;
        bool _modelPrepared;
#endif
        bool _busy;

        /// <summary>UnitySendMessage 진입점 (RN → Unity).</summary>
        public void AnalyzeStillJson(string json)
        {
            StillRequest request = null;
            try
            {
                request = JsonUtility.FromJson<StillRequest>(json);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[StillFaceLandmarks] request parse failed: " + e.Message);
            }

            if (request == null || string.IsNullOrEmpty(request.requestId))
            {
                // requestId 가 없으면 상관(correlation)이 불가능해 응답할 곳이 없다.
                Debug.LogWarning("[StillFaceLandmarks] request without requestId ignored");
                return;
            }

            if (string.IsNullOrEmpty(request.imagePath))
            {
                SendFailure(request.requestId, "error", "image_path_missing");
                return;
            }

            if (_busy)
            {
                // 캡처당 1회 호출되는 흐름이라 동시 요청은 비정상 — 큐 대신 명시 거절.
                SendFailure(request.requestId, "error", "analyzer_busy");
                return;
            }

            StartCoroutine(AnalyzeRoutine(request));
        }

        IEnumerator AnalyzeRoutine(StillRequest request)
        {
            _busy = true;
            try
            {
#if MEDIAPIPE
                // ---- 모델 준비 + IMAGE 모드 landmarker (1회 생성 후 재사용) ----
                if (!_modelPrepared)
                {
                    IResourceManager resources = new StreamingAssetsResourceManager();
                    yield return resources.PrepareAssetAsync("face_landmarker.task");
                    _modelPrepared = true;
                }

                if (_landmarker == null &&
                    !TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.GPU) &&
                    !TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate.CPU))
                {
                    SendFailure(request.requestId, "error", "landmarker_create_failed");
                    yield break;
                }

                Analyze(request);
#else
                // homuler 패키지 미설치 빌드: 즉시 실패를 알려 RN 타임아웃을 피한다.
                SendFailure(request.requestId, "error", "mediapipe_package_unavailable");
                yield break;
#endif
            }
            finally
            {
                _busy = false;
            }
        }

#if MEDIAPIPE
        bool TryCreateLandmarker(Mediapipe.Tasks.Core.BaseOptions.Delegate del)
        {
            try
            {
                var options = new FaceLandmarkerOptions(
                    new Mediapipe.Tasks.Core.BaseOptions(
                        del, modelAssetPath: "face_landmarker.task"),
                    runningMode: Mediapipe.Tasks.Vision.Core.RunningMode.IMAGE,
                    numFaces: 1,
                    outputFaceTransformationMatrixes: true);

                _landmarker = FaceLandmarker.CreateFromOptions(options);
                Debug.Log($"[StillFaceLandmarks] FaceLandmarker ready ({del}, IMAGE)");
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning($"[StillFaceLandmarks] {del} delegate 실패: {e.Message}");
                return false;
            }
        }

        void Analyze(StillRequest request)
        {
            // ---- 파일 로드 (file:// URI 허용) ----
            var path = request.imagePath;
            if (path.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
            {
                path = Uri.UnescapeDataString(path.Substring("file://".Length));
            }

            byte[] fileBytes;
            try
            {
                fileBytes = File.ReadAllBytes(path);
            }
            catch (Exception e)
            {
                Debug.LogWarning("[StillFaceLandmarks] file read failed: " + e.Message);
                SendFailure(request.requestId, "error", "image_unavailable");
                return;
            }

            // ---- 디코드 + EXIF upright 베이크 + 다운스케일 ----
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            NativeArray<byte> pixels = default;
            try
            {
                if (!texture.LoadImage(fileBytes, false))
                {
                    SendFailure(request.requestId, "error", "image_decode_failed");
                    return;
                }

                int rawW = texture.width;
                int rawH = texture.height;
                int orientation = ReadExifOrientation(fileBytes);
                bool swapAxes = orientation >= 5 && orientation <= 8;
                int uprightW = swapAxes ? rawH : rawW;
                int uprightH = swapAxes ? rawW : rawH;

                float scale = Mathf.Max(1f, Mathf.Max(uprightW, uprightH) / (float)DetectLongSide);
                int outW = Mathf.Max(1, Mathf.RoundToInt(uprightW / scale));
                int outH = Mathf.Max(1, Mathf.RoundToInt(uprightH / scale));

                // GetPixels32 는 어떤 텍스처 포맷이든 RGBA 로 준다. 행 순서는
                // 아래→위(bottom-up)이므로 복사 시 수직 반전을 함께 접는다.
                var source = texture.GetPixels32();
                pixels = new NativeArray<byte>(outW * outH * 4, Allocator.Persistent);
                BakeUprightPixels(source, rawW, rawH, orientation, scale, outW, outH, pixels);

                var image = new Image(
                    ImageFormat.Types.Format.Srgba, outW, outH, outW * 4, pixels);

                var result = default(FaceLandmarkerResult);
                bool detected;
                try
                {
                    detected = _landmarker.TryDetect(image, null, ref result);
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[StillFaceLandmarks] TryDetect failed: " + e.Message);
                    SendFailure(request.requestId, "error", "detection_failed");
                    return;
                }

                var faces = detected ? result.faceLandmarks : null;
                if (faces == null || faces.Count == 0)
                {
                    SendResponse(BuildNoFaceJson(request.requestId, uprightW, uprightH));
                    return;
                }

                SendResponse(BuildOkJson(request.requestId, uprightW, uprightH, result));
            }
            finally
            {
                if (pixels.IsCreated)
                {
                    pixels.Dispose();
                }
                Destroy(texture);
            }
        }

        /// <summary>
        /// GetPixels32(bottom-up) 원본에서 EXIF orientation 을 적용한 upright 프레임을
        /// nearest-neighbor 다운스케일로 한 번에 채운다 (단일 패스).
        /// </summary>
        static void BakeUprightPixels(
            Color32[] source, int rawW, int rawH, int orientation,
            float scale, int outW, int outH, NativeArray<byte> dst)
        {
            for (int oy = 0; oy < outH; oy++)
            {
                // upright 프레임 좌표 (top-left 원점)
                int uy = Mathf.Min((int)((oy + 0.5f) * scale), OrientedHeight(orientation, rawW, rawH) - 1);
                for (int ox = 0; ox < outW; ox++)
                {
                    int ux = Mathf.Min((int)((ox + 0.5f) * scale), OrientedWidth(orientation, rawW, rawH) - 1);

                    // upright(ux,uy) → raw top-left 좌표 (EXIF 역변환)
                    int rx, ry;
                    switch (orientation)
                    {
                        case 2: rx = rawW - 1 - ux; ry = uy; break;                 // mirror-H
                        case 3: rx = rawW - 1 - ux; ry = rawH - 1 - uy; break;      // rot180
                        case 4: rx = ux; ry = rawH - 1 - uy; break;                 // mirror-V
                        case 5: rx = uy; ry = ux; break;                            // transpose
                        case 6: rx = uy; ry = rawH - 1 - ux; break;                 // rot90CW
                        case 7: rx = rawW - 1 - uy; ry = rawH - 1 - ux; break;      // transverse
                        case 8: rx = rawW - 1 - uy; ry = ux; break;                 // rot270CW
                        default: rx = ux; ry = uy; break;                           // 1: identity
                    }

                    // GetPixels32 는 bottom-up: raw top-left (rx,ry) → 배열 인덱스
                    var c = source[(rawH - 1 - ry) * rawW + rx];
                    int di = (oy * outW + ox) * 4;
                    dst[di] = c.r;
                    dst[di + 1] = c.g;
                    dst[di + 2] = c.b;
                    dst[di + 3] = c.a;
                }
            }
        }

        static int OrientedWidth(int orientation, int rawW, int rawH)
        {
            return orientation >= 5 && orientation <= 8 ? rawH : rawW;
        }

        static int OrientedHeight(int orientation, int rawW, int rawH)
        {
            return orientation >= 5 && orientation <= 8 ? rawW : rawH;
        }

        static string BuildOkJson(
            string requestId, int imageWidth, int imageHeight, FaceLandmarkerResult result)
        {
            var landmarks = result.faceLandmarks[0].landmarks;
            var sb = new StringBuilder(landmarks.Count * 48 + 256);
            sb.Append("{\"type\":\"faceLandmarks\",\"requestId\":\"").Append(Escape(requestId))
              .Append("\",\"status\":\"ok\",\"faceCount\":1,\"imageWidth\":").Append(imageWidth)
              .Append(",\"imageHeight\":").Append(imageHeight)
              .Append(",\"landmarks\":[");
            for (int i = 0; i < landmarks.Count; i++)
            {
                if (i > 0) sb.Append(',');
                var lm = landmarks[i];
                sb.Append("{\"i\":").Append(i)
                  .Append(",\"x\":").Append(Num(lm.x))
                  .Append(",\"y\":").Append(Num(lm.y))
                  .Append(",\"z\":").Append(Num(lm.z))
                  .Append('}');
            }
            sb.Append(']');

            // pose: homuler 의 facialTransformationMatrixes 에서 오일러 각 유도.
            // 행렬→각 공식은 제거된 iOS AURAFaceRatioPoseFromMatrix 와 동일하게 유지해
            // 하위(roll 보정·quality gate) 부호 의미를 보존한다.
            // NOTE(실기기 확인): homuler 의 Matrix4x4 채움이 행/열 전치라면 pitch/yaw
            // 부호·크기가 어긋난다. 게이트는 |값| 기준이라 안전하지만 roll 보정 방향은
            // 실기기에서 1회 검증할 것.
            var matrixes = result.facialTransformationMatrixes;
            if (matrixes != null && matrixes.Count > 0)
            {
                var m = matrixes[0];
                float sy = Mathf.Sqrt(m.m00 * m.m00 + m.m10 * m.m10);
                float pitch, yaw, roll;
                if (sy >= 1e-6f)
                {
                    pitch = Mathf.Atan2(m.m21, m.m22);
                    yaw = Mathf.Atan2(-m.m20, sy);
                    roll = Mathf.Atan2(m.m10, m.m00);
                }
                else
                {
                    pitch = Mathf.Atan2(-m.m11, m.m01);
                    yaw = Mathf.Atan2(-m.m20, sy);
                    roll = 0f;
                }
                sb.Append(",\"pose\":{\"pitchDeg\":").Append(Num(pitch * Mathf.Rad2Deg))
                  .Append(",\"yawDeg\":").Append(Num(yaw * Mathf.Rad2Deg))
                  .Append(",\"rollDeg\":").Append(Num(roll * Mathf.Rad2Deg))
                  .Append('}');
            }

            sb.Append('}');
            return sb.ToString();
        }

        static string BuildNoFaceJson(string requestId, int imageWidth, int imageHeight)
        {
            return "{\"type\":\"faceLandmarks\",\"requestId\":\"" + Escape(requestId) +
                   "\",\"status\":\"no_face\",\"faceCount\":0,\"imageWidth\":" + imageWidth +
                   ",\"imageHeight\":" + imageHeight + ",\"landmarks\":[]}";
        }
#endif // MEDIAPIPE

        void SendFailure(string requestId, string status, string error)
        {
            SendResponse(
                "{\"type\":\"faceLandmarks\",\"requestId\":\"" + Escape(requestId) +
                "\",\"status\":\"" + status + "\",\"faceCount\":0,\"landmarks\":[],\"error\":\"" +
                Escape(error) + "\"}");
        }

        static void SendResponse(string message)
        {
            Debug.Log("[StillFaceLandmarks] respond bytes=" + message.Length);
#if UNITY_IOS && !UNITY_EDITOR
            try
            {
                sendMessageToMobileApp(message);
            }
            catch (Exception e)
            {
                Debug.LogError("[StillFaceLandmarks] send failed: " + e.Message);
            }
#endif
        }

        static string Num(float value)
        {
            return value.ToString("0.######", CultureInfo.InvariantCulture);
        }

        static string Escape(string value)
        {
            return string.IsNullOrEmpty(value)
                ? string.Empty
                : value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        /// <summary>
        /// JPEG 바이트에서 EXIF orientation(1..8)을 읽는다. 파싱 실패·비 JPEG·태그
        /// 부재 시 1(정방향). APP1 이 XMP 일 수 있으므로 "Exif\0\0" 헤더를 확인한다.
        /// </summary>
        static int ReadExifOrientation(byte[] bytes)
        {
            try
            {
                if (bytes == null || bytes.Length < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8)
                {
                    return 1; // JPEG 아님 (PNG 등은 orientation 개념 없음)
                }

                int pos = 2;
                while (pos + 4 <= bytes.Length)
                {
                    if (bytes[pos] != 0xFF)
                    {
                        return 1;
                    }
                    int marker = bytes[pos + 1];
                    if (marker == 0xDA || marker == 0xD9)
                    {
                        return 1; // 이미지 데이터 시작/끝 — EXIF 없음
                    }
                    int segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
                    if (segLen < 2 || pos + 2 + segLen > bytes.Length)
                    {
                        return 1;
                    }

                    if (marker == 0xE1 && segLen >= 10 &&
                        bytes[pos + 4] == 'E' && bytes[pos + 5] == 'x' &&
                        bytes[pos + 6] == 'i' && bytes[pos + 7] == 'f' &&
                        bytes[pos + 8] == 0 && bytes[pos + 9] == 0)
                    {
                        int tiff = pos + 10;
                        if (tiff + 8 > bytes.Length)
                        {
                            return 1;
                        }
                        bool little = bytes[tiff] == 0x49 && bytes[tiff + 1] == 0x49;
                        bool big = bytes[tiff] == 0x4D && bytes[tiff + 1] == 0x4D;
                        if (!little && !big)
                        {
                            return 1;
                        }
                        int ifdOffset = ReadU32(bytes, tiff + 4, little);
                        int ifd = tiff + ifdOffset;
                        if (ifd + 2 > bytes.Length)
                        {
                            return 1;
                        }
                        int entryCount = ReadU16(bytes, ifd, little);
                        for (int i = 0; i < entryCount; i++)
                        {
                            int entry = ifd + 2 + i * 12;
                            if (entry + 12 > bytes.Length)
                            {
                                return 1;
                            }
                            if (ReadU16(bytes, entry, little) == 0x0112)
                            {
                                int value = ReadU16(bytes, entry + 8, little);
                                return value >= 1 && value <= 8 ? value : 1;
                            }
                        }
                        return 1;
                    }

                    pos += 2 + segLen;
                }
                return 1;
            }
            catch
            {
                return 1;
            }
        }

        static int ReadU16(byte[] bytes, int offset, bool little)
        {
            return little
                ? bytes[offset] | (bytes[offset + 1] << 8)
                : (bytes[offset] << 8) | bytes[offset + 1];
        }

        static int ReadU32(byte[] bytes, int offset, bool little)
        {
            return little
                ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
                : (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        }
    }
}
