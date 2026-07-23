import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { RegionCardData, S3Data } from '../reportTypes';
import { BlendBar } from '../visuals/BlendBar';
import { Card } from '../visuals/Card';
import { GuideOverlay } from '../visuals/GuideOverlay';
import {FaceDepthOverlay} from '../visuals/FaceDepthOverlay';
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
  const [activeMeasurementKey, setActiveMeasurementKey] = useState(
    card.measurementItems?.[0]?.key ?? null,
  );
  const activeMeasurement =
    card.measurementItems?.find(item => item.key === activeMeasurementKey)
    ?? card.measurementItems?.[0];
  const activeMetricKeys = activeMeasurement?.metricKeys ?? [];
  const needsDepth =
    activeMeasurement?.visualType === 'depth'
    || activeMeasurement?.visualType === 'line-and-depth';
  const activeDepthRegions = card.photoEvidence
    ? Object.values(card.photoEvidence.regions).filter(
        region => region?.metricKeys.some(key => activeMetricKeys.includes(key)),
      )
    : [];
  const hasDepthEvidenceForActive = Boolean(
    activeDepthRegions.length > 0,
  );
  const hasSignedDepthForActive = activeDepthRegions.some(region =>
    region?.samples.some(sample => sample.signedDepthNormalized !== undefined),
  );
  const showsDepth =
    needsDepth && hasDepthEvidenceForActive;
  const showsLine =
    !activeMeasurement
    || activeMeasurement.visualType === 'line'
    || activeMeasurement.visualType === 'line-and-depth';
  const hasVisibleGuide = showsLine && Boolean(
    (card.guides ?? [card.guide]).some(guide =>
      guide.kind === 'measurement'
        ? activeMetricKeys.length === 0
          || guide.metricKeys.some(key => activeMetricKeys.includes(key))
        : guide.kind !== 'none',
    ),
  );
  return (
    <Card gap={13}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <View style={{ backgroundColor: color.accentBg, borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={[font(11, '800'), { color: color.accentDeep }]}>{card.regionChip}</Text>
        </View>
        <Text style={[font(14.5, '700'), { color: color.ink }]}>{card.regionTitle}</Text>
      </View>
      {card.insight ? (
        <View
          style={{
            gap: 6,
            backgroundColor: color.accentWash,
            borderRadius: radius.md,
            paddingHorizontal: 13,
            paddingVertical: 11,
          }}>
          <Text style={[font(10.5, '800'), {color: color.accentDeep}]}>이 부위의 결론</Text>
          <Text style={[font(14, '800', 1.55), {color: color.ink}]}>{card.insight}</Text>
          {card.recommendation ? (
            <Text style={[font(12.5, '600', 1.55), {color: color.accentInk}]}>
              메이크업 · {card.recommendation}
            </Text>
          ) : null}
        </View>
      ) : card.paragraph ? (
        <Text style={[font(13, '400', 1.7), {color: color.body}]}>{card.paragraph}</Text>
      ) : null}
      <View style={{
        borderRadius: radius.md,
        overflow: 'hidden',
        aspectRatio: card.visualAspectRatio ?? 16 / 9,
      }}>
        <PhotoSlot slot={card.photo} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        {showsDepth && card.photoEvidence ? (
          <FaceDepthOverlay
            activeMetricKeys={activeMetricKeys}
            cropRect={card.cropRect}
            evidence={card.photoEvidence}
            measurementValues={activeMeasurement?.values}
          />
        ) : null}
        {showsLine ? (
          <GuideOverlay
            activeMetricKeys={activeMetricKeys}
            guide={card.guide}
            guides={card.guides}
            label={activeMeasurement?.label ?? card.guideLabel}
            labelX={card.guideLabelX}
            labelAlign={card.guideLabelAlign}
          />
        ) : null}
        {!hasVisibleGuide && !showsDepth && !needsDepth ? (
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
      {showsDepth ? (
        <View style={{gap: 5}}>
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            {hasSignedDepthForActive ? (
              <>
                <View style={{width: 24, height: 7, borderRadius: 4, backgroundColor: 'rgba(30,118,145,0.62)'}} />
                <View style={{width: 18, height: 7, borderRadius: 4, backgroundColor: 'rgba(244,225,196,0.54)'}} />
                <View style={{width: 24, height: 7, borderRadius: 4, backgroundColor: 'rgba(218,105,91,0.66)'}} />
                <Text style={[font(10.5, '600'), {color: color.muted}]}>
                  후방 · 0 기준면 · 전방
                </Text>
              </>
            ) : (
              <>
                <View style={{width: 30, height: 7, borderRadius: 4, backgroundColor: 'rgba(21,124,153,0.24)'}} />
                <View style={{width: 30, height: 7, borderRadius: 4, backgroundColor: 'rgba(21,124,153,0.62)'}} />
                <Text style={[font(10.5, '600'), {color: color.muted}]}>
                  낮은 깊이 · 높은 깊이
                </Text>
              </>
            )}
          </View>
          <Text style={[font(9.5, '400', 1.4), {color: color.muted}]}>
            색은 대표 프레임의 형태, 핀 숫자는 얼굴 기준폭 대비 반복 측정 상대값이에요.
          </Text>
        </View>
      ) : null}
      {card.measurementItems && card.measurementItems.length > 0 ? (
        <View style={{borderTopColor: color.divider, borderTopWidth: 1}}>
          {card.measurementItems.map((item, index) => {
            const selected = item.key === activeMeasurement?.key;
            const previousGroup = card.measurementItems?.[index - 1]?.groupLabel;
            return (
              <React.Fragment key={item.key}>
                {item.groupLabel && item.groupLabel !== previousGroup ? (
                  <Text style={[font(11, '800'), {color: color.accentDeep, marginTop: index ? 4 : 0}]}>
                    {item.groupLabel}
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  onPress={() => setActiveMeasurementKey(item.key)}
                  style={{
                    backgroundColor: selected ? color.accentWash : 'transparent',
                    borderBottomColor: color.divider,
                    borderBottomWidth: 1,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    gap: 3,
                  }}>
                  <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8}}>
                    <Text style={[font(12.5, '800'), {color: color.ink, flex: 1}]}>
                      {item.label}
                    </Text>
                    <Text style={[font(10.5, '700'), {color: color.accentDeep}]}>
                      {item.visualType === 'depth'
                        ? '깊이 지도 · 상대값'
                        : item.visualType === 'line-and-depth'
                          ? '측정선 · 깊이'
                          : '랜드마크 선'}
                    </Text>
                  </View>
                  <Text style={[font(12.5, '800', 1.45), {color: color.accentInk}]}>
                    {item.resultLabel}
                  </Text>
                  {item.displayValue ? (
                    <Text style={[font(11, '700'), {color: color.accentDeep}]}>
                      측정값 · {item.displayValue}
                    </Text>
                  ) : null}
                  <Text style={[font(11.5, '400', 1.5), {color: color.body}]}>
                    {item.interpretation}
                  </Text>
                  <Text style={[font(10.5, '400', 1.5), {color: color.muted}]}>
                    측정 방법 · {item.detail}
                  </Text>
                  {item.confidenceLabel ? (
                    <Text style={[font(10.5, '600'), {color: color.muted}]}>
                      {item.confidenceLabel}
                    </Text>
                  ) : null}
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      ) : null}
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
      {card.evidence ? (
        <Text style={[font(12, '400', 1.6), {color: color.muted}]}>
          종합 근거 · {card.evidence}
        </Text>
      ) : null}
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
