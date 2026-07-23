import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

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
import {getRecommendedFilterStencilRouteParams} from './arRouteActions';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  deleteReferenceMakeupExtractionReport,
  fetchReferenceMakeupExtractionReport,
  fetchReferenceMakeupExtractionReports,
  getReferenceMakeupExtractionDataSync,
  hasCompletedReferenceMakeupExtractionSync,
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
import {
  goBackToPreviousOrMainTab,
  navigateMainTab,
  type RootScreenProps,
} from './routeUtils';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, RoutePlaceholder} from '../../../shared/ui';
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

function getCompletedReferenceMakeupExtractionSnapshot(
  expectedReportId?: string | null,
) {
  if (!hasCompletedReferenceMakeupExtractionSync()) {
    return null;
  }

  const data = getReferenceMakeupExtractionDataSync();
  const reportId = data.reportId?.trim();
  const normalizedExpectedReportId = expectedReportId?.trim();
  const photo = data.photos[0];

  if (
    !reportId ||
    !photo ||
    (normalizedExpectedReportId && reportId !== normalizedExpectedReportId)
  ) {
    return null;
  }

  return {data, photo, reportId};
}

function buildMakeupRecipeListItemsFromCompletedSession(): MakeupRecipeListItem[] {
  const completedReport = getCompletedReferenceMakeupExtractionSnapshot();

  if (!completedReport) {
    return [];
  }

  const {createdAt, extractedMakeupLook} = completedReport.data;

  return [{
    createdAt,
    id: `makeup-recipe-${completedReport.reportId}`,
    photo: completedReport.photo,
    reportId: completedReport.reportId,
    subtitle: extractedMakeupLook.subtitle,
    tags: extractedMakeupLook.tags,
    title: extractedMakeupLook.title,
  }];
}

