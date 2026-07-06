// AURADIN wordmark — typographic mark (mono 700 · 13 · tracking .32em).
// No image logo exists; the wordmark IS the brand mark.
// Interactive on inner screens: tap → reset home (accessibility: "처음으로").
import * as React from 'react';
import { Pressable, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { color, text, tracking } from '../../theme/auradinTokens';

export type WordmarkProps = {
  onHome?: () => void;
  dark?: boolean;
  /** font size; tracking scales with it (13 default, 10 in tight headers) */
  size?: number;
  style?: StyleProp<TextStyle>;
};

export function Wordmark({ onHome, dark = false, size = 13, style }: WordmarkProps): React.JSX.Element {
  const mark = (
    <Text
      style={[
        text.wordmark,
        size !== 13 ? { fontSize: size, letterSpacing: tracking(size, 0.32) } : null,
        dark ? { color: color.inkInverse } : null,
        style,
      ]}
      allowFontScaling={false}
    >
      AURADIN
    </Text>
  );
  if (!onHome) return mark;
  return (
    <Pressable
      onPress={onHome}
      accessibilityRole="button"
      accessibilityLabel="처음으로"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      {mark}
    </Pressable>
  );
}
