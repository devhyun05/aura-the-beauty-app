import React, {useEffect, useMemo, useState} from 'react';

import {
  ExtractedMakeupLookAdjustScreen,
  MakeupFilterSaveCompleteScreen,
  MakeupFilterSaveScreen,
  MakeupRecipeDetailScreen,
  MakeupRecipeListScreen,
  type MakeupRecipeListItem,
  MakeupRecipeSaveCompleteScreen,
  ReferenceMakeupExtractionAlbumUploadScreen,
  ReferenceMakeupExtractionLoadingScreen,
  ReferenceMakeupExtractionResultScreen,
  type MakeupExtractionProgressUpdate,
  type ReferenceMakeupPhoto,
} from '../../../features/reference-makeup-extraction';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  fetchReferenceMakeupExtractionReport,
  getReferenceMakeupExtractionDataSync,
  runReferenceMakeupExtraction,
} from '../../../features/reference-makeup-extraction/services/makeupExtractionService';
import {
  getRecommendedMakeupFilterById,
  mapMakeupFilterToSavedLook,
} from '../../../shared/services/makeupGuideService';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import type {MakeupArea} from '../../../shared/types/makeupGuide';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';
import {RoutePlaceholder} from '../../../shared/ui';
import {
  buildMakeupFilterSavedLooks,
  getDefaultMakeupFilterSaveSettings,
  prependSavedMakeupLooks,
  type MakeupFilterSaveSettings,
} from '../../../features/reference-makeup-extraction/services/makeupFilterSaveModel';

type HeaderShareAction = {
  cb: () => void;
};

export const REFERENCE_MAKEUP_EXTRACTION_ERROR_LOG_PREFIX =
  '[aura:extraction] extraction:error';

export type ReferenceMakeupExtractionSafeRunner = (
  photo: ReferenceMakeupPhoto,
  onProgress: (progress: MakeupExtractionProgressUpdate) => void,
  onError?: (error: unknown) => void,
) => Promise<void>;

const REFERENCE_MAKEUP_SAVE_AREAS: readonly MakeupArea[] = [
  'base',
  'eye',
  'brow',
  'cheek',
  'lip',
];

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

function buildMakeupRecipeListItems(
  selectedPhoto: ReferenceMakeupPhoto | null,
): MakeupRecipeListItem[] {
  const {extractedMakeupLook, photos} = getReferenceMakeupExtractionDataSync();
  const primaryPhoto = getSelectedReferenceMakeupPhoto(selectedPhoto);
  const recipePhotos = [
    primaryPhoto,
    ...photos.filter((photo) => photo.id !== primaryPhoto.id),
  ];

  return recipePhotos.map((photo, index) => ({
    id: `makeup-recipe-${photo.id}`,
    photo,
    subtitle:
      index === 0
        ? extractedMakeupLook.subtitle
        : '레퍼런스 사진에서 추출한 색상과 적용 순서를 정리했어요.',
    tags: extractedMakeupLook.tags,
    title: index === 0
      ? extractedMakeupLook.title
      : `${extractedMakeupLook.title} ${index + 1}`,
  }));
}

function logReferenceMakeupExtractionError(error: unknown) {
  console.info(REFERENCE_MAKEUP_EXTRACTION_ERROR_LOG_PREFIX, {
    message: error instanceof Error ? error.message : String(error),
  });
}

