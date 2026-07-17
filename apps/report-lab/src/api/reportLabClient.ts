import {
  parseFaceReportView,
  type FaceReportViewV1,
} from '@aura/face-report-contract';
import {SYNTHETIC_FACE_REPORT_FIXTURE} from '@aura/face-report-contract/syntheticFixture';

export type LabStage = 'measure' | 'perceive' | 'consult';
export type LabRunnerMode = 'fixture' | 'local-api';
export type LabRunStatus = 'completed' | 'failed' | 'cancelled';

export type FixtureSummary = {
  fixtureId: string;
  label: string;
  description: string;
  provenance: string;
};

export type LabRunRequest = {
  fixtureId: string;
  stage: LabStage;
  overrides: {
    promptDeveloper: string;
    promptUser: string;
    promptVersion: string;
    model: string;
    maxTokens: string;
    temperature: string;
  };
  bypassCache: boolean;
};

export type LabRunResult = {
  runId: string;
  sessionId: string | null;
  clientRequestId: string | null;
  batchOrdinal: number | null;
  fixtureId: string;
  stage: LabStage;
  promptVersion: string;
  inputHash: string;
  cacheHit: boolean;
  cachedFromRunId: string | null;
  status: LabRunStatus;
  runner: LabRunnerMode;
  normalizedOutput: FaceReportViewV1 | null;
  validationErrors: string[];
  latencyMs: string;
  tokenUsage: null | 0;
  createdAt: string;
  rawResponseAvailable: boolean;
};

export function effectiveBypassCache(runner: LabRunnerMode, requested: boolean): boolean {
  return runner === 'local-api' && requested;
}

export const FIXTURE_CATALOG: FixtureSummary[] = [
  {
    fixtureId: 'synthetic-balanced-v1',
    label: '여름 뮤트 · 곡선형',
    description: '모든 판정 상태와 일곱 개 보고서 섹션을 포함한 비식별 결정적 fixture',
    provenance: '결정적 numeric-free JSON · 승인된 출처의 이미지가 없어 미포함',
  },
];

const delay = (durationMs: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, durationMs);
    signal?.addEventListener(
      'abort',
      () => {
        globalThis.clearTimeout(timer);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      },
      {once: true},
    );
  });

function shortStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function fixtureInputIdentity(request: LabRunRequest): string {
  return `fixture-${shortStableHash(JSON.stringify({
    fixtureId: request.fixtureId,
    stage: request.stage,
    overrides: request.overrides,
  }))}`;
}

export async function runDeterministicFixture(
  request: LabRunRequest,
  signal?: AbortSignal,
): Promise<LabRunResult> {
  if (!FIXTURE_CATALOG.some(item => item.fixtureId === request.fixtureId)) {
    throw new Error('허용되지 않은 fixtureId예요.');
  }

  const startedAt = performance.now();
  await delay(180, signal);
  const normalizedOutput = parseFaceReportView(
    structuredClone(SYNTHETIC_FACE_REPORT_FIXTURE),
  );

  return {
    runId: crypto.randomUUID(),
    sessionId: null,
    clientRequestId: null,
    batchOrdinal: null,
    fixtureId: request.fixtureId,
    stage: request.stage,
    promptVersion: request.overrides.promptVersion,
    inputHash: fixtureInputIdentity(request),
    cacheHit: false,
    cachedFromRunId: null,
    status: 'completed',
    runner: 'fixture',
    normalizedOutput,
    validationErrors: [],
    latencyMs: `${Math.max(1, Math.round(performance.now() - startedAt))} ms`,
    tokenUsage: null,
    createdAt: new Date().toISOString(),
    rawResponseAvailable: false,
  };
}

type ApiEnvelope<T> = {
  data?: T | null;
  error?: {code?: string; message?: string} | null;
};

