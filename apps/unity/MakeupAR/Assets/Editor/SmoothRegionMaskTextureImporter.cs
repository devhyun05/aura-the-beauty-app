using UnityEditor;

public sealed class SmoothRegionMaskTextureImporter : AssetPostprocessor
{
    private const string SmoothMaskPath =
        "Assets/Resources/SmoothRegionMasks/";
    private const string SourceMaskPath =
        "Assets/SourceMasks/";

    private void OnPreprocessTexture()
    {
        if (!IsMaskTexturePath(assetPath))
        {
            return;
        }

        TextureImporter importer = (TextureImporter)assetImporter;
        importer.textureType = TextureImporterType.Default;
        importer.sRGBTexture = false;
        importer.alphaSource = TextureImporterAlphaSource.FromInput;
        importer.isReadable = true;
        importer.mipmapEnabled = false;
        importer.wrapMode = UnityEngine.TextureWrapMode.Clamp;
        importer.filterMode = UnityEngine.FilterMode.Bilinear;
        importer.textureCompression = TextureImporterCompression.Uncompressed;
    }

    private static bool IsMaskTexturePath(string path)
    {
        return path.EndsWith(".png", System.StringComparison.OrdinalIgnoreCase)
            && (path.StartsWith(SmoothMaskPath, System.StringComparison.Ordinal)
                || path.StartsWith(SourceMaskPath, System.StringComparison.Ordinal));
    }
}
