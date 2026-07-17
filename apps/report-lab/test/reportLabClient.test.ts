import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertLoopbackApiBaseUrl,
  cancelLocalApiSession,
  createLocalApiSession,
  effectiveBypassCache,
  getLabCommitSha,
  normalizeLabCommitSha,
  retireLocalApiSession,
  runDeterministicFixture,
  runLocalApiBatch,
  runLocalApiBatchRecoveringHistory,
  type LabRunRequest,
} from '../src/api/reportLabClient.ts';
import {SYNTHETIC_FACE_REPORT_FIXTURE} from '@aura/face-report-contract/syntheticFixture';

const request: LabRunRequest = {
  fixtureId: 'synthetic-balanced-v1',
  stage: 'consult',
  overrides: {
    promptDeveloper: 'numeric-free',
    promptUser: 'render every report section',
    promptVersion: 'test-v1',
    model: 'deterministic-fixture',
    maxTokens: 'disabled',
    temperature: 'disabled',
  },
  bypassCache: true,
};
const SESSION_ID = '92fd95fb-a845-45d9-9ea4-a88953a8f295';
const CLIENT_REQUEST_ID = '72fd95fb-a845-45d9-9ea4-a88953a8f296';

test('API base is limited to unauthenticated 127.0.0.1 HTTP', () => {
  assert.equal(
    assertLoopbackApiBaseUrl('http://127.0.0.1:8000'),
    'http://127.0.0.1:8000/api',
  );
  assert.throws(() => assertLoopbackApiBaseUrl('http://localhost:8000/api'));
  assert.throws(() => assertLoopbackApiBaseUrl('https://127.0.0.1:8000/api'));
  assert.throws(() => assertLoopbackApiBaseUrl('http://user@127.0.0.1:8000/api'));
  assert.throws(() => assertLoopbackApiBaseUrl('http://127.0.0.1:8000/api?upload=true'));
  assert.throws(() => assertLoopbackApiBaseUrl('http://127.0.0.1:9000/api'));
  assert.throws(() => assertLoopbackApiBaseUrl('http://127.0.0.1:8000/other'));
});

test('cache bypass is available only for the local API runner', () => {
  assert.equal(effectiveBypassCache('local-api', true), true);
  assert.equal(effectiveBypassCache('local-api', false), false);
  assert.equal(effectiveBypassCache('fixture', true), false);
});

test('fixture runner produces a parsed report without network access', async () => {
  const result = await runDeterministicFixture(request);
  assert.equal(result.runner, 'fixture');
  assert.equal(result.status, 'completed');
  assert.match(result.inputHash, /^fixture-[0-9a-f]{8}$/);
  assert.equal(result.sessionId, null);
  assert.equal(result.normalizedOutput.schemaVersion, 'aura-face-report-view-v1');
  assert.deepEqual(result.validationErrors, []);
  assert.equal(result.rawResponseAvailable, false);
});

test('commit SHA contract uses a safe explicit value or uncommitted', () => {
  assert.equal(normalizeLabCommitSha('0123456789abcdef'), '0123456789abcdef');
  assert.equal(normalizeLabCommitSha(undefined), 'uncommitted');
  assert.equal(normalizeLabCommitSha('branch/name'), 'uncommitted');
  assert.equal(getLabCommitSha(), 'uncommitted');
});