type ApiRunPayload = {
  runId?: unknown;
  clientRequestId?: unknown;
  batchOrdinal?: unknown;
  fixtureId?: unknown;
  stage?: unknown;
  promptVersion?: unknown;
  status?: unknown;
  inputHash?: unknown;
  cacheHit?: unknown;
  cachedFromRunId?: unknown;
  normalizedOutput?: unknown;
  validationErrors?: unknown;
  latencyMs?: unknown;
  tokenUsage?: unknown;
  rawResponse?: unknown;
  startedAt?: unknown;
};

type ApiBatchPayload = {
  sessionId?: unknown;
  clientRequestId?: unknown;
  runs?: unknown;
};

type ApiValidationError = {
  location?: unknown;
  type?: unknown;
};

type ApiRunIdentity = {
  fixtureId: string;
  stage: LabStage;
  promptVersion: string;
};

export class AmbiguousLabStageRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousLabStageRunError';
  }
}

class IncompleteLabBatchHistoryError extends Error {
  constructor() {
    super('Local API history did not contain the exact completed batch attempt.');
    this.name = 'IncompleteLabBatchHistoryError';
  }
}

const HISTORY_RECOVERY_ATTEMPTS = 20;
const HISTORY_RECOVERY_DELAY_MS = 150;

export function isAmbiguousLabStageRunError(error: unknown): error is AmbiguousLabStageRunError {
  return error instanceof AmbiguousLabStageRunError;
}

function ambiguousRunError(message: string, cause?: unknown): AmbiguousLabStageRunError {
  const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : '';
  return new AmbiguousLabStageRunError(`${message}${detail}`);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createClientRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function normalizeLabCommitSha(value: unknown): string {
  if (typeof value !== 'string') return 'uncommitted';
  const normalized = value.trim();
  return /^[0-9a-f]{7,64}$/i.test(normalized) ? normalized : 'uncommitted';
}

export function getLabCommitSha(): string {
  const viteEnv = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  return normalizeLabCommitSha(viteEnv?.VITE_REPORT_LAB_COMMIT_SHA);
}

export function assertLoopbackApiBaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '8000' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Report Lab API must use unauthenticated http://127.0.0.1:8000/api.');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname && pathname !== '/api') {
    throw new Error('Report Lab API path must be /api.');
  }
  url.pathname = '/api';
  return url.toString().replace(/\/+$/, '');
}

export function getDefaultLabApiBaseUrl(): string {
  const viteEnv = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  return assertLoopbackApiBaseUrl(
    viteEnv?.VITE_REPORT_LAB_API_BASE_URL ?? 'http://127.0.0.1:8000/api',
  );
}

function normalizeValidationError(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const error = value as ApiValidationError;
  const location = Array.isArray(error.location)
    ? error.location.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  const type = typeof error.type === 'string' && error.type.trim()
    ? error.type.trim()
    : 'validation error';
  return location.length ? `${location.join('.')}: ${type}` : type;
}

