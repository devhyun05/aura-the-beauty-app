import { StyleSheet } from 'react-native';
import { View } from 'tamagui';

import { colors } from '../theme';

type IconProps = {
  color?: string;
  size?: number;
  filled?: boolean;
};

export function ChevronRightIcon({ color = colors.textPrimary }: IconProps) {
  return (
    <View pointerEvents="none" style={styles.chevronRoot}>
      <View style={[styles.chevronLine, styles.chevronRightTop, { backgroundColor: color }]} />
      <View style={[styles.chevronLine, styles.chevronRightBottom, { backgroundColor: color }]} />
    </View>
  );
}

export function ChevronLeftIcon({ color = colors.textPrimary }: IconProps) {
  return (
    <View pointerEvents="none" style={styles.chevronRoot}>
      <View style={[styles.chevronLine, styles.chevronLeftTop, { backgroundColor: color }]} />
      <View style={[styles.chevronLine, styles.chevronLeftBottom, { backgroundColor: color }]} />
    </View>
  );
}

export function GearIcon({ color = colors.textPrimary }: IconProps) {
  return (
    <View pointerEvents="none" style={styles.gearRoot}>
      <View style={[styles.gearRing, { borderColor: color }]}>
        <View style={[styles.gearCenter, { borderColor: color }]} />
      </View>
      <View style={[styles.gearToothVertical, styles.gearToothTop, { backgroundColor: color }]} />
      <View style={[styles.gearToothVertical, styles.gearToothBottom, { backgroundColor: color }]} />
      <View style={[styles.gearToothHorizontal, styles.gearToothLeft, { backgroundColor: color }]} />
      <View style={[styles.gearToothHorizontal, styles.gearToothRight, { backgroundColor: color }]} />
    </View>
  );
}

export function BookmarkIcon({
  color = colors.textPrimary,
  filled = false,
}: IconProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.bookmarkRoot,
        {
          backgroundColor: filled ? color : colors.white,
          borderColor: color,
        },
      ]}
    >
      <View
        style={[
          styles.bookmarkCut,
          {
            backgroundColor: colors.white,
          },
        ]}
      />
    </View>
  );
}

export function HeartIcon({
  color = colors.heart,
  filled = true,
  size = 22,
}: IconProps) {
  const heartSize = size * 0.55;

  return (
    <View pointerEvents="none" style={{ height: size, width: size }}>
      <View
        style={[
          styles.heartCircle,
          {
            backgroundColor: filled ? color : colors.white,
            borderColor: color,
            height: heartSize,
            left: size * 0.08,
            top: size * 0.16,
            width: heartSize,
          },
        ]}
      />
      <View
        style={[
          styles.heartCircle,
          {
            backgroundColor: filled ? color : colors.white,
            borderColor: color,
            height: heartSize,
            right: size * 0.08,
            top: size * 0.16,
            width: heartSize,
          },
        ]}
      />
      <View
        style={[
          styles.heartDiamond,
          {
            backgroundColor: filled ? color : colors.white,
            borderBottomColor: color,
            borderRightColor: color,
            height: size * 0.6,
            left: size * 0.2,
            top: size * 0.33,
            width: size * 0.6,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bookmarkCut: {
    alignSelf: 'center',
    height: 8,
    marginTop: 13,
    transform: [{ rotate: '45deg' }],
    width: 8,
  },
  bookmarkRoot: {
    borderRadius: 3,
    borderWidth: 2,
    height: 24,
    overflow: 'hidden',
    width: 18,
  },
  chevronLeftBottom: {
    left: 4,
    top: 11,
    transform: [{ rotate: '45deg' }],
  },
  chevronLeftTop: {
    left: 4,
    top: 6,
    transform: [{ rotate: '-45deg' }],
  },
  chevronLine: {
    borderRadius: 2,
    height: 2,
    position: 'absolute',
    width: 11,
  },
  chevronRightBottom: {
    right: 4,
    top: 11,
    transform: [{ rotate: '-45deg' }],
  },
  chevronRightTop: {
    right: 4,
    top: 6,
    transform: [{ rotate: '45deg' }],
  },
  chevronRoot: {
    height: 22,
    position: 'relative',
    width: 22,
  },
  gearCenter: {
    borderRadius: 5,
    borderWidth: 2,
    height: 10,
    width: 10,
  },
  gearRing: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    left: 2,
    position: 'absolute',
    top: 2,
    width: 24,
  },
  gearRoot: {
    height: 28,
    position: 'relative',
    width: 28,
  },
  gearToothBottom: {
    bottom: 0,
    left: 13,
  },
  gearToothHorizontal: {
    borderRadius: 2,
    height: 4,
    position: 'absolute',
    width: 7,
  },
  gearToothLeft: {
    left: 0,
    top: 12,
  },
  gearToothRight: {
    right: 0,
    top: 12,
  },
  gearToothTop: {
    left: 13,
    top: 0,
  },
  gearToothVertical: {
    borderRadius: 2,
    height: 7,
    position: 'absolute',
    width: 4,
  },
  heartCircle: {
    borderRadius: 999,
    borderWidth: 0,
    position: 'absolute',
  },
  heartDiamond: {
    borderBottomWidth: 0,
    borderRightWidth: 0,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
  },
});
