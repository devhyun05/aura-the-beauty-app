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
  HairRemovalSimulationRouteScreen,
  HomeFilterStoreRouteScreen,
  SavedMakeupListRouteScreen,
} from './routes/homeRoutes';
import {
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
  ConsultingMessagesRouteScreen,
  ConsultingNotificationsRouteScreen,
  ConsultingRequestConfirmRouteScreen,
  ConsultingReviewRouteScreen,
  ConsultingSummaryRouteScreen,
} from './routes/consultingRoutes';
import {FaceCaptureConfirmationRouteScreen} from './routes/faceCaptureConfirmationRoutes';
import {
  HairAnalysisCaptureRouteScreen,
  HairAnalysisIntroRouteScreen,
  HairAnalysisLoadingRouteScreen,
  HairAnalysisResultRouteScreen,
  HairSimulationLoadingRouteScreen,
  HairSimulationResultRouteScreen,
  SavedHairSimulationsRouteScreen,
} from './routes/hairAnalysisRoutes';
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
  ProductDetailRouteScreen,
  ProductPersonalizationSettingsRouteScreen,
  ProductRecommendationRouteScreen,
  ProductRecommendationShelfRouteScreen,
  ProductSearchResultRouteScreen,
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
import {
  AccountDeletionRouteScreen,
  AccountManagementRouteScreen,
  AppSettingsRouteScreen,
  FaqRouteScreen,
} from './routes/settingsRoutes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
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
      <Stack.Screen name="Faq" component={FaqRouteScreen} />
      <Stack.Screen name="AccountManagement" component={AccountManagementRouteScreen} />
      <Stack.Screen name="AccountDeletion" component={AccountDeletionRouteScreen} />
      <Stack.Screen name="ProfileEdit" component={ProfileEditRouteScreen} />
      <Stack.Screen name="HomeFilterStore" component={HomeFilterStoreRouteScreen} />
      <Stack.Screen
        name="HairRemovalSimulation"
        component={HairRemovalSimulationRouteScreen}
      />
      <Stack.Screen name="HairAnalysisIntro" component={HairAnalysisIntroRouteScreen} />
      <Stack.Screen name="HairAnalysisCapture" component={HairAnalysisCaptureRouteScreen} />
      <Stack.Screen name="HairAnalysisLoading" component={HairAnalysisLoadingRouteScreen} />
      <Stack.Screen name="HairAnalysisResult" component={HairAnalysisResultRouteScreen} />
      <Stack.Screen name="HairSimulationLoading" component={HairSimulationLoadingRouteScreen} />
      <Stack.Screen name="HairSimulationResult" component={HairSimulationResultRouteScreen} />
      <Stack.Screen name="SavedHairSimulations" component={SavedHairSimulationsRouteScreen} />
      <Stack.Screen name="SavedMakeupList" component={SavedMakeupListRouteScreen} />
      <Stack.Screen name="ProductRecommendation" component={ProductRecommendationRouteScreen} />
      <Stack.Screen name="ProductRecommendationShelf" component={ProductRecommendationShelfRouteScreen} />
      <Stack.Screen name="ProductSearchResult" component={ProductSearchResultRouteScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailRouteScreen} />
      <Stack.Screen
        name="ProductPersonalizationSettings"
        component={ProductPersonalizationSettingsRouteScreen}
      />
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
      <Stack.Screen
        name="ConsultingRequestConfirm"
        component={ConsultingRequestConfirmRouteScreen}
      />
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
      <Stack.Screen name="ConsultingMessages" component={ConsultingMessagesRouteScreen} />
      <Stack.Screen
        name="ConsultingNotifications"
        component={ConsultingNotificationsRouteScreen}
      />
      <Stack.Screen
        name="ConsultingConversation"
        component={ConsultingConversationRouteScreen}
      />
      <Stack.Screen name="ConsultingMembership" component={ConsultingMembershipRouteScreen} />
      <Stack.Screen name="ConsultingReview" component={ConsultingReviewRouteScreen} />
      <Stack.Screen name="MakeupLookList" component={MakeupLookListRouteScreen} />
      <Stack.Screen name="LikedProductList" component={LikedProductListRouteScreen} />
      <Stack.Screen name="ARFilter" component={ARFilterRouteScreen} />
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
