// 쌍꺼풀(크리스) — 상안검 위 얇은 음영 라인. 상안검 랜드마크 체인을 눈썹 방향으로
// creaseHeight×눈 세로폭 만큼 오프셋한 크리스 라인 위에, 접힘선을 중심으로 위(브로우)
// 쪽은 또렷하게·아래(속눈썹) 쪽은 넓게 풀리는 자연 음영 밴드를 GrabPass 피드 위에
// 곱(감산)으로 얹는다. EyelinerStyle/LowerLid 밴드 패턴 복제.
//
// 정점 uv: x = 가로(0 안쪽 눈머리 → 1 바깥 눈꼬리), y = 밴드 세로(0 위=브로우 →
// 0.5 크리스 접힘선 → 1 아래=속눈썹). 세로/가로 프로파일은 여기 상수 — 실기기 튜닝.
//
// 상안검 리드 '위' 피부라 눈알 위로 삐지지 않아 스텐실이 불필요(세그 게이트만).
// _DoubleLidIntensity=0이면 알파 0 → 완전 무영향.
Shader "ARMakeup/DoubleLid"
{
    Properties
    {
        // 자연 크리스 음영색 — 곱(감산) 블렌드용 딥 뉴트럴. 공개 API는 강도만 받고
        // 색은 이 기본값 고정(자연 음영이라 색 노출 불필요). // 실기기 튜닝 대상
        _DoubleLidColor ("Crease Shadow Color", Color) = (0.42, 0.34, 0.30, 1)
        _DoubleLidIntensity ("Double Lid Intensity", Range(0, 1)) = 0
        // 마감(Tier B) — 0=새틴(기본, 기존 출력) 1=매트 2=듀이. ApplyFinish 레거시 경로.
        _DoubleLidFinish ("Double Lid Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 모양(§3 ★A7) — 크리스 라인 형태. 0=인라인(현행) 1=아웃라인 2=세미. 0=바이트 동일.
        _DoubleLidShape ("Double Lid Shape (0 inline 1 outline 2 semi)", Float) = 0
    }

    SubShader
    {
        // 아이섀도(+5) 위, 아이라인(+10) 아래. 실제 큐는 DoubleLidRenderer가
        // MakeupQueues.DoubleLid(3006)로 지정 — 태그는 폴백 기본값.
        Tags { "Queue" = "Transparent+6" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — _CameraFeed도 여기서 선언

            fixed4 _DoubleLidColor;
            float _DoubleLidIntensity;
            float _DoubleLidFinish; // 마감(Tier B) — 0=새틴=기존 출력(하위호환)
            float _DoubleLidShape;  // 모양(§3 A7) — 0=인라인(현행) 1=아웃라인 2=세미(0=바이트 동일)

            // 크리스 밴드 프로파일 상수 (전부 실기기 튜닝 대상).
            #define CREASE_CENTER   0.5   // 접힘선이 놓이는 세로 위치 (uv.y)
            #define CREASE_FADE_UP  0.30  // 위(브로우) 쪽 페이드 폭 — 좁게(또렷한 접힘)
            #define CREASE_FADE_DOWN 0.55 // 아래(속눈썹) 쪽 페이드 폭 — 넓게(음영 풀림)
            #define CREASE_EDGE     0.12  // 안/바깥 코너 가로 페더(끝 스파이크 방지)

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x=가로(0 안쪽→1 바깥), y=세로(0 위→1 아래)
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
            };

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

                // 모양(_DoubleLidShape) — 크리스 밴드 좌표계 안의 프로파일 변조(메시/랜드마크
                // 재탐색 없음). 0=인라인(현행)=바이트 동일. 1=아웃라인: 접힘선을 브로우 쪽
                // (uv.y 작은 쪽)으로 올려 폴드를 크게. 2=세미: 안쪽(앞머리) 절반을 비운 부분 폴드.
                float creaseCenter =
                    (_DoubleLidShape > 0.5 && _DoubleLidShape < 1.5) ? 0.38 : CREASE_CENTER;

                // 세로: 접힘선(creaseCenter) 최암, 위·아래 비대칭 소프트 페이드.
                float d = i.uv.y - creaseCenter;
                float fade = d < 0.0 ? CREASE_FADE_UP : CREASE_FADE_DOWN;
                float creaseV = 1.0 - smoothstep(0.0, fade, abs(d)); // Metal은 line 예약어라 개명

                // 가로: 안/바깥 코너 페더 — 크리스 끝이 하드 엣지로 끊기지 않게.
                float along = i.uv.x;
                float edge = smoothstep(0.0, CREASE_EDGE, along)
                             * (1.0 - smoothstep(1.0 - CREASE_EDGE, 1.0, along));
                // 세미(2) — 안쪽 절반을 페이드로 비우고 바깥(꼬리)만 남긴 부분 폴드.
                if (_DoubleLidShape > 1.5)
                    edge *= smoothstep(0.35, 0.55, along);

                float amt = creaseV * edge * _DoubleLidIntensity;
                fixed3 pig = feed * _DoubleLidColor.rgb; // 곱(감산) 크리스 음영
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 자연 음영이라
                // 시머 게인 0. sparkleUV=밴드 uv. luma는 마감 분기용(0=새틴이라 미사용).
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                pig = ApplyFinish(pig, luma, i.uv, _DoubleLidFinish, 0,
                                  0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);

                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                return fixed4(pig, amt * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
