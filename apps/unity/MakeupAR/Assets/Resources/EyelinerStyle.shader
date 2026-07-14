// 아이라인 "스타일" — 미리 그린(또는 사용자 임포트) 아이라인/윙 텍스처를 속눈썹
// 라인 밴드에 워프해 얹는다. EyelinerStyleRenderer가 눈꺼풀 밴드 메시에 UV
// (가로=안쪽→바깥윙 0~1, 세로=속눈썹라인 0 → 위 1)를 매핑하므로 텍스처가 눈매
// 곡선을 따라 휜다. 눈썹 BrowStyle과 동일 구조, 색은 _LineColor로 틴트.
//
// _LumaKey=0: 알파=라인(투명 PNG). _LumaKey=1: 어두운 픽셀=라인(흰 배경 그림/JPG).
// 큐는 홍채(+11)/파라미터 아이라이너(+12) 위(+13)로 둬 텍스처 라인이 가려지지 않게.
Shader "ARMakeup/EyelinerStyle"
{
    Properties
    {
        _LineTex ("Eyeliner Style", 2D) = "black" {}
        _LineColor ("Line Color", Color) = (0.09, 0.08, 0.09, 1)
        _LineIntensity ("Line Intensity", Range(0, 1)) = 0.0
        _LumaKey ("Luma Key (0=alpha 1=dark)", Float) = 0.0
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+13" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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
            #include "Ambient.cginc"   // 저조도 색소 바닥(BROW_KNEE) — 어둠 라인 발광 방지

            sampler2D _CameraFeed;
            sampler2D _LineTex;
            fixed4 _LineColor;
            float _LineIntensity;
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
                fixed4 tex = tex2D(_LineTex, i.uv);

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // 라인 모양 = 알파(투명 PNG) 또는 1-밝기(흰 배경 그림).
                float texLuma = dot(tex.rgb, fixed3(0.299, 0.587, 0.114));
                float shape = lerp(tex.a, 1.0 - texLuma, saturate(_LumaKey));
                float amt = shape * _LineIntensity;
                fixed3 pigment = _LineColor.rgb * PigmentBaseKnee(luma, 0.6, 0.4, BROW_KNEE);
                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
