import type {StyleProp, ViewStyle} from 'react-native';
import {Pressable, StyleSheet} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {
  ChevronRight,
  Layers,
  MessageCircle,
  ScanFace,
  ScanSearch,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  ProfileReportKind,
  ProfileReportPreview,
} from '../services/profileReportHub';

type ProfileReportPreviewCardProps = {
  description: string;
  kind: ProfileReportKind;
  label: string;
  onPressLatest?: () => void;
  preview: ProfileReportPreview | null;
  style?: StyleProp<ViewStyle>;
};

type ReportCardPresentation = {
  accent: string;
  colors: readonly [string, string];
  icon: LucideIcon;
};

const REPORT_CARD_PRESENTATIONS: Record<
  ProfileReportKind,
  ReportCardPresentation
> = {
  faceAnalysis: {
    accent: '#617A6E',
    colors: ['#F1F6F3', '#E3ECE7'],
    icon: ScanFace,
  },
  makeupRecommendation: {
    accent: '#9B6678',
    colors: ['#FBF3F6', '#F3E4EA'],
    icon: Sparkles,
  },
  makeupExtraction: {
    accent: '#706982',
    colors: ['#F5F3F8', '#E9E6F0'],
    icon: ScanSearch,
  },
  makeupFeedback: {
    accent: '#967062',
    colors: ['#F8F3F0', '#EEE4DF'],
    icon: MessageCircle,
  },
};

export const PROFILE_REPORT_PREVIEW_MODE = 'privacy-first' as const;

export function ProfileReportPreviewCard({
  description,
  kind,
  label,
  onPressLatest,
  preview,
  style,
}: ProfileReportPreviewCardProps) {
  const presentation = REPORT_CARD_PRESENTATIONS[kind];
  const Icon = presentation.icon;

  return (
    <Pressable
      accessibilityLabel={
        preview ? `${label} 최신 보고서 열기` : `${label} 보고서 없음`
      }
      accessibilityRole="button"
      accessibilityState={{disabled: !preview}}
      disabled={!preview}
      onPress={onPressLatest}
      style={({pressed}) => [
        styles.card,
        style,
        pressed ? styles.pressed : null,
      ]}>
      <LinearGradient colors={presentation.colors} style={styles.visual}>
        <View style={styles.decorativeCircleLarge} />
        <View style={styles.decorativeCircleSmall} />

        <View style={styles.iconSurface}>
          <Icon
            color={presentation.accent}
            size={iconSize.lg}
            strokeWidth={1.75}
          />
        </View>

        {preview?.hasMore ? (
          <View style={styles.multipleBadge}>
            <Layers color={presentation.accent} size={13} strokeWidth={1.9} />
            <Text
              style={[
                styles.multipleBadgeText,
                {color: presentation.accent},
              ]}>
              여러 개
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
        <Text numberOfLines={1} style={styles.description}>
          {description}
        </Text>

        <View style={styles.footer}>
          {preview ? (
            <>
              <Text numberOfLines={1} style={styles.stateText}>
                최근 결과 보기
              </Text>
              <ChevronRight
                color={colors.textSecondary}
                size={14}
                strokeWidth={2}
              />
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    overflow: 'hidden',
    padding: spacing.sm,
  },
  copy: {
    gap: 2,
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  decorativeCircleLarge: {
    backgroundColor: 'rgba(255, 255, 255, 0.36)',
    borderRadius: radius.pill,
    height: 92,
    position: 'absolute',
    right: -22,
    top: -28,
    width: 92,
  },
  decorativeCircleSmall: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: radius.pill,
    bottom: -24,
    height: 64,
    left: -14,
    position: 'absolute',
    width: 64,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: typography.fontWeight.medium,
    lineHeight: 14,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    minHeight: 18,
  },
  iconSurface: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.84)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  label: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  multipleBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
  multipleBadgeText: {
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    lineHeight: 12,
  },
  pressed: {
    opacity: 0.72,
    transform: [{scale: 0.985}],
  },
  stateText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: 14,
  },
  visual: {
    alignItems: 'center',
    borderRadius: radius.md,
    height: 112,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
});
