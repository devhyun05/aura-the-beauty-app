using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Aura.Face3D;
using Unity.Collections;
using UnityEngine;
using UnityEngine.XR.ARKit;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

public sealed class E7SynchronizedCaptureExporter : MonoBehaviour
{
    private const string DefaultCapturePairId = "pair_face_0001";
    private const string CaptureRootRelativePath = "e7-reference-atlas/capture_pairs";

    [Serializable]
    private sealed class CaptureRequestPayload
    {
        public string capturePairId;
        public string captureSetId;
        public string captureShotKind;
        public double requestedAtMs;
        public string requestedBy;
        public string purpose;
    }

    private sealed class RendererState
    {
        public Renderer Renderer;
        public bool Enabled;
    }

    private struct ProjectedVertex
    {
        public Vector3 Local;
        public Vector3 World;
        public Vector2 Uv;
        public float ScreenX;
        public float ScreenYTopLeft;
        public float Depth;
        public float ClipW;
    }

    [SerializeField] private ARFaceManager faceManager;
    [SerializeField] private Camera arCamera;
    [SerializeField] private FaceTrackingStatusReporter statusReporter;
    [SerializeField] private RNBridge rnBridge;

    private bool captureInProgress;

    public void Configure(
        ARFaceManager manager,
        Camera camera,
        FaceTrackingStatusReporter reporter,
        RNBridge bridge)
    {
        if (faceManager == null)
        {
            faceManager = manager;
        }

        if (arCamera == null)
        {
            arCamera = camera;
        }

        if (statusReporter == null)
        {
            statusReporter = reporter;
        }

        if (rnBridge == null)
        {
            rnBridge = bridge;
        }
    }

    public void CaptureReferenceFrameJson(string json)
    {
        CaptureRequestPayload request = ParseRequest(json);
        if (captureInProgress)
        {
            SendCaptureEvent(
                "busy",
                request,
                string.Empty,
                string.Empty,
                "capture_already_in_progress",
                0,
                0,
                0,
                0);
            return;
        }

        StartCoroutine(CaptureRoutine(request));
    }

    private IEnumerator CaptureRoutine(CaptureRequestPayload request)
    {
        captureInProgress = true;
        RefreshSceneReferences();

        SendCaptureEvent(
            "requested",
            request,
            string.Empty,
            string.Empty,
            "pending_end_of_frame_capture",
            0,
            0,
            0,
            0);
        Debug.Log(
            "[E7] reference_capture_requested"
            + " capturePairId=" + request.capturePairId
            + " captureSetId=" + SanitizeLogValue(request.captureSetId)
            + " captureShotKind=" + SanitizeLogValue(request.captureShotKind)
            + " purpose=" + SanitizeLogValue(request.purpose)
            + " requestedBy=" + SanitizeLogValue(request.requestedBy));

        bool originalDebugOverlayVisible = statusReporter != null && statusReporter.DebugOverlayVisible;
        List<RendererState> hiddenRenderers = HideFaceRenderers();

        if (statusReporter != null)
        {
            statusReporter.SetDebugOverlayVisible(false);
        }

        CaptureExportResult result = null;
        try
        {
            yield return new WaitForEndOfFrame();
            result = ExportCurrentFrame(request);
        }
        finally
        {
            RestoreRenderers(hiddenRenderers);
            if (statusReporter != null)
            {
                statusReporter.SetDebugOverlayVisible(originalDebugOverlayVisible);
            }

            captureInProgress = false;
        }

        if (result != null && result.Success)
        {
            SendCaptureEvent(
                "exported",
                request,
                result.RelativeDirectory,
                result.FramePreviewUri,
                "pending_projected_mesh_overlay_review",
                result.VertexCount,
                result.IndexCount,
                result.UvCount,
                result.FrameWidth);
            Debug.Log(
                "[E7] reference_capture_exported"
                + " capturePairId=" + request.capturePairId
                + " captureSetId=" + SanitizeLogValue(request.captureSetId)
                + " captureShotKind=" + SanitizeLogValue(request.captureShotKind)
                + " exportPath=" + SanitizeLogValue(result.ExportDirectory)
                + " frameWidth=" + result.FrameWidth.ToString(CultureInfo.InvariantCulture)
                + " frameHeight=" + result.FrameHeight.ToString(CultureInfo.InvariantCulture)
                + " meshVertexCount=" + result.VertexCount.ToString(CultureInfo.InvariantCulture)
                + " meshIndexCount=" + result.IndexCount.ToString(CultureInfo.InvariantCulture)
                + " meshUvCount=" + result.UvCount.ToString(CultureInfo.InvariantCulture)
                + " coordinateSpaceValidated=false"
                + " validationStatus=pending_projected_mesh_overlay_review");
        }
        else
        {
            SendCaptureEvent(
                "failed",
                request,
                result != null ? result.RelativeDirectory : string.Empty,
                result != null ? result.FramePreviewUri : string.Empty,
                result != null ? result.Error : "capture_result_missing",
                result != null ? result.VertexCount : 0,
                result != null ? result.IndexCount : 0,
                result != null ? result.UvCount : 0,
                result != null ? result.FrameWidth : 0);
            Debug.LogError(
                "[E7] reference_capture_failed"
                + " capturePairId=" + request.capturePairId
                + " reason=" + SanitizeLogValue(result != null ? result.Error : "capture_result_missing"));
        }
    }

