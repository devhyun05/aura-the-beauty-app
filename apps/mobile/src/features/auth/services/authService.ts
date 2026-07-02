import {
  AuthRequest,
  CodeChallengeMethod,
  ResponseType,
  exchangeCodeAsync,
  fetchUserInfoAsync,
  type TokenResponse,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {Platform} from 'react-native';

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

const TOKEN_EXCHANGE_TIMEOUT_MS = 20000;
const USER_INFO_TIMEOUT_MS = 10000;
const LOGIN_DELAY_MESSAGE = '로그인 응답이 지연되고 있어요. 다시 시도해 주세요.';
const LOGIN_FAILURE_MESSAGE = '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
const LOGIN_CANCELLED_MESSAGE = '로그인이 취소되었습니다.';

WebBrowser.maybeCompleteAuthSession();

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

async function prepareAuthBrowser(authUrl: string) {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await WebBrowser.warmUpAsync();
    await WebBrowser.mayInitWithUrlAsync(authUrl);
  } catch {
    // Browser warmup is an optimization only; auth should still continue.
  }
}

async function cleanupAuthBrowser() {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    await WebBrowser.coolDownAsync();
  } catch {
    // Ignore cleanup failures from browsers that do not support custom tabs services.
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
      fetchUserInfoAsync(
        {accessToken: tokenResponse.accessToken},
        {userInfoEndpoint: config.discovery.userInfoEndpoint},
      ),
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

  if (config.prompt) {
    extraParams.prompt = config.prompt;
  }

  const request = new AuthRequest({
    clientId: config.clientId,
    codeChallengeMethod: CodeChallengeMethod.S256,
    extraParams,
    redirectUri: config.redirectUri,
    responseType: ResponseType.Code,
    scopes: config.scopes,
    usePKCE: true,
  });

  const authUrl = await request.makeAuthUrlAsync(config.discovery);

  console.info('[aura:auth] login:start', {
    provider,
    redirectUri: config.redirectUri,
  });

  await prepareAuthBrowser(authUrl);

  let result: Awaited<ReturnType<AuthRequest['promptAsync']>>;

  try {
    result = await request.promptAsync(config.discovery, {
      createTask: false,
      showInRecents: false,
      url: authUrl,
    });
  } finally {
    void cleanupAuthBrowser();
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
    exchangeCodeAsync(
      {
        clientId: config.clientId,
        code: authorizationCode,
        extraParams: request.codeVerifier
          ? {
              code_verifier: request.codeVerifier,
            }
          : undefined,
        redirectUri: config.redirectUri,
      },
      {
        tokenEndpoint: config.discovery.tokenEndpoint,
      },
    ),
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

    return session;
  }
}
