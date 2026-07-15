import type {FilterParams, LensLayer, OverlayLayer} from './bridge/types';

export interface FilterPreset {
  id: string;
  name: string;
  params: FilterParams;
  /** 레이어드 렌즈(#25) — 프리셋이 렌즈를 표현하는 경로. legacy irisColor/irisIntensity
   *  대신 이걸 쓴다(iris 리전 폐지). buildSystemLibrary가 seedLayers로 잎 복원. */
  lensLayers?: LensLayer[];
  /** 데코 오버레이(주근깨·젬 등 캐노니컬 데칼) — buildSystemLibrary가 seedLayers로
   *  데코 잎 복원. 컴파일 시 faceOverlayIntensity가 0이면 0.85로 자동 보정된다. */
  overlayLayers?: OverlayLayer[];
}

/** 보정이 전혀 없는 원본 상태 */
export const BARE: FilterParams = {
  skinSmoothing: 0,
  matteGrain: 0,
  skinBrightening: 0,
  // 세그 확장 — 이마·목 스무딩(스킨과 독립)·헤어 염색 (레이어 추가 시 색 시작값)
  skinSmoothingExtended: 0,
  hairTintColor: '#3B2A20',
  hairTintIntensity: 0,
  lipColor: '#C94F6D',
  lipIntensity: 0,
  lipFinish: 0, // 새틴(기본). 매트=1 글로시=2 시머=3
  lipMaterial: 0, // 없음(기본). 벨벳=1 메탈=2 홀로그램=3
  lipMaterialStrength: 0.85,
  lipShimmer: 0.5,
  lipOverline: 0, // 오버립 워프 (0=원래)
  // R2 그라데 — 색2는 색1과 동일 시작(단색), 강도 0 = 끔 = 기존 출력
  lipColor2: '#C94F6D',
  lipGradient: 0,
  blushColor: '#F08FA0',
  blushIntensity: 0,
  blushFinish: 0, // 새틴(기본)
  blushShimmer: 0.5,
  blushMaterial: 0, // 없음(기본). 벨벳=1 메탈=2 홀로그램=3
  blushMaterialStrength: 0.85,
  // 입자 레이어(8축) — 기본 off(density 0). 부위 소유(regions.ts blush defaults)라
  // 프리셋이 값을 실으면 컴파일에 보존된다. 파티클=글리터 도구(펄은 별도/MatCap 예정).
  blushParticleSize: 0.4,
  blushParticleDensity: 0,
  blushParticleBrightness: 0.85,
  blushParticleColor: '#FFF2D9',
  blushParticleTwinkle: 1,
  blushParticleShape: 0,
  blushParticleFeather: 0,
  blushParticleParallax: 0.4,
  blushParticleConfetti: 0,
  eyeshadowColor: '#B06A4E',
  eyeshadowIntensity: 0,
  eyeshadowFinish: 0, // 새틴(기본)
  eyeshadowMaterial: 0, // 없음(기본). 벨벳=1 메탈=2 홀로그램=3
  eyeshadowMaterialStrength: 0.85,
  eyeshadowShimmer: 0.5,
  // R2 그라데 — 색2는 색1과 동일 시작(단색), 강도 0 = 끔 = 기존 출력
  eyeshadowColor2: '#B06A4E',
  eyeshadowGradient: 0,
  irisColor: '#5B7B8C',
  irisIntensity: 0,
  eyelinerColor: '#181418',
  eyelinerIntensity: 0,
  eyelinerStyle: 0,
  browColor: '#4A3428',
  browIntensity: 0,
  browPowderColor: '#4A3628',
  browPowderIntensity: 0,
  browPowderTexture: 0, // 파우더(기본)
  browPowderFinish: 0, // 새틴(기본)
  browPowderShimmer: 0.5,
  browLightenerIntensity: 0,
  browPencilColor: '#2A1E16',
  browPencilIntensity: 0,
  browStyleColor: '#3A2A20',
  browStyleIntensity: 0,
  browThickness: 1,
  browArch: 0,
  faceOverlayIntensity: 0,
  eyelinerStyleIntensity: 0,
  lipStyleIntensity: 0,
  lipStyleSparkle: 0, // 데칼 글리터 명멸(0=끔)
  blushStyleIntensity: 0,
  blushStyleSparkle: 0,
  highlightColor: '#FFF2DB',
  highlightIntensity: 0,
  highlightFinish: 0, // 새틴(기본)
  highlightShimmer: 0.5,
  contourColor: '#9E806B',
  contourIntensity: 0,
  contourFinish: 0, // 새틴(기본)
  contourShimmer: 0.5,
  concealerColor: '#FADCC2',
  concealerIntensity: 0,
  // 베이스 팩(#18) — 전부 0/""=기존 픽셀 동일
  foundationColor: '#E8C4A8',
  foundationIntensity: 0,
  foundationFinish: 0, // 새틴(기본). 매트=1 듀이=2
  powderIntensity: 0,
  powderColor: '', // 무색(트랜스루선트)
  powderFinish: 0, // 새틴(기본)
  powderShimmer: 0.5,
  toneBaseColor: '', // 무색(identity)
  skinGlow: 0,
  aegyoIntensity: 0,
  aegyoStyleIntensity: 0,
  aegyoColor: '', // 빈 값 = Unity 기본 톤(하이라이트/섀도 상수) 유지
  aegyoFinish: 0, // 새틴(기본)
  aegyoShimmer: 0.5,
  eyeshadowLowerColor: '#7A5A4E', // 아이섀도 하(A3) 기본 브라운
  eyeshadowLowerIntensity: 0,
  eyeshadowLowerFinish: 0, // 새틴(기본)
  eyeshadowLowerShimmer: 0.5,
  eyeEnlarge: 0,
  chinScale: 0,
  jawWidth: 0,
  chinLength: 0,
  lowerFaceScale: 0,
  jawCorner: 0,
  cheekWidth: 0,
  mouthScale: 0,
  noseWingScale: 0,
};

