// A5 익명 토큰 (익명식별 RFC §2.1) — 서버 발급 opaque token을 OS secure storage에 저장하고
// 이벤트 관련 요청에 X-Auradin-Anon-Token 헤더로 전달한다.
//
// - token은 서버가 발급한 128-bit+ 무작위 값이다. IDFA/광고 ID/기기식별자 미사용(RFC §2.1-1).
// - 서버는 원문 token을 저장하지 않고 HMAC으로 anon:v1 owner만 파생한다 — 클라이언트가
//   owner_subject를 직접 제출하는 경로는 없다.
// - 모든 실패는 fail-open null: 헤더가 생략되고 서버가 이벤트를 skip할 뿐, 검색 UX는 정상.
// - 앱 삭제로 secure storage가 사라지면 새 token = 새 익명 ID다(RFC §2.1-5).

import {
  getBackendApiBaseUrl,
  requestBackendJson,
} from '../../../shared/services/backendApi';

export const AURADIN_ANON_TOKEN_HEADER = 'X-Auradin-Anon-Token';

const ANON_TOKEN_STORAGE_KEY = 'aura.auradin.anon.token.v1';
// 이벤트 배선은 best-effort — 발급이 느리면 짧게 포기하고 이번 요청은 헤더 없이 나간다.
// 검색 create/refine/answer는 발급을 await하지 않지만(즉시 헤더 경로), 백그라운드 prewarm과
// 이벤트 배치 경로가 매다는 상한은 짧게 둔다.
const ISSUE_TIMEOUT_MS = 1500;
// 발급 실패 후 이 기간 동안은 재발급 없이 즉시 null(negative cache) — 토큰 장애 시 매 요청
// 재시도로 인한 반복 지연을 막는다. backoff가 지나면 다음 호출이 다시 시도한다.
const ISSUE_FAILURE_BACKOFF_MS = 30000;

export type AnonTokenDeps = {
  loadToken: () => Promise<string | null>;
  saveToken: (token: string) => Promise<void>;
  issueToken: () => Promise<string | null>;
};

// expo-secure-store는 네이티브 모듈 — 기본 deps에서만 lazy import해 node 기반
// 계약 러너가 이 모듈을 로드해도 네이티브 의존이 당겨오지 않게 한다.
async function loadStoredToken(): Promise<string | null> {
  const SecureStore = await import('../../../shared/services/localSecureStore');
  return SecureStore.getItemAsync(ANON_TOKEN_STORAGE_KEY);
}

async function saveStoredToken(token: string): Promise<void> {
  const SecureStore = await import('../../../shared/services/localSecureStore');
  await SecureStore.setItemAsync(ANON_TOKEN_STORAGE_KEY, token);
}

async function issueTokenFromBackend(): Promise<string | null> {
  const response = await requestBackendJson<{token?: string | null}>(
    '/search/events/token',
    {method: 'POST', timeoutMs: ISSUE_TIMEOUT_MS},
  );
  const token = typeof response.token === 'string' ? response.token.trim() : '';
  return token || null;
}

const defaultDeps: AnonTokenDeps = {
  loadToken: loadStoredToken,
  saveToken: saveStoredToken,
  issueToken: issueTokenFromBackend,
};

// 주입 가능한 코어 — 단위 테스트는 fake deps로 저장/재사용/fail-open 계약을 검증한다.
export async function getOrCreateAnonTokenWith(
  deps: AnonTokenDeps,
): Promise<string | null> {
  let stored: string | null = null;

  try {
    stored = (await deps.loadToken())?.trim() || null;
  } catch {
    // 저장소 읽기 실패 → 없는 것으로 보고 발급을 시도한다 (fail-open).
    stored = null;
  }

  if (stored) {
    return stored;
  }

  let issued: string | null = null;

  try {
    issued = (await deps.issueToken())?.trim() || null;
  } catch {
    return null; // 발급 실패 — 이벤트만 skip되고 검색은 정상 (fail-open).
  }

  if (!issued) {
    return null;
  }

  try {
    await deps.saveToken(issued);
  } catch {
    // 저장 실패해도 이번 실행은 발급 token을 그대로 쓴다 — 다음 실행에서 재발급(RFC §2.1-5).
  }

  return issued;
}

// negative cache + in-flight 공유를 담는 상태. 주입 가능한 orchestrator가 이 state를 갱신해
// 단위 테스트가 시계/deps로 backoff·prewarm 계약을 네이티브 모듈 없이 검증한다.
export type AnonTokenState = {
  cachedToken: string | null;
  inFlight: Promise<string | null> | null;
  negativeCacheUntil: number;
};

export function createAnonTokenState(): AnonTokenState {
  return {cachedToken: null, inFlight: null, negativeCacheUntil: 0};
}

