// RecommendationResultsScreen — RN port of "Makeup Result v3.dc.html".
// Presentational: real data is mapped into `looks` by the adapter (RecommendationResultsView).
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, PanResponder, useWindowDimensions, Platform,
} from 'react-native';
import {BlurView} from 'expo-blur';
import {LinearGradient} from 'expo-linear-gradient';
import {Image} from 'expo-image';
import Svg, {Circle, Defs, Line, Path, RadialGradient, Stop} from 'react-native-svg';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, runOnJS,
} from 'react-native-reanimated';
import {OptionalViewShot, type OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';
import {colors, radius, shadows, type as t} from '../theme/makeupResultTokens';
import {PART_KEYS, type Look, type PartKey} from './recommendationResultTypes';

// ---------- public contract ----------
export type ImageStatus = 'loading' | 'ok' | 'error';
export interface RecommendationResultsScreenProps {
  looks: Look[];
  imageStatus?: Partial<Record<string, ImageStatus>>;
  dateLabel?: string;
  situationLabel?: string;
  traitChips?: string[];
  reduceMotion?: boolean;
  topInset?: number;
  bottomInset?: number;
  /** Draw the in-screen top bar. Off when hosted under the app's shell header. */
  showTopBar?: boolean;
  shareCaptureRef?: React.Ref<OptionalViewShotRef>;
  onApplyAR?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  onSaveShareCard?: () => void;
  onRetryImages?: (lookId: string) => void;
  onPartChange?: (part: PartKey) => void;
  onLookChange?: (lookId: string) => void;
  onBack?: () => void;
}

const SHARE_CAPTURE_OPTIONS = {format: 'png', quality: 1, result: 'tmpfile'} as const;
const EASE = Easing.bezier(0.22, 0.75, 0.2, 1);
const TINTS: Record<PartKey, {x: number; y: number; r: number; x2?: number; y2?: number; r2?: number}> = {
  base: {x: 70, y: 92, r: 46}, brow: {x: 70, y: 63, r: 26}, eye: {x: 70, y: 79, r: 24},
  cheek: {x: 47, y: 104, r: 17, x2: 93, y2: 104, r2: 17}, lip: {x: 70, y: 125, r: 16},
};
const HOTS: {k: PartKey; label: string; x: number; y: number}[] = [
  {k: 'base', label: '베이스', x: 0.5, y: 0.17}, {k: 'brow', label: '브로우', x: 0.27, y: 0.37},
  {k: 'eye', label: '아이', x: 0.7, y: 0.47}, {k: 'cheek', label: '치크', x: 0.26, y: 0.61},
  {k: 'lip', label: '립', x: 0.5, y: 0.74},
];

// ---------- small shared pieces ----------
const GlassCard: React.FC<{style?: object; children: React.ReactNode}> = ({style, children}) => (
  <View style={[st.glassWrap, shadows.card, style]}>
    <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
    <View style={st.glassFill} />
    <View style={st.glassContent}>{children}</View>
  </View>
);

const Eyebrow: React.FC<{children: string}> = ({children}) => <Text style={t.eyebrow}>{children}</Text>;

/** Dashed progress bar (mockup's repeating-linear-gradient barcode). */
const DashedBar: React.FC<{pct: number; width: number; height: number; reduceMotion?: boolean}> = ({pct, width, height, reduceMotion}) => {
  const w = useSharedValue(reduceMotion ? (pct / 100) * width : 0);
  useEffect(() => { w.value = withTiming((pct / 100) * width, {duration: 900, easing: EASE}); }, [pct, width, w]);
  const clip = useAnimatedStyle(() => ({width: w.value}));
  const dash = (color: string) => (
    <Svg width={width} height={height}>
      <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth={height} strokeDasharray="2,4" />
    </Svg>
  );
  return (
    <View style={{width, height}}>
      <View style={StyleSheet.absoluteFill}>{dash('rgba(255,255,255,0.9)')}</View>
      <Animated.View style={[{height, overflow: 'hidden'}, clip]}>{dash(colors.dark)}</Animated.View>
    </View>
  );
};

/** Shimmer skeleton for the hero while the image is loading. */
const HeroSkeleton: React.FC<{reduceMotion?: boolean}> = ({reduceMotion}) => {
  const {width} = useWindowDimensions();
  const x = useSharedValue(-width);
  useEffect(() => {
    if (reduceMotion) return;
    x.value = withRepeat(withTiming(width, {duration: 1500, easing: Easing.linear}), -1);
  }, [reduceMotion, width, x]);
  const sweep = useAnimatedStyle(() => ({transform: [{translateX: x.value}]}));
  return (
    <View style={[StyleSheet.absoluteFill, {backgroundColor: '#CBD4EC', justifyContent: 'flex-end', padding: 20, overflow: 'hidden'}]}>
      <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
        <LinearGradient colors={['#CBD4EC00', '#E2E8F8', '#CBD4EC00']} start={{x: 0, y: 0}} end={{x: 1, y: 0.1}} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={{gap: 10}}>
        <View style={{width: 110, height: 20, borderRadius: 999, backgroundColor: 'rgba(16,24,40,0.08)'}} />
        <View style={{width: '70%', height: 32, borderRadius: 10, backgroundColor: 'rgba(16,24,40,0.1)'}} />
        <View style={{width: '55%', height: 16, borderRadius: 8, backgroundColor: 'rgba(16,24,40,0.06)'}} />
      </View>
    </View>
  );
};

/** Section reveal-on-mount (mockup used IntersectionObserver). */
const RiseIn: React.FC<{index: number; reduceMotion?: boolean; children: React.ReactNode}> = ({index, reduceMotion, children}) => {
  const p = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => { p.value = withDelay(120 * index, withTiming(1, {duration: 800, easing: EASE})); }, [index, p]);
  const a = useAnimatedStyle(() => ({opacity: p.value, transform: [{translateY: (1 - p.value) * 26}]}));
  return <Animated.View style={a}>{children}</Animated.View>;
};

