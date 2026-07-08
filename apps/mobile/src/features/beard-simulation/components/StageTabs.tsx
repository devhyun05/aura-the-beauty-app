import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {STAGE_DISPLAY} from '../constants';
import type {BeardSimulationStage} from '../types';

interface StageTabsProps {
  stages: BeardSimulationStage[];
  availableStages: BeardSimulationStage[];
  selected: BeardSimulationStage;
  onSelect: (stage: BeardSimulationStage) => void;
}

export function StageTabs({stages, availableStages, selected, onSelect}: StageTabsProps) {
  return (
    <View style={styles.row}>
      {stages.map(stage => {
        const available = availableStages.includes(stage);
        const active = stage === selected;
        return (
          <Pressable
            key={stage}
            disabled={!available}
            onPress={() => onSelect(stage)}
            style={[styles.tab, active && styles.tabActive, !available && styles.tabDisabled]}>
            <Text
              style={[
                styles.label,
                active && styles.labelActive,
                !available && styles.labelDisabled,
              ]}>
              {STAGE_DISPLAY[stage].label}
            </Text>
            {!available ? <Text style={styles.unavailable}>표시 불가</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: 8},
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#f1f2f4',
    alignItems: 'center',
  },
  tabActive: {backgroundColor: '#1c1c1e'},
  tabDisabled: {opacity: 0.5},
  label: {fontSize: 13, fontWeight: '600', color: '#333', textAlign: 'center'},
  labelActive: {color: '#fff'},
  labelDisabled: {color: '#999'},
  unavailable: {fontSize: 10, color: '#c33', marginTop: 2},
});
