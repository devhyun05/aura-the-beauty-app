// AURADIN status row — wordmark (left) + mono status with glowing magenta dot (right).
// Home screen header. "A spoonful of terminal."
import * as React from 'react';
import { Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { color, shadows, text } from '../../theme/auradinTokens';
import { Wordmark } from './Wordmark';

export type StatusBarRowProps = {
  status?: string;
  onHome?: () => void;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function StatusBarRow({
  status = 'AURADIN · READY',
  onHome,
  dark = false,
  style,
}: StatusBarRowProps): React.JSX.Element {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        style,
      ]}
    >
      <Wordmark onHome={onHome} dark={dark} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={[
            {
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: color.magenta,
            },
            shadows.glowDot,
          ]}
        />
        <Text style={[text.meta, dark ? { color: color.inkInverseSoft } : null]} allowFontScaling={false}>
          {status}
        </Text>
      </View>
    </View>
  );
}
