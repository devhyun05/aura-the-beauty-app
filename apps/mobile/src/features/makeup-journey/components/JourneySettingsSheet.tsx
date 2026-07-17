import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import {Minus, Plus, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyMissionLevel, MakeupJourneySettings} from '../types';

type JourneySettingsSheetProps = {
  error?: string | null;
  isSaving?: boolean;
  isVisible: boolean;
  onClose: () => void;
  onSave: (input: {
    goalScore: number;
    missionLevel: MakeupJourneyMissionLevel;
  }) => void;
  settings?: MakeupJourneySettings | null;
};

function clampGoalScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 80;
  }
  return Math.max(1, Math.min(100, Math.round(value)));
}

export function JourneySettingsSheet({
  error,
  isSaving = false,
  isVisible,
  onClose,
  onSave,
  settings,
}: JourneySettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const [goalInput, setGoalInput] = useState(String(settings?.goalScore ?? 80));

  useEffect(() => {
    if (isVisible) {
      setGoalInput(String(settings?.goalScore ?? 80));
    }
  }, [isVisible, settings?.goalScore]);

  const goalScore = clampGoalScore(Number(goalInput));
  const changeGoal = (offset: number) => {
    setGoalInput(String(clampGoalScore(goalScore + offset)));
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={isVisible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}>
        <Pressable
          accessibilityLabel="설정 닫기"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.scrim}
        />
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {paddingBottom: Math.max(insets.bottom, spacing.xxl)},
            ]}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>메이크업 성장 설정</Text>
                <Text style={styles.description}>
                  목표 점수만 정하면 서로 다른 데일리 미션 세 가지를 추천해 드려요.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="설정 닫기"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                style={styles.closeButton}>
                <X color={colors.textPrimary} size={21} />
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>목표 점수</Text>
              <View style={styles.stepper}>
                <Pressable
                  accessibilityLabel="목표 점수 1점 낮추기"
                  accessibilityRole="button"
                  disabled={isSaving || goalScore <= 1}
                  onPress={() => changeGoal(-1)}
                  style={({pressed}) => [styles.stepButton, pressed ? styles.pressed : null]}>
                  <Minus color={colors.textPrimary} size={20} />
                </Pressable>
                <TextInput
                  accessibilityLabel="목표 점수"
                  editable={!isSaving}
                  keyboardType="number-pad"
                  maxLength={3}
                  onBlur={() => setGoalInput(String(goalScore))}
                  onChangeText={value => setGoalInput(value.replace(/\D/g, ''))}
                  selectTextOnFocus
                  style={styles.scoreInput}
                  value={goalInput}
                />
                <Text style={styles.scoreUnit}>점</Text>
                <Pressable
                  accessibilityLabel="목표 점수 1점 높이기"
                  accessibilityRole="button"
                  disabled={isSaving || goalScore >= 100}
                  onPress={() => changeGoal(1)}
                  style={({pressed}) => [styles.stepButton, pressed ? styles.pressed : null]}>
                  <Plus color={colors.textPrimary} size={20} />
                </Pressable>
              </View>
              <Text style={styles.helper}>1점부터 100점까지 설정할 수 있어요.</Text>
            </View>

            <Text style={styles.notice}>
              목표 점수를 바꾸면 지난 기록의 성공 여부도 새 기준으로 바뀌어요.
            </Text>

            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
            ) : null}

            <Pressable
              accessibilityLabel="메이크업 성장 설정 저장"
              accessibilityRole="button"
              disabled={isSaving || goalInput.length === 0}
              onPress={() => onSave({
                goalScore,
                missionLevel: settings?.missionLevel ?? 'beginner',
              })}
              style={({pressed}) => [
                styles.saveButton,
                isSaving || goalInput.length === 0 ? styles.disabled : null,
                pressed ? styles.pressed : null,
              ]}>
              {isSaving ? <ActivityIndicator color={colors.white} size="small" /> : null}
              <Text style={styles.saveText}>{isSaving ? '저장 중' : '저장하기'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  disabled: {
    opacity: 0.48,
  },
  error: {
    color: colors.danger,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 40,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  helper: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  notice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    padding: spacing.md,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pressed: {
    opacity: 0.72,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  saveText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  scrollContent: {
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  scoreInput: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    minWidth: 70,
    padding: 0,
    textAlign: 'center',
  },
  scoreUnit: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  scrim: {
    backgroundColor: colors.blackSurface,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sheet: {
    backgroundColor: colors.bottomSheetSurface,
    borderColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    maxHeight: '92%',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
});
