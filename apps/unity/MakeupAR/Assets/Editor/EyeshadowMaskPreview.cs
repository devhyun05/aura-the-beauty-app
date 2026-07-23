#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEngine;

public static class EyeshadowMaskPreview
{
    private const int BandColumnCount = 25;
    private const int SheetColumnCount = 3;
    private const int TileWidth = 512;
    private const int TileHeight = 320;

    [MenuItem("AURA/Preview Eyeshadow Masks")]
    public static void PreviewEyeshadowMasks()
    {
        string maskDirectory = Path.Combine(
            Application.streamingAssetsPath,
            "catalog",
            "mask");
        string[] maskPaths = Directory.GetFiles(maskDirectory, "eye_*.png");
        System.Array.Sort(maskPaths, System.StringComparer.Ordinal);

        if (maskPaths.Length == 0)
        {
            EditorUtility.DisplayDialog(
                "Eyeshadow Mask Preview",
                "No eye_*.png masks were found in " + maskDirectory,
                "OK");
            return;
        }

        Shader shader = Shader.Find("Unlit/Transparent");
        if (shader == null)
        {
            EditorUtility.DisplayDialog(
                "Eyeshadow Mask Preview",
                "The Unlit/Transparent shader is unavailable.",
                "OK");
            return;
        }

        string outputDirectory = Path.Combine(
            Path.GetTempPath(),
            "AURA",
            "eyeshadow-mask-previews");
        Directory.CreateDirectory(outputDirectory);
        string outputPath = Path.Combine(
            outputDirectory,
            "eyeshadow-mask-preview-"
            + System.DateTime.Now.ToString("yyyyMMdd-HHmmss")
            + ".png");

        GameObject previewRoot = null;
        Mesh bandMesh = null;
        Material material = null;
        Camera previewCamera = null;
        RenderTexture renderTexture = null;
        Texture2D sheet = null;
        RenderTexture previousActive = RenderTexture.active;

        try
        {
            previewRoot = new GameObject("Eyeshadow Mask Preview");
            previewRoot.hideFlags = HideFlags.HideAndDontSave;

            GameObject bandObject = new GameObject("Eyelid Arc Band");
            bandObject.transform.SetParent(previewRoot.transform, false);
            bandObject.hideFlags = HideFlags.HideAndDontSave;

            bandMesh = BuildEyelidBandMesh();
            MeshFilter meshFilter = bandObject.AddComponent<MeshFilter>();
            meshFilter.sharedMesh = bandMesh;
            MeshRenderer meshRenderer = bandObject.AddComponent<MeshRenderer>();

            material = new Material(shader)
            {
                hideFlags = HideFlags.HideAndDontSave,
                color = Color.white,
            };
            meshRenderer.sharedMaterial = material;

            GameObject cameraObject = new GameObject("Eyeshadow Preview Camera");
            cameraObject.transform.SetParent(previewRoot.transform, false);
            cameraObject.hideFlags = HideFlags.HideAndDontSave;
            cameraObject.transform.position = new Vector3(0f, 0.3f, -10f);

            previewCamera = cameraObject.AddComponent<Camera>();
            previewCamera.clearFlags = CameraClearFlags.SolidColor;
            previewCamera.backgroundColor = new Color(0.055f, 0.06f, 0.075f, 1f);
            previewCamera.orthographic = true;
            previewCamera.orthographicSize = 0.95f;
            previewCamera.nearClipPlane = 0.1f;
            previewCamera.farClipPlane = 20f;
            previewCamera.allowHDR = false;
            previewCamera.allowMSAA = true;

            renderTexture = new RenderTexture(
                TileWidth,
                TileHeight,
                24,
                RenderTextureFormat.ARGB32)
            {
                hideFlags = HideFlags.HideAndDontSave,
                antiAliasing = 4,
            };
            renderTexture.Create();
            previewCamera.targetTexture = renderTexture;

            int sheetRowCount =
                (maskPaths.Length + SheetColumnCount - 1) / SheetColumnCount;
            int sheetWidth = SheetColumnCount * TileWidth;
            int sheetHeight = sheetRowCount * TileHeight;
            Color32[] sheetPixels = CreateSheetBackground(sheetWidth, sheetHeight);

            for (int index = 0; index < maskPaths.Length; index++)
            {
                Texture2D tintedMask = CreateTintedMask(maskPaths[index]);
                Texture2D tile = null;

                try
                {
                    material.mainTexture = tintedMask;
                    previewCamera.Render();

                    RenderTexture.active = renderTexture;
                    tile = new Texture2D(
                        TileWidth,
                        TileHeight,
                        TextureFormat.RGBA32,
                        false);
                    tile.ReadPixels(
                        new Rect(0f, 0f, TileWidth, TileHeight),
                        0,
                        0,
                        false);
                    tile.Apply(false, false);

                    int sheetColumn = index % SheetColumnCount;
                    int sheetRowFromTop = index / SheetColumnCount;
                    int destinationX = sheetColumn * TileWidth;
                    int destinationY =
                        (sheetRowCount - 1 - sheetRowFromTop) * TileHeight;
                    CopyTile(
                        tile.GetPixels32(),
                        sheetPixels,
                        sheetWidth,
                        destinationX,
                        destinationY);
                }
                finally
                {
                    material.mainTexture = null;
                    if (tile != null)
                    {
                        Object.DestroyImmediate(tile);
                    }

                    Object.DestroyImmediate(tintedMask);
                }
            }

            sheet = new Texture2D(
                sheetWidth,
                sheetHeight,
                TextureFormat.RGBA32,
                false);
            sheet.SetPixels32(sheetPixels);
            sheet.Apply(false, false);
            File.WriteAllBytes(outputPath, sheet.EncodeToPNG());

            Debug.Log(
                "[AURA] eyeshadow_mask_preview_saved path="
                + outputPath
                + " masks="
                + string.Join(", ", maskPaths));
        }
        catch (System.Exception exception)
        {
            Debug.LogException(exception);
            EditorUtility.DisplayDialog(
                "Eyeshadow Mask Preview",
                "Preview capture failed. See the Console for details.",
                "OK");
            return;
        }
        finally
        {
            if (previewCamera != null)
            {
                previewCamera.targetTexture = null;
            }

            RenderTexture.active = previousActive;

            if (renderTexture != null)
            {
                renderTexture.Release();
                Object.DestroyImmediate(renderTexture);
            }

            if (sheet != null)
            {
                Object.DestroyImmediate(sheet);
            }

            if (material != null)
            {
                Object.DestroyImmediate(material);
            }

            if (bandMesh != null)
            {
                Object.DestroyImmediate(bandMesh);
            }

            if (previewRoot != null)
            {
                Object.DestroyImmediate(previewRoot);
            }
        }

        EditorUtility.RevealInFinder(outputPath);
    }

