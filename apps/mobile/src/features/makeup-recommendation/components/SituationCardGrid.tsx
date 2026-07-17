import {ScrollView, StyleSheet, useWindowDimensions} from 'react-native';

import {spacing} from '../../../shared/theme';
import type {MakeupSituation} from '../types';
import {SituationCard} from './SituationCard';

export function SituationCardGrid({
  onSelect,
  selectedSituationId,
  situations,
}: {
  onSelect: (situation: MakeupSituation) => void;
  selectedSituationId: string | null;
  situations: readonly MakeupSituation[];
}) {
  const {width} = useWindowDimensions();
  const cardWidth = Math.round(Math.max(136, Math.min(width * 0.42, 168)));
  const snapInterval = cardWidth + spacing.md;

  return (
    <ScrollView
      accessibilityLabel={situations.length + '개의 상황 목록'}
      contentContainerStyle={styles.carousel}
      decelerationRate="fast"
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      snapToInterval={snapInterval}
    >
      {situations.map(situation => (
        <SituationCard
          cardWidth={cardWidth}
          key={situation.id}
          onPress={() => onSelect(situation)}
          selected={selectedSituationId === situation.id}
          situation={situation}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  carousel: {gap: spacing.md, paddingRight: spacing.screenX},
});
