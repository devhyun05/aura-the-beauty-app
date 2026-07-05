const bottomSheetSurface = 'rgba(255, 255, 255, 0.92)';
const blackSurface = 'rgba(43, 43, 43, 0.62)';
const liquidGlassBorder = 'rgba(255, 255, 255, 0.92)';
const headerSurface = 'rgba(255, 255, 255, 0.52)';
const headerOverlaySurface = headerSurface;
const headerOverlayBorder = 'rgba(17, 17, 17, 0.08)';
const liquidGlassSurface = 'rgba(255, 255, 255, 0.74)';
const liquidGlassMutedSurface = 'rgba(247, 247, 247, 0.60)';

export const colors = {
  transparent: 'transparent',
  background: '#FFFFFF',
  headerSurface,
  headerOverlaySurface,
  headerOverlayBorder,
  surface: liquidGlassSurface,
  surfaceMuted: liquidGlassMutedSurface,
  textPrimary: '#111111',
  textSecondary: '#6B6B6B',
  textTertiary: '#B7B2B2',
  border: liquidGlassBorder,
  borderStrong: '#D8D8D8',
  divider: '#F4F4F4',
  heart: '#F25D61',
  brandMuted: '#8FA59A',
  successMuted: '#6F877A',
  danger: '#FF5A4D',
  guideReady: '#31D06F',
  glassSurface: 'rgba(255, 255, 255, 0.13)',
  bottomSheetSurface,
  arFilterBottomSheetSurface: bottomSheetSurface,
  bottomSheetControlSurface: 'rgba(255, 255, 255, 0.68)',
  bottomSheetMutedSurface: liquidGlassMutedSurface,
  liquidGlassBorder,
  liquidGlassSurface,
  guideSurface: 'rgba(255, 255, 255, 0.035)',
  blackSurface,
  black: '#000000',
  white: '#FFFFFF',
} as const;
