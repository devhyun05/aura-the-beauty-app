using System;
using System.Globalization;
using UnityEngine;

public sealed class MakeupRegionDebugControls : MonoBehaviour
{
    [SerializeField] private RNBridge rnBridge;

    private const string LipRegion = "lip";
    private const string CheekRegion = "cheek";
    private const string BrowRegion = "brow";

    private readonly RegionDebugState lipState = new RegionDebugState(
        LipRegion,
        "gradient_lip",
        "lip-drawn-style-atlas-v1",
        0.95f,
        1.0f,
        0.72f,
        0.24f,
        new[]
        {
            new PaletteColor("Rose", "#E23866"),
            new PaletteColor("Coral", "#F25A4F"),
            new PaletteColor("Cherry", "#C9184A"),
            new PaletteColor("Nude", "#B86F61")
        });

    private readonly RegionDebugState cheekState = new RegionDebugState(
        CheekRegion,
        "soft_blush",
        "cheek-daily-mask-v1",
        0.78f,
        1.0f,
        0.72f,
        0.24f,
        new[]
        {
            new PaletteColor("Peach", "#F06A5F"),
            new PaletteColor("Pink", "#F28AA7"),
            new PaletteColor("Coral", "#F18A6C"),
            new PaletteColor("Beige", "#C9826A")
        });

    private readonly RegionDebugState browState = new RegionDebugState(
        BrowRegion,
        "natural_brow",
        "brow-png-dailyflat-sharp-v1",
        0.92f,
        1.0f,
        0.82f,
        0.34f,
        new[]
        {
            new PaletteColor("Dark", "#2B1D18"),
            new PaletteColor("Brown", "#4A342B"),
            new PaletteColor("Soft", "#6B4A3B"),
            new PaletteColor("Ash", "#3B3631")
        });

    private GUIStyle buttonStyle;
    private GUIStyle panelStyle;
    private GUIStyle titleStyle;
    private GUIStyle labelStyle;
    private GUIStyle swatchStyle;

    private string selectedRegion = LipRegion;
    private string lastAppliedRegion = "none";
    private long lastAppliedAtMs;

    private void Awake()
    {
        ResolveBridge();
    }

    private void OnGUI()
    {
        if (!ShouldShowDebugControls())
        {
            return;
        }

        EnsureStyles();

        float scale = Mathf.Max(1.0f, Mathf.Min(Screen.width, Screen.height) / 390.0f);
        float margin = 16.0f * scale;
        float panelWidth = Mathf.Min(Screen.width - margin * 2.0f, 560.0f * scale);
        float buttonHeight = 48.0f * scale;
        float swatchHeight = 44.0f * scale;
        float gap = 8.0f * scale;
        float panelHeight = 510.0f * scale;
        Rect panelRect = new Rect(margin, Screen.height - panelHeight - margin, panelWidth, panelHeight);

        GUI.Box(panelRect, GUIContent.none, panelStyle);

        GUILayout.BeginArea(new Rect(
            panelRect.x + margin,
            panelRect.y + margin,
            panelRect.width - margin * 2.0f,
            panelRect.height - margin * 2.0f));

        GUILayout.Label("Makeup AR Detail Test", titleStyle);
        GUILayout.Space(gap);

        DrawRegionTabs(buttonHeight, gap);
        GUILayout.Space(gap);

        RegionDebugState selectedState = GetState(selectedRegion);
        DrawPalette(selectedState, swatchHeight, gap);
        GUILayout.Space(gap);

        selectedState.Opacity = DrawSlider("Opacity", selectedState.Opacity, 0.15f, 1.0f, scale);
        selectedState.Intensity = DrawSlider("Intensity", selectedState.Intensity, 0.1f, 1.0f, scale);
        selectedState.Coverage = DrawSlider("Coverage", selectedState.Coverage, 0.2f, 1.0f, scale);
        selectedState.Feather = DrawSlider("Feather", selectedState.Feather, 0.05f, 0.55f, scale);

        GUILayout.Space(gap);
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Apply Selected", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ApplyRegion(selectedState.Region);
        }

