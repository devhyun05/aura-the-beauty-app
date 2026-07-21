import type {LinkingOptions} from '@react-navigation/native';

import type {
  MainTabParamList,
  MainTabRouteName,
  RootStackParamList,
  RootStackRouteName,
} from './routeTypes';
import {mainTabRoutes, rootStackRoutes} from './routeTypes';

export const APP_DEEP_LINK_SCHEME = 'aiarmakeup';
export const APP_DEEP_LINK_PREFIX = `${APP_DEEP_LINK_SCHEME}://`;
export const EXPO_DEVELOPMENT_LINKING_PREFIXES = [
  'exp://127.0.0.1:8082/--/',
  'exp://localhost:8082/--/',
] as const;

type RootStackLinkingScreens = NonNullable<
  LinkingOptions<RootStackParamList>['config']
>['screens'];

type MainTabsPathConfig = Extract<
  NonNullable<RootStackLinkingScreens['MainTabs']>,
  {screens?: unknown}
>;
type MainTabLinkingScreens = NonNullable<MainTabsPathConfig['screens']>;

type RootStackLinkingScreenConfig = NonNullable<
  RootStackLinkingScreens[RootStackRouteName]
>;
type MainTabLinkingScreenConfig = NonNullable<
  MainTabLinkingScreens[MainTabRouteName]
>;

export const mainTabLinkingScreens = {
  HomeTab: 'home',
  ConsultingTab: 'consulting-tab',
  MakeupJourneyTab: 'makeup-journey',
  ProfileTab: 'profile',
} as const satisfies Record<MainTabRouteName, MainTabLinkingScreenConfig>;

export const rootStackLinkingScreens = {
  Login: 'login',
  ProfileSetup: 'profile-setup',
  Tutorial: 'tutorial',
  MainTabs: {
    path: 'tabs',
    screens: mainTabLinkingScreens,
  },
  FaceCapture: 'face-capture',
  FaceCaptureConfirmation: 'face-capture-confirmation/:target',
  FaceAnalysisIntro: 'face-analysis-intro',
  BeardSimulation: 'beard-simulation',
  Face3DMeasurement: 'face-3d-measurement',
  FaceAnalysisLoading: 'face-analysis-loading',
  FaceAnalysisReportsList: 'face-analysis-reports',
  FaceAnalysisReportDetail: 'face-analysis-report/:reportId?',
  // __DEV__ 전용 검증 화면 — 딥링크 진입 대상이 아니지만 타입상 항목이 필요하다.
  FaceGeometryDebug: 'face-geometry-debug',
  FloatingActionSettings: 'floating-action-settings',
  AppSettings: 'app-settings',
  Faq: 'faq',
  AccountManagement: 'account-management',
  AccountDeletion: 'account-deletion',
  ProfileEdit: 'profile-edit',
  HomeFilterStore: 'filter-store',
  HairRemovalSimulation: 'hair-removal-simulation',
  HairAnalysisIntro: 'hair-analysis',
  HairAnalysisCapture: 'hair-analysis/capture',
  HairAnalysisLoading: 'hair-analysis/loading',
  HairAnalysisResult: 'hair-analysis/result/:analysisId',
  HairSimulationLoading: 'hair-analysis/simulation-loading/:analysisId/:styleId',
  HairSimulationResult: 'hair-analysis/simulation/:simulationId',
  SavedHairSimulations: 'hair-analysis/saved',
  SavedMakeupList: 'saved-makeup-list',
  ProductRecommendation: 'product-recommendation',
  ProductRecommendationShelf: 'product-recommendation/:shelf',
  ProductSearchResult: 'product-search',
  ProductDetail: 'product/:productId',
  MakeupRecommendation: 'makeup-recommendation/:reportId?',
  AuradinSearch: 'auradin-search',
  Community: 'community',
  CommunityThreadDetail: 'community/thread/:threadId',
  CommunityThreadCreate: 'community/create',
  CommunityThreadEdit: 'community/thread/:threadId/edit',
  CommunityUserProfile: 'community/user/:userId',
  Consulting: 'consulting',
  ConsultingExpertList: 'consulting-experts',
  ConsultingExpertProfile: 'consulting-expert',
  ConsultingBooking: 'consulting-booking',
  ConsultingRequestConfirm: 'consulting-request-confirm',
  ConsultingBookingComplete: 'consulting-booking-complete',
  ConsultingCall: 'consulting-call',
  ConsultingSummary: 'consulting-summary',
  ConsultingHistory: 'consulting-history',
  ConsultingMessages: 'consulting-messages',
  ConsultingNotifications: 'consulting-notifications',
  ConsultingConversation: 'consulting-conversation',
  ConsultingMembership: 'consulting-membership',
  ConsultingReview: 'consulting-review',
  MakeupLookList: 'makeup-look-list',
  LikedProductList: 'liked-product-list',
  ARFilter: 'ar-filter',
  MakeupFeedbackCapture: 'makeup-feedback-capture',
  MakeupFeedbackAlbumUpload: 'makeup-feedback-album-upload',
  MakeupFeedbackGoalInput: 'makeup-feedback-goal-input',
  MakeupFeedbackLoading: 'makeup-feedback-loading',
  MakeupFeedbackResultsList: 'makeup-feedback-results',
  MakeupFeedbackResult: 'makeup-feedback-result/:reportId?',
  MakeupJourneyDayDetail: 'makeup-journey/day/:entryDate',
  MakeupJourneyTrend: 'makeup-journey/trend/:entryDate',
  MakeupCorrectionGuide: 'makeup-correction-guide',
  MakeupCorrectionTip: 'makeup-correction-tip/:pointId',
  ReferenceMakeupExtractionUpload: 'reference-makeup-extraction-upload',
  ReferenceMakeupExtractionLoading: 'reference-makeup-extraction-loading',
  ReferenceMakeupExtractionResult: 'reference-makeup-extraction-result/:reportId?',
  ExtractedMakeupLookAdjust: 'extracted-makeup-look-adjust',
  MakeupFilterSave: 'makeup-filter-save',
  MakeupFilterSaveComplete: 'makeup-filter-save-complete',
  MakeupRecipeList: 'makeup-recipe-list',
  MakeupRecipeDetail: 'makeup-recipe-detail',
  MakeupRecipeSaveComplete: 'makeup-recipe-save-complete',
} as const satisfies Record<RootStackRouteName, RootStackLinkingScreenConfig>;

export const navigationLinking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    APP_DEEP_LINK_PREFIX,
    ...EXPO_DEVELOPMENT_LINKING_PREFIXES,
  ],
  config: {
    screens: rootStackLinkingScreens,
  },
};

export function getMissingRootStackLinkingRoutes() {
  return rootStackRoutes.filter(routeName => !(routeName in rootStackLinkingScreens));
}

export function getUnknownRootStackLinkingRoutes() {
  return Object.keys(rootStackLinkingScreens).filter(
    routeName => !rootStackRoutes.includes(routeName as keyof RootStackParamList),
  );
}

export function getMissingMainTabLinkingRoutes() {
  return mainTabRoutes.filter(routeName => !(routeName in mainTabLinkingScreens));
}

export function getUnknownMainTabLinkingRoutes() {
  return Object.keys(mainTabLinkingScreens).filter(
    routeName => !mainTabRoutes.includes(routeName as keyof MainTabParamList),
  );
}