    private CaptureExportResult ExportCurrentFrame(CaptureRequestPayload request)
    {
        CaptureExportResult result = new CaptureExportResult
        {
            RelativeDirectory = "Documents/" + CaptureRootRelativePath + "/" + request.capturePairId
        };

        try
        {
            RefreshSceneReferences();

            ARFace face = SelectActiveFace();
            if (face == null)
            {
                result.Error = "no_arface_trackable_available";
                return result;
            }

            if (arCamera == null)
            {
                result.Error = "ar_camera_missing";
                return result;
            }

            int frameWidth = Screen.width;
            int frameHeight = Screen.height;
            if (frameWidth <= 0 || frameHeight <= 0)
            {
                result.Error = "invalid_screen_size";
                return result;
            }

            string exportDirectory = Path.Combine(
                Application.persistentDataPath,
                CaptureRootRelativePath,
                request.capturePairId);
            Directory.CreateDirectory(exportDirectory);

            Texture2D frameTexture = new Texture2D(frameWidth, frameHeight, TextureFormat.RGB24, false);
            frameTexture.ReadPixels(new Rect(0, 0, frameWidth, frameHeight), 0, 0, false);
            frameTexture.Apply(false, false);

            File.WriteAllBytes(Path.Combine(exportDirectory, "frame.png"), EncodeRgbPng(frameTexture));

            ProjectedVertex[] projectedVertices = BuildProjectedVertices(face, arCamera, frameWidth, frameHeight);
            WriteProjectedMeshOverlay(
                frameTexture,
                face,
                projectedVertices,
                Path.Combine(exportDirectory, "projected_mesh_overlay.png"),
                frameWidth,
                frameHeight);

            File.WriteAllText(
                Path.Combine(exportDirectory, "arface_export.json"),
                BuildArFaceExportJson(request, face, projectedVertices, frameWidth, frameHeight),
                Encoding.UTF8);

            File.WriteAllText(
                Path.Combine(exportDirectory, "capture_summary.json"),
                BuildCaptureSummaryJson(request, face, projectedVertices, frameWidth, frameHeight),
                Encoding.UTF8);

            Destroy(frameTexture);

            result.Success = true;
            result.ExportDirectory = exportDirectory;
            result.FramePreviewUri = new Uri(Path.Combine(exportDirectory, "frame.png")).AbsoluteUri;
            result.FrameWidth = frameWidth;
            result.FrameHeight = frameHeight;
            result.VertexCount = GetVertexCount(face);
            result.IndexCount = GetIndexCount(face);
            result.UvCount = GetUvCount(face);
            return result;
        }
        catch (Exception exception)
        {
            result.Error = exception.GetType().Name + ":" + exception.Message;
            return result;
        }
    }

    private List<RendererState> HideFaceRenderers()
    {
        List<RendererState> states = new List<RendererState>();
        if (faceManager == null)
        {
            return states;
        }

        foreach (ARFace face in faceManager.trackables)
        {
            if (face == null)
            {
                continue;
            }

            Renderer[] renderers = face.GetComponentsInChildren<Renderer>(true);
            foreach (Renderer renderer in renderers)
            {
                if (renderer == null)
                {
                    continue;
                }

                states.Add(new RendererState
                {
                    Renderer = renderer,
                    Enabled = renderer.enabled
                });
                renderer.enabled = false;
            }
        }

        return states;
    }

    private static void RestoreRenderers(List<RendererState> states)
    {
        foreach (RendererState state in states)
        {
            if (state.Renderer != null)
            {
                state.Renderer.enabled = state.Enabled;
            }
        }
    }

    private ProjectedVertex[] BuildProjectedVertices(
        ARFace face,
        Camera camera,
        int frameWidth,
        int frameHeight)
    {
        int vertexCount = GetVertexCount(face);
        ProjectedVertex[] projected = new ProjectedVertex[vertexCount];
        Matrix4x4 viewProjection = GL.GetGPUProjectionMatrix(camera.projectionMatrix, false)
            * camera.worldToCameraMatrix;

        for (int index = 0; index < vertexCount; index++)
        {
            Vector3 local = face.vertices[index];
            Vector3 world = face.transform.TransformPoint(local);
            Vector3 screen = camera.WorldToScreenPoint(world);
            Vector4 clip = viewProjection * new Vector4(world.x, world.y, world.z, 1.0f);
            Vector2 uv = index < GetUvCount(face) ? face.uvs[index] : Vector2.zero;

            projected[index] = new ProjectedVertex
            {
                Local = local,
                World = world,
                Uv = uv,
                ScreenX = screen.x,
                ScreenYTopLeft = frameHeight - screen.y,
                Depth = screen.z,
                ClipW = clip.w
            };
        }

        return projected;
    }

    private static void WriteProjectedMeshOverlay(
        Texture2D frameTexture,
        ARFace face,
        ProjectedVertex[] projectedVertices,
        string overlayPath,
        int frameWidth,
        int frameHeight)
    {
        Texture2D overlay = new Texture2D(frameWidth, frameHeight, TextureFormat.RGBA32, false);
        overlay.SetPixels32(frameTexture.GetPixels32());

        Color32 edgeColor = new Color32(255, 58, 48, 210);
        Color32 pointColor = new Color32(52, 211, 153, 230);
        int indexCount = GetIndexCount(face);

        for (int index = 0; index + 2 < indexCount; index += 3)
        {
            int a = face.indices[index];
            int b = face.indices[index + 1];
            int c = face.indices[index + 2];
            if (!IsValidVertexIndex(a, projectedVertices.Length)
                || !IsValidVertexIndex(b, projectedVertices.Length)
                || !IsValidVertexIndex(c, projectedVertices.Length))
            {
                continue;
            }

            DrawLine(overlay, projectedVertices[a], projectedVertices[b], edgeColor, frameWidth, frameHeight);
            DrawLine(overlay, projectedVertices[b], projectedVertices[c], edgeColor, frameWidth, frameHeight);
            DrawLine(overlay, projectedVertices[c], projectedVertices[a], edgeColor, frameWidth, frameHeight);
        }

        for (int index = 0; index < projectedVertices.Length; index += 12)
        {
            DrawPoint(overlay, projectedVertices[index], pointColor, frameWidth, frameHeight);
        }

        overlay.Apply(false, false);
        File.WriteAllBytes(overlayPath, EncodeRgbPng(overlay));
        Destroy(overlay);
    }

