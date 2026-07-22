using System;

namespace ARMakeup.Bridge
{
    [Serializable]
    public class ExpertOverrideEntry
    {
        public string key;
        public float value;
    }

    [Serializable]
    public class RegionAffine
    {
        public string region;
        public float dx;
        public float dy;
        public float sx;
        public float sy;
        public float rot;
    }

    [Serializable]
    public class RegionWarp
    {
        public string region;
        public float[] warp;
    }

    /// <summary>
    /// Filter parameters shared between RN and Unity.
    /// Colors are "#RRGGBB" hex strings. Most intensities are 0..1;
    /// EyeshadowLayerParams.intensity alone supports 0..1.5.
    /// Keep this JsonUtility-compatible: public fields, no dictionaries.
    /// </summary>
    [Serializable]
    public class FilterParams
    {
        // 블러셔 레거시/확장 계약. JsonUtility 필드가 아니므로 payload에는 포함되지 않는다.
        public const int MinBlushShape = 0;
        public const int MaxBlushShape = 7;
        public const float MaxBlushIntensity = 1.2f;

        public float skinSmoothing = 0.5f;
        public float matteGrain = 0f;            // 매트 파우더 입자감(전역, 전 부위 마감 공유. 0=끔)
        public float skinBrightening = 0.2f;
        public string lipColor = "#C94F6D";
        public float lipIntensity = 0.5f;
        public string lipLinerColor = "#A83A50";  // 립라이너(외곽 얇은 링, 매트) 색
        public float lipLinerIntensity = 0f;      // 0 = 끔 (립 색과 독립)
        public int lipLinerFinish = 1;           // 립라이너 마감: 0=새틴 1=매트(기본, 연필 질감) 2=글로시. 기본 1=현행 렌더 유지(생략 하위호환)
        public int lipFinish = 0;                // 립 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public float lipShimmer = 0.5f;          // 시머 게인 0..1 (lipFinish=3일 때만 사용)
        public int lipMaterial = 0;              // 재질: 0=없음(기본) 1=벨벳 2=메탈 3=홀로그램
        public float lipMaterialStrength = 0.85f; // 재질 블렌드 강도 0..1 (lipMaterial>0일 때)
        // 입자 레이어(글리터) 9축 — density 0=끔.
        public float lipParticleSize = 0.4f;
        public float lipParticleDensity = 0f;
        public float lipParticleBrightness = 0.7f;
        public string lipParticleColor = "#FFF2D9";
        public float lipParticleTwinkle = 1f;
        public float lipParticleShape = 0f;
        public float lipParticleFeather = 0f;
        public float lipParticleParallax = 0f;
        public float lipParticleConfetti = 0f;
        // 제형 텍스처(배치 A ①) — 립 엣지 하드니스/커버로 제형감. 0=바이트 동일(하위호환).
        public int lipTexture = 0;               // 0=크림 립스틱 1=벨벳 2=워터 3=새틴 립스틱(legacy) 4=오일
        public float lipOverline = 0f;           // 오버립(R7 워프): 외곽 확장 0..1 (0=원래)
        public float lipStyleIntensity = 0f;    // 임포트 립 그림(데칼) 강도
        public float lipStyleSparkle = 0f;      // 립 데칼 글리터 명멸 0..1 (0=끔)
        public string blushColor = "#F08FA0";
        public float blushIntensity = 0.35f;       // 0..1.2 (1.0 이상은 고발색 최대 대역)
        public int blushFinish = 0;              // 블러셔 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public float blushShimmer = 0.5f;        // 시머 게인 0..1 (blushFinish=3일 때)
        public int blushMaterial = 0;            // 재질: 0=없음(기본) 1=벨벳 2=메탈 3=홀로그램
        public float blushMaterialStrength = 0.85f; // 재질 블렌드 강도 0..1 (blushMaterial>0일 때)
        // 입자 레이어(7축) — 볼 반짝 알갱이. density=0=끔.
        public float blushParticleSize = 0f;         // 크기: 고운↔굵은
        public float blushParticleDensity = 0f;      // 밀도: 0=끔 ↔ 촘촘
        public float blushParticleBrightness = 0.7f; // 밝기
        public string blushParticleColor = "#FFF2D9";// 알갱이 색
        public float blushParticleTwinkle = 1f;      // 명멸: 0=정적 ↔ 1=움직임 번쩍
        public float blushParticleShape = 0f;        // 모양: 0=원 ↔ 1=별
        public float blushParticleFeather = 0f;      // 윤곽 부드러움: 0=또렷 글리터 ↔ 1=부드러운 펄
        public float blushParticleParallax = 0f;     // 시차: 글로스 속 부유감
        public float blushParticleConfetti = 0f;     // 컨페티: 0=단색 ↔ 1=조각마다 다른 색
        public float blushStyleIntensity = 0f;  // 임포트 볼 그림(데칼) 강도
        public float blushStyleSparkle = 0f;    // 볼 데칼 글리터 명멸 0..1 (0=끔)
        // 넓은 면 보정 (얼굴 셰이더, 가·감산 블렌드)
        public string highlightColor = "#FFF2DB";   // 하이라이터(가산/광채)
        public float highlightIntensity = 0f;
        // AURA 존별 입력 — MakeupController가 최댓값을 정본 단일 강도로 승격한다.
        public float highlightCheekIntensity = 0f;
        public float highlightNoseBridgeIntensity = 0f;
        public float highlightNoseTipIntensity = 0f;
        public float highlightBrowBoneIntensity = 0f;
        public float highlightCupidIntensity = 0f;
        public int highlightFinish = 0;             // 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public float highlightShimmer = 0.5f;       // 시머 게인 0..1 (highlightFinish=3일 때)
        // 제형 스튜디오(#21) — 하이라이터 마감 세부. 전부 0 = enum 기존 동작(하위호환).
        public float highlightGlossLo = 0f;
        public float highlightGlossGain = 0f;
        public float highlightShimmerSize = 0f;
        public float highlightShimmerDensity = 0f;
        public float highlightMatte = 0f;
        public float highlightSheen = 0f;
        // 6-zone atlas weights. has=0 keeps controller defaults/legacy behavior.
        public int highlightHasZoneWeights = 0;
        public float highlightZoneCheek = 0f;
        public float highlightZoneBridge = 0f;
        public float highlightZoneTip = 0f;
        public float highlightZoneBrow = 0f;
        public float highlightZoneCupid = 0f;
        public float highlightZoneChin = 0f;
        public string contourColor = "#9E806B";     // 컨투어/섀딩(감산/그림자)
        public float contourIntensity = 0f;
        public int contourFinish = 0;               // 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public float contourShimmer = 0.5f;         // 시머 게인 0..1 (contourFinish=3일 때)
        public float contourGlossLo = 0f;
        public float contourGlossGain = 0f;
        public float contourShimmerSize = 0f;
        public float contourShimmerDensity = 0f;
        public float contourMatte = 0f;
        public float contourSheen = 0f;
        // ── 마스크 부위 핏 아핀(배치 A ②) — 하이라이터·컨투어 존 UV 오프셋. Lift +=위,
        // Spread +=바깥(좌우 미러). 블러셔 배치(blushLift/blushSpread) 일반화. 0=원래(하위호환).
        public float highlightLift = 0f;
        public float highlightSpread = 0f;
        public float contourLift = 0f;
        public float contourSpread = 0f;
        // ── A14 마스크 재베이크(배치 A ③) — 가장자리 softness 상대 배수(Ellipse hand-tuned
        // softness에 곱 적용). 0=각 부위의 기본 버킷. 블러셔는 0..7 shape별 절차 마스크 버킷.
        public float blushEdgeSoftness = 0f;
        public float highlightEdgeSoftness = 0f;
        public float contourEdgeSoftness = 0f;
        public string concealerColor = "#FADCC2";   // 컨실러(눈밑 밝힘)
        public float concealerIntensity = 0f;
        public int concealerFinish = 0;              // 컨실러 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머 (두 경로 공통)
        public float blemishRemoval = 0f;            // 잡티 지우기(밀어내기) 0..1 — 넓은 이웃 대비 국소 이상치만 되밈 (0=현행 픽셀 동일)
        // ── 베이스 팩(#18) — 전부 0/""=기존 픽셀 동일 ──
        public string foundationColor = "#E8C4A8";  // 파운데이션 색(밝은 쿨~딥 웜)
        public float foundationIntensity = 0f;      // 커버리지(0=끔)
        public int foundationFinish = 0;            // 0=새틴(기본) 1=매트 2=듀이
        // 제형 텍스처(배치 A ①) — 전용 커버 램프. 0=리퀴드(레거시와 동일),
        // 1=쿠션 2=스틱 3=트윈케익 4=스킨틴트.
        public int foundationTexture = 0;
        // 제형(텍스처) 공통 축(W1) — RN TEXTURE_TEMPLATE_INDEX/TEXTURE_ENUM_SEED 수동 미러.
        // -1은 JsonUtility 필드 부재 sentinel=레거시 무변조, 명시 0부터 각 부위 첫 제품 시드다.
        public int toneTexture = -1;
        public int skinTexture = -1;
        public int concealerTexture = -1;
        public int powderTexture = -1;
        public int blushTexture = -1;
        public int highlightTexture = -1;
        public int contourTexture = -1;
        public int eyeshadowTexture = -1;
        public int eyeshadowLowerTexture = -1;
        public int aegyoTexture = -1;
        public int triangleZoneTexture = -1;
        public int browConcealTexture = -1;
        public int browTexture = -1;
        public int browPencilTexture = -1;
        public int browLightenerTexture = -1;
        public int browStyleTexture = -1; // 도메인 축 폐지; 구 payload는 셰이더에서 무변조 처리
        public int lipBaseTexture = -1;
        public int lipLinerTexture = -1;
        public int lipGlossTexture = -1;
        // ── 임시 디버그(파운데 색 튜닝) — Foundation.cginc 전역 유니폼 조절. 확정값을 리터럴로
        //    굽고 나면 이 3필드(및 셰이더 유니폼·RN 슬라이더)를 걷어낸다. 초기값=옛 #define 상수라
        //    RN이 안 건드리면 현재 픽셀과 동일. refLuma/gain은 0이 비정상값이라 리터럴 폴백,
        //    chroma는 0도 유효값이라 셰이더는 음수 sentinel로 미설정 판정(앱은 항상 유효값 push).
        public float fndRefLumaDbg = 0.798322f;     // 기준 루마 분모(밝기). 낮을수록 밝음
        public float fndLumaGainDbg = 1f;           // shade 게인(밝기 여유)
        public float fndChromaDbg = 0.4f;           // 회색 혼합량(탁함). 낮을수록 선명
        // ── 임시 디버그(이음새 세그 게이트 튜닝 — 값 확정 후 제거) — CameraFeed 전역 유니폼 조절.
        //    파운데 seg 게이트 임계 4종(전이 2 + 얼굴 오벌 크기·페더) + 시각화 토글. 임계는
        //    sentinel -1(미설정=셰이더 리터럴 폴백, 전이 LO는 0도 유효값이라 음수 sentinel;
        //    타원 크기·페더도 양수라 같은 가드로 안전). RN이 안 건드리면 리터럴과 동일 → 현행
        //    픽셀 동일. 07-17 코어 제외(seg.r 램프)를 랜드마크 타원 게이트로 교체. ──
        public float segSeamDbg = 0f;        // 세그 시각화 토글 (0=off)
        public float fndSegLoDbg = -1f;      // 이음새 전이대 하한 (미설정 -1 = 리터럴 폴백)
        public float fndSegHiDbg = -1f;      // 이음새 전이대 상한
        public float fndOvalSizeDbg = -1f;   // 얼굴 오벌 반경 배수 (미설정 -1 = 리터럴 폴백)
        public float fndOvalFeatherDbg = -1f; // 얼굴 오벌 경계 페더
        public ExpertOverrideEntry[] expertOverrides; // sparse KV; null/empty = 23개 baseline
        public RegionAffine[] regionAffines; // sparse 부위 델타; null/empty/미전송 부위는 현재값 유지
        public RegionWarp[] regionWarps; // eyeshadow/blush W5 sparse 8점; 미전송 부위는 현재값 유지
        public float powderIntensity = 0f;          // 파우더(유분광 억제, 세팅) — 파운데와 독립
        public string powderColor = "";             // 컬러 파우더 캐스트 ""=무색(트랜스루선트, 기존 출력)
        public int powderFinish = 0;                // 파우더 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머(펄)
        public float powderShimmer = 0.5f;          // 시머 게인 0..1 (powderFinish=3일 때)
        public string toneBaseColor = "";           // 톤 보정색 ""=무색(identity), 농도=skinBrightening 공유
        public float skinGlow = 0f;                 // 프라이머 윤광(스펙 증폭)
        public float aegyoIntensity = 0f;            // 애교살(하안검 밴드): 하이라이트+섀도 2줄 한 강도 (0=끔)
        public float aegyoStyleIntensity = 0f;       // 임포트 애교살 그림(하안검 밴드 데칼) 강도 (0=끔)
        public string aegyoColor = "";               // 애교살 틴트: 하이라이트=이 색, 섀도=파생 톤다운. ""=기본색 유지(룩 전환 누수 방지)
        public int aegyoFinish = 0;                  // 애교살 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머(펄)
        public float aegyoShimmer = 0.5f;            // 시머 게인 0..1 (aegyoFinish=3일 때)
        public string eyeshadowColor = "#B06A4E";
        public float eyeshadowIntensity = 0.3f;
        public int eyeshadowFinish = 0;            // 아이섀도 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public float eyeshadowShimmer = 0.5f;      // 시머 게인 0..1 (eyeshadowFinish=3일 때)
        public int eyeshadowMaterial = 0;          // 재질: 0=없음(기본) 1=벨벳 2=메탈 3=홀로그램
        public float eyeshadowMaterialStrength = 0.85f; // 재질 블렌드 강도 0..1 (eyeshadowMaterial>0일 때)
        // 입자 레이어(글리터) 9축 — density 0=끔.
        public float eyeshadowParticleSize = 0.4f;
        public float eyeshadowParticleDensity = 0f;
        public float eyeshadowParticleBrightness = 0.7f;
        public string eyeshadowParticleColor = "#FFF2D9";
        public float eyeshadowParticleTwinkle = 1f;
        public float eyeshadowParticleShape = 0f;
        public float eyeshadowParticleFeather = 0f;
        public float eyeshadowParticleParallax = 0f;
        public float eyeshadowParticleConfetti = 0f;
        // A3 아이섀도 하 — 하안검 lash 아래로 페이드하는 섀도 밴드(LowerLid 밴드 확장). 애교살보다 아래 깔림. 0=끔.
        public string eyeshadowLowerColor = "";
        public float eyeshadowLowerIntensity;
        public int eyeshadowLowerFinish = 0;       // 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public float eyeshadowLowerShimmer = 0.5f; // 시머 게인 0..1 (finish=3일 때)
        public string irisColor = "#5B7B8C";      // 컬러렌즈 색 (intensity 0 = 끔)
        public float irisIntensity = 0f;
        public string eyelinerColor = "#181418";  // 아이라이너 색
        public float eyelinerIntensity = 0f;
        public int eyelinerStyle = 0;              // 0=윙업 1=다운턴 2=가로롱
        public int eyelinerTexture = 0;            // 아이라이너 질감: 0=리퀴드 1=젤 2=펜슬 3=붓펜
        public int eyelinerSegment = 0;            // 아이라이너 부분: 0=전체(기본) 1=꼬리만 2=앞머리+꼬리 3=눈동자 위만
        public int eyelinerFinish = 0;             // 아이라이너 마감: 0=새틴(기본) 1=매트 2=글로시 (시머는 리본에 과해 제외)
        public int eyelinerThicknessProfile = 0;   // 0..5 해부학적 두께 프로파일
        public int eyelinerTailProfile = 0;        // 0..5 꼬리 geometry 프로파일
        public int eyelinerHasGeometryProfiles = 0;// 1=명시 override, 0=legacy style 복원
        public float eyelinerStyleIntensity = 0f;  // 임포트 아이라인 텍스처 강도(색은 eyelinerColor 공용)
        public string eyelinerLowerColor = "";     // 빈 값은 legacy eyelinerColor 폴백
        public float eyelinerLowerIntensity = 0f;  // 아이라인(하) — 하안검 밴드, 색은 eyelinerColor 공용 (0=끔)
        public int eyelinerLowerFinish = 0;        // 아이라인(하) 마감: 0=새틴 1=매트 2=글로시 3=시머
        public float eyelinerLowerShimmer = 0f;   // 시머 게인 0..1 (finish=3일 때만 사용)
        public int eyelinerLowerTexture = -1;     // -1=필드 부재/레거시, 0=펜슬 1=스머지 파우더 2=글리터 리퀴드
        public float eyeCornerLift = 0f;           // 눈꼬리 띄우기(R7 명명 워프): 바깥 눈꼬리 리프트 0..1 (0=원래)
        public string mascaraColor = "#181418";    // 마스카라(속눈썹 스트로크) 색
        public float mascaraIntensity = 0f;        // 0 = 끔
        public int mascaraFinish = 0;              // 속눈썹 상 마감: 0=새틴(기본) 1=매트 2=듀이
        // 눈썹 제품 스택 (겹쳐 쓰기). browColor/Intensity = 마스카라/젤(결 보존).
        public string browColor = "#3A2A20";       // 마스카라/젤 색
        public float browIntensity = 0f;           // 0 = 끔
        public int browFinish = 0;                 // 눈썹 결 마감: 0=새틴(기본) 1=매트 2=듀이
        public string browPowderColor = "#4A3628"; // 파우더 색(빈 곳 채움)
        public float browPowderIntensity = 0f;
        public int browPowderTexture = 0;          // 채움 제형: 0=파우더 1=포마드 2=젤
        public int browPowderFinish = 0;           // 채움 마감: 0=새틴 1=매트 2=글로시 3=시머
        public float browPowderShimmer = 0.5f;     // 시머 게인 0..1 (finish=3일 때)
        public float browLightenerIntensity = 0f;  // 옅은 눈썹(피부톤 커버, 색 없음)
        public int browLightenerFinish = 0;        // 라이트너 마감: 0=새틴(기본) 1=매트 2=듀이
        public string browPencilColor = "#2A1E16"; // 펜슬 색(개별 털 스트로크)
        public float browPencilIntensity = 0f;
        public int browPencilFinish = 0;           // 펜슬(한올) 마감: 0=새틴(기본) 1=매트 2=듀이
        public string browStyleColor = "#3A2A20";  // 스타일(텍스처 워프) 틴트 색
        public float browStyleIntensity = 0f;      // 임포트/기본 눈썹 텍스처 강도
        public int browStyleFinish = 0;            // 스타일(텍스처 눈썹) 마감: 0=새틴(기본) 1=매트 2=듀이
        public int browStyleTemplate = 0;          // built-in 눈썹 텍스처 선택: 0=default_brow 1=글램(정의) 2=두꺼운(풍성) 3=와일드 4=소프트 헤어
        public float browThickness = 1f;           // 눈썹 두께 배수 (1 = 원래)
        public int browThicknessProfile = 0;       // 0=legacy 1=slim 2=regular 3=full 4=bold 5=headFull 6=bodyFull
        public float browExpandUpper = 0f;         // 실측 눈썹 높이 배수의 위쪽 개인 커버 델타
        public float browExpandLower = 0f;         // 실측 눈썹 높이 배수의 아래쪽 개인 커버 델타
        public float browArch = 0f;                // 아치 올림 (0 = 원래)
        // 사용자가 UV 템플릿 위에 그린 메이크업 룩(얼굴 UV 데칼) 강도. 텍스처는
        // setFaceOverlay 메시지로 임포트, 이 값으로 세기 조절 (0 = 끔).
        public float faceOverlayIntensity = 0f;
        // ── 명명 핸들(핏/배치) 확장 — 배수는 1=원래(JsonUtility 생략 0은 Unity가
        // 1로 보정), 오프셋은 0=원래. 전역 농도의 스케일 대상 아님(browThickness 선례).
        public float eyelinerThickness = 1f;   // 아이라이너 리본 두께 배수
        public float eyelinerLowerThickness = 1f; // 아이라이너(하) 리본 두께 배수 (상라이너와 독립)
        public float eyelinerWingLength = 1f;  // 윙(꼬리) 길이 배수 (스타일 위 미세조정)
        public float eyelinerInnerLift = -1f;  // (임시 디버그) 앞머리 끝 리프트 오버라이드 — <0=미설정(상수 사용)
        public float eyeshadowHeight = 1f;     // 아이섀도 밴드 높이 배수 (스모키 정도)
        public float eyeshadowLowerHeight = 1f;// 아이섀도 하(하안검 아래 섀도) 밴드 높이 배수
        public float mascaraLength = 1f;       // 속눈썹 길이 배수
        public int mascaraStyle = 0;           // 속눈썹 모양: 0=내추럴 1=돌리 2=캣아이 3=오픈아이 4=위스피 5=처짐(위 전용)
        public int mascaraTexStyle = 0;        // 위 속눈썹 렌더: 0=절차 스트로크 1=텍스처 내추럴 2=텍스처 볼륨 3=텍스처 글램(아래 리본 자동 동반)
        public int lowerLashStyle = 0;         // 아래 속눈썹 모양 — 위와 같은 5종, 값 독립
        public float aegyoHeight = 1f;         // 하안검 밴드 높이 배수 (애교살 두께)
        public float triangleZoneHeight = 1f;  // 삼각존(눈꼬리 아래 삼각 음영) 밴드 높이 배수
        public float lipLinerWidth = 1f;       // 립라이너 폭 배수
        public float lipBaseOverline = 0f;     // 베이스립 마스크 확장(±, UV) — 메인립 lipOverline과 독립
        public float lipGlossOverline = 0f;    // 립글로스 마스크 확장(±, UV) — 메인립 lipOverline과 독립
        public float blushLift = 0f;           // 블러셔 위/아래 (캐노니컬 UV, + = 위)
        public float blushSpread = 0f;         // 블러셔 바깥/안쪽 (+ = 바깥, 좌우 미러)
        public int blushShape = 0;             // 0=클래식 1=이가리 2=드레이핑 3=데일리 4=러블리 5=언더아이 6=선키스드 소프트 7=선키스드 밴드
        // ── 부위 확장(컨실·치아·아래 속눈썹) ── 강도는 0=끔, 길이 배수는 1=원래
        // (JsonUtility 생략 0은 Unity가 1로 보정 — mascaraLength 선례).
        public float browConcealIntensity = 0f;  // 눈썹 지우기(스킨톤 컨실 — 눈썹 스택 밑작업)
        public int browConcealFinish = 0;        // 눈썹 지우기 마감: 0=새틴(기본) 1=매트 2=듀이
        public float teethWhitenIntensity = 0f;  // 치아 미백(내측 립 링 안쪽, 입 다물면 자동 무효과)
        public int teethFinish = 0;              // 치아 미백 마감: 0=새틴(기본) 1=매트 2=듀이(글로시 스마일)
        public float lowerLashIntensity = 0f;    // 아래 속눈썹 스트로크(색은 mascaraColor 공용)
        public float lowerLashLength = 1f;       // 아래 속눈썹 길이 배수(mascaraLength와 독립)
        public int lowerMascaraFinish = 0;       // 속눈썹 하 마감: 0=새틴(기본) 1=매트 2=듀이
        // ── 세그 확장(§11 P3·§14) — CameraFeed 배경 셰이더 소비. 세그 폴백(_SegOn=0:
        // 패키지 미설치·모델 부재·추론 실패·스테일)이면 자동 무효과.
        public float skinSmoothingExtended = 0f; // 이마·목 스무딩 확장(face+body-skin) — skinSmoothing과 독립 (0=끔)
        public string hairTintColor = "#3B2A20"; // 헤어 염색 색 (다크브라운 기본)
        public float hairTintIntensity = 0f;     // 헤어 염색 강도 (0=끔)
        public int hairFinish = 0;               // 헤어 염색 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        // ── 얼굴형 보정 워프(설계 섹션 10, 골드) — 0=원래. 배치·강도와 무관한 형태 보정.
        // 턱 계열은 −1..+1 부호형(축소↔확대) — 단일 "턱슬림"은 기괴한 V가 돼 부위 분해.
        public float eyeEnlarge = 0f;          // 눈확대(홍채 중심 방사 스케일) 0..1
        public float chinScale = 0f;           // 턱끝 크기 (방사, +=확대)
        public float jawWidth = 0f;            // 턱 너비 (옆턱 수평, +=넓게)
        public float chinLength = 0f;          // 턱 길이 (세로축, +=길게)
        public float lowerFaceScale = 0f;      // 하관 전체 (실루엣 체인, −=좁고 짧게=동안)
        public float jawCorner = 0f;           // 사각턱 (턱각 수평, +=각지게 −=깎기)
        public float cheekWidth = 0f;          // 광대 폭 (실루엣 체인 상단, +=넓게)
        public float mouthScale = 0f;          // 입 크기 (입 중심 방사, +=확대)
        public float noseWingScale = 0f;       // 콧볼 (알라 좌우 방사, +=확대)
        public float noseBridge = 0f;          // 콧대 (측벽 푸시 — −=슬림(주 방향) +=넓게)
        public float foreheadHeight = 0f;      // 이마 높이 (헤어라인 세로 푸시, +=높게)
        public float browLift = 0f;            // 눈썹 높이 (양 눈썹 리프트, +=올림)
        public float browTilt = 0f;            // 눈썹 기울기 (꼬리 올림/내림, +=꼬리 위)
        public float browGap = 0f;             // 눈썹 간격 (미간 수평, +=넓게)
        // ── R2 그라데이션 (설계 §3.1 색축 — 2색 세로 그라데) ── JsonUtility 생략 시
        // gradient 0 = 끔 = 기존 출력과 픽셀 동일. 색2 빈 값 = 색1과 동일 취급(단색).
        public string lipColor2 = "";        // 립 그라데 스톱B (안쪽=입 라인 진한 색)
        public float lipGradient = 0f;       // 립 그라데 강도 0..1 (두 색 혼합 비율 — 농도 아님)
        public string eyeshadowColor2 = "";  // 섀도 그라데 스톱B (리드=속눈썹 라인 진한 색)
        public float eyeshadowGradient = 0f; // 섀도 그라데 강도 0..1
        // ── 부위 확장 팩 #19b — 신규 렌더 4종 배선 (전부 생략=0/기본=끔=기존 동작) ──
        public string triangleZoneColor = "#4A342A"; // 삼각존(눈꼬리 아래 음영) 딥브라운
        public float triangleZoneIntensity = 0f;     // 삼각존 강도 (0=끔) — LowerLidRenderer
        public int triangleZoneFinish = 0;           // 삼각존 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public float triangleZoneShimmer = 0f;       // 시머 게인 0..1 (finish=3일 때만 사용)
        public float doubleLidIntensity = 0f;        // 쌍꺼풀 크리스 강도 (0=끔) — DoubleLidRenderer
        public float doubleLidHeight = 1f;           // 쌍꺼풀 크리스 높이 배수 (생략 0은 렌더러가 1 보정)
        public int doubleLidFinish = 0;              // 쌍꺼풀 마감: 0=새틴(기본) 1=매트 2=듀이
        public string lipBaseColor = "#D9A896";      // 베이스립 누드 색
        public float lipBaseIntensity = 0f;          // 베이스립 커버 (0=끔) — LipRenderer.ApplyLipBase
        public int lipBaseFinish = 0;                // 베이스립 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        public string lipGlossColor = "#FFFFFF";     // 립글로스 틴트 (흰색=무색 광)
        public float lipGlossIntensity = 0f;         // 립글로스 광량 (0=끔) — LipRenderer.ApplyLipGloss
        public int lipGlossFinish = 0;               // 립글로스 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머
        // ── 축 개선 5건 (모양 축) — 생략 0 = 기존 동작 ──
        // 0리드 전체 1크리스 2스모키 3꼬리 포인트 4안쪽 5중앙 6바깥
        // 7베이스 8메인 9포인트 10와이드 11꼬리 연장.
        public int eyeshadowShape = 0;
        public int browShape = 0;        // 눈썹 모양(슬롯 공통): 0=내추럴 1=일자 2=아치 3=각진
        public int concealerShape = 0;   // 0=눈밑 존 1=붉은기 자동(붉은 픽셀 커버)
        public int powderShape = 0;      // 0=전체 1=T존 2=볼 제외
        // ── 제형 스튜디오(#21) — 마감(finish) 세부 파라미터 ──
        // enum(*Finish) 내부 빛 반응을 노출해 커스텀 제형 제작. 립·아이섀도·블러셔 3대
        // 색소면. 전부 생략(JsonUtility 0)=미지정=enum 기존 동작 — 셰이더 ApplyFinish가
        // (Finish.cginc) 다섯 값 합이 0이면 레거시 enum 경로로 분기(하위호환 대수 검증).
        public float lipGlossLo = 0f;        // 광 임계(낮=넓은 은은광 / 높=정점만 유리광)
        public float lipGlossGain = 0f;      // 광 게인(매트↔글로시)
        public float lipShimmerSize = 0f;    // 펄/시머 입자 크기(고운↔굵은)
        public float lipShimmerDensity = 0f; // 펄/시머 밀도
        public float lipMatte = 0f;          // 광 억제(파우더성 매트화)
        // 벨벳 시(sheen) — 은은한 새틴광 톱코트(0=미지정=무효, 머티리얼 기본과 동일).
        // sheen도 ApplyFinish 마감 세부 합 게이트(customAmt)에 포함돼 sheen만 켜도 커스텀
        // 경로 진입 — 단 sheen 항이 sheen에 선형이라 sheen=0이면 enum 레거시 분기와
        // 바이트 동일. ApplyFinish가 6번째 인자로 소비.
        public float lipSheen = 0f;
        public float eyeshadowGlossLo = 0f;
        public float eyeshadowGlossGain = 0f;
        public float eyeshadowShimmerSize = 0f;
        public float eyeshadowShimmerDensity = 0f;
        public float eyeshadowMatte = 0f;
        public float eyeshadowSheen = 0f;
        public float blushGlossLo = 0f;
        public float blushGlossGain = 0f;
        public float blushShimmerSize = 0f;
        public float blushShimmerDensity = 0f;
        public float blushMatte = 0f;
        public float blushSheen = 0f;
        // ── 모양 축 W1+W2 (하안검 밴드 4부위 + 쌍꺼풀) — 생략 0 = 현행 픽셀 동일 ──
        public int eyeshadowLowerShape = 0;  // 하안검 섀도 실루엣: 0=기본밴드 1=넓게 2=꼬리집중 — LowerLidRenderer
        public int eyelinerLowerSegment = 0; // 하안검 라이너 구간: 0=전체 1=꼬리만 2=앞+꼬리(중앙 비움) — LowerLidRenderer
        public int aegyoShape = 0;           // 애교살 실루엣: 0=초승달(현행) 1=일자 2=중앙도톰 — LowerLidRenderer
        public int triangleZoneShape = 0;    // 삼각존 모양: 0=기본 1=좁게 2=넓게 — LowerLidRenderer
        public int doubleLidShape = 0;       // 쌍꺼풀 라인: 0=인라인(현행) 1=아웃라인 2=세미 — DoubleLidRenderer
        // ── 모양 축 W3 피부 존 (FaceMakeup.shader 존 게이트, powderShape 선례) — 생략 0 = 현행 픽셀 동일 ──
        public int toneShape = 0;        // 언더톤 존: 0=전체 1=T존 2=얼굴 중앙 — FaceMakeup(_Brightening 존 곱)
        public int skinShape = 0;        // 피부결 존: 0=전체 1=T존 2=볼 제외 — FaceMakeup(_Smoothing 존 곱)
        public int foundationShape = 0;  // 파운데 존: 0=전체 1=T존 집중 2=외곽 페더 — FaceMakeup 얼굴 메시(커버 존 곱)
        // ── 모양 축 W4 립 실루엣/존 (Lip.shader, 링 메시 uv.y=중앙도·uv2.y=윗입술도) — 생략 0 = 현행 픽셀 동일 ──
        public int lipBaseShape = 0;     // 베이스립: 0=전체 1=중앙 그라데 2=외곽 정리 — LipRenderer(메인 립 메시)
        public int lipShape = 0;         // 메인립: 0=풀립 1=그라데립 2=꼬리 뾰족 — LipRenderer(메인 립 메시)
        public int lipLinerShape = 0;    // 립라이너: 0=전체 링 1=윗입술만 2=입꼬리 집중 — LipRenderer(라이너 인스턴스)
        public int lipGlossShape = 0;    // 립글로스: 0=전체 1=중앙 도트 2=아랫입술만 — LipRenderer(메인 립 메시)
        // ── 모양 축 W6 치아·헤어 — 생략 0 = 현행 픽셀 동일 ──
        public int teethShape = 0;       // 치아: 0=전체 1=앞니 6전치 집중(가로 중앙 가중) — TeethRenderer
        public int hairShape = 0;        // 헤어: 0=전체 1=옴브레 2=끝만(v1 화면공간 세로 근사) — CameraFeed

