import type {TextStyle} from 'react-native';

type FontWeight = NonNullable<TextStyle['fontWeight']>;

const fontFamily = {
  primary: 'Pretendard',
  regular: 'Pretendard',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
} as const;

export const typography = {
  fontFamily,
  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  lineHeight: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 26,
    xl: 32,
    xxl: 40,
  },
  fontWeight: {
    regular: '400' satisfies FontWeight,
    medium: '500' satisfies FontWeight,
    semibold: '600' satisfies FontWeight,
    bold: '700' satisfies FontWeight,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '700' satisfies FontWeight,
  },
  caption: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' satisfies FontWeight,
  },
  logo: {
    fontFamily: fontFamily.bold,
    fontSize: 58,
    lineHeight: 70,
    fontWeight: '700' satisfies FontWeight,
  },
} as const;
