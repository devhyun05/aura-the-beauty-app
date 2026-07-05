Shader "Hidden/MakeupAR/FoundationDynamicMask"
{
    Properties
    {
        [HideInInspector] _FaceCenterSize ("Face Center Size", Vector) = (0.5, 0.5, 0.4, 0.6)
        [HideInInspector] _MaskValid ("Mask Valid", Float) = 0
        [HideInInspector] _MaskSourceMode ("Mask Source Mode", Float) = 0
        [HideInInspector] _DebugMode ("Debug Mode", Float) = 0
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" }
        Cull Off
        ZWrite Off
        ZTest Always

        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"

            float4 _FaceCenterSize;
            float _MaskValid;
            float _MaskSourceMode;
            float _DebugMode;
            float4 _FoundationLeftCheek;
            float4 _FoundationRightCheek;
            float4 _FoundationNose;
            float4 _FoundationChin;
            float4 _FoundationLowerForehead;
            float4 _FoundationLeftEye;
            float4 _FoundationRightEye;
            float4 _FoundationLeftBrow;
            float4 _FoundationRightBrow;
            float4 _FoundationMouth;
            float4 _FoundationRegionValid;
            float4 _FoundationRegionValid2;
            float4 _FoundationExclusionValid;
            float4 _FoundationRegionWeights;
            float _FoundationMouthValid;
            float _FoundationForeheadWeight;
            float _FaceYaw;

            float EllipseDistance(float2 uv, float2 center, float2 radius)
            {
                float2 local = (uv - center) / max(radius, float2(0.0001, 0.0001));
                return dot(local, local);
            }

            float EllipseMask(float2 uv, float2 center, float2 radius, float feather)
            {
                float dist = EllipseDistance(uv, center, radius);
                return 1.0 - smoothstep(1.0, 1.0 + max(feather, 0.001), dist);
            }

            float RegionMask(float2 uv, float4 region, float valid, float feather)
            {
                return EllipseMask(uv, region.xy, max(region.zw, float2(0.0001, 0.0001)), feather) * saturate(valid);
            }

            float CenterDot(float2 uv, float4 region, float valid, float radius)
            {
                float2 delta = uv - region.xy;
                float dist = length(delta);
                return (1.0 - smoothstep(radius, radius * 1.45, dist)) * saturate(valid);
            }

            float EyeBrowExclusion(float2 faceUv)
            {
                float leftEye = EllipseMask(faceUv, float2(0.355, 0.665), float2(0.235, 0.128), 0.52);
                float rightEye = EllipseMask(faceUv, float2(0.645, 0.665), float2(0.235, 0.128), 0.52);
                float glassesBridge = EllipseMask(faceUv, float2(0.500, 0.670), float2(0.088, 0.058), 0.38) * 0.72;
                float leftBrow = EllipseMask(faceUv, float2(0.355, 0.755), float2(0.205, 0.074), 0.50);
                float rightBrow = EllipseMask(faceUv, float2(0.645, 0.755), float2(0.205, 0.074), 0.50);
                float browBridge = EllipseMask(faceUv, float2(0.500, 0.738), float2(0.315, 0.070), 0.44) * 0.50;
                return saturate(max(
                    max(leftEye, rightEye),
                    max(max(leftBrow, rightBrow), max(glassesBridge, browBridge))));
            }

            float MouthExclusion(float2 faceUv)
            {
                float lip = EllipseMask(faceUv, float2(0.500, 0.410), float2(0.285, 0.110), 0.64);
                float mouthPocket = EllipseMask(faceUv, float2(0.500, 0.438), float2(0.245, 0.084), 0.54);
                float philtrum = EllipseMask(faceUv, float2(0.500, 0.494), float2(0.218, 0.052), 0.44) * 0.36;
                float nostril = EllipseMask(faceUv, float2(0.500, 0.552), float2(0.130, 0.044), 0.40) * 0.26;
                return saturate(max(max(lip, mouthPocket), max(philtrum, nostril)));
            }

            float SkinWeight(float2 faceUv)
            {
                float faceCore = EllipseMask(faceUv, float2(0.500, 0.500), float2(0.490, 0.545), 0.34);
                float faceEdgeDistance = EllipseDistance(faceUv, float2(0.500, 0.500), float2(0.490, 0.545));
                float edgeFalloff = 1.0 - smoothstep(0.70, 1.05, faceEdgeDistance) * 0.82;

                float leftCheek = EllipseMask(faceUv, float2(0.335, 0.505), float2(0.185, 0.205), 0.78);
                float rightCheek = EllipseMask(faceUv, float2(0.665, 0.505), float2(0.185, 0.205), 0.78);
                float nose = EllipseMask(faceUv, float2(0.500, 0.565), float2(0.130, 0.198), 0.62);
                float lowerNoseCheek = EllipseMask(faceUv, float2(0.500, 0.493), float2(0.255, 0.155), 0.76) * 0.58;
                float chin = EllipseMask(faceUv, float2(0.500, 0.307), float2(0.235, 0.145), 0.74) * 0.70;
                float lowForehead = EllipseMask(faceUv, float2(0.500, 0.800), float2(0.230, 0.085), 0.58) * 0.36;
                float islands = saturate(max(
                    max(leftCheek, rightCheek),
                    max(max(nose, lowerNoseCheek), max(chin, lowForehead))));

                float hairlineFalloff = lerp(1.0, 0.06, smoothstep(0.780, 0.945, faceUv.y));
                float jawFalloff = lerp(0.30, 1.0, smoothstep(0.125, 0.245, faceUv.y));
                float eyeFalloff = 1.0 - EllipseMask(faceUv, float2(0.500, 0.666), float2(0.455, 0.155), 0.48) * 0.44;
                float mouthFalloff = 1.0 - EllipseMask(faceUv, float2(0.500, 0.415), float2(0.330, 0.120), 0.54) * 0.48;

                return saturate(faceCore * edgeFalloff * islands * hairlineFalloff * jawFalloff * eyeFalloff * mouthFalloff);
            }

            float4 ProjectedMask(float2 screenUv)
            {
                float leftCheek = RegionMask(screenUv, _FoundationLeftCheek, _FoundationRegionValid.x, 0.72) * _FoundationRegionWeights.x;
                float rightCheek = RegionMask(screenUv, _FoundationRightCheek, _FoundationRegionValid.y, 0.72) * _FoundationRegionWeights.y;
                float nose = RegionMask(screenUv, _FoundationNose, _FoundationRegionValid.z, 0.58) * _FoundationRegionWeights.z;
                float chin = RegionMask(screenUv, _FoundationChin, _FoundationRegionValid.w, 0.70) * _FoundationRegionWeights.w;
                float lowerForehead = RegionMask(screenUv, _FoundationLowerForehead, _FoundationRegionValid2.x, 0.62) * _FoundationForeheadWeight;
                float rawSkin = saturate(max(max(leftCheek, rightCheek), max(max(nose, chin), lowerForehead)));

                float eyeExclusion = saturate(max(
                    RegionMask(screenUv, _FoundationLeftEye, _FoundationExclusionValid.x, 0.24),
                    RegionMask(screenUv, _FoundationRightEye, _FoundationExclusionValid.y, 0.24)));
                float browExclusion = saturate(max(
                    RegionMask(screenUv, _FoundationLeftBrow, _FoundationExclusionValid.z, 0.24),
                    RegionMask(screenUv, _FoundationRightBrow, _FoundationExclusionValid.w, 0.24)));
                float mouthExclusion = RegionMask(screenUv, _FoundationMouth, _FoundationMouthValid, 0.26);
                float exclusion = saturate(max(max(eyeExclusion, browExclusion), mouthExclusion));
                float finalMask = saturate(rawSkin * (1.0 - exclusion));
                return float4(finalMask, exclusion, rawSkin, 1.0);
            }

            float4 ProjectedDebugCenters(float2 screenUv)
            {
                float regionDots = 0.0;
                regionDots = max(regionDots, CenterDot(screenUv, _FoundationLeftCheek, _FoundationRegionValid.x, 0.010));
                regionDots = max(regionDots, CenterDot(screenUv, _FoundationRightCheek, _FoundationRegionValid.y, 0.010));
                regionDots = max(regionDots, CenterDot(screenUv, _FoundationNose, _FoundationRegionValid.z, 0.010));
                regionDots = max(regionDots, CenterDot(screenUv, _FoundationChin, _FoundationRegionValid.w, 0.010));
                regionDots = max(regionDots, CenterDot(screenUv, _FoundationLowerForehead, _FoundationRegionValid2.x, 0.010));

                float exclusionDots = 0.0;
                exclusionDots = max(exclusionDots, CenterDot(screenUv, _FoundationLeftEye, _FoundationExclusionValid.x, 0.009));
                exclusionDots = max(exclusionDots, CenterDot(screenUv, _FoundationRightEye, _FoundationExclusionValid.y, 0.009));
                exclusionDots = max(exclusionDots, CenterDot(screenUv, _FoundationLeftBrow, _FoundationExclusionValid.z, 0.009));
                exclusionDots = max(exclusionDots, CenterDot(screenUv, _FoundationRightBrow, _FoundationExclusionValid.w, 0.009));
                exclusionDots = max(exclusionDots, CenterDot(screenUv, _FoundationMouth, _FoundationMouthValid, 0.009));

                float4 mask = ProjectedMask(screenUv);
                float3 color = mask.r.xxx * 0.30;
                color = lerp(color, float3(0.10, 1.00, 0.25), regionDots);
                color = lerp(color, float3(1.00, 0.18, 0.12), exclusionDots);
                return float4(color, 1.0);
            }

            fixed4 frag(v2f_img input) : SV_Target
            {
                if (_MaskValid < 0.5)
                {
                    return fixed4(0, 0, 0, 0);
                }

                if (_MaskSourceMode > 0.5)
                {
                    if (_DebugMode >= 5.5 && _DebugMode < 6.5)
                    {
                        return fixed4(ProjectedDebugCenters(input.uv));
                    }

                    return fixed4(ProjectedMask(input.uv));
                }

                float2 size = max(_FaceCenterSize.zw, float2(0.0001, 0.0001));
                float2 minUv = _FaceCenterSize.xy - size * 0.5;
                float2 faceUv = (input.uv - minUv) / size;
                float insideBounds =
                    step(0.0, faceUv.x)
                    * step(faceUv.x, 1.0)
                    * step(0.0, faceUv.y)
                    * step(faceUv.y, 1.0);
                faceUv = saturate(faceUv);

                float eyeBrow = EyeBrowExclusion(faceUv);
                float mouth = MouthExclusion(faceUv);
                float exclusion = saturate(max(eyeBrow, mouth));
                float skinWeight = SkinWeight(faceUv) * insideBounds;
                float finalMask = saturate(skinWeight * (1.0 - exclusion));

                return fixed4(finalMask, exclusion, skinWeight, 1.0);
            }
            ENDCG
        }
    }

    FallBack Off
}
