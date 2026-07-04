import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {Check} from 'lucide-react-native';
import {Text, View, YStack} from 'tamagui';

import {
  FLOATING_ACTION_MAX_ITEM_COUNT,
  floatingActionInteractionModeOptions,
  floatingActionDefinitions,
  getNextFloatingActionSelection,
  getFloatingActionSelectedSlotNumber,
  type FloatingActionId,
  type FloatingActionInteractionMode,
} from '../../../shared/ui';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';

type FloatingActionSettingsScreenProps = {
  onChangeActionIds?: (actionIds: readonly FloatingActionId[]) => void;
  onChangeInteractionMode?: (mode: FloatingActionInteractionMode) => void;
  selectedActionIds: readonly FloatingActionId[];
  selectedInteractionMode: FloatingActionInteractionMode;
};

export function getFloatingActionInteractionModeLabels(): readonly string[] {
  return floatingActionInteractionModeOptions.map(option => option.label);
}

export function getFloatingActionSelectionBadgeLabel(
  selectedActionIds: readonly FloatingActionId[],
  actionId: FloatingActionId,
): string {
  const slotNumber = getFloatingActionSelectedSlotNumber(selectedActionIds, actionId);

  return slotNumber ? String(slotNumber) : '';
}

export function FloatingActionSettingsScreen({
  onChangeActionIds,
  onChangeInteractionMode,
  selectedActionIds,
  selectedInteractionMode,
}: FloatingActionSettingsScreenProps) {
  const selectedCount = selectedActionIds.length;

  return (
    <YStack style={styles.screen}>
      <YStack style={styles.header}>
        <Text style={styles.title}>별 버튼 빠른 실행</Text>
        <Text style={styles.countText}>
          {selectedCount}/{FLOATING_ACTION_MAX_ITEM_COUNT} 선택됨
        </Text>
      </YStack>

      <YStack style={styles.section}>
        <Text style={styles.sectionTitle}>조작 방식</Text>
        <YStack style={styles.modeList}>
          {floatingActionInteractionModeOptions.map(option => {
            const isSelected = option.id === selectedInteractionMode;

            return (
              <Pressable
                accessibilityLabel={`${option.label} 선택`}
                accessibilityRole="button"
                accessibilityState={{selected: isSelected}}
                key={option.id}
                onPress={() => onChangeInteractionMode?.(option.id)}
                style={({pressed}) => [
                  styles.modeRow,
                  isSelected && styles.modeRowSelected,
                  pressed && styles.pressed,
                ]}>
                <YStack style={styles.modeCopy}>
                  <Text style={styles.modeTitle}>{option.label}</Text>
                  <Text style={styles.modeDescription}>{option.description}</Text>
                </YStack>

                <View
                  style={[
                    styles.checkmark,
                    isSelected && styles.checkmarkSelected,
                  ]}>
                  {isSelected ? (
                    <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </YStack>
      </YStack>

      <YStack style={styles.actionList}>
        {floatingActionDefinitions.map(action => {
          const slotNumber = getFloatingActionSelectedSlotNumber(
            selectedActionIds,
            action.id,
          );
          const badgeLabel = getFloatingActionSelectionBadgeLabel(
            selectedActionIds,
            action.id,
          );
          const isSelected = slotNumber !== null;
          const isDisabled =
            !isSelected && selectedCount >= FLOATING_ACTION_MAX_ITEM_COUNT;

          return (
            <Pressable
              accessibilityLabel={`${action.label} 빠른 실행 ${
                isSelected
                  ? `${slotNumber}번 자리 해제`
                  : `${selectedCount + 1}번 자리로 추가`
              }`}
              accessibilityRole="button"
              accessibilityState={{disabled: isDisabled, selected: isSelected}}
              disabled={isDisabled}
              key={action.id}
              onPress={() => {
                onChangeActionIds?.(
                  getNextFloatingActionSelection(selectedActionIds, action.id),
                );
              }}
              style={({pressed}) => [
                styles.actionRow,
                isSelected && styles.actionRowSelected,
                isDisabled && styles.actionRowDisabled,
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.actionIcon,
                  isSelected && styles.actionIconSelected,
                ]}>
                {action.icon(isSelected ? colors.white : colors.textPrimary)}
              </View>

              <YStack style={styles.actionCopy}>
                <Text style={styles.actionTitle}>{action.label}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
              </YStack>

              <View
                style={[
                  styles.checkmark,
                  isSelected && styles.checkmarkSelected,
                ]}>
                {isSelected ? (
                  <Text style={styles.slotBadgeText}>{badgeLabel}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </YStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  actionCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  actionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  actionIconSelected: {
    backgroundColor: colors.textPrimary,
  },
  actionList: {
    gap: spacing.md,
  },
  actionRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 76,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.06,
    shadowRadius: 14,
  },
  actionRowDisabled: {
    opacity: 0.42,
  },
  actionRowSelected: {
    borderColor: colors.textPrimary,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  checkmark: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkmarkSelected: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  countText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  header: {
    gap: spacing.sm,
  },
  modeCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  modeDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  modeList: {
    gap: spacing.sm,
  },
  modeRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 70,
    padding: spacing.lg,
  },
  modeRowSelected: {
    borderColor: colors.textPrimary,
  },
  modeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  slotBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xl,
  },
});
