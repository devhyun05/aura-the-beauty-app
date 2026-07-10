import React from 'react';
import {
  CircleHelp,
  Settings2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, ChevronRightIcon} from '../../../shared/ui';

type AppSettingsScreenProps = {
  onPressFaq: () => void;
  onPressProfile: () => void;
  onPressQuickActions: () => void;
};

type SettingsItemProps = {
  description: string;
  icon: LucideIcon;
  isLast?: boolean;
  label: string;
  onPress: () => void;
};

export const APP_SETTINGS_LABELS = {
  faq: 'FAQ',
  profile: '프로필 관리',
  quickActions: '빠른 실행 설정',
} as const;

function SettingsItem({
  description,
  icon: Icon,
  isLast = false,
  label,
  onPress,
}: SettingsItemProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.item,
        !isLast ? styles.itemDivider : null,
        pressed ? styles.itemPressed : null,
      ]}>
      <View style={styles.iconFrame}>
        <Icon color={colors.textPrimary} size={iconSize.sm} strokeWidth={1.8} />
      </View>
      <View style={styles.itemCopy}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <ChevronRightIcon color={colors.textTertiary} size={iconSize.sm} />
    </Pressable>
  );
}

export function AppSettingsScreen({
  onPressFaq,
  onPressProfile,
  onPressQuickActions,
}: AppSettingsScreenProps) {
  return (
    <AppScreen
      bottomPadding="safeArea"
      contentGap={spacing.xxl}
      topPadding="belowShellHeader">
      <View style={styles.intro}>
        <Text style={styles.introTitle}>계정과 앱 설정을 관리해요</Text>
        <Text style={styles.introDescription}>
          프로필, 빠른 실행, 고객 지원 메뉴를 확인할 수 있어요.
        </Text>
      </View>

      <View>
        <Text style={styles.sectionLabel}>일반</Text>
        <View style={styles.list}>
          <SettingsItem
            description="이름과 프로필 정보"
            icon={UserRound}
            label={APP_SETTINGS_LABELS.profile}
            onPress={onPressProfile}
          />
          <SettingsItem
            description="홈 화면의 빠른 실행 버튼"
            icon={Settings2}
            label={APP_SETTINGS_LABELS.quickActions}
            onPress={onPressQuickActions}
          />
          <SettingsItem
            description="자주 묻는 질문과 계정 관리"
            icon={CircleHelp}
            isLast
            label={APP_SETTINGS_LABELS.faq}
            onPress={onPressFaq}
          />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  iconFrame: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  intro: {
    gap: spacing.xs,
  },
  introDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 74,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  itemDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  itemDivider: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  itemLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  itemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  list: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginBottom: spacing.sm,
  },
});
