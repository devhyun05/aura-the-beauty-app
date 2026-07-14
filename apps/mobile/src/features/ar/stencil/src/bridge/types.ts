/**
 * RN ↔ Unity 브리지 메시지 프로토콜.
 * Unity 쪽 대응 타입: unity/Assets/Scripts/Bridge/BridgeMessages.cs
 * (Unity는 JsonUtility로 파싱하므로 필드 구조를 바꾸면 양쪽을 함께 수정할 것)
 */

export interface FilterParams {
  /** 피부 스무딩 강도 0..1 */
  skinSmoothing: number;
  /** 매트 파우더 입자감(전역, 전 부위 마감 공유). 생략 시 0(끔) */
  matteGrain?: number;
  /** 톤업(브라이트닝) 강도 0..1 */
  skinBrightening: number;
  /** 립 컬러 "#RRGGBB" */
  lipColor: string;
  lipIntensity: number;
  /** 립라이너(외곽 얇은 링, 매트) — 립 색과 독립. 생략 시 0(끔) */
  lipLinerColor?: string;
  lipLinerIntensity?: number;
  /** 립 마감: 0=새틴(기본, 현재 룩) 1=매트 2=글로시 3=시머. 생략 시 0(새틴) */
  lipFinish?: number;
  /** 립 재질: 0=없음(기본) 1=벨벳 2=메탈 3=홀로그램. 생략 시 0(없음) */
  lipMaterial?: number;
  /** 립 재질 블렌드 강도 0..1 (lipMaterial>0일 때). 생략 시 Unity 기본 0.85 */
  lipMaterialStrength?: number;
  // 립 입자 레이어(글리터) 9축 — density 0=끔.
  lipParticleSize?: number;
  lipParticleDensity?: number;
  lipParticleBrightness?: number;
  lipParticleColor?: string;
  lipParticleTwinkle?: number;
  lipParticleShape?: number;
  lipParticleFeather?: number;
  lipParticleParallax?: number;
  lipParticleConfetti?: number;
  /** 립 제형: 0=립스틱(기본) 1=벨벳틴트(엣지 소프트) 2=워터틴트(더 소프트·커버↓). 생략 0 */
  lipTexture?: number;
  /** 시머 게인 0..1 (lipFinish=3일 때). 생략 시 Unity 기본 0.5 */
  lipShimmer?: number;
  /** 오버립(R7 워프): 입술 외곽 확장 0..1 (0=원래). 골드=워프 조작 */
  lipOverline?: number;
  /** 임포트 립 그림(데칼) 강도. 텍스처는 setLipStyle로 임포트 */
  lipStyleIntensity: number;
  /** 립 데칼 글리터 명멸 0..1 (0=끔). 움직임에 반응하는 절차 반짝을 데칼 위에 얹음 */
  lipStyleSparkle?: number;
  blushColor: string;
  blushIntensity: number;
  /** 블러셔 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머. 생략 시 0(새틴) */
  blushFinish?: number;
  /** 시머 게인 0..1 (blushFinish=3일 때). 생략 시 Unity 기본 0.5 */
  blushShimmer?: number;
  /** 블러셔 재질: 0=없음(기본) 1=벨벳 2=메탈 3=홀로그램. 생략 시 0(없음) */
  blushMaterial?: number;
  /** 블러셔 재질 블렌드 강도 0..1 (blushMaterial>0일 때). 생략 시 Unity 기본 0.85 */
  blushMaterialStrength?: number;
  // 입자 레이어(7축) — 볼 반짝 알갱이. density=0=끔(생략 시 무변조).
  /** 크기: 고운↔굵은 알갱이 */
  blushParticleSize?: number;
  /** 밀도: 0=끔 ↔ 촘촘 */
  blushParticleDensity?: number;
  /** 밝기 (생략 시 Unity 기본 0.7) */
  blushParticleBrightness?: number;
  /** 알갱이 색 hex (생략 시 Unity 기본 #FFF2D9) */
  blushParticleColor?: string;
  /** 명멸: 0=정적 ↔ 1=움직임 번쩍 (생략 시 Unity 기본 1) */
  blushParticleTwinkle?: number;
  /** 모양: 0=원 ↔ 1=별 */
  blushParticleShape?: number;
  /** 윤곽 부드러움: 0=또렷한 글리터 조각 ↔ 1=윤곽 없는 부드러운 펄 */
  blushParticleFeather?: number;
  /** 시차: 글로스 속 부유감 (움직일 때 배경 대비 미끄러짐) */
  blushParticleParallax?: number;
  /** 컨페티: 0=단색 ↔ 1=조각마다 다른 무지개색 */
  blushParticleConfetti?: number;
  /** 임포트 볼 그림(데칼) 강도. 텍스처는 setBlushStyle로 임포트 */
  blushStyleIntensity: number;
  /** 볼 데칼 글리터 명멸 0..1 (0=끔). 움직임에 반응하는 절차 반짝을 데칼 위에 얹음 */
  blushStyleSparkle?: number;
  /** 넓은 면 보정 (얼굴 셰이더, 가·감산 블렌드) */
  highlightColor: string;
  highlightIntensity: number;
  /** 하이라이터 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머. 생략 시 0(기존 출력) */
  highlightFinish?: number;
  /** 시머 게인 0..1 (highlightFinish=3일 때). 생략 시 Unity 기본 0.5 */
  highlightShimmer?: number;
  /** 제형 스튜디오(#21) 하이라이터 세부 — 전부 생략(0)=enum 기존 동작(하위호환) */
  highlightGlossLo?: number;
  highlightGlossGain?: number;
  highlightShimmerSize?: number;
  highlightShimmerDensity?: number;
  highlightMatte?: number;
  highlightSheen?: number;
  contourColor: string;
  contourIntensity: number;
  /** 컨투어 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머. 생략 시 0(기존 출력) */
  contourFinish?: number;
  /** 시머 게인 0..1 (contourFinish=3일 때). 생략 시 Unity 기본 0.5 */
  contourShimmer?: number;
  /** 제형 스튜디오(#21) 컨투어 세부 — 전부 생략(0)=enum 기존 동작(하위호환) */
  contourGlossLo?: number;
  contourGlossGain?: number;
  contourShimmerSize?: number;
  contourShimmerDensity?: number;
  contourMatte?: number;
  contourSheen?: number;
  concealerColor: string;
  concealerIntensity: number;
  /** 애교살(하안검 밴드): 하이라이트+섀도 2줄 한 강도 0..1 (0=끔). 생략 시 0 */
  aegyoIntensity?: number;
  /** 임포트 애교살 그림(하안검 밴드 데칼) 강도. 텍스처는 setAegyoStyle로 임포트 */
  aegyoStyleIntensity?: number;
  /** 애교살 하이라이트 색 "#RRGGBB" — 빈 문자열/생략 = Unity 기본 톤(섀도는 파생) */
  aegyoColor?: string;
  /** 애교살 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머(펄). 생략 시 0(기존 출력) */
  aegyoFinish?: number;
  /** 시머 게인 0..1 (aegyoFinish=3일 때). 생략 시 Unity 기본 0.5 */
  aegyoShimmer?: number;
  eyeshadowColor: string;
  eyeshadowIntensity: number;
  /** 아이섀도 하(A3, 하안검 아래 섀도 밴드) — 곱 블렌드. 생략 시 0(끔) */
  eyeshadowLowerColor?: string;
  eyeshadowLowerIntensity?: number;
  /** 아이섀도 하 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머. 생략 시 0(기존 출력) */
  eyeshadowLowerFinish?: number;
  /** 시머 게인 0..1 (eyeshadowLowerFinish=3일 때). 생략 시 Unity 기본 0.5 */
  eyeshadowLowerShimmer?: number;
  /** 아이섀도 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머. 생략 시 0(새틴) */
  eyeshadowFinish?: number;
  /** 아이섀도 재질: 0=없음(기본) 1=벨벳 2=메탈 3=홀로그램. 생략 시 0(없음) */
  eyeshadowMaterial?: number;
  /** 아이섀도 재질 블렌드 강도 0..1 (eyeshadowMaterial>0일 때). 생략 시 Unity 기본 0.85 */
  eyeshadowMaterialStrength?: number;
  // 아이섀도 입자 레이어(글리터) 9축 — density 0=끔.
  eyeshadowParticleSize?: number;
  eyeshadowParticleDensity?: number;
  eyeshadowParticleBrightness?: number;
  eyeshadowParticleColor?: string;
  eyeshadowParticleTwinkle?: number;
  eyeshadowParticleShape?: number;
  eyeshadowParticleFeather?: number;
  eyeshadowParticleParallax?: number;
  eyeshadowParticleConfetti?: number;
  /** 시머 게인 0..1 (eyeshadowFinish=3일 때). 생략 시 Unity 기본 0.5 */
  eyeshadowShimmer?: number;
  /** 컬러 콘택트렌즈 "#RRGGBB" (irisIntensity 0 = 끔) */
  irisColor: string;
  irisIntensity: number;
  /** 아이라이너 "#RRGGBB" */
  eyelinerColor: string;
  eyelinerIntensity: number;
  /** 아이라이너 스타일: 0=윙업(캣아이) 1=다운턴(퍼피) 2=가로롱 */
  eyelinerStyle: number;
  /** 아이라이너 질감: 0=리퀴드(기본) 1=젤 2=펜슬. 생략 시 0 */
  eyelinerTexture?: number;
  /** 아이라이너 부분: 0=전체 1=꼬리만 2=앞머리+꼬리 3=눈동자 위만. 생략 시 0 */
  eyelinerSegment?: number;
  /** 아이라이너 마감: 0=새틴 1=매트 2=글로시 (시머 없음 — 리본에 과함). 생략 시 0 */
  eyelinerFinish?: number;
  /** 임포트 아이라인 텍스처(밴드 워프) 강도. 색은 eyelinerColor 공용 */
  eyelinerStyleIntensity: number;
  /** 아이라인(하) — 하안검 밴드. 색은 eyelinerColor 공용. 생략 시 0(끔) */
  eyelinerLowerIntensity?: number;
  /** 눈꼬리 띄우기(R7 워프): 바깥 눈꼬리 리프트 0..1 (0=원래). 골드=워프 조작 */
  eyeCornerLift?: number;
  /** 마스카라(속눈썹 스트로크). 생략 시 0(끔) */
  mascaraColor?: string;
  mascaraIntensity?: number;
  /** 눈썹 제품 스택 (겹쳐 쓰기). browColor/Intensity = 마스카라/젤(결 보존) */
  browColor: string;
  browIntensity: number;
  /** 파우더(빈 곳 채움) */
  browPowderColor: string;
  browPowderIntensity: number;
  /** 채움 제형: 0=파우더(기본) 1=포마드(꽉·또렷) 2=젤(중간·매끈). 생략 시 0 */
  browPowderTexture?: number;
  /** 채움 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머(펄 브로우). 생략 시 0 */
  browPowderFinish?: number;
  /** 시머 게인 0..1 (browPowderFinish=3일 때). 생략 시 Unity 기본 0.5 */
  browPowderShimmer?: number;
  /** 라이트너(옅은 눈썹, 피부톤 커버 — 색 없음) */
  browLightenerIntensity: number;
  /** 펜슬(개별 털 스트로크, 한올한올) */
  browPencilColor: string;
  browPencilIntensity: number;
  /** 스타일(텍스처 워프 — 기본/임포트 눈썹 텍스처) */
  browStyleColor: string;
  browStyleIntensity: number;
  /** 눈썹 두께 배수 (1 = 원래), 아치 올림 (0 = 원래) */
  browThickness: number;
  browArch: number;
  /** ── 부위 확장(컨실·치아·아래 속눈썹) — 생략 시 0=끔 ── */
  /** 눈썹 지우기(스킨톤 컨실, 제품 스택 밑작업) 0..1 */
  browConcealIntensity?: number;
  /** 치아 미백(내측 립 링 안, 입 다물면 자동 무효과) 0..1 */
  teethWhitenIntensity?: number;
  /** 아래 속눈썹 강도 0..1 — 색은 mascaraColor 공용 */
  lowerLashIntensity?: number;
  /** 아래 속눈썹 길이 배수 (1=원래, 생략 0은 Unity가 1 보정) */
  lowerLashLength?: number;
  /** ── 세그 확장 — 세그 폴백(모델 부재 등, _SegOn=0)이면 Unity가 자동 무효과 ── */
  /** 이마·목 스무딩 확장(배경 세그 face+body-skin) 0..1 — skinSmoothing과 독립. 생략=0=끔 */
  skinSmoothingExtended?: number;
  /** 헤어 염색 "#RRGGBB" (hair 채널 루마 보존 틴트) */
  hairTintColor?: string;
  /** 헤어 염색 강도 0..1. 생략=0=끔 */
  hairTintIntensity?: number;
  /** 얼굴 룩 오버레이(UV 템플릿에 그린 메이크업 데칼) 강도. 텍스처는 setFaceOverlay로 임포트 */
  faceOverlayIntensity: number;
  /** ── 명명 핸들(핏/배치, 골드) — 배수는 1=원래, 오프셋은 0=원래. 전역 농도 스케일 제외 ── */
  /** 아이라이너 리본 두께 배수 */
  eyelinerThickness?: number;
  /** 윙(꼬리) 길이 배수 — 스타일(윙업/퍼피/롱) 위 미세조정 */
  eyelinerWingLength?: number;
  /** (임시 디버그) 앞머리 끝 리프트 오버라이드 — 미설정=Unity 상수(0.055) 사용 */
  eyelinerInnerLift?: number;
  /** 아이섀도 밴드 높이 배수 (스모키 정도) */
  eyeshadowHeight?: number;
  /** 속눈썹 길이 배수 */
  mascaraLength?: number;
  /** 속눈썹 모양: 0=내추럴 1=돌리 2=캣아이 3=오픈아이 4=위스피 */
  mascaraStyle?: number;
  /** 아래 속눈썹 모양 — 위와 같은 5종, 값 독립 */
  lowerLashStyle?: number;
  /** 하안검 밴드 높이 배수 (애교살 두께) */
  aegyoHeight?: number;
  /** 립라이너 폭 배수 */
  lipLinerWidth?: number;
  /** 블러셔 위/아래 (캐노니컬 UV 오프셋, + = 위) */
  blushLift?: number;
  /** 블러셔 바깥/안쪽 (+ = 바깥, 좌우 미러) */
  blushSpread?: number;
  /** 블러셔 모양: 0=클래식(양볼) 1=이가리(코걸침 한 장) 2=드레이핑(관자 스윕). 생략 시 0 */
  blushShape?: number;
  /** 하이라이터·컨투어 핏 아핀(A17 확장, 블러셔 lift/spread 일반화) — 캐노니컬 UV, 생략 0 */
  highlightLift?: number;
  highlightSpread?: number;
  contourLift?: number;
  contourSpread?: number;
  /** 가장자리 softness 상대 스케일(A14 재베이크, +=더 부드럽게). 0=기본 마스크 */
  blushEdgeSoftness?: number;
  highlightEdgeSoftness?: number;
  contourEdgeSoftness?: number;
  /** ── 얼굴형 보정 워프(형태 보정, 골드) — 0=원래. 전역 농도 스케일 제외 ── */
  /** 눈확대 (홍채 중심 방사 스케일) 0..1. 배경 역워프+메이크업 순워프 정합 */
  eyeEnlarge?: number;
  /** 얼굴형 보정 — −1..+1 부호형(0=원래). 단일 턱슬림은 기괴한 V가 돼 부위 분해 */
  chinScale?: number;      // 턱끝 크기 (+=확대)
  jawWidth?: number;       // 턱 너비 (+=넓게)
  chinLength?: number;     // 턱 길이 (+=길게)
  lowerFaceScale?: number; // 하관 전체 (−=좁고 짧게 = 동안)
  jawCorner?: number;      // 사각턱 (+=각지게, −=깎기)
  cheekWidth?: number;     // 광대 폭 (+=넓게)
  mouthScale?: number;     // 입 크기 (+=확대)
  noseWingScale?: number;  // 콧볼 (+=확대)
  noseBridge?: number;     // 콧대 (−=슬림(주 방향) +=넓게)
  foreheadHeight?: number; // 이마 높이 (+=높게)
  browLift?: number;       // 눈썹 높이 (+=올림)
  browTilt?: number;       // 눈썹 기울기 (+=꼬리 위)
  browGap?: number;        // 눈썹 간격 (+=넓게)
  /** ── R2 그라데이션(설계 §3.1 색축) — 생략 시 gradient 0 = 끔 = 기존 출력 ── */
  /** 립 그라데 스톱B "#RRGGBB" (안쪽=입 라인 진한 색). 생략 = lipColor와 동일 취급 */
  lipColor2?: string;
  /** 립 그라데 강도 0..1 (0=끔). 두 색 혼합 비율이지 농도 아님 */
  lipGradient?: number;
  /** 아이섀도 그라데 스톱B "#RRGGBB" (리드=속눈썹 라인 진한 색). 생략 = eyeshadowColor와 동일 취급 */
  eyeshadowColor2?: string;
  /** 아이섀도 그라데 강도 0..1 (0=끔) */
  eyeshadowGradient?: number;
  /** ── 부위 확장 팩 #19b (신규 렌더 4종 배선) — 전부 생략=0/기본=끔=기존 동작 ── */
  /** 삼각존(눈꼬리 아래 삼각 음영) 색 "#RRGGBB". 생략 = Unity 기본 #4A342A */
  triangleZoneColor?: string;
  /** 삼각존 음영 강도 0..1 (0=끔). 하안검 밴드 렌더러(LowerLidRenderer) */
  triangleZoneIntensity?: number;
  /** 쌍꺼풀(크리스 라인) 강도 0..1 (0=끔). 색은 자연 음영 고정 */
  doubleLidIntensity?: number;
  /** 쌍꺼풀 크리스 높이 배수 (1=기본, 생략 0은 Unity가 1 보정). 골드=핏 */
  doubleLidHeight?: number;
  /** 베이스립(입술 원색 정리) 색 "#RRGGBB". 생략 = Unity 기본 누드 #D9A896 */
  lipBaseColor?: string;
  /** 베이스립 커버 강도 0..1 (0=끔). 립 색과 독립으로 켜짐 */
  lipBaseIntensity?: number;
  /** 립글로스(독립 광 톱코트) 틴트 "#RRGGBB". 생략 = 흰색(무색 광) */
  lipGlossColor?: string;
  /** 립글로스 광량 0..1 (0=끔). 마감과 독립(매트 위에도 얹힘) */
  lipGlossIntensity?: number;
  /** ── 축 개선 5건 #19b (모양 축) — 생략 0 = 기존 동작 ── */
  /** 아이섀도 모양: 0=리드 전체 1=크리스 집중 2=스모키 3=꼬리 포인트. 생략 0 */
  eyeshadowShape?: number;
  /** 눈썹 모양(슬롯 공통): 0=내추럴 1=일자 2=아치 3=각진. 생략 0 */
  browShape?: number;
  /** 부분 커버 모양: 0=눈밑 존 1=붉은기 자동(붉은 픽셀 선택 커버). 생략 0 */
  concealerShape?: number;
  /** 파우더 존: 0=전체 1=T존 2=볼 제외. 생략 0 */
  powderShape?: number;
  /** ── 디자이너 마스크 임포트(모양 축, §16) 세션 상태 — 1=이번 세션 커스텀 존 마스크
   *  적용됨. UI 상태 마커일 뿐이라 Unity FilterParams엔 없다(JsonUtility가 무시). 마스크
   *  픽셀 스왑은 별도 setRegionMask 브리지로 처리하고, 파일 경로는 저장 스냅샷에 안 담긴다
   *  (기존 set*Style 임포트와 동일 한계 — 강도/마커는 남고 그림 파일은 재선택). */
  blushMaskImported?: number;
  highlightMaskImported?: number;
  contourMaskImported?: number;
  /** 아이섀도 디자이너 마스크(모양 축, §16) — Unity가 setRegionMask region=="eyeshadow"를
   *  특수분기로 IrisRenderer(밴드 로컬 UV)에 라우팅. 빈 path=절차 밴드 복원. */
  eyeshadowMaskImported?: number;
  /** ── 질감 맵 임포트(#22, 에셋 3층의 ③) 세션 상태 — 1=이번 세션 광 지도(마감 변조)
   *  적용됨. 마스크 마커와 동일한 UI 상태 마커(Unity FilterParams엔 없음 — JsonUtility
   *  무시). 맵 픽셀은 별도 setTextureMap 브리지로 스왑, 파일 경로는 저장 스냅샷 미포함
   *  (기존 set*Style·마스크 임포트와 동일 한계 — 강도/마커는 남고 그림 파일은 재선택). */
  lipFinishMapImported?: number;
  eyeshadowFinishMapImported?: number;
  blushFinishMapImported?: number;
  /** ── 베이스 팩(#18) — 파운데이션·파우더·톤 베이스·프라이머 윤광 ──
   *  전부 생략=0/""=기존 픽셀 동일. 톤/파우더/윤광은 얼굴 메시(FaceMakeup 머티리얼),
   *  파운데이션은 메시 + 이마·목 세그 확장(CameraFeed 전역, 세그 폴백 시 메시만). */
  /** 파운데이션 색 "#RRGGBB" (밝은 쿨~딥 웜). 생략 = Unity 기본 스킨톤 */
  foundationColor?: string;
  /** 파운데이션 커버리지 0..1 (0=끔). 높을수록 잡티·색편차 감쇠 */
  foundationIntensity?: number;
  /** 파운데 제형: 0=리퀴드(기본) 1=쿠션(커버↑) 2=스킨틴트(커버↓). 생략 0 */
  foundationTexture?: number;
  /** 파운데이션 마감: 0=새틴(기본) 1=매트 2=듀이. 생략 시 0 */
  foundationFinish?: number;
  /** 파우더(유분광 억제, 세팅) 0..1 (0=끔). 파운데이션과 독립 */
  powderIntensity?: number;
  /** 컬러 파우더 캐스트 "#RRGGBB" (""=무색=트랜스루선트=기존 출력). 곱 캐스트 */
  powderColor?: string;
  /** 파우더 마감: 0=새틴(기본) 1=매트 2=글로시 3=시머(펄 파우더). 생략 시 0 */
  powderFinish?: number;
  /** 시머 게인 0..1 (powderFinish=3일 때). 생략 시 Unity 기본 0.5 */
  powderShimmer?: number;
  /** 톤 조정 보정색 "#RRGGBB" (""=무색=identity). 농도는 skinBrightening과 공유 */
  toneBaseColor?: string;
  /** 프라이머 윤광(스펙 하이라이트 증폭) 0..1 (0=끔) */
  skinGlow?: number;
  /** ── 제형 스튜디오(#21) — 마감(finish) 세부 파라미터 ──
   *  enum(*Finish)의 내부 빛 반응을 노출해 커스텀 제형 제작. 립·아이섀도·블러셔.
   *  전부 생략(0)=미지정=enum 기존 동작 — Unity 셰이더 ApplyFinish(Finish.cginc)가
   *  다섯 값 합이 0이면 레거시 enum 경로로 분기(하위호환 대수 검증). */
  /** 광 임계(낮=넓은 은은광 / 높=정점만 유리광) 0..1 */
  lipGlossLo?: number;
  /** 광 게인(매트↔글로시) 0..1 */
  lipGlossGain?: number;
  /** 펄/시머 입자 크기(고운↔굵은) 0..1 */
  lipShimmerSize?: number;
  /** 펄/시머 밀도 0..1 */
  lipShimmerDensity?: number;
  /** 광 억제(파우더성 매트화) 0..1 */
  lipMatte?: number;
  /** 벨벳 시(sheen) — 은은한 새틴광 톱코트 0..1. 유니폼 _LipSheen. sheen도 셰이더 마감
   *  세부 합 게이트(customAmt)에 포함돼 sheen만 켜도 커스텀 경로 진입 — 단 sheen 항이
   *  sheen에 선형이라 생략=0=무효(머티리얼 기본과 바이트 동일, enum 레거시 경로 무손상) */
  lipSheen?: number;
  eyeshadowGlossLo?: number;
  eyeshadowGlossGain?: number;
  eyeshadowShimmerSize?: number;
  eyeshadowShimmerDensity?: number;
  eyeshadowMatte?: number;
  /** 벨벳 시(sheen) 0..1 — _EyeshadowSheen. 생략=0=무효(바이트 동일) */
  eyeshadowSheen?: number;
  blushGlossLo?: number;
  blushGlossGain?: number;
  blushShimmerSize?: number;
  blushShimmerDensity?: number;
  blushMatte?: number;
  /** 벨벳 시(sheen) 0..1 — _BlushSheen. 생략=0=무효(바이트 동일) */
  blushSheen?: number;
}

