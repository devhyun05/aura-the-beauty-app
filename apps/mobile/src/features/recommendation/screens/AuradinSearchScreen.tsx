// apps/mobile/src/features/recommendation/screens/AuradinSearchScreen.tsx
//
// AURADIN 컨트롤러 — phase 머신·세션 API·refine·보관함·데모 드라이브(로직)만 담당한다.
// 프리젠테이션은 auradin-rn DS 포팅(components/ds + screens/views, 디자인 세션 산출물)이 담당:
//   <AuradinGround dark>  ── 지반(라이트 sky→pink / searching 다크 몰입) + entry 버블 사진
//     <PersistentOrb phase> ── 단일 오브 인스턴스, phase별 위치·크기·글로만 모프 (§9 ③)
//     {phase별 View}        ── 콜백 props로만 연결 (네트워크·상태 없음)
//
// 팔레트는 features/recommendation 로컬 토큰만 사용 (가드: test:auradin-theme-scope).

import {useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {AuradinGround, PersistentOrb} from '../components/ds';
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
  createAuradinSearchSession,
  pollAuradinSearchTurn,
  refineAuradinSearch,
} from '../services/auradinSearchService';
import type {
  AuradinCandidateProduct,
  AuradinPhase,
  AuradinSearchTurn,
  RefineDial,
} from '../types';

const bubblePhoto = require('../assets/bubble-background-desaturated.jpg');

// 칩 라벨 → 실제 질의 (HomeView는 라벨만 넘긴다)
const SUGGESTION_QUERIES: Record<string, string> = {
  '쿨톤 글로시 립': '쿨톤 글로시 립, 2만원 이하',
  '면접용 블러셔': '면접용 자연스러운 블러셔',
  '올리브영에서만': '올리브영에서 살 수 있는 데일리 립',
};

const DEFAULT_QUERY = '쿨톤 글로시 립, 2만원 이하';
const SEARCH_MS = 2300;
const PICK_MS = 1700;

export type AuradinDriveParams = {
  prompt?: string; // 딥링크 검색 자동 시작 (예: 리포트 화면 → aiarmakeup://auradin-search?prompt=…)
  open?: string; // QA·데모: results에서 role(anchor|diverse|discovery) 카드 상세 열기
  dial?: string; // QA·데모: refine 다이얼 (more_similar|more_diverse)
  ts?: string; // 같은 명령 반복용 nonce
};

export function AuradinSearchScreen({drive}: {drive?: AuradinDriveParams} = {}) {
  const [phase, setPhase] = useState<AuradinPhase>('home');
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [turn, setTurn] = useState<AuradinSearchTurn | null>(null);
  const [answering, setAnswering] = useState(false);
  const [refining, setRefining] = useState(false);
  const [selected, setSelected] = useState<AuradinCandidateProduct | null>(null);
  const [saved, setSaved] = useState<AuradinCandidateProduct[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const cancelled = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
      clearTimeout(timer.current);
    };
  }, []);

  // 백엔드가 즉답해도 searching 오브를 최소 표시시간만큼 유지 (calm — DS 규칙)
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
  const refine = (dial: RefineDial) => {
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
    setSaved((current) =>
      current.some((item) => item.id === product.id)
        ? current.filter((item) => item.id !== product.id)
        : [...current, product],
    );
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
      <AuradinGround
        dark={phase === 'searching'}
        photoSource={bubblePhoto}
        photoVisible={phase === 'home'}>
        <PersistentOrb phase={phase} />

        {phase === 'home' ? (
          <HomeView
            onOpenSaved={saved.length ? () => setPhase('saved') : undefined}
            onPickSuggestion={(label) => submit(SUGGESTION_QUERIES[label] ?? label)}
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
