import assert from 'node:assert/strict';

import {
  AUTH_REFRESH_TEMPORARILY_UNAVAILABLE_CODE,
  AuthRefreshTemporarilyUnavailableError,
  BackendApiError,
  requestBackendJson,
  setBackendAuthTokenProvider,
  setBackendAuthTokenRefreshProvider,
} from './backendApi';

type RecordedRequest = {
  authorization: string | null;
  url: string;
};

function backendResponse(status: number): Response {
  const ok = status >= 200 && status < 300;

  return {
    json: async () => ok
      ? {data: {ok: true}}
      : {data: null, error: {code: 'INVALID_TOKEN', message: 'Unauthorized'}},
    ok,
    status,
  } as Response;
}

async function run() {
  const originalFetch = globalThis.fetch;
  const requests: RecordedRequest[] = [];
  let currentToken: string | null = null;
  let refreshCalls = 0;

  globalThis.fetch = (async (input, init) => {
    const request = {
      authorization: new Headers(init?.headers).get('Authorization'),
      url: String(input),
    };
    requests.push(request);

    const alwaysUnauthorized =
      request.url.endsWith('/definitive-session-expiry-401') ||
      request.url.endsWith('/explicit-token-401') ||
      request.url.endsWith('/explicit-null-401') ||
      request.url.endsWith('/retry-remains-401');
    const staleTokenRejected =
      (request.url.endsWith('/stale-token-401') ||
        request.url.endsWith('/stale-token-refresh-failure')) &&
      request.authorization === 'Bearer stale-token';

    return backendResponse(alwaysUnauthorized || staleTokenRejected ? 401 : 200);
  }) as typeof fetch;

  try {
    setBackendAuthTokenProvider(() => currentToken);
    const preflightRefreshForces: Array<boolean | undefined> = [];
    setBackendAuthTokenRefreshProvider(async force => {
      refreshCalls += 1;
      preflightRefreshForces.push(force);
      currentToken = 'refreshed-token';
      return currentToken;
    });

    await requestBackendJson('/auth-refresh', {baseUrl: 'https://example.test'});
    assert.equal(refreshCalls, 1);
    assert.deepEqual(preflightRefreshForces, [false]);
    assert.equal(requests.at(-1)?.authorization, 'Bearer refreshed-token');

    await requestBackendJson('/usable-token', {baseUrl: 'https://example.test'});
    assert.equal(refreshCalls, 1);
    assert.equal(requests.at(-1)?.authorization, 'Bearer refreshed-token');

    currentToken = null;
    await requestBackendJson('/anonymous', {
      authToken: null,
      baseUrl: 'https://example.test',
    });
    assert.equal(refreshCalls, 1);
    assert.equal(requests.at(-1)?.authorization, null);

    await requestBackendJson('/explicit-token', {
      authToken: 'explicit-token',
      baseUrl: 'https://example.test',
    });
    assert.equal(refreshCalls, 1);
    assert.equal(requests.at(-1)?.authorization, 'Bearer explicit-token');

    setBackendAuthTokenRefreshProvider(async () => {
      refreshCalls += 1;
      throw new AuthRefreshTemporarilyUnavailableError('temporary Cognito outage');
    });
    const transientPreflightRequestStart = requests.length;
    await assert.rejects(
      () => requestBackendJson('/refresh-failure', {baseUrl: 'https://example.test'}),
      (error: unknown) =>
        error instanceof BackendApiError &&
        error.status === 503 &&
        error.code === AUTH_REFRESH_TEMPORARILY_UNAVAILABLE_CODE,
    );
    assert.equal(refreshCalls, 2);
    assert.equal(
      requests.length,
      transientPreflightRequestStart,
      'retryable preflight refresh errors must stop before fetch',
    );

    currentToken = null;
    const definitiveExpiryRefreshForces: Array<boolean | undefined> = [];
    setBackendAuthTokenRefreshProvider(async force => {
      refreshCalls += 1;
      definitiveExpiryRefreshForces.push(force);
      return null;
    });
    const definitiveExpiryRequestStart = requests.length;
    await assert.rejects(
      () => requestBackendJson('/definitive-session-expiry-401', {
        baseUrl: 'https://example.test',
      }),
      (error: unknown) => error instanceof BackendApiError && error.status === 401,
    );
    assert.equal(requests.length - definitiveExpiryRequestStart, 1);
    assert.deepEqual(definitiveExpiryRefreshForces, [false, true]);

    currentToken = 'stale-token';
    const forcedRefreshArguments: boolean[] = [];
    setBackendAuthTokenRefreshProvider(async force => {
      refreshCalls += 1;
      forcedRefreshArguments.push(Boolean(force));
      if (force) {
        currentToken = 'refreshed-after-401';
      }
      return currentToken;
    });

    const staleRequestStart = requests.length;
    await requestBackendJson('/stale-token-401', {baseUrl: 'https://example.test'});
    assert.equal(requests.length - staleRequestStart, 2);
    assert.deepEqual(
      requests.slice(staleRequestStart).map(request => request.authorization),
      ['Bearer stale-token', 'Bearer refreshed-after-401'],
    );
    assert.deepEqual(forcedRefreshArguments, [true]);

    currentToken = 'stale-token';
    const failedForcedRefreshArguments: Array<boolean | undefined> = [];
    setBackendAuthTokenRefreshProvider(async force => {
      refreshCalls += 1;
      failedForcedRefreshArguments.push(force);
      throw new AuthRefreshTemporarilyUnavailableError('temporary Cognito outage');
    });
    const forcedRefreshFailureStart = requests.length;
    await assert.rejects(
      () => requestBackendJson('/stale-token-refresh-failure', {
        baseUrl: 'https://example.test',
      }),
      (error: unknown) =>
        error instanceof BackendApiError &&
        error.status === 503 &&
        error.code === AUTH_REFRESH_TEMPORARILY_UNAVAILABLE_CODE,
    );
    assert.equal(
      requests.length - forcedRefreshFailureStart,
      1,
      'retryable forced refresh errors must not perform a second fetch',
    );
    assert.deepEqual(failedForcedRefreshArguments, [true]);

    setBackendAuthTokenRefreshProvider(async force => {
      refreshCalls += 1;
      forcedRefreshArguments.push(Boolean(force));
      if (force) {
        currentToken = 'refreshed-after-401';
      }
      return currentToken;
    });

    const explicitTokenStart = requests.length;
    await assert.rejects(
      () => requestBackendJson('/explicit-token-401', {
        authToken: 'caller-owned-token',
        baseUrl: 'https://example.test',
      }),
      (error: unknown) => error instanceof BackendApiError && error.status === 401,
    );
    assert.equal(requests.length - explicitTokenStart, 1);
    assert.deepEqual(forcedRefreshArguments, [true]);

    const explicitNullStart = requests.length;
    await assert.rejects(
      () => requestBackendJson('/explicit-null-401', {
        authToken: null,
        baseUrl: 'https://example.test',
      }),
      (error: unknown) => error instanceof BackendApiError && error.status === 401,
    );
    assert.equal(requests.length - explicitNullStart, 1);
    assert.deepEqual(forcedRefreshArguments, [true]);

    currentToken = 'stale-token';
    const repeated401Start = requests.length;
    await assert.rejects(
      () => requestBackendJson('/retry-remains-401', {baseUrl: 'https://example.test'}),
      (error: unknown) => error instanceof BackendApiError && error.status === 401,
    );
    assert.equal(requests.length - repeated401Start, 2);
    assert.deepEqual(forcedRefreshArguments, [true, true]);
  } finally {
    setBackendAuthTokenProvider(null);
    setBackendAuthTokenRefreshProvider(null);
    globalThis.fetch = originalFetch;
  }
}

void run();
