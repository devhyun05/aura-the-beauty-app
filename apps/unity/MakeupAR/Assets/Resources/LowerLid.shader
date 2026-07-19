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
        // 고정 해부학 마스크 + 피부 명암 보존 타깃. _ConcealerIntensity 0 = 끔.
        _ConcealerColor ("Concealer Color", Color) = (0.98, 0.86, 0.76, 1)
        _ConcealerIntensity ("Concealer Intensity", Range(0, 1)) = 0
        _ConcealerMask ("Concealer Anatomical Mask", 2D) = "black" {}
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
        // 아이라인(하)·삼각존·컨실러 마감 — 애교살과 동일 enum. ApplyFinish 레거시 경로
        // (세부 0 상수)라 0=새틴=기존 출력과 바이트 동일(하위호환).
        _LinerFinish ("Lower Liner Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _LinerShimmer ("Lower Liner Shimmer Gain", Range(0, 1)) = 0
        _TriFinish ("Triangle Zone Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _TriShimmer ("Triangle Zone Shimmer Gain", Range(0, 1)) = 0
        _ConcealerFinish ("Concealer Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _AegyoHeight ("Aegyo SDF Height Mult", Float) = 1
        // 핏(개인 공간 델타) 배수 — 1=원래(현행 프로파일과 바이트 동일). 각 제품의 세로
        // 프로파일 폭(밴드 높이/라인 두께)만 스케일하며 부위 간 독립(자기 텀에만 곱).
        _LinerThickness ("Lower Liner Thickness Mult", Float) = 1     // 아이라인(하) 두께
        _TriHeight ("Triangle Zone Height Mult", Float) = 1           // 삼각존 밴드 높이
        _LowerShadowHeight ("Lower Shadow Height Mult", Float) = 1    // 아이섀도 하 밴드 높이
        // 제형(텍스처) — RN 부위별 template enum. -1=필드 부재/레거시 무변조.
        // 컨실러는 FaceMakeup 붉은기 경로와 같은 concealerTexture 값을 공유(부위 1개, 셰이더 2곳).
        _LinerTexture ("Lower Liner Texture (-1 legacy 0 pencil 1 smudge 2 glitter)", Float) = -1
        _AegyoTexture ("Aegyo Texture (domain enum)", Float) = -1
        _TriTexture ("Triangle Zone Texture (domain enum)", Float) = -1
        _LowerShadowTexture ("Lower Shadow Texture (domain enum)", Float) = -1
        _ConcealerTexture ("Concealer Texture (domain enum)", Float) = -1
        // 모양 축(W1+W2) — 부위별 실루엣 프리셋. 0=현행 프로파일과 바이트 동일(하위호환).
        _AegyoShape ("Aegyo Shape (0 crescent 1 straight 2 center)", Float) = 0
        _LinerSegment ("Lower Liner Segment (0 full 1 tail 2 front+tail)", Float) = 0
        _TriShape ("Triangle Zone Shape (0 base 1 narrow 2 wide)", Float) = 0
        _LowerShadowShape ("Lower Shadow Shape (0 band 1 wide 2 tail)", Float) = 0
        // W4 부위별 아핀. 공유 메시를 분리하지 않고 각 제품의 로컬 샘플 좌표만 역변환한다.
        _LinerAffine ("Lower Liner Affine (dx dy sx sy)", Vector) = (0, 0, 0, 0)
        _LinerAffineRot ("Lower Liner Affine Rotation", Range(-45, 45)) = 0
        _AegyoAffine ("Aegyo Affine (dx dy sx sy)", Vector) = (0, 0, 0, 0)
        _AegyoAffineRot ("Aegyo Affine Rotation", Range(-45, 45)) = 0
        _TriAffine ("Triangle Affine (dx dy sx sy)", Vector) = (0, 0, 0, 0)
        _TriAffineRot ("Triangle Affine Rotation", Range(-45, 45)) = 0
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
            #include "EyeshadowVisibility.cginc" // upper/lower 공통 저알파 발색 리프트
            #include "Ambient.cginc"   // 저조도 색소 바닥(PigmentBase) — 어둠 발광 방지

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
            sampler2D _ConcealerMask;
            fixed4 _LowerShadowColor;
            float _LowerShadowIntensity;
            // Phase B lower/both 멀티레이어 — 배열 뒤 원소가 위에 오는 alpha-over 스택.
            #define LOWER_ES_MAX 8
            float4 _LowerEsLayerColor[LOWER_ES_MAX];
            float4 _LowerEsLayerColor2[LOWER_ES_MAX];
            float4 _LowerEsLayerParam[LOWER_ES_MAX];    // x=profile y=finish z=gradient w=height
            float4 _LowerEsLayerPhysical[LOWER_ES_MAX]; // x=texture y=shimmer z=glossLo w=glossGain
            float4 _LowerEsLayerFinish[LOWER_ES_MAX];   // x=shimmerSize y=shimmerDensity z=matte w=sheen
            float4 _LowerEsLayerParticle[LOWER_ES_MAX]; // x=particleSize y=particleDensity
            float4 _LowerEsLayerMaterial[LOWER_ES_MAX]; // x=material y=strength z=particleBrightness w=twinkle
            float4 _LowerEsLayerParticleStyle[LOWER_ES_MAX]; // x=shape y=feather z=parallax w=confetti
            float4 _LowerEsLayerParticleColor[LOWER_ES_MAX]; // rgb=particle color
            int _LowerEsLayerCount;
            // 마감 — 애교살(하이라이트 밴드)·아이섀도 하. 0=새틴=기존 출력(하위호환).
            float _AegyoFinish;
            float _AegyoShimmer;
            float _LowerShadowFinish;
            float _LowerShadowShimmer;
            // 아이라인(하)·삼각존·컨실러 마감 — 0=새틴=기존 출력(하위호환).
            float _LinerFinish;
            float _LinerShimmer;
            float _TriFinish;
            float _TriShimmer;
            float _ConcealerFinish;
            float _AegyoHeight;
            // 핏 배수(1=원래) — 자기 제품 세로 프로파일 폭만 스케일.
            float _LinerThickness;
            float _TriHeight;
            float _LowerShadowHeight;
            // 제형(텍스처) — RN 부위별 template enum. -1=필드 부재/레거시 무변조.
            float _LinerTexture;
            float _AegyoTexture;
            float _TriTexture;
            float _LowerShadowTexture;
            float _ConcealerTexture; // 눈밑존 — FaceMakeup 붉은기 경로와 같은 값 공유
            // 모양 축(W1+W2) — 부위별 실루엣 프리셋. 0=현행 프로파일과 바이트 동일(하위호환).
            float _AegyoShape;
            float _LinerSegment;
            float _TriShape;
            float _LowerShadowShape;
            float4 _LinerAffine;
            float _LinerAffineRot;
            float4 _AegyoAffine;
            float _AegyoAffineRot;
            float4 _TriAffine;
            float _TriAffineRot;

            // 삼각존 프로파일 상수 (전부 실기기 튜닝 대상).
            #define TRI_U_START 0.62   // 꼬리 가중 시작 u (0.6~0.7 사이에서 상승)
            #define TRI_U_RAMP  0.20   // 상승 구간 폭 (TRI_U_START→+RAMP 에서 smoothstep)
            #define TRI_FEATHER 0.10   // 바깥 코너(메시 경계) 페더 폭
            #define TRI_V_WIDTH 0.55   // 세로 폭 비율 — 라인(v=0) 근처에서 이 값까지 페이드
            #define CONCEALER_ALPHA_CEILING 0.45 // 피부 명암 보존 보정의 독립 기여 상한

            #define ES_V_FADE   0.55   // A3 아이섀도 하: lash(v=0)에서 이 v까지 아래로 페이드 (실기기 튜닝 대상)

            // 애교살 볼륨 프로파일 상수 (전부 실기기 튜닝 대상) — "판"이 아니라 "살(볼록 롤)".
            // 롤은 하안검 lash 라인 바로 아래 얇게 붙는다: aegyoV = vv/AEGYO_BAND 로 초승달
            // vv 좌표를 압축해 밴드 상단 절반만 쓴다(공용 메시 높이는 그대로, 애교살만 세로
            // ~절반으로 얇아짐 → 다른 부위 밴드 불변). 능선(위 밝음)+골(아래 얇은 그림자)
            // 2단으로 볼록을 정의하고, intensity는 "패널 불투명도"가 아니라 능선/골 대비
            // 강도로 걸린다(피크 알파 상한 AEGYO_HI_MAX/AEGYO_SH_MAX — 100%여도 살처럼 은은).
            #define AEGYO_BAND    0.50   // 롤이 차지하는 밴드 세로 비율(vv 기준). 작을수록 얇은 롤
            #define AEGYO_HI_MAX  0.75   // 능선 하이라이트 피크 알파 상한(실물 대조 상향 0.55→0.75, 여전히 <1 포화 방어)
            #define AEGYO_SH_MAX  0.50   // 골 그림자 피크 알파 상한(실물 대조 상향 0.38→0.50, 하이라이트보다 약한 감산·<1 유지)
            // shape 0(기본) 두께 프로파일 = "비대칭 평탄대"(대칭 sin 아치 폐기). 실물 관찰:
            // 두께가 눈 폭 대부분에서 균일, 눈동자 아래만 살짝 도톰, 꼬리는 중앙과 같게 이어지다
            // 끝에서 짧고 뭉툭하게 소멸, 눈머리는 더 빨리 옅어짐. thick = riseIn·plateau·fadeOut.
            #define AEGYO_IN_RISE     0.16 // 눈머리(along 0)에서 평탄대까지 차오르는 폭. 클수록 앞이 완만하게 옅음
            #define AEGYO_PUPIL_BULGE 0.12 // 눈동자 아래 미세 볼록량(평탄대 위 sin 융기). 0이면 완전 균일(일자)
            #define AEGYO_TAIL_START  0.86 // 꼬리 페이드 시작 along. 1.0까지 짧은 구간에 소멸 = 뭉툭(뾰족 금지)

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0; // x=가로(0 안쪽→1 바깥), y=세로(0 lash→1 아래)
                // 애교살 SDF(아크 피팅 거리장) — 밴드 좌표계 프로파일이 아니라 픽셀 단위
                // 거리장으로 애교살만 그린다. 정점당 밴드 로컬 좌표 + 눈당 곡선 계수를 실어
                // 보내면(눈마다 다른 값이지만 한 눈의 삼각형은 전부 같은 눈 정점이라 상수로
                // 보간) 단일 드로우콜·단일 머티리얼로 눈별 곡선을 프래그가 재구성한다.
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

            // 제품색은 밝기 자체가 아니라 색조로 쓰고, 피드 명암에 작은 상한 리프트만 더한다.
            // 밝은 스와치를 screen multiplier로 써서 눈밑을 흰 판처럼 만드는 것을 방지한다.
            fixed3 ConcealerTarget(fixed3 feed, fixed3 product)
            {
                const fixed3 LUMA_W = fixed3(0.299, 0.587, 0.114);
                float feedLuma = dot(feed, LUMA_W);
                float productLuma = max(dot(product, LUMA_W), 1e-4);
                fixed3 chroma = product / productLuma;
                fixed3 tinted = feed * chroma;
                float tintedLuma = dot(tinted, LUMA_W);
                tinted *= feedLuma / max(tintedLuma, 1e-4);
                float lift = 0.08 * (1.0 - feedLuma);
                return saturate(tinted + lift);
            }

            float LowerEsFiniteOr(float value, float fallbackValue)
            {
                return value == value && abs(value) <= 65504.0 ? value : fallbackValue;
            }

            float2 InverseBandAffine(float2 bandUV, float4 affine, float rotationDegrees)
            {
                // W4 byte-parity gate: explicit reset takes the exact legacy coordinate path.
                if (all(affine == 0.0) && rotationDegrees == 0.0) return bandUV;
                // band UV의 y는 아래로 증가하므로 먼저 y-up 눈축 로컬 프레임으로 바꾼다.
                float2 centered = float2(bandUV.x - 0.5, 0.5 - bandUV.y);
                centered -= affine.xy;
                float angleRadians = -rotationDegrees * 0.01745329252;
                float sineValue = sin(angleRadians);
                float cosineValue = cos(angleRadians);
                centered = float2(cosineValue * centered.x - sineValue * centered.y,
                                  sineValue * centered.x + cosineValue * centered.y);
                centered /= max(float2(0.5, 0.5), 1.0 + affine.zw);
                return float2(centered.x + 0.5, 0.5 - centered.y);
            }

            // 하안검 전용 12-profile. u=안쪽0→바깥1, v=waterline0→볼1.
            // 모든 profile이 waterline·메시 하단에서 0으로 닫혀 눈알 침범과 직선 컷을 막는다.
            float LowerEsProfile(float anatomicalU, float verticalV, float layerHeight, float profile)
            {
                float u = saturate(LowerEsFiniteOr(anatomicalU, 0.0));
                float v = saturate(LowerEsFiniteOr(verticalV, 0.0));
                float height = clamp(LowerEsFiniteOr(layerHeight, 1.0), 0.25, 2.0);
                profile = clamp(LowerEsFiniteOr(profile, 0.0), 0.0, 11.0);
                float waterline = smoothstep(0.10, 0.18, v);
                float cheekEdge = 1.0 - smoothstep(0.90, 1.00, v);
                float horizontal = smoothstep(0.02, 0.12, u)
                                 * (1.0 - smoothstep(0.88, 0.98, u));
                float vertical;

                if (profile < 0.5)
                {
                    // Base: 눈 아래 전반을 덮되 상·하단이 긴 램프로 사라지는 가장 부드러운 밴드.
                    vertical = waterline * (1.0 - smoothstep(0.68, 0.92, v / height));
                }
                else if (profile > 10.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.34, 0.64, v / height));
                    horizontal = smoothstep(0.62, 0.80, u)
                               * (1.0 - smoothstep(0.94, 1.00, u));
                }
                else if (profile > 9.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.76, 0.98, v / height));
                }
                else if (profile > 8.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.30, 0.56, v / height));
                    horizontal = smoothstep(0.60, 0.76, u)
                               * (1.0 - smoothstep(0.90, 0.98, u));
                }
                else if (profile > 7.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.46, 0.76, v / height));
                    horizontal *= smoothstep(0.12, 0.26, u)
                                * (1.0 - smoothstep(0.78, 0.90, u));
                }
                else if (profile > 6.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.62, 0.88, v / height));
                }
                else if (profile > 5.5 && profile < 6.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.38, 0.66, v / height));
                    horizontal = smoothstep(0.56, 0.72, u)
                               * (1.0 - smoothstep(0.94, 1.00, u));
                }
                else if (profile > 4.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.34, 0.64, v / height));
                    horizontal = smoothstep(0.20, 0.34, u)
                               * (1.0 - smoothstep(0.66, 0.80, u));
                }
                else if (profile > 3.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.32, 0.60, v / height));
                    horizontal = (1.0 - smoothstep(0.30, 0.48, u))
                               * smoothstep(0.02, 0.10, u);
                }
                else if (profile > 2.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.32, 0.62, v / height));
                    horizontal = smoothstep(0.58, 0.76, u)
                               * (1.0 - smoothstep(0.94, 1.00, u));
                }
                else if (profile > 1.5)
                {
                    vertical = waterline * (1.0 - smoothstep(0.74, 0.98, v / height));
                }
                else
                {
                    vertical = smoothstep(0.20, 0.34, v / height)
                             * (1.0 - smoothstep(0.48, 0.74, v / height));
                    vertical *= waterline;
                }
                return saturate(vertical * horizontal * cheekEdge);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 feed = tex2D(_CameraFeed, screenUV).rgb;
                float luma = dot(feed, fixed3(0.299, 0.587, 0.114));

                // 제형(텍스처) — RN template index 정확 미러. -1 sentinel은 모두 ZERO로 남는다.
                float lnTexE, lnTexG, lnTexC, lnTexB; TexBundleFromEnum(11.0, _LinerTexture, lnTexE, lnTexG, lnTexC, lnTexB);
                float agTexE, agTexG, agTexC, agTexB; TexBundleFromEnum(10.0, _AegyoTexture, agTexE, agTexG, agTexC, agTexB);
                float trTexE, trTexG, trTexC, trTexB; TexBundleFromEnum(7.0, _TriTexture, trTexE, trTexG, trTexC, trTexB);
                float esTexE, esTexG, esTexC, esTexB; TexBundleFromEnum(9.0, _LowerShadowTexture, esTexE, esTexG, esTexC, esTexB);
                float ccTexE, ccTexG, ccTexC, ccTexB; TexBundleFromEnum(2.0, _ConcealerTexture, ccTexE, ccTexG, ccTexC, ccTexB);

                float along = i.uv.x;
                float v = i.uv.y;
                float2 linerUV = InverseBandAffine(i.uv, _LinerAffine, _LinerAffineRot);
                float2 triUV = InverseBandAffine(i.uv, _TriAffine, _TriAffineRot);
                float linerAlong = linerUV.x;
                float linerV = linerUV.y;

                // 가로 가중: 코너 페이드(라인용).
                float edge = smoothstep(0.0, 0.08, along)
                           * (1.0 - smoothstep(0.92, 1.0, along));
                float linerEdge = smoothstep(0.0, 0.08, linerAlong)
                                * (1.0 - smoothstep(0.92, 1.0, linerAlong));

                // (애교살 두께 프로파일 thick/soft는 SDF 경로로 이관 — 아래 "애교살 SDF" 블록에서
                //  밴드 로컬 t 기준으로 재계산한다. 여기의 along/v/edge는 다른 부위 전용으로 남긴다.)

                // 하안검 라이너 구간(_LinerSegment) — along(0 앞머리→1 꼬리) 구간 게이트.
                // 0=전체=현행 바이트 동일. 1=꼬리만(바깥 1/3). 2=앞+꼬리(중앙 비움). 상라이너
                // EYELINER_SEGMENTS 관례를 하안검 along 축에 이식(경계 smoothstep 페더).
                float lnSeg = 1.0;
                if (_LinerSegment > 1.5)        // 2 = 앞 + 꼬리 (중앙 비움)
                    lnSeg = max(1.0 - smoothstep(0.28, 0.38, linerAlong), smoothstep(0.62, 0.72, linerAlong));
                else if (_LinerSegment > 0.5)   // 1 = 꼬리만 (바깥 1/3)
                    lnSeg = smoothstep(0.62, 0.72, linerAlong);
                // 아이라인(하): lash 바로 아래 얇은 라인 (초승달 테이퍼와 무관).
                // 두께 핸들(_LinerThickness) — 세로 폭 [0.10,0.22]를 배수. 1=원래(하위호환).
                float lnAmt = (1.0 - smoothstep(0.10 * _LinerThickness, 0.22 * _LinerThickness, linerV))
                              * linerEdge * _LinerIntensity * lnSeg;
                lnAmt = TexEdge(TexCoverage(saturate(lnAmt), lnTexC), lnTexE);
                // ── 애교살 SDF(아크 피팅 곡선 + 픽셀 단위 거리장) ──────────────────────────
                // 근본 교체: 폴리라인 밴드 (along,v) 좌표계 프로파일은 밴드 정점 보간을 타서
                // 능선/골 등고선이 세그먼트 경계에서 꺾인다("모서리 각"). 대신 픽셀의 밴드
                // 로컬 위치(localXY, 픽셀당 보간)에서 FitArc 곡선까지의 수직 거리 d를 매 픽셀
                // 해석적으로 재서 능선/골 밴드를 긋는다 — 등고선이 곡선의 오프셋 곡선이라
                // 메시 테셀레이션과 무관하게 매끈하다(각짐이 구조적으로 소거).
                float k0c = i.curve.x, k1c = i.curve.y;
                float Lc = max(i.curve.z, 1e-5);   // 눈폭(현 길이, 이미지 단위)
                float bw = max(i.curve.w, 1e-5);   // 밴드 세로 폭(이미지 단위, v=1 상당)
                float2 aegyoLocal = InverseBandAffine(
                    float2(i.localXY.x / Lc, i.localXY.y / bw),
                    _AegyoAffine, _AegyoAffineRot);
                bool aegyoAffineZero = all(_AegyoAffine == 0.0) && _AegyoAffineRot == 0.0;
                float t = saturate(aegyoAffineZero ? i.localXY.x / Lc : aegyoLocal.x);
                // 피팅 곡선 Yc(t)와 기울기(FitArc와 동일 v(u)=k0·u(1−u)+k1·u²(1−u)).
                float Yc  = k0c * t * (1.0 - t) + k1c * t * t * (1.0 - t);
                float dYc = k0c * (1.0 - 2.0 * t) + k1c * (2.0 * t - 3.0 * t * t); // dY/dt
                float slope = dYc / Lc;              // dY/dX
                // 수직 낙하 근사 + 기울기 1차 보정 = 곡선까지 수직거리(아래=피부 방향 양수).
                float aegyoLocalY = aegyoAffineZero ? i.localXY.y : aegyoLocal.y * bw;
                float d = (aegyoLocalY - Yc) / sqrt(1.0 + slope * slope);

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
                float Troll = max(thick * AEGYO_BAND * bw * _AegyoHeight, 1e-5); // 애교살 전용 높이
                float aegyoV = d / Troll;   // v3 aegyoV와 동치(0=lash 곡선 → 1=롤 바깥 끝)

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
                float hiAmt = ridge * soft * aegyoEdge * _AegyoIntensity * AEGYO_HI_MAX;
                hiAmt = TexEdge(TexCoverage(saturate(hiAmt), agTexC), agTexE); // 제형 커버·엣지(애교살 능선)
                float shAmt = valley * soft * aegyoEdge * _AegyoIntensity * AEGYO_SH_MAX;
                shAmt = TexEdge(TexCoverage(saturate(shAmt), agTexC), agTexE); // 제형 커버·엣지(애교살 골)

                // 삼각존: 눈꼬리 바로 아래 좁은 삼각 음영(눈밑 전체 아님). 애교살과 무관한
                // 별도 텀 — 꼬리(u 바깥 1/3)에서 상승, 코너에서 페더, 세로는 lash 라인(v=0)
                // 근처에 집중(위 라인↔아래로 잇는 음영). 초승달 테이퍼 vv가 아닌 원시 v를
                // 써서 라인에 딱 붙는 삼각 그림자로 둔다.
                float triAlong = smoothstep(TRI_U_START, TRI_U_START + TRI_U_RAMP, triUV.x)
                                 * (1.0 - smoothstep(1.0 - TRI_FEATHER, 1.0, triUV.x));
                // 높이 핸들(_TriHeight) — 세로 폭 TRI_V_WIDTH를 배수. 1=원래(하위호환).
                // 모양(_TriShape) — 세로 폭 배수(0=기본=1.0=현행 바이트 동일, 1=좁게, 2=넓게).
                float triShapeW = (_TriShape > 1.5) ? 1.6 : ((_TriShape > 0.5) ? 0.6 : 1.0);
                // 페이드 거리는 밴드 세로 범위(v<=1)를 넘지 않게 클램프 — 넓게(1.6)×높이(2.0)
                // 극값 조합에서 v=1 하단이 안 꺼져 직선 컷으로 삐져나오는 것 방지. 기본값
                // (0.55×1×1=0.55<1)에선 min이 항등이라 바이트 동일.
                float triV = 1.0 - smoothstep(0.0, min(TRI_V_WIDTH * _TriHeight * triShapeW, 1.0), triUV.y); // 라인에서 아래로 페이드
                float triAmt = triAlong * triV * _TriIntensity;
                triAmt = TexEdge(TexCoverage(saturate(triAmt), trTexC), trTexE); // 제형 커버·엣지(삼각존)

                // Photoshop/소스제어 마스크의 해부학적 밴드 UV: x=안쪽→바깥, y=lash→볼.
                // 양눈 메시가 같은 해부학 방향으로 UV를 갖기 때문에 별도 좌우 반전은 없다.
                // PNG/Photoshop 캔버스는 위→아래가 y 증가, Unity UV는 아래→위이므로 v만 뒤집는다.
                float2 ccMaskUV = float2(along, 1.0 - v);
                float ccMask = tex2D(_ConcealerMask, ccMaskUV).r;
                float ccAmt = ccMask * _ConcealerIntensity;
                ccAmt = TexEdge(TexCoverage(saturate(ccAmt), ccTexC), ccTexE); // 제형 커버·엣지(눈밑 컨실러)
                float ccA = saturate(ccAmt) * CONCEALER_ALPHA_CEILING;

                // A3 아이섀도 하: lash 라인(v=0) 바로 아래에서 ES_V_FADE까지 부드럽게
                // 페이드하는 섀도 밴드. hiAmt/shAmt 프로파일과 동형(edge 코너 접기·원시 v
                // 기준). 라인·애교살보다 아래에 곱 블렌드로 깔린다(아래 comb 단계). 강도 0 = 무영향.
                // 높이 핸들(_LowerShadowHeight) — 페이드 폭 ES_V_FADE를 배수. 1=원래(하위호환).
                // 모양(_LowerShadowShape) — 0=기본밴드=현행 바이트 동일. 1=넓게(세로 폭 확장).
                //   2=꼬리집중(along 바깥 가중, 세로 폭은 기본).
                float esShapeW = (_LowerShadowShape > 0.5 && _LowerShadowShape < 1.5) ? 1.5 : 1.0;
                float esTail = (_LowerShadowShape > 1.5) ? smoothstep(0.45, 0.75, along) : 1.0;
                // 페이드 거리 클램프(triV와 동일 근거) — 극값 조합의 v=1 직선 컷 방지, 기본값 항등.
                float esBand = 1.0 - smoothstep(0.0, min(ES_V_FADE * _LowerShadowHeight * esShapeW, 1.0), v);
                float esAmt = esBand * edge * _LowerShadowIntensity * esTail;
                esAmt = TexEdge(TexCoverage(saturate(esAmt), esTexC), esTexE); // 제형 커버·엣지(아이섀도 하)

                // 색소(피드 기준 풀강도): 라이너=루마 보존 틴트, 애교살=스크린(가산),
                // 컨실러=피부 명암 보존 타깃, 섀도=곱(감산).
                fixed3 pigLn = _LinerColor.rgb * (luma * 1.2 + 0.08);
                pigLn = TexBody(pigLn, luma, lnTexB);
                // 아이라인(하) 마감 — 렌더러가 finish=3일 때만 시머 게인을 전달한다.
                pigLn = ApplyFinish(pigLn, luma, i.uv, _LinerFinish, _LinerShimmer,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigLn = TexGrain(pigLn, i.uv, lnTexG);
                fixed3 pigHi = 1.0 - (1.0 - feed) * (1.0 - _AegyoHiColor.rgb);
                pigHi = TexBody(pigHi, luma, agTexB); // 제형 발색 body(애교살)
                // 애교살 마감 — 하이라이트 밴드에 ApplyFinish(시머=펄 애교살, 매트=톤다운).
                // sparkleUV는 밴드 로컬 uv라 시머가 밴드에 접착. 0=새틴=무변형(하위호환).
                pigHi = ApplyFinish(pigHi, luma, i.uv, _AegyoFinish, _AegyoShimmer,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigHi = TexGrain(pigHi, i.uv, agTexG); // 제형 그레인(애교살)
                fixed3 pigSh = feed * _AegyoShColor.rgb;
                pigSh = TexGrain(TexBody(pigSh, luma, agTexB), i.uv, agTexG); // 제형 body·grain(애교살 섀도)
                fixed3 pigTri = feed * _TriColor.rgb; // 삼각존 = 곱(감산) 딥브라운 섀도
                pigTri = TexBody(pigTri, luma, trTexB); // 제형 발색 body(삼각존)
                // 삼각존 마감 — 0=새틴=무변형(하위호환).
                pigTri = ApplyFinish(pigTri, luma, i.uv, _TriFinish, _TriShimmer,
                                     0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigTri = TexGrain(pigTri, i.uv, trTexG); // 제형 그레인(삼각존)
                fixed3 pigCc = ConcealerTarget(feed, _ConcealerColor.rgb);
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

                // legacy 단일 하섀도를 기본값으로 두고, V2 배열이 있으면 완전히 대체한다.
                fixed3 lowerAccum = pigEs * esAmt;
                float lowerAccumA = esAmt;
                if (_LowerEsLayerCount > 0)
                {
                    lowerAccum = fixed3(0, 0, 0);
                    lowerAccumA = 0.0;
                    [unroll]
                    for (int b = 0; b < LOWER_ES_MAX; b++)
                    {
                        if (b >= _LowerEsLayerCount) break;
                        float profileB = _LowerEsLayerParam[b].x;
                        float finishB = _LowerEsLayerParam[b].y;
                        float gradientB = _LowerEsLayerParam[b].z;
                        float heightB = _LowerEsLayerParam[b].w;
                        float textureB = _LowerEsLayerPhysical[b].x;
                        float shimmerB = _LowerEsLayerPhysical[b].y;
                        float glossLoB = _LowerEsLayerPhysical[b].z;
                        float glossGainB = _LowerEsLayerPhysical[b].w;
                        float shimmerSizeB = _LowerEsLayerFinish[b].x;
                        float shimmerDensityB = _LowerEsLayerFinish[b].y;
                        float matteB = _LowerEsLayerFinish[b].z;
                        float sheenB = _LowerEsLayerFinish[b].w;
                        float particleSizeB = _LowerEsLayerParticle[b].x;
                        float particleDensityB = _LowerEsLayerParticle[b].y;
                        float materialB = _LowerEsLayerMaterial[b].x;
                        float materialStrengthB = _LowerEsLayerMaterial[b].y;
                        float particleBrightnessB = _LowerEsLayerMaterial[b].z;
                        float particleTwinkleB = _LowerEsLayerMaterial[b].w;
                        float particleShapeB = _LowerEsLayerParticleStyle[b].x;
                        float particleFeatherB = _LowerEsLayerParticleStyle[b].y;
                        float particleParallaxB = _LowerEsLayerParticleStyle[b].z;
                        float particleConfettiB = _LowerEsLayerParticleStyle[b].w;
                        fixed3 particleColorB = _LowerEsLayerParticleColor[b].rgb;

                        float edgeB, grainB, coverageB, bodyB;
                        TexBundleFromEnum(9.0, textureB, edgeB, grainB, coverageB, bodyB);
                        float liftedIntensityB = EyeshadowVisibilityLift(_LowerEsLayerColor[b].a);
                        float amtB = LowerEsProfile(along, v, heightB, profileB) * liftedIntensityB;
                        amtB = TexEdge(TexCoverage(saturate(amtB), coverageB), edgeB);

                        fixed3 baseB = lerp(_LowerEsLayerColor[b].rgb,
                                            _LowerEsLayerColor2[b].rgb,
                                            (1.0 - v) * gradientB);
                        fixed3 pigmentB = baseB * PigmentBase(luma, 1.5, 0.15);
                        pigmentB = TexBody(pigmentB, luma, bodyB);
                        pigmentB = ApplyFinish(pigmentB, luma, i.uv, finishB, shimmerB,
                                               glossLoB, glossGainB, shimmerSizeB,
                                               shimmerDensityB, matteB, sheenB,
                                               screenUV, _PearlLightGain);
                        fixed3 lowerEsNormal = normalize(fixed3(
                            (along - 0.5) * 0.4 + _ViewAngleSmooth.x,
                            (0.5 - v) * 0.2 + _ViewAngleSmooth.y, 1.0));
                        pigmentB = ApplyMaterial(pigmentB, luma, screenUV, lowerEsNormal,
                                                 materialB, materialStrengthB);
                        pigmentB = TexGrain(pigmentB, i.uv, grainB);
                        pigmentB = ApplyParticles(pigmentB, luma, i.uv, screenUV,
                                                  particleSizeB, particleDensityB,
                                                  particleBrightnessB, particleColorB,
                                                  particleTwinkleB, particleShapeB,
                                                  particleFeatherB, particleParallaxB,
                                                  particleConfettiB, 1.0);

                        lowerAccum = pigmentB * amtB + lowerAccum * (1.0 - amtB);
                        lowerAccumA = amtB + lowerAccumA * (1.0 - amtB);
                    }
                }
                fixed3 lowerEsPig = lowerAccumA > 1e-5 ? lowerAccum / lowerAccumA : lowerAccum;
                float lowerEsA = lowerAccumA;

                // 컨실러를 나머지 하안검 제품 amount에 더하지 않는다. 먼저 피부 보정층으로
                // 독립 alpha-over하고, 라이너·애교살·삼각존은 그 위에 놓는다. 따라서 컨실러
                // 자체 기여는 항상 0.45 이하이고 다른 제품과 겹쳐도 단순 합산 포화되지 않는다.
                float total = lnAmt + hiAmt + shAmt + triAmt;
                float procA = saturate(total);
                fixed3 procPig = (pigLn * lnAmt + pigHi * hiAmt + pigSh * shAmt
                                  + pigTri * triAmt)
                                 / max(total, 1e-4);

                float upperA = procA + ccA * (1.0 - procA);
                fixed3 upperPig = (procPig * procA + pigCc * ccA * (1.0 - procA))
                                  / max(upperA, 1e-4);

                // A3 아이섀도 하 — 아래 깔린 섀도(ES) 위에 TOP(라인/애교살/삼각존/컨실러 =
                // upperPig/upperA)을 얹는(over) 2단 합성. 애교살이 섀도 위로 뜬다.
                float combA = upperA + lowerEsA * (1.0 - upperA);
                fixed3 combPig = (upperPig * upperA + lowerEsPig * lowerEsA * (1.0 - upperA))
                                 / max(combA, 1e-4);

                // 임포트 애교살 그림 — (가로×세로) 밴드에 워프된 스티커(그린 색 그대로).
                // 절차적 애교살 위에 "over" 합성한다(둘 다 SrcAlpha로 피드 위에 얹힘).
                float2 aegyoArtUV = InverseBandAffine(i.uv, _AegyoAffine, _AegyoAffineRot);
                fixed4 art = tex2D(_AegyoTex, aegyoArtUV);
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
