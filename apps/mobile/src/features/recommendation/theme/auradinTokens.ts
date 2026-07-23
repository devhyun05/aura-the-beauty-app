// AURADIN — design tokens, translated 1:1 from the design system's tokens/*.css.
// SCOPE (DESIGN.md warning): this palette (blue + pink + magenta) is specific to the
// AURADIN recommendation feature. Keep this file in features/recommendation —
// do NOT merge into the app-wide shared/theme. Guard: npm run test:auradin-theme-scope.

import { Easing, Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

/* ─ Color (tokens/colors.css) ─ */
export const color = {
  // Ground: powder-blue → lilac → orchid-pink vertical gradient
  // (entry v3 — CLEAN GRADIENT, sampled from the AppScreen redesign; the
  //  entry photo slot is now opt-in legacy, see AuradinGround)
  skyHi: '#CBE2FA',
  sky: '#B4D2F4',
  mid: '#D5DAF2',
  pink: '#EFD1E5',
  pinkHi: '#EED2EA', // bottom orchid — deeper than v2, per the redesign
  white: '#FDFDFE',

  // Dark immersion (searching screen ONLY)
  navyHi: '#0B1026',
  navy: '#131A38',

  // Ink: deep blue-slate, never pure black
  ink: '#2B3A52',
  inkSoft: 'rgba(43,58,82,0.62)',
  inkFaint: 'rgba(43,58,82,0.42)',
  // White text — point/emphasis elements + the dark searching screen only
  inkInverse: '#FFFFFF',
  inkInverseSoft: 'rgba(255,255,255,0.68)',
  inkInverseFaint: 'rgba(255,255,255,0.4)',

  // Accent: magenta → violet — ONE magenta emphasis per screen
  magenta: '#E0489C',
  violet: '#B06CF0',
  roseDeep: '#C2417F',
  plumDeep: '#7B45D6',
  focusRing: 'rgba(224,72,156,0.14)',
  accentGlow: 'rgba(224,72,156,0.45)',

  // Semantic
  heart: '#F25D61', // save/like only
  ready: '#31D06F', // sparingly
  danger: '#FF5A4D', // tiny icon/accent only, never a text color
  swatchNeutral: '#E4D6D2',

  // Orb iridescent palette
  orbLavender: '#C7B8FA',
  orbPink: '#F273CC',
  orbTeal: '#73EBD1',
  orbCyan: '#73CCFA',
  orbGold: '#FAD994',
} as const;

/* ─ Gradients (as expo-linear-gradient inputs) ─ */
export type GradientStops = readonly [string, string, ...string[]];
export type GradientLocations = readonly [number, number, ...number[]];

export const gradient = {
  ground: {
    colors: [color.skyHi, color.sky, color.mid, color.pink, color.pinkHi] as GradientStops,
    locations: [0, 0.26, 0.5, 0.78, 1] as GradientLocations,
  },
  navy: {
    colors: [color.navyHi, color.navy] as GradientStops,
    locations: [0, 1] as GradientLocations,
  },
  // CTA "liquid gem" — deeper rose→plum (send button + primary CTA only)
  cta: {
    colors: ['#D4569B', '#C2417F', '#9A41B8', '#7B45D6'] as GradientStops,
    locations: [0, 0.38, 0.68, 1] as GradientLocations,
  },
  // top light-catch overlay for the CTA gem
  ctaLight: {
    colors: ['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] as GradientStops,
    locations: [0, 0.42, 0.6] as GradientLocations,
  },
  chipOn: {
    colors: [color.magenta, '#C85AE0'] as GradientStops,
    locations: [0, 1] as GradientLocations,
  },
} as const;

/** CSS-angle → start/end points for expo-linear-gradient. */
export const gradPoints = {
  deg135: { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  deg150: { start: { x: 0.21, y: 0 }, end: { x: 0.79, y: 1 } },
  deg160: { start: { x: 0.33, y: 0 }, end: { x: 0.67, y: 1 } },
  deg165: { start: { x: 0.37, y: 0 }, end: { x: 0.63, y: 1 } },
  deg178: { start: { x: 0.48, y: 0 }, end: { x: 0.52, y: 1 } },
  vertical: { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } },
} as const;

/* ─ Typography (tokens/typography.css) ─ */
export const font = {
  serif: 'Lora', // Display — hero headline ONLY
  sans: 'Pretendard-Regular',
  sansMedium: 'Pretendard-Medium',
  sansSemiBold: 'Pretendard-SemiBold',
  sansBold: 'Pretendard-Bold',
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

/** letter-spacing: em → px (RN letterSpacing is px). */
export const tracking = (fontSize: number, em: number): number =>
  Math.round(fontSize * em * 100) / 100;

export const text = {
  /** Hero (Lora 400 · 53 · lh 1.08 · −.035em · soft white emboss — entry v3) */
  hero: {
    fontFamily: font.serif,
    fontSize: 53,
    lineHeight: 57,
    letterSpacing: tracking(53, -0.035),
    color: color.ink,
    textShadowColor: 'rgba(255,255,255,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  } as TextStyle,
  /** Hero sub (sans 300 → closest loaded weight Regular · 12.5 · lh 1.7 · .07em) */
  heroSub: {
    fontFamily: font.sans,
    fontSize: 12.5,
    lineHeight: 21,
    letterSpacing: tracking(12.5, 0.07),
    color: color.inkSoft,
  } as TextStyle,
  /** Wordmark (mono 700 · 13 · .32em) */
  wordmark: {
    fontFamily: font.mono,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: tracking(13, 0.32),
    color: color.ink,
  } as TextStyle,
  /** Meta / status (mono · 10.5 · .14em) */
  meta: {
    fontFamily: font.mono,
    fontSize: 10.5,
    letterSpacing: tracking(10.5, 0.14),
    color: color.inkSoft,
  } as TextStyle,
  /** Small meta (mono · 9.5 · .16em) */
  metaSm: {
    fontFamily: font.mono,
    fontSize: 9.5,
    letterSpacing: tracking(9.5, 0.16),
    color: color.inkFaint,
  } as TextStyle,
  /** Screen/question/product titles — 24 bold sans */
  title: {
    fontFamily: font.sansBold,
    fontSize: 24,
    color: color.ink,
  } as TextStyle,
  /** Body / input — 14 sans */
  body: {
    fontFamily: font.sans,
    fontSize: 14,
    color: color.ink,
  } as TextStyle,
  /** Chip labels — 12.5 sans */
  chip: {
    fontFamily: font.sans,
    fontSize: 12.5,
    color: color.ink,
  } as TextStyle,
  /** Mono numbers (prices — "18,000원", never ₩) */
  price: {
    fontFamily: font.mono,
    fontSize: 12,
    color: color.ink,
  } as TextStyle,
} as const;

/* ─ Radius (tokens/radius-spacing.css) ─ */
export const radius = {
  sm: 8,
  md: 12, // saved-card image
  card: 16, // result cards, thumbs
  stage: 22, // hero/product stage cards (22–24)
  tile: 24, // question color-swatch tiles
  sheet: 28, // bottom glass sheet
  pill: 999, // composer · chips · buttons · dots
} as const;

/* ─ Spacing — 8px rhythm ─ */
export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  pad: 14, // default component padding
  sectionGap: 30,
} as const;

/* ─ Layout (baseline iPhone 393×852) ─ */
export const layout = {
  padH: 22, // screen inner side padding
  padBottom: 18, // sheet pinned to bottom
  padTopExtra: 12, // added to safe-area top (web spec: 66 total incl. status bar)
  sheetBleed: 6, // sheet margin 0 -6
  thumbSize: 54, // results alt-row thumbnail
} as const;

/* ─ Shadows — web recipe is 3 layered colored shadows; RN gets ONE
     iOS shadow + Android elevation (per port constraints). ─ */
const iosShadow = (c: string, opacity: number, r: number, y: number): ViewStyle => ({
  shadowColor: c,
  shadowOpacity: opacity,
  shadowRadius: r,
  shadowOffset: { width: 0, height: y },
});
const mkShadow = (c: string, opacity: number, r: number, y: number, elevation: number): ViewStyle =>
  Platform.OS === 'android' ? { elevation, shadowColor: c } : iosShadow(c, opacity, r, y);

export const shadows = {
  /** violet-tinted glass shadow (0 10px 30px rgba(120,110,200,.16) blend) */
  glass: mkShadow('#7E64C8', 0.2, 22, 12, 6),
  /** lighter chip glass */
  chip: mkShadow('#786EC8', 0.14, 8, 3, 3),
  /** CTA / send "liquid gem" glow */
  cta: mkShadow('#9B44BE', 0.42, 14, 8, 8),
  /** question swatch tile */
  tile: mkShadow('#786EC8', 0.22, 15, 10, 6),
  /** dark-screen glass */
  darkGlass: mkShadow('#000000', 0.3, 15, 10, 6),
  /** selected chip magenta glow */
  chipOn: mkShadow(color.magenta, 0.4, 12, 6, 6),
  /** glowing 6px status dot */
  glowDot: mkShadow(color.magenta, 0.7, 4, 0, 2),
  /** pastel aura behind an iridescent-rimmed surface */
  iridescent: mkShadow('#B06CF0', 0.34, 18, 8, 8),
} as const;

/* ─ Iridescent rim — the soap-film gradient border (entry-v3 membrane grammar).
     EXACTLY TWO mounts app-wide: the searching QUERY echo block and the
     results #1 hero card — one emphasis per screen. Never on chips, badges,
     composer, sheet, or detail cards (those get the plain milk-glass edge). ─ */
export const iridescent = {
  rim: ['#9BE0FF', '#C7B8FA', '#F9A8D4', '#FAD994', '#8FEBDD', '#9BE0FF'] as GradientStops,
  rimLocations: [0, 0.22, 0.46, 0.66, 0.85, 1] as GradientLocations,
  /** rim thickness in px (gradient border via padded wrapper) */
  width: 1.4,
} as const;

/* ─ Liquid-glass tiers (tokens/glass.css) — BlurView approximates
     backdrop-filter: blur(26px) saturate(1.7); chips blur(12) 1.4.
     Entry-v3 "milk glass": brighter fills, luminous top interior (innerGlow),
     and a refracted bottom hairline (bottomCatch) so every surface reads
     embossed — the composer/chip grain of the redesigned first screen,
     applied to ALL screens. ─ */
export type GlassTierName = 'sheet' | 'card' | 'composer' | 'chip' | 'dark';
type GlassTierSpec = {
  intensity: number;
  tint: 'light' | 'dark';
  fill: GradientStops;
  fillLocations: GradientLocations;
  border: string;
  /** near-invisible base so the iOS shadow has a layer to draw from */
  base: string;
  lightCatch: string; // 1px top light-catch
  bottomLight: string; // inset bottom fill-light
  innerGlow: string; // luminous top-interior wash (upper ~45%)
  bottomCatch: string; // 1px bottom refracted-light hairline
  shadow: ViewStyle;
};

export const glassTiers: Record<GlassTierName, GlassTierSpec> = {
  sheet: {
    intensity: 60,
    tint: 'light',
    fill: ['rgba(255,255,255,0.60)', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0.48)'],
    fillLocations: [0, 0.5, 1],
    border: 'rgba(255,255,255,0.72)',
    base: 'rgba(255,255,255,0.10)',
    lightCatch: 'rgba(255,255,255,0.98)',
    bottomLight: 'rgba(255,255,255,0.26)',
    innerGlow: 'rgba(255,255,255,0.30)',
    bottomCatch: 'rgba(255,255,255,0.50)',
    shadow: shadows.glass,
  },
  card: {
    intensity: 55,
    tint: 'light',
    fill: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.26)', 'rgba(255,255,255,0.42)'],
    fillLocations: [0, 0.5, 1],
    border: 'rgba(255,255,255,0.66)',
    base: 'rgba(255,255,255,0.08)',
    lightCatch: 'rgba(255,255,255,0.95)',
    bottomLight: 'rgba(255,255,255,0.22)',
    innerGlow: 'rgba(255,255,255,0.24)',
    bottomCatch: 'rgba(255,255,255,0.42)',
    shadow: shadows.glass,
  },
  composer: {
    intensity: 60,
    tint: 'light',
    fill: ['rgba(255,255,255,0.66)', 'rgba(255,255,255,0.36)', 'rgba(255,255,255,0.52)'],
    fillLocations: [0, 0.55, 1],
    border: 'rgba(255,255,255,0.78)',
    base: 'rgba(255,255,255,0.10)',
    lightCatch: 'rgba(255,255,255,0.98)',
    bottomLight: 'rgba(255,255,255,0.22)',
    innerGlow: 'rgba(255,255,255,0.32)',
    bottomCatch: 'rgba(255,255,255,0.55)',
    shadow: shadows.glass,
  },
  chip: {
    intensity: 30,
    tint: 'light',
    fill: ['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.36)'],
    fillLocations: [0, 1],
    border: 'rgba(255,255,255,0.72)',
    base: 'rgba(255,255,255,0.06)',
    lightCatch: 'rgba(255,255,255,0.95)',
    bottomLight: 'rgba(255,255,255,0.16)',
    innerGlow: 'rgba(255,255,255,0.22)',
    bottomCatch: 'rgba(255,255,255,0.45)',
    shadow: shadows.chip,
  },
  /** dark-screen glass (searching query echo) */
  dark: {
    intensity: 30,
    tint: 'dark',
    fill: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.07)'],
    fillLocations: [0, 1],
    border: 'rgba(255,255,255,0.26)',
    base: 'rgba(19,26,56,0.2)',
    lightCatch: 'rgba(255,255,255,0.28)',
    bottomLight: 'rgba(255,255,255,0.05)',
    innerGlow: 'rgba(255,255,255,0.10)',
    bottomCatch: 'rgba(255,255,255,0.14)',
    shadow: shadows.darkGlass,
  },
};


/* ─ Motion (tokens/motion.css) ─ */
export const motion = {
  /** signature liquid spring cubic-bezier(.22, 1.2, .36, 1) */
  easeLiquid: Easing.bezier(0.22, 1.2, 0.36, 1),
  easeOut: Easing.out(Easing.cubic),
  dur: 500, // interactive transitions
  durEnter: 480, // screen enter: fade + translateY 12–16 → 0
  durVeil: 550, // dark veil crossfade
  durMorph: 700, // orb phase morph
  loaderCycle: 1200, // loader dot opacity cycle
  loaderStagger: 200,
  stepPulse: 1400, // active thinking-step dot pulse
} as const;
