import {useMemo, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
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
  ConsultingChip,
  ConsultingSectionTitle,
  PrimaryButton,
} from '../components/consultingComponents';
import {
  consultingBookingDays,
  consultingConcerns,
  consultingSharedReports,
} from '../mocks/consulting.mock';
import type {ConsultingBookingDraft, ConsultingExpert} from '../types';

type ConsultingBookingScreenProps = {
  expert: ConsultingExpert;
  durationId: string;
  onNext: (draft: ConsultingBookingDraft) => void;
};

export function ConsultingBookingScreen({
  expert,
  durationId,
  onNext,
}: ConsultingBookingScreenProps) {
  const [selectedDayId, setSelectedDayId] = useState(
    consultingBookingDays[0].id,
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedConcernId, setSelectedConcernId] = useState<string | null>(
    null,
  );
  const [shareReports, setShareReports] = useState(true);
  const [question, setQuestion] = useState('');

  const selectedDay = useMemo(
    () =>
      consultingBookingDays.find(day => day.id === selectedDayId) ??
      consultingBookingDays[0],
    [selectedDayId],
  );

  const canProceed = selectedSlotId !== null;

  const handleNext = () => {
    if (!selectedSlotId) {
      return;
    }

    onNext({
      expertId: expert.id,
      durationId,
      dayId: selectedDay.id,
      slotId: selectedSlotId,
      concernId: selectedConcernId,
      shareReports,
      question: question.trim(),
    });
  };

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md}>
        <View style={styles.section}>
          <ConsultingSectionTitle>날짜 선택</ConsultingSectionTitle>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}>
            {consultingBookingDays.map(day => {
              const selected = day.id === selectedDayId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  key={day.id}
                  onPress={() => {
                    setSelectedDayId(day.id);
                    setSelectedSlotId(null);
                  }}
                  style={({pressed}) => [
                    styles.dayCard,
                    selected && styles.dayCardSelected,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Text
                    style={[
                      styles.dayWeekday,
                      selected && styles.dayTextSelected,
                    ]}>
                    {day.weekday}
                  </Text>
                  <Text
                    style={[
                      styles.dayNumber,
                      selected && styles.dayTextSelected,
                    ]}>
                    {day.day}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>시간 선택</ConsultingSectionTitle>
          <View style={styles.slotRow}>
            {selectedDay.slots.map(slot => (
              <ConsultingChip
                disabled={!slot.available}
                key={slot.id}
                label={slot.label}
                onPress={() => setSelectedSlotId(slot.id)}
                selected={slot.id === selectedSlotId}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>어떤 고민인가요?</ConsultingSectionTitle>
          <View style={styles.slotRow}>
            {consultingConcerns.map(concern => (
              <ConsultingChip
                key={concern.id}
                label={concern.label}
                onPress={() =>
                  setSelectedConcernId(current =>
                    current === concern.id ? null : concern.id,
                  )
                }
                selected={concern.id === selectedConcernId}
              />
            ))}
          </View>
        </View>

        <View style={styles.shareCard}>
          <RNView style={styles.shareTextGroup}>
            <Text style={styles.shareTitle}>내 AI 리포트 공유</Text>
            <Text style={styles.shareDetail}>
              얼굴 분석 1건 · 메이크업 피드백 {consultingSharedReports.length - 1}건
            </Text>
          </RNView>
          <ShareToggle
            onToggle={() => setShareReports(current => !current)}
            value={shareReports}
          />
        </View>

        <View style={styles.section}>
          <ConsultingSectionTitle>사전 질문 (선택)</ConsultingSectionTitle>
          <TextInput
            multiline
            onChangeText={setQuestion}
            placeholder="상담 전에 미리 전달하고 싶은 내용을 적어주세요."
            placeholderTextColor={consultingColors.textSoft}
            style={styles.questionInput}
            value={question}
          />
        </View>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton disabled={!canProceed} label="다음" onPress={handleNext} />
      </ConsultingBottomBar>
    </RNView>
  );
}

function ShareToggle({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{checked: value}}
      onPress={onToggle}
      style={[styles.toggle, value ? styles.toggleOn : styles.toggleOff]}>
      <RNView
        style={[styles.toggleKnob, value ? styles.knobOn : styles.knobOff]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dayCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: 4,
    minWidth: 52,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dayCardSelected: {
    backgroundColor: consultingColors.accent,
    borderColor: consultingColors.accent,
  },
  dayNumber: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  dayRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  dayTextSelected: {
    color: consultingColors.onAccent,
  },
  dayWeekday: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  knobOff: {
    alignSelf: 'flex-start',
  },
  knobOn: {
    alignSelf: 'flex-end',
  },
  pressed: {
    opacity: 0.85,
  },
  questionInput: {
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 96,
    padding: 14,
    textAlignVertical: 'top',
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  section: {
    gap: spacing.md,
  },
  shareCard: {
    alignItems: 'center',
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  shareDetail: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  shareTextGroup: {
    flex: 1,
    paddingRight: spacing.md,
  },
  shareTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  slotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toggle: {
    borderRadius: consultingRadius.pill,
    height: 28,
    justifyContent: 'center',
    padding: 3,
    width: 48,
  },
  toggleKnob: {
    backgroundColor: consultingColors.surface,
    borderRadius: consultingRadius.pill,
    height: 22,
    width: 22,
  },
  toggleOff: {
    backgroundColor: consultingColors.border,
  },
  toggleOn: {
    backgroundColor: consultingColors.accent,
  },
});
