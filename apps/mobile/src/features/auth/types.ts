export type SocialLoginProvider = 'google' | 'kakao' | 'naver';

export type SocialLoginItem = {
  id: SocialLoginProvider;
  label: string;
  shortLabel: string;
};

export type AuthUser = {
  email?: string;
  id: string;
  name?: string;
  nickname: string;
};

export type AuthSession = {
  accessToken: string;
  expiresIn?: number;
  idToken?: string;
  provider: SocialLoginProvider;
  refreshToken?: string;
  tokenType?: string;
  user: AuthUser;
};
