import type {SocialLoginItem} from '../types';

export const socialLoginProviders: SocialLoginItem[] = [
  {
    id: 'google',
    label: 'Google 계정으로 로그인',
    shortLabel: 'G',
  },
  {
    id: 'kakao',
    label: 'Kakao 계정으로 로그인',
    shortLabel: 'TALK',
  },
  {
    id: 'naver',
    label: 'Naver 계정으로 로그인',
    shortLabel: 'N',
  },
];