    private static Mesh BuildEyelidBandMesh()
    {
        Vector3[] vertices = new Vector3[BandColumnCount * 2];
        Vector2[] uv = new Vector2[vertices.Length];
        int[] triangles = new int[(BandColumnCount - 1) * 6];

        for (int column = 0; column < BandColumnCount; column++)
        {
            float u = column / (float)(BandColumnCount - 1);
            float x = Mathf.Lerp(-1f, 1f, u);
            float lashY = 0.5f * (1f - x * x);
            // Max(0,·): float sin(π)는 -8.7e-8라 음수^비정수 = NaN → 메시 전체가 버려진다.
            float taper = Mathf.Pow(Mathf.Max(0f, Mathf.Sin(Mathf.PI * u)), 0.72f);
            float bandHeight = 0.48f * taper;
            int lowerIndex = column * 2;
            int upperIndex = lowerIndex + 1;

            vertices[lowerIndex] = new Vector3(x, lashY, 0f);
            vertices[upperIndex] = new Vector3(x, lashY + bandHeight, 0f);
            uv[lowerIndex] = new Vector2(u, 0f);
            uv[upperIndex] = new Vector2(u, 1f);
        }

        for (int column = 0; column < BandColumnCount - 1; column++)
        {
            int triangleOffset = column * 6;
            int lowerLeft = column * 2;
            int upperLeft = lowerLeft + 1;
            int lowerRight = lowerLeft + 2;
            int upperRight = lowerLeft + 3;

            triangles[triangleOffset] = lowerLeft;
            triangles[triangleOffset + 1] = upperLeft;
            triangles[triangleOffset + 2] = lowerRight;
            triangles[triangleOffset + 3] = lowerRight;
            triangles[triangleOffset + 4] = upperLeft;
            triangles[triangleOffset + 5] = upperRight;
        }

        Mesh mesh = new Mesh
        {
            name = "Synthetic Eyelid Arc Band",
            hideFlags = HideFlags.HideAndDontSave,
            vertices = vertices,
            uv = uv,
            triangles = triangles,
        };
        mesh.RecalculateBounds();
        return mesh;
    }