/** 실기기 캘리브레이션 파라미터 (Unity CalibrationParams와 동일 구조) */
export interface CalibrationParams {
  flipY: boolean;
  /** -1 = 플랫폼별 자동 추정, 그 외 0 | 90 | 180 | 270 */
  rotationDegrees: number;
  /** -1 = 기본. 시간 동기 경로에선 표시 회전 (0~3 = 0/90/180/270°) */
  matrixMode: number;
  /** 메시를 반투명 컬러로 표시 (정렬 확인용) */
  debugMesh: boolean;
  /** -1 = 기본, 0 = Off, 1 = Front, 2 = Back — 고개 돌릴 때 접힘(fold-over) 제거 */
  cullMode: number;
  /** 세그 채널 컬러 오버레이 (§11 검증용). 생략 시 false */
  debugSeg?: boolean;
}

/**
 * 렌즈 레이어 한 장 (setLensLayers — 컬러렌즈 3세부(베이스/내부/림) 레이어드 합성, #25).
 * 배열 순서 = 합성 순서(뒤 원소가 위). 각 세부는 방사 UV 구간[inner,outer]에 색·디자인을
 * 블렌드 모드로 얹는다. Unity JsonUtility는 생략 필드를 0으로 읽으므로 모든 필드를 채워 보낼 것.
 * setOverlayLayers와 동일 패턴 — 전 슬롯 교체, designPath는 SetLensLayers가 슬롯별 캐시 로드.
 */
