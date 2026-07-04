import type {FooterTabKey} from '../../shared/ui';
import type {
  MainTabRouteName,
  RouteName,
} from './routeTypes';
import {routes} from './routeTypes';

export type ScreenDepth = 'entry' | 'main' | 'sub' | 'immersive' | 'terminal';

export type ScreenCategory =
  | 'auth'
  | 'onboarding'
  | 'main-home'
  | 'main-profile'
  | 'main-community'
  | 'main-consulting'
  | 'feature-entry'
  | 'list'
  | 'detail-report'
  | 'form-edit'
  | 'progress'
  | 'capture-runtime'
  | 'ar-runtime'
  | 'completion'
  | 'navigation-host';

export type RouteChromeKind = 'mainTab' | 'detail' | 'fullscreen';
export type MainHeaderVariant = 'home' | 'custom' | 'default';
export type DetailHeaderRightAction = 'share' | 'close' | 'done';

type RouteChromeBase = {
  category: ScreenCategory;
  depth: ScreenDepth;
};

export type RouteChrome =
  | (RouteChromeBase & {
      footerTab?: FooterTabKey;
      headerVariant: MainHeaderVariant;
      kind: 'mainTab';
      statusBarStyle: 'dark';
    })
  | (RouteChromeBase & {
      kind: 'detail';
      rightActions?: readonly DetailHeaderRightAction[];
      statusBarStyle: 'dark';
      title: string;
    })
  | (RouteChromeBase & {
      kind: 'fullscreen';
      statusBarStyle: 'dark' | 'light';
    });

export type FooterTargetRoute = MainTabRouteName;

export const routeChromeByRoute = {
  Login: {
    category: 'auth',
    depth: 'entry',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  ProfileSetup: {
    category: 'auth',
    depth: 'entry',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  Tutorial: {
    category: 'onboarding',
    depth: 'entry',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  MainTabs: {
    category: 'navigation-host',
    depth: 'main',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  FaceCapture: {
    category: 'capture-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  FaceCaptureConfirmation: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['close'],
    statusBarStyle: 'dark',
    title: '사진 확인',
  },
  UnityMakeupCapture: {
    category: 'capture-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  FaceAnalysisIntro: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['close'],
    statusBarStyle: 'dark',
    title: '얼굴 분석',
  },
  FaceAnalysisLoading: {
    category: 'progress',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '얼굴 분석',
  },
  FaceAnalysisReportsList: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '얼굴 분석 결과',
  },
  FaceAnalysisReportDetail: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['share', 'close'],
    statusBarStyle: 'dark',
    title: '맞춤 분석 보고서',
  },
  FloatingActionSettings: {
    category: 'form-edit',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '빠른 실행 설정',
  },
  AppSettings: {
    category: 'form-edit',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '앱 환경설정',
  },
  ProfileEdit: {
    category: 'form-edit',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '프로필 수정',
  },
  HomeFilterStore: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '필터 스토어',
  },
  Magazine: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '매거진',
  },
  SavedMakeupList: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '저장된 메이크업',
  },
  ProductRecommendation: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '추천 제품',
  },
  Community: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '커뮤니티',
  },
  Consulting: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '컨설팅',
  },
  MakeupLookList: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '메이크업 룩',
  },
  LikedProductList: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '좋아요 목록',
  },
  ARFilter: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  ARFilterShapeAdjust: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  MakeupFilterEdit: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  MakeupFeedbackCapture: {
    category: 'capture-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  MakeupFeedbackAlbumUpload: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '\uBA54\uC774\uD06C\uC5C5 \uD53C\uB4DC\uBC31',
  },
  MakeupFeedbackGoalInput: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['close'],
    statusBarStyle: 'dark',
    title: 'AI 피드백',
  },
  MakeupFeedbackLoading: {
    category: 'progress',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '메이크업 피드백',
  },
  MakeupFeedbackResult: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '메이크업 피드백',
  },
  MakeupCorrectionGuide: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '가이드 오버레이',
  },
  MakeupCorrectionTip: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '수정팁',
  },
  ReferenceMakeupExtractionUpload: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['close'],
    statusBarStyle: 'dark',
    title: '메이크업 추출',
  },
  ReferenceMakeupExtractionLoading: {
    category: 'progress',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  ReferenceMakeupExtractionResult: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '메이크업 추출',
  },
  ExtractedMakeupLookAdjust: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  MakeupFilterSave: {
    category: 'form-edit',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['done'],
    statusBarStyle: 'dark',
    title: '메이크업 필터 저장',
  },
  MakeupFilterSaveComplete: {
    category: 'completion',
    depth: 'terminal',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  MakeupRecipeDetail: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '상세 분석',
  },
  MakeupRecipeSaveComplete: {
    category: 'completion',
    depth: 'terminal',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  HomeTab: {
    category: 'main-home',
    depth: 'main',
    footerTab: 'home',
    headerVariant: 'home',
    kind: 'mainTab',
    statusBarStyle: 'dark',
  },
  ProfileTab: {
    category: 'main-profile',
    depth: 'main',
    footerTab: 'profile',
    headerVariant: 'home',
    kind: 'mainTab',
    statusBarStyle: 'dark',
  },
  CommunityTab: {
    category: 'main-community',
    depth: 'main',
    footerTab: 'community',
    headerVariant: 'home',
    kind: 'mainTab',
    statusBarStyle: 'dark',
  },
  ConsultingTab: {
    category: 'main-consulting',
    depth: 'main',
    footerTab: 'consulting',
    headerVariant: 'home',
    kind: 'mainTab',
    statusBarStyle: 'dark',
  },
} as const satisfies Record<RouteName, RouteChrome>;

export function getRouteChrome(route: RouteName): RouteChrome {
  return routeChromeByRoute[route];
}

export function getDetailRouteTitle(route: RouteName): string {
  const chrome = getRouteChrome(route);

  if (chrome.kind !== 'detail') {
    throw new Error(`${route} is not a detail route`);
  }

  return chrome.title;
}

export function getFooterTargetRoute(tab: FooterTabKey): FooterTargetRoute {
  if (tab === 'profile') {
    return 'ProfileTab';
  }

  if (tab === 'community') {
    return 'CommunityTab';
  }

  if (tab === 'consulting') {
    return 'ConsultingTab';
  }

  return 'HomeTab';
}

export function getRoutesByDepth(depth: ScreenDepth): RouteName[] {
  return routes.filter((route) => routeChromeByRoute[route].depth === depth);
}
