// Face beautification + makeup shader (Built-in Render Pipeline).
//
// Rendered on the AR face mesh in the transparent queue. A GrabPass captures the
// already-rendered camera feed behind the mesh, so every fragment can:
//   1. smooth the skin with an edge-preserving blur of the camera image,
//   2. apply a gentle tone-up (brightening),
//   3. blend lipstick / blush using masks in face-mesh UV space.
// (Eyeshadow moved to a dynamic landmark band — see IrisRenderer / Eyeshadow.shader.)
//
// Because the output starts from the exact pixels behind the mesh, areas with
// zero effect are indistinguishable from the raw feed — no visible seams.
Shader "ARMakeup/FaceMakeup"
{
    Properties
    {
        _BlushMask ("Blush Mask", 2D) = "black" {}
        _BlushColor ("Blush Color", Color) = (0.94, 0.56, 0.63, 1)
        _BlushIntensity ("Blush Intensity", Range(0, 1)) = 0.35
        // 제형(텍스처) W1 — GENERIC 템플릿 enum(0 크림/1 파우더/2 리퀴드/3 젤/4 펜슬). 0=현행.
        _BlushTexture ("Blush Texture (generic enum)", Float) = 0
        // 블러셔 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머. 피드 luma만(신규의존0).
        _BlushFinish ("Blush Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _BlushShimmer ("Blush Shimmer Gain", Range(0, 1)) = 0.5
        // ── 제형 스튜디오(#21) — 블러셔 마감 세부 파라미터. 전부 0 = enum 기존 동작(하위호환). ──
        _BlushGlossLo ("Blush Finish Gloss Lo", Range(0, 1)) = 0
        _BlushGlossGain ("Blush Finish Gloss Gain", Range(0, 1)) = 0
        _BlushShimmerSize ("Blush Finish Shimmer Size", Range(0, 1)) = 0
        _BlushShimmerDensity ("Blush Finish Shimmer Density", Range(0, 1)) = 0
        _BlushMatte ("Blush Finish Matte", Range(0, 1)) = 0
        _BlushSheen ("Blush Finish Velvet Sheen", Range(0, 1)) = 0
        _BlushMaterial ("Blush Material (0 none 1 velvet 2 metal 3 holo)", Float) = 0
        _BlushMaterialStrength ("Blush Material Strength", Range(0, 1)) = 0
        // 입자 레이어(7축) — 볼 위 반짝 알갱이. density=0=끔(하위호환).
        _BlushParticleSize ("Blush Particle Size", Range(0, 1)) = 0
        _BlushParticleDensity ("Blush Particle Density", Range(0, 1)) = 0
        _BlushParticleBrightness ("Blush Particle Brightness", Range(0, 1)) = 0.7
        _BlushParticleColor ("Blush Particle Color", Color) = (1, 0.95, 0.85, 1)
        _BlushParticleTwinkle ("Blush Particle Twinkle", Range(0, 1)) = 1
        _BlushParticleShape ("Blush Particle Shape (0 round 1 star)", Range(0, 1)) = 0
        _BlushParticleFeather ("Blush Particle Feather (0 sharp 1 soft pearl)", Range(0, 1)) = 0
        _BlushParticleParallax ("Blush Particle Parallax", Range(0, 1)) = 0
        _BlushParticleConfetti ("Blush Particle Confetti (0 mono 1 multicolor)", Range(0, 1)) = 0
        // 질감 맵(#22) — 픽셀별 광 지도(R 광게인·G 시머밀도). 기본 white + _HasFinishMap 0
        // = 변조 없음(스칼라 그대로, 하위호환). setTextureMap 브리지로 런타임 임포트.
        _BlushFinishMap ("Blush Finish Map (R gloss G shimmer)", 2D) = "white" {}
        _BlushHasFinishMap ("Blush Has Finish Map", Float) = 0
        // 블러셔 배치(R4) — 캐노니컬 UV 오프셋. Lift +=위, Spread +=바깥(좌우 미러).
        _BlushLift ("Blush Lift (+ up)", Range(-0.15, 0.15)) = 0
        _BlushSpread ("Blush Spread (+ outward)", Range(-0.15, 0.15)) = 0
        // 넓은 면 보정: 하이라이터/컨실러=가산(스크린), 컨투어=감산(곱).
        _HighlightMask ("Highlight Mask", 2D) = "black" {}
        _HighlightColor ("Highlight Color", Color) = (1.0, 0.95, 0.86, 1)
        _HighlightIntensity ("Highlight Intensity", Range(0, 1)) = 0
        // 하이라이터/컨투어 마감 — 블러셔와 동일 enum(0 새틴 1 매트 2 글로시 3 시머).
        // ApplyFinish 레거시 경로(세부 0)라 0=새틴=기존 출력과 바이트 동일(하위호환).
        _HighlightFinish ("Highlight Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _HighlightShimmer ("Highlight Shimmer Gain", Range(0, 1)) = 0.5
        // 제형 스튜디오(#21) — 하이라이터 마감 세부. 전부 0 = enum 기존 동작(하위호환).
        _HighlightGlossLo ("Highlight Finish Gloss Lo", Range(0, 1)) = 0
        _HighlightGlossGain ("Highlight Finish Gloss Gain", Range(0, 1)) = 0
        _HighlightShimmerSize ("Highlight Finish Shimmer Size", Range(0, 1)) = 0
        _HighlightShimmerDensity ("Highlight Finish Shimmer Density", Range(0, 1)) = 0
        _HighlightMatte ("Highlight Finish Matte", Range(0, 1)) = 0
        _HighlightSheen ("Highlight Finish Velvet Sheen", Range(0, 1)) = 0
        _ContourMask ("Contour Mask", 2D) = "black" {}
        _ContourColor ("Contour Color", Color) = (0.62, 0.50, 0.42, 1)
        _ContourIntensity ("Contour Intensity", Range(0, 1)) = 0
        _ContourFinish ("Contour Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _ContourShimmer ("Contour Shimmer Gain", Range(0, 1)) = 0.5
        _ContourGlossLo ("Contour Finish Gloss Lo", Range(0, 1)) = 0
        _ContourGlossGain ("Contour Finish Gloss Gain", Range(0, 1)) = 0
        _ContourShimmerSize ("Contour Finish Shimmer Size", Range(0, 1)) = 0
        _ContourShimmerDensity ("Contour Finish Shimmer Density", Range(0, 1)) = 0
        _ContourMatte ("Contour Finish Matte", Range(0, 1)) = 0
        _ContourSheen ("Contour Finish Velvet Sheen", Range(0, 1)) = 0
        // 마스크 부위 핏 아핀(배치 A ②) — 하이라이터/컨투어 존 UV 오프셋(블러셔 Lift/Spread 일반화).
        _HighlightLift ("Highlight Lift (+ up)", Range(-0.15, 0.15)) = 0
        _HighlightSpread ("Highlight Spread (+ outward)", Range(-0.15, 0.15)) = 0
        _ContourLift ("Contour Lift (+ up)", Range(-0.15, 0.15)) = 0
        _ContourSpread ("Contour Spread (+ outward)", Range(-0.15, 0.15)) = 0
        // 컨실러 색·강도는 붉은기 자동(shape=1) 경로에서만 쓴다 — 눈밑 존(shape=0)은
        // 하안검 밴드(LowerLidRenderer)로 이관(§08). 캐노니컬 _ConcealerMask 삭제.
        _ConcealerColor ("Concealer Color", Color) = (0.98, 0.86, 0.76, 1)
        _ConcealerIntensity ("Concealer Intensity", Range(0, 1)) = 0
        // 컨실러 마감(붉은기 자동 경로) — 블러셔와 동일 enum. ApplyFinish 레거시 경로(세부 0)라
        // 0=새틴=기존 출력과 바이트 동일(하위호환). LowerLid(눈밑존)와 같은 필드(concealerFinish) 공용.
        _ConcealerFinish ("Concealer Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        // 부분 커버 모양(#19b): 0=눈밑 존(밴드로 이관, 여기선 무효) 1=붉은기 자동
        _ConcealerShape ("Concealer Shape (0 undereye 1 redness)", Float) = 0
        // 잡티 지우기(밀어내기) — outlier 억제. 넓은 이웃 대비 국소 어둡/붉은 이상치만
        // 이웃 색으로 되민다(색을 얹지 않음). 0=현행 픽셀 바이트 동일(하위호환).
        _BlemishRemoval ("Blemish Removal (push toward neighborhood)", Range(0, 1)) = 0
        // 베이스 팩(#18) — 파운데이션(루마 보존 커버+커버리지 비례 chroma 평탄화),
        // 파우더(유분광 억제), 톤 보정색(브라이트닝 캐스트), 프라이머 윤광(스펙 증폭).
        // 전부 0/흰색이면 기존 픽셀과 동일.
        _FoundationColor ("Foundation Color", Color) = (0.91, 0.77, 0.66, 1)
        _FoundationIntensity ("Foundation Coverage", Range(0, 1)) = 0
        _FoundationFinish ("Foundation Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 제형 텍스처(배치 A ①) — 커버 램프(게인·chroma·커버) 분기. 0=리퀴드(현행).
        _FoundationTexture ("Foundation Texture (0 liquid 1 cushion 2 skintint)", Float) = 0
        // 모양 축 W3 피부 존 — 0=전체(현행). 존만큼 곱으로 게이트(powderShape 선례).
        _ToneShape ("Tone Zone (0 all 1 tzone 2 center)", Float) = 0
        _SkinShape ("Skin Zone (0 all 1 tzone 2 no-cheek)", Float) = 0
        _FoundationShape ("Foundation Zone (0 all 1 tzone 2 outer-feather)", Float) = 0
        _PowderIntensity ("Powder (mattify)", Range(0, 1)) = 0
        // 파우더 존(#19b): 0=전체 1=T존(이마·콧등) 2=볼 제외
        _PowderShape ("Powder Zone (0 all 1 tzone 2 no-cheek)", Float) = 0
        // 컬러 파우더 — 흰색=무색(트랜스루선트, 기존 출력). 핑크/라벤더 톤업 등 옅은 캐스트.
        _PowderColor ("Powder Color Cast (white=none)", Color) = (1, 1, 1, 1)
        // 펄 파우더 — 마감 enum(0 새틴=기존 1 매트 2 글로시 3 시머) + 시머 게인.
        _PowderFinish ("Powder Finish (0 satin 1 matte 2 gloss 3 shimmer)", Float) = 0
        _PowderShimmer ("Powder Shimmer Gain", Range(0, 1)) = 0.5
        _ToneBaseColor ("Tone Base Cast (white=none)", Color) = (1, 1, 1, 1)
        _SkinGlow ("Primer Glow", Range(0, 1)) = 0
        // 애교살은 LowerLid.shader(하안검 밴드 정식판, 랜드마크 정밀)로 이관.
        // 사용자가 UV 템플릿 위에 그린 메이크업 룩(얼굴 UV 데칼). 알파=그린 영역,
        // RGB=그린 색 그대로. setFaceOverlay로 런타임 임포트.
        _MakeupOverlay ("Makeup Overlay", 2D) = "black" {}
        _MakeupOverlayIntensity ("Overlay Intensity", Range(0, 1)) = 0
        // 캐노니컬 N장 합성(설계 섹션 07 블로커) — 슬롯0=_MakeupOverlay(하위호환),
        // _Overlay1~3 추가. transform=(중심x, 중심y, 크기, 회전rad) — 크기1·중심0.5·
        // 회전0이면 UV 그대로(기존 단일 오버레이와 동일). 슬롯 강도는 마스터
        // _MakeupOverlayIntensity와 곱 — 슬롯0만 기본 1이라 단일 임포트 경로 불변.
        // 슬롯별 Blend: 0=그림 그대로(over, 스티커) 1=색소 틴트(루마 보존 — 블러셔·
        // 컨투어급 화질, 섹션 08 (c) "마스크 틴트+데칼 아트"의 틴트 측).
        // 슬롯별 Color: 텍스처에 곱하는 틴트(기본 흰색=원본). 내장 소프트 점
        // (builtin:dot, 흰색 알파 폴오프)에 색을 입혀 그림 없이 블러셔 점을 만든다.
        // 슬롯별 Finish(데코 마감): 0=새틴(기본) 1=매트 2=듀이 — FOUNDATION_FINISHES. 젬(젬스톤
        // 광)에 특히 유효. ApplyOverlay가 ApplyFinish 레거시 enum 경로(세부 0)로 소비 —
        // 0=새틴=항등이라 기존 오버레이와 바이트 동일(구 저장물 필드 부재 하위호환).
        _Overlay0Transform ("Overlay 0 Transform (cx cy scale rad)", Vector) = (0.5, 0.5, 1, 0)
        _Overlay0Intensity ("Overlay 0 Intensity", Range(0, 1)) = 1
        _Overlay0Blend ("Overlay 0 Blend (0 art 1 tint 2 neon)", Range(0, 2)) = 0
        _Overlay0Color ("Overlay 0 Color", Color) = (1, 1, 1, 1)
        _Overlay0Finish ("Overlay 0 Finish (0 satin 1 matte 2 dewy)", Float) = 0
        _Overlay1 ("Overlay 1", 2D) = "black" {}
        _Overlay1Transform ("Overlay 1 Transform (cx cy scale rad)", Vector) = (0.5, 0.5, 1, 0)
        _Overlay1Intensity ("Overlay 1 Intensity", Range(0, 1)) = 0
        _Overlay1Blend ("Overlay 1 Blend (0 art 1 tint 2 neon)", Range(0, 2)) = 0
        _Overlay1Color ("Overlay 1 Color", Color) = (1, 1, 1, 1)
        _Overlay1Finish ("Overlay 1 Finish (0 satin 1 matte 2 dewy)", Float) = 0
        _Overlay2 ("Overlay 2", 2D) = "black" {}
        _Overlay2Transform ("Overlay 2 Transform (cx cy scale rad)", Vector) = (0.5, 0.5, 1, 0)
        _Overlay2Intensity ("Overlay 2 Intensity", Range(0, 1)) = 0
        _Overlay2Blend ("Overlay 2 Blend (0 art 1 tint 2 neon)", Range(0, 2)) = 0
        _Overlay2Color ("Overlay 2 Color", Color) = (1, 1, 1, 1)
        _Overlay2Finish ("Overlay 2 Finish (0 satin 1 matte 2 dewy)", Float) = 0
        _Overlay3 ("Overlay 3", 2D) = "black" {}
        _Overlay3Transform ("Overlay 3 Transform (cx cy scale rad)", Vector) = (0.5, 0.5, 1, 0)
        _Overlay3Intensity ("Overlay 3 Intensity", Range(0, 1)) = 0
        _Overlay3Blend ("Overlay 3 Blend (0 art 1 tint 2 neon)", Range(0, 2)) = 0
        _Overlay3Color ("Overlay 3 Color", Color) = (1, 1, 1, 1)
        _Overlay3Finish ("Overlay 3 Finish (0 satin 1 matte 2 dewy)", Float) = 0
        // 립은 LipRenderer(윤곽 링 메시)로, 아이섀도우는 IrisRenderer 동적 밴드로 분리됨.
        // 제형(텍스처) 배선 — 얼굴 메시 6부위 enum(0=현행=무변조). 블러셔(_BlushTexture) 선례.
        // Finish.cginc TexBundleFromEnum이 시드 번들로 번역. tone/skin=TONE 템플릿(grain 축만),
        // 나머지=GENERIC 템플릿(엣지·커버·그레인·body). 0 = ZERO = 바이트 동일(하위호환).
        _ToneTexture ("Tone Texture (tone enum)", Float) = 0
        _SkinTexture ("Skin Texture (tone enum)", Float) = 0
        _HighlightTexture ("Highlight Texture (generic enum)", Float) = 0
        _ContourTexture ("Contour Texture (generic enum)", Float) = 0
        _ConcealerTexture ("Concealer Texture (generic enum)", Float) = 0
        _PowderTexture ("Powder Texture (generic enum)", Float) = 0
        _Smoothing ("Skin Smoothing", Range(0, 1)) = 0.5
        _Brightening ("Skin Brightening", Range(0, 1)) = 0.2
        _BlurRadius ("Blur Radius (px)", Range(0, 6)) = 2.5
        // 고개를 돌리면 실루엣에서 반대쪽 삼각형이 접혀 겹친다(fold-over).
        // 접힌 면은 winding이 뒤집히므로 컬링으로 제거 가능 — 올바른 방향은
        // 미러/매핑 조합에 따라 달라 캘리브레이션 UI에서 실측으로 정한다.
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 1 // Front (실측 확정)
    }

    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" }

        GrabPass { "_CameraFeed" }

        Pass
        {
            // 메시가 랜드마크 z로 입체화되어 있어, ZWrite로 고개를 돌렸을 때
            // 뒤쪽 삼각형(반대쪽 입술 등)이 앞면 위에 겹쳐 그려지는 것을 막는다.
            ZWrite On
            Cull [_Cull]

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            #include "Occlusion.cginc" // §11 세그 오클루전 게이트 (전역 유니폼)
            #include "Finish.cginc"    // 마감(ApplyFinish) 공용 — 제형 스튜디오 세부 파라미터
            #include "Ambient.cginc"   // 저조도 색소 바닥(PigmentBase) — 어둠 발광 방지

            // _CameraFeed / _CameraFeed_TexelSize 는 Finish.cginc(1곳)에서 선언 — A15 방향 게인이 공유.
            sampler2D _BlushMask;
            fixed4 _BlushColor;
            float _BlushIntensity;
            float _BlushTexture;   // 제형(텍스처) W1 — GENERIC 템플릿 enum(0=크림=현행)
            float _BlushFinish;
            float _BlushShimmer;
            // 제형 스튜디오(#21) 블러셔 마감 세부 — 0 = enum 기존 동작(하위호환).
            float _BlushGlossLo;
            float _BlushGlossGain;
            float _BlushShimmerSize;
            float _BlushShimmerDensity;
            float _BlushMatte;
            float _BlushSheen;
            float _BlushMaterial;
            float _BlushMaterialStrength;
            float _BlushParticleSize;
            float _BlushParticleDensity;
            float _BlushParticleBrightness;
            fixed4 _BlushParticleColor;
            float _BlushParticleTwinkle;
            float _BlushParticleShape;
            float _BlushParticleFeather;
            float _BlushParticleParallax;
            float _BlushParticleConfetti;
            sampler2D _BlushFinishMap;   // 질감 맵(#22) — R 광게인·G 시머밀도 변조
            float _BlushHasFinishMap;    // 0 = 맵 없음(스칼라 그대로, 하위호환)
            float _BlushLift;
            float _BlushSpread;
            sampler2D _HighlightMask;
            fixed4 _HighlightColor;
            float _HighlightIntensity;
            float _HighlightFinish;   // 0 새틴(기존) 1 매트 2 글로시 3 시머
            float _HighlightShimmer;
            // 제형 스튜디오(#21) 하이라이터/컨투어 세부 — 0 = enum 기존 동작(하위호환).
            float _HighlightGlossLo;
            float _HighlightGlossGain;
            float _HighlightShimmerSize;
            float _HighlightShimmerDensity;
            float _HighlightMatte;
            float _HighlightSheen;
            sampler2D _ContourMask;
            fixed4 _ContourColor;
            float _ContourIntensity;
            float _ContourFinish;
            float _ContourShimmer;
            float _ContourGlossLo;
            float _ContourGlossGain;
            float _ContourShimmerSize;
            float _ContourShimmerDensity;
            float _ContourMatte;
            float _ContourSheen;
            // 부위 핏 아핀(배치 A ②) — 컨투어·하이라이터 UV 워프 오프셋(0=원래).
            float _HighlightLift;
            float _HighlightSpread;
            float _ContourLift;
            float _ContourSpread;
            fixed4 _ConcealerColor;
            float _ConcealerIntensity;
            float _ConcealerFinish; // 0=새틴=기존 출력(하위호환) 1 매트 2 글로시 3 시머
            float _ConcealerShape; // 0=눈밑 존(밴드로 이관, 무효) 1=붉은기 자동
            float _BlemishRemoval; // 잡티 지우기(밀어내기) 강도 — 0=현행 픽셀 동일
            float _PowderShape;    // 0=전체 1=T존 2=볼 제외
            // 붉은기 자동 게이트(#19b) — 치아 미백 redness 게이트의 역방향(붉은 픽셀 선택).
            // R−max(G,B)가 이 구간을 넘으면 커버(홍조·트러블·콧볼). 실기기 튜닝 대상.
            #define CC_RED_LO 0.05  // 실기기 튜닝 대상
            #define CC_RED_HI 0.16  // 실기기 튜닝 대상
            // 잡티 지우기(밀어내기) 상수 — 넓은 이웃 평균 대비 이상도 판정·밴드패스. 전부
            // 실기기 튜닝 대상(v1). 반경(BR_RADIUS)은 잡티(수 px)를 넘겨 이웃을 피부로 채우고,
            // 밴드패스 상한(BR_HI)은 극단 이상치(눈·눈썹·콧구멍·헤어라인=특징부)를 제외해 보호.
            #define BR_RADIUS 6.0   // 이웃 링 반경(텍셀 배수) — 잡티 지름보다 크게
            #define BR_LUMA_W 1.0   // 루마 결손 가중(이웃보다 어두움)
            #define BR_RED_W  1.2   // 붉은기 초과 가중(이웃보다 붉음)
            #define BR_LO     0.045 // 발동 임계(이 미만은 정상 피부결)
            #define BR_HI     0.22  // 밴드패스 상한(이 초과는 특징부 — 보호)
            #define BR_FEATHER 0.05 // 경계 페더(헤일로 방지)
            // 파우더 존 마스크 경계(캐노니컬 얼굴 UV, x 중심 0.5) — 실기기 튜닝 대상.
            #define PWD_TZONE_LO 0.10  // T존 중앙 스트립 반폭 시작
            #define PWD_TZONE_HI 0.24  // T존 페이드 끝
            #define PWD_CHEEK_LO 0.14  // 볼 제외: 볼로 판정 시작하는 중심 거리
            #define PWD_CHEEK_HI 0.30  // 볼 제외: 완전 제외 거리
            // 모양 축 W3 존 경계 — 얼굴 중앙(방사, |uv−0.5|)·파운데 외곽 페더(방사). 실기기 튜닝 대상.
            #define FACE_CENTER_LO 0.16  // 얼굴 중앙 존: 방사 거리 이하 = 100% 적용
            #define FACE_CENTER_HI 0.40  // 방사 이 거리 이상 = 완전 제외
            #define FND_FEATHER_LO 0.28  // 파운데 외곽 페더: 방사 이 거리부터 감쇠 시작
            #define FND_FEATHER_HI 0.46  // 방사 이 거리 이상 = 완전 페더(0)
            // 파운데 전용 경계 페더 — 세미매트 스킨에서 얼굴 메시 오벌 경계선(턱선·헤어라인·
            // 관자)이 뚜렷하게 끊겨 보이는 걸 없앤다. 위 FND_FEATHER(FoundationShape==2 opt-in)와
            // 달리 파운데가 켜지면 항상 적용하고, TempleFades(전역 i.fade)를 대체하지 않고 곱으로
            // 결합한다(fCov에 곱한 뒤, 프래그 말미 lerp(original,col,i.fade)에서 다시 곱).
            // 얼굴 오벌은 원이 아니라 가로가 더 넓어(캐노니컬 UV 실측: x반경 0.49 > y반경 0.42)
            // 순수 방사 거리로는 턱끝(방사 0.45)과 볼옆(0.49)을 한 밴드로 균일하게 못 덮는다.
            // 오벌에 맞춘 타원 정규화 거리를 쓰면 경계 전체가 d≈0.88~0.945에 모여(실측 spread
            // 0.066) 한 밴드로 균일 페더된다. 중심·반경·밴드 전부 실기기 튜닝 대상.
            #define FND_EDGE_CX 0.5   // 오벌 중심 x (실기기 튜닝 대상)
            #define FND_EDGE_CY 0.48  // 오벌 중심 y (실기기 튜닝 대상)
            #define FND_EDGE_AX 0.53  // 타원 x 반경 정규화 (실기기 튜닝 대상)
            #define FND_EDGE_AY 0.46  // 타원 y 반경 정규화 (실기기 튜닝 대상)
            #define FND_EDGE_LO 0.80  // 타원거리 이하 = 커버 100% (실기기 튜닝 대상)
            #define FND_EDGE_HI 0.94  // 타원거리 이상 = 완전 페더(0); 밴드폭 ≈ UV 0.07 ≈ 눈폭 15~25% (실기기 튜닝 대상)
            // ── 특징부(눈알 개구부·입술·콧구멍) 파운데 제외 — 캐노니컬 UV 타원 ──
            // 실기기 버그: 파운데가 눈꺼풀 개구부·입술·콧방울 같은 특징부에도 발려
            // "안 먹혀야 할 곳에 피부화장이 먹은 느낌"(파운데 시작 루마 0.45로 밝아져 드러남).
            // 처방: fCov(파운데 커버)에만 곱하는 특징부 제외 게이트. 좌표는 추정이 아니라
            // canonical_face_model.obj의 vt(캐노니컬 UV) 실측(HighlightRegion 실측 규약과 동일):
            //   눈 개구부 RIGHT_EYE 실측 center(0.350,0.622) rx0.069 ry0.023,
            //   입술 LIPS_OUTER center(0.500,0.306) rx0.118 ry0.043,
            //   콧구멍 lm98/64(0.423,0.414~0.437). 눈·코는 좌우 대칭이라 u 폴딩(0.5-|u-0.5|)로 공용.
            // 눈두덩(쌍꺼풀)은 실화장에서 파운데 얹는 게 정상 → ry를 개구부에 타이트하게(과제외 금지).
            // luma 추정이 아닌 순수 기하 타원이라 붉은 피부·조명에 오판 없음. 강도 상수화 →
            // FND_FEATURE_EXCLUDE=0이면 fCov 무변(하위호환), 파운데 0이면 블록 자체 미실행.
            #define FEAT_LIP_CX 0.500  // 입술 타원 중심 x (실측 0.500)
            #define FEAT_LIP_CY 0.306  // 입술 타원 중심 y (실측 0.306)
            #define FEAT_LIP_RX 0.122  // 입술 x 반경 (실측 0.118 + 소여유) 실기기 튜닝 대상
            #define FEAT_LIP_RY 0.052  // 입술 y 반경 (실측 0.043 + 윗/아랫 입술선 여유) 실기기 튜닝 대상
            #define FEAT_EYE_CX 0.350  // 눈 개구부 중심 x (미러 폴딩 후 우안 기준, 실측 0.350)
            #define FEAT_EYE_CY 0.622  // 눈 개구부 중심 y (실측 0.622)
            #define FEAT_EYE_RX 0.078  // 눈 x 반경 (실측 0.069 + 눈꼬리 여유) 실기기 튜닝 대상
            #define FEAT_EYE_RY 0.028  // 눈 y 반경 (실측 0.023, 개구부 타이트 — 눈두덩 보호) 실기기 튜닝 대상
            #define FEAT_NOS_CX 0.423  // 콧구멍 중심 x (미러 폴딩 후, 실측 0.423)
            #define FEAT_NOS_CY 0.423  // 콧구멍 중심 y (실측 0.414~0.437 중앙)
            #define FEAT_NOS_RX 0.034  // 콧구멍 x 반경 (콧방울 안쪽 타이트) 실기기 튜닝 대상
            #define FEAT_NOS_RY 0.030  // 콧구멍 y 반경 실기기 튜닝 대상
            #define FEAT_FEATHER 0.30  // 타원 경계 페더 폭(정규화 거리 d 단위) 실기기 튜닝 대상
            #define FND_FEATURE_EXCLUDE 0.85 // 특징부 제외 강도 [0=제외안함=기존, 1=완전제외] 실기기 튜닝 대상
            // 베이스 팩(#18)
            fixed4 _FoundationColor;
            float _FoundationIntensity;
            float _FoundationFinish;
            float _FoundationTexture; // 제형 텍스처(①) 0=리퀴드 1=쿠션 2=스킨틴트
            // 모양 축 W3 피부 존 — 0=전체(현행 픽셀 동일). 존만큼 곱 게이트.
            float _ToneShape;        // 0=전체 1=T존 2=얼굴 중앙
            float _SkinShape;        // 0=전체 1=T존 2=볼 제외
            float _FoundationShape;  // 0=전체 1=T존 집중 2=외곽 페더 강화
            float _PowderIntensity;
            fixed4 _PowderColor;   // 흰색=무색(트랜스루선트) — 컬러 파우더 캐스트
            float _PowderFinish;   // 0 새틴=기존 1 매트 2 글로시 3 시머(펄 파우더)
            float _PowderShimmer;
            fixed4 _ToneBaseColor;
            float _SkinGlow;
            // 파운데 루마 보존 게인/리프트(TintFinish 계열)·커버리지 비례 chroma 평탄화·
            // 윤광 스펙 추출/게인·파우더 유분광 억제/미세 chroma — 전부 실기기 튜닝 대상.
            #define FND_LUMA_GAIN 1.5        // 실기기 튜닝 대상
            #define FND_LUMA_LIFT 0.15       // 실기기 튜닝 대상
            #define FND_CHROMA 0.5           // 실기기 튜닝 대상
            // 제형 텍스처(①) — 쿠션/스킨틴트가 게인·chroma·커버리지를 상대 조정(0=리퀴드는 배수 1).
            #define FND_TEX_CUSHION_GAIN 0.12    // 쿠션: 루마 게인 소폭 상향(커버↑) // 실기기 튜닝 대상
            #define FND_TEX_SKINTINT_GAIN 0.15   // 스킨틴트: 게인 하향(커버↓) // 실기기 튜닝 대상
            #define FND_TEX_CUSHION_CHROMA 0.20  // 쿠션: chroma 평탄화 상향 // 실기기 튜닝 대상
            #define FND_TEX_SKINTINT_CHROMA 0.30 // 스킨틴트: chroma 하향 // 실기기 튜닝 대상
            #define FND_TEX_CUSHION_COV 0.15     // 쿠션: 커버리지 상향 // 실기기 튜닝 대상
            #define FND_TEX_SKINTINT_COV 0.30    // 스킨틴트: 커버리지 하향 // 실기기 튜닝 대상
            #define GLOW_SPEC_LO 0.6         // 실기기 튜닝 대상
            #define GLOW_GAIN 0.35           // 실기기 튜닝 대상
            #define POWDER_SHINE_LO 0.62     // 실기기 튜닝 대상
            #define POWDER_SPEC_SUPPRESS 0.5 // 실기기 튜닝 대상
            #define POWDER_CHROMA 0.12       // 실기기 튜닝 대상
            sampler2D _MakeupOverlay;
            float _MakeupOverlayIntensity;
            float4 _Overlay0Transform;
            float _Overlay0Intensity;
            float _Overlay0Blend;
            fixed4 _Overlay0Color;
            float _Overlay0Finish;
            sampler2D _Overlay1;
            float4 _Overlay1Transform;
            float _Overlay1Intensity;
            float _Overlay1Blend;
            fixed4 _Overlay1Color;
            float _Overlay1Finish;
            sampler2D _Overlay2;
            float4 _Overlay2Transform;
            float _Overlay2Intensity;
            float _Overlay2Blend;
            fixed4 _Overlay2Color;
            float _Overlay2Finish;
            sampler2D _Overlay3;
            float4 _Overlay3Transform;
            float _Overlay3Intensity;
            float _Overlay3Blend;
            fixed4 _Overlay3Color;
            float _Overlay3Finish;
            // 제형(텍스처) 배선 — 얼굴 메시 6부위 enum(0=ZERO=현행). TexBundleFromEnum 미러.
            float _ToneTexture;      // TONE 템플릿(1) — grain 축만
            float _SkinTexture;      // TONE 템플릿(1) — grain 축만
            float _HighlightTexture; // GENERIC 템플릿(0)
            float _ContourTexture;   // GENERIC 템플릿(0)
            float _ConcealerTexture; // GENERIC 템플릿(0) — 붉은기 경로. 밴드(눈밑존)와 값 공유.
            float _PowderTexture;    // GENERIC 템플릿(0)
            float _Smoothing;
            float _Brightening;
            float _BlurRadius;

            static const float2 kTaps[12] =
            {
                float2( 1.0,  0.0), float2(-1.0,  0.0),
                float2( 0.0,  1.0), float2( 0.0, -1.0),
                float2( 0.7,  0.7), float2(-0.7,  0.7),
                float2( 0.7, -0.7), float2(-0.7, -0.7),
                float2( 2.0,  0.0), float2(-2.0,  0.0),
                float2( 0.0,  2.0), float2( 0.0, -2.0),
            };

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;   // MatCap 재질용(매 프레임 RecalculateNormals)
                float2 uv : TEXCOORD0;
                float2 uv1 : TEXCOORD1; // x: 효과 페이드 (본 메시 1, 이마 연장 테두리 0)
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float4 grabPos : TEXCOORD1;
                float fade : TEXCOORD2;
                float3 vnormal : TEXCOORD3;  // 뷰공간 법선(MatCap 재질)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = v.uv;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                o.fade = v.uv1.x;
                // 뷰공간 법선 — 카메라 상대 방향(고개 돌리면 회전). MatCap/재질 인덱싱.
                o.vnormal = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                if (o.vnormal.z < 0.0) o.vnormal = -o.vnormal; // 카메라 향하는 반구로(윈딩 무관 안정)
                return o;
            }

            // Edge-preserving blur: taps that differ strongly from the center pixel
            // get little weight, so eyes, brows and face borders stay crisp while
            // skin texture is averaged away.
            fixed3 SmoothSkin(float2 screenUV, fixed3 center)
            {
                float2 texel = _CameraFeed_TexelSize.xy * _BlurRadius;
                float3 sum = center;
                float weightSum = 1.0;

                [unroll]
                for (int i = 0; i < 12; i++)
                {
                    fixed3 s = tex2D(_CameraFeed, screenUV + kTaps[i] * texel).rgb;
                    float diff = dot(abs(s - center), float3(1.0, 1.0, 1.0));
                    float w = exp(-diff * diff * 24.0);
                    sum += s * w;
                    weightSum += w;
                }

                return sum / weightSum;
            }

            // 잡티 지우기용 넓은 이웃 링(8탭, 반경 BR_RADIUS) — 스무딩과 달리 엣지 보존
            // 없는 평탄 평균이라 국소 잡티가 이웃 평균에서 희석돼 이상치로 드러난다.
            static const float2 kBlemishTaps[8] =
            {
                float2( 1.0,  0.0), float2(-1.0,  0.0),
                float2( 0.0,  1.0), float2( 0.0, -1.0),
                float2( 0.7,  0.7), float2(-0.7,  0.7),
                float2( 0.7, -0.7), float2(-0.7, -0.7),
            };

            fixed3 WideSkinAvg(float2 screenUV)
            {
                float2 texel = _CameraFeed_TexelSize.xy * BR_RADIUS;
                float3 sum = 0.0;
                [unroll]
                for (int i = 0; i < 8; i++)
                    sum += tex2D(_CameraFeed, screenUV + kBlemishTaps[i] * texel).rgb;
                return sum / 8.0;
            }

            // 마감(finish)은 Finish.cginc의 ApplyFinish 공용 함수로 이관(립·아이섀도·블러셔
            // 공유). sparkleUV는 얼굴 UV라 시머가 볼에 접착.

            // 루마 보존 색소 + 마감. 카메라 음영을 유지한 채 색을 얹어 평평한 페인트가
            // 아니라 색소층처럼 보이게 한다. mask=커버리지. 제형 스튜디오 세부 5종을 그대로
            // ApplyFinish로 전달(전부 0이면 enum 기존 동작 — 파운데는 세부 0 상수로 호출).
            fixed3 TintFinish(fixed3 baseColor, fixed3 makeupColor, float mask,
                              float2 sparkleUV, float finish, float shimmer,
                              float glossLo, float glossGain, float shimmerSize,
                              float shimmerDensity, float matte, float sheen,
                              float2 screenUV, float3 nrm, float matType, float matStrength,
                              float texEdge, float texGrain, float texCoverage, float texBody)
            {
                float luma = dot(baseColor, fixed3(0.299, 0.587, 0.114));
                fixed3 pigment = makeupColor * PigmentBase(luma, 1.5, 0.15);
                // 제형 body(발색 두께감) — 색소 밀도. 0=무변조(하위호환).
                pigment = TexBody(pigment, luma, texBody);
                pigment = ApplyFinish(pigment, luma, sparkleUV, finish, shimmer,
                                      glossLo, glossGain, shimmerSize, shimmerDensity, matte, sheen,
                                      screenUV, _PearlLightGain); // A15 방향 게인(맨얼굴 피드 루마 그라디언트)
                // 재질 아키타입(벨벳/메탈/홀로) — matType=0 또는 강도=0이면 pigment 그대로.
                pigment = ApplyMaterial(pigment, luma, screenUV, nrm, matType, matStrength);
                pigment = ApplyGrain(pigment, sparkleUV);   // 매트 파우더 입자감(전역 _MatteGrain, 0=무변조)
                pigment = TexGrain(pigment, sparkleUV, texGrain); // 제형 그레인(전역 경로 위 가산적, 0=무변조)
                // 제형 커버리지·엣지 — 발색 마스크 세기·경계 부드럽기. 둘 다 0=마스크 그대로.
                float m = TexCoverage(saturate(mask), texCoverage);
                m = TexEdge(m, texEdge);
                return lerp(baseColor, pigment, saturate(m));
            }

            // 오버레이 슬롯 transform(중심cx,cy·크기·회전rad)으로 얼굴 UV → 레이어 UV.
            // 중심 기준 역회전·역스케일이라 크기1·중심0.5·회전0 = UV 그대로.
            float2 OverlayUV(float2 uv, float4 tr)
            {
                float2 p = uv - tr.xy;
                float s, c;
                sincos(-tr.w, s, c);
                p = float2(c * p.x - s * p.y, s * p.x + c * p.y);
                return p / max(tr.z, 1e-4) + 0.5;
            }

            // 배치 쿼드(0..1) 밖은 0 — Clamp 랩의 가장자리 픽셀이 축소 배치 시
            // 캔버스 전체로 줄무늬처럼 번지는 것을 막는다.
            float OverlayInside(float2 uv)
            {
                float2 inside = step(abs(uv - 0.5), float2(0.5, 0.5));
                return inside.x * inside.y;
            }

            // 캐노니컬 데칼 한 장 합성 — blend 0=그린 색 그대로(over), 1=색소 틴트
            // (루마 보존, TintFinish 기본형), 2=네온 발광(§5 네온 채널 — 루마 무시
            // 가산, 어두운 피드일수록 도드라짐). 경로 A(v1): 큐 3000 유지라 조명 시뮬은
            // 네온을 살짝 그레이드(연출). '조명 완전 독립'은 경로 B(별도 큐 3500) 장기.
            // finish(데코 마감 0새틴/1매트/2듀이)는 ApplyFinish 레거시 enum 경로(세부 0)로
            // 데칼 색에 적용 — 0=새틴=항등이라 기존 오버레이와 바이트 동일(하위호환). 듀이(2)는
            // 레거시 글로시 분기로 젖은 광(젬스톤). 발광(neon)은 이미 가산광이라 마감 제외.
            fixed3 ApplyOverlay(fixed3 col, fixed4 ov, float2 layerUV, float intensity,
                                float blend, float finish, float2 screenUV)
            {
                float cover = ov.a * OverlayInside(layerUV) * intensity * _MakeupOverlayIntensity;
                // blend 2 = 발광: pigment 무시하고 색·게인을 가산(over/틴트 lerp와 분리).
                if (blend > 1.5)
                {
                    return col + ov.rgb * cover;
                }
                float luma = dot(col, fixed3(0.299, 0.587, 0.114));
                fixed3 pigment = ov.rgb * PigmentBase(luma, 1.5, 0.15);
                fixed3 target = lerp(ov.rgb, pigment, saturate(blend));
                // 데칼 색 자체의 루마로 마감 판정(젬이 밝은 곳에 광). finish=0이면 항등.
                float tLuma = dot(target, fixed3(0.299, 0.587, 0.114));
                target = ApplyFinish(target, tLuma, layerUV, finish, 0.0,
                                     0.0, 0.0, 0.0, 0.0, 0.0, 0.0, screenUV, 0.0);
                return lerp(col, target, cover);
            }

            fixed4 frag(v2f i) : SV_Target
            {
                float2 screenUV = i.grabPos.xy / i.grabPos.w;
                fixed3 original = tex2D(_CameraFeed, screenUV).rgb;

                // 모양 축 W3 존 — 피부결/언더톤 적용 존을 기존 캐노니컬 UV 존 어휘(파우더
                // 선례)로 곱 게이트한다. 존 0이면 zone=1 → 강도 무변 → 바이트 동일(하위호환).
                //   skinShape: 1=T존(중앙 세로 스트립) 2=볼 제외(중간 높이 양볼 배제)
                //   toneShape: 1=T존 2=얼굴 중앙(코 주변 방사 집중)
                float faceDx = abs(i.uv.x - 0.5);
                float skinZone = 1.0;
                if (_SkinShape > 1.5)      skinZone = 1.0 - smoothstep(PWD_CHEEK_LO, PWD_CHEEK_HI, faceDx);
                else if (_SkinShape > 0.5) skinZone = 1.0 - smoothstep(PWD_TZONE_LO, PWD_TZONE_HI, faceDx);
                float smoothAmt = _Smoothing * skinZone;
                float toneZone = 1.0;
                if (_ToneShape > 1.5)      toneZone = 1.0 - smoothstep(FACE_CENTER_LO, FACE_CENTER_HI, length(i.uv - 0.5));
                else if (_ToneShape > 0.5) toneZone = 1.0 - smoothstep(PWD_TZONE_LO, PWD_TZONE_HI, faceDx);
                float toneAmt = _Brightening * toneZone;

                fixed3 smoothed = SmoothSkin(screenUV, original);
                fixed3 col = lerp(original, smoothed, smoothAmt);

                // 제형(피부결) — TONE 템플릿 grain(매끈/파우더리). 결 보정(smoothAmt)만큼
                // 스무딩된 피부에 파우더 입자를 얹는다. skinTexture=0(매끈)=grain 0 → 바이트
                // 동일(하위호환). 피부는 마스크·색소 프리미티브가 없어 grain 축만 배선.
                float skinTexEdge, skinTexGrain, skinTexCoverage, skinTexBody;
                TexBundleFromEnum(1.0, _SkinTexture, skinTexEdge, skinTexGrain, skinTexCoverage, skinTexBody);
                col = TexGrain(col, i.uv, skinTexGrain * saturate(smoothAmt));

                // 잡티 지우기(밀어내기) — outlier 억제. 넓은 이웃(BR_RADIUS) 평균 대비 국소적으로
                // 어둡거나(루마) 붉은(chroma) 픽셀만, 그 정도에 비례해 이웃 색으로 되민다(색을
                // 얹지 않고 결을 보존한 채 국소 이상치만 복원). 방향은 한쪽 — 밝은 이상치(하이라이트)는
                // 이상도 음수라 무발동. 특징부 보호: 이상도 밴드패스 상한(BR_HI)으로 극단 이상치
                // (눈·눈썹·콧구멍·헤어라인 = 매우 어두움/붉음)를 제외. 델타 가산이라 스무딩·톤 보정을
                // 보존하고, 정상 피부(이웃≈중심 → 델타 0)는 무변조 → 결 유지. 강도 0 = 바이트 동일.
                if (_BlemishRemoval > 0.001)
                {
                    fixed3 wide = WideSkinAvg(screenUV);
                    float lumaDef = dot(wide, fixed3(0.299, 0.587, 0.114))
                                  - dot(original, fixed3(0.299, 0.587, 0.114)); // >0 = 중심이 더 어두움
                    float redEx = (original.r - max(original.g, original.b))
                                - (wide.r - max(wide.g, wide.b));               // >0 = 중심이 더 붉음
                    float outlier = max(lumaDef * BR_LUMA_W, redEx * BR_RED_W);
                    float pull = smoothstep(BR_LO, BR_LO + BR_FEATHER, outlier)
                               * (1.0 - smoothstep(BR_HI, BR_HI + BR_FEATHER, outlier)); // 밴드패스: 특징부 보호
                    col = saturate(col + (wide - original) * (pull * _BlemishRemoval));
                }

                col = saturate(col * (1.0 + 0.18 * toneAmt) + 0.04 * toneAmt);

                // 톤 조정 베이스 — 톤업 강도에 비례한 보정색 캐스트(색만 밀고 밝기는
                // 브라이트닝 담당). 흰색(무색)이거나 강도 0이면 lerp identity = 기존 픽셀.
                col = saturate(lerp(col, col * _ToneBaseColor.rgb, toneAmt));

                // 제형(언더톤) — TONE 템플릿 grain(매끈/파우더리). 톤 보정(toneAmt)만큼.
                // toneTexture=0(매끈)=grain 0 → 바이트 동일. 언더톤도 전면 캐스트라 grain 축만.
                float toneTexEdge, toneTexGrain, toneTexCoverage, toneTexBody;
                TexBundleFromEnum(1.0, _ToneTexture, toneTexEdge, toneTexGrain, toneTexCoverage, toneTexBody);
                col = TexGrain(col, i.uv, toneTexGrain * saturate(toneAmt));

                // 프라이머 윤광 — 기존 luma 스펙 추출 재사용, 하이라이트만 증폭(0=무효과).
                float glowSpec = smoothstep(GLOW_SPEC_LO, 1.0, dot(col, fixed3(0.299, 0.587, 0.114)));
                col = saturate(col + _SkinGlow * glowSpec * GLOW_GAIN);

                // 파운데이션 — 루마 보존 커버(피부색→파운데색 보간, 원본 명암 유지) +
                // 커버리지 비례 chroma 평탄화(잡티 감쇠). 마감은 ApplyFinish 사다리
                // (매트=스펙 억제·듀이=소폭 증폭). 커버리지 0이면 desat·lerp 모두 identity.
                if (_FoundationIntensity > 0.001)
                {
                    float fLuma = dot(col, fixed3(0.299, 0.587, 0.114));
                    // 제형 텍스처(①) — 0=리퀴드(현행 상수) 1=쿠션(게인·chroma·커버↑) 2=스킨틴트(↓).
                    // 분기 없이 텍스처값으로 상수를 select(lerp)해 배수를 민다. 텍스처 0이면 배수
                    // 전부 1 → 곱셈 항등 → 기존 픽셀과 바이트 동일(하위호환).
                    float fTexCushion = saturate(1.0 - abs(_FoundationTexture - 1.0)); // 1 at cushion
                    float fTexSkintint = saturate(_FoundationTexture - 1.0);           // 1 at skintint
                    float fGain = FND_LUMA_GAIN * (1.0 + fTexCushion * FND_TEX_CUSHION_GAIN - fTexSkintint * FND_TEX_SKINTINT_GAIN);
                    float fChroma = FND_CHROMA * (1.0 + fTexCushion * FND_TEX_CUSHION_CHROMA - fTexSkintint * FND_TEX_SKINTINT_CHROMA);
                    float fCov = _FoundationIntensity * (1.0 + fTexCushion * FND_TEX_CUSHION_COV - fTexSkintint * FND_TEX_SKINTINT_COV);
                    // 모양 축 W3 — 파운데 커버 존(얼굴 메시 한정, 목 세그 확장과 무관).
                    //   1=T존 집중(중앙 세로 스트립 강조) 2=외곽 페더 강화(방사 외곽 감쇠).
                    // 커버(fCov)·chroma 평탄화(fChroma)를 존만큼 곱 → 존 0이면 fZone=1=바이트 동일.
                    float fZone = 1.0;
                    if (_FoundationShape > 1.5)      fZone = 1.0 - smoothstep(FND_FEATHER_LO, FND_FEATHER_HI, length(i.uv - 0.5));
                    else if (_FoundationShape > 0.5) fZone = 1.0 - smoothstep(PWD_TZONE_LO, PWD_TZONE_HI, faceDx);
                    fCov *= fZone;
                    fChroma *= fZone;
                    // 경계 페더 — 오벌 외곽으로 갈수록 커버리지 감쇠(경계선 제거). 커버(fCov)에만
                    // 곱하면 FoundationBlend의 blendAmount가 색·chroma 평탄화를 함께 옅게 한다.
                    // 파운데 0(위 if로 게이트)이면 미실행이라 하위호환.
                    float2 fndRimN = (i.uv - float2(FND_EDGE_CX, FND_EDGE_CY))
                                   / float2(FND_EDGE_AX, FND_EDGE_AY);
                    float fndRim = 1.0 - smoothstep(FND_EDGE_LO, FND_EDGE_HI, length(fndRimN));
                    fCov *= fndRim;
                    // 특징부 제외 — 눈알 개구부·입술·콧구멍은 파운데를 얹지 않는다(캐노니컬 UV
                    // 타원, 실측 상수). 각 타원의 정규화 거리 d(경계=1)를 페더 스텝으로 안쪽=1,
                    // 밖=0 만들어 합집합(max)한 뒤 fCov·fChroma를 감쇠. 눈·코는 u 폴딩으로 좌우 공용.
                    float uFold = 0.5 - abs(i.uv.x - 0.5); // 좌우 미러 → 우측 기준 타원 재사용
                    float dLip = length((i.uv - float2(FEAT_LIP_CX, FEAT_LIP_CY)) / float2(FEAT_LIP_RX, FEAT_LIP_RY));
                    float dEye = length((float2(uFold, i.uv.y) - float2(FEAT_EYE_CX, FEAT_EYE_CY)) / float2(FEAT_EYE_RX, FEAT_EYE_RY));
                    float dNos = length((float2(uFold, i.uv.y) - float2(FEAT_NOS_CX, FEAT_NOS_CY)) / float2(FEAT_NOS_RX, FEAT_NOS_RY));
                    float feat = 1.0 - smoothstep(1.0 - FEAT_FEATHER, 1.0 + FEAT_FEATHER, min(min(dLip, dEye), dNos));
                    float featKeep = 1.0 - FND_FEATURE_EXCLUDE * feat; // 특징부에서 커버 감쇠
                    fCov *= featKeep;
                    fChroma *= featKeep;
                    fixed3 found = _FoundationColor.rgb * (fLuma * fGain + FND_LUMA_LIFT);
                    // 파운데는 제형 스튜디오 대상 아님 — 세부 0 상수로 호출(enum 기존 경로).
                    found = ApplyFinish(found, fLuma, i.uv, _FoundationFinish, 0.0,
                                        0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                                        screenUV, _PearlLightGain); // A15 방향 게인
                    fixed3 desat = lerp(col, fLuma.xxx, fChroma * fCov);
                    col = lerp(desat, saturate(found), saturate(fCov));
                }

                // 립은 LipRenderer(윤곽 링 메시)로 분리됨. 얼굴 메시엔 블러셔 + 넓은면 보정.
                // 블러셔 — 마감 적용(시머 블러셔 등). 시머 스파클은 얼굴 UV라 볼에 접착.
                // 배치 핸들(R4): 샘플 UV를 반대로 밀면 마스크가 +방향으로 보인다.
                // Lift=위/아래, Spread=바깥/안쪽(좌우 볼을 미러로 같이). 경계는 마스크가
                // 검정이라 Clamp 스미어 없음.
                float2 buv = i.uv;
                buv.y -= _BlushLift;
                // 코걸침(이가리) 마스크가 정중앙에서 찢어지지 않게, 센터 근처는
                // spread를 0으로 수렴시킨다(좌우 미러 시프트의 불연속 제거).
                float spreadW = smoothstep(0.04, 0.22, abs(i.uv.x - 0.5));
                buv.x += (i.uv.x < 0.5 ? _BlushSpread : -_BlushSpread) * spreadW;
                // 질감 맵(#22) — 얼굴 메시 uv로 광 게인·시머 밀도를 픽셀별 변조(볼 접착).
                // 맵 없으면(_HasFinishMap=0) 계수 1.0 → 스칼라 그대로(하위호환).
                fixed4 blushFinishMap = tex2D(_BlushFinishMap, i.uv);
                float blushGlossGain = _BlushGlossGain;
                float blushShimmerDensity = _BlushShimmerDensity;
                ModulateFinishByMap(blushFinishMap, _BlushHasFinishMap, blushGlossGain, blushShimmerDensity);
                // 제형(텍스처) W1 — GENERIC 템플릿(0) enum → 시드 번들. 0=크림=ZERO(무변조).
                float blushTexEdge, blushTexGrain, blushTexCoverage, blushTexBody;
                TexBundleFromEnum(0.0, _BlushTexture,
                                  blushTexEdge, blushTexGrain, blushTexCoverage, blushTexBody);
                col = TintFinish(col, _BlushColor.rgb, tex2D(_BlushMask, buv).r * _BlushIntensity,
                                 i.uv, _BlushFinish, _BlushShimmer,
                                 _BlushGlossLo, blushGlossGain, _BlushShimmerSize,
                                 blushShimmerDensity, _BlushMatte, _BlushSheen, screenUV,
                                 i.vnormal, _BlushMaterial, _BlushMaterialStrength,
                                 blushTexEdge, blushTexGrain, blushTexCoverage, blushTexBody);
                // 입자 레이어(7축) — 볼 마스크 영역에 반짝 알갱이. 색·강도와 독립(색막 위 오버레이).
                // density=0이면 무변조. 배치는 블러셔 마스크(buv)로 게이트.
                float blushParticleLuma = dot(original, fixed3(0.299, 0.587, 0.114));
                col = ApplyParticles(col, blushParticleLuma, i.uv, screenUV,
                                     _BlushParticleSize, _BlushParticleDensity, _BlushParticleBrightness,
                                     _BlushParticleColor.rgb, _BlushParticleTwinkle, _BlushParticleShape,
                                     _BlushParticleFeather, _BlushParticleParallax, _BlushParticleConfetti,
                                     tex2D(_BlushMask, buv).r);

                // 넓은 면 보정 — 컨투어=감산(곱, 그림자), 하이라이터·컨실러=가산(스크린, 광채).
                // 부위 핏 아핀(배치 A ②) — 컨투어·하이라이터 마스크 UV를 블러셔와 동일 워프로
                // 민다(Lift +=위, Spread +=바깥·좌우 미러). spreadW(센터 감쇠)는 위 블러셔에서
                // 재사용 — 콧대·콧벽 중앙 크로싱의 미러 시프트 불연속을 막는다. 0이면 UV 그대로.
                float2 cuv = i.uv;
                cuv.y -= _ContourLift;
                cuv.x += (i.uv.x < 0.5 ? _ContourSpread : -_ContourSpread) * spreadW;
                float2 huv = i.uv;
                huv.y -= _HighlightLift;
                huv.x += (i.uv.x < 0.5 ? _HighlightSpread : -_HighlightSpread) * spreadW;
                // 마감 — 블렌드 결과색에 ApplyFinish(레거시 enum 경로: 세부 0 상수).
                // 0=새틴이면 결과색 무변형이라 기존 출력과 바이트 동일(하위호환).
                // 시머 스파클 UV는 얼굴 UV(i.uv)라 존에 접착(블러셔와 동일 규약).
                float wideLuma = dot(col, fixed3(0.299, 0.587, 0.114));
                // 제형(컨투어) — GENERIC 템플릿. body/grain=타겟색, coverage/edge=마스크 amt.
                // enum 0(크림)=번들 ZERO → 네 헬퍼 조기 반환 = 바이트 동일(하위호환).
                float coTexEdge, coTexGrain, coTexCoverage, coTexBody;
                TexBundleFromEnum(0.0, _ContourTexture, coTexEdge, coTexGrain, coTexCoverage, coTexBody);
                float shAmt = tex2D(_ContourMask, cuv).r * _ContourIntensity;
                shAmt = TexEdge(TexCoverage(saturate(shAmt), coTexCoverage), coTexEdge);
                fixed3 shTarget = col * _ContourColor.rgb;
                shTarget = TexBody(shTarget, wideLuma, coTexBody);
                shTarget = ApplyFinish(shTarget, wideLuma, i.uv, _ContourFinish, _ContourShimmer,
                                       _ContourGlossLo, _ContourGlossGain, _ContourShimmerSize,
                                       _ContourShimmerDensity, _ContourMatte, _ContourSheen,
                                       screenUV, _PearlLightGain);
                shTarget = TexGrain(shTarget, i.uv, coTexGrain);
                col = lerp(col, shTarget, shAmt);
                // 제형(하이라이터) — GENERIC 템플릿. 컨투어와 동형(스크린 타겟에 body/grain·mask cov/edge).
                float hiTexEdge, hiTexGrain, hiTexCoverage, hiTexBody;
                TexBundleFromEnum(0.0, _HighlightTexture, hiTexEdge, hiTexGrain, hiTexCoverage, hiTexBody);
                float hlAmt = tex2D(_HighlightMask, huv).r * _HighlightIntensity;
                hlAmt = TexEdge(TexCoverage(saturate(hlAmt), hiTexCoverage), hiTexEdge);
                fixed3 hlTarget = 1.0 - (1.0 - col) * (1.0 - _HighlightColor.rgb);
                hlTarget = TexBody(hlTarget, wideLuma, hiTexBody);
                hlTarget = ApplyFinish(hlTarget, wideLuma, i.uv, _HighlightFinish, _HighlightShimmer,
                                       _HighlightGlossLo, _HighlightGlossGain, _HighlightShimmerSize,
                                       _HighlightShimmerDensity, _HighlightMatte, _HighlightSheen,
                                       screenUV, _PearlLightGain);
                hlTarget = TexGrain(hlTarget, i.uv, hiTexGrain);
                col = lerp(col, hlTarget, hlAmt);
                // 부분 커버 모양(#19b) — 1=붉은기 자동(원본 피드에서 붉은 픽셀만 선택
                // 커버, 치아 미백 redness 게이트의 역방향). 0=눈밑 존은 하안검 밴드
                // (LowerLidRenderer)로 이관(§08) — 여기선 셀렉터를 0으로 게이트해 밴드가
                // 전담(중복 브라이튼 방지). intensity=0이면 어느 shape든 무효(하위호환).
                float ccRedness = original.r - max(original.g, original.b);
                float ccRedSel = smoothstep(CC_RED_LO, CC_RED_HI, ccRedness);
                float ccMask = ccRedSel * step(0.5, _ConcealerShape);
                // 제형(컨실러 붉은기 경로) — GENERIC 템플릿. 하안검 밴드(눈밑존)와 같은
                // concealerTexture 값을 공유(부위 1개, 셰이더 2곳). enum 0=ZERO=바이트 동일.
                float ccTexEdge, ccTexGrain, ccTexCoverage, ccTexBody;
                TexBundleFromEnum(0.0, _ConcealerTexture, ccTexEdge, ccTexGrain, ccTexCoverage, ccTexBody);
                float ccAmt = ccMask * _ConcealerIntensity;
                ccAmt = TexEdge(TexCoverage(saturate(ccAmt), ccTexCoverage), ccTexEdge);
                // 컨실러 마감 — 스크린(가산) 결과색에만 ApplyFinish(0=새틴=무변형, 하위호환).
                // 파운데이션 항은 위 블록에서 이미 독립 처리 — ccTarget만 변조(부위 격리).
                fixed3 ccTarget = 1.0 - (1.0 - col) * (1.0 - _ConcealerColor.rgb);
                ccTarget = TexBody(ccTarget, wideLuma, ccTexBody);
                ccTarget = ApplyFinish(ccTarget, wideLuma, i.uv, _ConcealerFinish, 0.0,
                                       0.0, 0.0, 0.0, 0.0, 0.0, 0.0, screenUV, _PearlLightGain);
                ccTarget = TexGrain(ccTarget, i.uv, ccTexGrain);
                col = lerp(col, ccTarget, ccAmt);

                // 파우더(세팅) — 상위 luma(유분광) smoothstep 감쇠 + 미세 chroma 평탄화.
                // 색 메이크업(블러셔·컨실) 뒤 세팅 단계. 파운데와 독립, 0이면 기존 픽셀.
                if (_PowderIntensity > 0.001)
                {
                    // 존(#19b) — 0=전체, 1=T존(중앙 세로 스트립=이마·콧등), 2=볼 제외
                    // (중간 높이 양볼 배제). 캐노니컬 얼굴 UV x 중심 0.5 기준.
                    float dx = abs(i.uv.x - 0.5);
                    float pZone = 1.0;
                    if (_PowderShape > 1.5)      // 볼 제외
                        pZone = 1.0 - smoothstep(PWD_CHEEK_LO, PWD_CHEEK_HI, dx);
                    else if (_PowderShape > 0.5) // T존
                        pZone = 1.0 - smoothstep(PWD_TZONE_LO, PWD_TZONE_HI, dx);
                    // 제형(파우더) — GENERIC 템플릿. 매트화 프리미티브(색소·body 없음)라
                    // coverage/edge=존 amt, grain=세팅 후 col에만 배선(body 축 제외). enum
                    // 0(크림)=ZERO → 조기 반환 = 바이트 동일(하위호환).
                    float pwTexEdge, pwTexGrain, pwTexCoverage, pwTexBody;
                    TexBundleFromEnum(0.0, _PowderTexture, pwTexEdge, pwTexGrain, pwTexCoverage, pwTexBody);
                    float pAmt = _PowderIntensity * pZone;
                    pAmt = TexEdge(TexCoverage(saturate(pAmt), pwTexCoverage), pwTexEdge);

                    float pLuma = dot(col, fixed3(0.299, 0.587, 0.114));
                    float shine = smoothstep(POWDER_SHINE_LO, 1.0, pLuma);
                    col = col * (1.0 - POWDER_SPEC_SUPPRESS * shine * pAmt);
                    float pLuma2 = dot(col, fixed3(0.299, 0.587, 0.114));
                    col = lerp(col, pLuma2.xxx, POWDER_CHROMA * pAmt);
                    // 컬러 파우더 — 흰색=무색(기존 출력, 곱=identity). 톤베이스와 동일
                    // 곱 캐스트라 옅은 틴트만 얹힌다(핑크 톤업·라벤더 등).
                    col = lerp(col, col * _PowderColor.rgb, pAmt);
                    // 펄 파우더 — 마감(ApplyFinish, 레거시 enum 경로). 0=새틴=무변형.
                    // 시머 스파클 UV는 얼굴 UV(존 접착).
                    col = lerp(col,
                               ApplyFinish(col, pLuma2, i.uv, _PowderFinish, _PowderShimmer,
                                           0, 0, 0, 0, 0, 0, screenUV, _PearlLightGain),
                               pAmt);
                    // 제형 그레인 — 파우더 존 세기(pAmt)만큼 파우더 입자. grain 0=무변조.
                    col = TexGrain(col, i.uv, pwTexGrain * pAmt);
                }

                // 애교살은 LowerLid.shader(하안검 밴드, Transparent+10)로 이관.

                // 사용자 임포트 메이크업 룩 — 캐노니컬 데칼 N장을 순서대로 합성(뒤=위).
                // R1 자유배치·R8 순서·R9 여러 그림의 게이트(설계 섹션 07 블로커).
                float2 uv0 = OverlayUV(i.uv, _Overlay0Transform);
                col = ApplyOverlay(col, tex2D(_MakeupOverlay, uv0) * _Overlay0Color, uv0, _Overlay0Intensity, _Overlay0Blend, _Overlay0Finish, screenUV);
                float2 uv1 = OverlayUV(i.uv, _Overlay1Transform);
                col = ApplyOverlay(col, tex2D(_Overlay1, uv1) * _Overlay1Color, uv1, _Overlay1Intensity, _Overlay1Blend, _Overlay1Finish, screenUV);
                float2 uv2 = OverlayUV(i.uv, _Overlay2Transform);
                col = ApplyOverlay(col, tex2D(_Overlay2, uv2) * _Overlay2Color, uv2, _Overlay2Intensity, _Overlay2Blend, _Overlay2Finish, screenUV);
                float2 uv3 = OverlayUV(i.uv, _Overlay3Transform);
                col = ApplyOverlay(col, tex2D(_Overlay3, uv3) * _Overlay3Color, uv3, _Overlay3Intensity, _Overlay3Blend, _Overlay3Finish, screenUV);

                // 이마 연장 밴드 끝에서 효과를 원본으로 되돌린다 (경계선 방지)
                col = lerp(original, col, saturate(i.fade));

                // §11 오클루전 — 손·머리카락이 앞이면 원본 피드로 복귀(불투명 캔버스라 알파 대신 lerp).
                col = lerp(original, col, OccludeGate(i.grabPos));

                return fixed4(col, 1.0);
            }
            ENDCG
        }
    }

    FallBack Off
}
