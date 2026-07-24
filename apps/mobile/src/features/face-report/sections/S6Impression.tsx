import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { S6Data } from '../reportTypes';
import { Card } from '../visuals/Card';
import { ImpressionMap } from '../visuals/ImpressionMap';
import { InsightList } from '../visuals/InsightList';
import { ReadableParagraphs } from '../visuals/ReadableParagraphs';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

/** S6 인상 종합 — 2D 인상 좌표 맵, keyword chips, gestalt 인사이트 전체(압축 없이). */
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
          {/* 실제 분석 리포트는 details(전체 인사이트)를 채운다 — 5문장짜리 압축
              문단 대신 gestalt 인사이트 7개를 그대로 나열한다. details가 없는
              고정 fixture/구버전 경로만 paragraph로 폴백한다. */}
          {data.details && data.details.length > 0 ? (
            <InsightList items={data.details} />
          ) : data.paragraph ? (
            <ReadableParagraphs
              gap={10}
              text={data.paragraph}
              textStyle={[font(13.5, '400', 1.7), { color: color.body }]}
            />
          ) : null}
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