function parsePositiveInteger(rawValue: string, fallback: number): number {
  const value = Number.parseInt(rawValue, 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function parseTemperature(rawValue: string): number {
  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) && value >= 0 && value <= 2 ? value : 0;
}

function apiRequestBody(
  request: LabRunRequest,
  repeatCount: number,
  sessionId: string,
  clientRequestId: string,
) {
  return {
    sessionId,
    clientRequestId,
    fixtureId: request.fixtureId,
    stage: request.stage,
    overrides: {
      promptDeveloper: request.overrides.promptDeveloper,
      promptUser: request.overrides.promptUser,
      promptVersion: request.overrides.promptVersion,
      model: 'disabled',
      maxTokens: parsePositiveInteger(request.overrides.maxTokens, 2800),
      temperature: parseTemperature(request.overrides.temperature),
    },
    bypassCache: request.bypassCache,
    repeatCount,
  };
}

function parseApiRun(
  payload: unknown,
  identity: ApiRunIdentity,
  sessionId: string,
  clientRequestId: string,
  createdAt: string,
): LabRunResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Local API response contains a malformed run.');
  }
  const run = payload as ApiRunPayload;
  if (typeof run.runId !== 'string' || !run.runId) {
    throw new Error('Local API response is missing a runId.');
  }
  if (run.clientRequestId !== clientRequestId) {
    throw new Error('Local API response contains a mismatched client request identity.');
  }
  if (!Number.isInteger(run.batchOrdinal) || Number(run.batchOrdinal) < 1 || Number(run.batchOrdinal) > 5) {
    throw new Error('Local API response contains an invalid batch ordinal.');
  }
  if (!['completed', 'failed', 'cancelled'].includes(String(run.status))) {
    throw new Error('Local API response contains an invalid run status.');
  }
  if (typeof run.inputHash !== 'string' || !/^[0-9a-f]{64}$/i.test(run.inputHash)) {
    throw new Error('Local API response contains an invalid input identity.');
  }
  if (typeof run.cacheHit !== 'boolean') {
    throw new Error('Local API response contains an invalid cache state.');
  }
  if (
    run.cachedFromRunId !== null &&
    typeof run.cachedFromRunId !== 'string'
  ) {
    throw new Error('Local API response contains invalid cache provenance.');
  }
  const validationErrors = Array.isArray(run.validationErrors)
    ? run.validationErrors
      .map(normalizeValidationError)
      .filter((item): item is string => item !== null)
    : [];
  const status = run.status as LabRunStatus;
  const normalizedOutput = status === 'completed'
    ? parseFaceReportView(run.normalizedOutput)
    : null;
  const latency = typeof run.latencyMs === 'number' && Number.isFinite(run.latencyMs)
    ? `${Math.round(run.latencyMs)} ms`
    : 'not reported';

  return {
    runId: run.runId,
    sessionId,
    clientRequestId,
    batchOrdinal: Number(run.batchOrdinal),
    fixtureId: identity.fixtureId,
    stage: identity.stage,
    promptVersion: identity.promptVersion,
    inputHash: run.inputHash,
    cacheHit: run.cacheHit,
    cachedFromRunId: run.cachedFromRunId as string | null,
    status,
    runner: 'local-api',
    normalizedOutput,
    validationErrors,
    latencyMs: latency,
    tokenUsage: run.tokenUsage === 0 ? 0 : null,
    createdAt,
    rawResponseAvailable: Object.hasOwn(run, 'rawResponse'),
  };
}

