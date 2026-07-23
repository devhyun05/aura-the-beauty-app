// reportTokens.ts — single source of design tokens, extracted 1:1 from 얼굴 분석 보고서.dc.html
import type { DimensionValue, TextStyle, ViewStyle } from 'react-native';

export const color = {
  ink: '#16303B',
  body: '#44606C',
  text: '#5C7480',
  muted: '#8DA3AD',
  faint: '#7A929D',
  accent: '#22AEDD',
  accentDeep: '#0E7DA8',
  accentInk: '#0E4B60',
  accentLight: '#6ECBE8',
  accentPale: '#9CC9DB',
  accentBg: '#E3F4FA',
  accentTint: '#CDEDF8',
  accentWash: '#F0F8FB',
  magenta: '#FF0B83',
  bg: '#F6FAFC',
  surface: '#FFFFFF',
  surface2: '#F2F6F8',
  rail: '#E7EFF3',
  dial: '#F1F6F8',
  hatchA: '#DDEBF1',
  hatchB: '#F0F7FA',
  hatchC: '#EDF3F6',
  divider: '#EEF3F5',
  outline: 'rgba(22,48,59,0.10)',
  outline8: 'rgba(22,48,59,0.10)',
  outline6: 'rgba(22,48,59,0.06)',
  tick: 'rgba(22,48,59,0.14)',
  dashed22: 'rgba(22,48,59,0.22)',
  legacyText: '#7A6A45',
  legacyBg: '#F5EEDC',
  faceOutline: '#C9DAE1',
  dotOutline: '#B7C6CD',
  warmLabel: '#B08246',
  white: '#FFFFFF',
  overlayDark: 'rgba(22,48,59,0.55)',
  overlayDark6: 'rgba(22,48,59,0.6)',
  overlayAccent: 'rgba(34,174,221,0.75)',
  lineWhite: 'rgba(255,255,255,0.85)',
  lineWhiteStrong: 'rgba(255,255,255,0.95)',
  bandRest: 'rgba(110,203,232,0.13)',
  bandActive: 'rgba(110,203,232,0.3)',
  bandActiveSoft: 'rgba(110,203,232,0.2)',
  markerBand: 'rgba(255,11,131,0.15)',
  markerBandBorder: 'rgba(255,11,131,0.55)',
  lensBorder: 'rgba(34,174,221,0.25)',
  lipNatural: '#C98A9B',
  lipGlam: '#A2385E',
} as const;

export const radius = { xs: 8, sm: 10, md: 14, lg: 16, xl: 18, pill: 999 } as const;

// Layout rhythm shared across sections (all other spacing literals match the HTML exactly).
export const space = { screenX: 20, sectionTop: 30, cardPad: 16, cardGap: 12 } as const;

/** Pretendard text style. lh = unitless line-height multiplier, ls = letterSpacing in px. */
export const font = (
  size: number,
  weight: NonNullable<TextStyle['fontWeight']>,
  lh?: number,
  ls?: number,
): TextStyle => ({
  fontFamily: 'Pretendard',
  fontSize: size,
  fontWeight: weight,
  ...(lh != null ? { lineHeight: Math.round(size * lh * 10) / 10 } : null),
  ...(ls != null ? { letterSpacing: ls } : null),
});

export const text = {
  eyebrow: font(10.5, '700', undefined, 1.68), // .16em @10.5px
  h1: font(22, '800', undefined, -0.22),       // -.01em @22px
  h2: font(18, '700'),
  sectionSub: font(13.5, '400', 1.55),
  railLabel: font(12, '600'),
  railCaption: font(11.5, '400', 1.5),
} as const;

// CSS shadows translated to the closest RN shadow*/elevation equivalents.
export const shadow: Record<string, ViewStyle> = {
  card: { shadowColor: color.ink, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  circleButton: { shadowColor: color.ink, shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  photo: { shadowColor: color.ink, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  marker: { shadowColor: color.magenta, shadowOpacity: 0.45, shadowRadius: 2.5, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  overlayLine: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  cta: { shadowColor: color.accentDeep, shadowOpacity: 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
};

/** Percentage DimensionValue helper for normalized 0..100 positions. */
export const pct = (n: number): DimensionValue => `${n}%` as DimensionValue;
