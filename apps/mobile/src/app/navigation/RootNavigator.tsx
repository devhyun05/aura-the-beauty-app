import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {RootStackParamList} from './routeTypes';

const loadMainTabNavigator = () =>
  require('./MainTabNavigator') as typeof import('./MainTabNavigator');
const loadAuthRoutes = () =>
  require('./routes/authRoutes') as typeof import('./routes/authRoutes');
const loadHomeRoutes = () =>
  require('./routes/homeRoutes') as typeof import('./routes/homeRoutes');
const loadArRoutes = () =>
  require('./routes/arRoutes') as typeof import('./routes/arRoutes');
const loadConsultingRoutes = () =>
  require('./routes/consultingRoutes') as typeof import('./routes/consultingRoutes');
const loadFaceCaptureConfirmationRoutes = () =>
  require('./routes/faceCaptureConfirmationRoutes') as typeof import('./routes/faceCaptureConfirmationRoutes');
const loadHairAnalysisRoutes = () =>
  require('./routes/hairAnalysisRoutes') as typeof import('./routes/hairAnalysisRoutes');
const loadFaceAnalysisRoutes = () =>
  require('./routes/faceAnalysisRoutes') as typeof import('./routes/faceAnalysisRoutes');
const loadFaceAnalysisIntroRoute = () =>
  require('./routes/faceAnalysisIntroRoute') as typeof import('./routes/faceAnalysisIntroRoute');
const loadBeardSimulationRoutes = () =>
  require('./routes/beardSimulationRoutes') as typeof import('./routes/beardSimulationRoutes');
const loadMakeupFeedbackRoutes = () =>
  require('./routes/makeupFeedbackRoutes') as typeof import('./routes/makeupFeedbackRoutes');
const loadMakeupJourneyRoutes = () =>
  require('./routes/makeupJourneyRoutes') as typeof import('./routes/makeupJourneyRoutes');
const loadMakeupRecommendationRoutes = () =>
  require('./routes/makeupRecommendationRoutes') as typeof import('./routes/makeupRecommendationRoutes');
const loadRecommendationRoutes = () =>
  require('./routes/recommendationRoutes') as typeof import('./routes/recommendationRoutes');
const loadReferenceMakeupExtractionRoutes = () =>
  require('./routes/referenceMakeupExtractionRoutes') as typeof import('./routes/referenceMakeupExtractionRoutes');
const loadProfileRoutes = () =>
  require('./routes/profileRoutes') as typeof import('./routes/profileRoutes');
