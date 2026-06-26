import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {YStack} from 'tamagui';

import {spacing} from '../../../shared/theme';
import {
  type ARMakeupOptionGroup,
  type ARMakeupOptionGroupId,
} from '../services/arFilterOptionRules';
import {OverlayChipButton} from '../../../shared/ui';

type ARFilterOptionGroupTabsProps = {
  optionGroups: readonly ARMakeupOptionGroup[];
  onOptionGroupPress: (optionGroup: ARMakeupOptionGroupId) => void;
  selectedMakeupOptionGroup: ARMakeupOptionGroupId;
};

export function ARFilterOptionGroupTabs({
  optionGroups,
  onOptionGroupPress,
  selectedMakeupOptionGroup,
}: ARFilterOptionGroupTabsProps) {
  return (
    <YStack style={styles.horizontalSection}>
      <ScrollView
        contentContainerStyle={styles.chipList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {optionGroups.map(group => (
          <OverlayChipButton
            key={group.id}
            isActive={group.id === selectedMakeupOptionGroup}
            label={group.label}
            onPress={() => onOptionGroupPress(group.id)}
          />
        ))}
      </ScrollView>
    </YStack>
  );
}

const styles = StyleSheet.create({
  horizontalSection: {
    gap: spacing.sm,
  },
  chipList: {
    gap: spacing.sm,
  },
});