export async function runLocalApiBatch(
  request: LabRunRequest,
  repeatCount: number,
  sessionId: string,
  clientRequestId: string,
  signal?: AbortSignal,
  baseUrl = getDefaultLabApiBaseUrl(),
): Promise<LabRunResult[]> {
  if (!Number.isInteger(repeatCount) || repeatCount < 1 || repeatCount > 5) {
    throw new Error('Local API repeatCount must be an integer from 1 through 5.');
  }
  if (!UUID_PATTERN.test(sessionId)) {
    throw new Error('Local API requires one server-issued sessionId.');
  }
  if (!UUID_PATTERN.test(clientRequestId)) {
    throw new Error('Local API requires one unique clientRequestId per batch attempt.');
  }
  let response: Response;
  try {
    response = await fetch(`${assertLoopbackApiBaseUrl(baseUrl)}/lab/analysis/stage-run`, {
      method: 'POST',
      headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
      body: JSON.stringify(apiRequestBody(request, repeatCount, sessionId, clientRequestId)),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw ambiguousRunError('Local API stage-run response was not received.', error);
  }

  if (!response.ok) {
    const errorEnvelope = await response.json().catch(() => null) as ApiEnvelope<never> | null;
    throw new Error(errorEnvelope?.error?.message ?? `Local API failed with HTTP ${response.status}.`);
  }

  let envelope: ApiEnvelope<ApiBatchPayload>;
  try {
    envelope = (await response.json()) as ApiEnvelope<ApiBatchPayload>;
  } catch (error) {
    throw ambiguousRunError('Local API stage-run response could not be parsed.', error);
  }
  const payload = envelope?.data;
  if (
    !payload ||
    typeof payload.sessionId !== 'string' ||
    payload.sessionId !== sessionId ||
    payload.clientRequestId !== clientRequestId ||
    !Array.isArray(payload.runs) ||
    payload.runs.length !== repeatCount
  ) {
    throw ambiguousRunError('Local API batch response is malformed.');
  }
  const createdAt = new Date().toISOString();
  try {
    const identity: ApiRunIdentity = {
      fixtureId: request.fixtureId,
      stage: request.stage,
      promptVersion: request.overrides.promptVersion,
    };
    const runs = payload.runs.map(run =>
      parseApiRun(run, identity, payload.sessionId as string, clientRequestId, createdAt),
    ).sort((left, right) => Number(left.batchOrdinal) - Number(right.batchOrdinal));
    const exactOrdinals = runs.every((run, index) => run.batchOrdinal === index + 1);
    const oneInputIdentity = new Set(runs.map(run => run.inputHash)).size === 1;
    if (!exactOrdinals || !oneInputIdentity) {
      throw new Error('Local API batch correlation metadata is inconsistent.');
    }
    return runs;
  } catch (error) {
    if (isAmbiguousLabStageRunError(error)) throw error;
    throw ambiguousRunError('Local API stage-run payload could not be validated.', error);
  }
}

function parseHistoryRun(
  payload: unknown,
  sessionId: string,
  clientRequestId: string,
): LabRunResult {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Local API history contains a malformed run.');
  }
  const run = payload as ApiRunPayload;
  if (
    typeof run.fixtureId !== 'string' ||
    !['measure', 'perceive', 'consult'].includes(String(run.stage)) ||
    typeof run.promptVersion !== 'string' ||
    !run.promptVersion
  ) {
    throw new Error('Local API history is missing run identity metadata.');
  }
  const createdAt = typeof run.startedAt === 'string' && run.startedAt
    ? run.startedAt
    : new Date().toISOString();
  return parseApiRun(
    run,
    {
      fixtureId: run.fixtureId,
      stage: run.stage as LabStage,
      promptVersion: run.promptVersion,
    },
    sessionId,
    clientRequestId,
    createdAt,
  );
}

export async function getLocalApiRunHistory(
  sessionId: string,
  clientRequestId: string,
  expectedRepeatCount: number,
  signal?: AbortSignal,
  baseUrl = getDefaultLabApiBaseUrl(),
): Promise<LabRunResult[]> {
  const query = new URLSearchParams({
    sessionId,
    clientRequestId,
    limit: String(expectedRepeatCount),
  });
  const endpoint = `${assertLoopbackApiBaseUrl(baseUrl)}/lab/analysis/runs?${query.toString()}`;
  const response = await fetch(endpoint, {headers: {Accept: 'application/json'}, signal});
  const envelope = await response.json().catch(() => null) as ApiEnvelope<ApiBatchPayload> | null;
  if (!response.ok) {
    throw new Error(envelope?.error?.message ?? `Local API history failed with HTTP ${response.status}.`);
  }
  const payload = envelope?.data;
  if (
    !payload ||
    payload.sessionId !== sessionId ||
    payload.clientRequestId !== clientRequestId ||
    !Array.isArray(payload.runs)
  ) {
    throw new Error('Local API history response is malformed.');
  }
  const runs = payload.runs
    .filter(run => (
      run !== null &&
      typeof run === 'object' &&
      !Array.isArray(run) &&
      ['completed', 'failed', 'cancelled'].includes(String((run as ApiRunPayload).status))
    ))
    .map(run => parseHistoryRun(run, sessionId, clientRequestId))
    .sort((left, right) => Number(left.batchOrdinal) - Number(right.batchOrdinal));
  const exactBatch = runs.length === expectedRepeatCount && runs.every(
    (run, index) => run.batchOrdinal === index + 1,
  );
  const oneInputIdentity = new Set(runs.map(run => run.inputHash)).size === 1;
  if (!exactBatch || !oneInputIdentity) {
    throw new IncompleteLabBatchHistoryError();
  }
  return runs;
}

export type LabBatchOutcome = {
  runs: LabRunResult[];
  recoveredFromHistory: boolean;
};

export async function runLocalApiBatchRecoveringHistory(
  request: LabRunRequest,
  repeatCount: number,
  sessionId: string,
  signal?: AbortSignal,
  baseUrl = getDefaultLabApiBaseUrl(),
  clientRequestId = createClientRequestId(),
): Promise<LabBatchOutcome> {
  try {
    return {
      runs: await runLocalApiBatch(
        request,
        repeatCount,
        sessionId,
        clientRequestId,
        signal,
        baseUrl,
      ),
      recoveredFromHistory: false,
    };
  } catch (error) {
    if (signal?.aborted || !isAmbiguousLabStageRunError(error)) throw error;
    for (let attempt = 0; attempt < HISTORY_RECOVERY_ATTEMPTS; attempt += 1) {
      try {
        const recovered = await getLocalApiRunHistory(
          sessionId,
          clientRequestId,
          repeatCount,
          signal,
          baseUrl,
        );
        return {runs: recovered, recoveredFromHistory: true};
      } catch (historyError) {
        if (!(historyError instanceof IncompleteLabBatchHistoryError)) {
          throw historyError;
        }
        if (attempt === HISTORY_RECOVERY_ATTEMPTS - 1) {
          throw ambiguousRunError(
            'Local API stage-run outcome remained unresolved after bounded history recovery.',
            historyError,
          );
        }
        await delay(HISTORY_RECOVERY_DELAY_MS, signal);
      }
    }
    throw ambiguousRunError('Local API stage-run outcome could not be recovered.');
  }
}

export async function createLocalApiSession(
  signal?: AbortSignal,
  baseUrl = getDefaultLabApiBaseUrl(),
): Promise<string> {
  const response = await fetch(`${assertLoopbackApiBaseUrl(baseUrl)}/lab/analysis/session`, {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: '{}',
    signal,
  });
  const envelope = await response.json().catch(() => null) as ApiEnvelope<{sessionId?: unknown}> | null;
  const sessionId = envelope?.data?.sessionId;
  if (!response.ok) {
    throw new Error(envelope?.error?.message ?? `Local API failed with HTTP ${response.status}.`);
  }
  if (typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)) {
    throw new Error('Local API did not issue a valid sessionId.');
  }
  return sessionId;
}

