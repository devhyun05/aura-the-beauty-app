import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { S6Data } from '../reportTypes';
import { Card } from '../visuals/Card';
import { ImpressionMap } from '../visuals/ImpressionMap';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

/** S6 인상 종합 — 2D 인상 좌표 맵, keyword chips, synthesis paragraph. */
export function S6Impression({ data }: { data: S6Data }) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      <RiseIn>
        <Card gap={15}>
          <ImpressionMap axes={data.axes} />
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
          {data.visualWeight ? <VisualWeightBlock data={data.visualWeight} /> : null}
        </Card>
      </RiseIn>
    </RiseIn>
  );
}

/** 2층 시각 무게 지도 — 부위별 무게 막대 + 우세/대비 문구. */
function VisualWeightBlock({ data }: { data: NonNullable<S6Data['visualWeight']> }) {
  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: color.outline6, paddingTop: 14 }}>
      <Text style={[font(13, '700'), { color: color.ink }]}>{data.headline}</Text>
      <View style={{ gap: 8 }}>
        {data.regions.map(r => (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text
              style={[
                font(12, r.dominant ? '700' : '400'),
                { color: r.dominant ? color.ink : color.body, width: 40 },
              ]}
            >
              {r.label}
            </Text>
            <View style={{ flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: color.dial, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.max(0, Math.min(100, r.percent))}%`,
                  height: '100%',
                  borderRadius: radius.pill,
                  backgroundColor: r.dominant ? color.accentDeep : color.outline6,
                }}
              />
            </View>
            <Text style={[font(11, '600'), { color: color.body, width: 34, textAlign: 'right' }]}>
              {r.percent}%
            </Text>
          </View>
        ))}
      </View>
      {data.contrastLine ? (
        <Text style={[font(12, '400', 1.6), { color: color.body }]}>{data.contrastLine}</Text>
      ) : null}
    </View>
  );
}
