import type { ImageSourcePropType } from 'react-native';

import type { UserPageData } from '../types/userPage';

const profileAvatar =
  require('../../assets/images/user-page/profile-seojin-avatar.png') as ImageSourcePropType;
const reportBareFace =
  require('../../assets/images/user-page/report-bare-face-20260622.png') as ImageSourcePropType;
const reportRetake =
  require('../../assets/images/user-page/report-retake-20260608.png') as ImageSourcePropType;
const styleOjiGirl =
  require('../../assets/images/user-page/style-oji-girl.png') as ImageSourcePropType;
const styleMoriGirl =
  require('../../assets/images/user-page/style-mori-girl.png') as ImageSourcePropType;
const styleCleanSmoky =
  require('../../assets/images/user-page/style-clean-smoky.png') as ImageSourcePropType;
const productCoralTint =
  require('../../assets/images/user-page/product-coral-tint.png') as ImageSourcePropType;
const productGlowCushion =
  require('../../assets/images/user-page/product-glow-cushion.png') as ImageSourcePropType;
const productMoodCheek =
  require('../../assets/images/user-page/product-mood-cheek.png') as ImageSourcePropType;

export const userPageMock: UserPageData = {
  profile: {
    id: 'user-seojin',
    name: '서진',
    email: 'seojin@email.com',
    avatarSource: profileAvatar,
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    skinTone: '밝은 피부톤',
  },
  reports: [
    {
      id: 'report-2026-06-22',
      analyzedAt: '2026.06.22',
      title: '생얼 기반 1차 분석',
      imageSource: reportBareFace,
      personalColor: '봄웜 라이트',
      skinType: '건성 피부',
      summary:
        '맑은 코랄과 복숭아빛 베이스가 얼굴 톤을 깨끗하게 살려줘요.',
    },
    {
      id: 'report-2026-06-08',
      analyzedAt: '2026.06.08',
      title: '재촬영 분석 리포트',
      imageSource: reportRetake,
      personalColor: '봄웜 라이트',
      skinType: '건성 피부',
      summary:
        '조명과 헤어가 달라져도 밝고 투명한 웜톤 팔레트가 안정적으로 어울려요.',
    },
  ],
  makeupStyles: [
    {
      id: 'style-oji-girl',
      title: '오지걸',
      imageSource: styleOjiGirl,
      isSaved: true,
    },
    {
      id: 'style-mori-girl',
      title: '모리걸',
      imageSource: styleMoriGirl,
      isSaved: true,
    },
    {
      id: 'style-clean-smoky',
      title: '클린 스모키',
      imageSource: styleCleanSmoky,
      isSaved: true,
    },
  ],
  favoriteProducts: [
    {
      id: 'product-coral-tint',
      brandName: '로지앤',
      productName: '쥬시 래스팅 틴트',
      price: 15000,
      imageSource: productCoralTint,
      isLiked: true,
    },
    {
      id: 'product-glow-cushion',
      brandName: '글로디',
      productName: '글로우 커버 쿠션',
      price: 32000,
      imageSource: productGlowCushion,
      isLiked: true,
    },
    {
      id: 'product-mood-cheek',
      brandName: '데이무드',
      productName: '블렌딩 무드 치크',
      price: 24000,
      imageSource: productMoodCheek,
      isLiked: true,
    },
  ],
};
