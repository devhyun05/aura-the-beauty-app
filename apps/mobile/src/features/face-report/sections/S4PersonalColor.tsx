import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color, font, pct, radius } from '../reportTokens';
import type { PhotoSlotData, S4Data, SwatchData, ToneMapPoint } from '../reportTypes';
import { Card } from '../visuals/Card';
import { PhotoSlot } from '../visuals/PhotoSlot';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';
import { SpectrumRail, type SpectrumGradientColors } from '../visuals/SpectrumRail';
import { SwatchRow } from '../visuals/SwatchRow';

/**
 * One side of the A/B drape comparison: a header label, then a stage whose
 * backgroundColor animates to `stageColor`, holding a LARGE oval selfie so
 * the drape color hugs the face directly (조명 시뮬레이션 제거 — 색 대비가 핵심).
 * Both sides stay pixel-identical so the only difference the eye sees is the color.
 */
function DrapeStage({ header, headerColor, stageColor, photo, name, caption }: {
  header: string; headerColor: string; stageColor: SharedValue<string>;
  photo: PhotoSlotData; name: string; caption: string;
}) {
  const stageStyle = useAnimatedStyle(() => ({ backgroundColor: stageColor.value }));
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={[font(11, '800'), { color: headerColor, textAlign: 'center' }]}>{header}</Text>
      <Animated.View style={[{
        borderRadius: radius.lg, paddingTop: 14, paddingHorizontal: 8, paddingBottom: 12,
        alignItems: 'center', gap: 9, minHeight: 226, justifyContent: 'space-between',
      }, stageStyle]}>
        {/* 헤어라인~턱 중심의 세로 타원 — 색이 얼굴에 바로 맞닿게(얇은 흰 링만). */}
        <View style={{
          width: 112, height: 142, borderRadius: 999, overflow: 'hidden',
          borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)',
        }}>
          <PhotoSlot slot={photo} shape="oval" style={{ width: 112, height: 142 }} />
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={[font(10.5, '800'), { color: color.ink }]}>
            {name}
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

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

const TONE_STYLE: Record<ToneMapPoint['type'], { color: string; text: string }> = {
  spring_light: { color: '#F6C99B', text: '#593516' },
  spring_bright: { color: '#FF735F', text: '#FFFFFF' },
  spring_true: { color: '#E9A23B', text: '#4B2D05' },
  summer_light: { color: '#C9D8F0', text: '#263A59' },
  summer_true: { color: '#849FCC', text: '#FFFFFF' },
  summer_muted: { color: '#A88FA5', text: '#FFFFFF' },
  autumn_muted: { color: '#A18B70', text: '#FFFFFF' },
  autumn_true: { color: '#B96D3E', text: '#FFFFFF' },
  autumn_deep: { color: '#6D402D', text: '#FFFFFF' },
  winter_bright: { color: '#D9347B', text: '#FFFFFF' },
  winter_true: { color: '#4B4D9D', text: '#FFFFFF' },
  winter_deep: { color: '#372C52', text: '#FFFFFF' },
};

const PERSONAL_COLOR_GRADIENTS: Record<string, SpectrumGradientColors> = {
  temperature: ['#80B8EE', '#B8B3DF', '#E9C3AF', '#EE9465'],
  value: ['#FFF9E9', '#D9CED1', '#8A7180', '#302942'],
  chroma: ['#B8AAA8', '#CFA6A3', '#E37D81', '#EE2D55'],
  clarity: ['#9E929B', '#B9A9B5', '#AF8EDB', '#7759D8'],
  contrast: ['#E7E2DF', '#BDB7B9', '#74717B', '#242333'],
};

function includesOne(value: string, candidates: string[]): boolean {
  return candidates.some(candidate => value.includes(candidate));
}

/** Match the color direction to the labels, including legacy fixture data whose ends were reversed. */
function personalColorGradient(axis: S4Data['axes'][number]): SpectrumGradientColors {
  const label = axis.axisLabel ?? '';
  let gradient = PERSONAL_COLOR_GRADIENTS.contrast;
  let leftIsLow = true;

  if (label === '온도') {
    gradient = PERSONAL_COLOR_GRADIENTS.temperature;
    leftIsLow = includesOne(axis.leftLabel, ['차가운', '쿨']);
  } else if (label === '명도') {
    gradient = PERSONAL_COLOR_GRADIENTS.value;
    leftIsLow = includesOne(axis.leftLabel, ['밝은', '라이트']);
  } else if (label === '채도') {
    gradient = PERSONAL_COLOR_GRADIENTS.chroma;
    leftIsLow = includesOne(axis.leftLabel, ['은은', '저채도']);
  } else if (label === '청탁') {
    gradient = PERSONAL_COLOR_GRADIENTS.clarity;
    leftIsLow = includesOne(axis.leftLabel, ['부드럽', '뮤트']);
  } else if (label === '대비') {
    gradient = PERSONAL_COLOR_GRADIENTS.contrast;
    leftIsLow = includesOne(axis.leftLabel, ['저대비', '낮']);
  }

  return leftIsLow ? gradient : [...gradient].reverse() as unknown as SpectrumGradientColors;
}

