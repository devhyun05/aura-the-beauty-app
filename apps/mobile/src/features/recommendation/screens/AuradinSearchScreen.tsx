// apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx
//
// Auradin — a clickless, calm "LLM for color cosmetics".
//
// One screen, four phases that flow into each other:
//   home      → big AURADIN wordmark + a single prompt + 3 auto-submitting chips
//   searching → the prompt dissolves; a sensual gloss-color orb takes over while
//               the AI "reads the color" (breathing orb + loader + thinking steps)
//   question  → one tappable color question (no confirm button — tap = advance)
//   results   → revealed candidates, reflecting the chosen color
//
// Tap the wordmark or "처음부터 다시" to restart. No new libraries — the orb is
// react-native-svg (already a dependency) + the Animated API.

import {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  type ImageSourcePropType,
} from 'react-native';
import Svg, {Circle, Defs, RadialGradient, Stop} from 'react-native-svg';
import {ArrowUp, Camera} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getAuradinDraftData} from '../services/auradinService';
import type {
  AuradinCandidateProduct,
  AuradinDraftData,
  AuradinQuestionOption,
} from '../types';

const AURA = '#C26572';

const heroImage =
  require('../../../assets/images/looks/look-cool-rose.png') as ImageSourcePropType;

type Phase = 'home' | 'searching' | 'question' | 'results';

const SUGGESTIONS = [
  {label: '쿨톤 글로시 립', query: '쿨톤 글로시 립, 2만원 이하'},
  {label: 'AR 립이랑 비슷하게', query: 'AR에서 저장한 립이랑 비슷한 색'},
  {label: '면접용 블러셔', query: '면접용 자연스러운 블러셔'},
];

const OPTION_LABEL: Record<string, string> = {
  'clear-pink': '맑은 핑크',
  'calm-rose': '차분한 로즈',
  either: '둘 다 좋아요',
};

const DEFAULT_QUERY = '쿨톤 글로시 립, 2만원 이하';
const SEARCH_MS = 2300;
const PICK_MS = 1700;

export function AuradinSearchScreen() {
  const [data, setData] = useState<AuradinDraftData | null>(null);
  const [phase, setPhase] = useState<Phase>('home');
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [choice, setChoice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    getAuradinDraftData().then((d) => mounted && setData(d));
    return () => {
      mounted = false;
      clearTimeout(timer.current);
    };
  }, []);

  const goSearch = (q: string) => {
    clearTimeout(timer.current);
    setQuery(q);
    setPhase('searching');
    timer.current = setTimeout(() => setPhase('question'), SEARCH_MS);
  };

  const submit = (q?: string) => goSearch(q?.trim() ? q.trim() : query.trim() || DEFAULT_QUERY);

  const pick = (optionId: string) => {
    clearTimeout(timer.current);
    setChoice(optionId);
    setPhase('searching');
    timer.current = setTimeout(() => setPhase('results'), PICK_MS);
  };

  const reset = () => {
    clearTimeout(timer.current);
    setChoice(null);
    setPhase('home');
  };

  const isSearch = phase === 'searching';
  const searchLabel = choice ? '딱 맞는 컬러를 고르는 중' : '아우라딘이 색을 읽는 중';

  if (!data) {
    return (
      <View style={styles.loadingState}>
        <Text style={styles.mutedText}>아우라딘을 불러오는 중이에요.</Text>
      </View>
    );
  }

  return (
    <YStack style={styles.shell}>
      <Pressable accessibilityLabel="처음으로" onPress={reset} style={styles.head}>
        <Text style={[styles.wordmark, phase !== 'home' && styles.wordmarkSmall]}>AURADIN</Text>
        {phase === 'home' ? <Text style={styles.tagline}>색으로 찾는 메이크업</Text> : null}
      </Pressable>

      <View style={styles.stage}>
        {phase === 'home' ? (
          <HomeView
            onPickSuggestion={(q) => submit(q)}
            onSubmit={() => submit()}
            query={query}
            setQuery={setQuery}
          />
        ) : null}

        {isSearch ? <SearchingView label={searchLabel} query={query} /> : null}

        {phase === 'question' ? (
          <QuestionView options={data.question.options} title={data.question.title} onPick={pick} />
        ) : null}

        {phase === 'results' ? (
          <ResultsView
            candidates={data.candidates}
            subtitle={`${(choice && OPTION_LABEL[choice].replace(' 좋아요', '')) || '차분한 로즈'} · 2만원 이하`}
            onReset={reset}
          />
        ) : null}
      </View>
    </YStack>
  );
}