const loadSettingsRoutes = () =>
  require('./routes/settingsRoutes') as typeof import('./routes/settingsRoutes');

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{headerShown: false}}>
      <Stack.Screen
        name="Login"
        getComponent={() => loadAuthRoutes().LoginRouteScreen}
      />
      <Stack.Screen
        name="ProfileSetup"
        getComponent={() => loadAuthRoutes().ProfileSetupRouteScreen}
      />
      <Stack.Screen
        name="Tutorial"
        getComponent={() => loadAuthRoutes().TutorialRouteScreen}
      />
      <Stack.Screen
        name="MainTabs"
        getComponent={() => loadMainTabNavigator().MainTabNavigator}
      />
      <Stack.Screen
        name="FaceCapture"
        getComponent={() => loadFaceAnalysisRoutes().FaceCaptureRouteScreen}
      />
      <Stack.Screen
        name="FaceCaptureConfirmation"
        getComponent={() =>
          loadFaceCaptureConfirmationRoutes().FaceCaptureConfirmationRouteScreen
        }
      />
      <Stack.Screen
        name="UnityMakeupCapture"
        getComponent={() => loadArRoutes().UnityMakeupCaptureRouteScreen}
        options={{gestureEnabled: false}}
      />
      <Stack.Screen
        name="FaceAnalysisIntro"
        getComponent={() => loadFaceAnalysisIntroRoute().FaceAnalysisIntroRouteScreen}
      />
      <Stack.Screen
        name="BeardSimulation"
        getComponent={() => loadBeardSimulationRoutes().BeardSimulationRouteScreen}
      />
      <Stack.Screen
        name="Face3DMeasurement"
        getComponent={() => loadFaceAnalysisRoutes().Face3DMeasurementRouteScreen}
        options={{gestureEnabled: false}}
      />
      <Stack.Screen
        name="FaceAnalysisLoading"
        getComponent={() => loadFaceAnalysisRoutes().FaceAnalysisLoadingRouteScreen}
      />
      <Stack.Screen
        name="FaceAnalysisReportsList"
        getComponent={() => loadFaceAnalysisRoutes().FaceAnalysisReportsListRouteScreen}
      />
      <Stack.Screen
        name="FaceAnalysisReportDetail"
        getComponent={() => loadFaceAnalysisRoutes().FaceAnalysisReportPreviewRouteScreen}
      />
      <Stack.Screen
        name="FaceGeometryDebug"
        getComponent={() => loadFaceAnalysisRoutes().FaceGeometryDebugRouteScreen}
      />
      <Stack.Screen
        name="FloatingActionSettings"
        getComponent={() => loadHomeRoutes().FloatingActionSettingsRouteScreen}
      />
      <Stack.Screen
        name="AppSettings"
        getComponent={() => loadSettingsRoutes().AppSettingsRouteScreen}
      />
      <Stack.Screen
        name="Faq"
        getComponent={() => loadSettingsRoutes().FaqRouteScreen}
      />
      <Stack.Screen
        name="AccountManagement"
        getComponent={() => loadSettingsRoutes().AccountManagementRouteScreen}
      />
      <Stack.Screen
        name="AccountDeletion"
        getComponent={() => loadSettingsRoutes().AccountDeletionRouteScreen}
      />
      <Stack.Screen
        name="ProfileEdit"
        getComponent={() => loadProfileRoutes().ProfileEditRouteScreen}
      />
      <Stack.Screen
        name="HomeFilterStore"
        getComponent={() => loadHomeRoutes().HomeFilterStoreRouteScreen}
      />
      <Stack.Screen
        name="HairRemovalSimulation"
        getComponent={() => loadHomeRoutes().HairRemovalSimulationRouteScreen}
      />
      <Stack.Screen
        name="HairAnalysisIntro"
        getComponent={() => loadHairAnalysisRoutes().HairAnalysisIntroRouteScreen}
      />
      <Stack.Screen
        name="HairAnalysisCapture"
        getComponent={() => loadHairAnalysisRoutes().HairAnalysisCaptureRouteScreen}
      />
      <Stack.Screen
        name="HairAnalysisLoading"
        getComponent={() => loadHairAnalysisRoutes().HairAnalysisLoadingRouteScreen}
      />
      <Stack.Screen
        name="HairAnalysisResult"
        getComponent={() => loadHairAnalysisRoutes().HairAnalysisResultRouteScreen}
      />
      <Stack.Screen
        name="HairSimulationLoading"
        getComponent={() => loadHairAnalysisRoutes().HairSimulationLoadingRouteScreen}
      />
      <Stack.Screen
        name="HairSimulationResult"
        getComponent={() => loadHairAnalysisRoutes().HairSimulationResultRouteScreen}
      />
      <Stack.Screen
        name="SavedHairSimulations"
        getComponent={() => loadHairAnalysisRoutes().SavedHairSimulationsRouteScreen}
      />
      <Stack.Screen
        name="SavedMakeupList"
        getComponent={() => loadHomeRoutes().SavedMakeupListRouteScreen}
      />
      <Stack.Screen
        name="ProductRecommendation"
        getComponent={() => loadRecommendationRoutes().ProductRecommendationRouteScreen}
      />
      <Stack.Screen
        name="ProductRecommendationShelf"
        getComponent={() =>
          loadRecommendationRoutes().ProductRecommendationShelfRouteScreen
        }
      />
      <Stack.Screen
        name="ProductSearchResult"
        getComponent={() => loadRecommendationRoutes().ProductSearchResultRouteScreen}
      />
      <Stack.Screen
        name="ProductDetail"
        getComponent={() => loadRecommendationRoutes().ProductDetailRouteScreen}
      />
      <Stack.Screen
        name="MakeupRecommendation"
        getComponent={() =>
          loadMakeupRecommendationRoutes().MakeupRecommendationRouteScreen
        }
      />
      <Stack.Screen
        name="AuradinSearch"
        getComponent={() => loadRecommendationRoutes().AuradinSearchRouteScreen}
        options={{gestureEnabled: false}}
      />
      <Stack.Screen
        name="Community"
        getComponent={() => loadHomeRoutes().CommunityRouteScreen}
      />
      <Stack.Screen
        name="CommunityThreadDetail"
        getComponent={() => loadHomeRoutes().CommunityThreadDetailRouteScreen}
      />
      <Stack.Screen
        name="CommunityThreadCreate"
        getComponent={() => loadHomeRoutes().CommunityThreadCreateRouteScreen}
      />
      <Stack.Screen
        name="CommunityThreadEdit"
        getComponent={() => loadHomeRoutes().CommunityThreadEditRouteScreen}
      />
      <Stack.Screen
        name="CommunityUserProfile"
        getComponent={() => loadHomeRoutes().CommunityUserProfileRouteScreen}
      />
      <Stack.Screen
        name="Consulting"
        getComponent={() => loadHomeRoutes().ConsultingRouteScreen}
      />
      <Stack.Screen
        name="ConsultingExpertList"
        getComponent={() => loadConsultingRoutes().ConsultingExpertListRouteScreen}
      />
      <Stack.Screen
        name="ConsultingExpertProfile"
        getComponent={() => loadConsultingRoutes().ConsultingExpertProfileRouteScreen}
      />
      <Stack.Screen
        name="ConsultingBooking"
        getComponent={() => loadConsultingRoutes().ConsultingBookingRouteScreen}
      />
      <Stack.Screen
        name="ConsultingRequestConfirm"
        getComponent={() => loadConsultingRoutes().ConsultingRequestConfirmRouteScreen}
      />
      <Stack.Screen
        name="ConsultingBookingComplete"
        getComponent={() => loadConsultingRoutes().ConsultingBookingCompleteRouteScreen}
      />
      <Stack.Screen
        name="ConsultingCall"
        getComponent={() => loadConsultingRoutes().ConsultingCallRouteScreen}
        options={{gestureEnabled: false}}
      />
      <Stack.Screen
        name="ConsultingSummary"
        getComponent={() => loadConsultingRoutes().ConsultingSummaryRouteScreen}
      />
      <Stack.Screen
        name="ConsultingHistory"
        getComponent={() => loadConsultingRoutes().ConsultingHistoryRouteScreen}
      />
      <Stack.Screen
        name="ConsultingMessages"
        getComponent={() => loadConsultingRoutes().ConsultingMessagesRouteScreen}
      />
      <Stack.Screen
        name="ConsultingNotifications"
        getComponent={() => loadConsultingRoutes().ConsultingNotificationsRouteScreen}
      />
      <Stack.Screen
        name="ConsultingConversation"
        getComponent={() => loadConsultingRoutes().ConsultingConversationRouteScreen}
      />
      <Stack.Screen
        name="ConsultingMembership"
        getComponent={() => loadConsultingRoutes().ConsultingMembershipRouteScreen}
      />
      <Stack.Screen
        name="ConsultingReview"
        getComponent={() => loadConsultingRoutes().ConsultingReviewRouteScreen}
      />
      <Stack.Screen
        name="MakeupLookList"
        getComponent={() => loadRecommendationRoutes().MakeupLookListRouteScreen}
      />
      <Stack.Screen
        name="LikedProductList"
        getComponent={() => loadRecommendationRoutes().LikedProductListRouteScreen}
      />
      <Stack.Screen
        name="ARFilter"
        getComponent={() => loadArRoutes().ARFilterRouteScreen}
      />
      <Stack.Screen
        name="MakeupFilterEdit"
        getComponent={() => loadArRoutes().MakeupFilterEditRouteScreen}
      />
      <Stack.Screen
        name="MakeupFeedbackCapture"
        getComponent={() => loadMakeupFeedbackRoutes().MakeupFeedbackCaptureRouteScreen}
      />
      <Stack.Screen
        name="MakeupFeedbackAlbumUpload"
        getComponent={() =>
          loadMakeupFeedbackRoutes().MakeupFeedbackAlbumUploadRouteScreen
        }
      />
      <Stack.Screen
        name="MakeupFeedbackGoalInput"
        getComponent={() => loadMakeupFeedbackRoutes().MakeupFeedbackGoalInputRouteScreen}
      />
      <Stack.Screen
        name="MakeupFeedbackLoading"
        getComponent={() => loadMakeupFeedbackRoutes().MakeupFeedbackLoadingRouteScreen}
      />
      <Stack.Screen
        name="MakeupFeedbackResultsList"
        getComponent={() => loadMakeupFeedbackRoutes().MakeupFeedbackResultsListRouteScreen}
      />
      <Stack.Screen
        name="MakeupFeedbackResult"
        getComponent={() => loadMakeupFeedbackRoutes().MakeupFeedbackResultRouteScreen}
      />
      <Stack.Screen
        name="MakeupJourneyDayDetail"
        getComponent={() => loadMakeupJourneyRoutes().MakeupJourneyDayDetailRouteScreen}
        options={{gestureEnabled: false}}
      />
      <Stack.Screen
        name="MakeupJourneyTrend"
        getComponent={() => loadMakeupJourneyRoutes().MakeupJourneyTrendRouteScreen}
      />
      <Stack.Screen
        name="MakeupCorrectionGuide"
        getComponent={() => loadMakeupFeedbackRoutes().MakeupCorrectionGuideRouteScreen}
      />
      <Stack.Screen
        name="MakeupCorrectionTip"
        getComponent={() => loadMakeupFeedbackRoutes().MakeupCorrectionTipRouteScreen}
      />
      <Stack.Screen
        name="ReferenceMakeupExtractionUpload"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().ReferenceMakeupExtractionUploadRouteScreen
        }
      />
      <Stack.Screen
        name="ReferenceMakeupExtractionLoading"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().ReferenceMakeupExtractionLoadingRouteScreen
        }
      />
      <Stack.Screen
        name="ReferenceMakeupExtractionResult"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().ReferenceMakeupExtractionResultRouteScreen
        }
      />
      <Stack.Screen
        name="ExtractedMakeupLookAdjust"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().ExtractedMakeupLookAdjustRouteScreen
        }
      />
      <Stack.Screen
        name="MakeupFilterSave"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().MakeupFilterSaveRouteScreen
        }
      />
      <Stack.Screen
        name="MakeupFilterSaveComplete"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().MakeupFilterSaveCompleteRouteScreen
        }
      />
      <Stack.Screen
        name="MakeupRecipeList"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().MakeupRecipeListRouteScreen
        }
      />
      <Stack.Screen
        name="MakeupRecipeDetail"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().MakeupRecipeDetailRouteScreen
        }
      />
      <Stack.Screen
        name="MakeupRecipeSaveComplete"
        getComponent={() =>
          loadReferenceMakeupExtractionRoutes().MakeupRecipeSaveCompleteRouteScreen
        }
      />
    </Stack.Navigator>
  );
}
