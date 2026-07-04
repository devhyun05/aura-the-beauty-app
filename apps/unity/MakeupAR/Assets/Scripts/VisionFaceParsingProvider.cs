using System;
using System.Collections;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
using UnityEngine;

/// <summary>
/// Real face-parsing segmentation provider built on Apple Vision
/// (E7VisionFaceParsing.mm): per-frame face landmark polygons give precise
/// eye-opening / outer-lip / eyebrow exclusion masks, and person
/// segmentation separates hair, clothing and background from face/neck
/// skin. No downloadable model is required — it reuses the Vision framework
/// the app already links for the lip boundary and hand occlusion runtimes.
///
/// Capture follows the proven E7VisionLipBoundaryRuntime pattern: a screen
/// grab every ~0.18s is handed to the native plugin, which rasterizes the
/// five classes (skin, hair, lip, eye, brow) at mask resolution in screen
/// UV space (rows bottom-up). Results are uploaded to R8 textures and the
/// provider registers itself with FoundationSegmentationRegistry, at which
/// point the compositor switches from the chroma fallback to these masks.
/// </summary>
public sealed class VisionFaceParsingProvider : MonoBehaviour, IFoundationSegmentationProvider
{
    private const float CaptureIntervalSeconds = 0.18f;
    private const double FreshWindowMs = 700.0;
    private const int MaskWidth = 192;
    private const int MaskClassCount = 5;

    private bool runtimeRequested;
    private bool captureInProgress;
    private float nextCaptureAt;
    private bool registered;
    private int maskHeight;
    private byte[] nativeMaskBuffer;
    private byte[] classUploadBuffer;
    private Texture2D frameTexture;
    private Texture2D skinTexture;
    private Texture2D hairTexture;
    private Texture2D lipTexture;
    private Texture2D eyeTexture;
    private Texture2D browTexture;
    private double lastResultAtMs;
    private int consecutiveFailures;

#if UNITY_IOS && !UNITY_EDITOR && AURA_ENABLE_VISION_FACE_PARSING_PNG
    [DllImport("__Internal")]
    private static extern int E7VisionFaceParsingPng(
        byte[] pngBytes,
        int byteCount,
        int maskWidth,
        int maskHeight,
        byte[] outMasks);
#endif

    public bool IsReady =>
        skinTexture != null && NowMs() - lastResultAtMs <= FreshWindowMs;

    public string ProviderName => "apple-vision-face-parsing";

    public void UpdateFrame(Camera arCamera)
    {
        // Capture runs on its own cadence via the coroutine below.
    }

    public bool TryGetLatestResult(out FoundationSegmentationResult result)
    {
        result = new FoundationSegmentationResult
        {
            IsValid = IsReady,
            TimestampMs = lastResultAtMs,
            SourceWidth = MaskWidth,
            SourceHeight = maskHeight,
            SkinMask = skinTexture,
            HairMask = hairTexture,
            LipMask = lipTexture,
            EyeMask = eyeTexture,
            EyebrowMask = browTexture,
            MaskToScreen = Matrix4x4.identity,
            // Landmark polygons are true semantic classes; skin/hair are
            // person-segmentation + geometry derived, so HasSkinClass stays
            // false (person masks include hair/glasses/clothing) — the
            // compositor keeps the chroma gate as the skin decision and the
            // controller lowers opacity. Hair here is exclusion-only
            // (person minus face/neck region), which is safe to consume.
            HasSkinClass = false,
            HasHairClass = true,
            HasLipClass = true,
            HasEyeClass = true,
            HasEyebrowClass = true
        };
        return result.IsValid;
    }

    private float lastRequestedAt = -10.0f;

    /// <summary>
    /// Called by the compositor every semantic frame. Capture stops
    /// automatically when requests cease (semantic mode disabled).
    /// </summary>
    public void RequestCapture()
    {
        if (!runtimeRequested)
        {
            runtimeRequested = true;
            nextCaptureAt = 0.0f;
            Debug.Log("[FoundationSegmentation] vision_face_parsing_requested=true");
        }

        lastRequestedAt = Time.realtimeSinceStartup;
    }

    private void Update()
    {
#if UNITY_IOS && !UNITY_EDITOR
        if (runtimeRequested && Time.realtimeSinceStartup - lastRequestedAt > 1.0f)
        {
            runtimeRequested = false;
            Debug.Log("[FoundationSegmentation] vision_face_parsing_requested=false");
        }

        if (!runtimeRequested
            || captureInProgress
            || Time.realtimeSinceStartup < nextCaptureAt)
        {
            return;
        }

        StartCoroutine(CaptureAndParse());
#endif
    }