// 저장/발급 코어에 negative cache와 in-flight 공유를 씌운 orchestrator (주입 가능).
// - 캐시된 token이 있으면 즉시 반환.
// - 최근 발급 실패(backoff 이내)면 재발급 없이 즉시 null — 토큰 장애 시 반복 지연을 막는다.
// - 동시 호출은 in-flight promise를 공유해 중복 발급을 막는다. null(실패)은 캐시하지 않아
//   backoff가 지나면 다음 호출이 재시도한다.
export async function resolveAnonTokenWith(
  state: AnonTokenState,
  deps: AnonTokenDeps,
  nowMs: () => number = Date.now,
  backoffMs = ISSUE_FAILURE_BACKOFF_MS,
): Promise<string | null> {
  if (state.cachedToken) {
    return state.cachedToken;
  }
  if (nowMs() < state.negativeCacheUntil) {
    return null; // negative cache — 대기 없이 즉시 fail-open.
  }
  if (!state.inFlight) {
    state.inFlight = getOrCreateAnonTokenWith(deps)
      .then((token) => {
        state.cachedToken = token;
        state.negativeCacheUntil = token ? 0 : nowMs() + backoffMs;
        return token;
      })
      .catch(() => {
        // 코어는 자체 fail-open(null)이라 여기 도달하지 않지만 방어적으로 backoff를 건다.
        state.negativeCacheUntil = nowMs() + backoffMs;
        return null;
      })
      .finally(() => {
        state.inFlight = null;
      });
  }
  return state.inFlight;
}

// 메모리에 이미 있는 token만 동기 반환 — 없으면 헤더 생략 + 백그라운드 prewarm에 쓴다.
export function anonEventHeadersImmediateFrom(
  state: AnonTokenState,
  onMiss: () => void = () => {},
): Record<string, string> {
  if (state.cachedToken) {
    return {[AURADIN_ANON_TOKEN_HEADER]: state.cachedToken};
  }
  onMiss(); // 이후 요청을 위해 백그라운드 준비를 트리거(대기하지 않는다).
  return {};
}

const moduleState = createAnonTokenState();

// 저장된 토큰 반환, 없으면 발급 API 호출 후 secure storage에 저장. 실패 시 null(fail-open).
// negative cache/in-flight 공유로 토큰 장애 시에도 반복 발급을 트리거하지 않는다.
export async function getOrCreateAnonToken(): Promise<string | null> {
  if (!getBackendApiBaseUrl()) {
    return null; // mock/오프라인 데모 — 발급 경로가 없다.
  }
  return resolveAnonTokenWith(moduleState, defaultDeps);
}

// 메모리 캐시 token을 동기 반환한다(발급·대기·저장소 접근 없음). 없으면 null.
export function getCachedAnonToken(): string | null {
  return moduleState.cachedToken;
}

// 토큰을 백그라운드에서 미리 준비한다(fire-and-forget) — 검색 흐름을 막지 않는다.
// 이미 준비됐거나 backoff 중이면 아무것도 하지 않는다(불필요한 발급 방지).
export function prewarmAnonToken(): void {
  if (!getBackendApiBaseUrl()) {
    return;
  }
  if (moduleState.cachedToken || Date.now() < moduleState.negativeCacheUntil) {
    return;
  }
  void getOrCreateAnonToken().catch(() => {
    // fail-open — prewarm 실패는 검색 UX와 무관.
  });
}

// 이벤트 관련 요청용 헤더(async) — 발급을 기다려서라도 token을 붙인다. 이벤트 배치 경로처럼
// 이미 백그라운드인 호출부용. token이 없으면 헤더를 생략한다(서버가 fail-open으로 skip).
export async function auradinAnonEventHeaders(): Promise<Record<string, string>> {
  const token = await getOrCreateAnonToken();
  return token ? {[AURADIN_ANON_TOKEN_HEADER]: token} : {};
}

// 검색 요청용 즉시 헤더 — 메모리 캐시 token이 있으면 붙이고, 없으면 **대기 없이** 헤더를
// 생략한 뒤 백그라운드 prewarm을 트리거한다(모듈 최초 사용 시 fire-and-forget prewarm 포함).
// 발급을 await하지 않으므로 토큰 장애가 create/refine/answer를 지연시키지 않는다(fail-open).
export function auradinAnonEventHeadersImmediate(): Record<string, string> {
  return anonEventHeadersImmediateFrom(moduleState, prewarmAnonToken);
}

export function resetAnonTokenCacheForTest(): void {
  moduleState.cachedToken = null;
  moduleState.inFlight = null;
  moduleState.negativeCacheUntil = 0;
}