    private static Texture2D CreateTintedMask(string maskPath)
    {
        Texture2D source = new Texture2D(
            2,
            2,
            TextureFormat.RGBA32,
            false,
            true);

        try
        {
            if (!source.LoadImage(File.ReadAllBytes(maskPath), false))
            {
                throw new IOException("Could not decode mask PNG: " + maskPath);
            }

            Color32[] sourcePixels = source.GetPixels32();
            Color32[] tintedPixels = new Color32[sourcePixels.Length];
            Color32 tint = new Color32(179, 126, 255, 255);

            for (int index = 0; index < sourcePixels.Length; index++)
            {
                tintedPixels[index] = new Color32(
                    tint.r,
                    tint.g,
                    tint.b,
                    sourcePixels[index].r);
            }

            Texture2D tinted = new Texture2D(
                source.width,
                source.height,
                TextureFormat.RGBA32,
                false,
                true)
            {
                name = Path.GetFileNameWithoutExtension(maskPath) + " Preview Tint",
                hideFlags = HideFlags.HideAndDontSave,
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
            };
            tinted.SetPixels32(tintedPixels);
            tinted.Apply(false, false);
            return tinted;
        }
        finally
        {
            Object.DestroyImmediate(source);
        }
    }

    private static Color32[] CreateSheetBackground(int width, int height)
    {
        Color32[] pixels = new Color32[width * height];
        Color32 background = new Color32(14, 15, 19, 255);

        for (int index = 0; index < pixels.Length; index++)
        {
            pixels[index] = background;
        }

        return pixels;
    }

    // ── 풀 아이 세트(위 섀도 + 아래 섀도 + 라이너) 프리뷰 — §16 하부 확장 검증용 ──
    // 위 마스크는 밴드 하단=lash, 아래 마스크는 PNG 상단=lash(LowerLid 1-v 플립),
    // 라이너는 알파 라인 아트(u 우측 ~24%가 윙 캔버스) — 세 밴드 공간을 한 장에 합성.
    private static readonly string[][] FullEyeSets =
    {
        new[] { "eye_base", "under_wash", "liner_slim" },
        new[] { "eye_outer", "under_outer", "liner_bold" },
        new[] { "eye_tail_long", "under_tail", "liner_puppy" },
    };

    [MenuItem("AURA/Preview Full Eye Sets")]
    public static void PreviewFullEyeSets()
    {
        string path = RenderFullEyeSets(null);
        if (path != null)
        {
            EditorUtility.RevealInFinder(path);
        }
    }

    // 배치 진입점: Unity -batchmode -executeMethod EyeshadowMaskPreview.RenderFullEyeSetsBatch
    // 출력 디렉터리는 AURA_PREVIEW_OUT 환경변수, 없으면 시스템 temp.
    public static void RenderFullEyeSetsBatch()
    {
        RenderFullEyeSets(
            System.Environment.GetEnvironmentVariable("AURA_PREVIEW_OUT"));
    }

    private static string RenderFullEyeSets(string outputDirectoryOverride)
    {
        return RenderTileSheet(FullEyeSets, "full-eye-sets.png", outputDirectoryOverride);
    }

    // ── 카테고리별 개별 프리뷰 — 마스크 하나당 타일 하나(조합 세트 아님) ──
    // 타일 규약: { 위 마스크|null, 아래 마스크|null, 라이너|null } — null 슬롯은 밴드 숨김.
    // 풀 커버 패밀리만 위+아래 쌍(같은 접미사 = 한 컨셉의 마스크)으로 묶는다.
    private static readonly string[][] FullPairTiles =
    {
        new[] { "eye_full_wash", "under_full_wash", null },
        new[] { "eye_full_smoky", "under_full_smoky", null },
        new[] { "eye_full_gradient", "under_full_gradient", null },
        new[] { "eye_full_halo", "under_full_halo", null },
        new[] { "eye_full_tail", "under_full_tail", null },
        new[] { "eye_full_wide", "under_full_wide", null },
    };

    // 연장(§16b 와이드) 마스크 — 눈꼬리 밖까지 모양이 이어지는 2:1 마스크.
    private static readonly string[][] ExtTiles =
    {
        new[] { "ext_wing_sweep", null, null },
        new[] { "ext_smoky_out", null, null },
        new[] { "ext_wash_long", null, null },
        new[] { "ext_tail_streak", null, null },
    };

    private static readonly string[][] UpperOnlyTiles =
    {
        new[] { "eye_outer_wide", null, null },
        new[] { "eye_tail_long", null, null },
    };

