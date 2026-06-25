import type {NavigatorScreenParams} from '@react-navigation/native';

export type ARFilterBackRouteName = 'ARFilter' | 'ImageAnalysisReportDetail';

export type RootStackParamList = {
  Login: undefined;
  Tutorial: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  FaceCapture: undefined;
  ImageAnalysisLoading: undefined;
  ImageAnalysisReportsList: undefined;
  ImageAnalysisReportDetail: {reportId?: string} | undefined;
  ProfileEdit: undefined;
  MakeupLookList: undefined;
  LikedProductList: undefined;
  ARFilter: undefined;
  ARFilterLocationAdjust: {backRoute?: ARFilterBackRouteName} | undefined;
  ARFilterStyleAdjust: {backRoute?: ARFilterBackRouteName} | undefined;
  MakeupFeedbackEntry: undefined;
  MakeupFeedbackCapture: undefined;
  MakeupFeedbackLoading: undefined;
  MakeupFeedbackResult: undefined;
  MakeupCorrectionGuide: undefined;
  MakeupCorrectionTip: {pointId: string};
  ReferenceMakeupExtractionUpload: undefined;
  ReferenceMakeupExtractionLoading: undefined;
  ReferenceMakeupExtractionResult: undefined;
  ExtractedMakeupLookAdjust: undefined;
  ExtractedMakeupLookSaveForm: undefined;
  ExtractedMakeupLookSaveComplete: undefined;
  ExtractedMakeupLookRecipeDetail: undefined;
  ExtractedMakeupLookRecipeSaveComplete: undefined;
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
  'Tutorial',
  'MainTabs',
  'FaceCapture',
  'ImageAnalysisLoading',
  'ImageAnalysisReportsList',
  'ImageAnalysisReportDetail',
  'ProfileEdit',
  'MakeupLookList',
  'LikedProductList',
  'ARFilter',
  'ARFilterLocationAdjust',
  'ARFilterStyleAdjust',
  'MakeupFeedbackEntry',
  'MakeupFeedbackCapture',
  'MakeupFeedbackLoading',
  'MakeupFeedbackResult',
  'MakeupCorrectionGuide',
  'MakeupCorrectionTip',
  'ReferenceMakeupExtractionUpload',
  'ReferenceMakeupExtractionLoading',
  'ReferenceMakeupExtractionResult',
  'ExtractedMakeupLookAdjust',
  'ExtractedMakeupLookSaveForm',
  'ExtractedMakeupLookSaveComplete',
  'ExtractedMakeupLookRecipeDetail',
  'ExtractedMakeupLookRecipeSaveComplete',
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
