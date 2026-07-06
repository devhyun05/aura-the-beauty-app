import {colors} from './colors';

export const profileColors = {
  background: '#FFFFFF',
  surface: colors.liquidGlassSurface,
  surfaceMuted: colors.bottomSheetMutedSurface,
  text: '#111111',
  textMuted: '#5F5F5F',
  textSoft: '#8A8A8A',
  border: '#111111',
  borderSubtle: colors.liquidGlassBorder,
  accent: '#111111',
  accentSoft: colors.bottomSheetMutedSurface,
  accentMuted: '#6F6F6F',
  shadow: '#000000',
  divider: '#E9E9E9',
} as const;

export const profileSpacing = {
  screenX: 20,
  sectionGap: 28,
  cardGap: 12,
  itemGap: 10,
} as const;

export const profileRadius = {
  card: 18,
  image: 12,
  chip: 999,
} as const;

export const profileTypography = {
  title: 22,
  sectionTitle: 17,
  body: 14,
  caption: 12,
} as const;

export const feedbackColors = {
  background: '#F6F6F6',
  surface: colors.liquidGlassSurface,
  surfaceMuted: colors.bottomSheetMutedSurface,
  overlay: 'rgba(255, 255, 255, 0.22)',
  overlayStrong: colors.liquidGlassSurface,
  text: '#1F1B1B',
  textMuted: '#746E6E',
  textSoft: '#B7B2B2',
  border: colors.liquidGlassBorder,
  borderSoft: colors.liquidGlassBorder,
  accent: '#111111',
  accentSoft: colors.bottomSheetMutedSurface,
  accentMuted: '#7A7A7A',
  shadow: '#111111',
  scrim: colors.liquidGlassSurface,
} as const;

export const feedbackSpacing = {
  screenX: 24,
  cardGap: 12,
  sectionGap: 20,
} as const;

export const feedbackRadius = {
  sheet: 28,
  card: 18,
  chip: 999,
} as const;

export const consultingColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F6F6F6',
  surfaceSoft: '#FAFAFA',
  text: '#111111',
  textMuted: '#5F5F5F',
  textSoft: '#A3A09E',
  border: '#E4E4E2',
  borderSoft: '#EFEFED',
  accent: '#111111',
  onAccent: '#FFFFFF',
  rose: '#C08A84',
  roseStrong: '#9C6660',
  roseSoft: '#F6ECEA',
  roseText: '#7C4A45',
  gold: '#B99B6B',
  goldSoft: '#F5EFE4',
  goldText: '#7A6132',
  success: '#4B7A5D',
  successSoft: '#E9F0EB',
  danger: '#C4463D',
  dangerSoft: '#F8ECEA',
  shadow: '#111111',
} as const;

export const consultingSpacing = {
  screenX: 20,
  cardGap: 12,
  sectionGap: 26,
} as const;

export const consultingRadius = {
  sheet: 24,
  card: 18,
  chip: 999,
  pill: 999,
} as const;
