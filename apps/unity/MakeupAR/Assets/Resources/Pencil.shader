// 눈썹 펜슬 — 절차적으로 그린 개별 털 스트로크(가는 테이퍼 쿼드)를 렌더한다.
// PencilRenderer가 눈썹 결 방향으로 스트로크 지오메트리를 매 프레임 생성하고, 이
// 셰이더가 GrabPass 루마 보존 색소로 칠한다.
//
// 정점 uv.x = 스트로크 길이(0 뿌리 → 1 끝, 끝으로 페이드), uv.y = 폭(0~1, 가운데 진함).
Shader "ARMakeup/Pencil"
{
    Properties
    {
        _BrowColor ("Pencil Color", Color) = (0.24, 0.17, 0.12, 1)
        _BrowIntensity ("Pencil Intensity", Range(0, 1)) = 0.0
    }

    SubShader
    {
        // 밴드 제품들(+5~7) 위에 털을 얹는다.
        Tags { "Queue" = "Transparent+8" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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
            fixed4 _BrowColor;
            float _BrowIntensity;

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

                // 끝으로 갈수록 가늘게 페이드(뿌리 진함 → 끝 사라짐), 가장자리도 페더.
                float taper = 1.0 - smoothstep(0.5, 1.0, i.uv.x);
                float edge = 1.0 - smoothstep(0.4, 1.0, abs(i.uv.y * 2.0 - 1.0));
                float amt = taper * edge * _BrowIntensity;

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                fixed3 pigment = _BrowColor.rgb * PigmentBaseKnee(luma, 0.9, 0.4, BROW_KNEE);
                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                // 이 셰이더는 눈썹 펜슬·마스카라(LashRenderer)가 공유 — 게이트 동일 적용.
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