/* ----------------------------------------------------------------- HOME */

function HomeView({
  onPickSuggestion,
  onSubmit,
  query,
  setQuery,
}: {
  onPickSuggestion: (q: string) => void;
  onSubmit: () => void;
  query: string;
  setQuery: (v: string) => void;
}) {
  const enter = useFadeIn();
  const bloom = useRef(new Animated.Value(0)).current;
  const idle = useBreathe();

  const setFocused = (on: boolean) =>
    Animated.timing(bloom, {duration: on ? 320 : 420, toValue: on ? 1 : 0, useNativeDriver: true}).start();

  const auraOpacity = Animated.add(
    idle.interpolate({inputRange: [0, 1], outputRange: [0.4, 0.6]}),
    bloom.interpolate({inputRange: [0, 1], outputRange: [0, 0.34]}),
  );
  const auraScale = Animated.add(
    idle.interpolate({inputRange: [0, 1], outputRange: [1, 1.08]}),
    bloom.interpolate({inputRange: [0, 1], outputRange: [0, 0.16]}),
  );

  return (
    <Animated.View style={[styles.layer, styles.homeLayer, enter]}>
      <View style={styles.hero}>
        <Image resizeMode="cover" source={heroImage} style={styles.heroImage} />
        <Animated.View
          pointerEvents="none"
          style={[styles.heroAura, {opacity: auraOpacity, transform: [{scale: auraScale}]}]}
        />
        <View pointerEvents="none" style={styles.heroScrim} />
        <XStack style={styles.shadePill}>
          <XStack style={styles.shadeDots}>
            {['#C95E68', '#D87A82', '#EDB1B5'].map((c, i) => (
              <View key={c} style={[styles.shadeDot, {backgroundColor: c, marginLeft: i ? -5 : 0}]} />
            ))}
          </XStack>
          <Text style={styles.shadeText}>쿨 로즈 글로우</Text>
        </XStack>
      </View>

      <YStack style={styles.composer}>
        <TextInput
          multiline
          onBlur={() => setFocused(false)}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          placeholder="원하는 색·질감·예산을 말해보세요"
          placeholderTextColor={colors.textTertiary}
          style={styles.composerInput}
          value={query}
        />
        <XStack style={styles.composerBar}>
          <Pressable accessibilityLabel="사진으로 찾기" onPress={onSubmit} style={styles.tool}>
            <Camera color={colors.textPrimary} size={19} strokeWidth={2} />
          </Pressable>
          <Pressable accessibilityLabel="검색" onPress={onSubmit} style={styles.send}>
            <ArrowUp color={colors.white} size={20} strokeWidth={2.3} />
          </Pressable>
        </XStack>
      </YStack>

      <XStack style={styles.sugs}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s.label} onPress={() => onPickSuggestion(s.query)} style={styles.sug}>
            <Text style={styles.sugText}>{s.label}</Text>
          </Pressable>
        ))}
      </XStack>
    </Animated.View>
  );
}

/* ------------------------------------------------------------- SEARCHING */

function SearchingView({label, query}: {label: string; query: string}) {
  const enter = useFadeIn();

  return (
    <Animated.View style={[styles.layer, styles.centerLayer, enter]}>
      <View style={styles.echo}>
        <Text style={styles.echoText}>{query}</Text>
      </View>

      <GlossOrb />

      <XStack style={styles.loader}>
        <Text style={styles.loaderText}>{label}</Text>
        <LoaderDots />
      </XStack>

      <YStack style={styles.tsteps}>
        <ThinkingStep label="색감과 조건 정리" status="done" />
        <ThinkingStep label="어울리는 후보 좁히는 중" status="active" />
        <ThinkingStep label="구매 링크 확인" status="pending" />
      </YStack>
    </Animated.View>
  );
}

