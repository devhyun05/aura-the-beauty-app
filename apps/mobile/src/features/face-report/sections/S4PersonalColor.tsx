import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, font, radius } from '../reportTokens';
import type { S4Data, SwatchData } from '../reportTypes';
import { Card } from '../visuals/Card';
import { VerticalLightSlider } from '../visuals/VerticalLightSlider';
import { PhotoSlot } from '../visuals/PhotoSlot';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';
import { SpectrumRail } from '../visuals/SpectrumRail';
import { SwatchRow } from '../visuals/SwatchRow';
import { BlendBar } from '../visuals/BlendBar';

/** S4 퍼스널 컬러 — season blend + 5 axes, then the interactive drape stage (swatch tap + lighting dial). */
export function S4PersonalColor({ data }: { data: S4Data }) {
  const d = data.drape;
  const [drape, setDrape] = useState<{ name: string; color: string; good: boolean }>({ ...d.initialSwatch });
  const stageColor = useSharedValue(d.initialSwatch.color);
  const light = useSharedValue(0); // -1 warm .. 1 cool

  const pick = (s: SwatchData, good: boolean) => {
    setDrape({ name: s.name, color: s.color, good });
    stageColor.value = withTiming(s.color, { duration: 450 });
  };

  const stageStyle = useAnimatedStyle(() => ({ backgroundColor: stageColor.value }));
  // Deviation from CSS filter(sepia/hue-rotate): warm/cool tint overlays on the photo.
  const warmStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, -light.value) * 0.25 }));
  const coolStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, light.value) * 0.2 }));

  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} />
      <RiseIn>
        <Card gap={14}>
          <View style={{ gap: 7 }}>
            <Text style={[font(14, '800'), { color: color.ink }]}>{data.season.headline}</Text>
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
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
            <Animated.View style={[{
              flex: 1, borderRadius: radius.lg, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 13,
              alignItems: 'center', gap: 8,
            }, stageStyle]}>
              <View style={{ padding: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.6)' }}>
                <View style={{ width: 86, height: 86, borderRadius: 43, overflow: 'hidden' }}>
                  <PhotoSlot slot={d.photo} shape="circle" style={{ width: 86, height: 86 }} />
                  <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#D7913C' }, warmStyle]} />
                  <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#3C96D7' }, coolStyle]} />
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
                <Text style={[font(10.5, '800'), { color: color.ink }]}>
                  {drape.name} · {drape.good ? d.goodTag : d.badTag}
                </Text>
              </View>
              <Text style={[font(10.5, '400', 1.5), {
                color: 'rgba(255,255,255,0.96)', textAlign: 'center', maxWidth: 170,
                textShadowColor: 'rgba(0,0,0,0.28)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
              }]}>
                {drape.good ? d.goodCaption : d.badCaption}
              </Text>
            </Animated.View>
            <VerticalLightSlider
              value={light}
              heading={d.dial.heading}
              warmLabel={d.dial.warm}
              coolLabel={d.dial.cool}
              captions={{ warm: d.dial.warmCaption, neutral: d.dial.neutralCaption, cool: d.dial.coolCaption }}
            />
          </View>
          <Text style={[font(13, '800'), { color: color.ink }]}>{d.goodTitle}</Text>
          <SwatchRow swatches={d.goodSwatches} selectedName={drape.good ? drape.name : undefined} onPick={s => pick(s, true)} />
          <Text style={[font(13, '800'), { color: color.ink, marginTop: 2 }]}>{d.badTitle}</Text>
          <SwatchRow swatches={d.badSwatches} bad selectedName={!drape.good ? drape.name : undefined} onPick={s => pick(s, false)} />
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