export interface LensLayer {
  /** 세부 부위: 0=베이스(전체 홍채) 1=내부 디테일(동공 주변) 2=테두리 림(외곽 링) */
  part: number;
  /** 렌즈 색 "#RRGGBB" (디자인 텍스처에 곱하는 틴트, 디자인 없으면 순색) */
  color: string;
  /** 블렌드 0..9: 0=노말(덮기) 1=멀티플라이(원래 눈색 비침) 2=스크린(밝게) 3=오버레이(대비)
   *  4=소프트라이트 5=컬러닷지 6=컬러번 7=라이튼 8=다큰 9=하드라이트.
   *  Unity IrisRenderer가 [0,9]로 클램프. 기존 저장물(0~3)은 무손상 */
  blendMode: number;
  /** 레이어 강도 0..1 */
  intensity: number;
  /** 방사 UV 안쪽 경계 0..1 (동공=0, 외곽=1). 베이스·디테일=0, 림=1−두께 */
  inner: number;
  /** 방사 UV 바깥쪽 경계 0..1. 베이스=직경, 디테일=내부직경, 림=1 */
  outer: number;
  /** 방사 디자인 텍스처 경로(꽃무늬·별·헤이즐 등, file:// 허용). 생략 = 절차 방사 그라데 */
  designPath?: string;
}

