import {
  AuthRequest,
  CodeChallengeMethod,
  ResponseType,
  exchangeCodeAsync,
  fetchUserInfoAsync,
  type TokenResponse,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import {getCognitoAuthConfig} from './cognitoConfig';
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

WebBrowser.maybeCompleteAuthSession();

function getAuthErrorMessage(errorDescription?: string, fallback?: string): string {
  if (errorDescription) {
    return decodeURIComponent(errorDescription.replace(/\+/g, ' '));
  }

  return fallback ?? '로그인에 실패했습니다. 잠시 후 다시 시도해주세요.';
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

async function getCognitoUser(tokenResponse: TokenResponse): Promise<AuthUser> {
  const idTokenClaims = decodeBase64UrlJson<CognitoIdTokenClaims>(tokenResponse.idToken);
  let userInfo: Record<string, unknown> | null = null;

  try {
    const config = getCognitoAuthConfig();
    userInfo = await fetchUserInfoAsync(
      {accessToken: tokenResponse.accessToken},
      {userInfoEndpoint: config.discovery.userInfoEndpoint},
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
    throw new Error('로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
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

  const result = await request.promptAsync(config.discovery);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('로그인이 취소되었습니다.');
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

  const tokenResponse = await exchangeCodeAsync(
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
  );

  return {
    accessToken: tokenResponse.accessToken,
    expiresIn: tokenResponse.expiresIn,
    idToken: tokenResponse.idToken,
    provider,
    refreshToken: tokenResponse.refreshToken,
    tokenType: tokenResponse.tokenType,
    user: await getCognitoUser(tokenResponse),
  };
}
