Shader "AURA/GoldenMaskDepthOccluder"
{
    SubShader
    {
        Tags
        {
            "Queue" = "Geometry-10"
            "RenderType" = "Opaque"
        }
        Cull Off
        ZWrite On
        ZTest LEqual
        ColorMask 0

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 2.0
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
            };

            struct v2f
            {
                float4 position : SV_POSITION;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                return fixed4(0, 0, 0, 0);
            }
            ENDCG
        }
    }

    Fallback Off
}