/**
 * 아이섀도 밴드 한 겹 (setEyeshadowLayers — A14 멀티밴드). 같은 부위 N겹(≤4)을
 * 실제로 겹쳐 렌더한다: 배열 순서 = 아래→위(index 0이 lash에 가장 가까움, 뒤가 위).
 * 겹별 색·강도·마감·모양·그라데·높이가 다르게 실린다. 밴드 높이는 세로 cutoff로
 * 표현(최대 높이 메시 1장 위에서 각 밴드가 자기 높이까지만 그림 — Unity 처리).
 * Unity JsonUtility 규약: 생략=0이라 모든 필드를 채워 보낸다. 겹 1개 이하면
 * 이 배열 대신 legacy 스칼라(params) 경로를 쓴다(하위호환).
 */
export interface EyeshadowLayer {
  color: string;
  /** 그라데 스톱B(리드 진한 색). 생략=color와 동일 취급 */
  color2: string;
  intensity: number;
  /** 마감 enum 0=새틴 1=매트 2=글로시 3=시머 */
  finish: number;
  /** 모양 enum 0=리드 전체 1=크리스 집중 2=스모키 3=꼬리 포인트 */
  shape: number;
  /** 그라데 강도 0..1 (0=단색) */
  gradient: number;
  /** 밴드 높이 배수 (1=기본) — 세로 cutoff로 번역 */
  height: number;
  /** 시머 게인 0..1 (finish=3일 때) */
  shimmer: number;
}

