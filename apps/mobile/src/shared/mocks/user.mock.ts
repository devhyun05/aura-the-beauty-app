import type {BeautyProfile, ProfileEditField, UserProfile} from '../types/profile';

export const userProfileMock: UserProfile = {
  id: 'user-seojin',
  name: '서진',
  nickname: '여두치',
  phone: '010-2342-1212',
  email: 'seojin@email.com',
  birthDate: '2003-06-23',
  gender: '여성',
  interest: '데일리',
};

export const beautyProfileMock: BeautyProfile = {
  personalColor: '봄웜 라이트',
  skinType: '건성 피부',
  skinTone: '밝은 아이보리',
  tags: ['봄웜 라이트', '건성 피부'],
};

export const profileEditFieldsMock: ProfileEditField[] = [
  {
    id: 'name',
    label: '이름',
    value: '여서진',
    editable: true,
  },
  {
    id: 'nickname',
    label: '닉네임',
    value: '여두치',
    editable: true,
  },
  {
    id: 'phone',
    label: '전화번호',
    value: '010-2342-1212',
    editable: true,
  },
  {
    id: 'email',
    label: '이메일',
    value: 'dksl@naver.com',
    editable: true,
  },
  {
    id: 'birthDate',
    label: '생년월일',
    value: '2003-06-23',
    editable: true,
  },
  {
    id: 'gender',
    label: '성별',
    value: '여성',
    editable: true,
  },
  {
    id: 'interest',
    label: '관심사',
    value: '데일리',
    editable: true,
  },
];
