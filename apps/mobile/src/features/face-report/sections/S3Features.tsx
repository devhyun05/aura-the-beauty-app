import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { RegionCardData, S3Data } from '../reportTypes';
import { BlendBar } from '../visuals/BlendBar';
import { Card } from '../visuals/Card';
import { GuideOverlay } from '../visuals/GuideOverlay';
import { PhotoSlot } from '../visuals/PhotoSlot';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';
import { SpectrumRail } from '../visuals/SpectrumRail';
import { WhatIfRail } from '../visuals/WhatIfRail';

function RegionCard({ card }: { card: RegionCardData }) {
  return (
    <Card gap={13}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <View style={{ backgroundColor: color.accentBg, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={[font(11, '800'), { color: color.accentDeep }]}>{card.regionChip}</Text>
        </View>
        <Text style={[font(14.5, '700'), { color: color.ink }]}>{card.regionTitle}</Text>
      </View>
      <View style={{ borderRadius: radius.md, overflow: 'hidden', aspectRatio: 16 / 9 }}>
        <PhotoSlot slot={card.photo} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <GuideOverlay guide={card.guide} label={card.guideLabel} labelX={card.guideLabelX} labelAlign={card.guideLabelAlign} />
      </View>
      {card.blend && <BlendBar data={card.blend} />}
      {card.axes.map((axis, i) =>
        card.whatIf && card.whatIf.axisIndex === i
          ? <WhatIfRail key={i} axis={axis} config={card.whatIf.config} />
          : <SpectrumRail key={i} axis={axis} />
      )}
      {card.insight ? (
        <View style={{ gap: 6 }}>
          <Text style={[font(13.5, '700', 1.6), { color: color.ink }]}>{card.insight}</Text>
          {card.evidence ? (
            <Text style={[font(12.5, '400', 1.6), { color: color.muted }]}>
              근거 · {card.evidence}
            </Text>
          ) : null}
          {card.recommendation ? (
            <View style={{
              backgroundColor: color.accentWash, borderRadius: radius.md,
              paddingVertical: 9, paddingHorizontal: 12,
            }}>
              <Text style={[font(12.5, '600', 1.55), { color: color.accentInk }]}>
                메이크업 · {card.recommendation}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={[font(13, '400', 1.7), { color: color.body }]}>{card.paragraph}</Text>
      )}
    </Card>
  );
}

interface Props {
  data: S3Data;
  /** Reports each card's y offset within this section so the scaffold can scroll S2's lens to it. */
  onCardLayout?: (key: string, y: number) => void;
}

/** S3 이목구비 분석 — 4 region cards with photo crops, judgment-state rails, what-if drag. */
export function S3Features({ data, onCardLayout }: Props) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      {data.cards.map(card => (
        <View key={card.key} onLayout={e => onCardLayout?.(card.key, e.nativeEvent.layout.y)}>
          <RiseIn>
            <RegionCard card={card} />
          </RiseIn>
        </View>
      ))}
    </RiseIn>
  );
}