    private void OnDestroy()
    {
        FoundationSegmentationRegistry.Unregister(this);
    }

#if UNITY_IOS && !UNITY_EDITOR
    private IEnumerator CaptureAndParse()
    {
        captureInProgress = true;
        nextCaptureAt = Time.realtimeSinceStartup + CaptureIntervalSeconds;
        yield return new WaitForEndOfFrame();

        try
        {
#if !AURA_ENABLE_VISION_FACE_PARSING_PNG
            runtimeRequested = false;
            consecutiveFailures++;
            if (consecutiveFailures == 1)
            {
                Debug.LogWarning(
                    "[FoundationSegmentation] vision_face_parsing_disabled"
                    + " reason=png_encoder_unavailable"
                    + " path=screen_space_arface_manager_default");
            }

            yield break;
#else
            int width = Screen.width;
            int height = Screen.height;
            if (width <= 0 || height <= 0)
            {
                yield break;
            }

            EnsureBuffers(width, height);
            frameTexture.ReadPixels(new Rect(0, 0, width, height), 0, 0, false);
            frameTexture.Apply(false, false);
            byte[] pngBytes = ImageConversion.EncodeToPNG(frameTexture);
            if (pngBytes == null || pngBytes.Length == 0)
            {
                yield break;
            }

            int status = E7VisionFaceParsingPng(
                pngBytes,
                pngBytes.Length,
                MaskWidth,
                maskHeight,
                nativeMaskBuffer);
            if (status != 0)
            {
                consecutiveFailures++;
                if (consecutiveFailures == 1 || consecutiveFailures % 25 == 0)
                {
                    Debug.LogWarning(
                        "[FoundationSegmentation] vision_face_parsing_failed status="
                        + status.ToString(System.Globalization.CultureInfo.InvariantCulture)
                        + " failures=" + consecutiveFailures.ToString(System.Globalization.CultureInfo.InvariantCulture));
                }

                yield break;
            }

            consecutiveFailures = 0;
            int classSize = MaskWidth * maskHeight;
            UploadClass(ref skinTexture, "VisionParsingSkin", 0, classSize);
            UploadClass(ref hairTexture, "VisionParsingHair", 1, classSize);
            UploadClass(ref lipTexture, "VisionParsingLip", 2, classSize);
            UploadClass(ref eyeTexture, "VisionParsingEye", 3, classSize);
            UploadClass(ref browTexture, "VisionParsingBrow", 4, classSize);
            lastResultAtMs = NowMs();

            if (!registered)
            {
                registered = true;
                FoundationSegmentationRegistry.Register(this);
            }
#endif
        }
        finally
        {
            captureInProgress = false;
        }
    }

    private void EnsureBuffers(int width, int height)
    {
        int nextMaskHeight = Mathf.Clamp(
            Mathf.RoundToInt(MaskWidth * (float)height / Mathf.Max(1, width)),
            160,
            512);
        if (maskHeight != nextMaskHeight || nativeMaskBuffer == null)
        {
            maskHeight = nextMaskHeight;
            nativeMaskBuffer = new byte[MaskWidth * maskHeight * MaskClassCount];
            classUploadBuffer = new byte[MaskWidth * maskHeight];
        }

        if (frameTexture == null
            || frameTexture.width != width
            || frameTexture.height != height)
        {
            if (frameTexture != null)
            {
                Destroy(frameTexture);
            }

            frameTexture = new Texture2D(width, height, TextureFormat.RGB24, false);
        }
    }

    private void UploadClass(ref Texture2D texture, string name, int classIndex, int classSize)
    {
        if (texture == null
            || texture.width != MaskWidth
            || texture.height != maskHeight)
        {
            if (texture != null)
            {
                Destroy(texture);
            }

            texture = new Texture2D(MaskWidth, maskHeight, TextureFormat.R8, false, true)
            {
                name = name,
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear
            };
        }

        Buffer.BlockCopy(nativeMaskBuffer, classIndex * classSize, classUploadBuffer, 0, classSize);
        texture.LoadRawTextureData(classUploadBuffer);
        texture.Apply(false, false);
    }
#endif

    private static double NowMs()
    {
        return Time.realtimeSinceStartupAsDouble * 1000.0;
    }
}
