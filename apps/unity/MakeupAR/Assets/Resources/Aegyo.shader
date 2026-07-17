// 애교살 전용 셰이더(포크 SPLIT 구조) — 하안검 lash 라인 바로 아래에 얇은 볼륨 롤을
// 그린다. LowerLid(아이라인·삼각존·컨실러·아이섀도 하)와 분리된 전용 메시(AegyoRenderer)·
// 전용 큐(MakeupQueues.Aegyo). 포크 고유 기능은 유지한다: 단일 _AegyoColor 틴트,
// _AegyoMode(0 자연 볼륨 / 1 펄 포인트), 능선과 독립적인 _AegyoShadowIntensity(음영),
// _AegyoShimmer(펄). 여기에 업스트림 ARwithFable의 시각 품질을 이식했다:
//   · 능선(위 밝음)+골(아래 얇은 그림자) 2단 볼륨 롤(172c0be) — 대칭 벨 폐기.
//   · v3 비대칭 평탄대 두께 프로파일(85c2803) — 앞 완만 차오름·눈동자 아래 미세 볼록·
//     꼬리 뭉툭 페이드. 알파 상한 0.75/0.50(살처럼 은은, 포화 방어).
//   · FitArc 곡선 기준 픽셀 거리장(SDF, 3d71a28) — 폴리라인 각짐을 구조적으로 소거.
//   · 제형(_AegyoTexture)·모양(_AegyoShape) 축(94aed0e) — 최종 SDF 프로파일 위에서 분기.
//
// 정점 uv: x = 가로(0 안쪽 눈머리 → 1 바깥 눈꼬리), y = 세로(0 lash 라인 → 1 아래 끝).
Shader "ARMakeup/Aegyo"
{
    Properties
    {
        _AegyoColor ("Aegyo Color", Color) = (0.95, 0.82, 0.78, 1)
        _AegyoIntensity ("Aegyo Lift", Range(0, 1)) = 0
        _AegyoShadowIntensity ("Aegyo Shadow", Range(0, 1)) = 0
        _AegyoMode ("Aegyo Mode (0 natural 1 pearl)", Float) = 0
        _AegyoShimmer ("Aegyo Pearl", Range(0, 1)) = 0
        // 제형(텍스처) — GENERIC 템플릿 enum(0=크림=현행). Finish.cginc TexBundleFromEnum 미러.
        _AegyoTexture ("Aegyo Texture (generic enum)", Float) = 0
        // 모양 축 — 0=초승달(현행 비대칭 평탄대) 1=일자 2=중앙 도톰(렌즈형).
        _AegyoShape ("Aegyo Shape (0 crescent 1 straight 2 center)", Float) = 0
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
            Stencil { Ref 1 Comp NotEqual }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc"
            #include "Finish.cginc"    // 제형(TexBundleFromEnum 등) 공용 — _CameraFeed도 여기서 선언

            fixed4 _AegyoColor;
            float _AegyoIntensity;
            float _AegyoShadowIntensity;
            float _AegyoMode;
            float _AegyoShimmer;
            float _AegyoTexture;
            float _AegyoShape;

            // 애교살 볼륨 프로파일 상수 (전부 실기기 튜닝 대상) — "판"이 아니라 "살(볼록 롤)".
            // 롤은 하안검 lash 라인 바로 아래 얇게 붙는다: aegyoV = d/Troll 로 SDF 수직거리를
            // 롤 두께로 정규화(0=lash 곡선 → 1=롤 바깥 끝). 능선(위 밝음)+골(아래 얇은 그림자)
            // 2단으로 볼록을 정의하고, intensity는 "패널 불투명도"가 아니라 능선/골 대비
            // 강도로 걸린다(피크 알파 상한 AEGYO_HI_MAX/AEGYO_SH_MAX — 100%여도 살처럼 은은).
            #define AEGYO_BAND    0.50   // 롤이 차지하는 밴드 세로 비율. 작을수록 얇은 롤
            #define AEGYO_HI_MAX  0.75   // 능선 하이라이트 피크 알파 상한(실물 대조 상향 0.55→0.75, 여전히 <1 포화 방어)
            #define AEGYO_SH_MAX  0.50   // 골 그림자 피크 알파 상한(실물 대조 상향 0.38→0.50, 하이라이트보다 약한 감산·<1 유지)
            // shape 0(기본) 두께 프로파일 = "비대칭 평탄대"(대칭 sin 아치 폐기). 실물 관찰:
            // 두께가 눈 폭 대부분에서 균일, 눈동자 아래만 살짝 도톰, 꼬리는 중앙과 같게 이어지다
            // 끝에서 짧고 뭉툭하게 소멸, 눈머리는 더 빨리 옅어짐. thick = riseIn·plateau·fadeOut.
            #define AEGYO_IN_RISE     0.16 // 눈머리(t 0)에서 평탄대까지 차오르는 폭. 클수록 앞이 완만하게 옅음
            #define AEGYO_PUPIL_BULGE 0.12 // 눈동자 아래 미세 볼록량(평탄대 위 sin 융기). 0이면 완전 균일(일자)
            #define AEGYO_TAIL_START  0.86 // 꼬리 페이드 시작 t. 1.0까지 짧은 구간에 소멸 = 뭉툭(뾰족 금지)

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x=가로(0 안쪽→1 바깥), y=세로(0 lash→1 아래)
                // 애교살 SDF(아크 피팅 거리장) — 정점당 밴드 로컬 좌표 + 눈당 곡선 계수.
                float2 localXY : TEXCOORD1; // 밴드 로컬(이미지 공간): x=현축(눈머리→눈꼬리), y=아래(피부) 축
                float4 curve   : TEXCOORD2; // FitArc 곡선 (k0, k1, L=눈폭, bandWidth) — 눈당 상수
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float2 localXY : TEXCOORD2; // 애교살 SDF 밴드 로컬 좌표(픽셀당 보간)
                float4 curve   : TEXCOORD3; // 애교살 SDF 곡선 계수(눈당 상수)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                o.localXY = v.localXY;
                o.curve = v.curve;
                return o;
            }

            float Bell(float center, float width, float value)
            {
                float x = (value - center) / max(width, 1e-4);
                return exp(-2.2 * x * x);
            }

            float PearlNoise(float2 uv)
            {
                float2 cell = floor(uv * float2(46.0, 22.0));
                return frac(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));

                // 제형(텍스처) — GENERIC 시드 번들. body/grain=색소, coverage/edge=밴드 amt.
                // enum 0(크림)=ZERO → 헬퍼 조기 반환 = 바이트 동일(하위호환).
                float agTexE, agTexG, agTexC, agTexB;
                TexBundleFromEnum(0.0, _AegyoTexture, agTexE, agTexG, agTexC, agTexB);

                // ── 애교살 SDF(아크 피팅 곡선 + 픽셀 단위 거리장) ──────────────────────────
                // 픽셀의 밴드 로컬 위치(localXY, 픽셀당 보간)에서 FitArc 곡선까지의 수직 거리
                // d를 매 픽셀 해석적으로 재서 능선/골 밴드를 긋는다 — 등고선이 곡선의 오프셋
                // 곡선이라 메시 테셀레이션과 무관하게 매끈하다(폴리라인 각짐이 구조적으로 소거).
                float k0c = i.curve.x, k1c = i.curve.y;
                float Lc = max(i.curve.z, 1e-5);   // 눈폭(현 길이, 이미지 단위)
                float bw = max(i.curve.w, 1e-5);   // 밴드 세로 폭(이미지 단위, v=1 상당)
                float t = saturate(i.localXY.x / Lc); // 곡선 위 파라미터: 0=눈머리 1=눈꼬리
                // 피팅 곡선 Yc(t)와 기울기(FitArc와 동일 v(u)=k0·u(1−u)+k1·u²(1−u)).
                float Yc  = k0c * t * (1.0 - t) + k1c * t * t * (1.0 - t);
                float dYc = k0c * (1.0 - 2.0 * t) + k1c * (2.0 * t - 3.0 * t * t); // dY/dt
                float slope = dYc / Lc;              // dY/dX
                // 수직 낙하 근사 + 기울기 1차 보정 = 곡선까지 수직거리(아래=피부 방향 양수).
                float d = (i.localXY.y - Yc) / sqrt(1.0 + slope * slope);

                // 롤 두께 T(t) = v3 비대칭 평탄대 × AEGYO_BAND × bandWidth. thick 프로파일은
                // 연속이라 SDF 위에서도 각 없이 매끈(_AegyoShape 3형 그대로 스위치).
                float riseIn  = smoothstep(0.0, AEGYO_IN_RISE, t);            // 눈머리 빠른 차오름
                float plateau = 1.0 + AEGYO_PUPIL_BULGE
                                * sin(3.14159 * saturate((t - 0.15) / 0.55)); // 눈동자 아래 미세 볼록
                float fadeOut = 1.0 - smoothstep(AEGYO_TAIL_START, 1.0, t);   // 꼬리 짧고 뭉툭한 소멸
                float arch = sin(3.14159 * t);                               // shape 2 전용(끝 0)
                float thick;
                if (_AegyoShape > 1.5)        thick = pow(arch, 2.2);        // 2 중앙 도톰(렌즈형)
                else if (_AegyoShape > 0.5)   thick = riseIn * fadeOut;      // 1 일자(볼록 0)
                else                          thick = riseIn * plateau * fadeOut; // 0 비대칭 평탄대
                float Troll = max(thick * AEGYO_BAND * bw, 1e-5);            // 롤 세로 두께(이미지 단위)
                float aegyoV = d / Troll;   // 0=lash 곡선 → 1=롤 바깥 끝

                // 코너 페이드·중앙 강조는 곡선 파라미터 t 기준(밴드 along 대신) — 완전 해석적.
                float aegyoEdge = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.92, 1.0, t));
                float soft = 0.5 + 0.5 * sin(3.14159 * t); // 은은한 중앙 강조

                // 능선 하이라이트: 곡선(위)에서 소프트하게 올라와 aegyoV 0.15~0.5에서 피크,
                // 아래로 감쇠. 경계는 전부 smoothstep 페더(각짐 금지) — v3 세로 구조의 SDF 번역.
                float ridge = smoothstep(0.0, 0.15, aegyoV) * (1.0 - smoothstep(0.5, 0.72, aegyoV));
                // 골 그림자: 능선 아래 얇은 줄(aegyoV 0.75~0.95) — 살의 아래 윤곽으로 볼록 정의.
                float valley = smoothstep(0.70, 0.80, aegyoV) * (1.0 - smoothstep(0.90, 1.0, aegyoV));

                // intensity = 능선/골 대비 강도(패널 불투명도 아님). 피크 알파 상한(AEGYO_*_MAX)으로
                // 눌러 100%여도 살처럼 은은하고, soft·thick이 알파에 곱해져 양끝 소멸 그라데 유지.
                // 포크 고유: 능선(하이라이트)은 _AegyoIntensity, 골(음영)은 독립 _AegyoShadowIntensity.
                float hiAmt = ridge * soft * aegyoEdge * _AegyoIntensity * AEGYO_HI_MAX;
                hiAmt = TexEdge(TexCoverage(saturate(hiAmt), agTexC), agTexE); // 제형 커버·엣지(애교살 능선)
                float shAmt = valley * soft * aegyoEdge * _AegyoShadowIntensity * AEGYO_SH_MAX;
                shAmt = TexEdge(TexCoverage(saturate(shAmt), agTexC), agTexE); // 제형 커버·엣지(애교살 골)

                // 색소(피드 기준): 포크 단일 틴트 유지 — 능선=루마 틴트 스크린 리프트, 골=곱(감산).
                // 실제 피부 루마·결을 출발점으로 두고 작은 screen lift와 틴트만 더한다.
                fixed3 lumaTint = _AegyoColor.rgb * (luma * 0.92 + 0.08);
                fixed3 liftTarget = lerp(feed, lumaTint, 0.32);
                liftTarget = saturate(liftTarget + (1.0 - feed) * 0.10);
                liftTarget = TexBody(liftTarget, luma, agTexB);       // 제형 발색 body(애교살 능선)
                liftTarget = TexGrain(liftTarget, i.uv, agTexG);      // 제형 그레인(애교살 능선)
                fixed3 shadowTarget = feed * lerp(fixed3(0.78, 0.72, 0.7),
                                                  _AegyoColor.rgb * 0.62, 0.25);
                shadowTarget = TexGrain(TexBody(shadowTarget, luma, agTexB), i.uv, agTexG); // 제형 body·grain(애교살 골)

                // 펄 포인트(_AegyoMode=1) — 능선(aegyoV 피크) 위·중앙(t)에 반짝 시머. 밴드 uv로
                // 노이즈 시드를 잡아 그레인이 밴드에 접착. 자연 볼륨(mode 0)에선 0(무변조).
                float pearlMode = step(0.5, _AegyoMode);
                float pearlPoint = Bell(0.5, 0.24, t) * Bell(0.30, 0.18, aegyoV);
                float sparkleSeed = PearlNoise(i.uv);
                float sparkle = pearlMode * _AegyoShimmer * pearlPoint
                              * smoothstep(0.91, 0.995, sparkleSeed)
                              * (0.65 + 0.35 * sin(_Time.y * 4.0 + sparkleSeed * 18.0));
                liftTarget = saturate(liftTarget + _AegyoColor.rgb * sparkle * 0.9);

                float total = hiAmt + shAmt;
                float alpha = saturate(total);
                fixed3 pigment = (liftTarget * hiAmt + shadowTarget * shAmt)
                               / max(total, 1e-4);
                return fixed4(pigment, alpha * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }
    FallBack Off
}