        /// <summary>JsonUtility overwrite 전 사용하는 wire 0/null 및 texture sentinel 기본값.</summary>
        public static FilterParams CreateWireDefaults()
        {
            // Unity 6의 FromJson/FromJsonOverwrite는 필드 initializer를 유지한다. 실제 wire에서
            // 생략된 필드는 0/null이어야 하므로 모든 비영 initializer를 명시적으로 중화한다.
            return new FilterParams
            {
                skinSmoothing = 0f,
                skinBrightening = 0f,
                lipColor = null,
                lipIntensity = 0f,
                lipLinerColor = null,
                lipLinerFinish = 0,
                lipShimmer = 0f,
                lipMaterialStrength = 0f,
                lipParticleSize = 0f,
                lipParticleBrightness = 0f,
                lipParticleColor = null,
                lipParticleTwinkle = 0f,
                blushColor = null,
                blushIntensity = 0f,
                blushShimmer = 0f,
                blushMaterialStrength = 0f,
                blushParticleBrightness = 0f,
                blushParticleColor = null,
                blushParticleTwinkle = 0f,
                highlightColor = null,
                highlightShimmer = 0f,
                contourColor = null,
                contourShimmer = 0f,
                concealerColor = null,
                foundationColor = null,
                toneTexture = -1,
                skinTexture = -1,
                concealerTexture = -1,
                powderTexture = -1,
                blushTexture = -1,
                highlightTexture = -1,
                contourTexture = -1,
                eyeshadowTexture = -1,
                eyeshadowLowerTexture = -1,
                aegyoTexture = -1,
                triangleZoneTexture = -1,
                browConcealTexture = -1,
                browTexture = -1,
                browPencilTexture = -1,
                browLightenerTexture = -1,
                browStyleTexture = -1,
                lipBaseTexture = -1,
                lipLinerTexture = -1,
                lipGlossTexture = -1,
                fndRefLumaDbg = 0f,
                fndLumaGainDbg = 0f,
                fndChromaDbg = 0f,
                fndSegLoDbg = 0f,
                fndSegHiDbg = 0f,
                fndOvalSizeDbg = 0f,
                fndOvalFeatherDbg = 0f,
                powderShimmer = 0f,
                aegyoShimmer = 0f,
                eyeshadowColor = null,
                eyeshadowIntensity = 0f,
                eyeshadowShimmer = 0f,
                eyeshadowMaterialStrength = 0f,
                eyeshadowParticleSize = 0f,
                eyeshadowParticleBrightness = 0f,
                eyeshadowParticleColor = null,
                eyeshadowParticleTwinkle = 0f,
                eyeshadowLowerShimmer = 0f,
                irisColor = null,
                eyelinerColor = null,
                eyelinerLowerTexture = -1,
                mascaraColor = null,
                browColor = null,
                browPowderColor = null,
                browPowderShimmer = 0f,
                browPencilColor = null,
                browStyleColor = null,
                browThickness = 0f,
                eyelinerThickness = 0f,
                eyelinerLowerThickness = 0f,
                eyelinerWingLength = 0f,
                eyelinerInnerLift = 0f,
                eyeshadowHeight = 0f,
                eyeshadowLowerHeight = 0f,
                mascaraLength = 0f,
                aegyoHeight = 0f,
                triangleZoneHeight = 0f,
                lipLinerWidth = 0f,
                lowerLashLength = 0f,
                hairTintColor = null,
                triangleZoneColor = null,
                doubleLidHeight = 0f,
                lipBaseColor = null,
                lipGlossColor = null,
            };
        }

