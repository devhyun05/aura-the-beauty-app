import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {RootStackParamList} from './routeTypes';
import {MainTabNavigator} from './MainTabNavigator';
import {
  ARFilterLocationAdjustRouteScreen,
  ARFilterStyleAdjustRouteScreen,
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
  ExtractedMakeupLookSaveCompleteRouteScreen,
  ExtractedMakeupLookSaveFormRouteScreen,
  ExtractedMakeupLookAdjustRouteScreen,
  ReferenceMakeupExtractionUploadRouteScreen,
  ImageAnalysisLoadingRouteScreen,
  ImageAnalysisReportDetailRouteScreen,
  ImageAnalysisReportsListRouteScreen,
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
      <Stack.Screen name="ImageAnalysisLoading" component={ImageAnalysisLoadingRouteScreen} />
      <Stack.Screen
        name="ImageAnalysisReportsList"
        component={ImageAnalysisReportsListRouteScreen}
      />
      <Stack.Screen
        name="ImageAnalysisReportDetail"
        component={ImageAnalysisReportDetailRouteScreen}
      />
      <Stack.Screen name="ProfileEdit" component={ProfileEditRouteScreen} />
      <Stack.Screen name="MakeupLookList" component={MakeupLookListRouteScreen} />
      <Stack.Screen name="LikedProductList" component={LikedProductListRouteScreen} />
      <Stack.Screen name="ARFilter" component={ARFilterRouteScreen} />
      <Stack.Screen name="ARFilterLocationAdjust" component={ARFilterLocationAdjustRouteScreen} />
      <Stack.Screen name="ARFilterStyleAdjust" component={ARFilterStyleAdjustRouteScreen} />
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
      <Stack.Screen name="ExtractedMakeupLookSaveForm" component={ExtractedMakeupLookSaveFormRouteScreen} />
      <Stack.Screen name="ExtractedMakeupLookSaveComplete" component={ExtractedMakeupLookSaveCompleteRouteScreen} />
      <Stack.Screen name="ExtractedMakeupLookRecipeDetail" component={ExtractedMakeupLookRecipeDetailRouteScreen} />
      <Stack.Screen name="ExtractedMakeupLookRecipeSaveComplete" component={ExtractedMakeupLookRecipeSaveCompleteRouteScreen} />
    </Stack.Navigator>
  );
}
