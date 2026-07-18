import React from 'react';

import {
  MakeupCorrectionGuideOverlayScreen,
  MakeupCorrectionTipScreen,
  MakeupFeedbackAlbumUploadScreen,
  MakeupFeedbackGoalInputScreen,
  MakeupFeedbackLoadingScreen,
  MakeupFeedbackResultScreen,
  MakeupFeedbackResultsListScreen,
  type MakeupFeedbackPhotoSelection,
  type MakeupFeedbackResult,
} from '../../../features/makeup-feedback';
import {
  fetchMakeupFeedbackReport,
  fetchMakeupFeedbackReports,
} from '../../../features/makeup-feedback/services/makeupFeedbackService';
import {
  applyMakeupFeedbackJourneyContext,
  type MakeupFeedbackJourneyFlowContext,
} from '../../../features/makeup-feedback/services/makeupFeedbackJourneyContext';
import {notifyMakeupJourneyFeedbackCompleted} from '../../../features/makeup-journey';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {RoutePlaceholder} from '../../../shared/ui';
import {trackMakeupJourneyEvent} from '../../../shared/services/makeupJourneyAnalytics';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {
  goBackToPreviousOrMainTab,
  getMakeupJourneyDayResetState,
  getMakeupJourneySafeReturnResetState,
  getMakeupJourneyTabResetState,
  navigateMainTab,
  type RootScreenProps,
} from './routeUtils';

type HeaderShareAction = {
  cb: () => void;
};

function getMakeupFeedbackPhotoSourceRoute(selection: MakeupFeedbackPhotoSelection) {
  return selection.photoSource === 'gallery'
    ? 'MakeupFeedbackAlbumUpload'
    : 'MakeupFeedbackCapture';
}

function getMakeupFeedbackResultList(currentResult: MakeupFeedbackResult | null) {
  return currentResult ? [currentResult] : [];
}

function getMakeupFeedbackJourneyFlowContext(
  state: MakeupFeedbackJourneyFlowContext,
): MakeupFeedbackJourneyFlowContext {
  return state;
}

export function mapFaceCaptureResultToMakeupFeedbackPhotoSelection(
  result: FaceCaptureUploadResult,
): MakeupFeedbackPhotoSelection {
  return {
    cameraMetadata: result.cameraMetadata,
    contentType: result.contentType,
    fileName: result.fileName,
    imageHeight: result.height,
    imageWidth: result.width,
    imageUri: result.imageUri,
    photoSource: result.source === 'gallery' ? 'gallery' : 'camera',
  };
}

export function MakeupFeedbackCaptureRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackCapture'>) {
  const {
    clearMakeupFeedbackFlowContext,
    makeupFeedbackEntryDate,
    makeupFeedbackFlowOrigin,
    makeupFeedbackInheritedGoalContext,
    makeupFeedbackKind,
    makeupFeedbackParentReportId,
    makeupFeedbackParentScore,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  } = useNavigationFlowState();
  const journeyContext = getMakeupFeedbackJourneyFlowContext({
    entryDate: makeupFeedbackEntryDate,
    feedbackKind: makeupFeedbackKind,
    inheritedGoalContext: makeupFeedbackInheritedGoalContext,
    origin: makeupFeedbackFlowOrigin,
    parentFeedbackReportId: makeupFeedbackParentReportId,
    parentScore: makeupFeedbackParentScore,
  });

  const handleCapture = React.useCallback(
    (result?: FaceCaptureUploadResult) => {
      if (!result) {
        return;
      }

      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(applyMakeupFeedbackJourneyContext(
        mapFaceCaptureResultToMakeupFeedbackPhotoSelection(result),
        journeyContext,
      ));
      navigation.replace('FaceCaptureConfirmation', {target: 'makeupFeedback'});
    },
    [journeyContext, navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  const handleClose = React.useCallback(() => {
    const returnEntryDate = journeyContext.entryDate;
    const shouldReturnToJourney = journeyContext.origin === 'journeyDay';

    clearMakeupFeedbackFlowContext();
    if (shouldReturnToJourney) {
      navigation.reset(getMakeupJourneyDayResetState(returnEntryDate));
      return;
    }
    navigateMainTab(navigation, 'HomeTab');
  }, [clearMakeupFeedbackFlowContext, journeyContext, navigation]);

  return (
    <CameraFaceCaptureScreen
      captureMode="face"
      captureType="makeup_feedback"
      onCapture={handleCapture}
      deferUpload
      imageQuality={1}
      onClose={handleClose}
    />
  );
}

export function MakeupFeedbackAlbumUploadRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackAlbumUpload'>) {
  const {
    clearMakeupFeedbackFlowContext,
    makeupFeedbackEntryDate,
    makeupFeedbackFlowOrigin,
    makeupFeedbackInheritedGoalContext,
    makeupFeedbackKind,
    makeupFeedbackParentReportId,
    makeupFeedbackParentScore,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  } = useNavigationFlowState();
  const journeyContext = getMakeupFeedbackJourneyFlowContext({
    entryDate: makeupFeedbackEntryDate,
    feedbackKind: makeupFeedbackKind,
    inheritedGoalContext: makeupFeedbackInheritedGoalContext,
    origin: makeupFeedbackFlowOrigin,
    parentFeedbackReportId: makeupFeedbackParentReportId,
    parentScore: makeupFeedbackParentScore,
  });

  const handleStartAnalysis = React.useCallback(
    (selection: MakeupFeedbackPhotoSelection) => {
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(
        applyMakeupFeedbackJourneyContext(selection, journeyContext),
      );
      navigation.replace('FaceCaptureConfirmation', {target: 'makeupFeedback'});
    },
    [journeyContext, navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  const handleBack = React.useCallback(() => {
    const returnEntryDate = journeyContext.entryDate;
    const shouldReturnToJourney = journeyContext.origin === 'journeyDay';

    clearMakeupFeedbackFlowContext();
    if (shouldReturnToJourney) {
      navigation.reset(getMakeupJourneyDayResetState(returnEntryDate));
      return;
    }
    navigateMainTab(navigation, 'HomeTab');
  }, [clearMakeupFeedbackFlowContext, journeyContext, navigation]);

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackAlbumUpload"
      onBack={handleBack}>
      <MakeupFeedbackAlbumUploadScreen onStartAnalysis={handleStartAnalysis} />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackGoalInputRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackGoalInput'>) {
  const {
    clearMakeupFeedbackFlowContext,
    makeupFeedbackEntryDate,
    makeupFeedbackFlowOrigin,
    selectedMakeupFeedbackPhoto,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  } = useNavigationFlowState();

  const handleCancel = React.useCallback(() => {
    const returnEntryDate = makeupFeedbackEntryDate;
    const shouldReturnToJourney = makeupFeedbackFlowOrigin === 'journeyDay';

    clearMakeupFeedbackFlowContext();
    if (shouldReturnToJourney) {
      navigation.reset(getMakeupJourneyDayResetState(returnEntryDate));
      return;
    }
    navigateMainTab(navigation, 'HomeTab');
  }, [
    clearMakeupFeedbackFlowContext,
    makeupFeedbackEntryDate,
    makeupFeedbackFlowOrigin,
    navigation,
  ]);

  const handleStartFeedback = React.useCallback(
    (selection: MakeupFeedbackPhotoSelection) => {
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(selection);
      navigation.replace('MakeupFeedbackLoading');
    },
    [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackGoalInput"
      onBack={() => navigation.replace(getMakeupFeedbackPhotoSourceRoute(selectedMakeupFeedbackPhoto))}
      onClose={handleCancel}>
      <MakeupFeedbackGoalInputScreen
        onStartFeedback={handleStartFeedback}
        selection={selectedMakeupFeedbackPhoto}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackLoadingRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackLoading'>) {
  const {
    beginMakeupFeedbackFlow,
    clearMakeupFeedbackFlowContext,
    makeupFeedbackEntryDate,
    makeupFeedbackFlowOrigin,
    makeupFeedbackInheritedGoalContext,
    makeupFeedbackKind,
    makeupFeedbackParentReportId,
    makeupFeedbackParentScore,
    selectedMakeupFeedbackPhoto,
    setMakeupFeedbackResult,
  } = useNavigationFlowState();
  const selectedMakeupFeedbackPhotoRef = React.useRef(
    selectedMakeupFeedbackPhoto,
  );
  const frozenMakeupFeedbackPhoto = selectedMakeupFeedbackPhotoRef.current;
  const flowContextRef = React.useRef<MakeupFeedbackJourneyFlowContext | null>(null);

  if (!flowContextRef.current) {
    flowContextRef.current = getMakeupFeedbackJourneyFlowContext({
      entryDate: makeupFeedbackEntryDate,
      feedbackKind: makeupFeedbackKind,
      inheritedGoalContext: makeupFeedbackInheritedGoalContext,
      origin: makeupFeedbackFlowOrigin,
      parentFeedbackReportId: makeupFeedbackParentReportId,
      parentScore: makeupFeedbackParentScore,
    });
  }
  const flowContext = flowContextRef.current;

  const handleBackToHome = React.useCallback(() => {
    clearMakeupFeedbackFlowContext();
    if (flowContext.origin === 'journeyDay') {
      navigation.reset(getMakeupJourneyDayResetState(flowContext.entryDate));
      return;
    }
    navigation.reset({
      index: 0,
      routes: [{name: 'MainTabs', params: {screen: 'HomeTab'}}],
    });
  }, [clearMakeupFeedbackFlowContext, flowContext, navigation]);
  const handleEditGoal = React.useCallback(() => {
    if (flowContext.feedbackKind === 'correction') {
      handleBackToHome();
      return;
    }
    beginMakeupFeedbackFlow(flowContext);
    navigation.replace('MakeupFeedbackGoalInput');
  }, [beginMakeupFeedbackFlow, flowContext, handleBackToHome, navigation]);

  const handleComplete = React.useCallback(
    (result: MakeupFeedbackResult) => {
      setMakeupFeedbackResult(result);
      notifyMakeupJourneyFeedbackCompleted(flowContext.entryDate);
      if (
        flowContext.feedbackKind === 'correction' &&
        flowContext.parentScore !== null
      ) {
        trackMakeupJourneyEvent({
          name: 'makeup_journey_correction_completed',
          properties: {scoreDelta: result.score - flowContext.parentScore},
        });
      }
      clearMakeupFeedbackFlowContext();
      if (!navigation.isFocused()) {
        return;
      }
      navigation.replace(
        'MakeupFeedbackResult',
        flowContext.origin === 'journeyDay'
          ? {
              entryDate: flowContext.entryDate,
              reportId: result.analysisId,
              returnTo: 'makeupJourney',
            }
          : {reportId: result.analysisId},
      );
    },
    [
      clearMakeupFeedbackFlowContext,
      flowContext,
      navigation,
      setMakeupFeedbackResult,
    ],
  );
  const handleError = React.useCallback(() => {
    clearMakeupFeedbackFlowContext();
  }, [clearMakeupFeedbackFlowContext]);
  const handleRetake = React.useCallback(() => {
    beginMakeupFeedbackFlow(flowContext);
    setMakeupFeedbackResult(null);
    navigation.replace('MakeupFeedbackCapture');
  }, [beginMakeupFeedbackFlow, flowContext, navigation, setMakeupFeedbackResult]);

  const handleChooseDifferentPhoto = React.useCallback(() => {
    beginMakeupFeedbackFlow(flowContext);
    setMakeupFeedbackResult(null);
    navigation.replace('MakeupFeedbackAlbumUpload');
  }, [beginMakeupFeedbackFlow, flowContext, navigation, setMakeupFeedbackResult]);



  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackLoading"
      onBack={handleBackToHome}>
      <MakeupFeedbackLoadingScreen
        onBack={handleEditGoal}
        onChooseDifferentPhoto={handleChooseDifferentPhoto}
        onError={handleError}
        onRetake={handleRetake}
        onComplete={handleComplete}
        selection={frozenMakeupFeedbackPhoto}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackResultsListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackResultsList'>) {
  const {makeupFeedbackResult, setMakeupFeedbackResult} = useNavigationFlowState();
  const initialResults = React.useMemo(
    () => getMakeupFeedbackResultList(makeupFeedbackResult),
    [makeupFeedbackResult],
  );
  const [results, setResults] = React.useState(initialResults);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const loadResults = React.useCallback(() => {
    setIsLoading(true);
    setLoadError('');

    void fetchMakeupFeedbackReports()
      .then(reports => {
        setResults(reports.length > 0 ? reports : initialResults);
      })
      .catch(error => {
        setLoadError(
          error instanceof Error
            ? error.message
            : '메이크업 피드백을 불러오지 못했어요.',
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [initialResults]);

  React.useEffect(() => {
    loadResults();
  }, [loadResults]);

  const handlePressResult = React.useCallback((result: MakeupFeedbackResult) => {
    setMakeupFeedbackResult(result);
    navigation.navigate('MakeupFeedbackResult', {reportId: result.analysisId});
  }, [navigation, setMakeupFeedbackResult]);

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackResultsList"
      onBack={() => goBackToPreviousOrMainTab(navigation, 'ProfileTab')}>
      <MakeupFeedbackResultsListScreen
        error={loadError}
        isLoading={isLoading}
        onRetry={loadResults}
        onPressResult={handlePressResult}
        results={results}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackResultRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupFeedbackResult'>) {
  const {makeupFeedbackResult, setMakeupFeedbackResult} = useNavigationFlowState();
  const reportId = route.params?.reportId;
  const shouldReturnToProfile = route.params?.returnTo === 'profile';
  const shouldReturnToJourney = route.params?.returnTo === 'makeupJourney';
  const reportIsLoaded =
    !reportId || makeupFeedbackResult?.analysisId === reportId;
  const [reportLoadError, setReportLoadError] = React.useState('');
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );
  const handleBackToProfile = React.useCallback(() => {
    goBackToPreviousOrMainTab(navigation, 'ProfileTab');
  }, [navigation]);
  const handleBackToJourney = React.useCallback(() => {
    navigation.reset(
      getMakeupJourneySafeReturnResetState(route.params?.entryDate),
    );
  }, [navigation, route.params?.entryDate]);
  const detailHeaderNavigationProps = shouldReturnToJourney
    ? {onBack: handleBackToJourney}
    : shouldReturnToProfile
    ? {onBack: handleBackToProfile}
    : {
        onOpenDocumentList: () =>
          navigation.navigate('MakeupFeedbackResultsList'),
      };

  React.useEffect(() => {
    if (!reportId || reportIsLoaded) {
      return;
    }

    let isMounted = true;
    setReportLoadError('');

    void fetchMakeupFeedbackReport(reportId)
      .then(result => {
        if (isMounted) {
          setMakeupFeedbackResult(result);
        }
      })
      .catch(error => {
        if (isMounted) {
          setReportLoadError(
            error instanceof Error
              ? error.message
              : '메이크업 피드백 보고서를 불러오지 못했어요.',
          );
        }
      });

    return () => {
      isMounted = false;
    };
  }, [reportId, reportIsLoaded, setMakeupFeedbackResult]);

  if (reportId && !reportIsLoaded) {
    return (
      <DetailRouteChrome
        {...detailHeaderNavigationProps}
        routeName="MakeupFeedbackResult"
        shareDisabled>
        <RoutePlaceholder
          description={
            reportLoadError || '완료된 메이크업 피드백 보고서를 불러오고 있어요.'
          }
          showHeader={false}
          title={reportLoadError ? '보고서를 열지 못했어요' : '보고서를 여는 중'}
        />
      </DetailRouteChrome>
    );
  }

  if (!makeupFeedbackResult) {
    return (
      <DetailRouteChrome
        {...detailHeaderNavigationProps}
        routeName="MakeupFeedbackResult"
        onShare={shareAction?.cb}
        shareDisabled>
        <RoutePlaceholder
          description="Start makeup feedback analysis first."
          showHeader={false}
          title="Makeup feedback"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      {...detailHeaderNavigationProps}
      routeName="MakeupFeedbackResult"
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <MakeupFeedbackResultScreen
        onHeaderShareActionChange={handleHeaderShareActionChange}
        result={makeupFeedbackResult}
      />
    </DetailRouteChrome>
  );
}

export function MakeupCorrectionGuideRouteScreen({navigation}: RootScreenProps<'MakeupCorrectionGuide'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();

  if (!makeupFeedbackResult) {
    return (
      <DetailRouteChrome
        routeName="MakeupCorrectionGuide"
        onBack={() => navigateMainTab(navigation, 'HomeTab')}>
        <RoutePlaceholder
          description="A makeup feedback result is required to show the guide."
          showHeader={false}
          title="Guide overlay"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome routeName="MakeupCorrectionGuide" onBack={() => navigation.goBack()}>
      <MakeupCorrectionGuideOverlayScreen result={makeupFeedbackResult} />
    </DetailRouteChrome>
  );
}

export function MakeupCorrectionTipRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupCorrectionTip'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();
  const point = makeupFeedbackResult?.points.find(item => item.id === route.params.pointId);

  if (!point) {
    return (
      <DetailRouteChrome
        routeName="MakeupCorrectionTip"
        onBack={() => navigateMainTab(navigation, 'HomeTab')}>
        <RoutePlaceholder
          description="The selected correction point was not found."
          showHeader={false}
          title="Correction tip"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome routeName="MakeupCorrectionTip" onBack={() => navigation.goBack()}>
      <MakeupCorrectionTipScreen onBack={() => navigation.goBack()} point={point} />
    </DetailRouteChrome>
  );
}
