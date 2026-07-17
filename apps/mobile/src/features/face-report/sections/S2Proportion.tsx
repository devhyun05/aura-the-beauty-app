import React, { useState } from 'react';
import { Text } from 'react-native';
import { color, font } from '../reportTokens';
import type { BandKey, S2Data } from '../reportTypes';
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
    <RiseIn style={{ paddingTop: 28, paddingHorizontal: 20 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} mb={12} />
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
      <ThirdsRatioReadout ratio={data.ratioNumbers} faceLength={data.faceLength} />
      <Text style={[font(12.5, '400', 1.7), { color: color.text, marginTop: 10, marginHorizontal: 2 }]}>
        {data.paragraph}
      </Text>
    </RiseIn>
  );
}