export const PRESETS: FilterPreset[] = [
  {id: 'bare', name: '원본', params: BARE},
  // 쌩얼에서 직접 하나하나 골라 입히는 시작점 (BARE와 동일하지만, 선택 시 조정
  // 패널이 자동으로 열려 부위별로 쌓아 올릴 수 있다 — App.selectPreset 참고).
  {id: 'custom', name: '직접', params: BARE},
  {
    id: 'natural',
    name: '내추럴',
    params: {
      skinSmoothing: 0.45,
      skinSmoothingExtended: 0.18,
      skinBrightening: 0.1,
      lipColor: '#D96C7B',
      lipIntensity: 0.35,
      blushColor: '#F2A0AC',
      blushIntensity: 0.25,
      eyeshadowColor: '#C29A7B',
      eyeshadowIntensity: 0.15,
      irisColor: '#5B7B8C',
      irisIntensity: 0,
      eyelinerColor: '#181418',
      eyelinerIntensity: 0.25,
      eyelinerStyle: 0,
      // 내추럴 — 자연스러운 소프트 브로우 (기본 옅게)
      browColor: '#4A3428',
      browIntensity: 0.27,
      browPowderColor: '#4A3628',
      browPowderIntensity: 0.18,
      browLightenerIntensity: 0,
      browPencilColor: '#2A1E16',
      browPencilIntensity: 0,
      browStyleColor: '#3A2A20',
      browStyleIntensity: 0,
      browThickness: 1,
      browArch: 0,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFF2DB',
      highlightIntensity: 0,
      contourColor: '#9E806B',
      contourIntensity: 0,
      concealerColor: '#FADCC2',
      concealerIntensity: 0,
    },
  },
  {
    id: 'rosy',
    name: '로지',
    params: {
      skinSmoothing: 0.55,
      skinSmoothingExtended: 0.22,
      skinBrightening: 0.14,
      lipColor: '#E04E68',
      lipIntensity: 0.55,
      blushColor: '#F08698',
      blushIntensity: 0.45,
      eyeshadowColor: '#D89AA0',
      eyeshadowIntensity: 0.3,
      irisColor: '#6E8B5B',
      irisIntensity: 0,
      eyelinerColor: '#181418',
      eyelinerIntensity: 0.35,
      eyelinerStyle: 0,
      // 로지 — 살짝 더 또렷하고 아치 올림 (기본 옅게)
      browColor: '#4A3428',
      browIntensity: 0.3,
      browPowderColor: '#4A3628',
      browPowderIntensity: 0.24,
      browLightenerIntensity: 0,
      browPencilColor: '#2A1E16',
      browPencilIntensity: 0,
      browStyleColor: '#3A2A20',
      browStyleIntensity: 0,
      browThickness: 1,
      browArch: 0.08,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFF2DB',
      highlightIntensity: 0,
      contourColor: '#9E806B',
      contourIntensity: 0,
      concealerColor: '#FADCC2',
      concealerIntensity: 0,
    },
  },
  {
    id: 'peach',
    name: '피치',
    params: {
      skinSmoothing: 0.5,
      skinSmoothingExtended: 0.2,
      skinBrightening: 0.16,
      lipColor: '#F2846B',
      lipIntensity: 0.5,
      blushColor: '#F7A98C',
      blushIntensity: 0.4,
      eyeshadowColor: '#E0A183',
      eyeshadowIntensity: 0.25,
      irisColor: '#8A6A4A',
      irisIntensity: 0,
      eyelinerColor: '#181418',
      eyelinerIntensity: 0.3,
      eyelinerStyle: 2,
      // 피치 — 밝은 갈색, 옅고 가벼운 브로우
      browColor: '#6B5240',
      browIntensity: 0.24,
      browPowderColor: '#6B5240',
      browPowderIntensity: 0.18,
      browLightenerIntensity: 0,
      browPencilColor: '#5A4433',
      browPencilIntensity: 0,
      browStyleColor: '#5A4433',
      browStyleIntensity: 0,
      browThickness: 1,
      browArch: 0,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFF2DB',
      highlightIntensity: 0,
      contourColor: '#9E806B',
      contourIntensity: 0,
      concealerColor: '#FADCC2',
      concealerIntensity: 0,
    },
  },
  {
    id: 'glam',
    name: '글램',
    params: {
      skinSmoothing: 0.6,
      skinSmoothingExtended: 0.24,
      skinBrightening: 0.12,
      lipColor: '#B01E3C',
      lipIntensity: 0.7,
      blushColor: '#D97386',
      blushIntensity: 0.3,
      // 고운 글리터 블러셔 — 부드러운 윤곽(feather 1) + 곱고 촘촘 + 은은. (파티클=글리터 도구,
      // 진짜 펄은 MatCap/연속 sheen 예정)
      blushParticleSize: 0.35,
      blushParticleDensity: 0.85,
      blushParticleBrightness: 0.6,
      blushParticleColor: '#FFE7C2',
      blushParticleTwinkle: 1,
      blushParticleShape: 0,
      blushParticleFeather: 1,
      blushParticleParallax: 0.4,
      eyeshadowColor: '#8A5A44',
      eyeshadowIntensity: 0.5,
      // legacy 렌즈 off — 실제 렌즈는 아래 lensLayers(레이어드)로 이관
      irisColor: '#5B7B8C',
      irisIntensity: 0,
      eyelinerColor: '#141014',
      eyelinerIntensity: 0.6,
      eyelinerStyle: 0,
      // 글램 — 진하고 또렷하게, 펜슬로 정의 + 아치 강조 (기본 톤다운)
      browColor: '#2A1E16',
      browIntensity: 0.36,
      browPowderColor: '#3A2A20',
      browPowderIntensity: 0.27,
      browLightenerIntensity: 0,
      browPencilColor: '#2A1E16',
      browPencilIntensity: 0.27,
      browStyleColor: '#2A1E16',
      browStyleIntensity: 0,
      browThickness: 1.1,
      browArch: 0.15,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFF2DB',
      highlightIntensity: 0,
      contourColor: '#9E806B',
      contourIntensity: 0,
      concealerColor: '#FADCC2',
      concealerIntensity: 0,
    },
    // 렌즈 — legacy 단색(iris) 폐지 후 레이어드 베이스로 이관(색·강도 동일).
    lensLayers: [
      {part: 0, color: '#5B7B8C', blendMode: 1, intensity: 0.5, inner: 0, outer: 1},
    ],
  },
  {
    id: 'smoky',
    name: '스모키',
    params: {
      skinSmoothing: 0.5,
      skinSmoothingExtended: 0.2,
      skinBrightening: 0.08,
      lipColor: '#A65560',
      lipIntensity: 0.4,
      blushColor: '#C98A93',
      blushIntensity: 0.2,
      eyeshadowColor: '#5C4A46',
      eyeshadowIntensity: 0.65,
      // legacy 렌즈 off — 실제 렌즈는 아래 lensLayers(레이어드)로 이관
      irisColor: '#7A6A9E',
      irisIntensity: 0,
      eyelinerColor: '#141014',
      eyelinerIntensity: 0.7,
      eyelinerStyle: 1,
      // 스모키 — 가장 진하고 풍성하게, 곧은 일자 느낌 (기본 톤다운)
      browColor: '#2A1E16',
      browIntensity: 0.4,
      browPowderColor: '#2A1E16',
      browPowderIntensity: 0.3,
      browLightenerIntensity: 0,
      browPencilColor: '#2A1E16',
      browPencilIntensity: 0.18,
      browStyleColor: '#2A1E16',
      browStyleIntensity: 0,
      browThickness: 1,
      browArch: 0,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFF2DB',
      highlightIntensity: 0,
      contourColor: '#9E806B',
      contourIntensity: 0,
      concealerColor: '#FADCC2',
      concealerIntensity: 0,
    },
    // 렌즈 — legacy 단색(iris) 폐지 후 레이어드 베이스로 이관(색·강도 동일).
    lensLayers: [
      {part: 0, color: '#7A6A9E', blendMode: 1, intensity: 0.55, inner: 0, outer: 1},
    ],
  },
];

