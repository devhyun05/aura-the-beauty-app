#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEngine;

// Dumps the generated eyeliner style masks to PNGs so shape parameters can
// be tuned against the reference photo without a device build. Uses the
// default (uncalibrated) eye zones — the same geometry the runtime uses
// before per-face calibration completes.
public static class EyelinerMaskPreviewExporter
{
    private const int Size = 512;

    private static readonly string[] StyleMaskIds =
    {
        "e7-eyeliner-gen-cat-v2",
        "e7-eyeliner-gen-puppy-v2",
        "e7-eyeliner-gen-sexy-v2",
        "e7-eyeliner-gen-winged-v2",
        "e7-eyeliner-gen-colored-v2",
        "e7-eyeliner-gen-doll-v2",
    };

    [MenuItem("Makeup AR Validation/Export Eyeliner Mask PNGs")]
    public static void ExportAll()
    {
        string outputDirectory = Path.GetFullPath(Path.Combine(
            Application.dataPath, "..", "..", "..", "..", "tmp-debug", "eyeliner-masks"));
        Directory.CreateDirectory(outputDirectory);

        foreach (string maskId in StyleMaskIds)
        {
            Color32[] pixels = E3RegionMaskOverlay.RasterizeEyelinerMask(maskId, Size);

            // The runtime channel layout is (w, 0, w, w); rewrite as opaque
            // grayscale so the dump is directly viewable.
            for (int i = 0; i < pixels.Length; i++)
            {
                byte weight = pixels[i].a;
                pixels[i] = new Color32(weight, weight, weight, 255);
            }

            Texture2D texture = new Texture2D(Size, Size, TextureFormat.RGBA32, false);
            try
            {
                texture.SetPixels32(pixels);
                texture.Apply(false, false);
                string path = Path.Combine(outputDirectory, maskId + ".png");
                File.WriteAllBytes(path, texture.EncodeToPNG());
                Debug.Log("[E7] eyeliner_mask_png_exported path=" + path);
            }
            finally
            {
                Object.DestroyImmediate(texture);
            }
        }

        Debug.Log(
            "[E7] eyeliner_mask_png_export_complete count=" + StyleMaskIds.Length
            + " dir=" + outputDirectory);
    }
}
#endif
