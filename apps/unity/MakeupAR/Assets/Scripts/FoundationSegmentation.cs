using UnityEngine;

/// <summary>
/// Result of a face-parsing / skin-segmentation pass for one camera frame.
/// All mask textures are single-channel style (mask value read from R) and
/// live in SCREEN UV space (bottom-left origin, same space the compositor
/// and the AR camera display transform use). Providers that segment in a
/// different resolution/crop must bake the inverse transform into the
/// textures they expose here (or set MaskToScreen accordingly).
/// </summary>
public struct FoundationSegmentationResult
{
    public bool IsValid;
    public double TimestampMs;
    public int SourceWidth;
    public int SourceHeight;

    /// <summary>
    /// Class capability flags. A provider counts as a TRUE semantic provider
    /// for a class only when the corresponding flag is set. In particular,
    /// person-segmentation-derived masks (VNGeneratePersonSegmentationRequest
    /// includes hair, glasses and clothing) must NOT set HasSkinClass — the
    /// compositor then keeps the chroma fallback as the skin decision and
    /// lowers foundation opacity.
    /// </summary>
    public bool HasSkinClass;
    public bool HasHairClass;
    public bool HasLipClass;
    public bool HasEyeClass;
    public bool HasEyebrowClass;

    /// <summary>Face + neck skin candidate pixels.</summary>
    public Texture SkinMask;

    /// <summary>Hair, bangs, sideburns.</summary>
    public Texture HairMask;

    /// <summary>Lips only (philtrum must not be included).</summary>
    public Texture LipMask;

    /// <summary>Eye openings only (iris/sclera), not eyelids.</summary>
    public Texture EyeMask;

    /// <summary>Eyebrow hair only.</summary>
    public Texture EyebrowMask;

    /// <summary>Person/foreground mask (optional).</summary>
    public Texture PersonMask;

    /// <summary>Hands or other occluders over the face (optional).</summary>
    public Texture OcclusionMask;

    /// <summary>Per-pixel confidence (optional, R channel 0..1).</summary>
    public Texture ConfidenceMask;

    /// <summary>
    /// Additional transform from mask UV to screen UV if the provider could
    /// not bake it. Identity when masks are already screen-aligned.
    /// </summary>
    public Matrix4x4 MaskToScreen;
}

/// <summary>
/// Abstraction over face-parsing / skin-segmentation backends.
/// Priority order for concrete implementations:
///   1. an existing in-project segmentation/parsing model,
///   2. an iOS-native CoreML/Vision provider (masks pushed over the bridge
///      or via a native texture plugin),
///   3. a Unity Sentis/Barracuda provider.
/// When no provider is registered, FoundationSemanticMaskCompositor falls
/// back to a live skin-chroma gate restricted by the ARFace/neck geometry
/// prior. The fallback is a stop-gap, not the target quality path.
/// </summary>
public interface IFoundationSegmentationProvider
{
    bool IsReady { get; }
    string ProviderName { get; }

    /// <summary>Called once per rendered frame before the result is read.</summary>
    void UpdateFrame(Camera arCamera);

    bool TryGetLatestResult(out FoundationSegmentationResult result);
}

/// <summary>
/// Global registration point so a provider implemented anywhere (including
/// native-bridge driven ones) can plug into the foundation compositor
/// without further wiring.
/// </summary>
public static class FoundationSegmentationRegistry
{
    private static IFoundationSegmentationProvider provider;

    public static void Register(IFoundationSegmentationProvider nextProvider)
    {
        provider = nextProvider;
        Debug.Log(
            "[FoundationSegmentation] provider_registered name="
            + (nextProvider != null ? nextProvider.ProviderName : "none"));
    }

    public static void Unregister(IFoundationSegmentationProvider oldProvider)
    {
        if (ReferenceEquals(provider, oldProvider))
        {
            provider = null;
        }
    }

    public static bool TryGetResult(Camera arCamera, out FoundationSegmentationResult result)
    {
        result = default;
        if (provider == null || !provider.IsReady)
        {
            return false;
        }

        provider.UpdateFrame(arCamera);
        return provider.TryGetLatestResult(out result) && result.IsValid;
    }

    public static string ActiveProviderName =>
        provider != null ? provider.ProviderName : "none";
}
