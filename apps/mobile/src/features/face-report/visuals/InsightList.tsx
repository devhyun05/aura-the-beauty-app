import React from 'react';
import { Text, View } from 'react-native';
import { color, font } from '../reportTokens';
import type { InsightItemData } from '../reportTypes';

/**
 * Full, uncompressed AI insight list — one row per insight, each showing its
 * heading, short label, and complete description sentence. Mirrors S8Skin's
 * proven "구조화 피부" layout so every surface that shows raw AI insights
 * (face regions, overall impression, skin) reads consistently.
 */
export function InsightList({ items }: { items: InsightItemData[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <View>
      {items.map((item, index) => (
        <View
          key={item.key}
          style={{
            borderTopColor: color.divider,
            borderTopWidth: index === 0 ? 0 : 1,
            gap: 5,
            paddingVertical: 13,
          }}>
          <View style={{
            alignItems: 'center', flexDirection: 'row',
            gap: 10, justifyContent: 'space-between',
          }}>
            <Text style={[font(12.5, '700'), { color: color.faint }]}>{item.heading}</Text>
            <Text style={[font(13.5, '800'), { color: color.ink, flex: 1, textAlign: 'right' }]}>
              {item.label}
            </Text>
          </View>
          <Text style={[font(13, '400', 1.6), { color: color.body }]}>{item.description}</Text>
        </View>
      ))}
    </View>
  );
}
