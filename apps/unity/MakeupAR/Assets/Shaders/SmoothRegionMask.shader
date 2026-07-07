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
        [HideInInspector] _HandOcclusionEnabled ("Hand Occlusion Enabled", Float) = 0
        [HideInInspector] _HandOcclusionUseRect ("Hand Occlusion Use Rect", Float) = 0
        [HideInInspector] _HandOcclusionRect ("Hand Occlusion Rect", Vector) = (0, 0, 0, 0)
        [HideInInspector] _HandOcclusionMaskTex ("Hand Occlusion Mask", 2D) = "black" {}
        [HideInInspector] _FoundationMode ("Foundation Mode", Float) = 0
        [HideInInspector] _FoundationDynamicMaskTex ("Foundation Dynamic Mask", 2D) = "black" {}
        [HideInInspector] _FoundationDynamicMaskValid ("Foundation Dynamic Mask Valid", Float) = 0
        [HideInInspector] _FoundationExclusionEnabled ("Foundation Exclusion Enabled", Float) = 1
        [HideInInspector] _FoundationDebugMode ("Foundation Debug Mode", Float) = 0
        [HideInInspector] _FoundationEyeExclusionL ("Foundation Left Eye Exclusion", Vector) = (0.355, 0.674, 0.235, 0.125)
        [HideInInspector] _FoundationEyeExclusionR ("Foundation Right Eye Exclusion", Vector) = (0.645, 0.674, 0.235, 0.125)
        [HideInInspector] _FoundationBrowExclusionL ("Foundation Left Brow Exclusion", Vector) = (0.355, 0.770, 0.230, 0.090)
        [HideInInspector] _FoundationBrowExclusionR ("Foundation Right Brow Exclusion", Vector) = (0.645, 0.770, 0.230, 0.090)
        [HideInInspector] _FoundationMouthExclusion ("Foundation Mouth Exclusion", Vector) = (0.500, 0.425, 0.330, 0.135)
        [HideInInspector] _FoundationEyeFeather ("Foundation Eye Feather", Float) = 0.52
        [HideInInspector] _FoundationBrowFeather ("Foundation Brow Feather", Float) = 0.54
        [HideInInspector] _FoundationMouthFeather ("Foundation Mouth Feather", Float) = 0.62
        [HideInInspector] _FoundationUpperForeheadStart ("Foundation Upper Forehead Start", Float) = 0.735
        [HideInInspector] _FoundationUpperForeheadEnd ("Foundation Upper Forehead End", Float) = 0.900
        [HideInInspector] _FoundationOuterFalloffStrength ("Foundation Outer Falloff Strength", Float) = 0.78
        [HideInInspector] _FoundationMaskBoostForDebug ("Foundation Mask Boost For Debug", Float) = 1.45
        _UserSkinBaseColor ("User Skin Base Color", Color) = (0.78, 0.60, 0.51, 1)
        _FoundationIntensity ("Foundation Intensity", Range(0, 1)) = 0.5
        _FoundationEvenness ("Foundation Evenness", Range(0, 1)) = 0.3
        _FoundationLuminanceInfluence ("Foundation Luminance Influence", Range(0, 1)) = 0.35
        _FoundationMaxLumShift ("Foundation Max Luminance Shift", Range(0, 0.25)) = 0.12
        _FoundationGlowAmount ("Foundation Glow Amount", Range(0, 1)) = 0
        _FoundationVisibleBoost ("Foundation Visible Boost", Range(0.5, 2.5)) = 1.0
        _Coverage ("Coverage", Range(0, 1)) = 0.62
        _MaskOffset ("Mask UV Offset", Vector) = (0, 0, 0, 0)
        _MaskSpreadX ("Mask Spread X", Float) = 0
        [HideInInspector] _HalfFaceMode ("Half Face Mode", Float) = 0
        _Roughness ("Roughness", Range(0, 1)) = 0.88
        _Specular ("Specular", Range(0, 1)) = 0.04
        _SpecularPower ("Specular Power", Range(1, 64)) = 8
        _GlossBoost ("Gloss Boost", Range(0, 1)) = 0
        _GlossColor ("Gloss Color", Color) = (1.0, 0.965, 0.92, 1)
        _GlossSharpness ("Gloss Sharpness", Range(0, 1)) = 0.72
        _GlossHaloIntensity ("Gloss Halo Intensity", Range(0, 1)) = 0.07
        _HighlightThreshold ("Highlight Threshold", Range(0, 1)) = 0.68
        _ExistingHighlightBoost ("Existing Highlight Boost", Range(0, 1)) = 0.28
        _LowerLipHighlightWeight ("Lower Lip Highlight Weight", Range(0, 1)) = 1
        _UpperLipHighlightWeight ("Upper Lip Highlight Weight", Range(0, 1)) = 0.45
        _GradientAmount ("Gradient Amount", Range(0, 1)) = 0
        _DetailAmount ("Detail Amount", Range(0, 1)) = 0
        [HideInInspector] _BrowGeneratedMode ("Generated Brow Mode", Float) = 0
        [HideInInspector] _BrowCleanupStrength ("Brow Cleanup Strength", Range(0, 1)) = 0
        [HideInInspector] _BrowNeutralizeStrength ("Brow Neutralize Strength", Range(0, 1)) = 0
        // Directional skin inpaint (BROW v1): covers the user's natural brow
        // with forehead skin sampled from the live camera (SkinGate path)
        // BEFORE the drawn brow pigment is composited, killing the
        // "double-brow" show-through. All inpaint is gated on _SkinGateEnabled
        // and mask.r; with the gate off it is an exact no-op.
        [HideInInspector] _BrowInpaintStrength ("Brow Inpaint Opacity", Range(0, 1)) = 0.92
        [HideInInspector] _BrowInpaintTapDistance ("Brow Inpaint Tap Distance (screen UV)", Float) = 0.045
        [HideInInspector] _BrowInpaintFeather ("Brow Inpaint Edge Feather", Range(0.001, 0.5)) = 0.12
        _PreserveDetail ("Preserve Detail", Range(0, 1)) = 1
        _DensityPower ("Density Power", Range(0, 1)) = 0.72
        _EdgeSoftness ("Edge Softness", Range(0, 1)) = 0.86
        _SkinPreserve ("Skin Preserve", Range(0, 1)) = 0.78
        _SaturationBoost ("Saturation Boost", Range(0, 1)) = 0.24
        _Warmth ("Warmth", Range(0, 1)) = 0.22
        _BlushIntensity ("Blush Intensity", Range(0, 1)) = 0.5
        _LipStyleMode ("Lip Style Mode", Float) = -1
        [HideInInspector] _CheekBlushMode ("Cheek Blush Mode", Float) = 0
        [HideInInspector] _EyelinerMode ("Eyeliner Mode", Float) = 0
        [HideInInspector] _LensMode ("Lens Mode", Float) = 0
        [HideInInspector] _LensEyeVis ("Lens Eye Visibility", Vector) = (1, 1, 0, 0)
        [HideInInspector] _BrowGateTex ("Brow Gate", 2D) = "white" {}
        [HideInInspector] _BrowGateValid ("Brow Gate Valid", Float) = 0
        [HideInInspector] _CheekUvTransform ("Cheek UV Transform", Vector) = (1, 1, 0, 0)
        [HideInInspector] _CheekPartUvTransform ("Cheek Part UV Transform", Vector) = (1, 1, 0, 0)
        [HideInInspector] _CheekPartBlend ("Cheek Part Blend", Float) = 0
        [HideInInspector] _CheekDensityGain ("Cheek Density Gain", Float) = 1
        [HideInInspector] _CheekCenterGain ("Cheek Center Gain", Float) = 0
        [HideInInspector] _PigmentMultiply ("Pigment Multiply", Float) = 0
        [HideInInspector] _SkinGateEnabled ("Skin Gate Enabled", Float) = 0
        [HideInInspector] _SkinGateStrength ("Skin Gate Strength", Range(0, 1)) = 0.85
        [HideInInspector] _SkinGateCenterWeight ("Skin Gate Center Weight", Range(0, 1)) = 0.3
        [HideInInspector] _SkinGateTolerance ("Skin Gate Tolerance", Range(0.01, 1)) = 0.13
        [HideInInspector] _SkinGateCameraMode ("Skin Gate Camera Mode", Float) = 0
        [HideInInspector] _SkinGateCameraTex ("Skin Gate Camera Texture", 2D) = "black" {}
        [HideInInspector] _SkinGateTexY ("Skin Gate Texture Y", 2D) = "black" {}
        [HideInInspector] _SkinGateTexCbCr ("Skin Gate Texture CbCr", 2D) = "gray" {}
        [HideInInspector] _SkinGateRefA ("Skin Gate Reference A", Vector) = (0.5, 0.5, 0, 0)
        [HideInInspector] _SkinGateRefB ("Skin Gate Reference B", Vector) = (0.5, 0.5, 0, 0)
        [HideInInspector] _SkinGateRefC ("Skin Gate Reference C", Vector) = (0.5, 0.5, 0, 0)
        [HideInInspector] _SkinGateUvRect ("Skin Gate Uv Rect", Vector) = (0, 1, 1, 0)
        [HideInInspector] _SkinGateFailSafe ("Skin Gate Fail Safe", Float) = 0
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

        // NOTE: A GrabPass was removed here. It captured the full camera frame
        // every frame for EVERY region sharing this shader (foundation, lip,
        // cheek, brow, eyeliner), which caused a per-frame full-screen grab and
        // visible camera flicker. Its only consumer was the generated-brow
        // "real-brow neutralize" inpaint, an enhancement that has been dropped;
        // the generated brow now composites its core+strand pigment directly.

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
            sampler2D _HandOcclusionMaskTex;
            sampler2D _FoundationDynamicMaskTex;
            float4 _MaskTex_TexelSize;
            float4 _RegionColor;
            float4 _SecondaryColor;
            float4 _GlossColor;
            float _Opacity;
            float _Threshold;
            float _Feather;
            float _VisibilityAlpha;
            float _HandOcclusionEnabled;
            float _HandOcclusionUseRect;
            float4 _HandOcclusionRect;
            float _FoundationMode;
            float _FoundationDynamicMaskValid;
            float _FoundationExclusionEnabled;
            float _FoundationDebugMode;
            float4 _FoundationEyeExclusionL;
            float4 _FoundationEyeExclusionR;
            float4 _FoundationBrowExclusionL;
            float4 _FoundationBrowExclusionR;
            float4 _FoundationMouthExclusion;
            float _FoundationEyeFeather;
            float _FoundationBrowFeather;
            float _FoundationMouthFeather;
            float _FoundationUpperForeheadStart;
            float _FoundationUpperForeheadEnd;
            float _FoundationOuterFalloffStrength;
            float _FoundationMaskBoostForDebug;
            float4 _UserSkinBaseColor;
            float _FoundationIntensity;
            float _FoundationEvenness;
            float _FoundationLuminanceInfluence;
            float _FoundationMaxLumShift;
            float _FoundationGlowAmount;
            float _FoundationVisibleBoost;
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
            float _BrowInpaintStrength;
            float _BrowInpaintTapDistance;
            float _BrowInpaintFeather;
            float _PreserveDetail;
            float _DensityPower;
            float _EdgeSoftness;
            float _SkinPreserve;
            float _SaturationBoost;
            float _Warmth;
            float _BlushIntensity;
            float _LipStyleMode;
            float _CheekBlushMode;
            float _EyelinerMode;
            float _LensMode;
            float4 _LensEyeVis;
            sampler2D _BrowGateTex;
            float _BrowGateValid;
            float4 _CheekUvTransform;
            float4 _CheekPartUvTransform;
            float _CheekPartBlend;
            float _CheekDensityGain;
            float _CheekCenterGain;
            float _PigmentMultiply;
            float _UseScreenSpaceMask;
            float _DebugMaskMode;
            float _SkinGateEnabled;
            float _SkinGateStrength;
            float _SkinGateCenterWeight;
            float _SkinGateTolerance;
            float _SkinGateCameraMode;
            sampler2D _SkinGateCameraTex;
            sampler2D _SkinGateTexY;
            sampler2D _SkinGateTexCbCr;
            float4 _SkinGateRefA;
            float4 _SkinGateRefB;
            float4 _SkinGateRefC;
            float4 _SkinGateUvRect;
            float _SkinGateFailSafe;
            float4x4 _SkinGateDisplayTransform;
            // Half-face makeup: 0 = off (exact no-op), 1 = keep canonical face
            // UV x < 0.5, 2 = keep x > 0.5.
            float _HalfFaceMode;

            // ---- Camera-texture skin gate -------------------------------
            // Compares each pixel's chroma against a live skin reference
            // sampled at stable face points (cheeks/chin). Suppresses
            // foundation on hair, brows, clothing and background that the
            // UV mask alone cannot separate from skin. Gate weight is
            // strongest near the hairline/side edges (and on the neck skirt,
            // which sets _SkinGateCenterWeight to 1) and softer at the face
            // center so ordinary shading and shadows are not stripped.
            float3 SampleSkinGateCamera(float2 screenUv)
            {
                float2 cameraUv = mul(float4(screenUv, 1.0, 1.0), _SkinGateDisplayTransform).xy;
                if (_SkinGateCameraMode > 1.5)
                {
                    float lumaY = tex2D(_SkinGateTexY, cameraUv).r;
                    float2 cbcr = tex2D(_SkinGateTexCbCr, cameraUv).rg - float2(0.5, 0.5);
                    return saturate(float3(
                        lumaY + 1.4020 * cbcr.y,
                        lumaY - 0.3441 * cbcr.x - 0.7141 * cbcr.y,
                        lumaY + 1.7720 * cbcr.x));
                }

                return saturate(tex2D(_SkinGateCameraTex, cameraUv).rgb);
            }

            float2 SkinGateChroma(float3 color)
            {
                float cb = -0.1146 * color.r - 0.3854 * color.g + 0.5 * color.b;
                float cr = 0.5 * color.r - 0.4542 * color.g - 0.0458 * color.b;
                return float2(cb, cr);
            }

            float SkinGateVisibility(float4 clipPos, float2 maskUv)
            {
                float sideDistanceEarly = min(
                    maskUv.x - _SkinGateUvRect.x,
                    _SkinGateUvRect.y - maskUv.x);
                float sideProximityEarly = 1.0 - smoothstep(0.02, 0.17, sideDistanceEarly);
                float topProximityEarly = smoothstep(
                    _SkinGateUvRect.z - 0.22,
                    _SkinGateUvRect.z - 0.05,
                    maskUv.y);
                float edgeProximityEarly = saturate(max(sideProximityEarly, topProximityEarly));

                if (_SkinGateEnabled < 0.5)
                {
                    // FAIL-SAFE (foundation materials only): when the camera
                    // gate is unavailable, never fail-open into painting hair.
                    // Fade the hairline/side zones instead.
                    return _SkinGateFailSafe > 0.5
                        ? lerp(1.0, 0.30, edgeProximityEarly)
                        : 1.0;
                }

                float3 referenceSum = float3(0.0, 0.0, 0.0);
                float referenceCount = 0.0;
                if (_SkinGateRefA.z > 0.5)
                {
                    referenceSum += SampleSkinGateCamera(_SkinGateRefA.xy);
                    referenceCount += 1.0;
                }

                if (_SkinGateRefB.z > 0.5)
                {
                    referenceSum += SampleSkinGateCamera(_SkinGateRefB.xy);
                    referenceCount += 1.0;
                }

                if (_SkinGateRefC.z > 0.5)
                {
                    referenceSum += SampleSkinGateCamera(_SkinGateRefC.xy);
                    referenceCount += 1.0;
                }

                if (referenceCount < 0.5)
                {
                    return 1.0;
                }

                float2 ndc = clipPos.xy / max(clipPos.w, 0.00001);
                float2 screenUv = saturate(ndc * 0.5 + 0.5);
                float3 pixel = SampleSkinGateCamera(screenUv);
                float3 reference = referenceSum / referenceCount;
                float chromaDistance = length(SkinGateChroma(pixel) - SkinGateChroma(reference));
                float similarity = 1.0 - smoothstep(
                    _SkinGateTolerance,
                    _SkinGateTolerance * 2.3,
                    chromaDistance);
                float pixelLum = dot(pixel, float3(0.2126, 0.7152, 0.0722));
                float referenceLum = max(dot(reference, float3(0.2126, 0.7152, 0.0722)), 0.05);
                // Dark-hair suppression: hair and brow pixels are far darker
                // than sampled skin even when their chroma is ambiguous.
                float darkGate = smoothstep(0.26, 0.52, pixelLum / referenceLum);
                float gate = saturate(similarity * darkGate);

                float sideDistance = min(
                    maskUv.x - _SkinGateUvRect.x,
                    _SkinGateUvRect.y - maskUv.x);
                float sideProximity = 1.0 - smoothstep(0.02, 0.17, sideDistance);
                float topProximity = smoothstep(
                    _SkinGateUvRect.z - 0.22,
                    _SkinGateUvRect.z - 0.05,
                    maskUv.y);
                float edgeProximity = saturate(max(sideProximity, topProximity));
                float weight = lerp(saturate(_SkinGateCenterWeight), 1.0, edgeProximity)
                    * saturate(_SkinGateStrength);
                return lerp(1.0, gate, saturate(weight));
            }

            // ---- BROW v1 directional forehead-skin inpaint --------------
            // Samples live camera skin a few taps UPWARD (toward the
            // forehead) from the current pixel and returns an RGB fill that
            // covers the user's natural brow. Sampling only upward avoids
            // pulling dark orbital/lash/eye pixels; a per-tap dark reject
            // discards any tap that is much darker than the sampled skin
            // reference (i.e. a tap that still landed on brow hair). Returns
            // valid == 0 when SkinGate is unavailable so the caller can fall
            // back to today's behavior (exact no-op).
            float3 SampleBrowInpaintSkin(float4 clipPos, out float valid)
            {
                valid = 0.0;
                if (_SkinGateEnabled < 0.5)
                {
                    return float3(0.0, 0.0, 0.0);
                }

                // Skin reference luminance from the same stable anchors the
                // gate uses (cheeks/chin). Used to reject dark (brow/lash)
                // taps rather than smearing them upward as "skin".
                float3 referenceSum = float3(0.0, 0.0, 0.0);
                float referenceCount = 0.0;
                if (_SkinGateRefA.z > 0.5)
                {
                    referenceSum += SampleSkinGateCamera(_SkinGateRefA.xy);
                    referenceCount += 1.0;
                }
                if (_SkinGateRefB.z > 0.5)
                {
                    referenceSum += SampleSkinGateCamera(_SkinGateRefB.xy);
                    referenceCount += 1.0;
                }
                if (_SkinGateRefC.z > 0.5)
                {
                    referenceSum += SampleSkinGateCamera(_SkinGateRefC.xy);
                    referenceCount += 1.0;
                }
                if (referenceCount < 0.5)
                {
                    return float3(0.0, 0.0, 0.0);
                }
                float3 reference = referenceSum / referenceCount;
                float referenceLum = max(dot(reference, float3(0.2126, 0.7152, 0.0722)), 0.05);

                float2 ndc = clipPos.xy / max(clipPos.w, 0.00001);
                float2 screenUv = saturate(ndc * 0.5 + 0.5);

                // Front selfie: the head renders upright, so the forehead is
                // ABOVE the brow on screen, i.e. increasing screen-UV.y. Three
                // upward taps (near/mid/far) are averaged for stability; each
                // tap is chroma/luma-checked against the skin reference and
                // rejected if it is too dark (still on brow hair) or too far
                // off-chroma (hairline/shadow).
                float tap = max(_BrowInpaintTapDistance, 0.0);
                float3 skinAccum = float3(0.0, 0.0, 0.0);
                float skinWeight = 0.0;
                [unroll]
                for (int i = 0; i < 3; i++)
                {
                    float2 sampleUv = saturate(screenUv + float2(0.0, tap * (1.0 + (float)i)));
                    float3 c = SampleSkinGateCamera(sampleUv);
                    float lum = dot(c, float3(0.2126, 0.7152, 0.0722));
                    // Reject taps that are much darker than skin (brow/lash).
                    float darkAccept = smoothstep(0.42, 0.72, lum / referenceLum);
                    // Reject taps whose chroma drifts far from skin (hairline).
                    float chromaDist = length(SkinGateChroma(c) - SkinGateChroma(reference));
                    float chromaAccept = 1.0 - smoothstep(
                        _SkinGateTolerance * 1.6,
                        _SkinGateTolerance * 3.4,
                        chromaDist);
                    // Weight nearer taps a little higher so the fill matches
                    // the local skin just above the brow.
                    float tapWeight = darkAccept * chromaAccept * (1.0 - 0.18 * (float)i);
                    skinAccum += c * tapWeight;
                    skinWeight += tapWeight;
                }

                if (skinWeight < 0.001)
                {
                    // Every upward tap was rejected (e.g. tall/dense brow):
                    // fall back to the sampled skin reference so we still
                    // cover the natural brow with a plausible skin tone.
                    valid = 1.0;
                    return reference;
                }

                valid = 1.0;
                return skinAccum / skinWeight;
            }

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 vertex : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 clipPos : TEXCOORD1;
                // How directly this surface faces the camera (1 = head-on,
                // ~0 = edge-on). Used to fade the brow tail as the face turns to
                // profile, where the UV-glued mask would otherwise smear/stretch.
                float facing : TEXCOORD2;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.vertex = UnityObjectToClipPos(input.vertex);
                output.clipPos = output.vertex;
                output.uv = input.uv;
                float3 worldNormal = UnityObjectToWorldNormal(input.normal);
                float3 worldPos = mul(unity_ObjectToWorld, input.vertex).xyz;
                float3 viewDir = normalize(_WorldSpaceCameraPos.xyz - worldPos);
                output.facing = saturate(dot(worldNormal, viewDir));
                return output;
            }

            float HandOcclusionVisibility(float4 clipPos)
            {
                if (_HandOcclusionEnabled < 0.5)
                {
                    return 1.0;
                }

                float2 ndc = clipPos.xy / max(clipPos.w, 0.00001);
                float2 screenUv = saturate(ndc * 0.5 + 0.5);
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

            float FoundationLuma(float3 color)
            {
                return dot(color, float3(0.2126, 0.7152, 0.0722));
            }

            float FoundationEllipse(float2 uv, float2 center, float2 radius, float feather)
            {
                float2 local = (uv - center) / max(radius, float2(0.0001, 0.0001));
                float dist = dot(local, local);
                return 1.0 - smoothstep(1.0, 1.0 + max(feather, 0.001), dist);
            }

            float FoundationExclusionEllipse(float2 uv, float4 ellipse, float feather)
            {
                return FoundationEllipse(uv, ellipse.xy, max(ellipse.zw, float2(0.0001, 0.0001)), feather);
            }

            float FoundationFeatureExclusion(float2 uv, out float exclusionPreview)
            {
                if (_FoundationExclusionEnabled < 0.5)
                {
                    exclusionPreview = 0.0;
                    return 1.0;
                }

                float leftEye = FoundationExclusionEllipse(uv, _FoundationEyeExclusionL, _FoundationEyeFeather);
                float rightEye = FoundationExclusionEllipse(uv, _FoundationEyeExclusionR, _FoundationEyeFeather);
                float glassesBridge = FoundationEllipse(uv, float2(0.500, 0.674), float2(0.092, 0.058), 0.40) * 0.70;
                float eyeBand = FoundationEllipse(uv, float2(0.500, 0.674), float2(0.472, 0.158), 0.48) * 0.26;
                float leftBrow = FoundationExclusionEllipse(uv, _FoundationBrowExclusionL, _FoundationBrowFeather);
                float rightBrow = FoundationExclusionEllipse(uv, _FoundationBrowExclusionR, _FoundationBrowFeather);
                float browBridge = FoundationEllipse(uv, float2(0.500, 0.748), float2(0.355, 0.090), 0.50) * 0.72;
                float mouth = FoundationExclusionEllipse(uv, _FoundationMouthExclusion, _FoundationMouthFeather);
                float mouthBand = FoundationEllipse(uv, float2(0.500, 0.472), float2(0.300, 0.078), 0.58) * 0.55;
                float nostril = FoundationEllipse(uv, float2(0.500, 0.555), float2(0.136, 0.046), 0.44) * 0.28;
                float exclusion = saturate(max(
                    max(max(leftEye, rightEye), max(glassesBridge, max(eyeBand, browBridge))),
                    max(max(leftBrow, rightBrow), max(mouth, max(mouthBand, nostril)))));
                exclusionPreview = exclusion;
                return 1.0 - exclusion;
            }

            float FoundationRegionWeight(float2 uv)
            {
                float2 faceLocal = (uv - float2(0.500, 0.515)) / float2(0.425, 0.492);
                float faceDistance = dot(faceLocal, faceLocal);
                float faceCore = 1.0 - smoothstep(0.58, 1.00, faceDistance);
                float contourFeather = 1.0 - smoothstep(0.42, 0.96, faceDistance) * saturate(_FoundationOuterFalloffStrength);

                float leftCheek = FoundationEllipse(uv, float2(0.335, 0.535), float2(0.172, 0.198), 0.84);
                float rightCheek = FoundationEllipse(uv, float2(0.665, 0.535), float2(0.172, 0.198), 0.84);
                float noseCenter = FoundationEllipse(uv, float2(0.500, 0.592), float2(0.106, 0.178), 0.70);
                float lowerNoseCheek = FoundationEllipse(uv, float2(0.500, 0.505), float2(0.236, 0.162), 0.82) * 0.50;
                float chin = FoundationEllipse(uv, float2(0.500, 0.315), float2(0.200, 0.118), 0.78) * 0.62;
                float lowForehead = FoundationEllipse(uv, float2(0.500, 0.805), float2(0.190, 0.072), 0.58) * 0.28;
                float skinIslands = saturate(max(
                    max(leftCheek, rightCheek),
                    max(max(noseCenter, lowerNoseCheek), max(chin, lowForehead))));

                float eyeFalloff = 1.0 - FoundationEllipse(uv, float2(0.500, 0.680), float2(0.455, 0.170), 0.52) * 0.64;
                float mouthFalloff = 1.0 - FoundationEllipse(uv, float2(0.500, 0.425), float2(0.335, 0.128), 0.58) * 0.62;
                // Hairline and bangs need segmentation for production quality; v1 uses a conservative UV falloff.
                float hairlineFalloff = lerp(1.0, 0.06, smoothstep(_FoundationUpperForeheadStart, _FoundationUpperForeheadEnd, uv.y));
                float jawFalloff = lerp(0.34, 1.0, smoothstep(0.145, 0.250, uv.y));

                return saturate(faceCore * skinIslands * contourFeather * eyeFalloff * mouthFalloff * hairlineFalloff * jawFalloff);
            }

            float3 FoundationToneFilter(float visibleSkin)
            {
                float coverageAmount = saturate(_Coverage);
                float luminanceInfluence = saturate(_FoundationLuminanceInfluence);
                float amount = saturate(
                    _FoundationIntensity
                    * lerp(0.75, 1.35, coverageAmount)
                    * max(_FoundationVisibleBoost, 0.1))
                    * visibleSkin;
                float3 userSkin = max(saturate(_UserSkinBaseColor.rgb), float3(0.075, 0.075, 0.075));
                float3 foundation = max(saturate(_RegionColor.rgb), float3(0.075, 0.075, 0.075));
                float userLum = max(FoundationLuma(userSkin), 0.08);
                float foundationLum = FoundationLuma(foundation);
                float3 chromaRatio = foundation / userSkin;
                float chromaRatioLum = max(FoundationLuma(chromaRatio), 0.08);
                chromaRatio /= chromaRatioLum;
                float chromaDelta = length(chromaRatio - float3(1.0, 1.0, 1.0));
                float deltaBoost = lerp(1.6, 1.0, saturate(chromaDelta * 1.75));
                float lumShift = clamp(
                    foundationLum - userLum,
                    -max(_FoundationMaxLumShift, 0.001),
                    max(_FoundationMaxLumShift, 0.001));
                float lumFilter = 1.0 + (lumShift / userLum) * luminanceInfluence;
                float3 targetFilter = lerp(float3(1.0, 1.0, 1.0), chromaRatio, saturate(coverageAmount * deltaBoost));
                targetFilter *= lerp(1.0, lumFilter, luminanceInfluence);
                float filterLum = FoundationLuma(targetFilter);
                targetFilter = lerp(
                    targetFilter,
                    float3(filterLum, filterLum, filterLum),
                    saturate(_FoundationEvenness) * 0.16);
                targetFilter += _FoundationGlowAmount * visibleSkin * 0.024;
                return lerp(float3(1.0, 1.0, 1.0), saturate(targetFilter), amount);
            }

            fixed4 frag(v2f input) : SV_Target
            {
                // Half-face makeup gate. Uses the RAW mesh/canonical face UV.x
                // (x=0.5 is the face centerline), BEFORE the _MaskSpreadX /
                // _MaskOffset remap below. mode 1 keeps x < 0.5, mode 2 keeps
                // x > 0.5; the excluded half returns fully transparent so the
                // bare camera face shows through. mode 0 (off) is a no-op.
                if (_HalfFaceMode > 0.5)
                {
                    bool keepLeft = _HalfFaceMode < 1.5;   // mode 1 -> keep uv.x < 0.5
                    bool onKeptSide = keepLeft ? (input.uv.x < 0.5) : (input.uv.x > 0.5);
                    if (!onKeptSide)
                    {
                        // discard skips the pixel entirely so the excluded half
                        // shows the bare camera face under ANY blend mode. An
                        // alpha-0 return still paints BLACK where the region uses
                        // a multiply/opaque blend (lip, cheek), which is the bug.
                        discard;
                    }
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

                if (_FoundationMode > 0.5)
                {
                    float rawFoundationMask = fullSoft;
                    float exclusionPreview = 0.0;
                    float featureExclusion = FoundationFeatureExclusion(maskUv, exclusionPreview);
                    float regionWeight = FoundationRegionWeight(maskUv);
                    float baseFoundationMask = saturate(rawFoundationMask * regionWeight);
                    float staticFoundationMask = saturate(baseFoundationMask * featureExclusion);
                    float2 foundationScreenUv = saturate((input.clipPos.xy / max(input.clipPos.w, 0.00001)) * 0.5 + 0.5);
                    float4 dynamicFoundationSample = tex2D(_FoundationDynamicMaskTex, foundationScreenUv);
                    float dynamicFoundationMask = saturate(dynamicFoundationSample.r);
                    float foundationMask = _FoundationDynamicMaskValid > 0.5
                        ? dynamicFoundationMask
                        : staticFoundationMask;
                    float foundationDebugMode = max(_FoundationDebugMode, _DebugMaskMode);
                    float visibleSkin = saturate(
                        foundationMask
                        * _VisibilityAlpha
                        * HandOcclusionVisibility(input.clipPos));

                    if (foundationDebugMode > 0.5 && foundationDebugMode < 1.5)
                    {
                        return fixed4(baseFoundationMask.xxx, saturate(baseFoundationMask * 0.88));
                    }

                    if (foundationDebugMode >= 1.5 && foundationDebugMode < 2.5)
                    {
                        return fixed4(exclusionPreview, 0.08, 0.0, saturate(exclusionPreview * 0.88));
                    }

                    if (foundationDebugMode >= 2.5 && foundationDebugMode < 3.5)
                    {
                        return fixed4(visibleSkin.xxx, saturate(visibleSkin * 0.92));
                    }

                    if (foundationDebugMode >= 3.5)
                    {
                        float preview = saturate(visibleSkin * max(_FoundationMaskBoostForDebug, 1.0));
                        return fixed4(lerp(float3(0.0, 0.0, 0.0), _RegionColor.rgb, preview), saturate(preview * 0.92));
                    }

                    if (_PigmentMultiply > 0.5)
                    {
                        return fixed4(FoundationToneFilter(visibleSkin), 1.0);
                    }

                    float foundationAlpha = saturate(
                        visibleSkin
                        * max(_Opacity, 0.28)
                        * lerp(0.70, 1.02, saturate(_FoundationIntensity)));
                    float3 fallbackTint = lerp(_UserSkinBaseColor.rgb, _RegionColor.rgb, saturate(_Coverage));
                    return fixed4(saturate(fallbackTint), foundationAlpha);
                }

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
                    // Mouth guard: photo-derived cheek session masks can carry
                    // lip-corner residue; suppress any blush contribution in
                    // the mouth neighborhood (face-local anatomy space, so it
                    // holds for every user, mask and UV transform).
                    float cheekMouthGuard = 1.0 - FoundationEllipse(
                        maskUv,
                        float2(0.500, 0.360),
                        float2(0.210, 0.105),
                        0.55);
                    cheekGrayRaw *= cheekMouthGuard;
                    cheekGrayBlurred *= cheekMouthGuard;

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

                if (_EyelinerMode > 0.5)
                {
                    // Eyeliner is a thin drawn line, not a diffuse stain: the
                    // generic path (blurred fullSoft * 0.54) can never get
                    // darker than ~40% alpha, which reads as a gray smudge.
                    // Sample the RAW mask so the line stays crisp, weight the
                    // core near full strength, and let coverage only trim the
                    // strength gently instead of scaling it to nothing.
                    float linerCore = CoreMaskAlpha(mask.r, _Threshold, _Feather * 0.6);
                    float linerSoft = SoftMaskAlpha(mask.r, _Threshold, _Feather);
                    // Modulate by the raw mask value so authored sub-full
                    // weights (e.g. the doll style's 55% under-eye shading)
                    // keep their intended density instead of being pushed to
                    // full strength by the smoothstep.
                    float linerDensity = saturate(mask.r * 1.06);
                    maskStrength = saturate(linerCore * linerDensity * 0.92 + linerSoft * 0.20)
                        * lerp(0.75, 1.0, coverage);
                }

                if (_LensMode > 0.5)
                {
                    // Colored contact lens (iris tint). The rasterized disc mask
                    // carries the radial profile in R (0 = pupil hole / outside
                    // the disc, ramps up through the iris annulus, feathered at
                    // the rim) and the limbal darken factor in G. We sample the
                    // RAW disc (no soft blur) so the profile is not smeared
                    // across the eye "hole", and use R directly as the coverage
                    // — this HARD-CLIPS to the disc (fix #2/#3): everything
                    // outside the disc is already 0 in the mask, so no sclera or
                    // eyelid ever receives color.
                    float lensProfile = saturate(mask.r);

                    // Per-eye geometric blink (fix #4): split on the canonical
                    // face UV centerline (x < 0.5 = left eye). As the lid closes
                    // the matching eye's visibility fades to 0, hiding the disc.
                    float lensEyeVis = input.uv.x < 0.5 ? _LensEyeVis.x : _LensEyeVis.y;

                    // Limbal ring: darken the tint toward the natural dark iris
                    // rim using the G factor. This keeps a printed-contact look
                    // (dark edge, colored body) instead of a flat coin.
                    float3 lensColor = saturate(lerp(
                        _RegionColor.rgb,
                        _RegionColor.rgb * 0.55,
                        saturate(mask.g)));

                    // ALPHA OVERLAY, NOT MULTIPLY (fix #1). _Opacity is the
                    // lens opacity from the recipe (up to ~0.85); it is NOT run
                    // through the multiply pigmentStrength cap. A semi-opaque
                    // color overlaid on the iris changes even dark eyes
                    // believably while the pupil hole keeps gaze realistic.
                    float lensAlpha = saturate(
                        lensProfile
                        * saturate(_Opacity)
                        * saturate(_VisibilityAlpha)
                        * saturate(lensEyeVis)
                        * HandOcclusionVisibility(input.clipPos));

                    if (_DebugMaskMode > 0.5)
                    {
                        return fixed4(lensProfile.xxx, saturate(lensProfile * 0.9));
                    }

                    // Early return via the standard alpha blend
                    // (Blend [_SrcBlend] [_DstBlend] = SrcAlpha OneMinusSrcAlpha
                    // for blendMode 'normal'); BYPASSES the _PigmentMultiply cap
                    // block below entirely.
                    return fixed4(lensColor, lensAlpha);
                }

                if (_BrowGeneratedMode > 0.5)
                {
                    float desiredSoft = SoftMaskAlpha(max(softMask.g, mask.g), _Threshold, _Feather);
                    float desiredCore = CoreMaskAlpha(mask.g, _Threshold, _Feather);
                    float strandDetail = saturate(max(mask.b, softMask.b * 0.34) * desiredSoft);
                    float strandAmount = saturate(_DetailAmount) * saturate(_PreserveDetail);
                    // Defined brow: lean on the CORE mask (sharp body) with only
                    // a thin soft halo, instead of a wide low-alpha soft outer
                    // layer that read as a hazy, spread-out wash (device
                    // feedback: remove the outer layer). The tight AA edge plus a
                    // sliver of desiredSoft keeps it from becoming a hard sticker.
                    float tintAlpha = saturate(
                        desiredCore * coverage * lerp(0.5, 0.9, saturate(_BlushIntensity))
                        + desiredSoft * coverage * 0.08);
                    // Step-3 polish: at the inpaint footprint boundary the skin
                    // fill feathers out, so any un-erased natural-brow residue
                    // there must be covered by PIGMENT rather than left as a
                    // fringe. Where the drawn soft body (mask.g) overlaps the
                    // RED neutralize footprint (mask.r) but is still thin, add a
                    // small density bump so the pigment slightly overhangs the
                    // erase edge. Gated on both channels so the brow SHAPE is
                    // not distorted (the bump only exists inside the footprint).
                    float browResidueGuard = saturate(desiredSoft * saturate(mask.r));
                    tintAlpha = saturate(tintAlpha + browResidueGuard * coverage * 0.10);
                    float hairAlpha = saturate(
                        pow(strandDetail, 0.68) * strandAmount * coverage * 0.82);
                    float browAlpha = saturate(
                        tintAlpha
                        + hairAlpha);
                    // Core darkening is smoothed (smoothstep instead of a hard
                    // *1.34 ramp) with a gentler floor (0.6 vs 0.48) so the dense
                    // hair core no longer forms a hard seam against the lighter
                    // tint rim.
                    float coreDarken = smoothstep(0.04, 0.8, hairAlpha);
                    float3 browPigment = saturate(lerp(
                        _RegionColor.rgb,
                        _RegionColor.rgb * 0.6,
                        coreDarken));
                    // Keep the makeup-only values available for the debug overlays
                    // below (they render maskStrength/pigmentColor directly).
                    maskStrength = browAlpha;
                    pigmentColor = browPigment;
                    alphaColor = browPigment;

                  if (_DebugMaskMode < 0.5)
                  {
                    // View-angle fade: as the face turns to profile, the brow tail
                    // near the temple goes edge-on and the UV-glued mask smears
                    // outward (looks unnaturally long/stretched). Fade the brow out
                    // where the surface is grazing so that stretched tail
                    // disappears; head-on (facing ~1) is untouched, so the front
                    // view is unchanged. Only strongly grazing (>~60deg) fades.
                    float facingFade = smoothstep(0.16, 0.5, input.facing);

                    float browOpacity = saturate(_Opacity * _VisibilityAlpha);
                    // Makeup layer obeys the opacity slider.
                    float makeupAlpha = saturate(browAlpha * browOpacity * facingFade);

                    // BROW v1 directional skin inpaint. The mask RED channel is
                    // the "real-brow neutralize" footprint: it covers where the
                    // user's NATURAL brow sits (extending beyond the drawn body).
                    // We fill that footprint with forehead skin sampled UPWARD
                    // from the live camera so the natural brow is hidden BEFORE
                    // the drawn brow pigment composites on top of clean skin.
                    // Killing the "double-brow" show-through. This replaces the
                    // removed full-screen GrabPass neutralize with a per-pixel,
                    // flicker-free, Vision-free directional tap (no ScreenCapture).
                    //
                    // SkinGate-off is an EXACT no-op: skinValid == 0 forces
                    // inpaintAlpha == 0, so outAlpha == makeupAlpha and
                    // outRgb == browPigment (today's behavior).
                    float skinValid = 0.0;
                    float3 inpaintSkin = SampleBrowInpaintSkin(input.clipPos, skinValid);

                    // Footprint coverage: opaque where the RED neutralize mask
                    // is present (a dark natural brow needs a near-opaque fill),
                    // feathered at the edge so there is no visible skin patch
                    // rectangle. Also faded by facing so the profile view is not
                    // painted with a stretched skin smear, and by the opacity /
                    // visibility so the inpaint tracks the layer's own alpha.
                    float redFootprint = saturate(mask.r);
                    float footprintCoverage = smoothstep(
                        _Threshold,
                        _Threshold + max(_BrowInpaintFeather, 0.001),
                        redFootprint);
                    float inpaintAlpha = saturate(
                        footprintCoverage
                        * saturate(_BrowInpaintStrength)
                        * skinValid
                        * facingFade
                        * saturate(_VisibilityAlpha));

                    // Composite two straight-alpha layers over the live camera
                    // (dst) in ONE SrcAlpha/OneMinusSrcAlpha pass:
                    //   L1 = skin over camera  (alpha = inpaintAlpha)
                    //   L2 = brow over L1       (alpha = makeupAlpha)
                    // outAlpha = 1-(1-aS)(1-aB); outRgb weighted so the single
                    // blend reproduces skin-then-brow. When inpaintAlpha == 0
                    // this collapses to (browPigment, makeupAlpha) exactly.
                    float outAlpha = saturate(
                        1.0 - (1.0 - inpaintAlpha) * (1.0 - makeupAlpha));
                    float3 weightedColor =
                        browPigment * makeupAlpha
                        + inpaintSkin * inpaintAlpha * (1.0 - makeupAlpha);
                    float3 outRgb = outAlpha > 0.0001
                        ? weightedColor / outAlpha
                        : browPigment;
                    return fixed4(saturate(outRgb), outAlpha);
                  }
                }

                float detailAmount = saturate(_DetailAmount) * saturate(_PreserveDetail);
                if (_LipStyleMode < -0.5 && _CheekBlushMode < 0.5 && _EyelinerMode < 0.5
                    && _BrowGeneratedMode < 0.5 && detailAmount > 0.001)
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

                // Per-person brow gate: the Vision landmark polygon of the
                // USER'S eyebrow (screen-space band from the parsing
                // provider) clips the styled brow mask so it hugs their
                // actual brow instead of the canonical-UV guess. The wide
                // smoothstep keeps edges soft at the 192px mask resolution;
                // when the mask is stale/absent the gate stays off and the
                // styled mask renders unchanged.
                if (_BrowGateValid > 0.5)
                {
                    float2 browNdc = input.clipPos.xy / max(input.clipPos.w, 0.00001);
                    float2 browUv = saturate(browNdc * 0.5 + 0.5);
                    float browBand = tex2D(_BrowGateTex, browUv).r;
                    maskStrength *= smoothstep(0.02, 0.30, browBand);
                }

                float preserveScale = lerp(1.0, 0.92, saturate(_PreserveDetail));
                float opacity = saturate(_Opacity * _VisibilityAlpha)
                    * HandOcclusionVisibility(input.clipPos)
                    * SkinGateVisibility(input.clipPos, maskUv);

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
                    // Melt-into-lip: ease pigment toward white where the mask is
                    // thin (edges/creases) so the multiply blend reveals the real
                    // lip texture there. Only lowers pigment; never over-darkens.
                    float lipStructure = smoothstep(0.06, 0.55, saturate(maskStrength));
                    float meltEase = lerp(0.82, 1.0, lipStructure);
                    pigmentStrength = pigmentStrength * meltEase;
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
            sampler2D _HandOcclusionMaskTex;
            float4 _MaskTex_TexelSize;
            float4 _RegionColor;
            float4 _SecondaryColor;
            float4 _GlossColor;
            float _Opacity;
            float _Threshold;
            float _Feather;
            float _VisibilityAlpha;
            float _HandOcclusionEnabled;
            float _HandOcclusionUseRect;
            float4 _HandOcclusionRect;
            float _Coverage;
            float4 _MaskOffset;
            float _MaskSpreadX;
            float _Specular;
            float _SpecularPower;
            float _GlossBoost;
            float _GlossSharpness;
            float _GlossHaloIntensity;
            float _HighlightThreshold;
            float _ExistingHighlightBoost;
            float _LowerLipHighlightWeight;
            float _UpperLipHighlightWeight;
            float _LipStyleMode;
            float _BrowGeneratedMode;
            float _UseScreenSpaceMask;
            float _DebugMaskMode;
            // Half-face makeup: 0 = off (exact no-op), 1 = keep face UV x < 0.5,
            // 2 = keep x > 0.5.
            float _HalfFaceMode;

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

            float HandOcclusionVisibility(float4 clipPos)
            {
                if (_HandOcclusionEnabled < 0.5)
                {
                    return 1.0;
                }

                float2 ndc = clipPos.xy / max(clipPos.w, 0.00001);
                float2 screenUv = saturate(ndc * 0.5 + 0.5);
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

            float EllipseMask(float2 uv, float2 center, float2 radius, float feather)
            {
                float2 local = (uv - center) / max(radius, float2(0.0001, 0.0001));
                float dist = dot(local, local);
                return 1.0 - smoothstep(1.0, 1.0 + max(feather, 0.001), dist);
            }

            fixed4 frag(v2f input) : SV_Target
            {
                // Half-face gate for the additive gloss pass. This pass returns
                // alpha 0 and adds LIGHT (additiveGloss), so multiplying alpha
                // would NOT suppress it — we must early-out to zero on the
                // excluded half. Raw canonical face UV.x, mode 0 = no-op.
                if (_HalfFaceMode > 0.5)
                {
                    bool keepLeft = _HalfFaceMode < 1.5;
                    bool onKeptSide = keepLeft ? (input.uv.x < 0.5) : (input.uv.x > 0.5);
                    if (!onKeptSide)
                    {
                        // discard skips the pixel entirely so the excluded half
                        // shows the bare camera face under ANY blend mode. An
                        // alpha-0 return still paints BLACK where the region uses
                        // a multiply/opaque blend (lip, cheek), which is the bug.
                        discard;
                    }
                }

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
                float visibleLip = styleCoverage
                    * saturate(_VisibilityAlpha)
                    * HandOcclusionVisibility(input.clipPos);
                float2 lipLocal = maskUv - float2(0.5, 0.5);
                float horizontalCenter = 1.0 - smoothstep(0.10, 0.46, abs(lipLocal.x));
                float edgeGuard = saturate(max(styleCore, fullSoft * 0.62));
                float lowerCenter = EllipseMask(maskUv, float2(0.50, 0.435), float2(0.235, 0.060), 0.92);
                float lowerWetLine = EllipseMask(maskUv, float2(0.50, 0.405), float2(0.180, 0.030), 0.58);
                float upperCenter = EllipseMask(maskUv, float2(0.50, 0.565), float2(0.180, 0.038), 0.78);
                float upperWetLine = EllipseMask(maskUv, float2(0.50, 0.592), float2(0.125, 0.024), 0.52);
                float regionWeight = saturate(
                    (lowerCenter * 0.72 + lowerWetLine * 0.95) * saturate(_LowerLipHighlightWeight)
                    + (upperCenter * 0.48 + upperWetLine * 0.48) * saturate(_UpperLipHighlightWeight));
                float styleGlossSeed = saturate(max(glossMask.a, softGlossMask.a * 0.58));
                float densityHighlight = saturate(max(mask.b * 0.78, styleGlossSeed));
                float existingHighlight = smoothstep(
                    saturate(_HighlightThreshold * 0.72),
                    1.0,
                    densityHighlight);
                float centerSpec = pow(
                    saturate(regionWeight * horizontalCenter),
                    lerp(1.45, 3.35, saturate(_GlossSharpness)));
                float shardSpec = pow(
                    saturate(styleGlossSeed * regionWeight * 1.25),
                    lerp(0.95, 2.25, saturate(_GlossSharpness)));
                // Bias shine away from the fixed centerSpec blob toward the
                // atlas-density terms so it tracks the lip form. Glow only.
                float visibleHighlightMask = visibleLip
                    * edgeGuard
                    * saturate(centerSpec * 0.45 + shardSpec * 0.55 + existingHighlight * saturate(_ExistingHighlightBoost));
                float glossEnergy = saturate(_Specular)
                    * saturate(_GlossBoost)
                    * saturate(_Opacity)
                    * lerp(0.42, 1.0, coverage);
                float sharpHighlight = visibleHighlightMask * glossEnergy * 0.52;
                float haloHighlight = visibleLip
                    * edgeGuard
                    * saturate(regionWeight * (1.0 - centerSpec * 0.30))
                    * glossEnergy
                    * saturate(_GlossHaloIntensity)
                    * 0.045;
                float3 warmWhite = float3(1.0, 0.965, 0.92);
                float3 glossColor = saturate(lerp(warmWhite, _GlossColor.rgb, 0.12));
                float3 additiveGloss = glossColor * sharpHighlight
                    + warmWhite * haloHighlight;
                return fixed4(additiveGloss, 0.0);
            }
            ENDCG
        }
    }
}
