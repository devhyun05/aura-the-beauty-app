import * as AuthSession from 'expo-auth-session';

import type {SocialLoginProvider} from '../types';

const DEFAULT_SCOPES = ['openid', 'email', 'profile'];
const DEFAULT_REDIRECT_PATH = 'auth/callback';

type CognitoEnvironment = {
  clientId?: string;
  domain?: string;
  domainPrefix?: string;
  region?: string;
  redirectUri?: string;
  scopes?: string;
  prompt?: string;
  appleIdp?: string;
  googleIdp?: string;
  kakaoIdp?: string;
  naverIdp?: string;
};

export type CognitoAuthConfig = {
  clientId: string;
  discovery: {
    authorizationEndpoint: string;
    tokenEndpoint: string;
    revocationEndpoint: string;
    userInfoEndpoint: string;
  };
  providerNames: Record<SocialLoginProvider, string>;
  prompt?: string;
  redirectUri: string;
  scopes: string[];
};

const env: CognitoEnvironment = {
  clientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID,
  domain: process.env.EXPO_PUBLIC_COGNITO_DOMAIN,
  domainPrefix: process.env.EXPO_PUBLIC_COGNITO_DOMAIN_PREFIX,
  region: process.env.EXPO_PUBLIC_COGNITO_REGION,
  redirectUri: process.env.EXPO_PUBLIC_COGNITO_REDIRECT_URI,
  scopes: process.env.EXPO_PUBLIC_COGNITO_SCOPES,
  prompt: process.env.EXPO_PUBLIC_COGNITO_PROMPT,
  appleIdp: process.env.EXPO_PUBLIC_COGNITO_APPLE_IDP,
  googleIdp: process.env.EXPO_PUBLIC_COGNITO_GOOGLE_IDP,
  kakaoIdp: process.env.EXPO_PUBLIC_COGNITO_KAKAO_IDP,
  naverIdp: process.env.EXPO_PUBLIC_COGNITO_NAVER_IDP,
};

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function normalizeCognitoDomain(rawDomain: string): string {
  const trimmedDomain = rawDomain.trim().replace(/\/+$/, '');

  if (trimmedDomain.startsWith('https://')) {
    return trimmedDomain;
  }

  return `https://${trimmedDomain.replace(/^http:\/\//, '')}`;
}

function resolveCognitoDomain(): string {
  const explicitDomain = normalizeOptional(env.domain);

  if (explicitDomain) {
    return normalizeCognitoDomain(explicitDomain);
  }

  const domainPrefix = normalizeOptional(env.domainPrefix);
  const region = normalizeOptional(env.region);

  if (domainPrefix && region) {
    return normalizeCognitoDomain(`${domainPrefix}.auth.${region}.amazoncognito.com`);
  }

  throw new Error(
    'Missing Cognito domain. Set EXPO_PUBLIC_COGNITO_DOMAIN or EXPO_PUBLIC_COGNITO_DOMAIN_PREFIX and EXPO_PUBLIC_COGNITO_REGION.',
  );
}

function resolveClientId(): string {
  const clientId = normalizeOptional(env.clientId);

  if (!clientId) {
    throw new Error('Missing Cognito app client ID. Set EXPO_PUBLIC_COGNITO_CLIENT_ID.');
  }

  return clientId;
}

function resolveRedirectUri(): string {
  const configuredRedirectUri = normalizeOptional(env.redirectUri);

  if (configuredRedirectUri) {
    return configuredRedirectUri;
  }

  return AuthSession.makeRedirectUri({
    path: DEFAULT_REDIRECT_PATH,
    scheme: 'aiarmakeup',
  });
}

function resolveScopes(): string[] {
  const configuredScopes = normalizeOptional(env.scopes);

  if (!configuredScopes) {
    return DEFAULT_SCOPES;
  }

  return configuredScopes.split(/[,\s]+/).filter(Boolean);
}

export function getCognitoAuthConfig(): CognitoAuthConfig {
  const domain = resolveCognitoDomain();

  return {
    clientId: resolveClientId(),
    discovery: {
      authorizationEndpoint: `${domain}/oauth2/authorize`,
      tokenEndpoint: `${domain}/oauth2/token`,
      revocationEndpoint: `${domain}/oauth2/revoke`,
      userInfoEndpoint: `${domain}/oauth2/userInfo`,
    },
    providerNames: {
      apple: normalizeOptional(env.appleIdp) ?? 'SignInWithApple',
      google: normalizeOptional(env.googleIdp) ?? 'Google',
      kakao: normalizeOptional(env.kakaoIdp) ?? 'Kakao',
      naver: normalizeOptional(env.naverIdp) ?? 'Naver',
    },
    prompt: normalizeOptional(env.prompt),
    redirectUri: resolveRedirectUri(),
    scopes: resolveScopes(),
  };
}
