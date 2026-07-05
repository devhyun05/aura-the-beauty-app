Shader "Hidden/MakeupAR/FoundationSemanticComposite"
{
    // Composites the final foundation mask in downsampled screen UV space:
    //
    // foundationMask =
    //     geometryPrior (projected ARFace mesh + neck skirt, exclusions baked)
    //   * skinMask       (segmentation skin if provided, else chroma skin gate)
    //   * confidence
    //   * (1 - dilate(hair | lip | eye | brow | segOcclusion))
    //   * (1 - handOcclusion)
    // then asymmetric temporal smoothing (mask shrinks faster than it grows).
    //
    // The prior gets a small tent feather (edge softening); exclusions are
    // sampled point-wise with dilation AFTER the feather so blur never bleeds
    // foundation into lips/eyes/hair.
    Properties
    {
        _PriorTex ("Geometry Prior", 2D) = "black" {}
        _PriorSoftTex ("Blurred Geometry Prior", 2D) = "black" {}
        _PrevTex ("Previous Final Mask", 2D) = "black" {}
        _SkinGateCameraTex ("Camera RGB", 2D) = "black" {}
        _SkinGateTexY ("Camera Y", 2D) = "black" {}
        _SkinGateTexCbCr ("Camera CbCr", 2D) = "gray" {}
        _SkinGateCameraMode ("Camera Mode", Float) = 0
        _SkinGateTolerance ("Skin Tolerance", Range(0.01, 1)) = 0.14
        _SkinGateRefA ("Skin Ref A", Vector) = (0.5, 0.5, 0, 0)
        _SkinGateRefB ("Skin Ref B", Vector) = (0.5, 0.5, 0, 0)
        _SkinGateRefC ("Skin Ref C", Vector) = (0.5, 0.5, 0, 0)
        _SegSkinTex ("Seg Skin", 2D) = "white" {}
        _SegSkinValid ("Seg Skin Valid", Float) = 0
        _SegHairTex ("Seg Hair", 2D) = "black" {}
        _SegHairValid ("Seg Hair Valid", Float) = 0
        _SegLipTex ("Seg Lip", 2D) = "black" {}
        _SegLipValid ("Seg Lip Valid", Float) = 0
        _SegEyeTex ("Seg Eye", 2D) = "black" {}
        _SegEyeValid ("Seg Eye Valid", Float) = 0
        _SegBrowTex ("Seg Brow", 2D) = "black" {}
        _SegBrowValid ("Seg Brow Valid", Float) = 0
        _SegOcclusionTex ("Seg Occlusion", 2D) = "black" {}
        _SegOcclusionValid ("Seg Occlusion Valid", Float) = 0
        _SegConfidenceTex ("Seg Confidence", 2D) = "white" {}
        _SegConfidenceValid ("Seg Confidence Valid", Float) = 0
        _HandOcclusionMaskTex ("Hand Mask", 2D) = "black" {}
        _HandOcclusionEnabled ("Hand Enabled", Float) = 0
        _HandOcclusionUseRect ("Hand Use Rect", Float) = 0
        _HandOcclusionRect ("Hand Rect", Vector) = (0, 0, 0, 0)
        _SkinSemanticValid ("Skin Semantic Valid", Float) = 0
        _ProfileFade ("Profile Fade (yaw01, centerU, halfWidthU)", Vector) = (0, 0.5, 0.25, 0)
        _TemporalRise ("Temporal Rise", Range(0, 1)) = 0.38
        _TemporalFall ("Temporal Fall", Range(0, 1)) = 0.62
        _FeatherTexel ("Feather Texel", Vector) = (0.004, 0.003, 0, 0)
        _ExclusionDilateTexel ("Exclusion Dilate Texel", Vector) = (0.006, 0.0045, 0, 0)
        _SkinGateFallbackEnabled ("Skin Gate Fallback Enabled", Float) = 1
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        Cull Off
        ZWrite Off
        ZTest Always
        Blend One Zero

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _PriorTex;
            sampler2D _PriorSoftTex;
            sampler2D _PrevTex;
            sampler2D _SkinGateCameraTex;
            sampler2D _SkinGateTexY;
            sampler2D _SkinGateTexCbCr;
            float _SkinGateCameraMode;
            float _SkinGateTolerance;
            float4 _SkinGateRefA;
            float4 _SkinGateRefB;
            float4 _SkinGateRefC;
            float4x4 _SkinGateDisplayTransform;
            sampler2D _SegSkinTex;
            float _SegSkinValid;
            sampler2D _SegHairTex;
            float _SegHairValid;
            sampler2D _SegLipTex;
            float _SegLipValid;
            sampler2D _SegEyeTex;
            float _SegEyeValid;
            sampler2D _SegBrowTex;
            float _SegBrowValid;
            sampler2D _SegOcclusionTex;
            float _SegOcclusionValid;
            sampler2D _SegConfidenceTex;
            float _SegConfidenceValid;
            sampler2D _HandOcclusionMaskTex;
            float _HandOcclusionEnabled;
            float _HandOcclusionUseRect;
            float4 _HandOcclusionRect;
            float _TemporalRise;
            float _TemporalFall;
            float4 _FeatherTexel;
            float4 _ExclusionDilateTexel;
            float _SkinGateFallbackEnabled;
            float _SkinSemanticValid;
            float4 _ProfileFade;

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

            v2f vert(appdata input)
            {
                v2f output;
                output.pos = UnityObjectToClipPos(input.vertex);
                output.uv = input.uv;
                return output;
            }

            float3 SampleCameraColor(float2 screenUv)
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

            float2 Chroma(float3 color)
            {
                float cb = -0.1146 * color.r - 0.3854 * color.g + 0.5 * color.b;
                float cr = 0.5 * color.r - 0.4542 * color.g - 0.0458 * color.b;
                return float2(cb, cr);
            }

            float3 Median3(float3 a, float3 b, float3 c)
            {
                return max(min(a, b), min(max(a, b), c));
            }

            // Robust skin reference: component-wise median of the anchors.
            float3 ReferenceSkinColor(out float available)
            {
                bool hasA = _SkinGateRefA.z > 0.5;
                bool hasB = _SkinGateRefB.z > 0.5;
                bool hasC = _SkinGateRefC.z > 0.5;
                available = (hasA || hasB || hasC) ? 1.0 : 0.0;
                if (available < 0.5)
                {
                    return float3(0.5, 0.4, 0.35);
                }

                float3 sampleA = hasA ? SampleCameraColor(_SkinGateRefA.xy) : float3(0.0, 0.0, 0.0);
                float3 sampleB = hasB ? SampleCameraColor(_SkinGateRefB.xy) : sampleA;
                float3 sampleC = hasC ? SampleCameraColor(_SkinGateRefC.xy) : sampleA;
                if (!hasA)
                {
                    sampleA = hasB ? sampleB : sampleC;
                }

                return Median3(sampleA, sampleB, sampleC);
            }

            // Chroma-only (YCbCr Cb/Cr) skin gate. RGB distance is never used;
            // luminance participates ONLY as dark-hair suppression and that
            // suppression is disabled inside the central-face protection zone
            // so nose/nostril/philtrum shadows are never treated as non-skin.
            float FallbackSkinGate(float2 uv, float centralProtection)
            {
                // FAIL-SAFE (never fail-open): when the camera texture or the
                // skin reference anchors are unavailable, do NOT paint the
                // whole prior (that puts foundation on bangs/brows/clothes).
                // Instead keep only the protected central face at strength and
                // fade the edges hard — verified in simulation: edge paint
                // drops from 1.0 to ~0.35 while nose/philtrum stay covered.
                if (_SkinGateFallbackEnabled < 0.5)
                {
                    return lerp(0.30, 1.0, centralProtection);
                }

                float referenceAvailable;
                float3 reference = ReferenceSkinColor(referenceAvailable);
                if (referenceAvailable < 0.5)
                {
                    return lerp(0.30, 1.0, centralProtection);
                }

                float3 pixel = SampleCameraColor(uv);
                float chromaDistance = length(Chroma(pixel) - Chroma(reference));

                // Central face (nose, nostrils, philtrum, under-eye, glabella):
                // relaxed tolerance, dark suppression off — shadows stay skin.
                float tolerance = _SkinGateTolerance * lerp(1.0, 1.9, centralProtection);
                float similarity = 1.0 - smoothstep(
                    tolerance,
                    tolerance * 2.3,
                    chromaDistance);

                float pixelLum = dot(pixel, float3(0.2126, 0.7152, 0.0722));
                float referenceLum = max(dot(reference, float3(0.2126, 0.7152, 0.0722)), 0.05);
                float darkGate = smoothstep(0.26, 0.52, pixelLum / referenceLum);
                darkGate = lerp(darkGate, 1.0, centralProtection);

                float gate = saturate(similarity * darkGate);
                // Never let the fallback gate fully erase protected central
                // skin: clamp its minimum inside the protection zone.
                return max(gate, centralProtection * 0.72);
            }

            // Glasses frames/lenses and similar non-skin objects around the
            // eyes: inside a widened eye/brow ROI, pixels whose chroma is far
            // from skin OR that carry strong specular highlights are removed.
            float NonSkinAccessoryMask(float2 uv, float eyeMask, float browMask)
            {
                if (_SkinGateFallbackEnabled < 0.5)
                {
                    return 0.0;
                }

                float roi = max(eyeMask, browMask);
                if (_SegEyeValid > 0.5)
                {
                    float2 wide = _ExclusionDilateTexel.xy * 3.5;
                    roi = max(roi, tex2D(_SegEyeTex, uv + float2(wide.x, 0.0)).r);
                    roi = max(roi, tex2D(_SegEyeTex, uv - float2(wide.x, 0.0)).r);
                    roi = max(roi, tex2D(_SegEyeTex, uv + float2(0.0, wide.y)).r);
                    roi = max(roi, tex2D(_SegEyeTex, uv - float2(0.0, wide.y)).r);
                }

                roi = smoothstep(0.04, 0.30, roi);
                if (roi <= 0.001)
                {
                    return 0.0;
                }

                float referenceAvailable;
                float3 reference = ReferenceSkinColor(referenceAvailable);
                if (referenceAvailable < 0.5)
                {
                    return 0.0;
                }

                float3 pixel = SampleCameraColor(uv);
                float chromaDistance = length(Chroma(pixel) - Chroma(reference));
                float nonSkin = smoothstep(
                    _SkinGateTolerance * 1.6,
                    _SkinGateTolerance * 2.8,
                    chromaDistance);
                float pixelLum = dot(pixel, float3(0.2126, 0.7152, 0.0722));
                float referenceLum = max(dot(reference, float3(0.2126, 0.7152, 0.0722)), 0.05);
                float specular = smoothstep(1.35, 1.85, pixelLum / referenceLum);
                return saturate(roi * max(nonSkin, specular));
            }

            float DilatedMask(sampler2D maskTexture, float2 uv)
            {
                float2 texel = _ExclusionDilateTexel.xy;
                float value = tex2D(maskTexture, uv).r;
                value = max(value, tex2D(maskTexture, uv + float2(texel.x, 0.0)).r);
                value = max(value, tex2D(maskTexture, uv - float2(texel.x, 0.0)).r);
                value = max(value, tex2D(maskTexture, uv + float2(0.0, texel.y)).r);
                value = max(value, tex2D(maskTexture, uv - float2(0.0, texel.y)).r);
                return saturate(value);
            }

            float HandOcclusion(float2 uv)
            {
                if (_HandOcclusionEnabled < 0.5)
                {
                    return 0.0;
                }

                float mask = tex2D(_HandOcclusionMaskTex, uv).r;
                if (_HandOcclusionUseRect > 0.5)
                {
                    float inside =
                        step(_HandOcclusionRect.x, uv.x)
                        * step(uv.x, _HandOcclusionRect.z)
                        * step(_HandOcclusionRect.y, uv.y)
                        * step(uv.y, _HandOcclusionRect.w);
                    mask = max(mask, inside);
                }

                return saturate(mask);
            }

            float DilatedPriorExclusion(float2 uv)
            {
                float2 texel = _ExclusionDilateTexel.xy;
                float value = tex2D(_PriorTex, uv).g;
                value = max(value, tex2D(_PriorTex, uv + float2(texel.x, 0.0)).g);
                value = max(value, tex2D(_PriorTex, uv - float2(texel.x, 0.0)).g);
                value = max(value, tex2D(_PriorTex, uv + float2(0.0, texel.y)).g);
                value = max(value, tex2D(_PriorTex, uv - float2(0.0, texel.y)).g);
                return saturate(value);
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float2 uv = input.uv;
                float4 priorRaw = tex2D(_PriorTex, uv);

                // Soft geometry prior: the separably blurred prior remapped so
                // the silhouette expands slightly and fades over a wide band —
                // the prior acts as a soft clamp, never a visible edge. The
                // face/neck union happens inside the prior via max blending,
                // so the jaw overlap can never double up into a U band.
                float softPrior = smoothstep(0.05, 0.62, tex2D(_PriorSoftTex, uv).r);

                // Re-subtract the prior's exclusion cutouts (eyes/brows/lips/
                // hairline from the projected calibrated UV mask) AFTER the
                // blur so soft edges never bleed into them.
                // Profile view: as the head yaws, fade the far-side prior so
                // the silhouette never shows a hard edge on the far cheek.
                float yaw01 = _ProfileFade.x;
                float farSide = saturate(
                    -(uv.x - _ProfileFade.y) * sign(yaw01) / max(_ProfileFade.z, 0.02));
                softPrior *= 1.0 - saturate(abs(yaw01))
                    * smoothstep(0.30, 1.0, farSide) * 0.85;

                // Face vs neck split: the prior's blue channel carries face
                // skin weights (zero on the neck skirt); the neck gradient and
                // jaw feather are baked into the prior's red channel.
                float faceness = smoothstep(0.02, 0.12, priorRaw.b);
                float neckness = 1.0 - faceness;

                float priorExclusion = DilatedPriorExclusion(uv);

                // Central-face protection (nose/philtrum/under-eye/glabella):
                // driven by the prior's raw skin-weight channel.
                float centralProtection = smoothstep(0.15, 0.50, priorRaw.b);

                // Skin decision: segmentation when available, chroma gate otherwise.
                float skin;
                if (_SkinSemanticValid > 0.5)
                {
                    skin = saturate(tex2D(_SegSkinTex, uv).r);
                    // Confidence refinement only (provider stays primary):
                    // outside the protected central face, the chroma gate
                    // soft-trims what the parsing region cannot separate —
                    // e.g. bangs hanging over the forehead. Central skin
                    // (nose/philtrum/under-eye) is never trimmed by it.
                    float refine = FallbackSkinGate(uv, max(centralProtection, 0.35));
                    skin *= lerp(refine, 1.0, centralProtection);
                }
                else
                {
                    // No true semantic skin class (person-derived masks do not
                    // count): the chroma gate decides, clamped by whatever
                    // region candidate the provider still offers.
                    float regionSkin = _SegSkinValid > 0.5
                        ? saturate(tex2D(_SegSkinTex, uv).r)
                        : 1.0;
                    skin = FallbackSkinGate(uv, centralProtection) * regionSkin;
                }

                float confidence = _SegConfidenceValid > 0.5
                    ? saturate(tex2D(_SegConfidenceTex, uv).r)
                    : 1.0;

                // Exclusions: point-sampled with dilation, applied after the
                // feather so blur never bleeds into lips/eyes/hair.
                float hair = _SegHairValid > 0.5 ? DilatedMask(_SegHairTex, uv) : 0.0;
                float lip = _SegLipValid > 0.5 ? DilatedMask(_SegLipTex, uv) : 0.0;
                float eye = _SegEyeValid > 0.5 ? DilatedMask(_SegEyeTex, uv) : 0.0;
                float brow = _SegBrowValid > 0.5 ? DilatedMask(_SegBrowTex, uv) : 0.0;
                float occluder = _SegOcclusionValid > 0.5 ? DilatedMask(_SegOcclusionTex, uv) : 0.0;
                occluder = max(occluder, HandOcclusion(uv));
                float accessory = NonSkinAccessoryMask(uv, eye, brow);

                // Strict formulation: face and neck composed separately with
                // their own exclusion sets and combined with MAX (never add),
                // so the jaw overlap can never darken into a U band.
                float faceSkin = softPrior * faceness * skin * confidence;
                float neckSkin = softPrior * neckness * skin * confidence;
                float faceExclusion = max(
                    max(max(hair, lip), max(eye, brow)),
                    max(max(occluder, accessory), priorExclusion));
                float neckExclusion = max(hair, max(occluder, accessory));
                float faceFoundationMask =
                    saturate(faceSkin) * (1.0 - saturate(faceExclusion));
                float neckFoundationMask =
                    saturate(neckSkin) * (1.0 - saturate(neckExclusion));
                float baseMask = max(faceFoundationMask, neckFoundationMask);

                // Asymmetric temporal smoothing: shrink fast (exclusions and
                // occluders react quickly), grow a bit slower (no flicker).
                float previous = tex2D(_PrevTex, uv).r;
                float rate = baseMask >= previous ? _TemporalRise : _TemporalFall;
                float final = saturate(lerp(previous, baseMask, saturate(rate)));

                return fixed4(final, final, final, final);
            }
            ENDCG
        }
    }

    FallBack Off
}
