// AURADIN heart save control — Heart #F25D61, the ONE save color (distinct from
// the magenta accent). Interactive toggle (detail) or static filled badge
// (saved library). Glyph is a stand-in: the original HeartIcon asset was never
// provided — swap in the real asset when available.
import * as React from 'react';
import { Animated, Pressable, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '../../theme/auradinTokens';
import { usePressScale } from './motion';

const HEART_PATH =
  'M12 21s-6.7-4.35-9.33-8.06C.9 10.44 1.7 6.9 4.56 5.5c2-.98 4.4-.4 5.94 1.2L12 8.2l1.5-1.5c1.54-1.6 3.94-2.18 5.94-1.2 2.86 1.4 3.66 4.94 1.89 7.44C18.7 16.65 12 21 12 21z';

export type HeartButtonProps = {
  liked?: boolean;
  onToggle?: () => void;
  /** display-only filled badge (saved library cards) */
  staticBadge?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

function HeartGlyph({ filled, size }: { filled: boolean; size: number }): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={HEART_PATH}
        fill={filled ? color.heart : 'none'}
        stroke={filled ? color.heart : color.inkFaint}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function HeartButton({
  liked = false,
  onToggle,
  staticBadge = false,
  size = 20,
  style,
}: HeartButtonProps): React.JSX.Element {
  const { pressStyle, onPressIn, onPressOut } = usePressScale(0.88);
  if (staticBadge) {
    return (
      <View
        accessibilityLabel="보관됨"
        style={[
          {
            shadowColor: color.ink,
            shadowOpacity: 0.2,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 2,
          },
          style,
        ]}
      >
        <HeartGlyph filled size={size} />
      </View>
    );
  }
  return (
    <Pressable
      onPress={onToggle}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel={liked ? '보관함에서 빼기' : '보관함에 담기'}
      accessibilityState={{ selected: liked }}
      style={style}
    >
      <Animated.View
        style={[
          { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
          pressStyle,
        ]}
      >
        <HeartGlyph filled={liked} size={size} />
      </Animated.View>
    </Pressable>
  );
}
