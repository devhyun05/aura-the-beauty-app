// 눈썹 스타일 — 미리 그린(또는 사용자 임포트) 눈썹 털 텍스처를 눈썹 아치에 워프해
// 렌더한다. StyleRenderer가 눈썹 밴드 메시에 텍스처 UV(가로=눈썹 길이, 세로=폭)를
// 매핑하므로, 텍스처 결이 실제 눈썹 곡선을 따라 휜다.
//
// 털 모양은 텍스처에서 뽑고, 색은 _BrowColor로 틴트(그레이스케일 에셋 + 어떤 색이든).
// _LumaKey=0: 알파 채널 = 털 모양(투명 배경 PNG). _LumaKey=1: 어두운 픽셀 = 털
// (흰 배경에 그린 그림/JPG). 임포트 시 StyleRenderer가 알파 유무 보고 자동 설정.
Shader "ARMakeup/BrowStyle"
{
    Properties
    {
        _BrowStyleTex ("Brow Style", 2D) = "black" {}
        _BrowColor ("Brow Color", Color) = (0.26, 0.19, 0.14, 1)
        _BrowIntensity ("Brow Intensity", Range(0, 1)) = 0.0
        _LumaKey ("Luma Key (0=alpha 1=dark)", Float) = 0.0
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+9" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" }

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc" // §11 세그 오클루전 게이트 (전역 유니폼)
            #include "Ambient.cginc"   // 저조도 색소 바닥(BROW_KNEE) — 어둠 눈썹 발광 방지

            sampler2D _CameraFeed;
            sampler2D _BrowStyleTex;
            fixed4 _BrowColor;
            float _BrowIntensity;
            float _LumaKey;

            struct appdata { float4 vertex : POSITION; float2 uv : TEXCOORD0; };
            struct v2f { float4 pos : SV_POSITION; float2 uv : TEXCOORD0; float4 grabPos : TEXCOORD1; };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                fixed4 tex = tex2D(_BrowStyleTex, i.uv);

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // 털 모양 = 알파(투명 PNG) 또는 1-밝기(흰 배경 그림). 색은 선택색으로,
                // 카메라 루마 살짝 반영해 자연스럽게.
                float texLuma = dot(tex.rgb, fixed3(0.299, 0.587, 0.114));
                float shape = lerp(tex.a, 1.0 - texLuma, saturate(_LumaKey));
                float amt = shape * _BrowIntensity;
                fixed3 pigment = _BrowColor.rgb * PigmentBaseKnee(luma, 0.7, 0.45, BROW_KNEE);
                // §11 오클루전 — face-skin 양성 게이트(§14 화이트리스트 불필요, Occlusion.cginc 주석).
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
