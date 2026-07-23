import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { RegionCardData, S3Data } from '../reportTypes';
import { BlendBar } from '../visuals/BlendBar';
import { Card } from '../visuals/Card';
import { GuideOverlay } from '../visuals/GuideOverlay';
import {FaceDepthPointOverlay} from '../visuals/FaceDepthPointOverlay';
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
  const showsDepth =
    needsDepth && hasDepthEvidenceForActive;
  const missingDepthEvidence =
    needsDepth && !hasDepthEvidenceForActive;
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
          <FaceDepthPointOverlay
            activeMetricKeys={activeMetricKeys}
            cropRect={card.cropRect}
            evidence={card.photoEvidence}
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
      </View>
      {showsDepth ? (
        <Text style={[font(10.5, '400', 1.5), {color: color.muted}]}>
          큰 점은 대표 측정점, 작은 점은 계산에 사용한 3D 메시 정점이에요.
        </Text>
      ) : null}
      {!hasVisibleGuide && !showsDepth ? (
        <View
          style={{
            backgroundColor: color.accentWash,
            borderColor: color.outline,
            borderRadius: radius.md,
            borderWidth: 1,
            gap: 2,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}>
          <Text style={[font(12, '800'), {color: color.accentInk}]}>
            {missingDepthEvidence ? '3D 측정점 표시 없음' : '기준선 측정 보류'}
          </Text>
          <Text style={[font(11, '400', 1.45), {color: color.body}]}>
            {missingDepthEvidence
              ? '이 보고서에는 사진 위 3D 측정점이 저장되지 않았어요. 새 촬영 보고서부터 실제 측정점을 함께 저장해요.'
              : '사진에서 이 부위 기준선을 안전하게 표시하지 못했어요.'}
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
                  accessibilityLabel={[
                    item.label,
                    item.resultLabel,
                    item.displayValue,
                    item.interpretation,
                  ].filter(Boolean).join(', ')}
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
                        ? '3D 측정점 · 상대값'
                        : item.visualType === 'line-and-depth'
                          ? '측정선 · 3D 측정점'
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