    private static readonly string[][] UnderOnlyTiles =
    {
        new[] { null, "under_wash", null },
        new[] { null, "under_outer", null },
        new[] { null, "under_tail", null },
        new[] { null, "under_smoky_deep", null },
        new[] { null, "under_slim", null },
        new[] { null, "under_center", null },
        new[] { null, "under_deep_wide", null },
    };

    private static readonly string[][] LinerTiles =
    {
        new[] { null, null, "liner_slim" },
        new[] { null, null, "liner_bold" },
        new[] { null, null, "liner_puppy" },
        new[] { null, null, "liner_cat" },
        new[] { null, null, "liner_tight" },
        new[] { null, null, "liner_smudge" },
        new[] { null, null, "liner_long" },
        new[] { null, null, "liner_cat_long" },
        new[] { null, null, "liner_droop" },
        new[] { null, null, "liner_droop_long" },
    };

    [MenuItem("AURA/Preview Mask Categories")]
    public static void PreviewMaskCategories()
    {
        string last = RenderMaskCategorySheets(null);
        if (last != null)
        {
            EditorUtility.RevealInFinder(last);
        }
    }

    // 배치 진입점: -executeMethod EyeshadowMaskPreview.RenderMaskCategoriesBatch
    public static void RenderMaskCategoriesBatch()
    {
        RenderMaskCategorySheets(
            System.Environment.GetEnvironmentVariable("AURA_PREVIEW_OUT"));
    }

    private static string RenderMaskCategorySheets(string outputDirectoryOverride)
    {
        string a = RenderTileSheet(FullPairTiles, "sheet-full-pairs.png", outputDirectoryOverride);
        string b = RenderTileSheet(UnderOnlyTiles, "sheet-under-only.png", outputDirectoryOverride);
        string c = RenderTileSheet(LinerTiles, "sheet-liners.png", outputDirectoryOverride);
        string d = RenderTileSheet(UpperOnlyTiles, "sheet-upper-wide.png", outputDirectoryOverride);
        string e = RenderTileSheet(ExtTiles, "sheet-ext.png", outputDirectoryOverride);
        return e ?? d ?? c ?? b ?? a;
    }