export const runReferenceMakeupExtractionSafely: ReferenceMakeupExtractionSafeRunner =
  async (photo, onProgress, onError = logReferenceMakeupExtractionError) => {
    try {
      await runReferenceMakeupExtraction(photo, onProgress);
    } catch (error) {
      onError(error);
    }
  };

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
  route,
}: RootScreenProps<'ReferenceMakeupExtractionUpload'>) {
  const {
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
    navigation.replace('FaceCaptureConfirmation', {target: 'referenceMakeupExtraction'});
  };

  const handleSelectAlbumPhoto = (photo: ReferenceMakeupPhoto) => {
    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(photo);
    navigation.replace('FaceCaptureConfirmation', {target: 'referenceMakeupExtraction'});
  };

  if (route.params?.initialSource === 'gallery') {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionUpload"
        onBack={handleClose}
        onClose={handleClose}>
        <ReferenceMakeupExtractionAlbumUploadScreen onSelectPhoto={handleSelectAlbumPhoto} />
      </DetailRouteChrome>
    );
  }

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
  const [analysisProgress, setAnalysisProgress] =
    useState<MakeupExtractionProgressUpdate | null>(null);

  useEffect(() => {
    let isMounted = true;

    setIsAnalysisReady(false);
    setAnalysisProgress(null);

    const safeOnProgress = (progress: MakeupExtractionProgressUpdate) => {
      if (isMounted) {
        setAnalysisProgress(progress);
      }
    };

    void runReferenceMakeupExtractionSafely(photo, safeOnProgress)
      .finally(() => {
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
      onComplete={() => {
        if (navigation.isFocused()) {
          navigation.replace('ReferenceMakeupExtractionResult');
        }
      }}
      photo={photo}
      progressUpdate={analysisProgress}
    />
  );
}

export function ReferenceMakeupExtractionResultRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ReferenceMakeupExtractionResult'>) {
  const {
    selectedReferenceMakeupPhoto,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();
  const reportId = route.params?.reportId;
  const [loadedReportPhoto, setLoadedReportPhoto] =
    useState<ReferenceMakeupPhoto | null>(null);
  const [reportLoadError, setReportLoadError] = useState('');
  const photo =
    loadedReportPhoto ??
    getSelectedReferenceMakeupPhoto(selectedReferenceMakeupPhoto);

  useEffect(() => {
    if (!reportId) {
      return;
    }

    let isMounted = true;
    setLoadedReportPhoto(null);
    setReportLoadError('');

    void fetchReferenceMakeupExtractionReport(reportId)
      .then(({photo: nextPhoto}) => {
        if (isMounted) {
          setLoadedReportPhoto(nextPhoto);
          setSelectedReferenceMakeupPhoto(nextPhoto);
        }
      })
      .catch(error => {
        if (isMounted) {
          setReportLoadError(
            error instanceof Error
              ? error.message
              : '메이크업 추출 보고서를 불러오지 못했어요.',
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reportId, setSelectedReferenceMakeupPhoto]);

  const handleBackToUpload = () => {
    if (reportId && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.replace('ReferenceMakeupExtractionUpload');
  };

  if (reportId && !loadedReportPhoto) {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionResult"
        onBack={handleBackToUpload}>
        <RoutePlaceholder
          description={
            reportLoadError || '완료된 메이크업 추출 보고서를 불러오고 있어요.'
          }
          showHeader={false}
          title={reportLoadError ? '보고서를 열지 못했어요' : '보고서를 여는 중'}
        />
      </DetailRouteChrome>
    );
  }

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
    setSavedMakeupLooks,
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
        makeupAreas: recommendedFilter.makeupAreas,
        summaryDescription: 'AR 적용값과 조정값이 함께 저장돼요.',
        summaryTitle: '저장할 메이크업 룩',
      }
    : {
        defaultName: referenceMakeupLook.title,
        imageSource: photo.imageSource,
        makeupAreas: REFERENCE_MAKEUP_SAVE_AREAS,
        summaryDescription: 'AR 적용값과 조정값이 함께 저장돼요.',
        summaryTitle: '저장할 메이크업 룩',
      };
  const initialSaveSettings = useMemo(
    () =>
      getDefaultMakeupFilterSaveSettings({
        defaultName: saveScreenData.defaultName,
        makeupAreas: saveScreenData.makeupAreas,
      }),
    [saveScreenData.defaultName, saveScreenData.makeupAreas],
  );
  const [saveSettings, setSaveSettings] =
    useState<MakeupFilterSaveSettings>(initialSaveSettings);

  useEffect(() => {
    setSaveSettings(initialSaveSettings);
  }, [initialSaveSettings]);

  const handleSave = (settings = saveSettings) => {
    const baseSavedLook = recommendedFilter
      ? mapMakeupFilterToSavedLook(recommendedFilter)
      : buildSavedMakeupLook(photo);
    const savedLooks = buildMakeupFilterSavedLooks({
      baseSavedLook,
      settings,
    });

    if (savedLooks.length === 0) {
      return;
    }

    setSavedMakeupLook(savedLooks[0]);
    setSavedMakeupLooks(currentSavedLooks =>
      prependSavedMakeupLooks(currentSavedLooks, savedLooks),
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
      onDone={() => handleSave()}>
      <MakeupFilterSaveScreen
        imageSource={saveScreenData.imageSource}
        onSave={handleSave}
        onSettingsChange={setSaveSettings}
        settings={saveSettings}
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
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupRecipeDetail"
      onOpenDocumentList={() => navigation.navigate('MakeupRecipeList')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <MakeupRecipeDetailScreen
        onHeaderShareActionChange={handleHeaderShareActionChange}
        onSaveRecipe={() => navigation.navigate('MakeupRecipeSaveComplete')}
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function MakeupRecipeListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupRecipeList'>) {
  const {selectedReferenceMakeupPhoto, setSelectedReferenceMakeupPhoto} =
    useNavigationFlowState();
  const recipes = useMemo(
    () => buildMakeupRecipeListItems(selectedReferenceMakeupPhoto),
    [selectedReferenceMakeupPhoto],
  );
  const handlePressRecipe = (recipe: MakeupRecipeListItem) => {
    setSelectedReferenceMakeupPhoto(recipe.photo);
    navigation.navigate('MakeupRecipeDetail');
  };

  return (
    <DetailRouteChrome
      routeName="MakeupRecipeList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <MakeupRecipeListScreen
        onPressRecipe={handlePressRecipe}
        recipes={recipes}
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
