import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  MAKEUP_RECOMMENDATION_CUSTOM_SITUATION_MAX_LENGTH,
  validateMakeupRecommendationCustomSituation,
} from '../services/makeupRecommendationCustomSituationValidation';

export function CustomSituationComposer({
  disabled,
  onCancel,
  onChangeText,
  onSubmit,
  serverError,
  value,
  visible,
}: {
  disabled?: boolean;
  onCancel: () => void;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  serverError?: string;
  value: string;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const validation = validateMakeupRecommendationCustomSituation(value);
  const normalizedServerError = serverError?.trim() ?? '';
  const hasText = Boolean(value.trim());
  const shouldShowError = Boolean(normalizedServerError) || (Boolean(value.trim()) && !validation.isValid);
  const errorMessage = normalizedServerError || validation.errorMessage;
  const canSubmit = hasText && validation.isValid && !normalizedServerError && !disabled;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalRoot}
      >
        <Pressable
          accessibilityLabel="직접 설명 닫기"
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.title}>원하는 상황을 직접 설명해 주세요</Text>
              <Text style={styles.description}>짧게 적어도 AI가 맥락을 해석해요. 장면·역할·분위기·피할 조건을 자유롭게 적어주세요.</Text>
            </View>
            <Pressable
              accessibilityLabel="직접 설명 닫기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onCancel}
              style={({pressed}) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeLabel}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scroller}
          >
            <View style={[styles.inputFrame, shouldShowError && styles.inputFrameError]}>
              <TextInput
                accessibilityLabel="원하는 메이크업 상황 직접 입력"
                autoFocus
                maxLength={MAKEUP_RECOMMENDATION_CUSTOM_SITUATION_MAX_LENGTH}
                multiline
                onChangeText={onChangeText}
                placeholder="예: 로판 여주 / 맑고 단정하게 / 내일 첫 만남"
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                textAlignVertical="top"
                value={value}
              />
              <View style={styles.inputMetaRow}>
                {shouldShowError ? (
                  <Text accessibilityRole="alert" style={styles.validationText}>{errorMessage}</Text>
                ) : (
                  <View style={styles.validationSpacer} />
                )}
                <Text style={styles.countText}>
                  {value.length}/{MAKEUP_RECOMMENDATION_CUSTOM_SITUATION_MAX_LENGTH}
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelLabel}>취소</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{disabled: !canSubmit}}
              disabled={!canSubmit}
              onPress={onSubmit}
              style={[styles.submitButton, !canSubmit && styles.submitDisabled]}
            >
              <Text style={[styles.submitLabel, !canSubmit && styles.submitLabelDisabled]}>질문 시작하기</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {flex: 1},
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
    maxHeight: '90%',
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  header: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between'},
  heading: {flex: 1, gap: spacing.xs},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, lineHeight: typography.lineHeight.lg},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  closeButton: {alignItems: 'center', borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: spacing.md},
  closeLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  scroller: {flexShrink: 1},
  content: {paddingVertical: spacing.xs},
  input: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm, minHeight: 88, padding: 0},
  inputFrame: {backgroundColor: colors.bottomSheetSurface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, minHeight: 136, padding: spacing.md},
  inputFrameError: {borderColor: colors.heart},
  inputMetaRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between'},
  validationText: {color: colors.heart, flex: 1, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  validationSpacer: {flex: 1},
  countText: {color: colors.textTertiary, flexShrink: 0, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  actions: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm},
  cancelButton: {alignItems: 'center', justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md},
  cancelLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  submitButton: {alignItems: 'center', backgroundColor: colors.textPrimary, borderRadius: radius.pill, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: spacing.md},
  submitDisabled: {backgroundColor: colors.border},
  submitLabel: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  submitLabelDisabled: {color: colors.textTertiary},
  pressed: {backgroundColor: colors.divider},
});
