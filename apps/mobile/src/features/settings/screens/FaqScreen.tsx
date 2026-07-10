import React, {useState} from 'react';
import {ChevronDown} from 'lucide-react-native';
import {Pressable, StyleSheet, Text, View} from 'react-native';

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
] as const;

export function FaqScreen() {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
