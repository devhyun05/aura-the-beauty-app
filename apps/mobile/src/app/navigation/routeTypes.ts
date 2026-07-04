import type {NavigatorScreenParams} from '@react-navigation/native';
import type {FullFaceMakeupEditState} from '../../features/ar/services/fullFaceMakeupEditService';
import type {FullFaceMakeupSourceInput} from '../../shared/contracts/fullFaceMakeupRecipe';
import type {
  ARFilterLaunchSource,
  GuideMode,
} from '../../shared/types/makeupGuide';

export type ARFilterBackRouteName = 'ARFilter' | 'FaceAnalysisReportDetail';
export type FaceAnalysisCompletionRouteName = 'ProductRecommendation';
export type FaceCaptureConfirmationTarget =
  | 'faceAnalysis'
  | 'makeupFeedback'
  | 'referenceMakeupExtraction';
export type MakeupFilterEditMode = 'preset' | 'fullFace';

export type RootStackParamList = {
  Login: undefined;
  ProfileSetup: undefined;
  Tutorial: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  FaceCapture: {
    afterAnalysisRoute?: FaceAnalysisCompletionRouteName;
    initialSource?: 'gallery';
  } | undefined;
  FaceCaptureConfirmation: {
    afterAnalysisRoute?: FaceAnalysisCompletionRouteName;
    target: FaceCaptureConfirmationTarget;
  };
  UnityMakeupCapture: undefined;
  FaceAnalysisIntro: undefined;
  FaceAnalysisLoading: {afterAnalysisRoute?: FaceAnalysisCompletionRouteName} | undefined;
  FaceAnalysisReportsList: undefined;
  FaceAnalysisReportDetail: {reportId?: string} | undefined;
  ProfileEdit: undefined;
  HomeFilterStore: {initialMakeupFilterId?: string} | undefined;
  SavedMakeupList: undefined;
  ProductRecommendation: {reportId?: string} | undefined;
  Community: undefined;
  Consulting: undefined;
  MakeupLookList: undefined;
  LikedProductList: undefined;
  ARFilter:
    | {
        fullFaceEditState?: FullFaceMakeupEditState;
        initialGuideMode?: GuideMode;
        initialMakeupFilterId?: string;
        source?: ARFilterLaunchSource;
      }
    | undefined;
  ARFilterShapeAdjust: {backRoute?: ARFilterBackRouteName} | undefined;
  MakeupFilterEdit: {
    backRoute?: ARFilterBackRouteName;
    mode?: MakeupFilterEditMode;
    sourceFrameMetadata?: FullFaceMakeupSourceInput;
  } | undefined;
  MakeupFeedbackEntry: undefined;
  MakeupFeedbackCapture: undefined;
  MakeupFeedbackAlbumUpload: undefined;
  MakeupFeedbackGoalInput: undefined;
  MakeupFeedbackLoading: undefined;
  MakeupFeedbackResult: undefined;
  MakeupCorrectionGuide: undefined;
  MakeupCorrectionTip: {pointId: string};
  ReferenceMakeupExtractionUpload: {
    initialSource?: 'camera' | 'gallery';
  } | undefined;
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
  'FaceCaptureConfirmation',
  'UnityMakeupCapture',
  'FaceAnalysisIntro',
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
  'MakeupFeedbackGoalInput',
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
