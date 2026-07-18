import React, { useState } from 'react';
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
      {/* 3분할 자기 서술은 ThirdsRatioReadout 안에 있고, 얼굴형은 별도 블록이다.
          기존 하단 문단(엔진 3분할 요약)은 얼굴형 밑에 붙어 "게이지 밑에 또 3분할
          얘기"로 혼동을 줬으므로 제거 — S2 맞춤 rich 문단은 B5(proportionInsight)가 담당. */}
    </RiseIn>
  );
}
