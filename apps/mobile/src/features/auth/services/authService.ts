import * as WebBrowser from 'expo-web-browser';

import {getCognitoAuthConfig} from './cognitoConfig';
import {syncAuthSessionWithBackend} from './backendAuthService';
import type {AuthSession, AuthUser, SocialLoginProvider} from '../types';

type SocialLoginOptions = {
  shouldFail?: boolean;
};

type CognitoIdTokenClaims = {
  email?: string;
  name?: string;
  nickname?: string;
  sub?: string;
};

type TokenResponse = {
  accessToken: string;
  expiresIn?: number;
  idToken?: string;
  refreshToken?: string;
  tokenType?: string;
};

type CognitoTokenPayload = {
  access_token?: string;
  error?: string;
  error_description?: string;
  expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
};

type AuthPromptResult =
  | {type: 'success'; params: Record<string, string>}
  | {type: 'cancel' | 'dismiss'}
  | {type: 'error'; error?: Error; params: Record<string, string>};

const AUTH_PROMPT_TIMEOUT_MS = 60000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 20000;
const USER_INFO_TIMEOUT_MS = 10000;
const LOGIN_DELAY_MESSAGE = '로그인 응답이 지연되고 있어요. 다시 시도해 주세요.';
const LOGIN_FAILURE_MESSAGE = '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
const LOGIN_CANCELLED_MESSAGE = '로그인이 취소되었습니다.';

WebBrowser.maybeCompleteAuthSession();

function dismissAuthBrowser() {
  try {
    WebBrowser.dismissAuthSession();
  } catch {
    // The session may already be closed by a redirect or user cancellation.
  }
}

function getAuthErrorMessage(errorDescription?: string, fallback?: string): string {
  if (errorDescription) {
    return decodeURIComponent(errorDescription.replace(/\+/g, ' '));
  }

  return fallback ?? LOGIN_FAILURE_MESSAGE;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

function randomBase64Url(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let value = '';

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return value;
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';

  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });

  return globalThis
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const SHA256_INITIAL_HASH: number[] = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
];

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];

  Array.from(value).forEach(character => {
    const codePoint = character.codePointAt(0) ?? 0;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
      return;
    }

    if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      return;
    }

    if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
      return;
    }

    bytes.push(
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
  });

  return new Uint8Array(bytes);
}

function sha256(value: string): Uint8Array {
  const message = encodeUtf8(value);
  const bitLength = message.length * 8;
  const paddedLength = Math.ceil((message.length + 1 + 8) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  const words = new Uint32Array(64);
  const hash = [...SHA256_INITIAL_HASH];
  const highBitLength = Math.floor(bitLength / 0x100000000);
  const lowBitLength = bitLength >>> 0;

  padded.set(message);
  padded[message.length] = 0x80;
  padded[paddedLength - 8] = (highBitLength >>> 24) & 0xff;
  padded[paddedLength - 7] = (highBitLength >>> 16) & 0xff;
  padded[paddedLength - 6] = (highBitLength >>> 8) & 0xff;
  padded[paddedLength - 5] = highBitLength & 0xff;
  padded[paddedLength - 4] = (lowBitLength >>> 24) & 0xff;
  padded[paddedLength - 3] = (lowBitLength >>> 16) & 0xff;
  padded[paddedLength - 2] = (lowBitLength >>> 8) & 0xff;
  padded[paddedLength - 1] = lowBitLength & 0xff;

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byteOffset = offset + index * 4;
      words[index] = (
        (padded[byteOffset] << 24) |
        (padded[byteOffset + 1] << 16) |
        (padded[byteOffset + 2] << 8) |
        padded[byteOffset + 3]
      ) >>> 0;
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(words[index - 15], 7) ^
        rotateRight(words[index - 15], 18) ^
        (words[index - 15] >>> 3);
      const s1 =
        rotateRight(words[index - 2], 17) ^
        rotateRight(words[index - 2], 19) ^
        (words[index - 2] >>> 10);

      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);

  hash.forEach((word, index) => {
    digest[index * 4] = (word >>> 24) & 0xff;
    digest[index * 4 + 1] = (word >>> 16) & 0xff;
    digest[index * 4 + 2] = (word >>> 8) & 0xff;
    digest[index * 4 + 3] = word & 0xff;
  });

  return digest;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return buffer;
}

async function createPkceChallenge(codeVerifier: string): Promise<{
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}> {
  const subtle = globalThis.crypto?.subtle;
  const digest = subtle
    ? await subtle.digest('SHA-256', toArrayBuffer(encodeUtf8(codeVerifier)))
    : sha256(codeVerifier);

  return {
    codeChallenge: encodeBase64Url(digest),
    codeChallengeMethod: 'S256',
  };
}

