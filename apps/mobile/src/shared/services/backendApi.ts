export type ApiEnvelope<T> = {
  data?: T | null;
  error?: {
    code?: string;
    message?: string;
  } | null;
  meta?: unknown;
};

type AuthTokenProvider = () => string | null;

let authTokenProvider: AuthTokenProvider | null = null;

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
  const response = await fetch(buildBackendApiUrl(path), {
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
    throw new Error(envelope?.error?.message ?? `Backend request failed with HTTP ${response.status}.`);
  }

  if (envelope?.data === undefined || envelope.data === null) {
    throw new Error('Backend response did not include data.');
  }

  return envelope.data;
}
