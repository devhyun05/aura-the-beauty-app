// apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx
//
// AURADIN — 능력 공개 홈(entry) → searching(다크 몰입) → question → results(라이트 리빌)
//         → detail(뱃지 + reasonCopy + 3칸 근거) → saved / failed.
//
// 디자인 출처: "# AURADIN 첫 진입 화면 디자인/DESIGN.md"(§0–9) + prompts/1–6 (DESIGN.md governs).
// RN 근사: glass = expo-blur, orb = 기존 SVG(GlossOrb) 재채색 + 단일 인스턴스 지속(§9 ③),
// 팔레트는 features/recommendation 로컬 토큰만 사용 (가드: test:auradin-theme-scope).

import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, {Circle, Defs, RadialGradient, Stop} from 'react-native-svg';

import {typography} from '../../../shared/theme';
import {
  AuradinGround,
  Badge,
  Chip,
  CTAButton,
  GlassCard,
  HeartButton,
  PaletteSwatches,
  ProductThumb,
  StatusDot,
  Toast,
  Wordmark,
} from '../components/ds';
import {
  answerAuradinQuestion,
  createAuradinSearchSession,
  pollAuradinSearchTurn,
  refineAuradinSearch,
} from '../services/auradinSearchService';
import {auColors, auMotion, auRadius, auType} from '../theme/auradinTokens';
import type {
  AuradinCandidateProduct,
  AuradinQuestionOption,
  AuradinSearchTurn,
} from '../types';

type Phase = 'home' | 'searching' | 'question' | 'results' | 'detail' | 'saved' | 'failed';

const SUGGESTIONS = [
  {highlighted: true, label: '쿨톤 글로시 립', query: '쿨톤 글로시 립, 2만원 이하'},
  {label: '면접용 블러셔', query: '면접용 자연스러운 블러셔'},
  {label: '올리브영에서만', query: '올리브영에서 살 수 있는 데일리 립'},
];

const DEFAULT_QUERY = '쿨톤 글로시 립, 2만원 이하';
const SEARCH_MS = 2300;
const PICK_MS = 1700;
const EASE_LIQUID = Easing.bezier(0.22, 1.2, 0.36, 1);

// §9 ③ 오브 지속 — 화면(phase)마다 위치·크기·밝기만 바뀐다 (재생성 금지).
const ORB_BY_PHASE: Record<Phase, {y: number; scale: number; glow: number}> = {
  home: {glow: 0, scale: 1, y: 290},
  searching: {glow: 1, scale: 1.16, y: 205},
  question: {glow: 0, scale: 0.6, y: 40},
  results: {glow: 0, scale: 0.34, y: -6},
  detail: {glow: 0, scale: 0.32, y: -10},
  saved: {glow: 0, scale: 0.36, y: -6},
  failed: {glow: 0.25, scale: 0.6, y: 150},
};

export type AuradinDriveParams = {
  prompt?: string; // 딥링크 검색 자동 시작 (예: 리포트 화면 → aiarmakeup://auradin-search?prompt=…)
  open?: string; // QA·데모: results에서 role(anchor|diverse|discovery) 카드 상세 열기
  dial?: string; // QA·데모: refine 다이얼 (more_similar|more_diverse)
  ts?: string; // 같은 명령 반복용 nonce
};