test('local API repeats use one batch request and preserve safe run metadata', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{url: string; body: Record<string, unknown>}> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({
      data: {
        sessionId: SESSION_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        runs: [
          {
            runId: 'run-left',
            clientRequestId: CLIENT_REQUEST_ID,
            batchOrdinal: 1,
            status: 'completed',
            inputHash: 'a'.repeat(64),
            cacheHit: false,
            cachedFromRunId: null,
            normalizedOutput: SYNTHETIC_FACE_REPORT_FIXTURE,
            validationErrors: [{location: ['features', 'cards'], type: 'missing'}],
            latencyMs: 12,
            tokenUsage: null,
          },
          {
            runId: 'run-right',
            clientRequestId: CLIENT_REQUEST_ID,
            batchOrdinal: 2,
            status: 'completed',
            inputHash: 'a'.repeat(64),
            cacheHit: true,
            cachedFromRunId: 'cached-run',
            normalizedOutput: SYNTHETIC_FACE_REPORT_FIXTURE,
            validationErrors: ['legacy readable error'],
            latencyMs: 14,
            tokenUsage: 0,
          },
        ],
      },
      error: null,
    }), {status: 200, headers: {'Content-Type': 'application/json'}});
  };

  try {
    const localRequest: LabRunRequest = {
      ...request,
      overrides: {
        ...request.overrides,
        model: 'disabled',
        maxTokens: '2800',
        temperature: '0',
      },
    };
    const results = await runLocalApiBatch(
      localRequest,
      2,
      SESSION_ID,
      CLIENT_REQUEST_ID,
      undefined,
      'http://127.0.0.1:8000/api',
    );

    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, 'http://127.0.0.1:8000/api/lab/analysis/stage-run');
    assert.equal(requests[0]?.body.repeatCount, 2);
    assert.equal(requests[0]?.body.sessionId, SESSION_ID);
    assert.equal(requests[0]?.body.clientRequestId, CLIENT_REQUEST_ID);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.sessionId, '92fd95fb-a845-45d9-9ea4-a88953a8f295');
    assert.deepEqual(results[0]?.validationErrors, ['features.cards: missing']);
    assert.deepEqual(results[1]?.validationErrors, ['legacy readable error']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('local API batch rejects the whole response when any report is not strict', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: {
      sessionId: SESSION_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      runs: [
        {
          runId: 'valid-run',
          clientRequestId: CLIENT_REQUEST_ID,
          batchOrdinal: 1,
          status: 'completed',
          inputHash: 'b'.repeat(64),
          cacheHit: false,
          cachedFromRunId: null,
          normalizedOutput: SYNTHETIC_FACE_REPORT_FIXTURE,
          validationErrors: [],
          latencyMs: 10,
        },
        {
          runId: 'unsafe-run',
          clientRequestId: CLIENT_REQUEST_ID,
          batchOrdinal: 2,
          status: 'completed',
          inputHash: 'b'.repeat(64),
          cacheHit: false,
          cachedFromRunId: null,
          normalizedOutput: {...SYNTHETIC_FACE_REPORT_FIXTURE, leakedMetric: 0.9},
          validationErrors: [],
          latencyMs: 10,
        },
      ],
    },
  }), {status: 200, headers: {'Content-Type': 'application/json'}});

  try {
    await assert.rejects(
      runLocalApiBatch(
        request,
        2,
        SESSION_ID,
        CLIENT_REQUEST_ID,
        undefined,
        'http://127.0.0.1:8000/api',
      ),
      /must not contain numeric values/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('failed local runs preserve failure metadata without parsing an absent report view', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: {
      sessionId: SESSION_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      runs: [{
        runId: 'failed-run',
        clientRequestId: CLIENT_REQUEST_ID,
        batchOrdinal: 1,
        status: 'failed',
        inputHash: 'c'.repeat(64),
        cacheHit: false,
        cachedFromRunId: null,
        normalizedOutput: {},
        validationErrors: ['fixture output invalid'],
        latencyMs: 3,
        tokenUsage: null,
      }],
    },
  }), {status: 200, headers: {'Content-Type': 'application/json'}});

  try {
    const [result] = await runLocalApiBatch(
      request,
      1,
      SESSION_ID,
      CLIENT_REQUEST_ID,
      undefined,
      'http://127.0.0.1:8000/api',
    );
    assert.equal(result?.status, 'failed');
    assert.equal(result?.normalizedOutput, null);
    assert.deepEqual(result?.validationErrors, ['fixture output invalid']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('lost or unparseable stage-run responses recover completed runs from the same session history', async () => {
  const originalFetch = globalThis.fetch;
  const sessionId = SESSION_ID;

  try {
    for (const failureMode of ['response-lost', 'invalid-json'] as const) {
      const urls: string[] = [];
      globalThis.fetch = async input => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith('/analysis/stage-run')) {
          if (failureMode === 'response-lost') throw new TypeError('response lost');
          return new Response('not-json', {status: 200});
        }
        return new Response(JSON.stringify({
          data: {
            sessionId,
            clientRequestId: CLIENT_REQUEST_ID,
            runs: [{
              runId: `recovered-${failureMode}`,
              sessionId,
              clientRequestId: CLIENT_REQUEST_ID,
              batchOrdinal: 1,
              fixtureId: request.fixtureId,
              stage: request.stage,
              promptVersion: request.overrides.promptVersion,
              status: 'completed',
              inputHash: 'd'.repeat(64),
              cacheHit: false,
              cachedFromRunId: null,
              normalizedOutput: SYNTHETIC_FACE_REPORT_FIXTURE,
              validationErrors: [],
              latencyMs: 8,
              tokenUsage: null,
              startedAt: '2026-07-17T09:00:00+09:00',
            }],
          },
        }), {status: 200, headers: {'Content-Type': 'application/json'}});
      };

      const outcome = await runLocalApiBatchRecoveringHistory(
        request,
        1,
        sessionId,
        undefined,
        'http://127.0.0.1:8000/api',
        CLIENT_REQUEST_ID,
      );

      assert.equal(outcome.recoveredFromHistory, true);
      assert.equal(outcome.runs[0]?.runId, `recovered-${failureMode}`);
      assert.equal(outcome.runs[0]?.sessionId, sessionId);
      assert.equal(urls.length, 2);
      assert.match(urls[1] ?? '', /\/analysis\/runs\?sessionId=/);
      assert.match(urls[1] ?? '', new RegExp(`clientRequestId=${CLIENT_REQUEST_ID}`));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('response-loss recovery polls a processing batch until the exact attempt is terminal', async () => {
  const originalFetch = globalThis.fetch;
  let historyCalls = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.endsWith('/analysis/stage-run')) throw new TypeError('response lost');
    historyCalls += 1;
    const status = historyCalls === 1 ? 'processing' : 'completed';
    return new Response(JSON.stringify({
      data: {
        sessionId: SESSION_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        runs: [{
          runId: 'recovered-after-processing',
          sessionId: SESSION_ID,
          clientRequestId: CLIENT_REQUEST_ID,
          batchOrdinal: 1,
          fixtureId: request.fixtureId,
          stage: request.stage,
          promptVersion: request.overrides.promptVersion,
          status,
          inputHash: 'f'.repeat(64),
          cacheHit: false,
          cachedFromRunId: null,
          normalizedOutput: SYNTHETIC_FACE_REPORT_FIXTURE,
          validationErrors: [],
          latencyMs: 8,
          tokenUsage: null,
          startedAt: '2026-07-17T09:00:00+09:00',
        }],
      },
    }), {status: 200, headers: {'Content-Type': 'application/json'}});
  };

  try {
    const outcome = await runLocalApiBatchRecoveringHistory(
      request,
      1,
      SESSION_ID,
      undefined,
      'http://127.0.0.1:8000/api',
      CLIENT_REQUEST_ID,
    );
    assert.equal(historyCalls, 2);
    assert.equal(outcome.recoveredFromHistory, true);
    assert.equal(outcome.runs[0]?.runId, 'recovered-after-processing');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('definitive HTTP validation errors do not trigger ambiguous history recovery', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: {code: 'VALIDATION_ERROR', message: 'fixture request is invalid'},
    }), {status: 422, headers: {'Content-Type': 'application/json'}});
  };

  try {
    await assert.rejects(
      runLocalApiBatchRecoveringHistory(
        request,
        1,
        SESSION_ID,
        undefined,
        'http://127.0.0.1:8000/api',
        CLIENT_REQUEST_ID,
      ),
      /fixture request is invalid/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('non-JSON HTTP 429 is definitive and never triggers a history GET', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async input => {
    urls.push(String(input));
    return new Response('', {status: 429});
  };

  try {
    await assert.rejects(
      runLocalApiBatchRecoveringHistory(
        request,
        1,
        SESSION_ID,
        undefined,
        'http://127.0.0.1:8000/api',
        CLIENT_REQUEST_ID,
      ),
      /HTTP 429/,
    );
    assert.equal(urls.length, 1);
    assert.match(urls[0] ?? '', /\/analysis\/stage-run$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an old evicted history row cannot impersonate the exact current batch attempt', async () => {
  const originalFetch = globalThis.fetch;
  const oldClientRequestId = '62fd95fb-a845-45d9-9ea4-a88953a8f297';
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.endsWith('/analysis/stage-run')) throw new TypeError('response lost');
    return new Response(JSON.stringify({
      data: {
        sessionId: SESSION_ID,
        clientRequestId: CLIENT_REQUEST_ID,
        runs: [{
          runId: 'old-evicted-run',
          sessionId: SESSION_ID,
          clientRequestId: oldClientRequestId,
          batchOrdinal: 1,
          fixtureId: request.fixtureId,
          stage: request.stage,
          promptVersion: request.overrides.promptVersion,
          status: 'completed',
          inputHash: 'e'.repeat(64),
          cacheHit: false,
          cachedFromRunId: null,
          normalizedOutput: SYNTHETIC_FACE_REPORT_FIXTURE,
          validationErrors: [],
          latencyMs: 2,
        }],
      },
    }), {status: 200, headers: {'Content-Type': 'application/json'}});
  };

  try {
    await assert.rejects(
      runLocalApiBatchRecoveringHistory(
        request,
        1,
        SESSION_ID,
        undefined,
        'http://127.0.0.1:8000/api',
        CLIENT_REQUEST_ID,
      ),
      /mismatched client request identity/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session issue and cancel clients use only the loopback API', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/analysis/session')) {
      return new Response(JSON.stringify({
        data: {sessionId: '92fd95fb-a845-45d9-9ea4-a88953a8f295'},
      }), {status: 200, headers: {'Content-Type': 'application/json'}});
    }
    return new Response(JSON.stringify({
      data: {
        sessionId: '92fd95fb-a845-45d9-9ea4-a88953a8f295',
        cancelledRuns: 2,
      },
    }), {status: 200, headers: {'Content-Type': 'application/json'}});
  };

  try {
    const sessionId = await createLocalApiSession(undefined, 'http://127.0.0.1:8000/api');
    const cancelled = await cancelLocalApiSession(sessionId, 'http://127.0.0.1:8000/api');
    assert.equal(cancelled, 2);
    assert.deepEqual(urls, [
      'http://127.0.0.1:8000/api/lab/analysis/session',
      'http://127.0.0.1:8000/api/lab/analysis/runs/cancel',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cancel recovery retires the browser session even when the cleanup response is lost', async () => {
  const originalFetch = globalThis.fetch;
  let cleared = false;
  globalThis.fetch = async () => {
    throw new TypeError('cancel response lost');
  };

  try {
    const cancellation = retireLocalApiSession(
      '92fd95fb-a845-45d9-9ea4-a88953a8f295',
      () => {
        cleared = true;
      },
      'http://127.0.0.1:8000/api',
    );
    assert.equal(cleared, true);
    await assert.rejects(cancellation, /cancel response lost/);
    assert.equal(cleared, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
