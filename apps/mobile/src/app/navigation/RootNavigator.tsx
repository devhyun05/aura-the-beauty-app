import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {RootStackParamList} from './routeTypes';
import {MainTabNavigator} from './MainTabNavigator';
import {
  ARFilterShapeAdjustRouteScreen,
  MakeupFilterEditRouteScreen,
  ARFilterRouteScreen,
  FaceCaptureRouteScreen,
  MakeupFeedbackCaptureRouteScreen,
  MakeupFeedbackEntryRouteScreen,
  MakeupCorrectionGuideRouteScreen,
  MakeupFeedbackLoadingRouteScreen,
  MakeupFeedbackResultRouteScreen,
  MakeupCorrectionTipRouteScreen,
  ReferenceMakeupExtractionLoadingRouteScreen,
  ExtractedMakeupLookRecipeDetailRouteScreen,
  ReferenceMakeupExtractionResultRouteScreen,
  MakeupFilterSaveCompleteRouteScreen,
  MakeupFilterSaveFormRouteScreen,
  ExtractedMakeupLookAdjustRouteScreen,
  ReferenceMakeupExtractionUploadRouteScreen,
  FaceAnalysisLoadingRouteScreen,
  FaceAnalysisReportDetailRouteScreen,
  FaceAnalysisReportsListRouteScreen,
  LikedProductListRouteScreen,
  LoginRouteScreen,
  MakeupLookListRouteScreen,
  ProfileEditRouteScreen,
  ExtractedMakeupLookRecipeSaveCompleteRouteScreen,
  TutorialRouteScreen,
} from './navigationAdapters';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{headerShown: false}}>
      <Stack.Screen name="Login" component={LoginRouteScreen} />
      <Stack.Screen name="Tutorial" component={TutorialRouteScreen} />
      <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      <Stack.Screen name="FaceCapture" component={FaceCaptureRouteScreen} />
      <Stack.Screen name="FaceAnalysisLoading" component={FaceAnalysisLoadingRouteScreen} />
      <Stack.Screen
        name="FaceAnalysisReportsList"
        component={FaceAnalysisReportsListRouteScreen}
      />
      <Stack.Screen
        name="FaceAnalysisReportDetail"
        component={FaceAnalysisReportDetailRouteScreen}
      />
      <Stack.Screen name="ProfileEdit" component={ProfileEditRouteScreen} />
      <Stack.Screen name="MakeupLookList" component={MakeupLookListRouteScreen} />
      <Stack.Screen name="LikedProductList" component={LikedProductListRouteScreen} />
      <Stack.Screen name="ARFilter" component={ARFilterRouteScreen} />
      <Stack.Screen name="ARFilterShapeAdjust" component={ARFilterShapeAdjustRouteScreen} />
      <Stack.Screen name="MakeupFilterEdit" component={MakeupFilterEditRouteScreen} />
      <Stack.Screen name="MakeupFeedbackEntry" component={MakeupFeedbackEntryRouteScreen} />
      <Stack.Screen name="MakeupFeedbackCapture" component={MakeupFeedbackCaptureRouteScreen} />
      <Stack.Screen name="MakeupFeedbackLoading" component={MakeupFeedbackLoadingRouteScreen} />
      <Stack.Screen name="MakeupFeedbackResult" component={MakeupFeedbackResultRouteScreen} />
      <Stack.Screen name="MakeupCorrectionGuide" component={MakeupCorrectionGuideRouteScreen} />
      <Stack.Screen name="MakeupCorrectionTip" component={MakeupCorrectionTipRouteScreen} />
      <Stack.Screen name="ReferenceMakeupExtractionUpload" component={ReferenceMakeupExtractionUploadRouteScreen} />
      <Stack.Screen name="ReferenceMakeupExtractionLoading" component={ReferenceMakeupExtractionLoadingRouteScreen} />
      <Stack.Screen name="ReferenceMakeupExtractionResult" component={ReferenceMakeupExtractionResultRouteScreen} />
      <Stack.Screen name="ExtractedMakeupLookAdjust" component={ExtractedMakeupLookAdjustRouteScreen} />
      <Stack.Screen name="MakeupFilterSaveForm" component={MakeupFilterSaveFormRouteScreen} />
      <Stack.Screen name="MakeupFilterSaveComplete" component={MakeupFilterSaveCompleteRouteScreen} />
      <Stack.Screen name="ExtractedMakeupLookRecipeDetail" component={ExtractedMakeupLookRecipeDetailRouteScreen} />
      <Stack.Screen name="ExtractedMakeupLookRecipeSaveComplete" component={ExtractedMakeupLookRecipeSaveCompleteRouteScreen} />
    </Stack.Navigator>
  );
}
