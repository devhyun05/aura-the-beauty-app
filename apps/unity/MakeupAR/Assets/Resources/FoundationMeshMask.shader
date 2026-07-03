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
                return fixed4(finalMask, exclusion, rawSkin, baseFaceSurface);
            }
            ENDCG
        }
    }

    FallBack Off
}
