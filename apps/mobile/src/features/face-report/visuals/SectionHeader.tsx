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
    <View style={{ gap: 3, marginBottom: mb }}>
      <Text style={[font(10.5, '700', undefined, 1.68), { color: color.accent }]}>{eyebrow}</Text>
      <Text style={[font(19, '800'), { color: color.ink }]}>{title}</Text>
      {(sub || subParts) && (
        <Text style={[font(12.5, '400', 1.6), { color: color.muted, marginTop: 2 }]}>
          {subParts
            ? subParts.map((p, i) => (
                <Text key={i} style={[font(12.5, p.bold ? '700' : '400', 1.6), { color: p.color ?? color.muted }]}>{p.text}</Text>
              ))
            : sub}
        </Text>
      )}
    </View>
  );
}
