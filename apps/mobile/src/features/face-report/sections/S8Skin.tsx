import React from 'react';
import { Text, View } from 'react-native';
import { color, font } from '../reportTokens';
import type { S8Data } from '../reportTypes';
import { Card } from '../visuals/Card';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

/** S8 구조화 피부 — 사진에서 관찰 가능한 피부 특징 9개를 항목별로 정리. */
export function S8Skin({ data }: { data: S8Data }) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      <RiseIn>
        <Card gap={0}>
          {data.aspects.map((aspect, index) => (
            <View
              key={aspect.key}
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
                <Text style={[font(12.5, '700'), { color: color.faint }]}>{aspect.heading}</Text>
                <Text style={[font(13.5, '800'), { color: color.ink, flex: 1, textAlign: 'right' }]}>
                  {aspect.label}
                </Text>
              </View>
              <Text style={[font(13, '400', 1.6), { color: color.body }]}>{aspect.description}</Text>
            </View>
          ))}
        </Card>
      </RiseIn>
    </RiseIn>
  );
}
