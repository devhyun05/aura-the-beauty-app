import React from 'react';

import {
  createFaceAnalysisReportFromCapture,
  FaceAnalysisIntroScreen,
  FaceAnalysisReportDetailScreen,
  FaceAnalysisReportsListScreen,
} from '../../../features/face-analysis';
import {FaceAnalysisLoadingScreen} from '../../../features/face-analysis/screens/FaceAnalysisLoadingScreen';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {buildFaceVerticalThirdsAnalysisPayload} from '../../../features/face-ratio/services/faceVerticalThirdsAiPayload';
import {analyzeFaceVerticalThirds} from '../../../features/face-ratio/services/faceVerticalThirdsService';
import type {FaceVerticalThirdsResult} from '../../../features/face-ratio/types';
import {useAuthSession} from '../../../features/auth';
import {FaceCaptureTutorialSheet} from '../../../features/onboarding';
import {BackendApiError} from '../../../shared/services/backendApi';
import {colors} from '../../../shared/theme';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

type HeaderShareAction = {
  cb: () => void;
};

const MAX_ANALYSIS_RETRY_COUNT = 2;
// 세로 비율 온디바이스 분석이 이 시간 안에 끝나지 않으면 비율 없이 보고서 생성을 진행한다.
const VERTICAL_THIRDS_WAIT_TIMEOUT_MS = 8000;
const FACE_ANALYSIS_LOADING_ERROR_MESSAGE =
  '분석 결과를 만드는 데 시간이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.';
const NON_RETRYABLE_ANALYSIS_ERROR_CODES = new Set([
  'ANALYSIS_JOB_FAILED',
  'ANALYSIS_REPORT_TEXT_REQUIRED',
  'ANALYSIS_REPORT_TIMEOUT',
  'RECOMMENDED_MAKEUP_IMAGES_REQUIRED',
]);

export function FaceAnalysisIntroRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisIntro'>) {
  const [isGuideVisible, setIsGuideVisible] = React.useState(false);

  return (
    <>
      <DetailRouteChrome
        routeName="FaceAnalysisIntro"
        onBack={() => navigateMainTab(navigation, 'HomeTab')}>
        <FaceAnalysisIntroScreen onStartAnalysisGuide={() => setIsGuideVisible(true)} />
      </DetailRouteChrome>
      <FaceCaptureTutorialSheet
        isVisible={isGuideVisible}
        onDismiss={() => setIsGuideVisible(false)}
        onStartCapture={() => {
          setIsGuideVisible(false);
          navigation.navigate('FaceCapture');
        }}
      />
    </>
  );
}

function shouldRetryAnalysisError(error: unknown): boolean {
  if (!(error instanceof BackendApiError) || !error.code) {
    return true;
  }

  return !NON_RETRYABLE_ANALYSIS_ERROR_CODES.has(error.code);
}

export function shouldCreateFaceAnalysisReportFromCapture(
  capture: FaceCaptureUploadResult | null,
): capture is FaceCaptureUploadResult {
  return capture !== null;
}

export function FaceCaptureRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceCapture'>) {
  const {setSelectedFaceCapture} = useNavigationFlowState();
  const {getAuthToken, isRestoringSession} = useAuthSession();

  React.useEffect(() => {
    if (!isRestoringSession && !getAuthToken()) {
      navigation.replace('Login');
    }
  }, [getAuthToken, isRestoringSession, navigation]);

  if (isRestoringSession || !getAuthToken()) {
    return null;
  }

  return (
    <CameraFaceCaptureScreen
      autoOpenGallery={route.params?.initialSource === 'gallery'}
      captureMode="face"
      captureType="face_analysis"
      onCapture={result => {
        if (!result) {
          return;
        }

        setSelectedFaceCapture(result);
        navigation.replace(
          'FaceCaptureConfirmation',
          route.params?.afterAnalysisRoute
            ? {afterAnalysisRoute: route.params.afterAnalysisRoute, target: 'faceAnalysis'}
            : {target: 'faceAnalysis'},
        );
      }}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
    />
  );
}

export function FaceAnalysisLoadingRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisLoading'>) {
  const {
    selectedFaceCapture,
    setSelectedFaceAnalysisReport,
    setSelectedFaceVerticalThirds,
  } = useNavigationFlowState();
  const {clearSession} = useAuthSession();
  const [isAnalysisReady, setIsAnalysisReady] = React.useState(false);
  const [analysisErrorMessage, setAnalysisErrorMessage] = React.useState<string | null>(null);
  const [analysisRequestKey, setAnalysisRequestKey] = React.useState(0);
  const analysisRetryCountRef = React.useRef(0);
  const verticalThirdsPromiseRef =
    React.useRef<Promise<FaceVerticalThirdsResult | null> | null>(null);

  React.useEffect(() => {
    analysisRetryCountRef.current = 0;
  }, [selectedFaceCapture?.mediaId, selectedFaceCapture?.photoCaptureId]);

  // 얼굴 세로 비율은 캡처당 1회만 온디바이스로 계산한다.
  // 보고서 재시도(analysisRequestKey)와 분리해 재계산을 막고,
  // 실패는 null로 격리해 보고서 생성 흐름에 영향을 주지 않는다.
  React.useEffect(() => {
    setSelectedFaceVerticalThirds(null);
    verticalThirdsPromiseRef.current = null;

    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return undefined;
    }

    let isMounted = true;
    const captureId = selectedFaceCapture.photoCaptureId;

    verticalThirdsPromiseRef.current = analyzeFaceVerticalThirds({
      captureId,
      createdAt: new Date().toISOString(),
      imageUri: selectedFaceCapture.imageUri,
      semanticMattes: selectedFaceCapture.semanticMattes,
      sessionId: captureId,
    })
      .then(result => {
        if (isMounted) {
          setSelectedFaceVerticalThirds(result);
        }

        return result;
      })
      .catch(error => {
        console.info('[aura:face-ratio] analysis:error', {
          message: error instanceof Error ? error.message : String(error),
        });

        return null;
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFaceCapture, setSelectedFaceVerticalThirds]);

  React.useEffect(() => {
    setIsAnalysisReady(false);
    setAnalysisErrorMessage(null);
    setSelectedFaceAnalysisReport(null);

    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return undefined;
    }

    let isMounted = true;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const waitForVerticalThirds = Promise.race([
      verticalThirdsPromiseRef.current ?? Promise.resolve(null),
      new Promise<null>(resolve => {
        setTimeout(() => resolve(null), VERTICAL_THIRDS_WAIT_TIMEOUT_MS);
      }),
    ]);

    waitForVerticalThirds
      .then(verticalThirds =>
        createFaceAnalysisReportFromCapture(
          selectedFaceCapture,
          buildFaceVerticalThirdsAnalysisPayload(verticalThirds),
        ),
      )
      .then(report => {
        if (!isMounted) {
          return;
        }

        setSelectedFaceAnalysisReport(report);
        analysisRetryCountRef.current = 0;
        setIsAnalysisReady(true);
      })
      .catch(error => {
        if (!isMounted) {
          return;
        }

        if (
          error instanceof BackendApiError &&
          (error.status === 401 ||
            error.code === 'INVALID_TOKEN' ||
            error.code === 'UNAUTHORIZED')
        ) {
          void clearSession().finally(() => {
            if (isMounted) {
              navigation.reset({index: 0, routes: [{name: 'Login'}]});
            }
          });
          return;
        }

        console.info('[aura:analysis] analysis-job:error', {
          code: error instanceof BackendApiError ? error.code : undefined,
          details: error instanceof BackendApiError ? error.details : undefined,
          message: error instanceof Error ? error.message : String(error),
          retryCount: analysisRetryCountRef.current,
          status: error instanceof BackendApiError ? error.status : undefined,
        });

        if (
          !shouldRetryAnalysisError(error) ||
          analysisRetryCountRef.current >= MAX_ANALYSIS_RETRY_COUNT
        ) {
          console.info('[aura:analysis] analysis-job:stop-retry', {
            code: error instanceof BackendApiError ? error.code : undefined,
            details: error instanceof BackendApiError ? error.details : undefined,
            message: error instanceof Error ? error.message : String(error),
            status: error instanceof BackendApiError ? error.status : undefined,
          });
          setAnalysisErrorMessage(
            error instanceof Error ? error.message : FACE_ANALYSIS_LOADING_ERROR_MESSAGE,
          );
          return;
        }

        analysisRetryCountRef.current += 1;
        retryTimeoutId = setTimeout(() => {
          setAnalysisRequestKey(currentKey => currentKey + 1);
        }, 1800);
      });

    return () => {
      isMounted = false;

      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [
    analysisRequestKey,
    clearSession,
    navigation,
    selectedFaceCapture,
    setSelectedFaceAnalysisReport,
  ]);

  const handleRetryAnalysis = React.useCallback(() => {
    analysisRetryCountRef.current = 0;
    setAnalysisErrorMessage(null);
    setIsAnalysisReady(false);
    setAnalysisRequestKey(currentKey => currentKey + 1);
  }, []);
  const handleAnalysisComplete = React.useCallback(() => {
    if (route.params?.afterAnalysisRoute === 'ProductRecommendation') {
      navigation.navigate('ProductRecommendation');
      return;
    }

    navigation.navigate('FaceAnalysisReportDetail');
  }, [navigation, route.params?.afterAnalysisRoute]);

  return (
    <DetailRouteChrome
      routeName="FaceAnalysisLoading"
      onBack={() => navigation.navigate('FaceCapture')}>
      <FaceAnalysisLoadingScreen
        analysisErrorMessage={analysisErrorMessage}
        capturedPhotoUri={selectedFaceCapture?.imageUri}
        isAnalysisReady={isAnalysisReady}
        onBack={() => navigation.navigate('FaceCapture')}
        onComplete={handleAnalysisComplete}
        onRetry={handleRetryAnalysis}
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportsListRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisReportsList'>) {
  return (
    <DetailRouteChrome
      reserveOverlayHeaderSpace={false}
      routeName="FaceAnalysisReportsList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <FaceAnalysisReportsListScreen
        onPressReport={reportId =>
          navigation.navigate('FaceAnalysisReportDetail', {reportId})
        }
        onPressProducts={reportId =>
          navigation.navigate('ProductRecommendation', {reportId})
        }
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisReportDetail'>) {
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const {selectedFaceAnalysisReport, selectedFaceCapture, selectedFaceVerticalThirds} =
    useNavigationFlowState();
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  return (
    <DetailRouteChrome
      backgroundColor={colors.surfaceMuted}
      headerMode="overlay"
      reserveOverlayHeaderSpace={false}
      routeName="FaceAnalysisReportDetail"
      onOpenDocumentList={() => navigation.navigate('FaceAnalysisReportsList')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <FaceAnalysisReportDetailScreen
        analysisReport={selectedFaceAnalysisReport}
        capturedPhotoUri={selectedFaceCapture?.imageUri}
        onCreateARFilter={() =>
          navigation.navigate('MakeupFilterEdit', {backRoute: 'FaceAnalysisReportDetail'})
        }
        onHeaderShareActionChange={handleHeaderShareActionChange}
        reportId={route.params?.reportId ?? null}
        verticalThirds={route.params?.reportId ? null : selectedFaceVerticalThirds}
      />
    </DetailRouteChrome>
  );
}
