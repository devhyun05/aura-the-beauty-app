import React from 'react';
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {UnityMakeupNativeView} from '../../ar/components/UnityMakeupNativeView';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {UnifiedFaceGuideOverlay} from '../components/UnifiedFaceGuideOverlay';
import {computeFaceEllipseGuideGeometry} from '../constants/faceEllipseGuide';
import {evaluateUnifiedFaceCaptureGreenlight} from '../services/unifiedFaceCaptureGreenlight';
import {useUnifiedFaceCapture} from '../hooks/useUnifiedFaceCapture';
import {
  buildUnifiedFaceCaptureRequest,
  type HairlineAdvisoryStatus,
  type UnifiedFaceCaptureCompletedEvent,
  type UnifiedFaceCaptureRequest,
} from '../services/unifiedFaceCaptureContract';
import {
  uploadFaceCaptureImage,
  type FaceCaptureImageInput,
  type FaceCaptureUploadResult,
} from '../services/faceCaptureUploadService';
import {deleteUnifiedFaceCaptureTempImage} from '../services/unifiedFaceCaptureTempImageCleanup';

type UnifiedFaceCaptureScreenProps = {
  onAbandonStarted?: () => void;
  onCancel: () => void;
  onCaptureCommitted: (
    result: UnifiedFaceCaptureCompletedEvent,
    upload: FaceCaptureUploadResult,
  ) => boolean | Promise<boolean>;
  onCaptureReadyForProcessing?: (
    result: UnifiedFaceCaptureCompletedEvent,
    loadingStartedAtMs: number,
  ) => boolean;
  onFallback: (reason: string) => void;
  onRequestStarted: (requestId: string) => void;
  request?: UnifiedFaceCaptureRequest;
  uploadImage?: (
    image: FaceCaptureImageInput,
  ) => Promise<FaceCaptureUploadResult>;
};

function getHairlineMessage(
  status: HairlineAdvisoryStatus | undefined,
): string | null {
  if (status === 'likely_occluded') {
    return '헤어라인을 보여주면 이마 비율까지 분석할 수 있어요.';
  }
  if (status === 'environment_issue') {
    return '조명을 밝게 하고 잠시 움직임을 멈춰 주세요.';
  }
  return null;
}

