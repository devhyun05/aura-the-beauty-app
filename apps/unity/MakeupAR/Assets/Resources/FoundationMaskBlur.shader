Shader "Hidden/MakeupAR/FoundationMaskBlur"
{
    // Separable small-radius gaussian for the geometry prior (R channel).
    // Two passes (horizontal, vertical) of 5 fetches each at the 256px mask
    // resolution — cheap on mobile, wide enough that the prior never shows a
    // hard silhouette edge. Exclusions are re-subtracted after this blur in
    // the composite pass, so soft edges never bleed into lips/eyes/hair.
    Properties
    {
        _MainTex ("Source", 2D) = "black" {}
        _BlurDirection ("Blur Direction", Vector) = (1, 0, 0, 0)
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

            sampler2D _MainTex;
            float4 _MainTex_TexelSize;
            float4 _BlurDirection;

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

            fixed4 frag(v2f input) : SV_Target
            {
                float2 step1 = _BlurDirection.xy * _MainTex_TexelSize.xy * 1.6;
                float2 step2 = _BlurDirection.xy * _MainTex_TexelSize.xy * 3.6;
                float value =
                    tex2D(_MainTex, input.uv).r * 0.294
                    + tex2D(_MainTex, input.uv + step1).r * 0.235
                    + tex2D(_MainTex, input.uv - step1).r * 0.235
                    + tex2D(_MainTex, input.uv + step2).r * 0.118
                    + tex2D(_MainTex, input.uv - step2).r * 0.118;
                return fixed4(value, value, value, value);
            }
            ENDCG
        }
    }

    FallBack Off
}
