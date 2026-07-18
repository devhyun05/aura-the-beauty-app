// apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx
//
// AURADIN 컨트롤러 — phase 머신·세션 API·refine·보관함·데모 드라이브(로직)만 담당한다.
// 프리젠테이션은 auradin-rn DS 포팅(components/ds + screens/views, 디자인 세션 산출물)이 담당:
//   <AuradinGround dark>  ── 지반(라이트 클린 그라디언트 / searching 다크 몰입)
//     <PersistentOrb phase> ── 단일 오브 인스턴스, phase별 위치·크기·글로만 모프 (§9 ③)
//     {phase별 View}        ── 콜백 props로만 연결 (네트워크·상태 없음)
//
// 팔레트는 features/recommendation 로컬 토큰만 사용 (가드: test:auradin-theme-scope).

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {Pressable, StyleSheet, View} from 'react-native';
import {ChevronLeft} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AuradinGround, PersistentOrb, useHostPause} from '../components/ds';
import {
  DetailView,
  ErrorView,
  HomeView,
  QuestionView,
  ResultsView,
  SavedView,
  SearchingView,
} from './views';
import {
  answerAuradinQuestion,
  cancelAuradinSearchSession,
  createAuradinSearchSession,
  isAuradinAbort,
  makeClientRequestId,
  pollAuradinSearchTurn,
  postAuradinEvents,
  refineAuradinSearch,
  similarAuradinSearch,
} from '../services/auradinSearchService';
import {
  fetchAuradinSavedProducts,
  persistAuradinSave,
  removeAuradinSave,
} from '../services/auradinSavedProducts';
import {BackendApiError} from '../../../shared/services/backendApi';
import {setFeaturePerformanceStage} from '../../../shared/performance/featurePerformanceLogger';
import type {
  AuradinCandidateProduct,
  AuradinPhase,
  AuradinSearchTurn,
  AuradinSimilarIntent,
  RefineDial,
} from '../types';
import {buildRequestParts, type AuradinAttachment} from '../attachments';
import {initializeProductEventCollection} from '../services/productEventService';
import {useTransientToast} from '../../../shared/ui';

// 첨부만(리포트/필터)으로 보낼 때의 중립 broad 시드 — 백엔드가 '어느 부위' 스코프 질문을 묻게 한다(§4).
const BROAD_SEED = '추천해줘';
// 완전 공백 전송 시 최후 폴백 — 보통은 HomeView 로테이션(3-1)이 올려준 '현재 표시 중 추천 질의'를 쓴다.
const EMPTY_SUBMIT_QUERY = '물빠진 로즈 느낌의 매트 립';
const SEARCH_MS = 2300;
const PICK_MS = 1700;

function savedProductKey(
  product: Pick<AuradinCandidateProduct, 'id' | 'externalSource'>,
): string {
  return `${product.externalSource ?? 'internal'}:${product.id}`;
}

export type AuradinAvailableReport = {id?: string; personalColor: string; skinType?: string};

export type AuradinDriveParams = {
  prompt?: string; // 딥링크 검색 자동 시작 (예: 리포트 화면 → aiarmakeup://auradin-search?prompt=…)
  reportId?: string; // 첨부: 얼굴분석 리포트 id
  personalColor?: string; // 첨부: 리포트 톤 (client-relay)
  skinType?: string; // 첨부: 리포트 피부타입 (C4 finish soft 선호)
  open?: string; // QA·데모: results에서 role(anchor|diverse|discovery) 카드 상세 열기
  dial?: string; // QA·데모: refine 다이얼 (more_similar|more_diverse)
  ts?: string; // 같은 명령 반복용 nonce
};

