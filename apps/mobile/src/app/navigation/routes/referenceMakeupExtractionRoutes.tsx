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
  type ReferenceMakeupExtractionReportHistoryItem,
  type ReferenceMakeupPhoto,
} from '../../../features/reference-makeup-extraction';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import {AiDataConsentGate} from '../../../features/legal/components/AiDataConsentGate';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  fetchReferenceMakeupExtractionReport,
  fetchReferenceMakeupExtractionReports,
  getReferenceMakeupExtractionDataSync,
  hasCompletedReferenceMakeupExtractionSync,
  runReferenceMakeupExtraction,
  type ReferenceMakeupExtractionRunResult,
} from '../../../features/reference-makeup-extraction/services/makeupExtractionService';
import {
  getRecommendedMakeupFilterById,
  mapMakeupFilterToSavedLook,
} from '../../../shared/services/makeupGuideService';
import type {MakeupLookPreview} from '../../../shared/types/profile';
import type {MakeupArea} from '../../../shared/types/makeupGuide';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {
  goBackToPreviousOrMainTab,
  navigateMainTab,
  type RootScreenProps,
} from './routeUtils';
import {RoutePlaceholder} from '../../../shared/ui';
import {
  buildMakeupFilterSavedLooks,
  getDefaultMakeupFilterSaveSettings,
  prependSavedMakeupLooks,
  type MakeupFilterSaveSettings,
} from '../../../features/reference-makeup-extraction/services/makeupFilterSaveModel';

export const REFERENCE_MAKEUP_EXTRACTION_ERROR_LOG_PREFIX =
  '[aura:extraction] extraction:error';

export type ReferenceMakeupExtractionSafeRunner = (
  photo: ReferenceMakeupPhoto,
  onProgress: (progress: MakeupExtractionProgressUpdate) => void,
  onError?: (error: unknown) => void,
) => Promise<ReferenceMakeupExtractionRunResult | null>;

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

