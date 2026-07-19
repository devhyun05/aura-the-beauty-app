export type ApiEnvelope<T> = {
  data?: T | null;
  error?: {
    code?: string;
    details?: Record<string, unknown>;
    message?: string;
  } | null;
  meta?: unknown;
};

type AuthTokenProvider = () => string | null;

const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

let authTokenProvider: AuthTokenProvider | null = null;

export class BackendApiError extends Error {
  code?: string;
  details?: Record<string, unknown>;
  status: number;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BackendApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BackendNetworkError extends Error {
  code = 'NETWORK_UNAVAILABLE' as const;

  constructor(message = '네트워크 연결을 확인한 뒤 다시 시도해 주세요.') {
    super(message);
    this.name = 'BackendNetworkError';
  }
}

export function isBackendNetworkError(error: unknown): error is BackendNetworkError {
  return error instanceof BackendNetworkError;
}

/**
 * 사용자가 의도적으로 취소(홈 복귀·화면 이탈)해 요청이 abort된 경우. 타임아웃과 구분해
 * 호출부가 조용히 삼킬 수 있게 별도 타입으로 던진다 (실패 화면을 띄우면 안 됨).
 */
export class RequestAbortedError extends Error {
  constructor(message = 'Request was aborted by the caller.') {
    super(message);
    this.name = 'RequestAbortedError';
  }
}

export function isRequestAbortedError(error: unknown): error is RequestAbortedError {
  return error instanceof RequestAbortedError;
}

export function setBackendAuthTokenProvider(provider: AuthTokenProvider | null): void {
  authTokenProvider = provider;
}

export function getBackendAuthToken(): string | null {
  return authTokenProvider?.() ?? null;
}

export function getBackendApiBaseUrl(): string | null {
  const rawUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (!rawUrl) {
    return null;
  }

  return ensureApiBasePath(rawUrl);
}

export function buildBackendApiUrl(path: string, baseUrl?: string | null): string {
  const apiBaseUrl = baseUrl?.trim()
    ? ensureApiBasePath(baseUrl.trim())
    : getBackendApiBaseUrl();

  if (!apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for backend API calls.');
  }

  return `${apiBaseUrl}/${path.replace(/^\/+/, '').replace(/^api\/+/, '')}`;
}

function ensureApiBasePath(rawUrl: string): string {
  const trimmedUrl = rawUrl.replace(/\/+$/, '');

  try {
    const url = new URL(trimmedUrl);
    const pathname = url.pathname.replace(/\/+$/, '');

    if (pathname === '/api' || pathname.endsWith('/api')) {
      return url.toString().replace(/\/+$/, '');
    }

    url.pathname = `${pathname}/api`;
    return url.toString().replace(/\/+$/, '');
  } catch {
    return trimmedUrl.endsWith('/api') ? trimmedUrl : `${trimmedUrl}/api`;
  }
}

export type BackendJsonRequestInit = Omit<RequestInit, 'body' | 'headers'> & {
  baseUrl?: string | null;
  authToken?: string | null;
  body?: unknown;
  headers?: HeadersInit;
  timeoutMs?: number;
};

function resolveAuthToken(authToken: string | null | undefined): string | null {
  if (authToken !== undefined) {
    return authToken;
  }

  return authTokenProvider?.() ?? null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return /network request failed|failed to fetch|networkerror|internet connection/i.test(message);
}

export async function requestBackendJson<T>(
  path: string,
  init: BackendJsonRequestInit = {},
): Promise<T> {
  const {
    baseUrl,
    authToken,
    body,
    headers,
    signal: externalSignal,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    ...requestInit
  } = init;
  const resolvedAuthToken = resolveAuthToken(authToken);
  const startedAt = Date.now();
  const method = requestInit.method ?? 'GET';
  const url = buildBackendApiUrl(path, baseUrl);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  const handleExternalAbort = () => abortController.abort();

  if (externalSignal?.aborted) {
    abortController.abort();
  } else {
    externalSignal?.addEventListener('abort', handleExternalAbort, {once: true});
  }

  console.info('[aura:api] request:start', {
    hasAuthToken: Boolean(resolvedAuthToken),
    method,
    path,
  });

  let response: Response;

  try {
    response = await fetch(url, {
      ...requestInit,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
        ...(resolvedAuthToken ? {Authorization: `Bearer ${resolvedAuthToken}`} : {}),
        ...headers,
      },
      signal: abortController.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      // 외부 시그널이 원인이면 사용자 취소 — 타임아웃 카피 대신 조용한 abort 에러.
      if (externalSignal?.aborted) {
        console.info('[aura:api] request:aborted', {durationMs: Date.now() - startedAt, method, path});
        throw new RequestAbortedError();
      }
      console.info('[aura:api] request:timeout', {
        durationMs: Date.now() - startedAt,
        method,
        path,
        timeoutMs,
      });
      throw new Error('서버 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.');
    }

    if (isNetworkFailure(error)) {
      console.info('[aura:api] request:network-unavailable', {
        durationMs: Date.now() - startedAt,
        method,
        path,
      });
      throw new BackendNetworkError();
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', handleExternalAbort);
  }

  let envelope: ApiEnvelope<T> | null = null;

  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok) {
    console.info('[aura:api] request:fail', {
      code: envelope?.error?.code,
      details: envelope?.error?.details,
      durationMs: Date.now() - startedAt,
      method,
      path,
      status: response.status,
    });

    throw new BackendApiError(
      envelope?.error?.message ?? `Backend request failed with HTTP ${response.status}.`,
      response.status,
      envelope?.error?.code,
      envelope?.error?.details,
    );
  }

  if (envelope?.data === undefined || envelope.data === null) {
    console.info('[aura:api] request:empty', {
      durationMs: Date.now() - startedAt,
      method,
      path,
      status: response.status,
    });

    throw new Error('Backend response did not include data.');
  }

  console.info('[aura:api] request:success', {
    durationMs: Date.now() - startedAt,
    method,
    path,
    status: response.status,
  });

  return envelope.data;
}
