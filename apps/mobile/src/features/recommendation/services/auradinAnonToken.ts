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
const ISSUE_TIMEOUT_MS = 4000;

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

let cachedToken: string | null = null;
let inFlightToken: Promise<string | null> | null = null;

// 저장된 토큰 반환, 없으면 발급 API 호출 후 secure storage에 저장. 실패 시 null(fail-open).
// 동시 호출은 in-flight promise를 공유해 중복 발급을 막는다.
export async function getOrCreateAnonToken(): Promise<string | null> {
  if (!getBackendApiBaseUrl()) {
    return null; // mock/오프라인 데모 — 발급 경로가 없다.
  }

  if (cachedToken) {
    return cachedToken;
  }

  if (!inFlightToken) {
    inFlightToken = getOrCreateAnonTokenWith(defaultDeps)
      .then((token) => {
        cachedToken = token; // null이면 캐시되지 않아 다음 호출이 재시도한다.
        return token;
      })
      .finally(() => {
        inFlightToken = null;
      });
  }

  return inFlightToken;
}

// 이벤트 관련 요청용 헤더 — token이 없으면 헤더를 생략한다(서버가 fail-open으로 skip).
export async function auradinAnonEventHeaders(): Promise<Record<string, string>> {
  const token = await getOrCreateAnonToken();
  return token ? {[AURADIN_ANON_TOKEN_HEADER]: token} : {};
}

export function resetAnonTokenCacheForTest(): void {
  cachedToken = null;
  inFlightToken = null;
}
