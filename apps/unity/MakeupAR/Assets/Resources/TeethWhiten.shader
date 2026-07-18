// 치아 미백 — 내측 립 링 밴드 스트립(TeethRenderer, 코너 고정 상↔하 대응)에서
// GrabPass 피드를 샘플해 밝은 픽셀(치아)만 루마 게이트로 골라 미백한다. 어두운
// 입안·혀는 루마 게이트가, 밝지만 붉은 잇몸·혀 표면은 붉은기 게이트가 제외한다.
//
// 미백 = 채도 감소(RGB→루마 보간 — 노란기 제거) + 소폭 밝기 가산. 강도는
// _WhitenIntensity(브리지 teethWhitenIntensity)가 알파로 나른다.
//
// 큐는 TeethRenderer가 MakeupQueues.Teeth(립 링 아래)로 지정 — 립·라이너 엣지가
// 치아 존 경계 위에서 또렷하게 남는다.
Shader "ARMakeup/TeethWhiten"
{
    Properties
    {
        _WhitenIntensity ("Whiten Intensity", Range(0, 1)) = 0.0
        // 치아 판정 루마 게이트 — 이보다 밝아야 치아(어두운 입안·혀 제외). // 실기기 튜닝 대상
        _ToothLumaLo ("Tooth Luma Lo", Range(0, 1)) = 0.40
        _ToothLumaHi ("Tooth Luma Hi", Range(0, 1)) = 0.62
        // 붉은기(R−max(G,B)) 게이트 — 밝은 잇몸·혀 표면 오검출 차단. // 실기기 튜닝 대상
        _GumRedLo ("Gum Redness Lo", Range(0, 0.5)) = 0.06
        _GumRedHi ("Gum Redness Hi", Range(0, 0.5)) = 0.16
        // 미백 최대치 — intensity=1일 때 채도 감쇠 비율·밝기 가산량. // 실기기 튜닝 대상
        _MaxDesat ("Max Desaturation", Range(0, 1)) = 0.8
        _BrightenAdd ("Brighten Add", Range(0, 0.3)) = 0.07
        // 스트립 상·하 변(입술 안쪽 경계) 페더 구간 — uv.x(0=상변 → 1=하변)의
        // 양끝에서 감쇠. // 실기기 튜닝 대상
        _RimFeather ("Rim Feather", Range(0, 0.6)) = 0.25
        // 마감(Tier B) — 0=새틴(기본, 기존 출력) 1=매트 2=듀이(글로시 스마일). ApplyFinish 레거시 경로.
        _TeethFinish ("Teeth Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 모양 축 W6 — 0=전체(현행) 1=앞니 6전치 집중. 스트립 가로(uv.y 코너→코너) 중앙 가중.
        _TeethShape ("Teeth Zone (0 all 1 front6)", Float) = 0
    }

    SubShader
    {
        // 태그 큐는 폴백일 뿐 — 실제 큐는 TeethRenderer가 MakeupQueues.Teeth 지정.
        Tags { "Queue" = "Transparent+17" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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

            float _WhitenIntensity;
            float _ToothLumaLo;
            float _ToothLumaHi;
            float _GumRedLo;
            float _GumRedHi;
            float _MaxDesat;
            float _BrightenAdd;
            float _RimFeather;
            float _TeethFinish; // 마감(Tier B) — 0=새틴=기존 출력(하위호환)
            float _TeethShape;  // 존(W6) — 0=전체=기존 출력(하위호환) 1=앞니 6전치 집중
            // 앞니 집중 — 스트립 가로 중앙(uv.y=0.5)에서 |uv.y−0.5|가 이 구간을 넘으면 감쇠.
            #define TEETH_FRONT_LO 0.14  // 실기기 튜닝 대상: 이하 = 100% (중앙 6전치)
            #define TEETH_FRONT_HI 0.40  // 실기기 튜닝 대상: 이상 = 완전 제외(옆니)

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x=세로(0=상변→1=하변), y=가로(코너→코너)
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

                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));
                // 루마 게이트 — 밝은 픽셀만 치아로 인정(어두운 입안·혀 자동 제외).
                float tooth = smoothstep(_ToothLumaLo, _ToothLumaHi, luma);
                // 붉은기 게이트 — 밝아도 붉으면(잇몸·혀 표면) 제외.
                float redness = feed.r - max(feed.g, feed.b);
                tooth *= 1.0 - smoothstep(_GumRedLo, _GumRedHi, redness);

                // 림 페더 — 상변(uv.x=0)·하변(uv.x=1) 입술 안쪽 경계 양쪽에서
                // 미백을 감쇠(경계 자국 방지). 가로 양끝은 스트립 폭 0 자동 테이퍼.
                float rim = smoothstep(0.0, _RimFeather, i.uv.x)
                          * (1.0 - smoothstep(1.0 - _RimFeather, 1.0, i.uv.x));

                // 미백: 채도 감소(노란기 제거) + 소폭 밝기 가산.
                fixed3 white = lerp(feed, luma.xxx, _MaxDesat) + _BrightenAdd;
                // 마감 — 0=새틴=무변형(ApplyFinish 레거시 경로, 세부 6값 0). 치아 광택
                // (글로시 스마일)은 실물 개념이 있어 유효. sparkleUV=스트립 uv. 시머 게인 0.
                white = ApplyFinish(white, luma, i.uv, _TeethFinish, 0,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);

                // 모양 축 W6 — 앞니 6전치 집중: 스트립 가로 중앙(uv.y=0.5) 가중. 0=전체면
                // teethZone=1 → 바이트 동일(하위호환). 곱 게이트(가산 금지).
                float teethZone = 1.0;
                if (_TeethShape > 0.5)
                    teethZone = 1.0 - smoothstep(TEETH_FRONT_LO, TEETH_FRONT_HI, abs(i.uv.y - 0.5));

                float amt = tooth * rim * _WhitenIntensity * teethZone;
                // §11 오클루전 — 입안 변형 게이트: 치아가 face-skin으로 분류되지 않을 수
                // 있어 max(face-skin, 기타)로 통과(Occlusion.cginc 주석). // 실기기 튜닝 대상
                return fixed4(white, amt * OccludeGateMouth(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
