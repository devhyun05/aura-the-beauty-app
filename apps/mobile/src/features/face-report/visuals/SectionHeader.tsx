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
    <View style={{ gap: 5, marginBottom: mb }}>
      <Text style={[font(10.5, '700', undefined, 1.5), { color: color.accentDeep }]}>{eyebrow}</Text>
      <Text style={[font(20, '800', 1.25, -0.2), { color: color.ink }]}>{title}</Text>
      {(sub || subParts) && (
        <Text style={[font(13.5, '400', 1.55), { color: color.text, marginTop: 2 }]}>
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
