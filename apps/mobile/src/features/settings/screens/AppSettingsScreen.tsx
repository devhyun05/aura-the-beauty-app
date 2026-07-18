import React from 'react';
import {
  CircleHelp,
  Settings2,
  UserCog,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, iconSize, spacing, typography} from '../../../shared/theme';
import {AppScreen, ChevronRightIcon} from '../../../shared/ui';

export const APP_SETTINGS_BACKGROUND_COLOR = '#F8F5EF';

const settingsPalette = {
  card: 'rgba(255, 255, 255, 0.96)',
  cardBorder: 'rgba(100, 116, 99, 0.08)',
  chevron: '#C5BEB3',
  description: '#8A8278',
  divider: '#EEEAE4',
  icon: '#667B66',
  iconSurface: '#EAF0E7',
  pressed: 'rgba(102, 123, 102, 0.06)',
  sectionLabel: '#9A9186',
  shadow: '#786D5F',
} as const;

type AppSettingsScreenProps = {
  onPressAccountManagement: () => void;
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
  accountManagement: '계정 관리',
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
        pressed ? styles.itemPressed : null,
      ]}>
      <View style={styles.iconFrame}>
        <Icon color={settingsPalette.icon} size={iconSize.md} strokeWidth={1.8} />
      </View>
      <View style={styles.itemCopy}>
        <Text style={styles.itemLabel}>{label}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      <ChevronRightIcon color={settingsPalette.chevron} size={iconSize.sm} />
      {!isLast ? <View pointerEvents="none" style={styles.itemDivider} /> : null}
    </Pressable>
  );
}

export function AppSettingsScreen({
  onPressAccountManagement,
  onPressFaq,
  onPressProfile,
  onPressQuickActions,
}: AppSettingsScreenProps) {
  return (
    <AppScreen
      backgroundColor={APP_SETTINGS_BACKGROUND_COLOR}
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      horizontalPadding={spacing.lg}
      topPadding="belowShellHeader">
      <View style={styles.intro}>
        <Text style={styles.introTitle}>나에게 맞는 AURA</Text>
        <Text style={styles.introDescription}>
          프로필과 앱 사용 환경을 한곳에서 편하게 관리해요.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>개인 설정</Text>
        <View style={styles.cardShadow}>
          <View style={styles.list}>
            <SettingsItem
              description="이름과 프로필 정보를 편집해요."
              icon={UserRound}
              label={APP_SETTINGS_LABELS.profile}
              onPress={onPressProfile}
            />
            <SettingsItem
              description="자주 쓰는 기능을 홈에서 더 빠르게 열어요."
              icon={Settings2}
              isLast
              label={APP_SETTINGS_LABELS.quickActions}
              onPress={onPressQuickActions}
            />
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>계정 및 도움말</Text>
        <View style={styles.cardShadow}>
          <View style={styles.list}>
            <SettingsItem
              description="로그아웃과 회원 탈퇴를 관리해요."
              icon={UserCog}
              label={APP_SETTINGS_LABELS.accountManagement}
              onPress={onPressAccountManagement}
            />
            <SettingsItem
              description="자주 묻는 질문과 앱 사용 안내를 확인해요."
              icon={CircleHelp}
              isLast
              label={APP_SETTINGS_LABELS.faq}
              onPress={onPressFaq}
            />
          </View>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    backgroundColor: settingsPalette.card,
    borderRadius: 26,
    elevation: 3,
    shadowColor: settingsPalette.shadow,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.07,
    shadowRadius: 20,
  },
  iconFrame: {
    alignItems: 'center',
    backgroundColor: settingsPalette.iconSurface,
    borderRadius: 16,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  intro: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  introDescription: {
    color: settingsPalette.description,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  introTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
    minHeight: 86,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  itemDescription: {
    color: settingsPalette.description,
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  itemDivider: {
    backgroundColor: settingsPalette.divider,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    left: 84,
    position: 'absolute',
    right: 0,
  },
  itemLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 17,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: 22,
  },
  itemPressed: {
    backgroundColor: settingsPalette.pressed,
  },
  list: {
    backgroundColor: settingsPalette.card,
    borderColor: settingsPalette.cardBorder,
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    color: settingsPalette.sectionLabel,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 13,
    letterSpacing: 0.2,
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
  },
});
