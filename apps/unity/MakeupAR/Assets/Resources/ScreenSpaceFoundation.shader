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
        _ScreenSpaceUvFlip ("Screen Space Uv Flip", Float) = 0
        _DisplayProjectionActive ("Display Projection Active", Float) = 0
        _ScreenSpaceUvFlipX ("Screen Space Uv Flip X", Float) = 0
        _MaskSampleShift ("Mask Sample Shift", Vector) = (0, 0, 0, 0)
        _MaskSampleScaleY ("Mask Sample Scale Y", Float) = 1
        _MaskFaceCenterY ("Mask Face Center Y", Float) = 0.5
        _HandOcclusionMaskTex ("Hand Occlusion Mask", 2D) = "black" {}
        _HandOcclusionEnabled ("Hand Occlusion Enabled", Float) = 0
        _HandOcclusionUseRect ("Hand Occlusion Use Rect", Float) = 0
        _HandOcclusionRect ("Hand Occlusion Rect", Vector) = (0, 0, 0, 0)
        _NeckChromaGate ("Neck Chroma Gate", Range(0, 1)) = 0.85
        _NeckChromaTolerance ("Neck Chroma Tolerance", Range(0.01, 1)) = 0.16
        _NeckMaskStrength ("Neck Mask Strength", Range(0, 1)) = 0.9
        _RawMaskAvailable ("Raw Mask Available", Float) = 0
        _FinalMaskAvailable ("Final Mask Available", Float) = 0
        _ProviderProductionReady ("Provider Production Ready", Float) = 0
        _FoundationActiveRendererMode ("Foundation Active Renderer Mode", Float) = 0
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
            float4 _SkinMaskTex_TexelSize;
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
            float _NeckChromaGate;
            float _NeckChromaTolerance;
            float _NeckMaskStrength;
            float _RawMaskAvailable;
            float _FinalMaskAvailable;
            float _ProviderProductionReady;
            float _FoundationActiveRendererMode;
            float _CameraTextureMode;
            float _ScreenSpaceUvFlip;
            float _ScreenSpaceUvFlipX;
            float _DisplayProjectionActive;
            float4 _MaskSampleShift;
            float _MaskSampleScaleY;
            float _MaskFaceCenterY;
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

            sampler2D _HandOcclusionMaskTex;
            float _HandOcclusionEnabled;
            float _HandOcclusionUseRect;
            float4 _HandOcclusionRect;

            // Hands (or other occluders) over the face must never receive
            // foundation. Mask/rect come from the Vision hand-pose runtime.
            float HandOcclusionVisibility(float2 screenUv)
            {
                if (_HandOcclusionEnabled < 0.5)
                {
                    return 1.0;
                }

                float mask = tex2D(_HandOcclusionMaskTex, screenUv).r;
                if (_HandOcclusionUseRect > 0.5)
                {
                    float inside =
                        step(_HandOcclusionRect.x, screenUv.x)
                        * step(screenUv.x, _HandOcclusionRect.z)
                        * step(_HandOcclusionRect.y, screenUv.y)
                        * step(screenUv.y, _HandOcclusionRect.w);
                    mask = max(mask, inside);
                }

                return 1.0 - saturate(mask);
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
                // Luminance-preserving blend: the camera pixel's luma (shadows,
                // pores, nose shading) passes through untouched; only the
                // foundation's chroma mixes in. lumaMatchedFoundation is the
                // foundation color rescaled to the camera pixel's luminance,
                // so even at high coverage the skin texture stays visible.
                float3 corrected = lerp(
                    lumaPreserved,
                    lumaMatchedFoundation,
                    saturate(_FoundationCoverage) * 0.55);
                float visibleAmount = saturate(amount);
                return lerp(cameraColor, corrected, visibleAmount);
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float debugMode = _FoundationDebugMode;
                // Keep the default mask lookup in the same normalized
                // screen-space as the quad. Orientation probes below are the
                // only place where read-side flips/rotations are applied.
                float2 screenUv = input.uv;
                float uvFlip = _ScreenSpaceUvFlip;
                float uvFlipX = _ScreenSpaceUvFlipX;
                if (debugMode >= 22.5 && debugMode < 23.5)
                {
                    // Mode 23 path confirmation:
                    //   magenta = CommandBuffer compositor path
                    //   orange  = legacy near-camera Quad fallback path
                    // If neither fills the preview, the visible foundation is
                    // coming from a different shader/material.
                    float3 pathColor = _FoundationActiveRendererMode > 0.5
                        ? float3(1.0, 0.0, 1.0)
                        : float3(1.0, 0.48, 0.0);
                    return fixed4(pathColor, 1.0);
                }
                // Debug modes 8-11 are in-app orientation probes. They show
                // the same base surface mask with four read-side UV variants:
                // 8=no flip, 9=X, 10=Y, 11=XY/180.
                if (debugMode >= 7.5 && debugMode < 11.5)
                {
                    float probeMode = floor(debugMode + 0.5);
                    uvFlipX = (probeMode == 9.0 || probeMode == 11.0) ? 1.0 : 0.0;
                    uvFlip = (probeMode == 10.0 || probeMode == 11.0) ? 1.0 : 0.0;
                }

                if (uvFlipX > 0.5)
                {
                    screenUv.x = 1.0 - screenUv.x;
                }

                if (uvFlip > 0.5)
                {
                    screenUv.y = 1.0 - screenUv.y;
                }

                // Mode 19 (정밀 투영): the mask is generated directly in
                // display uv space (intrinsics + inverse display matrix), so
                // the read-side 180 correction for the projection-space mask
                // must be bypassed — sample with the raw quad uv.
                if (debugMode >= 18.5 && debugMode < 22.5)
                {
                    screenUv = input.uv;
                }

                float2 rotated90ClockwiseUv = float2(screenUv.y, 1.0 - screenUv.x);
                float2 rotated90CounterClockwiseUv = float2(1.0 - screenUv.y, screenUv.x);

                float3 cameraColor = SampleCameraColor(input.uv);

                if (debugMode >= 11.5 && debugMode < 14.5)
                {
                    // Shader-only asymmetric baseline mask. This deliberately
                    // bypasses _SkinMaskTex and ARFace-generated masks so we
                    // can tell whether the display path itself is flipped.
                    // Expected upright orientation:
                    // yellow = top/forehead, green = viewer-left, blue = bottom/chin.
                    float2 uv = screenUv;
                    if (debugMode >= 12.5 && debugMode < 13.5)
                    {
                        uv = rotated90ClockwiseUv;
                    }
                    else if (debugMode >= 13.5 && debugMode < 14.5)
                    {
                        uv = rotated90CounterClockwiseUv;
                    }
                    float2 faceDelta = (uv - float2(0.5, 0.49)) / float2(0.29, 0.38);
                    float faceMask = 1.0 - smoothstep(1.0, 1.08, dot(faceDelta, faceDelta));

                    float2 topDelta = (uv - float2(0.50, 0.78)) / float2(0.16, 0.045);
                    float topMark = 1.0 - smoothstep(1.0, 1.08, dot(topDelta, topDelta));

                    float2 leftDelta = (uv - float2(0.34, 0.55)) / float2(0.045, 0.18);
                    float leftMark = 1.0 - smoothstep(1.0, 1.08, dot(leftDelta, leftDelta));

                    float2 bottomDelta = (uv - float2(0.58, 0.18)) / float2(0.12, 0.045);
                    float bottomMark = 1.0 - smoothstep(1.0, 1.08, dot(bottomDelta, bottomDelta));

                    float mask = saturate(faceMask + topMark + leftMark + bottomMark);
                    float3 orientationColor = lerp(
                        float3(0.94, 0.08, 0.06),
                        float3(0.05, 0.32, 1.0),
                        smoothstep(0.12, 0.86, uv.y));
                    orientationColor = lerp(orientationColor, float3(1.0, 0.94, 0.05), topMark);
                    orientationColor = lerp(orientationColor, float3(0.0, 1.0, 0.18), leftMark);
                    orientationColor = lerp(orientationColor, float3(0.05, 0.34, 1.0), bottomMark);
                    return fixed4(lerp(cameraColor * 0.22, orientationColor, mask), 1.0);
                }

                if (debugMode >= 7.5 && debugMode < 11.5
                    || debugMode >= 14.5 && debugMode < 16.5)
                {
                    float probeMode = floor(debugMode + 0.5);
                    float2 probeUv = screenUv;
                    if (probeMode == 15.0)
                    {
                        probeUv = rotated90ClockwiseUv;
                    }
                    else if (probeMode == 16.0)
                    {
                        probeUv = rotated90CounterClockwiseUv;
                    }
                    float4 probeSample = tex2D(_SkinMaskTex, probeUv);
                    // .r is valid for every RT format (single- or 4-channel);
                    // .a reads as constant 1.0 on single-channel RTs.
                    float probeMask = saturate(max(probeSample.r, probeSample.g));
                    float3 probeColor = float3(1.0, 0.0, 0.0);
                    if (probeMode == 9.0)
                    {
                        probeColor = float3(0.0, 1.0, 0.15);
                    }
                    else if (probeMode == 10.0)
                    {
                        probeColor = float3(0.05, 0.35, 1.0);
                    }
                    else if (probeMode == 11.0)
                    {
                        probeColor = float3(1.0, 0.92, 0.0);
                    }
                    else if (probeMode == 15.0)
                    {
                        probeColor = float3(1.0, 0.48, 0.0);
                    }
                    else if (probeMode == 16.0)
                    {
                        probeColor = float3(0.72, 0.22, 1.0);
                    }

                    float3 dimmedCamera = cameraColor * 0.22;
                    return fixed4(lerp(dimmedCamera, probeColor, probeMask), 1.0);
                }

                // Anchor-lag / calibration compensation on the LOOKUP: the
                // mask is drawn perfectly camera-synced (CommandBuffer) at
                // the laggy anchor position; displaying it shifted by +S and
                // vertically rescaled about the face center means sampling
                // at (uv - S) and (center + (uv - center) / scaleY).
                float2 maskUv = screenUv - _MaskSampleShift.xy;
                maskUv.y = _MaskFaceCenterY
                    + (maskUv.y - _MaskFaceCenterY) / max(_MaskSampleScaleY, 0.5);

                // Feathering: 5-tap tent sample of the mask softens the hard
                // mesh silhouette (jawline, face contour) so the foundation
                // fades out naturally instead of clipping at the mesh edge.
                float2 featherTexel = _SkinMaskTex_TexelSize.xy * 1.5;
                float4 maskSample = tex2D(_SkinMaskTex, maskUv) * 0.44
                    + tex2D(_SkinMaskTex, maskUv + float2(featherTexel.x, 0.0)) * 0.14
                    + tex2D(_SkinMaskTex, maskUv - float2(featherTexel.x, 0.0)) * 0.14
                    + tex2D(_SkinMaskTex, maskUv + float2(0.0, featherTexel.y)) * 0.14
                    + tex2D(_SkinMaskTex, maskUv - float2(0.0, featherTexel.y)) * 0.14;
                float exclusionMask = saturate(maskSample.g);
                float rawSkinMask = saturate(maskSample.b);
                float baseFaceSurfaceMask = saturate(maskSample.a);
                float finalMaskFromChannel = saturate(maskSample.r);
                float reconstructedFinalMask = saturate(baseFaceSurfaceMask * rawSkinMask * (1.0 - exclusionMask));
                float handVisibility = HandOcclusionVisibility(screenUv);
                float finalMask = saturate(max(finalMaskFromChannel, reconstructedFinalMask) * max(_FoundationMaskStrength, 0.0))
                    * handVisibility;
                float surfaceMask = saturate(baseFaceSurfaceMask * max(_FoundationMaskStrength, 0.0))
                    * handVisibility;
                if (_FoundationMaskFeather > 0.0001)
                {
                    finalMask = smoothstep(_FoundationMaskFeather, 1.0, finalMask);
                    surfaceMask = smoothstep(_FoundationMaskFeather, 1.0, surfaceMask);
                }

                // SODA-style neck / edge handling. Pixels covered by the extended
                // surface (alpha) but without projected face-skin weights (blue)
                // are neck-strip or hull-edge pixels. Gate them by chroma
                // similarity against a live skin reference sampled at the cheek
                // and chin anchors so hair, clothing, and background beneath the
                // chin stay untinted while the actual neck skin gets foundation.
                float neckness = saturate(surfaceMask) * (1.0 - smoothstep(0.10, 0.45, rawSkinMask));
                if (_NeckChromaGate > 0.0001 && neckness > 0.0001 && _CameraTextureMode > 0.5)
                {
                    float3 skinRef = float3(0.0, 0.0, 0.0);
                    float refWeight = 0.0;
                    if (_FoundationDebugLeftCheek.z > 0.5)
                    {
                        skinRef += SampleCameraColor(_FoundationDebugLeftCheek.xy);
                        refWeight += 1.0;
                    }

                    if (_FoundationDebugRightCheek.z > 0.5)
                    {
                        skinRef += SampleCameraColor(_FoundationDebugRightCheek.xy);
                        refWeight += 1.0;
                    }

                    if (_FoundationDebugChin.z > 0.5)
                    {
                        skinRef += SampleCameraColor(_FoundationDebugChin.xy);
                        refWeight += 1.0;
                    }

                    skinRef = refWeight > 0.5
                        ? skinRef / refWeight
                        : max(saturate(_UserSkinBaseColor.rgb), float3(0.075, 0.075, 0.075));
                    float refLum = max(FoundationLuma(skinRef), 0.05);
                    float camLum = max(FoundationLuma(cameraColor), 0.05);
                    float2 refChroma = skinRef.rb / refLum;
                    float2 camChroma = cameraColor.rb / camLum;
                    float chromaDist = length(camChroma - refChroma);
                    float skinGate = 1.0 - smoothstep(
                        _NeckChromaTolerance,
                        _NeckChromaTolerance * 2.4,
                        chromaDist);
                    float lumRatio = camLum / refLum;
                    float lumGate = smoothstep(0.30, 0.62, lumRatio)
                        * (1.0 - smoothstep(1.65, 2.40, lumRatio));
                    float gate = lerp(
                        1.0,
                        saturate(skinGate * lumGate) * saturate(_NeckMaskStrength),
                        saturate(_NeckChromaGate) * neckness);
                    surfaceMask *= gate;
                    finalMask *= gate;
                }

                if (_CameraTextureMode < 0.5)
                {
                    return fixed4(cameraColor, 0.0);
                }

                if (debugMode > 0.5 && debugMode < 1.5)
                {
                    // True CommandBuffer surface channel. Cyan means the
                    // current visible path is sampling the ARFace surface
                    // coverage written by FoundationMaskWrite.a, not the
                    // old final/UV mask.
                    float3 surfaceColor = lerp(cameraColor * 0.18, float3(0.0, 0.92, 1.0), baseFaceSurfaceMask);
                    return fixed4(surfaceColor, 1.0);
                }

                if (debugMode >= 1.5 && debugMode < 2.5)
                {
                    float3 exclusionColor = lerp(cameraColor * 0.18, float3(1.0, 0.0, 0.95), exclusionMask);
                    return fixed4(exclusionColor, 1.0);
                }

                if (debugMode >= 2.5 && debugMode < 3.5)
                {
                    float3 finalColor = lerp(cameraColor * 0.18, float3(0.0, 1.0, 0.16), finalMaskFromChannel);
                    return fixed4(finalColor, 1.0);
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
                    float forehead = AnchorDot(screenUv, _FoundationDebugForehead, dotRadius);
                    float nose = AnchorDot(screenUv, _FoundationDebugNose, dotRadius);
                    float chin = AnchorDot(screenUv, _FoundationDebugChin, dotRadius);
                    float leftCheek = AnchorDot(screenUv, _FoundationDebugLeftCheek, dotRadius);
                    float rightCheek = AnchorDot(screenUv, _FoundationDebugRightCheek, dotRadius);
                    float mouth = AnchorDot(screenUv, _FoundationDebugMouth, dotRadius);
                    anchorPreview = lerp(anchorPreview, float3(0.0, 1.0, 0.1), forehead);
                    anchorPreview = lerp(anchorPreview, float3(1.0, 0.92, 0.0), nose);
                    anchorPreview = lerp(anchorPreview, float3(0.0, 0.32, 1.0), chin);
                    anchorPreview = lerp(anchorPreview, float3(1.0, 0.0, 0.0), leftCheek);
                    anchorPreview = lerp(anchorPreview, float3(0.0, 0.95, 1.0), rightCheek);
                    anchorPreview = lerp(anchorPreview, float3(1.0, 0.0, 0.95), mouth);
                    return fixed4(anchorPreview, 1.0);
                }

                if (debugMode >= 6.5 && debugMode < 7.5)
                {
                    // Motion tracking overlay:
                    // cyan = ARFace surface coverage, green = final foundation
                    // mask, magenta = excluded eyes/lips/brows. This view is
                    // intentionally alpha-blended over the live camera so the
                    // user can see whether the mask sticks to the face outline
                    // while panning the phone.
                    float surfaceDebug = saturate(surfaceMask);
                    float finalDebug = saturate(finalMask);
                    float exclusionDebug = saturate(exclusionMask * max(surfaceDebug, rawSkinMask));
                    float3 debugColor = float3(0.0, 0.92, 1.0) * surfaceDebug * 0.55;
                    debugColor = lerp(debugColor, float3(0.0, 1.0, 0.18), finalDebug);
                    debugColor = lerp(debugColor, float3(1.0, 0.0, 0.95), exclusionDebug * 0.82);
                    float debugAlpha = saturate(surfaceDebug * 0.22 + finalDebug * 0.72 + exclusionDebug * 0.52);
                    return fixed4(saturate(debugColor), debugAlpha);
                }

                // 4.5-5.5: forced-red mask preview (강제색).
                // 16.5-18.5: SOURCE-side 90-degree orientation probes
                // (17=CW, 18=CCW applied in FoundationMaskRuntime.ToMaskUv);
                // rendered in the same forced-red style so alignment against
                // the live face is easy to judge. The correct one matches the
                // face exactly in both shape and position.
                if ((debugMode >= 4.5 && debugMode < 5.5)
                    || (debugMode >= 16.5 && debugMode < 22.5)
                    || (debugMode >= 23.5 && debugMode < 24.5)
                    || (debugMode >= 24.5 && debugMode < 30.5))
                {
                    // Mode 19 self-diagnosis: RED = display-matrix projection
                    // is live; BLUE = it silently fell back to the legacy
                    // projection (intrinsics/display matrix unavailable), so
                    // the on-screen result would look unchanged.
                    float3 probeTint = float3(1.0, 0.0, 0.0);
                    if (debugMode >= 18.5 && _DisplayProjectionActive < 0.5)
                    {
                        probeTint = float3(0.1, 0.35, 1.0);
                    }
                    else if (debugMode >= 24.5 && debugMode < 25.5)
                    {
                        probeTint = float3(1.0, 0.55, 0.0);
                    }
                    else if (debugMode >= 25.5 && debugMode < 26.5)
                    {
                        probeTint = float3(0.0, 1.0, 0.18);
                    }
                    else if (debugMode >= 26.5 && debugMode < 27.5)
                    {
                        probeTint = float3(0.05, 0.35, 1.0);
                    }
                    else if (debugMode >= 27.5 && debugMode < 28.5)
                    {
                        probeTint = float3(1.0, 0.92, 0.0);
                    }
                    else if (debugMode >= 28.5 && debugMode < 29.5)
                    {
                        probeTint = float3(1.0, 0.0, 0.95);
                    }
                    else if (debugMode >= 29.5 && debugMode < 30.5)
                    {
                        probeTint = float3(0.0, 0.95, 1.0);
                    }

                    float forcedMask = saturate(max(surfaceMask, finalMask));
                    float3 exaggerated = lerp(cameraColor * 0.28, probeTint, saturate(forcedMask * 2.0));
                    return fixed4(exaggerated, 1.0);
                }

                // Weight the correction by the final CommandBuffer mask
                // channel (R). The generated UV mask keeps the face surface
                // coverage but removes only lips, eyes and brows.
                return fixed4(CorrectCameraColor(cameraColor, finalMask), 1.0);
            }
            ENDCG
        }
    }

    FallBack Off
}
