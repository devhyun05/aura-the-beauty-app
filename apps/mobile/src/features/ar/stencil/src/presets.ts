import type {FilterParams, LensLayer, OverlayLayer} from './bridge/types';
import {
  AR_BLUSH_COLORS,
  AR_BLUSH_DEFAULT_COLOR,
  AR_BLUSH_DEFAULT_SHAPE,
  AR_BLUSH_SHAPES,
} from '../../../../shared/contracts/arBlushCatalog';

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
  skinDetailPreservation: 0.7,
  skinClarity: 0,
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
  blushColor: AR_BLUSH_DEFAULT_COLOR.hex,
  blushIntensity: 0,
  blushShape: AR_BLUSH_DEFAULT_SHAPE.value,
  blushLift: AR_BLUSH_DEFAULT_SHAPE.lift,
  blushSpread: AR_BLUSH_DEFAULT_SHAPE.spread,
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
  highlightHasZoneWeights: 0,
  highlightZoneCheek: 0,
  highlightZoneBridge: 0,
  highlightZoneTip: 0,
  highlightZoneBrow: 0,
  highlightZoneCupid: 0,
  highlightZoneChin: 0,
  contourColor: '#9E806B',
  contourIntensity: 0,
  contourFinish: 0, // 새틴(기본)
  contourShimmer: 0.5,
  concealerColor: '#FADCC2',
  concealerIntensity: 0,
  correctorColor: '#F7C9A8',
  correctorIntensity: 0,
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
  eyeshadowSurface: 2,
  eyelinerThicknessProfile: 0,
  eyelinerTailProfile: 0,
  eyelinerHasGeometryProfiles: 0,
  eyelinerLowerColor: '#3A241E',
  eyeEnlarge: 0,
  chinScale: 0,
  jawWidth: 0,
  chinLength: 0,
  lowerFaceScale: 0,
  jawCorner: 0,
  cheekWidth: 0,
  mouthScale: 0,
  noseWingScale: 0,
  // 아래 필드들은 optional이라 이전엔 BARE에서 생략됐는데, 브리지가 FromJsonOverwrite
  // (병합)라 생략 필드는 직전 룩 값이 유지된다 → 꾹 눌러 원본 볼 때 삼각존·마스카라 등이
  // 안 꺼지고 눈 아래 모양이 남는 버그. BARE는 '완전 맨얼굴'이어야 하므로 전부 명시 0.
  triangleZoneIntensity: 0,
  eyelinerLowerIntensity: 0,
  lowerLashIntensity: 0,
  mascaraIntensity: 0,
  doubleLidIntensity: 0,
  teethWhitenIntensity: 0,
  browConcealIntensity: 0,
  lipBaseIntensity: 0,
  lipGlossIntensity: 0,
  lipLinerIntensity: 0,
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
      skinBrightening: 0.2,
      // 피부톤 — 중립 라이트, 얇은 커버로 결만 정리.
      foundationColor: '#F3D9C6',
      foundationIntensity: 0.18,
      foundationFinish: 0, // 새틴
      lipColor: '#D96C7B',
      lipIntensity: 0.35,
      blushColor: AR_BLUSH_COLORS[3].hex,
      blushIntensity: 0.55,
      blushShape: AR_BLUSH_SHAPES[3].value, // 데일리
      eyeshadowColor: '#C29A7B',
      eyeshadowIntensity: 0.28,
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
      browThicknessProfile: 2,
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
      // 피부 마감 채움 — 얇은 부분 커버 + 무색 세팅 파우더(매트, 최소 강도).
      concealerColor: '#FADCC2',
      concealerIntensity: 0.15,
      powderColor: '#FFFFFF', // 무색(트랜스루선트)
      powderIntensity: 0.12,
      powderFinish: 1, // 매트
      // 세부부위 확충 — 은은한 브라운 마스카라 + 아이보리 애교살(내추럴 컨셉).
      mascaraColor: '#3A2A20',
      mascaraIntensity: 0.28,
      mascaraStyle: 0,
      mascaraLength: 0.95,
      aegyoColor: '#FFF3E2',
      aegyoIntensity: 0.2,
      aegyoFinish: 1, // 매트
      aegyoHeight: 0.85,
    },
  },
  {
    id: 'rosy',
    name: '로지',
    params: {
      skinSmoothing: 0.55,
      skinBrightening: 0.3,
      // 피부톤 — 핑크 언더톤 + 듀이로 물광 로지.
      foundationColor: '#F2D2CC',
      foundationIntensity: 0.28,
      foundationFinish: 2, // 듀이
      lipColor: '#E04E68',
      lipIntensity: 0.55,
      blushColor: AR_BLUSH_COLORS[5].hex,
      blushIntensity: 0.72,
      blushShape: AR_BLUSH_SHAPES[4].value, // 러블리
      eyeshadowColor: '#D89AA0',
      eyeshadowIntensity: 0.45,
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
      browThicknessProfile: 2,
      browThickness: 1,
      browArch: 0.08,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#F5DDE2',
      highlightIntensity: 0.22,
      highlightFinish: 0, // 새틴 글로우
      contourColor: '#9E806B',
      contourIntensity: 0,
      // 피부 마감 채움 — 부분 커버 + 무색 세팅 파우더(물광 유지 위해 매트화 최소).
      concealerColor: '#FADCC2',
      concealerIntensity: 0.2,
      powderColor: '#FFFFFF', // 무색(트랜스루선트)
      powderIntensity: 0.1,
      powderFinish: 1, // 매트
      // 세부부위 확충 — 핑크 펄 애교살 + 브라운 마스카라(로지 물광 컨셉).
      aegyoColor: '#FFD9E0',
      aegyoIntensity: 0.3,
      aegyoFinish: 3,
      aegyoShimmer: 0.35,
      aegyoHeight: 1,
      mascaraColor: '#3A2A20',
      mascaraIntensity: 0.34,
      mascaraStyle: 0,
      mascaraLength: 1,
    },
  },
  {
    id: 'peach',
    name: '피치',
    params: {
      skinSmoothing: 0.5,
      skinBrightening: 0.35,
      // 피부톤 — 웜 코랄 언더톤, 마감은 새틴 유지(립·블러셔가 이미 따뜻함).
      foundationColor: '#F5D4B8',
      foundationIntensity: 0.28,
      foundationFinish: 0, // 새틴
      lipColor: '#F2846B',
      lipIntensity: 0.5,
      blushColor: AR_BLUSH_COLORS[1].hex,
      blushIntensity: 0.68,
      blushShape: AR_BLUSH_SHAPES[6].value, // 선키스드 소프트
      eyeshadowColor: '#E0A183',
      eyeshadowIntensity: 0.55,
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
      browThicknessProfile: 2,
      browThickness: 1,
      browArch: 0,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFE9C8',
      highlightIntensity: 0.2,
      highlightFinish: 0, // 새틴 글로우
      contourColor: '#9E806B',
      contourIntensity: 0,
      // 피부 마감 채움 — 부분 커버 + 무색 세팅 파우더(매트).
      concealerColor: '#FADCC2',
      concealerIntensity: 0.2,
      powderColor: '#FFFFFF', // 무색(트랜스루선트)
      powderIntensity: 0.12,
      powderFinish: 1, // 매트
      // 세부부위 확충 — 브라운 마스카라 + 샴페인 애교살(피치 웜 컨셉).
      mascaraColor: '#3A2A20',
      mascaraIntensity: 0.3,
      mascaraStyle: 0,
      mascaraLength: 1,
      aegyoColor: '#F7E7CE',
      aegyoIntensity: 0.24,
      aegyoFinish: 3,
      aegyoShimmer: 0.3,
      aegyoHeight: 0.9,
    },
  },
  {
    id: 'glam',
    name: '글램',
    params: {
      skinSmoothing: 0.6,
      skinBrightening: 0.25,
      // 피부톤 — 중립, 고커버 + 듀이(무대광 베이스).
      foundationColor: '#EFD0BC',
      foundationIntensity: 0.38,
      foundationFinish: 2, // 듀이
      lipColor: '#B01E3C',
      lipIntensity: 0.7,
      blushColor: AR_BLUSH_COLORS[7].hex,
      blushIntensity: 0.82,
      blushShape: AR_BLUSH_SHAPES[2].value, // 드레이핑
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
      eyeshadowIntensity: 0.62,
      // legacy 렌즈 off — 실제 렌즈는 아래 lensLayers(레이어드)로 이관
      irisColor: '#5B7B8C',
      irisIntensity: 0,
      eyelinerColor: '#141014',
      eyelinerIntensity: 0.6,
      eyelinerStyle: 0,
      // 글램 — 예전의 절차적 펜슬 브로우 복원(사용자 "다시 살려"). 와일드 텍스처는
      // 앞머리가 수평으로 눕고 이상해 폐기. 얇다는 피드백만 반영해 원본보다 살짝
      // 진하고 두껍게(농도 0.36→0.42·펜슬 0.27→0.3·두께 1.1→1.15).
      browColor: '#2A1E16',
      browIntensity: 0.42,
      browPowderColor: '#3A2A20',
      browPowderIntensity: 0.28,
      browLightenerIntensity: 0,
      browPencilColor: '#2A1E16',
      browPencilIntensity: 0.3, // 절차적 펜슬 결(복원)
      browStyleColor: '#2A1E16',
      browStyleIntensity: 0, // 스타일 텍스처 OFF — 절차적 브로우로 복귀
      browStyleTemplate: 0,
      browThicknessProfile: 3, // 원본 글램 두께 프로파일 복원
      browThickness: 1.15, // 살짝 두껍게
      browArch: 0.15,
      faceOverlayIntensity: 0,
      eyelinerStyleIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFE9C8',
      highlightIntensity: 0.28,
      highlightFinish: 0, // 새틴 글로우
      contourColor: '#9E806B',
      contourIntensity: 0,
      // 피부 마감 채움 — 고커버 부분 커버 + 무색 세팅 파우더(듀이 광 유지 위해 매트화 절제).
      concealerColor: '#FADCC2',
      concealerIntensity: 0.3,
      powderColor: '#FFFFFF', // 무색(트랜스루선트)
      powderIntensity: 0.15,
      powderFinish: 1, // 매트
      // 세부부위 확충 — 돌리 볼륨 마스카라 + 윙 라이너(글램 무대 컨셉, 하이라이터는 듀이).
      // 글램은 길고 진하게(내추럴과 확연히 구분): 농도·길이 상향.
      mascaraColor: '#141014',
      mascaraIntensity: 0.72,
      mascaraStyle: 1, // 돌리 볼륨(절차) — 텍스처는 이상함 피드백으로 글램에서 해제, 선택형 룩으로만 유지
      mascaraLength: 1.5,
      eyelinerWingLength: 1.3,
    },
    // 렌즈 — legacy 단색(iris) 폐지 후 레이어드 베이스로 이관(색·강도 동일).
    lensLayers: [
      {part: 0, color: '#5B7B8C', blendMode: 1, intensity: 0.5, inner: 0, outer: 1},
    ],
  },
  {
    // 글램 2.0 — 2026-07 SODA/도우인 레퍼런스 기반 재설계(기존 글램 보존, 신규 항목).
    // 눈: 스타일 아이라이너 v5(default_eyeliner 교체본) + 텍스처 속눈썹 글램(lash_glam,
    // DL1 돌스파이크) — 절차 라이너·마스카라는 끄고 텍스처 경로만 사용.
    // 립: 살색 혼합(0.3) + 글로시 + 그라데(안쪽 딥) + 아랫입술 시럽광 + 워터틴트 경계.
    // 판정 기록: docs/unity-ar/GLAM2_WORKLOG_KO.md
    id: 'glam2',
    name: '글램 2.0',
    params: {
      skinSmoothing: 0.6,
      skinBrightening: 0.25,
      foundationColor: '#EFD0BC',
      foundationIntensity: 0.38,
      foundationFinish: 2, // 듀이
      // 립 — 원본 입술색 70% 투과(강도 0.3) 위 글로시, 그라데(바깥 라이트로즈→입선 딥),
      // 워터틴트 제형(경계 페더 0.14→0.30), 아랫입술 시럽광.
      lipColor: '#C75A70',
      lipColor2: '#8F0F2A',
      lipGradient: 1.0,
      lipIntensity: 0.45, // 0.3은 흐릿(사용자 0723) — 진하게
      lipFinish: 2, // 글로시
      lipTexture: 2, // 워터틴트
      lipGlossColor: '#FFFFFF',
      lipGlossIntensity: 0.7,
      lipGlossShape: 2, // 아랫입술만
      blushColor: '#D97386',
      blushIntensity: 0.3,
      blushParticleSize: 0.35,
      blushParticleDensity: 0.85,
      blushParticleBrightness: 0.6,
      blushParticleColor: '#FFE7C2',
      blushParticleTwinkle: 1,
      blushParticleShape: 0,
      blushParticleFeather: 1,
      blushParticleParallax: 0.4,
      eyeshadowColor: '#8A5A44',
      eyeshadowIntensity: 0.62,
      irisColor: '#5B7B8C',
      irisIntensity: 0,
      // 아이라이너 — 절차 라이너 off, 스타일 텍스처(윙 도안 v5)만.
      eyelinerColor: '#2B2220',
      eyelinerIntensity: 0,
      eyelinerStyle: 0,
      eyelinerStyleIntensity: 0.85,
      browColor: '#2A1E16',
      browIntensity: 0.42,
      browPowderColor: '#3A2A20',
      browPowderIntensity: 0.28,
      browLightenerIntensity: 0,
      browPencilColor: '#2A1E16',
      browPencilIntensity: 0.3,
      browStyleColor: '#2A1E16',
      browStyleIntensity: 0,
      browStyleTemplate: 0,
      browThicknessProfile: 3,
      browThickness: 1.15,
      browArch: 0.15,
      faceOverlayIntensity: 0,
      lipStyleIntensity: 0,
      blushStyleIntensity: 0,
      highlightColor: '#FFE9C8',
      highlightIntensity: 0.28,
      highlightFinish: 0,
      contourColor: '#9E806B',
      contourIntensity: 0,
      concealerColor: '#FADCC2',
      concealerIntensity: 0.3,
      powderColor: '#FFFFFF',
      powderIntensity: 0.15,
      powderFinish: 1,
      // 속눈썹 — 텍스처 글램(위 lash_glam + 아래 lash_glam_lower 자동 동반).
      mascaraColor: '#141014',
      mascaraIntensity: 0.95,
      mascaraStyle: 1,
      mascaraLength: 1.0,
      mascaraTexStyle: 3, // 텍스처 글램(위 DL1 + 아래 low1a v11)
      lowerLashIntensity: 1.0,
      lowerLashLength: 1.0, // 종횡비 잠금(0723) — 1.0 = 도안 각도 완전 보존
    },
    lensLayers: [
      {part: 0, color: '#5B7B8C', blendMode: 1, intensity: 0.5, inner: 0, outer: 1},
    ],
  },
  {
    id: 'smoky',
    name: '스모키',
    params: {
      skinSmoothing: 0.5,
      skinBrightening: 0.15,
      // 피부톤 — 황갈로 한 단계 눌러 매트 마감과 방향을 맞춤.
      foundationColor: '#E8C4A8',
      foundationIntensity: 0.3,
      foundationFinish: 1, // 매트
      lipColor: '#A65560',
      lipIntensity: 0.4,
      blushColor: AR_BLUSH_COLORS[6].hex,
      blushIntensity: 0.58,
      blushShape: AR_BLUSH_SHAPES[2].value, // 드레이핑
      eyeshadowColor: '#5C4A46',
      eyeshadowIntensity: 0.8,
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
      browPencilIntensity: 0, // item3: 두께=밴드 스트레치(펜슬 털 길어짐) 폐기 → 새 dense 텍스처로 이관
      browStyleColor: '#2A1E16',
      browStyleIntensity: 0.7, // item3: 두꺼운 눈썹 = 촘촘한 스타일 텍스처(자연 길이 털)
      browStyleTemplate: 2, // 두꺼운(풍성) 템플릿(default_brow_thick)
      browThicknessProfile: 0, // item3: 밴드 자연 높이 유지(늘리지 않음) → 결이 늘어나지 않음
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
      // 피부 마감 채움 — 부분 커버 + 무색 세팅 파우더(매트 베이스 완성).
      concealerColor: '#FADCC2',
      concealerIntensity: 0.25,
      powderColor: '#FFFFFF', // 무색(트랜스루선트)
      powderIntensity: 0.28,
      powderFinish: 1, // 매트
      // 세부부위 확충 — 하안검 섀도 + 삼각존 + 캣아이 마스카라 + 아래 속눈썹(스모키 딥 컨셉).
      eyeshadowLowerColor: '#5C4A46',
      eyeshadowLowerIntensity: 0.12,
      eyeshadowLowerFinish: 1,
      triangleZoneColor: '#9A5A50', // 붉은기 도는 밝은 톤(다크브라운 X) — 눈밑을 어둡게 안 죽임
      triangleZoneIntensity: 0.22,
      mascaraColor: '#141014',
      mascaraIntensity: 0.5,
      mascaraStyle: 2, // 캣아이
      mascaraLength: 1.05,
      lowerLashStyle: 0,
      lowerLashIntensity: 0.24,
      lowerLashLength: 0.85,
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

/** 눈썹 색상 UI와 렌더 값을 한 순서로 묶어 라벨/인덱스 불일치를 막는다. */
export const BROW_COLOR_OPTIONS = [
  {label: '딥 브라운', color: '#2A1E16'},
  {label: '다크 브라운', color: '#3A2A20'},
  {label: '내추럴 브라운', color: '#4A3628'},
  {label: '애쉬 브라운', color: '#5A4433'},
  {label: '웜 브라운', color: '#6B5240'},
  {label: '토프 브라운', color: '#7A6350'},
  {label: '라이트 브라운', color: '#8A6B52'},
  {label: '퍼플', color: '#6C527E'},
  {label: '와인', color: '#7B3347'},
  {label: '옐로우', color: '#B89B42'},
  {label: '핑크', color: '#B85F7D'},
] as const;

/** 마스카라·파우더 등 기존 팔레트 소비자를 위한 동일 순서의 색상 배열. */
export const BROW_COLORS = BROW_COLOR_OPTIONS.map(option => option.color);

/** 공통 AR 블러셔 카탈로그의 웜·뉴트럴·쿨 8색. */
export const BLUSH_COLORS = AR_BLUSH_COLORS.map(color => color.hex);

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

/** 파운데이션 스킨톤 스와치 10 (밝은 쿨 ~ 딥 웜, 명도 내림차순).
 *  라이트 구간에만 언더톤 변주 2종(코랄/핑크)이 끼어 있다 — 시스템 프리셋이
 *  명도를 붙여 두고 언더톤으로 갈리기 때문에 램프만으로는 표현이 안 된다. */
export const FOUNDATION_COLORS = [
  '#F3D9C6', // 밝은 쿨(라이트 뉴트럴)
  '#F5D4B8', // 라이트 웜(코랄 언더톤)
  '#F2D2CC', // 라이트 쿨(핑크 언더톤)
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
