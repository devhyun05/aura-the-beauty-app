import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, font, radius } from '../reportTokens';
import type { PhotoSlotData, S4Data, SwatchData } from '../reportTypes';
import { Card } from '../visuals/Card';
import { PhotoSlot } from '../visuals/PhotoSlot';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';
import { SpectrumRail } from '../visuals/SpectrumRail';
import { SwatchRow } from '../visuals/SwatchRow';
import { BlendBar } from '../visuals/BlendBar';
import { ConfidenceGauge } from '../visuals/ConfidenceGauge';

/**
 * One side of the A/B drape comparison: a header label, then a stage whose
 * backgroundColor animates to `stageColor`, holding a LARGE circular selfie so
 * the drape color hugs the face directly (조명 시뮬레이션 제거 — 색 대비가 핵심).
 * Both sides stay pixel-identical so the only difference the eye sees is the color.
 */
function DrapeStage({ header, headerColor, stageColor, photo, name, tag, caption }: {
  header: string; headerColor: string; stageColor: SharedValue<string>;
  photo: PhotoSlotData; name: string; tag: string; caption: string;
}) {
  const stageStyle = useAnimatedStyle(() => ({ backgroundColor: stageColor.value }));
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[font(11, '800'), { color: headerColor, textAlign: 'center' }]}>{header}</Text>
      <Animated.View style={[{
        borderRadius: radius.lg, paddingTop: 14, paddingHorizontal: 8, paddingBottom: 12,
        alignItems: 'center', gap: 9,
      }, stageStyle]}>
        {/* 큰 얼굴 — 색이 얼굴에 바로 맞닿게(얇은 흰 링만). */}
        <View style={{
          width: 116, height: 116, borderRadius: 58, overflow: 'hidden',
          borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)',
        }}>
          <PhotoSlot slot={photo} shape="circle" style={{ width: 116, height: 116 }} />
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={[font(10.5, '800'), { color: color.ink }]}>
            {name} · {tag}
          </Text>
        </View>
        <Text style={[font(10.5, '400', 1.5), {
          color: 'rgba(255,255,255,0.98)', textAlign: 'center', maxWidth: 150,
          textShadowColor: 'rgba(0,0,0,0.32)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
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

  // data(드레이프) 프롭이 바뀌면(다른 보고서로 전환) 선택 상태를 새 데이터로 재동기화한다
  // — mount 초기값이 stale하게 남는 것을 막는다(Gemini 리뷰).
  useEffect(() => {
    setBest({ ...d.initialSwatch });
    bestColor.value = d.initialSwatch.color;
    const wInit = d.badSwatches[0] ?? { name: '기준 색', color: '#8FA6B2' };
    setWorst(wInit);
    worstColor.value = wInit.color;
  }, [d.initialSwatch, d.badSwatches, bestColor, worstColor]);

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
              photo={d.photo}
              name={best.name}
              tag={d.goodTag}
              caption={d.goodCaption}
            />
            <DrapeStage
              header={d.badTag}
              headerColor={color.muted}
              stageColor={worstColor}
              photo={d.photo}
              name={worst.name}
              tag={d.badTag}
              caption={d.badCaption}
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
