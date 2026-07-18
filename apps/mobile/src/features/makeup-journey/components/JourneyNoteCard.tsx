import {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, TextInput} from 'react-native';
import {BookOpenText} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupJourneyNote} from '../types';

type JourneyNoteCardProps = {
  disabled?: boolean;
  isSaving?: boolean;
  note: MakeupJourneyNote | null;
  onSave: (content: string) => Promise<void>;
};

export function JourneyNoteCard({
  disabled = false,
  isSaving = false,
  note,
  onSave,
}: JourneyNoteCardProps) {
  const [content, setContent] = useState(note?.content ?? '');

  useEffect(() => {
    setContent(note?.content ?? '');
  }, [note?.content]);

  const hasChanges = content !== (note?.content ?? '');

  return (
    <View accessibilityLabel="일기와 메모" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <BookOpenText color={colors.textPrimary} size={20} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>일기 & 메모</Text>
          <Text style={styles.description}>느낀 점이나 다음에 기억할 내용을 남겨 보세요.</Text>
        </View>
      </View>
      {disabled ? (
        <View style={styles.disabledMessage}>
          <Text style={styles.disabledText}>메모는 오늘 또는 지난 날짜에 작성할 수 있어요.</Text>
        </View>
      ) : (
        <>
          <TextInput
            accessibilityLabel="메이크업 성장 메모"
            editable={!isSaving}
            maxLength={2000}
            multiline
            onChangeText={setContent}
            placeholder="오늘의 메이크업과 피드백을 기록해 주세요."
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            textAlignVertical="top"
            value={content}
          />
          <View style={styles.footer}>
            <Text style={styles.count}>{content.length}/2,000</Text>
            <Pressable
              accessibilityLabel={content.trim() ? '메모 저장' : '메모 삭제'}
              accessibilityRole="button"
              disabled={!hasChanges || isSaving}
              onPress={() => void onSave(content)}
              style={({pressed}) => [
                styles.saveButton,
                !hasChanges || isSaving ? styles.buttonDisabled : null,
                pressed ? styles.pressed : null,
              ]}>
              {isSaving ? <ActivityIndicator color={colors.white} size="small" /> : null}
              <Text style={styles.saveText}>{isSaving ? '저장 중' : '저장'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.42,
  },
  card: {
    ...shadows.soft,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    gap: spacing.lg,
    padding: spacing.xl,
  },
  count: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  disabledMessage: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 100,
    padding: spacing.lg,
  },
  disabledText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: 150,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.72,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 82,
    paddingHorizontal: spacing.lg,
  },
  saveText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
});
