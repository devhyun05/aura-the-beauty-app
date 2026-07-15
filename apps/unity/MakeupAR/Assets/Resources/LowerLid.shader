// 하안검 밴드 — 하안검 lash 라인에서 아래로 확장한 밴드 메시(LowerLidRenderer)에
// 아이라인(하) + 애교살 2줄(하이라이트/섀도)을 GrabPass 피드 위에 그린다.
// 캐노니컬 UV 추정 마스크(구 FaceMakeup aegyo 브랜치)의 정식판 — 랜드마크 정밀.
//
// 정점 uv: x = 가로(0 안쪽 눈머리 → 1 바깥 눈꼬리), y = 세로(0 lash 라인 → 1 아래 끝).
// 제품별 프로파일(세로 밴드 위치·가로 가중)은 전부 여기 상수 — 실기기 튜닝 대상.
//
// 겹치는 제품은 가중 평균 색소 + 합산 알파(Eyeshadow의 단일 amt 패턴 확장) —
// SrcAlpha 블렌드와 이중 적용되지 않게 색소는 풀강도로 두고 알파만 강도를 나른다.
Shader "ARMakeup/LowerLid"
{
    Properties
    {
        // 아이라인(하) — 색은 상안검 아이라이너와 공용(eyelinerColor).
        _LinerColor ("Lower Liner Color", Color) = (0.09, 0.08, 0.09, 1)
        _LinerIntensity ("Lower Liner Intensity", Range(0, 1)) = 0
        // 애교살 — 상=하이라이트(가산/스크린, 통통 광채), 하=섀도(감산/곱, 볼록 정의).
        _AegyoHiColor ("Aegyo Highlight Color", Color) = (1.0, 0.95, 0.88, 1)
        _AegyoShColor ("Aegyo Shadow Color", Color) = (0.69, 0.54, 0.41, 1)
        _AegyoIntensity ("Aegyo Intensity", Range(0, 1)) = 0
        // 임포트 애교살 그림(데칼) — 밴드 (가로×세로) UV에 워프. 알파=그린 영역.
        _AegyoTex ("Aegyo Art", 2D) = "black" {}
        _AegyoStyleIntensity ("Aegyo Art Intensity", Range(0, 1)) = 0
        // 삼각존(하안검 밴드 확장) — 눈꼬리 바로 아래 좁은 삼각 음영. 꼬리(along
        // 바깥 1/3) 가중, 라인 근처 세로 집중. 감산(곱) 섀도. _TriIntensity 0 = 끔.
        _TriColor ("Triangle Zone Color", Color) = (0.29, 0.20, 0.16, 1) // 딥브라운 #4A342A 계열
        _TriIntensity ("Triangle Zone Intensity", Range(0, 1)) = 0
        // 눈밑 컨실러(§08) — 언더아이 홀로우(눈물고랑)를 밝히는 넓고 부드러운 브라이튼.
        // 애교살보다 세로로 넓고 페더 강함. 스크린(가산). _ConcealerIntensity 0 = 끔.
        _ConcealerColor ("Concealer Color", Color) = (0.98, 0.86, 0.76, 1)
        _ConcealerIntensity ("Concealer Intensity", Range(0, 1)) = 0
        // A3 아이섀도 하 — 하안검 lash(v=0)에서 아래로 부드럽게 페이드하는 섀도 밴드.
        // 라인/애교살보다 아래(먼저)에 곱(감산) 블렌드로 깔린다. _LowerShadowIntensity 0 = 끔.
        _LowerShadowColor ("Lower Shadow Color", Color) = (0.55, 0.42, 0.40, 1)
        _LowerShadowIntensity ("Lower Shadow Intensity", Range(0, 1)) = 0
        // 마감 — 블러셔와 동일 enum(0 새틴 1 매트 2 글로시 3 시머). ApplyFinish 레거시
        // 경로(세부 0 상수)라 0=새틴=기존 출력과 바이트 동일(하위호환).
        _AegyoFinish ("Aegyo Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _AegyoShimmer ("Aegyo Shimmer Gain", Range(0, 1)) = 0.5
        _LowerShadowFinish ("Lower Shadow Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _LowerShadowShimmer ("Lower Shadow Shimmer Gain", Range(0, 1)) = 0.5
    }

    SubShader
    {
        // 아이섀도(+9) 위, 홍채(+11)·아이라이너(+12) 아래. +10의 EyeStencil은
        // 스텐실 버퍼만 쓰는 마스크 패스라 색 그리기 순서와 무관.
        Tags { "Queue" = "Transparent+10" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // FaceMakeup/Eyeshadow와 동일 이름 → 프레임당 1회 공유

        Pass
        {
            ZWrite Off
            ZTest Always
            Cull Off
            Blend SrcAlpha OneMinusSrcAlpha
            // 눈 열림(EyeStencil=1) 밖에서만 — 랜드마크가 흔들려도 밴드가 눈알을
            // 찌르고 들어가지 않는다 (스텐실 큐가 하안검보다 앞: MakeupQueues 참조).
            Stencil { Ref 1 Comp NotEqual }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc" // §11 세그 오클루전 게이트 (전역 유니폼)
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — _CameraFeed도 여기서 선언

            fixed4 _LinerColor;
            float _LinerIntensity;
            fixed4 _AegyoHiColor;
            fixed4 _AegyoShColor;
            float _AegyoIntensity;
            sampler2D _AegyoTex;
            float _AegyoStyleIntensity;
            fixed4 _TriColor;
            float _TriIntensity;
            fixed4 _ConcealerColor;
            float _ConcealerIntensity;
            fixed4 _LowerShadowColor;
            float _LowerShadowIntensity;
            // 마감 — 애교살(하이라이트 밴드)·아이섀도 하. 0=새틴=기존 출력(하위호환).
            float _AegyoFinish;
            float _AegyoShimmer;
            float _LowerShadowFinish;
            float _LowerShadowShimmer;

            // 삼각존 프로파일 상수 (전부 실기기 튜닝 대상).
            #define TRI_U_START 0.62   // 꼬리 가중 시작 u (0.6~0.7 사이에서 상승)
            #define TRI_U_RAMP  0.20   // 상승 구간 폭 (TRI_U_START→+RAMP 에서 smoothstep)
            #define TRI_FEATHER 0.10   // 바깥 코너(메시 경계) 페더 폭
            #define TRI_V_WIDTH 0.55   // 세로 폭 비율 — 라인(v=0) 근처에서 이 값까지 페이드

            // 컨실러 세로 벨 프로파일 상수 (실기기 튜닝 대상) — 원시 v(초승달 vv 아님)
            // 기준. 애교살 하이라이트(vv 0.06~0.45)보다 아래·넓게 퍼져 홀로우 전체를 덮고,
            // 램프를 길게 잡아 경계가 안 보이게 페더. 밴드 하단(v=1)까지 부드럽게 소멸.
            #define CC_V_LO     0.06   // 위쪽 페이드 인 시작 (lash 라인 바로 아래)
            #define CC_V_LO_HI  0.38   // 위쪽 페이드 인 끝 (넓고 부드럽게)
            #define CC_V_HI_LO  0.66   // 아래쪽 페이드 아웃 시작 (홀로우 하단)
            #define CC_V_HI     1.00   // 아래쪽 페이드 아웃 끝 (밴드 하단까지)

            #define ES_V_FADE   0.55   // A3 아이섀도 하: lash(v=0)에서 이 v까지 아래로 페이드 (실기기 튜닝 대상)

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x=가로(0 안쪽→1 바깥), y=세로(0 lash→1 아래)
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

                float along = i.uv.x;
                float v = i.uv.y;

                // 가로 가중: 코너 페이드(라인용).
                float edge = smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.92, 1.0, along));

                // 초승달 두께 프로파일 — 애교살은 눈 중앙이 가장 도톰하고 양 끝(앞머리
                // along=0·꼬리 along=1)에서 lash 라인에 수렴하며 자연 소멸한다. 좌우
                // 대칭 벨(0→0.28 진입 · 0.72→1 소멸, 중앙 0.28~0.72 평탄)이라 한쪽만
                // 두꺼운 "보트/멜론 조각"이 안 생긴다(구 프로파일은 안쪽만 길게 테이퍼하고
                // 꼬리는 35%만 좁혀 바깥이 뭉툭한 보트가 됐다). 알파 페이드만으로는 균일
                // 두께 리본으로 보여서 세로 좌표를 두께로 나눠(vv) 기하 자체를 테이퍼한다.
                float thick = smoothstep(0.0, 0.28, along)
                              * (1.0 - smoothstep(0.72, 1.0, along));
                float vv = v / max(thick, 1e-3);
                // 밝기는 은은한 중앙 강조만 — 모양은 위 두께 테이퍼가 담당.
                float soft = 0.5 + 0.5 * sin(3.14159 * along);

                // 아이라인(하): lash 바로 아래 얇은 라인 (초승달 테이퍼와 무관).
                float lnAmt = (1.0 - smoothstep(0.10, 0.22, v)) * edge * _LinerIntensity;
                // 애교살 하이라이트: 라인 아래 도톰한 밴드. edge를 곱해 꼬리(바깥)
                // 메시 경계에서 알파가 하드 엣지로 끊기지 않게 한다(안쪽은 thick→0).
                float hiAmt = smoothstep(0.06, 0.24, vv) * (1.0 - smoothstep(0.40, 0.58, vv))
                              * soft * edge * _AegyoIntensity;
                // 애교살 섀도: 볼록 아래 경계의 얇은 줄 — 하이라이트보다 아래(vv 큼)에
                // 살짝 간격을 두고 깔려 "위 밝은 도톰함 + 아래 그림자" 2줄로 볼록을
                // 정의한다. 0.7배로 은은하게(구 브랜치와 동일 비율).
                float shAmt = smoothstep(0.52, 0.66, vv) * (1.0 - smoothstep(0.78, 0.92, vv))
                              * soft * edge * _AegyoIntensity * 0.7;

                // 삼각존: 눈꼬리 바로 아래 좁은 삼각 음영(눈밑 전체 아님). 애교살과 무관한
                // 별도 텀 — 꼬리(u 바깥 1/3)에서 상승, 코너에서 페더, 세로는 lash 라인(v=0)
                // 근처에 집중(위 라인↔아래로 잇는 음영). 초승달 테이퍼 vv가 아닌 원시 v를
                // 써서 라인에 딱 붙는 삼각 그림자로 둔다.
                float triAlong = smoothstep(TRI_U_START, TRI_U_START + TRI_U_RAMP, along)
                                 * (1.0 - smoothstep(1.0 - TRI_FEATHER, 1.0, along));
                float triV = 1.0 - smoothstep(0.0, TRI_V_WIDTH, v); // 라인에서 아래로 페이드
                float triAmt = triAlong * triV * _TriIntensity;

                // 눈밑 컨실러(§08): lash 라인 아래 언더아이 홀로우를 덮는 넓고 부드러운
                // 브라이튼. 애교살 하이라이트(vv 기준 도톰한 리본)와 달리 원시 v를 써서
                // 세로로 넓게 퍼지고, 램프가 길어 경계가 안 보인다. edge로 앞머리·꼬리
                // 코너만 접어 눈밑 가로 전체(안쪽↔바깥)를 균일하게 밝힌다.
                float ccBand = smoothstep(CC_V_LO, CC_V_LO_HI, v)
                               * (1.0 - smoothstep(CC_V_HI_LO, CC_V_HI, v));
                float ccAmt = ccBand * edge * _ConcealerIntensity;

                // A3 아이섀도 하: lash 라인(v=0) 바로 아래에서 ES_V_FADE까지 부드럽게
                // 페이드하는 섀도 밴드. hiAmt/shAmt 프로파일과 동형(edge 코너 접기·원시 v
                // 기준). 라인·애교살보다 아래에 곱 블렌드로 깔린다(아래 comb 단계). 강도 0 = 무영향.
                float esBand = 1.0 - smoothstep(0.0, ES_V_FADE, v);
                float esAmt = esBand * edge * _LowerShadowIntensity;

                // 색소(피드 기준 풀강도): 라이너=루마 보존 틴트, 하이라이트=스크린(가산),
                // 섀도=곱(감산) — FaceMakeup 가·감산 브랜치와 동일 공식.
                fixed3 pigLn = _LinerColor.rgb * (luma * 1.2 + 0.08);
                fixed3 pigHi = 1.0 - (1.0 - feed) * (1.0 - _AegyoHiColor.rgb);
                // 애교살 마감 — 하이라이트 밴드에 ApplyFinish(시머=펄 애교살, 매트=톤다운).
                // sparkleUV는 밴드 로컬 uv라 시머가 밴드에 접착. 0=새틴=무변형(하위호환).
                pigHi = ApplyFinish(pigHi, luma, i.uv, _AegyoFinish, _AegyoShimmer,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                fixed3 pigSh = feed * _AegyoShColor.rgb;
                fixed3 pigTri = feed * _TriColor.rgb; // 삼각존 = 곱(감산) 딥브라운 섀도
                // 컨실러 = 스크린(가산) 브라이튼 — FaceMakeup 눈밑 존 마스크 경로와 동일 공식.
                fixed3 pigCc = 1.0 - (1.0 - feed) * (1.0 - _ConcealerColor.rgb);
                fixed3 pigEs = feed * _LowerShadowColor.rgb; // A3 아이섀도 하 = 곱(감산) 섀도
                pigEs = ApplyFinish(pigEs, luma, i.uv, _LowerShadowFinish, _LowerShadowShimmer,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);

                float total = lnAmt + hiAmt + shAmt + triAmt + ccAmt;
                float procA = saturate(total);
                fixed3 procPig = (pigLn * lnAmt + pigHi * hiAmt + pigSh * shAmt
                                  + pigTri * triAmt + pigCc * ccAmt)
                                 / max(total, 1e-4);

                // A3 아이섀도 하 — 아래 깔린 섀도(ES) 위에 TOP(라인/애교살/삼각존/컨실러 =
                // procPig/procA)을 얹는(over) 2단 합성. 애교살이 섀도 위로 뜬다. esAmt 0이면
                // combA=procA·combPig=procPig → 기존 출력과 픽셀 동일(룩 불변).
                float combA = procA + esAmt * (1.0 - procA);
                fixed3 combPig = (procPig * procA + pigEs * esAmt * (1.0 - procA))
                                 / max(combA, 1e-4);

                // 임포트 애교살 그림 — (가로×세로) 밴드에 워프된 스티커(그린 색 그대로).
                // 절차적 애교살 위에 "over" 합성한다(둘 다 SrcAlpha로 피드 위에 얹힘).
                fixed4 art = tex2D(_AegyoTex, i.uv);
                float artA = art.a * _AegyoStyleIntensity;
                float outA = artA + combA * (1.0 - artA);
                fixed3 outRGB = (art.rgb * artA + combPig * combA * (1.0 - artA))
                                / max(outA, 1e-4);
                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                return fixed4(outRGB, outA * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
