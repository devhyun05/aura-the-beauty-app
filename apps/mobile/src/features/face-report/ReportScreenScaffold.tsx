import React, { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import { OptionalViewShot } from '../../shared/ui/OptionalViewShot';
import { color, font, radius, shadow } from './reportTokens';
import type { BandKey, ReportScreenProps } from './reportTypes';

// Matches the legacy report screen's capture settings.
const REPORT_CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
} as const;
import { ScrollAnimContext } from './visuals/RiseIn';
import { S1Summary } from './sections/S1Summary';
import { S2Proportion } from './sections/S2Proportion';
import { S3Features } from './sections/S3Features';
import { S4PersonalColor } from './sections/S4PersonalColor';
import { S5Body } from './sections/S5Body';
import { S6Impression } from './sections/S6Impression';
import { S7Styling } from './sections/S7Styling';

/**
 * Report screen: top bar + S1..S7 in fixed order + footer CTA.
 * Pure & props-driven — navigation, retake and survey actions bubble up as callbacks.
 */
export function ReportScreenScaffold({
  data, entryAnimation = true, onBack, onMore, onRetake, onResurvey, onPressCta, captureRef,
}: ReportScreenProps) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const cardY = useRef<Record<string, number>>({});
  const onScroll = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });

  // S2 lens "카드 보기" → scroll to the matching S3 region card, 64px below the top edge.
  // No-op when S3 isn't rendered (no real region data yet) — scrolling to 0 would
  // read as a broken button rather than an honest "not available" state.
  const openRegionCard = (key: BandKey) => {
    if (!data.s3) {
      return;
    }
    const y = (sectionY.current.s3 ?? 0) + (cardY.current[key] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 64), animated: true });
  };

  const circleBtn = (child: React.ReactNode, onPress?: () => void) => (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [{
      width: 34, height: 34, borderRadius: 17, backgroundColor: color.surface,
      alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
    }, shadow.circleButton]}>
      {child}
    </Pressable>
  );

  return (
    <ScrollAnimContext.Provider value={{ scrollY, enabled: entryAnimation }}>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View style={{
            paddingTop: Math.max(insets.top, 54) + 10, paddingHorizontal: 20, paddingBottom: 6,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {circleBtn(<ChevronLeft size={18} color={color.body} strokeWidth={2.2} />, onBack)}
            <Text style={[font(14, '700'), { color: color.ink }]}>{data.topBarTitle}</Text>
            {circleBtn(<MoreHorizontal size={16} color={color.body} />, onMore)}
          </View>

          {/*
            Capture target for 공유/이미지 저장. Wraps the report body (not the
            top bar) and lives inside the ScrollView so the captured image
            contains the whole report, not just the visible viewport.
          */}
          <OptionalViewShot ref={captureRef} options={REPORT_CAPTURE_OPTIONS} style={{ backgroundColor: color.bg }}>
          <View onLayout={e => { sectionY.current.s1 = e.nativeEvent.layout.y; }}>
            <S1Summary data={data.s1} />
          </View>
          {data.s2 ? (
            <View onLayout={e => { sectionY.current.s2 = e.nativeEvent.layout.y; }}>
              <S2Proportion data={data.s2} onOpenRegionCard={openRegionCard} onRetake={onRetake} />
            </View>
          ) : null}
          {data.s3 ? (
            <View onLayout={e => { sectionY.current.s3 = e.nativeEvent.layout.y; }}>
              <S3Features data={data.s3} onCardLayout={(k, y) => { cardY.current[k] = y; }} />
            </View>
          ) : null}
          {data.s4 ? (
            <View onLayout={e => { sectionY.current.s4 = e.nativeEvent.layout.y; }}>
              <S4PersonalColor data={data.s4} />
            </View>
          ) : null}
          <View onLayout={e => { sectionY.current.s5 = e.nativeEvent.layout.y; }}>
            <S5Body data={data.s5} onResurvey={onResurvey} />
          </View>
          {data.s6 ? (
            <View onLayout={e => { sectionY.current.s6 = e.nativeEvent.layout.y; }}>
              <S6Impression data={data.s6} />
            </View>
          ) : null}
          {data.s7 ? (
            <View onLayout={e => { sectionY.current.s7 = e.nativeEvent.layout.y; }}>
              <S7Styling data={data.s7} />
            </View>
          ) : null}
          </OptionalViewShot>

          <View style={{ paddingTop: 26, paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 0) + 96, alignItems: 'center', gap: 14 }}>
            <Text style={[font(11.5, '400', 1.65), { color: color.muted, textAlign: 'center', maxWidth: 300 }]}>
              {data.footer.disclaimer}
            </Text>
            <Pressable onPress={onPressCta} style={({ pressed }) => [{
              alignSelf: 'stretch', paddingVertical: 15, borderRadius: radius.lg,
              backgroundColor: color.accent, alignItems: 'center', opacity: pressed ? 0.9 : 1,
            }, shadow.cta]}>
              <Text style={[font(14.5, '800'), { color: color.white }]}>{data.footer.cta}</Text>
            </Pressable>
          </View>
        </Animated.ScrollView>
      </View>
    </ScrollAnimContext.Provider>
  );
}
