import {useState} from 'react';
import {Image, Pressable, StyleSheet, TextInput} from 'react-native';
import {ArrowLeft, CheckCircle2, Plus, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {getFilterExtractionDataSync} from '../services/filterExtractionService';
import type {FilterExtractionPhoto} from '../types';

type FilterSaveScreenProps = {
  photo: FilterExtractionPhoto;
  onBack: () => void;
  onSave: () => void;
};

const defaultTags = ['#어리어리', '#핑크메이크업', '#데일리', '#뮤트톤'];

export function FilterSaveScreen({photo, onBack, onSave}: FilterSaveScreenProps) {
  const insets = useSafeAreaInsets();
  const {result} = getFilterExtractionDataSync();
  const [filterName, setFilterName] = useState(result.title);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');

  return (
    <View style={styles.screen}>
      <YStack style={[styles.header, {paddingTop: insets.top + spacing.md}]}>
        <XStack style={styles.headerRow}>
          <Pressable accessibilityLabel="필터 적용 화면으로 돌아가기" accessibilityRole="button" onPress={onBack}>
            <ArrowLeft color={colors.textPrimary} size={iconSize.lg} strokeWidth={2} />
          </Pressable>
          <Text style={styles.headerTitle}>필터 저장</Text>
          <Pressable accessibilityLabel="저장 완료" accessibilityRole="button" onPress={onSave}>
            <Text style={styles.doneText}>완료</Text>
          </Pressable>
        </XStack>
      </YStack>

      <YStack style={styles.content}>
        <XStack style={styles.summaryRow}>
          <View style={styles.thumbFrame}>
            <Image resizeMode="cover" source={photo.imageSource} style={styles.thumbImage} />
          </View>
          <YStack style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>생성된 필터</Text>
            <Text style={styles.summaryDescription}>
              AR 적용값과 색감 조정값이 함께 저장돼요.
            </Text>
          </YStack>
        </XStack>

        <YStack style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>필터 이름</Text>
          <XStack style={styles.inputFrame}>
            <TextInput
              maxLength={20}
              onChangeText={setFilterName}
              placeholder="필터 이름을 입력하세요"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              value={filterName}
            />
            <Text style={styles.countText}>{filterName.length}/20</Text>
          </XStack>
        </YStack>

        <YStack style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>태그 추가</Text>
          <XStack style={styles.tagList}>
            {defaultTags.map((tag) => (
              <XStack key={tag} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
                <X color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
              </XStack>
            ))}
            <Pressable accessibilityLabel="태그 추가" accessibilityRole="button" style={styles.addTag}>
              <Plus color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
            </Pressable>
          </XStack>
        </YStack>

        <YStack style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>공개 설정</Text>
          <XStack style={styles.visibilityControl}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: visibility === 'private'}}
              onPress={() => setVisibility('private')}
              style={[
                styles.visibilityButton,
                visibility === 'private' ? styles.visibilityButtonActive : undefined,
              ]}>
              <CheckCircle2
                color={visibility === 'private' ? colors.white : colors.textTertiary}
                size={iconSize.xs}
                strokeWidth={2}
              />
              <Text
                style={
                  visibility === 'private'
                    ? styles.visibilityTextActive
                    : styles.visibilityText
                }>
                나만 보기
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: visibility === 'public'}}
              onPress={() => setVisibility('public')}
              style={[
                styles.visibilityButton,
                visibility === 'public' ? styles.visibilityButtonActive : undefined,
              ]}>
              <CheckCircle2
                color={visibility === 'public' ? colors.white : colors.textTertiary}
                size={iconSize.xs}
                strokeWidth={2}
              />
              <Text
                style={
                  visibility === 'public'
                    ? styles.visibilityTextActive
                    : styles.visibilityText
                }>
                공개하기
              </Text>
            </Pressable>
          </XStack>
        </YStack>
      </YStack>

      <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.lg}]}>
        <Pressable
          accessibilityLabel="필터 저장하기"
          accessibilityRole="button"
          onPress={onSave}
          style={({pressed}) => [styles.saveButton, pressed && styles.pressed]}>
          <Text style={styles.saveButtonText}>저장하기</Text>
        </Pressable>
      </YStack>
    </View>
  );
}

const styles = StyleSheet.create({
  addTag: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 44,
  },
  content: {
    flex: 1,
    gap: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  countText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  doneText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  fieldGroup: {
    gap: spacing.md,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  footer: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    padding: 0,
  },
  inputFrame: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  pressed: {
    opacity: 0.78,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  summaryCopy: {
    flex: 1,
    gap: spacing.xs,
    justifyContent: 'center',
    minWidth: 0,
  },
  summaryDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagPill: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tagText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  thumbFrame: {
    borderRadius: radius.md,
    height: 64,
    overflow: 'hidden',
    width: 92,
  },
  thumbImage: {
    height: '100%',
    width: '100%',
  },
  visibilityButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 48,
  },
  visibilityButtonActive: {
    backgroundColor: colors.textPrimary,
  },
  visibilityControl: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    padding: spacing.xs,
  },
  visibilityText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  visibilityTextActive: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
