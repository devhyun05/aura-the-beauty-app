import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { color, radius, space } from '../reportTokens';

/** Quiet report surface: a fine outline and no floating dashboard shadow. */
export function Card({ children, gap = 13, style }: {
  children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{
      backgroundColor: color.surface,
      borderColor: color.outline,
      borderRadius: radius.lg,
      borderWidth: 1,
      gap,
      padding: space.cardPad,
    }, style]}>
      {children}
    </View>
  );
}