/** Achromatic line-art face + moving tint + hotspots. */
const FaceDiagram: React.FC<{part: PartKey; onSelect: (k: PartKey) => void; hex: (k: PartKey) => string}> = ({part, onSelect}) => {
  const W = 138, H = 170;
  const tn = TINTS[part];
  const stroke = '#2A3242';
  return (
    <View style={{width: W, height: H}}>
      <Svg width={W} height={H} viewBox="0 0 140 170">
        <Defs>
          <RadialGradient id="tintG" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#101828" stopOpacity={0.14} />
            <Stop offset="100%" stopColor="#101828" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={tn.x} cy={tn.y} r={tn.r} fill="url(#tintG)" />
        {tn.x2 != null && <Circle cx={tn.x2} cy={tn.y2} r={tn.r2} fill="url(#tintG)" />}
        <Path d="M70,20 C95,20 111,43 111,77 C111,114 93,149 70,149 C47,149 29,114 29,77 C29,43 45,20 70,20 Z" fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.55} />
        <Path d="M40,64 Q50,58.5 60,62.5" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
        <Path d="M80,62.5 Q90,58.5 100,64" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
        <Path d="M42,79 Q51,72.5 60,79 Q51,83.5 42,79 Z" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" opacity={0.45} />
        <Path d="M80,79 Q89,72.5 98,79 Q89,83.5 80,79 Z" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" opacity={0.45} />
        <Path d="M70,84 L70,103 Q70,108 65,108" fill="none" stroke={stroke} strokeWidth={1.3} strokeLinecap="round" opacity={0.3} />
        <Path d="M56,124 Q63,119 70,122.5 Q77,119 84,124 Q70,133 56,124 Z" fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" opacity={0.5} />
        <Path d="M58,124.5 Q70,127.5 82,124.5" fill="none" stroke={stroke} strokeWidth={1} opacity={0.28} />
      </Svg>
      {HOTS.map((h) => {
        const act = part === h.k;
        return (
          <Pressable key={h.k} onPress={() => onSelect(h.k)} hitSlop={10}
            style={{position: 'absolute', left: h.x * W, top: h.y * H, transform: [{translateX: -20}], width: 40, alignItems: 'center', gap: 3}}>
            <View style={{
              width: act ? 15 : 11, height: act ? 15 : 11, borderRadius: 8,
              backgroundColor: act ? colors.dark : colors.white,
              borderWidth: 1.5, borderColor: act ? colors.white : 'rgba(16,24,40,0.5)',
            }} />
            <View style={{backgroundColor: act ? colors.dark : 'rgba(255,255,255,0.94)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7}}>
              <Text style={{fontSize: 9, fontWeight: '700', color: act ? colors.white : colors.ink}}>{h.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

/** Confetti burst on discovery reveal (10 dots shooting outward). */
const Burst: React.FC = () => (
  <View pointerEvents="none" style={[StyleSheet.absoluteFill, {alignItems: 'center', justifyContent: 'center'}]}>
    {Array.from({length: 10}, (_, j) => <BurstDot key={j} angle={j * 36} big={j % 2 === 0} />)}
  </View>
);
const BurstDot: React.FC<{angle: number; big: boolean}> = ({angle, big}) => {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, {duration: 850, easing: Easing.bezier(0.2, 0.7, 0.3, 1)}); }, [p]);
  const a = useAnimatedStyle(() => {
    const d = -30 - 100 * p.value;
    const rad = (angle * Math.PI) / 180;
    return {
      opacity: 1 - p.value,
      transform: [{translateX: Math.sin(rad) * -d}, {translateY: Math.cos(rad) * d}, {scale: 1 - 0.85 * p.value}],
    };
  });
  const s = big ? 10 : 7;
  return <Animated.View style={[{position: 'absolute', width: s, height: s, borderRadius: s / 2, backgroundColor: colors.white}, a]} />;
};

// ---------- main screen ----------
export const RecommendationResultsScreen: React.FC<RecommendationResultsScreenProps> = ({
  looks, imageStatus, dateLabel, situationLabel,
  traitChips = [], reduceMotion = false,
  topInset = 0, bottomInset = 0, showTopBar = true, shareCaptureRef,
  onApplyAR, onSave, onShare, onSaveShareCard, onRetryImages, onPartChange, onLookChange, onBack,
}) => {
  const {width: SCREEN_W} = useWindowDimensions();
  const W = Math.min(SCREEN_W, 390);
  const heroW = W - 28;
  const count = looks.length;
  const discoveryIndex = looks.findIndex(l => l.id === 'discovery');

  const [look, setLook] = useState(0);
  const [part, setPart] = useState<PartKey>('base');
  const [revealed, setRevealed] = useState(false);
  const [burst, setBurst] = useState(false);
  const [toast, setToast] = useState('');
  const [localStatus, setLocalStatus] = useState<Record<string, ImageStatus>>({});
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);

  const statusOf = (l: Look): ImageStatus => imageStatus?.[l.id] ?? localStatus[l.id] ?? 'loading';
  const setImg = (id: string, v: ImageStatus) => setLocalStatus((s) => ({...s, [id]: v}));
  const showToast = (m: string) => { clearTimeout(toastT.current); setToast(m); toastT.current = setTimeout(() => setToast(''), 2200); };
  const selectPart = useCallback((k: PartKey) => { setPart(k); onPartChange?.(k); }, [onPartChange]);

  // hero carousel gesture
  const trackX = useSharedValue(0);
  const lookRef = useRef(look); lookRef.current = look;
  const goLook = useCallback((i: number, scrollTop = false) => {
    setLook(i);
    onLookChange?.(looks[i]?.id);
    trackX.value = withTiming(-i * heroW, {duration: 500, easing: EASE});
    if (scrollTop) scrollRef.current?.scrollTo({y: 0, animated: true});
  }, [heroW, trackX, onLookChange, looks]);
  const heroPan = useMemo(() => PanResponder.create({
    // iOS back-swipe safe: only claim clearly-horizontal moves that don't start at the screen edge
    onMoveShouldSetPanResponder: (e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && e.nativeEvent.pageX > 24,
    onPanResponderMove: (_e, g) => { trackX.value = -lookRef.current * heroW + g.dx; },
    onPanResponderRelease: (_e, g) => {
      let i = lookRef.current;
      if (Math.abs(g.dx) > Math.min(heroW * 0.2, 90)) { if (g.dx < 0 && i < count - 1) i++; else if (g.dx > 0 && i > 0) i--; }
      runOnJS(goLook)(i);
    },
    onPanResponderTerminate: () => runOnJS(goLook)(lookRef.current),
  }), [heroW, goLook, count, trackX]);
  const trackStyle = useAnimatedStyle(() => ({transform: [{translateX: trackX.value}]}));

  // before/after gesture
  const ba = useSharedValue(0.5);
  const baW = useRef(1);
  const baPan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderMove: (e) => { ba.value = Math.max(0.04, Math.min(0.96, e.nativeEvent.locationX / baW.current)); },
  }), [ba]);
  const baClip = useAnimatedStyle(() => ({width: ba.value * baW.current}));
  const baHandle = useAnimatedStyle(() => ({left: ba.value * baW.current}));

  const reveal = () => {
    if (revealed) return;
    setRevealed(true); setBurst(true);
    if (discoveryIndex >= 0) goLook(discoveryIndex);
    setTimeout(() => setBurst(false), 950);
  };

  const a = looks[Math.min(look, count - 1)];
  const veiledActive = a.id === 'discovery' && !revealed;
  const aName = veiledActive ? '? ? ?' : a.name;
  const aMatch = veiledActive ? '??' : String(a.match);
  const pp = a.parts[part];
  const partHex = (k: PartKey) => a.parts[k].hex;

  const dispName = (l: Look) => (l.id === 'discovery' && !revealed ? '? ? ?' : l.name);
  const dispMatch = (l: Look) => (l.id === 'discovery' && !revealed ? '??%' : `${l.match}%`);
  const totalLabel = String(count).padStart(2, '0');
  const titleTop = dateLabel ? `${dateLabel} · ${situationLabel ?? ''}`.replace(/ · $/, '') : (situationLabel ?? '');

  return (
    <View style={{flex: 1, alignSelf: 'center', width: W}}>
      <LinearGradient colors={[...colors.screenGradient]} start={{x: 0.04, y: 0}} end={{x: 0, y: 1}} style={StyleSheet.absoluteFill} />
      <ScrollView ref={scrollRef} contentContainerStyle={{paddingTop: topInset + (showTopBar ? 62 : 12), paddingBottom: bottomInset + 110}} showsVerticalScrollIndicator={false}>

        {/* 2. title block */}
        <View style={{paddingHorizontal: 20, paddingTop: 22, gap: 10}}>
          {titleTop ? <Text style={{fontSize: 12.5, fontWeight: '500', color: colors.sub2}}>{titleTop}</Text> : null}
          <Text style={t.displayLg}>오늘의 추천,{'\n'}{aName}</Text>
          <View style={{flexDirection: 'row', gap: 16}}>
            {([[String(count), '룩'], [`${aMatch}%`, '매치'], [a.time, '소요']] as const).map(([v, l]) => (
              <Text key={l} style={{fontSize: 13, color: colors.sub}}><Text style={{fontWeight: '700', color: colors.ink}}>{v}</Text> {l}</Text>
            ))}
          </View>
        </View>

        {/* 3. hero carousel */}
        <View style={[{marginHorizontal: 14, marginTop: 16, height: 470, borderRadius: radius.hero, overflow: 'hidden', backgroundColor: colors.heroPlaceholder}, shadows.hero]} {...heroPan.panHandlers}>
          <Animated.View style={[{flexDirection: 'row', width: heroW * count, height: '100%'}, trackStyle]}>
            {looks.map((l) => {
              const stt = statusOf(l);
              const veiled = l.id === 'discovery' && !revealed;
              return (
                <View key={l.id} style={{width: heroW, height: '100%', overflow: 'hidden', backgroundColor: colors.heroPlaceholder}}>
                  {stt !== 'error' && (
                    <Image source={l.image} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{top: '20%', left: '50%'}}
                      transition={reduceMotion ? 0 : 600}
                      onLoad={() => setImg(l.id, 'ok')} onError={() => setImg(l.id, 'error')} />
                  )}
                  {stt === 'loading' && <HeroSkeleton reduceMotion={reduceMotion} />}
                  {stt === 'error' && (
                    <LinearGradient colors={['#98ABDD', '#7B8FC9']} style={[StyleSheet.absoluteFill, {alignItems: 'center', justifyContent: 'center', padding: 24}]}>
                      <View style={{alignItems: 'center', gap: 10}}>
                        <Text style={{fontSize: 10, fontWeight: '700', letterSpacing: 2.8, color: 'rgba(255,255,255,0.6)'}}>IMAGE PREPARING</Text>
                        <Text style={{fontSize: 30, fontWeight: '600', color: colors.white}}>{l.name}</Text>
                        <Text style={{fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.75)', lineHeight: 20, textAlign: 'center'}}>추천 룩 이미지를 다시 만들고 있어요.{'\n'}잠시 후 자동으로 채워져요.</Text>
                        <Pressable onPress={() => { setImg(l.id, 'loading'); onRetryImages?.(l.id); }} style={{marginTop: 6, backgroundColor: colors.dark, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill}}>
                          <Text style={{color: colors.white, fontSize: 12.5, fontWeight: '700'}}>이미지 다시 만들기</Text>
                        </Pressable>
                      </View>
                    </LinearGradient>
                  )}
                  {stt === 'ok' && (
                    <>
                      <LinearGradient colors={['rgba(8,14,30,0)', 'rgba(8,14,30,0.68)']} style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%'}} pointerEvents="none" />
                      <View pointerEvents="none" style={{position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 9}}>
                        <Text style={{fontSize: 10, fontWeight: '700', letterSpacing: 2.6, color: 'rgba(255,255,255,0.7)'}}>{l.roleEn}</Text>
                        <Text style={{fontSize: 30, fontWeight: '600', letterSpacing: -0.6, color: colors.white}}>{dispName(l)}</Text>
                        <View style={{flexDirection: 'row', gap: 6}}>
                          <View style={st.heroPillSolid}><Text style={{fontSize: 11.5, fontWeight: '700', color: colors.ink}}>{dispMatch(l)} 매치</Text></View>
                          <View style={st.heroPillGhost}><Text style={st.heroPillGhostTxt}>난이도 {l.diff}</Text></View>
                          <View style={st.heroPillGhost}><Text style={st.heroPillGhostTxt}>약 {l.time}</Text></View>
                        </View>
                      </View>
                    </>
                  )}
                  {veiled && (
                    <View style={StyleSheet.absoluteFill}>
                      <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
                      <View style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(20,32,64,0.4)', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24}]}>
                        <View style={{width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', alignItems: 'center', justifyContent: 'center'}}>
                          <Text style={{fontSize: 25, fontWeight: '700', color: colors.white}}>?</Text>
                        </View>
                        <Text style={{fontSize: 16, fontWeight: '700', color: colors.white}}>예상 밖의 발견이 숨어 있어요</Text>
                        <Text style={{fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.82)'}}>봄웜에게 의외로 어울리는 컬러</Text>
                        <Pressable onPress={reveal} style={{marginTop: 8, backgroundColor: colors.white, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.pill}}>
                          <Text style={{fontSize: 13.5, fontWeight: '700', color: colors.ink}}>탭해서 공개하기</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </Animated.View>
          <View style={[st.heroBadge, {right: 14}]}><Text style={{fontSize: 10.5, fontWeight: '600', letterSpacing: 1.7, color: colors.white}}>0{look + 1} — {totalLabel}</Text></View>
          <View style={[st.heroBadge, {left: 14, backgroundColor: 'rgba(245,249,255,0.9)'}]}><Text style={{fontSize: 10.5, fontWeight: '700', color: colors.ink}}>오늘의 추천 룩</Text></View>
          {burst && <Burst />}
        </View>

        {/* 4. look pills */}
        <View style={{flexDirection: 'row', gap: 6, marginHorizontal: 14, marginTop: 12}}>
          {looks.map((l, i) => {
            const act = look === i;
            return (
              <Pressable key={l.id} onPress={() => goLook(i)} style={[st.lookPill, act && {backgroundColor: colors.dark}, act && shadows.darkTile]}>
                <Text style={{fontSize: 9.5, fontWeight: '600', color: act ? 'rgba(255,255,255,0.6)' : colors.sub2}}>{l.roleLabel}</Text>
                <Text style={{fontSize: 12.5, fontWeight: '700', color: act ? colors.white : colors.ink}}>{dispName(l)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{textAlign: 'center', fontSize: 11, color: colors.faint, fontWeight: '500', marginTop: 10}}>좌우로 밀어서 룩을 넘겨보세요</Text>

        {/* 5. WHY IT FITS */}
        <RiseIn index={0} reduceMotion={reduceMotion}>
          <View style={st.sectionHead}>
            <Eyebrow>WHY IT FITS</Eyebrow>
            <Text style={t.displayMd}>왜 당신에게 맞을까요</Text>
          </View>
          <GlassCard style={{marginHorizontal: 14}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={st.cardTitle}>매치 스코어</Text>
              <Text style={{fontSize: 11.5, fontWeight: '500', color: colors.sub2}}>난이도 {a.diff} · 약 {a.time}</Text>
            </View>
            <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 14, marginTop: 8}}>
              <Text style={{fontSize: 52, fontWeight: '500', letterSpacing: -1.5, color: colors.ink}}>{aMatch}%</Text>
              <Text style={{fontSize: 13, fontWeight: '500', color: colors.sub, flex: 1}}>{a.matchLine}</Text>
            </View>
            <View style={{marginTop: 14}}>
              <DashedBar pct={veiledActive ? 0 : a.match} width={heroW - 40} height={26} reduceMotion={reduceMotion} />
            </View>
            {traitChips.length > 0 && (
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 14}}>
                {traitChips.map((c) => (
                  <View key={c} style={st.traitChip}><Text style={{fontSize: 10.5, fontWeight: '600', color: colors.sub}}>{c}</Text></View>
                ))}
              </View>
            )}
          </GlassCard>
          <GlassCard style={{marginHorizontal: 14, marginTop: 10}}>
            <Text style={st.cardTitle}>이 룩을 추천한 이유</Text>
            <View style={{gap: 14, marginTop: 14}}>
              {a.reasons.map((r, j) => (
                <View key={j} style={{flexDirection: 'row', gap: 12}}>
                  <View style={st.numTile}><Text style={st.numTileTxt}>{j + 1}</Text></View>
                  <Text style={[t.body, {flex: 1}]}>{r}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
          <GlassCard style={{marginHorizontal: 14, marginTop: 10, padding: 0}}>
            <View style={{paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline'}}>
              <Text style={st.cardTitle}>비포 / 애프터</Text>
              <Text style={{fontSize: 11, fontWeight: '500', color: colors.sub2}}>핸들을 좌우로 문질러 보세요</Text>
            </View>
            <View style={{height: 330, backgroundColor: colors.heroPlaceholder}}
              onLayout={(e) => { baW.current = e.nativeEvent.layout.width; }} {...baPan.panHandlers}>
              <Image source={a.image} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{top: '20%', left: '50%'}} />
              <View style={[st.heroBadge, {top: 12, right: 12}]}><Text style={{fontSize: 10, fontWeight: '700', color: colors.white}}>AI 메이크업</Text></View>
              {/* before layer: clipped by animated width. RN has no grayscale filter — a whitish
                  overlay approximates it. Upgrade path: react-native-color-matrix-image-filters. */}
              <Animated.View style={[{position: 'absolute', top: 0, bottom: 0, left: 0, overflow: 'hidden'}, baClip]}>
                <Image source={a.image} style={{position: 'absolute', top: 0, left: 0, width: heroW, height: 330}} contentFit="cover" contentPosition={{top: '20%', left: '50%'}} />
                <View style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(235,235,235,0.55)'}]} />
                <View style={[st.heroBadge, {top: 12, left: 12, backgroundColor: 'rgba(245,249,255,0.9)'}]}><Text style={{fontSize: 10, fontWeight: '700', color: colors.ink}}>원본 · 시뮬레이션</Text></View>
              </Animated.View>
              <Animated.View style={[{position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: 'rgba(255,255,255,0.9)'}, baHandle]}>
                <View style={st.baKnob}><Text style={{fontSize: 13, fontWeight: '800', color: colors.ink}}>‹ ›</Text></View>
              </Animated.View>
            </View>
          </GlassCard>
        </RiseIn>

        {/* 6. LOOK MAP */}
        <RiseIn index={1} reduceMotion={reduceMotion}>
          <View style={st.sectionHead}>
            <Eyebrow>LOOK MAP</Eyebrow>
            <Text style={t.displayMd}>세 가지 룩, 한눈에 비교</Text>
            <Text style={t.sectionSub}>점을 탭하면 위의 추천 룩이 바뀌어요</Text>
          </View>
          <GlassCard style={{marginHorizontal: 14, padding: 14}}>
            <View style={{height: 280, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.5)', overflow: 'hidden'}}>
              <View style={{position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: 'rgba(16,24,40,0.12)'}} />
              <View style={{position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: 'rgba(16,24,40,0.12)'}} />
              <Text style={[st.axis, {top: 10, alignSelf: 'center'}]}>글램</Text>
              <Text style={[st.axis, {bottom: 10, alignSelf: 'center'}]}>캐주얼</Text>
              <Text style={[st.axis, {left: 10, top: '50%'}]}>자연스러움</Text>
              <Text style={[st.axis, {right: 10, top: '50%'}]}>개성</Text>
              {looks.map((l, i) => {
                const act = look === i;
                const veiled = l.id === 'discovery' && !revealed;
                const size = act ? 56 : 46;
                return (
                  <Pressable key={l.id} onPress={() => goLook(i, true)}
                    style={{position: 'absolute', left: `${l.mx}%`, top: `${100 - l.my}%`, transform: [{translateX: -size / 2}, {translateY: -size / 2 - 10}], alignItems: 'center', gap: 5}}>
                    <View style={{width: size, height: size, borderRadius: size / 2, overflow: 'hidden', borderWidth: 2.5, borderColor: act ? colors.dark : colors.white, backgroundColor: '#C7D4F2'}}>
                      <Image source={l.image} style={{width: '100%', height: '100%'}} contentFit="cover" contentPosition={{top: '15%', left: '50%'}} blurRadius={veiled ? 6 : 0} />
                    </View>
                    <View style={{backgroundColor: act ? colors.dark : 'rgba(255,255,255,0.94)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8}}>
                      <Text style={{fontSize: 10.5, fontWeight: '700', color: act ? colors.white : colors.ink}}>{dispName(l)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={{gap: 4, marginTop: 10}}>
              {looks.map((l, i) => {
                const act = look === i;
                return (
                  <Pressable key={l.id} onPress={() => goLook(i, true)} style={{flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.tile, backgroundColor: act ? 'rgba(255,255,255,0.8)' : 'transparent'}}>
                    <View style={{width: 9, height: 9, borderRadius: 5, backgroundColor: act ? colors.dark : 'rgba(16,24,40,0.3)'}} />
                    <View style={{flex: 1}}>
                      <Text style={{fontSize: 13, fontWeight: '700', color: colors.ink}}>{dispName(l)}</Text>
                      <Text style={{fontSize: 10.5, fontWeight: '500', color: colors.sub2}}>{l.roleLabel}</Text>
                    </View>
                    <View style={{alignItems: 'flex-end'}}>
                      <Text style={{fontSize: 13, fontWeight: '700', color: colors.ink}}>{dispMatch(l)}</Text>
                      <Text style={{fontSize: 10.5, fontWeight: '500', color: colors.sub2}}>난이도 {l.diff} · {l.time}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </GlassCard>
        </RiseIn>

        {/* 7. PART GUIDE */}
        <RiseIn index={2} reduceMotion={reduceMotion}>
          <View style={st.sectionHead}>
            <Eyebrow>PART GUIDE</Eyebrow>
            <Text style={t.displayMd}>부위별 메이크업 · {aName}</Text>
            <Text style={t.sectionSub}>얼굴 위 점이나 탭을 누르면 바로 옆에서 바뀌어요</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 6, paddingHorizontal: 14, paddingBottom: 12}}>
            {PART_KEYS.map(({key, label}) => {
              const act = part === key;
              return (
                <Pressable key={key} onPress={() => selectPart(key)} style={[st.partTab, act && {backgroundColor: colors.dark}, act && shadows.darkTile]}>
                  <View style={{width: 11, height: 11, borderRadius: 6, backgroundColor: a.parts[key].hex, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)'}} />
                  <Text style={{fontSize: 13, fontWeight: '600', color: act ? colors.white : colors.ink}}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <GlassCard style={{marginHorizontal: 14}}>
            <View style={{flexDirection: 'row', gap: 16, alignItems: 'center'}}>
              <FaceDiagram part={part} onSelect={selectPart} hex={partHex} />
              <View style={{flex: 1, gap: 11}}>
                <Text style={[t.eyebrow, {letterSpacing: 2.4, color: colors.faint}]}>{pp.en}</Text>
                <View style={{flexDirection: 'row', gap: 11, alignItems: 'center'}}>
                  <View style={{width: 46, height: 46, borderRadius: 13, backgroundColor: pp.hex, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)'}} />
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: 16, fontWeight: '700', color: colors.ink}}>{pp.colorName}</Text>
                    <Text style={t.mono}>{pp.hex.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={{borderTopWidth: 1, borderTopColor: 'rgba(16,24,40,0.1)', paddingTop: 10, gap: 2}}>
                  <Text style={{fontSize: 10, fontWeight: '700', color: colors.faint, letterSpacing: 1}}>질감</Text>
                  <Text style={{fontSize: 13.5, fontWeight: '700', color: colors.ink}}>{pp.texture}</Text>
                  <Text style={{fontSize: 11.5, fontWeight: '500', color: colors.sub2, lineHeight: 17}}>{pp.textureNote}</Text>
                </View>
              </View>
            </View>
            <View style={{height: 1, backgroundColor: 'rgba(16,24,40,0.1)', marginVertical: 18}} />
            <Text style={st.cardTitle}>순서 따라가기</Text>
            <View style={{gap: 10, marginTop: 10}}>
              {pp.steps.map((s, j) => (
                <View key={j} style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
                  <View style={st.numTile}><Text style={st.numTileTxt}>{j + 1}</Text></View>
                  <Text style={[t.body, {flex: 1}]}>{s}</Text>
                </View>
              ))}
            </View>
            {pp.finish ? (
              <View style={{backgroundColor: colors.glassInner, borderRadius: radius.tile, padding: 14, marginTop: 18, gap: 4}}>
                <Text style={{fontSize: 10, fontWeight: '700', color: colors.faint, letterSpacing: 1}}>마무리 코멘트</Text>
                <Text style={{fontSize: 13, fontWeight: '500', color: colors.ink3, lineHeight: 21}}>{pp.finish}</Text>
              </View>
            ) : null}
            <Text style={[st.cardTitle, {marginTop: 18}]}>추천 제품</Text>
            <View style={{flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 10}}>
              <View style={{width: 48, height: 48, borderRadius: 12, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center'}}>
                <Text style={{fontSize: 16, fontWeight: '700', color: colors.white}}>{pp.prod.ini}</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={{fontSize: 11, fontWeight: '600', color: colors.sub2}}>{pp.prod.brand}</Text>
                <Text style={{fontSize: 14, fontWeight: '700', color: colors.ink}}>{pp.prod.name}</Text>
              </View>
              <Text style={{fontSize: 14, fontWeight: '700', color: colors.ink}}>{pp.prod.price}</Text>
            </View>
            {pp.prod.why ? (
              <Text style={{fontSize: 12, fontWeight: '500', color: colors.sub2, lineHeight: 19, borderTopWidth: 1, borderTopColor: 'rgba(16,24,40,0.1)', paddingTop: 10, marginTop: 10}}>
                <Text style={{fontWeight: '700', color: colors.faint}}>선택 기준 · </Text>{pp.prod.why}
              </Text>
            ) : null}
          </GlassCard>
        </RiseIn>

        {/* 8. SHARE CARD */}
        <RiseIn index={3} reduceMotion={reduceMotion}>
          <View style={st.sectionHead}>
            <Eyebrow>SHARE CARD</Eyebrow>
            <Text style={t.displayMd}>오늘의 결과, 카드로 남기기</Text>
          </View>
          <View style={{alignItems: 'center', gap: 14, paddingBottom: 30}}>
            <OptionalViewShot ref={shareCaptureRef} options={SHARE_CAPTURE_OPTIONS} style={[st.shareCard, shadows.hero]}>
              <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(238,244,255,0.9)'}]} />
              <View style={{alignItems: 'center', gap: 10, padding: 24}}>
                <Text style={[t.eyebrow, {color: colors.faint}]}>MY MAKEUP REPORT</Text>
                <Text style={{fontSize: 46, fontWeight: '500', letterSpacing: -1.4, color: colors.ink}}>{aMatch}%</Text>
                <Text style={{fontSize: 18, fontWeight: '700', color: colors.ink}}>{aName}</Text>
                {titleTop ? <Text style={{fontSize: 11, fontWeight: '500', color: colors.sub2}}>{titleTop}</Text> : null}
                <View style={{marginTop: 4}}><DashedBar pct={veiledActive ? 0 : a.match} width={180} height={18} reduceMotion={reduceMotion} /></View>
                <View style={{flexDirection: 'row', gap: 8, marginTop: 6}}>
                  {looks.map((l) => (
                    <View key={l.id} style={{width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: '#C7D4F2'}}>
                      <Image source={l.image} style={{width: '100%', height: '100%'}} contentFit="cover" contentPosition={{top: '15%', left: '50%'}} blurRadius={l.id === 'discovery' && !revealed ? 5 : 0} />
                    </View>
                  ))}
                </View>
                <Text style={[t.eyebrow, {color: colors.faint, marginTop: 6, letterSpacing: 2.4}]}>MAKEUP RECOMMENDATION</Text>
              </View>
            </OptionalViewShot>
            <Pressable onPress={() => { onSaveShareCard?.(); showToast('공유 카드를 이미지로 저장했어요'); }} style={[{backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.pill}, shadows.card]}>
              <Text style={{fontSize: 13, fontWeight: '700', color: colors.ink}}>이미지로 저장하기</Text>
            </Pressable>
          </View>
        </RiseIn>
      </ScrollView>

      {/* 1. sticky top bar (absolute overlay) — off when hosted under the app shell header */}
      {showTopBar && (
        <View style={[st.topBar, {paddingTop: topInset + 8}]}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(224,227,242,0.6)'}]} />
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10}}>
            <Pressable onPress={onBack} style={st.darkSq}><Text style={{color: colors.white, fontSize: 15, fontWeight: '700'}}>‹</Text></Pressable>
            <View style={{flex: 1}}>
              <Text style={[t.eyebrow, {letterSpacing: 2.8}]}>MAKEUP REPORT</Text>
              <Text style={{fontSize: 15, fontWeight: '600', color: colors.ink}}>메이크업 추천</Text>
            </View>
            <Pressable style={[st.darkSq, {backgroundColor: 'rgba(255,255,255,0.92)'}]}><Text style={{color: colors.ink, fontSize: 11, fontWeight: '700'}}>⋯</Text></Pressable>
          </View>
        </View>
      )}

      {/* 9. sticky bottom CTA bar (absolute overlay) */}
      <View style={{position: 'absolute', left: 12, right: 12, bottom: bottomInset + 14}}>
        <View style={[st.ctaBar, shadows.hero]}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, {backgroundColor: 'rgba(238,244,255,0.85)', borderRadius: 22}]} />
          <View style={{flexDirection: 'row', gap: 8, padding: 8}}>
            <Pressable onPress={() => { onSave?.(); showToast('갤러리에 저장했어요'); }} style={st.ctaSide}><Text style={st.ctaSideTxt}>저장</Text></Pressable>
            <Pressable onPress={() => { onApplyAR?.(); showToast('AR 체험을 여는 중'); }} style={st.ctaMain}><Text style={{color: colors.white, fontSize: 15, fontWeight: '600'}}>AR로 입어보기</Text></Pressable>
            <Pressable onPress={() => { onShare?.(); showToast('공유 시트를 여는 중'); }} style={st.ctaSide}><Text style={st.ctaSideTxt}>공유</Text></Pressable>
          </View>
        </View>
      </View>

      {toast !== '' && <Toast msg={toast} bottom={bottomInset + 96} />}
    </View>
  );
};

const Toast: React.FC<{msg: string; bottom: number}> = ({msg, bottom}) => {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(1, {duration: 250}); }, [p]);
  const a = useAnimatedStyle(() => ({opacity: p.value, transform: [{translateY: (1 - p.value) * 10}]}));
  return (
    <Animated.View pointerEvents="none" style={[{position: 'absolute', bottom, alignSelf: 'center', backgroundColor: 'rgba(10,16,32,0.92)', paddingHorizontal: 18, paddingVertical: 11, borderRadius: radius.pill}, a]}>
      <Text style={{color: colors.white, fontSize: 12.5, fontWeight: '600'}}>{msg}</Text>
    </Animated.View>
  );
};

const st = StyleSheet.create({
  glassWrap: {borderRadius: radius.card, overflow: Platform.OS === 'android' ? 'hidden' : 'visible', borderWidth: 1, borderColor: colors.glassBorder},
  glassFill: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.glass, borderRadius: radius.card - 1},
  glassContent: {padding: 20},
  sectionHead: {paddingHorizontal: 20, paddingTop: 40, paddingBottom: 14, gap: 6},
  cardTitle: {fontSize: 13, fontWeight: '600', color: colors.sub},
  heroBadge: {position: 'absolute', top: 14, backgroundColor: 'rgba(10,16,32,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10},
  heroPillSolid: {backgroundColor: 'rgba(245,249,255,0.9)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10},
  heroPillGhost: {borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10},
  heroPillGhostTxt: {fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.92)'},
  lookPill: {flex: 1, borderRadius: radius.tile, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 2, backgroundColor: 'rgba(238,244,255,0.85)'},
  traitChip: {backgroundColor: 'rgba(255,255,255,0.75)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.badge},
  numTile: {width: 22, height: 22, borderRadius: 7, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', marginTop: 1},
  numTileTxt: {color: colors.white, fontSize: 11, fontWeight: '700'},
  baKnob: {position: 'absolute', top: '50%', left: -22, marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(245,249,255,0.95)', alignItems: 'center', justifyContent: 'center'},
  axis: {position: 'absolute', fontSize: 9.5, fontWeight: '700', color: colors.faint, letterSpacing: 1.7},
  partTab: {flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 15, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: 'rgba(238,244,255,0.85)'},
  shareCard: {width: 272, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder},
  topBar: {position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden'},
  darkSq: {width: 38, height: 38, borderRadius: 12, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center'},
  ctaBar: {borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder},
  ctaSide: {width: 52, height: 52, borderRadius: radius.tile, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center'},
  ctaSideTxt: {fontSize: 12, fontWeight: '700', color: colors.ink},
  ctaMain: {flex: 1, height: 52, borderRadius: radius.tile, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center'},
});

export default RecommendationResultsScreen;
