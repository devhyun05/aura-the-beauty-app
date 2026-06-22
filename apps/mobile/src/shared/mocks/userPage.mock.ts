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
const productVelvetTint =
  require('../../assets/images/product-like/product-velvet-tint.png') as ImageSourcePropType;
const productClearGloss =
  require('../../assets/images/product-like/product-clear-gloss.png') as ImageSourcePropType;
const productRoseLacquer =
  require('../../assets/images/product-like/product-rose-lacquer.png') as ImageSourcePropType;
const productSheerPowder =
  require('../../assets/images/product-like/product-sheer-powder.png') as ImageSourcePropType;
const productSatinCushion =
  require('../../assets/images/product-like/product-satin-cushion.png') as ImageSourcePropType;
const productNeutralPalette =
  require('../../assets/images/product-like/product-neutral-palette.png') as ImageSourcePropType;
const productLilacCheek =
  require('../../assets/images/product-like/product-lilac-cheek.png') as ImageSourcePropType;

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
    {
      id: 'product-velvet-tint',
      brandName: '누아벨',
      productName: '벨벳 레이어 틴트',
      price: 18000,
      imageSource: productVelvetTint,
      isLiked: true,
    },
    {
      id: 'product-clear-gloss',
      brandName: '오브린',
      productName: '클리어 볼륨 글로스',
      price: 17000,
      imageSource: productClearGloss,
      isLiked: true,
    },
    {
      id: 'product-rose-lacquer',
      brandName: '로지크',
      productName: '로즈 래커 립',
      price: 21000,
      imageSource: productRoseLacquer,
      isLiked: true,
    },
    {
      id: 'product-sheer-powder',
      brandName: '헤일로',
      productName: '쉬어 픽싱 파우더',
      price: 29000,
      imageSource: productSheerPowder,
      isLiked: true,
    },
    {
      id: 'product-satin-cushion',
      brandName: '멜로우핏',
      productName: '새틴 커버 쿠션',
      price: 34000,
      imageSource: productSatinCushion,
      isLiked: true,
    },
    {
      id: 'product-neutral-palette',
      brandName: '브라운랩',
      productName: '뉴트럴 아이 팔레트',
      price: 27000,
      imageSource: productNeutralPalette,
      isLiked: true,
    },
    {
      id: 'product-lilac-cheek',
      brandName: '페일무드',
      productName: '릴리 블러 치크',
      price: 23000,
      imageSource: productLilacCheek,
      isLiked: true,
    },
  ],
};
