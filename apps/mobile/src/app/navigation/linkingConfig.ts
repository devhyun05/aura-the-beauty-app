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
  CustomTab: 'custom',
  ProfileTab: 'profile',
} as const satisfies Record<MainTabRouteName, MainTabLinkingScreenConfig>;

export const rootStackLinkingScreens = {
  Login: 'login',
  Tutorial: 'tutorial',
  MainTabs: {
    path: 'tabs',
    screens: mainTabLinkingScreens,
  },
  FaceCapture: 'face-capture',
  ImageAnalysisLoading: 'image-analysis-loading',
  ImageAnalysisReportsList: 'image-analysis-reports',
  ImageAnalysisReportDetail: 'image-analysis-report/:reportId?',
  ProfileEdit: 'profile-edit',
  MakeupLookList: 'makeup-look-list',
  LikedProductList: 'liked-product-list',
  ARFilter: 'ar-filter',
  ARFilterLocationAdjust: 'ar-filter-location-adjust',
  ARFilterStyleAdjust: 'ar-filter-style-adjust',
  FeedbackEntry: 'feedback-entry',
  FeedbackCapture: 'feedback-capture',
  FeedbackLoading: 'feedback-loading',
  FeedbackResult: 'feedback-result',
  FeedbackGuide: 'feedback-guide',
  FeedbackTip: 'feedback-tip/:pointId',
  ReferenceMakeupExtractionUpload: 'reference-makeup-extraction-upload',
  ReferenceMakeupExtractionLoading: 'reference-makeup-extraction-loading',
  ReferenceMakeupExtractionResult: 'reference-makeup-extraction-result',
  ExtractedMakeupLookAdjust: 'extracted-makeup-look-adjust',
  ExtractedMakeupLookSaveForm: 'extracted-makeup-look-save-form',
  ExtractedMakeupLookSaveComplete: 'extracted-makeup-look-save-complete',
  ExtractedMakeupLookRecipeDetail: 'extracted-makeup-look-recipe-detail',
  ExtractedMakeupLookRecipeSaveComplete: 'extracted-makeup-look-recipe-save-complete',
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