function ToneProbabilityList({ data }: { data: S4Data['toneProbabilities'] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleData = expanded ? data : data.slice(0, 4);
  const hiddenCount = Math.max(0, data.length - visibleData.length);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {visibleData.map((item, index) => {
          const isFirst = index === 0;
          const isSecond = index === 1;
          const toneStyle = TONE_STYLE[item.type];
          return (
            <View
              key={item.type}
              style={{
                backgroundColor: toneStyle.color,
                borderColor: isFirst ? color.ink : isSecond ? color.white : 'transparent',
                borderRadius: radius.pill,
                borderWidth: isFirst ? 2 : isSecond ? 1 : 0,
                flexDirection: 'row',
                gap: 5,
                opacity: index < 4 ? 1 : 0.82,
                paddingHorizontal: 9,
                paddingVertical: 5,
              }}>
              <Text style={[font(11, '700'), { color: toneStyle.text }]}>{item.label}</Text>
              <Text style={[font(11, '800'), { color: toneStyle.text }]}>{formatPercent(item.ratio)}</Text>
            </View>
          );
        })}
      </View>
      {data.length > 4 ? (
        <Pressable
          accessibilityLabel={
            expanded
              ? '세부 퍼스널 컬러 확률 접기'
              : `나머지 ${hiddenCount}개 퍼스널 컬러 확률 보기`
          }
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(value => !value)}
          style={({ pressed }) => ({
            alignItems: 'center',
            alignSelf: 'flex-start',
            borderRadius: radius.pill,
            justifyContent: 'center',
            minHeight: 44,
            opacity: pressed ? 0.6 : 1,
            paddingHorizontal: 4,
          })}>
          <Text style={[font(11.5, '800'), { color: color.accentInk }]}>
            {expanded ? '간단히 보기' : `나머지 ${hiddenCount}개 보기`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ToneDot({ point }: { point: ToneMapPoint }) {
  const size = point.active ? 13 + point.weight * 9 : 9;
  const toneStyle = TONE_STYLE[point.type];
  return (
    <View
      pointerEvents="none"
      style={{
        alignItems: 'center',
        left: pct(point.x * 100),
        position: 'absolute',
        top: pct(point.y * 100),
        transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
      }}>
      <View
        style={{
          backgroundColor: toneStyle.color,
          borderColor: color.white,
          borderRadius: 999,
          borderWidth: point.active ? 3 : 1.5,
          height: size,
          shadowColor: color.ink,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: point.active ? 0.3 : 0.14,
          shadowRadius: 2,
          width: size,
        }}
      />
      {point.active ? (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.pill, marginTop: 3, paddingHorizontal: 5, paddingVertical: 2 }}>
          <Text
            numberOfLines={1}
            style={[font(10.5, '800'), { color: color.ink, maxWidth: 74, textAlign: 'center' }]}>
            {point.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ToneMapChart({ data }: { data: S4Data['toneMap'] }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[font(12.5, '800'), { color: color.ink }]}>톤 맵</Text>
      <Text style={[font(11.5, '700'), { color: color.body, textAlign: 'center' }]}>↑ 라이트 · 밝음</Text>
      <View
        style={{
          borderColor: color.outline8,
          borderRadius: radius.lg,
          borderWidth: 1,
          height: 228,
          overflow: 'hidden',
          position: 'relative',
        }}>
        <LinearGradient
          colors={['#FFF9F1', '#C9B4C1', '#443A55']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
        />
        <LinearGradient
          colors={['rgba(121,139,151,0.5)', 'rgba(255,255,255,0.06)', 'rgba(255,86,104,0.45)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }}
        />
        {[0, 1].map(i => (
          <View
            key={`v-${i}`}
            style={{
              backgroundColor: 'rgba(255,255,255,0.46)',
              bottom: 0,
              left: pct(((i + 1) * 100) / 3),
              position: 'absolute',
              top: 0,
              width: 1,
            }}
          />
        ))}
        {[0, 1].map(i => (
          <View
            key={`h-${i}`}
            style={{
              backgroundColor: 'rgba(255,255,255,0.46)',
              height: 1,
              left: 0,
              position: 'absolute',
              right: 0,
              top: pct(((i + 1) * 100) / 3),
            }}
          />
        ))}
        <View
          style={{
            borderColor: color.magenta,
            borderRadius: radius.pill,
            borderWidth: 2,
            backgroundColor: 'rgba(255,255,255,0.12)',
            height: pct(data.area.h * 100),
            left: pct(data.area.x * 100),
            position: 'absolute',
            top: pct(data.area.y * 100),
            width: pct(data.area.w * 100),
          }}
        />
        {data.points.map(point => <ToneDot key={point.type} point={point} />)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Text style={[font(11.5, '700'), { color: color.body, flex: 1 }]}>← 뮤트 · 부드러움</Text>
        <Text style={[font(11.5, '700'), { color: color.body, flex: 1, textAlign: 'right' }]}>클리어 · 비비드 →</Text>
      </View>
      <Text style={[font(11.5, '700'), { color: color.body, textAlign: 'center' }]}>↓ 딥 · 어두움</Text>
      <Text style={[font(12.5, '400', 1.55), { color: color.text }]}>{data.caption}</Text>
    </View>
  );
}

function AxisGlossary() {
  const [expanded, setExpanded] = useState(false);
  const seasonItems = [
    {term: '봄', desc: '따뜻하고 밝거나 선명한 색감'},
    {term: '여름', desc: '차갑고 밝거나 부드러운 색감'},
    {term: '가을', desc: '따뜻하고 깊거나 차분한 색감'},
    {term: '겨울', desc: '차갑고 선명하거나 대비 있는 색감'},
  ];
  const axisItems = [
    {term: '온도', desc: '차가운 톤(쿨) ↔ 따뜻한 톤(웜)'},
    {term: '명도', desc: '밝은 색(라이트) ↔ 어두운 색(딥)'},
    {term: '채도', desc: '은은한 색(저채도) ↔ 선명한 색(고채도)'},
    {term: '청탁', desc: '부드러운 색(뮤트) ↔ 맑은 색(클리어)'},
    {term: '대비', desc: '피부·머리·입술 차이가 약한지 강한지'},
    {term: '뉴트럴', desc: '따뜻함/차가움이 한쪽으로 강하지 않은 중간 톤'},
  ];
  const toneItems = [
    {term: '봄 라이트', desc: '따뜻하고 밝고 가벼운 색'},
    {term: '봄 브라이트', desc: '따뜻하고 선명하고 맑은 색'},
    {term: '봄 트루', desc: '봄의 따뜻함과 맑음이 중심인 색'},
    {term: '여름 라이트', desc: '차갑고 밝고 부드러운 색'},
    {term: '여름 트루', desc: '여름의 차가움과 은은함이 중심인 색'},
    {term: '여름 뮤트', desc: '차갑고 부드럽게 섞인 차분한 색'},
    {term: '가을 뮤트', desc: '따뜻하고 부드럽게 눌린 차분한 색'},
    {term: '가을 트루', desc: '가을의 따뜻함과 깊이가 중심인 색'},
    {term: '가을 딥', desc: '따뜻하고 깊고 무게감 있는 색'},
    {term: '겨울 브라이트', desc: '차갑고 선명하고 대비가 있는 색'},
    {term: '겨울 트루', desc: '겨울의 차가움과 선명함이 중심인 색'},
    {term: '겨울 딥', desc: '차갑고 깊고 또렷한 색'},
  ];

  const renderItems = (items: Array<{term: string; desc: string}>, termWidth = 50) => items.map(item => (
    <View key={item.term} style={{ flexDirection: 'row', gap: 8 }}>
      <Text style={[font(12, '800'), { color: color.accentInk, width: termWidth }]}>{item.term}</Text>
      <Text style={[font(12, '400', 1.5), { color: color.text, flex: 1 }]}>{item.desc}</Text>
    </View>
  ));

  return (
    <View style={{ backgroundColor: color.surface2, borderRadius: radius.lg, gap: 7, paddingHorizontal: 12, paddingVertical: 11 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={[font(12, '800'), { color: color.ink }]}>용어 읽는 법</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`용어 읽는 법 ${expanded ? '접기' : '펼치기'}`}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(value => !value)}
          style={{
            alignItems: 'center',
            backgroundColor: color.surface,
            borderRadius: radius.pill,
            justifyContent: 'center',
            minHeight: 44,
            minWidth: 62,
            paddingHorizontal: 10,
          }}>
          <Text style={[font(11.5, '800'), { color: color.accentInk }]}>{expanded ? '접기' : '펼치기'}</Text>
        </Pressable>
      </View>
      {expanded ? (
        <>
          <Text style={[font(11.5, '800'), { color: color.faint, marginTop: 2 }]}>계절</Text>
          {renderItems(seasonItems)}
          <Text style={[font(11.5, '800'), { color: color.faint, marginTop: 4 }]}>축</Text>
          {renderItems(axisItems)}
          <Text style={[font(11.5, '800'), { color: color.faint, marginTop: 4 }]}>세부 톤 12가지</Text>
          {renderItems(toneItems, 68)}
        </>
      ) : null}
    </View>
  );
}

function SelectedColorDetail({swatch}: {swatch: SwatchData}) {
  const examples = swatch.examples ?? [];
  const reasons = swatch.reasons ?? [];

  if (!swatch.familyLabel && examples.length === 0 && !swatch.note && reasons.length === 0) {
    return null;
  }

  return (
    <View style={{ backgroundColor: color.surface2, borderRadius: radius.md, gap: 6, padding: 11 }}>
      <Text style={[font(11.5, '800'), { color: color.ink }]}>
        {swatch.familyLabel ?? swatch.name}
      </Text>
      {examples.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 7 }}>
          <Text style={[font(10.5, '700'), { color: color.faint, width: 48 }]}>대표 색</Text>
          <Text style={[font(10.5, '500', 1.45), { color: color.text, flex: 1 }]}>
            {examples.join(' · ')}
          </Text>
        </View>
      ) : null}
      {swatch.note ? (
        <Text style={[font(10.5, '500', 1.5), { color: color.text }]}>{swatch.note}</Text>
      ) : null}
      {reasons.length > 0 ? (
        <View style={{ gap: 3 }}>
          <Text style={[font(10.5, '700'), { color: color.faint }]}>선정 근거</Text>
          {reasons.map(reason => (
            <Text key={reason} style={[font(10.5, '500', 1.45), { color: color.text }]}>
              · {reason}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Tone classification, colorful map, and the five measured color axes. */
export function S4ToneOverview({ data }: { data: S4Data }) {
  return (
    <RiseIn>
      <Card gap={14}>
        <View style={{ gap: 2 }}>
          <Text style={[font(14, '800'), { color: color.ink }]}>{data.season.headline}</Text>
          <Text style={[font(12.5, '400', 1.5), { color: color.text }]}>
            현재 측정값이 각 타입에 얼마나 가까운지 보여줘요.
          </Text>
        </View>
        <ToneProbabilityList data={data.toneProbabilities} />
        <ToneMapChart data={data.toneMap} />
        <View style={{ gap: 12 }}>
          {data.axes.map((axis, index) => (
            <SpectrumRail
              key={`${axis.axisLabel ?? 'axis'}-${index}`}
              axis={axis}
              gap={6}
              gradientColors={personalColorGradient(axis)}
            />
          ))}
        </View>
        <AxisGlossary />
      </Card>
    </RiseIn>
  );
}

/** Interactive best/worst drape comparison and the measured report palettes. */
export function S4DrapePalette({
  data,
  showHeader = true,
}: {
  data: S4Data;
  showHeader?: boolean;
}) {
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
    <RiseIn>
      <Card gap={14}>
        {showHeader ? (
          <View style={{ gap: 2 }}>
            <Text style={[font(13, '800'), { color: color.ink }]}>{d.title}</Text>
            <Text style={[font(12.5, '400', 1.5), { color: color.text }]}>{d.sub}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
          <DrapeStage
            header={d.goodTag}
            headerColor={color.accentInk}
            stageColor={bestColor}
            photo={d.photo}
            name={best.name}
            caption={d.goodCaption}
          />
          <DrapeStage
            header={d.badTag}
            headerColor={color.muted}
            stageColor={worstColor}
            photo={d.photo}
            name={worst.name}
            caption={d.badCaption}
          />
        </View>
        <Text style={[font(13, '800'), { color: color.ink }]}>{d.goodTitle}</Text>
        <SwatchRow swatches={d.goodSwatches} selectedName={best.name} onPick={pickBest} />
        <SelectedColorDetail swatch={best} />
        <Text style={[font(13, '800'), { color: color.ink, marginTop: 2 }]}>{d.badTitle}</Text>
        <SwatchRow swatches={d.badSwatches} selectedName={worst.name} onPick={pickWorst} />
        <SelectedColorDetail swatch={worst} />
        <Text style={[font(11.5, '400', 1.6), {
          color: color.muted, borderTopWidth: 1, borderTopColor: color.divider, paddingTop: 11,
        }]}>
          {d.disclaimer}
        </Text>
      </Card>
    </RiseIn>
  );
}

/** S4 long-form composite retained for vertical report capture and legacy callers. */
export function S4PersonalColor({ data }: { data: S4Data }) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      <S4ToneOverview data={data} />
      <S4DrapePalette data={data} />
    </RiseIn>
  );
}
