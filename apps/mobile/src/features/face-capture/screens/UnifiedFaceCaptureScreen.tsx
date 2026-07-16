import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {UnityMakeupNativeView} from '../../ar/components/UnityMakeupNativeView';
import {colors, radius, spacing, typography} from '../../../shared/theme';
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
  onCancel: () => void;
  onCaptureCommitted: (
    result: UnifiedFaceCaptureCompletedEvent,
    upload: FaceCaptureUploadResult,
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
  onCancel,
  onCaptureCommitted,
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
    onCancel,
    onCaptureCommitted,
    onFallback,
    onRequestStarted,
  });
  const committedCaptureIdRef = React.useRef<string | null>(null);
  const fallbackReasonRef = React.useRef<string | null>(null);
  const isAbandoningRef = React.useRef(false);
  const isMountedRef = React.useRef(true);
  const isUploadingRef = React.useRef(false);
  const uploadImageRef = React.useRef(uploadImage);
  callbacksRef.current = {
    onCancel,
    onCaptureCommitted,
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

    fallbackReasonRef.current = fallbackReason;
    isAbandoningRef.current = true;
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
        if (!callbacksRef.current.onCaptureCommitted(completed, upload)) {
          isAbandoningRef.current = true;
          await deleteUnifiedFaceCaptureTempImage(completed.image.uri);
          callbacksRef.current.onFallback('unified_capture_commit_rejected');
          return;
        }
        committedCaptureIdRef.current = completed.captureId;
      } catch (error) {
        isAbandoningRef.current = true;
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
    void attemptUpload(completed);
  }, [attemptUpload, captureState.completed]);

  const advisoryMessage = getHairlineMessage(captureState.gate?.hairline.status);
  const isBusy = captureState.isCapturing || isUploading;
  const canCapture = Boolean(
    captureState.gate?.finalCaptureGreenlight &&
      !captureState.completed &&
      !captureState.blocked &&
      !captureState.error &&
      !isBusy,
  );
  const canRetryUpload = Boolean(
    captureState.completed && uploadError && !isUploading,
  );

  return (
    <View style={styles.container}>
      <UnityMakeupNativeView style={styles.preview} />
      <View pointerEvents="none" style={styles.faceGuide} />
      <SafeAreaView edges={['top', 'bottom']} style={styles.overlay}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="통합 얼굴 촬영 닫기"
            accessibilityRole="button"
            onPress={() => {
              isAbandoningRef.current = true;
              captureState.cancel('user_closed');
              void cleanupUncommittedImage(captureState.completed).finally(() => {
                callbacksRef.current.onCancel();
              });
            }}
            style={styles.closeButton}>
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>

        <View style={styles.guideCard}>
          <Text style={styles.title}>얼굴을 프레임 안에 맞춰 주세요</Text>
          <Text style={styles.description}>
            한 번 촬영하면 사진·색·2D·3D 정보를 함께 준비해요.
          </Text>
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
              onPress={captureState.capture}
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
