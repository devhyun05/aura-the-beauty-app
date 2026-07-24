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
        // 애교살 베이크드 프로파일(절차 SDF 대체) — R=하이라이트 G=아래그림자 B=중앙펄게이트.
        // 바이리니어 샘플이라 메시 해상도와 무관하게 매끈(각짐 원천 소거). 밴드 UV에 워프.
        _AegyoProfile ("Aegyo Profile (R hi, G shadow, B pearl gate)", 2D) = "black" {}
        // 중앙 펄 강도 — 0=펄 없음(기존 프리셋 기본). B게이트 영역에만 라이브 시머를 켠다.
        _AegyoPearl ("Aegyo Center Pearl", Range(0, 1)) = 0
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
        // 스모키 언더 모양 마스크(profile 6 전용) — 밴드 UV(along × 1-v)에 그려진 알파.
        // 절차 프로파일(래시 평행 밴드)은 실루엣 자유도가 없어 "쓸 수 없는 모양"이었다.
        // profile 6(deep-smoky-under 라우팅)일 때 이 마스크 .r을 커버리지로 쓴다.
        // "black"=미설정 시 무영향. setRegionMask region="eyeshadowLower"로 스왑.
        _LowerSmokyMask ("Lower Smoky Shape Mask", 2D) = "black" {}
        // 하부 프로파일 아틀라스(베이크드 개편) — 절차 LowerEsProfile 12종의 대체 정본.
        // 4×3 타일(각 256px, row=p/4, col=p%4), 타일 좌표계는 _LowerSmokyMask와 동일
        // (u=눈머리→눈꼬리, PNG 상단=lash). generate-eyeshadow-masks.py가 생성.
        _LowerProfileAtlas ("Lower Profile Atlas (12 tiles 4x3)", 2D) = "black" {}
        _LowerProfileAtlasOn ("Lower Profile Atlas Loaded", Float) = 0
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
        // 눈꼬리 연장(along>1 캔버스) — 렌더러 ExtFrac를 미러(0=연장 없는 구 메시 호환).
        _LowerExtSpan ("Lower Band Ext Span (along units)", Float) = 0
        // 삼각존 트레이스 — 꼬리 구간에서 라이너 세로 중심을 삼각존 하단 경계로 램프
        // (0=현행 lash 밀착, 1=삼각존 하단 풀 깊이). 눈 세로·가로 확장 테크닉.
        _LinerTailTrace ("Lower Liner Tail Trace (0 lash..1 tri bottom)", Range(0, 1)) = 0
        // 라이너 꼬리 연장 — 연장 캔버스로 뻗는 비율(0=코너 정지=현행).
        _LinerTailLen ("Lower Liner Tail Ext Length (0..1 of span)", Range(0, 1)) = 0
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
            sampler2D _AegyoProfile;
            float _AegyoPearl;
            sampler2D _AegyoTex;
            float _AegyoStyleIntensity;
            fixed4 _TriColor;
            float _TriIntensity;
            fixed4 _ConcealerColor;
            float _ConcealerIntensity;
            sampler2D _ConcealerMask;
            sampler2D _LowerSmokyMask; // 스모키 언더 모양 마스크(profile 6 전용)
            sampler2D _LowerProfileAtlas; // 하부 프로파일 아틀라스(비마스크 밴드 실루엣 정본)
            float _LowerProfileAtlasOn;   // 0 = 번들 누락(비마스크 밴드 미표시, 크래시 없음)
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
            float _LowerExtSpan;   // 눈꼬리 연장 span(along>1 구간 길이, 0=구 메시)
            float _LinerTailTrace; // 라이너 삼각존 트레이스 깊이(0=lash 밀착)
            float _LinerTailLen;   // 라이너 꼬리 연장 비율(0=코너 정지)
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
            // 고정 밴드 안을 전부 밝히지 않고 푸른기+어두움이 실제로 있는 픽셀만 선택한다.
            // 피부는 본래 R 우세라 blueness가 음수일 수 있어 상대적으로 덜 웜한 구간부터 페더.
            #define CC_BLUE_LO -0.14
            #define CC_BLUE_HI -0.015
            #define CC_DARK_LO 0.28
            #define CC_DARK_HI 0.68

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
                // 색 중화가 본체이고 밝힘은 보조. 이전 0.08의 흰 띠 인상을 절반 이하로 낮춘다.
                float lift = 0.035 * (1.0 - feedLuma);
                return saturate(tinted + lift);
            }

            // ── 캔버스 클로저 게이트 (하부 개편 2026-07-24) ─────────────────────────
            // 하부 밴드의 "모든" 텀 커버리지에 곱하는 공통 봉투 — 캔버스 양옆·연장 끝·
            // 하단에서 반드시 0. 프로파일·마스크·핏 높이·아핀이 무엇을 하든 밴드 사각
            // 캔버스가 그대로 비치는 것("네모")이 구조적으로 불가능해진다. 그간의 네모
            // 회귀는 전부 개별 프로파일 smoothstep 상수 튜닝으로 막았고 새 조합(핏 150%,
            // 저알파 리프트, 임포트 마스크 흰 엣지)마다 다시 열렸다 — 이 게이트가 그
            // 부류 전체를 원천 봉쇄한다. lash(상단)는 개방 — 라이너·애교살·언더 섀도
            // 모두 lash 라인에 붙는 것이 정상이다.
            float CanvasClosure(float along, float v)
            {
                float extEnd = 1.0 + max(_LowerExtSpan, 0.0);
                float gIn = smoothstep(0.0, 0.05, along);
                float gOut = 1.0 - smoothstep(extEnd - 0.06, extEnd, along);
                float gBot = 1.0 - smoothstep(0.88, 0.995, v);
                return gIn * gOut * gBot;
            }

            // ── 하부 프로파일 아틀라스 샘플 (절차 LowerEsProfile 12종 폐기의 대체) ──
            // 실루엣 정본 = 베이크드 텍스처(바이리니어) — smoothstep 동물원과 달리
            // 매끈함·클로저가 텍스처 자체에 구워져 있어 각짐·캔버스 노출이 없다.
            // 캔버스 1024×1024 POT(4×4 타일 격자, 12칸 사용 — NPOT 임포터 리샘플
            // 회피), 타일 테두리 3px=0(클로저 — 인셋 텍셀까지 0 보장), 우측 컬럼은
            // 꼬리 계열(3·11)만 워시 잔존: 연장 캔버스의 실제 워시 값은 클램프가
            // 닿는 인셋 텍셀(253)에 실린다. 샘플은 타일 안쪽 2.5px 인셋 + mip
            // 없음·비압축 임포트 — 이웃 타일 번짐이 구조적으로 없다.
            float SampleLowerProfileAtlas(float profile, float u, float vRel)
            {
                if (_LowerProfileAtlasOn < 0.5) return 0.0;
                float p = clamp(floor(profile + 0.5), 0.0, 11.0);
                float col = fmod(p, 4.0);
                float row = floor(p * 0.25);
                const float INSET = 2.5 / 256.0;
                float tu = clamp(u, INSET, 1.0 - INSET);
                float tv = clamp(vRel, INSET, 1.0 - INSET); // 0=lash(PNG 상단) → 1=하단
                float x = (col + tu) * 0.25;
                float yPng = (row + tv) * 0.25;
                return tex2D(_LowerProfileAtlas, float2(x, 1.0 - yPng)).r;
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

            // (구 LowerEsProfile 절차 12종은 삭제 — 실루엣 정본은 _LowerProfileAtlas
            //  베이크드 타일과 _LowerSmokyMask(마스크 모드)뿐이다. smoothstep 프로파일은
            //  캔버스 클로저를 보장하지 못해 "네모" 회귀의 근원이었다.)

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

                // 눈꼬리 연장 캔버스(along>1) — 부위별 게이트의 공용 기준.
                // inEye: 연장 구간에서 꺼져야 하는 부위(컨실러·애교살)용 코너 소프트 컷.
                float extSpan = max(_LowerExtSpan, 1e-4);
                float extT = saturate((along - 1.0) / extSpan); // 0=코너 → 1=연장 끝
                float inEye = 1.0 - smoothstep(0.985, 1.0 + 0.02 * _LowerExtSpan, along);
                // 캔버스 클로저(개편) — 아래 전 텀 커버리지에 공통 곱. 원시 밴드 UV 기준
                // (아핀 역변환 좌표가 아니라 캔버스 그 자체를 닫는 게이트다).
                float closure = CanvasClosure(along, v);

                // 삼각존 세로 폭 배수 — 라이너 트레이스가 하단 경계를 공유하므로 선계산.
                float triShapeW = (_TriShape > 1.5) ? 1.6 : ((_TriShape > 0.5) ? 0.6 : 1.0);

                // 가로 가중: 코너 페이드(라인용). 꼬리 연장(_LinerTailLen>0)이면 바깥
                // 페이드를 코너가 아니라 연장 끝으로 밀고 끝을 뾰족하게 테이퍼한다.
                float lnTailEnd = 1.0 + _LinerTailLen * _LowerExtSpan;
                float lnOuterFade = _LinerTailLen > 0.001
                    ? (1.0 - smoothstep(lnTailEnd - 0.06, lnTailEnd, linerAlong))
                    : (1.0 - smoothstep(0.92, 1.0, linerAlong));
                float lnTaper = _LinerTailLen > 0.001
                    ? (1.0 - 0.7 * smoothstep(0.95, lnTailEnd, linerAlong))
                    : 1.0;
                float linerEdge = smoothstep(0.0, 0.08, linerAlong) * lnOuterFade;

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
                // 삼각존 트레이스(_LinerTailTrace) — 꼬리 구간에서 라인 세로 중심을
                // lash(0)에서 삼각존 하단 경계로 램프. 트레이스 0이면 중심 0 →
                // |v-0| = v라 현행과 바이트 동일.
                float lnTriBottom = min(TRI_V_WIDTH * _TriHeight * triShapeW, 1.0);
                // 램프는 길게(0.40→코너) — 짧은 구간(0.55~0.90)은 급강하로 "확 꺾여"
                // 보였다(실기기). 코너에서 최저점 도달 후 연장 구간은 수평 유지(1자).
                float lnCenter = _LinerTailTrace
                               * smoothstep(0.40, 1.0, min(linerAlong, 1.0)) * lnTriBottom;
                float lnDist = abs(linerV - lnCenter);
                float lnAmt = (1.0 - smoothstep(0.10 * _LinerThickness * lnTaper,
                                                0.22 * _LinerThickness * lnTaper, lnDist))
                              * linerEdge * _LinerIntensity * lnSeg * closure;
                lnAmt = TexEdge(TexCoverage(saturate(lnAmt), lnTexC), lnTexE);
                // ── 애교살 베이크드 프로파일(절차 SDF 대체) ──────────────────────────────
                // 근본 교체 v4: FitArc SDF도 곡선을 정점 계수로 나르는 절차 경로라, 요구가
                // 늘 때마다(그림자 아래만·중앙 펄) 상수 튜닝이 폭증했다. 대신 애교살 "모양"을
                // 미리 부드럽게 구운 텍스처(R 하이라이트 / G 아래그림자 / B 중앙펄게이트)로
                // 두고 밴드 UV에 바이리니어 샘플만 한다. 매끈함의 근거가 메시 해상도·smoothstep
                // 튜닝이 아니라 텍스처 필터링이라 각짐이 구조적으로 불가능하다.
                // 캔버스는 위(y↑)가 lash, Unity UV는 아래→위이므로 v를 뒤집어 샘플(컨실러 관례).
                float2 aegyoUV = InverseBandAffine(i.uv, _AegyoAffine, _AegyoAffineRot);
                fixed3 aegyoProf = tex2D(_AegyoProfile, float2(aegyoUV.x, 1.0 - aegyoUV.y)).rgb;
                // 애교살은 해부학적으로 눈 구간까지 — 연장 캔버스에선 코너에서 소프트 컷
                // (프로파일 텍스처가 우측 엣지 클램프로 번지는 것 방지).
                aegyoProf *= inEye * closure;
                float hiAmt = aegyoProf.r * _AegyoIntensity * AEGYO_HI_MAX;
                hiAmt = TexEdge(TexCoverage(saturate(hiAmt), agTexC), agTexE); // 제형 커버·엣지(애교살 하이라이트)
                float shAmt = aegyoProf.g * _AegyoIntensity * AEGYO_SH_MAX;   // G는 롤 아래에만 칠해짐 → 양옆 0
                shAmt = TexEdge(TexCoverage(saturate(shAmt), agTexC), agTexE); // 제형 커버·엣지(애교살 그림자)
                // 중앙 펄: B게이트 영역에만 라이브 시머. _AegyoPearl 0(기본)=펄 없음(기존 프리셋).
                float pearlAmt = aegyoProf.b * _AegyoIntensity * _AegyoPearl * AEGYO_HI_MAX;

                // 삼각존: 눈꼬리 아래 피부의 삼각 음영(눈밑 전체 아님). 애교살과 무관한
                // 별도 텀 — 꼬리(u 바깥 1/3)에서 상승, 세로는 lash 라인(v=0) 근처에 집중
                // (위 라인↔아래로 잇는 음영). 초승달 테이퍼 vv가 아닌 원시 v를 써서
                // 라인에 딱 붙는 삼각 그림자로 둔다.
                // 트레이스 활성 시 삼각존은 "눈꼬리점~디태치 언더라인 사이 쐐기"를 채우는
                // 것이 본래 테크닉 — 바깥 페이드를 라이너 꼬리 끝까지 밀어 쐐기 전체를 덮는다.
                // 꼭짓점: 삼각존은 눈꼬리(1.0)에서 끝나지 않는다 — 실제 테크닉은 코너 밖
                // 피부로 이어져 연장 캔버스 중간(1+0.5·span)의 꼭짓점으로 수렴한다(실기기
                // 사진 2026-07-24: 코너 컷은 삼각형 바깥 절반이 통째로 비어 "중간에서 툭
                // 끊김"으로 보였다). 구 메시(_LowerExtSpan 0)에선 1.0으로 축퇴 = 종전 동일.
                float triTip = _LinerTailTrace > 0.001
                    ? lnTailEnd
                    : 1.0 + 0.5 * _LowerExtSpan;
                float triAlong = smoothstep(TRI_U_START, TRI_U_START + TRI_U_RAMP, triUV.x)
                                 * (1.0 - smoothstep(triTip - TRI_FEATHER, triTip, triUV.x));
                // 높이 핸들(_TriHeight) — 세로 폭 TRI_V_WIDTH를 배수. 1=원래(하위호환).
                // 모양(_TriShape) 세로 폭 배수(triShapeW)는 라이너 트레이스와 공유 — 상단 선계산.
                // 페이드 거리는 밴드 세로 범위(v<=1)를 넘지 않게 클램프 — 넓게(1.6)×높이(2.0)
                // 극값 조합에서 v=1 하단이 안 꺼져 직선 컷으로 삐져나오는 것 방지. 기본값
                // (0.55×1×1=0.55<1)에선 min이 항등이라 바이트 동일.
                // 트레이스 활성 시 채움 깊이를 디태치 라인 바로 아래까지 확장 — 삼각존
                // 음영이 lash에만 붙어 라인과의 사이가 비어 보이던 문제(실기기) 해소.
                float triDepth = min(TRI_V_WIDTH * _TriHeight * triShapeW, 1.0);
                float triFillDepth = _LinerTailTrace > 0.001
                    ? max(triDepth, lnCenter + 0.10 * _LinerThickness)
                    : triDepth;
                // 삼각형 정형(트레이스 꺼짐 기본형, 실기기 사진 2026-07-24): 세로 깊이가
                // 시작점에서 0 → 꼬리로 갈수록 깊어졌다가 꼭짓점에서 다시 0으로 수렴해야
                // "삼각형"이다. 종전 상수 깊이는 lash 평행 밴드라 삼각존으로 안 읽혔다.
                // 트레이스 모드는 라이너가 하변을 그리는 종전 쐐기 기하 유지(튜닝 완료).
                // 성장 완료(시작+1.5·램프≈0.92) < 수렴 시작(꼭짓점−1.5·페더) — 코너 바로
                // 아래에서 최대 깊이 평탄 구간이 실제로 생기도록 두 구간을 분리한다.
                float triGrow = _LinerTailTrace > 0.001
                    ? 1.0
                    : smoothstep(TRI_U_START, TRI_U_START + 1.5 * TRI_U_RAMP, triUV.x)
                      * (1.0 - smoothstep(triTip - 1.5 * TRI_FEATHER, triTip, triUV.x));
                float triLocalDepth = min(triFillDepth, 1.0) * triGrow;
                // 세로 프로파일: 깊이 안쪽 55%는 평탄(풀 강도) 후 하단 페더. lash에서 즉시
                // 페이드하던 종전 프로파일은 존 중심부까지 옅어져 "여전히 연해" 보였다.
                float triV = 1.0 - smoothstep(0.55 * triLocalDepth,
                                              max(triLocalDepth, 1e-4), triUV.y);
                // 강도 응답 곡선 — 선형 alpha는 프리셋 대역(0.17~0.4)에서 음영이 너무 옅었다
                // (실기기). 1−(1−x)^지수로 저·중역을 들어 올리되 0=끔·1=최대는 그대로라
                // 슬라이더 상단 데드존이 없다. 지수 1.8→2.6(2026-07-24 사진: 여전히 옅음).
                float triStrength = 1.0 - pow(1.0 - saturate(_TriIntensity), 2.6);
                float triAmt = triAlong * triV * triStrength * closure;
                triAmt = TexEdge(TexCoverage(saturate(triAmt), trTexC), trTexE); // 제형 커버·엣지(삼각존)

                // Photoshop/소스제어 마스크의 해부학적 밴드 UV: x=안쪽→바깥, y=lash→볼.
                // 양눈 메시가 같은 해부학 방향으로 UV를 갖기 때문에 별도 좌우 반전은 없다.
                // PNG/Photoshop 캔버스는 위→아래가 y 증가, Unity UV는 아래→위이므로 v만 뒤집는다.
                float2 ccMaskUV = float2(along, 1.0 - v);
                float ccBlue = feed.b - max(feed.r, feed.g);
                float ccBlueSelector = smoothstep(CC_BLUE_LO, CC_BLUE_HI, ccBlue);
                float ccDarkSelector = smoothstep(CC_DARK_LO, CC_DARK_HI, 1.0 - luma);
                float ccMask = tex2D(_ConcealerMask, ccMaskUV).r
                             * ccBlueSelector * ccDarkSelector;
                // 컨실러는 연장 캔버스에서 항상 정지(마스크 우측 엣지 클램프 번짐 방지).
                float ccAmt = ccMask * _ConcealerIntensity * inEye * closure;
                ccAmt = TexEdge(TexCoverage(saturate(ccAmt), ccTexC), ccTexE); // 제형 커버·엣지(눈밑 컨실러)
                float ccA = saturate(ccAmt) * CONCEALER_ALPHA_CEILING;

                // 아이섀도 하(하안검 섀도) = 그린 마스크 실루엣. 구 절차 esBand(래시 평행 밴드
                // 세로 페이드)는 실루엣 자유도가 없어 "쓸 수 없는 모양"이라 폐기. eyeshadowLower*
                // 스칼라를 쓰는 전 하부 룩(데일리 베이지·코랄·로지·모브·딥스모키)이 이 한 경로를
                // 공용한다 — 색·강도·마감·핏높이만 다르고 실루엣은 마스크가 정본.
                // 세로는 _LowerShadowHeight로 스트레치. UV는 컨실러와 동일 1-v flip(PNG 위=래시).
                // 마스크가 안쪽/바깥 테이퍼를 담으므로 edge 코너페이드는 곱하지 않는다(윙 보존).
                float smokyV = saturate(v / clamp(_LowerShadowHeight, 0.25, 2.0));
                // 연장 구간: 마스크 우측 엣지가 클램프 샘플로 이어지되(상부 §16 관례 —
                // 엣지 픽셀 = 꼬리 밖 워시 강도), 연장 끝 전에 페이드로 소멸한다.
                float esExtFade = along <= 1.0 ? 1.0 : (1.0 - smoothstep(0.45, 1.0, extT));
                float esAmt = tex2D(_LowerSmokyMask, float2(along, 1.0 - smokyV)).r
                            * _LowerShadowIntensity * esExtFade * closure;
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
                // 애교살 base 마감 — 시머(finish 3)는 밴드 전체를 반짝여 "펄 없는 애교살"을
                // 깨므로 base에선 새틴으로 중화한다. 반짝임은 전부 중앙 펄(pigPearl·B게이트)로만
                // 보낸다. 매트(1)·글로시(2)는 base에 그대로 적용.
                float aegyoBaseFinish = (_AegyoFinish > 2.5) ? 0.0 : _AegyoFinish;
                pigHi = ApplyFinish(pigHi, luma, i.uv, aegyoBaseFinish, 0,
                                    0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
                pigHi = TexGrain(pigHi, i.uv, agTexG); // 제형 그레인(애교살)
                // 중앙 펄 색소 — 하이라이트 위에 라이브 시머(finish=3). pearlAmt(B게이트)가
                // 0이면(=_AegyoPearl 0, 기존 프리셋) 합성에서 기여 0이라 계산만 되고 안 보인다.
                fixed3 pigPearl = ApplyFinish(pigHi, luma, i.uv, 3.0, _AegyoShimmer,
                                              0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain);
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
                        // profile 6 = 마스크 모드: 그린 마스크(_LowerSmokyMask) 실루엣을
                        // 커버리지로. 나머지 11종은 베이크드 아틀라스 타일(절차 폐기).
                        // 두 경로 모두: 세로는 heightB 정규화(핏 높이 핸들), UV는 컨실러와
                        // 동일 1-v flip(PNG 위=래시라인), 연장 구간(along>1)은 우측 엣지
                        // 클램프 + 페이드(legacy esAmt 관례 공유). 아틀라스 연장 워시는
                        // 꼬리 프로파일(3·11)에만 허용 — 비꼬리 타일의 인셋 텍셀 잔존값이
                        // 눈꼬리 밖으로 새는 유령 워시 차단(구 절차 경로의 "u=1에서 0"
                        // 계약 계승, 생성기 3px 보더와 이중 게이트).
                        float vRelB = saturate(v / clamp(heightB, 0.25, 2.0));
                        float extFadeB = along <= 1.0
                            ? 1.0 : (1.0 - smoothstep(0.45, 1.0, extT));
                        float amtShapeB;
                        if (profileB > 5.5 && profileB < 6.5)
                        {
                            amtShapeB = tex2D(_LowerSmokyMask,
                                              float2(along, 1.0 - vRelB)).r * extFadeB;
                        }
                        else
                        {
                            float tailWashB =
                                (profileB > 2.5 && profileB < 3.5) || profileB > 10.5
                                    ? 1.0 : 0.0;
                            amtShapeB = SampleLowerProfileAtlas(
                                    profileB, min(along, 1.0), vRelB)
                                * (along <= 1.0 ? 1.0 : tailWashB * extFadeB);
                        }
                        // closure — 캔버스 4변 봉쇄(마스크·아틀라스·핏이 뭘 하든 네모 불가).
                        float amtB = amtShapeB * liftedIntensityB * closure;
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
                float total = lnAmt + hiAmt + shAmt + triAmt + pearlAmt;
                float procA = saturate(total);
                fixed3 procPig = (pigLn * lnAmt + pigHi * hiAmt + pigSh * shAmt
                                  + pigTri * triAmt + pigPearl * pearlAmt)
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
                float artA = art.a * _AegyoStyleIntensity * closure;
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
