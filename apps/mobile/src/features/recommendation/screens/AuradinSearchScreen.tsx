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
import {buildRequestParts, type AuradinAttachment} from '../attachments';

// 칩 라벨 → 실제 질의 (HomeView는 라벨만 넘긴다)
const SUGGESTION_QUERIES: Record<string, string> = {
  '쿨톤 글로시 립': '쿨톤 글로시 립, 2만원 이하',
  '면접용 블러셔': '면접용 자연스러운 블러셔',
  '올리브영에서만': '올리브영에서 살 수 있는 데일리 립',
};

// 첨부만/공백으로 보낼 때의 중립 broad 시드 — 백엔드가 '어느 부위' 스코프 질문을 묻게 한다(§4).
const BROAD_SEED = '추천해줘';
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
    const typed = (raw?.trim() ? raw.trim() : query.trim()).trim();
    const parts = buildRequestParts(attachments);
    // 타이핑 + 필터 첨부 표준구. 비면(리포트만/공백) broad 시드로 스코프 질문 유도.
    const effective = [typed, parts.promptSuffix].filter(Boolean).join(' ').trim();
    const prompt = effective || BROAD_SEED;
    setQuery(typed); // 표시는 사용자가 친 것만 유지 (첨부는 칩으로 별도 표시)
    setAnswering(false);
    setSelected(null);
    const context = parts.context.personalColor ? {personalColor: parts.context.personalColor} : undefined;
    void runWithSearching(SEARCH_MS, async () => {
      const created = await createAuradinSearchSession({prompt, reportId: parts.reportId, context});
      sessionIdRef.current = created.sessionId;
      return pollAuradinSearchTurn(created.sessionId);
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
      <AuradinGround dark={phase === 'searching'}>
        <PersistentOrb phase={phase} />

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
            onPickSuggestion={(label) => submit(SUGGESTION_QUERIES[label] ?? label)}
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