        /// <summary>첫 RN applyFilter 전 렌더러들이 공유하는 완전 비활성 부트 payload.</summary>
        public static FilterParams CreateBare()
        {
            // initializer의 비영 강도는 편집 UI/레거시 샘플값이며 부트 렌더 상태가 아니다.
            return new FilterParams
            {
                skinSmoothing = 0f,
                skinBrightening = 0f,
                lipIntensity = 0f,
                blushIntensity = 0f,
                eyeshadowIntensity = 0f,
            };
        }
    }

    /// <summary>
    /// 렌즈 레이어 한 장 (setLensLayers — 컬러렌즈 3세부 레이어드 합성, #25).
    /// 배열 순서 = 합성 순서(뒤 원소가 위). JsonUtility 생략 필드는 0이므로 RN이
    /// 모든 필드를 항상 채워 보낸다. designPath는 IrisRenderer가 슬롯별 캐시 로드.
    /// </summary>
    [Serializable]
    public class LensLayerParams
    {
        public int part;        // 0=베이스 1=내부 디테일 2=테두리 림
        public string color;    // "#RRGGBB" 틴트
        public int blendMode;   // 0=노말 1=멀티 2=스크린 3=오버레이 4=소프트라이트 5=컬러닷지 6=컬러번 7=라이튼 8=다큰 9=하드라이트
        public float intensity; // 0..1
        public float inner;     // 방사 UV 안쪽 경계 0..1
        public float outer;     // 방사 UV 바깥쪽 경계 0..1
        public string designPath; // 방사 디자인 텍스처 경로 (file:// · http(s):// 원격 §16 v2 허용, 빈 값 = 절차 그라데)
        public int finish = 0;  // 겹 마감: 0=새틴(기본) 1=매트 2=듀이 — 겹별 독립. IrisRenderer가 _LensFinish로 전달
    }

