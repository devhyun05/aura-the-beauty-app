import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { color, radius, space } from '../reportTokens';

/** Quiet report surface shared by the evidence-heavy report pages. */
export function Card({ children, gap = 13, style }: {
  children: React.ReactNode; gap?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{
      backgroundColor: color.surface,
      borderColor: 'rgba(22,48,59,0.09)',
      borderRadius: radius.xl,
      borderWidth: 1,
      gap,
      padding: space.cardPad,
      shadowColor: color.ink,
      shadowOffset: {width: 0, height: 6},
      shadowOpacity: 0.045,
      shadowRadius: 16,
      elevation: 1,
    }, style]}>
      {children}
    </View>
  );
}