/**
 * 캐노니컬 오버레이 레이어 한 장 (setOverlayLayers — 얼굴 캔버스 N장 합성).
 * 배열 순서 = 그리기 순서(뒤 원소가 위). Unity JsonUtility는 생략 필드를 0으로
 * 읽으므로 모든 필드를 항상 채워 보낼 것.
 */
export interface OverlayLayer {
  /** 이미지 파일 경로 (file:// 허용) */
  path: string;
  /** 레이어 강도 0..1 — 마스터 faceOverlayIntensity와 곱해진다 */
  intensity: number;
  /** 배치 중심 x (캐노니컬 UV, 0.5 = 중앙) */
  x: number;
  /** 배치 중심 y (캐노니컬 UV, 0.5 = 중앙) */
  y: number;
  /** 캔버스 대비 크기 (1 = 전체 캔버스) */
  scale: number;
  /** 회전 (도) */
  rotation: number;
  /** 블렌드: 0=그림 그대로(스티커/데코) 1=색소 틴트(루마 보존 — 블러셔·컨투어급)
   *  2=발광(네온 — 루마 초과 가산, 조명 위 큐에서 렌더돼 어두울수록 도드라짐) */
  blendMode: number;
  /** 텍스처에 곱할 틴트 "#RRGGBB" (생략 = 흰색 = 원본색). builtin:dot의 점 색 */
  color?: string;
  /** 데코 세부부위(중분류) 종류 — 'deco'(점)|'decoTattoo'|'decoGem'|'decoPaint'|'decoEtc'.
   *  렌더에는 영향 없고(공통 오버레이 엔진), 저장·왕복 시 세부부위 복원용. Unity는 무시. */
  kind?: string;
}

