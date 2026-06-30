import type {ImageSourcePropType} from 'react-native';

import type {HomeData} from '../types';

const lookOjiGirl =
  require('../../../assets/images/looks/look-ojigirl.png') as ImageSourcePropType;
const lookMoriGirl =
  require('../../../assets/images/looks/look-morigirl.png') as ImageSourcePropType;
const lookCleanSmoky =
  require('../../../assets/images/looks/look-clean-smoky.png') as ImageSourcePropType;
const filterWanghongRedGlass =
  require('../../../assets/images/makeup-filters/filter-wanghong-glass-pink.png') as ImageSourcePropType;
const filterGyaruGlow =
  require('../../../assets/images/makeup-filters/filter-gyaru-glow.png') as ImageSourcePropType;
const filterAuraBlushLift =
  require('../../../assets/images/makeup-filters/filter-aura-blush-lift.png') as ImageSourcePropType;
const productCoralTint =
  require('../../../assets/images/products/product-coral-tint.png') as ImageSourcePropType;
const productGlowCushion =
  require('../../../assets/images/products/product-glow-cushion.png') as ImageSourcePropType;
const productMoodCheek =
  require('../../../assets/images/products/product-mood-cheek.png') as ImageSourcePropType;

export const homeMock: HomeData = {
  hero: {
    eyebrow: '이번 주 메이크업 가이드',
    title: 'AI 트렌드 메이크업 무드',
    description: '지금 많이 찾는 메이크업 무드를 AI가 골라 카드로 추천해요.',
    imageSource: filterWanghongRedGlass,
    notices: [
      {
        id: 'notice-weekly-trend',
        title: '공지',
        description: '이번 주 추천 룩이 왕홍 레드 글래스 무드로 업데이트되었어요.',
      },
    ],
    trends: [
      {
        filterId: 'filter-wanghong-glass-pink',
        id: 'trend-wanghong-glass-pink',
        title: '왕홍 레드 글래스',
        tone: '루비 레드',
        imageSource: filterWanghongRedGlass,
      },
      {
        filterId: 'filter-gyaru-glow',
        id: 'trend-gyaru-glow',
        title: '갸루 글로우',
        tone: '샴페인 코랄',
        imageSource: filterGyaruGlow,
      },
      {
        filterId: 'filter-aura-blush-lift',
        id: 'trend-aura-blush',
        title: '아우라 블러시',
        tone: '워터 로즈',
        imageSource: filterAuraBlushLift,
      },
    ],
  },
  filterStore: [
    {
      id: 'filter-lip',
      title: '코랄 립 필터',
      description: '피치 코랄 립을 얼굴 위에서 바로 테스트',
      category: 'Lip',
      imageSource: productCoralTint,
    },
    {
      id: 'filter-base',
      title: '글로우 베이스 필터',
      description: '맑은 피부광과 커버감을 자연스럽게 비교',
      category: 'Base',
      imageSource: productGlowCushion,
    },
    {
      id: 'filter-cheek',
      title: '로지 치크 필터',
      description: '얼굴 톤에 맞는 블러셔 위치와 농도 조절',
      category: 'Cheek',
      imageSource: productMoodCheek,
    },
  ],
  recommendedLooks: [
    {
      id: 'look-oji-girl',
      title: '클린 오피스',
      description: '블랙 재킷에 어울리는 뉴트럴 브라운 음영',
      date: '2026.06.23',
      imageSource: lookOjiGirl,
    },
    {
      id: 'look-mori-girl',
      title: '소프트 모리',
      description: '피치 베이지와 부드러운 음영의 자연스러운 룩',
      date: '2026.06.21',
      imageSource: lookMoriGirl,
    },
    {
      id: 'look-clean-smoky',
      title: '클린 스모키',
      description: '깨끗한 피부에 라이트 브라운 라인 포인트',
      date: '2026.06.18',
      imageSource: lookCleanSmoky,
    },
  ],
};
