using System;
using System.Collections;
#if UNITY_IOS && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif
using UnityEngine;
using UnityEngine.Rendering;

/// <summary>
/// Real face-parsing segmentation provider built on Apple Vision
/// (E7VisionFaceParsing.mm): per-frame face landmark polygons give precise
/// eye-opening / outer-lip / eyebrow exclusion masks, and person
/// segmentation separates hair, clothing and background from face/neck
/// skin. No downloadable model is required.
///
/// Capture pipeline (v2, hitch-free):
///   1. ScreenCapture blits the frame into a small RenderTexture (GPU-side
///      downscale, no stall).
///   2. AsyncGPUReadback pulls the RGBA rows to the CPU a few frames later
///      with zero pipeline stall (the old path's full-res ReadPixels +
///      main-thread PNG encode caused visible hitches during motion).
///   3. The raw rows go to E7VisionFaceParsingSubmitRgba, which copies them
///      and runs Vision on a serial BACKGROUND queue.
///   4. Update() polls E7VisionFaceParsingTryFetch and uploads the five
///      class masks (skin, hair, lip, eye, brow) to R8 textures in screen
///      UV space (rows bottom-up).
/// The provider registers itself with FoundationSegmentationRegistry once
/// the first result lands.
/// </summary>
public sealed class VisionFaceParsingProvider : MonoBehaviour, IFoundationSegmentationProvider
{
    private const float CaptureIntervalSeconds = 0.18f;
    private const double FreshWindowMs = 700.0;
    private const int MaskWidth = 192;
    private const int MaskClassCount = 5;
    private const int CaptureWidth = 384;

    private bool runtimeRequested;
    private bool captureInProgress;
    private float nextCaptureAt;
    private bool registered;
    private int maskHeight;
    private byte[] nativeMaskBuffer;
    private byte[] frameUploadBuffer;
    private byte[] classUploadBuffer;
    private RenderTexture captureTexture;
    private Texture2D skinTexture;
    private Texture2D hairTexture;
    private Texture2D lipTexture;
    private Texture2D eyeTexture;
    private Texture2D browTexture;
    private double lastResultAtMs;
    private int noFaceJobsSinceToggle;
    private int lastSeenCompletedJobs;
    private bool captureRowsBottomUp;
    private bool captureFlipLocked;
    private bool loggedFirstResult;

#if UNITY_IOS && !UNITY_EDITOR && AURA_ENABLE_VISION_FACE_PARSING
    [DllImport("__Internal")]
    private static extern int E7VisionFaceParsingSubmitRgba(
        byte[] rgba,
        int width,
        int height,
        int strideBytes,
        int rowsBottomUp,
        int maskWidth,
        int maskHeight);

    [DllImport("__Internal")]
    private static extern int E7VisionFaceParsingTryFetch(
        byte[] outMasks,
        int maskWidth,
        int maskHeight);

    [DllImport("__Internal")]
    private static extern int E7VisionFaceParsingLastStatus();

    [DllImport("__Internal")]
    private static extern int E7VisionFaceParsingCompletedJobs();
#endif

    public bool IsReady =>
        skinTexture != null && NowMs() - lastResultAtMs <= FreshWindowMs;

    public string ProviderName => "apple-vision-face-parsing";

    public void UpdateFrame(Camera arCamera)
    {
        // Capture runs on its own cadence via Update below.
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
            // compositor keeps the chroma gate as the skin decision. Hair
            // here is exclusion-only (person minus face/neck region), which
            // is safe to consume.
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
    /// Called by the consumer every frame segmentation is wanted. Capture
    /// stops automatically when requests cease.
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
#if UNITY_IOS && !UNITY_EDITOR && AURA_ENABLE_VISION_FACE_PARSING
        if (runtimeRequested && Time.realtimeSinceStartup - lastRequestedAt > 1.0f)
        {
            runtimeRequested = false;
            Debug.Log("[FoundationSegmentation] vision_face_parsing_requested=false");
        }

        PollBackgroundResult();

        if (!runtimeRequested
            || captureInProgress
            || Time.realtimeSinceStartup < nextCaptureAt)
        {
            return;
        }

        StartCoroutine(CaptureFrame());
#endif
    }

    private void OnDestroy()
    {
        FoundationSegmentationRegistry.Unregister(this);
        if (captureTexture != null)
        {
            captureTexture.Release();
            Destroy(captureTexture);
        }
    }

#if UNITY_IOS && !UNITY_EDITOR && AURA_ENABLE_VISION_FACE_PARSING
    private IEnumerator CaptureFrame()
    {
        captureInProgress = true;
        nextCaptureAt = Time.realtimeSinceStartup + CaptureIntervalSeconds;

        EnsureBuffers();
        if (captureTexture == null)
        {
            captureInProgress = false;
            yield break;
        }

        // GPU-side downscale blit of the frame; no CPU stall.
        ScreenCapture.CaptureScreenshotIntoRenderTexture(captureTexture);
        yield return new WaitForEndOfFrame();

        AsyncGPUReadback.Request(
            captureTexture, 0, TextureFormat.RGBA32, OnCaptureReadback);
    }

