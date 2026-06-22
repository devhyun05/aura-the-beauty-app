export type SocialLoginProvider = 'google' | 'kakao' | 'naver';

export type SocialLoginItem = {
  id: SocialLoginProvider;
  label: string;
  shortLabel: string;
};

export type AuthUser = {
  id: string;
  nickname: string;
};

export type AuthSession = {
  accessToken: string;
  provider: SocialLoginProvider;
  user: AuthUser;
};