/** 립 컬러 스와치 */
export const LIP_COLORS = [
  '#C94F6D',
  '#E04E68',
  '#B01E3C',
  '#F2846B',
  '#D96C7B',
  '#9E3B54',
];

/** 아이섀도 스와치 (뉴트럴 브라운~로즈~스모키) */
export const EYESHADOW_COLORS = [
  '#B06A4E',
  '#C29A7B',
  '#D89AA0',
  '#8A5A44',
  '#5C4A46',
  '#6E5A8A',
];

/** 아이라이너 스와치 (블랙~브라운~버건디) */
// 애교살 하이라이트 펄 톤(§5 aegyoColor — Unity 하이라이트=지정색·섀도=파생)
export const AEGYO_COLORS = [
  '#FFF3E2', // 샴페인(기본 톤 근사)
  '#F7E7CE', // 아이보리 펄
  '#FFD9E0', // 핑크 펄
  '#F2D6A0', // 골드
  '#E8E6F5', // 라일락 펄
  '#FFFFFF', // 화이트
];

export const EYELINER_COLORS = [
  '#181418',
  '#141014',
  '#3A2A20',
  '#5A4433',
  '#6E3A2A',
  '#5A2A3A',
];

/** 컬러렌즈 스와치 (그레이블루/그린/바이올렛/블루/헤이즐/내추럴) */
export const IRIS_COLORS = [
  '#5B7B8C',
  '#6E8B5B',
  '#7A6A9E',
  '#4A6E8A',
  '#8A6A4A',
  '#3A3A3A',
];

