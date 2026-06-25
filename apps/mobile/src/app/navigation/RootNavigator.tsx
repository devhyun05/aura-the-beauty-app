import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import type {RootStackParamList} from './routeTypes';
import {MainTabNavigator} from './MainTabNavigator';
import {
  ARFilterLocationRouteScreen,
  ARFilterStyleRouteScreen,
  ARMakeupFilterRouteScreen,
  FaceCaptureRouteScreen,
  FeedbackCaptureRouteScreen,
  FeedbackEntryRouteScreen,
  FeedbackGuideRouteScreen,
  FeedbackLoadingRouteScreen,
  FeedbackResultRouteScreen,
  FeedbackTipRouteScreen,
  FilterLoadingRouteScreen,
  FilterRecipeDetailRouteScreen,
  FilterResultRouteScreen,
  FilterSavedRouteScreen,
  FilterSaveRouteScreen,
  FilterTryOnRouteScreen,
  FilterUploadRouteScreen,
  ImageAnalysisLoadingRouteScreen,
  ImageAnalysisReportDetailRouteScreen,
  ImageAnalysisReportsListRouteScreen,
  LikedProductListRouteScreen,
  LoginRouteScreen,
  MakeupStyleListRouteScreen,
  ProfileEditRouteScreen,
  RecipeSavedRouteScreen,
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
      <Stack.Screen name="MakeupStyleList" component={MakeupStyleListRouteScreen} />
      <Stack.Screen name="LikedProductList" component={LikedProductListRouteScreen} />
      <Stack.Screen name="ARMakeupFilter" component={ARMakeupFilterRouteScreen} />
      <Stack.Screen name="ARFilterLocation" component={ARFilterLocationRouteScreen} />
      <Stack.Screen name="ARFilterStyle" component={ARFilterStyleRouteScreen} />
      <Stack.Screen name="FeedbackEntry" component={FeedbackEntryRouteScreen} />
      <Stack.Screen name="FeedbackCapture" component={FeedbackCaptureRouteScreen} />
      <Stack.Screen name="FeedbackLoading" component={FeedbackLoadingRouteScreen} />
      <Stack.Screen name="FeedbackResult" component={FeedbackResultRouteScreen} />
      <Stack.Screen name="FeedbackGuide" component={FeedbackGuideRouteScreen} />
      <Stack.Screen name="FeedbackTip" component={FeedbackTipRouteScreen} />
      <Stack.Screen name="FilterUpload" component={FilterUploadRouteScreen} />
      <Stack.Screen name="FilterLoading" component={FilterLoadingRouteScreen} />
      <Stack.Screen name="FilterResult" component={FilterResultRouteScreen} />
      <Stack.Screen name="FilterTryOn" component={FilterTryOnRouteScreen} />
      <Stack.Screen name="FilterSave" component={FilterSaveRouteScreen} />
      <Stack.Screen name="FilterSaved" component={FilterSavedRouteScreen} />
      <Stack.Screen name="FilterRecipeDetail" component={FilterRecipeDetailRouteScreen} />
      <Stack.Screen name="RecipeSaved" component={RecipeSavedRouteScreen} />
    </Stack.Navigator>
  );
}