        GUILayout.Space(gap);
        if (GUILayout.Button("Apply All", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ApplyAllRegions();
        }
        GUILayout.EndHorizontal();

        GUILayout.Space(gap);
        GUILayout.BeginHorizontal();
        if (GUILayout.Button("Clear", buttonStyle, GUILayout.Height(buttonHeight)))
        {
            ClearRegions();
        }

        GUILayout.Space(gap);
        GUILayout.Label(
            "Last: " + lastAppliedRegion + " @ " + lastAppliedAtMs.ToString(CultureInfo.InvariantCulture),
            labelStyle,
            GUILayout.Height(buttonHeight));
        GUILayout.EndHorizontal();

        GUILayout.EndArea();
    }

    private void DrawRegionTabs(float buttonHeight, float gap)
    {
        GUILayout.BeginHorizontal();
        DrawRegionTab(LipRegion, "Lip", buttonHeight);
        GUILayout.Space(gap);
        DrawRegionTab(CheekRegion, "Cheek", buttonHeight);
        GUILayout.Space(gap);
        DrawRegionTab(BrowRegion, "Brow", buttonHeight);
        GUILayout.EndHorizontal();
    }

    private void DrawRegionTab(string region, string label, float buttonHeight)
    {
        Color previous = GUI.backgroundColor;
        GUI.backgroundColor = selectedRegion == region ? new Color(0.65f, 0.85f, 1.0f, 1.0f) : Color.white;
        if (GUILayout.Button(label, buttonStyle, GUILayout.Height(buttonHeight)))
        {
            selectedRegion = region;
        }

        GUI.backgroundColor = previous;
    }

    private void DrawPalette(RegionDebugState state, float swatchHeight, float gap)
    {
        GUILayout.Label("Color: " + state.SelectedColor.Label + " " + state.SelectedColor.Hex, labelStyle);
        GUILayout.Space(gap * 0.5f);
        GUILayout.BeginHorizontal();
        for (int index = 0; index < state.Palette.Length; index++)
        {
            PaletteColor swatch = state.Palette[index];
            Color previous = GUI.backgroundColor;
            GUI.backgroundColor = swatch.GuiColor;
            string label = index == state.SelectedColorIndex ? "* " + swatch.Label : swatch.Label;
            if (GUILayout.Button(label, swatchStyle, GUILayout.Height(swatchHeight)))
            {
                state.SelectedColorIndex = index;
                ApplyRegion(state.Region);
            }

            GUI.backgroundColor = previous;
            if (index + 1 < state.Palette.Length)
            {
                GUILayout.Space(gap);
            }
        }

        GUILayout.EndHorizontal();
    }

    private float DrawSlider(string label, float value, float min, float max, float scale)
    {
        GUILayout.BeginHorizontal();
        GUILayout.Label(
            label + ": " + value.ToString("0.00", CultureInfo.InvariantCulture),
            labelStyle,
            GUILayout.Width(136.0f * scale));
        float updated = GUILayout.HorizontalSlider(value, min, max, GUILayout.Height(34.0f * scale));
        GUILayout.EndHorizontal();
        return Mathf.Clamp(updated, min, max);
    }

    private void ApplyRegion(string region)
    {
        ApplyRecipe(BuildRecipeJson(region, false));
        Remember(region);
    }

    private void ApplyAllRegions()
    {
        ApplyRecipe(BuildRecipeJson("all", true));
        Remember("all");
    }

    private void ClearRegions()
    {
        ApplyRecipe(BuildClearRecipeJson());
        Remember("clear");
    }

    private void ApplyRecipe(string json)
    {
        ResolveBridge();
        if (rnBridge == null)
        {
            Debug.LogWarning("[debug-controls] RNBridge not found; recipe skipped.");
            return;
        }

        rnBridge.ApplyRecipeJson(json);
    }

