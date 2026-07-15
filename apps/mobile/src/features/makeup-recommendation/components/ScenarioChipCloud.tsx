import {StyleSheet, View} from 'react-native';

import {spacing} from '../../../shared/theme';
import type {MakeupScenarioPrompt} from '../types';
import {ScenarioPromptChip} from './ScenarioPromptChip';

type ScenarioChipCloudProps = {
  onSelect: (scenario: MakeupScenarioPrompt) => void;
  scenarios: readonly MakeupScenarioPrompt[];
  variant?: 'default' | 'popular';
};

export function ScenarioChipCloud({
  onSelect,
  scenarios,
  variant = 'default',
}: ScenarioChipCloudProps) {
  return (
    <View style={styles.cloud}>
      {scenarios.map(scenario => (
        <ScenarioPromptChip
          key={scenario.id}
          onPress={() => onSelect(scenario)}
          scenario={scenario}
          variant={variant}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cloud: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