/**
 * 튜토리얼 스텐실 (setStencil, #2) — 메이크업 완성본 위에 "어디에·어떤 모양으로
 * 바르는지" 가이드 라인을 켠다. 부위별 on/off + 마스터 농도 + 펄스/대시 연출.
 * opacity=0 또는 전 부위 false = 가이드 없음. Unity StencilGuideRenderer가 소비.
 * Unity 대응: unity/Assets/Scripts/Bridge/BridgeMessages.cs StencilParams.
 */
export interface StencilParams {
  /** 마스터 농도 0..1 (0 = 가이드 끔) */
  opacity: number;
  /** 립 라인(외곽) */
  lips: boolean;
  /** 눈썹 모양(외곽 링) */
  brows: boolean;
  /** 아이섀도 존(리드~크리스 밴드) */
  eyeshadow: boolean;
  /** 아이라인(상안검 lash 라인) — #2 Phase 2 */
  eyeliner: boolean;
  /** 애교살(하안검 lash 라인) — #2 Phase 2 */
  aegyo: boolean;
  /** 블러셔 존(볼 타원) */
  blush: boolean;
  /** 하이라이터(캐노니컬 UV 존 투영) — #2 Phase 3 */
  highlighter: boolean;
  /** 컨투어(광대 밑 음영 라인) */
  contour: boolean;
  /** 호흡(사인 알파) 연출 */
  pulse: boolean;
  /** 마칭 앤츠(점선 흐름) 연출 */
  dash: boolean;
}

/**
 * 좌우 대칭 가이드 (setSymmetry, #6) — 얼굴 중심축 + 대칭 쌍 커넥터(색=편차)로
 * 좌우 비대칭을 실시간 표시. opacity=0 또는 둘 다 false = 가이드 없음.
 * Unity 대응: unity/Assets/Scripts/Bridge/BridgeMessages.cs SymmetryParams.
 */
export interface SymmetryParams {
  /** 마스터 농도 0..1 (0 = 끔) */
  opacity: number;
  /** 얼굴 중심축(세로선) */
  midline: boolean;
  /** 대칭 쌍 커넥터(눈썹·눈꼬리·콧볼·입꼬리, 색=편차) */
  pairs: boolean;
}

/**
 * 조명 시뮬레이션 (setLighting, #4) — 완성 화면을 프리셋 조명으로 그레이드 미리보기.
 * preset 0 또는 intensity 0 = 끔. Unity 대응: BridgeMessages.cs LightingParams.
 */
export interface LightingParams {
  /** 0=끔 1=자연광 2=형광등 3=노을 4=실내 5=커스텀 */
  preset: number;
  /** 그레이드 세기 0..1 (원본↔조명 블렌드) */
  intensity: number;
  /** 커스텀(preset=5) 색온도 0..1 (0=따뜻 0.5=중립 1=차가움) */
  temperature: number;
}

/**
 * 반반 모드 (setSplit) — 완성본 절반 vs 맨얼굴 절반 비교. mode 0=전체 1=왼쪽 메이크업
 * 2=오른쪽 메이크업. Unity 대응: BridgeMessages.cs SplitParams. 가이드도 전역 추종.
 */