    private void ResolveBridge()
    {
        if (rnBridge == null)
        {
            rnBridge = FindFirstObjectByType<RNBridge>();
        }
    }

    private static bool ShouldShowDebugControls()
    {
        return string.Equals(
            Application.identifier,
            "com.makeupar.validation",
            StringComparison.Ordinal);
    }

    private void Remember(string region)
    {
        lastAppliedRegion = region;
        lastAppliedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    private string BuildRecipeJson(string activeRegion, bool enableAll)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return "{"
            + "\"version\":1,"
            + "\"lookId\":\"unity_debug_detail_controls\","
            + "\"recipeBatchId\":\"unity-debug-" + activeRegion + "-" + now.ToString(CultureInfo.InvariantCulture) + "\","
            + "\"sentAtMs\":" + now.ToString(CultureInfo.InvariantCulture) + ","
            + "\"activeRegions\":\"" + BuildActiveRegionSummary(activeRegion, enableAll) + "\","
            + "\"layerCount\":4,"
            + "\"enabledLayerCount\":" + CountEnabledLayers(activeRegion, enableAll).ToString(CultureInfo.InvariantCulture) + ","
            + "\"rendererMode\":\"smooth-region-mask\","
            + "\"layers\":["
            + BuildLayer(lipState, activeRegion == LipRegion || enableAll)
            + ","
            + BuildLayer(cheekState, activeRegion == CheekRegion || enableAll)
            + ","
            + BuildEyeLayer(false)
            + ","
            + BuildLayer(browState, activeRegion == BrowRegion || enableAll)
            + "]}";
    }