    private static string RenderTileSheet(
        string[][] tiles, string fileName, string outputDirectoryOverride)
    {
        string maskDirectory = Path.Combine(
            Application.streamingAssetsPath, "catalog", "mask");
        string artDirectory = Path.Combine(
            Application.streamingAssetsPath, "catalog", "colorArt");

        Shader shader = Shader.Find("Unlit/Transparent");
        Shader lineShader = Shader.Find("Unlit/Color");
        if (shader == null || lineShader == null)
        {
            Debug.LogError("[AURA] tile_sheet_failed reason=missing_builtin_shader");
            return null;
        }

        string outputDirectory = string.IsNullOrEmpty(outputDirectoryOverride)
            ? Path.Combine(Path.GetTempPath(), "AURA", "eyeshadow-mask-previews")
            : outputDirectoryOverride;
        Directory.CreateDirectory(outputDirectory);
        string outputPath = Path.Combine(outputDirectory, fileName);

        const int SetTileWidth = 700;
        const int SetTileHeight = 470;

        GameObject previewRoot = null;
        RenderTexture renderTexture = null;
        RenderTexture previousActive = RenderTexture.active;
        var ownedMeshes = new System.Collections.Generic.List<Mesh>();
        var ownedMaterials = new System.Collections.Generic.List<Material>();
        var ownedTextures = new System.Collections.Generic.List<Texture2D>();
        Texture2D sheet = null;

        try
        {
            previewRoot = new GameObject("Mask Tile Sheet Preview")
            { hideFlags = HideFlags.HideAndDontSave };
            // 로드된 씬 지오메트리와 겹치지 않게 멀리 이동.
            previewRoot.transform.position = new Vector3(5000f, 5000f, 0f);

            Material upperMat = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            Material lowerMat = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            Material linerMat = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            ownedMaterials.Add(upperMat);
            ownedMaterials.Add(lowerMat);
            ownedMaterials.Add(linerMat);

            GameObject upperStrip = AddStrip(
                previewRoot.transform, BuildEyelidBandMesh(), upperMat, ownedMeshes);
            upperStrip.transform.localPosition = new Vector3(0f, 0f, -0.02f);
            GameObject extStrip = AddStrip(
                previewRoot.transform, BuildExtendedBandMesh(), upperMat, ownedMeshes);
            extStrip.transform.localPosition = new Vector3(0f, 0f, -0.02f);
            GameObject lowerStrip = AddStrip(
                previewRoot.transform, BuildLowerBandMesh(), lowerMat, ownedMeshes);
            lowerStrip.transform.localPosition = new Vector3(0f, 0f, -0.02f);
            GameObject linerStrip = AddStrip(
                previewRoot.transform, BuildLinerBandMesh(), linerMat, ownedMeshes);

            Material lashLineMat = new Material(lineShader)
            { hideFlags = HideFlags.HideAndDontSave, color = new Color(0.13f, 0.09f, 0.09f, 1f) };
            Material lowerLineMat = new Material(lineShader)
            { hideFlags = HideFlags.HideAndDontSave, color = new Color(0.35f, 0.25f, 0.22f, 1f) };
            ownedMaterials.Add(lashLineMat);
            ownedMaterials.Add(lowerLineMat);
            AddStrip(previewRoot.transform,
                BuildContourLineMesh(x => 0.5f * (1f - x * x), 0.022f), lashLineMat, ownedMeshes);
            AddStrip(previewRoot.transform,
                BuildContourLineMesh(x => -0.22f * (1f - x * x), 0.015f), lowerLineMat, ownedMeshes);

            GameObject cameraObject = new GameObject("Tile Sheet Camera")
            { hideFlags = HideFlags.HideAndDontSave };
            cameraObject.transform.SetParent(previewRoot.transform, false);
            cameraObject.transform.localPosition = new Vector3(0.12f, 0.18f, -10f);
            Camera previewCamera = cameraObject.AddComponent<Camera>();
            previewCamera.clearFlags = CameraClearFlags.SolidColor;
            previewCamera.backgroundColor = new Color(0.93f, 0.80f, 0.70f, 1f);
            previewCamera.orthographic = true;
            previewCamera.orthographicSize = 1.05f;
            previewCamera.nearClipPlane = 0.1f;
            previewCamera.farClipPlane = 20f;
            previewCamera.allowHDR = false;

            renderTexture = new RenderTexture(
                SetTileWidth, SetTileHeight, 24, RenderTextureFormat.ARGB32)
            { hideFlags = HideFlags.HideAndDontSave, antiAliasing = 4 };
            renderTexture.Create();
            previewCamera.targetTexture = renderTexture;

            int sheetWidth = SetTileWidth;
            int sheetHeight = tiles.Length * SetTileHeight;
            Color32[] sheetPixels = new Color32[sheetWidth * sheetHeight];

            Color shadowTint = new Color(0.48f, 0.29f, 0.22f);
            for (int tileIndex = 0; tileIndex < tiles.Length; tileIndex++)
            {
                string upperName = tiles[tileIndex][0];
                string lowerName = tiles[tileIndex][1];
                string linerName = tiles[tileIndex][2];

                // "ext_" 마스크는 눈꼬리 밖 연장 캔버스가 있는 확장 밴드에 입힌다(§16b).
                bool isExt = !string.IsNullOrEmpty(upperName) && upperName.StartsWith("ext_");
                upperStrip.SetActive(!string.IsNullOrEmpty(upperName) && !isExt);
                extStrip.SetActive(isExt);
                lowerStrip.SetActive(!string.IsNullOrEmpty(lowerName));
                linerStrip.SetActive(!string.IsNullOrEmpty(linerName));

                if (!string.IsNullOrEmpty(upperName))
                {
                    Texture2D upperTex = CreateTintedCoverage(
                        Path.Combine(maskDirectory, upperName + ".png"), shadowTint, 0.85f);
                    ownedTextures.Add(upperTex);
                    upperMat.mainTexture = upperTex;
                }
                if (!string.IsNullOrEmpty(lowerName))
                {
                    Texture2D lowerTex = CreateTintedCoverage(
                        Path.Combine(maskDirectory, lowerName + ".png"), shadowTint, 0.8f);
                    ownedTextures.Add(lowerTex);
                    lowerMat.mainTexture = lowerTex;
                }
                if (!string.IsNullOrEmpty(linerName))
                {
                    Texture2D linerTex = LoadTextureRaw(
                        Path.Combine(artDirectory, linerName + ".png"));
                    ownedTextures.Add(linerTex);
                    linerMat.mainTexture = linerTex;
                }
                previewCamera.Render();

                RenderTexture.active = renderTexture;
                Texture2D tile = new Texture2D(
                    SetTileWidth, SetTileHeight, TextureFormat.RGBA32, false);
                tile.ReadPixels(new Rect(0f, 0f, SetTileWidth, SetTileHeight), 0, 0, false);
                tile.Apply(false, false);
                int destinationY = (tiles.Length - 1 - tileIndex) * SetTileHeight;
                Color32[] tilePixels = tile.GetPixels32();
                for (int row = 0; row < SetTileHeight; row++)
                {
                    System.Array.Copy(
                        tilePixels, row * SetTileWidth,
                        sheetPixels, (destinationY + row) * sheetWidth, SetTileWidth);
                }
                Object.DestroyImmediate(tile);
            }

            sheet = new Texture2D(sheetWidth, sheetHeight, TextureFormat.RGBA32, false);
            sheet.SetPixels32(sheetPixels);
            sheet.Apply(false, false);
            File.WriteAllBytes(outputPath, sheet.EncodeToPNG());
            Debug.Log("[AURA] tile_sheet_saved path=" + outputPath);
            return outputPath;
        }
        catch (System.Exception exception)
        {
            Debug.LogException(exception);
            return null;
        }
        finally
        {
            RenderTexture.active = previousActive;
            if (previewRoot != null)
            {
                // RT 해제 전에 카메라 참조를 끊어야 "Releasing render texture that is
                // set as Camera.targetTexture!" 에러가 안 난다.
                Camera cleanupCamera = previewRoot.GetComponentInChildren<Camera>();
                if (cleanupCamera != null)
                {
                    cleanupCamera.targetTexture = null;
                }
            }
            if (renderTexture != null)
            {
                renderTexture.Release();
                Object.DestroyImmediate(renderTexture);
            }
            if (sheet != null)
            {
                Object.DestroyImmediate(sheet);
            }
            foreach (Texture2D texture in ownedTextures)
            {
                Object.DestroyImmediate(texture);
            }
            foreach (Material ownedMaterial in ownedMaterials)
            {
                Object.DestroyImmediate(ownedMaterial);
            }
            foreach (Mesh ownedMesh in ownedMeshes)
            {
                Object.DestroyImmediate(ownedMesh);
            }
            if (previewRoot != null)
            {
                Object.DestroyImmediate(previewRoot);
            }
        }
    }

