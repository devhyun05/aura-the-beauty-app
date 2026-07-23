import React, { useState } from 'react';
import {Text, View} from 'react-native';
import type { BandKey, S2Data } from '../reportTypes';
import {color, font, radius} from '../reportTokens';
import { EmptyNotice } from '../visuals/EmptyNotice';
import { GuidePhotoOverlay } from '../visuals/GuidePhotoOverlay';
import { RegionLens } from '../visuals/RegionLens';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';
import { ThirdsRatioReadout } from '../visuals/ThirdsRatioReadout';

interface Props {
  data: S2Data;
  onOpenRegionCard: (key: BandKey) => void; // scroll to the matching S3 card (scaffold owns scrolling)
  onRetake?: () => void;
}

/** S2 얼굴 가늠선 — calibration photo, tappable bands → region lens, hairline-missing notice. */
export function S2Proportion({ data, onOpenRegionCard, onRetake }: Props) {
  const [picked, setPicked] = useState<BandKey | null>(null);
  const pickedBand = data.bands.find(b => b.key === picked) ?? null;
  const lensDesc = pickedBand
    ? (pickedBand.key === 'upper' && data.hairlineMissing && pickedBand.descMissing
        ? pickedBand.descMissing
        : pickedBand.desc)
    : '';

  return (
    <RiseIn style={{ paddingTop: 10, paddingHorizontal: 20 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} mb={12} />
      {data.insightLabel || data.insightDescription ? (
        <View
          style={{
            backgroundColor: color.accentWash,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 4,
            marginBottom: 12,
          }}>
          <Text style={[font(10.5, '800'), {color: color.accentDeep}]}>내 비율 해석</Text>
          {data.insightLabel ? (
            <Text style={[font(15, '800', 1.45), {color: color.ink}]}>
              {data.insightLabel}
            </Text>
          ) : null}
          {data.insightDescription ? (
            <Text style={[font(12.5, '400', 1.6), {color: color.body}]}>
              {data.insightDescription}
            </Text>
          ) : null}
        </View>
      ) : null}
      <GuidePhotoOverlay
        data={data}
        picked={picked}
        onPickBand={k => setPicked(p => (p === k ? null : k))}
      />
      {pickedBand && (
        <RegionLens
          title={pickedBand.title}
          desc={lensDesc}
          ctaLabel={data.viewCardLabel}
          onOpen={() => onOpenRegionCard(pickedBand.key)}
        />
      )}
      {data.hairlineMissing && (
        <EmptyNotice
          title={data.missingNotice.title}
          body={data.missingNotice.body}
          linkLabel={data.missingNotice.cta}
          onLink={onRetake}
          style={{ marginTop: 10 }}
        />
      )}
      <ThirdsRatioReadout ratio={data.ratioNumbers} faceShape={data.faceShape} />
      {!data.insightDescription && data.paragraph ? (
        <Text style={[font(12.5, '400', 1.65), {color: color.body, marginTop: 12}]}>
          {data.paragraph}
        </Text>
      ) : null}
    </RiseIn>
  );
}