/** 눈썹 색 (어두운 갈색~밝은 갈색). 마스카라·파우더 공용 팔레트. */
export const BROW_COLORS = [
  '#2A1E16',
  '#3A2A20',
  '#4A3628',
  '#5A4433',
  '#6B5240',
  '#7A6350',
];

/** 블러셔 스와치 (로즈~피치~코랄) */
export const BLUSH_COLORS = [
  '#F08FA0',
  '#E86A80',
  '#E89A7A',
  '#D96C7B',
  '#C96A5E',
  '#B85C6E',
];

/** 하이라이터 스와치 (웜 화이트~샴페인~펄핑크) */
export const HIGHLIGHT_COLORS = [
  '#FFF2DB',
  '#FFE9C8',
  '#F7E3D2',
  '#F2D9C0',
  '#F5DDE2',
  '#EFE6F2',
];

/** 컨투어/섀딩 스와치 (쿨 브라운~웜 브라운) */
export const CONTOUR_COLORS = [
  '#9E806B',
  '#8A6E5A',
  '#A88A70',
  '#7A6250',
  '#B09480',
  '#6E584A',
];

/** 헤어 염색 스와치 (블랙/블루블랙/다크브라운/브라운/애쉬/블론드/와인/로즈브라운) */
export const HAIR_COLORS = [
  '#141216', // 블랙
  '#1E2432', // 블루블랙
  '#3B2A20', // 다크브라운
  '#5A4030', // 브라운
  '#8A7A6A', // 애쉬
  '#C9A26B', // 블론드
  '#6E2A3A', // 와인
  '#9A6A5A', // 로즈브라운
];