    private string BuildClearRecipeJson()
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return "{"
            + "\"version\":1,"
            + "\"lookId\":\"unity_debug_detail_controls\","
            + "\"recipeBatchId\":\"unity-debug-clear-" + now.ToString(CultureInfo.InvariantCulture) + "\","
            + "\"sentAtMs\":" + now.ToString(CultureInfo.InvariantCulture) + ","
            + "\"activeRegions\":\"none\","
            + "\"layerCount\":4,"
            + "\"enabledLayerCount\":0,"
            + "\"rendererMode\":\"smooth-region-mask\","
            + "\"layers\":["
            + BuildLayer(lipState, false)
            + ","
            + BuildLayer(cheekState, false)
            + ","
            + BuildEyeLayer(false)
            + ","
            + BuildLayer(browState, false)
            + "]}";
    }

    private static string BuildActiveRegionSummary(string activeRegion, bool enableAll)
    {
        if (enableAll)
        {
            return "lip,cheek,brow";
        }

        return string.IsNullOrWhiteSpace(activeRegion) ? "none" : activeRegion;
    }

    private static int CountEnabledLayers(string activeRegion, bool enableAll)
    {
        if (enableAll)
        {
            return 3;
        }

        return activeRegion == LipRegion || activeRegion == CheekRegion || activeRegion == BrowRegion ? 1 : 0;
    }

    private static string BuildLayer(RegionDebugState state, bool enabled)
    {
        return "{"
            + "\"id\":\"debug-" + state.Region + "\","
            + "\"region\":\"" + state.Region + "\","
            + "\"color\":\"" + state.SelectedColor.Hex + "\","
            + "\"opacity\":" + (enabled ? state.Opacity : 0.0f).ToString("0.###", CultureInfo.InvariantCulture) + ","
            + "\"texture\":\"" + state.Texture + "\","
            + "\"textureMode\":\"sample\","
            + "\"blendMode\":\"normal\","
            + "\"rendererMode\":\"smooth-region-mask\","
            + "\"enabled\":" + enabled.ToString().ToLowerInvariant() + ","
            + "\"intensity\":" + (enabled ? state.Intensity : 0.0f).ToString("0.###", CultureInfo.InvariantCulture) + ","
            + "\"coverage\":" + state.Coverage.ToString("0.###", CultureInfo.InvariantCulture) + ","
            + "\"feather\":" + state.Feather.ToString("0.###", CultureInfo.InvariantCulture) + ","
            + "\"maskTextureId\":\"" + state.MaskTextureId + "\""
            + "}";
    }

    private static string BuildEyeLayer(bool enabled)
    {
        return "{"
            + "\"id\":\"debug-eye\","
            + "\"region\":\"eye\","
            + "\"color\":\"#A46AD9\","
            + "\"opacity\":" + (enabled ? "0.6" : "0") + ","
            + "\"texture\":\"shimmer_eye\","
            + "\"textureMode\":\"sample\","
            + "\"blendMode\":\"normal\","
            + "\"rendererMode\":\"smooth-region-mask\","
            + "\"enabled\":" + enabled.ToString().ToLowerInvariant() + ","
            + "\"intensity\":" + (enabled ? "1" : "0") + ","
            + "\"coverage\":0.4,"
            + "\"feather\":0.24,"
            + "\"maskTextureId\":\"eye-smooth-mask-v1\""
            + "}";
    }

    private RegionDebugState GetState(string region)
    {
        switch (region)
        {
            case CheekRegion:
                return cheekState;
            case BrowRegion:
                return browState;
            default:
                return lipState;
        }
    }

    private void EnsureStyles()
    {
        if (buttonStyle != null)
        {
            return;
        }

        buttonStyle = new GUIStyle(GUI.skin.button)
        {
            alignment = TextAnchor.MiddleCenter,
            fontSize = 22,
            fontStyle = FontStyle.Bold
        };
        buttonStyle.normal.textColor = Color.white;
        buttonStyle.active.textColor = Color.white;
        buttonStyle.hover.textColor = Color.white;

        swatchStyle = new GUIStyle(buttonStyle)
        {
            fontSize = 18
        };

        panelStyle = new GUIStyle(GUI.skin.box);
        panelStyle.normal.background = MakeTexture(new Color(0.03f, 0.03f, 0.04f, 0.82f));

        titleStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleLeft,
            fontSize = 22,
            fontStyle = FontStyle.Bold
        };
        titleStyle.normal.textColor = Color.white;

        labelStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleLeft,
            fontSize = 18,
            fontStyle = FontStyle.Bold
        };
        labelStyle.normal.textColor = Color.white;
    }

    private static Texture2D MakeTexture(Color color)
    {
        Texture2D texture = new Texture2D(1, 1);
        texture.SetPixel(0, 0, color);
        texture.Apply();
        return texture;
    }

    private sealed class RegionDebugState
    {
        public readonly string Region;
        public readonly string Texture;
        public readonly string MaskTextureId;
        public readonly PaletteColor[] Palette;
        public int SelectedColorIndex;
        public float Opacity;
        public float Intensity;
        public float Coverage;
        public float Feather;

        public RegionDebugState(
            string region,
            string texture,
            string maskTextureId,
            float opacity,
            float intensity,
            float coverage,
            float feather,
            PaletteColor[] palette)
        {
            Region = region;
            Texture = texture;
            MaskTextureId = maskTextureId;
            Opacity = opacity;
            Intensity = intensity;
            Coverage = coverage;
            Feather = feather;
            Palette = palette;
            SelectedColorIndex = 0;
        }

        public PaletteColor SelectedColor
        {
            get
            {
                int index = Mathf.Clamp(SelectedColorIndex, 0, Palette.Length - 1);
                return Palette[index];
            }
        }
    }

    private struct PaletteColor
    {
        public readonly string Label;
        public readonly string Hex;
        public readonly Color GuiColor;

        public PaletteColor(string label, string hex)
        {
            Label = label;
            Hex = hex;
            if (!ColorUtility.TryParseHtmlString(hex, out GuiColor))
            {
                GuiColor = Color.white;
            }
        }
    }
}
