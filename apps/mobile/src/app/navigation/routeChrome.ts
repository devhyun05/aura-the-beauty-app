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
      contextLabel: string;
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
    contextLabel: 'FACE ANALYSIS',
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
    contextLabel: 'FACE ANALYSIS',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '얼굴 분석',
  },
  FaceAnalysisLoading: {
    category: 'progress',
    contextLabel: 'FACE ANALYSIS',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '얼굴 분석',
  },
  FaceAnalysisReportsList: {
    category: 'list',
    contextLabel: 'FACE ANALYSIS',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '얼굴 분석 결과',
  },
  FaceAnalysisReportDetail: {
    category: 'detail-report',
    contextLabel: 'FACE ANALYSIS',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['share'],
    statusBarStyle: 'dark',
    title: '맞춤 분석 보고서',
  },
  FloatingActionSettings: {
    category: 'form-edit',
    contextLabel: 'QUICK ACTION',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '빠른 실행 설정',
  },
  AppSettings: {
    category: 'form-edit',
    contextLabel: 'SETTINGS',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '앱 환경설정',
  },
  Faq: {
    category: 'list',
    contextLabel: 'SUPPORT',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: 'FAQ',
  },
  ProfileEdit: {
    category: 'form-edit',
    contextLabel: 'PROFILE',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '프로필 수정',
  },
  HomeFilterStore: {
    category: 'list',
    contextLabel: 'FILTER STORE',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '필터 스토어',
  },
  HairRemovalSimulation: {
    category: 'feature-entry',
    contextLabel: 'HAIR REMOVAL',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '제모 시뮬레이션',
  },
  SavedMakeupList: {
    category: 'list',
    contextLabel: 'SAVED LOOKS',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '저장된 메이크업',
  },
  ProductRecommendation: {
    category: 'list',
    contextLabel: 'PRODUCTS',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '추천 제품',
  },
  AuradinSearch: {
    category: 'list',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'dark',
  },
  Community: {
    category: 'list',
    contextLabel: 'COMMUNITY',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '룩톡',
  },
  CommunityThreadDetail: {
    category: 'detail-report',
    contextLabel: 'COMMUNITY',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['share'],
    statusBarStyle: 'dark',
    title: '룩톡',
  },
  CommunityThreadCreate: {
    category: 'form-edit',
    contextLabel: 'COMMUNITY',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '룩 올리기',
  },
  CommunityThreadEdit: {
    category: 'form-edit',
    contextLabel: 'COMMUNITY',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '룩 수정',
  },
  CommunityUserProfile: {
    category: 'detail-report',
    contextLabel: 'COMMUNITY',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '프로필',
  },
  Consulting: {
    category: 'list',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '컨설팅',
  },
  ConsultingExpertList: {
    category: 'list',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '상담사 선택',
  },
  ConsultingExpertProfile: {
    category: 'detail-report',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '전문가',
  },
  ConsultingBooking: {
    category: 'form-edit',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '상담 신청',
  },
  ConsultingRequestConfirm: {
    category: 'form-edit',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '신청 확인',
  },
  ConsultingBookingComplete: {
    category: 'completion',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '신청 접수',
  },
  ConsultingCall: {
    category: 'capture-runtime',
    depth: 'immersive',
    kind: 'fullscreen',
    statusBarStyle: 'light',
  },
  ConsultingSummary: {
    category: 'detail-report',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '상담 요약',
  },
  ConsultingHistory: {
    category: 'list',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '내 상담 내역',
  },
  ConsultingMessages: {
    category: 'list',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '상담 톡',
  },
  ConsultingNotifications: {
    category: 'list',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '알림',
  },
  ConsultingConversation: {
    category: 'detail-report',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '상담 대화',
  },
  ConsultingMembership: {
    category: 'detail-report',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '멤버십 준비 중',
  },
  ConsultingReview: {
    category: 'form-edit',
    contextLabel: 'CONSULTING',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '리뷰 작성',
  },
  MakeupLookList: {
    category: 'list',
    contextLabel: 'MAKEUP LOOK',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '메이크업 룩',
  },
  LikedProductList: {
    category: 'list',
    contextLabel: 'SAVED ITEMS',
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
    contextLabel: 'MAKEUP FEEDBACK',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '\uBA54\uC774\uD06C\uC5C5 \uD53C\uB4DC\uBC31',
  },
  MakeupFeedbackGoalInput: {
    category: 'feature-entry',
    contextLabel: 'MAKEUP FEEDBACK',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['close'],
    statusBarStyle: 'dark',
    title: 'AI 피드백',
  },
  MakeupFeedbackLoading: {
    category: 'progress',
    contextLabel: 'MAKEUP FEEDBACK',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '메이크업 피드백',
  },
  MakeupFeedbackResultsList: {
    category: 'list',
    contextLabel: 'MAKEUP FEEDBACK',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '피드백 목록',
  },
  MakeupFeedbackResult: {
    category: 'detail-report',
    contextLabel: 'MAKEUP FEEDBACK',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['share'],
    statusBarStyle: 'dark',
    title: '메이크업 피드백',
  },
  MakeupCorrectionGuide: {
    category: 'detail-report',
    contextLabel: 'CORRECTION GUIDE',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '가이드 오버레이',
  },
  MakeupCorrectionTip: {
    category: 'detail-report',
    contextLabel: 'CORRECTION GUIDE',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '수정팁',
  },
  ReferenceMakeupExtractionUpload: {
    category: 'feature-entry',
    contextLabel: 'MAKEUP EXTRACTION',
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
    contextLabel: 'MAKEUP EXTRACTION',
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
    contextLabel: 'FILTER CUSTOM',
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
  MakeupRecipeList: {
    category: 'list',
    contextLabel: 'MAKEUP RECIPE',
    depth: 'sub',
    kind: 'detail',
    statusBarStyle: 'dark',
    title: '레시피 목록',
  },
  MakeupRecipeDetail: {
    category: 'detail-report',
    contextLabel: 'MAKEUP RECIPE',
    depth: 'sub',
    kind: 'detail',
    rightActions: ['share'],
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

export function getDetailRouteContextLabel(route: RouteName): string {
  const chrome = getRouteChrome(route);

  if (chrome.kind !== 'detail') {
    throw new Error(`${route} is not a detail route`);
  }

  return chrome.contextLabel;
}

export function getFooterTargetRoute(tab: FooterTabKey): FooterTargetRoute {
  if (tab === 'profile') {
    return 'ProfileTab';
  }

  if (tab === 'consulting') {
    return 'ConsultingTab';
  }

  return 'HomeTab';
}

export function getRoutesByDepth(depth: ScreenDepth): RouteName[] {
  return routes.filter((route) => routeChromeByRoute[route].depth === depth);
}