function GlossOrb({size = 222}: {size?: number}) {
  const breathe = useBreathe(4400);
  const glow = useBreathe(4400);

  const scale = breathe.interpolate({inputRange: [0, 1], outputRange: [1, 1.05]});
  const glowOpacity = glow.interpolate({inputRange: [0, 1], outputRange: [0.45, 0.9]});
  const glowScale = glow.interpolate({inputRange: [0, 1], outputRange: [1, 1.12]});

  return (
    <View style={{alignItems: 'center', height: size, justifyContent: 'center', width: size}}>
      <Animated.View
        pointerEvents="none"
        style={[styles.orbGlow, {opacity: glowOpacity, transform: [{scale: glowScale}]}]}
      />
      <Animated.View style={{transform: [{scale}]}}>
        <Svg height={size} width={size}>
          <Defs>
            <RadialGradient id="ball" cx="38%" cy="32%" r="78%">
              <Stop offset="0" stopColor="#F6C9CE" />
              <Stop offset="0.55" stopColor="#C26572" />
              <Stop offset="1" stopColor="#9E4753" />
            </RadialGradient>
            <RadialGradient id="sheen" cx="33%" cy="26%" r="42%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.92" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} fill="url(#ball)" r={size * 0.42} />
          <Circle cx={size / 2} cy={size / 2} fill="url(#sheen)" r={size * 0.42} />
        </Svg>
      </Animated.View>
    </View>
  );
}

function LoaderDots() {
  const dotsRef = useRef<Animated.Value[] | null>(null);
  if (!dotsRef.current) {
    dotsRef.current = [
      new Animated.Value(0),
      new Animated.Value(0),
      new Animated.Value(0),
    ];
  }
  const dots = dotsRef.current;

  useEffect(() => {
    const loops = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 200),
          Animated.timing(v, {duration: 480, toValue: 1, useNativeDriver: true}),
          Animated.timing(v, {duration: 480, toValue: 0, useNativeDriver: true}),
          Animated.delay((2 - i) * 200),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);

  return (
    <XStack style={styles.dots}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, {opacity: v.interpolate({inputRange: [0, 1], outputRange: [0.2, 1]})}]}
        />
      ))}
    </XStack>
  );
}

function ThinkingStep({label, status}: {label: string; status: 'done' | 'active' | 'pending'}) {
  const breathe = useBreathe(1400);
  const dotStyle =
    status === 'done' ? styles.tdotDone : status === 'active' ? styles.tdotActive : undefined;
  return (
    <XStack style={styles.tstep}>
      {status === 'active' ? (
        <Animated.View
          style={[styles.tdot, dotStyle, {transform: [{scale: breathe.interpolate({inputRange: [0, 1], outputRange: [1, 1.5]})}]}]}
        />
      ) : (
        <View style={[styles.tdot, dotStyle]} />
      )}
      <Text style={[styles.tstepLabel, status === 'done' && styles.tstepDone, status === 'active' && styles.tstepActive]}>
        {label}
      </Text>
    </XStack>
  );
}

/* -------------------------------------------------------------- QUESTION */

