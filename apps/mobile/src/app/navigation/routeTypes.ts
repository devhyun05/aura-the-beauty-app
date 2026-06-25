import type {NavigatorScreenParams} from '@react-navigation/native';

export type ARFilterBackRouteName = 'ARMakeupFilter' | 'ImageAnalysisReportDetail';

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
  ARMakeupFilter: undefined;
  ARFilterLocation: {backRoute?: ARFilterBackRouteName} | undefined;
  ARFilterStyle: {backRoute?: ARFilterBackRouteName} | undefined;
  FeedbackEntry: undefined;
  FeedbackCapture: undefined;
  FeedbackLoading: undefined;
  FeedbackResult: undefined;
  FeedbackGuide: undefined;
  FeedbackTip: {pointId: string};
  FilterUpload: undefined;
  FilterLoading: undefined;
  FilterResult: undefined;
  FilterTryOn: undefined;
  FilterSave: undefined;
  FilterSaved: undefined;
  FilterRecipeDetail: undefined;
  RecipeSaved: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  CustomTab: undefined;
  MyPageTab: undefined;
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
  'ARMakeupFilter',
  'ARFilterLocation',
  'ARFilterStyle',
  'FeedbackEntry',
  'FeedbackCapture',
  'FeedbackLoading',
  'FeedbackResult',
  'FeedbackGuide',
  'FeedbackTip',
  'FilterUpload',
  'FilterLoading',
  'FilterResult',
  'FilterTryOn',
  'FilterSave',
  'FilterSaved',
  'FilterRecipeDetail',
  'RecipeSaved',
] as const satisfies readonly RootStackRouteName[];

export const mainTabRoutes = [
  'HomeTab',
  'CustomTab',
  'MyPageTab',
] as const satisfies readonly MainTabRouteName[];

export const routes = [
  ...rootStackRoutes,
  ...mainTabRoutes,
] as const satisfies readonly RouteName[];
