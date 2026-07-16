// Auradin 검색 세션 API 클라이언트 + 백엔드 SearchTurn → 화면 소비 형태 매퍼.
//
// dev의 AuradinSearchScreen은 mock(auradinDraftMock) + 가짜 타이머로 돌았다.
// 여기서 실백엔드(§8 세션 API)를 붙이되, 화면이 이미 쓰는 타입(AuradinQuestion /
// AuradinCandidateProduct)으로 그대로 매핑해 render 코드는 손대지 않는다.
// role/source/구조화 reason은 데이터로만 관통시켜 두고, 시각화(3역할·근거 카드)는 다음 단계.
//
// 백엔드 URL이 없을 때 fixture는 명시적으로 켠 개발 환경에서만 노출한다.

import {
  getBackendApiBaseUrl,
  isRequestAbortedError,
  requestBackendJson,
} from '../../../shared/services/backendApi';
import {auradinAnonEventHeaders, auradinAnonEventHeadersImmediate} from './auradinAnonToken';
import {auradinDraftMock} from '../mocks/auradin.mock';
import type {
  AuradinAppliedFilter,
  AuradinCandidateProduct,
  AuradinProductRole,
  AuradinQuestionOption,
  AuradinReason,
  AuradinSearchPhase,
  AuradinSearchTurn,
  AuradinSimilarIntent,
  AuradinSwatch,
  AuradinTextureKind,
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
  externalSource?: string | null;
  shadeId?: string | null;
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
  offerId?: string | null;
  reason?: Partial<AuradinReason> | null;
  reasonCopy?: string | null; // §6 가산 카피 (구조화 reason이 권위값)
};

type BackendAppliedFilter = {
  label?: string | null;
  source?: string | null;
  confidence?: number | null;
  coverage?: string | null;
  coverageCaveat?: string | null;
};

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
  // A9 create 멱등성 — 같은 논리적 submit의 네트워크 재시도는 같은 id를 재사용한다.
  clientRequestId?: string;
};

// A9: RN 환경에 crypto.randomUUID가 없어 v4 형식을 직접 생성한다 — 멱등 키 용도로 충분.
export function makeClientRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

// ------------------------------------------------------------------ mapping helpers

const NEUTRAL_SWATCH = '#E4D6D2'; // 스와치 매핑이 없는 옵션 타일용 (라벨이 의미 전달)

// §8.2-3 colorFamily 스와치: 단색 → 계열 내 밝기 범위 3색 그라데이션 (light → base → deep).
// 가운데 스톱은 기존 단색 hex를 유지해 계열 아이덴티티가 흔들리지 않게 한다.
const COLOR_FAMILY_GRADIENT: Record<string, [string, string, string]> = {
  pink: ['#F8CBD7', '#F2A6B8', '#D97E95'],
  rose: ['#EAB6C3', '#D98BA0', '#B96A82'],
  coral: ['#F8B39C', '#F2896B', '#D6684C'],
  red: ['#EA8B95', '#D65563', '#AC3A48'],
  orange: ['#F3AC7E', '#E8844A', '#C56430'],
  mauve: ['#D2B3C6', '#B58AA6', '#936785'],
  brown: ['#B28B79', '#8B5E4E', '#663F31'],
  nude: ['#EAD5C4', '#D8B79E', '#BA9276'],
  peach: ['#F7C6B1', '#F0A488', '#D67F60'],
  burgundy: ['#A4576A', '#7B2E3B', '#571C27'],
  plum: ['#B0879F', '#8E5A79', '#6B3F5A'],
};

// §8.2-1 finish/texture 옵션 → 추상 질감 스와치 4종 매핑. 자체 제작 렌더만 사용 —
// 대표 제품 썸네일(§8.2-2)·생성형 발색 이미지(§8.2-5)는 금지. 매핑이 애매한 값
// (satin/sheer는 광택 계열로 근사, palette는 제형이 아니라 포맷)은 중립 폴백.
const FINISH_TEXTURE_KIND: Record<string, Record<string, AuradinTextureKind>> = {
  finish: {
    glossy: 'glossy',
    matte: 'matte',
    velvet: 'velvet',
    shimmer: 'shimmer',
    satin: 'glossy',
    sheer: 'glossy',
  },
  texture: {
    gloss: 'glossy',
    tint: 'glossy',
    liquid: 'glossy',
    balm: 'velvet',
    cream: 'velvet',
    powder: 'matte',
  },
};

const VALID_PHASES: readonly AuradinSearchPhase[] = [
  'searching',
  'question',
  'results',
  'failed',
  'expired',
];

