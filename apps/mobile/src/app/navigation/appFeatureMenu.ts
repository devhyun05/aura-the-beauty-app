import type {
  MainTabRouteName,
  RootStackRouteName,
} from './routeTypes';

export type AppFeatureMenuItemId =
  | 'home'
  | 'profile'
  | 'community'
  | 'consulting'
  | 'arFilter'
  | 'makeupExtraction'
  | 'makeupFeedback'
  | 'faceAnalysis'
  | 'beardSimulation'
  | 'recommendedFilters'
  | 'makeupRecommendation'
  | 'productRecommendation'
  | 'savedMakeup'
  | 'makeupLooks'
  | 'likedProducts'
  | 'appSettings';

export type AppFeatureMenuRootRouteName = Extract<
  RootStackRouteName,
  | 'ARFilter'
  | 'ReferenceMakeupExtractionUpload'
  | 'MakeupFeedbackAlbumUpload'
  | 'FaceAnalysisIntro'
  | 'BeardSimulation'
  | 'HomeFilterStore'
  | 'Community'
  | 'Consulting'
  | 'MakeupRecommendation'
  | 'ProductRecommendation'
  | 'SavedMakeupList'
  | 'MakeupLookList'
  | 'LikedProductList'
  | 'AppSettings'
>;

export type AppFeatureMenuTarget =
  | {
      kind: 'mainTab';
      routeName: MainTabRouteName;
    }
  | {
      kind: 'root';
      routeName: AppFeatureMenuRootRouteName;
    };

export type AppFeatureMenuItem = {
  description: string;
  id: AppFeatureMenuItemId;
  label: string;
  target: AppFeatureMenuTarget;
};

export type AppFeatureMenuSection = {
  id: 'main' | 'makeup' | 'analysis' | 'settings';
  items: readonly AppFeatureMenuItem[];
  label: string;
};

export const appFeatureMenuSections: readonly AppFeatureMenuSection[] = [
  {
    id: 'main',
    label: '주요 화면',
    items: [
      {
        id: 'home',
        label: '홈',
        description: '추천 필터와 오늘의 메이크업 흐름을 확인해요.',
        target: {kind: 'mainTab', routeName: 'HomeTab'},
      },
      {
        id: 'profile',
        label: '프로필',
        description: '내 저장 룩과 활동 정보를 확인해요.',
        target: {kind: 'mainTab', routeName: 'ProfileTab'},
      },
      {
        id: 'community',
        label: '커뮤니티',
        description: '커뮤니티 화면으로 이동해요.',
        target: {kind: 'root', routeName: 'Community'},
      },
      {
        id: 'consulting',
        label: '컨설팅',
        description: '퍼스널 컬러, 헤어, 패션 컨설팅 화면으로 이동해요.',
        target: {kind: 'mainTab', routeName: 'ConsultingTab'},
      },
    ],
  },
  {
    id: 'makeup',
    label: '메이크업 도구',
    items: [
      {
        id: 'arFilter',
        label: '메이크업 필터',
        description: '메이크업 필터를 바로 얼굴에 적용해요.',
        target: {kind: 'root', routeName: 'ARFilter'},
      },
      {
        id: 'makeupExtraction',
        label: '메이크업 추출',
        description: '참고 메이크업 사진을 필터로 변환해요.',
        target: {kind: 'root', routeName: 'ReferenceMakeupExtractionUpload'},
      },
      {
        id: 'makeupFeedback',
        label: '메이크업 피드백',
        description: '사진을 올려 오늘 메이크업 균형을 점검해요.',
        target: {kind: 'root', routeName: 'MakeupFeedbackAlbumUpload'},
      },
    ],
  },
  {
    id: 'analysis',
    label: '분석과 추천',
    items: [
      {
        id: 'faceAnalysis',
        label: '얼굴 분석',
        description: '얼굴형과 퍼스널 무드를 분석해요.',
        target: {kind: 'root', routeName: 'FaceAnalysisIntro'},
      },
      {
        id: 'beardSimulation',
        label: '수염 제거',
        description: '수염을 분석하거나 사진 속 수염 자국을 정리해요.',
        target: {kind: 'root', routeName: 'BeardSimulation'},
      },
      {
        id: 'recommendedFilters',
        label: '추천 필터',
        description: '전체 추천 메이크업 필터를 둘러봐요.',
        target: {kind: 'root', routeName: 'HomeFilterStore'},
      },
      {
        id: 'makeupRecommendation',
        label: '메이크업 추천',
        description: '오늘의 시나리오를 고르고 나만의 룩을 추천받아요.',
        target: {kind: 'root', routeName: 'MakeupRecommendation'},
      },
      {
        id: 'productRecommendation',
        label: '추천 제품',
        description: '분석 결과에 맞는 제품을 확인해요.',
        target: {kind: 'root', routeName: 'ProductRecommendation'},
      },
      {
        id: 'savedMakeup',
        label: '저장된 메이크업',
        description: '저장해 둔 메이크업 기록을 확인해요.',
        target: {kind: 'root', routeName: 'SavedMakeupList'},
      },
      {
        id: 'makeupLooks',
        label: '메이크업 룩',
        description: '좋아요한 메이크업 룩을 모아봐요.',
        target: {kind: 'root', routeName: 'MakeupLookList'},
      },
      {
        id: 'likedProducts',
        label: '좋아요 목록',
        description: '관심 제품 목록을 확인해요.',
        target: {kind: 'root', routeName: 'LikedProductList'},
      },
    ],
  },
  {
    id: 'settings',
    label: '설정',
    items: [
      {
        id: 'appSettings',
        label: '앱 환경설정',
        description: '앱 표시와 권한 관련 설정을 확인해요.',
        target: {kind: 'root', routeName: 'AppSettings'},
      },
    ],
  },
];

export function getAppFeatureMenuSectionLabels(): readonly string[] {
  return appFeatureMenuSections.map(section => section.label);
}

export function getAppFeatureMenuTarget(
  itemId: AppFeatureMenuItemId,
): AppFeatureMenuTarget {
  const item = appFeatureMenuSections
    .flatMap(section => section.items)
    .find(menuItem => menuItem.id === itemId);

  if (!item) {
    throw new Error(`Unknown app feature menu item: ${itemId}`);
  }

  return item.target;
}
