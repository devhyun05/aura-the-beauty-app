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
  MakeupStyleList: undefined;
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
  ExtractedMakeupStyleAdjust: undefined;
  ExtractedMakeupStyleSaveForm: undefined;
  ExtractedMakeupStyleSaveComplete: undefined;
  ExtractedMakeupStyleRecipeDetail: undefined;
  ExtractedMakeupStyleRecipeSaveComplete: undefined;
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
  'MakeupStyleList',
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
  'ExtractedMakeupStyleAdjust',
  'ExtractedMakeupStyleSaveForm',
  'ExtractedMakeupStyleSaveComplete',
  'ExtractedMakeupStyleRecipeDetail',
  'ExtractedMakeupStyleRecipeSaveComplete',
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