    /// <summary>
    /// 아이섀도 밴드 한 장 (setEyeshadowLayers — 멀티밴드 세로 스택 합성, A14 ①).
    /// 배열 순서 = 그리는 순서(index 0 먼저=아래 lash 쪽, 뒤 원소가 위). JsonUtility 생략
    /// 필드는 0이므로 RN이 모든 필드를 항상 채워 보낸다. height는 밴드 세로 높이(전 밴드
    /// max로 정규화해 cutoff 산출). 제형 세부(GlossLo 등)·shimmer는 v1에서 밴드 공통
    /// (FilterParams 스칼라) — shimmer 필드는 후속 배열화 예약.
    /// </summary>
    [Serializable]
    public class EyeshadowLayerParams
    {
        public int surface;          // 0=upper 1=lower 2=both
        public int profile;          // 정본 12종 profile 0..11
        public string color = "";   // "#RRGGBB" 틴트 (빈 값 = 흰색)
        public string color2 = "";  // 그라데 스톱B (빈 값 = color와 동일 = 단색)
        public float intensity;     // 0..1.5
        public int finish;          // 0=새틴(기본) 1=매트 2=글로시 3=시머
        // 0리드 전체 1크리스 2스모키 3꼬리 포인트 4안쪽 5중앙 6바깥
        // 7베이스 8메인 9포인트 10와이드 11꼬리 연장.
        public int shape;
        public float gradient;      // 세로 그라데 강도 0..1 (0=단색)
        public float height = 1f;   // 밴드 세로 높이 (전 밴드 max로 정규화 → cutoff)
        public float shimmer;       // 시머 게인 (v1 미사용 — 밴드 공통 예약)
        public int texture = -1;
        public float glossLo, glossGain, shimmerSize, shimmerDensity;
        public float matte, sheen;
        public float particleSize, particleDensity;
        public int material = 0;
        public float materialStrength = 0.85f;
        public float particleBrightness = 0.7f;
        public string particleColor = "#FFF2D9";
        public float particleTwinkle = 1f;
        public float particleShape;
        public float particleFeather;
        public float particleParallax;
        public float particleConfetti;
    }

