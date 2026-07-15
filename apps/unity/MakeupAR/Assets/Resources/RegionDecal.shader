// 부위 데칼 — 사용자가 그린 이미지(립/볼 그림)를 그 부위 메시에 워프해 얹는다.
// 눈썹/아이라인 "스타일"이 알파=모양 + 색=틴트였다면, 이건 립·볼처럼 여러 색이
// 들어가는 아트라 텍스처의 RGB(그린 색)를 그대로 쓰고 알파=칠한 영역으로 본다.
// GrabPass로 뒤 카메라 픽셀의 루마를 살짝 반영해 피부 위 색소처럼 자연스럽게.
Shader "ARMakeup/RegionDecal"
{
    Properties
    {
        _DecalTex ("Decal", 2D) = "black" {}
        _Intensity ("Intensity", Range(0, 1)) = 0.0
        _DecalSparkle ("Decal Glitter Sparkle", Range(0, 1)) = 0.0
    }

    SubShader
    {
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
            #include "Ambient.cginc"   // 저조도 색소 바닥(PigmentBase) — 어둠 발광 방지
            #include "Finish.cginc"    // SparkleTwinkle(명멸)·_CameraFeed 공용 선언

            // _CameraFeed·텍셀·헤드포즈 유니폼은 Finish.cginc가 선언(로컬 중복 제거).
            sampler2D _DecalTex;
            float _Intensity;
            float _DecalSparkle;       // 0=끔(하위호환). 베이크 데칼 위 절차 반짝 오버레이.

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
                fixed4 tex = tex2D(_DecalTex, i.uv);

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // 그린 색을 그대로 쓰되 피부 명암을 살짝 반영(색소 얹힌 느낌).
                // 바닥 0.6이 가장 큰 어둠 발광원이라 PigmentBase 종속이 특히 중요.
                fixed3 pigment = tex.rgb * PigmentBase(luma, 0.5, 0.6);
                // 글리터 데칼 명멸(C) — 베이크 데칼은 원래 정적이라, 옵션으로 절차 반짝을
                // 얹어 움직임에 반응시킨다. 스파클 셀은 데칼 uv에 고정(그림에 접착).
                // _DecalSparkle=0이면 가산항 0 → 기존 데칼과 픽셀 동일(하위호환).
                float2 sCell = floor(i.uv * (60.0 + 120.0 * _DecalSparkle));
                float sH = frac(sin(dot(sCell, float2(12.9898, 78.233))) * 43758.5453);
                float spark = step(1.0 - 0.30 * _DecalSparkle, sH) * (0.4 + 0.6 * smoothstep(0.35, 1.0, luma));
                pigment += spark * SparkleTwinkle(sCell, sH) * _DecalSparkle * 1.2;
                float amt = tex.a * _Intensity;
                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                // 립/볼 데칼(LipStyle·BlushStyle 렌더러 공유) 동일 적용.
                return fixed4(pigment, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
