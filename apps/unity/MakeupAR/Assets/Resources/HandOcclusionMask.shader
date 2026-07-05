Shader "Hidden/MakeupAR/HandOcclusionMask"
{
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

            float4 _HandPoints[21];
            int _HandPointCount;
            float4 _TargetSize;
            float _FingerRadiusPx;
            float _PalmRadiusPx;
            float _FeatherPx;

            float PointValid(int index)
            {
                return step(0.5, _HandPoints[index].w) * step(0.18, _HandPoints[index].z);
            }

            float2 PointPx(int index)
            {
                return _HandPoints[index].xy * _TargetSize.xy;
            }

            float SoftCircle(float2 pixel, int index, float radiusPx, float featherPx)
            {
                float valid = PointValid(index);
                float distPx = distance(pixel, PointPx(index));
                return valid * (1.0 - smoothstep(radiusPx, radiusPx + featherPx, distPx));
            }

            float SoftCapsule(float2 pixel, int startIndex, int endIndex, float radiusPx, float featherPx)
            {
                float valid = PointValid(startIndex) * PointValid(endIndex);
                float2 a = PointPx(startIndex);
                float2 b = PointPx(endIndex);
                float2 ab = b - a;
                float t = saturate(dot(pixel - a, ab) / max(dot(ab, ab), 0.0001));
                float distPx = distance(pixel, a + ab * t);
                return valid * (1.0 - smoothstep(radiusPx, radiusPx + featherPx, distPx));
            }

            fixed4 frag(v2f_img input) : SV_Target
            {
                float2 pixel = input.uv * _TargetSize.xy;
                float fingerRadius = max(_FingerRadiusPx, 1.0);
                float palmRadius = max(_PalmRadiusPx, fingerRadius);
                float feather = max(_FeatherPx, 1.0);
                float mask = 0.0;

                // Palm body: connect wrist and finger bases so the hand back/palm is not a box.
                mask = max(mask, SoftCapsule(pixel, 0, 5, palmRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 0, 9, palmRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 0, 13, palmRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 0, 17, palmRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 1, 5, palmRadius * 0.72, feather));
                mask = max(mask, SoftCapsule(pixel, 5, 9, palmRadius * 0.78, feather));
                mask = max(mask, SoftCapsule(pixel, 9, 13, palmRadius * 0.78, feather));
                mask = max(mask, SoftCapsule(pixel, 13, 17, palmRadius * 0.78, feather));
                mask = max(mask, SoftCapsule(pixel, 5, 17, palmRadius * 0.48, feather));

                // Fingers: capsules between joints plus rounded joint/fingertip pads.
                mask = max(mask, SoftCapsule(pixel, 1, 2, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 2, 3, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 3, 4, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 5, 6, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 6, 7, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 7, 8, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 9, 10, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 10, 11, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 11, 12, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 13, 14, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 14, 15, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 15, 16, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 17, 18, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 18, 19, fingerRadius, feather));
                mask = max(mask, SoftCapsule(pixel, 19, 20, fingerRadius, feather));

                for (int index = 0; index < 21; index++)
                {
                    float jointRadius = index == 0 || index == 5 || index == 9 || index == 13 || index == 17
                        ? palmRadius * 0.62
                        : fingerRadius * 1.02;
                    mask = max(mask, SoftCircle(pixel, index, jointRadius, feather));
                }

                return fixed4(mask, mask, mask, 1.0);
            }
            ENDCG
        }
    }
}
