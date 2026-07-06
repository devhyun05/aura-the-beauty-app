import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {Button, Text, View, YStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  type ARMakeupOptionGroup,
  type ARMakeupOptionGroupId,
} from '../services/arFilterOptionRules';

type ARFilterOptionGroupTabsProps = {
  optionGroups: readonly ARMakeupOptionGroup[];
  onOptionGroupPress: (optionGroup: ARMakeupOptionGroupId) => void;
  selectedMakeupOptionGroup: ARMakeupOptionGroupId;
};

export const AR_FILTER_OPTION_GROUP_SELECTOR_STYLE = 'compactTextTabs' as const;
export const AR_FILTER_OPTION_GROUP_SELECTOR_CHROME = 'none' as const;
export const AR_FILTER_OPTION_GROUP_SELECTOR_ACTIVE_INDICATOR = 'underline' as const;
export const AR_FILTER_OPTION_GROUP_SELECTOR_HEIGHT = spacing.xxl;
export const AR_FILTER_OPTION_GROUP_SELECTOR_VERTICAL_FOOTPRINT =
  AR_FILTER_OPTION_GROUP_SELECTOR_HEIGHT + spacing.xs;

export function ARFilterOptionGroupTabs({
  optionGroups,
  onOptionGroupPress,
  selectedMakeupOptionGroup,
}: ARFilterOptionGroupTabsProps) {
  return (
    <YStack style={styles.horizontalSection}>
      <ScrollView
        contentContainerStyle={styles.tabList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {optionGroups.map(group => {
          const isActive = group.id === selectedMakeupOptionGroup;

          return (
            <Button
              accessibilityLabel={`${group.label} 상세 옵션 선택`}
              accessibilityRole="button"
              accessibilityState={{selected: isActive}}
              key={group.id}
              onPress={() => onOptionGroupPress(group.id)}
              pressStyle={{opacity: 0.72}}
              style={styles.textTab}
              unstyled>
              <Text
                numberOfLines={1}
                style={[
                  styles.textTabLabel,
                  isActive ? styles.textTabLabelActive : undefined,
                ]}>
                {group.label}
              </Text>
              <View
                style={[
                  styles.textTabIndicator,
                  !isActive ? styles.textTabIndicatorInactive : undefined,
                ]}
              />
            </Button>
          );
        })}
      </ScrollView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  horizontalSection: {
    gap: spacing.xs,
  },
  tabList: {
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: AR_FILTER_OPTION_GROUP_SELECTOR_VERTICAL_FOOTPRINT,
  },
  textTab: {
    alignItems: 'center',
    gap: spacing.xs / 2,
    height: AR_FILTER_OPTION_GROUP_SELECTOR_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  textTabIndicator: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 2,
    width: 16,
  },
  textTabIndicatorInactive: {
    opacity: 0,
  },
  textTabLabel: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  textTabLabelActive: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontWeight: typography.fontWeight.bold,
  },
});