function buildAuthorizeUrl({
  authUrl,
  clientId,
  codeChallenge,
  codeChallengeMethod,
  extraParams,
  redirectUri,
  scopes,
}: {
  authUrl: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  extraParams: Record<string, string>;
  redirectUri: string;
  scopes: string[];
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    ...extraParams,
  });

  return `${authUrl}?${params.toString()}`;
}

function parseRedirectParams(url: string): Record<string, string> {
  const [, queryAndHash = ''] = url.split('?');
  const [query = '', hash = ''] = queryAndHash.split('#');
  const params = new URLSearchParams(query || hash);
  const result: Record<string, string> = {};

  params.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

async function openAuthUrlAndWaitForRedirect(
  authUrl: string,
  redirectUri: string,
): Promise<AuthPromptResult> {
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return {type: result.type};
  }

  if (result.type !== 'success') {
    return {
      error: new Error(`인증 브라우저가 완료되지 않았습니다: ${result.type}`),
      params: {},
      type: 'error',
    };
  }

  const params = parseRedirectParams(result.url);

  if (params.error) {
    return {
      error: new Error(params.error_description ?? params.error),
      params,
      type: 'error',
    };
  }

  return {params, type: 'success'};
}

async function exchangeAuthorizationCode({
  clientId,
  code,
  codeVerifier,
  redirectUri,
  tokenEndpoint,
}: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  tokenEndpoint: string;
}): Promise<TokenResponse> {
  const response = await fetch(tokenEndpoint, {
    body: new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });
  const body = await response.json() as CognitoTokenPayload;

  if (!response.ok || body.error || !body.access_token) {
    throw new Error(getAuthErrorMessage(body.error_description, body.error));
  }

  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    idToken: body.id_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type,
  };
}

/**
 * Refreshes an expired Cognito session without making the user sign in again.
 * The refresh token is intentionally kept device-local and is never sent to
 * the application backend.
 */
export async function refreshAuthSession(session: AuthSession): Promise<AuthSession | null> {
  if (!session.refreshToken) {
    return null;
  }

  try {
    const config = getCognitoAuthConfig();
    const response = await withTimeout(
      fetch(config.discovery.tokenEndpoint, {
        body: new URLSearchParams({
          client_id: config.clientId,
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
        }).toString(),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        method: 'POST',
      }),
      TOKEN_EXCHANGE_TIMEOUT_MS,
      LOGIN_DELAY_MESSAGE,
    );
    const body = await response.json() as CognitoTokenPayload;

    if (!response.ok || body.error || !body.access_token) {
      return null;
    }

    const refreshedSession: AuthSession = {
      ...session,
      accessToken: body.access_token,
      expiresIn: body.expires_in,
      idToken: body.id_token ?? session.idToken,
      refreshToken: body.refresh_token ?? session.refreshToken,
      tokenType: body.token_type ?? session.tokenType,
    };

    try {
      return await syncAuthSessionWithBackend(refreshedSession);
    } catch {
      // A valid Cognito refresh is still useful when the backend is briefly
      // unavailable; the next authenticated request will retry normally.
      return refreshedSession;
    }
  } catch {
    return null;
  }
}

