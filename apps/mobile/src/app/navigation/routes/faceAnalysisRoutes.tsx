import React from 'react';
import {Pressable, StyleSheet, useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {YStack} from 'tamagui';

import {
  createFaceAnalysisReportFromCapture,
  FaceAnalysisIntroScreen,
  FaceAnalysisReportDetailScreen,
  FaceAnalysisReportsListScreen,
} from '../../../features/face-analysis';
import {FaceAnalysisLoadingScreen} from '../../../features/face-analysis/screens/FaceAnalysisLoadingScreen';
import {Face3DMeasurementScreen} from '../../../features/face-analysis/screens/Face3DMeasurementScreen';
import {isUnityMakeupNativeViewSupported} from '../../../features/ar/components/UnityMakeupNativeView';
import {
  ensureUnityMakeupRunningForStillAnalysis,
  setUnityMakeupPlayerPaused,
} from '../../../features/ar/services/unityMakeupBridge';
import {evaluateFace3DEntryEligibility} from '../../../features/face-3d/services/face3DEntryEligibility';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {derivePersonalColorCorrectionStatus} from '../../../features/face-analysis/services/faceAnalysisMeasurements';
import {raceWithNullTimeout} from '../../../features/face-analysis/services/stillAnalysisWait';
import {buildFaceGeometryAnalysisPayload} from '../../../features/face-geometry/services/faceGeometryAiPayload';
import {analyzeFaceGeometry2d} from '../../../features/face-geometry/services/faceGeometryService';
import type {FaceGeometryResult} from '../../../features/face-geometry/types';
import {buildFaceVerticalThirdsAnalysisPayload} from '../../../features/face-ratio/services/faceVerticalThirdsAiPayload';
import {analyzeFaceVerticalThirds} from '../../../features/face-ratio/services/faceVerticalThirdsService';
import type {FaceVerticalThirdsResult} from '../../../features/face-ratio/types';
import {MakeupExtractionActionSheet} from '../../../features/home/components/MakeupExtractionActionSheet';
import {MakeupFeedbackActionSheet} from '../../../features/home/components/MakeupFeedbackActionSheet';
import {
  analyzePersonalColorCapture,
  type PersonalColorAnalysisOutcome,
} from '../../../features/personal-color/services/personalColorService';
import {useAuthSession} from '../../../features/auth';
import {FaceCaptureTutorialSheet} from '../../../features/onboarding';
import {BackendApiError} from '../../../shared/services/backendApi';
import {deleteFaceAnalysisReport} from '../../../shared/services/faceAnalysisService';
import {colors, spacing} from '../../../shared/theme';
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
import {navigateMainTab, type RootNavigation, type RootScreenProps} from './routeUtils';

type HeaderShareAction = {
  cb: () => void;
};

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
    setSelectedFace3DProfile,
    setSelectedFaceCapture,
    setSelectedFaceCaptureGreenlight,
  } = useNavigationFlowState();
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

    // still-analysis lease 의 resume+ready 뒤에 시작한다 (ready 실패여도 진행 —
    // 서비스가 자체 타임아웃/미탑재를 null 강등으로 흡수한다).
    verticalThirdsPromiseRef.current = (
      stillAnalysisReadyPromiseRef.current ?? Promise.resolve(false)
    )
      .then(() =>
        analyzeFaceVerticalThirds({
          captureId,
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
  }, [selectedFaceCapture, setSelectedFaceVerticalThirds]);

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
          selectedFace3DProfile ?? undefined,
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
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisReportDetail'>) {
  const insets = useSafeAreaInsets();
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const {
    selectedFace3DProfile,
    selectedFaceAnalysisReport,
    selectedFaceCapture,
    selectedFaceGeometry2d,
    selectedFaceVerticalThirds,
    selectedPersonalColor,
    selectedPersonalColorCorrection,
    setSelectedFaceAnalysisReport,
  } = useNavigationFlowState();
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );
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
  const footerBottomInset = Math.max(insets.bottom, spacing.md);
  const currentReportId = route.params?.reportId ?? selectedFaceAnalysisReport?.id ?? null;

  return (
    <DetailRouteChrome
      backgroundColor={colors.surfaceMuted}
      headerMode="overlay"
      reserveOverlayHeaderSpace={false}
      routeName="FaceAnalysisReportDetail"
      onOpenDocumentList={() => navigation.navigate('FaceAnalysisReportsList')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <>
        <FaceAnalysisReportDetailScreen
          analysisReport={selectedFaceAnalysisReport}
          bottomOverlayHeight={getFaceAnalysisReportFooterReservedHeight(footerBottomInset)}
          capturedPhotoUri={selectedFaceCapture?.imageUri}
          onCreateARFilter={() => navigation.navigate('MakeupRecommendation')}
          onDeleteReport={handleDeleteReport}
          onHeaderShareActionChange={handleHeaderShareActionChange}
          onPressProducts={reportId =>
            navigation.navigate('ProductRecommendation', {reportId})
          }
          face3d={route.params?.reportId ? null : selectedFace3DProfile}
          faceGeometry2d={route.params?.reportId ? null : selectedFaceGeometry2d}
          personalColor={route.params?.reportId ? null : selectedPersonalColor}
          personalColorCorrection={
            route.params?.reportId ? null : selectedPersonalColorCorrection
          }
          reportId={route.params?.reportId ?? null}
          // 세션 캡처 ID — 화면이 "세션 props vs 서버 복원 measurements" 를
          // identity(captureId 일치)로 판정하는 기준. id 없는 진입(AR 복귀 등)
          // 에서 다른 보고서에 stale 세션 측정값이 얹히는 것을 막는다.
          sessionCaptureId={selectedFaceCapture?.photoCaptureId ?? null}
          verticalThirds={route.params?.reportId ? null : selectedFaceVerticalThirds}
        />
        <FaceAnalysisReportBottomNav
          currentReportId={currentReportId}
          navigation={navigation}
        />
      </>
    </DetailRouteChrome>
  );
}

