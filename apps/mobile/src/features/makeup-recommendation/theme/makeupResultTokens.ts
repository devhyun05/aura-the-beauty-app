// Feature-local design tokens extracted from the "Makeup Result v3" mockup.
// Kept feature-scoped on purpose — do NOT import or extend shared/theme here
// (the makeup result redesign owns its own palette; test:auradin-theme-scope guards this).
export const colors = {
  screenGradient: ['#D5DEF4', '#DCD6EF', '#F0DED4'] as const, // 175deg top→bottom
  ink: '#101828',
  ink2: '#1C2740',
  ink3: '#2C3852',
  sub: '#3D4C6B',
  sub2: '#5B6B8C',
  sub3: '#6B7794',
  faint: '#8794AD',
  accentLink: '#3D5BB0',
  dark: '#0E1420', // dark buttons / active tiles
  glass: 'rgba(238,244,255,0.82)',
  glassBorder: 'rgba(255,255,255,0.6)',
  glassInner: 'rgba(255,255,255,0.65)',
  heroPlaceholder: '#C6CFE9',
  white: '#FFFFFF',
} as const;

export const radius = {badge: 9, pill: 12, tile: 14, card: 20, hero: 20} as const;

// iOS shadow + Android elevation pairs
export const shadows = {
  card: {
    shadowColor: 'rgb(15,30,70)', shadowOpacity: 0.2, shadowRadius: 20,
    shadowOffset: {width: 0, height: 12}, elevation: 8,
  },
  hero: {
    shadowColor: 'rgb(15,30,70)', shadowOpacity: 0.3, shadowRadius: 25,
    shadowOffset: {width: 0, height: 16}, elevation: 12,
  },
  darkTile: {
    shadowColor: 'rgb(8,14,30)', shadowOpacity: 0.3, shadowRadius: 10,
    shadowOffset: {width: 0, height: 6}, elevation: 6,
  },
} as const;

export const type = {
  eyebrow: {fontSize: 10, fontWeight: '700' as const, letterSpacing: 3, color: colors.sub3},
  displayLg: {fontSize: 36, fontWeight: '500' as const, letterSpacing: -0.7, lineHeight: 41, color: colors.ink},
  displayMd: {fontSize: 25, fontWeight: '500' as const, letterSpacing: -0.5, lineHeight: 30, color: colors.ink},
  sectionSub: {fontSize: 12.5, fontWeight: '500' as const, color: colors.sub2},
  body: {fontSize: 13.5, fontWeight: '500' as const, lineHeight: 21, color: colors.ink2},
  mono: {fontFamily: 'Menlo', fontSize: 11, letterSpacing: 0.6, color: colors.sub2},
} as const;