export function AuradinSearchScreen({drive}: {drive?: AuradinDriveParams} = {}) {
  const [phase, setPhase] = useState<Phase>('home');
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [turn, setTurn] = useState<AuradinSearchTurn | null>(null);
  const [answering, setAnswering] = useState(false);
  const [refining, setRefining] = useState(false);
  const [selected, setSelected] = useState<AuradinCandidateProduct | null>(null);
  const [saved, setSaved] = useState<AuradinCandidateProduct[]>([]);
  const [toastOn, setToastOn] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const darkOpacity = useRef(new Animated.Value(0)).current;
  const orbY = useRef(new Animated.Value(ORB_BY_PHASE.home.y)).current;
  const orbScale = useRef(new Animated.Value(ORB_BY_PHASE.home.scale)).current;
  const orbGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      clearTimeout(timer.current);
      clearTimeout(toastTimer.current);
    };
  }, []);

  // 다크 몰입(searching)과 오브 모프 — 하드 컷 금지, 항상 리퀴드 트랜지션 (§0/§9)
  useEffect(() => {
    const target = ORB_BY_PHASE[phase];
    Animated.parallel([
      Animated.timing(darkOpacity, {
        duration: auMotion.veilMs,
        easing: EASE_LIQUID,
        toValue: phase === 'searching' ? 1 : 0,
        useNativeDriver: true,
      }),
      Animated.timing(orbY, {duration: auMotion.veilMs, easing: EASE_LIQUID, toValue: target.y, useNativeDriver: true}),
      Animated.timing(orbScale, {duration: auMotion.veilMs, easing: EASE_LIQUID, toValue: target.scale, useNativeDriver: true}),
      Animated.timing(orbGlow, {duration: auMotion.veilMs, easing: EASE_LIQUID, toValue: target.glow, useNativeDriver: true}),
    ]).start();
  }, [darkOpacity, orbGlow, orbScale, orbY, phase]);

  const runWithSearching = async (minMs: number, work: () => Promise<AuradinSearchTurn>) => {
    setPhase('searching');
    const startedAt = Date.now();
    try {
      const nextTurn = await work();
      const remaining = minMs - (Date.now() - startedAt);
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          timer.current = setTimeout(resolve, remaining);
        });
      }
      if (cancelled.current) {
        return;
      }
      setTurn(nextTurn);
      setPhase(
        nextTurn.phase === 'results' ? 'results' : nextTurn.phase === 'question' ? 'question' : 'failed',
      );
    } catch {
      if (cancelled.current) {
        return;
      }
      setTurn({
        sessionId: sessionIdRef.current ?? '',
        phase: 'failed',
        thinking: [],
        candidates: [],
        error: {message: '검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.'},
      });
      setPhase('failed');
    }
  };

  const submit = (raw?: string) => {
    const prompt = (raw?.trim() ? raw.trim() : query.trim() || DEFAULT_QUERY).trim();
    setQuery(prompt);
    setAnswering(false);
    setSelected(null);
    void runWithSearching(SEARCH_MS, async () => {
      const created = await createAuradinSearchSession({prompt});
      sessionIdRef.current = created.sessionId;
      return pollAuradinSearchTurn(created.sessionId);
    });
  };

  const pick = (optionId: string) => {
    const sessionId = sessionIdRef.current;
    const questionId = turn?.question?.id;
    if (!sessionId || !questionId) {
      return;
    }
    setAnswering(true);
    void runWithSearching(PICK_MS, async () => {
      await answerAuradinQuestion(sessionId, questionId, optionId);
      return pollAuradinSearchTurn(sessionId);
    });
  };

  // §7 최소 refine 다이얼 — 다크 몰입 없이 results 위에서 조용히 재정렬 (재검색 아님)
  const refine = (dial: 'more_similar' | 'more_diverse') => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || refining) {
      return;
    }
    setRefining(true);
    void (async () => {
      try {
        await refineAuradinSearch(sessionId, {dial});
        const nextTurn = await pollAuradinSearchTurn(sessionId);
        if (!cancelled.current && nextTurn.phase === 'results') {
          setTurn(nextTurn);
        }
      } catch {
        // refine 실패는 조용히 — 기존 결과 유지 (§7 recovery는 백엔드가 담당)
      } finally {
        if (!cancelled.current) {
          setRefining(false);
        }
      }
    })();
  };

  const openDetail = (product: AuradinCandidateProduct) => {
    setSelected(product);
    setPhase('detail');
  };

  const toggleSave = (product: AuradinCandidateProduct) => {
    setSaved((current) => {
      const exists = current.some((item) => item.id === product.id);
      if (exists) {
        return current.filter((item) => item.id !== product.id);
      }
      setToastOn(true);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToastOn(false), auMotion.toastMs);
      return [...current, product];
    });
  };

  const reset = () => {
    clearTimeout(timer.current);
    sessionIdRef.current = null;
    setTurn(null);
    setAnswering(false);
    setRefining(false);
    setSelected(null);
    setPhase('home');
  };

  const isDark = phase === 'searching';
  const question = turn?.question;
  const candidates = turn?.candidates ?? [];
  const savedIds = useMemo(() => new Set(saved.map((item) => item.id)), [saved]);

  // 딥링크·QA 드라이브: prompt=검색 자동 시작, open=상세 열기, dial=refine.
  // 탭과 동일한 핸들러(submit/openDetail/refine)를 그대로 태운다.
  const driveKey = JSON.stringify(drive ?? {});
  const handledDriveRef = useRef('');
  useEffect(() => {
    if (!drive || handledDriveRef.current === driveKey) {
      return;
    }
    if (drive.prompt?.trim()) {
      handledDriveRef.current = driveKey;
      submit(drive.prompt);
      return;
    }
    if (drive.open && turn?.phase === 'results') {
      const target = candidates.find((candidate) => candidate.role === drive.open) ?? candidates[0];
      if (target) {
        handledDriveRef.current = driveKey;
        openDetail(target);
      }
      return;
    }
    if (drive.dial === 'more_similar' || drive.dial === 'more_diverse') {
      if (turn?.phase === 'results') {
        handledDriveRef.current = driveKey;
        if (phase !== 'results') {
          setPhase('results');
        }
        refine(drive.dial);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveKey, phase, turn]);

  return (
    <View style={styles.shell}>
      <AuradinGround darkOpacity={darkOpacity} />

      {/* 오브 — 단일 인스턴스 지속, phase는 위치·크기·글로만 바꾼다 */}
      <Animated.View
        pointerEvents="none"
        style={[styles.orbLayer, {transform: [{translateY: orbY}, {scale: orbScale}]}]}>
        <GlossOrb glow={orbGlow} />
      </Animated.View>

      <View style={styles.content}>
        {phase === 'home' ? (
          <HomeView
            onOpenSaved={saved.length ? () => setPhase('saved') : undefined}
            onPickSuggestion={(q) => submit(q)}
            onSubmit={() => submit()}
            query={query}
            savedCount={saved.length}
            setQuery={setQuery}
          />
        ) : null}

        {isDark ? (
          <SearchingView answering={answering} onHome={reset} query={query} />
        ) : null}

        {phase === 'question' && question ? (
          <QuestionView
            onFreeText={(text) => submit(`${query} ${text}`)}
            onHome={reset}
            onPick={pick}
            options={question.options}
            title={question.title}
          />
        ) : null}

        {phase === 'results' ? (
          <ResultsView
            candidates={candidates}
            onHome={reset}
            onOpen={openDetail}
            onOpenSaved={() => setPhase('saved')}
            onRefine={refine}
            refining={refining}
            savedCount={saved.length}
            subtitle={turn?.headerLabel ?? '조건에 가까운 제품'}
          />
        ) : null}

        {phase === 'detail' && selected ? (
          <DetailView
            liked={savedIds.has(selected.id)}
            onBack={() => setPhase('results')}
            onHome={reset}
            onToggleSave={() => toggleSave(selected)}
            product={selected}
          />
        ) : null}

        {phase === 'saved' ? (
          <SavedView
            onBack={() => setPhase(turn?.phase === 'results' ? 'results' : 'home')}
            onHome={reset}
            onOpen={openDetail}
            products={saved}
          />
        ) : null}

        {phase === 'failed' ? (
          <ErrorView message={turn?.error?.message} onHome={reset} />
        ) : null}
      </View>

      <Toast label="보관함에 담김" visible={toastOn} />
    </View>
  );
}

/* --------------------------------------------------------------------- ORB */

function GlossOrb({glow, size = 208}: {glow: Animated.Value; size?: number}) {
  const breathe = useBreathe(4400);
  const scale = breathe.interpolate({inputRange: [0, 1], outputRange: [1, 1.05]});
  const glowOpacity = Animated.multiply(
    glow,
    breathe.interpolate({inputRange: [0, 1], outputRange: [0.5, 0.95]}),
  );

  return (
    <View style={{alignItems: 'center', height: size, justifyContent: 'center', width: size}}>
      <Animated.View pointerEvents="none" style={[styles.orbGlow, {opacity: glowOpacity}]} />
      <Animated.View style={{transform: [{scale}]}}>
        <Svg height={size} width={size}>
          <Defs>
            <RadialGradient cx="38%" cy="30%" id="auradinBall" r="80%">
              <Stop offset="0" stopColor={auColors.orbLavender} />
              <Stop offset="0.4" stopColor={auColors.orbPink} />
              <Stop offset="0.75" stopColor={auColors.orbCyan} />
              <Stop offset="1" stopColor={auColors.violet} />
            </RadialGradient>
            <RadialGradient cx="33%" cy="24%" id="auradinSheen" r="42%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.92" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} fill="url(#auradinBall)" r={size * 0.42} />
          <Circle cx={size / 2} cy={size / 2} fill="url(#auradinSheen)" r={size * 0.42} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/* -------------------------------------------------------------------- HOME */

function HomeView({
  onOpenSaved,
  onPickSuggestion,
  onSubmit,
  query,
  savedCount,
  setQuery,
}: {
  onOpenSaved?: () => void;
  onPickSuggestion: (q: string) => void;
  onSubmit: () => void;
  query: string;
  savedCount: number;
  setQuery: (v: string) => void;
}) {
  const enter = useFadeIn();

  return (
    <Animated.View style={[styles.layer, enter]}>
      <View style={styles.statusRow}>
        <Wordmark />
        <View style={styles.statusRight}>
          <Text style={styles.statusText}>AURADIN · READY</Text>
          <StatusDot />
        </View>
      </View>

      <View style={styles.heroBlock}>
        <Text style={styles.heroTitle}>Find your own{'\n'}Cosmetic.</Text>
        <Text style={styles.heroSub}>색 · 질감 · 예산 — 편하게 말하면 아우라딘이 찾아드려요.</Text>
      </View>

      {/* 오브 존 (flex:1) — 오브는 shell 레이어에서 지속 렌더 */}
      <View style={{flex: 1, minHeight: 170}} />

      <GlassCard padding={16} radius={auRadius.sheet}>
        <View style={styles.composerRow}>
          <TextInput
            onSubmitEditing={onSubmit}
            onChangeText={setQuery}
            placeholder="예: 물빠진 로즈 느낌의 매트 립"
            placeholderTextColor={auColors.inkFaint}
            returnKeyType="search"
            style={styles.composerInput}
            value={query}
          />
          <Pressable accessibilityLabel="검색" onPress={onSubmit} style={styles.sendWrap}>
            <Text style={styles.sendGlyph}>↗</Text>
          </Pressable>
        </View>
        <View style={styles.chipsRow}>
          {SUGGESTIONS.map((item) => (
            <Chip
              key={item.label}
              highlighted={item.highlighted}
              label={item.label}
              onPress={() => onPickSuggestion(item.query)}
            />
          ))}
        </View>
        <View style={styles.sheetMeta}>
          <Text style={styles.sheetMetaText}>{'>'} user_input</Text>
          {onOpenSaved ? (
            <Pressable accessibilityLabel="보관함 열기" onPress={onOpenSaved}>
              <Text style={[styles.sheetMetaText, styles.underline]}>보관함 {savedCount}</Text>
            </Pressable>
          ) : (
            <Text style={styles.sheetMetaText}>SESSION 001 · KR</Text>
          )}
        </View>
      </GlassCard>
    </Animated.View>
  );
}

/* --------------------------------------------------------------- SEARCHING */

function SearchingView({
  answering,
  onHome,
  query,
}: {
  answering: boolean;
  onHome: () => void;
  query: string;
}) {
  const enter = useFadeIn();
  const label = answering ? '딱 맞는 컬러를 고르는 중' : '아우라딘이 색을 읽는 중';

  return (
    <Animated.View style={[styles.layer, enter]}>
      <View style={styles.statusRow}>
        <Wordmark dark small onPress={onHome} />
      </View>

      <View style={styles.echoWrap}>
        <View style={styles.echoPill}>
          <Text style={styles.echoLabel}>QUERY</Text>
          <Text numberOfLines={1} style={styles.echoText}>
            {query}
          </Text>
        </View>
      </View>

      <View style={{flex: 1}} />

      <View style={styles.searchBottom}>
        <View style={styles.loaderRow}>
          <Text style={styles.loaderText}>{label}</Text>
          <LoaderDots />
        </View>
        <View style={styles.tsteps}>
          <ThinkingStep dark label="색감과 조건 정리" status="done" />
          <ThinkingStep dark label="어울리는 후보 좁히는 중" status="active" />
          <ThinkingStep dark label="구매 링크 확인" status="pending" />
        </View>
      </View>
    </Animated.View>
  );
}

function LoaderDots() {
  const dotsRef = useRef<Animated.Value[] | null>(null);
  if (!dotsRef.current) {
    dotsRef.current = [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)];
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
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [dots]);

  return (
    <View style={styles.dotsRow}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, {opacity: v.interpolate({inputRange: [0, 1], outputRange: [0.2, 1]})}]}
        />
      ))}
    </View>
  );
}