function FaceAnalysisReportBottomNav({
  currentReportId,
  navigation,
}: {
  currentReportId: string | null;
  navigation: RootNavigation;
}) {
  const insets = useSafeAreaInsets();
  const {height: windowHeight} = useWindowDimensions();
  const [isExtractionSheetVisible, setIsExtractionSheetVisible] = React.useState(false);
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = React.useState(false);
  const [isFloatingActionMenuExpanded, setIsFloatingActionMenuExpanded] =
    React.useState(false);
  const {
    floatingActionButtonPosition,
    floatingActionIds,
    floatingActionInteractionMode,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();
  const footerBottomInset = Math.max(insets.bottom, spacing.md);

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
    setSelectedRecommendedMakeupFilterId(null);
    setSelectedReferenceMakeupPhoto(null);

    requestAnimationFrame(() => {
      navigation.navigate('ReferenceMakeupExtractionUpload', {initialSource});
    });
  }, [
    navigation,
    setSelectedRecommendedMakeupFilterId,
    setSelectedReferenceMakeupPhoto,
  ]);

  const startMakeupFeedback = React.useCallback((photoSource: 'camera' | 'gallery') => {
    setIsFeedbackSheetVisible(false);
    setMakeupFeedbackResult(null);
    setSelectedMakeupFeedbackPhoto({photoSource});

    requestAnimationFrame(() => {
      if (photoSource === 'camera') {
        navigation.navigate('MakeupFeedbackCapture');
        return;
      }

      navigation.navigate('MakeupFeedbackAlbumUpload');
    });
  }, [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto]);

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
        <AppFooter
          actionSlotPosition={floatingActionButtonPosition}
          actionSlot={
            <FloatingActionMenu
              actionIds={floatingActionIds}
              buttonPosition={floatingActionButtonPosition}
              interactionMode={floatingActionInteractionMode}
              isExpanded={isFloatingActionMenuExpanded}
              onExpandedChange={setIsFloatingActionMenuExpanded}
              onPressSettings={handleFloatingActionSettingsPress}
              onSelectAction={handleSelectFloatingAction}
              placement="inline"
            />
          }
          activeTab="profile"
          bottomInset={insets.bottom}
          floating
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
