// 정밀 아이라이너. 상안검 랜드마크 체인 위에 얇은 리본 메시를 얹어 알파
// 블렌드로 어둡게 칠한다. 정점 uv.x = 라인 알파(1=속눈썹 라인, 0=바깥 테두리)
// → 라인에서 진하고 위로 갈수록 부드럽게 사라진다. 리본 두께는 C#에서
// 바깥 눈꼬리(굵게)→안쪽(가늘게)으로 테이퍼링해 눈꼬리 라이너 형태를 만든다.
//
// uv.y = 눈꺼풀 파라메트릭 좌표 t: 앞머리(안쪽)=0 → 바깥 눈꼬리 코너=1 →
// 윙 팁=1+WingTExtent(>1). IrisRenderer.BuildEyelinerTopology가 부여하며,
// 아래 SEG_* 구간 상수는 이 축 위에서 동작 — C#(WingTExtent)과 값 일치 필수.
//
// 질감(_EyelinerTexture): 0=리퀴드(샤프, 기존 룩 그대로) 1=젤(소프트 에지 +
//   피크 완화 = 소프트매트) 2=펜슬(절차적 해시 그레인 + 러프 에지, 텍스처 의존 없음).
// 부분(_EyelinerSegment): 0=전체 1=꼬리만 2=앞머리+꼬리 3=눈동자 위만 —
//   t 구간 마스크(경계 smoothstep 페이드). 윙은 t>1이라 꼬리 구간에 항상 포함
//   → 기존 스타일(윙업/퍼피/롱)과 직교.
// 마감(_EyelinerFinish): 0=새틴(기본, 픽셀 불변) 1=매트 2=글로시 3=펄(#19b, 셀 스파클
//   미세 입자) — GrabPass 피드 luma 사용(Lip.shader ApplyFinish 이식).
//
// GrabPass 판단: "_CameraFeed" 공유 이름 — FaceMakeup(큐 3000, 스킨 스무딩으로 상시
// 활성)이 프레임당 1회 이미 그랩하므로(MakeupQueues.cs 주석) 여기 추가는 그랩
// 횟수를 늘리지 않는다. 드로우콜/대역폭 추가 비용 ≈ 0 → 구현 채택.
Shader "ARMakeup/Eyeliner"
{
    Properties
    {
        _EyelinerColor ("Eyeliner Color", Color) = (0.1, 0.09, 0.11, 1)
        _EyelinerIntensity ("Eyeliner Intensity", Range(0, 1)) = 0.0
        _EyelinerTexture ("Texture (0 liquid 1 gel 2 pencil)", Float) = 0
        _EyelinerSegment ("Segment (0 full 1 tail 2 front+tail 3 pupil)", Float) = 0
        _EyelinerFinish ("Finish (0 satin 1 matte 2 gloss 3 pearl)", Float) = 0
    }

    SubShader
    {
        Tags { "Queue" = "Transparent+12" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" } // 공유 이름 → 프레임당 1회 그랩(다른 메이크업 셰이더와 공유)

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

            sampler2D _CameraFeed;
            fixed4 _EyelinerColor;
            float _EyelinerIntensity;
            float _EyelinerTexture;
            float _EyelinerSegment;
            float _EyelinerFinish;

            // ── 세그먼트 구간 (t = uv.y, 앞머리 0 → 코너 1 → 윙 팁 1+α) ──
            // C# IrisRenderer.WingTExtent(0.3)와 같은 축 — 값 일치 필수. // 실기기 튜닝 대상
            static const float SEG_FRONT_HI = 0.22; // 앞머리 구간 끝
            static const float SEG_PUPIL_LO = 0.30; // 눈동자 위 구간 시작
            static const float SEG_PUPIL_HI = 0.72; // 눈동자 위 구간 끝
            static const float SEG_TAIL_LO  = 0.62; // 꼬리 구간 시작 (윙 t>1 전체 포함)
            static const float SEG_FEATHER  = 0.06; // 경계 smoothstep 페이드 폭
            static const float SEG_OPEN_LO  = -0.5; // 열린 하한(페이드 없음) — t 범위 밖
            static const float SEG_OPEN_HI  = 2.5;  // 열린 상한(페이드 없음) — 윙 팁(1.3)보다 큼

            // ── 질감 프로파일 // 실기기 튜닝 대상 ──
            static const float GEL_EDGE_POW = 1.8;          // 젤: 알파 지수(>1 = 가장자리 소프트)
            static const float GEL_PEAK = 0.85;             // 젤: 피크 알파(소프트매트)
            static const float PENCIL_GRAIN_ALONG = 160.0;  // 펜슬: 그레인 셀 밀도(라인 방향, t축)
            static const float PENCIL_GRAIN_ACROSS = 24.0;  // 펜슬: 그레인 셀 밀도(두께 방향, uv.x축)
            static const float PENCIL_GRAIN_DEPTH = 0.45;   // 펜슬: 그레인이 알파를 깎는 최대 비율
            static const float PENCIL_EDGE_ROUGH = 0.55;    // 펜슬: 가장자리 러프(경계 부스러짐 폭)
            static const float PENCIL_PEAK = 0.9;           // 펜슬: 피크 알파(파우더리)
            // ── 펄 마감(#19b) — Lip 셀 스파클 이식, 리본 폭에 맞춰 입자 미세화 // 실기기 튜닝 대상 ──
            static const float PEARL_CELL_ALONG = 90.0;   // 펄 셀 밀도(라인 방향 t)
            static const float PEARL_CELL_ACROSS = 10.0;  // 펄 셀 밀도(두께 방향 lineA) — 리본 얇아 조밀
            static const float PEARL_THRESH = 0.86;       // 스파클 희소도(높을수록 드묾)
            static const float PEARL_GAIN = 0.7;          // 스파클 가산 게인

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x = 라인 알파 (1 라인, 0 테두리), y = 눈꺼풀 파라메트릭 t
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

            // 텍스처 의존 없는 절차적 해시 (Lip.shader 시머 셀 해시와 동일 계열).
            float Hash21(float2 p)
            {
                return frac(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
            }

            // [lo, hi] 구간 마스크 — 경계는 SEG_FEATHER 폭 smoothstep 페이드.
            // SEG_OPEN_LO/HI를 넘기면 그 끝은 페이드 없이 열린다(물리적 라인 끝).
            float SegBand(float t, float lo, float hi)
            {
                return smoothstep(lo, lo + SEG_FEATHER, t)
                     * (1.0 - smoothstep(hi - SEG_FEATHER, hi, t));
            }

            // 마감 — Lip.shader ApplyFinish 이식(피드 luma = 그 픽셀에 떨어진 실제 빛,
            // 설계 섹션 13). 매트 = 하이라이트 억제(검정 리본엔 미미, 유채색 라이너에서 유효),
            // 글로시 = 미드 딥 + 젖은 하이라이트(가산이라 검정에서도 또렷), 펄(#19b) =
            // 리본 UV 셀 스파클(across 밀도를 높여 수 픽셀 리본에 맞게 입자 미세화).
            // f >= 1 (매트/글로시/펄)에서만 호출 — 새틴(0)은 픽셀 불변(하위호환 기준선).
            fixed3 ApplyFinish(fixed3 pigment, float luma, float2 ruv, float f)
            {
                float spec = smoothstep(0.55, 1.0, luma);
                if (f < 1.5) return pigment * (1.0 - 0.38 * spec); // 매트
                if (f < 2.5)                                       // 글로시
                {
                    float hot = smoothstep(0.78, 1.0, luma);
                    return pigment * 0.9 + (0.5 * spec + 0.35 * hot);
                }
                // 펄 — 리본 UV(ruv.y=t 라인방향, ruv.x=lineA 두께방향) 셀 해시 스파클.
                float2 cell = floor(float2(ruv.y * PEARL_CELL_ALONG, ruv.x * PEARL_CELL_ACROSS));
                float sparkle = step(PEARL_THRESH, Hash21(cell)) * (0.35 + 0.65 * spec);
                return pigment + sparkle * PEARL_GAIN;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float lineA = saturate(i.uv.x); // 두께 방향 라인 알파 (1 라인 → 0 테두리)
                float t = i.uv.y;               // 눈꺼풀 파라메트릭 (앞머리 0 → 코너 1 → 윙 팁 1.3)

                // ── 질감: lineA를 질감별 알파 프로파일로 변환 ──
                float profile;
                if (_EyelinerTexture < 0.5)
                {
                    profile = lineA; // 리퀴드 = 샤프한 선형 램프 (기존 룩 그대로 = 기준선)
                }
                else if (_EyelinerTexture < 1.5)
                {
                    // 젤 = 가장자리 소프트(지수 완화) + 피크 낮춤(소프트매트 질감)
                    profile = pow(lineA, GEL_EDGE_POW) * GEL_PEAK;
                }
                else
                {
                    // 펜슬 = 리본 공간 셀 해시 그레인. 같은 노이즈로 (1) 가장자리
                    // 컷오프를 흔들어 경계를 부스러뜨리고 (2) 몸통 알파를 깎아 입자감.
                    float g = Hash21(floor(float2(t * PENCIL_GRAIN_ALONG,
                                                  lineA * PENCIL_GRAIN_ACROSS)));
                    float rough = saturate(lineA - PENCIL_EDGE_ROUGH * g * (1.0 - lineA));
                    profile = rough * PENCIL_PEAK * lerp(1.0 - PENCIL_GRAIN_DEPTH, 1.0, g);
                }

                // ── 부분 모양: t 구간 마스크 (0=전체는 마스크 1) ──
                float segMask = 1.0;
                if (_EyelinerSegment > 2.5)          // 3 = 눈동자 위만
                    segMask = SegBand(t, SEG_PUPIL_LO, SEG_PUPIL_HI);
                else if (_EyelinerSegment > 1.5)     // 2 = 앞머리 + 꼬리
                    segMask = max(SegBand(t, SEG_OPEN_LO, SEG_FRONT_HI),
                                  SegBand(t, SEG_TAIL_LO, SEG_OPEN_HI));
                else if (_EyelinerSegment > 0.5)     // 1 = 꼬리만 (윙 포함)
                    segMask = SegBand(t, SEG_TAIL_LO, SEG_OPEN_HI);

                // 안쪽 경계(uv.x=1, lash 쪽) 서브픽셀 페더 — 리퀴드 profile=lineA가 이 엣지에서
                // 풀알파로 끝나 폴리곤 경계가 그대로 계단지던 것을 fwidth로 ~1.5px 안티에일리어싱.
                // uv.x=1에서 0 → 1.5px 안쪽에서 1로 오르는 램프라, 바깥 램프·펜슬 그레인(낮은 lineA
                // 영역)은 불변. 윙 삼각형은 uv.x<1이라(코너 근처 최대 ~0.83) 페더 구간 밖 = 무영향.
                float innerFeather = saturate((1.0 - i.uv.x) / max(fwidth(i.uv.x) * 1.5, 1e-5));

                float a = profile * segMask * _EyelinerIntensity * innerFeather;

                // ── 마감: 새틴(0)은 그랩 샘플 없이 기존 픽셀 그대로 ──
                fixed3 pigment = _EyelinerColor.rgb;
                if (_EyelinerFinish > 0.5)
                {
                    float2 screenUV = i.grabPos.xy / i.grabPos.w;
                    float luma = dot(tex2D(_CameraFeed, screenUV).rgb,
                                     fixed3(0.299, 0.587, 0.114));
                    pigment = ApplyFinish(pigment, luma, i.uv, _EyelinerFinish);
                }

                // §11 오클루전 — 손·머리카락이 앞이면 그 픽셀 색소 제외(세그 없으면 1).
                return fixed4(pigment, a * OccludeGate(i.grabPos));
            }
            ENDCG
        }
    }

    FallBack Off
}
