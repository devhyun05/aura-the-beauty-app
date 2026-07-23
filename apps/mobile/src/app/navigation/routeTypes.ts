import type {NavigatorScreenParams} from '@react-navigation/native';
import type {ProductRecommendationCategory} from '../../features/recommendation/types';
import type {UnifiedFaceCaptureCompletedEvent} from '../../features/face-capture/services/unifiedFaceCaptureContract';
import type {MinimumFaceReportPreview} from '../../features/face-report/services/minimumFaceReport';
import type {
  ConsultingBookingDraft,
  ConsultingCategoryId,
  ConsultingRecord,
  ConsultingSessionMode,
} from '../../features/consulting/types';
import type {StencilInitialLook} from '../../features/ar/stencil/stencilInitialLook';
import type {ARFilterLaunchSource} from '../../shared/types/makeupGuide';

export type FaceAnalysisCompletionRouteName = 'ProductRecommendation';
export type FaceCaptureConfirmationTarget =
  | 'faceAnalysis'
  | 'hairAnalysis'
  | 'makeupFeedback'
  | 'referenceMakeupExtraction';

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
  FaceAnalysisIntro: undefined;
  BeardSimulation: undefined;
  // 사진 확인 뒤 ARKit 3D 자동 측정(셔터 없음) — 완료/실패/skip 시 로딩으로 이어진다.
  Face3DMeasurement: {afterAnalysisRoute?: FaceAnalysisCompletionRouteName} | undefined;
  FaceAnalysisLoading:
    | {
        afterAnalysisRoute?: FaceAnalysisCompletionRouteName;
        loadingStartedAtMs?: number;
        pendingUnifiedCapture?: UnifiedFaceCaptureCompletedEvent;
      }
    | undefined;
  FaceAnalysisReportsList: undefined;
  FaceAnalysisReportDetail:
    | {
        afterAnalysisRoute?: FaceAnalysisCompletionRouteName;
        initialPageId?: string;
        minimumPreview?: MinimumFaceReportPreview;
        reportId?: string;
        returnTo?: 'profile';
      }
    | undefined;
  // __DEV__ 전용 검증 화면: Face 2D 지오메트리(눈꼬리·눈썹선·roll) 오버레이 확인.
  FaceGeometryDebug: undefined;
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
    makeupRecommendationReportId?: string;
    arStyleId?: string;
    initialSection?: 'ar' | 'seasonal' | 'personalized' | 'cohort';
  } | undefined;
  ProductRecommendationShelf:
    | {
        shelf: 'ar' | 'seasonal' | 'personalized' | 'cohort';
        title?: string;
        arStyleId?: string;
      }
    | {
        shelf: 'makeupReport';
        title: string;
        makeupReportId: string;
        makeupLookId: string;
        initialCategory?: ProductRecommendationCategory;
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
  MakeupRecommendation:
    | {analysisReportId?: string; reportId?: string; view?: 'history'}
    | undefined;
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
  ConsultingHistory: {returnTo?: 'profile'} | undefined;
  ConsultingMessages: undefined;
  ConsultingNotifications: undefined;
  ConsultingConversation: {
    recordId: string;
    expertId: string;
    record?: ConsultingRecord;
  };
  ConsultingMembership: undefined;
  ConsultingReview: {expertId: string; recordId: string};
  MakeupLookList: {kind?: 'created' | 'liked'} | undefined;
  LikedProductList: undefined;
  // AR 필터 = 스텐실 경험 단일 화면. recommendedLook이 있으면 그 룩(추천·프리셋)을
  // 시작 상태로 주입하고, 없으면 맨얼굴 라이브로 연다.
  ARFilter:
    | {
        recommendedLook?: StencilInitialLook;
        source?: ARFilterLaunchSource;
      }
    | undefined;
  MakeupFeedbackCapture: undefined;
  MakeupFeedbackAlbumUpload: undefined;
  MakeupFeedbackGoalInput: undefined;
  MakeupFeedbackLoading: undefined;
  MakeupFeedbackResultsList: undefined;
  MakeupFeedbackResult:
    | {
        entryDate?: string;
        reportId?: string;
        returnTo?: 'profile' | 'makeupJourney';
      }
    | undefined;
  MakeupJourneyDayDetail: {
    entryDate: string;
    initialReportId?: string;
  };
  MakeupJourneyTrend: {
    entryDate: string;
    range?: '7d' | '30d' | '90d';
  };
  MakeupCorrectionGuide: undefined;
  MakeupCorrectionTip: {pointId: string};
  ReferenceMakeupExtractionUpload: {
    initialSource?: 'camera' | 'gallery';
  } | undefined;
  ReferenceMakeupExtractionLoading: undefined;
  ReferenceMakeupExtractionResult:
    | {reportId?: string; returnTo?: 'profile'}
    | undefined;
  ExtractedMakeupLookAdjust: undefined;
  MakeupFilterSave: undefined;
  MakeupFilterSaveComplete: {arStyleId?: string; saveError?: string} | undefined;
  MakeupRecipeList: undefined;
  MakeupRecipeDetail: undefined;
  MakeupRecipeSaveComplete: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  ConsultingTab: undefined;
  MakeupJourneyTab: {month?: string} | undefined;
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
  'FaceAnalysisIntro',
  'BeardSimulation',
  'Face3DMeasurement',
  'FaceAnalysisLoading',
  'FaceAnalysisReportsList',
  'FaceAnalysisReportDetail',
  'FaceGeometryDebug',
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
  'MakeupFeedbackCapture',
  'MakeupFeedbackAlbumUpload',
  'MakeupFeedbackGoalInput',
  'MakeupFeedbackLoading',
  'MakeupFeedbackResultsList',
  'MakeupFeedbackResult',
  'MakeupJourneyDayDetail',
  'MakeupJourneyTrend',
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
  'ConsultingTab',
  'MakeupJourneyTab',
  'ProfileTab',
] as const satisfies readonly MainTabRouteName[];

export const routes = [
  ...rootStackRoutes,
  ...mainTabRoutes,
] as const satisfies readonly RouteName[];