    /// <summary>
    /// 캐노니컬 오버레이 한 장 (setOverlayLayers — 얼굴 캔버스 N장 합성, 설계 섹션 07).
    /// 배열 순서 = 그리기 순서(뒤 원소가 위). JsonUtility 생략 필드는 0이므로 RN이
    /// 모든 필드를 항상 채워 보낸다 — Unity는 scale 0만 캔버스 전체(1)로 보정.
    /// </summary>
    [Serializable]
    public class OverlayLayerParams
    {
        public string path;      // 이미지 파일 경로 (file:// · http(s):// 원격 §16 v2 허용). 빈 값 = 슬롯 비움
        public float intensity;  // 레이어 강도 0..1 (마스터 faceOverlayIntensity와 곱)
        public float x;          // 배치 중심 (캐노니컬 UV, 0.5 = 중앙)
        public float y;
        public float scale;      // 캔버스 대비 크기 (1 = 전체 캔버스)
        public float rotation;   // 회전 (도)
        public int blendMode;    // 0=그림 그대로(스티커) 1=색소 틴트(루마 보존 — 블러셔급) 2=네온 발광(가산)
        public string color;     // 텍스처에 곱할 틴트 "#RRGGBB" (빈 값 = 흰색 = 원본색).
                                 // path가 "builtin:dot"(내장 소프트 점)일 때 사실상 점의 색.
        public int finish = 0;   // 마감: 0=새틴(기본) 1=매트 2=듀이 — FaceMakeup ApplyOverlay가 _OverlayNFinish로 소비(젬 광)
    }

