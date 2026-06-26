import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import {YStack} from 'tamagui';

import {spacing} from '../../../shared/theme';
import type {MakeupArea, MakeupAreaOption} from '../../../shared/types/makeupGuide';
import {OverlayChipButton} from '../../../shared/ui';

type ARFilterMakeupAreaTabsProps = {
  makeupAreas: readonly MakeupAreaOption[];
  onMakeupAreaPress: (makeupArea: MakeupArea) => void;
  selectedMakeupArea: MakeupArea;
};

export function ARFilterMakeupAreaTabs({
  makeupAreas,
  onMakeupAreaPress,
  selectedMakeupArea,
}: ARFilterMakeupAreaTabsProps) {
  return (
    <YStack style={styles.horizontalSection}>
      <ScrollView
        contentContainerStyle={styles.chipList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {makeupAreas.map(makeupArea => (
          <OverlayChipButton
            key={makeupArea.id}
            isActive={makeupArea.id === selectedMakeupArea}
            label={makeupArea.label}
            onPress={() => onMakeupAreaPress(makeupArea.id)}
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
