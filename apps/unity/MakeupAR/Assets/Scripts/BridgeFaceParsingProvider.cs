using System;
using UnityEngine;

/// <summary>
/// Face-parsing provider fed from the native iOS side (CoreML/Vision face
/// parsing) through the RN/Unity bridge. The native module runs the parsing
/// model (skin/hair/lips/eyes/eyebrows[/occluder/confidence]) and pushes each
/// frame as single-channel R8 buffers via RNBridge.ApplyFoundationParsingFrameJson.
///
/// Contract for the native side:
///  - Buffers are width*height bytes, one byte per pixel (0..255 = mask 0..1).
///  - Row order bottom-up in screen UV space (v=0 at the bottom), already
///    display-transformed to match the on-screen camera image. If the model
///    ran on a resized/cropped input, the native side must map the output
///    back to full-screen UV before pushing (letterbox areas = 0).
///  - Push rate may be lower than render rate (10–15fps is fine); the
///    compositor's temporal smoothing bridges the gaps. Frames older than
///    0.5s mark the provider not-ready and the chroma fallback takes over.
///
/// The provider registers itself with FoundationSegmentationRegistry on the
/// first ingested frame; no additional wiring is needed.
/// </summary>
public sealed class BridgeFaceParsingProvider : IFoundationSegmentationProvider
{
    private const double FreshWindowMs = 500.0;

    private static BridgeFaceParsingProvider instance;

    private Texture2D skinTexture;
    private Texture2D hairTexture;
    private Texture2D lipTexture;
    private Texture2D eyeTexture;
    private Texture2D browTexture;
    private Texture2D occlusionTexture;
    private Texture2D confidenceTexture;
    private int frameWidth;
    private int frameHeight;
    private double lastFrameAtMs;

    public bool IsReady =>
        skinTexture != null && NowMs() - lastFrameAtMs <= FreshWindowMs;

    public string ProviderName => "bridge-face-parsing";

    public void UpdateFrame(Camera arCamera)
    {
        // Frames are pushed from the native side; nothing to pull per frame.
    }

    public bool TryGetLatestResult(out FoundationSegmentationResult result)
    {
        result = new FoundationSegmentationResult
        {
            IsValid = IsReady,
            TimestampMs = lastFrameAtMs,
            SourceWidth = frameWidth,
            SourceHeight = frameHeight,
            SkinMask = skinTexture,
            HairMask = hairTexture,
            LipMask = lipTexture,
            EyeMask = eyeTexture,
            EyebrowMask = browTexture,
            OcclusionMask = occlusionTexture,
            ConfidenceMask = confidenceTexture,
            MaskToScreen = Matrix4x4.identity,
            // A real face-parsing model provides true per-class masks.
            HasSkinClass = skinTexture != null,
            HasHairClass = hairTexture != null,
            HasLipClass = lipTexture != null,
            HasEyeClass = eyeTexture != null,
            HasEyebrowClass = browTexture != null
        };
        return result.IsValid;
    }

    /// <summary>
    /// Entry point used by RNBridge. Null/empty buffers are allowed for
    /// classes the model does not provide.
    /// </summary>
    public static void IngestFrame(
        int width,
        int height,
        byte[] skin,
        byte[] hair,
        byte[] lip,
        byte[] eye,
        byte[] brow,
        byte[] occlusion,
        byte[] confidence)
    {
        if (width <= 0 || height <= 0 || skin == null || skin.Length < width * height)
        {
            Debug.LogWarning(
                "[FoundationSegmentation] parsing_frame_rejected width=" + width
                + " height=" + height
                + " skinBytes=" + (skin != null ? skin.Length : 0));
            return;
        }

        if (instance == null)
        {
            instance = new BridgeFaceParsingProvider();
            FoundationSegmentationRegistry.Register(instance);
        }

        instance.frameWidth = width;
        instance.frameHeight = height;
        instance.Upload(ref instance.skinTexture, "FoundationParsingSkin", width, height, skin);
        instance.Upload(ref instance.hairTexture, "FoundationParsingHair", width, height, hair);
        instance.Upload(ref instance.lipTexture, "FoundationParsingLip", width, height, lip);
        instance.Upload(ref instance.eyeTexture, "FoundationParsingEye", width, height, eye);
        instance.Upload(ref instance.browTexture, "FoundationParsingBrow", width, height, brow);
        instance.Upload(ref instance.occlusionTexture, "FoundationParsingOcclusion", width, height, occlusion);
        instance.Upload(ref instance.confidenceTexture, "FoundationParsingConfidence", width, height, confidence);
        instance.lastFrameAtMs = NowMs();
    }

    private void Upload(ref Texture2D texture, string name, int width, int height, byte[] bytes)
    {
        if (bytes == null || bytes.Length < width * height)
        {
            return; // class not provided this frame; keep previous (or null)
        }

        if (texture == null || texture.width != width || texture.height != height)
        {
            if (texture != null)
            {
                UnityEngine.Object.Destroy(texture);
            }

            texture = new Texture2D(width, height, TextureFormat.R8, false, true)
            {
                name = name,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };
        }

        texture.LoadRawTextureData(bytes);
        texture.Apply(false, false);
    }

    private static double NowMs()
    {
        return Time.realtimeSinceStartupAsDouble * 1000.0;
    }
}