export function AuradinSearchScreen({
  drive,
  availableReport,
  onBack,
  onOpenProduct,
  onOpenLikedProducts,
}: {
  drive?: AuradinDriveParams;
  availableReport?: AuradinAvailableReport | null;
  onBack?: () => void;
  onOpenProduct?: (productId: string, shadeId?: string) => void;
  onOpenLikedProducts?: () => void;
} = {}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<AuradinPhase>('home');
  // 3-3 게이팅: 앱 백그라운드·키보드 표시 중엔 오브 GL 루프를 멈춘다(GPU·배터리 절약).
  const orbPaused = useHostPause();
  // Change D: 컴포저는 빈 값으로 시작(placeholder만) — 첨부만 하고 보내면 broad 스코프 질문.
  const [query, setQuery] = useState('');
  // Change C: 확장형 첨부 — 리포트(nav/딥링크로 시드) + 필터. submit이 요청에 합성.
  const seededReport: AuradinAttachment | null =
    drive?.personalColor || availableReport?.personalColor
      ? {
          kind: 'report',
          id: drive?.reportId ?? availableReport?.id,
          personalColor: (drive?.personalColor ?? availableReport?.personalColor) as string,
          skinType: drive?.skinType ?? availableReport?.skinType,
        }
      : null;
  const [attachments, setAttachments] = useState<AuradinAttachment[]>(seededReport ? [seededReport] : []);
  const [turn, setTurn] = useState<AuradinSearchTurn | null>(null);
  const [answering, setAnswering] = useState(false);
  const [refining, setRefining] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [selected, setSelected] = useState<AuradinCandidateProduct | null>(null);
  const [saved, setSaved] = useState<AuradinCandidateProduct[]>([]);
  const [likedProductKeys, setLikedProductKeys] = useState<Set<string>>(new Set());
  const {showToast, toast} = useTransientToast(2600);
  const sessionIdRef = useRef<string | null>(null);
  const saveMutationVersionRef = useRef(0);
  const pendingSaveKeysRef = useRef<Set<string>>(new Set());
  // A9 create 멱등 키 — 논리적 submit 단위로 보존: 같은 fingerprint의 네트워크 재시도는
  // 같은 id, 요청 내용이 바뀌면 새 id. 410(만료)·409(키 재사용) 수신 시 ref를 비운다.
  const submitKeyRef = useRef<{
    fingerprint: string;
    id: string;
    status: 'in_flight' | 'resolved';
  } | null>(null);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 진행 중인 세션 요청의 컨트롤러 — 새 검색/취소/이탈 시 in-flight fetch·poll을 중단한다.
  const abortRef = useRef<AbortController | null>(null);
  // 3-1: HomeView 로테이션이 올려주는 '현재 표시 중 추천 질의' — 빈 전송 시 이 질의로 검색.
  const currentSuggestionRef = useRef<string>('');

  useEffect(() => {
    setFeaturePerformanceStage(`auradin:${phase}`);
  }, [phase]);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      clearTimeout(timer.current);
      abortRef.current?.abort();
      const sid = sessionIdRef.current;
      if (sid) {
        void cancelAuradinSearchSession(sid); // 화면 이탈 → 서버 세션도 종료
      }
    };
  }, []);

  useEffect(() => {
    void initializeProductEventCollection();
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    const requestVersion = saveMutationVersionRef.current;
    fetchAuradinSavedProducts()
      .then(products => {
        if (active && requestVersion === saveMutationVersionRef.current) {
          setSaved(products);
          setLikedProductKeys(new Set(products.map(savedProductKey)));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []));

  // 새 세션 요청을 위한 컨트롤러 발급 — 직전 요청은 중단한다.
  const beginRequest = (): AbortController => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  };

  // 백엔드가 즉답해도 searching 오브를 최소 표시시간만큼 유지 (calm — DS 규칙)
  const runWithSearching = async (
    minMs: number,
    signal: AbortSignal,
    work: () => Promise<AuradinSearchTurn>,
  ) => {
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
      if (cancelled.current || signal.aborted) {
        return; // 사용자 이탈/취소 — 결과를 반영하지 않는다 (홈 복귀 레이스 방지)
      }
      setTurn(nextTurn);
      setPhase(
        nextTurn.phase === 'results' ? 'results' : nextTurn.phase === 'question' ? 'question' : 'failed',
      );
    } catch (error) {
      if (cancelled.current || signal.aborted || isAuradinAbort(error)) {
        return; // 취소로 인한 abort는 실패 화면을 띄우지 않고 조용히 종료
      }
      setTurn({
        sessionId: sessionIdRef.current ?? '',
        phase: 'failed',
        thinking: [],
        candidates: [],
        error: {
          message:
            error instanceof BackendApiError
              ? error.message
              : '검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
        },
      });
      setPhase('failed');
    }
  };

  const submit = (raw?: string) => {
    const typed = (raw?.trim() ? raw.trim() : query.trim()).trim();
    const parts = buildRequestParts(attachments);
    // 완전 공백(텍스트·첨부 모두 없음) → placeholder 예시를 실제 질의로 승격해 "본 그대로" 검색.
    // 첨부만 있으면 기존대로 broad 시드로 스코프 질문을 유도한다.
    const seed =
      !typed && attachments.length === 0
        ? currentSuggestionRef.current || EMPTY_SUBMIT_QUERY
        : typed;
    const effective = [seed, parts.promptSuffix].filter(Boolean).join(' ').trim();
    const prompt = effective || BROAD_SEED;
    setQuery(seed); // 승격된 예시(또는 사용자가 친 것)를 입력창에 반영 — 첨부는 칩으로 별도 표시
    setAnswering(false);
    setSelected(null);
    // 백엔드는 personalColor/skinType(+각 confidence)만 허용 — 있는 것만 실어 보낸다.
    const context =
      parts.context.personalColor || parts.context.skinType
        ? {
            ...(parts.context.personalColor ? {personalColor: parts.context.personalColor} : {}),
            ...(parts.context.skinType ? {skinType: parts.context.skinType} : {}),
          }
        : undefined;
    // A9: 같은 논리적 submit(동일 fingerprint)의 재시도는 같은 clientRequestId를 재사용.
    const fingerprint = JSON.stringify({
      prompt,
      reportId: parts.reportId ?? null,
      personalColor: context?.personalColor ?? null,
      skinType: context?.skinType ?? null,
    });
    if (submitKeyRef.current?.fingerprint !== fingerprint) {
      submitKeyRef.current = {fingerprint, id: makeClientRequestId(), status: 'in_flight'};
    }
    const clientRequestId = submitKeyRef.current.id;
    submitKeyRef.current.status = 'in_flight';
    const {signal} = beginRequest();
    void runWithSearching(SEARCH_MS, signal, async () => {
      let created;
      try {
        created = await createAuradinSearchSession(
          {prompt, reportId: parts.reportId, context, clientRequestId},
          signal,
        );
      } catch (error) {
        // 410 SESSION_EXPIRED(retention 내 원 세션 만료)·409 IDEMPOTENCY_KEY_REUSED →
        // 키를 비워 다음 시도가 새 id로 새 검색을 시작하게 한다.
        if (error instanceof BackendApiError && (error.status === 410 || error.status === 409)) {
          submitKeyRef.current = null;
        }
        throw error;
      }
      sessionIdRef.current = created.sessionId;
      if (submitKeyRef.current?.id === clientRequestId) {
        submitKeyRef.current.status = 'resolved';
      }
      return pollAuradinSearchTurn(created.sessionId, {signal});
    });
  };

  // Change C: 첨부 추가/제거 — report는 1개만 유지, filter는 같은 value 중복 방지.
  const addAttachment = (attachment: AuradinAttachment) => {
    setAttachments((current) => {
      if (attachment.kind === 'report') {
        return [attachment, ...current.filter((a) => a.kind !== 'report')];
      }
      const dup = current.some(
        (a) => a.kind === 'filter' && a.attribute === attachment.attribute && a.value === attachment.value,
      );
      return dup ? current : [...current, attachment];
    });
  };
  const removeAttachment = (index: number) => {
    setAttachments((current) => current.filter((_, i) => i !== index));
  };

  const pick = (optionId: string) => {
    const sessionId = sessionIdRef.current;
    const questionId = turn?.question?.id;
    if (!sessionId || !questionId) {
      return;
    }
    setAnswering(true);
    const {signal} = beginRequest();
    void runWithSearching(PICK_MS, signal, async () => {
      try {
        await answerAuradinQuestion(sessionId, questionId, optionId, signal);
      } catch (error) {
        // A9: conflict(409)/stale(409)/invalid option(422)/expired(410)은 세션 재조회로
        // 서버 상태를 복원한다 — 실패 화면 대체가 아니라 authoritative 상태 표시 (계약 변경).
        if (
          error instanceof BackendApiError &&
          (error.status === 409 || error.status === 410 || error.status === 422)
        ) {
          return pollAuradinSearchTurn(sessionId, {signal});
        }
        throw error;
      }
      return pollAuradinSearchTurn(sessionId, {signal});
    }).finally(() => {
      // invalid/stale/conflict의 authoritative 재조회가 끝나면 로컬 선택 잠금을 되돌린다.
      if (!cancelled.current && !signal.aborted) {
        setAnswering(false);
      }
    });
  };

  // §7 최소 refine 다이얼 — 다크 몰입 없이 results 위에서 조용히 재정렬 (재검색 아님)
  const refine = (dial: RefineDial) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || refining) {
      return;
    }
    setRefining(true);
    const {signal} = beginRequest();
    void (async () => {
      try {
        await refineAuradinSearch(sessionId, {dial}, signal);
        const nextTurn = await pollAuradinSearchTurn(sessionId, {signal});
        if (!cancelled.current && !signal.aborted && nextTurn.phase === 'results') {
          setTurn(nextTurn);
        }
      } catch {
        // refine 실패/취소는 조용히 — 기존 결과 유지 (§7 recovery는 백엔드가 담당)
      } finally {
        if (!cancelled.current && !signal.aborted) {
          setRefining(false);
        }
      }
    })();
  };

  // B6 §10.3-2: '이 제품과 비슷한 것' — 서버 rankedCache 재랭킹(λ=0.9) 후 results로 복귀.
  // 재검색이 아니라 같은 후보셋의 재정렬이라 다크 몰입 없이 조용히 처리한다.
  const similar = (product: AuradinCandidateProduct, intent: AuradinSimilarIntent) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || similarLoading) {
      return;
    }
    setSimilarLoading(true);
    const {signal} = beginRequest();
    void (async () => {
      try {
        await similarAuradinSearch(sessionId, {productId: product.id, intent}, signal);
        const nextTurn = await pollAuradinSearchTurn(sessionId, {signal});
        if (!cancelled.current && !signal.aborted && nextTurn.phase === 'results') {
          setTurn(nextTurn);
          setSelected(null);
          setPhase('results');
        }
      } catch {
        // similar 실패(카탈로그 밖 픽 422 등)/취소는 조용히 — 상세 화면 유지 (§9 recovery는 백엔드 담당)
      } finally {
        if (!cancelled.current && !signal.aborted) {
          setSimilarLoading(false);
        }
      }
    })();
  };

  // A5 이벤트 방출 — fire-and-forget. 실패·백엔드 미설정·dev 인증은 조용히 무시된다(fail-open).
  // A5 계약(익명 owner·payload 새니타이즈)은 서버가 처리한다. rank는 dev queueProductEvent
  // 스키마의 position을 A5 rank 필드로 흡수한 것 — product_open에서 노출 위치를 함께 싣는다.
  const emitProductEvent = (
    eventType: 'product_open' | 'purchase_click' | 'save' | 'unsave',
    product: AuradinCandidateProduct,
    extra?: {rank?: number},
  ) => {
    postAuradinEvents([
      {
        clientEventId: makeClientRequestId(),
        eventType,
        occurredAt: new Date().toISOString(),
        sessionId: sessionIdRef.current ?? undefined,
        productId: product.id,
        category: product.category,
        role: product.role,
        matchRate: product.matchRate,
        ...(extra?.rank !== undefined ? {rank: extra.rank} : {}),
      },
    ]);
  };

  const openDetail = (product: AuradinCandidateProduct) => {
    // product_open은 A5 배치(postAuradinEvents=/search/events)로 전송해 실제 기록을 보장한다.
    // dev의 queueProductEvent는 /products/events(레거시)로 가고 save/unsave/purchase_click을
    // 담지 못해 A5 계약과 어긋나므로, dev 스키마의 position만 A5 rank로 흡수한다.
    const position = candidates.findIndex(candidate => candidate.id === product.id);
    // 서버 impression rank는 1-based(event_logger.py index+1) — position(0-based)에 +1.
    // 후보에서 못 찾으면(-1) rank를 싣지 않는다(오염된 0 방지, emitProductEvent가 undefined 생략).
    emitProductEvent('product_open', product, {
      rank: position >= 0 ? position + 1 : undefined,
    });
    setSelected(product);
    setPhase('detail');
  };

  const toggleSave = async (product: AuradinCandidateProduct) => {
    const productKey = savedProductKey(product);
    if (pendingSaveKeysRef.current.has(productKey)) {
      return;
    }
    pendingSaveKeysRef.current.add(productKey);
    saveMutationVersionRef.current += 1;
    const wasSaved = likedProductKeys.has(productKey);
    emitProductEvent(wasSaved ? 'unsave' : 'save', product);
    const updateLocalState = (nextSaved: boolean) => {
      setSaved((current) =>
        nextSaved
          ? [...current.filter((item) => savedProductKey(item) !== productKey), product]
          : current.filter((item) => savedProductKey(item) !== productKey),
      );
      setLikedProductKeys((current) => {
        const next = new Set(current);
        if (nextSaved) {
          next.add(productKey);
        } else {
          next.delete(productKey);
        }
        return next;
      });
    };

    updateLocalState(!wasSaved);
    try {
      const persisted = wasSaved
        ? await removeAuradinSave(product.id, product.externalSource)
        : await persistAuradinSave(product);
      if (!persisted) {
        updateLocalState(wasSaved);
        return;
      }
      if (!wasSaved) {
        showToast(
          '좋아요한 제품에 저장했어요',
          onOpenLikedProducts ? {label: '보기', onPress: onOpenLikedProducts} : undefined,
        );
      }
    } catch {
      updateLocalState(wasSaved);
    } finally {
      pendingSaveKeysRef.current.delete(productKey);
    }
  };

  const reset = () => {
    clearTimeout(timer.current);
    abortRef.current?.abort(); // in-flight 검색·poll 중단 (홈 복귀 후 결과 강제 전환 방지)
    const sid = sessionIdRef.current;
    if (sid) {
      void cancelAuradinSearchSession(sid); // 서버 세션도 종료 (best-effort)
    }
    sessionIdRef.current = null;
    submitKeyRef.current = null; // 새 논리 검색은 취소된 세션의 clientRequestId를 재사용하지 않는다.
    setTurn(null);
    setQuery(''); // 입력창 잔존 질의 초기화 — 다음 홈 진입 시 placeholder만 보이게
    setAnswering(false);
    setRefining(false);
    setSimilarLoading(false);
    setSelected(null);
    setPhase('home');
  };

  const question = turn?.question;
  const candidates = turn?.candidates ?? [];
  const savedKeys = likedProductKeys;
  const visibleSaved = saved.filter(product => savedKeys.has(savedProductKey(product)));

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
      <AuradinGround dark={phase === 'searching'}>
        <PersistentOrb phase={phase} paused={orbPaused} />
        {onBack ? (
          <Pressable
            accessibilityLabel="제품 추천으로 돌아가기"
            accessibilityRole="button"
            onPress={onBack}
            style={[styles.backButton, {top: insets.top + 8}]}>
            <ChevronLeft color="#2D2940" size={24} />
          </Pressable>
        ) : null}

        {phase === 'home' ? (
          <HomeView
            attachments={attachments}
            availableReport={
              availableReport?.personalColor
                ? availableReport
                : drive?.personalColor
                  ? {id: drive.reportId, personalColor: drive.personalColor}
                  : null
            }
            onAddAttachment={addAttachment}
            onOpenSaved={visibleSaved.length ? () => setPhase('saved') : undefined}
            onPickSuggestion={(pickedQuery) => submit(pickedQuery)}
            onSuggestionChange={(shownQuery) => {
              currentSuggestionRef.current = shownQuery;
            }}
            onRemoveAttachment={removeAttachment}
            onSubmit={() => submit()}
            query={query}
            savedCount={visibleSaved.length}
            setQuery={setQuery}
          />
        ) : null}

        {phase === 'searching' ? (
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
            appliedFilters={turn?.appliedFilters}
            candidates={candidates}
            onHome={reset}
            onOpen={openDetail}
            onOpenSaved={visibleSaved.length ? () => setPhase('saved') : undefined}
            onRefine={refine}
            refining={refining}
            savedCount={visibleSaved.length}
            subtitle={turn?.headerLabel ?? '조건에 가까운 제품'}
          />
        ) : null}

        {phase === 'detail' && selected ? (
          <DetailView
            liked={savedKeys.has(savedProductKey(selected))}
            onBack={() => setPhase('results')}
            onHome={reset}
            // 라이브 발견 픽은 rankedCache(카탈로그) 밖 — 진입점을 숨긴다 (B6 계약).
            onSimilar={
              selected.source === 'live_naver' || !sessionIdRef.current
                ? undefined
                : (intent) => similar(selected, intent)
            }
            // dev: offerId 있는 큐레이션 픽은 신뢰제품(TrustedProduct) 상세로 라우팅.
            onOpenTrustedProduct={
              selected.offerId && onOpenProduct
                ? () => onOpenProduct(selected.id, selected.shadeId)
                : undefined
            }
            onPurchase={() => emitProductEvent('purchase_click', selected)}
            onToggleSave={() => {
              // 저장 중 같은 상품의 중복 탭은 toggleSave 내부 pending key가 차단한다.
              void toggleSave(selected);
            }}
            product={selected}
            similarLoading={similarLoading}
          />
        ) : null}

        {phase === 'saved' ? (
          <SavedView
            onBack={() => setPhase(turn?.phase === 'results' ? 'results' : 'home')}
            onHome={reset}
            onOpen={openDetail}
            products={visibleSaved}
          />
        ) : null}

        {phase === 'failed' ? <ErrorView message={turn?.error?.message ?? undefined} onHome={reset} /> : null}
      </AuradinGround>
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1},
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    left: 12,
    position: 'absolute',
    width: 44,
    zIndex: 200,
  },
});
