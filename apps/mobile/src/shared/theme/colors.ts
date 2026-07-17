// ─────────────────────────────────────────────────────────────────────────
// 전역 테마 색상 — 앱 전체(다수 화면: home · face-analysis · auth · navigation · AR …)가
// 공유합니다. 여기를 바꾸면 앱 전체 색이 바뀝니다.
//
// ⚠️ AURADIN 추천 화면 재디자인 색(꿈꾸는 블루 + 솜사탕 핑크 + 마젠타)을 여기에
//    추가하지 마세요. AURADIN 전용 색은 features/recommendation 로컬 토큰으로 둡니다.
//    참고: apps/mobile/src/features/recommendation/theme/auradinTokens.ts
//    가드:  npm run test:auradin-theme-scope
// ─────────────────────────────────────────────────────────────────────────
const bottomSheetSurface = 'rgba(255, 255, 255, 0.92)';
const blackSurface = 'rgba(43, 43, 43, 0.62)';
const liquidGlassBorder = 'rgba(255, 255, 255, 0.92)';
const headerSurface = 'rgba(255, 255, 255, 0.24)';
const headerOverlaySurface = headerSurface;
const headerOverlayBorder = 'rgba(17, 17, 17, 0.05)';
const headerControlSurface = 'rgba(255, 255, 255, 0.46)';
const headerControlBorder = 'rgba(17, 17, 17, 0.07)';
const liquidGlassSurface = 'rgba(255, 255, 255, 0.86)';
const liquidGlassMutedSurface = 'rgba(247, 247, 247, 0.74)';

export const colors = {
  transparent: 'transparent',
  background: '#FFFFFF',
  headerSurface,
  headerOverlaySurface,
  headerOverlayBorder,
  headerControlSurface,
  headerControlBorder,
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
