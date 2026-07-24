import React, { useState } from 'react';
import {Text, View} from 'react-native';
import {ScanFace} from 'lucide-react-native';
import type { BandKey, S2Data } from '../reportTypes';
import {color, font} from '../reportTokens';
import { EmptyNotice } from '../visuals/EmptyNotice';
import { GuidePhotoOverlay } from '../visuals/GuidePhotoOverlay';
import { RegionLens } from '../visuals/RegionLens';
import { ReadableParagraphs } from '../visuals/ReadableParagraphs';
import { RiseIn } from '../visuals/RiseIn';
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
  const lensDesc = pickedBand?.desc ?? '';

  return (
    <RiseIn style={{ paddingHorizontal: 20 }}>
      <Text
        accessibilityRole="header"
        style={[font(22, '800', 1.25, -0.25), {color: color.ink, marginBottom: 16}]}>
        얼굴
      </Text>
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
      <View style={{marginTop: 22}}>
        <View style={{alignItems: 'center', flexDirection: 'row', gap: 12}}>
          <View
            style={{
              alignItems: 'center',
              backgroundColor: color.accentDeep,
              borderRadius: 22,
              height: 44,
              justifyContent: 'center',
              width: 44,
            }}>
            <ScanFace color={color.white} size={21} strokeWidth={1.7} />
          </View>
          <Text style={[font(17, '800'), {color: color.ink}]}>얼굴 비율</Text>
        </View>
        <View style={{gap: 6, marginLeft: 56, marginTop: 8}}>
          {data.insightLabel ? (
            <Text style={[font(13.5, '700', 1.5), {color: color.ink}]}>
              {data.insightLabel}
            </Text>
          ) : null}
          <ReadableParagraphs
            text={data.insightDescription ?? data.paragraph}
            textStyle={[font(13.5, '400', 1.65), {color: color.body}]}
          />
        </View>
      </View>
      <ThirdsRatioReadout
        ratio={data.ratioNumbers}
        faceShape={data.faceShape}
        hairlineMissing={data.hairlineMissing}
      />
    </RiseIn>
  );
}
