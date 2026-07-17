import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { color, font, radius } from '../reportTokens';

/** S1 2×2 summary card (얼굴형 / 퍼스널컬러 / 대비 인상 / 추천 무드). */
export function SummaryCard({ label, value, style }: { label: string; value: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{
      backgroundColor: color.surface, borderWidth: 1, borderColor: color.outline,
      borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 13, gap: 3,
    }, style]}>
      <Text style={[font(10.5, '600'), { color: color.muted }]}>{label}</Text>
      <Text style={[font(13, '700'), { color: color.ink }]}>{value}</Text>
    </View>
  );
}
