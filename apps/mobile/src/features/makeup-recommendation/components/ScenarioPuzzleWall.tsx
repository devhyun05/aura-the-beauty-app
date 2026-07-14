import {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';

import {spacing} from '../../../shared/theme';
import type {MakeupScenarioPrompt} from '../types';
import {ScenarioPromptCard} from './ScenarioPromptCard';
import {getPuzzleRowSpan, packScenarioPuzzle} from './scenarioPuzzleLayout';

const COLUMN_COUNT = 12;
const GAP = spacing.sm;
const ROW_HEIGHT = 44;

export function ScenarioPuzzleWall({onSelect, scenarios}: {
  onSelect: (scenario: MakeupScenarioPrompt) => void;
  scenarios: readonly MakeupScenarioPrompt[];
}) {
  const {fontScale} = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [measurements, setMeasurements] = useState<Record<string, number>>({});
  const scenarioKey = scenarios.map(item => item.id).join('|');

  useEffect(() => setMeasurements({}), [containerWidth, fontScale, scenarioKey]);

  const cellWidth = containerWidth > 0 ? (containerWidth - GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT : 0;
  const placements = useMemo(() => {
    if (!cellWidth || scenarios.some(item => !measurements[item.id])) return [];
    return packScenarioPuzzle({
      columnCount: COLUMN_COUNT,
      items: scenarios.map(item => ({
        id: item.id,
        columnSpan: item.preferredColumnSpan,
        rowSpan: getPuzzleRowSpan({contentHeight: measurements[item.id], rowGap: GAP, rowHeight: ROW_HEIGHT}),
      })),
    });
  }, [cellWidth, measurements, scenarios]);

  if (fontScale >= 1.35) {
    return (
      <View onLayout={event => setContainerWidth(event.nativeEvent.layout.width)} style={styles.fallback}>
        {scenarios.map(scenario => (
          <ScenarioPromptCard key={scenario.id} onPress={() => onSelect(scenario)} scenario={scenario} style={styles.fullWidth} />
        ))}
      </View>
    );
  }

  const maxRow = placements.reduce((maximum, item) => Math.max(maximum, item.row + item.rowSpan), 0);
  const height = maxRow ? maxRow * ROW_HEIGHT + (maxRow - 1) * GAP : 240;
  const byId = new Map(scenarios.map(item => [item.id, item]));
  const visible = [...placements].sort((a, b) => a.row - b.row || a.column - b.column);

  return (
    <View onLayout={event => setContainerWidth(event.nativeEvent.layout.width)} style={[styles.container, {height}]}>
      {containerWidth > 0 && placements.length === 0 ? scenarios.map(scenario => {
        const width = cellWidth * scenario.preferredColumnSpan + GAP * (scenario.preferredColumnSpan - 1);
        return (
          <View
            key={`measure-${scenario.id}`}
            onLayout={event => setMeasurements(previous => scenario.id in previous
              ? previous
              : {...previous, [scenario.id]: event.nativeEvent.layout.height})}
            pointerEvents="none"
            style={[styles.measurement, {width}]}
          >
            <ScenarioPromptCard onPress={() => undefined} scenario={scenario} />
          </View>
        );
      }) : null}
      {visible.map(placement => {
        const scenario = byId.get(placement.id);
        if (!scenario) return null;
        return (
          <View key={scenario.id} style={{
            height: placement.rowSpan * ROW_HEIGHT + (placement.rowSpan - 1) * GAP,
            left: placement.column * (cellWidth + GAP),
            position: 'absolute',
            top: placement.row * (ROW_HEIGHT + GAP),
            width: placement.columnSpan * cellWidth + (placement.columnSpan - 1) * GAP,
          }}>
            <ScenarioPromptCard fill onPress={() => onSelect(scenario)} scenario={scenario} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {minHeight: 240, position: 'relative', width: '100%'},
  fallback: {gap: GAP, width: '100%'},
  fullWidth: {width: '100%'},
  measurement: {left: 0, opacity: 0, position: 'absolute', top: 0},
});
