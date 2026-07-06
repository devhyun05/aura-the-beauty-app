import React from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {
  FLOATING_ACTION_MAX_ITEM_COUNT,
  floatingActionButtonPositionOptions,
  floatingActionInteractionModeOptions,
  floatingActionDefinitions,
  getNextFloatingActionSelection,
  getFloatingActionSelectedSlotNumber,
  AppScreen,
  type FloatingActionButtonPosition,
  type FloatingActionId,
  type FloatingActionInteractionMode,
} from '../../../shared/ui';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';

type FloatingActionSettingsScreenProps = {
  onChangeActionIds?: (actionIds: readonly FloatingActionId[]) => void;
  onChangeButtonPosition?: (position: FloatingActionButtonPosition) => void;
  onChangeInteractionMode?: (mode: FloatingActionInteractionMode) => void;
  selectedActionIds: readonly FloatingActionId[];
  selectedButtonPosition: FloatingActionButtonPosition;
  selectedInteractionMode: FloatingActionInteractionMode;
};

export function getFloatingActionInteractionModeLabels(): readonly string[] {
  return floatingActionInteractionModeOptions.map(option => option.label);
}

export function getFloatingActionInteractionModeSelectionBadgeLabel(): '하나 선택' {
  return '하나 선택';
}

export function getFloatingActionButtonPositionLabels(): readonly string[] {
  return floatingActionButtonPositionOptions.map(option => option.label);
}

export function getFloatingActionCandidateLabels(): readonly string[] {
  return floatingActionDefinitions.map(action => action.label);
}

export function getFloatingActionSelectedCountLabel(
  selectedActionIds: readonly FloatingActionId[],
): string {
  return `${selectedActionIds.length}/${FLOATING_ACTION_MAX_ITEM_COUNT} 선택됨`;
}

export function getFloatingActionSelectionBadgeLabel(
  selectedActionIds: readonly FloatingActionId[],
  actionId: FloatingActionId,
): string {
  const slotNumber = getFloatingActionSelectedSlotNumber(selectedActionIds, actionId);

  return slotNumber ? String(slotNumber) : '';
}

export const FLOATING_ACTION_SETTINGS_SCREEN_SCROLL_ENABLED = true;
export const FLOATING_ACTION_SETTINGS_SCREEN_TOP_PADDING =
  'belowOverlayHeader' as const;

export function FloatingActionSettingsScreen({
  onChangeActionIds,
  onChangeButtonPosition,
  onChangeInteractionMode,
  selectedActionIds,
  selectedButtonPosition,
  selectedInteractionMode,
}: FloatingActionSettingsScreenProps) {
  const selectedCount = selectedActionIds.length;

  return (
    <AppScreen
      contentGap={spacing.xl}
      horizontalPadding={spacing.lg}
      scroll={FLOATING_ACTION_SETTINGS_SCREEN_SCROLL_ENABLED}
      topPadding={FLOATING_ACTION_SETTINGS_SCREEN_TOP_PADDING}>
      <YStack style={styles.section}>
        <XStack style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>조작 방식</Text>
          <Text style={styles.modeSelectionBadge}>
            {getFloatingActionInteractionModeSelectionBadgeLabel()}
          </Text>
        </XStack>
        <YStack style={styles.modeList}>
          {floatingActionInteractionModeOptions.map(option => {
            const isSelected = option.id === selectedInteractionMode;

            return (
              <Pressable
                accessibilityLabel={`${option.label} 선택`}
                accessibilityRole="radio"
                accessibilityState={{selected: isSelected}}
                key={option.id}
                onPress={() => onChangeInteractionMode?.(option.id)}
                style={({pressed}) => [
                  styles.modeRow,
                  isSelected && styles.modeRowSelected,
                  pressed && styles.pressed,
                ]}>
                <View
                  style={[
                    styles.modeRadio,
                    isSelected && styles.modeRadioSelected,
                  ]}>
                  {isSelected ? <View style={styles.modeRadioDot} /> : null}
                </View>

                <YStack style={styles.modeCopy}>
                  <Text style={[styles.modeTitle, isSelected && styles.modeTitleSelected]}>
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.modeDescription,
                      isSelected && styles.modeDescriptionSelected,
                    ]}>
                    {option.description}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </YStack>
      </YStack>

      <YStack style={styles.section}>
        <XStack style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>버튼 위치</Text>
          <Text style={styles.modeSelectionBadge}>
            {getFloatingActionInteractionModeSelectionBadgeLabel()}
          </Text>
        </XStack>
        <YStack style={styles.modeList}>
          {floatingActionButtonPositionOptions.map(option => {
            const isSelected = option.id === selectedButtonPosition;

            return (
              <Pressable
                accessibilityLabel={`${option.label} 배치 선택`}
                accessibilityRole="radio"
                accessibilityState={{selected: isSelected}}
                key={option.id}
                onPress={() => onChangeButtonPosition?.(option.id)}
                style={({pressed}) => [
                  styles.modeRow,
                  isSelected && styles.modeRowSelected,
                  pressed && styles.pressed,
                ]}>
                <View
                  style={[
                    styles.modeRadio,
                    isSelected && styles.modeRadioSelected,
                  ]}>
                  {isSelected ? <View style={styles.modeRadioDot} /> : null}
                </View>

                <YStack style={styles.modeCopy}>
                  <Text style={[styles.modeTitle, isSelected && styles.modeTitleSelected]}>
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.modeDescription,
                      isSelected && styles.modeDescriptionSelected,
                    ]}>
                    {option.description}
                  </Text>
                </YStack>
              </Pressable>
            );
          })}
        </YStack>
      </YStack>

      <YStack style={styles.section}>
        <XStack style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>기능 등록</Text>
          <Text style={styles.countText}>
            {getFloatingActionSelectedCountLabel(selectedActionIds)}
          </Text>
        </XStack>

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
    </AppScreen>
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
    backgroundColor: colors.blackSurface,
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
    backgroundColor: colors.blackSurface,
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
  modeRadio: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  modeRadioDot: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 10,
    width: 10,
  },
  modeRadioSelected: {
    borderColor: colors.white,
    borderWidth: 2,
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
    backgroundColor: colors.blackSurface,
    borderColor: colors.textPrimary,
  },
  modeSelectionBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modeDescriptionSelected: {
    color: colors.white,
  },
  modeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  modeTitleSelected: {
    color: colors.white,
  },
  pressed: {
    opacity: 0.78,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
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
});
