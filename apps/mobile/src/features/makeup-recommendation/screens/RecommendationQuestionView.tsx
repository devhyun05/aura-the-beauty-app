import {useEffect, useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppCard, AppScreen} from '../../../shared/ui';
import type {MakeupRecommendationAnswer, MakeupRecommendationQuestion} from '../types';
import {getQuestionActionMode, getQuestionProgressSegments} from './makeupRecommendationViewContracts';
export {getQuestionActionMode, getQuestionProgressSegments} from './makeupRecommendationViewContracts';

type RecommendationQuestionViewProps = {
  currentQuestionIndex: number;
  onAnswer: (answer: MakeupRecommendationAnswer) => void;
  onBack: () => void;
  question: MakeupRecommendationQuestion;
  questionCount: number;
};

export function RecommendationQuestionView({
  currentQuestionIndex,
  onAnswer,
  onBack,
  question,
  questionCount,
}: RecommendationQuestionViewProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string>();
  const [freeText, setFreeText] = useState('');
  const [conditionInputVisible, setConditionInputVisible] = useState(false);
  const [additionalConstraints, setAdditionalConstraints] = useState('');
  const actionMode = getQuestionActionMode({currentQuestionIndex, questionCount});
  const isFinal = actionMode === 'complete';

  useEffect(() => {
    setSelectedOptionId(undefined);
    setFreeText('');
    setConditionInputVisible(false);
    setAdditionalConstraints('');
  }, [question.id]);

  const handleOptionPress = (optionId: string) => {
    if (!isFinal) {
      onAnswer({questionId: question.id, optionId});
      return;
    }
    setSelectedOptionId(optionId);
    setFreeText('');
  };

  const handleSubmit = () => {
    const trimmedFreeText = freeText.trim();
    if (!selectedOptionId && !trimmedFreeText) return;

    onAnswer({
      questionId: question.id,
      ...(selectedOptionId ? {optionId: selectedOptionId} : {freeText: trimmedFreeText}),
      ...(additionalConstraints.trim()
        ? {additionalConstraints: additionalConstraints.trim()}
        : {}),
    });
  };

  const canSubmit = Boolean(selectedOptionId || freeText.trim());

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}
    >
      <AppScreen
        contentGap={spacing.xl}
        keyboardShouldPersistTaps="handled"
        topPadding="belowShellHeader"
      >
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
            <Text style={styles.backLabel}>처음으로</Text>
          </Pressable>
          <Text style={styles.progress}>{currentQuestionIndex + 1} / {questionCount}</Text>
        </View>

        <View accessibilityLabel={`추천 질문 ${currentQuestionIndex + 1}/${questionCount}`} style={styles.progressTrack}>
          {getQuestionProgressSegments({currentQuestionIndex, questionCount}).map((segment, index) => (
            <View key={index} style={[styles.progressSegment, segment === 'complete' && styles.progressSegmentComplete]} />
          ))}
        </View>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>조금만 더 알려주세요</Text>
          <Text style={styles.title}>{question.title}</Text>
        </View>

        <View style={styles.options}>
          {question.options.map(option => {
            const selected = selectedOptionId === option.id;
            return (
              <AppCard
                accessibilityLabel={`${option.label} 선택`}
                accessibilityState={{selected}}
                key={option.id}
                onPress={() => handleOptionPress(option.id)}
                style={[styles.optionCard, selected ? styles.optionCardSelected : null]}
              >
                <Text style={[styles.optionLabel, selected ? styles.optionLabelSelected : null]}>
                  {option.label}
                </Text>
              </AppCard>
            );
          })}
        </View>

        <View style={styles.freeTextSection}>
          <Text style={styles.freeTextLabel}>선택지에 없다면 직접 말해도 좋아요</Text>
          <TextInput
            accessibilityLabel="질문에 직접 답하기"
            multiline
            onChangeText={value => {
              setFreeText(value);
              if (value.trim()) setSelectedOptionId(undefined);
            }}
            placeholder="내가 원하는 답을 자유롭게 적어주세요"
            placeholderTextColor={colors.textTertiary}
            style={styles.freeTextInput}
            value={freeText}
          />
        </View>

        {isFinal ? (
          <View style={styles.finalActions}>
            {conditionInputVisible ? (
              <TextInput
                accessibilityLabel="추가 조건 입력"
                onChangeText={setAdditionalConstraints}
                placeholder="예: 글리터 제외, 립 강조, 15분 이내"
                placeholderTextColor={colors.textTertiary}
                style={styles.conditionInput}
                value={additionalConstraints}
              />
            ) : null}
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConditionInputVisible(value => !value)}
                style={styles.conditionButton}
              >
                <Text style={styles.conditionButtonLabel}>
                  {conditionInputVisible ? '조건 닫기' : '+ 조건 추가'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{disabled: !canSubmit}}
                disabled={!canSubmit}
                onPress={handleSubmit}
                style={[styles.completeButton, !canSubmit ? styles.completeButtonDisabled : null]}
              >
                <Text style={[styles.completeLabel, !canSubmit ? styles.completeLabelDisabled : null]}>
                  추천받기
                </Text>
              </Pressable>
            </View>
          </View>
        ) : freeText.trim() ? (
          <Pressable accessibilityRole="button" onPress={handleSubmit} style={styles.directButton}>
            <Text style={styles.directButtonLabel}>이 답으로 계속하기</Text>
          </Pressable>
        ) : null}
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {flex: 1},
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    justifyContent: 'center',
    minHeight: 48,
    paddingRight: spacing.lg,
  },
  backLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },
  progress: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
  },
  progressTrack: {flexDirection: 'row', gap: spacing.xs},
  progressSegment: {backgroundColor: colors.borderStrong, borderRadius: radius.pill, flex: 1, height: 3},
  progressSegmentComplete: {backgroundColor: colors.textPrimary},
  heading: {gap: spacing.sm},
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 1,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  options: {gap: spacing.sm},
  optionCard: {
    justifyContent: 'center',
    minHeight: 62,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    width: '100%',
  },
  optionCardSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  optionLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
  },
  optionLabelSelected: {color: colors.white},
  freeTextSection: {gap: spacing.sm},
  freeTextLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },
  freeTextInput: {
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 76,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  finalActions: {gap: spacing.md},
  conditionInput: {
    borderBottomColor: colors.borderStrong,
    borderBottomWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
  },
  actionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  conditionButton: {
    justifyContent: 'center',
    minHeight: 48,
    paddingRight: spacing.md,
  },
  conditionButtonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  completeButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  completeButtonDisabled: {backgroundColor: colors.surfaceMuted},
  completeLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  completeLabelDisabled: {color: colors.textTertiary},
  directButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 48,
  },
  directButtonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
});
