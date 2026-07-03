Shader "Hidden/MakeupAR/ScreenSpaceFoundation"
{
    Properties
    {
        _SkinMaskTex ("Skin Mask", 2D) = "black" {}
        _CameraTex ("Camera Texture", 2D) = "black" {}
        _textureY ("ARKit Texture Y", 2D) = "black" {}
        _textureCbCr ("ARKit Texture CbCr", 2D) = "gray" {}
        _FoundationColor ("Foundation Color", Color) = (0.84, 0.69, 0.60, 1)
        _UserSkinBaseColor ("User Skin Base Color", Color) = (0.78, 0.60, 0.51, 1)
        _FoundationIntensity ("Foundation Intensity", Range(0, 1)) = 0.45
        _FoundationCoverage ("Foundation Coverage", Range(0, 1)) = 0.55
        _FoundationEvenness ("Foundation Evenness", Range(0, 1)) = 0.25
        _FoundationLuminanceInfluence ("Foundation Luminance Influence", Range(0, 1)) = 0.08
        _FoundationDebugMode ("Foundation Debug Mode", Float) = 0
        _FoundationMaskStrength ("Foundation Mask Strength", Range(0, 2)) = 1
        _FoundationMaskFeather ("Foundation Mask Feather", Range(0, 1)) = 0
        _RawMaskAvailable ("Raw Mask Available", Float) = 0
        _FinalMaskAvailable ("Final Mask Available", Float) = 0
        _ProviderProductionReady ("Provider Production Ready", Float) = 0
        _CameraTextureMode ("Camera Texture Mode", Float) = 0
        _FoundationDebugLeftCheek ("Foundation Debug Left Cheek", Vector) = (0, 0, 0, 0)
        _FoundationDebugRightCheek ("Foundation Debug Right Cheek", Vector) = (0, 0, 0, 0)
        _FoundationDebugNose ("Foundation Debug Nose", Vector) = (0, 0, 0, 0)
        _FoundationDebugChin ("Foundation Debug Chin", Vector) = (0, 0, 0, 0)
        _FoundationDebugForehead ("Foundation Debug Forehead", Vector) = (0, 0, 0, 0)
        _FoundationDebugMouth ("Foundation Debug Mouth", Vector) = (0, 0, 0, 0)
        [HideInInspector] _SrcBlend ("Source Blend", Float) = 2
        [HideInInspector] _DstBlend ("Destination Blend", Float) = 0
        [HideInInspector] _ZWrite ("ZWrite", Float) = 0
        [HideInInspector] _ZTest ("ZTest", Float) = 8
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent+300"
            "RenderType" = "Transparent"
            "IgnoreProjector" = "True"
        }

        Cull Off
        ZWrite [_ZWrite]
        ZTest [_ZTest]
        Blend [_SrcBlend] [_DstBlend]

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            #define real4 half4
            #define real4x4 half4x4
            #define FastSRGBToLinear GammaToLinearSpace
            #define ARKIT_TEXTURE2D_HALF(texture) UNITY_DECLARE_TEX2D_HALF(texture)
            #define ARKIT_SAMPLER_HALF(sampler)
            #define ARKIT_SAMPLE_TEXTURE2D(texture,sampler,texcoord) UNITY_SAMPLE_TEX2D(texture,texcoord)

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            sampler2D _SkinMaskTex;
            sampler2D _CameraTex;
            ARKIT_TEXTURE2D_HALF(_textureY);
            ARKIT_SAMPLER_HALF(sampler_textureY);
            ARKIT_TEXTURE2D_HALF(_textureCbCr);
            ARKIT_SAMPLER_HALF(sampler_textureCbCr);
            float4 _FoundationColor;
            float4 _UserSkinBaseColor;
            float _FoundationIntensity;
            float _FoundationCoverage;
            float _FoundationEvenness;
            float _FoundationLuminanceInfluence;
            float _FoundationDebugMode;
            float _FoundationMaskStrength;
            float _FoundationMaskFeather;
            float _RawMaskAvailable;
            float _FinalMaskAvailable;
            float _ProviderProductionReady;
            float _CameraTextureMode;
            float4 _FoundationDebugLeftCheek;
            float4 _FoundationDebugRightCheek;
            float4 _FoundationDebugNose;
            float4 _FoundationDebugChin;
            float4 _FoundationDebugForehead;
            float4 _FoundationDebugMouth;
            float4x4 _UnityDisplayTransform;

            v2f vert(appdata input)
            {
                v2f output;
                output.pos = UnityObjectToClipPos(input.vertex);
                output.uv = input.uv;
                return output;
            }

            float2 CameraUv(float2 screenUv)
            {
                return mul(float4(screenUv, 1.0f, 1.0f), _UnityDisplayTransform).xy;
            }

            float3 SampleCameraColor(float2 screenUv)
            {
                float3 result = float3(0.0, 0.0, 0.0);
                if (_CameraTextureMode > 1.5)
                {
                    float2 cameraUv = CameraUv(screenUv);
                    float y = ARKIT_SAMPLE_TEXTURE2D(_textureY, sampler_textureY, cameraUv).r;
                    float2 cbcr = ARKIT_SAMPLE_TEXTURE2D(_textureCbCr, sampler_textureCbCr, cameraUv).rg - float2(0.5, 0.5);
                    result = float3(
                        y + 1.4020 * cbcr.y,
                        y - 0.3441 * cbcr.x - 0.7141 * cbcr.y,
                        y + 1.7720 * cbcr.x);

#if !UNITY_COLORSPACE_GAMMA
                    result = FastSRGBToLinear(result);
#endif
                }
                else if (_CameraTextureMode > 0.5)
                {
                    result = tex2D(_CameraTex, CameraUv(screenUv)).rgb;
                }

                return saturate(result);
            }

            float FoundationLuma(float3 color)
            {
                return dot(color, float3(0.299, 0.587, 0.114));
            }

            float AnchorDot(float2 screenUv, float4 anchor, float radius)
            {
                if (anchor.z < 0.5)
                {
                    return 0.0;
                }

                float dist = distance(screenUv, anchor.xy);
                return 1.0 - smoothstep(radius, radius * 1.85, dist);
            }

            float3 CorrectCameraColor(float3 cameraColor, float visibleSkin)
            {
                float3 userSkin = max(saturate(_UserSkinBaseColor.rgb), float3(0.075, 0.075, 0.075));
                float3 foundation = max(saturate(_FoundationColor.rgb), float3(0.075, 0.075, 0.075));
                float3 chromaRatio = foundation / userSkin;
                float chromaRatioLum = max(FoundationLuma(chromaRatio), 0.08);
                chromaRatio /= chromaRatioLum;

                float userLum = max(FoundationLuma(userSkin), 0.08);
                float foundationLum = FoundationLuma(foundation);
                float lumShift = clamp(foundationLum - userLum, -0.12, 0.12) * saturate(_FoundationLuminanceInfluence);
                float3 targetFilter = chromaRatio + lumShift;
                targetFilter = lerp(float3(1.0, 1.0, 1.0), targetFilter, saturate(_FoundationCoverage));
                targetFilter = lerp(targetFilter, saturate((targetFilter + FoundationLuma(targetFilter)) * 0.5), saturate(_FoundationEvenness) * 0.12);
                float amount = saturate(_FoundationIntensity) * visibleSkin;
                float cameraLum = FoundationLuma(cameraColor);
                float3 filtered = saturate(cameraColor * max(targetFilter, float3(0.05, 0.05, 0.05)));
                float filteredLum = max(FoundationLuma(filtered), 0.001);
                float3 lumaPreserved = saturate(filtered * (cameraLum / filteredLum));
                float safeFoundationLum = max(foundationLum, 0.001);
                float3 lumaMatchedFoundation = saturate(foundation * (cameraLum / safeFoundationLum));
                float3 corrected = lerp(lumaPreserved, filtered, saturate(_FoundationLuminanceInfluence) * 0.35);
                corrected = lerp(corrected, lumaMatchedFoundation, saturate(_FoundationCoverage) * 0.46);

                // Keep the correction visibly testable while still preserving the camera luminance.
                // The mask already limits the effect to face skin pixels; without this boost the
                // default shade is too close to the sampled skin base and looks like no-op.
                float visibleAmount = saturate(amount * lerp(1.85, 2.85, saturate(_FoundationCoverage)));
                return lerp(cameraColor, corrected, visibleAmount);
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float3 cameraColor = SampleCameraColor(input.uv);
                float4 maskSample = tex2D(_SkinMaskTex, input.uv);
                float exclusionMask = saturate(maskSample.g);
                float rawSkinMask = saturate(maskSample.b);
                float baseFaceSurfaceMask = saturate(maskSample.a);
                float finalMaskFromChannel = saturate(maskSample.r);
                float reconstructedFinalMask = saturate(baseFaceSurfaceMask * rawSkinMask * (1.0 - exclusionMask));
                float finalMask = saturate(max(finalMaskFromChannel, reconstructedFinalMask) * max(_FoundationMaskStrength, 0.0));
                float surfaceMask = saturate(baseFaceSurfaceMask * max(_FoundationMaskStrength, 0.0));
                if (_FoundationMaskFeather > 0.0001)
                {
                    finalMask = smoothstep(_FoundationMaskFeather, 1.0, finalMask);
                    surfaceMask = smoothstep(_FoundationMaskFeather, 1.0, surfaceMask);
                }

                float debugMode = _FoundationDebugMode;

                if (_CameraTextureMode < 0.5)
                {
                    return fixed4(cameraColor, 0.0);
                }

                if (debugMode > 0.5 && debugMode < 1.5)
                {
                    return fixed4(baseFaceSurfaceMask.xxx, 0.86);
                }

                if (debugMode >= 1.5 && debugMode < 2.5)
                {
                    return fixed4(exclusionMask.xxx, 0.86);
                }

                if (debugMode >= 2.5 && debugMode < 3.5)
                {
                    return fixed4(finalMaskFromChannel.xxx, 0.86);
                }

                if (debugMode >= 3.5 && debugMode < 4.5)
                {
                    float3 correctedPreview = CorrectCameraColor(cameraColor, finalMask);
                    return fixed4(correctedPreview, 1.0);
                }

                if (debugMode >= 5.5 && debugMode < 6.5)
                {
                    float3 anchorPreview = cameraColor * 0.22;
                    float dotRadius = 0.018;
                    float forehead = AnchorDot(input.uv, _FoundationDebugForehead, dotRadius);
                    float nose = AnchorDot(input.uv, _FoundationDebugNose, dotRadius);
                    float chin = AnchorDot(input.uv, _FoundationDebugChin, dotRadius);
                    float leftCheek = AnchorDot(input.uv, _FoundationDebugLeftCheek, dotRadius);
                    float rightCheek = AnchorDot(input.uv, _FoundationDebugRightCheek, dotRadius);
                    float mouth = AnchorDot(input.uv, _FoundationDebugMouth, dotRadius);
                    anchorPreview = lerp(anchorPreview, float3(0.0, 1.0, 0.1), forehead);
                    anchorPreview = lerp(anchorPreview, float3(1.0, 0.92, 0.0), nose);
                    anchorPreview = lerp(anchorPreview, float3(0.0, 0.32, 1.0), chin);
                    anchorPreview = lerp(anchorPreview, float3(1.0, 0.0, 0.0), leftCheek);
                    anchorPreview = lerp(anchorPreview, float3(0.0, 0.95, 1.0), rightCheek);
                    anchorPreview = lerp(anchorPreview, float3(1.0, 0.0, 0.95), mouth);
                    return fixed4(anchorPreview, 1.0);
                }

                if (debugMode >= 4.5)
                {
                    float forcedMask = saturate(max(surfaceMask, finalMask));
                    float3 exaggerated = lerp(cameraColor * 0.28, float3(1.0, 0.0, 0.0), saturate(forcedMask * 2.0));
                    return fixed4(exaggerated, 1.0);
                }

                return fixed4(CorrectCameraColor(cameraColor, surfaceMask), 1.0);
            }
            ENDCG
        }
    }

    FallBack Off
}
