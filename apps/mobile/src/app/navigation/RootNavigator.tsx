import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {RootStackParamList} from './routeTypes';
import {MainTabNavigator} from './MainTabNavigator';
import {LoginRouteScreen, ProfileSetupRouteScreen, TutorialRouteScreen} from './routes/authRoutes';
import {
  ConsultingRouteScreen,
  CommunityRouteScreen,
  CommunityThreadCreateRouteScreen,
  CommunityThreadDetailRouteScreen,
  CommunityThreadEditRouteScreen,
  CommunityUserProfileRouteScreen,
  FloatingActionSettingsRouteScreen,
  HomeFilterStoreRouteScreen,
  SavedMakeupListRouteScreen,
} from './routes/homeRoutes';
import {
  ARFilterShapeAdjustRouteScreen,
  MakeupFilterEditRouteScreen,
  ARFilterRouteScreen,
  UnityMakeupCaptureRouteScreen,
} from './routes/arRoutes';
import {
  ConsultingBookingCompleteRouteScreen,
  ConsultingBookingRouteScreen,
  ConsultingCallRouteScreen,
  ConsultingConversationRouteScreen,
  ConsultingExpertListRouteScreen,
  ConsultingExpertProfileRouteScreen,
  ConsultingHistoryRouteScreen,
  ConsultingMembershipRouteScreen,
  ConsultingPaymentRouteScreen,
  ConsultingReviewRouteScreen,
  ConsultingSummaryRouteScreen,
} from './routes/consultingRoutes';
import {FaceCaptureConfirmationRouteScreen} from './routes/faceCaptureConfirmationRoutes';
import {
  FaceAnalysisIntroRouteScreen,
  FaceAnalysisLoadingRouteScreen,
  FaceAnalysisReportDetailRouteScreen,
  FaceAnalysisReportsListRouteScreen,
  FaceCaptureRouteScreen,
} from './routes/faceAnalysisRoutes';
import {
  MakeupFeedbackAlbumUploadRouteScreen,
  MakeupFeedbackCaptureRouteScreen,
  MakeupFeedbackGoalInputRouteScreen,
  MakeupCorrectionGuideRouteScreen,
  MakeupFeedbackLoadingRouteScreen,
  MakeupFeedbackResultRouteScreen,
  MakeupFeedbackResultsListRouteScreen,
  MakeupCorrectionTipRouteScreen,
} from './routes/makeupFeedbackRoutes';
import {
  AuradinSearchRouteScreen,
  LikedProductListRouteScreen,
  MakeupLookListRouteScreen,
  ProductRecommendationRouteScreen,
} from './routes/recommendationRoutes';
import {
  ReferenceMakeupExtractionLoadingRouteScreen,
  ReferenceMakeupExtractionResultRouteScreen,
  MakeupFilterSaveCompleteRouteScreen,
  MakeupFilterSaveRouteScreen,
  ExtractedMakeupLookAdjustRouteScreen,
  ReferenceMakeupExtractionUploadRouteScreen,
  MakeupRecipeDetailRouteScreen,
  MakeupRecipeListRouteScreen,
  MakeupRecipeSaveCompleteRouteScreen,
} from './routes/referenceMakeupExtractionRoutes';
import {ProfileEditRouteScreen} from './routes/profileRoutes';
import {AppSettingsRouteScreen} from './routes/settingsRoutes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      // QA·데모 전용: AURADIN 드라이브 플래그가 있으면 검색 화면에서 시작 (기본은 Login).
      // __DEV__ 가드 — 릴리즈/실기기 테스트 빌드에는 절대 반영되지 않는다.
      initialRouteName={
        __DEV__ && process.env.EXPO_PUBLIC_AURADIN_DEMO_DRIVE ? 'AuradinSearch' : 'Login'
      }
      screenOptions={{headerShown: false}}>
      <Stack.Screen name="Login" component={LoginRouteScreen} />
      <Stack.Screen name="ProfileSetup" component={ProfileSetupRouteScreen} />
      <Stack.Screen name="Tutorial" component={TutorialRouteScreen} />
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen name="FaceCapture" component={FaceCaptureRouteScreen} />
      <Stack.Screen
        name="FaceCaptureConfirmation"
        component={FaceCaptureConfirmationRouteScreen}
      />
      <Stack.Screen
        name="UnityMakeupCapture"
        component={UnityMakeupCaptureRouteScreen}
        options={{gestureEnabled: false}}
      />
      <Stack.Screen name="FaceAnalysisIntro" component={FaceAnalysisIntroRouteScreen} />
      <Stack.Screen name="FaceAnalysisLoading" component={FaceAnalysisLoadingRouteScreen} />
      <Stack.Screen
        name="FaceAnalysisReportsList"
        component={FaceAnalysisReportsListRouteScreen}
      />
      <Stack.Screen
        name="FaceAnalysisReportDetail"
        component={FaceAnalysisReportDetailRouteScreen}
      />
      <Stack.Screen
        name="FloatingActionSettings"
        component={FloatingActionSettingsRouteScreen}
      />
      <Stack.Screen name="AppSettings" component={AppSettingsRouteScreen} />
      <Stack.Screen name="ProfileEdit" component={ProfileEditRouteScreen} />
      <Stack.Screen name="HomeFilterStore" component={HomeFilterStoreRouteScreen} />
      <Stack.Screen name="SavedMakeupList" component={SavedMakeupListRouteScreen} />
      <Stack.Screen name="ProductRecommendation" component={ProductRecommendationRouteScreen} />
      <Stack.Screen name="AuradinSearch" component={AuradinSearchRouteScreen} />
      <Stack.Screen name="Community" component={CommunityRouteScreen} />
      <Stack.Screen name="CommunityThreadDetail" component={CommunityThreadDetailRouteScreen} />
      <Stack.Screen name="CommunityThreadCreate" component={CommunityThreadCreateRouteScreen} />
      <Stack.Screen name="CommunityThreadEdit" component={CommunityThreadEditRouteScreen} />
      <Stack.Screen name="CommunityUserProfile" component={CommunityUserProfileRouteScreen} />
      <Stack.Screen name="Consulting" component={ConsultingRouteScreen} />
      <Stack.Screen
        name="ConsultingExpertList"
        component={ConsultingExpertListRouteScreen}
      />
      <Stack.Screen
        name="ConsultingExpertProfile"
        component={ConsultingExpertProfileRouteScreen}
      />
      <Stack.Screen name="ConsultingBooking" component={ConsultingBookingRouteScreen} />
      <Stack.Screen name="ConsultingPayment" component={ConsultingPaymentRouteScreen} />
      <Stack.Screen
        name="ConsultingBookingComplete"
        component={ConsultingBookingCompleteRouteScreen}
      />
      <Stack.Screen
        name="ConsultingCall"
        component={ConsultingCallRouteScreen}
        options={{gestureEnabled: false}}
      />
      <Stack.Screen name="ConsultingSummary" component={ConsultingSummaryRouteScreen} />
      <Stack.Screen name="ConsultingHistory" component={ConsultingHistoryRouteScreen} />
      <Stack.Screen
        name="ConsultingConversation"
        component={ConsultingConversationRouteScreen}
      />
      <Stack.Screen name="ConsultingMembership" component={ConsultingMembershipRouteScreen} />
      <Stack.Screen name="ConsultingReview" component={ConsultingReviewRouteScreen} />
      <Stack.Screen name="MakeupLookList" component={MakeupLookListRouteScreen} />
      <Stack.Screen name="LikedProductList" component={LikedProductListRouteScreen} />
      <Stack.Screen name="ARFilter" component={ARFilterRouteScreen} />
      <Stack.Screen name="ARFilterShapeAdjust" component={ARFilterShapeAdjustRouteScreen} />
      <Stack.Screen name="MakeupFilterEdit" component={MakeupFilterEditRouteScreen} />
      <Stack.Screen name="MakeupFeedbackCapture" component={MakeupFeedbackCaptureRouteScreen} />
      <Stack.Screen name="MakeupFeedbackAlbumUpload" component={MakeupFeedbackAlbumUploadRouteScreen} />
      <Stack.Screen name="MakeupFeedbackGoalInput" component={MakeupFeedbackGoalInputRouteScreen} />
      <Stack.Screen name="MakeupFeedbackLoading" component={MakeupFeedbackLoadingRouteScreen} />
      <Stack.Screen name="MakeupFeedbackResultsList" component={MakeupFeedbackResultsListRouteScreen} />
      <Stack.Screen name="MakeupFeedbackResult" component={MakeupFeedbackResultRouteScreen} />
      <Stack.Screen name="MakeupCorrectionGuide" component={MakeupCorrectionGuideRouteScreen} />
      <Stack.Screen name="MakeupCorrectionTip" component={MakeupCorrectionTipRouteScreen} />
      <Stack.Screen name="ReferenceMakeupExtractionUpload" component={ReferenceMakeupExtractionUploadRouteScreen} />
      <Stack.Screen name="ReferenceMakeupExtractionLoading" component={ReferenceMakeupExtractionLoadingRouteScreen} />
      <Stack.Screen name="ReferenceMakeupExtractionResult" component={ReferenceMakeupExtractionResultRouteScreen} />
      <Stack.Screen name="ExtractedMakeupLookAdjust" component={ExtractedMakeupLookAdjustRouteScreen} />
      <Stack.Screen name="MakeupFilterSave" component={MakeupFilterSaveRouteScreen} />
      <Stack.Screen name="MakeupFilterSaveComplete" component={MakeupFilterSaveCompleteRouteScreen} />
      <Stack.Screen name="MakeupRecipeList" component={MakeupRecipeListRouteScreen} />
      <Stack.Screen name="MakeupRecipeDetail" component={MakeupRecipeDetailRouteScreen} />
      <Stack.Screen name="MakeupRecipeSaveComplete" component={MakeupRecipeSaveCompleteRouteScreen} />
    </Stack.Navigator>
  );
}
