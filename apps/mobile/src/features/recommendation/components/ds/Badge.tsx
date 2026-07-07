// AURADIN glass badge — mono, uppercase, pill (role/source badges on detail;
// "MATCH 92%" and tag chips use the ink tone).
// dark: white-on-slate-glass · ink: ink-on-white-glass.
import * as React from 'react';
import { Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { color, font, radius, shadows, tracking } from '../../theme/auradinTokens';

export type BadgeProps = {
  tone?: 'dark' | 'ink';
  style?: StyleProp<ViewStyle>;
  children: string;
};

export function Badge({ tone = 'dark', style, children }: BadgeProps): React.JSX.Element {
  const dark = tone === 'dark';
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          borderRadius: radius.pill,
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.55)',
          backgroundColor: dark ? 'rgba(43,58,82,0.38)' : 'rgba(255,255,255,0.5)',
        },
        shadows.chip,
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: font.mono,
          fontSize: 9.5,
          letterSpacing: tracking(9.5, 0.14),
          textTransform: 'uppercase',
          color: dark ? color.inkInverse : color.inkSoft,
        }}
        allowFontScaling={false}
      >
        {children}
      </Text>
    </View>
  );
}