const VALID_ROLES: readonly AuradinProductRole[] = ['anchor', 'diverse', 'discovery'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function optionSwatch(option: BackendQuestionOption): AuradinSwatch | undefined {
  const delta = option.filterDelta ?? undefined;
  if (!delta || delta.op === 'noop') {
    return undefined; // noop("상관 없어요") → skip 타일 (QuestionView가 swatch 없는 걸 skip으로 렌더)
  }
  const attribute = delta.attribute ?? '';
  const value = (delta.values ?? [])[0] ?? '';
  if (attribute === 'colorFamily') {
    const gradient = COLOR_FAMILY_GRADIENT[value];
    return gradient ? {kind: 'gradient', colors: gradient} : NEUTRAL_SWATCH;
  }
  const texture = FINISH_TEXTURE_KIND[attribute]?.[value];
  if (texture) {
    return {kind: 'texture', texture};
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
  const priceKrw =
    typeof product.price === 'number'
      ? product.price
      : typeof product.priceKrw === 'number'
        ? product.priceKrw
        : undefined;
  const role = VALID_ROLES.includes(product.role as AuradinProductRole)
    ? (product.role as AuradinProductRole)
    : undefined;

  const id = String(product.id ?? '');
  return {
    id,
    shadeId: product.shadeId ? String(product.shadeId) : undefined,
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
    externalSource:
      product.externalSource === 'auradin_catalog' || product.externalSource === 'auradin_search'
        ? product.externalSource
        : UUID_PATTERN.test(id)
          ? undefined
          : 'auradin_search',
    reason,
    reasonCopy: typeof product.reasonCopy === 'string' && product.reasonCopy ? product.reasonCopy : undefined,
    matchRate: typeof product.matchRate === 'number' ? product.matchRate : undefined,
    purchaseUrl: product.purchaseUrl ?? undefined,
    offerId: product.offerId ?? undefined,
    imageUrl,
    category: product.category ?? undefined,
    priceKrw,
  };
}

function mapAppliedFilters(filters: BackendAppliedFilter[] | null | undefined): AuradinAppliedFilter[] {
  if (!Array.isArray(filters)) {
    return [];
  }
  return filters
    .map((filter) => {
      const baseLabel = String(filter?.label ?? '').trim();
      const unknownSuffix = filter?.coverage === 'partial_unknown' ? ' · 정보 미상 포함' : '';
      return {label: `${baseLabel}${baseLabel ? unknownSuffix : ''}`, source: String(filter?.source ?? 'prompt')};
    })
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
      .filter((product) => product.imageUrl && (product.purchaseUrl || product.offerId))
      .map(mapCandidate),
    headerLabel: turn.result?.headerLabel ?? undefined,
    appliedFilters: mapAppliedFilters(turn.appliedFilters),
    error: turn.error ?? null,
  };
}

// ------------------------------------------------------------------ mock fallback

let mockSessionCounter = 0;
let mockAnswered = false;
const fixtureEnabled = __DEV__ && process.env.EXPO_PUBLIC_PRODUCT_RECOMMENDATION_FIXTURE === '1';

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
    if (!fixtureEnabled) {
      return {sessionId: 'backend-unavailable', phase: 'searching', retryAfterMs: 0};
    }
    mockAnswered = false;
    mockSessionCounter += 1;
    return {sessionId: `mock-${mockSessionCounter}`, phase: 'searching', retryAfterMs: 400};
  }

  // A5 익명식별 — create는 서버사이드 session_start 수집 지점. 즉시 가용 토큰만 붙이고,
  // 없으면 대기 없이 헤더 생략 + 백그라운드 prewarm(토큰 발급이 검색을 지연시키지 않는다, fail-open).
  return requestBackendJson<SessionAck>('/search/sessions', {
    method: 'POST',
    signal,
    headers: auradinAnonEventHeadersImmediate(),
    body: {
      prompt: request.prompt,
      reportId: request.reportId,
      source: request.source,
      context: request.context ?? undefined,
      clientRequestId: request.clientRequestId ?? undefined,
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
    if (!fixtureEnabled) {
      return {sessionId, phase: 'searching', retryAfterMs: 0};
    }
    return {sessionId, phase: 'searching', retryAfterMs: 400};
  }

  // A5 익명식별 — refine은 서버사이드 refine_dial/refine_prompt 수집 지점.
  // 즉시 가용 토큰만 붙이고 없으면 대기 없이 생략 + 백그라운드 prewarm(fail-open).
  return requestBackendJson<SessionAck>(
    `/search/sessions/${encodeURIComponent(sessionId)}/refine`,
    {
      method: 'POST',
      signal,
      headers: auradinAnonEventHeadersImmediate(),
      body: {dial: input.dial, prompt: input.prompt},
    },
  );
}

export type AuradinSimilarInput = {
  productId: string;
  intent?: AuradinSimilarIntent;
  // B6 재시도 멱등 키 — 사용자 행동(탭)마다 새 UUID. 미지정이면 호출마다 새로 생성한다.
  clientRequestId?: string;
};

// B6 §10.3-2 similar — 서버 rankedCache 내 λ=0.9 재랭킹(재검색 0). refine과 같은 ack/poll 계약.
// clientRequestId는 사용자 행동마다 새 UUID를 부여한다: 서로 다른 탭(같은 productId·intent라도)은
// 별개 요청으로 처리되고, 한 요청의 네트워크 재시도만 같은 body(=같은 id)를 재사용해 무저장 no-op이
// 된다. 서버는 clientRequestId가 있으면 fingerprint 폴백 대신 이 키로 재시도 멱등을 판정한다.
export async function similarAuradinSearch(
  sessionId: string,
  input: AuradinSimilarInput,
  signal?: AbortSignal,
): Promise<SessionAck> {
  if (!getBackendApiBaseUrl()) {
    return {sessionId, phase: 'searching', retryAfterMs: 400};
  }

  const clientRequestId = input.clientRequestId ?? makeClientRequestId();
  return requestBackendJson<SessionAck>(
    `/search/sessions/${encodeURIComponent(sessionId)}/similar`,
    {
      method: 'POST',
      signal,
      body: {productId: input.productId, intent: input.intent, clientRequestId},
    },
  );
}

export async function answerAuradinQuestion(
  sessionId: string,
  questionId: string,
  optionId: string,
  signal?: AbortSignal,
): Promise<SessionAck> {
  if (!getBackendApiBaseUrl()) {
    if (!fixtureEnabled) {
      return {sessionId, phase: 'searching', retryAfterMs: 0};
    }
    mockAnswered = true;
    return {sessionId, phase: 'searching', retryAfterMs: 400};
  }

  // A5 익명식별 — answer는 서버사이드 question_answered 수집 지점.
  // 즉시 가용 토큰만 붙이고 없으면 대기 없이 생략 + 백그라운드 prewarm(fail-open).
  return requestBackendJson<SessionAck>(
    `/search/sessions/${encodeURIComponent(sessionId)}/answer`,
    {
      method: 'POST',
      signal,
      headers: auradinAnonEventHeadersImmediate(),
      body: {questionId, optionId},
    },
  );
}

// 세션이 searching이면 retryAfterMs 후 재시도. in-memory 백엔드는 보통 즉시 확정되지만 방어적으로.
export async function pollAuradinSearchTurn(
  sessionId: string,
  {maxAttempts = 6, signal}: {maxAttempts?: number; signal?: AbortSignal} = {},
): Promise<AuradinSearchTurn> {
  if (!getBackendApiBaseUrl()) {
    if (!fixtureEnabled) {
      return {
        sessionId,
        phase: 'failed',
        thinking: [],
        candidates: [],
        error: {message: '제품 catalog 서버가 연결되지 않았어요. 연결 후 다시 시도해 주세요.'},
      };
    }
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

// ------------------------------------------------------------------ A5 events (§7.2)

// 모바일이 직접 방출하는 상호작용 이벤트 부분집합 — 서버사이드 수집(session_start/
// question_answered/impression/refine_*)은 백엔드가 담당한다.
export type AuradinClientEventType =
  | 'product_open'
  | 'purchase_click'
  | 'save'
  | 'unsave'
  | 'hide'
  | 'unhide';

export type AuradinClientEvent = {
  clientEventId: string; // 재시도 멱등 키 — 서버 유니크는 (owner, clientEventId)
  eventType: AuradinClientEventType;
  occurredAt: string; // ISO — 클라이언트 발생 시각 (서버 수신 시각과 분리)
  sessionId?: string;
  turnId?: string;
  resultSetId?: string;
  productId?: string;
  category?: string;
  rank?: number;
  role?: string;
  matchRate?: number;
  // 구조화 값만 — raw 검색어/프롬프트 원문은 절대 싣지 않는다 (서버 allowlist가 한 번 더 거른다).
  payload?: Record<string, unknown>;
};

// A5 §7.2 — POST /search/events fire-and-forget 배치. 실패·오프라인·백엔드 미설정은
// 조용히 삼킨다(fail-open): 이벤트 기록이 추천 UX에 영향을 주면 안 된다.
// 익명 token은 X-Auradin-Anon-Token 헤더로 첨부한다 — token이 없으면 헤더가 생략되고
// 서버가 owner를 만들 수 없어 skip 후 204를 돌려준다 (익명식별 RFC §2.1/§2.2).
export function postAuradinEvents(events: AuradinClientEvent[]): void {
  if (!getBackendApiBaseUrl() || events.length === 0) {
    return;
  }
  void (async () => {
    await requestBackendJson<{accepted?: number}>('/search/events', {
      method: 'POST',
      timeoutMs: 4000,
      headers: await auradinAnonEventHeaders(),
      body: {events},
    });
  })().catch(() => {
    // best-effort — 재전송은 상위 UX 이벤트가 다시 발생할 때 새 clientEventId로 이뤄진다.
  });
}
