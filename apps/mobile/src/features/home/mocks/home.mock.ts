import type {ImageSourcePropType} from 'react-native';

import type {HomeData} from '../types';

const styleOjiGirl =
  require('../../../assets/images/user-page/style-oji-girl.png') as ImageSourcePropType;
const styleMoriGirl =
  require('../../../assets/images/user-page/style-mori-girl.png') as ImageSourcePropType;
const styleCleanSmoky =
  require('../../../assets/images/user-page/style-clean-smoky.png') as ImageSourcePropType;
const productCoralTint =
  require('../../../assets/images/user-page/product-coral-tint.png') as ImageSourcePropType;
const productGlowCushion =
  require('../../../assets/images/user-page/product-glow-cushion.png') as ImageSourcePropType;
const productMoodCheek =
  require('../../../assets/images/user-page/product-mood-cheek.png') as ImageSourcePropType;

export const homeMock: HomeData = {
  hero: {
    eyebrow: '트렌드 스타일',
    title: '이번 주 메이크업 무드',
    description: '맑은 피부 표현과 차분한 로즈 톤으로 완성하는 데일리 룩',
    imageSource: styleOjiGirl,
    notices: [
      {
        id: 'notice-weekly-trend',
        title: '공지',
        description: '이번 주 추천 룩이 새로 업데이트됐어요.',
      },
    ],
    trends: [
      {
        id: 'trend-clear-glow',
        title: '맑은 글로우',
        tone: '로즈 베이지',
        imageSource: styleOjiGirl,
      },
      {
        id: 'trend-soft-mori',
        title: '소프트 모리',
        tone: '피치 브라운',
        imageSource: styleMoriGirl,
      },
      {
        id: 'trend-clean-smoky',
        title: '클린 스모키',
        tone: '뉴트럴 애쉬',
        imageSource: styleCleanSmoky,
      },
    ],
  },
  filterStore: [
    {
      id: 'filter-lip',
      title: '립 컬러 필터',
      description: '톤별 립 컬러를 얼굴 위에 미리 확인',
      category: 'Lip',
      imageSource: productCoralTint,
    },
    {
      id: 'filter-base',
      title: '피부 표현 필터',
      description: '글로우, 세미매트, 커버 중심 베이스',
      category: 'Base',
      imageSource: productGlowCushion,
    },
    {
      id: 'filter-cheek',
      title: '치크 무드 필터',
      description: '분위기에 맞는 블러셔 위치와 농도',
      category: 'Cheek',
      imageSource: productMoodCheek,
    },
  ],
  recommendedLooks: [
    {
      id: 'look-oji-girl',
      title: '오지걸',
      description: '선명한 눈매와 촉촉한 립 포인트',
      date: '2026.06.23',
      imageSource: styleOjiGirl,
    },
    {
      id: 'look-mori-girl',
      title: '모리걸',
      description: '부드러운 음영과 자연스러운 혈색',
      date: '2026.06.21',
      imageSource: styleMoriGirl,
    },
    {
      id: 'look-clean-smoky',
      title: '클린 스모키',
      description: '담백한 피부에 또렷한 라인감',
      date: '2026.06.18',
      imageSource: styleCleanSmoky,
    },
  ],
};
