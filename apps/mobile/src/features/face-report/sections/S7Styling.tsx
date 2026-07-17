import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Path } from 'react-native-svg';
import Animated, { SharedValue, interpolateColor, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { color, font, radius } from '../reportTokens';
import type { LookCardData, S7Data } from '../reportTypes';
import { EvidenceBadge } from '../visuals/Badge';
import { Card } from '../visuals/Card';
import { FACE_PATH } from '../visuals/GazeReplay';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

const MAP_W = 84, MAP_H = 110;

/** Position map: blush/eye/lip point placements morph continuously with the mix value. */
function MixFaceMap({ mix }: { mix: SharedValue<number> }) {
  const eyeL = useAnimatedStyle(() => {
    const t = mix.value;
    return {
      position: 'absolute', left: '22%', top: '35%', width: 7 + 4 * t, height: 7 + 2 * t,
      borderRadius: radius.pill, backgroundColor: `rgba(38,58,68,${0.4 + 0.5 * t})`,
      transform: [{ rotate: `${-14 * t}deg` }],
    };
  });
  const eyeR = useAnimatedStyle(() => {
    const t = mix.value;
    return {
      position: 'absolute', right: '22%', top: '35%', width: 7 + 4 * t, height: 7 + 2 * t,
      borderRadius: radius.pill, backgroundColor: `rgba(38,58,68,${0.4 + 0.5 * t})`,
      transform: [{ rotate: `${14 * t}deg` }],
    };
  });
  const blushL = useAnimatedStyle(() => {
    const t = mix.value;
    return {
      position: 'absolute', left: `${17 - 3 * t}%`, top: `${55 - 9 * t}%`, width: '24%', height: '9%',
      borderRadius: radius.pill, backgroundColor: `rgba(233,122,145,${0.5 + 0.2 * t})`,
      transform: [{ rotate: `${-6 - 12 * t}deg` }],
    };
  });
  const blushR = useAnimatedStyle(() => {
    const t = mix.value;
    return {
      position: 'absolute', right: `${17 - 3 * t}%`, top: `${55 - 9 * t}%`, width: '24%', height: '9%',
      borderRadius: radius.pill, backgroundColor: `rgba(233,122,145,${0.5 + 0.2 * t})`,
      transform: [{ rotate: `${6 + 12 * t}deg` }],
    };
  });
  const lip = useAnimatedStyle(() => ({
    position: 'absolute', left: '38%', right: '38%', top: '73%', height: '6%',
    borderRadius: radius.pill,
    backgroundColor: interpolateColor(mix.value, [0, 1], [color.lipNatural, color.lipGlam]),
  }));
  return (
    <View style={{ width: MAP_W, height: MAP_H }}>
      <Svg width={MAP_W} height={MAP_H} viewBox="0 0 112 146">
        <Path d={FACE_PATH} stroke={color.faceOutline} strokeWidth={2.6} fill="none" />
      </Svg>
      <Animated.View style={eyeL} />
      <Animated.View style={eyeR} />
      <Animated.View style={blushL} />
      <Animated.View style={blushR} />
      <Animated.View style={lip} />
    </View>
  );
}

function LookCard({ card, animatedStyle }: { card: LookCardData; animatedStyle: ReturnType<typeof useAnimatedStyle> }) {
  const natural = card.variant === 'natural';
  return (
    <RiseIn>
      <Animated.View style={animatedStyle}>
        <Card gap={0}>
          <View style={{ gap: 5, paddingBottom: 13 }}>
            <View style={{
              alignSelf: 'flex-start', backgroundColor: natural ? color.accentTint : color.ink,
              borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12,
            }}>
              <Text style={[font(11.5, '800'), { color: natural ? color.accentInk : color.white }]}>{card.chip}</Text>
            </View>
            <Text style={[font(14, '700'), { color: color.ink, marginTop: 3 }]}>{card.title}</Text>
            <Text style={[font(12.5, '400', 1.55), { color: color.muted }]}>{card.sub}</Text>
          </View>
          {card.rows.map((r, i) => (
            <View key={r.category} style={{
              flexDirection: 'row', gap: 11, paddingTop: 12,
              paddingBottom: i === card.rows.length - 1 ? 2 : 12,
              borderTopWidth: 1, borderTopColor: color.divider,
            }}>
              <Text style={[font(12, '800'), { color: color.ink, width: 52, paddingTop: 2 }]}>{r.category}</Text>
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <Text style={[font(13, '700'), { color: color.body }]}>{r.title}</Text>
                  <EvidenceBadge kind={r.evidence} label={r.evidenceLabel} />
                </View>
                <Text style={[font(12, '400', 1.55), { color: color.muted }]}>{r.why}</Text>
              </View>
            </View>
          ))}
        </Card>
      </Animated.View>
    </RiseIn>
  );
}

/** S7 스타일링 인사이트 — 내추럴↔글램 slider cross-fading the two look cards + morphing position map. */
export function S7Styling({ data }: { data: S7Data }) {
  const mix = useSharedValue(0); // 0 natural .. 1 glam
  const [labelZone, setLabelZone] = useState<0 | 1 | 2>(0); // <.35 / mid / >.65
  const [side, setSide] = useState<0 | 1>(0);               // <.5 natural / glam

  const onSlide = (v: number) => {
    const t = v / 100;
    mix.value = t;
    const z: 0 | 1 | 2 = t < 0.35 ? 0 : t > 0.65 ? 2 : 1;
    setLabelZone(prev => (prev === z ? prev : z));
    const s: 0 | 1 = t < 0.5 ? 0 : 1;
    setSide(prev => (prev === s ? prev : s));
  };

  const naturalStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.5 * mix.value,
    transform: [{ scale: 1 - 0.012 * mix.value }],
  }));
  const glamStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.5 * mix.value,
    transform: [{ scale: 1 - 0.012 * (1 - mix.value) }],
  }));

  const mixLabel = labelZone === 0 ? data.mixZones.nearNatural : labelZone === 2 ? data.mixZones.nearGlam : data.mixZones.middle;
  const summary = side === 0 ? data.lookSummary.natural : data.lookSummary.glam;

  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} subParts={data.noteParts} />
      <RiseIn>
        <Card gap={12}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={[font(12, '800'), { color: color.accentInk }]}>{data.naturalLabel}</Text>
            <Text style={[font(11, '700'), { color: color.muted }]}>{mixLabel}</Text>
            <Text style={[font(12, '800'), { color: color.ink }]}>{data.glamLabel}</Text>
          </View>
          <Slider
            minimumValue={0}
            maximumValue={100}
            onValueChange={onSlide}
            minimumTrackTintColor={color.accent}
            maximumTrackTintColor={color.rail}
            thumbTintColor={color.accent}
            style={{ width: '100%', height: 22 }}
          />
          <View style={{
            flexDirection: 'row', gap: 16, alignItems: 'center',
            borderTopWidth: 1, borderTopColor: color.divider, paddingTop: 12,
          }}>
            <MixFaceMap mix={mix} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[font(12, '800'), { color: color.ink }]}>{summary.title}</Text>
              <Text style={[font(11.5, '400', 1.6), { color: color.muted }]}>{summary.desc}</Text>
            </View>
          </View>
        </Card>
      </RiseIn>
      <LookCard card={data.naturalCard} animatedStyle={naturalStyle} />
      <LookCard card={data.glamCard} animatedStyle={glamStyle} />
    </RiseIn>
  );
}