export interface SplitParams {
  /** 0=전체 1=왼쪽 메이크업 2=오른쪽 메이크업 */
  mode: number;
}

/**
 * 사진→룩 추출(#1) 측정치 — Unity가 레퍼런스 사진 1장에서 온디바이스로 뽑은 부위별 색
 * "숫자"만 담는다(측정=Unity, 룩 번역=RN). hex는 "#RRGGBB", conf는 0..1. 화이트포인트
 * (공막 흰자)로 그레이월드 화이트밸런스한 색을 반환하되, raw whitePoint·lightingConf도
 * 함께 실어 RN이 신뢰도 하향을 판단한다. Unity 대응: BridgeMessages.cs LookMeasurement.
 * (JsonUtility 대응이라 필드명·순서가 C#과 정확히 일치해야 한다.)
 */
export interface LookMeasurement {
  /** 얼굴 검출 여부 — false면 나머지 값 무의미(RN이 안내 후 중단) */
  hasFace: boolean;
  /** 공막 화이트포인트 "#RRGGBB" (그레이월드 화이트밸런스 기준, 원 raw 값) */
  whitePoint: string;
  /** 조명·화이트밸런스 신뢰도 0..1 (눈 감김/저조도면 하향) */
  lightingConf: number;
  /** 맨피부 기준색 "#RRGGBB" (이마+턱, 강도 추정의 대조군) */
  skinBase: string;
  /** 입술 본체 색 "#RRGGBB" */
  lip: string;
  /** 입 안쪽(입 라인) 진한 색 "#RRGGBB" (없으면 빈 문자열 — RN이 lip에서 파생) */
  lipLine: string;
  lipConf: number;
  /** 볼/블러셔 색 "#RRGGBB" */
  blush: string;
  blushConf: number;
  /** 눈두덩/아이섀도 색 "#RRGGBB" */
  eyeshadow: string;
  eyeshadowConf: number;
  /** 눈썹 털 색 "#RRGGBB" */
  brow: string;
  browConf: number;
  /** 홍채 색 "#RRGGBB" (RN이 자연 눈색 vs 컬러렌즈 게이팅) */
  iris: string;
  irisConf: number;
}

