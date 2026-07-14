// 튜토리얼 스텐실 — 메이크업 "완성본"이 아니라 "어디에·어떤 모양으로 바르는지"를
// 얼굴 위에 얇은 가이드 라인(리본 스트로크)으로 그린다(StencilGuideRenderer).
// 색을 칠하지 않는 안내선이라 GrabPass(피드 샘플)가 필요 없다 — 정점 색이 곧 라인
// 색, 알파는 리본 가로 프로파일·펄스(호흡)·대시(마칭 앤츠)·마스터 농도의 곱.
//
// 정점 규약(렌더러와 계약):
//   COLOR   rgb = 부위 라인 색, a = 부위 마스터 알파(0=꺼진 슬롯 → 안 보임)
//   uv.x    스트로크 진행 방향 0..1 (대시 위상)
//   uv.y    리본 가로 0..1 (0.5=중심선, 0/1=가장자리 → 페더)
//
// 큐는 전 메이크업 위(MakeupQueues.StencilGuide) — 완성 미리보기 위에 얹혀 "지금
// 여기"를 가리키는 코치 라인. ZTest Always·ZWrite Off라 항상 최상단에 뜬다.
Shader "ARMakeup/StencilGuide"
{
    Properties
    {
        _Opacity ("Master Opacity", Range(0, 1)) = 1
        _Pulse ("Pulse (breathing) 0/1", Float) = 1
        _PulseSpeed ("Pulse Speed", Float) = 3.0
        _Dash ("Dash (marching ants) 0/1", Float) = 1
        _DashCount ("Dash Count", Float) = 26
        _ScrollSpeed ("Dash Scroll Speed", Float) = 1.4
        // 가장자리 페더 시작(가로 |중심 거리| 정규화). 낮을수록 얇고 또렷.
        _EdgeSoft ("Edge Softness Start", Range(0, 1)) = 0.35
        // 반반 모드 추종 — 1이면 전역 분할선의 "메이크업 쪽 절반"에서만 라인이 보인다.
        // 스텐실 가이드=1(추종), 대칭 가이드=0(양쪽 비교라 안 자름).
        _SplitFollow ("Follow Split 0/1", Float) = 0
    }

    SubShader
    {
        Tags { "Queue" = "Overlay" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

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

            float _Opacity;
            float _Pulse;
            float _PulseSpeed;
            float _Dash;
            float _DashCount;
            float _ScrollSpeed;
            float _EdgeSoft;
            // 반반 모드 — 머티리얼(_SplitFollow) + 전역(SplitMaskRenderer 기록) 공유.
            float _SplitFollow;
            float _SplitMode;   // 0=전체 1=왼쪽 메이크업 2=오른쪽 메이크업
            float4 _SplitLine;  // xy=점, zw=법선(화면 오른쪽)

            #define SPLIT_FEATHER 0.012

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x=진행, y=가로
                fixed4 color : COLOR;  // rgb=라인색, a=부위 마스터 알파
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
                float4 screen : TEXCOORD1; // 분할선 판정(화면 UV)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.color = v.color;
                o.screen = ComputeScreenPos(o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                // 가로 페더 — 중심선(0.5)이 가장 진하고 가장자리로 갈수록 사라진다.
                float d = abs(i.uv.y * 2.0 - 1.0);         // 0=중심, 1=가장자리
                float feather = smoothstep(1.0, _EdgeSoft, d);

                // 펄스(호흡) — 켜지면 0.15~1.0 사이를 사인으로 왕복해 시선을 끈다.
                float pulse = lerp(1.0, 0.575 + 0.425 * sin(_Time.y * _PulseSpeed), _Pulse);

                // 대시(마칭 앤츠) — 진행 방향으로 흐르는 점선. 꺼지면 실선(=1).
                float phase = frac(i.uv.x * _DashCount - _Time.y * _ScrollSpeed);
                float dashOn = smoothstep(0.45, 0.55, phase); // 약 50% 듀티, 부드러운 경계
                float dash = lerp(1.0, dashOn, _Dash);

                // 반반 추종 — 메이크업 "반대쪽"(맨얼굴 절반)에서만 라인이 보인다: 화장한
                // 쪽은 완성본을 보고, 반대쪽 맨얼굴엔 "여기 이렇게 바르세요" 가이드를 띄운다.
                // (대칭 가이드는 _SplitFollow=0이라 안 잘림.) 복원(맨얼굴) 마스크와 같은 쪽.
                float split = 1.0;
                if (_SplitFollow > 0.5 && _SplitMode > 0.5)
                {
                    float2 vp = i.screen.xy / i.screen.w;
                    float s = dot(vp - _SplitLine.xy, _SplitLine.zw); // >0 = 화면 오른쪽
                    if (_SplitMode > 1.5) split = smoothstep(SPLIT_FEATHER, -SPLIT_FEATHER, s); // 오른쪽 메이크업 → 왼쪽만
                    else                  split = smoothstep(-SPLIT_FEATHER, SPLIT_FEATHER, s); // 왼쪽 메이크업 → 오른쪽만
                }

                float a = i.color.a * _Opacity * feather * pulse * dash * split;
                return fixed4(i.color.rgb, a);
            }
            ENDCG
        }
    }

    FallBack Off
}