function QuestionView({
  options,
  title,
  onPick,
}: {
  options: AuradinQuestionOption[];
  title: string;
  onPick: (id: string) => void;
}) {
  const enter = useFadeIn();
  const tiles = options.filter((o) => o.swatch);
  const skip = options.find((o) => !o.swatch);

  return (
    <Animated.View style={[styles.layer, styles.centerLayer, enter]}>
      <GlossOrb size={134} />
      <Text style={styles.qEyebrow}>거의 다 왔어요</Text>
      <Text style={styles.qTitle}>{title}</Text>
      <XStack style={styles.qTiles}>
        {tiles.map((o) => (
          <Pressable
            key={o.id}
            accessibilityLabel={`${o.label} 선택`}
            onPress={() => onPick(o.id)}
            style={({pressed}) => [styles.tile, {backgroundColor: o.swatch}, pressed && styles.tilePressed]}>
            <View pointerEvents="none" style={styles.tileScrim} />
            <Text style={styles.tileLabel}>{o.label}</Text>
          </Pressable>
        ))}
      </XStack>
      {skip ? (
        <Pressable onPress={() => onPick(skip.id)} style={styles.qSkip}>
          <Text style={styles.qSkipText}>{skip.label}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/* --------------------------------------------------------------- RESULTS */

function ResultsView({
  candidates,
  subtitle,
  onReset,
}: {
  candidates: AuradinCandidateProduct[];
  subtitle: string;
  onReset: () => void;
}) {
  const enter = useFadeIn(16);
  const [top, ...alts] = candidates;

  return (
    <Animated.View style={[styles.layer, styles.resultsLayer, enter]}>
      <YStack style={styles.rHead}>
        <Text style={styles.rEyebrow}>AURADIN PICKS</Text>
        <Text style={styles.rTitle}>이 컬러, 어때요?</Text>
        <Text style={styles.rSub}>{subtitle}</Text>
      </YStack>

      {top ? (
        <Pressable style={styles.rTop}>
          <Image resizeMode="cover" source={top.imageSource} style={styles.rTopImage} />
          <YStack style={styles.rTopBody}>
            <Text style={styles.rBrand}>{top.brandName}</Text>
            <Text style={styles.rName}>
              {top.productName} · {top.shadeName}
            </Text>
            <Text style={styles.rMeta}>{top.priceText}</Text>
            <XStack style={styles.rWhy}>
              <View style={[styles.rWhyDot, {backgroundColor: top.palette[0] ?? AURA}]} />
              <Text style={styles.rWhyText}>{top.matchSummary}</Text>
            </XStack>
          </YStack>
        </Pressable>
      ) : null}

      <Text style={styles.rAltLabel}>비슷한 후보</Text>
      {alts.map((c) => (
        <Pressable key={c.id} style={styles.rAlt}>
          <Image resizeMode="cover" source={c.imageSource} style={styles.rAltImage} />
          <YStack style={styles.rAltInfo}>
            <Text style={styles.rAltBrand}>{c.brandName}</Text>
            <Text numberOfLines={1} style={styles.rAltName}>
              {c.productName} · {c.shadeName}
            </Text>
            <Text numberOfLines={1} style={styles.rAltMeta}>
              {c.priceText} · {c.matchSummary}
            </Text>
          </YStack>
        </Pressable>
      ))}

      <Pressable onPress={onReset} style={styles.rReset}>
        <Text style={styles.rResetText}>처음부터 다시</Text>
      </Pressable>
    </Animated.View>
  );
}

/* --------------------------------------------------------------- HOOKS */

// A gentle 0→1→0 breathing loop.
function useBreathe(duration = 2600) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, {duration, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true}),
        Animated.timing(v, {duration, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, v]);
  return v;
}

// Fade + lift a phase view in on mount.
function useFadeIn(translate = 12) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {duration: 480, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true}).start();
  }, [v]);
  return {
    opacity: v,
    transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [translate, 0]})}],
  };
}

/* --------------------------------------------------------------- STYLES */

