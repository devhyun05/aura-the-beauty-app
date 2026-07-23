// 텍스처 속눈썹 — 곡선 스트로크 PNG(lash_natural/volume)를 상안검 리본에 매핑.
// 절차 쿼드(각짐·찌그러진 컬)의 대안. 알파=속눈썹 결, rgb=마스카라 색(_BrowColor).
// 프로퍼티명은 LashRenderer가 절차 머티리얼과 공유하는 ColorId(_BrowColor)/
// IntensityId(_BrowIntensity)에 맞춘다.
Shader "ARMakeup/LashTexture"
{
    Properties
    {
        _MainTex ("Lash", 2D) = "black" {}
        _BrowColor ("Color", Color) = (0.1, 0.08, 0.07, 1)
        _BrowIntensity ("Intensity", Range(0,1)) = 1
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        ZTest Always
        Cull Off
        Lighting Off

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; };

            sampler2D _MainTex;
            float4 _MainTex_ST;
            fixed4 _BrowColor;
            float _BrowIntensity;

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 t = tex2D(_MainTex, i.uv);
                fixed a = t.a * _BrowIntensity;
                return fixed4(_BrowColor.rgb, a);
            }
            ENDCG
        }
    }
}