function buildMakeupRecipeListItemsFromReports(
  reports: readonly ReferenceMakeupExtractionReportHistoryItem[],
): MakeupRecipeListItem[] {
  return reports.map(report => ({
    createdAt: report.createdAt,
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
      await runReferenceMakeupExtraction(photo, onProgress);
    } catch (error) {
      onError(error);
    }
  };

type ExtractionRouteRecoveryProps = {
  description: string;
  onOpenReportList: () => void;
  onPrimaryAction: () => void;
  primaryActionLabel: string;
  title: string;
};

function ExtractionRouteRecovery({
  description,
  onOpenReportList,
  onPrimaryAction,
  primaryActionLabel,
  title,
}: ExtractionRouteRecoveryProps) {
  return (
    <AppScreen scroll={false} topPadding="none">
      <View style={extractionRecoveryStyles.card}>
        <Text style={extractionRecoveryStyles.title}>{title}</Text>
        <Text style={extractionRecoveryStyles.description}>{description}</Text>
        <View style={extractionRecoveryStyles.actions}>
          <Pressable
            accessibilityLabel={primaryActionLabel}
            accessibilityRole="button"
            onPress={onPrimaryAction}
            style={({pressed}) => [
              extractionRecoveryStyles.primaryAction,
              pressed && extractionRecoveryStyles.actionPressed,
            ]}>
            <Text style={extractionRecoveryStyles.primaryActionText}>
              {primaryActionLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel="메이크업 추출 보고서 목록 보기"
            accessibilityRole="button"
            onPress={onOpenReportList}
            style={({pressed}) => [
              extractionRecoveryStyles.secondaryAction,
              pressed && extractionRecoveryStyles.actionPressed,
            ]}>
            <Text style={extractionRecoveryStyles.secondaryActionText}>
              보고서 목록 보기
            </Text>
          </Pressable>
        </View>
      </View>
    </AppScreen>
  );
}

function buildSavedMakeupLook(
  completedReport: NonNullable<
    ReturnType<typeof getCompletedReferenceMakeupExtractionSnapshot>
  >,
): MakeupLookPreview {
  const {extractedMakeupLook} = completedReport.data;

  return {
    id: 'saved-extracted-makeup-look',
    imageSource: completedReport.photo.imageSource,
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
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionUpload"
        onBack={handleClose}
        onClose={handleClose}>
        <ReferenceMakeupExtractionAlbumUploadScreen
          onCancel={handleClose}
          onSelectPhoto={handleSelectAlbumPhoto}
        />
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
  const photo = selectedReferenceMakeupPhoto;
  const [isAnalysisReady, setIsAnalysisReady] = useState(false);
  const [analysisProgress, setAnalysisProgress] =
    useState<MakeupExtractionProgressUpdate | null>(null);
  const [analysisAttemptKey, setAnalysisAttemptKey] = useState(0);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<string | null>(null);
  const [completedReportId, setCompletedReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) {
      setIsAnalysisReady(false);
      setAnalysisProgress(null);
      setAnalysisErrorMessage(null);
      setCompletedReportId(null);
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();

    setIsAnalysisReady(false);
    setAnalysisProgress(null);
    setAnalysisErrorMessage(null);
    setCompletedReportId(null);

    const safeOnProgress = (progress: MakeupExtractionProgressUpdate) => {
      if (isMounted) {
        setAnalysisProgress(progress);
      }
    };

    void runReferenceMakeupExtraction(photo, safeOnProgress, {
      signal: abortController.signal,
    })
      .then(({reportId}) => {
        if (isMounted) {
          setCompletedReportId(reportId);
          setIsAnalysisReady(true);
        }
      })
      .catch(error => {
        if (isMounted) {
          setAnalysisErrorMessage(
            error instanceof Error
              ? error.message
              : '메이크업 추출을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
          );
        }
      });

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [analysisAttemptKey, photo]);

  const handleOpenReportList = () => navigation.replace('MakeupRecipeList');
  const handleChoosePhoto = () => {
    navigation.replace('ReferenceMakeupExtractionUpload', {initialSource: 'gallery'});
  };

  if (!photo) {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionLoading"
        onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}>
        <ExtractionRouteRecovery
          description="분석할 사진 정보가 없어요. 사진을 다시 선택하면 메이크업 추출을 시작할 수 있어요."
          onOpenReportList={handleOpenReportList}
          onPrimaryAction={handleChoosePhoto}
          primaryActionLabel="사진 선택하기"
          title="분석할 사진이 필요해요"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <ReferenceMakeupExtractionLoadingScreen
      analysisAttemptKey={analysisAttemptKey}
      analysisErrorMessage={analysisErrorMessage}
      isAnalysisReady={isAnalysisReady}
      onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}
      onChooseDifferentPhoto={handleChoosePhoto}
      onComplete={() => {
        if (navigation.isFocused() && completedReportId) {
          navigation.reset({
            index: 1,
            routes: [
              {name: 'MainTabs', params: {screen: 'HomeTab'}},
              {name: 'ReferenceMakeupExtractionResult', params: {reportId: completedReportId}},
            ],
          });
        }
      }}
      onOpenReportList={handleOpenReportList}
      onRetry={() => setAnalysisAttemptKey(current => current + 1)}
      photo={photo}
      progressUpdate={analysisProgress}
    />
  );
}
export function ReferenceMakeupExtractionResultRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ReferenceMakeupExtractionResult'>) {
  const {setSelectedReferenceMakeupPhoto} = useNavigationFlowState();
  const reportId = route.params?.reportId?.trim() || null;
  const shouldReturnToProfile = route.params?.returnTo === 'profile';
  const [reportLoadAttemptKey, setReportLoadAttemptKey] = useState(0);
  const [reportLoadFailure, setReportLoadFailure] = useState<{
    message: string;
    reportId: string;
  } | null>(null);
  const completedReport = getCompletedReferenceMakeupExtractionSnapshot(reportId);
  const reportLoadError =
    reportId && reportLoadFailure?.reportId === reportId
      ? reportLoadFailure.message
      : '';

  useEffect(() => {
    if (
      !reportId ||
      getCompletedReferenceMakeupExtractionSnapshot(reportId)
    ) {
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();
    setReportLoadFailure(null);

    void fetchReferenceMakeupExtractionReport(reportId, {
      signal: abortController.signal,
    })
      .then(({photo: nextPhoto}) => {
        if (isMounted) {
          setSelectedReferenceMakeupPhoto(nextPhoto);
        }
      })
      .catch(error => {
        if (isMounted) {
          setReportLoadFailure({
            message:
              error instanceof Error
                ? error.message
                : '메이크업 추출 보고서를 불러오지 못했어요.',
            reportId,
          });
        }
      });

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [reportId, reportLoadAttemptKey, setSelectedReferenceMakeupPhoto]);

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
    setSelectedReferenceMakeupPhoto(null);
    navigation.replace('ReferenceMakeupExtractionUpload');
  };
  const handleOpenReportList = () => navigation.replace('MakeupRecipeList');

  if (!reportId && !completedReport) {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionResult"
        onBack={handleBack}>
        <ExtractionRouteRecovery
          description="완료된 메이크업 추출 결과가 없어요. 새 사진으로 추출을 시작하거나 저장된 보고서를 선택해 주세요."
          onOpenReportList={handleOpenReportList}
          onPrimaryAction={handleRetake}
          primaryActionLabel="새로 추출하기"
          title="표시할 결과가 없어요"
        />
      </DetailRouteChrome>
    );
  }

  if (reportId && !completedReport) {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionResult"
        onBack={handleBack}>
        {reportLoadError ? (
          <ExtractionRouteRecovery
            description={reportLoadError}
            onOpenReportList={handleOpenReportList}
            onPrimaryAction={() =>
              setReportLoadAttemptKey(current => current + 1)
            }
            primaryActionLabel="다시 시도"
            title="보고서를 열지 못했어요"
          />
        ) : (
          <RoutePlaceholder
            description="완료된 메이크업 추출 보고서를 불러오고 있어요."
            showHeader={false}
            title="보고서를 여는 중"
          />
        )}
      </DetailRouteChrome>
    );
  }

  if (!completedReport) {
    return (
      <DetailRouteChrome
        routeName="ReferenceMakeupExtractionResult"
        onBack={handleBack}>
        <ExtractionRouteRecovery
          description="완료된 결과를 확인할 수 없어요. 저장된 보고서를 다시 선택해 주세요."
          onOpenReportList={handleOpenReportList}
          onPrimaryAction={handleRetake}
          primaryActionLabel="새로 추출하기"
          title="표시할 결과가 없어요"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="ReferenceMakeupExtractionResult"
      onBack={handleBack}
      onOpenDocumentList={handleOpenReportList}>
      <ReferenceMakeupExtractionResultScreen
        onOpenARFilter={() => navigation.navigate(
          'ARFilter',
          getRecommendedFilterStencilRouteParams('filter-milky-strawberry-pink'),
        )}
        onRetake={handleRetake}
        photo={completedReport.photo}
      />
    </DetailRouteChrome>
  );
}
export function ExtractedMakeupLookAdjustRouteScreen({
  navigation,
}: RootScreenProps<'ExtractedMakeupLookAdjust'>) {
  const {setSelectedRecommendedMakeupFilterId} = useNavigationFlowState();
  const completedReport = getCompletedReferenceMakeupExtractionSnapshot();

  const handleSave = () => {
    setSelectedRecommendedMakeupFilterId(null);
    navigation.navigate('MakeupFilterSave');
  };

  if (!completedReport) {
    return (
      <DetailRouteChrome
        routeName="ExtractedMakeupLookAdjust"
        onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}>
        <ExtractionRouteRecovery
          description="완료된 메이크업 추출 결과가 있어야 룩을 조정할 수 있어요."
          onOpenReportList={() => navigation.replace('MakeupRecipeList')}
          onPrimaryAction={() => navigation.replace('ReferenceMakeupExtractionUpload')}
          primaryActionLabel="새로 추출하기"
          title="조정할 결과가 없어요"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <ExtractedMakeupLookAdjustScreen
      onClose={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigation.replace('ReferenceMakeupExtractionResult')
      }
      onCreateRecipe={() => navigation.navigate('MakeupRecipeDetail')}
      onSave={handleSave}
      photo={completedReport.photo}
    />
  );
}

export function MakeupFilterSaveRouteScreen({navigation}: RootScreenProps<'MakeupFilterSave'>) {
  const {
    selectedRecommendedMakeupFilterId,
    setSavedMakeupLook,
    setSavedMakeupLooks,
  } = useNavigationFlowState();
  const completedReport = getCompletedReferenceMakeupExtractionSnapshot();
  const recommendedFilter = selectedRecommendedMakeupFilterId
    ? getRecommendedMakeupFilterById(selectedRecommendedMakeupFilterId)
    : null;
  const referenceMakeupLook = completedReport?.data.extractedMakeupLook ?? null;
  const saveScreenData = recommendedFilter
    ? {
        defaultName: recommendedFilter.displayTitle,
        imageSource: recommendedFilter.imageSource,
        makeupAreas: recommendedFilter.makeupAreas,
        summaryDescription: 'AR 적용값과 조정값이 함께 저장돼요.',
        summaryTitle: '저장할 메이크업 룩',
      }
    : referenceMakeupLook && completedReport
      ? {
          defaultName: referenceMakeupLook.title,
          imageSource: completedReport.photo.imageSource,
          makeupAreas: REFERENCE_MAKEUP_SAVE_AREAS,
          summaryDescription: 'AR 적용값과 조정값이 함께 저장돼요.',
          summaryTitle: '저장할 메이크업 룩',
        }
      : null;
  const initialSaveSettings = useMemo(
    () =>
      getDefaultMakeupFilterSaveSettings({
        defaultName: saveScreenData?.defaultName ?? '',
        makeupAreas: saveScreenData?.makeupAreas ?? [],
      }),
    [saveScreenData?.defaultName, saveScreenData?.makeupAreas],
  );
  const [saveSettings, setSaveSettings] =
    useState<MakeupFilterSaveSettings>(initialSaveSettings);

  useEffect(() => {
    setSaveSettings(initialSaveSettings);
  }, [initialSaveSettings]);

  const handleSave = (settings = saveSettings) => {
    if (!saveScreenData) {
      return;
    }

    const baseSavedLook = recommendedFilter
      ? mapMakeupFilterToSavedLook(recommendedFilter)
      : completedReport
        ? buildSavedMakeupLook(completedReport)
        : null;

    if (!baseSavedLook) {
      return;
    }

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
      navigation.replace(
        'ARFilter',
        getRecommendedFilterStencilRouteParams(recommendedFilter.id),
      );
      return;
    }

    navigation.replace('ExtractedMakeupLookAdjust');
  };

  if (!saveScreenData) {
    return (
      <DetailRouteChrome
        routeName="MakeupFilterSave"
        onBack={handleBack}>
        <ExtractionRouteRecovery
          description="완료된 메이크업 추출 결과가 있어야 이 룩을 저장할 수 있어요."
          onOpenReportList={() => navigation.replace('MakeupRecipeList')}
          onPrimaryAction={() => navigation.replace('ReferenceMakeupExtractionUpload')}
          primaryActionLabel="새로 추출하기"
          title="저장할 결과가 없어요"
        />
      </DetailRouteChrome>
    );
  }

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
      navigation.navigate(
        'ARFilter',
        getRecommendedFilterStencilRouteParams(selectedRecommendedMakeupFilterId),
      );
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
  const completedReport = getCompletedReferenceMakeupExtractionSnapshot();
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  if (!completedReport) {
    return (
      <DetailRouteChrome
        routeName="MakeupRecipeDetail"
        onBack={() => goBackToPreviousOrMainTab(navigation, 'ProfileTab')}>
        <ExtractionRouteRecovery
          description="완료된 메이크업 추출 결과가 있어야 레시피를 볼 수 있어요."
          onOpenReportList={() => navigation.replace('MakeupRecipeList')}
          onPrimaryAction={() => navigation.replace('ReferenceMakeupExtractionUpload')}
          primaryActionLabel="새로 추출하기"
          title="표시할 레시피가 없어요"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="MakeupRecipeDetail"
      onOpenDocumentList={() => navigation.navigate('MakeupRecipeList')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <MakeupRecipeDetailScreen
        onHeaderShareActionChange={handleHeaderShareActionChange}
        onSaveRecipe={() => navigation.navigate('MakeupRecipeSaveComplete')}
        photo={completedReport.photo}
      />
    </DetailRouteChrome>
  );
}
export function MakeupRecipeListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupRecipeList'>) {
  const {selectedReferenceMakeupPhoto, setSelectedReferenceMakeupPhoto} =
    useNavigationFlowState();
  const fallbackRecipes = useMemo(
    () =>
      selectedReferenceMakeupPhoto
        ? buildMakeupRecipeListItemsFromCompletedSession()
        : [],
    [selectedReferenceMakeupPhoto],
  );
  const [recipes, setRecipes] = useState<MakeupRecipeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const loadRecipes = React.useCallback(() => {
    setIsLoading(true);
    setLoadError('');

    void fetchReferenceMakeupExtractionReports()
      .then(reports => {
        const nextRecipes = buildMakeupRecipeListItemsFromReports(reports);
        setRecipes(nextRecipes.length > 0 ? nextRecipes : fallbackRecipes);
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
  }, [fallbackRecipes]);

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

  const handleDeleteRecipe = async (recipe: MakeupRecipeListItem) => {
    if (!recipe.reportId) {
      throw new Error('삭제할 메이크업 추출 보고서를 찾지 못했어요.');
    }

    await deleteReferenceMakeupExtractionReport(recipe.reportId);
    setRecipes(current => current.filter(item => item.id !== recipe.id));
    setSelectedReferenceMakeupPhoto(null);
  };

  return (
    <DetailRouteChrome
      routeName="MakeupRecipeList"
      onBack={() => goBackToPreviousOrMainTab(navigation, 'ProfileTab')}>
      <MakeupRecipeListScreen
        error={loadError}
        isLoading={isLoading}
        onDeleteRecipe={handleDeleteRecipe}
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
  const completedReport = getCompletedReferenceMakeupExtractionSnapshot();

  if (!completedReport) {
    return (
      <DetailRouteChrome
        routeName="MakeupRecipeSaveComplete"
        onBack={() => goBackToPreviousOrMainTab(navigation, 'ProfileTab')}>
        <ExtractionRouteRecovery
          description="완료된 메이크업 추출 결과가 없어 저장 완료 내용을 표시할 수 없어요."
          onOpenReportList={() => navigation.replace('MakeupRecipeList')}
          onPrimaryAction={() => navigation.replace('ReferenceMakeupExtractionUpload')}
          primaryActionLabel="새로 추출하기"
          title="저장된 레시피가 없어요"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <MakeupRecipeSaveCompleteScreen
      onBackToDetail={() => navigation.navigate('MakeupRecipeDetail')}
      onGoToProfile={() => navigateMainTab(navigation, 'ProfileTab')}
    />
  );
}

const extractionRecoveryStyles = StyleSheet.create({
  actionPressed: {
    opacity: 0.74,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    maxWidth: 320,
    width: '100%',
  },
  card: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 240,
    padding: spacing.xl,
  },
  description: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  secondaryAction: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
});