    private static GameObject AddStrip(
        Transform parent,
        Mesh mesh,
        Material material,
        System.Collections.Generic.List<Mesh> ownedMeshes)
    {
        ownedMeshes.Add(mesh);
        GameObject strip = new GameObject(mesh.name)
        { hideFlags = HideFlags.HideAndDontSave };
        strip.transform.SetParent(parent, false);
        strip.AddComponent<MeshFilter>().sharedMesh = mesh;
        strip.AddComponent<MeshRenderer>().sharedMaterial = material;
        return strip;
    }

    // 확장 밴드(§16b) — 눈꺼풀 아크(u 0..1) + 눈꼬리 밖 연장(u 1..2)을 하나의 스트립으로.
    // uv.x = u/2 (와이드 마스크 텍스처 좌표와 동일). 연장부는 바깥으로 완만히 상승하며
    // 높이가 줄어든다(실제 IrisRenderer 연장 컬럼의 근사).
    private static Mesh BuildExtendedBandMesh()
    {
        const int Columns = 41;
        Vector3[] vertices = new Vector3[Columns * 2];
        Vector2[] uv = new Vector2[vertices.Length];
        int[] triangles = new int[(Columns - 1) * 6];

        for (int column = 0; column < Columns; column++)
        {
            float anatomicalU = column / (float)(Columns - 1) * 2f;
            float x;
            float lashY;
            float bandHeight;
            if (anatomicalU <= 1f)
            {
                x = Mathf.Lerp(-1f, 1f, anatomicalU);
                lashY = 0.5f * (1f - x * x);
                float taper = Mathf.Pow(
                    Mathf.Max(0f, Mathf.Sin(Mathf.PI * anatomicalU)), 0.72f);
                // 꼬리(u 0.8~1)에서 taper가 닫히는 대신 연장 높이(0.34)로 이어붙인다.
                bandHeight = Mathf.Max(0.48f * taper,
                    0.34f * Mathf.InverseLerp(0.75f, 1f, anatomicalU));
            }
            else
            {
                float ext = anatomicalU - 1f;
                x = 1f + 0.5f * ext;
                lashY = 0.06f * ext;
                bandHeight = 0.34f * (1f - ext / 1.05f);
            }
            int lowerIndex = column * 2;
            int upperIndex = lowerIndex + 1;
            vertices[lowerIndex] = new Vector3(x, lashY, 0f);
            vertices[upperIndex] = new Vector3(x, lashY + Mathf.Max(bandHeight, 0.001f), 0f);
            uv[lowerIndex] = new Vector2(anatomicalU * 0.5f, 0f);
            uv[upperIndex] = new Vector2(anatomicalU * 0.5f, 1f);
        }
        FillStripTriangles(triangles);

        Mesh mesh = new Mesh
        {
            name = "Synthetic Extended Band",
            hideFlags = HideFlags.HideAndDontSave,
            vertices = vertices,
            uv = uv,
            triangles = triangles,
        };
        mesh.RecalculateBounds();
        return mesh;
    }

