Shader "MakeupAR/SmoothRegionMask"
{
    Properties
    {
        _MaskTex ("Mask Texture", 2D) = "black" {}
        [HideInInspector] _GlossMaskTex ("Gloss Highlight Mask", 2D) = "black" {}
        _RegionColor ("Region Color", Color) = (0.85, 0.29, 0.45, 1)
        _SecondaryColor ("Secondary Color", Color) = (0.95, 0.61, 0.67, 1)
        _Opacity ("Opacity", Range(0, 1)) = 0.65
        _Threshold ("Threshold", Range(0, 1)) = 0.04
        _Feather ("Feather", Range(0, 1)) = 0.5
        _VisibilityAlpha ("Visibility Alpha", Range(0, 1)) = 1
        _Coverage ("Coverage", Range(0, 1)) = 0.62
        _MaskOffset ("Mask UV Offset", Vector) = (0, 0, 0, 0)
        _MaskSpreadX ("Mask Spread X", Float) = 0
        _Roughness ("Roughness", Range(0, 1)) = 0.88
        _Specular ("Specular", Range(0, 1)) = 0.04
        _SpecularPower ("Specular Power", Range(1, 64)) = 8
        _GlossBoost ("Gloss Boost", Range(0, 1)) = 0
        _GlossColor ("Gloss Color", Color) = (1.0, 0.78, 0.84, 1)
        _GlossSharpness ("Gloss Sharpness", Range(0, 1)) = 0.72
        _GlossHaloIntensity ("Gloss Halo Intensity", Range(0, 1)) = 0.07
        _GradientAmount ("Gradient Amount", Range(0, 1)) = 0
        _DetailAmount ("Detail Amount", Range(0, 1)) = 0
        [HideInInspector] _BrowGeneratedMode ("Generated Brow Mode", Float) = 0
        [HideInInspector] _BrowCleanupStrength ("Brow Cleanup Strength", Range(0, 1)) = 0
        [HideInInspector] _BrowNeutralizeStrength ("Brow Neutralize Strength", Range(0, 1)) = 0
        _PreserveDetail ("Preserve Detail", Range(0, 1)) = 1
        _DensityPower ("Density Power", Range(0, 1)) = 0.72
        _EdgeSoftness ("Edge Softness", Range(0, 1)) = 0.86
        _SkinPreserve ("Skin Preserve", Range(0, 1)) = 0.78
        _SaturationBoost ("Saturation Boost", Range(0, 1)) = 0.24
        _Warmth ("Warmth", Range(0, 1)) = 0.22
        _BlushIntensity ("Blush Intensity", Range(0, 1)) = 0.5
        _LipStyleMode ("Lip Style Mode", Float) = -1
        [HideInInspector] _CheekBlushMode ("Cheek Blush Mode", Float) = 0
        [HideInInspector] _CheekUvTransform ("Cheek UV Transform", Vector) = (1, 1, 0, 0)
        [HideInInspector] _CheekPartUvTransform ("Cheek Part UV Transform", Vector) = (1, 1, 0, 0)
        [HideInInspector] _CheekPartBlend ("Cheek Part Blend", Float) = 0
        [HideInInspector] _CheekDensityGain ("Cheek Density Gain", Float) = 1
        [HideInInspector] _CheekCenterGain ("Cheek Center Gain", Float) = 0
        [HideInInspector] _PigmentMultiply ("Pigment Multiply", Float) = 0
        [HideInInspector] _UseScreenSpaceMask ("Use Screen Space Mask", Float) = 0
        [HideInInspector] _DebugMaskMode ("Debug Mask Mode", Float) = 0
        [HideInInspector] _SrcBlend ("Source Blend", Float) = 5
        [HideInInspector] _DstBlend ("Destination Blend", Float) = 10
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent"
            "RenderType" = "Transparent"
            "IgnoreProjector" = "True"
        }

        // Capture the live camera feed (rendered before this transparent overlay)
        // so the generated-brow pass can neutralize the user's real eyebrow by
        // painting surrounding skin over it.
        GrabPass { "_BrowBackgroundTexture" }

        Pass
        {
            Name "PigmentMultiplyOrAlphaFallback"
            Tags { "LightMode" = "Always" }

            Blend [_SrcBlend] [_DstBlend]
            ZWrite Off
            ZTest Always
            Cull Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "UnityCG.cginc"

            sampler2D _MaskTex;
            float4 _MaskTex_TexelSize;
            float4 _RegionColor;
            float4 _SecondaryColor;
            float4 _GlossColor;
            float _Opacity;
            float _Threshold;
            float _Feather;
            float _VisibilityAlpha;
            float _Coverage;
            float4 _MaskOffset;
            float _MaskSpreadX;
            float _Roughness;
            float _Specular;
            float _SpecularPower;
            float _GlossBoost;
            float _GradientAmount;
            float _DetailAmount;
            float _BrowGeneratedMode;
            float _BrowCleanupStrength;
            float _BrowNeutralizeStrength;
            sampler2D _BrowBackgroundTexture;
            float4 _BrowBackgroundTexture_TexelSize;
            float _PreserveDetail;
            float _DensityPower;
            float _EdgeSoftness;
            float _SkinPreserve;
            float _SaturationBoost;
            float _Warmth;
            float _BlushIntensity;
            float _LipStyleMode;
            float _CheekBlushMode;
            float4 _CheekUvTransform;
            float4 _CheekPartUvTransform;
            float _CheekPartBlend;
            float _CheekDensityGain;
            float _CheekCenterGain;
            float _PigmentMultiply;
            float _UseScreenSpaceMask;
            float _DebugMaskMode;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 clipPos : TEXCOORD1;
                float4 grabPos : TEXCOORD2;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.clipPos = output.vertex;
                output.grabPos = ComputeGrabScreenPos(output.vertex);
                output.uv = input.uv;
                return output;
            }

            float FeatherTexelRadius(float feather)
            {
                return lerp(1.25, 5.5, saturate(feather * 2.35));
            }

            float4 SampleMaskSoft(float2 uv)
            {
                float2 texel = _MaskTex_TexelSize.xy;
                float radius = FeatherTexelRadius(_Feather);
                float2 nearTexel = texel * radius;
                float2 farTexel = nearTexel * 1.85;
                float4 center = tex2D(_MaskTex, uv) * 0.24;
                float4 nearAxis = (
                    tex2D(_MaskTex, uv + float2(nearTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv - float2(nearTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv + float2(0.0, nearTexel.y)) +
                    tex2D(_MaskTex, uv - float2(0.0, nearTexel.y))) * 0.085;
                float4 nearDiagonal = (
                    tex2D(_MaskTex, uv + nearTexel) +
                    tex2D(_MaskTex, uv - nearTexel) +
                    tex2D(_MaskTex, uv + float2(nearTexel.x, -nearTexel.y)) +
                    tex2D(_MaskTex, uv + float2(-nearTexel.x, nearTexel.y))) * 0.045;
                float4 farAxis = (
                    tex2D(_MaskTex, uv + float2(farTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv - float2(farTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv + float2(0.0, farTexel.y)) +
                    tex2D(_MaskTex, uv - float2(0.0, farTexel.y))) * 0.06;
                return center + nearAxis + nearDiagonal + farAxis;
            }

            float GradientDensityBlur(float2 uv)
            {
                float2 texel = _MaskTex_TexelSize.xy;
                float radius = FeatherTexelRadius(_Feather) * 2.25;
                float2 nearTexel = texel * radius;
                float2 farTexel = nearTexel * 1.75;
                float center = tex2D(_MaskTex, uv).b * 0.16;
                float nearAxis = (
                    tex2D(_MaskTex, uv + float2(nearTexel.x, 0.0)).b +
                    tex2D(_MaskTex, uv - float2(nearTexel.x, 0.0)).b +
                    tex2D(_MaskTex, uv + float2(0.0, nearTexel.y)).b +
                    tex2D(_MaskTex, uv - float2(0.0, nearTexel.y)).b) * 0.075;
                float nearDiagonal = (
                    tex2D(_MaskTex, uv + nearTexel).b +
                    tex2D(_MaskTex, uv - nearTexel).b +
                    tex2D(_MaskTex, uv + float2(nearTexel.x, -nearTexel.y)).b +
                    tex2D(_MaskTex, uv + float2(-nearTexel.x, nearTexel.y)).b) * 0.045;
                float farAxis = (
                    tex2D(_MaskTex, uv + float2(farTexel.x, 0.0)).b +
                    tex2D(_MaskTex, uv - float2(farTexel.x, 0.0)).b +
                    tex2D(_MaskTex, uv + float2(0.0, farTexel.y)).b +
                    tex2D(_MaskTex, uv - float2(0.0, farTexel.y)).b) * 0.09;
                return saturate(center + nearAxis + nearDiagonal + farAxis);
            }

            float CheekSourceGrayStrength(float3 sourceRgb)
            {
                float luminance = dot(sourceRgb, float3(0.2126, 0.7152, 0.0722));
                return saturate((0.965 - luminance) / 0.412);
            }

            float CheekSourceGrayBlur(float2 uv)
            {
                float2 texel = _MaskTex_TexelSize.xy;
                float radius = FeatherTexelRadius(_Feather) * 1.55;
                float2 nearTexel = texel * radius;
                float center = CheekSourceGrayStrength(tex2D(_MaskTex, uv).rgb) * 0.34;
                float nearAxis = (
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv + float2(nearTexel.x, 0.0)).rgb) +
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv - float2(nearTexel.x, 0.0)).rgb) +
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv + float2(0.0, nearTexel.y)).rgb) +
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv - float2(0.0, nearTexel.y)).rgb)) * 0.115;
                float nearDiagonal = (
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv + nearTexel).rgb) +
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv - nearTexel).rgb) +
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv + float2(nearTexel.x, -nearTexel.y)).rgb) +
                    CheekSourceGrayStrength(tex2D(_MaskTex, uv + float2(-nearTexel.x, nearTexel.y)).rgb)) * 0.05;
                return saturate(center + nearAxis + nearDiagonal);
            }

            float SoftMaskAlpha(float value, float threshold, float feather)
            {
                float soft = max(feather, 0.00001);
                return smoothstep(saturate(threshold - soft * 0.46), saturate(threshold + soft), value);
            }

            float CoreMaskAlpha(float value, float threshold, float feather)
            {
                float soft = max(feather, 0.00001);
                return smoothstep(saturate(threshold + soft * 0.18), saturate(threshold + soft * 0.88), value);
            }

            float LipCenterDensity(float2 uv, float maskAlpha)
            {
                float2 lipUv = uv - float2(0.5, 0.5);
                float horizontal = 1.0 - smoothstep(0.05, 0.42, abs(lipUv.x));
                float mouthProximity = 1.0 - smoothstep(0.02, 0.18, abs(lipUv.y));
                float lowerCenter = 1.0 - smoothstep(0.025, 0.30, distance(lipUv, float2(0.0, -0.055)));
                return saturate(maskAlpha * max(horizontal * mouthProximity, lowerCenter * 0.68));
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float2 maskUv = input.uv;
                if (_UseScreenSpaceMask > 0.5)
                {
                    float2 ndc = input.clipPos.xy / max(input.clipPos.w, 0.00001);
                    maskUv = saturate(ndc * 0.5 + 0.5);
                }
                maskUv.x = saturate(0.5 + (maskUv.x - 0.5) / max(1.0 + _MaskSpreadX, 0.001));
                maskUv.y = saturate(maskUv.y - _MaskOffset.y);

                float4 mask = tex2D(_MaskTex, maskUv);
                float4 softMask = SampleMaskSoft(maskUv);
                float fullSoft = SoftMaskAlpha(softMask.r, _Threshold, _Feather);
                float fullCore = CoreMaskAlpha(mask.r, _Threshold, _Feather);
                float overlineSoft = SoftMaskAlpha(softMask.g, _Threshold, _Feather);
                float gradientMask = SoftMaskAlpha(max(softMask.b, mask.b), _Threshold, _Feather);
                float rawMask = saturate(mask.r);
                float edgeBand = saturate(fullSoft - fullCore);
                float centerDensity = LipCenterDensity(maskUv, fullSoft);
                float legacyInnerDensity = saturate(max(gradientMask * fullCore, centerDensity * fullCore));
                float coverage = saturate(max(_Coverage, 0.001));
                float baseStain = fullSoft * coverage * 0.54;
                float innerLayer = legacyInnerDensity * coverage * 0.32;
                float edgeLayer = edgeBand * coverage * 0.06;
                float maskStrength = baseStain + innerLayer + edgeLayer;
                float3 pigmentColor = saturate(_RegionColor.rgb);
                float3 alphaColor = pigmentColor;
                float matteReferenceMaskStrength = saturate(baseStain * 1.02 + innerLayer * 0.48 + edgeLayer * 0.20);
                float3 matteReferencePigmentColor = saturate(lerp(
                    pigmentColor,
                    pigmentColor * 0.82,
                    0.28));
                float cheekOuterBand = 0.0;
                float cheekMidBand = 0.0;
                float cheekCoreBand = 0.0;

                if (_CheekBlushMode > 0.5)
                {
                    float2 cheekUvScale = max(abs(_CheekUvTransform.xy), float2(0.001, 0.001));
                    float2 cheekMaskUv = saturate((maskUv - 0.5) / cheekUvScale + 0.5 + _CheekUvTransform.zw);
                    float4 cheekMask = tex2D(_MaskTex, cheekMaskUv);
                    float cheekGrayRaw = CheekSourceGrayStrength(cheekMask.rgb);
                    float cheekGrayBlurred = CheekSourceGrayBlur(cheekMaskUv);
                    float2 cheekCenterUv = cheekMaskUv - float2(0.5, 0.5);
                    float cheekCenterGate = (1.0 - smoothstep(0.025, 0.255, abs(cheekCenterUv.x)))
                        * (1.0 - smoothstep(0.020, 0.245, abs(cheekCenterUv.y)));
                    float cheekBoostGate = cheekCenterGate;
                    float cheekPartBlend = saturate(_CheekPartBlend);
                    if (cheekPartBlend > 0.001)
                    {
                        float2 cheekPartScale = max(abs(_CheekPartUvTransform.xy), float2(0.001, 0.001));
                        float2 cheekPartUv = saturate(
                            (cheekMaskUv - 0.5) / cheekPartScale
                            + 0.5
                            + _CheekPartUvTransform.zw);
                        float4 cheekPartMask = tex2D(_MaskTex, cheekPartUv);
                        float cheekPartGrayRaw = CheekSourceGrayStrength(cheekPartMask.rgb);
                        float cheekPartGrayBlurred = CheekSourceGrayBlur(cheekPartUv);
                        float2 cheekPartCenterUv = cheekPartUv - float2(0.5, 0.5);
                        float cheekPartEllipse = length(float2(
                            cheekPartCenterUv.x / 0.220,
                            cheekPartCenterUv.y / 0.170));
                        float cheekPartGate = 1.0 - smoothstep(0.74, 1.04, cheekPartEllipse);
                        float cheekSideGate = smoothstep(0.19, 0.32, abs(maskUv.x - 0.5));
                        float cheekUpperGate = 1.0 - smoothstep(0.74, 0.91, maskUv.y);
                        float cheekOuterPatchGate = saturate(max(cheekSideGate * cheekUpperGate, 0.18));
                        cheekGrayRaw *= lerp(1.0, cheekOuterPatchGate, cheekPartBlend * 0.58);
                        cheekGrayBlurred *= lerp(1.0, cheekOuterPatchGate, cheekPartBlend * 0.48);
                        float cheekOriginalCenterSuppress = cheekCenterGate * cheekPartBlend;
                        cheekGrayRaw = max(
                            cheekGrayRaw * (1.0 - cheekOriginalCenterSuppress * 0.90),
                            cheekPartGrayRaw * cheekPartGate * cheekPartBlend);
                        cheekGrayBlurred = max(
                            cheekGrayBlurred * (1.0 - cheekOriginalCenterSuppress * 0.76),
                            cheekPartGrayBlurred * cheekPartGate * cheekPartBlend);
                        cheekBoostGate = max(
                            cheekCenterGate * (1.0 - cheekOriginalCenterSuppress * 0.82),
                            cheekPartGate * cheekPartBlend);
                    }
                    float cheekGain = max(_CheekDensityGain, 0.0);
                    float cheekCenterGain = max(_CheekCenterGain, 0.0);
                    cheekGrayRaw = saturate(
                        cheekGrayRaw
                        * cheekGain
                        * (1.0 + cheekCenterGain * cheekBoostGate));
                    cheekGrayBlurred = saturate(
                        cheekGrayBlurred
                        * cheekGain
                        * (1.0 + cheekCenterGain * cheekBoostGate * 0.82));
                    float cheekCoverageSeed = max(cheekGrayRaw, cheekGrayBlurred * 0.94);
                    float cheekFeather = saturate(max(_Feather, 0.68) * lerp(1.02, 1.20, saturate(_EdgeSoftness)));
                    float cheekCoverage = SoftMaskAlpha(cheekCoverageSeed, _Threshold * 0.72, cheekFeather);
                    float cheekCoverageWide = saturate(pow(
                        cheekCoverage,
                        lerp(0.74, 0.56, saturate(_EdgeSoftness))));
                    float cheekDensityRaw = saturate(pow(cheekGrayRaw, 1.16));
                    float cheekDensityBlurred = saturate(pow(cheekGrayBlurred, 1.08));
                    float cheekDensitySoft = saturate(lerp(
                        cheekDensityRaw,
                        cheekDensityBlurred,
                        0.62));
                    float cheekDensity = saturate(max(cheekDensityRaw, cheekDensityBlurred * 0.82));
                    float cheekEdgePresence = smoothstep(0.004, 0.18, cheekCoverageSeed);

                    cheekOuterBand = saturate(cheekCoverageWide * cheekEdgePresence);
                    cheekMidBand = saturate(
                        cheekCoverageWide
                        * pow(
                            saturate(cheekDensitySoft + cheekDensityBlurred * 0.08),
                            lerp(1.55, 1.15, saturate(_DensityPower))));
                    cheekCoreBand = saturate(
                        cheekCoverageWide
                        * pow(
                            saturate(cheekDensity),
                            lerp(2.60, 1.70, saturate(_DensityPower))));
                    cheekMidBand = saturate(pow(
                        cheekMidBand,
                        lerp(1.24, 0.98, saturate(_DensityPower))));
                    cheekCoreBand = saturate(pow(
                        cheekCoreBand,
                        lerp(1.50, 0.98, saturate(_DensityPower))));

                    maskStrength = saturate(
                        cheekOuterBand * 0.18
                        + cheekMidBand * 0.52
                        + cheekCoreBand * 0.80)
                        * coverage;

                    float3 cheekBlushPigment = saturate(lerp(_RegionColor.rgb, _SecondaryColor.rgb, 0.04));
                    pigmentColor = cheekBlushPigment;
                    alphaColor = cheekBlushPigment;
                }
                else if (_LipStyleMode > -0.5)
                {
                    if (_LipStyleMode < 0.5)
                    {
                        maskStrength = matteReferenceMaskStrength;
                        pigmentColor = matteReferencePigmentColor;
                        alphaColor = pigmentColor;
                    }
                    else if (_LipStyleMode < 1.5)
                    {
                        maskStrength = matteReferenceMaskStrength;
                        pigmentColor = matteReferencePigmentColor;
                        alphaColor = pigmentColor;
                    }
                    else if (_LipStyleMode < 2.5)
                    {
                        maskStrength = saturate(baseStain * 0.98 + innerLayer * 0.34 + edgeLayer * 0.30 + overlineSoft * coverage * 0.08);
                        pigmentColor = saturate(lerp(pigmentColor, pigmentColor * 0.88, 0.12));
                        alphaColor = pigmentColor;
                    }
                    else if (_LipStyleMode < 3.5)
                    {
                        rawMask = saturate(mask.b);
                        float gradientMix = saturate(_GradientAmount);
                        float gradientDensityRaw = max(mask.b, softMask.b * 0.82);
                        float gradientDensityBlurred = saturate(GradientDensityBlur(maskUv) * 1.45);
                        float gradientDensitySeed = saturate(lerp(
                            gradientDensityRaw,
                            gradientDensityBlurred,
                            lerp(0.42, 0.56, gradientMix)));
                        float gradientDensityRamp = pow(gradientDensitySeed, lerp(1.02, 0.78, gradientMix));
                        float singleGradientDensity = saturate(fullSoft * gradientDensityRamp);
                        float gradientDensityCurve = pow(singleGradientDensity, lerp(1.46, 1.24, gradientMix));
                        float gradientStrengthScale = lerp(0.72, 1.08, gradientDensityCurve);
                        float matteDerivedGradientStrength = saturate(
                            matteReferenceMaskStrength * gradientStrengthScale);
                        maskStrength = matteDerivedGradientStrength;
                        pigmentColor = matteReferencePigmentColor;
                        alphaColor = pigmentColor;
                    }
                    else
                    {
                        rawMask = saturate(max(mask.r, mask.g));
                        float overlipSoft = saturate(max(fullSoft, overlineSoft));
                        float outsideExtension = saturate(overlineSoft - fullCore * 0.65);
                        maskStrength = saturate(
                            overlipSoft * coverage * 0.48
                            + fullCore * coverage * 0.16
                            + outsideExtension * coverage * 0.24);
                        pigmentColor = saturate(lerp(_SecondaryColor.rgb, pigmentColor, fullCore * 0.78));
                        alphaColor = pigmentColor;
                    }
                }

                if (_BrowGeneratedMode > 0.5)
                {
                    float desiredSoft = SoftMaskAlpha(max(softMask.g, mask.g), _Threshold, _Feather);
                    float desiredCore = CoreMaskAlpha(mask.g, _Threshold, _Feather);
                    float strandDetail = saturate(max(mask.b, softMask.b * 0.34) * desiredSoft);
                    float strandAmount = saturate(_DetailAmount) * saturate(_PreserveDetail);
                    float tintAlpha = saturate(
                        desiredSoft * coverage * lerp(0.16, 0.52, saturate(_BlushIntensity))
                        + desiredCore * coverage * 0.14);
                    float hairAlpha = saturate(
                        pow(strandDetail, 0.68) * strandAmount * coverage * 0.82);
                    float browAlpha = saturate(
                        tintAlpha
                        + hairAlpha);
                    float3 browPigment = saturate(lerp(
                        _RegionColor.rgb,
                        _RegionColor.rgb * 0.48,
                        saturate(hairAlpha * 1.34)));
                    // Keep the makeup-only values available for the debug overlays
                    // below (they render maskStrength/pigmentColor directly).
                    maskStrength = browAlpha;
                    pigmentColor = browPigment;
                    alphaColor = browPigment;

                  if (_DebugMaskMode < 0.5)
                  {
                    float browOpacity = saturate(_Opacity * _VisibilityAlpha);
                    // Makeup layer obeys the opacity slider.
                    float makeupAlpha = saturate(browAlpha * browOpacity);

                    // Neutralize layer: red channel marks the user's real brow.
                    // Paint surrounding skin over it (independent of the makeup
                    // opacity slider) so the real brow does not stick out.
                    float neutralizeCov = SoftMaskAlpha(max(softMask.r, mask.r), _Threshold, _Feather);
                    float neutralizeAlpha = saturate(
                        neutralizeCov * saturate(_BrowNeutralizeStrength) * saturate(_VisibilityAlpha));

                    // Camera pixel behind this fragment (grabbed pre-overlay).
                    float2 grabUv = input.grabPos.xy / max(input.grabPos.w, 0.00001);
                    float3 cameraHere = tex2D(_BrowBackgroundTexture, grabUv).rgb;
                    // Estimate skin: the brow hair is darker than the skin above
                    // and below it, so sample outward and keep the brightest tap.
                    float2 grabTexel = _BrowBackgroundTexture_TexelSize.xy;
                    grabTexel = grabTexel.x > 0.0 ? grabTexel : (1.0 / max(_ScreenParams.xy, float2(1.0, 1.0)));
                    float3 skin = cameraHere;
                    float skinScore = dot(skin, float3(0.299, 0.587, 0.114));
                    float2 offsets[8] = {
                        float2(0.0, 9.0), float2(0.0, -9.0),
                        float2(0.0, 16.0), float2(0.0, -16.0),
                        float2(0.0, 24.0), float2(0.0, -24.0),
                        float2(11.0, 0.0), float2(-11.0, 0.0)
                    };
                    [unroll]
                    for (int i = 0; i < 8; i++)
                    {
                        float3 s = tex2D(_BrowBackgroundTexture, grabUv + offsets[i] * grabTexel).rgb;
                        float sc = dot(s, float3(0.299, 0.587, 0.114));
                        if (sc > skinScore)
                        {
                            skinScore = sc;
                            skin = s;
                        }
                    }

                    // Compose: neutralized skin first, makeup pigment on top.
                    float3 neutralized = lerp(cameraHere, skin, neutralizeAlpha);
                    float3 composited = lerp(neutralized, browPigment, makeupAlpha);
                    float coverageOut = saturate(neutralizeAlpha + makeupAlpha * (1.0 - neutralizeAlpha));

                    // We folded the camera into `composited`; invert the alpha
                    // blend so the framebuffer ends up exactly `composited`.
                    float3 outColor = coverageOut > 0.0001
                        ? saturate((composited - cameraHere * (1.0 - coverageOut)) / coverageOut)
                        : browPigment;
                    return fixed4(outColor, coverageOut);
                  }
                }

                float detailAmount = saturate(_DetailAmount) * saturate(_PreserveDetail);
                if (_LipStyleMode < -0.5 && _CheekBlushMode < 0.5 && _BrowGeneratedMode < 0.5 && detailAmount > 0.001)
                {
                    float rawHairDetail = saturate(mask.b * fullSoft);
                    float softHairDetail = saturate(softMask.b * fullSoft);
                    float hairNeedle = saturate(rawHairDetail - softHairDetail * 0.38);
                    float hairContrast = saturate((
                        rawHairDetail * 1.18
                        + hairNeedle * 1.55
                        - fullSoft * 0.055) * 1.62);
                    maskStrength = saturate(maskStrength + hairContrast * coverage * detailAmount * 0.62);
                    pigmentColor = saturate(lerp(
                        pigmentColor,
                        pigmentColor * 0.52,
                        hairContrast * detailAmount * 0.82));
                    alphaColor = pigmentColor;
                }

                float preserveScale = lerp(1.0, 0.92, saturate(_PreserveDetail));
                float opacity = saturate(_Opacity * _VisibilityAlpha);

                if (_DebugMaskMode > 0.5 && _DebugMaskMode < 1.5)
                {
                    return fixed4(rawMask.xxx, saturate(rawMask * 0.86));
                }

                if (_DebugMaskMode >= 1.5)
                {
                    float processedMask = saturate(maskStrength * opacity * preserveScale);
                    return fixed4(processedMask.xxx, saturate(processedMask * 0.90));
                }

                if (_PigmentMultiply > 0.5)
                {
                    if (_CheekBlushMode > 0.5)
                    {
                        float slider = saturate(_BlushIntensity);
                        float sliderCurve = slider * slider * (3.0 - 2.0 * slider);
                        float sliderMidCurve = pow(slider, 1.05);
                        float sliderCoreCurve = pow(slider, 1.18);
                        float opacityScale = saturate(
                            opacity
                            * preserveScale
                            * lerp(1.00, 1.65, sliderCurve));
                        float outerStrength = saturate(
                            cheekOuterBand
                            * opacityScale
                            * lerp(0.035, 0.095, sliderCurve));
                        float midStrength = saturate(
                            cheekMidBand
                            * opacityScale
                            * lerp(0.065, 0.620, sliderMidCurve));
                        float coreStrength = saturate(
                            cheekCoreBand
                            * opacityScale
                            * lerp(0.015, 1.200, sliderCoreCurve));
                        float pigmentWarmth = saturate(
                            (pigmentColor.r - max(pigmentColor.g, pigmentColor.b)) * 2.25
                            + saturate(_SaturationBoost) * 0.18);
                        float warmBias = saturate(_Warmth);
                        float3 outerTarget = float3(
                            1.0,
                            lerp(0.995, 0.965, pigmentWarmth) - warmBias * 0.003,
                            lerp(0.995, 0.970, pigmentWarmth) - warmBias * 0.004);
                        float3 midTarget = float3(
                            1.0,
                            lerp(0.955, 0.70, pigmentWarmth) - warmBias * 0.020,
                            lerp(0.970, 0.78, pigmentWarmth) - warmBias * 0.022);
                        float3 coreTarget = float3(
                            1.0,
                            lerp(0.920, 0.44, pigmentWarmth) - warmBias * 0.024,
                            lerp(0.940, 0.58, pigmentWarmth) - warmBias * 0.030);
                        outerTarget = saturate(max(outerTarget, float3(0.97, 0.94, 0.945)));
                        midTarget = saturate(max(midTarget, float3(0.86, 0.66, 0.70)));
                        coreTarget = saturate(max(coreTarget, float3(0.80, 0.42, 0.52)));

                        float3 outerFilter = lerp(float3(1.0, 1.0, 1.0), outerTarget, outerStrength);
                        float3 midFilter = lerp(float3(1.0, 1.0, 1.0), midTarget, midStrength);
                        float3 coreFilter = lerp(float3(1.0, 1.0, 1.0), coreTarget, coreStrength);
                        float3 skinAwareFilter = saturate(outerFilter * midFilter * coreFilter);
                        return fixed4(skinAwareFilter, 1.0);
                    }

                    float styleCapBoost = _LipStyleMode < 0.5
                        ? 0.18
                        : (_LipStyleMode >= 0.5 && _LipStyleMode < 1.5
                            ? 0.10
                            : (_LipStyleMode < 3.5 && _LipStyleMode >= 2.5 ? 0.14 : 0.0));
                    float maxPigmentStrength = saturate(lerp(0.42, 0.66, saturate(_Coverage)) + styleCapBoost);
                    float pigmentStrength = min(saturate(maskStrength * opacity * preserveScale), maxPigmentStrength);
                    float3 pigmentFilter = lerp(float3(1.0, 1.0, 1.0), pigmentColor, pigmentStrength);
                    return fixed4(saturate(pigmentFilter), 1.0);
                }

                float alpha = maskStrength * opacity * preserveScale;
                return fixed4(alphaColor, saturate(alpha));
            }
            ENDCG
        }

        Pass
        {
            Name "GlossAdditiveHighlight"
            Tags { "LightMode" = "Always" }

            Blend One One
            ZWrite Off
            ZTest Always
            Cull Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "UnityCG.cginc"

            sampler2D _MaskTex;
            sampler2D _GlossMaskTex;
            float4 _MaskTex_TexelSize;
            float4 _RegionColor;
            float4 _SecondaryColor;
            float4 _GlossColor;
            float _Opacity;
            float _Threshold;
            float _Feather;
            float _VisibilityAlpha;
            float _Coverage;
            float4 _MaskOffset;
            float _MaskSpreadX;
            float _Specular;
            float _SpecularPower;
            float _GlossBoost;
            float _GlossSharpness;
            float _GlossHaloIntensity;
            float _LipStyleMode;
            float _UseScreenSpaceMask;
            float _DebugMaskMode;
            float _BrowGeneratedMode;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 clipPos : TEXCOORD1;
                float4 grabPos : TEXCOORD2;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.clipPos = output.vertex;
                output.grabPos = ComputeGrabScreenPos(output.vertex);
                output.uv = input.uv;
                return output;
            }

            float FeatherTexelRadius(float feather)
            {
                return lerp(1.25, 5.5, saturate(feather * 2.35));
            }

            float4 SampleMaskSoft(float2 uv)
            {
                float2 texel = _MaskTex_TexelSize.xy;
                float radius = FeatherTexelRadius(_Feather);
                float2 nearTexel = texel * radius;
                float2 farTexel = nearTexel * 1.85;
                float4 center = tex2D(_MaskTex, uv) * 0.24;
                float4 nearAxis = (
                    tex2D(_MaskTex, uv + float2(nearTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv - float2(nearTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv + float2(0.0, nearTexel.y)) +
                    tex2D(_MaskTex, uv - float2(0.0, nearTexel.y))) * 0.085;
                float4 nearDiagonal = (
                    tex2D(_MaskTex, uv + nearTexel) +
                    tex2D(_MaskTex, uv - nearTexel) +
                    tex2D(_MaskTex, uv + float2(nearTexel.x, -nearTexel.y)) +
                    tex2D(_MaskTex, uv + float2(-nearTexel.x, nearTexel.y))) * 0.045;
                float4 farAxis = (
                    tex2D(_MaskTex, uv + float2(farTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv - float2(farTexel.x, 0.0)) +
                    tex2D(_MaskTex, uv + float2(0.0, farTexel.y)) +
                    tex2D(_MaskTex, uv - float2(0.0, farTexel.y))) * 0.06;
                return center + nearAxis + nearDiagonal + farAxis;
            }

            float4 SampleGlossMaskSoft(float2 uv)
            {
                float2 texel = _MaskTex_TexelSize.xy;
                float radius = FeatherTexelRadius(_Feather) * 0.72;
                float2 nearTexel = texel * radius;
                float2 farTexel = nearTexel * 1.65;
                float4 center = tex2D(_GlossMaskTex, uv) * 0.34;
                float4 nearAxis = (
                    tex2D(_GlossMaskTex, uv + float2(nearTexel.x, 0.0)) +
                    tex2D(_GlossMaskTex, uv - float2(nearTexel.x, 0.0)) +
                    tex2D(_GlossMaskTex, uv + float2(0.0, nearTexel.y)) +
                    tex2D(_GlossMaskTex, uv - float2(0.0, nearTexel.y))) * 0.085;
                float4 nearDiagonal = (
                    tex2D(_GlossMaskTex, uv + nearTexel) +
                    tex2D(_GlossMaskTex, uv - nearTexel) +
                    tex2D(_GlossMaskTex, uv + float2(nearTexel.x, -nearTexel.y)) +
                    tex2D(_GlossMaskTex, uv + float2(-nearTexel.x, nearTexel.y))) * 0.045;
                float4 farAxis = (
                    tex2D(_GlossMaskTex, uv + float2(farTexel.x, 0.0)) +
                    tex2D(_GlossMaskTex, uv - float2(farTexel.x, 0.0)) +
                    tex2D(_GlossMaskTex, uv + float2(0.0, farTexel.y)) +
                    tex2D(_GlossMaskTex, uv - float2(0.0, farTexel.y))) * 0.035;
                return center + nearAxis + nearDiagonal + farAxis;
            }

            float SoftMaskAlpha(float value, float threshold, float feather)
            {
                float soft = max(feather, 0.00001);
                return smoothstep(saturate(threshold - soft * 0.46), saturate(threshold + soft), value);
            }

            float CoreMaskAlpha(float value, float threshold, float feather)
            {
                float soft = max(feather, 0.00001);
                return smoothstep(saturate(threshold + soft * 0.18), saturate(threshold + soft * 0.88), value);
            }

            fixed4 frag(v2f input) : SV_Target
            {
                if (_DebugMaskMode > 0.5)
                {
                    return fixed4(0.0, 0.0, 0.0, 0.0);
                }

                if (_LipStyleMode < -0.5 || _BrowGeneratedMode > 0.5 || _GlossBoost <= 0.001 || _Specular <= 0.001)
                {
                    return fixed4(0.0, 0.0, 0.0, 0.0);
                }

                float2 maskUv = input.uv;
                if (_UseScreenSpaceMask > 0.5)
                {
                    float2 ndc = input.clipPos.xy / max(input.clipPos.w, 0.00001);
                    maskUv = saturate(ndc * 0.5 + 0.5);
                }
                maskUv.x = saturate(0.5 + (maskUv.x - 0.5) / max(1.0 + _MaskSpreadX, 0.001));
                maskUv.y = saturate(maskUv.y - _MaskOffset.y);

                float4 mask = tex2D(_MaskTex, maskUv);
                float4 softMask = SampleMaskSoft(maskUv);
                float4 glossMask = tex2D(_GlossMaskTex, maskUv);
                float4 softGlossMask = SampleGlossMaskSoft(maskUv);
                float fullSoft = SoftMaskAlpha(softMask.r, _Threshold, _Feather);
                float fullCore = CoreMaskAlpha(mask.r, _Threshold, _Feather);
                float overlineSoft = SoftMaskAlpha(softMask.g, _Threshold, _Feather);
                float gradientSoft = SoftMaskAlpha(max(softMask.b, mask.b), _Threshold, _Feather);
                float coverage = saturate(max(_Coverage, 0.001));
                float styleCoverage = saturate(max(fullSoft, max(gradientSoft, overlineSoft)));
                float styleCore = saturate(max(fullCore, max(gradientSoft * 0.52, overlineSoft * 0.38)));
                float styleGlossSeed = saturate(glossMask.a);
                float softGlossSeed = saturate(max(softGlossMask.a, glossMask.a * 0.46));

                float glossSharpMask = SoftMaskAlpha(
                    styleGlossSeed,
                    max(_Threshold * 0.96, 0.022),
                    max(lerp(0.044, 0.032, saturate(_GlossSharpness)), 0.032))
                    * styleCoverage
                    * max(styleCore, styleGlossSeed * 0.58);
                float glossHaloMask = SoftMaskAlpha(
                    softGlossSeed,
                    max(_Threshold * 0.70, 0.018),
                    max(_Feather * 0.26, 0.050))
                    * styleCoverage
                    * max(styleCore, styleGlossSeed * 0.42);
                float glossHalo = saturate(glossHaloMask - glossSharpMask * 0.56);
                float glossEnergy = coverage
                    * coverage
                    * saturate(_Specular)
                    * saturate(_GlossBoost)
                    * saturate(_Opacity)
                    * saturate(_VisibilityAlpha);
                float sharpHighlight = glossSharpMask * glossEnergy * 0.96;
                float haloHighlight = glossHalo * glossEnergy * saturate(_GlossHaloIntensity) * 0.22;
                float3 glossScreenLift = saturate(1.0 - _RegionColor.rgb * 0.56);
                float3 sharpHighlightColor = saturate(lerp(_RegionColor.rgb, _GlossColor.rgb, 0.34));
                float3 haloHighlightColor = saturate(lerp(_RegionColor.rgb, _GlossColor.rgb, 0.03));
                float3 additiveGloss = sharpHighlightColor * glossScreenLift * sharpHighlight
                    + haloHighlightColor * glossScreenLift * haloHighlight;
                return fixed4(additiveGloss, 0.0);
            }
            ENDCG
        }
    }
}
