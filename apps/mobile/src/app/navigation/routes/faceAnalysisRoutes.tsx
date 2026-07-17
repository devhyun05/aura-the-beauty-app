import React from 'react';

import {
  createFaceAnalysisReportFromCapture,
  FaceAnalysisIntroScreen,
  FaceAnalysisReportsListScreen,
} from '../../../features/face-analysis';
import {FaceAnalysisReportPreviewScreen} from '../../../features/face-report/screens/FaceAnalysisReportPreviewScreen';
import {FaceAnalysisLoadingScreen} from '../../../features/face-analysis/screens/FaceAnalysisLoadingScreen';
import {Face3DMeasurementScreen} from '../../../features/face-analysis/screens/Face3DMeasurementScreen';
import {isUnityMakeupNativeViewSupported} from '../../../features/ar/components/UnityMakeupNativeView';
import {
  ensureUnityMakeupRunningForStillAnalysis,
  setUnityMakeupPlayerPaused,
} from '../../../features/ar/services/unityMakeupBridge';
import {evaluateFace3DEntryEligibility} from '../../../features/face-3d/services/face3DEntryEligibility';
import {isFace3DProfileAnalysisEligible} from '../../../features/face-3d/services/face3DContract';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import {UnifiedFaceCaptureScreen} from '../../../features/face-capture/screens/UnifiedFaceCaptureScreen';
import {buildUnifiedFaceCaptureRequest} from '../../../features/face-capture/services/unifiedFaceCaptureContract';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {isUnifiedFaceCaptureEnabled} from '../../../features/face-capture/services/unifiedFaceCaptureMode';
import {
  mapUnifiedHairlineToVerticalThirds,
  shouldUseUnifiedFaceCaptureRoute,
} from '../../../features/face-capture/services/unifiedFaceCaptureNavigation';
import {derivePersonalColorCorrectionStatus} from '../../../features/face-analysis/services/faceAnalysisMeasurements';
import {raceWithNullTimeout} from '../../../features/face-analysis/services/stillAnalysisWait';
import {buildFaceGeometryAnalysisPayload} from '../../../features/face-geometry/services/faceGeometryAiPayload';
import {analyzeFaceGeometry2d} from '../../../features/face-geometry/services/faceGeometryService';
import type {FaceGeometryResult} from '../../../features/face-geometry/types';
import {buildFaceVerticalThirdsAnalysisPayload} from '../../../features/face-ratio/services/faceVerticalThirdsAiPayload';
import {analyzeFaceVerticalThirds} from '../../../features/face-ratio/services/faceVerticalThirdsService';
import type {
  FaceVerticalThirdsInput,
  FaceVerticalThirdsResult,
} from '../../../features/face-ratio/types';
import {
  analyzePersonalColorCapture,
  type PersonalColorAnalysisOutcome,
} from '../../../features/personal-color/services/personalColorService';
import {useAuthSession} from '../../../features/auth';
import {FaceCaptureTutorialSheet} from '../../../features/onboarding';
import {BackendApiError} from '../../../shared/services/backendApi';
import {deleteFaceAnalysisReport} from '../../../shared/services/faceAnalysisService';
import {colors} from '../../../shared/theme';
import {FLOATING_ACTION_HOST_EXTRA_HEIGHT} from '../../../shared/ui';
import {APP_FOOTER_FLOATING_HOST_BASE_HEIGHT} from '../../../shared/ui/AppFooter';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootNavigation, type RootScreenProps} from './routeUtils';

const MAX_ANALYSIS_RETRY_COUNT = 2;
// 온디바이스 정지영상 분석(세로비율 등)이 이 시간 안에 끝나지 않으면 해당 축 없이
// 보고서 생성을 진행한다. ⚠️ 예산 연동: ensureUnityMakeupRunningForStillAnalysis
// 의 ready 폴링 상한 4200ms + requestFaceLandmarks 기본 3500ms = 7700ms < 8000ms.
// 셋 중 하나를 바꾸면 함께 조정해야 한다.
const STILL_ANALYSIS_WAIT_TIMEOUT_MS = 8000;
const FACE_ANALYSIS_LOADING_ERROR_MESSAGE =
  '분석 결과를 만드는 데 시간이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.';