export function UnifiedFaceCaptureScreen({
  onAbandonStarted,
  onCancel,
  onCaptureCommitted,
  onCaptureReadyForProcessing,
  onFallback,
  onRequestStarted,
  request: providedRequest,
  uploadImage = uploadFaceCaptureImage,
}: UnifiedFaceCaptureScreenProps) {
  const defaultRequest = React.useMemo(
    () => buildUnifiedFaceCaptureRequest(),
    [],
  );
  const request = providedRequest ?? defaultRequest;
  const captureState = useUnifiedFaceCapture(request);
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const autoUploadCaptureIdRef = React.useRef<string | null>(null);
  const callbacksRef = React.useRef({
    onAbandonStarted,
    onCancel,
    onCaptureCommitted,
    onCaptureReadyForProcessing,
    onFallback,
    onRequestStarted,
  });
  const committedCaptureIdRef = React.useRef<string | null>(null);
  const fallbackReasonRef = React.useRef<string | null>(null);
  const isAbandoningRef = React.useRef(false);
  const isMountedRef = React.useRef(true);
  const isUploadingRef = React.useRef(false);
  const loadingStartedAtMsRef = React.useRef<number | null>(null);
  const uploadImageRef = React.useRef(uploadImage);
  callbacksRef.current = {
    onAbandonStarted,
    onCancel,
    onCaptureCommitted,
    onCaptureReadyForProcessing,
    onFallback,
    onRequestStarted,
  };
  uploadImageRef.current = uploadImage;

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    callbacksRef.current.onRequestStarted(request.requestId);
  }, [request.requestId]);

  const cleanupUncommittedImage = React.useCallback(
    (completed: UnifiedFaceCaptureCompletedEvent | null) => {
      if (
        !completed ||
        isUploadingRef.current ||
        committedCaptureIdRef.current === completed.captureId
      ) {
        return Promise.resolve(false);
      }

      // The upload reads this exact local file. Closing while it is in flight
      // marks the capture abandoned; attemptUpload deletes it after the read
      // completes instead of racing the uploader here.
      return deleteUnifiedFaceCaptureTempImage(completed.image.uri);
    },
    [],
  );

  React.useEffect(() => {
    const fallbackReason =
      captureState.blocked?.reason ?? captureState.error ?? null;
    if (!fallbackReason || fallbackReasonRef.current === fallbackReason) {
      return;
    }

    // 여기서 레거시 촬영 화면으로 넘어간다 — 사용자에게는 "촬영을 또 한다"로만
    // 보이므로, 넘어가는 사유를 반드시 남긴다.
    console.info('[aura:unified-face-capture] fallback-to-legacy', {
      blockedDetail: captureState.blocked?.detail,
      blockedWarnings: captureState.blocked?.warnings,
      reason: fallbackReason,
      source: captureState.blocked ? 'unity_blocked' : 'rn_error',
    });

    fallbackReasonRef.current = fallbackReason;
    isAbandoningRef.current = true;
    callbacksRef.current.onAbandonStarted?.();
    void cleanupUncommittedImage(captureState.completed).finally(() => {
      callbacksRef.current.onFallback(fallbackReason);
    });
  }, [
    captureState.blocked,
    captureState.completed,
    captureState.error,
    cleanupUncommittedImage,
  ]);

  const attemptUpload = React.useCallback(
    async (completed: UnifiedFaceCaptureCompletedEvent) => {
      if (
        isAbandoningRef.current ||
        isUploadingRef.current ||
        committedCaptureIdRef.current === completed.captureId
      ) {
        return;
      }

      isUploadingRef.current = true;
      if (isMountedRef.current) {
        setIsUploading(true);
        setUploadError(null);
      }

      let upload: FaceCaptureUploadResult;
      try {
        upload = await uploadImageRef.current({
          cameraMetadata: completed.cameraMetadata
            ? {
                exposureDurationMs:
                  completed.cameraMetadata.exposureDurationMs,
                iso: completed.cameraMetadata.iso,
              }
            : null,
          captureType: 'face_analysis',
          contentType:
            completed.image.format === 'png' ? 'image/png' : 'image/jpeg',
          height: completed.image.height,
          source: 'camera',
          uri: completed.image.uri,
          width: completed.image.width,
        });
      } catch (error) {
        if (isMountedRef.current) {
          setUploadError(error instanceof Error ? error.message : String(error));
        }
        return;
      } finally {
        isUploadingRef.current = false;
        if (isMountedRef.current) {
          setIsUploading(false);
        }
      }

      if (!isMountedRef.current || isAbandoningRef.current) {
        await deleteUnifiedFaceCaptureTempImage(completed.image.uri);
        return;
      }

      try {
        if (
          !(await callbacksRef.current.onCaptureCommitted(
            completed,
            upload,
          ))
        ) {
          isAbandoningRef.current = true;
          callbacksRef.current.onAbandonStarted?.();
          await deleteUnifiedFaceCaptureTempImage(completed.image.uri);
          callbacksRef.current.onFallback('unified_capture_commit_rejected');
          return;
        }
        committedCaptureIdRef.current = completed.captureId;
      } catch (error) {
        isAbandoningRef.current = true;
        callbacksRef.current.onAbandonStarted?.();
        console.info('[aura:unified-face-capture] commit:error', {
          message: error instanceof Error ? error.message : String(error),
        });
        await deleteUnifiedFaceCaptureTempImage(completed.image.uri);
        callbacksRef.current.onFallback('unified_capture_commit_failed');
      }
    },
    [],
  );

  React.useEffect(() => {
    const completed = captureState.completed;
    if (
      !completed ||
      autoUploadCaptureIdRef.current === completed.captureId
    ) {
      return;
    }

    autoUploadCaptureIdRef.current = completed.captureId;
    const handoff = callbacksRef.current.onCaptureReadyForProcessing;
    if (handoff) {
      try {
        if (
          handoff(
            completed,
            loadingStartedAtMsRef.current ?? Date.now(),
          )
        ) {
          return;
        }

        isAbandoningRef.current = true;
        callbacksRef.current.onAbandonStarted?.();
        void deleteUnifiedFaceCaptureTempImage(completed.image.uri).finally(() => {
          callbacksRef.current.onFallback(
            'unified_capture_processing_handoff_rejected',
          );
        });
      } catch (error) {
        isAbandoningRef.current = true;
        callbacksRef.current.onAbandonStarted?.();
        console.info('[aura:unified-face-capture] processing-handoff:error', {
          message: error instanceof Error ? error.message : String(error),
        });
        void deleteUnifiedFaceCaptureTempImage(completed.image.uri).finally(() => {
          callbacksRef.current.onFallback(
            'unified_capture_processing_handoff_failed',
          );
        });
      }
      return;
    }

    void attemptUpload(completed);
  }, [attemptUpload, captureState.completed]);

  const insets = useSafeAreaInsets();
  const [previewSize, setPreviewSize] = React.useState<{
    height: number;
    width: number;
  } | null>(null);
  const onPreviewLayout = React.useCallback((event: LayoutChangeEvent) => {
    const {height, width} = event.nativeEvent.layout;
    setPreviewSize(prev =>
      prev && prev.width === width && prev.height === height
        ? prev
        : {height, width},
    );
  }, []);

  const guide = React.useMemo(
    () =>
      previewSize
        ? computeFaceEllipseGuideGeometry({
            previewHeight: previewSize.height,
            previewWidth: previewSize.width,
          })
        : null,
    [previewSize],
  );

  // Unity gate 의 원시 신호 → 레거시 greenlight 판정(5/7/5 + pitch 7 + 중앙/거리).
  const greenlight = captureState.gate?.greenlight;
  const greenlightEvaluation = React.useMemo(
    () =>
      greenlight && guide && previewSize
        ? evaluateUnifiedFaceCaptureGreenlight({
            greenlight,
            guide,
            previewHeight: previewSize.height,
            previewWidth: previewSize.width,
          })
        : null,
    [greenlight, guide, previewSize],
  );

  const advisoryMessage = getHairlineMessage(captureState.gate?.hairline.status);
  const isBusy = captureState.isCapturing || isUploading;
  // 셔터 조건: Unity 네이티브 준비(finalCaptureGreenlight) + RN 프레이밍 판정(greenlit).
  // greenlight 신호가 아직 없는 구버전 빌드에서는 네이티브 게이트만으로 통과시킨다.
  const framingOk = greenlightEvaluation ? greenlightEvaluation.greenlit : true;
  const canCapture = Boolean(
    captureState.gate?.finalCaptureGreenlight &&
      framingOk &&
      !captureState.completed &&
      !captureState.blocked &&
      !captureState.error &&
      !isBusy,
  );
  const canRetryUpload = Boolean(
    captureState.completed && uploadError && !isUploading,
  );
  const cancelCaptureFlow = () => {
    isAbandoningRef.current = true;
    callbacksRef.current.onAbandonStarted?.();
    captureState.cancel('user_closed');
    void cleanupUncommittedImage(captureState.completed).finally(() => {
      callbacksRef.current.onCancel();
    });
  };

  return (
    <View style={styles.container} onLayout={onPreviewLayout}>
      <UnityMakeupNativeView style={styles.preview} />
      {guide && greenlightEvaluation ? (
        <UnifiedFaceGuideOverlay
          evaluation={greenlightEvaluation}
          guide={guide}
          messageBottom={Math.max(insets.bottom + 64, (previewSize?.height ?? 0) * 0.1) + 98}
        />
      ) : (
        <View pointerEvents="none" style={styles.faceGuide} />
      )}
      <SafeAreaView edges={['top', 'bottom']} style={styles.overlay}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="통합 얼굴 촬영 닫기"
            accessibilityRole="button"
            onPress={cancelCaptureFlow}
            style={styles.closeButton}>
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>

        {/* 프레이밍 안내는 greenlight 오버레이가 담당한다. 이 카드는 헤어라인
            advisory·업로드 오류 등 오버레이 밖 메시지가 있을 때만 뜬다.
            (greenlight 신호가 없는 구버전 빌드에서만 고정 안내를 폴백으로 보인다.) */}
        {!greenlightEvaluation || advisoryMessage || uploadError ? (
          <View style={styles.guideCard}>
            {!greenlightEvaluation ? (
              <>
                <Text style={styles.title}>얼굴을 프레임 안에 맞춰 주세요</Text>
                <Text style={styles.description}>
                  한 번 촬영하면 사진·색·2D·3D 정보를 함께 준비해요.
                </Text>
              </>
            ) : null}
            {advisoryMessage ? (
              <Text style={styles.advisory}>{advisoryMessage}</Text>
            ) : null}
            {uploadError ? (
              <Text style={styles.error}>
                사진은 기기에 남아 있어요. 네트워크를 확인한 뒤 업로드만 다시
                시도해 주세요.
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.bottomArea}>
          {isBusy ? <ActivityIndicator color={colors.white} size="small" /> : null}
          {canRetryUpload && captureState.completed ? (
            <Pressable
              accessibilityLabel="통합 얼굴 촬영 업로드 다시 시도"
              accessibilityRole="button"
              onPress={() => {
                void attemptUpload(captureState.completed!);
              }}
              style={styles.retryButton}>
              <Text style={styles.retryButtonText}>업로드 다시 시도</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel="통합 얼굴 촬영"
              accessibilityRole="button"
              disabled={!canCapture}
              onPress={() => {
                loadingStartedAtMsRef.current = Date.now();
                captureState.capture();
              }}
              style={[
                styles.shutterOuter,
                !canCapture && styles.shutterDisabled,
              ]}>
              <View style={styles.shutterInner} />
            </Pressable>
          )}
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            {isUploading
              ? '분석 사진을 저장하고 있어요'
              : captureState.isCapturing
                ? '얼굴 정보를 측정하고 있어요'
                : uploadError
                  ? '촬영 결과를 유지하고 있어요'
                  : canCapture
                    ? '촬영할 수 있어요'
                    : '얼굴과 자세를 맞추고 있어요'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  advisory: {
    color: '#FFE08A',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.sm,
  },
  bottomArea: {
    alignItems: 'center',
    gap: spacing.md,
  },
  closeButton: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  container: {
    backgroundColor: colors.black,
    flex: 1,
  },
  description: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.xs,
  },
  error: {
    color: '#FFB4AB',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.sm,
  },
  faceGuide: {
    alignSelf: 'center',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 170,
    borderWidth: 1,
    height: 320,
    marginTop: 160,
    position: 'absolute',
    width: 240,
  },
  guideCard: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: radius.lg,
    marginTop: spacing.lg,
    maxWidth: 360,
    padding: spacing.lg,
    width: '90%',
  },
  headerRow: {
    alignItems: 'flex-end',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  preview: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.xl,
  },
  retryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  shutterDisabled: {
    opacity: 0.4,
  },
  shutterInner: {
    backgroundColor: colors.white,
    borderRadius: 28,
    height: 56,
    width: 56,
  },
  shutterOuter: {
    alignItems: 'center',
    borderColor: colors.white,
    borderRadius: 36,
    borderWidth: 3,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  statusText: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
  },
  title: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
});
