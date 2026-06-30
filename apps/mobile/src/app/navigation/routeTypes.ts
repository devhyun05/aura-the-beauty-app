import type {NavigatorScreenParams} from '@react-navigation/native';
import type {
  ARFilterLaunchSource,
  GuideMode,
} from '../../shared/types/makeupGuide';

export type ARFilterBackRouteName = 'ARFilter' | 'FaceAnalysisReportDetail';
export type FaceAnalysisCompletionRouteName = 'ProductRecommendation';

export type RootStackParamList = {
  Login: undefined;
  ProfileSetup: undefined;
  Tutorial: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  FaceCapture: {
    afterAnalysisRoute?: FaceAnalysisCompletionRouteName;
    initialSource?: 'gallery';
  } | undefined;
  UnityMakeupCapture: undefined;
  FaceAnalysisLoading: {afterAnalysisRoute?: FaceAnalysisCompletionRouteName} | undefined;
  FaceAnalysisReportsList: undefined;
  FaceAnalysisReportDetail: {reportId?: string} | undefined;
  ProfileEdit: undefined;
  HomeFilterStore: {initialMakeupFilterId?: string} | undefined;
  SavedMakeupList: undefined;
  ProductRecommendation: undefined;
  Community: undefined;
  Consulting: undefined;
  MakeupLookList: undefined;
  LikedProductList: undefined;
  ARFilter:
    | {
        initialGuideMode?: GuideMode;
        initialMakeupFilterId?: string;
        source?: ARFilterLaunchSource;
      }
    | undefined;
  ARFilterShapeAdjust: {backRoute?: ARFilterBackRouteName} | undefined;
  MakeupFilterEdit: {backRoute?: ARFilterBackRouteName} | undefined;
  MakeupFeedbackEntry: undefined;
  MakeupFeedbackCapture: undefined;
  MakeupFeedbackAlbumUpload: undefined;
  MakeupFeedbackLoading: undefined;
  MakeupFeedbackResult: undefined;
  MakeupCorrectionGuide: undefined;
  MakeupCorrectionTip: {pointId: string};
  ReferenceMakeupExtractionUpload: undefined;
  ReferenceMakeupExtractionLoading: undefined;
  ReferenceMakeupExtractionResult: undefined;
  ExtractedMakeupLookAdjust: undefined;
  MakeupFilterSave: undefined;
  MakeupFilterSaveComplete: undefined;
  MakeupRecipeDetail: undefined;
  MakeupRecipeSaveComplete: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  CustomTab: undefined;
  ProfileTab: undefined;
};

export type RootStackRouteName = keyof RootStackParamList;
export type MainTabRouteName = keyof MainTabParamList;
export type RouteName = RootStackRouteName | MainTabRouteName;

export const rootStackRoutes = [
  'Login',
  'ProfileSetup',
  'Tutorial',
  'MainTabs',
  'FaceCapture',
  'UnityMakeupCapture',
  'FaceAnalysisLoading',
  'FaceAnalysisReportsList',
  'FaceAnalysisReportDetail',
  'ProfileEdit',
  'HomeFilterStore',
  'SavedMakeupList',
  'ProductRecommendation',
  'Community',
  'Consulting',
  'MakeupLookList',
  'LikedProductList',
  'ARFilter',
  'ARFilterShapeAdjust',
  'MakeupFilterEdit',
  'MakeupFeedbackEntry',
  'MakeupFeedbackCapture',
  'MakeupFeedbackAlbumUpload',
  'MakeupFeedbackLoading',
  'MakeupFeedbackResult',
  'MakeupCorrectionGuide',
  'MakeupCorrectionTip',
  'ReferenceMakeupExtractionUpload',
  'ReferenceMakeupExtractionLoading',
  'ReferenceMakeupExtractionResult',
  'ExtractedMakeupLookAdjust',
  'MakeupFilterSave',
  'MakeupFilterSaveComplete',
  'MakeupRecipeDetail',
  'MakeupRecipeSaveComplete',
] as const satisfies readonly RootStackRouteName[];

export const mainTabRoutes = [
  'HomeTab',
  'CustomTab',
  'ProfileTab',
] as const satisfies readonly MainTabRouteName[];

export const routes = [
  ...rootStackRoutes,
  ...mainTabRoutes,
] as const satisfies readonly RouteName[];
