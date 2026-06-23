import {StyleSheet, View} from 'react-native';

import {colors} from '../theme';

type IconProps = {
  color?: string;
  size?: number;
  filled?: boolean;
};

export function ChevronRightIcon({color = colors.textPrimary}: IconProps) {
  return (
    <View pointerEvents="none" style={styles.chevronRoot}>
      <View
        style={[
          styles.chevronLine,
          styles.chevronRightTop,
          {backgroundColor: color},
        ]}
      />
      <View
        style={[
          styles.chevronLine,
          styles.chevronRightBottom,
          {backgroundColor: color},
        ]}
      />
    </View>
  );
}

export function ChevronLeftIcon({color = colors.textPrimary}: IconProps) {
  return (
    <View pointerEvents="none" style={styles.chevronRoot}>
      <View
        style={[
          styles.chevronLine,
          styles.chevronLeftTop,
          {backgroundColor: color},
        ]}
      />
      <View
        style={[
          styles.chevronLine,
          styles.chevronLeftBottom,
          {backgroundColor: color},
        ]}
      />
    </View>
  );
}

export function GearIcon({color = colors.textPrimary}: IconProps) {
  return (
    <View pointerEvents="none" style={styles.gearRoot}>
      <View style={[styles.gearRing, {borderColor: color}]}>
        <View style={[styles.gearCenter, {borderColor: color}]} />
      </View>
      <View
        style={[
          styles.gearToothVertical,
          styles.gearToothTop,
          {backgroundColor: color},
        ]}
      />
      <View
        style={[
          styles.gearToothVertical,
          styles.gearToothBottom,
          {backgroundColor: color},
        ]}
      />
      <View
        style={[
          styles.gearToothHorizontal,
          styles.gearToothLeft,
          {backgroundColor: color},
        ]}
      />
      <View
        style={[
          styles.gearToothHorizontal,
          styles.gearToothRight,
          {backgroundColor: color},
        ]}
      />
    </View>
  );
}

export function BookmarkIcon({color = colors.textPrimary}: IconProps) {
  return (
    <View pointerEvents="none" style={styles.bookmarkRoot}>
      <View style={[styles.bookmarkTop, {backgroundColor: color}]} />
      <View style={[styles.bookmarkSide, styles.bookmarkLeft, {backgroundColor: color}]} />
      <View style={[styles.bookmarkSide, styles.bookmarkRight, {backgroundColor: color}]} />
      <View
        style={[
          styles.bookmarkBottom,
          styles.bookmarkBottomLeft,
          {backgroundColor: color},
        ]}
      />
      <View
        style={[
          styles.bookmarkBottom,
          styles.bookmarkBottomRight,
          {backgroundColor: color},
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
  const fillColor = filled ? color : colors.white;
  const circleSize = size * 0.5;
  const diamondSize = size * 0.48;

  return (
    <View pointerEvents="none" style={{height: size, width: size}}>
      <View
        style={[
          styles.heartCircle,
          {
            backgroundColor: fillColor,
            borderColor: color,
            borderWidth: filled ? 0 : 1.6,
            height: circleSize,
            left: size * 0.14,
            top: size * 0.15,
            width: circleSize,
          },
        ]}
      />
      <View
        style={[
          styles.heartCircle,
          {
            backgroundColor: fillColor,
            borderColor: color,
            borderWidth: filled ? 0 : 1.6,
            height: circleSize,
            right: size * 0.14,
            top: size * 0.15,
            width: circleSize,
          },
        ]}
      />
      <View
        style={[
          styles.heartDiamond,
          {
            backgroundColor: fillColor,
            borderColor: color,
            borderWidth: filled ? 0 : 1.6,
            height: diamondSize,
            left: size * 0.26,
            top: size * 0.39,
            width: diamondSize,
          },
        ]}
      />
    </View>
  );
}

export function XIcon({color = colors.textPrimary, size = 18}: IconProps) {
  const lineSize = size * 0.78;

  return (
    <View pointerEvents="none" style={{height: size, width: size}}>
      <View
        style={[
          styles.xLine,
          {
            backgroundColor: color,
            left: (size - lineSize) / 2,
            top: size / 2 - 1,
            width: lineSize,
          },
          styles.xLineForward,
        ]}
      />
      <View
        style={[
          styles.xLine,
          {
            backgroundColor: color,
            left: (size - lineSize) / 2,
            top: size / 2 - 1,
            width: lineSize,
          },
          styles.xLineBackward,
        ]}
      />
    </View>
  );
}

export function PencilIcon({color = colors.textPrimary}: IconProps) {
  return (
    <View pointerEvents="none" style={styles.pencilRoot}>
      <View style={[styles.pencilBody, {borderColor: color}]} />
      <View style={[styles.pencilTip, {backgroundColor: color}]} />
    </View>
  );
}

export function MenuStackIcon({
  color = colors.textPrimary,
  size = 22,
}: IconProps) {
  const lineWidth = size * 0.82;

  return (
    <View pointerEvents="none" style={{height: size, width: size}}>
      {[0, 1, 2].map((lineIndex) => (
        <View
          key={lineIndex}
          style={[
            styles.menuStackLine,
            {
              backgroundColor: color,
              left: (size - lineWidth) / 2,
              top: size * 0.24 + lineIndex * size * 0.24,
              width: lineWidth,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bookmarkBottom: {
    borderRadius: 1.5,
    height: 2.4,
    position: 'absolute',
    top: 17,
    width: 10,
  },
  bookmarkBottomLeft: {
    left: 2.4,
    transform: [{rotate: '43deg'}],
  },
  bookmarkBottomRight: {
    right: 2.4,
    transform: [{rotate: '-43deg'}],
  },
  bookmarkLeft: {
    left: 2,
  },
  bookmarkRight: {
    right: 2,
  },
  bookmarkRoot: {
    height: 24,
    position: 'relative',
    width: 20,
  },
  bookmarkSide: {
    borderRadius: 1.5,
    height: 17,
    position: 'absolute',
    top: 3,
    width: 2.4,
  },
  bookmarkTop: {
    borderRadius: 1.5,
    height: 2.4,
    left: 2,
    position: 'absolute',
    top: 3,
    width: 16,
  },
  chevronLeftBottom: {
    left: 4,
    top: 11,
    transform: [{rotate: '45deg'}],
  },
  chevronLeftTop: {
    left: 4,
    top: 6,
    transform: [{rotate: '-45deg'}],
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
    transform: [{rotate: '-45deg'}],
  },
  chevronRightTop: {
    right: 4,
    top: 6,
    transform: [{rotate: '45deg'}],
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
    position: 'absolute',
  },
  heartDiamond: {
    borderRadius: 2,
    position: 'absolute',
    transform: [{rotate: '45deg'}],
  },
  pencilBody: {
    borderRadius: 3,
    borderWidth: 2,
    height: 7,
    left: 4,
    position: 'absolute',
    top: 8,
    transform: [{rotate: '-45deg'}],
    width: 17,
  },
  pencilRoot: {
    height: 24,
    position: 'relative',
    width: 24,
  },
  pencilTip: {
    borderRadius: 1,
    height: 6,
    left: 3,
    position: 'absolute',
    top: 16,
    transform: [{rotate: '-45deg'}],
    width: 2,
  },
  menuStackLine: {
    borderRadius: 2,
    height: 2,
    position: 'absolute',
  },
  xLine: {
    borderRadius: 2,
    height: 2,
    position: 'absolute',
  },
  xLineBackward: {
    transform: [{rotate: '-45deg'}],
  },
  xLineForward: {
    transform: [{rotate: '45deg'}],
  },
});