    /// <summary>
    /// 랜드마크 → 화면 매핑 캘리브레이션 (실기기 튜닝용).
    /// RN 디버그 UI에서 실시간으로 조정한 뒤, 확정값을
    /// CanonicalFaceMesh/FaceLandmarkSource의 기본값에 반영한다.
    /// </summary>
    [Serializable]
    public class CalibrationParams
    {
        public bool flipY = true;
        public int rotationDegrees = -1; // -1 = 플랫폼별 자동 추정
        public int matrixMode = -1;      // -1 = 기본. 시간 동기 경로에선 표시 회전(0~3 = 0/90/180/270°)
        public bool debugMesh;           // 메시를 반투명 컬러로 표시 (정렬 확인용)
        public int cullMode = -1;        // -1 = 기본, 0 = Off, 1 = Front, 2 = Back (fold-over 제거용)
        public bool debugSeg;            // 세그 채널 컬러 오버레이 (§11 검증용, JsonUtility 생략=false)
    }

    /// <summary>
    /// 튜토리얼 스텐실 (setStencil) — 메이크업 완성본 위에 "어디에·어떤 모양으로
    /// 바르는지" 가이드 라인을 켠다. 부위별 on/off + 마스터 농도 + 펄스/대시 연출.
    /// opacity=0 또는 전 부위 off = 가이드 없음. StencilGuideRenderer가 소비.
    /// </summary>
    [Serializable]
    public class StencilParams
    {
        public float opacity = 0f; // 마스터 농도 0..1 (0 = 가이드 끔)
        public bool lips;          // 립 라인(외곽)
        public bool brows;         // 눈썹 모양(외곽 링)
        public bool eyeshadow;     // 아이섀도 존(리드~크리스 밴드)
        public bool eyeliner;      // 아이라인(상안검 lash 라인) — #2 Phase 2
        public bool aegyo;         // 애교살(하안검 lash 라인) — #2 Phase 2
        public bool blush;         // 블러셔 존(볼 타원)
        public bool highlighter;   // 하이라이터(캐노니컬 UV 존 투영) — #2 Phase 3
        public bool contour;       // 컨투어(광대 밑 음영 라인)
        public bool pulse = true;  // 호흡(사인 알파)
        public bool dash = true;   // 마칭 앤츠(점선 흐름)
    }