const softShadow = {
  shadowColor: shadows.soft.shadowColor,
  shadowOffset: {width: 0, height: 8},
  shadowOpacity: 0.08,
  shadowRadius: 18,
} as const;

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    paddingBottom: 88,
  },
  loadingState: {alignItems: 'center', justifyContent: 'center', minHeight: 420},
  mutedText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },

  // Header / wordmark
  head: {paddingTop: spacing.xs},
  wordmark: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.brand,
    fontSize: 44,
    letterSpacing: 5,
    lineHeight: 48,
  },
  wordmarkSmall: {fontSize: 26, letterSpacing: 3, lineHeight: 30},
  tagline: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 12.5,
    marginTop: 6,
  },

  stage: {flex: 1, marginTop: spacing.md, position: 'relative'},
  layer: {flex: 1},
  homeLayer: {gap: spacing.lg},
  centerLayer: {alignItems: 'center', justifyContent: 'center'},
  resultsLayer: {gap: 0},

  // Hero
  hero: {
    aspectRatio: 1.06,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 24,
    overflow: 'hidden',
    ...softShadow,
  },
  heroImage: {height: '100%', width: '100%'},
  heroAura: {
    backgroundColor: AURA,
    borderRadius: radius.pill,
    bottom: '20%',
    left: '18%',
    position: 'absolute',
    right: '18%',
    top: '34%',
  },
  heroScrim: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  shadePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    position: 'absolute',
  },
  shadeDots: {flexDirection: 'row'},
  shadeDot: {borderColor: colors.white, borderRadius: radius.pill, borderWidth: 1.6, height: 16, width: 16},
  shadeText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: 12.5},

  // Composer
  composer: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 22,
    borderWidth: 1.5,
    gap: spacing.sm,
    padding: spacing.md,
    ...softShadow,
  },
  composerInput: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: 23,
    minHeight: 46,
    padding: 0,
    textAlignVertical: 'top',
  },
  composerBar: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  tool: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  send: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sugs: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  sug: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  sugText: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: 13.5},

  // Searching
  echo: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginBottom: 28,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  echoText: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: 13},
  orbGlow: {
    backgroundColor: AURA,
    borderRadius: radius.pill,
    height: 250,
    position: 'absolute',
    width: 250,
  },
  loader: {alignItems: 'center', flexDirection: 'row', marginTop: 32},
  loaderText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: 16.5},
  dots: {alignItems: 'center', flexDirection: 'row', gap: 4, marginLeft: 7},
  dot: {backgroundColor: AURA, borderRadius: radius.pill, height: 5, width: 5},
  tsteps: {gap: 14, marginTop: 28, maxWidth: 268, width: '100%'},
  tstep: {alignItems: 'center', flexDirection: 'row', gap: 11},
  tdot: {backgroundColor: colors.borderStrong, borderRadius: radius.pill, height: 8, width: 8},
  tdotDone: {backgroundColor: colors.textPrimary},
  tdotActive: {backgroundColor: AURA},
  tstepLabel: {color: colors.textTertiary, fontFamily: typography.fontFamily.semibold, fontSize: 13.5},
  tstepDone: {color: colors.textSecondary},
  tstepActive: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold},

  // Question
  qEyebrow: {color: AURA, fontFamily: typography.fontFamily.bold, fontSize: 12.5, marginTop: 26},
  qTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 23,
    letterSpacing: -0.3,
    lineHeight: 32,
    marginTop: 10,
    textAlign: 'center',
  },
  qTiles: {flexDirection: 'row', gap: spacing.md, marginTop: 30, width: '100%'},
  tile: {
    borderRadius: 24,
    flex: 1,
    height: 160,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    padding: spacing.lg,
  },
  tilePressed: {opacity: 0.92, transform: [{scale: 0.97}]},
  tileScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    bottom: 0,
    height: '46%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  tileLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.22)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 8,
  },
  qSkip: {marginTop: 20},
  qSkipText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 14,
    textDecorationLine: 'underline',
  },

  // Results
  rHead: {gap: 3},
  rEyebrow: {color: AURA, fontFamily: typography.fontFamily.brand, fontSize: 13, letterSpacing: 2.5},
  rTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: 26, letterSpacing: -0.4},
  rSub: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: 14, marginTop: 4},
  rTop: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    overflow: 'hidden',
    ...softShadow,
  },
  rTopImage: {backgroundColor: colors.surfaceMuted, height: 174, width: '100%'},
  rTopBody: {gap: 3, padding: spacing.md},
  rBrand: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: 12, letterSpacing: 0.3},
  rName: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: 18, marginTop: 3},
  rMeta: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: 13.5, marginTop: 3},
  rWhy: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  rWhyDot: {borderRadius: radius.pill, height: 9, marginTop: 4, width: 9},
  rWhyText: {color: colors.textSecondary, flex: 1, fontFamily: typography.fontFamily.medium, fontSize: 13, lineHeight: 18},
  rAltLabel: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: 13, marginBottom: 11, marginTop: 20},
  rAlt: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: 9,
    padding: 11,
  },
  rAltImage: {backgroundColor: colors.surfaceMuted, borderRadius: 12, height: 54, width: 54},
  rAltInfo: {flex: 1, minWidth: 0},
  rAltBrand: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: 11.5},
  rAltName: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: 14.5, marginTop: 1},
  rAltMeta: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: 12.5, marginTop: 1},
  rReset: {alignSelf: 'center', marginTop: spacing.md},
  rResetText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});