/** 컨실러 스와치 (피부톤 단계 6 + 컬러 코렉터 3: 그린/피치/라벤더) */
export const CONCEALER_COLORS = [
  '#FADCC2',
  '#F0DCC8',
  '#E7D3C4',
  '#D8B79C',
  '#C9A488',
  '#B58C6A',
  '#BFE3C8', // 그린 코렉터 — 붉은 트러블 중화
  '#F7C9A8', // 피치 코렉터 — 다크서클 중화
  '#D9C8E8', // 라벤더 코렉터 — 노란기 중화
];

/** 파운데이션 스킨톤 스와치 8 (밝은 쿨 ~ 딥 웜) */
export const FOUNDATION_COLORS = [
  '#F3D9C6', // 밝은 쿨(라이트 뉴트럴)
  '#EFD0BC',
  '#E8C4A8',
  '#DFB79A',
  '#D4A98A',
  '#C4936F',
  '#AE7B57',
  '#946242', // 딥 웜
];

/** 컬러 파우더 캐스트 (무색=트랜스루선트/핑크 톤업/라벤더/그린/피치/베이지 세팅).
 *  톤 베이스와 동일 곱 캐스트 — 옅은 틴트만(흰색=무색=identity). */
export const POWDER_COLORS = [
  '#FFFFFF', // 무색(트랜스루선트)
  '#FBE8EC', // 핑크 톤업
  '#EEE8F6', // 라벤더(노란기 중화)
  '#E4F1E6', // 그린(붉은기 중화)
  '#FAE9DC', // 피치(생기)
  '#F3E7D7', // 베이지(세팅)
];

/** 톤 조정 베이스 보정색 (무색/화이트/그린/퍼플/피치 — 곱 캐스트, 골드·윤광 계열 금지).
 *  옅은 틴트라 multiply가 은은한 색 캐스트만 준다(무색=흰색=identity). */
export const TONE_BASE_COLORS = [
  '#FFFFFF', // 무색(identity)
  '#F2F4F8', // 화이트(백탁, 쿨)
  '#DCF0E2', // 그린(홍조 중화)
  '#ECE2F2', // 퍼플(노란기 잡아 화사)
  '#FBE6D8', // 피치(칙칙함 커버)
];

/** 베이스립(입술 원색 정리) 스와치 — 누드/스킨톤 (커버 후 발색 준비). */
export const LIP_BASE_COLORS = [
  '#D9A896', // 누드 (기본)
  '#E0B7A4',
  '#C99A86',
  '#E8C3B0',
  '#CBA392',
];

/** 립글로스 틴트 스와치 — 기본 투명(흰색)에서 옅은 틴트로. 광량은 별도 농도축. */
export const LIP_GLOSS_COLORS = [
  '#FFFFFF', // 클리어(무색)
  '#FBE9E4',
  '#F7D9D0',
  '#F2C9C0',
  '#E9B7C2',
];

/** 삼각존(눈꼬리 아래 음영) 스와치 — 딥브라운 계열 (기본 #4A342A). */
export const TRIANGLE_COLORS = [
  '#4A342A', // 기본 딥브라운
  '#5A4034',
  '#3E2C24',
  '#6B4A3A',
];
