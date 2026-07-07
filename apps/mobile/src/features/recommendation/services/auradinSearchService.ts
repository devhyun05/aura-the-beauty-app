// Auradin 검색 세션 API 클라이언트 + 백엔드 SearchTurn → 화면 소비 형태 매퍼.
//
// dev의 AuradinSearchScreen은 mock(auradinDraftMock) + 가짜 타이머로 돌았다.
// 여기서 실백엔드(§8 세션 API)를 붙이되, 화면이 이미 쓰는 타입(AuradinQuestion /
// AuradinCandidateProduct)으로 그대로 매핑해 render 코드는 손대지 않는다.
// role/source/구조화 reason은 데이터로만 관통시켜 두고, 시각화(3역할·근거 카드)는 다음 단계.
//
// 백엔드 URL(EXPO_PUBLIC_API_BASE_URL)이 없으면 dev의 오프라인 mock 데모 흐름을 유지한다.

import {
  getBackendApiBaseUrl,
  isRequestAbortedError,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {auradinDraftMock} from '../mocks/auradin.mock';
import type {
  AuradinAppliedFilter,
  AuradinCandidateProduct,
  AuradinProductRole,
  AuradinQuestionOption,
  AuradinReason,
  AuradinSearchPhase,
  AuradinSearchTurn,
} from '../types';

// ------------------------------------------------------------------ backend shapes

type BackendFilterDelta = {
  attribute?: string | null;
  op?: string | null;
  values?: string[] | null;
};

type BackendQuestionOption = {
  id?: string | null;
  label?: string | null;
  filterDelta?: BackendFilterDelta | null;
};

type BackendQuestion = {
  id?: string | null;
  title?: string | null;
  options?: BackendQuestionOption[] | null;
};

type BackendProduct = {
  id?: string | null;
  role?: string | null;
  source?: string | null;
  brandName?: string | null;
  productName?: string | null;
  shadeName?: string | null;
  category?: string | null;
  matchRate?: number | null;
  price?: number | null;
  priceKrw?: number | null;
  tags?: string[] | null;
  palette?: string[] | null;
  imageUrl?: string | null;
  purchaseUrl?: string | null;
  reason?: Partial<AuradinReason> | null;
  reasonCopy?: string | null; // §6 가산 카피 (구조화 reason이 권위값)
};

type BackendAppliedFilter = {label?: string | null; source?: string | null; confidence?: number | null};

type BackendSearchTurn = {
  sessionId?: string | null;
  phase?: string | null;
  thinking?: AuradinSearchTurn['thinking'] | null;
  question?: BackendQuestion | null;
  result?: {headerLabel?: string | null; products?: BackendProduct[] | null} | null;
  appliedFilters?: BackendAppliedFilter[] | null; // 최상위, 전 phase 존재
  error?: AuradinSearchTurn['error'];
  retryAfterMs?: number | null;
};

type SessionAck = {sessionId: string; phase: string; retryAfterMs?: number | null};

export type CreateAuradinSessionRequest = {
  prompt: string;
  reportId?: string | null;
  source?: string;
  // §3 리포트 톤 client-relay (로컬/무DB에서도 톤 반영). 향후 자료도 여기로 확장.
  context?: {personalColor?: string} | null;
};

// ------------------------------------------------------------------ mapping helpers

const NEUTRAL_SWATCH = '#E4D6D2'; // 색 질문이 아닌 옵션 타일용 (라벨이 의미 전달)

const COLOR_FAMILY_HEX: Record<string, string> = {
  pink: '#F2A6B8',
  rose: '#D98BA0',
  coral: '#F2896B',
  red: '#D65563',
  orange: '#E8844A',
  mauve: '#B58AA6',
  brown: '#8B5E4E',
  nude: '#D8B79E',
  peach: '#F0A488',
  burgundy: '#7B2E3B',
  plum: '#8E5A79',
};

const VALID_PHASES: readonly AuradinSearchPhase[] = [
  'searching',
  'question',
  'results',
  'failed',
  'expired',
];

const VALID_ROLES: readonly AuradinProductRole[] = ['anchor', 'diverse', 'discovery'];

function normalizePhase(phase: string | null | undefined): AuradinSearchPhase {
  return VALID_PHASES.includes(phase as AuradinSearchPhase)
    ? (phase as AuradinSearchPhase)
    : 'failed';
}

function formatPrice(value: number | null | undefined): string {
  // DS 규칙: 가격은 항상 "18,000원" 포맷 (₩ 프리픽스 금지, mono로 렌더)
  const won = Math.max(0, Math.round(Number(value) || 0));
  return `${won.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

function normalizeReason(reason: Partial<AuradinReason> | null | undefined): AuradinReason {
  return {
    matchedOn: Array.isArray(reason?.matchedOn) ? reason!.matchedOn : [],
    inferred: Array.isArray(reason?.inferred) ? reason!.inferred : [],
    caveat: Array.isArray(reason?.caveat) ? reason!.caveat : [],
  };
}

function optionSwatch(option: BackendQuestionOption): string | undefined {
  const delta = option.filterDelta ?? undefined;
  if (!delta || delta.op === 'noop') {
    return undefined; // noop("상관 없어요") → skip 타일 (QuestionView가 swatch 없는 걸 skip으로 렌더)
  }
  if (delta.attribute === 'colorFamily') {
    const value = (delta.values ?? [])[0] ?? '';
    return COLOR_FAMILY_HEX[value] ?? NEUTRAL_SWATCH;
  }
  return NEUTRAL_SWATCH;
}

export function mapQuestionOption(option: BackendQuestionOption): AuradinQuestionOption {
  return {
    id: String(option.id ?? ''),
    label: String(option.label ?? ''),
    swatch: optionSwatch(option),
  };
}

export function mapCandidate(product: BackendProduct): AuradinCandidateProduct {
  const reason = normalizeReason(product.reason);
  const matchSummary =
    reason.matchedOn.join(' · ') || (product.tags ?? []).filter(Boolean).join(' · ') || '조건에 가까운 후보';
  const imageUrl = product.imageUrl ?? undefined;
  const role = VALID_ROLES.includes(product.role as AuradinProductRole)
    ? (product.role as AuradinProductRole)
    : undefined;

  return {
    id: String(product.id ?? ''),
    brandName: String(product.brandName ?? ''),
    productName: String(product.productName ?? ''),
    shadeName: String(product.shadeName ?? ''),
    priceText: formatPrice(product.price ?? product.priceKrw),
    matchSummary,
    palette: Array.isArray(product.palette) ? product.palette : [],
    tags: Array.isArray(product.tags) ? product.tags : [],
    imageSource: {uri: imageUrl},
    role,
    source: product.source === 'live_naver' ? 'live_naver' : 'curated',
    reason,
    reasonCopy: typeof product.reasonCopy === 'string' && product.reasonCopy ? product.reasonCopy : undefined,
    matchRate: typeof product.matchRate === 'number' ? product.matchRate : undefined,
    purchaseUrl: product.purchaseUrl ?? undefined,
    imageUrl,
    category: product.category ?? undefined,
  };
}

function mapAppliedFilters(filters: BackendAppliedFilter[] | null | undefined): AuradinAppliedFilter[] {
  if (!Array.isArray(filters)) {
    return [];
  }
  return filters
    .map((filter) => ({label: String(filter?.label ?? '').trim(), source: String(filter?.source ?? 'prompt')}))
    .filter((filter) => filter.label.length > 0);
}

export function mapSearchTurn(turn: BackendSearchTurn): AuradinSearchTurn {
  const products = Array.isArray(turn.result?.products) ? turn.result!.products! : [];
  return {
    sessionId: String(turn.sessionId ?? ''),
    phase: normalizePhase(turn.phase),
    thinking: Array.isArray(turn.thinking) ? turn.thinking : [],
    question: turn.question
      ? {
          id: String(turn.question.id ?? ''),
          title: String(turn.question.title ?? ''),
          options: (turn.question.options ?? []).map(mapQuestionOption),
        }
      : undefined,
    // 구매 가능한 카드만 (백엔드도 보장하지만 방어적으로).
    candidates: products
      .filter((product) => product.imageUrl && product.purchaseUrl)
      .map(mapCandidate),
    headerLabel: turn.result?.headerLabel ?? undefined,
    appliedFilters: mapAppliedFilters(turn.appliedFilters),
    error: turn.error ?? null,
  };
}

// ------------------------------------------------------------------ mock fallback

let mockSessionCounter = 0;
let mockAnswered = false;

function buildMockTurn(sessionId: string): AuradinSearchTurn {
  if (!mockAnswered) {
    return {
      sessionId,
      phase: 'question',
      thinking: auradinDraftMock.thinkingSteps,
      question: auradinDraftMock.question,
      candidates: [],
    };
  }
  return {
    sessionId,
    phase: 'results',
    thinking: auradinDraftMock.thinkingSteps,
    candidates: auradinDraftMock.candidates,
    headerLabel: '조건에 가까운 제품을 골랐어요',
  };
}

// ------------------------------------------------------------------ public API

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export async function createAuradinSearchSession(
  request: CreateAuradinSessionRequest,
  signal?: AbortSignal,
): Promise<SessionAck> {
  if (!getBackendApiBaseUrl()) {
    mockAnswered = false;
    mockSessionCounter += 1;
    return {sessionId: `mock-${mockSessionCounter}`, phase: 'searching', retryAfterMs: 400};
  }

  return requestBackendJson<SessionAck>('/search/sessions', {
    method: 'POST',
    signal,
    body: {
      prompt: request.prompt,
      reportId: request.reportId,
      source: request.source,
      context: request.context ?? undefined,
    },
  });
}

// 사용자가 검색 도중 이탈 → 세션 종료. fire-and-forget으로 호출하며 실패는 조용히 삼킨다.
export async function cancelAuradinSearchSession(sessionId: string): Promise<void> {
  if (!getBackendApiBaseUrl() || !sessionId) {
    return;
  }
  try {
    await requestBackendJson<{sessionId: string; phase: string}>(
      `/search/sessions/${encodeURIComponent(sessionId)}/cancel`,
      {method: 'POST', timeoutMs: 4000},
    );
  } catch {
    // 취소는 best-effort — 세션 없음(404)/네트워크 실패여도 UX엔 영향 없음.
  }
}

export type AuradinRefineInput = {
  dial?: 'more_similar' | 'more_diverse';
  prompt?: string;
};

// §7 refine — dial은 기존 후보 재랭킹(λ 조절), prompt는 hard/soft 병합. 재검색 아님.
export async function refineAuradinSearch(
  sessionId: string,
  input: AuradinRefineInput,
  signal?: AbortSignal,
): Promise<SessionAck> {
  if (!getBackendApiBaseUrl()) {
    return {sessionId, phase: 'searching', retryAfterMs: 400};
  }

  return requestBackendJson<SessionAck>(
    `/search/sessions/${encodeURIComponent(sessionId)}/refine`,
    {method: 'POST', signal, body: {dial: input.dial, prompt: input.prompt}},
  );
}

export async function answerAuradinQuestion(
  sessionId: string,
  questionId: string,
  optionId: string,
  signal?: AbortSignal,
): Promise<SessionAck> {
  if (!getBackendApiBaseUrl()) {
    mockAnswered = true;
    return {sessionId, phase: 'searching', retryAfterMs: 400};
  }

  return requestBackendJson<SessionAck>(
    `/search/sessions/${encodeURIComponent(sessionId)}/answer`,
    {method: 'POST', signal, body: {questionId, optionId}},
  );
}

// 세션이 searching이면 retryAfterMs 후 재시도. in-memory 백엔드는 보통 즉시 확정되지만 방어적으로.
export async function pollAuradinSearchTurn(
  sessionId: string,
  {maxAttempts = 6, signal}: {maxAttempts?: number; signal?: AbortSignal} = {},
): Promise<AuradinSearchTurn> {
  if (!getBackendApiBaseUrl()) {
    return buildMockTurn(sessionId);
  }

  let turn = await requestBackendJson<BackendSearchTurn>(
    `/search/sessions/${encodeURIComponent(sessionId)}`,
    {signal},
  );
  let attempts = 1;
  while (normalizePhase(turn.phase) === 'searching' && attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    await delay(turn.retryAfterMs ?? 350);
    turn = await requestBackendJson<BackendSearchTurn>(
      `/search/sessions/${encodeURIComponent(sessionId)}`,
      {signal},
    );
    attempts += 1;
  }
  return mapSearchTurn(turn);
}

// 화면 콜백에서 사용자 취소로 인한 abort를 조용히 삼킬지 판단.
export function isAuradinAbort(error: unknown): boolean {
  return (
    isRequestAbortedError(error) ||
    (error instanceof Error && error.name === 'AbortError')
  );
}
