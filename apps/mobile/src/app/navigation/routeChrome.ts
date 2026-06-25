import type {FooterTabKey} from '../../shared/ui';
import type {
  MainTabRouteName,
  RouteName,
  RootStackRouteName,
} from './routeTypes';
import {routes} from './routeTypes';

export type ScreenDepth = 'entry' | 'main' | 'sub' | 'immersive' | 'terminal';

export type ScreenCategory =
  | 'auth'
  | 'onboarding'
  | 'main-home'
  | 'main-recommendation'
  | 'main-profile'
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
      footerTab?: Extract<FooterTabKey, 'home' | 'custom'>;
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

export type FooterTargetRoute = MainTabRouteName | Extract<RootStackRouteName, 'ARFilter'>;

export const routeChromeByRoute = {
  Login: {
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
  ImageAnalysisLoading: {
    category: 'progress',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '얼굴 분석',
  },
  ImageAnalysisReportsList: {
    category: 'list',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '이미지 분석 결과',
  },
  ImageAnalysisReportDetail: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['share', 'close'],
    statusBarStyle: 'dark',
    title: '맞춤 분석 보고서',
  },
  ProfileEdit: {
    category: 'form-edit',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '프로필 수정',
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
  ARFilterLocationAdjust: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  ARFilterStyleAdjust: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  MakeupFeedbackEntry: {
    category: 'feature-entry',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['close'],
    statusBarStyle: 'dark',
    title: '메이크업 피드백',
  },
  MakeupFeedbackCapture: {
    category: 'capture-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
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
    title: '분석 결과',
  },
  ExtractedMakeupLookAdjust: {
    category: 'ar-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  ExtractedMakeupLookSaveForm: {
    category: 'form-edit',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['done'],
    statusBarStyle: 'dark',
    title: '메이크업 룩 저장',
  },
  ExtractedMakeupLookSaveComplete: {
    category: 'completion',
    depth: 'terminal',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  ExtractedMakeupLookRecipeDetail: {
    category: 'detail-report',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '상세 분석',
  },
  ExtractedMakeupLookRecipeSaveComplete: {
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
  CustomTab: {
    category: 'main-recommendation',
    depth: 'main',
    footerTab: 'custom',
    headerVariant: 'custom',
    kind: 'mainTab',
    statusBarStyle: 'dark',
  },
  ProfileTab: {
    category: 'main-profile',
    depth: 'main',
    headerVariant: 'default',
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
  if (tab === 'capture') {
    return 'ARFilter';
  }

  if (tab === 'custom') {
    return 'CustomTab';
  }

  return 'HomeTab';
}

export function getRoutesByDepth(depth: ScreenDepth): RouteName[] {
  return routes.filter((route) => routeChromeByRoute[route].depth === depth);
}
