import React, {useState} from 'react';
import {Check, TriangleAlert} from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import type {AccountDeletionReasonId} from '../types';

export const ACCOUNT_DELETION_REASONS: readonly {
  id: AccountDeletionReasonId;
  label: string;
}[] = [
  {id: 'low_usage', label: '이용할 일이 줄었어요'},
  {id: 'missing_features', label: '원하는 기능을 찾기 어려워요'},
  {id: 'difficult_to_use', label: '사용 방법이 복잡해요'},
  {id: 'privacy_concerns', label: '개인정보와 데이터가 걱정돼요'},
  {id: 'restart_account', label: '새 계정으로 다시 시작하고 싶어요'},
  {id: 'other', label: '기타'},
] as const;

export const ACCOUNT_DELETION_NOTICES = [
  '계정과 프로필 정보의 삭제 절차가 시작돼요.',
  '분석 보고서, 업로드한 사진과 저장 기록의 삭제 절차가 시작돼요.',
  '작성한 커뮤니티 게시물과 컨설팅 내역의 삭제 절차가 시작돼요.',
  '탈퇴가 완료된 계정은 다시 복구할 수 없어요.',
] as const;

type AccountDeletionScreenProps = {
  onDeleteAccount: (reason: AccountDeletionReasonId | null) => Promise<void>;
};