    // 아래 섀도 밴드 — 하안검 곡선에서 볼 방향으로 내려가는 스트립.
    // uv: lash 엣지=v1(PNG 상단=lash 계약), 아래 끝=v0. 정점 0=아래, 1=lash로 두어
    // 위 밴드와 같은 와인딩(컬링 방향)을 유지한다.
    private static Mesh BuildLowerBandMesh()
    {
        Vector3[] vertices = new Vector3[BandColumnCount * 2];
        Vector2[] uv = new Vector2[vertices.Length];
        int[] triangles = new int[(BandColumnCount - 1) * 6];

        for (int column = 0; column < BandColumnCount; column++)
        {
            float u = column / (float)(BandColumnCount - 1);
            float x = Mathf.Lerp(-1f, 1f, u);
            float lashY = -0.22f * (1f - x * x);
            // Max(0,·): float sin(π) 음수 잔차로 인한 NaN 방지(위 밴드와 동일).
            float taper = Mathf.Pow(Mathf.Max(0f, Mathf.Sin(Mathf.PI * u)), 0.72f);
            float depth = 0.42f * taper;
            int bottomIndex = column * 2;
            int lashIndex = bottomIndex + 1;
            vertices[bottomIndex] = new Vector3(x, lashY - depth, 0f);
            vertices[lashIndex] = new Vector3(x, lashY, 0f);
            uv[bottomIndex] = new Vector2(u, 0f);
            uv[lashIndex] = new Vector2(u, 1f);
        }
        FillStripTriangles(triangles);

        Mesh mesh = new Mesh
        {
            name = "Synthetic Lower Band",
            hideFlags = HideFlags.HideAndDontSave,
            vertices = vertices,
            uv = uv,
            triangles = triangles,
        };
        mesh.RecalculateBounds();
        return mesh;
    }

    // 라이너 밴드 — 상안검 lash 라인을 따르다 u≈0.76부터 눈꼬리 밖 윙 캔버스로 연장.
    // 라이너 아트는 알파 라인이라 밴드 높이 대부분은 투명으로 남는다.
    private static Mesh BuildLinerBandMesh()
    {
        const int Columns = 33;
        const float EyePortion = 0.76f;
        Vector3[] vertices = new Vector3[Columns * 2];
        Vector2[] uv = new Vector2[vertices.Length];
        int[] triangles = new int[(Columns - 1) * 6];

        for (int column = 0; column < Columns; column++)
        {
            float u = column / (float)(Columns - 1);
            float x;
            float lashY;
            if (u <= EyePortion)
            {
                x = Mathf.Lerp(-1f, 1f, u / EyePortion);
                lashY = 0.5f * (1f - x * x);
            }
            else
            {
                float wing = (u - EyePortion) / (1f - EyePortion);
                x = 1f + 0.42f * wing;
                lashY = 0.16f * wing; // 윙 캔버스가 완만히 상승 — 라인 모양은 아트가 결정
            }
            int lashIndex = column * 2;
            int topIndex = lashIndex + 1;
            vertices[lashIndex] = new Vector3(x, lashY - 0.02f, -0.05f);
            vertices[topIndex] = new Vector3(x, lashY + 0.5f, -0.05f);
            uv[lashIndex] = new Vector2(u, 0f);
            uv[topIndex] = new Vector2(u, 1f);
        }
        FillStripTriangles(triangles);

        Mesh mesh = new Mesh
        {
            name = "Synthetic Liner Band",
            hideFlags = HideFlags.HideAndDontSave,
            vertices = vertices,
            uv = uv,
            triangles = triangles,
        };
        mesh.RecalculateBounds();
        return mesh;
    }

