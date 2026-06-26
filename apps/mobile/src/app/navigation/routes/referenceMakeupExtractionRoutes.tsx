import React from 'react';

import {
  FilterExtractionLoadingScreen,
  FilterExtractionResultScreen,
  FilterExtractionUploadScreen,
  FilterRecipeDetailScreen,
  FilterRecipeSaveCompleteScreen,
  FilterSaveCompleteScreen,
  FilterSaveFormScreen,
  FilterTryOnAdjustScreen,
  type FilterExtractionPhoto,
} from '../../../features/filter-extraction';
import {getFilterExtractionDataSync} from '../../../features/filter-extraction/services/filterExtractionService';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

function getSelectedFilterPhoto(photo: FilterExtractionPhoto | null): FilterExtractionPhoto {
  return photo ?? getFilterExtractionDataSync().photos[0];
}

function buildSavedMakeupLook(photo: FilterExtractionPhoto): MakeupLookPreview {
  const {result} = getFilterExtractionDataSync();

  return {
    id: 'saved-extracted-makeup-look',
    imageSource: photo.imageSource,
    isSaved: true,
    moodLabel: result.tags.slice(0, 2).join(' '),
    shortDescription: result.subtitle,
    title: result.title,
  };
}

export function FilterExtractionUploadRouteScreen({
  navigation,
}: RootScreenProps<'FilterExtractionUpload'>) {
  const {setSelectedFilterPhoto} = useNavigationFlowState();

  const handleStartAnalysis = (photo: FilterExtractionPhoto) => {
    setSelectedFilterPhoto(photo);
    navigation.navigate('FilterExtractionLoading');
  };

  return (
    <DetailRouteChrome
      routeName="FilterExtractionUpload"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <FilterExtractionUploadScreen onStartAnalysis={handleStartAnalysis} />
    </DetailRouteChrome>
  );
}

export function FilterExtractionLoadingRouteScreen({
  navigation,
}: RootScreenProps<'FilterExtractionLoading'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterExtractionLoadingScreen
      onBack={() => navigation.navigate('FilterExtractionUpload')}
      onComplete={() => navigation.navigate('FilterExtractionResult')}
      photo={photo}
    />
  );
}

export function FilterExtractionResultRouteScreen({
  navigation,
}: RootScreenProps<'FilterExtractionResult'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <DetailRouteChrome
      routeName="FilterExtractionResult"
      onBack={() => navigation.navigate('FilterExtractionUpload')}>
      <FilterExtractionResultScreen
        onApplyFilter={() => navigation.navigate('FilterTryOnAdjust')}
        onRetake={() => navigation.navigate('FilterExtractionUpload')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function FilterTryOnAdjustRouteScreen({navigation}: RootScreenProps<'FilterTryOnAdjust'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <FilterTryOnAdjustScreen
      onClose={() => navigation.navigate('FilterExtractionResult')}
      onCreateRecipe={() => navigation.navigate('FilterRecipeDetail')}
      onSave={() => navigation.navigate('FilterSaveForm')}
      photo={photo}
    />
  );
}

export function FilterSaveFormRouteScreen({navigation}: RootScreenProps<'FilterSaveForm'>) {
  const {selectedFilterPhoto, setSavedMakeupLook} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  const handleSave = () => {
    setSavedMakeupLook(buildSavedMakeupLook(photo));
    navigation.navigate('FilterSaveComplete');
  };

  return (
    <DetailRouteChrome
      routeName="FilterSaveForm"
      onBack={() => navigation.navigate('FilterTryOnAdjust')}
      onDone={handleSave}>
      <FilterSaveFormScreen
        onSave={handleSave}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function FilterSaveCompleteRouteScreen({
  navigation,
}: RootScreenProps<'FilterSaveComplete'>) {
  return (
    <FilterSaveCompleteScreen
      onApplyNow={() => navigation.navigate('FilterTryOnAdjust')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
    />
  );
}

export function FilterRecipeDetailRouteScreen({
  navigation,
}: RootScreenProps<'FilterRecipeDetail'>) {
  const {selectedFilterPhoto} = useNavigationFlowState();
  const photo = getSelectedFilterPhoto(selectedFilterPhoto);

  return (
    <DetailRouteChrome
      routeName="FilterRecipeDetail"
      onBack={() => navigation.navigate('FilterTryOnAdjust')}>
      <FilterRecipeDetailScreen
        onSaveRecipe={() => navigation.navigate('FilterRecipeSaveComplete')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function FilterRecipeSaveCompleteRouteScreen({
  navigation,
}: RootScreenProps<'FilterRecipeSaveComplete'>) {
  return (
    <FilterRecipeSaveCompleteScreen
      onBackToDetail={() => navigation.navigate('FilterRecipeDetail')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
    />
  );
}