import React, {useEffect, useState} from 'react';

import {
  ExtractedMakeupLookAdjustScreen,
  MakeupFilterSaveCompleteScreen,
  MakeupFilterSaveScreen,
  MakeupRecipeDetailScreen,
  MakeupRecipeSaveCompleteScreen,
  ReferenceMakeupExtractionLoadingScreen,
  ReferenceMakeupExtractionResultScreen,
  type MakeupExtractionProgressUpdate,
  type ReferenceMakeupPhoto,
} from '../../../features/reference-makeup-extraction';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  getReferenceMakeupExtractionDataSync,
  runReferenceMakeupExtraction,
} from '../../../features/reference-makeup-extraction/services/makeupExtractionService';
import {
  getRecommendedMakeupFilterById,
  mapMakeupFilterToSavedLook,
} from '../../../shared/services/makeupGuideService';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function mapFaceCaptureResultToReferenceMakeupPhoto(
  result?: FaceCaptureUploadResult,
): ReferenceMakeupPhoto | null {
  if (!result?.imageUri) {
    return null;
  }

  const isAlbumSource = result.source === 'gallery';

  return {
    contentType: result.contentType ?? null,
    id: `${isAlbumSource ? 'album' : 'camera'}-reference-${result.photoCaptureId}`,
    imageSource: {uri: result.imageUri},
    referenceSource: isAlbumSource ? 'album' : 'camera',
    title: isAlbumSource ? '업로드한 참고 사진' : '촬영한 참고 사진',
  };
}

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
  const {
    referenceMakeupUploadedPhotos,
    setReferenceMakeupUploadedPhotos,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();

  const handleClose = () => {
    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(null);
    navigateMainTab(navigation, 'HomeTab');
  };

  const handleStartAnalysis = (result?: FaceCaptureUploadResult) => {
    const photo = mapFaceCaptureResultToReferenceMakeupPhoto(result);

    if (!photo) {
      return;
    }

    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(photo);
    setReferenceMakeupUploadedPhotos([photo, ...referenceMakeupUploadedPhotos]);
    navigation.replace('ReferenceMakeupExtractionLoading');
  };

  return (
    <CameraFaceCaptureScreen
      captureMode="reference"
      captureType="filter_extraction"
      onCapture={handleStartAnalysis}
      onClose={handleClose}
    />
  );
}

export function ReferenceMakeupExtractionLoadingRouteScreen({
  navigation,
}: RootScreenProps<'ReferenceMakeupExtractionLoading'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);
  const [isAnalysisReady, setIsAnalysisReady] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<MakeupExtractionProgressUpdate | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsAnalysisReady(false);
    setAnalysisProgress(null);
    runReferenceMakeupExtraction(photo, setAnalysisProgress).finally(() => {
      if (isMounted) {
        setIsAnalysisReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [photo]);

  return (
    <ReferenceMakeupExtractionLoadingScreen
      isAnalysisReady={isAnalysisReady}
      onBack={() => navigation.replace('ReferenceMakeupExtractionUpload')}
      onComplete={() => navigation.replace('ReferenceMakeupExtractionResult')}
      photo={photo}
      progressUpdate={analysisProgress}
    />
  );
}
export function ReferenceMakeupExtractionResultRouteScreen({
  navigation,
}: RootScreenProps<'ReferenceMakeupExtractionResult'>) {
  const {selectedReferenceMakeupPhoto} = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  const handleBackToUpload = () => {
    navigation.replace('ReferenceMakeupExtractionUpload');
  };

  return (
    <DetailRouteChrome
      routeName="ReferenceMakeupExtractionResult"
      onBack={handleBackToUpload}>
      <ReferenceMakeupExtractionResultScreen
        onOpenARFilter={() => navigation.navigate('ARFilter', {
          initialGuideMode: 'half',
          initialMakeupFilterId: 'filter-milky-strawberry-pink',
          source: 'recommendedFilter',
        })}
        onRetake={handleBackToUpload}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function ExtractedMakeupLookAdjustRouteScreen({
  navigation,
}: RootScreenProps<'ExtractedMakeupLookAdjust'>) {
  const {
    selectedReferenceMakeupPhoto,
    setSelectedRecommendedMakeupFilterId,
  } = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  const handleSave = () => {
    setSelectedRecommendedMakeupFilterId(null);
    navigation.navigate('MakeupFilterSave');
  };

  return (
    <ExtractedMakeupLookAdjustScreen
      onClose={() => navigation.navigate('ReferenceMakeupExtractionResult')}
      onCreateRecipe={() => navigation.navigate('MakeupRecipeDetail')}
      onSave={handleSave}
      photo={photo}
    />
  );
}

export function MakeupFilterSaveRouteScreen({navigation}: RootScreenProps<'MakeupFilterSave'>) {
  const {
    selectedRecommendedMakeupFilterId,
    selectedReferenceMakeupPhoto,
    setSavedMakeupLook,
  } = useNavigationFlowState();
  const photo = getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);
  const recommendedFilter = selectedRecommendedMakeupFilterId
    ? getRecommendedMakeupFilterById(selectedRecommendedMakeupFilterId)
    : null;
  const referenceMakeupLook =
    getReferenceMakeupExtractionDataSync().extractedMakeupLook;
  const saveScreenData = recommendedFilter
    ? {
        defaultName: recommendedFilter.displayTitle,
        imageSource: recommendedFilter.imageSource,
        summaryDescription: 'AR 적용값과 조정값이 함께 저장돼요.',
        summaryTitle: '저장할 메이크업 룩',
      }
    : {
        defaultName: referenceMakeupLook.title,
        imageSource: photo.imageSource,
        summaryDescription: 'AR 적용값과 조정값이 함께 저장돼요.',
        summaryTitle: '저장할 메이크업 룩',
      };

  const handleSave = () => {
    setSavedMakeupLook(
      recommendedFilter
        ? mapMakeupFilterToSavedLook(recommendedFilter)
        : buildSavedMakeupLook(photo),
    );
    navigation.navigate('MakeupFilterSaveComplete');
  };

  const handleBack = () => {
    if (recommendedFilter) {
      navigation.navigate('ARFilter', {
        initialGuideMode: 'half',
        initialMakeupFilterId: recommendedFilter.id,
        source: 'recommendedFilter',
      });
      return;
    }

    navigation.navigate('ExtractedMakeupLookAdjust');
  };

  return (
    <DetailRouteChrome
      routeName="MakeupFilterSave"
      onBack={handleBack}
      onDone={handleSave}>
      <MakeupFilterSaveScreen
        defaultName={saveScreenData.defaultName}
        imageSource={saveScreenData.imageSource}
        onSave={handleSave}
        summaryDescription={saveScreenData.summaryDescription}
        summaryTitle={saveScreenData.summaryTitle}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFilterSaveCompleteRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFilterSaveComplete'>) {
  const {savedMakeupLook, selectedRecommendedMakeupFilterId} = useNavigationFlowState();

  const handleApplyNow = () => {
    if (selectedRecommendedMakeupFilterId) {
      navigation.navigate('ARFilter', {
        initialGuideMode: 'half',
        initialMakeupFilterId: selectedRecommendedMakeupFilterId,
        source: 'recommendedFilter',
      });
      return;
    }

    navigation.navigate('ExtractedMakeupLookAdjust');
  };

  return (
    <MakeupFilterSaveCompleteScreen
      onApplyNow={handleApplyNow}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
      savedMakeupLookTitle={savedMakeupLook?.title}
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
      onBack={() => navigation.goBack()}>
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