    private static Mesh BuildContourLineMesh(System.Func<float, float> curve, float halfWidth)
    {
        const int Columns = 40;
        Vector3[] vertices = new Vector3[Columns * 2];
        int[] triangles = new int[(Columns - 1) * 6];
        for (int column = 0; column < Columns; column++)
        {
            float x = Mathf.Lerp(-1f, 1f, column / (float)(Columns - 1));
            float y = curve(x);
            vertices[column * 2] = new Vector3(x, y - halfWidth, -0.1f);
            vertices[column * 2 + 1] = new Vector3(x, y + halfWidth, -0.1f);
        }
        FillStripTriangles(triangles);
        Mesh mesh = new Mesh
        {
            name = "Contour Line",
            hideFlags = HideFlags.HideAndDontSave,
            vertices = vertices,
            triangles = triangles,
        };
        mesh.RecalculateBounds();
        return mesh;
    }

    private static void FillStripTriangles(int[] triangles)
    {
        int quadCount = triangles.Length / 6;
        for (int column = 0; column < quadCount; column++)
        {
            int triangleOffset = column * 6;
            int lowerLeft = column * 2;
            int upperLeft = lowerLeft + 1;
            int lowerRight = lowerLeft + 2;
            int upperRight = lowerLeft + 3;
            triangles[triangleOffset] = lowerLeft;
            triangles[triangleOffset + 1] = upperLeft;
            triangles[triangleOffset + 2] = lowerRight;
            triangles[triangleOffset + 3] = lowerRight;
            triangles[triangleOffset + 4] = upperLeft;
            triangles[triangleOffset + 5] = upperRight;
        }
    }

    // 흑백 마스크(R=커버리지) → 틴트 RGBA. alphaScale로 프리뷰 농도 조절.
    private static Texture2D CreateTintedCoverage(string maskPath, Color tint, float alphaScale)
    {
        Texture2D source = LoadTextureRaw(maskPath);
        try
        {
            Color32[] sourcePixels = source.GetPixels32();
            Color32[] tinted = new Color32[sourcePixels.Length];
            for (int index = 0; index < sourcePixels.Length; index++)
            {
                tinted[index] = new Color32(
                    (byte)(tint.r * 255f), (byte)(tint.g * 255f), (byte)(tint.b * 255f),
                    (byte)(sourcePixels[index].r * alphaScale));
            }
            // 배치 모드(Metal)에서 SetPixels32+Apply만으로는 GPU 업로드가 누락되어
            // 스트립이 빈 채로 렌더된다(에디터 GUI에선 정상). LoadImage 경로는 배치에서도
            // 확실히 업로드되므로 PNG 왕복으로 우회한다 — 프리뷰 툴이라 비용 무시 가능.
            Texture2D staging = new Texture2D(
                source.width, source.height, TextureFormat.RGBA32, false, true);
            staging.SetPixels32(tinted);
            byte[] encoded = staging.EncodeToPNG();
            Object.DestroyImmediate(staging);

            Texture2D result = new Texture2D(2, 2, TextureFormat.RGBA32, false, true)
            { hideFlags = HideFlags.HideAndDontSave };
            if (!result.LoadImage(encoded, false))
            {
                Object.DestroyImmediate(result);
                throw new IOException("Tinted mask re-decode failed: " + maskPath);
            }
            result.filterMode = FilterMode.Bilinear;
            result.wrapMode = TextureWrapMode.Clamp;
            return result;
        }
        finally
        {
            Object.DestroyImmediate(source);
        }
    }

    private static Texture2D LoadTextureRaw(string path)
    {
        Texture2D texture = new Texture2D(2, 2, TextureFormat.RGBA32, false, true)
        {
            hideFlags = HideFlags.HideAndDontSave,
            filterMode = FilterMode.Bilinear,
            wrapMode = TextureWrapMode.Clamp,
        };
        if (!texture.LoadImage(File.ReadAllBytes(path), false))
        {
            Object.DestroyImmediate(texture);
            throw new IOException("Could not decode PNG: " + path);
        }
        return texture;
    }

    private static void CopyTile(
        Color32[] tilePixels,
        Color32[] sheetPixels,
        int sheetWidth,
        int destinationX,
        int destinationY)
    {
        for (int row = 0; row < TileHeight; row++)
        {
            int sourceOffset = row * TileWidth;
            int destinationOffset =
                (destinationY + row) * sheetWidth + destinationX;
            System.Array.Copy(
                tilePixels,
                sourceOffset,
                sheetPixels,
                destinationOffset,
                TileWidth);
        }
    }
}
#endif