    /// <summary>
    /// 좌우 대칭 가이드 (setSymmetry, #6) — 얼굴 중심축 + 대칭 쌍 커넥터(색=편차)로
    /// 좌우 비대칭을 실시간 표시. opacity=0 또는 둘 다 off = 가이드 없음.
    /// SymmetryGuideRenderer가 소비.
    /// </summary>
    [Serializable]
    public class SymmetryParams
    {
        public float opacity = 0f; // 마스터 농도 0..1 (0 = 끔)
        public bool midline = true; // 얼굴 중심축(세로선)
        public bool pairs = true;   // 대칭 쌍 커넥터(눈썹·눈꼬리·콧볼·입꼬리)
    }

    /// <summary>
    /// 조명 시뮬레이션 (setLighting, #4) — 완성 화면을 프리셋 조명으로 그레이드 미리보기.
    /// preset 0 또는 intensity 0 = 끔. LightingSimRenderer가 소비.
    /// </summary>
    [Serializable]
    public class LightingParams
    {
        public int preset = 0;      // 0=끔 1=자연광 2=형광등 3=노을 4=실내 5=커스텀
        public float intensity = 1f; // 그레이드 세기 0..1 (원본↔조명 블렌드)
        public float temperature = 0.5f; // 커스텀(preset=5) 색온도 0..1 (0=따뜻 0.5=중립 1=차가움)
    }

    /// <summary>
    /// 반반 모드 (setSplit) — 완성본 절반 vs 맨얼굴 절반 비교. mode 0=전체 1=왼쪽
    /// 메이크업 2=오른쪽 메이크업. SplitMaskRenderer가 소비(가이드도 전역으로 추종).
    /// </summary>
    [Serializable]
    public class SplitParams
    {
        public int mode = 0; // 0=전체 1=왼쪽 메이크업 2=오른쪽 메이크업
    }