export function AccountDeletionScreen({onDeleteAccount}: AccountDeletionScreenProps) {
  const [step, setStep] = useState<'notice' | 'reason'>('notice');
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [selectedReason, setSelectedReason] =
    useState<AccountDeletionReasonId | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isReasonStep = step === 'reason';

  const deleteAccount = () => {
    if (isDeleting) {
      return;
    }

    Alert.alert(
      '정말 탈퇴할까요?',
      '탈퇴를 완료하면 계정과 연결된 운영 데이터의 삭제 절차가 시작되며 계정을 되돌릴 수 없어요.',
      [
        {style: 'cancel', text: '취소'},
        {
          onPress: () => {
            setIsDeleting(true);
            void onDeleteAccount(selectedReason)
              .catch(error => {
                const message =
                  error instanceof Error && error.message.trim()
                    ? error.message
                    : '회원 탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

                Alert.alert('회원 탈퇴 실패', message);
              })
              .finally(() => setIsDeleting(false));
          },
          style: 'destructive',
          text: '탈퇴하기',
        },
      ],
    );
  };

  return (
    <AppScreen
      bottomPadding="safeArea"
      contentGap={spacing.xl}
      topPadding="belowShellHeader">
      <View style={styles.progressHeader}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressValue, isReasonStep ? styles.progressComplete : null]} />
        </View>
        <Text style={styles.progressText}>{isReasonStep ? '2 / 2' : '1 / 2'}</Text>
      </View>

      {!isReasonStep ? (
        <>
          <View style={styles.titleBlock}>
            <View style={styles.warningIcon}>
              <TriangleAlert color={colors.danger} size={iconSize.md} strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>탈퇴 전 꼭 확인해 주세요</Text>
            <Text style={styles.description}>
              회원 탈퇴가 완료되면 아래 정보의 삭제 절차가 시작돼요.
            </Text>
          </View>

          <View style={styles.noticeList}>
            {ACCOUNT_DELETION_NOTICES.map((notice, index) => (
              <View
                key={notice}
                style={index < ACCOUNT_DELETION_NOTICES.length - 1 ? styles.noticeDivider : null}>
                <View style={styles.noticeRow}>
                  <View style={styles.noticeDot} />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={styles.retentionNote}>
            자동 백업은 최대 7일 후 순환 삭제돼요. 법령 준수·분쟁 대응·보안에 필요한
            최소 기록은 필요한 기간 동안 별도로 보관될 수 있어요.
          </Text>

          <Pressable
            accessibilityLabel="탈퇴 안내 확인"
            accessibilityRole="checkbox"
            accessibilityState={{checked: hasAcknowledged}}
            onPress={() => setHasAcknowledged(value => !value)}
            style={({pressed}) => [
              styles.acknowledgement,
              pressed ? styles.controlPressed : null,
            ]}>
            <View style={[styles.checkbox, hasAcknowledged ? styles.checkboxChecked : null]}>
              {hasAcknowledged ? (
                <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
              ) : null}
            </View>
            <Text style={styles.acknowledgementText}>
              삭제 절차와 계정 복구 불가 안내를 모두 확인했어요.
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="회원 탈퇴 다음 단계"
            accessibilityRole="button"
            accessibilityState={{disabled: !hasAcknowledged}}
            disabled={!hasAcknowledged}
            onPress={() => setStep('reason')}
            style={({pressed}) => [
              styles.primaryButton,
              !hasAcknowledged ? styles.buttonDisabled : null,
              pressed ? styles.primaryButtonPressed : null,
            ]}>
            <Text style={styles.primaryButtonText}>다음</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>탈퇴하시는 이유를 알려주세요</Text>
            <Text style={styles.description}>
              답변은 서비스 개선에만 참고하며, 선택하지 않고 계속할 수 있어요.
            </Text>
          </View>

          <View style={styles.reasonList}>
            {ACCOUNT_DELETION_REASONS.map((reason, index) => {
              const isSelected = selectedReason === reason.id;

              return (
                <Pressable
                  accessibilityLabel={reason.label}
                  accessibilityRole="radio"
                  accessibilityState={{checked: isSelected}}
                  key={reason.id}
                  onPress={() => setSelectedReason(isSelected ? null : reason.id)}
                  style={({pressed}) => [
                    styles.reasonRow,
                    index < ACCOUNT_DELETION_REASONS.length - 1
                      ? styles.reasonDivider
                      : null,
                    pressed ? styles.controlPressed : null,
                  ]}>
                  <View style={[styles.radio, isSelected ? styles.radioSelected : null]}>
                    {isSelected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <Text style={styles.reasonText}>{reason.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              accessibilityLabel="탈퇴 안내로 돌아가기"
              accessibilityRole="button"
              disabled={isDeleting}
              onPress={() => setStep('notice')}
              style={({pressed}) => [
                styles.secondaryButton,
                pressed ? styles.secondaryButtonPressed : null,
              ]}>
              <Text style={styles.secondaryButtonText}>이전</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="회원 탈퇴 최종 확인"
              accessibilityRole="button"
              accessibilityState={{disabled: isDeleting}}
              disabled={isDeleting}
              onPress={deleteAccount}
              style={({pressed}) => [
                styles.deleteButton,
                isDeleting ? styles.buttonDisabled : null,
                pressed ? styles.deleteButtonPressed : null,
              ]}>
              {isDeleting ? <ActivityIndicator color={colors.white} size="small" /> : null}
              <Text style={styles.deleteButtonText}>
                {isDeleting ? '탈퇴 처리 중' : '탈퇴 계속하기'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  acknowledgement: {
    alignItems: 'flex-start',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  acknowledgementText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  controlPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    flex: 1.7,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  deleteButtonPressed: {
    opacity: 0.82,
  },
  deleteButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  noticeDivider: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  noticeDot: {
    backgroundColor: colors.textSecondary,
    borderRadius: 3,
    height: 6,
    marginTop: 7,
    width: 6,
  },
  noticeList: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  noticeRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonPressed: {
    opacity: 0.82,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  progressComplete: {
    width: '100%',
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  progressText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  progressTrack: {
    backgroundColor: colors.divider,
    borderRadius: 2,
    flex: 1,
    height: 4,
    overflow: 'hidden',
  },
  progressValue: {
    backgroundColor: colors.textPrimary,
    height: '100%',
    width: '50%',
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioDot: {
    backgroundColor: colors.textPrimary,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  radioSelected: {
    borderColor: colors.textPrimary,
  },
  reasonDivider: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  reasonList: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  reasonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reasonText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  retentionNote: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  titleBlock: {
    gap: spacing.sm,
  },
  warningIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 90, 77, 0.08)',
    borderRadius: radius.sm,
    height: 42,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 42,
  },
});
