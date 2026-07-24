import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {ChevronDown} from 'lucide-react-native';
import { color, font, radius } from '../reportTokens';
import type { RegionCardData, S3Data } from '../reportTypes';
import { BlendBar } from '../visuals/BlendBar';
import { Card } from '../visuals/Card';
import { GuideOverlay } from '../visuals/GuideOverlay';
import {FaceDepthPointOverlay} from '../visuals/FaceDepthPointOverlay';
import { InsightList } from '../visuals/InsightList';
import { PhotoSlot } from '../visuals/PhotoSlot';
import {ReadableParagraphs} from '../visuals/ReadableParagraphs';
import { RiseIn } from '../visuals/RiseIn';
import {ReportGlassSurface} from '../visuals/ReportGlassSurface';
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
    <View style={{gap: 16}}>
      <View
        style={{
          borderRadius: radius.xl,
          overflow: 'hidden',
        }}>
        <View
          style={{
            aspectRatio: card.visualAspectRatio ?? 16 / 9,
            position: 'relative',
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
            />
          ) : null}
          {card.photo.uri ? (
            <View
              accessible
              accessibilityLabel="원본 얼굴 사진"
              accessibilityRole="image"
              style={{
                backgroundColor: color.surface,
                borderColor: 'rgba(255,255,255,0.92)',
                borderRadius: 28,
                borderWidth: 2,
                height: 56,
                overflow: 'hidden',
                position: 'absolute',
                right: 12,
                shadowColor: color.ink,
                shadowOffset: {width: 0, height: 2},
                shadowOpacity: 0.16,
                shadowRadius: 6,
                top: 12,
                width: 56,
              }}>
              <PhotoSlot
                shape="circle"
                slot={{...card.photo, cropRect: undefined}}
                style={{height: '100%', width: '100%'}}
              />
            </View>
          ) : null}
        </View>
        {(card.insight || card.paragraph) ? (
          <ReportGlassSurface
            contentStyle={{paddingHorizontal: 14, paddingVertical: 12}}
            style={{
              borderBottomLeftRadius: radius.xl,
              borderBottomRightRadius: radius.xl,
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              marginTop: -1,
              shadowOpacity: 0,
            }}>
            {/* 헤드라인은 항상 전체 너비를 쓴다 — 이전에는 43% 고정 측정 칼럼과
                한 행에서 경쟁해 굵은 헤드라인이 좁은 폭에 눌려 줄바꿈이 깨졌다. */}
            <View style={{gap: 8}}>
              <ReadableParagraphs
                gap={8}
                text={card.insight ?? card.paragraph}
                textStyle={[
                  font(card.insight ? 16 : 14.5, card.insight ? '800' : '700', 1.45),
                  {color: color.ink},
                ]}
              />
              {activeMeasurement ? (
                <View
                  style={{
                    alignItems: 'center',
                    borderTopColor: 'rgba(22,48,59,0.12)',
                    borderTopWidth: 1,
                    flexDirection: 'row',
                    gap: 8,
                    paddingTop: 8,
                  }}>
                  <Text style={[font(10, '700'), {color: color.body}]}>
                    {activeMeasurement.label}
                  </Text>
                  <Text style={[font(13.5, '800'), {color: color.accentDeep, flex: 1}]}>
                    {activeMeasurement.displayValue ?? activeMeasurement.resultLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </ReportGlassSurface>
        ) : null}
      </View>
      {card.insightItems && card.insightItems.length > 0 ? (
        <Card gap={0}>
          <InsightList items={card.insightItems} />
        </Card>
      ) : null}
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
      {card.recommendation && card.recommendation.length > 0 ? (
        <View style={{gap: 6}}>
          <Text style={[font(11, '800'), {color: color.faint}]}>메이크업 팁</Text>
          {card.recommendation.map((tip, index) => (
            <Text
              key={`${index}-${tip}`}
              style={[font(12.5, '600', 1.6), {color: color.accentInk}]}>
              {tip}
            </Text>
          ))}
        </View>
      ) : null}
      {card.measurementItems && card.measurementItems.length > 0 ? (
        <View
          accessibilityLabel="부위별 측정 근거"
          style={{
            borderColor: color.outline,
            borderRadius: radius.lg,
            borderWidth: 1,
            overflow: 'hidden',
          }}>
          {card.measurementItems.map((item, index) => {
            const selected = item.key === activeMeasurement?.key;
            const previousGroup = card.measurementItems?.[index - 1]?.groupLabel;
            return (
              <React.Fragment key={item.key}>
                {item.groupLabel && item.groupLabel !== previousGroup ? (
                  <Text
                    style={[
                      font(10, '800', undefined, 0.65),
                      {
                        backgroundColor: color.surface2,
                        color: color.accentDeep,
                        paddingHorizontal: 14,
                        paddingTop: index ? 11 : 10,
                        paddingBottom: 5,
                      },
                    ]}>
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
                  accessibilityState={{expanded: selected, selected}}
                  onPress={() => setActiveMeasurementKey(item.key)}
                  style={{
                    backgroundColor: selected ? color.accentWash : color.surface,
                    borderLeftColor: selected ? color.accentDeep : 'transparent',
                    borderLeftWidth: 3,
                    borderBottomColor: color.divider,
                    borderBottomWidth: index === card.measurementItems!.length - 1 ? 0 : 1,
                    paddingHorizontal: 13,
                    paddingVertical: 13,
                    gap: 7,
                  }}>
                  <View style={{alignItems: 'center', flexDirection: 'row', gap: 9}}>
                    <View
                      style={{
                        alignItems: 'center',
                        backgroundColor: selected ? color.accentDeep : color.surface2,
                        borderRadius: 15,
                        height: 30,
                        justifyContent: 'center',
                        width: 30,
                      }}>
                      <Text
                        style={[
                          font(11, '800'),
                          {color: selected ? color.white : color.body},
                        ]}>
                        {index + 1}
                      </Text>
                    </View>
                    <View style={{flex: 1, gap: 3}}>
                      <Text style={[font(12.5, '800'), {color: color.ink}]}>
                        {item.label}
                      </Text>
                      <Text style={[font(12, '700', 1.4), {color: color.accentInk}]}>
                        {item.resultLabel}
                        {item.displayValue ? ` · ${item.displayValue}` : ''}
                      </Text>
                    </View>
                    <ChevronDown
                      color={selected ? color.accentDeep : color.muted}
                      size={18}
                      strokeWidth={2}
                      style={{transform: [{rotate: selected ? '180deg' : '0deg'}]}}
                    />
                  </View>
                  {selected ? (
                    <View style={{gap: 6, paddingTop: 3}}>
                      <Text style={[font(10, '700'), {color: color.accentDeep}]}>
                        {item.visualType === 'depth'
                          ? '3D 측정점 · 상대값'
                          : item.visualType === 'line-and-depth'
                            ? '측정선 · 3D 측정점'
                            : '랜드마크 선'}
                      </Text>
                      <Text style={[font(11.5, '400', 1.55), {color: color.body}]}>
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
                    </View>
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
        <Text style={[font(11.5, '600', 1.55), {color: color.body}]}>
          {card.featureDescriptors.join(' · ')}
        </Text>
      ) : null}
      {card.evidence ? (
        <View style={{borderTopColor: color.divider, borderTopWidth: 1, paddingTop: 14}}>
          <Text style={[font(12, '400', 1.6), {color: color.muted}]}>
            종합 근거 · {card.evidence}
          </Text>
        </View>
      ) : null}
    </View>
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
