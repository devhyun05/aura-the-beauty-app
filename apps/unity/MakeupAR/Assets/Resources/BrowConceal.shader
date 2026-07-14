// 눈썹 지우기(BrowConceal) — 눈썹 제품 스택 맨 아래(밑작업)에 깔리는 스킨톤 컨실
// 레이어. 큐 순서(MakeupQueues.BrowConceal < 제품들)로 "지우고 그 위에 그리기"가
// 자동 성립한다.
//
// 시맨틱: 이 기능은 "전체 지우개"(자연 눈썹 전체 컨실)가 1급 기능이다. 설계 §15의
// 삐침 정리(커버 영역 = 자연눈썹 ∩ ¬새눈썹모양 — 새 모양을 정점 채널에 베이크한
// protect 구멍)는 미구현 후속이며, 여기선 그 전역 근사로 제품 최대 강도
// (_BrowProductMax)에 비례해 컨실을 감쇠만 한다 — 컨실을 최대로 깔고 반투명 제품을
// 얹을 때 새 모양 안쪽까지 피부로 덮여 워시드아웃되는 것(§15의 밑동 자국)을 완화.
// 컨실 단독(제품 0)일 땐 감쇠 0 = 완전 지우개 유지.
//
// BrowLightener(균일 _SkinColor — CPU가 이마 랜드마크 평균 1색)와 달리, GrabPass
// 피드에서 "그 세로줄 바로 위 이마 픽셀"을 샘플해 칠한다 — 샘플점 월드 좌표는
// BrowRenderer가 정점 채널 TEXCOORD1(uv1)에 매 프레임 기록. 균일 1색 페인트가
// 남기는 자국 없이 이마 조명 그라데이션을 그대로 따라간다.
//
// 신규 셰이더로 만든 근거: BrowLightener.shader는 제품 스택(옅은 눈썹)이 현역으로
// 쓰는 셰이더라 오프셋 샘플·정점 채널을 추가하면 기존 제품 거동이 바뀐다(침습).
// 별도 파일 = 기존 눈썹 제품 침습 0. 루마 게이트·페더 패턴은 BrowLightener 재사용.
Shader "ARMakeup/BrowConceal"
{
    Properties
    {
        _BrowIntensity ("Conceal Intensity", Range(0, 1)) = 0.0
        // 털 판정 루마 게이트 — 어두운 털 픽셀일수록 강하게 덮고 밝은 피부는 통과.
        // BrowLightener와 동일 기본값. // 실기기 튜닝 대상
        _HairLo ("Hair Luma Lo", Range(0, 1)) = 0.32
        _HairHi ("Hair Luma Hi", Range(0, 1)) = 0.70
        // 밴드 가장자리 페더 폭(uv 비율) — 컨실 경계가 피부에 녹아들게. // 실기기 튜닝 대상
        _FeatherV ("Vertical Feather", Range(0, 0.4)) = 0.20
        _FeatherH ("Horizontal Feather", Range(0, 0.4)) = 0.12
        // 눈썹 제품 최대 강도(CPU: max(마스카라, 파우더, 펜슬, 스타일)) — 전역 근사
        // protect. 진한 제품일수록 그 아래 컨실을 감쇠(계수는 PROTECT_DAMP).
        _BrowProductMax ("Brow Product Max", Range(0, 1)) = 0.0
    }

    SubShader
    {
        // 태그 큐는 폴백일 뿐 — 실제 큐는 BrowRenderer가 MakeupQueues.BrowConceal 지정.
        Tags { "Queue" = "Transparent+11" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // 공유 이름 — 프레임당 1회 dedupe (MakeupQueues 주석 참조)

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

            // 칠하는 피부색에 원래 명암을 살짝 반영 — 완전 평면 페인트 방지
            // (BrowLightener의 0.85 + 0.3·luma 패턴). // 실기기 튜닝 대상
            #define SHADE_BASE 0.85
            #define SHADE_LUMA_GAIN 0.3
            // 제품 강도 비례 컨실 감쇠 계수(전역 근사 protect — 워시드아웃 완화).
            // 1이면 제품 최대 강도 1에서 컨실 완전 소거. // 실기기 튜닝 대상
            #define PROTECT_DAMP 0.6

            sampler2D _CameraFeed;
            float _BrowIntensity;
            float _HairLo;
            float _HairHi;
            float _FeatherV;
            float _FeatherH;
            float _BrowProductMax;

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;      // x=세로(0하→1상), y=가로(0바깥→1안)
                float3 skinPos : TEXCOORD1; // 피부 샘플점 월드 좌표(CPU가 이마 방향 오프셋 계산)
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float4 skinGrabPos : TEXCOORD2;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                // 피부 샘플점도 같은 투영을 태워 그랩 UV로 — 플랫폼 Y플립 등 일관 처리.
                o.skinGrabPos = ComputeGrabScreenPos(UnityObjectToClipPos(float4(v.skinPos, 1.0)));
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // 루마 게이트 — 어두운 털일수록 강하게 덮는다(§15 재사용 패턴).
                float hair = 1.0 - smoothstep(_HairLo, _HairHi, luma);

                // 위(이마 방향) 오프셋 UV의 실제 피부 픽셀 — 이 세로줄이 칠할 색.
                float2 skinUV = i.skinGrabPos.xy / i.skinGrabPos.w;
                fixed3 skin = tex2D(_CameraFeed, skinUV).rgb;

                float vEdge = smoothstep(0.0, _FeatherV, i.uv.x)
                            * (1.0 - smoothstep(1.0 - _FeatherV, 1.0, i.uv.x));
                float hEdge = smoothstep(0.0, _FeatherH, i.uv.y)
                            * (1.0 - smoothstep(1.0 - _FeatherH, 1.0, i.uv.y));

                float amt = hair * vEdge * hEdge * _BrowIntensity;
                // 전역 근사 protect — 위에 얹을 제품이 진할수록 컨실을 약화해
                // "피부 덮고 반투명 제품" 이중 처리(워시드아웃)를 완화. 제품 0이면
                // 감쇠 0 = 완전 지우개.
                amt *= 1.0 - _BrowProductMax * PROTECT_DAMP;

                // §11 오클루전 — 앞머리/손 위에 피부색 컨실을 칠하지 않는다.
                return fixed4(skin * (SHADE_BASE + SHADE_LUMA_GAIN * luma),
                              amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
