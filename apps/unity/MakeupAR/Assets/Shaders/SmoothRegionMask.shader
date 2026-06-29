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
        _PreserveDetail ("Preserve Detail", Range(0, 1)) = 1
        _LipStyleMode ("Lip Style Mode", Float) = -1
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
            float _PreserveDetail;
            float _LipStyleMode;
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
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.clipPos = output.vertex;
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

                if (_LipStyleMode > -0.5)
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

                float detailAmount = saturate(_DetailAmount) * saturate(_PreserveDetail);
                if (_LipStyleMode < -0.5 && detailAmount > 0.001)
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
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.clipPos = output.vertex;
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

                if (_LipStyleMode < -0.5 || _GlossBoost <= 0.001 || _Specular <= 0.001)
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