function ThinkingStep({
  dark,
  label,
  status,
}: {
  dark?: boolean;
  label: string;
  status: 'done' | 'active' | 'pending';
}) {
  const breathe = useBreathe(1400);
  const baseColor = dark ? auColors.inkInverse : auColors.ink;
  const dotColor =
    status === 'active' ? auColors.magenta : status === 'done' ? baseColor : 'rgba(255,255,255,0.4)';
  const textStyle = [
    styles.tstepLabel,
    {color: status === 'pending' ? auColors.inkInverseFaint : baseColor},
    status === 'active' && {fontFamily: typography.fontFamily.bold},
  ];

  return (
    <View style={styles.tstepRow}>
      {status === 'active' ? (
        <Animated.View
          style={[
            styles.tdot,
            {backgroundColor: dotColor, transform: [{scale: breathe.interpolate({inputRange: [0, 1], outputRange: [1, 1.5]})}]},
          ]}
        />
      ) : (
        <View style={[styles.tdot, {backgroundColor: dotColor}]} />
      )}
      <Text style={textStyle}>{label}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------- QUESTION */

function QuestionView({
  onFreeText,
  onHome,
  onPick,
  options,
  title,
}: {
  onFreeText: (text: string) => void;
  onHome: () => void;
  onPick: (id: string) => void;
  options: AuradinQuestionOption[];
  title: string;
}) {
  const enter = useFadeIn();
  const [freeText, setFreeText] = useState('');
  const tiles = options.filter((option) => option.swatch);
  const skip = options.find((option) => !option.swatch);

  return (
    <Animated.View style={[styles.layer, enter]}>
      <View style={styles.statusRow}>
        <Wordmark small onPress={onHome} />
      </View>

      <View style={styles.questionCenter}>
        <Text style={styles.qEyebrow}>거의 다 왔어요</Text>
        <Text style={styles.qTitle}>{title}</Text>

        <View style={styles.qTiles}>
          {tiles.map((option) => (
            <Pressable
              key={option.id}
              accessibilityLabel={`${option.label} 선택`}
              onPress={() => onPick(option.id)}
              style={({pressed}) => [
                styles.tile,
                {backgroundColor: option.swatch},
                pressed && {opacity: 0.92, transform: [{scale: 0.97}]},
              ]}>
              <View pointerEvents="none" style={styles.tileScrim} />
              <Text style={styles.tileLabel}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        {skip ? (
          <Pressable accessibilityLabel={skip.label} onPress={() => onPick(skip.id)} style={styles.qSkip}>
            <Text style={styles.qSkipText}>{skip.label}</Text>
          </Pressable>
        ) : null}
      </View>

      <GlassCard padding={8} radius={auRadius.pill}>
        <View style={styles.composerRow}>
          <TextInput
            onChangeText={setFreeText}
            onSubmitEditing={() => freeText.trim() && onFreeText(freeText)}
            placeholder="직접 답해도 좋아요"
            placeholderTextColor={auColors.inkFaint}
            returnKeyType="send"
            style={styles.composerInput}
            value={freeText}
          />
          <Pressable
            accessibilityLabel="보내기"
            onPress={() => freeText.trim() && onFreeText(freeText)}
            style={styles.sendWrap}>
            <Text style={styles.sendGlyph}>↗</Text>
          </Pressable>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

/* ----------------------------------------------------------------- RESULTS */

function roleBadgeLabel(product: AuradinCandidateProduct): string | null {
  if (!product.role) {
    return null;
  }
  if (product.role === 'discovery' && product.source === 'live_naver') {
    return 'discovery · live';
  }
  return product.role;
}

function ResultsView({
  candidates,
  onHome,
  onOpen,
  onOpenSaved,
  onRefine,
  refining,
  savedCount,
  subtitle,
}: {
  candidates: AuradinCandidateProduct[];
  onHome: () => void;
  onOpen: (product: AuradinCandidateProduct) => void;
  onOpenSaved: () => void;
  onRefine: (dial: 'more_similar' | 'more_diverse') => void;
  refining: boolean;
  savedCount: number;
  subtitle: string;
}) {
  const enter = useFadeIn(16);
  const [top, ...alts] = candidates;

  return (
    <Animated.View style={[styles.layer, enter]}>
      <View style={styles.statusRow}>
        <Wordmark small onPress={onHome} />
      </View>

      <ScrollView contentContainerStyle={styles.resultsScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.rEyebrow}>AURADIN PICKS</Text>
        <Text style={styles.rTitle}>이 컬러, 어때요?</Text>
        <Text style={styles.rSub}>{subtitle}</Text>

        {top ? (
          <GlassCard
            accessibilityLabel={`${top.brandName} ${top.productName} 자세히 보기`}
            onPress={() => onOpen(top)}
            padding={0}
            radius={auRadius.stage}
            style={styles.rTopCard}>
            <ProductThumb height={170} palette={top.palette} radius={0} uri={top.imageUrl} />
            <View style={{padding: 14}}>
              <Text style={styles.rBrand}>{top.brandName}</Text>
              <Text style={styles.rName}>
                {top.productName}
                {top.shadeName ? ` · ${top.shadeName}` : ''}
              </Text>
              <Text style={styles.rPrice}>{top.priceText}</Text>
              <View style={styles.rWhyRow}>
                <View style={[styles.rWhyDot, {backgroundColor: top.palette[0] ?? auColors.magenta}]} />
                <Text numberOfLines={2} style={styles.rWhyText}>
                  {top.matchSummary}
                </Text>
              </View>
            </View>
          </GlassCard>
        ) : (
          <Text style={styles.rEmpty}>조건에 맞는 제품을 찾지 못했어요.</Text>
        )}

        <Text style={styles.rAltLabel}>비슷한 후보</Text>
        {alts.map((candidate) => (
          <GlassCard
            key={candidate.id}
            accessibilityLabel={`${candidate.brandName} ${candidate.productName} 자세히 보기`}
            onPress={() => onOpen(candidate)}
            padding={11}
            radius={auRadius.card}
            style={styles.rAltCard}>
            <View style={styles.rAltRow}>
              <View style={{width: 54}}>
                <ProductThumb height={54} palette={candidate.palette} uri={candidate.imageUrl} />
              </View>
              <View style={{flex: 1, minWidth: 0}}>
                <View style={styles.rAltHead}>
                  <Text style={styles.rAltBrand}>{candidate.brandName}</Text>
                  {roleBadgeLabel(candidate) ? (
                    <Badge label={roleBadgeLabel(candidate) as string} tone="ink" />
                  ) : null}
                </View>
                <Text numberOfLines={1} style={styles.rAltName}>
                  {candidate.productName}
                  {candidate.shadeName ? ` · ${candidate.shadeName}` : ''}
                </Text>
                <Text numberOfLines={1} style={styles.rAltMeta}>
                  {candidate.priceText} · {candidate.matchSummary}
                </Text>
              </View>
            </View>
          </GlassCard>
        ))}

        {/* §7 최소 refine 다이얼 — 화면당 액션은 다이얼 두 개뿐, 조용한 재정렬 */}
        <View style={styles.dialRow}>
          <Chip disabled={refining} label="더 비슷하게" onPress={() => onRefine('more_similar')} />
          <Chip disabled={refining} label="더 다양하게" onPress={() => onRefine('more_diverse')} />
          {refining ? <Text style={styles.dialBusy}>재정렬 중…</Text> : null}
        </View>

        <View style={styles.rFootRow}>
          <Pressable accessibilityLabel="처음부터 다시" onPress={onHome}>
            <Text style={styles.underlineLink}>처음부터 다시</Text>
          </Pressable>
          {savedCount ? (
            <Pressable accessibilityLabel="보관함 열기" onPress={onOpenSaved}>
              <Text style={styles.underlineLink}>보관함 {savedCount}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ DETAIL */

function DetailView({
  liked,
  onBack,
  onHome,
  onToggleSave,
  product,
}: {
  liked: boolean;
  onBack: () => void;
  onHome: () => void;
  onToggleSave: () => void;
  product: AuradinCandidateProduct;
}) {
  const enter = useFadeIn(16);
  const reason = product.reason;

  return (
    <Animated.View style={[styles.layer, enter]}>
      <View style={styles.statusRow}>
        <Pressable accessibilityLabel="결과로 돌아가기" hitSlop={8} onPress={onBack}>
          <Text style={styles.backLink}>← 결과</Text>
        </Pressable>
        <Wordmark small onPress={onHome} />
      </View>

      <ScrollView contentContainerStyle={styles.resultsScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.badgeRow}>
          {typeof product.matchRate === 'number' ? (
            <Badge label={`MATCH ${product.matchRate}%`} tone="ink" />
          ) : null}
          {product.role ? <Badge label={product.role} /> : null}
          {product.source ? <Badge label={product.source} /> : null}
        </View>

        <GlassCard padding={0} radius={auRadius.stage} style={{marginTop: 12}}>
          <ProductThumb height={210} palette={product.palette} radius={0} uri={product.imageUrl} />
        </GlassCard>

        <Text style={[styles.rBrand, {marginTop: 16}]}>{product.brandName}</Text>
        <Text style={styles.dName}>
          {product.productName}
          {product.shadeName ? ` · ${product.shadeName}` : ''}
        </Text>
        <Text style={styles.dPrice}>{product.priceText}</Text>

        {/* reasonCopy — §6 가산 카피 (구조화 근거가 권위값, 카피는 읽기용) */}
        {product.reasonCopy ? <Text style={styles.dCopy}>{product.reasonCopy}</Text> : null}

        {/* §6 3칸 근거: matchedOn(잉크+팔레트 dot) / inferred(soft) / caveat(mono "!") */}
        <View style={styles.evidenceStack}>
          {reason?.matchedOn.length ? (
            <GlassCard radius={auRadius.card}>
              <View style={styles.evidenceRow}>
                <View
                  style={[styles.evidenceDot, {backgroundColor: product.palette[0] ?? auColors.magenta}]}
                />
                <Text style={styles.evidenceMatched}>{reason.matchedOn.join(' · ')}</Text>
              </View>
            </GlassCard>
          ) : null}
          {reason?.inferred.length ? (
            <GlassCard radius={auRadius.card}>
              <Text style={styles.evidenceInferred}>{reason.inferred.join(' · ')}</Text>
            </GlassCard>
          ) : null}
          {reason?.caveat.length ? (
            <GlassCard radius={auRadius.card}>
              <View style={styles.evidenceRow}>
                <Text style={styles.evidenceBang}>!</Text>
                <Text style={styles.evidenceInferred}>{reason.caveat.join(' · ')}</Text>
              </View>
            </GlassCard>
          ) : null}
        </View>

        <View style={styles.paletteTagRow}>
          {product.palette.length ? <PaletteSwatches colors={product.palette} /> : null}
          <View style={styles.tagWrap}>
            {product.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} label={tag} tone="ink" />
            ))}
          </View>
        </View>

        <View style={styles.ctaRow}>
          {product.purchaseUrl ? (
            <CTAButton
              label="구매하러 가기 ↗"
              onPress={() => {
                void Linking.openURL(product.purchaseUrl as string);
              }}
            />
          ) : (
            <CTAButton disabled label="구매 링크 준비 중" />
          )}
          <GlassCard padding={0} radius={auRadius.pill}>
            <HeartButton liked={liked} onToggle={onToggleSave} />
          </GlassCard>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------- SAVED */

function SavedView({
  onBack,
  onHome,
  onOpen,
  products,
}: {
  onBack: () => void;
  onHome: () => void;
  onOpen: (product: AuradinCandidateProduct) => void;
  products: AuradinCandidateProduct[];
}) {
  const enter = useFadeIn();

  return (
    <Animated.View style={[styles.layer, enter]}>
      <View style={styles.statusRow}>
        <Pressable accessibilityLabel="뒤로" hitSlop={8} onPress={onBack}>
          <Text style={styles.backLink}>←</Text>
        </Pressable>
        <Text style={styles.savedTitle}>보관함</Text>
        <Wordmark small onPress={onHome} />
      </View>

      {products.length === 0 ? (
        <View style={styles.savedEmpty}>
          <Text style={styles.rEmpty}>아직 보관한 제품이 없어요</Text>
          <Pressable accessibilityLabel="검색하러 가기" onPress={onHome}>
            <Text style={[styles.underlineLink, {marginTop: 10}]}>검색하러 가기</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.savedGrid} showsVerticalScrollIndicator={false}>
          {products.map((product) => (
            <View key={product.id} style={styles.savedCell}>
              <GlassCard
                accessibilityLabel={`${product.productName} 자세히 보기`}
                onPress={() => onOpen(product)}
                padding={10}
                radius={auRadius.card}>
                <View>
                  <ProductThumb height={110} palette={product.palette} uri={product.imageUrl} />
                  <View style={styles.savedHeart}>
                    <Text accessibilityLabel="보관됨" style={{color: auColors.heart, fontSize: 14}}>
                      ♥
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.rAltBrand, {marginTop: 8}]}>
                    {product.brandName}
                  </Text>
                  <Text numberOfLines={2} style={styles.savedName}>
                    {product.productName}
                  </Text>
                  <Text style={styles.savedPrice}>{product.priceText}</Text>
                </View>
              </GlassCard>
            </View>
          ))}
        </ScrollView>
      )}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------- ERROR */

function ErrorView({message, onHome}: {message?: string; onHome: () => void}) {
  // DS 규칙: 에러 화면은 페이드 없이 정적 진입, 담담한 한 줄 + 복구 CTA만.
  return (
    <View style={styles.layer}>
      <View style={styles.statusRow}>
        <Wordmark small onPress={onHome} />
      </View>
      <View style={styles.errorCenter}>
        <View style={{height: 170}} />
        <Text style={styles.errorText}>{message ?? '검색을 완료하지 못했어요.'}</Text>
        <View style={[styles.errorCtaWrap, {marginTop: 22}]}>
          <CTAButton label="처음부터 다시" onPress={onHome} />
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- HOOKS */

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

function useFadeIn(translate = 12) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      duration: auMotion.enterMs,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [v]);
  return {
    opacity: v,
    transform: [{translateY: v.interpolate({inputRange: [0, 1], outputRange: [translate, 0]})}],
  };
}

/* ------------------------------------------------------------------ STYLES */

const styles = StyleSheet.create({
  shell: {flex: 1},
  content: {flex: 1, paddingHorizontal: 22, paddingBottom: 18, paddingTop: 12},
  layer: {flex: 1},
  orbLayer: {alignItems: 'center', left: 0, position: 'absolute', right: 0, top: 0},
  orbGlow: {
    backgroundColor: auColors.accentGlow,
    borderRadius: 999,
    height: 240,
    position: 'absolute',
    width: 240,
  },

  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  statusRight: {alignItems: 'center', flexDirection: 'row', gap: 7},
  statusText: {
    color: auColors.inkFaint,
    fontFamily: auType.mono,
    fontSize: 10.5,
    letterSpacing: 1.5,
  },

  heroBlock: {marginTop: 30},
  heroTitle: {
    color: auColors.ink,
    fontFamily: auType.serif,
    fontSize: 44,
    letterSpacing: -1.2,
    lineHeight: 48,
  },
  heroSub: {
    color: auColors.inkSoft,
    fontFamily: typography.fontFamily.regular,
    fontSize: 12.5,
    letterSpacing: 0.8,
    lineHeight: 21,
    marginTop: 14,
  },

  composerRow: {alignItems: 'center', flexDirection: 'row', gap: 8},
  composerInput: {
    color: auColors.ink,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sendWrap: {
    alignItems: 'center',
    backgroundColor: auColors.magenta,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    shadowColor: auColors.magenta,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 10,
    width: 40,
  },
  sendGlyph: {color: auColors.inkInverse, fontSize: 17, fontWeight: '700'},
  chipsRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
  sheetMeta: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 12},
  sheetMetaText: {
    color: auColors.inkFaint,
    fontFamily: auType.mono,
    fontSize: 9.5,
    letterSpacing: 1.4,
  },
  underline: {textDecorationLine: 'underline'},

  echoWrap: {alignItems: 'center', marginTop: 26},
  echoPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: auRadius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    maxWidth: '92%',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  echoLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: auType.mono,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  echoText: {color: auColors.inkInverse, fontFamily: typography.fontFamily.medium, fontSize: 12.5},
  searchBottom: {alignItems: 'center', gap: 22, paddingBottom: 34},
  loaderRow: {alignItems: 'center', flexDirection: 'row'},
  loaderText: {color: auColors.inkInverse, fontFamily: typography.fontFamily.bold, fontSize: 16},
  dotsRow: {alignItems: 'center', flexDirection: 'row', gap: 4, marginLeft: 7},
  dot: {backgroundColor: auColors.inkInverse, borderRadius: 999, height: 5, width: 5},
  tsteps: {gap: 14, maxWidth: 268, width: '100%'},
  tstepRow: {alignItems: 'center', flexDirection: 'row', gap: 11},
  tdot: {borderRadius: 999, height: 8, width: 8},
  tstepLabel: {fontFamily: typography.fontFamily.semibold, fontSize: 13.5},

  questionCenter: {alignItems: 'center', flex: 1, justifyContent: 'center'},
  qEyebrow: {
    color: auColors.magenta,
    fontFamily: auType.mono,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  qTitle: {
    color: auColors.ink,
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    lineHeight: 32,
    marginTop: 12,
    textAlign: 'center',
  },
  qTiles: {flexDirection: 'row', gap: 12, marginTop: 30, width: '100%'},
  tile: {
    borderRadius: auRadius.tile,
    flex: 1,
    height: 160,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    padding: 16,
  },
  tileScrim: {
    backgroundColor: 'rgba(0,0,0,0.16)',
    bottom: 0,
    height: '46%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  tileLabel: {
    color: auColors.inkInverse,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 14,
    textShadowColor: 'rgba(0,0,0,0.22)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 8,
  },
  qSkip: {marginBottom: 24, marginTop: 20},
  qSkipText: {
    color: auColors.inkSoft,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 14,
    textDecorationLine: 'underline',
  },

  resultsScroll: {paddingBottom: 30, paddingTop: 14},
  rEyebrow: {
    color: auColors.magenta,
    fontFamily: auType.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  rTitle: {color: auColors.ink, fontFamily: typography.fontFamily.bold, fontSize: 24, marginTop: 4},
  rSub: {color: auColors.inkSoft, fontFamily: typography.fontFamily.medium, fontSize: 13.5, marginTop: 4},
  rTopCard: {marginTop: 16},
  rBrand: {color: auColors.inkSoft, fontFamily: auType.mono, fontSize: 11, letterSpacing: 0.8},
  rName: {color: auColors.ink, fontFamily: typography.fontFamily.bold, fontSize: 15.5, marginTop: 4},
  rPrice: {color: auColors.ink, fontFamily: auType.mono, fontSize: 13, marginTop: 5},
  rWhyRow: {
    borderTopColor: 'rgba(255,255,255,0.6)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
  },
  rWhyDot: {borderRadius: 999, height: 9, marginTop: 4, width: 9},
  rWhyText: {
    color: auColors.inkSoft,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 12.5,
    lineHeight: 18,
  },
  rEmpty: {color: auColors.inkSoft, fontFamily: typography.fontFamily.medium, fontSize: 13.5, marginTop: 20},
  rAltLabel: {
    color: auColors.inkFaint,
    fontFamily: auType.mono,
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 10,
    marginTop: 22,
  },
  rAltCard: {marginBottom: 9},
  rAltRow: {alignItems: 'center', flexDirection: 'row', gap: 12},
  rAltHead: {alignItems: 'center', flexDirection: 'row', gap: 6},
  rAltBrand: {color: auColors.inkFaint, fontFamily: auType.mono, fontSize: 10.5},
  rAltName: {color: auColors.ink, fontFamily: typography.fontFamily.bold, fontSize: 14, marginTop: 2},
  rAltMeta: {color: auColors.inkSoft, fontFamily: typography.fontFamily.medium, fontSize: 12, marginTop: 2},
  dialRow: {alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 18},
  dialBusy: {color: auColors.inkFaint, fontFamily: auType.mono, fontSize: 10.5, marginLeft: 4},
  rFootRow: {flexDirection: 'row', gap: 18, justifyContent: 'center', marginTop: 22},
  underlineLink: {
    color: auColors.inkSoft,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 13,
    textDecorationLine: 'underline',
  },

  backLink: {color: auColors.inkSoft, fontFamily: auType.mono, fontSize: 11, letterSpacing: 1},
  badgeRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12},
  dName: {color: auColors.ink, fontFamily: typography.fontFamily.bold, fontSize: 19, marginTop: 4},
  dPrice: {color: auColors.ink, fontFamily: auType.mono, fontSize: 14, marginTop: 6},
  dCopy: {
    color: auColors.ink,
    fontFamily: typography.fontFamily.medium,
    fontSize: 13.5,
    lineHeight: 21,
    marginTop: 14,
  },
  evidenceStack: {gap: 8, marginTop: 16},
  evidenceRow: {alignItems: 'flex-start', flexDirection: 'row', gap: 8},
  evidenceDot: {borderRadius: 6, height: 12, marginTop: 3, width: 12},
  evidenceMatched: {
    color: auColors.ink,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 12.5,
    lineHeight: 19,
  },
  evidenceInferred: {
    color: auColors.inkSoft,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: 12.5,
    lineHeight: 19,
  },
  evidenceBang: {color: auColors.inkFaint, fontFamily: auType.mono, fontSize: 11, marginTop: 2},
  paletteTagRow: {alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 16},
  tagWrap: {flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  ctaRow: {alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 18},

  savedTitle: {color: auColors.ink, fontFamily: typography.fontFamily.bold, fontSize: 16},
  savedEmpty: {alignItems: 'center', flex: 1, justifyContent: 'center'},
  savedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 30,
    paddingTop: 16,
  },
  savedCell: {width: '47.5%'},
  savedHeart: {position: 'absolute', right: 6, top: 6},
  savedName: {
    color: auColors.ink,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
  savedPrice: {color: auColors.inkSoft, fontFamily: auType.mono, fontSize: 11.5, marginTop: 4},

  errorCenter: {alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 420},
  errorText: {
    color: auColors.inkSoft,
    fontFamily: typography.fontFamily.medium,
    fontSize: 13.5,
    lineHeight: 20,
    maxWidth: 250,
    textAlign: 'center',
  },
  errorCtaWrap: {flexDirection: 'row', minWidth: 180},
});