const NON_RETRYABLE_ANALYSIS_ERROR_CODES = new Set([
  'ANALYSIS_JOB_FAILED',
  'ANALYSIS_REPORT_TEXT_REQUIRED',
  'ANALYSIS_REPORT_TIMEOUT',
  'RECOMMENDED_MAKEUP_IMAGES_REQUIRED',
]);

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
          navigateMainTab(navigation, 'HomeTab');
        }}
        onCaptureCommitted={(result, upload) => {
          if (!commitUnifiedFaceCapture(result, upload)) {
            return false;
          }

          navigation.replace(
            'FaceCaptureConfirmation',
            route.params?.afterAnalysisRoute
              ? {
                  afterAnalysisRoute: route.params.afterAnalysisRoute,
                  target: 'faceAnalysis',
                }
              : {target: 'faceAnalysis'},
          );
          return true;
        }}
        onFallback={() => {
          // 통합 촬영 실패 시 레거시 2단계 촬영으로 폴백하지 않는다(촬영 1회 경로만).
          // 홈으로 돌려보내 사용자가 통합 촬영을 다시 시작하게 한다. 실패 사유는
          // [aura:unified-face-capture] fallback-to-legacy 로그로 남는다.
          invalidateUnifiedFaceCapture({resetRetryAttempt: true});
          navigateMainTab(navigation, 'HomeTab');
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
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
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
    selectedFace3DProfile,
    selectedFaceCapture,
    setSelectedFaceAnalysisReport,
    setSelectedFaceGeometry2d,
    setSelectedFaceVerticalThirds,
    setSelectedPersonalColor,
    setSelectedPersonalColorCorrection,
    unifiedFaceCaptureFlow,
  } = useNavigationFlowState();
  const {clearSession} = useAuthSession();
  const [isAnalysisReady, setIsAnalysisReady] = React.useState(false);
  const [analysisErrorMessage, setAnalysisErrorMessage] = React.useState<string | null>(null);
  const [analysisRequestKey, setAnalysisRequestKey] = React.useState(0);
  const analysisRetryCountRef = React.useRef(0);
  const verticalThirdsPromiseRef =
    React.useRef<Promise<FaceVerticalThirdsResult | null> | null>(null);
  // 보고서 POST 가 대기하는 2D 기하 promise — POST deps 에 state 를 넣으면
  // 효과 재실행으로 이중 POST 가 나므로 반드시 ref 로만 전달한다.
  const faceGeometry2dPromiseRef =
    React.useRef<Promise<FaceGeometryResult | null> | null>(null);
  // Unity still-analysis lease: 진입 시 resume+ready 를 보장하는 promise.
  // 아래 정지영상 분석 효과들이 이 promise 를 체인해 시작 순서를 보장한다.
  const stillAnalysisReadyPromiseRef = React.useRef<Promise<boolean> | null>(null);
  // 퍼스널 컬러 outcome 전달 + end-lease 게이트 겸용. 보고서 POST 가 이 ref 로
  // outcome(보정 후 결과 포함)을 받아 measurements·measuredPersonalColor 를 싣는다.
  const personalColorOutcomePromiseRef =
    React.useRef<Promise<PersonalColorAnalysisOutcome | null> | null>(null);

  React.useEffect(() => {
    analysisRetryCountRef.current = 0;
  }, [selectedFaceCapture?.mediaId, selectedFaceCapture?.photoCaptureId]);

  // [Unity still-analysis lease 시작] 아래 정지영상 분석(세로비율·퍼스널컬러)은
  // Unity homuler(IMAGE 모드) 코루틴에서 돌므로 플레이어 루프가 실행 중이어야
  // 한다. 직전 3D 측정 화면은 teardown 에서 pause 한다(카메라 반납에 올바름) —
  // 그래서 로딩이 lease 를 잡아 resume+ready 를 보장하고, 분석이 모두 settle
  // 하면 아래 end-lease 효과가 pause 로 반납한다.
  // isFocused 가드: onBack 이 navigate 라 스택 하단에 stale 로딩 인스턴스가
  // 남을 수 있는데, 그 인스턴스가 촬영 화면 밑에서 Unity 를 resume 하면 안 된다.
  React.useEffect(() => {
    stillAnalysisReadyPromiseRef.current = null;

    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return;
    }

    stillAnalysisReadyPromiseRef.current = navigation.isFocused()
      ? ensureUnityMakeupRunningForStillAnalysis()
      : Promise.resolve(false);
  }, [navigation, selectedFaceCapture]);

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
    const unifiedHairline =
      unifiedFaceCaptureFlow.committedCapture?.result.hairline;
    const capturedHairline: FaceVerticalThirdsInput['capturedHairline'] =
      mapUnifiedHairlineToVerticalThirds(unifiedHairline);

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
          imageUri: selectedFaceCapture.imageUri,
          semanticMattes: selectedFaceCapture.semanticMattes,
          sessionId: captureId,
        }),
      )
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
  }, [
    selectedFaceCapture,
    setSelectedFaceVerticalThirds,
    unifiedFaceCaptureFlow.committedCapture,
  ]);

  // 2D 기하 지표도 캡처당 1회 온디바이스로 계산한다. 같은 imageUri 라 Unity
  // 랜드마크 검출은 requestFaceLandmarks dedup 으로 세로비율과 1회를 공유한다.
  // 실패는 null 로 격리하고, 보고서 POST 는 ref 의 promise 로만 대기한다.
  React.useEffect(() => {
    setSelectedFaceGeometry2d(null);
    faceGeometry2dPromiseRef.current = null;

    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return undefined;
    }

    let isMounted = true;
    const captureId = selectedFaceCapture.photoCaptureId;

    // still-analysis lease 의 resume+ready 뒤에 시작한다 (ready 실패여도 진행 —
    // 서비스가 자체 타임아웃/미탑재를 결과 status 로 흡수한다).
    faceGeometry2dPromiseRef.current = (
      stillAnalysisReadyPromiseRef.current ?? Promise.resolve(false)
    )
      .then(() =>
        analyzeFaceGeometry2d({
          captureId,
          createdAt: new Date().toISOString(),
          imageUri: selectedFaceCapture.imageUri,
          sessionId: captureId,
        }),
      )
      .then(result => {
        if (isMounted) {
          setSelectedFaceGeometry2d(result);
        }

        return result;
      })
      .catch(error => {
        console.info('[aura:face-geometry] analysis:error', {
          message: error instanceof Error ? error.message : String(error),
        });

        return null;
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFaceCapture, setSelectedFaceGeometry2d]);

  // 퍼스널 컬러도 캡처당 1회 온디바이스로 진단한다. 측정 데이터 3-반영 규칙:
  // outcome(보정 후 reported)은 화면 표시와 함께 보고서 POST(AI 입력·서버 저장)
  // 에도 실린다. 실패는 null 격리 — 보고서 생성 자체는 막지 않는다.
  React.useEffect(() => {
    setSelectedPersonalColor(null);
    setSelectedPersonalColorCorrection(null);
    personalColorOutcomePromiseRef.current = null;

    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return undefined;
    }

    let isMounted = true;
    const captureId = selectedFaceCapture.photoCaptureId;

    // outcome 을 반환해 ref 에 남긴다 — POST 의 measurements 입력 + end-lease
    // settle 게이트 겸용 (undefined resolve 였던 종전 체인의 버그 수정).
    personalColorOutcomePromiseRef.current = (
      stillAnalysisReadyPromiseRef.current ?? Promise.resolve(false)
    )
      .then(() =>
        analyzePersonalColorCapture({
          // 셔터 시점 카메라 메타(WB gains 등) — 조명 보정(sclera/WB)의 입력.
          cameraMetadata: selectedFaceCapture.cameraMetadata ?? null,
          captureId,
          createdAt: new Date().toISOString(),
          imageUri: selectedFaceCapture.imageUri,
          sessionId: captureId,
        }),
      )
      .then(outcome => {
        if (isMounted) {
          // 보정 우선 표시: 조명 보정 성공 시 corrected 를 메인으로(조명 불변성),
          // 실패 시 baseline 유지 + 미적용 사유를 배지로 노출(조용한 실패 금지).
          // reported = 저장(writeResultJson)과 동일한 보고 메인 결과(보정 우선).
          setSelectedPersonalColor(outcome.reported);
          setSelectedPersonalColorCorrection(
            derivePersonalColorCorrectionStatus(outcome),
          );
        }

        return outcome;
      })
      .catch(error => {
        console.info('[aura:personal-color] analysis:error', {
          message: error instanceof Error ? error.message : String(error),
        });

        return null;
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFaceCapture, setSelectedPersonalColor, setSelectedPersonalColorCorrection]);

  React.useEffect(() => {
    setIsAnalysisReady(false);
    setAnalysisErrorMessage(null);
    setSelectedFaceAnalysisReport(null);

    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return undefined;
    }

    let isMounted = true;
    let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;

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

        if (!verticalThirds || !faceGeometry || !personalColorOutcome) {
          console.warn('[aura:analysis] on-device-axis:degraded', {
            faceGeometry2d: Boolean(faceGeometry),
            faceVerticalThirds: Boolean(verticalThirds),
            personalColor: Boolean(personalColorOutcome),
            timeoutMs: STILL_ANALYSIS_WAIT_TIMEOUT_MS,
          });
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
            faceGeometry2d: faceGeometry,
            faceVerticalThirds: verticalThirds,
            personalColor: personalColorOutcome,
          },
        );
      })
      .then(report => {
        if (!isMounted || !report) {
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
    selectedFace3DProfile,
    setSelectedFaceAnalysisReport,
  ]);

  // [Unity still-analysis lease 반납] 정지영상 분석이 모두 settle 하면 플레이어를
  // pause 해 자원(카메라 포함)을 반납한다. unmount 후에는 pause 하지 않는다 —
  // stale 인스턴스의 뒤늦은 pause 가 다음 Unity 소유 화면(AR 필터·3D 측정)을
  // 얼리는 것을 막기 위해서다(그 화면들이 자기 생명주기로 관리).
  React.useEffect(() => {
    if (!shouldCreateFaceAnalysisReportFromCapture(selectedFaceCapture)) {
      return undefined;
    }

    let cancelled = false;

    void Promise.allSettled([
      verticalThirdsPromiseRef.current ?? Promise.resolve(null),
      faceGeometry2dPromiseRef.current ?? Promise.resolve(null),
      personalColorOutcomePromiseRef.current ?? Promise.resolve(null),
    ]).then(() => {
      if (!cancelled && navigation.isFocused()) {
        setUnityMakeupPlayerPaused(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [navigation, selectedFaceCapture]);

  const handleRetryAnalysis = React.useCallback(() => {
    analysisRetryCountRef.current = 0;
    setAnalysisErrorMessage(null);
    setIsAnalysisReady(false);
    setAnalysisRequestKey(currentKey => currentKey + 1);
  }, []);
  const handleAnalysisComplete = React.useCallback(() => {
    if (!navigation.isFocused()) {
      return;
    }

    // replace: 로딩을 스택에서 제거한다. navigate로 남겨두면 다음 분석 세션에서
    // 캡처 교체 시 이 화면의 효과들이 백그라운드로 재실행돼 보고서 POST가 중복되고,
    // 완료 자동 이동이 새 흐름(3D 측정 등) 위를 덮는 문제가 있었다.
    if (route.params?.afterAnalysisRoute === 'ProductRecommendation') {
      navigation.replace('ProductRecommendation');
      return;
    }

    navigation.replace('FaceAnalysisReportDetail');
  }, [navigation, route.params?.afterAnalysisRoute]);

  return (
    <DetailRouteChrome
      routeName="FaceAnalysisLoading"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <FaceAnalysisLoadingScreen
        analysisErrorMessage={analysisErrorMessage}
        capturedPhotoUri={selectedFaceCapture?.imageUri}
        isAnalysisReady={isAnalysisReady}
        onBack={() => navigateMainTab(navigation, 'HomeTab')}
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
  const {
    selectedFaceAnalysisReport,
    selectedFaceCapture,
    selectedFaceVerticalThirds,
    selectedPersonalColor,
    setSelectedFaceAnalysisReport,
  } = useNavigationFlowState();

  const handleDeleteReport = React.useCallback(
    async (reportId: string) => {
      await deleteFaceAnalysisReport(reportId);
      setSelectedFaceAnalysisReport(currentReport =>
        currentReport?.id === reportId ? null : currentReport,
      );
      navigation.navigate('FaceAnalysisReportsList');
    },
    [navigation, setSelectedFaceAnalysisReport],
  );

  return (
    <FaceAnalysisReportPreviewScreen
      analysisReport={selectedFaceAnalysisReport}
      capturedPhotoUri={selectedFaceCapture?.imageUri}
      onBack={() =>
        shouldReturnToProfile ? navigateMainTab(navigation, 'ProfileTab') : navigation.goBack()
      }
      onCreateARFilter={() => navigation.navigate('MakeupRecommendation')}
      onDeleteReport={handleDeleteReport}
      onPressProducts={reportId => navigation.navigate('ProductRecommendation', {reportId})}
      onRetake={() => navigation.navigate('FaceCapture')}
      personalColor={route.params?.reportId ? null : selectedPersonalColor}
      reportId={route.params?.reportId ?? null}
      sessionCaptureId={selectedFaceCapture?.photoCaptureId ?? null}
      verticalThirds={route.params?.reportId ? null : selectedFaceVerticalThirds}
    />
  );
}
