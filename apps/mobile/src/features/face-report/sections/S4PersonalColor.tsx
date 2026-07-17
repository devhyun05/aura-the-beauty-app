import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, font, radius } from '../reportTokens';
import type { PhotoSlotData, S4Data, SwatchData } from '../reportTypes';
import { Card } from '../visuals/Card';
import { VerticalLightSlider } from '../visuals/VerticalLightSlider';
import { PhotoSlot } from '../visuals/PhotoSlot';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';
import { SpectrumRail } from '../visuals/SpectrumRail';
import { SwatchRow } from '../visuals/SwatchRow';
import { BlendBar } from '../visuals/BlendBar';
import { ConfidenceGauge } from '../visuals/ConfidenceGauge';

/**
 * One side of the A/B drape comparison: a header label, then a stage whose
 * backgroundColor animates to `stageColor`, holding the circular selfie
 * (with the shared warm/cool lighting tint) + a name·tag pill + a caption.
 * Used for both the "잘 어울리는" and "피할" sides so the two stay pixel-identical
 * — the contrast is the whole point, so any drift between them undercuts it.
 */
function DrapeStage({ header, headerColor, stageColor, light, photo, name, tag, caption }: {
  header: string; headerColor: string; stageColor: SharedValue<string>; light: SharedValue<number>;
  photo: PhotoSlotData; name: string; tag: string; caption: string;
}) {
  const stageStyle = useAnimatedStyle(() => ({ backgroundColor: stageColor.value }));
  // Deviation from CSS filter(sepia/hue-rotate): warm/cool tint overlays on the photo.
  const warmStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, -light.value) * 0.25 }));
  const coolStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, light.value) * 0.2 }));

  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[font(11, '800'), { color: headerColor, textAlign: 'center' }]}>{header}</Text>
      <Animated.View style={[{
        borderRadius: radius.lg, paddingTop: 16, paddingHorizontal: 10, paddingBottom: 13,
        alignItems: 'center', gap: 8,
      }, stageStyle]}>
        <View style={{ padding: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.6)' }}>
          <View style={{ width: 74, height: 74, borderRadius: 37, overflow: 'hidden' }}>
            <PhotoSlot slot={photo} shape="circle" style={{ width: 74, height: 74 }} />
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#D7913C' }, warmStyle]} />
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#3C96D7' }, coolStyle]} />
          </View>
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={[font(10.5, '800'), { color: color.ink }]}>
            {name} · {tag}
          </Text>
        </View>
        <Text style={[font(10.5, '400', 1.5), {
          color: 'rgba(255,255,255,0.96)', textAlign: 'center', maxWidth: 170,
          textShadowColor: 'rgba(0,0,0,0.28)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
        }]}>
          {caption}
        </Text>
      </Animated.View>
    </View>
  );
}

/** S4 퍼스널 컬러 — season blend + 5 axes, then the A/B drape stage (best vs worst color, side by side). */
export function S4PersonalColor({ data }: { data: S4Data }) {
  const d = data.drape;
  const [best, setBest] = useState<SwatchData>({ ...d.initialSwatch });
  const bestColor = useSharedValue(d.initialSwatch.color);
  const worstInit: SwatchData = d.badSwatches[0] ?? { name: '기준 색', color: '#8FA6B2' };
  const [worst, setWorst] = useState<SwatchData>(worstInit);
  const worstColor = useSharedValue(worstInit.color);
  const light = useSharedValue(0); // -1 warm .. 1 cool, shared by both stages for a fair comparison

  const pickBest = (s: SwatchData) => {
    setBest(s);
    bestColor.value = withTiming(s.color, { duration: 450 });
  };
  const pickWorst = (s: SwatchData) => {
    setWorst(s);
    worstColor.value = withTiming(s.color, { duration: 450 });
  };

  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} />
      <RiseIn>
        <Card gap={14}>
          <View style={{ gap: 7 }}>
            <Text style={[font(14, '800'), { color: color.ink }]}>{data.season.headline}</Text>
            {data.seasonConfidence ? <ConfidenceGauge data={data.seasonConfidence} /> : null}
            <BlendBar data={data.season.blend} />
          </View>
          <View style={{ gap: 12 }}>
            {data.axes.map((axis, i) => <SpectrumRail key={i} axis={axis} gap={6} />)}
          </View>
        </Card>
      </RiseIn>
      <RiseIn>
        <Card gap={14}>
          <View style={{ gap: 2 }}>
            <Text style={[font(13, '800'), { color: color.ink }]}>{d.title}</Text>
            <Text style={[font(11.5, '400', 1.5), { color: color.muted }]}>{d.sub}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <DrapeStage
              header={d.goodTag}
              headerColor={color.accentInk}
              stageColor={bestColor}
              light={light}
              photo={d.photo}
              name={best.name}
              tag={d.goodTag}
              caption={d.goodCaption}
            />
            <DrapeStage
              header={d.badTag}
              headerColor={color.muted}
              stageColor={worstColor}
              light={light}
              photo={d.photo}
              name={worst.name}
              tag={d.badTag}
              caption={d.badCaption}
            />
          </View>
          <View style={{ alignItems: 'center' }}>
            <VerticalLightSlider
              value={light}
              heading={d.dial.heading}
              warmLabel={d.dial.warm}
              coolLabel={d.dial.cool}
              captions={{ warm: d.dial.warmCaption, neutral: d.dial.neutralCaption, cool: d.dial.coolCaption }}
            />
          </View>
          <Text style={[font(13, '800'), { color: color.ink }]}>{d.goodTitle}</Text>
          <SwatchRow swatches={d.goodSwatches} selectedName={best.name} onPick={pickBest} />
          <Text style={[font(13, '800'), { color: color.ink, marginTop: 2 }]}>{d.badTitle}</Text>
          <SwatchRow swatches={d.badSwatches} bad selectedName={worst.name} onPick={pickWorst} />
          <Text style={[font(11.5, '400', 1.6), {
            color: color.muted, borderTopWidth: 1, borderTopColor: color.divider, paddingTop: 11,
          }]}>
            {d.disclaimer}
          </Text>
        </Card>
      </RiseIn>
    </RiseIn>
  );
}
