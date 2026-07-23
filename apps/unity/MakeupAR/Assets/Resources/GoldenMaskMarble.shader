Shader "AURA/GoldenMaskMarble"
{
    Properties
    {
        _Color ("Museum Plaster", Color) = (0.945, 0.935, 0.90, 1)
        _ShadowColor ("Deep Shadow", Color) = (0.026, 0.029, 0.036, 1)
        _KeyStrength ("Key Strength", Range(0.5, 1.5)) = 0.92
        _ShadowDepth ("Shadow Depth", Range(0, 1)) = 0.74
        _ProfileClipDirection ("Profile Clip Direction", Float) = 0
        _ProfileClipThreshold ("Profile Clip Threshold", Float) = 1
        [Enum(UnityEngine.Rendering.CullMode)]
        _CullMode ("Cull Mode", Float) = 2
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "Queue" = "Geometry" }
        Cull [_CullMode]
        ZWrite On
        ZTest LEqual

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            fixed4 _Color;
            fixed4 _ShadowColor;
            float _KeyStrength;
            float _ShadowDepth;
            float _ProfileClipDirection;
            float _ProfileClipThreshold;

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
                float3 objectPosition : TEXCOORD2;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                output.worldPosition = mul(
                    unity_ObjectToWorld,
                    input.vertex).xyz;
                output.objectPosition = input.vertex.xyz;
                return output;
            }

            fixed4 frag(
                v2f input,
                fixed faceSign : VFACE) : SV_Target
            {
                clip(
                    _ProfileClipThreshold
                    - input.objectPosition.x * _ProfileClipDirection);
                float3 normal = normalize(input.worldNormal)
                    * (faceSign >= 0.0 ? 1.0 : -1.0);
                float3 viewDirection = normalize(
                    _WorldSpaceCameraPos.xyz - input.worldPosition);

                // Chiaroscuro plaster rig. A broad, high, off-axis key keeps
                // mid-tones across the measured curvature while the opposite
                // side falls into a deep museum shadow. Geometry is unchanged.
                float3 keyDirection = normalize(
                    float3(-0.46, 0.58, 0.67));
                float3 bounceDirection = normalize(
                    float3(0.72, -0.18, 0.34));
                float rawKey = dot(normal, keyDirection);
                float key = pow(
                    smoothstep(-0.35, 0.82, rawKey),
                    1.18) * _KeyStrength;
                float bounce = pow(
                    saturate(dot(normal, bounceDirection)),
                    2.0) * 0.055;
                float facing = pow(
                    saturate(dot(normal, viewDirection)),
                    0.72);
                float silhouette = pow(
                    1.0 - saturate(dot(normal, viewDirection)),
                    3.5);

                float shadowFloor = lerp(0.26, 0.11, _ShadowDepth);
                float formLight =
                    shadowFloor
                    + key * (0.68 + facing * 0.10)
                    + bounce
                    + silhouette * key * 0.012;
                float3 halfDirection = normalize(
                    keyDirection + viewDirection);
                float highlight = pow(
                    saturate(dot(normal, halfDirection)),
                    58.0) * 0.045 * key;

                float litMix = saturate(formLight);
                float3 plaster = lerp(
                    _ShadowColor.rgb,
                    _Color.rgb,
                    litMix);
                plaster *= 0.84 + formLight * 0.16;
                plaster += highlight;

                // Filmic shoulder keeps the nose/cheek highlight textured
                // instead of clipping to a flat white patch.
                plaster = plaster / (1.0 + plaster * 0.10);
                return fixed4(saturate(plaster), 1.0);
            }
            ENDCG
        }
    }

    Fallback Off
}