    private static byte[] EncodeRgbPng(Texture2D texture)
    {
        int width = texture.width;
        int height = texture.height;
        Color32[] pixels = texture.GetPixels32();
        byte[] raw = new byte[(width * 3 + 1) * height];
        int offset = 0;

        for (int y = height - 1; y >= 0; y--)
        {
            raw[offset++] = 0;
            int rowStart = y * width;
            for (int x = 0; x < width; x++)
            {
                Color32 pixel = pixels[rowStart + x];
                raw[offset++] = pixel.r;
                raw[offset++] = pixel.g;
                raw[offset++] = pixel.b;
            }
        }

        using (MemoryStream stream = new MemoryStream())
        {
            stream.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, 0, 8);

            using (MemoryStream ihdr = new MemoryStream())
            {
                WriteBigEndianUInt32(ihdr, (uint)width);
                WriteBigEndianUInt32(ihdr, (uint)height);
                ihdr.WriteByte(8);
                ihdr.WriteByte(2);
                ihdr.WriteByte(0);
                ihdr.WriteByte(0);
                ihdr.WriteByte(0);
                WritePngChunk(stream, "IHDR", ihdr.ToArray());
            }

            WritePngChunk(stream, "IDAT", BuildStoredZlibPayload(raw));
            WritePngChunk(stream, "IEND", Array.Empty<byte>());
            return stream.ToArray();
        }
    }

    private static byte[] BuildStoredZlibPayload(byte[] raw)
    {
        using (MemoryStream stream = new MemoryStream())
        {
            stream.WriteByte(0x78);
            stream.WriteByte(0x01);

            int offset = 0;
            while (offset < raw.Length)
            {
                int blockLength = Math.Min(65535, raw.Length - offset);
                bool isFinal = offset + blockLength >= raw.Length;
                stream.WriteByte(isFinal ? (byte)0x01 : (byte)0x00);
                WriteLittleEndianUInt16(stream, (ushort)blockLength);
                WriteLittleEndianUInt16(stream, (ushort)~blockLength);
                stream.Write(raw, offset, blockLength);
                offset += blockLength;
            }

            WriteBigEndianUInt32(stream, CalculateAdler32(raw));
            return stream.ToArray();
        }
    }

    private static void WritePngChunk(Stream stream, string type, byte[] data)
    {
        byte[] typeBytes = Encoding.ASCII.GetBytes(type);
        WriteBigEndianUInt32(stream, (uint)data.Length);
        stream.Write(typeBytes, 0, typeBytes.Length);
        stream.Write(data, 0, data.Length);

        byte[] crcInput = new byte[typeBytes.Length + data.Length];
        Buffer.BlockCopy(typeBytes, 0, crcInput, 0, typeBytes.Length);
        Buffer.BlockCopy(data, 0, crcInput, typeBytes.Length, data.Length);
        WriteBigEndianUInt32(stream, CalculateCrc32(crcInput));
    }

    private static uint CalculateAdler32(byte[] data)
    {
        const uint modulus = 65521;
        uint a = 1;
        uint b = 0;
        for (int index = 0; index < data.Length; index++)
        {
            a = (a + data[index]) % modulus;
            b = (b + a) % modulus;
        }

        return (b << 16) | a;
    }

    private static uint CalculateCrc32(byte[] data)
    {
        uint crc = 0xffffffff;
        for (int index = 0; index < data.Length; index++)
        {
            crc ^= data[index];
            for (int bit = 0; bit < 8; bit++)
            {
                bool lsb = (crc & 1) != 0;
                crc >>= 1;
                if (lsb)
                {
                    crc ^= 0xedb88320;
                }
            }
        }

        return ~crc;
    }

    private static void WriteBigEndianUInt32(Stream stream, uint value)
    {
        stream.WriteByte((byte)((value >> 24) & 0xff));
        stream.WriteByte((byte)((value >> 16) & 0xff));
        stream.WriteByte((byte)((value >> 8) & 0xff));
        stream.WriteByte((byte)(value & 0xff));
    }

    private static void WriteLittleEndianUInt16(Stream stream, ushort value)
    {
        stream.WriteByte((byte)(value & 0xff));
        stream.WriteByte((byte)((value >> 8) & 0xff));
    }

    private static void DrawLine(
        Texture2D texture,
        ProjectedVertex start,
        ProjectedVertex end,
        Color32 color,
        int frameWidth,
        int frameHeight)
    {
        int x0 = Mathf.RoundToInt(start.ScreenX);
        int y0 = Mathf.RoundToInt(start.ScreenYTopLeft);
        int x1 = Mathf.RoundToInt(end.ScreenX);
        int y1 = Mathf.RoundToInt(end.ScreenYTopLeft);

        if (!MayIntersectFrame(x0, y0, x1, y1, frameWidth, frameHeight))
        {
            return;
        }

        int dx = Mathf.Abs(x1 - x0);
        int sx = x0 < x1 ? 1 : -1;
        int dy = -Mathf.Abs(y1 - y0);
        int sy = y0 < y1 ? 1 : -1;
        int error = dx + dy;

        while (true)
        {
            BlendPixelTopLeft(texture, x0, y0, color, frameWidth, frameHeight);
            if (x0 == x1 && y0 == y1)
            {
                break;
            }

            int twiceError = 2 * error;
            if (twiceError >= dy)
            {
                error += dy;
                x0 += sx;
            }

            if (twiceError <= dx)
            {
                error += dx;
                y0 += sy;
            }
        }
    }

    private static void DrawPoint(
        Texture2D texture,
        ProjectedVertex vertex,
        Color32 color,
        int frameWidth,
        int frameHeight)
    {
        int centerX = Mathf.RoundToInt(vertex.ScreenX);
        int centerY = Mathf.RoundToInt(vertex.ScreenYTopLeft);
        for (int y = centerY - 1; y <= centerY + 1; y++)
        {
            for (int x = centerX - 1; x <= centerX + 1; x++)
            {
                BlendPixelTopLeft(texture, x, y, color, frameWidth, frameHeight);
            }
        }
    }

    private static void BlendPixelTopLeft(
        Texture2D texture,
        int x,
        int yTopLeft,
        Color32 color,
        int frameWidth,
        int frameHeight)
    {
        if (x < 0 || x >= frameWidth || yTopLeft < 0 || yTopLeft >= frameHeight)
        {
            return;
        }

        int textureY = frameHeight - 1 - yTopLeft;
        Color existing = texture.GetPixel(x, textureY);
        float alpha = color.a / 255.0f;
        Color blended = Color.Lerp(existing, color, alpha);
        blended.a = 1.0f;
        texture.SetPixel(x, textureY, blended);
    }

    private static bool MayIntersectFrame(
        int x0,
        int y0,
        int x1,
        int y1,
        int frameWidth,
        int frameHeight)
    {
        int minX = Mathf.Min(x0, x1);
        int maxX = Mathf.Max(x0, x1);
        int minY = Mathf.Min(y0, y1);
        int maxY = Mathf.Max(y0, y1);
        return maxX >= 0 && minX < frameWidth && maxY >= 0 && minY < frameHeight;
    }

    private string BuildArFaceExportJson(
        CaptureRequestPayload request,
        ARFace face,
        ProjectedVertex[] projectedVertices,
        int frameWidth,
        int frameHeight)
    {
        StringBuilder builder = new StringBuilder(512000);
        builder.Append("{");
        AppendJsonField(builder, "schemaVersion", "e7-arface-frame-export-v1", true);
        AppendJsonField(builder, "capturePairId", request.capturePairId, false);
        AppendJsonField(builder, "captureSetId", request.captureSetId, false);
        AppendJsonField(builder, "captureShotKind", request.captureShotKind, false);
        AppendJsonField(builder, "frameId", request.capturePairId + "_frame", false);
        AppendJsonField(builder, "capturedAtUtc", DateTimeOffset.UtcNow.ToString("o", CultureInfo.InvariantCulture), false);
        AppendJsonField(builder, "purpose", request.purpose, false);
        builder.Append(",\"regions\":[\"lip\",\"eye\",\"cheek\"]");
        builder.Append(",\"annotationFrameClean\":true");
        builder.Append(",\"hudIncludedInFrame\":false");
        builder.Append(",\"meshOverlayIncludedInFrame\":false");
        builder.Append(",\"candidateOverlayIncludedInFrame\":false");
        builder.Append(",\"coordinateSpaceValidated\":false");
        AppendJsonField(builder, "coordinateSpaceValidationStatus", "pending_projected_mesh_overlay_review", false);
        AppendJsonField(builder, "framePath", "frame.png", false);
        AppendJsonField(builder, "projectedMeshOverlayPath", "projected_mesh_overlay.png", false);
        AppendDisplayMetadata(builder, frameWidth, frameHeight);
        AppendFaceMetadata(builder, face);
        AppendCaptureQuality(builder, face, projectedVertices, frameWidth, frameHeight);
        AppendFace3DCalibration(builder, face);
        AppendVectorArray(builder, "localVertices", projectedVertices, "local");
        AppendVectorArray(builder, "worldVertices", projectedVertices, "world");
        AppendScreenVertices(builder, projectedVertices);
        AppendUvs(builder, face);
        AppendIndices(builder, face);
        builder.Append(",\"blendShapes\":").Append(BuildBlendShapesJson(face));
        builder.Append(",\"privacy\":{\"rawFrameStored\":true,\"rawFrameScope\":\"single_selected_validation_frame\",\"offDeviceUpload\":false}");
        builder.Append("}");
        return builder.ToString();
    }

    private string BuildCaptureSummaryJson(
        CaptureRequestPayload request,
        ARFace face,
        ProjectedVertex[] projectedVertices,
        int frameWidth,
        int frameHeight)
    {
        StringBuilder builder = new StringBuilder(2048);
        builder.Append("{");
        AppendJsonField(builder, "type", "e7_reference_capture_summary", true);
        AppendJsonField(builder, "capturePairId", request.capturePairId, false);
        AppendJsonField(builder, "captureSetId", request.captureSetId, false);
        AppendJsonField(builder, "captureShotKind", request.captureShotKind, false);
        AppendJsonField(builder, "purpose", request.purpose, false);
        builder.Append(",\"regions\":[\"lip\",\"eye\",\"cheek\"]");
        builder.Append(",\"frameWidth\":").Append(frameWidth.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"frameHeight\":").Append(frameHeight.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshVertexCount\":").Append(GetVertexCount(face).ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshIndexCount\":").Append(GetIndexCount(face).ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshUvCount\":").Append(GetUvCount(face).ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"annotationFrameClean\":true");
        builder.Append(",\"coordinateSpaceValidated\":false");
        AppendJsonField(builder, "coordinateSpaceValidationStatus", "pending_projected_mesh_overlay_review", false);
        AppendCaptureQuality(builder, face, projectedVertices, frameWidth, frameHeight);
        AppendFace3DCalibration(builder, face);
        builder.Append(",\"files\":[\"frame.png\",\"arface_export.json\",\"projected_mesh_overlay.png\",\"capture_summary.json\"]");
        builder.Append("}");
        return builder.ToString();
    }

    private static void AppendDisplayMetadata(StringBuilder builder, int frameWidth, int frameHeight)
    {
        builder.Append(",\"display\":{");
        builder.Append("\"videoFrameSize\":[")
            .Append(frameWidth.ToString(CultureInfo.InvariantCulture))
            .Append(",")
            .Append(frameHeight.ToString(CultureInfo.InvariantCulture))
            .Append("]");
        builder.Append(",\"unityViewRectPx\":[0,0,")
            .Append(frameWidth.ToString(CultureInfo.InvariantCulture))
            .Append(",")
            .Append(frameHeight.ToString(CultureInfo.InvariantCulture))
            .Append("]");
        Rect safeArea = Screen.safeArea;
        builder.Append(",\"safeAreaPx\":[")
            .Append(safeArea.x.ToString("0.###", CultureInfo.InvariantCulture)).Append(",")
            .Append(safeArea.y.ToString("0.###", CultureInfo.InvariantCulture)).Append(",")
            .Append(safeArea.width.ToString("0.###", CultureInfo.InvariantCulture)).Append(",")
            .Append(safeArea.height.ToString("0.###", CultureInfo.InvariantCulture)).Append("]");
        AppendJsonField(builder, "screenCoordinateOrigin", "top-left", false);
        builder.Append(",\"isMirrored\":false");
        builder.Append(",\"displayScale\":").Append(GetDisplayScale().ToString("0.###", CultureInfo.InvariantCulture));
        AppendJsonField(builder, "displayTransform", "unity_world_to_screen_top_left", false);
        builder.Append(",\"viewportCropPx\":[0,0,0,0]");
        AppendJsonField(builder, "orientation", Screen.orientation.ToString(), false);
        builder.Append("}");
    }

    private static void AppendFaceMetadata(StringBuilder builder, ARFace face)
    {
        builder.Append(",\"face\":{");
        AppendJsonField(builder, "trackableId", face.trackableId.ToString(), true);
        AppendJsonField(builder, "trackingState", face.trackingState.ToString(), false);
        builder.Append(",\"meshVertexCount\":").Append(GetVertexCount(face).ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshIndexCount\":").Append(GetIndexCount(face).ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshUvCount\":").Append(GetUvCount(face).ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"hasStableUv\":").Append((GetUvCount(face) > 0).ToString().ToLowerInvariant());
        builder.Append("}");
    }

    private static void AppendCaptureQuality(
        StringBuilder builder,
        ARFace face,
        ProjectedVertex[] projectedVertices,
        int frameWidth,
        int frameHeight)
    {
        int vertexCount = GetVertexCount(face);
        int indexCount = GetIndexCount(face);
        int uvCount = GetUvCount(face);
        int projectedVertexCount = projectedVertices != null ? projectedVertices.Length : 0;
        bool isTracking = face != null && face.trackingState == TrackingState.Tracking;

        builder.Append(",\"quality\":{");
        AppendJsonField(builder, "trackingState", face != null ? face.trackingState.ToString() : "None", true);
        builder.Append(",\"isTracking\":").Append(isTracking.ToString().ToLowerInvariant());
        builder.Append(",\"frameWidth\":").Append(frameWidth.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"frameHeight\":").Append(frameHeight.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshVertexCount\":").Append(vertexCount.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshIndexCount\":").Append(indexCount.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"meshUvCount\":").Append(uvCount.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"projectedVertexCount\":").Append(projectedVertexCount.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"hasStableUv\":").Append((uvCount > 0).ToString().ToLowerInvariant());
        builder.Append(",\"hasFrameImage\":true");
        builder.Append(",\"hudIncludedInFrame\":false");
        builder.Append(",\"rawFrameScope\":\"single_selected_calibration_frame\"");
        AppendJsonField(builder, "blendShapeCapture", "arface_export.blendShapes", false);
        AppendJsonField(builder, "qualityGate", "pending_visual_review", false);
        builder.Append("}");
    }

    private static void AppendFace3DCalibration(StringBuilder builder, ARFace face)
    {
        builder.Append(",\"face3dCalibration\":{");
        AppendJsonField(builder, "candidateSchemaVersion", "aura.face3d-semantic-candidate.v1", true);
        AppendJsonField(builder, "fingerprintSource", "unity_exact_native_arrays", false);

        if (!TryCreateFace3DTopologyFingerprint(face, out Face3DTopologyFingerprintData topology, out string reason))
        {
            builder.Append(",\"topologyFingerprint\":null");
            AppendJsonField(builder, "status", "blocked", false);
            AppendJsonField(builder, "reason", reason, false);
            builder.Append("}");
            return;
        }

        AppendJsonField(builder, "status", "ready_for_candidate_generation", false);
        builder.Append(",\"topologyFingerprint\":{");
        AppendJsonField(builder, "algorithm", topology.algorithm, true);
        builder.Append(",\"vertexCount\":").Append(topology.vertexCount.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"indexCount\":").Append(topology.indexCount.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"uvCount\":").Append(topology.uvCount.ToString(CultureInfo.InvariantCulture));
        AppendJsonField(builder, "indicesHash", topology.indicesHash, false);
        AppendJsonField(builder, "uvHash", topology.uvHash, false);
        AppendJsonField(builder, "fingerprint", topology.fingerprint, false);
        builder.Append("}}");
    }

    private static bool TryCreateFace3DTopologyFingerprint(
        ARFace face,
        out Face3DTopologyFingerprintData topology,
        out string reason)
    {
        return ARFaceMeshSnapshotFactory.TryCreateTopologyFingerprint(
            face,
            out topology,
            out reason);
    }

    private static void AppendVectorArray(
        StringBuilder builder,
        string fieldName,
        ProjectedVertex[] projectedVertices,
        string source)
    {
        builder.Append(",\"").Append(fieldName).Append("\":[");
        for (int index = 0; index < projectedVertices.Length; index++)
        {
            if (index > 0)
            {
                builder.Append(",");
            }

            Vector3 value = source == "world" ? projectedVertices[index].World : projectedVertices[index].Local;
            builder.Append("[")
                .Append(value.x.ToString("0.######", CultureInfo.InvariantCulture)).Append(",")
                .Append(value.y.ToString("0.######", CultureInfo.InvariantCulture)).Append(",")
                .Append(value.z.ToString("0.######", CultureInfo.InvariantCulture)).Append("]");
        }

        builder.Append("]");
    }

    private static void AppendScreenVertices(StringBuilder builder, ProjectedVertex[] projectedVertices)
    {
        builder.Append(",\"screenVertices\":[");
        for (int index = 0; index < projectedVertices.Length; index++)
        {
            if (index > 0)
            {
                builder.Append(",");
            }

            ProjectedVertex vertex = projectedVertices[index];
            builder.Append("[")
                .Append(vertex.ScreenX.ToString("0.###", CultureInfo.InvariantCulture)).Append(",")
                .Append(vertex.ScreenYTopLeft.ToString("0.###", CultureInfo.InvariantCulture)).Append(",")
                .Append(vertex.Depth.ToString("0.######", CultureInfo.InvariantCulture)).Append(",")
                .Append(vertex.ClipW.ToString("0.######", CultureInfo.InvariantCulture)).Append("]");
        }

        builder.Append("]");
    }

    private static void AppendUvs(StringBuilder builder, ARFace face)
    {
        builder.Append(",\"uvs\":[");
        int uvCount = GetUvCount(face);
        for (int index = 0; index < uvCount; index++)
        {
            if (index > 0)
            {
                builder.Append(",");
            }

            Vector2 uv = face.uvs[index];
            builder.Append("[")
                .Append(uv.x.ToString("0.######", CultureInfo.InvariantCulture)).Append(",")
                .Append(uv.y.ToString("0.######", CultureInfo.InvariantCulture)).Append("]");
        }

        builder.Append("]");
    }

    private static void AppendIndices(StringBuilder builder, ARFace face)
    {
        builder.Append(",\"indices\":[");
        int indexCount = GetIndexCount(face);
        for (int index = 0; index < indexCount; index++)
        {
            if (index > 0)
            {
                builder.Append(",");
            }

            builder.Append(face.indices[index].ToString(CultureInfo.InvariantCulture));
        }

        builder.Append("]");
    }

    private string BuildBlendShapesJson(ARFace face)
    {
        if (faceManager == null)
        {
            return BuildBlendShapesUnavailableJson(
                "ar_face_manager_missing",
                "ARFaceManager.TryGetBlendShapes",
                "not_called",
                0);
        }

        if (face == null)
        {
            return BuildBlendShapesUnavailableJson(
                "ar_face_missing",
                "ARFaceManager.TryGetBlendShapes",
                "not_called",
                0);
        }

        Result<NativeArray<XRFaceBlendShape>> result;
        try
        {
            result = faceManager.TryGetBlendShapes(face, Allocator.Temp);
        }
        catch (Exception exception)
        {
            return BuildBlendShapesUnavailableJson(
                "try_get_blend_shapes_exception:" + exception.GetType().Name + ":" + exception.Message,
                "ARFaceManager.TryGetBlendShapes",
                "exception",
                0);
        }

        if (!result.status.IsSuccess())
        {
            return BuildBlendShapesUnavailableJson(
                "try_get_blend_shapes_failed",
                "ARFaceManager.TryGetBlendShapes",
                result.status.statusCode.ToString(),
                result.status.nativeStatusCode);
        }

        NativeArray<XRFaceBlendShape> blendShapes = result.value;
        try
        {
            int count = blendShapes.IsCreated ? blendShapes.Length : 0;
            StringBuilder builder = new StringBuilder(8192);
            builder.Append("{");
            builder.Append("\"available\":").Append((count > 0).ToString().ToLowerInvariant());
            AppendJsonField(builder, "source", "ARFaceManager.TryGetBlendShapes", false);
            AppendJsonField(builder, "provider", "ARKit", false);
            AppendJsonField(builder, "statusCode", result.status.statusCode.ToString(), false);
            builder.Append(",\"nativeStatusCode\":").Append(result.status.nativeStatusCode.ToString(CultureInfo.InvariantCulture));
            builder.Append(",\"count\":").Append(count.ToString(CultureInfo.InvariantCulture));
            if (count == 0)
            {
                AppendJsonField(builder, "reason", "empty_blend_shapes", false);
            }

            float jawOpen = 0.0f;
            float mouthClose = 0.0f;
            float mouthFunnel = 0.0f;
            float mouthPucker = 0.0f;
            float mouthSmileLeft = 0.0f;
            float mouthSmileRight = 0.0f;
            float mouthStretchLeft = 0.0f;
            float mouthStretchRight = 0.0f;
            float mouthUpperUpLeft = 0.0f;
            float mouthUpperUpRight = 0.0f;
            float mouthLowerDownLeft = 0.0f;
            float mouthLowerDownRight = 0.0f;

            builder.Append(",\"items\":[");
            for (int index = 0; index < count; index++)
            {
                if (index > 0)
                {
                    builder.Append(",");
                }

                XRFaceBlendShape blendShape = blendShapes[index];
                ARKitBlendShapeLocation location = blendShape.AsARKitBlendShapeLocation();
                float weight = blendShape.weight;
                switch (location)
                {
                    case ARKitBlendShapeLocation.JawOpen:
                        jawOpen = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthClose:
                        mouthClose = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthFunnel:
                        mouthFunnel = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthPucker:
                        mouthPucker = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthSmileLeft:
                        mouthSmileLeft = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthSmileRight:
                        mouthSmileRight = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthStretchLeft:
                        mouthStretchLeft = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthStretchRight:
                        mouthStretchRight = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthUpperUpLeft:
                        mouthUpperUpLeft = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthUpperUpRight:
                        mouthUpperUpRight = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthLowerDownLeft:
                        mouthLowerDownLeft = weight;
                        break;
                    case ARKitBlendShapeLocation.MouthLowerDownRight:
                        mouthLowerDownRight = weight;
                        break;
                }

                builder.Append("{\"blendShapeId\":")
                    .Append(blendShape.blendShapeId.ToString(CultureInfo.InvariantCulture));
                AppendJsonField(builder, "location", location.ToString(), false);
                builder.Append(",\"weight\":")
                    .Append(weight.ToString("0.######", CultureInfo.InvariantCulture))
                    .Append("}");
            }

            builder.Append("]");
            AppendBlendShapeKeySignals(
                builder,
                jawOpen,
                mouthClose,
                mouthFunnel,
                mouthPucker,
                mouthSmileLeft,
                mouthSmileRight,
                mouthStretchLeft,
                mouthStretchRight,
                mouthUpperUpLeft,
                mouthUpperUpRight,
                mouthLowerDownLeft,
                mouthLowerDownRight);
            builder.Append("}");
            return builder.ToString();
        }
        catch (Exception exception)
        {
            return BuildBlendShapesUnavailableJson(
                "serialize_blend_shapes_exception:" + exception.GetType().Name + ":" + exception.Message,
                "ARFaceManager.TryGetBlendShapes",
                "exception",
                0);
        }
        finally
        {
            if (blendShapes.IsCreated)
            {
                blendShapes.Dispose();
            }
        }
    }

    private static string BuildBlendShapesUnavailableJson(
        string reason,
        string source,
        string statusCode,
        int nativeStatusCode)
    {
        StringBuilder builder = new StringBuilder(512);
        builder.Append("{\"available\":false");
        AppendJsonField(builder, "source", source, false);
        AppendJsonField(builder, "provider", "ARKit", false);
        AppendJsonField(builder, "statusCode", statusCode, false);
        builder.Append(",\"nativeStatusCode\":").Append(nativeStatusCode.ToString(CultureInfo.InvariantCulture));
        builder.Append(",\"count\":0,\"items\":[]");
        AppendJsonField(builder, "reason", reason, false);
        AppendBlendShapeKeySignals(
            builder,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f,
            0.0f);
        builder.Append("}");
        return builder.ToString();
    }

    private static void AppendBlendShapeKeySignals(
        StringBuilder builder,
        float jawOpen,
        float mouthClose,
        float mouthFunnel,
        float mouthPucker,
        float mouthSmileLeft,
        float mouthSmileRight,
        float mouthStretchLeft,
        float mouthStretchRight,
        float mouthUpperUpLeft,
        float mouthUpperUpRight,
        float mouthLowerDownLeft,
        float mouthLowerDownRight)
    {
        builder.Append(",\"keySignals\":{");
        AppendNumericJsonField(builder, "jawOpen", jawOpen, true);
        AppendNumericJsonField(builder, "mouthClose", mouthClose, false);
        AppendNumericJsonField(builder, "mouthFunnel", mouthFunnel, false);
        AppendNumericJsonField(builder, "mouthPucker", mouthPucker, false);
        AppendNumericJsonField(builder, "mouthSmileLeft", mouthSmileLeft, false);
        AppendNumericJsonField(builder, "mouthSmileRight", mouthSmileRight, false);
        AppendNumericJsonField(builder, "mouthStretchLeft", mouthStretchLeft, false);
        AppendNumericJsonField(builder, "mouthStretchRight", mouthStretchRight, false);
        AppendNumericJsonField(builder, "mouthUpperUpLeft", mouthUpperUpLeft, false);
        AppendNumericJsonField(builder, "mouthUpperUpRight", mouthUpperUpRight, false);
        AppendNumericJsonField(builder, "mouthLowerDownLeft", mouthLowerDownLeft, false);
        AppendNumericJsonField(builder, "mouthLowerDownRight", mouthLowerDownRight, false);
        builder.Append("}");
    }

    private static void AppendNumericJsonField(StringBuilder builder, string key, float value, bool firstField)
    {
        if (!firstField)
        {
            builder.Append(",");
        }

        builder.Append("\"")
            .Append(key)
            .Append("\":")
            .Append(value.ToString("0.######", CultureInfo.InvariantCulture));
    }

    private void RefreshSceneReferences()
    {
        if (faceManager == null)
        {
            faceManager = FindFirstObjectByType<ARFaceManager>();
        }

        if (arCamera == null)
        {
            arCamera = Camera.main;
        }

        if (arCamera == null)
        {
            ARCameraManager cameraManager = FindFirstObjectByType<ARCameraManager>();
            arCamera = cameraManager != null ? cameraManager.GetComponent<Camera>() : null;
        }

        if (statusReporter == null)
        {
            statusReporter = FindFirstObjectByType<FaceTrackingStatusReporter>();
        }

        if (rnBridge == null)
        {
            rnBridge = FindFirstObjectByType<RNBridge>();
        }
    }

    private ARFace SelectActiveFace()
    {
        if (faceManager == null)
        {
            return null;
        }

        ARFace fallback = null;
        ARFace limited = null;
        foreach (ARFace face in faceManager.trackables)
        {
            if (face == null)
            {
                continue;
            }

            if (face.trackingState == TrackingState.Tracking)
            {
                return face;
            }

            if (face.trackingState == TrackingState.Limited && limited == null)
            {
                limited = face;
            }

            if (fallback == null)
            {
                fallback = face;
            }
        }

        return limited != null ? limited : fallback;
    }

    private static CaptureRequestPayload ParseRequest(string json)
    {
        CaptureRequestPayload request = null;
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                request = JsonUtility.FromJson<CaptureRequestPayload>(json);
            }
            catch (Exception exception)
            {
                Debug.LogWarning("[E7] reference_capture_request_parse_failed error=" + exception.Message + " raw=" + json);
            }
        }

        if (request == null)
        {
            request = new CaptureRequestPayload();
        }

        request.capturePairId = string.IsNullOrWhiteSpace(request.capturePairId)
            ? DefaultCapturePairId
            : request.capturePairId.Trim();
        request.captureSetId = string.IsNullOrWhiteSpace(request.captureSetId)
            ? request.capturePairId
            : request.captureSetId.Trim();
        request.captureShotKind = string.IsNullOrWhiteSpace(request.captureShotKind)
            ? "neutral"
            : request.captureShotKind.Trim();
        request.requestedBy = string.IsNullOrWhiteSpace(request.requestedBy)
            ? "rn"
            : request.requestedBy.Trim();
        request.purpose = string.IsNullOrWhiteSpace(request.purpose)
            ? "synchronized_capture_one_frame_common_lip_eye_cheek"
            : request.purpose.Trim();
        return request;
    }

    private void SendCaptureEvent(
        string status,
        CaptureRequestPayload request,
        string relativeDirectory,
        string framePreviewUri,
        string detail,
        int vertexCount,
        int indexCount,
        int uvCount,
        int frameWidth)
    {
        if (rnBridge == null)
        {
            rnBridge = FindFirstObjectByType<RNBridge>();
        }

        string json = "{"
            + "\"type\":\"e7_reference_capture\""
            + ",\"status\":\"" + EscapeJsonString(status) + "\""
            + ",\"capturePairId\":\"" + EscapeJsonString(request.capturePairId) + "\""
            + ",\"captureSetId\":\"" + EscapeJsonString(request.captureSetId) + "\""
            + ",\"captureShotKind\":\"" + EscapeJsonString(request.captureShotKind) + "\""
            + ",\"regions\":[\"lip\",\"eye\",\"cheek\"]"
            + ",\"relativeDirectory\":\"" + EscapeJsonString(relativeDirectory) + "\""
            + ",\"framePreviewUri\":\"" + EscapeJsonString(framePreviewUri) + "\""
            + ",\"detail\":\"" + EscapeJsonString(detail) + "\""
            + ",\"meshVertexCount\":" + vertexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshIndexCount\":" + indexCount.ToString(CultureInfo.InvariantCulture)
            + ",\"meshUvCount\":" + uvCount.ToString(CultureInfo.InvariantCulture)
            + ",\"frameWidth\":" + frameWidth.ToString(CultureInfo.InvariantCulture)
            + ",\"coordinateSpaceValidated\":false"
            + ",\"coordinateSpaceValidationStatus\":\"pending_projected_mesh_overlay_review\""
            + "}";

        if (rnBridge != null)
        {
            rnBridge.SendE7ReferenceCaptureEvent(json);
        }
        else
        {
            Debug.Log("[E7] reference_capture_event_no_bridge " + json);
        }
    }

    private static bool IsValidVertexIndex(int index, int vertexCount)
    {
        return index >= 0 && index < vertexCount;
    }

    private static int GetVertexCount(ARFace face)
    {
        return face != null && face.vertices.IsCreated ? face.vertices.Length : 0;
    }

    private static int GetIndexCount(ARFace face)
    {
        return face != null && face.indices.IsCreated ? face.indices.Length : 0;
    }

    private static int GetUvCount(ARFace face)
    {
        return face != null && face.uvs.IsCreated ? face.uvs.Length : 0;
    }

    private static float GetDisplayScale()
    {
        return Screen.dpi > 0.0f ? Screen.dpi / 160.0f : 1.0f;
    }

    private static void AppendJsonField(StringBuilder builder, string key, string value, bool firstField)
    {
        if (!firstField)
        {
            builder.Append(",");
        }

        builder.Append("\"")
            .Append(key)
            .Append("\":\"")
            .Append(EscapeJsonString(value))
            .Append("\"");
    }

    private static string EscapeJsonString(string value)
    {
        return (value ?? string.Empty)
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r");
    }

    private static string SanitizeLogValue(string value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? "none"
            : value.Trim().Replace(" ", "_").Replace("\n", "_").Replace("\r", "_");
    }

    private sealed class CaptureExportResult
    {
        public bool Success;
        public string Error = string.Empty;
        public string ExportDirectory = string.Empty;
        public string RelativeDirectory = string.Empty;
        public string FramePreviewUri = string.Empty;
        public int FrameWidth;
        public int FrameHeight;
        public int VertexCount;
        public int IndexCount;
        public int UvCount;
    }
}
