import type { ImageSourcePropType } from 'react-native';

import { analysisResultsMock } from './analysisResults.mock';
import type { UserPageData } from '../types/userPage';

const profileAvatar =
  require('../../assets/images/user-page/profile-seojin-avatar.png') as ImageSourcePropType;
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
    skinTone: '밝은 아이보리',
  },
  reports: analysisResultsMock.slice(0, 3),
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
      brandName: '로지팜',
      productName: '쥬시 퍼스트 틴트',
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
      productName: '블러링 무드 치크',
      price: 24000,
      imageSource: productMoodCheek,
      isLiked: true,
    },
  ],
};
