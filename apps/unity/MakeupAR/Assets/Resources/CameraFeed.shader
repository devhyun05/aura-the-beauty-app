// FramePresenter의 카메라 프레임 표시용 (시간 동기 배경).
Shader "ARMakeup/CameraFeed"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "black" {}
    }

    SubShader
    {
        Tags { "Queue" = "Background" "RenderType" = "Opaque" }

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
            };

            v2f vert(float4 vertex : POSITION, float2 uv : TEXCOORD0)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(vertex);
                o.uv = uv;
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                return fixed4(tex2D(_MainTex, i.uv).rgb, 1.0);
            }
            ENDCG
        }
    }
}
