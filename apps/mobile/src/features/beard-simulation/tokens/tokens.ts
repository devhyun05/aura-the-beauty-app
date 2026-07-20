/**
 * Feature-local design tokens for `beard-simulation`.
 *
 * These are intentionally kept OUT of the global Tamagui theme (per handoff §Fidelity):
 * the Onyx-glass result surface is a feature-specific dark treatment. Do not promote
 * these to the global theme without design sign-off.
 *
 * Values are 1:1 with the prototype (CSS px === RN dp on the 390×844 reference frame).
 */

export const beardColors = {
  // Dark surfaces
  onyx950: '#07090B', // result background
  onyx900: '#0D1014', // report background
  onyxLoadingBase: '#0A0D11', // loading / failure base
  onyxLoadingTop: '#11151B', // loading top radial highlight

  // Glass (the ONE glass surface — result bottom panel)
  glassFill: 'rgba(27,31,37,0.72)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.08)', // inset top reflection
  glassFallback: 'rgba(20,23,28,0.92)', // when BlurView unsupported/perf fallback

  // Dark text
  textPrimary: '#F7F8FA',
  textSecondary: '#A7ADB7',
  textTertiary: '#7C828C',
  textTertiaryAlt: '#8E939C',
  textOnDarkMuted: '#C6CBD4',

  // Lavender accent ramp
  lavender: '#B8A4FF',
  lavenderBright: '#CDBEFF',
  lavenderText: '#DCCFFF',
  onLavender: '#17131F',

  iceBlue: '#91BFFF', // scan line

  // Semantics (mirror global colors.danger family used by prototype)
  danger: '#E5484D',
  dangerText: '#FF7B72',

  // Light surfaces (purpose select + survey)
  lightBg: '#FFFFFF',
  lightText: '#111318',
  lightSecondary: '#767C86',
  lightTertiary: '#9AA0AA',
  lightBorder: '#E7E9EC',
  lightBorderHover: '#D8DBE0',
  lightSelectedBg: '#F5F5F7',
  lightIconBg: '#F3F4F6',
  lightTrack: '#EFF0F2',
  lightChevron: '#C3C7CE',
  lightOptionText: '#3E434C',
} as const;

export const beardRadius = {
  pill: 999,
  card: 20,
  panel: 26,
  reportCard: 16,
  sheet: 22,
  photoCard: 22,
  chip: 999,
  glassChip: 9,
} as const;

export const beardSpace = {
  screenX: 24,
  panelInset: 10,
  panelBottom: 14,
} as const;

/**
 * Type scale (Pretendard). If Pretendard is not yet bundled in the app, the system
 * font is used as a fallback — see README "Pretendard" fidelity flag.
 */
export const beardType = {
  fontFamily: 'Pretendard',
  h1: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32, letterSpacing: -0.4 },
  h2: { fontSize: 21, fontWeight: '700' as const, letterSpacing: -0.3 },
  sectionTitle: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  screenTitle: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 14.5, lineHeight: 23, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;

export const beardTiming = {
  // Generation (mock / prototype demo timings)
  loadStep1: 1400,
  loadStep2: 2800,
  loadStep3Done: 4200,
  loadToResult: 4800,
  // delayed variant
  delayNoticeAt: 4600,
  delayStep2: 7600,
  delayStep3Done: 9200,
  delayToResult: 9800,
  // failure variant
  failStep2: 2800,
  failToFailure: 4100,
  // camera guidance cycling
  camCycle: 950,
  camCycleOffset: 250,
  // interactions
  crossfade: 300,
  holdShortTapMax: 260, // <260ms tap = pin toggle
  saveLatency: 1000,
  // toasts
  toastDefault: 2600,
  toastSaved: 2800,
  toastError: 4200,
  toastHint: 3800,
  scanCycle: 3600,
} as const;
