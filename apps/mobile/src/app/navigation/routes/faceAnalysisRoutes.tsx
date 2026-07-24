import React from 'react';
import {Pressable, StyleSheet, Text, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {
  createFaceAnalysisReportFromCapture,
  FaceAnalysisReportsListScreen,
} from '../../../features/face-analysis';
import {
  deleteFaceAnalysisReport,
  logFaceAnalysisDebug,
  recordFaceAnalysisPreviewTiming,
  type FaceAnalysisAnchorPreview,
} from '../../../shared/services/faceAnalysisService';
import {FaceAnalysisReportPreviewScreen} from '../../../features/face-report/screens/FaceAnalysisReportPreviewScreen';
import {
  summarizeVerticalThirds,
} from '../../../features/face-report/services/fromFaceAnalysisReport';
import type {MinimumFaceReportPreview} from '../../../features/face-report/services/minimumFaceReport';
import {shouldEnableFaceReportBackGesture} from '../../../features/face-report/services/goldenMaskInteraction';
import {FaceAnalysisLoadingScreen} from '../../../features/face-analysis/screens/FaceAnalysisLoadingScreen';
import {Face3DMeasurementScreen} from '../../../features/face-analysis/screens/Face3DMeasurementScreen';
import {isUnityMakeupNativeViewSupported} from '../../../features/ar/components/UnityMakeupNativeView';
import {
  ensureUnityMakeupRunningForStillAnalysis,
  hideUnityMakeupView,
  releaseUnityMakeupHiddenRunLease,
  setUnityMakeupPlayerPaused,
  setUnityMakeupSessionPaused,
} from '../../../features/ar/services/unityMakeupBridge';
import {evaluateFace3DEntryEligibility} from '../../../features/face-3d/services/face3DEntryEligibility';
import {isFace3DProfileAnalysisEligible} from '../../../features/face-3d/services/face3DContract';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import {UnifiedFaceCaptureScreen} from '../../../features/face-capture/screens/UnifiedFaceCaptureScreen';
import {
  buildUnifiedFaceCaptureRequest,
  type UnifiedFaceCaptureCompletedEvent,
} from '../../../features/face-capture/services/unifiedFaceCaptureContract';
import {
  uploadFaceCaptureImage,
  type FaceCaptureUploadResult,
} from '../../../features/face-capture/services/faceCaptureUploadService';
import {isUnifiedFaceCaptureEnabled} from '../../../features/face-capture/services/unifiedFaceCaptureMode';
import {
  mapUnifiedHairlineToVerticalThirds,
  shouldUseUnifiedFaceCaptureRoute,
} from '../../../features/face-capture/services/unifiedFaceCaptureNavigation';
import {deleteUnifiedFaceCaptureTempImage} from '../../../features/face-capture/services/unifiedFaceCaptureTempImageCleanup';
import {
  deleteGoldenMaskPendingArtifact,
  flushPendingGoldenMaskUploads,
  queueGoldenMaskUploadForReport,
} from '../../../features/face-capture/services/goldenMaskUploadService';
import {
  buildLocalGoldenMaskDescriptor,
  preloadGoldenMaskFromCapture,
  type GoldenMaskPreparedResult,
} from '../../../features/face-report/services/goldenMaskPreloadService';
import {derivePersonalColorCorrectionStatus} from '../../../features/face-analysis/services/faceAnalysisMeasurements';
import {
  FACE_REPORT_OPEN_DEADLINE_MS,
  FACE_REPORT_OPEN_MINIMUM_MS,
  resolveFaceReportOpenDecision,
} from '../../../features/face-analysis/services/faceAnalysisReportGate';
import {raceWithNullTimeout} from '../../../features/face-analysis/services/stillAnalysisWait';
import {buildFaceGeometryAnalysisPayload} from '../../../features/face-geometry/services/faceGeometryAiPayload';
import {analyzeFaceGeometry2d} from '../../../features/face-geometry/services/faceGeometryService';
import type {FaceGeometryResult} from '../../../features/face-geometry/types';
import {FaceGeometryDebugScreen} from '../../../features/face-geometry/screens/FaceGeometryDebugScreen';
import {buildFaceVerticalThirdsAnalysisPayload} from '../../../features/face-ratio/services/faceVerticalThirdsAiPayload';
import {analyzeFaceVerticalThirds} from '../../../features/face-ratio/services/faceVerticalThirdsService';
import type {
  FaceVerticalThirdsInput,
  FaceVerticalThirdsResult,
} from '../../../features/face-ratio/types';
import {MakeupExtractionActionSheet} from '../../../features/home/components/MakeupExtractionActionSheet';
import {MakeupFeedbackActionSheet} from '../../../features/home/components/MakeupFeedbackActionSheet';
import {
  analyzePersonalColorCapture,
  type PersonalColorAnalysisOutcome,
} from '../../../features/personal-color/services/personalColorService';
import {getMeasuredPersonalColorSummary} from '../../../features/personal-color/services/personalColorCore/presentation';
import {useAuthSession} from '../../../features/auth';
import {BackendApiError} from '../../../shared/services/backendApi';
import {trackMakeupJourneyEvent} from '../../../shared/services/makeupJourneyAnalytics';
import {colors, spacing} from '../../../shared/theme';
import {isMakeupJourneyEnabled} from '../../../shared/config/featureFlags';
import {
  AppFooter,
  FLOATING_ACTION_HOST_EXTRA_HEIGHT,
  FloatingActionMenu,
  type FloatingActionId,
  type FooterTabKey,
} from '../../../shared/ui';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../../shared/ui/AppFooter';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {
  goBackToPreviousOrMainTab,
  navigateMainTab,
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

const loadMakeupPhotoPicker = () =>
  require('../../../features/home/services/makeupPhotoPicker') as typeof import('../../../features/home/services/makeupPhotoPicker');

const MAX_ANALYSIS_RETRY_COUNT = 2;
// 온디바이스 정지영상 분석(세로비율 등)이 이 시간 안에 끝나지 않으면 해당 축 없이
// 보고서 생성을 진행한다. ⚠️ 예산 연동: ensureUnityMakeupRunningForStillAnalysis
// 의 ready 폴링 상한 4200ms + requestFaceLandmarks 기본 3500ms = 7700ms < 8000ms.
// 셋 중 하나를 바꾸면 함께 조정해야 한다.
const STILL_ANALYSIS_WAIT_TIMEOUT_MS = 8000;
const FACE_ANALYSIS_LOADING_ERROR_MESSAGE =
  '분석 결과를 만드는 데 시간이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.';
const NON_RETRYABLE_ANALYSIS_ERROR_CODES = new Set([
  'FACE_ANALYSIS_AI_INCOMPLETE',
  'FACE_ANALYSIS_RESULT_INCOMPLETE',
  'ANALYSIS_API_UNAVAILABLE',
  'ANALYSIS_JOB_FAILED',
  'ANALYSIS_REPORT_TEXT_REQUIRED',
  'ANALYSIS_REPORT_TIMEOUT',
  // 화면 이탈로 폴링을 의도적으로 중단한 경우 — 재시도 대상이 아니다.
  'ANALYSIS_WAIT_ABORTED',
]);

type StillAnalysisCapture = Pick<
  FaceCaptureUploadResult,
  'cameraMetadata' | 'imageUri' | 'photoCaptureId' | 'semanticMattes'
>;

export function resolveStillAnalysisCapture(
  pendingCapture: UnifiedFaceCaptureCompletedEvent | null,
  uploadedCapture: FaceCaptureUploadResult | null,
): StillAnalysisCapture | null {
  if (!pendingCapture) {
    return uploadedCapture;
  }

  return {
    cameraMetadata: pendingCapture.cameraMetadata
      ? {
          exposureDurationMs: pendingCapture.cameraMetadata.exposureDurationMs,
          iso: pendingCapture.cameraMetadata.iso,
        }
      : null,
    imageUri: pendingCapture.image.uri,
    photoCaptureId: pendingCapture.captureId,
    // Unified capture persists an ARFrame as a plain JPEG, so it cannot contain
    // Apple auxiliary semantic mattes. Its synchronized `hairline` result is the
    // authoritative source; do not run the impossible embedded-matte fallback.
    semanticMattes: {hair: false, requested: false, skin: false},
  };
}

export function getFaceAnalysisReportFooterReservedHeight(
  footerBottomInset: number,
): number {
  return APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + footerBottomInset;
}

export function getFaceAnalysisReportFooterHostHeight(
  windowHeight: number,
  footerBottomInset: number,
): number {
  return Math.max(
    windowHeight,
    getFaceAnalysisReportFooterReservedHeight(footerBottomInset) +
      FLOATING_ACTION_HOST_EXTRA_HEIGHT,
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
  const {
    beginUnifiedFaceCapture,
    commitUnifiedFaceCapture,
    invalidateUnifiedFaceCapture,
    setSelectedFace3DProfile,
    setSelectedFaceCapture,
    setSelectedFaceCaptureGreenlight,
    unifiedFaceCaptureFlow,
  } = useNavigationFlowState();
  const {getAuthToken, isRestoringSession} = useAuthSession();
  const unifiedCaptureRequest = React.useMemo(
    () =>
      buildUnifiedFaceCaptureRequest({
        retryAttemptCount: unifiedFaceCaptureFlow.retryAttemptCount,
      }),
    [unifiedFaceCaptureFlow.retryAttemptCount],
  );

  React.useEffect(() => {
    if (!isRestoringSession && !getAuthToken()) {
      navigation.replace('Login');
    }
  }, [getAuthToken, isRestoringSession, navigation]);

  if (isRestoringSession || !getAuthToken()) {
    return null;
  }

  // 통합 촬영이 실패해도 레거시 2단계 촬영으로 넘어가지 않는다(촬영 1회 경로만).
  // 실패 시 홈으로 보내 사용자가 통합 촬영을 다시 시작하게 한다. 갤러리·Unity
  // 미지원 기기는 여기와 무관하게 처음부터 레거시로 간다(아래 조건).
  const shouldUseUnifiedCapture = shouldUseUnifiedFaceCaptureRoute({
    featureEnabled: isUnifiedFaceCaptureEnabled(),
    forceLegacyCapture: false,
    initialSource: route.params?.initialSource,
    nativeViewSupported: isUnityMakeupNativeViewSupported(),
  });

  if (shouldUseUnifiedCapture) {
    return (
      <UnifiedFaceCaptureScreen
        onCancel={() => {
          invalidateUnifiedFaceCapture({resetRetryAttempt: true});
          goBackToPreviousOrMainTab(navigation, 'HomeTab');
        }}
        onCaptureCommitted={commitUnifiedFaceCapture}
        onCaptureReadyForProcessing={(result, loadingStartedAtMs) => {
          navigation.replace('FaceAnalysisLoading', {
            ...(route.params?.afterAnalysisRoute
              ? {afterAnalysisRoute: route.params.afterAnalysisRoute}
              : {}),
            loadingStartedAtMs,
            pendingUnifiedCapture: result,
          });
          return true;
        }}
        onFallback={() => {
          // 통합 촬영 실패 시 레거시 2단계 촬영으로 폴백하지 않는다(촬영 1회 경로만).
          // 홈으로 돌려보내 사용자가 통합 촬영을 다시 시작하게 한다. 실패 사유는
          // [aura:unified-face-capture] fallback-to-legacy 로그로 남는다.
          invalidateUnifiedFaceCapture({resetRetryAttempt: true});
          goBackToPreviousOrMainTab(navigation, 'HomeTab');
        }}
        onRequestStarted={beginUnifiedFaceCapture}
        request={unifiedCaptureRequest}
      />
    );
  }

  return (
    <CameraFaceCaptureScreen
      autoOpenGallery={route.params?.initialSource === 'gallery'}
      // 확인 화면 뒤 Face3D 측정이 Unity ARKit으로 전면 카메라를 즉시 인수한다.
      // AVCaptureSession stopRunning 완료를 확인한 뒤에만 onCapture로 진행해
      // 카메라 소유권 경합을 막는다(랩과 동일 패턴).
      awaitCameraReleaseBeforeComplete
      captureMode="face"
      captureType="face_analysis"
      onCapture={(result, greenlightReport) => {
        if (!result) {
          return;
        }

        invalidateUnifiedFaceCapture({resetRetryAttempt: true});
        setSelectedFaceCapture(result);
        // Face3D 측정 진입 자격 판정용(카메라 촬영 + 그린라이트 3종 충족 여부).
        setSelectedFaceCaptureGreenlight(greenlightReport ?? null);
        // 이전 세션의 3D 프로필이 새 사진에 붙지 않도록 촬영 시점에 반드시 비운다.
        setSelectedFace3DProfile(null);
        navigation.replace(
          'FaceCaptureConfirmation',
          route.params?.afterAnalysisRoute
            ? {afterAnalysisRoute: route.params.afterAnalysisRoute, target: 'faceAnalysis'}
            : {target: 'faceAnalysis'},
        );
      }}
      onClose={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}
    />
  );
}

// 사진 확인 뒤 ARKit 3D 자동 측정 단계(셔터 없음, 셔터 1회 UX).
// 자격 미달(갤러리/그린라이트 미충족)이나 미지원 기기는 사용자에게 보이기 전에
// 즉시 로딩으로 넘어가고, 측정 실패도 보고서 생성을 막지 않는다(null 유지).
export function Face3DMeasurementRouteScreen({
  navigation,
  route,
}: RootScreenProps<'Face3DMeasurement'>) {
  const {
    selectedFaceCapture,
    selectedFaceCaptureGreenlight,
    setSelectedFace3DProfile,
  } = useNavigationFlowState();

  const goToLoading = React.useCallback(() => {
    // afterAnalysisRoute(ProductRecommendation 연속 흐름)를 그대로 이어 전달한다.
    navigation.replace(
      'FaceAnalysisLoading',
      route.params?.afterAnalysisRoute
        ? {afterAnalysisRoute: route.params.afterAnalysisRoute}
        : undefined,
    );
  }, [navigation, route.params?.afterAnalysisRoute]);

  const shouldMeasure = React.useMemo(() => {
    if (!selectedFaceCapture || !isUnityMakeupNativeViewSupported()) {
      return false;
    }

    return evaluateFace3DEntryEligibility({
      greenlightReport: selectedFaceCaptureGreenlight ?? undefined,
      source: selectedFaceCapture.source,
    }).eligible;
  }, [selectedFaceCapture, selectedFaceCaptureGreenlight]);

  React.useEffect(() => {
    if (!shouldMeasure) {
      setSelectedFace3DProfile(null);
      goToLoading();
    }
  }, [goToLoading, setSelectedFace3DProfile, shouldMeasure]);

  if (!shouldMeasure) {
    return null;
  }

  return (
    <Face3DMeasurementScreen
      onFinish={profile => {
        setSelectedFace3DProfile(profile);
        goToLoading();
      }}
    />
  );
}

export function FaceAnalysisLoadingRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisLoading'>) {
  const {
    commitUnifiedFaceCapture,
    invalidateUnifiedFaceCapture,
    selectedFace3DProfile,
    selectedFaceCapture,
    selectedFaceVerticalThirds,
    selectedPersonalColor,
    setSelectedFaceAnalysisReport,
    setSelectedFaceCapture,
    setSelectedFaceGeometry2d,
    setSelectedFaceVerticalThirds,
    setSelectedPersonalColor,
    setSelectedPersonalColorCorrection,
    unifiedFaceCaptureFlow,
  } = useNavigationFlowState();
  const {clearSession, session} = useAuthSession();
  const [isAnalysisReady, setIsAnalysisReady] = React.useState(false);
  const [anchorPreview, setAnchorPreview] =
    React.useState<FaceAnalysisAnchorPreview | null>(null);
  const [perceptionReportReady, setPerceptionReportReady] =
    React.useState(false);
  const [reportOpenGate, setReportOpenGate] = React.useState<
    'waiting' | 'preferred' | 'deadline'
  >('waiting');
  const [analysisErrorMessage, setAnalysisErrorMessage] = React.useState<string | null>(null);
  const [analysisRequestKey, setAnalysisRequestKey] = React.useState(0);
  const [uploadRequestKey, setUploadRequestKey] = React.useState(0);
  const [progressAttempt, setProgressAttempt] = React.useState(() => ({
    key: 0,
    startedAtMs: route.params?.loadingStartedAtMs ?? Date.now(),
  }));
  const analysisRetryCountRef = React.useRef(0);
  const pendingUploadPromiseRef = React.useRef<Promise<void> | null>(null);
  const pendingUnifiedCapture = route.params?.pendingUnifiedCapture ?? null;
  const [goldenMaskPreloadStatus, setGoldenMaskPreloadStatus] = React.useState<
    'not-required' | 'pending' | 'ready' | 'failed'
  >(pendingUnifiedCapture?.goldenMask ? 'pending' : 'not-required');
  const [preparedGoldenMask, setPreparedGoldenMask] = React.useState<{
    descriptor: ReturnType<typeof buildLocalGoldenMaskDescriptor>;
    reportId: string;
  } | null>(null);
  const pendingStillAnalysisCapture =
    React.useMemo<StillAnalysisCapture | null>(
      () => resolveStillAnalysisCapture(pendingUnifiedCapture, null),
      [pendingUnifiedCapture],
    );
  // 통합 촬영은 업로드 전 로컬 이미지로 정지영상 분석을 시작한다. 업로드가
  // 커밋되어 selectedFaceCapture가 바뀌어도 pending 객체를 유지해 재분석하지 않는다.
  const stillAnalysisCapture =
    pendingStillAnalysisCapture ?? selectedFaceCapture;
  const stillAnalysisHairline = pendingUnifiedCapture
    ? pendingUnifiedCapture.hairline
    : unifiedFaceCaptureFlow.committedCapture?.result.hairline;
  const analysisAttemptRef = React.useRef<{
    attemptId: string;
    captureKey: string;
    startedAt: number;
  } | null>(null);
  const minimumReportLoggedRef = React.useRef(false);
  const minimumReportPreviewRef =
    React.useRef<MinimumFaceReportPreview | null>(null);
  const fullReportLoggedRef = React.useRef(false);
  const completionRouteHandledRef = React.useRef(false);
  const goldenMaskQueueLifecyclePromiseRef =
    React.useRef<Promise<unknown> | null>(null);
  const goldenMaskPreloadPromiseRef =
    React.useRef<Promise<GoldenMaskPreparedResult> | null>(null);
  const preparedGoldenMaskRef = React.useRef(preparedGoldenMask);
  const goldenMaskPendingArtifactRef = React.useRef(
    pendingUnifiedCapture?.goldenMask ?? null,
  );
  const verticalThirdsPromiseRef =
    React.useRef<Promise<FaceVerticalThirdsResult | null> | null>(null);
  const verticalThirdsCaptureIdRef = React.useRef<string | null>(null);
  // 보고서 POST 가 대기하는 2D 기하 promise — POST deps 에 state 를 넣으면
  // 효과 재실행으로 이중 POST 가 나므로 반드시 ref 로만 전달한다.
  const faceGeometry2dPromiseRef =
    React.useRef<Promise<FaceGeometryResult | null> | null>(null);
  const faceGeometry2dCaptureIdRef = React.useRef<string | null>(null);
  // Unity still-analysis lease: 진입 시 resume+ready 를 보장하는 promise.
  // 아래 정지영상 분석 효과들이 이 promise 를 체인해 시작 순서를 보장한다.
  const stillAnalysisReadyPromiseRef = React.useRef<Promise<boolean> | null>(null);
  const stillAnalysisLeaseIdRef = React.useRef<string | null>(null);
  // 퍼스널 컬러 outcome 전달 + end-lease 게이트 겸용. 보고서 POST 가 이 ref 로
  // outcome(보정 후 결과 포함)을 받아 measurements·measuredPersonalColor 를 싣는다.
  const personalColorOutcomePromiseRef =
    React.useRef<Promise<PersonalColorAnalysisOutcome | null> | null>(null);
  const personalColorCaptureIdRef = React.useRef<string | null>(null);
  const deviceAnalysisLoggedCaptureIdRef = React.useRef<string | null>(null);

  const logAttempt = React.useCallback(
    (event: string, payload: Record<string, unknown> = {}) => {
      const attempt = analysisAttemptRef.current;
      if (!attempt) {
        return;
      }
      logFaceAnalysisDebug(event, {
        attemptId: attempt.attemptId,
        elapsedMs: Date.now() - attempt.startedAt,
        ...payload,
      });
    },
    [],
  );

  React.useEffect(() => {
    const captureKey = stillAnalysisCapture?.photoCaptureId;
    if (!captureKey) {
      analysisAttemptRef.current = null;
      minimumReportLoggedRef.current = false;
      minimumReportPreviewRef.current = null;
      fullReportLoggedRef.current = false;
      completionRouteHandledRef.current = false;
      goldenMaskPreloadPromiseRef.current = null;
      preparedGoldenMaskRef.current = null;
      setPreparedGoldenMask(null);
      setGoldenMaskPreloadStatus('not-required');
      return;
    }
    if (analysisAttemptRef.current?.captureKey === captureKey) {
      return;
    }

    analysisAttemptRef.current = {
      attemptId: `face-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      captureKey,
      startedAt: Date.now(),
    };
    minimumReportLoggedRef.current = false;
    minimumReportPreviewRef.current = null;
    fullReportLoggedRef.current = false;
    completionRouteHandledRef.current = false;
    setPerceptionReportReady(false);
    setReportOpenGate('waiting');
    goldenMaskPreloadPromiseRef.current = null;
    preparedGoldenMaskRef.current = null;
    setPreparedGoldenMask(null);
    setGoldenMaskPreloadStatus(
      pendingUnifiedCapture?.goldenMask ? 'pending' : 'not-required',
    );
    logAttempt('capture-preparation:start', {
      hasPendingUpload: Boolean(pendingStillAnalysisCapture),
    });
  }, [
    logAttempt,
    pendingStillAnalysisCapture,
    pendingUnifiedCapture?.goldenMask,
    stillAnalysisCapture?.photoCaptureId,
  ]);

  React.useEffect(() => {
    if (!stillAnalysisCapture?.photoCaptureId) {
      setReportOpenGate('waiting');
      return undefined;
    }

    const startedAt =
      route.params?.loadingStartedAtMs ??
      analysisAttemptRef.current?.startedAt ??
      Date.now();
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    if (elapsedMs >= FACE_REPORT_OPEN_DEADLINE_MS) {
      setReportOpenGate('deadline');
      return undefined;
    }
    if (elapsedMs >= FACE_REPORT_OPEN_MINIMUM_MS) {
      setReportOpenGate('preferred');
    } else {
      setReportOpenGate('waiting');
    }

    const minimumTimer =
      elapsedMs < FACE_REPORT_OPEN_MINIMUM_MS
        ? setTimeout(
            () => setReportOpenGate('preferred'),
            FACE_REPORT_OPEN_MINIMUM_MS - elapsedMs,
          )
        : null;
    const deadlineTimer = setTimeout(
      () => setReportOpenGate('deadline'),
      FACE_REPORT_OPEN_DEADLINE_MS - elapsedMs,
    );

    return () => {
      if (minimumTimer) {
        clearTimeout(minimumTimer);
      }
      clearTimeout(deadlineTimer);
    };
  }, [
    analysisRequestKey,
    route.params?.loadingStartedAtMs,
    stillAnalysisCapture?.photoCaptureId,
  ]);

  React.useEffect(() => {
    analysisRetryCountRef.current = 0;
  }, [selectedFaceCapture?.mediaId, selectedFaceCapture?.photoCaptureId]);

  React.useEffect(() => {
    goldenMaskPendingArtifactRef.current =
      pendingUnifiedCapture?.goldenMask ?? null;
  }, [pendingUnifiedCapture?.goldenMask]);

  React.useEffect(
    () => () => {
      const artifact = goldenMaskPendingArtifactRef.current;
      const queued = goldenMaskQueueLifecyclePromiseRef.current;
      if (queued) {
        void queued
          .finally(() => deleteGoldenMaskPendingArtifact(artifact))
          .catch(() => undefined);
      } else {
        void deleteGoldenMaskPendingArtifact(artifact).catch(() => undefined);
      }
    },
    [],
  );

  // 통합 촬영은 실제 대기 화면으로 먼저 이동한 뒤 이 화면 안에서 업로드한다.
  // Promise ref로 StrictMode effect 재실행과 리렌더의 중복 업로드를 막고, 업로드가
  // 커밋되면 같은 화면 인스턴스에서 온디바이스 분석과 보고서 생성을 이어간다.
  React.useEffect(() => {
    if (
      selectedFaceCapture ||
      !pendingUnifiedCapture ||
      pendingUploadPromiseRef.current
    ) {
      return;
    }

    setAnalysisErrorMessage(null);
    let uploadPromise: Promise<void>;
    uploadPromise = uploadFaceCaptureImage({
      cameraMetadata: pendingUnifiedCapture.cameraMetadata
        ? {
            exposureDurationMs:
              pendingUnifiedCapture.cameraMetadata.exposureDurationMs,
            iso: pendingUnifiedCapture.cameraMetadata.iso,
          }
        : null,
      captureType: 'face_analysis',
      contentType:
        pendingUnifiedCapture.image.format === 'png'
          ? 'image/png'
          : 'image/jpeg',
      height: pendingUnifiedCapture.image.height,
      source: 'camera',
      uri: pendingUnifiedCapture.image.uri,
      width: pendingUnifiedCapture.image.width,
    })
      .then(async upload => {
        if (commitUnifiedFaceCapture(pendingUnifiedCapture, upload)) {
          logAttempt('upload:done', {success: true});
          return;
        }

        await Promise.all([
          deleteUnifiedFaceCaptureTempImage(
            pendingUnifiedCapture.image.uri,
          ),
          deleteGoldenMaskPendingArtifact(pendingUnifiedCapture.goldenMask),
        ]);
        throw new Error('unified_capture_commit_rejected');
      })
      .catch(error => {
        logAttempt('attempt:failed', {
          stage: 'upload',
          success: false,
          errorType: error instanceof Error ? error.name : typeof error,
        });
        console.info('[aura:unified-face-capture] processing-upload:error', {
          message: error instanceof Error ? error.message : String(error),
        });
        if (navigation.isFocused()) {
          setAnalysisErrorMessage(
            '사진 저장이 지연되고 있어요. 네트워크를 확인한 뒤 다시 시도해 주세요.',
          );
        }
      })
      .finally(() => {
        if (pendingUploadPromiseRef.current === uploadPromise) {
          pendingUploadPromiseRef.current = null;
        }
      });

    pendingUploadPromiseRef.current = uploadPromise;
  }, [
    commitUnifiedFaceCapture,
    logAttempt,
    navigation,
    pendingUnifiedCapture,
    selectedFaceCapture,
    uploadRequestKey,
  ]);

  // [Unity still-analysis lease 시작] 아래 정지영상 분석(세로비율·퍼스널컬러)은
  // Unity homuler(IMAGE 모드) 코루틴에서 돌므로 플레이어 루프가 실행 중이어야
  // 한다. 직전 3D 측정 화면은 teardown 에서 pause 한다(카메라 반납에 올바름) —
  // 그래서 로딩이 lease 를 잡아 resume+ready 를 보장하고, 분석이 모두 settle
  // 하면 아래 end-lease 효과가 pause 로 반납한다.
  // isFocused 가드: 네이티브 back gesture, 화면 교체, 비동기 완료 레이스로
  // 포커스를 잃은 로딩 인스턴스가 촬영 화면 밑에서 Unity 를 resume 하면 안 된다.
  React.useEffect(() => {
    stillAnalysisReadyPromiseRef.current = null;
    stillAnalysisLeaseIdRef.current = null;

    if (!stillAnalysisCapture) {
      return undefined;
    }

    const leaseId = `face-analysis:${stillAnalysisCapture.photoCaptureId}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2)}`;

    if (navigation.isFocused()) {
      stillAnalysisLeaseIdRef.current = leaseId;
      stillAnalysisReadyPromiseRef.current =
        ensureUnityMakeupRunningForStillAnalysis({leaseId});
    } else {
      stillAnalysisReadyPromiseRef.current = Promise.resolve(false);
    }

    return () => {
      releaseUnityMakeupHiddenRunLease(leaseId);
      if (stillAnalysisLeaseIdRef.current === leaseId) {
        stillAnalysisLeaseIdRef.current = null;
      }
    };
  }, [navigation, stillAnalysisCapture]);

  // 얼굴 세로 비율은 캡처당 1회만 온디바이스로 계산한다.
  // 보고서 재시도(analysisRequestKey)와 분리해 재계산을 막고,
  // 실패는 null로 격리해 보고서 생성 흐름에 영향을 주지 않는다.
  React.useEffect(() => {
    if (!stillAnalysisCapture) {
      setSelectedFaceVerticalThirds(null);
      verticalThirdsPromiseRef.current = null;
      verticalThirdsCaptureIdRef.current = null;
      return undefined;
    }

    let isMounted = true;
    const captureId = stillAnalysisCapture.photoCaptureId;
    if (
      verticalThirdsCaptureIdRef.current !== captureId ||
      !verticalThirdsPromiseRef.current
    ) {
      setSelectedFaceVerticalThirds(null);
      verticalThirdsCaptureIdRef.current = captureId;
      const capturedHairline: FaceVerticalThirdsInput['capturedHairline'] =
        mapUnifiedHairlineToVerticalThirds(stillAnalysisHairline);

      // still-analysis lease 의 resume+ready 뒤에 시작한다 (ready 실패여도 진행 —
      // 서비스가 자체 타임아웃/미탑재를 null 강등으로 흡수한다).
      verticalThirdsPromiseRef.current = (
        stillAnalysisReadyPromiseRef.current ?? Promise.resolve(false)
      )
        .then(() =>
          analyzeFaceVerticalThirds({
            captureId,
            capturedHairline,
            createdAt: new Date().toISOString(),
            imageUri: stillAnalysisCapture.imageUri,
            semanticMattes: stillAnalysisCapture.semanticMattes,
            sessionId: captureId,
          }),
        )
        .catch(error => {
          console.info('[aura:face-ratio] analysis:error', {
            message: error instanceof Error ? error.message : String(error),
          });

          return null;
        });
    }

    void verticalThirdsPromiseRef.current.then(result => {
      if (isMounted && verticalThirdsCaptureIdRef.current === captureId) {
        setSelectedFaceVerticalThirds(result);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    setSelectedFaceVerticalThirds,
    stillAnalysisHairline,
    stillAnalysisCapture,
  ]);

  // 2D 기하 지표도 캡처당 1회 온디바이스로 계산한다. 같은 imageUri 라 Unity
  // 랜드마크 검출은 requestFaceLandmarks dedup 으로 세로비율과 1회를 공유한다.
  // 실패는 null 로 격리하고, 보고서 POST 는 ref 의 promise 로만 대기한다.
  React.useEffect(() => {
    if (!stillAnalysisCapture) {
      setSelectedFaceGeometry2d(null);
      faceGeometry2dPromiseRef.current = null;
      faceGeometry2dCaptureIdRef.current = null;
      return undefined;
    }

    let isMounted = true;
    const captureId = stillAnalysisCapture.photoCaptureId;

    if (
      faceGeometry2dCaptureIdRef.current !== captureId ||
      !faceGeometry2dPromiseRef.current
    ) {
      setSelectedFaceGeometry2d(null);
      faceGeometry2dCaptureIdRef.current = captureId;
      // still-analysis lease 의 resume+ready 뒤에 시작한다 (ready 실패여도 진행 —
      // 서비스가 자체 타임아웃/미탑재를 결과 status 로 흡수한다).
      faceGeometry2dPromiseRef.current = (
        stillAnalysisReadyPromiseRef.current ?? Promise.resolve(false)
      )
        .then(() =>
          analyzeFaceGeometry2d({
            captureId,
            createdAt: new Date().toISOString(),
            imageUri: stillAnalysisCapture.imageUri,
            sessionId: captureId,
          }),
        )
        .catch(error => {
          console.info('[aura:face-geometry] analysis:error', {
            message: error instanceof Error ? error.message : String(error),
          });

          return null;
        });
    }

    void faceGeometry2dPromiseRef.current.then(result => {
      if (isMounted && faceGeometry2dCaptureIdRef.current === captureId) {
        setSelectedFaceGeometry2d(result);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [setSelectedFaceGeometry2d, stillAnalysisCapture]);

  // 퍼스널 컬러도 캡처당 1회 온디바이스로 진단한다. 측정 데이터 3-반영 규칙:
  // outcome(보정 후 reported)은 화면 표시와 함께 보고서 POST(AI 입력·서버 저장)
  // 에도 실린다. 실패는 null 격리 — 보고서 생성 자체는 막지 않는다.
  React.useEffect(() => {
    if (!stillAnalysisCapture) {
      setSelectedPersonalColor(null);
      setSelectedPersonalColorCorrection(null);
      personalColorOutcomePromiseRef.current = null;
      personalColorCaptureIdRef.current = null;
      return undefined;
    }

    let isMounted = true;
    const captureId = stillAnalysisCapture.photoCaptureId;

    if (
      personalColorCaptureIdRef.current !== captureId ||
      !personalColorOutcomePromiseRef.current
    ) {
      setSelectedPersonalColor(null);
      setSelectedPersonalColorCorrection(null);
      personalColorCaptureIdRef.current = captureId;
      // outcome 을 반환해 ref 에 남긴다 — POST 의 measurements 입력 + end-lease
      // settle 게이트 겸용 (undefined resolve 였던 종전 체인의 버그 수정).
      personalColorOutcomePromiseRef.current = (
        stillAnalysisReadyPromiseRef.current ?? Promise.resolve(false)
      )
        .then(() =>
          analyzePersonalColorCapture({
            // 셔터 시점 카메라 메타(WB gains 등) — 조명 보정(sclera/WB)의 입력.
            cameraMetadata: stillAnalysisCapture.cameraMetadata ?? null,
            captureId,
            createdAt: new Date().toISOString(),
            imageUri: stillAnalysisCapture.imageUri,
            sessionId: captureId,
          }),
        )
        .catch(error => {
          console.info('[aura:personal-color] analysis:error', {
            message: error instanceof Error ? error.message : String(error),
          });

          return null;
        });
    }

    void personalColorOutcomePromiseRef.current.then(outcome => {
      if (
        isMounted &&
        outcome &&
        personalColorCaptureIdRef.current === captureId
      ) {
        // 보정 우선 표시: 조명 보정 성공 시 corrected 를 메인으로(조명 불변성),
        // 실패 시 baseline 유지 + 미적용 사유를 배지로 노출(조용한 실패 금지).
        // reported = 저장(writeResultJson)과 동일한 보고 메인 결과(보정 우선).
        setSelectedPersonalColor(outcome.reported);
        setSelectedPersonalColorCorrection(
          derivePersonalColorCorrectionStatus(outcome),
        );
      }
    });

    return () => {
      isMounted = false;
    };
  }, [
    setSelectedPersonalColor,
    setSelectedPersonalColorCorrection,
    stillAnalysisCapture,
  ]);

  // 실제 세 분석 promise가 모두 settle한 순간을 기록한다. 업로드 완료 시점에
  // 결과를 소비하며 찍으면 업로드 시간이 섞여 병렬화 여부를 판단할 수 없다.
  React.useEffect(() => {
    const captureId = stillAnalysisCapture?.photoCaptureId;
    if (
      !captureId ||
      !verticalThirdsPromiseRef.current ||
      !faceGeometry2dPromiseRef.current ||
      !personalColorOutcomePromiseRef.current
    ) {
      return undefined;
    }

    let isMounted = true;
    void Promise.all([
      verticalThirdsPromiseRef.current,
      faceGeometry2dPromiseRef.current,
      personalColorOutcomePromiseRef.current,
    ]).then(([verticalThirds, faceGeometry, personalColorOutcome]) => {
      if (
        !isMounted ||
        deviceAnalysisLoggedCaptureIdRef.current === captureId
      ) {
        return;
      }
      deviceAnalysisLoggedCaptureIdRef.current = captureId;
      logAttempt('device-analysis:done', {
        hasFaceGeometry2d: Boolean(faceGeometry),
        hasFaceVerticalThirds: Boolean(verticalThirds),
        hasPersonalColor: Boolean(personalColorOutcome),
        success: Boolean(
          verticalThirds && faceGeometry && personalColorOutcome,
        ),
      });
      if (!verticalThirds || !faceGeometry || !personalColorOutcome) {
        console.warn('[aura:analysis] on-device-axis:degraded', {
          faceGeometry2d: Boolean(faceGeometry),
          faceVerticalThirds: Boolean(verticalThirds),
          personalColor: Boolean(personalColorOutcome),
          timeoutMs: STILL_ANALYSIS_WAIT_TIMEOUT_MS,
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [logAttempt, stillAnalysisCapture?.photoCaptureId]);

  React.useEffect(() => {
    setIsAnalysisReady(false);
    setAnchorPreview(null);
    setAnalysisErrorMessage(null);
    setSelectedFaceAnalysisReport(null);

    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return undefined;
    }

    let isMounted = true;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let goldenMaskQueuePromise: ReturnType<
      typeof queueGoldenMaskUploadForReport
    > | null = null;
    // 화면 이탈 시 최대 240초짜리 분석 폴링이 백그라운드에 매달리지 않게 중단한다.
    const analysisAbortController = new AbortController();

    // 축마다 "개별" null 타임아웃 — 공유 race 는 한 축 타임아웃이 이미 해소된
    // 다른 축 값까지 버리므로 raceWithNullTimeout 으로 독립 강등한다.
    // 강등(축 null)은 균일 정책(행 방지)이며, 발생 시 경고 로그로 관측한다.
    const waitForOnDeviceAnalyses = Promise.all([
      raceWithNullTimeout(verticalThirdsPromiseRef.current, STILL_ANALYSIS_WAIT_TIMEOUT_MS),
      raceWithNullTimeout(faceGeometry2dPromiseRef.current, STILL_ANALYSIS_WAIT_TIMEOUT_MS),
      raceWithNullTimeout(
        personalColorOutcomePromiseRef.current,
        STILL_ANALYSIS_WAIT_TIMEOUT_MS,
      ),
    ]);

    waitForOnDeviceAnalyses
      .then(([verticalThirds, faceGeometry, personalColorOutcome]) => {
        if (!isMounted) {
          return null;
        }

        return createFaceAnalysisReportFromCapture(
          selectedFaceCapture,
          buildFaceVerticalThirdsAnalysisPayload(verticalThirds),
          // 3D 측정은 로딩 진입 전에 끝나 있으므로(측정 화면 경유) 대기 없이 그대로 싣는다.
          isFace3DProfileAnalysisEligible(selectedFace3DProfile)
            ? selectedFace3DProfile
            : undefined,
          buildFaceGeometryAnalysisPayload(faceGeometry),
          // 측정 원본 4축 — 서버 저장(detail_payload)·AI 입력·과거 보고서 복원용.
          {
            face3d: selectedFace3DProfile ?? null,
            face3dPhotoEvidence:
              unifiedFaceCaptureFlow.committedCapture?.result
                .face3dPhotoEvidence ?? null,
            faceGeometry2d: faceGeometry,
            faceVerticalThirds: verticalThirds,
            personalColor: personalColorOutcome,
          },
          // 앵커(~4s) 확정 시 얼굴형·피부·무드를 로딩 화면에 먼저 노출.
          {
            onAnalysisCreated: reportId => {
              logAttempt('analysis-job:created', {
                hasReportId: Boolean(reportId),
                success: true,
              });
              const goldenMask =
                unifiedFaceCaptureFlow.committedCapture?.result.goldenMask;
              const userId = session?.user.id;
              if (!goldenMask || !userId) {
                goldenMaskPreloadPromiseRef.current = null;
                preparedGoldenMaskRef.current = null;
                setPreparedGoldenMask(null);
                setGoldenMaskPreloadStatus('not-required');
                return;
              }

              // 보고서 화면에서 시작하면 늦다. ARKit 원본 로컬 파일을 분석 대기
              // 화면에서 Unity에 먼저 올려 첫 프레임까지 준비한 뒤, 원본을 삭제할 수
              // 있는 업로드 큐로 넘긴다. 보고서 생성 폴링과는 계속 병렬이다.
              setGoldenMaskPreloadStatus('pending');
              const preloadStartedAt = Date.now();
              const preloadPromise = preloadGoldenMaskFromCapture(
                reportId,
                goldenMask,
              ).then(result => {
                const nextPreparedGoldenMask = result.ready
                  ? {
                      descriptor: buildLocalGoldenMaskDescriptor(goldenMask),
                      reportId,
                    }
                  : null;
                preparedGoldenMaskRef.current = nextPreparedGoldenMask;
                if (isMounted) {
                  setPreparedGoldenMask(nextPreparedGoldenMask);
                  setGoldenMaskPreloadStatus(
                    result.ready ? 'ready' : 'failed',
                  );
                }
                logAttempt('golden-mask:preload-settled', {
                  elapsedMs: Date.now() - preloadStartedAt,
                  ready: result.ready,
                  success: result.ready,
                });
                return result;
              });
              goldenMaskPreloadPromiseRef.current = preloadPromise;

              goldenMaskQueuePromise = preloadPromise.then(() =>
                queueGoldenMaskUploadForReport({
                  artifact: goldenMask,
                  reportId,
                  userId,
                }),
              );
              goldenMaskQueueLifecyclePromiseRef.current =
                goldenMaskQueuePromise;
              void goldenMaskQueuePromise.catch(error => {
                console.info('[aura:golden-mask] queue:error', {
                  code: error instanceof BackendApiError ? error.code : undefined,
                  errorType: error instanceof Error ? error.name : typeof error,
                  reportId,
                  status:
                    error instanceof BackendApiError ? error.status : undefined,
                });
              });
            },
            onAnchorPreview: preview => {
              setAnchorPreview(preview);
              logAttempt('anchor:ready', {
                hasFaceShape: Boolean(preview.faceShape),
                hasRecommendedMood: Boolean(preview.recommendedMood),
                hasSkinType: Boolean(preview.skinType),
                success: true,
              });
            },
            onProgressiveReport: report => {
              if (!isMounted) {
                return;
              }
              const localGoldenMask = preparedGoldenMaskRef.current;
              setSelectedFaceAnalysisReport(
                localGoldenMask?.reportId === report.id && !report.goldenMask
                  ? {...report, goldenMask: localGoldenMask.descriptor}
                  : report,
              );
              setPerceptionReportReady(true);
              logAttempt('perception-report:ready', {
                contentRevision: report.contentRevision ?? null,
                success: true,
              });
            },
          },
          // 화면 이탈 시 폴링 중단 — 최대 240초 백그라운드 매달림 방지.
          analysisAbortController.signal,
        );
      })
      .then(async report => {
        if (!isMounted || !report) {
          return;
        }

        const localGoldenMask = preparedGoldenMaskRef.current;
        setSelectedFaceAnalysisReport(
          localGoldenMask?.reportId === report.id && !report.goldenMask
            ? {...report, goldenMask: localGoldenMask.descriptor}
            : report,
        );
        setAnchorPreview(currentPreview =>
          currentPreview ?? {
            faceShape: report.faceShape,
            reportId: report.id,
            ...(report.faceAnalysisV2?.derived
              ? {derived: report.faceAnalysisV2.derived}
              : {}),
            ...(report.recommendedMood
              ? {recommendedMood: report.recommendedMood}
              : {}),
            ...(report.skinType ? {skinType: report.skinType} : {}),
          },
        );
        setPerceptionReportReady(
          report.contentStatus?.narrativeStatus === 'completed',
        );
        analysisRetryCountRef.current = 0;
        // 보고서 완료가 Golden Mask 첫 프레임보다 빨라도 화면을 먼저 열지 않는다.
        // 모델이 없는 기기/세션은 promise가 없으므로 기존 경로 그대로 진행한다.
        await goldenMaskPreloadPromiseRef.current;
        if (!isMounted) {
          return;
        }
        setIsAnalysisReady(true);
        if (
          minimumReportLoggedRef.current &&
          !fullReportLoggedRef.current
        ) {
          fullReportLoggedRef.current = true;
          logAttempt('full-report:shown', {success: true});
        }
        if (
          minimumReportLoggedRef.current &&
          route.params?.afterAnalysisRoute === 'ProductRecommendation' &&
          !completionRouteHandledRef.current
        ) {
          completionRouteHandledRef.current = true;
          navigation.navigate('ProductRecommendation');
        }

        const userId = session?.user.id;
        if (userId) {
          // queue가 먼저 끝났다면 그 descriptor를 반영하고, 네트워크 재시도
          // 항목이 남아 있으면 완료된 보고서를 보여 준 뒤 한 번 더 flush한다.
          void (goldenMaskQueuePromise ?? Promise.resolve())
            .then(async queuedDescriptor => {
              if (queuedDescriptor) {
                return queuedDescriptor;
              }
              const attachments =
                await flushPendingGoldenMaskUploads(userId);
              return (
                attachments.find(
                  attachment => attachment.reportId === report.id,
                )?.descriptor ?? null
              );
            })
            .then(descriptor => {
              if (!descriptor) {
                return;
              }
              // The loading route may already have handed off to the report
              // while the private mesh upload is finishing. The flow-state
              // setter outlives this screen; the report-id guard below keeps a
              // late completion from touching a newer report.
              setSelectedFaceAnalysisReport(currentReport =>
                currentReport?.id === report.id
                  ? {...currentReport, goldenMask: descriptor}
                  : currentReport,
              );
            })
            .catch(() => undefined);
        }
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
        logAttempt('attempt:failed', {
          stage: 'analysis-report',
          success: false,
          errorType: error instanceof Error ? error.name : typeof error,
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
          const finalErrorMessage =
            error instanceof Error
              ? error.message
              : FACE_ANALYSIS_LOADING_ERROR_MESSAGE;
          setAnalysisErrorMessage(finalErrorMessage);
          if (minimumReportPreviewRef.current) {
            const failedPreview = {
              ...minimumReportPreviewRef.current,
              errorMessage: finalErrorMessage,
            };
            minimumReportPreviewRef.current = failedPreview;
            navigation.navigate('FaceAnalysisReportDetail', {
              afterAnalysisRoute: route.params?.afterAnalysisRoute,
              minimumPreview: failedPreview,
            });
          }
          return;
        }

        analysisRetryCountRef.current += 1;
        retryTimeoutId = setTimeout(() => {
          setAnalysisRequestKey(currentKey => currentKey + 1);
        }, 1800);
      });

    return () => {
      isMounted = false;
      // 진행 중인 분석 폴링을 즉시 중단(화면 이탈·재요청 시 자원 매달림 방지).
      analysisAbortController.abort();

      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
      }
    };
  }, [
    analysisRequestKey,
    clearSession,
    navigation,
    logAttempt,
    selectedFaceCapture,
    selectedFace3DProfile,
    session?.user.id,
    setSelectedFaceAnalysisReport,
    route.params?.afterAnalysisRoute,
    unifiedFaceCaptureFlow.committedCapture,
  ]);

  // [Unity still-analysis lease 반납] 정지영상 분석이 모두 settle 하면 이 화면의
  // 고유 lease만 반납한다. 화면 이탈 cleanup에서도 같은 ID를 반납하므로 홈으로
  // 일찍 나가도 Unity가 계속 돌지 않고, 늦은 cleanup이 새 AR 화면이나 새 분석을
  // 멈추지도 않는다.
  React.useEffect(() => {
    if (!stillAnalysisCapture) {
      return undefined;
    }

    const leaseId = stillAnalysisLeaseIdRef.current;

    void Promise.allSettled([
      verticalThirdsPromiseRef.current ?? Promise.resolve(null),
      faceGeometry2dPromiseRef.current ?? Promise.resolve(null),
      personalColorOutcomePromiseRef.current ?? Promise.resolve(null),
    ]).then(() => {
      if (leaseId) {
        releaseUnityMakeupHiddenRunLease(leaseId);
        if (stillAnalysisLeaseIdRef.current === leaseId) {
          stillAnalysisLeaseIdRef.current = null;
        }
      }
    });

    return undefined;
  }, [stillAnalysisCapture]);

  const minimumPersonalColor = selectedPersonalColor
    ? getMeasuredPersonalColorSummary(selectedPersonalColor).personalColor
    : undefined;
  const minimumFaceVerticalThirds =
    selectedFaceVerticalThirds?.captureId ===
    stillAnalysisCapture?.photoCaptureId
      ? selectedFaceVerticalThirds
      : null;
  const minimumRatioSummary = minimumFaceVerticalThirds
    ? summarizeVerticalThirds(minimumFaceVerticalThirds)
    : undefined;
  const minimumHas3DModel = goldenMaskPreloadStatus === 'ready';
  const reportOpenDecision = resolveFaceReportOpenDecision({
    elapsedMs:
      reportOpenGate === 'deadline'
        ? FACE_REPORT_OPEN_DEADLINE_MS
        : reportOpenGate === 'preferred'
          ? FACE_REPORT_OPEN_MINIMUM_MS
          : 0,
    perceptionReady: perceptionReportReady,
  });
  const reportGateAllowsOpen = reportOpenDecision !== 'wait';

  React.useEffect(() => {
    if (
      !anchorPreview ||
      !reportGateAllowsOpen ||
      minimumReportLoggedRef.current ||
      !(stillAnalysisCapture?.imageUri)
    ) {
      return;
    }

    const minimumPreview: MinimumFaceReportPreview = {
      capturedPhotoUri: stillAnalysisCapture.imageUri,
      ...(anchorPreview.derived ? {derived: anchorPreview.derived} : {}),
      faceShape: anchorPreview.faceShape,
      ...(preparedGoldenMask
        ? {
            goldenMask: preparedGoldenMask.descriptor,
          }
        : {}),
      has3DModel: minimumHas3DModel,
      personalColor: minimumPersonalColor,
      ratioSummary: minimumRatioSummary,
      ...(anchorPreview.recommendedMood
        ? {recommendedMood: anchorPreview.recommendedMood}
        : {}),
      ...(anchorPreview.reportId ? {reportId: anchorPreview.reportId} : {}),
      ...(anchorPreview.skinType ? {skinType: anchorPreview.skinType} : {}),
    };
    minimumReportLoggedRef.current = true;
    minimumReportPreviewRef.current = minimumPreview;
    const previewElapsedMs = Math.max(
      0,
      Date.now() -
        (
          route.params?.loadingStartedAtMs ??
          analysisAttemptRef.current?.startedAt ??
          Date.now()
        ),
    );
    console.info('[aura:analysis] minimum-report:shown', {
      elapsedMs: previewElapsedMs,
      fallbackAtDeadline: reportOpenDecision === 'open-fallback',
      perceptionReady: perceptionReportReady,
      reportId: anchorPreview.reportId ?? null,
    });
    if (anchorPreview.reportId) {
      recordFaceAnalysisPreviewTiming(
        anchorPreview.reportId,
        previewElapsedMs,
        perceptionReportReady,
      );
    }
    navigation.navigate('FaceAnalysisReportDetail', {
      afterAnalysisRoute: route.params?.afterAnalysisRoute,
      minimumPreview,
    });
    logAttempt('minimum-report:shown', {
      fallbackAtDeadline:
        reportOpenDecision === 'open-fallback',
      hasFaceVerticalThirds: Boolean(minimumFaceVerticalThirds),
      hasGoldenMask: minimumHas3DModel,
      hasPersonalColor: Boolean(selectedPersonalColor),
      perceptionReady: perceptionReportReady,
      success: true,
    });
  }, [
    anchorPreview,
    logAttempt,
    minimumHas3DModel,
    minimumPersonalColor,
    preparedGoldenMask,
    minimumRatioSummary,
    navigation,
    perceptionReportReady,
    reportGateAllowsOpen,
    reportOpenDecision,
    reportOpenGate,
    route.params?.afterAnalysisRoute,
    route.params?.loadingStartedAtMs,
    minimumFaceVerticalThirds,
    selectedPersonalColor,
    stillAnalysisCapture?.imageUri,
  ]);

  React.useEffect(() => {
    if (
      !isAnalysisReady ||
      !minimumReportLoggedRef.current ||
      route.params?.afterAnalysisRoute !== 'ProductRecommendation' ||
      completionRouteHandledRef.current
    ) {
      return;
    }
    completionRouteHandledRef.current = true;
    navigation.navigate('ProductRecommendation');
  }, [
    isAnalysisReady,
    navigation,
    reportOpenGate,
    route.params?.afterAnalysisRoute,
  ]);

  const handleRetryAnalysis = React.useCallback(() => {
    analysisRetryCountRef.current = 0;
    setAnalysisErrorMessage(null);
    setIsAnalysisReady(false);
    setProgressAttempt(currentAttempt => ({
      key: currentAttempt.key + 1,
      startedAtMs: Date.now(),
    }));

    if (pendingUnifiedCapture && !selectedFaceCapture) {
      setUploadRequestKey(currentKey => currentKey + 1);
      return;
    }

    setAnalysisRequestKey(currentKey => currentKey + 1);
  }, [pendingUnifiedCapture, selectedFaceCapture]);
  const handleBack = React.useCallback(() => {
    if (pendingUnifiedCapture && !selectedFaceCapture) {
      invalidateUnifiedFaceCapture({resetRetryAttempt: true});
      const pendingUpload = pendingUploadPromiseRef.current;
      if (pendingUpload) {
        void pendingUpload
          .finally(() =>
            Promise.all([
              deleteUnifiedFaceCaptureTempImage(
                pendingUnifiedCapture.image.uri,
              ),
              deleteGoldenMaskPendingArtifact(
                pendingUnifiedCapture.goldenMask,
              ),
            ]),
          )
          .catch(() => undefined);
      } else {
        void Promise.all([
          deleteUnifiedFaceCaptureTempImage(
            pendingUnifiedCapture.image.uri,
          ),
          deleteGoldenMaskPendingArtifact(pendingUnifiedCapture.goldenMask),
        ]).catch(() => undefined);
      }
    } else if (pendingUnifiedCapture?.goldenMask) {
      void deleteGoldenMaskPendingArtifact(
        pendingUnifiedCapture.goldenMask,
      ).catch(() => undefined);
    }

    goBackToPreviousOrMainTab(navigation, 'HomeTab');
  }, [
    invalidateUnifiedFaceCapture,
    navigation,
    pendingUnifiedCapture,
    selectedFaceCapture,
  ]);
  const handleRetake = React.useCallback(() => {
    invalidateUnifiedFaceCapture({resetRetryAttempt: true});
    setSelectedFaceAnalysisReport(null);
    setSelectedFaceCapture(null);
    setSelectedFaceGeometry2d(null);
    setSelectedFaceVerticalThirds(null);
    setSelectedPersonalColor(null);
    setSelectedPersonalColorCorrection(null);

    if (pendingUnifiedCapture) {
      const pendingUpload = pendingUploadPromiseRef.current;
      if (pendingUpload) {
        void pendingUpload
          .finally(() =>
            Promise.all([
              deleteUnifiedFaceCaptureTempImage(
                pendingUnifiedCapture.image.uri,
              ),
              deleteGoldenMaskPendingArtifact(
                pendingUnifiedCapture.goldenMask,
              ),
            ]),
          )
          .catch(() => undefined);
      } else {
        void Promise.all([
          deleteUnifiedFaceCaptureTempImage(
            pendingUnifiedCapture.image.uri,
          ),
          deleteGoldenMaskPendingArtifact(pendingUnifiedCapture.goldenMask),
        ]).catch(() => undefined);
      }
    }

    navigation.replace(
      'FaceCapture',
      route.params?.afterAnalysisRoute
        ? {afterAnalysisRoute: route.params.afterAnalysisRoute}
        : undefined,
    );
  }, [
    invalidateUnifiedFaceCapture,
    navigation,
    pendingUnifiedCapture,
    route.params?.afterAnalysisRoute,
    setSelectedFaceAnalysisReport,
    setSelectedFaceCapture,
    setSelectedFaceGeometry2d,
    setSelectedFaceVerticalThirds,
    setSelectedPersonalColor,
    setSelectedPersonalColorCorrection,
  ]);
  const handleOpenReports = React.useCallback(() => {
    navigation.replace('FaceAnalysisReportsList');
  }, [navigation]);
  const handleAnalysisComplete = React.useCallback(() => {
    const minimumReportIsOpen = minimumReportLoggedRef.current;
    // 최종 결과가 매우 빨리 끝나도 10~15초 의미 기반 진입 게이트를 우회하지 않는다.
    // 게이트 효과가 먼저 최소/점진 보고서를 연 뒤에만 후속 라우팅을 허용한다.
    if (!minimumReportIsOpen) {
      return;
    }

    // 카메라-off의 필요조건: still 분석 hidden-run lease를 replace '이전에' 동기 해제한다.
    // lease가 _hiddenRunLeaseIds에 남으면 네이티브 런타임 모드가 계속 'still'이라 전면
    // 카메라(ARSession)가 유지된다(초록 LED). 언마운트 cleanup 순서에 의존하면 보고서의
    // pause 효과와 레이스가 나므로 여기서 명시적으로 푼다.
    const leaseId = stillAnalysisLeaseIdRef.current;
    if (leaseId) {
      releaseUnityMakeupHiddenRunLease(leaseId);
      stillAnalysisLeaseIdRef.current = null;
    }
    if (!fullReportLoggedRef.current) {
      fullReportLoggedRef.current = true;
      logAttempt('full-report:shown', {success: true});
    }

    if (route.params?.afterAnalysisRoute === 'ProductRecommendation') {
      if (completionRouteHandledRef.current) {
        return;
      }
      completionRouteHandledRef.current = true;
      navigation.navigate('ProductRecommendation');
      return;
    }
    // 일반 보고서는 이미 열린 동일 route에서 props만 갱신한다. replace/reset은
    // 사용자가 보고 있던 카드와 스크롤 위치를 잃게 만든다.
  }, [logAttempt, navigation, route.params?.afterAnalysisRoute]);

  return (
    <DetailRouteChrome
      headerHidden
      routeName="FaceAnalysisLoading"
      onBack={handleBack}>
      <FaceAnalysisLoadingScreen
        key={progressAttempt.key}
        analysisErrorMessage={analysisErrorMessage}
        anchorPreview={anchorPreview}
        capturedPhotoUri={
          selectedFaceCapture?.imageUri ?? pendingUnifiedCapture?.image.uri
        }
        isAnalysisReady={isAnalysisReady}
        onBack={handleBack}
        onComplete={handleAnalysisComplete}
        onOpenReports={handleOpenReports}
        onRetake={handleRetake}
        onRetry={handleRetryAnalysis}
        progressStartedAtMs={progressAttempt.startedAtMs}
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportsListRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisReportsList'>) {
  const {setSelectedFaceAnalysisReport} = useNavigationFlowState();
  const handleDeleteReport = React.useCallback(
    async (reportId: string) => {
      await deleteFaceAnalysisReport(reportId);
      setSelectedFaceAnalysisReport(currentReport =>
        currentReport?.id === reportId ? null : currentReport,
      );
    },
    [setSelectedFaceAnalysisReport],
  );

  return (
    <DetailRouteChrome
      reserveOverlayHeaderSpace={false}
      routeName="FaceAnalysisReportsList"
      onBack={() => goBackToPreviousOrMainTab(navigation, 'ProfileTab')}>
      <FaceAnalysisReportsListScreen
        onDeleteReport={handleDeleteReport}
        onPressReport={reportId =>
          navigation.navigate('FaceAnalysisReportDetail', {reportId})
        }
      />
    </DetailRouteChrome>
  );
}

// The report screen: redesigned S1–S7 UI (features/face-report). Owns the
// canonical FaceAnalysisReportDetail route, so every entry point (post-analysis,
// reports list, profile, home, AR back) lands here. Session props follow the
// same rule as before — route.params.reportId means "past report", so session
// measurements are withheld and the server-stored ones are restored instead.
export function FaceAnalysisReportPreviewRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisReportDetail'>) {
  const shouldReturnToProfile = route.params?.returnTo === 'profile';
  const minimumPreview = route.params?.minimumPreview ?? null;
  const [goldenMaskInteracting, setGoldenMaskInteracting] =
    React.useState(false);
  const {
    selectedFaceAnalysisReport,
    selectedFaceCapture,
    selectedFace3DProfile,
    selectedFaceGeometry2d,
    selectedFaceVerticalThirds,
    selectedPersonalColor,
    setSelectedFaceAnalysisReport,
    unifiedFaceCaptureFlow,
  } = useNavigationFlowState();
  // 안전망: 보고서는 카메라가 필요 없다. 상류에서 lease 해제가 누락돼도 여기서
  // run-consumer(가시 소유자·explicit lease)를 0으로 만들어 런타임 모드가 idle로 가게 한다
  // — idle이어야 네이티브가 ARSession을 끄고 전면 카메라를 반납한다(초록 LED·과열 방지).
  // 순서 중요: hideUnityMakeupView(소유자 nil + explicit lease 해제 + reconcile) →
  // playerPause → setPaused(out-of-band belt-and-suspenders). setPaused만으론 lease/모드가
  // 살아 있으면 덮어써져 소용없다.
  React.useEffect(() => {
    hideUnityMakeupView();
    setUnityMakeupPlayerPaused(true);
    setUnityMakeupSessionPaused(true);
  }, []);

  React.useEffect(() => {
    navigation.setOptions({
      // The report pager owns both horizontal directions. Keeping the native
      // iOS back gesture enabled lets an edge swipe win before the pager's
      // PanResponder can classify it, which unexpectedly exits the report.
      gestureEnabled: shouldEnableFaceReportBackGesture(),
    });
  }, [navigation]);

  React.useEffect(() => {
    if (!goldenMaskInteracting) {
      return undefined;
    }
    return navigation.addListener('beforeRemove', event => {
      event.preventDefault();
    });
  }, [goldenMaskInteracting, navigation]);

  return (
    <>
      <FaceAnalysisReportPreviewScreen
        analysisReport={selectedFaceAnalysisReport}
        capturedPhotoUri={selectedFaceCapture?.imageUri}
        entryResetKey={route.key}
        initialPageId={route.params?.initialPageId}
        minimumPreview={minimumPreview}
        onBack={() => {
          if (goldenMaskInteracting) {
            return;
          }
          if (minimumPreview) {
            // 최소 보고서 아래의 로딩 화면까지 제거해 폴링을 abort한다. 단순
            // navigate는 두 화면을 스택에 남겨 완료 시 홈 위로 다시 열릴 수 있다.
            navigation.reset({
              index: 0,
              routes: [
                {name: 'MainTabs', params: {screen: 'HomeTab'}},
              ],
            });
            return;
          }
          if (shouldReturnToProfile) {
            goBackToPreviousOrMainTab(navigation, 'ProfileTab');
            return;
          }
          goBackToPreviousOrMainTab(navigation, 'HomeTab');
        }}
        onGoldenMaskInteractionChange={setGoldenMaskInteracting}
        onPressProducts={reportId => navigation.navigate('ProductRecommendation', {reportId})}
        onRetake={() => {
          if (minimumPreview) {
            navigation.reset({index: 0, routes: [{name: 'FaceCapture'}]});
            return;
          }
          navigation.navigate('FaceCapture');
        }}
        face3d={route.params?.reportId ? null : selectedFace3DProfile}
        face3dPhotoEvidence={
          route.params?.reportId
            ? null
            : unifiedFaceCaptureFlow.committedCapture?.result
                .face3dPhotoEvidence ?? null
        }
        faceGeometry2d={route.params?.reportId ? null : selectedFaceGeometry2d}
        personalColor={route.params?.reportId ? null : selectedPersonalColor}
        reportId={route.params?.reportId ?? null}
        sessionCaptureId={selectedFaceCapture?.photoCaptureId ?? null}
        verticalThirds={route.params?.reportId ? null : selectedFaceVerticalThirds}
      />
    </>
  );
}

// __DEV__ 전용: Face 2D 지오메트리(눈꼬리·눈썹선·roll) 오버레이 검증 화면.
// 결과는 화면이 flow state(selectedFaceGeometry2d)에서 직접 읽으므로 param 불필요.
export function FaceGeometryDebugRouteScreen() {
  return <FaceGeometryDebugScreen />;
}

function FaceAnalysisReportBottomNav({
  currentReportId,
  navigation,
}: {
  currentReportId: string | null;
  navigation: RootNavigation;
}) {
  const insets = useSafeAreaInsets();
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const [isExtractionSheetVisible, setIsExtractionSheetVisible] = React.useState(false);
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = React.useState(false);
  const [isFloatingActionMenuExpanded, setIsFloatingActionMenuExpanded] =
    React.useState(false);
  const {
    beginMakeupFeedbackFlow,
    floatingActionAnchor,
    floatingActionButtonPosition,
    floatingActionIds,
    floatingActionInteractionMode,
    setMakeupFeedbackResult,
    setFloatingActionAnchor,
    setFloatingActionButtonPosition,
    setSelectedMakeupFeedbackPhoto,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();
  const footerBottomInset = Math.max(insets.bottom, spacing.md);
  const floatingActionViewport = React.useMemo(() => ({
    bottomInset: insets.bottom,
    bottomReserved: APP_FOOTER_FLOATING_HOST_BASE_HEIGHT + spacing.md,
    height: windowHeight,
    leftInset: insets.left,
    rightInset: insets.right,
    topInset: insets.top,
    width: windowWidth,
  }), [insets, windowHeight, windowWidth]);

  const handleFooterTabPress = React.useCallback(
    (tab: FooterTabKey) => {
      setIsFloatingActionMenuExpanded(false);

      if (tab === 'home') {
        navigateMainTab(navigation, 'HomeTab');
        return;
      }

      if (tab === 'consulting') {
        navigateMainTab(navigation, 'ConsultingTab');
        return;
      }

      if (tab === 'journey') {
        navigateMainTab(navigation, 'MakeupJourneyTab');
        return;
      }

      navigateMainTab(navigation, 'ProfileTab');
    },
    [navigation],
  );

  const closeExtractionSheet = React.useCallback(() => {
    setIsExtractionSheetVisible(false);
  }, []);

  const closeFeedbackSheet = React.useCallback(() => {
    setIsFeedbackSheetVisible(false);
  }, []);

  const startMakeupExtraction = React.useCallback((initialSource: 'camera' | 'gallery') => {
    setIsExtractionSheetVisible(false);

    if (initialSource === 'camera') {
      setSelectedRecommendedMakeupFilterId(null);
      setSelectedReferenceMakeupPhoto(null);
      requestAnimationFrame(() => {
        navigation.navigate('ReferenceMakeupExtractionUpload', {initialSource});
      });
      return;
    }

    const {pickReferenceMakeupPhotoFromLibrary} = loadMakeupPhotoPicker();
    void pickReferenceMakeupPhotoFromLibrary().then(photo => {
      if (!photo) {
        return;
      }
      setSelectedRecommendedMakeupFilterId(null);
      setSelectedReferenceMakeupPhoto(photo);
      navigation.navigate('FaceCaptureConfirmation', {
        target: 'referenceMakeupExtraction',
      });
    });
  }, [
    navigation,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  ]);

  const startMakeupFeedback = React.useCallback((photoSource: 'camera' | 'gallery') => {
    setIsFeedbackSheetVisible(false);

    if (photoSource === 'camera') {
      beginMakeupFeedbackFlow();
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto({photoSource});
      requestAnimationFrame(() => {
        navigation.navigate('MakeupFeedbackCapture');
      });
      return;
    }

    const {pickMakeupFeedbackPhotoFromLibrary} = loadMakeupPhotoPicker();
    void pickMakeupFeedbackPhotoFromLibrary().then(selection => {
      if (!selection) {
        return;
      }
      beginMakeupFeedbackFlow();
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(selection);
      navigation.navigate('FaceCaptureConfirmation', {
        target: 'makeupFeedback',
      });
    });
  }, [
    beginMakeupFeedbackFlow,
    navigation,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  ]);

  const handleSelectFloatingAction = React.useCallback(
    (actionId: FloatingActionId) => {
      if (actionId === 'makeupExtraction') {
        setIsFeedbackSheetVisible(false);
        setIsExtractionSheetVisible(true);
        return;
      }

      if (actionId === 'makeupFeedback') {
        setIsExtractionSheetVisible(false);
        setIsFeedbackSheetVisible(true);
        return;
      }

      if (actionId === 'arFilter') {
        setSelectedRecommendedMakeupFilterId(null);
        navigation.navigate('ARFilter');
        return;
      }

      if (actionId === 'faceAnalysis') {
        navigation.navigate('FaceAnalysisIntro');
        return;
      }

      if (actionId === 'filterStore') {
        navigation.navigate('HomeFilterStore');
        return;
      }

      if (actionId === 'makeupRecommendation') {
        if (currentReportId) {
          navigation.navigate('MakeupRecommendation', {analysisReportId: currentReportId});
          return;
        }
        navigation.navigate('MakeupRecommendation');
        return;
      }

      navigation.navigate(
        'ProductRecommendation',
        currentReportId ? {reportId: currentReportId} : undefined,
      );
    },
    [currentReportId, navigation, setSelectedRecommendedMakeupFilterId],
  );

  const handleFloatingActionSettingsPress = React.useCallback(() => {
    navigation.navigate('FloatingActionSettings');
  }, [navigation]);
  const handleFloatingActionAnchorChange = React.useCallback((anchor: {
    xRatio: number;
    yRatio: number;
  }) => {
    setFloatingActionAnchor(anchor);
    setFloatingActionButtonPosition(anchor.xRatio <= 0.5 ? 'left' : 'right');
  }, [setFloatingActionAnchor, setFloatingActionButtonPosition]);

  return (
    <>
      <YStack
        pointerEvents="box-none"
        style={[
          styles.reportFooterHost,
          {
            height: getFaceAnalysisReportFooterHostHeight(windowHeight, footerBottomInset),
          },
        ]}>
        {isFloatingActionMenuExpanded ? (
          <Pressable
            accessibilityLabel="빠른 실행 메뉴 닫기"
            accessibilityRole="button"
            onPress={() => setIsFloatingActionMenuExpanded(false)}
            style={styles.reportFooterDismissLayer}
          />
        ) : null}
        <FloatingActionMenu
          actionIds={floatingActionIds}
          anchor={floatingActionAnchor}
          buttonPosition={floatingActionButtonPosition}
          interactionMode={floatingActionInteractionMode}
          isExpanded={isFloatingActionMenuExpanded}
          onAnchorChange={handleFloatingActionAnchorChange}
          onExpandedChange={setIsFloatingActionMenuExpanded}
          onPressSettings={handleFloatingActionSettingsPress}
          onReposition={quadrant => {
            trackMakeupJourneyEvent({
              name: 'floating_action_repositioned',
              properties: {quadrant},
            });
          }}
          onSelectAction={handleSelectFloatingAction}
          placement="free"
          viewport={floatingActionViewport}
        />
        <AppFooter
          activeTab="profile"
          bottomInset={insets.bottom}
          floating
          hiddenTabs={isMakeupJourneyEnabled() ? undefined : ['journey']}
          onTabPress={handleFooterTabPress}
        />
      </YStack>
      <MakeupExtractionActionSheet
        isVisible={isExtractionSheetVisible}
        onClose={closeExtractionSheet}
        onPressCamera={() => startMakeupExtraction('camera')}
        onPressUpload={() => startMakeupExtraction('gallery')}
      />
      <MakeupFeedbackActionSheet
        isVisible={isFeedbackSheetVisible}
        onClose={closeFeedbackSheet}
        onPressCamera={() => startMakeupFeedback('camera')}
        onPressUpload={() => startMakeupFeedback('gallery')}
      />
    </>
  );
}

const styles = StyleSheet.create({
  reportFooterDismissLayer: {
    backgroundColor: 'transparent',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10,
  },
  reportFooterHost: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 24,
  },
});
