Shader "AURA/GoldenMaskWireframe"
{
    Properties
    {
        _Color ("Mesh Line Color", Color) = (0.48, 0.86, 0.96, 0.58)
        _ProfileClipDirection ("Profile Clip Direction", Float) = 0
        _ProfileClipThreshold ("Profile Clip Threshold", Float) = 1
    }

    SubShader
    {
        Tags
        {
            "Queue" = "Transparent+10"
            "RenderType" = "Transparent"
        }
        Blend SrcAlpha OneMinusSrcAlpha
        Cull Off
        ZWrite Off
        ZTest LEqual

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 2.0
            #include "UnityCG.cginc"

            fixed4 _Color;
            float _ProfileClipDirection;
            float _ProfileClipThreshold;

            struct appdata
            {
                float4 vertex : POSITION;
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                float3 objectPosition : TEXCOORD0;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.objectPosition = input.vertex.xyz;
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                return _Color;
            }
            ENDCG
        }
    }

    Fallback Off
}
