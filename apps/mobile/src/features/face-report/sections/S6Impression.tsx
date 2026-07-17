import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { S6Data } from '../reportTypes';
import { Card } from '../visuals/Card';
import { GazeReplay } from '../visuals/GazeReplay';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

/** S6 인상 종합 — gaze-order replay diagram, keyword chips, synthesis paragraph. */
export function S6Impression({ data }: { data: S6Data }) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} />
      <RiseIn>
        <Card gap={15}>
          <GazeReplay data={data} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {data.keywords.map(k => (
              <View key={k} style={{
                backgroundColor: color.dial, borderWidth: 1, borderColor: color.outline6,
                borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 13,
              }}>
                <Text style={[font(12, '700'), { color: color.body }]}>{k}</Text>
              </View>
            ))}
          </View>
          <Text style={[font(13, '400', 1.7), { color: color.body }]}>{data.paragraph}</Text>
        </Card>
      </RiseIn>
    </RiseIn>
  );
}
