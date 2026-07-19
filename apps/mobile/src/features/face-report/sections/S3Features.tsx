import React, { useState } from 'react';
import { Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent, Text, View } from 'react-native';
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

// One card per page: full screen width minus the section's 20px horizontal padding.
const CARD_GAP = 12;
const CARD_W = Dimensions.get('window').width - 40;

interface Props {
  data: S3Data;
  /** Reports each card's y offset within this section so the scaffold can scroll S2's lens to it. */
  onCardLayout?: (key: string, y: number) => void;
}

/**
 * S3 이목구비 분석 — 4 region cards with photo crops, judgment-state rails, what-if drag.
 * Cards render as a horizontal, one-page-per-card carousel (finding 1.1, 부위를 옆으로 넘겨 보기)
 * with a dot indicator tracking the current page.
 */
export function S3Features({ data, onCardLayout }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);

  // NOTE (S2→S3 "카드 보기" link): the old vertical stack reported each card's own
  // y offset, so the scaffold's ScrollView could scroll straight to the matching
  // card. In a horizontal carousel all cards share the same y (they lay out side
  // by side, not stacked), so there's no per-card vertical offset left to report.
  // We keep the `onCardLayout` prop (S3FeaturesProps stays unchanged) and report
  // the carousel row's own y for every card key — "카드 보기" still scrolls the
  // page down to the S3 carousel, it just can't also pick the right page anymore.
  // A real fix needs a new imperative link (e.g. a `scrollToKey` ref/prop) so the
  // scaffold can call `FlatList.scrollToIndex` — out of scope here, see report.
  const handleCarouselLayout = (y: number) => {
    data.cards.forEach(card => onCardLayout?.(card.key, y));
  };

  const handleMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + CARD_GAP));
    setActiveIndex(Math.max(0, Math.min(data.cards.length - 1, idx)));
  };

  return (
    <RiseIn style={{ paddingTop: 30, gap: 12 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      </View>
      <View onLayout={e => handleCarouselLayout(e.nativeEvent.layout.y)}>
        <FlatList
          data={data.cards}
          keyExtractor={card => card.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_W + CARD_GAP}
          disableIntervalMomentum
          decelerationRate="fast"
          contentContainerStyle={{ gap: CARD_GAP, paddingHorizontal: 20 }}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          renderItem={({ item }) => (
            <View style={{ width: CARD_W }}>
              <RiseIn>
                <RegionCard card={item} />
              </RiseIn>
            </View>
          )}
        />
      </View>
      {data.cards.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
          {data.cards.map((card, i) => (
            <View
              key={card.key}
              style={{
                width: i === activeIndex ? 16 : 6,
                height: 6,
                borderRadius: radius.pill,
                backgroundColor: i === activeIndex ? color.accent : color.outline8,
              }}
            />
          ))}
        </View>
      ) : null}
    </RiseIn>
  );
}
