using System;
using System.Collections.Generic;

public struct MakeupRegionRendererRoute
{
    public string Region;
    public string RendererId;
    public string RendererMode;
    public string BackendComponent;
    public string Phase;
    public string RunIdPrefix;

    public MakeupRegionRendererRoute(
        string region,
        string rendererId,
        string rendererMode,
        string backendComponent,
        string phase,
        string runIdPrefix)
    {
        Region = region;
        RendererId = rendererId;
        RendererMode = rendererMode;
        BackendComponent = backendComponent;
        Phase = phase;
        RunIdPrefix = runIdPrefix;
    }
}

public static class MakeupRegionRendererRoutes
{
    public const string SmoothRegionMaskMode = "smooth-region-mask";
    public const string SmoothRegionMaskBackend = "E3RegionMaskOverlay";

    public static readonly string[] Regions = { "lip", "cheek", "eye", "brow" };

    private static readonly Dictionary<string, MakeupRegionRendererRoute> Routes =
        new Dictionary<string, MakeupRegionRendererRoute>
        {
            {
                "lip",
                new MakeupRegionRendererRoute(
                    "lip",
                    "lip-smooth-region-mask-renderer",
                    SmoothRegionMaskMode,
                    SmoothRegionMaskBackend,
                    "smooth_mask_lip",
                    "lip-style-v1")
            },
            {
                "cheek",
                new MakeupRegionRendererRoute(
                    "cheek",
                    "cheek-smooth-region-mask-renderer",
                    SmoothRegionMaskMode,
                    SmoothRegionMaskBackend,
                    "smooth_mask_cheek",
                    "cheek-style-v1")
            },
            {
                "eye",
                new MakeupRegionRendererRoute(
                    "eye",
                    "eye-smooth-region-mask-renderer",
                    SmoothRegionMaskMode,
                    SmoothRegionMaskBackend,
                    "smooth_mask_eye",
                    "eye-style-v1")
            },
            {
                "brow",
                new MakeupRegionRendererRoute(
                    "brow",
                    "brow-smooth-region-mask-renderer",
                    SmoothRegionMaskMode,
                    SmoothRegionMaskBackend,
                    "smooth_mask_brow",
                    "brow-style-v1")
            },
        };

    public static MakeupRegionRendererRoute Resolve(string region)
    {
        region = NormalizeRegion(region);
        return Routes[region];
    }

    public static string NormalizeRegion(string region)
    {
        region = string.IsNullOrWhiteSpace(region)
            ? string.Empty
            : region.Trim().ToLowerInvariant();

        if (Routes.ContainsKey(region))
        {
            return region;
        }

        throw new ArgumentException("Unsupported makeup renderer region: " + region);
    }

    public static string NormalizeRendererMode(
        string preferred,
        string secondary,
        string region)
    {
        MakeupRegionRendererRoute route = Resolve(region);
        string value = !string.IsNullOrWhiteSpace(preferred) ? preferred : secondary;
        value = string.IsNullOrWhiteSpace(value)
            ? route.RendererMode
            : value.Trim().ToLowerInvariant();

        if (value == route.RendererMode)
        {
            return value;
        }

        throw new ArgumentException(
            "Unsupported renderer mode for region " + route.Region + ": " + value);
    }
}
