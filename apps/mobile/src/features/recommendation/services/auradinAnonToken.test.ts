// A5 익명 토큰 서비스 단위 검증 (프로젝트 관례: expectEqual + tsc --noEmit 게이트).
// 주입 가능한 코어(getOrCreateAnonTokenWith)로 저장/재사용/발급/fail-open 계약을 확인한다.
// 실행 검증: tsc --module commonjs 컴파일 후 node로 직접 구동 가능(네이티브 모듈은 lazy import).

import {
  AURADIN_ANON_TOKEN_HEADER,
  anonEventHeadersImmediateFrom,
  auradinAnonEventHeaders,
  createAnonTokenState,
  getOrCreateAnonTokenWith,
  resolveAnonTokenWith,
  type AnonTokenDeps,
} from './auradinAnonToken';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

// 서버(event_logger.ANON_TOKEN_HEADER = 'x-auradin-anon-token')와 대소문자 무관 동일해야 한다.
expectEqual(
  AURADIN_ANON_TOKEN_HEADER.toLowerCase(),
  'x-auradin-anon-token',
  'header name matches server contract',
);

type CallLog = {loads: number; saves: string[]; issues: number};

function fakeDeps(overrides: Partial<AnonTokenDeps>, log: CallLog): AnonTokenDeps {
  return {
    loadToken: async () => {
      log.loads += 1;
      return null;
    },
    saveToken: async (token) => {
      log.saves.push(token);
    },
    issueToken: async () => {
      log.issues += 1;
      return 'issued-token';
    },
    ...overrides,
  };
}

