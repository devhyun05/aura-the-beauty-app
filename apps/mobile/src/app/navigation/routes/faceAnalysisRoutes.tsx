import React from 'react';

import {
  createFaceAnalysisReportFromCapture,
  FaceAnalysisReportDetailScreen,
  FaceAnalysisReportsListScreen,
} from '../../../features/face-analysis';
import {FaceAnalysisLoadingScreen} from '../../../features/face-analysis/screens/FaceAnalysisLoadingScreen';
import {FaceCaptureScreen} from '../../../features/face-capture/screens/FaceCaptureScreen';
import {useAuthSession} from '../../../features/auth';
import {BackendApiError} from '../../../shared/services/backendApi';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

type HeaderShareAction = {
  cb: () => void;
};

const MAX_ANALYSIS_RETRY_COUNT = 2;

export function FaceCaptureRouteScreen({navigation}: RootScreenProps<'FaceCapture'>) {
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
    <FaceCaptureScreen
      onCapture={result => {
        if (result) {
          setSelectedFaceCapture(result);
        }

        navigation.navigate('FaceAnalysisLoading');
      }}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
    />
  );
}

export function FaceAnalysisLoadingRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisLoading'>) {
  const {
    selectedFaceCapture,
    setSelectedFaceAnalysisReport,
  } = useNavigationFlowState();
  const {clearSession} = useAuthSession();
  const [isAnalysisReady, setIsAnalysisReady] = React.useState(false);
  const [analysisRequestKey, setAnalysisRequestKey] = React.useState(0);
  const analysisRetryCountRef = React.useRef(0);

  React.useEffect(() => {
    analysisRetryCountRef.current = 0;
  }, [selectedFaceCapture?.mediaId, selectedFaceCapture?.photoCaptureId]);

  React.useEffect(() => {
    let isMounted = true;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

    setIsAnalysisReady(false);
    setSelectedFaceAnalysisReport(null);

    createFaceAnalysisReportFromCapture(selectedFaceCapture)
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
          error instanceof BackendApiError &&
          analysisRetryCountRef.current >= MAX_ANALYSIS_RETRY_COUNT
        ) {
          console.info('[aura:analysis] analysis-job:stop-retry', {
            code: error.code,
            details: error.details,
            status: error.status,
          });
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

  return (
    <DetailRouteChrome
      routeName="FaceAnalysisLoading"
      onBack={() => navigation.navigate('FaceCapture')}>
      <FaceAnalysisLoadingScreen
        capturedPhotoUri={selectedFaceCapture?.imageUri}
        isAnalysisReady={isAnalysisReady}
        onComplete={() => navigation.navigate('FaceAnalysisReportDetail')}
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportsListRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisReportsList'>) {
  return (
    <DetailRouteChrome
      routeName="FaceAnalysisReportsList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <FaceAnalysisReportsListScreen
        onPressReport={reportId =>
          navigation.navigate('FaceAnalysisReportDetail', {reportId})
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
  const {selectedFaceAnalysisReport, selectedFaceCapture} = useNavigationFlowState();
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  return (
    <DetailRouteChrome
      routeName="FaceAnalysisReportDetail"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
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
      />
    </DetailRouteChrome>
  );
}
