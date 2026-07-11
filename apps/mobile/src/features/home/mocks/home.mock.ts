import {appAssetSource, makeupFilterAssetSource} from '../../../shared/config/mediaAssets';
import {
  homeHeroAuradin,
  homeHeroConsulting,
  homeHeroFaceDiagnosis,
  homeHeroMakeupExtraction,
} from '../config/homeHeroAssets';
import type {HomeData} from '../types';

const lookOjiGirl = appAssetSource('images/looks/look-ojigirl.png');
const lookMoriGirl = appAssetSource('images/looks/look-morigirl.png');
const lookCleanSmoky = appAssetSource('images/looks/look-clean-smoky.png');
const filterJuiceCoral = makeupFilterAssetSource('filter-juice-coral.png');
const filterGlassSkinNude = makeupFilterAssetSource('filter-glass-skin-nude.png');
const filterMilkyStrawberryPink = makeupFilterAssetSource('filter-milky-strawberry-pink.png');

export const homeMock: HomeData = {
  hero: {
    eyebrow: 'AURA 기능 가이드',
    title: '내 얼굴에 맞는 뷰티 루틴',
    description: '진단부터 추출, 전문가 상담, 제품 추천까지 한 번에 이어져요.',
    imageSource: homeHeroFaceDiagnosis,
    notices: [
      {
        id: 'notice-feature-hero',
        title: '업데이트',
        description: '홈 배너가 AURA 핵심 기능 중심으로 업데이트되었어요.',
      },
    ],
    trends: [
      {
        ctaLabel: '진단하기',
        description: '얼굴형, 비율, 피부톤을 한 번에 진단해요.',
        featureId: 'faceDiagnosis',
        id: 'feature-face-diagnosis',
        title: '얼굴진단',
        tone: 'AI 얼굴 분석',
        imageSource: homeHeroFaceDiagnosis,
      },
      {
        ctaLabel: '추출하기',
        description: '참고 사진 속 메이크업 컬러와 질감을 뽑아줘요.',
        featureId: 'makeupExtraction',
        id: 'feature-makeup-extraction',
        title: '메이크업 추출',
        tone: '레퍼런스 분석',
        imageSource: homeHeroMakeupExtraction,
      },
      {
        ctaLabel: '상담하기',
        description: '메이크업 전문가와 연결해 맞춤 상담을 받아요.',
        featureId: 'consulting',
        id: 'feature-consulting',
        title: '전문가 컨설팅',
        tone: '메이크업 상담',
        imageSource: homeHeroConsulting,
      },
      {
        ctaLabel: '찾아보기',
        description: '색, 질감, 예산을 말하면 아우라딘이 제품을 찾아줘요.',
        featureId: 'auradin',
        id: 'feature-auradin',
        title: '아우라딘',
        tone: '추천 제품',
        imageSource: homeHeroAuradin,
      },
    ],
  },
  filterStore: [
    {
      id: 'filter-lip',
      title: '코랄 립 필터',
      description: '피치 코랄 립을 얼굴 위에서 바로 테스트',
      category: 'Lip',
      imageSource: filterJuiceCoral,
    },
    {
      id: 'filter-base',
      title: '글로우 베이스 필터',
      description: '맑은 피부광과 커버감을 자연스럽게 비교',
      category: 'Base',
      imageSource: filterGlassSkinNude,
    },
    {
      id: 'filter-cheek',
      title: '로지 치크 필터',
      description: '얼굴 톤에 맞는 블러셔 위치와 농도 조절',
      category: 'Cheek',
      imageSource: filterMilkyStrawberryPink,
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