function buildMakeupRecipeListItemsFromReports(
  reports: readonly ReferenceMakeupExtractionReportHistoryItem[],
): MakeupRecipeListItem[] {
  return reports.map(report => ({
    id: `makeup-recipe-${report.reportId}`,
    photo: report.photo,
    reportId: report.reportId,
    subtitle: report.data.extractedMakeupLook.subtitle,
    tags: report.data.extractedMakeupLook.tags,
    title: report.data.extractedMakeupLook.title,
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
      return await runReferenceMakeupExtraction(photo, onProgress);
    } catch (error) {
      onError(error);
      return null;
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
    goBackToPreviousOrMainTab(navigation, 'HomeTab');
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
      <AiDataConsentGate onDecline={handleClose}>
        <DetailRouteChrome
          routeName="ReferenceMakeupExtractionUpload"
          onBack={handleClose}
          onClose={handleClose}>
          <ReferenceMakeupExtractionAlbumUploadScreen
            onCancel={handleClose}
            onSelectPhoto={handleSelectAlbumPhoto}
          />
        </DetailRouteChrome>
      </AiDataConsentGate>
    );
  }

  return (
    <AiDataConsentGate onDecline={handleClose}>
      <CameraFaceCaptureScreen
        // 얼굴 분석·피드백과 동일한 촬영 UX(사용자 결정): 셀피 기본 + 타원
        // 프레이밍 검증. 'reference'는 후면 기본에 얼굴 검증이 없었다.
        captureMode="face"
        captureType="filter_extraction"
        onCapture={handleStartAnalysis}
        onClose={handleClose}
      />
    </AiDataConsentGate>
  );
}

export function ReferenceMakeupExtractionLoadingRouteScreen({
  navigation,
}: RootScreenProps<'ReferenceMakeupExtractionLoading'>) {
  const {
    selectedReferenceMakeupPhoto,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();
  const photo = selectedReferenceMakeupPhoto;
  const [isAnalysisReady, setIsAnalysisReady] = useState(false);
  const [analysisProgress, setAnalysisProgress] =
    useState<MakeupExtractionProgressUpdate | null>(null);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<string | null>(null);
  const [completedReportId, setCompletedReportId] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    if (!photo) {
      navigation.replace('ReferenceMakeupExtractionUpload');
      return;
    }

    let isMounted = true;

    setIsAnalysisReady(false);
    setAnalysisProgress(null);
    setAnalysisErrorMessage(null);
    setCompletedReportId(null);

    const safeOnProgress = (progress: MakeupExtractionProgressUpdate) => {
      if (isMounted) {
        setAnalysisProgress(progress);
      }
    };

    void runReferenceMakeupExtractionSafely(photo, safeOnProgress, error => {
      logReferenceMakeupExtractionError(error);
      if (isMounted) {
        setAnalysisErrorMessage(
          error instanceof Error
            ? error.message
            : '메이크업 추출을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
        );
      }
    })
      .then(result => {
        if (isMounted && result) {
          setCompletedReportId(result.reportId);
          setIsAnalysisReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [navigation, photo, requestKey]);

  if (!photo) {
    return null;
  }

  return (
    <ReferenceMakeupExtractionLoadingScreen
      key={`${photo.id}:${requestKey}`}
      analysisAttemptKey={requestKey}
      analysisErrorMessage={analysisErrorMessage}
      isAnalysisReady={isAnalysisReady}
      onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}
      onChooseDifferentPhoto={() => {
        const initialSource = photo.referenceSource === 'album' ? 'gallery' : 'camera';
        setSelectedReferenceMakeupPhoto(null);
        navigation.replace('ReferenceMakeupExtractionUpload', {initialSource});
      }}
      onComplete={() => {
        if (navigation.isFocused() && completedReportId) {
          navigation.reset({
            index: 1,
            routes: [
              {name: 'MainTabs', params: {screen: 'HomeTab'}},
              {
                name: 'ReferenceMakeupExtractionResult',
                params: {reportId: completedReportId},
              },
            ],
          });
        }
      }}
      onOpenReportList={() => navigation.replace('MakeupRecipeList')}
      onRetry={() => setRequestKey(currentKey => currentKey + 1)}
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
  const shouldReturnToProfile = route.params?.returnTo === 'profile';
  const [loadedReportPhoto, setLoadedReportPhoto] =
    useState<ReferenceMakeupPhoto | null>(null);
  const [reportLoadError, setReportLoadError] = useState('');
  const [reportRequestKey, setReportRequestKey] = useState(0);
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
  }, [reportId, reportRequestKey, setSelectedReferenceMakeupPhoto]);

  const handleBack = () => {
    if (shouldReturnToProfile) {
      goBackToPreviousOrMainTab(navigation, 'ProfileTab');
      return;
    }

    if (reportId && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    goBackToPreviousOrMainTab(navigation, 'HomeTab');
  };

  const handleRetake = () => {
    navigation.replace('ReferenceMakeupExtractionUpload');
  };

  if (!reportId && !hasCompletedReferenceMakeupExtractionSync()) {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionResult"
        onBack={handleBack}>
        <RoutePlaceholder
          description="완료된 메이크업 추출 보고서를 먼저 선택해 주세요."
          showHeader={false}
          title="보고서를 열지 못했어요"
        />
      </DetailRouteChrome>
    );
  }

  if (reportId && !loadedReportPhoto) {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionResult"
        onBack={handleBack}>
        <RoutePlaceholder
          description={
            reportLoadError || '완료된 메이크업 추출 보고서를 불러오고 있어요.'
          }
          onPrimaryAction={
            reportLoadError
              ? () => setReportRequestKey(currentKey => currentKey + 1)
              : undefined
          }
          onSecondaryAction={
            reportLoadError ? () => navigation.replace('MakeupRecipeList') : undefined
          }
          primaryActionLabel={reportLoadError ? '다시 시도하기' : undefined}
          secondaryActionLabel={reportLoadError ? '보고서 목록으로' : undefined}
          showHeader={false}
          title={reportLoadError ? '보고서를 열지 못했어요' : '보고서를 여는 중'}
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="ReferenceMakeupExtractionResult"
      onBack={handleBack}>
      <ReferenceMakeupExtractionResultScreen
        onOpenARFilter={() => navigation.navigate('ARFilter', {
          initialGuideMode: 'half',
          initialMakeupFilterId: 'filter-milky-strawberry-pink',
          source: 'recommendedFilter',
        })}
        onRetake={handleRetake}
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
      onClose={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigation.replace('ReferenceMakeupExtractionResult')
      }
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
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (recommendedFilter) {
      navigation.replace('ARFilter', {
        initialGuideMode: 'half',
        initialMakeupFilterId: recommendedFilter.id,
        source: 'recommendedFilter',
      });
      return;
    }

    navigation.replace('ExtractedMakeupLookAdjust');
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

  return (
    <DetailRouteChrome
      routeName="MakeupRecipeDetail"
      onOpenDocumentList={() => navigation.navigate('MakeupRecipeList')}>
      <MakeupRecipeDetailScreen
        photo={photo}
      />
    </DetailRouteChrome>
  );
}

export function MakeupRecipeListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupRecipeList'>) {
  const {setSelectedReferenceMakeupPhoto} = useNavigationFlowState();
  const [recipes, setRecipes] = useState<MakeupRecipeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadRecipes = React.useCallback(() => {
    setIsLoading(true);
    setLoadError('');

    void fetchReferenceMakeupExtractionReports()
      .then(reports => {
        const nextRecipes = buildMakeupRecipeListItemsFromReports(reports);
        setRecipes(nextRecipes);
      })
      .catch(error => {
        setLoadError(
          error instanceof Error
            ? error.message
            : '메이크업 추출 보고서를 불러오지 못했어요.',
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const handlePressRecipe = (recipe: MakeupRecipeListItem) => {
    setSelectedReferenceMakeupPhoto(recipe.photo);
    if (recipe.reportId) {
      navigation.navigate('ReferenceMakeupExtractionResult', {
        reportId: recipe.reportId,
      });
      return;
    }

    navigation.navigate('MakeupRecipeDetail');
  };

  return (
    <DetailRouteChrome
      routeName="MakeupRecipeList"
      onBack={() => goBackToPreviousOrMainTab(navigation, 'ProfileTab')}>
      <MakeupRecipeListScreen
        error={loadError}
        isLoading={isLoading}
        onRetry={loadRecipes}
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