export type RNToUnityMessage =
  | { type: 'applyFilter'; filter: FilterParams }
  | { type: 'capture' }
  /** 영상 녹화 시작 — 오프스크린 합성(카메라+메이크업, UI 없음)을 H.264 .mov로.
   *  성공 시 recordingStarted, 이후 stopRecording으로 종료 → videoCaptured. iOS 전용 */
  | { type: 'startRecording' }
  /** 영상 녹화 종료 → finalize + 앨범 저장 → videoCaptured(경로) */
  | { type: 'stopRecording' }
  /** 저장 옵션 — saveUnmirror: 전면 셀피를 거울(프리뷰)이 아닌 실제 방향으로 저장 */
  | { type: 'setSaveOptions'; saveUnmirror: boolean }
  | { type: 'setPaused'; paused: boolean }
  /** 카메라 전환. rear는 MediaPipe 설치 시에만 얼굴 트래킹 가능 */
  | { type: 'setCamera'; facing: 'front' | 'rear' }
  /** 실기기 캘리브레이션 (MediaPipe 경로 전용) */
  | { type: 'setCalibration'; calibration: CalibrationParams }
  /** 개발용: 얼굴 메시 UV 와이어프레임 PNG 추출 */
  | { type: 'exportUVTemplate' }
  /** 눈썹 스타일 텍스처 임포트 (파일 경로, file:// 허용) */
  | { type: 'setBrowStyle'; path: string }
  /** 얼굴 룩 오버레이 텍스처 임포트 (UV 템플릿에 그린 투명 PNG, file:// 허용).
   *  N장 합성에선 "슬롯0 한 장" 어댑터 — 새 코드는 setOverlayLayers 사용 */
  | { type: 'setFaceOverlay'; path: string }
  /** 캐노니컬 오버레이 N장 합성 (최대 4장, 전 슬롯 교체). 순서 = 그리기 순서(뒤가 위) */
  | { type: 'setOverlayLayers'; overlayLayers: OverlayLayer[] }
  /** 렌즈 레이어드 합성 (#25, 최대 6장, 전 슬롯 교체). 3세부(베이스/내부/림)를 방사 UV
   *  구간에 블렌드 모드로 순서대로 얹는다. designPath는 Unity가 슬롯별 캐시 로드(setOverlayLayers
   *  선례). 빈 배열 = 레이어드 끄고 legacy irisColor/irisIntensity 어댑터 경로로 복귀 */
  | { type: 'setLensLayers'; lensLayers: LensLayer[] }
  /** 아이섀도 멀티밴드(A14) — 겹 2개 이상일 때만(1개 이하=legacy 스칼라 경로) */
  | { type: 'setEyeshadowLayers'; eyeshadowLayers: EyeshadowLayer[] }
  /** 아이라인 스타일 텍스처 임포트 (밴드에 워프, file:// 허용) */
  | { type: 'setEyelinerStyle'; path: string }
  /** 립 그림 텍스처 임포트 (립 메시에 워프, file:// 허용) */
  | { type: 'setLipStyle'; path: string }
  /** 볼 그림 텍스처 임포트 (광대 쿼드에 워프, file:// 허용) */
  | { type: 'setBlushStyle'; path: string }
  /** 애교살 그림 텍스처 임포트 (하안검 밴드에 워프, file:// 허용) */
  | { type: 'setAegyoStyle'; path: string }
  /** 디자이너 마스크 임포트 (모양 축, §16) — 부위 "존"을 흑백/알파 스텐실로 스왑.
   *  region: 'blush' | 'highlighter' | 'contour'. 빈 path = 절차 마스크 복원.
   *  색·마감·농도 축은 그대로(마스크=색 없는 존, 색은 앱이 칠함). file:// 허용 */
  | { type: 'setRegionMask'; region: string; path: string }
  /** 질감 맵 임포트 (#22, 에셋 3층의 ③) — 픽셀별 광 지도(R 광게인·G 시머밀도)로 부위
   *  마감을 변조. region: 'lip' | 'eyeshadow' | 'blush'. 빈 path = 맵 해제(스칼라 균일
   *  복원, 하위호환). 컬러 아트(무엇을)·마스크(어디에)와 구분되는 "어떻게 빛나는지".
   *  straight 텍스처라 판정 불필요(마스크와 다름). file:// 허용 */
  | { type: 'setTextureMap'; region: string; path: string }
  /** 튜토리얼 스텐실 (#2) — 부위 가이드 라인 on/off·농도·연출. StencilGuideRenderer 소비 */
  | { type: 'setStencil'; stencil: StencilParams }
  /** 좌우 대칭 가이드 (#6) — 중심축·대칭 쌍 커넥터. SymmetryGuideRenderer 소비 */
  | { type: 'setSymmetry'; symmetry: SymmetryParams }
  /** 조명 시뮬레이션 (#4) — 프리셋 조명 그레이드 미리보기. LightingSimRenderer 소비 */
  | { type: 'setLighting'; lighting: LightingParams }
  /** 반반 모드 — 완성본 절반 vs 맨얼굴 절반 비교. SplitMaskRenderer 소비(가이드 추종) */
  | { type: 'setSplit'; split: SplitParams }
  /** 온페이스 핏 핸들(A17) 좌표 방출 토글 — 켜면 Unity가 fitHandles를 ~10Hz 방출 */
  | { type: 'setFitHandles'; fitHandles: boolean }
  /** ── 사전 촬영 미디어 보정(사진/영상) ── MediaEditController 소비. iOS·MediaPipe 전용 */
  /** 갤러리 사진을 편집 스틸로 로드 — EXIF 정립 정규화 + 얼굴 검출 1회 → editReady */
  | { type: 'enterPhotoEdit'; path: string }
  /** 영상 첫 프레임을 편집 스틸로 로드(적용 대상 영상 기억) → editReady. 이후 applyVideoEdit */
  | { type: 'enterVideoEdit'; path: string }
  /** 편집 중인 스틸을 소스 해상도로 합성 저장(앨범) → editPhotoSaved */
  | { type: 'saveEditedPhoto' }
  /** 기억한 영상 전체에 현재 룩을 오프라인 적용 → videoEditProgress… → videoEditDone */
  | { type: 'applyVideoEdit' }
  /** 편집 모드 종료(라이브 카메라 복귀) → editExited */
  | { type: 'exitEdit' }
  /** ── 사진→룩 추출(#1) ── LookExtractController 소비. iOS·MediaPipe 전용 */
  /** 갤러리 레퍼런스 사진 → 온디바이스 색 측정 1회 → lookExtracted. 라이브 화면은 유지 */
  | { type: 'extractLook'; path: string }
  /** 개발용: 추출 화이트밸런스(그레이월드) 끄기 — disableWhiteBalance=true면 다음 추출부터
   *  gain 적용을 건너뛰고 raw 색을 반환(색 왜곡이 WB 탓인지 원색과 비교). 상태는 Unity에
   *  저장되어 이후 extractLook에 유지된다 */
  | { type: 'setExtractDebug'; disableWhiteBalance: boolean };

export type UnityToRNMessage =
  | { type: 'ready' }
  | { type: 'faceTracked'; tracked: boolean }
  /** 온페이스 핏 핸들(A17) 좌표 — 뷰포트 0..1(Unity 규약, y=아래→위). ~10Hz,
   *  setFitHandles로 켠 동안만. eyeVp=눈꼬리간 뷰포트 거리(드래그 정규화 스케일) */
  | {
      type: 'fitHandles';
      handles: { key: string; x: number; y: number }[];
      eyeVp: number;
    }
  | { type: 'photoCaptured'; path: string }
  /** 영상 녹화가 시작됨 (UI에서 녹화 표시등 켜기용) */
  | { type: 'recordingStarted' }
  /** 영상 녹화 완료 — .mov 파일 저장·앨범 추가 후 경로 통지 */
  | { type: 'videoCaptured'; path: string }
  | { type: 'uvTemplateExported'; path: string }
  /** ── 사전 촬영 미디어 보정 응답 ── */
  /** 편집 스틸(사진/영상 첫 프레임) 로드 완료 — tracked: 얼굴 검출 여부 */
  | { type: 'editReady'; tracked: boolean }
  /** 편집 사진 저장 완료(앨범) */
  | { type: 'editPhotoSaved'; path: string }
  /** 영상 오프라인 처리 진행률 0..1 */
  | { type: 'videoEditProgress'; progress: number }
  /** 영상 편집본 저장 완료(앨범) */
  | { type: 'videoEditDone'; path: string }
  /** 편집 모드 종료(라이브 복귀) */
  | { type: 'editExited' }
  /** 사진→룩 추출(#1) 측정 완료 — 부위별 색 측정치. RN이 measurementToLook로 번역 */
  | { type: 'lookExtracted'; lookMeasurement: LookMeasurement }
  | { type: 'error'; message: string };

export function parseUnityMessage(raw: string): UnityToRNMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg && typeof msg.type === 'string') {
      return msg as UnityToRNMessage;
    }
  } catch {
    // Unity가 보낸 메시지가 아니면 무시
  }
  return null;
}
