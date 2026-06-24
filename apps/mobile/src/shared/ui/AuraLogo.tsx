import {StyleSheet, type StyleProp, type TextStyle} from 'react-native';
import {Text} from 'tamagui';

import {colors, typography} from '../theme';

type AuraLogoVariant = 'hero' | 'intro' | 'header';

type AuraLogoProps = {
  variant?: AuraLogoVariant;
  style?: StyleProp<TextStyle>;
};

export function AuraLogo({variant = 'hero', style}: AuraLogoProps) {
  return <Text style={[styles.logo, logoVariantStyles[variant], style]}>AURA</Text>;
}

const styles = StyleSheet.create({
  logo: {
    color: colors.brandMuted,
    fontFamily: typography.logo.fontFamily,
    fontSize: typography.logo.fontSize,
    fontWeight: typography.logo.fontWeight,
    letterSpacing: 0,
    lineHeight: typography.logo.lineHeight,
  },
  headerLogo: {
    fontSize: typography.logoHeader.fontSize,
    lineHeight: typography.logoHeader.lineHeight,
  },
  introLogo: {
    fontSize: typography.logoIntro.fontSize,
    lineHeight: typography.logoIntro.lineHeight,
  },
});

const logoVariantStyles = {
  hero: undefined,
  intro: styles.introLogo,
  header: styles.headerLogo,
} as const;
