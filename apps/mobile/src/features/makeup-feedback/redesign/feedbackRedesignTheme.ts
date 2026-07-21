import type {TextStyle} from 'react-native';

import {typography} from '../../../shared/theme';

/**
 * Feature-local tokens supplied by the makeup-feedback design handoff.
 *
 * They intentionally stay inside the feature so the redesign does not alter
 * the visual language of unrelated screens.
 */
export const feedbackRedesignColors = {
  amberBannerBg: '#FAF1DE',
  amberBannerBorder: '#EBD9AE',
  amberText: '#8F6A1D',
  barTrack: '#EAF3F8',
  borderAxisOpen: '#2E9FD4',
  borderAxisOpenSoft: '#CFE3EE',
  borderCard: '#E7EFF3',
  borderConfNeutral: '#DEE7EB',
  borderSoft: '#C9E2EF',
  card: '#FFFFFF',
  cardAlt: '#F7FBFD',
  chevron: '#B9C9D1',
  chipBg: '#E1F1FA',
  chipBgAlt: '#E9F3F8',
  fix: '#D96A4F',
  fixChipBg: '#FBEEE9',
  fixChipBorder: '#F2CFC3',
  fixText: '#B04E33',
  good: '#1F9082',
  goodChipBg: '#E4F3F0',
  goodText: '#0E6E62',
  ink: '#1C333F',
  neutralChipBg: '#F3F7F9',
  neutralChipText: '#5C7480',
  optDot: '#9AAEB8',
  optSolid: '#64808C',
  primary: '#0C6E9E',
  primaryStrong: '#0E7FB0',
  segTrack: '#DCEBF3',
  textMuted: '#46606C',
  textMuted2: '#5E93AC',
  textMuted3: '#8CA2AC',
  textMuted4: '#5C7480',
} as const;

export const feedbackRedesignGradients = {
  axisBar: {
    colors: ['#2E9FD4', '#0E7FB0'] as const,
    locations: [0, 1] as const,
  },
  scoreHeader: {
    colors: ['#E1F1FA', '#FFFFFF'] as const,
    locations: [0, 0.88] as const,
  },
  slidesBackground: {
    colors: ['#E1F1FA', '#F7FBFD'] as const,
    locations: [0, 0.3] as const,
  },
} as const;

export const feedbackRedesignFonts = {
  bold: typography.fontFamily.bold,
  medium: typography.fontFamily.medium,
  regular: typography.fontFamily.regular,
  semibold: typography.fontFamily.semibold,
} as const;

export const tabularNumbers = {
  fontVariant: ['tabular-nums'],
} satisfies TextStyle;

export const feedbackVerdictColors = {
  strength: {
    dot: feedbackRedesignColors.good,
    foreground: feedbackRedesignColors.goodText,
    solid: feedbackRedesignColors.good,
  },
  improvement: {
    dot: feedbackRedesignColors.fix,
    foreground: feedbackRedesignColors.fixText,
    solid: feedbackRedesignColors.fix,
  },
  optional: {
    dot: feedbackRedesignColors.optDot,
    foreground: feedbackRedesignColors.neutralChipText,
    solid: feedbackRedesignColors.optSolid,
  },
} as const;
