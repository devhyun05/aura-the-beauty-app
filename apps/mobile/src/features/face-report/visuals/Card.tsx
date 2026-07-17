import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { color, radius, shadow, space } from '../reportTokens';

/** Standard white content card. */
export function Card({ children, gap = 13, style }: {
  children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{
      backgroundColor: color.surface, borderWidth: 1, borderColor: color.outline,
      borderRadius: radius.xl, padding: space.cardPad, gap,
    }, shadow.card, style]}>
      {children}
    </View>
  );
}