    private void OnCaptureReadback(AsyncGPUReadbackRequest request)
    {
        try
        {
            if (request.hasError || captureTexture == null)
            {
                return;
            }

            int width = request.width;
            int height = request.height;
            int stride = request.layerDataSize > 0 && height > 0
                ? request.layerDataSize / height
                : width * 4;
            var data = request.GetData<byte>();
            int required = stride * height;
            if (data.Length < required || frameUploadBuffer == null || frameUploadBuffer.Length < required)
            {
                return;
            }

            Unity.Collections.NativeArray<byte>.Copy(data, 0, frameUploadBuffer, 0, required);
            E7VisionFaceParsingSubmitRgba(
                frameUploadBuffer,
                width,
                height,
                stride,
                captureRowsBottomUp ? 1 : 0,
                MaskWidth,
                maskHeight);
        }
        finally
        {
            captureInProgress = false;
        }
    }

    private void PollBackgroundResult()
    {
        if (nativeMaskBuffer == null)
        {
            return;
        }

        if (E7VisionFaceParsingTryFetch(nativeMaskBuffer, MaskWidth, maskHeight) != 1)
        {
            // No fresh result this frame. Auto-flip counts COMPLETED
            // inference jobs, not frames: a full parse takes 100-200ms, so
            // frame-based counting toggled the orientation faster than any
            // job could finish and it oscillated forever. Once any
            // orientation succeeds it is locked for the session.
            if (captureFlipLocked || !runtimeRequested)
            {
                return;
            }

            int completedJobs = E7VisionFaceParsingCompletedJobs();
            if (completedJobs != lastSeenCompletedJobs)
            {
                lastSeenCompletedJobs = completedJobs;
                int status = E7VisionFaceParsingLastStatus();
                if (status == -4 || status == -5)
                {
                    noFaceJobsSinceToggle++;
                    if (noFaceJobsSinceToggle >= 6)
                    {
                        noFaceJobsSinceToggle = 0;
                        captureRowsBottomUp = !captureRowsBottomUp;
                        Debug.Log(
                            "[FoundationSegmentation] vision_face_parsing_flip_toggle rowsBottomUp="
                            + captureRowsBottomUp.ToString().ToLowerInvariant());
                    }
                }
            }

            return;
        }

        noFaceJobsSinceToggle = 0;
        captureFlipLocked = true;
        int classSize = MaskWidth * maskHeight;
        UploadClass(ref skinTexture, "VisionParsingSkin", 0, classSize);
        UploadClass(ref hairTexture, "VisionParsingHair", 1, classSize);
        UploadClass(ref lipTexture, "VisionParsingLip", 2, classSize);
        UploadClass(ref eyeTexture, "VisionParsingEye", 3, classSize);
        UploadClass(ref browTexture, "VisionParsingBrow", 4, classSize);
        lastResultAtMs = NowMs();

        if (!loggedFirstResult)
        {
            loggedFirstResult = true;
            Debug.Log(
                "[FoundationSegmentation] vision_face_parsing_first_result maskWidth="
                + MaskWidth + " maskHeight=" + maskHeight
                + " rowsBottomUp=" + captureRowsBottomUp.ToString().ToLowerInvariant());
        }

        if (!registered)
        {
            registered = true;
            FoundationSegmentationRegistry.Register(this);
        }
    }

    private void EnsureBuffers()
    {
        int screenWidth = Mathf.Max(1, Screen.width);
        int screenHeight = Mathf.Max(1, Screen.height);
        int captureHeight = Mathf.Clamp(
            Mathf.RoundToInt(CaptureWidth * (float)screenHeight / screenWidth),
            320,
            1024);
        int nextMaskHeight = Mathf.Clamp(
            Mathf.RoundToInt(MaskWidth * (float)screenHeight / screenWidth),
            160,
            512);
        if (maskHeight != nextMaskHeight || nativeMaskBuffer == null)
        {
            maskHeight = nextMaskHeight;
            nativeMaskBuffer = new byte[MaskWidth * maskHeight * MaskClassCount];
            classUploadBuffer = new byte[MaskWidth * maskHeight];
        }

        if (captureTexture == null
            || captureTexture.width != CaptureWidth
            || captureTexture.height != captureHeight)
        {
            if (captureTexture != null)
            {
                captureTexture.Release();
                Destroy(captureTexture);
            }

            captureTexture = new RenderTexture(
                CaptureWidth, captureHeight, 0, RenderTextureFormat.ARGB32)
            {
                name = "VisionParsingCapture"
            };
            captureTexture.Create();
            frameUploadBuffer = new byte[CaptureWidth * captureHeight * 4 + captureHeight * 64];
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
