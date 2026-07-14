using System;
using System.Collections.Generic;
using System.IO;
using ARMakeup.Bridge;
using UnityEngine;
#if !MEDIAPIPE
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
#endif

namespace ARMakeup.Face
{
    /// <summary>
    /// 개발용 유틸: 얼굴 메시의 UV 와이어프레임을 PNG로 저장한다.
    /// 이 PNG를 포토샵/프로크리에이트 밑그림으로 깔고 마스크를 그리면
    /// 렌더링에 실제로 쓰이는 UV와 100% 일치한다.
    ///
    /// - MEDIAPIPE 경로: canonical 토폴로지(정적)에서 추출 — 얼굴 트래킹 불필요,
    ///   iOS/Android 공통 한 장이면 된다.
    /// - 폴백 경로: 트래킹 중인 ARFace에서 추출 — 플랫폼별로 한 장씩 필요.
    ///
    /// 트리거: RN에서 {"type":"exportUVTemplate"} 메시지.
    /// 저장 위치: Application.persistentDataPath
    ///   iOS     → 앱 Documents (Files 앱에서 접근 가능)
    ///   Android → /Android/data/&lt;패키지&gt;/files (파일 관리자/USB로 접근 가능)
    /// </summary>
    public class UVTemplateExporter : MonoBehaviour
    {
        const int Size = 2048;

        void OnEnable()
        {
            NativeBridge.MessageReceived += OnMessage;
        }

        void OnDisable()
        {
            NativeBridge.MessageReceived -= OnMessage;
        }

        void OnMessage(RNToUnityMessage msg)
        {
            if (msg.type == "exportUVTemplate") Export();
        }

        void Export()
        {
            if (!TryGetTopology(out var uvs, out var indices, out var failReason))
            {
                NativeBridge.Send(new UnityToRNMessage
                {
                    type = "error",
                    message = $"UV 템플릿 추출 실패: {failReason}",
                });
                return;
            }

            try
            {
                var png = RenderWireframe(uvs, indices);
#if MEDIAPIPE
                var variant = "canonical";
#else
                var variant = Application.platform == RuntimePlatform.IPhonePlayer ? "ios" : "android";
#endif
                var fileName = $"uv_template_{variant}_{DateTime.Now:yyyyMMdd_HHmmss}.png";
                var path = Path.Combine(Application.persistentDataPath, fileName);
                File.WriteAllBytes(path, png);
                NativeBridge.Send(new UnityToRNMessage { type = "uvTemplateExported", path = path });
            }
            catch (Exception e)
            {
                Debug.LogError($"[UVTemplateExporter] {e}");
                NativeBridge.Send(new UnityToRNMessage { type = "error", message = e.Message });
            }
        }

#if MEDIAPIPE
        static bool TryGetTopology(out Vector2[] uvs, out int[] indices, out string failReason)
        {
            uvs = null;
            indices = null;

            var mesh = CanonicalFaceMesh.Instance;
            if (mesh == null || !mesh.TopologyReady)
            {
                failReason = "canonical 토폴로지가 아직 로드되지 않았습니다.";
                return false;
            }

            uvs = mesh.MeshTopology.uv;
            indices = mesh.MeshTopology.triangles;
            failReason = null;
            return true;
        }
#else
        static bool TryGetTopology(out Vector2[] uvs, out int[] indices, out string failReason)
        {
            uvs = null;
            indices = null;

            var faceManager = FindAnyObjectByType<ARFaceManager>();
            if (faceManager != null)
            {
                foreach (var face in faceManager.trackables)
                {
                    if (face.trackingState != TrackingState.Tracking) continue;
                    if (!face.uvs.IsCreated || face.uvs.Length == 0 ||
                        !face.indices.IsCreated || face.indices.Length == 0) continue;

                    uvs = face.uvs.ToArray();
                    indices = face.indices.ToArray();
                    failReason = null;
                    return true;
                }
            }

            failReason = "얼굴이 트래킹된 상태에서 다시 시도하세요.";
            return false;
        }
#endif

        static byte[] RenderWireframe(Vector2[] uvs, int[] indices)
        {
            var pixels = new Color32[Size * Size];
            var background = new Color32(255, 255, 255, 255);
            var line = new Color32(25, 25, 25, 255);
            for (var i = 0; i < pixels.Length; i++) pixels[i] = background;

            // 픽셀 row 0 = 텍스처 v=0. PNG로 저장/재임포트해도 같은 방향이 유지되므로
            // 이 밑그림에 그대로 그린 마스크는 뒤집기 없이 UV와 일치한다.
            var drawnEdges = new HashSet<long>();
            for (var t = 0; t + 2 < indices.Length; t += 3)
            {
                DrawEdge(pixels, drawnEdges, uvs, indices[t], indices[t + 1], line);
                DrawEdge(pixels, drawnEdges, uvs, indices[t + 1], indices[t + 2], line);
                DrawEdge(pixels, drawnEdges, uvs, indices[t + 2], indices[t], line);
            }

            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, false);
            tex.SetPixels32(pixels);
            tex.Apply(false, false);
            var bytes = tex.EncodeToPNG();
            Destroy(tex);
            return bytes;
        }

        static void DrawEdge(
            Color32[] pixels, HashSet<long> drawnEdges,
            Vector2[] uvs, int ia, int ib, Color32 color)
        {
            var key = ia < ib ? ((long)ia << 32) | (uint)ib : ((long)ib << 32) | (uint)ia;
            if (!drawnEdges.Add(key)) return;

            var a = uvs[ia];
            var b = uvs[ib];
            DrawLine(
                pixels,
                Mathf.RoundToInt(Mathf.Clamp01(a.x) * (Size - 1)),
                Mathf.RoundToInt(Mathf.Clamp01(a.y) * (Size - 1)),
                Mathf.RoundToInt(Mathf.Clamp01(b.x) * (Size - 1)),
                Mathf.RoundToInt(Mathf.Clamp01(b.y) * (Size - 1)),
                color);
        }

        static void DrawLine(Color32[] pixels, int x0, int y0, int x1, int y1, Color32 color)
        {
            var dx = Mathf.Abs(x1 - x0);
            var dy = -Mathf.Abs(y1 - y0);
            var sx = x0 < x1 ? 1 : -1;
            var sy = y0 < y1 ? 1 : -1;
            var err = dx + dy;

            while (true)
            {
                pixels[y0 * Size + x0] = color;
                if (x0 == x1 && y0 == y1) break;
                var e2 = 2 * err;
                if (e2 >= dy) { err += dy; x0 += sx; }
                if (e2 <= dx) { err += dx; y0 += sy; }
            }
        }
    }
}
