import {useState} from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  type ImageSourcePropType,
} from 'react-native';
import {Check, CheckCircle2, Plus, X} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {
  getMakeupFilterSavePartAreaLabel,
  getMakeupFilterSaveScopeSummary,
  isMakeupFilterSaveEnabled,
  type MakeupFilterSaveSettings,
} from '../services/makeupFilterSaveModel';

type MakeupFilterSaveScreenProps = {
  imageSource: ImageSourcePropType;
  onSave: (settings: MakeupFilterSaveSettings) => void;
  onSettingsChange: (settings: MakeupFilterSaveSettings) => void;
  settings: MakeupFilterSaveSettings;
  summaryDescription?: string;
  summaryTitle?: string;
};

const defaultTags = ['#어리어리', '#핑크메이크업', '#데일리', '#뮤트톤'];

export function MakeupFilterSaveScreen({
  imageSource,
  onSave,
  onSettingsChange,
  settings,
  summaryDescription = 'AR 적용값과 조정값이 함께 저장돼요.',
  summaryTitle = '저장할 메이크업 룩',
}: MakeupFilterSaveScreenProps) {
  const insets = useSafeAreaInsets();
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const isSaveEnabled = isMakeupFilterSaveEnabled(settings);
  const hasSeparatedPartAreas = settings.savePartAreas.length > 0;

  const updateSettings = (nextSettings: Partial<MakeupFilterSaveSettings>) => {
    onSettingsChange({
      ...settings,
      ...nextSettings,
    });
  };

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      <YStack style={styles.content}>
        <XStack style={styles.summaryRow}>
          <View style={styles.thumbFrame}>
            <Image resizeMode="cover" source={imageSource} style={styles.thumbImage} />
          </View>
          <YStack style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>{summaryTitle}</Text>
            <Text style={styles.summaryDescription}>
              {summaryDescription}
            </Text>
          </YStack>
        </XStack>

        <YStack style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>메이크업 룩 이름</Text>
          <XStack style={styles.inputFrame}>
            <TextInput
              maxLength={20}
              onChangeText={makeupLookName => updateSettings({makeupLookName})}
              placeholder="메이크업 룩 이름을 입력하세요"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              value={settings.makeupLookName}
            />
            <Text style={styles.countText}>{settings.makeupLookName.length}/20</Text>
          </XStack>
        </YStack>

        <YStack style={styles.fieldGroup}>
          <XStack style={styles.fieldTitleRow}>
            <Text style={styles.fieldLabel}>저장 범위</Text>
            <Text style={styles.scopeSummary}>
              {getMakeupFilterSaveScopeSummary(settings)}
            </Text>
          </XStack>

          <YStack style={styles.scopeOptionList}>
            <SaveScopeOption
              checked={settings.saveTotalLook}
              description="현재 조합을 하나의 완성 룩 필터로 저장해요."
              label="전체 룩 필터 저장"
              onPress={() => updateSettings({saveTotalLook: !settings.saveTotalLook})}
            />
            <SaveScopeOption
              checked={settings.saveSeparatedParts}
              description={
                hasSeparatedPartAreas
                  ? '아이, 립처럼 적용 부위를 각각 다시 쓸 수 있게 저장해요.'
                  : '이 필터에는 분리 저장할 부위 정보가 없어요.'
              }
              disabled={!hasSeparatedPartAreas}
              label="필터 부위별 분리 저장"
              onPress={() =>
                updateSettings({saveSeparatedParts: !settings.saveSeparatedParts})
              }
            />
          </YStack>

          {hasSeparatedPartAreas ? (
            <XStack style={styles.partAreaList}>
              {settings.savePartAreas.map(area => (
                <View key={area} style={styles.partAreaPill}>
                  <Text style={styles.partAreaText}>
                    {getMakeupFilterSavePartAreaLabel(area)}
                  </Text>
                </View>
              ))}
            </XStack>
          ) : null}
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
          accessibilityLabel="메이크업 룩 저장하기"
          accessibilityRole="button"
          accessibilityState={{disabled: !isSaveEnabled}}
          disabled={!isSaveEnabled}
          onPress={() => onSave(settings)}
          style={({pressed}) => [
            styles.saveButton,
            !isSaveEnabled ? styles.saveButtonDisabled : undefined,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.saveButtonText}>저장하기</Text>
        </Pressable>
      </YStack>
    </AppScreen>
  );
}

function SaveScopeOption({
  checked,
  description,
  disabled = false,
  label,
  onPress,
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{checked, disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.scopeOption,
        checked ? styles.scopeOptionChecked : undefined,
        disabled ? styles.scopeOptionDisabled : undefined,
        pressed ? styles.pressed : undefined,
      ]}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : undefined]}>
        {checked ? (
          <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
        ) : null}
      </View>
      <YStack style={styles.scopeOptionCopy}>
        <Text style={disabled ? styles.scopeOptionLabelDisabled : styles.scopeOptionLabel}>
          {label}
        </Text>
        <Text style={styles.scopeOptionDescription}>{description}</Text>
      </YStack>
    </Pressable>
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
  fieldGroup: {
    gap: spacing.md,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  fieldTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  footer: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
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
  partAreaList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  partAreaPill: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  partAreaText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
  },
  saveButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  scopeOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  scopeOptionChecked: {
    borderColor: colors.textPrimary,
  },
  scopeOptionCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  scopeOptionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  scopeOptionDisabled: {
    opacity: 0.48,
  },
  scopeOptionLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  scopeOptionLabelDisabled: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  scopeOptionList: {
    gap: spacing.sm,
  },
  scopeSummary: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'right',
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
    backgroundColor: colors.blackSurface,
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
  checkbox: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxChecked: {
    backgroundColor: colors.blackSurface,
    borderColor: colors.textPrimary,
  },
});
