import {StyleSheet} from 'react-native';
import {View} from 'tamagui';

import {colors, spacing} from '../theme';

type PaginationDotsProps = {
  activeIndex?: number;
  count: number;
};

export function PaginationDots({activeIndex = 0, count}: PaginationDotsProps) {
  return (
    <View style={styles.container}>
      {Array.from({length: count}).map((_, index) => (
        <View
          key={`pagination-dot-${index}`}
          style={[
            styles.dot,
            index === activeIndex ? styles.activeDot : styles.inactiveDot,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    backgroundColor: colors.blackSurface,
  },
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  inactiveDot: {
    backgroundColor: colors.borderStrong,
  },
});