export async function cancelLocalApiSession(
  sessionId: string,
  baseUrl = getDefaultLabApiBaseUrl(),
): Promise<number> {
  const response = await fetch(`${assertLoopbackApiBaseUrl(baseUrl)}/lab/analysis/runs/cancel`, {
    method: 'POST',
    headers: {Accept: 'application/json', 'Content-Type': 'application/json'},
    body: JSON.stringify({sessionId}),
  });
  const envelope = await response.json().catch(() => null) as ApiEnvelope<{
    sessionId?: unknown;
    cancelledRuns?: unknown;
  }> | null;
  if (!response.ok) {
    throw new Error(envelope?.error?.message ?? `Local API failed with HTTP ${response.status}.`);
  }
  if (
    envelope?.data?.sessionId !== sessionId ||
    !Number.isInteger(envelope?.data?.cancelledRuns) ||
    Number(envelope?.data?.cancelledRuns) < 0
  ) {
    throw new Error('Local API cancellation response is malformed.');
  }
  return Number(envelope.data.cancelledRuns);
}

export function retireLocalApiSession(
  sessionId: string,
  clearSession: () => void,
  baseUrl = getDefaultLabApiBaseUrl(),
): Promise<number> {
  // Recovery cannot depend on the cancellation response reaching the browser.
  // The backend cancellation remains best-effort cleanup for any processing rows.
  clearSession();
  return cancelLocalApiSession(sessionId, baseUrl);
}

export async function runLocalApi(
  request: LabRunRequest,
  sessionId: string,
  signal?: AbortSignal,
  baseUrl = getDefaultLabApiBaseUrl(),
): Promise<LabRunResult> {
  const [run] = await runLocalApiBatch(
    request,
    1,
    sessionId,
    createClientRequestId(),
    signal,
    baseUrl,
  );
  if (!run) throw new Error('Local API returned no run.');
  return run;
}
