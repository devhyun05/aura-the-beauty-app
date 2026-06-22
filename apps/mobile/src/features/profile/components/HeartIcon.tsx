import { StyleSheet } from 'react-native';
import { View } from 'tamagui';

import { userPageColors } from '../../../shared/theme/tokens';

export const HeartIcon = () => {
  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={[styles.circle, styles.leftCircle]} />
      <View style={[styles.circle, styles.rightCircle]} />
      <View style={styles.diamond} />
    </View>
  );
};

const styles = StyleSheet.create({
  circle: {
    backgroundColor: userPageColors.text,
    borderRadius: 5,
    height: 9,
    position: 'absolute',
    top: 1,
    width: 9,
  },
  diamond: {
    backgroundColor: userPageColors.text,
    height: 9,
    left: 2.5,
    position: 'absolute',
    top: 5,
    transform: [{ rotate: '45deg' }],
    width: 9,
  },
  leftCircle: {
    left: 0,
  },
  rightCircle: {
    right: 0,
  },
  root: {
    height: 15,
    position: 'relative',
    width: 16,
  },
});