async function main() {
  // --- 재사용: 저장된 token이 있으면 발급 API를 부르지 않는다 ---
  const reuseLog: CallLog = {loads: 0, saves: [], issues: 0};
  const reused = await getOrCreateAnonTokenWith(
    fakeDeps({loadToken: async () => 'stored-token'}, reuseLog),
  );
  expectEqual(reused, 'stored-token', 'stored token is reused');
  expectEqual(reuseLog.issues, 0, 'no issuance when a token is stored');
  expectEqual(reuseLog.saves.length, 0, 'no re-save when a token is stored');

  // --- 발급 + 저장: 저장된 token이 없으면 발급 후 그 값을 저장한다 ---
  const issueLog: CallLog = {loads: 0, saves: [], issues: 0};
  const issued = await getOrCreateAnonTokenWith(fakeDeps({}, issueLog));
  expectEqual(issued, 'issued-token', 'missing token triggers issuance');
  expectEqual(issueLog.issues, 1, 'issuance API called once');
  expectEqual(issueLog.saves[0], 'issued-token', 'issued token is persisted');

  // --- fail-open ①: 발급 API 실패 → null (이벤트만 skip, 검색은 정상) ---
  const issueFailLog: CallLog = {loads: 0, saves: [], issues: 0};
  const issueFailed = await getOrCreateAnonTokenWith(
    fakeDeps(
      {
        issueToken: async () => {
          throw new Error('network down');
        },
      },
      issueFailLog,
    ),
  );
  expectEqual(issueFailed, null, 'issuance failure fails open to null');
  expectEqual(issueFailLog.saves.length, 0, 'nothing persisted on issuance failure');

  // --- fail-open ②: 저장소 읽기 실패 → 없는 것으로 보고 발급을 시도한다 ---
  const loadFailLog: CallLog = {loads: 0, saves: [], issues: 0};
  const loadFailed = await getOrCreateAnonTokenWith(
    fakeDeps(
      {
        loadToken: async () => {
          throw new Error('secure storage unavailable');
        },
      },
      loadFailLog,
    ),
  );
  expectEqual(loadFailed, 'issued-token', 'storage read failure falls back to issuance');
  expectEqual(loadFailLog.issues, 1, 'issuance attempted after storage read failure');

  // --- fail-open ③: 저장 실패해도 이번 실행은 발급 token을 그대로 쓴다 ---
  const saveFailLog: CallLog = {loads: 0, saves: [], issues: 0};
  const saveFailed = await getOrCreateAnonTokenWith(
    fakeDeps(
      {
        saveToken: async () => {
          throw new Error('keychain write failed');
        },
      },
      saveFailLog,
    ),
  );
  expectEqual(saveFailed, 'issued-token', 'persist failure still returns issued token');

  // --- 빈/공백 token은 없는 것으로 취급 ---
  const blankLog: CallLog = {loads: 0, saves: [], issues: 0};
  const blank = await getOrCreateAnonTokenWith(
    fakeDeps(
      {
        loadToken: async () => '   ',
        issueToken: async () => {
          blankLog.issues += 1;
          return '';
        },
      },
      blankLog,
    ),
  );
  expectEqual(blank, null, 'blank stored/issued tokens normalize to null');
  expectEqual(blankLog.issues, 1, 'blank stored token still triggers issuance attempt');
  expectEqual(blankLog.saves.length, 0, 'blank issued token is never persisted');

  // --- 헤더 배선: 백엔드 미설정(mock 모드) → token null → 헤더 생략 ---
  // (계약 러너는 EXPO_PUBLIC_API_BASE_URL 없이 돈다 — getBackendApiBaseUrl() = null 경로)
  if (!process.env.EXPO_PUBLIC_API_BASE_URL) {
    const headers = await auradinAnonEventHeaders();
    expectEqual(
      Object.keys(headers).length,
      0,
      'no token → header omitted (server skips events, fail-open)',
    );
  }

  // --- negative cache: 발급 실패 후 backoff 동안 재발급 없이 즉시 null ---
  {
    const negLog: CallLog = {loads: 0, saves: [], issues: 0};
    const state = createAnonTokenState();
    const clock = {now: 1000};
    const backoffMs = 30000;
    const failingDeps = fakeDeps(
      {
        loadToken: async () => null,
        issueToken: async () => {
          negLog.issues += 1;
          return null; // 발급 실패
        },
      },
      negLog,
    );

    const first = await resolveAnonTokenWith(state, failingDeps, () => clock.now, backoffMs);
    expectEqual(first, null, 'issuance failure resolves to null');
    expectEqual(negLog.issues, 1, 'issuance attempted once on failure');

    // backoff 이내 재호출 — 재발급 없이 즉시 null (negative cache)
    const second = await resolveAnonTokenWith(state, failingDeps, () => clock.now, backoffMs);
    expectEqual(second, null, 'within backoff resolves to null');
    expectEqual(negLog.issues, 1, 'no re-issuance within negative-cache backoff');

    // backoff 경과 후 — 다시 발급을 시도한다
    clock.now += backoffMs + 1;
    await resolveAnonTokenWith(state, failingDeps, () => clock.now, backoffMs);
    expectEqual(negLog.issues, 2, 'issuance retried after backoff expires');
  }

  // --- 성공 발급은 캐시되고, 즉시 헤더가 그 토큰을 붙인다 ---
  {
    const okLog: CallLog = {loads: 0, saves: [], issues: 0};
    const state = createAnonTokenState();
    const okDeps = fakeDeps({loadToken: async () => null}, okLog); // issueToken → 'issued-token'

    const resolved = await resolveAnonTokenWith(state, okDeps);
    expectEqual(resolved, 'issued-token', 'successful issuance resolves token');
    expectEqual(state.cachedToken, 'issued-token', 'issued token cached in state');

    const again = await resolveAnonTokenWith(state, okDeps);
    expectEqual(again, 'issued-token', 'cached token reused without re-issuance');
    expectEqual(okLog.issues, 1, 'no second issuance when cached');

    const headers = anonEventHeadersImmediateFrom(state);
    expectEqual(
      headers[AURADIN_ANON_TOKEN_HEADER],
      'issued-token',
      'immediate header attaches cached token synchronously',
    );
  }

  // --- 즉시 헤더: 캐시 없으면 대기 없이 생략 + prewarm(onMiss) 트리거 ---
  {
    const emptyState = createAnonTokenState();
    let prewarmCalls = 0;
    const headers = anonEventHeadersImmediateFrom(emptyState, () => {
      prewarmCalls += 1;
    });
    expectEqual(Object.keys(headers).length, 0, 'no cached token → immediate header omitted');
    expectEqual(prewarmCalls, 1, 'missing token triggers background prewarm (onMiss)');
  }

  console.log('auradinAnonToken contract assertions passed');
}

main().catch((error) => {
  console.error(error);
  throw error; // unhandled rejection — node 러너가 비정상 종료로 실패를 드러낸다
});
