import assert from 'node:assert/strict';
import test from 'node:test';

import {SYNTHETIC_FACE_REPORT_FIXTURE} from '@aura/face-report-contract/syntheticFixture';
import type {LabRunResult} from '../src/api/reportLabClient.ts';
import {
  buildPromptVersion,
  clampRepeatCount,
  diffNormalizedOutputs,
  initialLabState,
  labReducer,
} from '../src/state/labState.ts';

const run = (runId: string): LabRunResult => ({
  runId,
  sessionId: null,
  clientRequestId: null,
  batchOrdinal: null,
  fixtureId: 'synthetic-balanced-v1',
  stage: 'consult',
  promptVersion: 'test-v1',
  inputHash: 'a'.repeat(64),
  cacheHit: false,
  cachedFromRunId: null,
  status: 'completed',
  runner: 'fixture',
  normalizedOutput: SYNTHETIC_FACE_REPORT_FIXTURE,
  validationErrors: [],
  latencyMs: '1 ms',
  tokenUsage: null,
  createdAt: '2026-07-17T09:00:00+09:00',
  rawResponseAvailable: false,
});

test('successful repeats become selected A/B comparison runs', () => {
  const state = labReducer(initialLabState, {
    type: 'run-success',
    runs: [run('left'), run('right')],
  });
  assert.equal(state.selectedRunId, 'left');
  assert.equal(state.leftRunId, 'left');
  assert.equal(state.rightRunId, 'right');
  assert.equal(state.runs.length, 2);
});

test('history recovery merges by runId instead of duplicating visible runs', () => {
  const existing = labReducer(initialLabState, {
    type: 'run-success',
    runs: [run('existing')],
  });
  const recovered = labReducer(existing, {
    type: 'run-success',
    runs: [{...run('existing'), latencyMs: '9 ms'}, run('new-from-history')],
  });
  assert.deepEqual(recovered.runs.map(item => item.runId), ['existing', 'new-from-history']);
  assert.equal(recovered.runs[0]?.latencyMs, '9 ms');
});

test('repeat count is safely bounded', () => {
  assert.equal(clampRepeatCount('0'), 1);
  assert.equal(clampRepeatCount('2'), 2);
  assert.equal(clampRepeatCount('99'), 3);
  assert.equal(clampRepeatCount('bad'), 1);
});

test('prompt body edits auto-version the exact experiment input', () => {
  const next = labReducer(initialLabState, {
    type: 'draft',
    patch: {promptUser: `${initialLabState.draft.promptUser} 수정`},
  });
  assert.notEqual(next.draft.promptVersion, initialLabState.draft.promptVersion);
  assert.equal(
    next.draft.promptVersion,
    buildPromptVersion(next.draft.promptDeveloper, next.draft.promptUser),
  );
});

test('server-issued session survives later successful clicks', () => {
  const first = {...run('first'), sessionId: '92fd95fb-a845-45d9-9ea4-a88953a8f295'};
  const withSession = labReducer(initialLabState, {type: 'run-success', runs: [first]});
  const fixtureOnly = labReducer(withSession, {type: 'run-success', runs: [run('fixture')]});
  assert.equal(fixtureOnly.sessionId, '92fd95fb-a845-45d9-9ea4-a88953a8f295');
});

test('a confirmed backend cancellation clears the terminal session before retry', () => {
  const withSession = labReducer(initialLabState, {
    type: 'session-set',
    sessionId: '92fd95fb-a845-45d9-9ea4-a88953a8f295',
  });
  assert.equal(labReducer(withSession, {type: 'session-clear'}).sessionId, null);
});

test('normalized report diff identifies changed paths and values', () => {
  const differences = diffNormalizedOutputs(
    {hero: {headline: 'A'}, cards: ['one']},
    {hero: {headline: 'B'}, cards: ['one', 'two']},
  );
  assert.deepEqual(differences, [
    {path: 'cards.1', left: '없음', right: 'two'},
    {path: 'hero.headline', left: 'A', right: 'B'},
  ]);
});