    /// <summary>Envelope for RN → Unity messages.</summary>
    [Serializable]
    public class RNToUnityMessage
    {
        // 미디어 편집(사전 촬영 사진/영상 보정) 추가:
        //  "enterPhotoEdit" (path) — 갤러리 사진을 편집 스틸로 로드(EXIF 정립 정규화 + 검출 1회)
        //  "enterVideoEdit" (path) — 영상 첫 프레임을 편집 스틸로 로드(적용 대상 영상 기억)
        //  "saveEditedPhoto"       — 편집 중인 스틸을 소스 해상도로 합성 저장(앨범)
        //  "applyVideoEdit"        — 기억한 영상 전체에 오프라인으로 현재 룩 적용→인코딩·저장
        //  "exitEdit"              — 편집 모드 종료(라이브 카메라 복귀)
        //  "extractLook" (path)    — 사진→룩 추출(#1): 레퍼런스 사진 1회 색 측정 → lookExtracted
        //  "setExtractDebug" (disableWhiteBalance) — 개발용: 추출 그레이월드 WB 끄기(다음 추출부터 raw 색)
        public string type; // "requestReady" | "applyFilter" | "capture" | "startRecording" | "stopRecording" | "setSaveOptions" | "setPaused" | "setCamera" | "setCalibration" | "exportUVTemplate" | "setBrowStyle" | "setFaceOverlay" | "setOverlayLayers" | "setLensLayers" | "setEyeshadowLayers" | "setEyelinerStyle" | "setLipStyle" | "setBlushStyle" | "setAegyoStyle" | "setRegionMask" | "setTextureMap" | "setStencil" | "setSymmetry" | "setLighting" | "setSplit" | "setFitHandles" | "enterPhotoEdit" | "enterVideoEdit" | "saveEditedPhoto" | "applyVideoEdit" | "exitEdit" | "extractLook" | "setExtractDebug"
        public FilterParams filter;
        public bool paused;
        public string facing; // setCamera: "front" | "rear"
        public CalibrationParams calibration;
        public string path;   // setBrowStyle/setFaceOverlay/setRegionMask/setTextureMap: 임포트할 이미지 파일 경로 (file:// · http(s):// 원격 카탈로그 §16 v2 허용)
        public string region; // setRegionMask: "blush" | "highlighter" | "contour" | "eyeshadow" (모양 축 존 스텐실; eyeshadow=동적 밴드 밴드-로컬 마스크) · setTextureMap: "lip" | "eyeshadow" | "blush" (질감 맵=마감 광 지도)
        public OverlayLayerParams[] overlayLayers; // setOverlayLayers: 캐노니컬 N장 (순서=그리기 순서)
        public LensLayerParams[] lensLayers; // setLensLayers: 렌즈 세부 N장 (#25, 순서=합성 순서)
        public EyeshadowLayerParams[] eyeshadowLayers; // setEyeshadowLayers: 아이섀도 밴드 N장 (A14 ①, 순서=아래→위)
        public StencilParams stencil; // setStencil: 튜토리얼 가이드 라인 상태
        public SymmetryParams symmetry; // setSymmetry: 좌우 대칭 가이드 상태
        public LightingParams lighting; // setLighting: 조명 시뮬레이션 상태
        public SplitParams split; // setSplit: 반반 모드 상태
        public bool saveUnmirror; // setSaveOptions: 좌우 반전 없이 저장(전면 셀피를 실제 방향으로). 생략 시 false
        public bool fitHandles; // setFitHandles: 온페이스 핏 핸들(A17) 좌표 방출 토글
        public int sessionId; // setFitHandles 세션 토큰 — Unity 응답 echo로 late packet 폐기
        public bool disableWhiteBalance; // setExtractDebug: 추출 그레이월드 WB 끄기(개발용). 생략 시 false
    }

    /// <summary>온페이스 핏 핸들 한 개 (fitHandles 방출, A17) — 뷰포트 좌표 + 부위 키.</summary>
    [Serializable]
    public class FitHandle { public string key; public float x; public float y; }

    /// <summary>W5 외곽선. points는 [x0,y0,x1,y1,...]이고 wire 직렬화에서 [x,y][]로 변환.</summary>
    [Serializable]
    public class FitOutline { public string region; public float[] points; }

    /// <summary>Envelope for Unity → RN messages.</summary>
    [Serializable]
    public class UnityToRNMessage
    {
        // 미디어 편집 추가:
        //  "editReady" (tracked)       — 편집 스틸 로드 완료(얼굴 검출 여부 tracked)
        //  "editPhotoSaved" (path)     — 편집 사진 저장 완료
        //  "videoEditProgress" (progress) — 영상 오프라인 처리 진행률 0..1
        //  "videoEditDone" (path)      — 영상 편집본 저장 완료
        //  "editExited"                — 편집 모드 종료(라이브 복귀)
        //  "lookExtracted" (lookMeasurement) — 사진→룩 추출(#1) 부위별 색 측정 완료
        public string type; // "booting" | "ready" | "faceTracked" | "photoCaptured" | "recordingStarted" | "videoCaptured" | "uvTemplateExported" | "error" | "editReady" | "editPhotoSaved" | "videoEditProgress" | "videoEditDone" | "editExited" | "fitHandles" | "lookExtracted"
        public bool tracked;
        public string path;
        public string message;
        public string generation;  // ready/booting/치명 boot error: 같은 Unity 부트 동안 고정 토큰
        public bool fatal;         // true면 재시도 불가 초기화 실패, false면 일반 요청 오류
        public string code;        // 기계 판별 오류 코드(예: unity_boot_failed)
        public string stage;       // Unity 초기화 실패 단계
        public float progress; // videoEditProgress: 0..1
        public FitHandle[] handles; // fitHandles 메시지 — 뷰포트(0..1, Unity 규약 y=아래→위) 좌표
        public float eyeVp;         // 눈꼬리간 뷰포트 거리 — RN 드래그 정규화 스케일
        public FitOutline[] outlines; // fitHandles W5 부위 외곽선(부위당 8~12 viewport 점)
        public int sessionId;       // setFitHandles 요청 세션 echo
        public LookMeasurement lookMeasurement; // lookExtracted 메시지 — 부위별 색 측정치(#1)
    }

    /// <summary>
    /// 사진→룩 추출(#1) 측정치 — LookExtractController가 레퍼런스 사진 1장에서 온디바이스로
    /// 뽑은 부위별 색 "숫자". 측정=Unity, 룩 번역=RN(measurementToLook) 원칙. hex는 "#RRGGBB",
    /// conf는 0..1. StencilParams/LightingParams 등 기존 중첩 [Serializable] 선례와 동일 —
    /// JsonUtility 평면 직렬화라 필드명·순서가 RN LookMeasurement 인터페이스와 정확히 일치한다.
    /// </summary>
    [Serializable]
    public class LookMeasurement
    {
        public bool hasFace;         // 얼굴 검출 여부 — false면 나머지 무의미
        public string whitePoint;    // 공막 화이트포인트(그레이월드 기준, raw)
        public float lightingConf;   // 조명·화이트밸런스 신뢰도 0..1
        public string skinBase;      // 맨피부 기준색(이마+턱, 강도 추정 대조군)
        public string lip;           // 입술 본체 색
        public string lipLine;       // 입 안쪽(입 라인) 진한 색 (없으면 빈 문자열)
        public float lipConf;
        public string blush;         // 볼/블러셔 색
        public float blushConf;
        public string eyeshadow;     // 눈두덩/아이섀도 색
        public float eyeshadowConf;
        public string brow;          // 눈썹 털 색
        public float browConf;
        public string iris;          // 홍채 색 (RN이 자연 눈색 vs 컬러렌즈 게이팅)
        public float irisConf;
        public float lipGloss;       // 립 광택도 0..1 (낮음=매트, 높음=글로시)
        public float lipGlossConf;
        public float blushLiftHint;  // 기본 광대 위치 대비 수직 오프셋
        public float blushSpreadHint; // 기본 광대 위치 대비 수평 오프셋
        public float blushPositionConf;
        public int browShape;        // 0내추럴 1일자 2아치 3각진 4상승 5반달
        public float browArch;
        public float browThickness;  // 실측 눈썹 밴드 대비 배수 (1=실측 그대로)
        public float browShapeConf;
        public int eyelinerStyle;    // 0윙업 1퍼피 2롱
        public float eyelinerWingLength;
        public float eyelinerWingConf;
    }
}
