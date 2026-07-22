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

/**
 * One meaning-complete facial-region card.
 *
 * Story reports render this component as its own page. The composite
 * `S3Features` export below intentionally keeps a vertical stack for the
 * long-form capture layout, so neither mode needs a nested horizontal pager.
 */
export function S3RegionCard({ card }: { card: RegionCardData }) {
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
        {card.guide.kind === 'none' ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 12,
              backgroundColor: 'rgba(22,48,59,0.68)',
              borderRadius: radius.md,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}>
            <Text style={[font(12, '800'), { color: color.white }]}>기준선 측정 보류</Text>
            <Text style={[font(11, '400', 1.45), { color: 'rgba(255,255,255,0.9)', marginTop: 2 }]}>
              사진에서 이 부위 기준선을 안전하게 표시하지 못했어요.
            </Text>
          </View>
        ) : null}
      </View>
      {card.blend && <BlendBar data={card.blend} />}
      {card.axes.map((axis, i) =>
        card.whatIf && card.whatIf.axisIndex === i
          ? <WhatIfRail key={i} axis={axis} config={card.whatIf.config} />
          : <SpectrumRail key={i} axis={axis} />
      )}
      {card.featureDescriptors && card.featureDescriptors.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {card.featureDescriptors.map(d => (
            <View
              key={d}
              style={{
                backgroundColor: color.dial,
                borderWidth: 1,
                borderColor: color.outline6,
                borderRadius: radius.pill,
                paddingVertical: 5,
                paddingHorizontal: 11,
              }}>
              <Text style={[font(11.5, '600'), { color: color.body }]}>{d}</Text>
            </View>
          ))}
        </View>
      ) : null}
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

/**
 * S3 이목구비 분석 composite — all region cards in a vertical capture-safe stack.
 * The screen-level story pager owns horizontal navigation and renders
 * `S3RegionCard` directly for one-region-per-page presentation.
 */
export function S3Features({ data, onCardLayout }: Props) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      {data.cards.map(card => (
        <View
          key={card.key}
          onLayout={event => onCardLayout?.(card.key, event.nativeEvent.layout.y)}>
          <RiseIn>
            <S3RegionCard card={card} />
          </RiseIn>
        </View>
      ))}
    </RiseIn>
  );
}
