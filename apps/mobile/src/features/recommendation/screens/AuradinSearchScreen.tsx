// apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx
//
// AURADIN 컨트롤러 — phase 머신·세션 API·refine·보관함·데모 드라이브(로직)만 담당한다.
// 프리젠테이션은 auradin-rn DS 포팅(components/ds + screens/views, 디자인 세션 산출물)이 담당:
//   <AuradinGround dark>  ── 지반(라이트 클린 그라디언트 / searching 다크 몰입)
//     <PersistentOrb phase> ── 단일 오브 인스턴스, phase별 위치·크기·글로만 모프 (§9 ③)
//     {phase별 View}        ── 콜백 props로만 연결 (네트워크·상태 없음)
//
// 팔레트는 features/recommendation 로컬 토큰만 사용 (가드: test:auradin-theme-scope).

import {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';

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
  refineAuradinSearch,
} from '../services/auradinSearchService';
import {
  fetchAuradinSavedProducts,
  persistAuradinSave,
  removeAuradinSave,
} from '../services/auradinSavedProducts';
import {BackendApiError} from '../../../shared/services/backendApi';
import type {
  AuradinCandidateProduct,
  AuradinPhase,
  AuradinSearchTurn,
  RefineDial,
} from '../types';
import {buildRequestParts, type AuradinAttachment} from '../attachments';

// 첨부만(리포트/필터)으로 보낼 때의 중립 broad 시드 — 백엔드가 '어느 부위' 스코프 질문을 묻게 한다(§4).
const BROAD_SEED = '추천해줘';
// 완전 공백 전송 시 최후 폴백 — 보통은 HomeView 로테이션(3-1)이 올려준 '현재 표시 중 추천 질의'를 쓴다.
const EMPTY_SUBMIT_QUERY = '물빠진 로즈 느낌의 매트 립';
const SEARCH_MS = 2300;
const PICK_MS = 1700;

export type AuradinAvailableReport = {id?: string; personalColor: string};

export type AuradinDriveParams = {
  prompt?: string; // 딥링크 검색 자동 시작 (예: 리포트 화면 → aiarmakeup://auradin-search?prompt=…)
  reportId?: string; // 첨부: 얼굴분석 리포트 id
  personalColor?: string; // 첨부: 리포트 톤 (client-relay)
  open?: string; // QA·데모: results에서 role(anchor|diverse|discovery) 카드 상세 열기
  dial?: string; // QA·데모: refine 다이얼 (more_similar|more_diverse)
  ts?: string; // 같은 명령 반복용 nonce
};

export function AuradinSearchScreen({
  drive,
  availableReport,
}: {drive?: AuradinDriveParams; availableReport?: AuradinAvailableReport | null} = {}) {
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
        }
      : null;
  const [attachments, setAttachments] = useState<AuradinAttachment[]>(seededReport ? [seededReport] : []);
  const [turn, setTurn] = useState<AuradinSearchTurn | null>(null);
  const [answering, setAnswering] = useState(false);
  const [refining, setRefining] = useState(false);
  const [selected, setSelected] = useState<AuradinCandidateProduct | null>(null);
  const [saved, setSaved] = useState<AuradinCandidateProduct[]>([]);
  const sessionIdRef = useRef<string | null>(null);
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
    const context = parts.context.personalColor ? {personalColor: parts.context.personalColor} : undefined;
    // A9: 같은 논리적 submit(동일 fingerprint)의 재시도는 같은 clientRequestId를 재사용.
    const fingerprint = JSON.stringify({
      prompt,
      reportId: parts.reportId ?? null,
      personalColor: context?.personalColor ?? null,
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

  const openDetail = (product: AuradinCandidateProduct) => {
    setSelected(product);
    setPhase('detail');
  };

  // R1 게이트 1: 보관함 서버 영속화 — 마운트 시 서버 찜 목록으로 복원(재마운트 소실 방지).
  // 진행 중 세션 상태와 무관한 read-only 시드라 phase 머신을 건드리지 않는다.
  useEffect(() => {
    let alive = true;
    void fetchAuradinSavedProducts().then((products) => {
      if (!alive || products.length === 0) {
        return;
      }
      setSaved((current) => {
        const currentIds = new Set(current.map((item) => item.id));
        return [...current, ...products.filter((item) => !currentIds.has(item.id))];
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleSave = (product: AuradinCandidateProduct) => {
    const exists = saved.some((item) => item.id === product.id);
    // R1 게이트 1: 레거시 찜 API 재사용(user_product_likes) — best-effort, 로컬 상태가 즉답.
    if (exists) {
      void removeAuradinSave(product.id);
    } else {
      void persistAuradinSave(product);
    }
    setSaved((current) =>
      exists
        ? current.filter((item) => item.id !== product.id)
        : [...current.filter((item) => item.id !== product.id), product],
    );
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
    setSelected(null);
    setPhase('home');
  };

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
      <AuradinGround dark={phase === 'searching'}>
        <PersistentOrb phase={phase} paused={orbPaused} />

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
            onOpenSaved={saved.length ? () => setPhase('saved') : undefined}
            onPickSuggestion={(pickedQuery) => submit(pickedQuery)}
            onSuggestionChange={(shownQuery) => {
              currentSuggestionRef.current = shownQuery;
            }}
            onRemoveAttachment={removeAttachment}
            onSubmit={() => submit()}
            query={query}
            savedCount={saved.length}
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
            onOpenSaved={saved.length ? () => setPhase('saved') : undefined}
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

        {phase === 'failed' ? <ErrorView message={turn?.error?.message ?? undefined} onHome={reset} /> : null}
      </AuradinGround>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1},
});
