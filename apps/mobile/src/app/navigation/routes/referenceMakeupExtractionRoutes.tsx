import React from 'react';

import {
  ExtractedMakeupLookAdjustScreen,
  MakeupFilterSaveCompleteScreen,
  MakeupFilterSaveScreen,
  MakeupRecipeDetailScreen,
  MakeupRecipeSaveCompleteScreen,
  ReferenceMakeupExtractionLoadingScreen,
  ReferenceMakeupExtractionResultScreen,
  ReferenceMakeupExtractionUploadScreen,
  type ReferenceMakeupPhoto,
} from '../../../features/reference-makeup-extraction';
import {getReferenceMakeupExtractionDataSync} from '../../../features/reference-makeup-extraction/services/makeupExtractionService';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

function getSelectedReferenceMakeupPhoto(photo: ReferenceMakeupPhoto | null): ReferenceMakeupPhoto {
  return photo ?? getReferenceMakeupExtractionDataSync().photos[0];
}

function buildSavedMakeupLook(photo: ReferenceMakeupPhoto): MakeupLookPreview {
  const {extractedMakeupLook} = getReferenceMakeupExtractionDataSync();

  return {
    id: 'saved-extracted-makeup-look',
    imageSource: photo.imageSource,
    isSaved: true,
    makeupArea: 'all',
    makeupPresetValues: {
      colorId: extractedMakeupLook.palette[0]?.id,
      shapeId: 'extracted-default',
    },
    moodLabel: extractedMakeupLook.tags.slice(0, 2).join(' '),
    shortDescription: extractedMakeupLook.subtitle,
    scope: 'totalMakeup',
    title: extractedMakeupLook.title,
  };
}

export function ReferenceMakeupExtractionUploadRouteScreen({
  navigation,
}: RootScreenProps<'ReferenceMakeupExtractionUpload'>) {
  const {setSelectedReferenceMakeupPhoto} = useNavigationFlowState();

  const handleStartAnalysis = (photo: ReferenceMakeupPhoto) => {
    setSelectedReferenceMakeupPhoto(photo);
    navigation.navigate('ReferenceMakeupExtractionLoading');
  };

  return (
    <DetailRouteChrome
      routeName="ReferenceMakeupExtractionUpload"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <ReferenceMakeupExtractionUploadScreen onStartAnalysis={handleStartAnalysis} />
    </DetailRouteChrome>
  );
}

export function ReferenceMakeupExtractionLoadingRouteScreen({
  navigation,
}: RootScreenProps<'ReferenceMakeupExtractionLoading'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <ReferenceMakeupExtractionLoadingScreen
      onBack={() => navigation.navigate('ReferenceMakeupExtractionUpload')}
      onComplete={() => navigation.navigate('ReferenceMakeupExtractionResult')}
      photo={photo}
    />
  );
}

export function ReferenceMakeupExtractionResultRouteScreen({
  navigation,
}: RootScreenProps<'ReferenceMakeupExtractionResult'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <DetailRouteChrome
      routeName="ReferenceMakeupExtractionResult"
      onBack={() => navigation.navigate('ReferenceMakeupExtractionUpload')}>
      <ReferenceMakeupExtractionResultScreen
        onPreviewMakeupLook={() => navigation.navigate('ExtractedMakeupLookAdjust')}
        onRetake={() => navigation.navigate('ReferenceMakeupExtractionUpload')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function ExtractedMakeupLookAdjustRouteScreen({
  navigation,
}: RootScreenProps<'ExtractedMakeupLookAdjust'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <ExtractedMakeupLookAdjustScreen
      onClose={() => navigation.navigate('ReferenceMakeupExtractionResult')}
      onCreateRecipe={() => navigation.navigate('MakeupRecipeDetail')}
      onSave={() => navigation.navigate('MakeupFilterSave')}
      photo={photo}
    />
  );
}

export function MakeupFilterSaveRouteScreen({navigation}: RootScreenProps<'MakeupFilterSave'>) {
  const {selectedReferenceMakeupPhoto, setSavedMakeupLook} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  const handleSave = () => {
    setSavedMakeupLook(buildSavedMakeupLook(photo));
    navigation.navigate('MakeupFilterSaveComplete');
  };

  return (
    <DetailRouteChrome
      routeName="MakeupFilterSave"
      onBack={() => navigation.navigate('ExtractedMakeupLookAdjust')}
      onDone={handleSave}>
      <MakeupFilterSaveScreen
        onSave={handleSave}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFilterSaveCompleteRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFilterSaveComplete'>) {
  return (
    <MakeupFilterSaveCompleteScreen
      onApplyNow={() => navigation.navigate('ExtractedMakeupLookAdjust')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
    />
  );
}

export function MakeupRecipeDetailRouteScreen({
  navigation,
}: RootScreenProps<'MakeupRecipeDetail'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  return (
    <DetailRouteChrome
      routeName="MakeupRecipeDetail"
      onBack={() => navigation.navigate('ExtractedMakeupLookAdjust')}>
      <MakeupRecipeDetailScreen
        onSaveRecipe={() => navigation.navigate('MakeupRecipeSaveComplete')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function MakeupRecipeSaveCompleteRouteScreen({
  navigation,
}: RootScreenProps<'MakeupRecipeSaveComplete'>) {
  return (
    <MakeupRecipeSaveCompleteScreen
      onBackToDetail={() => navigation.navigate('MakeupRecipeDetail')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
    />
  );
}
