Shader "Hidden/MakeupAR/FoundationMeshMask"
{
    Properties
    {
        _TestBaseSurfaceOnly ("Test Base Surface Only", Float) = 0
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
            ColorMask A

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag_base
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 maskData : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 maskData : TEXCOORD0;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.pos = float4(input.vertex.xy, 0.0, 1.0);
                output.maskData = input.maskData;
                return output;
            }

            fixed4 frag_base(v2f input) : SV_Target
            {
                return fixed4(0.0, 0.0, 0.0, 1.0);
            }
            ENDCG
        }

        Pass
        {
            ColorMask RGB

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag_mask
            #include "UnityCG.cginc"

            float _TestBaseSurfaceOnly;
            sampler2D _UvSkinMaskTex;
            float _UvSkinMaskValid;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 maskData : TEXCOORD0;
                float2 faceUv : TEXCOORD1;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 maskData : TEXCOORD0;
                float2 faceUv : TEXCOORD1;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.pos = float4(input.vertex.xy, 0.0, 1.0);
                output.maskData = input.maskData;
                output.faceUv = input.faceUv;
                return output;
            }

            fixed4 frag_mask(v2f input) : SV_Target
            {
                if (_TestBaseSurfaceOnly > 0.5)
                {
                    return fixed4(0.0, 0.0, 0.0, 1.0);
                }

                float baseFaceSurface = 1.0;
                float rawSkin = saturate(input.maskData.x);
                float exclusion = saturate(input.maskData.y);
                float finalMask = saturate(baseFaceSurface * rawSkin * (1.0 - exclusion));
                if (_UvSkinMaskValid > 0.5)
                {
                    // Project the calibrated canonical-UV skin mask (tight eye
                    // openings, lip-texture lips, brow bands, hairline fade)
                    // into screen space. It supersedes the coarse local-weight
                    // formula; the exclusion channel absorbs its cutouts so
                    // they can be re-subtracted after any downstream blur.
                    float uvMask = saturate(tex2D(_UvSkinMaskTex, input.faceUv).r);
                    finalMask = uvMask;
                    exclusion = max(exclusion, saturate(1.0 - uvMask));
                }

                return fixed4(finalMask, exclusion, rawSkin, baseFaceSurface);
            }
            ENDCG
        }

        Pass
        {
            // Neck extension: writes the extruded jaw strip weight into R (final mask)
            // and A (base surface) with Max blending so the face hull is untouched.
            // B stays 0 on purpose so the screen-space shader can tell neck pixels
            // apart from projected face-skin pixels and apply skin-chroma gating.
            BlendOp Max
            Blend One One
            ColorMask RA

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag_neck
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 maskData : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 maskData : TEXCOORD0;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.pos = float4(input.vertex.xy, 0.0, 1.0);
                output.maskData = input.maskData;
                return output;
            }

            fixed4 frag_neck(v2f input) : SV_Target
            {
                float weight = saturate(input.maskData.x);
                float neck = weight * weight * (3.0 - 2.0 * weight);
                return fixed4(neck, 0.0, 0.0, neck);
            }
            ENDCG
        }
    }

    FallBack Off
}
