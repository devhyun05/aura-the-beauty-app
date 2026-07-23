import React from 'react';
import { StyleProp, Text, View, ViewStyle } from 'react-native';
import { color, font } from '../reportTokens';
import type { NotePart } from '../reportTypes';

interface Props {
  eyebrow: string;
  title: string;
  sub?: string;
  subParts?: NotePart[]; // sub with inline colored/bold spans (S7)
  mb?: number;           // 2 inside gap-12 sections, 12 for S2
}

export function SectionHeader({ eyebrow, title, sub, subParts, mb = 2 }: Props) {
  return (
    <View style={{ gap: 7, marginBottom: mb }}>
      <Text style={[font(10.5, '800', undefined, 1.45), { color: color.accentDeep }]}>{eyebrow}</Text>
      <Text
        accessibilityRole="header"
        style={[font(22, '800', 1.24, -0.28), { color: color.ink }]}>
        {title}
      </Text>
      {(sub || subParts) && (
        <Text style={[font(13.5, '400', 1.62), { color: color.text, marginTop: 1, maxWidth: 350 }]}>
          {subParts
            ? subParts.map((p, i) => (
                <Text key={i} style={[font(13.5, p.bold ? '700' : '400', 1.55), { color: p.color ?? color.text }]}>{p.text}</Text>
              ))
            : sub}
        </Text>
      )}
    </View>
  );
}
