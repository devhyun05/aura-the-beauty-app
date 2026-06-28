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

export function setBackendAuthTokenProvider(provider: AuthTokenProvider | null): void {
  authTokenProvider = provider;
}

export function getBackendApiBaseUrl(): string | null {
  const rawUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (!rawUrl) {
    return null;
  }

  return rawUrl.replace(/\/+$/, '');
}

export function buildBackendApiUrl(path: string): string {
  const apiBaseUrl = getBackendApiBaseUrl();

  if (!apiBaseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for backend API calls.');
  }

  return `${apiBaseUrl}/${path.replace(/^\/+/, '')}`;
}

type BackendJsonRequestInit = Omit<RequestInit, 'body' | 'headers'> & {
  authToken?: string | null;
  body?: unknown;
  headers?: HeadersInit;
};

function resolveAuthToken(authToken: string | null | undefined): string | null {
  if (authToken !== undefined) {
    return authToken;
  }

  return authTokenProvider?.() ?? null;
}

export async function requestBackendJson<T>(
  path: string,
  init: BackendJsonRequestInit = {},
): Promise<T> {
  const {authToken, body, headers, ...requestInit} = init;
  const resolvedAuthToken = resolveAuthToken(authToken);
  const startedAt = Date.now();
  const method = requestInit.method ?? 'GET';
  const url = buildBackendApiUrl(path);

  console.info('[aura:api] request:start', {
    hasAuthToken: Boolean(resolvedAuthToken),
    method,
    path,
  });

  const response = await fetch(url, {
    ...requestInit,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
      ...(resolvedAuthToken ? {Authorization: `Bearer ${resolvedAuthToken}`} : {}),
      ...headers,
    },
  });

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
