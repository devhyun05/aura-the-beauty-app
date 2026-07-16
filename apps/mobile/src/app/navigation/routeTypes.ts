import type {NavigatorScreenParams} from '@react-navigation/native';
import type {
  ConsultingBookingDraft,
  ConsultingCategoryId,
  ConsultingRecord,
  ConsultingSessionMode,
} from '../../features/consulting/types';
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
  | 'hairAnalysis'
  | 'makeupFeedback'
  | 'referenceMakeupExtraction';
export type MakeupFilterEditMode = 'preset' | 'fullFace';
export type MakeupFilterEditTabMode = 'product' | 'fit';

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
  // 사진 확인 뒤 ARKit 3D 자동 측정(셔터 없음) — 완료/실패/skip 시 로딩으로 이어진다.
  Face3DMeasurement: {afterAnalysisRoute?: FaceAnalysisCompletionRouteName} | undefined;
  FaceAnalysisLoading: {afterAnalysisRoute?: FaceAnalysisCompletionRouteName} | undefined;
  FaceAnalysisReportsList: undefined;
  FaceAnalysisReportDetail: {reportId?: string} | undefined;
  FloatingActionSettings: undefined;
  AppSettings: undefined;
  Faq: undefined;
  AccountManagement: undefined;
  AccountDeletion: undefined;
  ProfileEdit: undefined;
  HomeFilterStore: {initialMakeupFilterId?: string} | undefined;
  HairRemovalSimulation: undefined;
  HairAnalysisIntro: undefined;
  HairAnalysisCapture: undefined;
  HairAnalysisLoading: undefined;
  HairAnalysisResult: {analysisId: string; sourceImageUri?: string};
  HairSimulationLoading: {analysisId: string; sourceImageUri?: string; styleId: string};
  HairSimulationResult: {simulationId: string; sourceImageUri?: string};
  SavedHairSimulations: undefined;
  SavedMakeupList: undefined;
  ProductRecommendation: {
    reportId?: string;
    arStyleId?: string;
    initialSection?: 'ar' | 'seasonal' | 'personalized' | 'cohort';
  } | undefined;
  ProductRecommendationShelf: {
    shelf: 'ar' | 'seasonal' | 'personalized' | 'cohort';
    title?: string;
    arStyleId?: string;
  };
  ProductSearchResult: {query: string};
  ProductDetail: {
    productId: string;
    shadeId?: string;
    disclosureLabel?: string;
    reasonLabels?: string[];
    sponsored?: boolean;
    sponsorshipType?: 'organic' | 'affiliate' | 'sponsored' | string;
  };
  MakeupRecommendation: undefined;
  // prompt: 딥링크 검색 자동 시작. reportId/personalColor: 리포트 첨부. open/dial: QA·데모 드라이브 훅.
  AuradinSearch:
    | {prompt?: string; reportId?: string; personalColor?: string; open?: string; dial?: string; ts?: string}
    | undefined;
  Community: undefined;
  CommunityThreadDetail: {threadId: string};
  CommunityThreadCreate: undefined;
  CommunityThreadEdit: {threadId: string};
  CommunityUserProfile: {avatarUrl?: string | null; nickname: string; userId: string};
  Consulting: undefined;
  ConsultingExpertList: {categoryId?: ConsultingCategoryId} | undefined;
  ConsultingExpertProfile: {expertId: string};
  ConsultingBooking: {
    expertId: string;
    durationId: string;
    bookingId?: string;
    sessionMode?: ConsultingSessionMode;
  };
  ConsultingRequestConfirm: {draft: ConsultingBookingDraft};
  ConsultingBookingComplete: {
    bookingId: string;
    draft: ConsultingBookingDraft;
    record?: ConsultingRecord;
  };
  ConsultingCall: {bookingId?: string; expertId: string; durationId: string};
  ConsultingSummary: {expertId: string; recordId?: string};
  ConsultingHistory: undefined;
  ConsultingMessages: undefined;
  ConsultingNotifications: undefined;
  ConsultingConversation: {
    recordId: string;
    expertId: string;
    record?: ConsultingRecord;
  };
  ConsultingMembership: undefined;
  ConsultingReview: {expertId: string; recordId: string};
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
  MakeupFilterEdit: {
    backRoute?: ARFilterBackRouteName;
    initialEditMode?: MakeupFilterEditTabMode;
    editSourceImageUri?: string;
    initialGuideMode?: GuideMode;
    initialMakeupFilterId?: string;
    mode?: MakeupFilterEditMode;
    source?: ARFilterLaunchSource;
    sourceFrameMetadata?: FullFaceMakeupSourceInput;
  } | undefined;
  MakeupFeedbackCapture: undefined;
  MakeupFeedbackAlbumUpload: undefined;
  MakeupFeedbackGoalInput: undefined;
  MakeupFeedbackLoading: undefined;
  MakeupFeedbackResultsList: undefined;
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
  MakeupFilterSaveComplete: {arStyleId?: string; saveError?: string} | undefined;
  MakeupRecipeList: undefined;
  MakeupRecipeDetail: undefined;
  MakeupRecipeSaveComplete: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  ProfileTab: undefined;
  ConsultingTab: undefined;
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
  'Face3DMeasurement',
  'FaceAnalysisLoading',
  'FaceAnalysisReportsList',
  'FaceAnalysisReportDetail',
  'FloatingActionSettings',
  'AppSettings',
  'Faq',
  'AccountManagement',
  'AccountDeletion',
  'ProfileEdit',
  'HomeFilterStore',
  'HairRemovalSimulation',
  'HairAnalysisIntro',
  'HairAnalysisCapture',
  'HairAnalysisLoading',
  'HairAnalysisResult',
  'HairSimulationLoading',
  'HairSimulationResult',
  'SavedHairSimulations',
  'SavedMakeupList',
  'ProductRecommendation',
  'ProductRecommendationShelf',
  'ProductSearchResult',
  'ProductDetail',
  'MakeupRecommendation',
  'AuradinSearch',
  'Community',
  'CommunityThreadDetail',
  'CommunityThreadCreate',
  'CommunityThreadEdit',
  'CommunityUserProfile',
  'Consulting',
  'ConsultingExpertList',
  'ConsultingExpertProfile',
  'ConsultingBooking',
  'ConsultingRequestConfirm',
  'ConsultingBookingComplete',
  'ConsultingCall',
  'ConsultingSummary',
  'ConsultingHistory',
  'ConsultingMessages',
  'ConsultingNotifications',
  'ConsultingConversation',
  'ConsultingMembership',
  'ConsultingReview',
  'MakeupLookList',
  'LikedProductList',
  'ARFilter',
  'MakeupFilterEdit',
  'MakeupFeedbackCapture',
  'MakeupFeedbackAlbumUpload',
  'MakeupFeedbackGoalInput',
  'MakeupFeedbackLoading',
  'MakeupFeedbackResultsList',
  'MakeupFeedbackResult',
  'MakeupCorrectionGuide',
  'MakeupCorrectionTip',
  'ReferenceMakeupExtractionUpload',
  'ReferenceMakeupExtractionLoading',
  'ReferenceMakeupExtractionResult',
  'ExtractedMakeupLookAdjust',
  'MakeupFilterSave',
  'MakeupFilterSaveComplete',
  'MakeupRecipeList',
  'MakeupRecipeDetail',
  'MakeupRecipeSaveComplete',
] as const satisfies readonly RootStackRouteName[];

export const mainTabRoutes = [
  'HomeTab',
  'ProfileTab',
  'ConsultingTab',
] as const satisfies readonly MainTabRouteName[];

export const routes = [
  ...rootStackRoutes,
  ...mainTabRoutes,
] as const satisfies readonly RouteName[];
