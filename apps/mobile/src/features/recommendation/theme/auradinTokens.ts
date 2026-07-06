// AURADIN 재디자인 로컬 토큰 — DESIGN.md §1–5 + AURADIN Design System/tokens/*.css의 RN 근사.
//
// ⛔ 하드 제약: 이 팔레트(마젠타/스카이블루/솜사탕핑크/다크몰입)는 features/recommendation
//    안에서만 쓴다. 전역 shared/theme에 절대 넣지 않는다 (가드: npm run test:auradin-theme-scope).

import {Platform} from 'react-native';

export const auColors = {
  // Ground (light) — 178deg sky→pink 그라디언트 스톱
  skyHi: '#cfe6fb',
  sky: '#a8cef5',
  mid: '#cbd8f2',
  pink: '#f6cfe0',
  pinkHi: '#fbe3ee',

  // Ground (dark — searching 전용 다크 몰입)
  navyHi: '#0b1026',
  navy: '#131a38',

  // Ink (텍스트 기본 — 흰 글씨는 채도 fill 위에서만)
  ink: '#2b3a52',
  inkSoft: 'rgba(43,58,82,0.62)',
  inkFaint: 'rgba(43,58,82,0.42)',
  inkInverse: '#ffffff',
  inkInverseSoft: 'rgba(255,255,255,0.68)',
  inkInverseFaint: 'rgba(255,255,255,0.4)',

  // Accent — 화면당 하나 (마젠타→바이올렛)
  magenta: '#e0489c',
  violet: '#b06cf0',
  accentGlow: 'rgba(224,72,156,0.45)',
  focusRing: 'rgba(224,72,156,0.14)',

  // CTA liquid gem (rose→plum)
  ctaFrom: '#d4569b',
  ctaMid: '#c2417f',
  ctaTo: '#7b45d6',

  // Semantic
  heart: '#f25d61',
  swatchNeutral: '#e4d6d2',

  // Orb 이리데슨트 팔레트
  orbLavender: '#c7b8fa',
  orbPink: '#f273cc',
  orbTeal: '#73ebd1',
  orbCyan: '#73ccfa',
  orbGold: '#fad994',

  // Glass 표면
  glassBorder: 'rgba(255,255,255,0.55)',
  glassFillTop: 'rgba(255,255,255,0.44)',
  glassFillMid: 'rgba(255,255,255,0.22)',
  glassFillBottom: 'rgba(255,255,255,0.34)',
  badgeDarkTop: 'rgba(43,58,82,0.42)',
  badgeDarkBottom: 'rgba(43,58,82,0.28)',
  shadowViolet: 'rgba(120,110,200,0.16)',
} as const;

export const auGroundStops = {
  light: {
    colors: [auColors.skyHi, auColors.sky, auColors.mid, auColors.pink, auColors.pinkHi] as const,
    locations: [0, 0.3, 0.52, 0.76, 1] as const,
  },
  dark: {
    colors: [auColors.navyHi, auColors.navy] as const,
    locations: [0, 1] as const,
  },
} as const;

export const auType = {
  serif: 'Lora', // 히어로 전용 (expo-font 번들)
  mono: Platform.select({ios: 'Menlo', default: 'monospace'}) as string, // 워드마크·라벨·숫자
  // 본문 산세리프는 전역 Pretendard 패밀리를 그대로 쓴다 (폰트는 팔레트 제약 대상 아님).
} as const;

export const auRadius = {
  sm: 8,
  md: 12,
  card: 16,
  stage: 22,
  tile: 24,
  sheet: 28,
  pill: 999,
} as const;

export const auSpacing = {
  pad: 14,
  chipGapY: 12,
  section: 30,
} as const;

export const auMotion = {
  enterMs: 480,
  veilMs: 550,
  toastMs: 1600,
} as const;

// 3겹 컬러 섀도(웹) → RN 단일 섀도 근사 (iOS shadow* + Android elevation)
export const auGlassShadow = {
  shadowColor: 'rgb(120,110,200)',
  shadowOffset: {width: 0, height: 10},
  shadowOpacity: 0.16,
  shadowRadius: 30,
  elevation: 8,
} as const;

export const auBlur = {
  sheet: 40, // css blur(26px)의 BlurView intensity 근사
  chip: 22, //  css blur(12px)
} as const;
