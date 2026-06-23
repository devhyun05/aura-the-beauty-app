import type { ImageSourcePropType } from 'react-native';

import type { UserProfile } from '../types/userPage';

const profileSeojin =
  require('../../assets/images/profiles/profile-seojin.png') as ImageSourcePropType;

export const userProfileMock: UserProfile = {
  id: 'user-seojin',
  name: '서진',
  nickname: '여두치',
  phone: '010-2342-1212',
  email: 'seojin@email.com',
  birthDate: '2003-06-23',
  gender: '여성',
  interest: '데일리',
  avatarSource: profileSeojin,
  personalColor: '봄웜 라이트',
  skinType: '건성 피부',
  skinTone: '밝은 아이보리',
  tags: ['봄웜 라이트', '건성 피부'],
};
