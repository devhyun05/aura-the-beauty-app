import React, {useState} from 'react';
import {ChevronDown, Trash2} from 'lucide-react-native';
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

export type FaqItem = {
  answer: string;
  id: string;
  question: string;
};

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    id: 'data-storage',
    question: '사진과 분석 데이터는 어디에 저장되나요?',
    answer:
      '업로드한 사진과 분석 결과는 계정에 연결되어 보관됩니다. 개별 보고서는 보고서 상세 화면에서 삭제할 수 있어요.',
  },
  {
    id: 'permissions',
    question: '카메라와 사진 접근 권한은 왜 필요한가요?',
    answer:
      '얼굴 분석, AR 필터, 메이크업 피드백에 사용할 사진을 촬영하거나 선택하기 위해 필요해요. iPhone 설정에서 언제든지 권한을 변경할 수 있어요.',
  },
  {
    id: 'filter-loading',
    question: '메이크업 필터가 바로 보이지 않아요.',
    answer:
      '이미지와 AR 자원을 처음 불러올 때는 잠시 시간이 필요할 수 있어요. 안정적인 네트워크에서 다시 시도하고, 계속되면 앱을 재시작해 주세요.',
  },
  {
    id: 'consulting',
    question: '컨설팅 예약은 어디에서 확인하나요?',
    answer:
      '하단의 컨설팅 탭에서 예약 상태, 메시지, 알림을 확인할 수 있어요.',
  },
  {
    id: 'logout-vs-delete',
    question: '로그아웃과 회원 탈퇴는 어떻게 다른가요?',
    answer:
      '로그아웃은 이 기기의 로그인 상태만 종료하며 계정 데이터는 유지됩니다. 회원 탈퇴는 계정과 연결된 데이터를 삭제하며 되돌릴 수 없어요.',
  },
  {
    id: 'deletion-scope',
    question: '회원 탈퇴하면 어떤 데이터가 삭제되나요?',
    answer:
      '프로필, 업로드한 미디어, 분석 보고서, 저장 기록, 커뮤니티 게시물, 컨설팅 정보가 삭제 대상에 포함돼요. 법령에 따라 보관 의무가 있는 기록은 정해진 기간 동안 별도로 보관될 수 있어요.',
  },
] as const;

type FaqScreenProps = {
  onDeleteAccount: () => Promise<void>;
};

export function FaqScreen({onDeleteAccount}: FaqScreenProps) {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const confirmAccountDeletion = () => {
    if (isDeletingAccount) {
      return;
    }

    Alert.alert(
      '회원 탈퇴',
      '프로필, 분석 보고서, 저장한 메이크업, 커뮤니티 게시물, 컨설팅 내역이 삭제되며 되돌릴 수 없어요. 계속할까요?',
      [
        {style: 'cancel', text: '취소'},
        {
          onPress: () => {
            setIsDeletingAccount(true);
            void onDeleteAccount()
              .catch(error => {
                const message =
                  error instanceof Error && error.message.trim()
                    ? error.message
                    : '회원 탈퇴를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

                Alert.alert('회원 탈퇴 실패', message);
              })
              .finally(() => setIsDeletingAccount(false));
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
      contentGap={spacing.xxl}
      topPadding="belowShellHeader">
      <View style={styles.intro}>
        <Text style={styles.introTitle}>자주 묻는 질문</Text>
        <Text style={styles.introDescription}>
          AURA 사용과 계정 관리에 대한 답변을 확인해 보세요.
        </Text>
      </View>

      <View style={styles.faqList}>
        {FAQ_ITEMS.map((item, index) => {
          const isExpanded = expandedItemId === item.id;

          return (
            <View
              key={item.id}
              style={index < FAQ_ITEMS.length - 1 ? styles.faqItemDivider : undefined}>
              <Pressable
                accessibilityLabel={item.question}
                accessibilityRole="button"
                accessibilityState={{expanded: isExpanded}}
                onPress={() => setExpandedItemId(isExpanded ? null : item.id)}
                style={({pressed}) => [
                  styles.questionButton,
                  pressed ? styles.questionButtonPressed : null,
                ]}>
                <Text style={styles.questionText}>{item.question}</Text>
                <ChevronDown
                  color={colors.textSecondary}
                  size={iconSize.sm}
                  strokeWidth={1.8}
                  style={isExpanded ? styles.chevronExpanded : undefined}
                />
              </Pressable>
              {isExpanded ? (
                <View style={styles.answer}>
                  <Text style={styles.answerText}>{item.answer}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.accountSection}>
        <View style={styles.accountHeading}>
          <View style={styles.dangerIconFrame}>
            <Trash2 color={colors.danger} size={iconSize.sm} strokeWidth={1.8} />
          </View>
          <View style={styles.accountCopy}>
            <Text style={styles.accountTitle}>계정 관리</Text>
            <Text style={styles.accountDescription}>
              탈퇴하면 계정과 연결된 데이터가 삭제되며 복구할 수 없어요.
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="회원 탈퇴"
          accessibilityRole="button"
          accessibilityState={{disabled: isDeletingAccount}}
          disabled={isDeletingAccount}
          onPress={confirmAccountDeletion}
          style={({pressed}) => [
            styles.deleteButton,
            pressed ? styles.deleteButtonPressed : null,
            isDeletingAccount ? styles.deleteButtonDisabled : null,
          ]}>
          {isDeletingAccount ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : null}
          <Text style={styles.deleteButtonText}>
            {isDeletingAccount ? '탈퇴 처리 중' : '회원 탈퇴'}
          </Text>
        </Pressable>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  accountCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  accountDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  accountHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
  },
  accountSection: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  accountTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  answer: {
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
  },
  answerText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
  },
  chevronExpanded: {
    transform: [{rotate: '180deg'}],
  },
  dangerIconFrame: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 90, 77, 0.08)',
    borderRadius: radius.sm,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.danger,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 124,
    paddingHorizontal: spacing.lg,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonPressed: {
    backgroundColor: 'rgba(255, 90, 77, 0.08)',
  },
  deleteButtonText: {
    color: colors.danger,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  faqItemDivider: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  faqList: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
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
  questionButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  questionButtonPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  questionText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
