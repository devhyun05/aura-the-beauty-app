Shader "AURA/GoldenMaskMarble"
{
    Properties
    {
        _Color ("Marble", Color) = (0.975, 0.97, 0.95, 1)
        _Warmth ("Warmth", Range(0, 1)) = 0.14
        _Smoothness ("Smoothness", Range(0, 1)) = 0.72
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        Cull Off
        ZWrite On
        ZTest LEqual

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                float3 worldNormal : TEXCOORD0;
                float3 worldPosition : TEXCOORD1;
                float3 viewDirection : TEXCOORD2;
                float3 objectPosition : TEXCOORD3;
            };

            fixed4 _Color;
            float _Warmth;
            float _Smoothness;

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.worldPosition = mul(unity_ObjectToWorld, input.vertex).xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                output.viewDirection = _WorldSpaceCameraPos.xyz - output.worldPosition;
                output.objectPosition = input.vertex.xyz;
                return output;
            }

            fixed4 frag(v2f input, fixed facing : VFACE) : SV_Target
            {
                float3 normal = normalize(input.worldNormal) * (facing >= 0 ? 1 : -1);
                float3 viewDirection = normalize(input.viewDirection);
                float3 keyDirection = normalize(float3(-0.46, 0.62, 0.64));
                float3 fillDirection = normalize(float3(0.72, 0.18, 0.42));

                float key = saturate(dot(normal, keyDirection));
                float fill = saturate(dot(normal, fillDirection));
                float rim = pow(1.0 - saturate(dot(normal, viewDirection)), 2.35);
                float specular = pow(
                    saturate(dot(
                        normal,
                        normalize(keyDirection + viewDirection))),
                    lerp(18.0, 84.0, _Smoothness));

                float subtleVein = sin(
                    input.objectPosition.y * 173.0
                    + input.objectPosition.x * 79.0) * 0.006;
                float light = 0.60 + key * 0.30 + fill * 0.08 + rim * 0.08;
                float3 warmTint = lerp(
                    float3(1.0, 1.0, 1.0),
                    float3(1.0, 0.965, 0.89),
                    _Warmth);
                float3 color = _Color.rgb * warmTint * (light + subtleVein);
                color += specular * lerp(0.08, 0.24, _Smoothness);
                return fixed4(saturate(color), 1.0);
            }
            ENDCG
        }
    }

    Fallback "Unlit/Color"
}
