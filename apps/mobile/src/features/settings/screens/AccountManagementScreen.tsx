import React from 'react';
import {LogOut, Trash2} from 'lucide-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, ChevronRightIcon} from '../../../shared/ui';

type AccountManagementScreenProps = {
  accountEmail?: string;
  accountName: string;
  onLogout: () => void;
  onPressAccountDeletion: () => void;
};

type AccountActionProps = {
  description: string;
  destructive?: boolean;
  icon: typeof LogOut;
  isLast?: boolean;
  label: string;
  onPress: () => void;
};

function AccountAction({
  description,
  destructive = false,
  icon: Icon,
  isLast = false,
  label,
  onPress,
}: AccountActionProps) {
  const contentColor = destructive ? colors.danger : colors.textPrimary;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.action,
        !isLast ? styles.actionDivider : null,
        pressed ? styles.actionPressed : null,
      ]}>
      <View style={[styles.actionIcon, destructive ? styles.dangerIcon : null]}>
        <Icon color={contentColor} size={iconSize.sm} strokeWidth={1.8} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionLabel, destructive ? styles.dangerText : null]}>
          {label}
        </Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <ChevronRightIcon color={colors.textTertiary} size={iconSize.sm} />
    </Pressable>
  );
}

export function AccountManagementScreen({
  accountEmail,
  accountName,
  onLogout,
  onPressAccountDeletion,
}: AccountManagementScreenProps) {
  return (
    <AppScreen
      bottomPadding="safeArea"
      contentGap={spacing.xxl}
      topPadding="belowShellHeader">
      <View style={styles.intro}>
        <Text style={styles.introTitle}>로그인 계정</Text>
        <Text style={styles.introDescription}>
          현재 로그인한 계정과 탈퇴 설정을 관리해요.
        </Text>
      </View>

      <View style={styles.identity}>
        <Text numberOfLines={1} style={styles.identityName}>{accountName}</Text>
        {accountEmail ? (
          <Text numberOfLines={1} style={styles.identityEmail}>{accountEmail}</Text>
        ) : null}
      </View>

      <View>
        <Text style={styles.sectionLabel}>계정 작업</Text>
        <View style={styles.actionList}>
          <AccountAction
            description="이 기기에서 로그인을 종료해요."
            icon={LogOut}
            label="로그아웃"
            onPress={onLogout}
          />
          <AccountAction
            description="계정과 연결된 데이터의 삭제 절차를 시작해요."
            destructive
            icon={Trash2}
            isLast
            label="회원 탈퇴"
            onPress={onPressAccountDeletion}
          />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actionCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  actionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  actionDivider: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  actionLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  actionList: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  actionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  dangerIcon: {
    backgroundColor: 'rgba(255, 90, 77, 0.08)',
  },
  dangerText: {
    color: colors.danger,
  },
  identity: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    gap: 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  identityEmail: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  identityName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
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
  sectionLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    marginBottom: spacing.sm,
  },
});
