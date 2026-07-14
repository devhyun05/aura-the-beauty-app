import {useMemo, useRef, useState} from 'react';
import {StyleSheet, View, useWindowDimensions} from 'react-native';

import {spacing} from '../../../shared/theme';
import type {MakeupScenarioPrompt} from '../types';
import {ScenarioPromptCard} from './ScenarioPromptCard';
import {getPuzzleRowSpan, packScenarioPuzzle} from './scenarioPuzzleLayout';

const COLUMN_COUNT = 12;
const GAP = spacing.sm;
const ROW_HEIGHT = 44;
const BALANCED_SPANS = [7, 5, 5, 7, 8, 4, 6, 6] as const;

function getBalancedSpan(index: number, displayText: string, preferredColumnSpan: number): number {
  return displayText.length <= 10
    ? preferredColumnSpan
    : BALANCED_SPANS[index % BALANCED_SPANS.length];
}

export function ScenarioPuzzleWall({onSelect, scenarios}: {
  onSelect: (scenario: MakeupScenarioPrompt) => void;
  scenarios: readonly MakeupScenarioPrompt[];
}) {
  const {fontScale} = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const layoutKey = `${containerWidth}:${fontScale}`;
  const layoutKeyRef = useRef(layoutKey);
  layoutKeyRef.current = layoutKey;
  const [measurementCache, setMeasurementCache] = useState<{
    heights: Record<string, number>;
    layoutKey: string;
  }>({heights: {}, layoutKey});
  const measurements = measurementCache.layoutKey === layoutKey ? measurementCache.heights : {};

  const cellWidth = containerWidth > 0 ? (containerWidth - GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT : 0;
  const placements = useMemo(() => {
    if (!cellWidth) return [];
    return packScenarioPuzzle({
      columnCount: COLUMN_COUNT,
      items: scenarios.flatMap((item, index) => {
        const contentHeight = measurements[item.id];
        return contentHeight > 0 ? [{
          id: item.id,
          columnSpan: getBalancedSpan(index, item.displayText, item.preferredColumnSpan),
          rowSpan: getPuzzleRowSpan({contentHeight, rowGap: GAP, rowHeight: ROW_HEIGHT}),
        }] : [];
      }),
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
      {containerWidth > 0 ? scenarios.map((scenario, index) => {
        if (measurements[scenario.id] > 0) return null;
        const span = getBalancedSpan(index, scenario.displayText, scenario.preferredColumnSpan);
        const width = cellWidth * span + GAP * (span - 1);
        return (
          <View
            key={`measure-${scenario.id}`}
            onLayout={event => {
              // React Native pools layout events; capture the primitive before
              // the functional state update runs asynchronously.
              const height = event.nativeEvent.layout.height;
              setMeasurementCache(previous => {
                if (layoutKeyRef.current !== layoutKey) return previous;
                const heights = previous.layoutKey === layoutKey ? previous.heights : {};
                if (heights[scenario.id] === height) return previous;
                return {layoutKey, heights: {...heights, [scenario.id]: height}};
              });
            }}
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
