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
  FeedbackEntry: undefined;
  FeedbackCapture: undefined;
  FeedbackLoading: undefined;
  FeedbackResult: undefined;
  FeedbackGuide: undefined;
  FeedbackTip: {pointId: string};
  FilterExtractionUpload: undefined;
  FilterExtractionLoading: undefined;
  FilterExtractionResult: undefined;
  FilterTryOnAdjust: undefined;
  FilterSaveForm: undefined;
  FilterSaveComplete: undefined;
  FilterRecipeDetail: undefined;
  FilterRecipeSaveComplete: undefined;
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
  'FeedbackEntry',
  'FeedbackCapture',
  'FeedbackLoading',
  'FeedbackResult',
  'FeedbackGuide',
  'FeedbackTip',
  'FilterExtractionUpload',
  'FilterExtractionLoading',
  'FilterExtractionResult',
  'FilterTryOnAdjust',
  'FilterSaveForm',
  'FilterSaveComplete',
  'FilterRecipeDetail',
  'FilterRecipeSaveComplete',
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