function decodeBase64UrlJson<T>(token: string | undefined): T | null {
  const encodedPayload = token?.split('.')[1];

  if (!encodedPayload) {
    return null;
  }

  try {
    const base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = globalThis.atob(paddedBase64);
    const json = decodeURIComponent(
      Array.from(binary)
        .map((character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );

    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function getStringClaim(source: Record<string, unknown> | null, key: string): string | undefined {
  const value = source?.[key];

  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function getAuthUserClaimsFromIdToken(idToken: string | undefined): Partial<AuthUser> {
  const idTokenClaims = decodeBase64UrlJson<CognitoIdTokenClaims>(idToken);

  return {
    email: idTokenClaims?.email,
    id: idTokenClaims?.sub,
    name: idTokenClaims?.name,
    nickname: idTokenClaims?.nickname,
  };
}

async function getCognitoUser(tokenResponse: TokenResponse): Promise<AuthUser> {
  const idTokenClaims = decodeBase64UrlJson<CognitoIdTokenClaims>(tokenResponse.idToken);
  let userInfo: Record<string, unknown> | null = null;

  try {
    const config = getCognitoAuthConfig();
    userInfo = await withTimeout(
      fetch(config.discovery.userInfoEndpoint, {
        headers: {
          Authorization: `Bearer ${tokenResponse.accessToken}`,
        },
      }).then(async response => {
        if (!response.ok) {
          throw new Error(LOGIN_FAILURE_MESSAGE);
        }

        return response.json() as Promise<Record<string, unknown>>;
      }),
      USER_INFO_TIMEOUT_MS,
      LOGIN_DELAY_MESSAGE,
    );
  } catch {
    userInfo = null;
  }

  const id = getStringClaim(userInfo, 'sub') ?? idTokenClaims?.sub ?? 'cognito-user';
  const email = getStringClaim(userInfo, 'email') ?? idTokenClaims?.email;
  const name = getStringClaim(userInfo, 'name') ?? idTokenClaims?.name;
  const nickname =
    getStringClaim(userInfo, 'nickname') ?? idTokenClaims?.nickname ?? name ?? email ?? 'AURA User';

  return {
    email,
    id,
    name,
    nickname,
  };
}

export async function loginWithSocialProvider(
  provider: SocialLoginProvider,
  options: SocialLoginOptions = {},
): Promise<AuthSession> {
  if (options.shouldFail) {
    throw new Error(LOGIN_FAILURE_MESSAGE);
  }

  const config = getCognitoAuthConfig();
  const extraParams: Record<string, string> = {
    identity_provider: config.providerNames[provider],
  };

  // `select_account` is useful for Google account switching, but forwarding it
  // to Apple makes every returning login look like a fresh authorization.
  if (config.prompt && provider !== 'apple') {
    extraParams.prompt = config.prompt;
  }

  const codeVerifier = randomBase64Url(64);
  const {codeChallenge, codeChallengeMethod} = await createPkceChallenge(codeVerifier);
  const authUrl = buildAuthorizeUrl({
    authUrl: config.discovery.authorizationEndpoint,
    clientId: config.clientId,
    codeChallenge,
    codeChallengeMethod,
    extraParams,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
  });

  console.info('[aura:auth] login:start', {
    provider,
    redirectUri: config.redirectUri,
  });

  let result: AuthPromptResult;

  console.info('[aura:auth] prompt:open', {provider});

  try {
    result = await withTimeout(
      openAuthUrlAndWaitForRedirect(authUrl, config.redirectUri),
      AUTH_PROMPT_TIMEOUT_MS,
      LOGIN_DELAY_MESSAGE,
    );
  } catch (error) {
    console.info('[aura:auth] prompt:failed', {
      message: error instanceof Error ? error.message : String(error),
      provider,
    });
    dismissAuthBrowser();
    throw error;
  }

  console.info('[aura:auth] prompt:result', {
    provider,
    type: result.type,
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error(LOGIN_CANCELLED_MESSAGE);
  }

  if (result.type !== 'success') {
    const errorDescription =
      result.type === 'error' ? result.params.error_description ?? result.error?.message : undefined;

    throw new Error(getAuthErrorMessage(errorDescription));
  }

  const authorizationCode = result.params.code;

  if (!authorizationCode) {
    throw new Error('Cognito 인증 코드가 응답에 포함되지 않았습니다.');
  }

  console.info('[aura:auth] token:exchange:start', {provider});

  const tokenResponse = await withTimeout(
    exchangeAuthorizationCode({
      clientId: config.clientId,
      code: authorizationCode,
      codeVerifier,
      redirectUri: config.redirectUri,
      tokenEndpoint: config.discovery.tokenEndpoint,
    }),
    TOKEN_EXCHANGE_TIMEOUT_MS,
    LOGIN_DELAY_MESSAGE,
  );

  console.info('[aura:auth] token:exchange:success', {provider});

  const session: AuthSession = {
    accessToken: tokenResponse.accessToken,
    expiresIn: tokenResponse.expiresIn,
    idToken: tokenResponse.idToken,
    provider,
    refreshToken: tokenResponse.refreshToken,
    tokenType: tokenResponse.tokenType,
    user: await getCognitoUser(tokenResponse),
  };

  console.info('[aura:auth] backend:sync:start', {provider});

  try {
    const syncedSession = await syncAuthSessionWithBackend(session);
    console.info('[aura:auth] backend:sync:success', {provider});
    return syncedSession;
  } catch (error) {
    console.info('[aura:auth] backend:sync:failed', {
      message: error instanceof Error ? error.message : String(error),
      provider,
    });

    // A raw Cognito session does not contain the backend profile completion
    // state. Continuing with it makes a temporary backend outage look like a
    // brand-new account and incorrectly routes returning users to setup.
    throw error;
  }
}
