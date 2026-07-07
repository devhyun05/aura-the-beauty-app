import {useMemo, useState} from 'react';
import {Pressable, StyleSheet, TextInput, View as RNView} from 'react-native';
import {Star} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingBottomBar,
  ExpertAvatar,
  PrimaryButton,
} from '../components/consultingComponents';
import type {
  ConsultingExpert,
  ConsultingRecord,
  ConsultingReviewDraft,
} from '../types';

type ConsultingReviewScreenProps = {
  expert: ConsultingExpert;
  record: ConsultingRecord | null;
  submitting?: boolean;
  onSubmit: (draft: ConsultingReviewDraft) => void;
};

export function ConsultingReviewScreen({
  expert,
  record,
  submitting = false,
  onSubmit,
}: ConsultingReviewScreenProps) {
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const trimmedBody = body.trim();
  const canSubmit = trimmedBody.length >= 10 && !submitting;
  const category = record?.categoryLabel ?? expert.title;

  const helperText = useMemo(() => {
    if (trimmedBody.length === 0) {
      return '상담 후 가장 도움이 된 점을 적어주세요.';
    }

    if (trimmedBody.length < 10) {
      return '10자 이상 입력해 주세요.';
    }

    return '작성한 리뷰는 상담사 프로필에 반영돼요.';
  }, [trimmedBody.length]);

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md} contentGap={spacing.xl}>
        <View style={styles.summaryCard}>
          <ExpertAvatar expert={expert} size={56} />
          <RNView style={styles.summaryBody}>
            <Text style={styles.summaryLabel}>상담 완료</Text>
            <Text numberOfLines={1} style={styles.summaryTitle}>
              {expert.name} · {record?.durationLabel ?? '화상 상담'}
            </Text>
            <Text numberOfLines={1} style={styles.summaryMeta}>
              {record?.dateLabel ?? category}
            </Text>
          </RNView>
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>상담은 어떠셨나요?</Text>
          <RNView style={styles.ratingRow}>
            {[1, 2, 3, 4, 5].map(step => {
              const selected = step <= rating;
              return (
                <Pressable
                  accessibilityLabel={`${step}점`}
                  accessibilityRole="button"
                  accessibilityState={{selected: step === rating}}
                  hitSlop={8}
                  key={step}
                  onPress={() => setRating(step)}
                  style={({pressed}) => [pressed ? styles.pressed : null]}>
                  <Star
                    color={
                      selected
                        ? consultingColors.roseStrong
                        : consultingColors.border
                    }
                    fill={
                      selected
                        ? consultingColors.roseStrong
                        : consultingColors.border
                    }
                    size={32}
                  />
                </Pressable>
              );
            })}
          </RNView>
        </View>

        <View style={styles.section}>
          <Text style={styles.inputLabel}>리뷰 내용</Text>
          <TextInput
            multiline
            onChangeText={setBody}
            placeholder="예: AI 진단 결과를 제 화장품에 맞춰 설명해줘서 바로 적용할 수 있었어요."
            placeholderTextColor={consultingColors.textSoft}
            style={styles.input}
            textAlignVertical="top"
            value={body}
          />
          <Text style={styles.helperText}>{helperText}</Text>
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton
          disabled={!canSubmit}
          label={submitting ? '저장 중...' : '리뷰 저장'}
          onPress={() =>
            onSubmit({
              body: trimmedBody,
              category,
              rating,
            })
          }
        />
      </ConsultingBottomBar>
    </RNView>
  );
}

const styles = StyleSheet.create({
  helperText: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  input: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 156,
    padding: 16,
  },
  inputLabel: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  summaryBody: {
    flex: 1,
  },
  summaryCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 16,
  },
  summaryLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
  summaryMeta: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  summaryTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    marginTop: 4,
  },
  title: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
});
