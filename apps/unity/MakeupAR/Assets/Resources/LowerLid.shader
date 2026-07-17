// 하안검 밴드 — 하안검 lash 라인에서 아래로 확장한 밴드 메시(LowerLidRenderer)에
// 아이라인(하)·아이섀도 하·삼각존·컨실러를 GrabPass 피드 위에 그린다.
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
        // 아이라인(하) — 전용 색(legacy payload는 컨트롤러에서 상안검 색으로 폴백).
        _LinerColor ("Lower Liner Color", Color) = (0.09, 0.08, 0.09, 1)
        _LinerIntensity ("Lower Liner Intensity", Range(0, 1)) = 0
        _LowerLinerStyle ("Lower Liner Style (0 soft 1 waterline 2 outer third)", Float) = 0
        _LowerLinerFinish ("Lower Liner Finish (0 satin 1 matte 2 gloss 3 pearl)", Float) = 0
        _LowerLinerShimmer ("Lower Liner Shimmer", Range(0, 1)) = 0
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
        _LowerShadowShape ("Lower Shadow Shape (0 full 1 inner 2 center 3 outer 4 gradient)", Float) = 0
        // 마감 — 블러셔와 동일 enum(0 새틴 1 매트 2 글로시 3 시머). ApplyFinish 레거시
        // 경로(세부 0 상수)라 0=새틴=기존 출력과 바이트 동일(하위호환).
        _LowerShadowFinish ("Lower Shadow Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _LowerShadowShimmer ("Lower Shadow Shimmer Gain", Range(0, 1)) = 0.5
        // 삼각존·컨실러 마감 — ApplyFinish 레거시 경로(세부 0 상수)라 0=새틴=기존 출력(하위호환).
        _TriFinish ("Triangle Zone Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _ConcealerFinish ("Concealer Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        // 핏(개인 공간 델타) 배수 — 1=원래(현행 프로파일과 바이트 동일). 각 제품의 세로
        // 프로파일 폭(밴드 높이/라인 두께)만 스케일하며 부위 간 독립(자기 텀에만 곱).
        _LinerThickness ("Lower Liner Thickness Mult", Float) = 1
        _TriHeight ("Triangle Zone Height Mult", Float) = 1
        _LowerShadowHeight ("Lower Shadow Height Mult", Float) = 1
        // 제형(텍스처) — GENERIC 템플릿 enum(0=크림=현행). Finish.cginc TexBundleFromEnum 미러.
        // 컨실러는 FaceMakeup 붉은기 경로와 같은 concealerTexture 값을 공유(부위 1개, 셰이더 2곳).
        // _AegyoTexture는 애교살 분리(Aegyo.shader) 전까지 언팩만 선언 유지.
        _AegyoTexture ("Aegyo Texture (generic enum)", Float) = 0
        _TriTexture ("Triangle Zone Texture (generic enum)", Float) = 0
        _LowerShadowTexture ("Lower Shadow Texture (generic enum)", Float) = 0
        _ConcealerTexture ("Concealer Texture (generic enum)", Float) = 0
        // 모양 축(W1+W2) — 부위별 실루엣 프리셋. 0=현행 프로파일과 바이트 동일(하위호환).
        _LinerSegment ("Lower Liner Segment (0 full 1 tail 2 front+tail)", Float) = 0
        _TriShape ("Triangle Zone Shape (0 base 1 narrow 2 wide)", Float) = 0
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
            float _LowerLinerStyle;
            float _LowerLinerFinish;
            float _LowerLinerShimmer;
            fixed4 _TriColor;
            float _TriIntensity;
            fixed4 _ConcealerColor;
            float _ConcealerIntensity;
            fixed4 _LowerShadowColor;
            float _LowerShadowIntensity;
            float _LowerShadowShape;
            // 마감 — 아이섀도 하. 0=새틴=기존 출력(하위호환).
            float _LowerShadowFinish;
            float _LowerShadowShimmer;
            // 삼각존·컨실러 마감 — 0=새틴=기존 출력(하위호환).
            float _TriFinish;
            float _ConcealerFinish;
            // 핏 배수(1=원래) — 자기 제품 세로 프로파일 폭만 스케일.
            float _LinerThickness;
            float _TriHeight;
            float _LowerShadowHeight;
            // 제형(텍스처) — GENERIC 템플릿 enum(0=크림=현행).
            float _AegyoTexture;
            float _TriTexture;
            float _LowerShadowTexture;
            float _ConcealerTexture; // 눈밑존 — FaceMakeup 붉은기 경로와 같은 값 공유
            // 모양 축(W1+W2) — 0=현행 프로파일과 바이트 동일(하위호환).
            float _LinerSegment;
            float _TriShape;

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

            float LowerLinerHorizontalMask(float style, float along)
            {
                float edgeFade = smoothstep(0.0, 0.08, along)
                               * (1.0 - smoothstep(0.92, 1.0, along));
                if (style > 1.5)
                {
                    // 해부학 u(안쪽0→바깥1)라 양쪽 눈에서 자동으로 바깥 1/3에 붙는다.
                    return edgeFade * smoothstep(0.58, 0.82, along);
                }
                return edgeFade;
            }

            float LowerShadowHorizontalMask(float shape, float along)
            {
                float edge = smoothstep(0.0, 0.08, along)
                           * (1.0 - smoothstep(0.92, 1.0, along));
                if (shape < 0.5) return edge;
                if (shape < 1.5) return edge * (1.0 - smoothstep(0.22, 0.5, along));
                if (shape < 2.5)
                    return edge * smoothstep(0.18, 0.4, along)
                                * (1.0 - smoothstep(0.6, 0.82, along));
                if (shape < 3.5) return edge * smoothstep(0.5, 0.78, along);
                return edge * lerp(0.55, 1.0, smoothstep(0.2, 0.86, along));
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));

                // 제형(텍스처) — GENERIC 시드 번들(애교살·삼각존·아이섀도 하·눈밑 컨실러).
                // body/grain=색소, coverage/edge=밴드 amt. enum 0(크림)=ZERO → 네 헬퍼
                // 조기 반환 = 바이트 동일(하위호환).
                float agTexE, agTexG, agTexC, agTexB; TexBundleFromEnum(0.0, _AegyoTexture, agTexE, agTexG, agTexC, agTexB);
                float trTexE, trTexG, trTexC, trTexB; TexBundleFromEnum(0.0, _TriTexture, trTexE, trTexG, trTexC, trTexB);
                float esTexE, esTexG, esTexC, esTexB; TexBundleFromEnum(0.0, _LowerShadowTexture, esTexE, esTexG, esTexC, esTexB);
                float ccTexE, ccTexG, ccTexC, ccTexB; TexBundleFromEnum(0.0, _ConcealerTexture, ccTexE, ccTexG, ccTexC, ccTexB);

                float along = i.uv.x;
                float v = i.uv.y;

                // 가로 가중: 코너 페이드(라인용).
                float edge = smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.92, 1.0, along));

                // 하안검 라이너 구간(_LinerSegment) — along(0 앞머리→1 꼬리) 구간 게이트.
                // 0=전체=현행 바이트 동일. 1=꼬리만(바깥 1/3). 2=앞+꼬리(중앙 비움). 상라이너
                // EYELINER_SEGMENTS 관례를 하안검 along 축에 이식(경계 smoothstep 페더).
                float lnSeg = 1.0;
                if (_LinerSegment > 1.5)        // 2 = 앞 + 꼬리 (중앙 비움)
                    lnSeg = max(1.0 - smoothstep(0.28, 0.38, along), smoothstep(0.62, 0.72, along));
                else if (_LinerSegment > 0.5)   // 1 = 꼬리만 (바깥 1/3)
                    lnSeg = smoothstep(0.62, 0.72, along);
                // 아이라인(하): lash 바로 아래 얇은 라인 (초승달 테이퍼와 무관).
                // 두께 핸들(_LinerThickness) — 세로 폭 [0.08, linerWidth]를 배수. 1=원래(하위호환).
                float linerWidth = (_LowerLinerStyle > 0.5 && _LowerLinerStyle < 1.5)
                                 ? 0.13 : 0.22;
                float lnAmt = (1.0 - smoothstep(0.08 * _LinerThickness, linerWidth * _LinerThickness, v))
                            * LowerLinerHorizontalMask(_LowerLinerStyle, along)
                            * _LinerIntensity * lnSeg;
                // 삼각존: 눈꼬리 바로 아래 좁은 삼각 음영(눈밑 전체 아님). 애교살과 무관한
                // 별도 텀 — 꼬리(u 바깥 1/3)에서 상승, 코너에서 페더, 세로는 lash 라인(v=0)
                // 근처에 집중(위 라인↔아래로 잇는 음영). 초승달 테이퍼 vv가 아닌 원시 v를
                // 써서 라인에 딱 붙는 삼각 그림자로 둔다.
                float triAlong = smoothstep(TRI_U_START, TRI_U_START + TRI_U_RAMP, along)
                                 * (1.0 - smoothstep(1.0 - TRI_FEATHER, 1.0, along));
                // 높이 핸들(_TriHeight) — 세로 폭 TRI_V_WIDTH를 배수. 1=원래(하위호환).
                // 모양(_TriShape) — 세로 폭 배수(0=기본=1.0=현행 바이트 동일, 1=좁게, 2=넓게).
                float triShapeW = (_TriShape > 1.5) ? 1.6 : ((_TriShape > 0.5) ? 0.6 : 1.0);
                // 페이드 거리는 밴드 세로 범위(v<=1)를 넘지 않게 클램프 — 넓게(1.6)×높이(2.0)
                // 극값 조합에서 v=1 하단이 안 꺼져 직선 컷으로 삐져나오는 것 방지. 기본값
                // (0.55×1×1=0.55<1)에선 min이 항등이라 바이트 동일.
                float triV = 1.0 - smoothstep(0.0, min(TRI_V_WIDTH * _TriHeight * triShapeW, 1.0), v); // 라인에서 아래로 페이드
                float triAmt = triAlong * triV * _TriIntensity;
                triAmt = TexEdge(TexCoverage(saturate(triAmt), trTexC), trTexE); // 제형 커버·엣지(삼각존)

                // 눈밑 컨실러(§08): lash 라인 아래 언더아이 홀로우를 덮는 넓고 부드러운
                // 브라이튼. 애교살 하이라이트(vv 기준 도톰한 리본)와 달리 원시 v를 써서
                // 세로로 넓게 퍼지고, 램프가 길어 경계가 안 보인다. edge로 앞머리·꼬리
                // 코너만 접어 눈밑 가로 전체(안쪽↔바깥)를 균일하게 밝힌다.
                float ccBand = smoothstep(CC_V_LO, CC_V_LO_HI, v)
                               * (1.0 - smoothstep(CC_V_HI_LO, CC_V_HI, v));
                float ccAmt = ccBand * edge * _ConcealerIntensity;
                ccAmt = TexEdge(TexCoverage(saturate(ccAmt), ccTexC), ccTexE); // 제형 커버·엣지(눈밑 컨실러)

                // A3 아이섀도 하: lash 라인(v=0) 바로 아래에서 ES_V_FADE까지 부드럽게
                // 페이드하는 섀도 밴드. hiAmt/shAmt 프로파일과 동형(edge 코너 접기·원시 v
                // 기준). 라인·애교살보다 아래에 곱 블렌드로 깔린다(아래 comb 단계). 강도 0 = 무영향.
                // 높이 핸들(_LowerShadowHeight) — 페이드 폭 ES_V_FADE를 배수. 1=원래(하위호환).
                // 페이드 거리 클램프(triV와 동일 근거) — 극값에서 v=1 직선 컷 방지, 기본값 항등.
                float esBand = 1.0 - smoothstep(0.0, min(ES_V_FADE * _LowerShadowHeight, 1.0), v);
                float esAmt = esBand * LowerShadowHorizontalMask(_LowerShadowShape, along)
                            * _LowerShadowIntensity;
                esAmt = TexEdge(TexCoverage(saturate(esAmt), esTexC), esTexE); // 제형 커버·엣지(아이섀도 하)

                // 색소(피드 기준 풀강도): 라이너=루마 보존 틴트.
                fixed3 pigLn = _LinerColor.rgb * (luma * 1.2 + 0.08);
                pigLn = ApplyFinish(pigLn, luma, i.uv, _LowerLinerFinish, _LowerLinerShimmer,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                fixed3 pigTri = feed * _TriColor.rgb; // 삼각존 = 곱(감산) 딥브라운 섀도
                pigTri = TexBody(pigTri, luma, trTexB); // 제형 발색 body(삼각존)
                // 삼각존 마감 — 0=새틴=무변형(하위호환).
                pigTri = ApplyFinish(pigTri, luma, i.uv, _TriFinish, 0,
                                     0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigTri = TexGrain(pigTri, i.uv, trTexG); // 제형 그레인(삼각존)
                // 컨실러 = 스크린(가산) 브라이튼 — FaceMakeup 눈밑 존 마스크 경로와 동일 공식.
                fixed3 pigCc = 1.0 - (1.0 - feed) * (1.0 - _ConcealerColor.rgb);
                pigCc = TexBody(pigCc, luma, ccTexB); // 제형 발색 body(눈밑 컨실러)
                // 눈밑 컨실러 마감 — 0=새틴=무변형(하위호환).
                pigCc = ApplyFinish(pigCc, luma, i.uv, _ConcealerFinish, 0,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigCc = TexGrain(pigCc, i.uv, ccTexG); // 제형 그레인(눈밑 컨실러)
                fixed3 pigEs = feed * _LowerShadowColor.rgb; // A3 아이섀도 하 = 곱(감산) 섀도
                pigEs = TexBody(pigEs, luma, esTexB); // 제형 발색 body(아이섀도 하)
                pigEs = ApplyFinish(pigEs, luma, i.uv, _LowerShadowFinish, _LowerShadowShimmer,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigEs = TexGrain(pigEs, i.uv, esTexG); // 제형 그레인(아이섀도 하)

                float total = lnAmt + triAmt + ccAmt;
                float procA = saturate(total);
                fixed3 procPig = (pigLn * lnAmt + pigTri * triAmt + pigCc * ccAmt)
                                 / max(total, 1e-4);

                // A3 아이섀도 하 — 아래 깔린 섀도(ES) 위에 TOP(라인/애교살/삼각존/컨실러 =
                // procPig/procA)을 얹는(over) 2단 합성. 애교살이 섀도 위로 뜬다. esAmt 0이면
                // combA=procA·combPig=procPig → 기존 출력과 픽셀 동일(룩 불변).
                float combA = procA + esAmt * (1.0 - procA);
                fixed3 combPig = (procPig * procA + pigEs * esAmt * (1.0 - procA))
                                 / max(combA, 1e-4);

                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                return fixed4(combPig, combA * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
