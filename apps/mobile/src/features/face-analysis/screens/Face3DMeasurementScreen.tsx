import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  UnityMakeupNativeView,
  useUnityMakeupNativeViewReady,
} from '../../ar/components/UnityMakeupNativeView';
import {
  hideUnityMakeupView,
  setUnityMakeupPlayerPaused,
} from '../../ar/services/unityMakeupBridge';
import {useFace3DAnalysis} from '../../face-3d/hooks/useFace3DAnalysis';
import type {Face3DProfile} from '../../face-3d/types';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  FACE_3D_PREFLIGHT_COPY,
  getFace3DFailureAction,
  getFace3DRemainingSeconds,
  getFace3DStatusCopy,
  shouldStartFace3DMeasurement,
} from '../services/faceAnalysisCaptureGuidance';

// 자동 시작 지연 — Unity 플레이어 resume 직후 첫 프레임이 오기 전에 start()가
// 나가면 준비 폴링이 헛돌 수 있어, 랩 패널과 동일하게 한 박자 늦춘다.
const AUTO_START_DELAY_MS = 160;

type Face3DMeasurementScreenProps = {
  // 측정이 어떤 이유로든 끝나면 정확히 1회 호출된다.
  // 성공 시 profile, 실패/차단/건너뛰기 시 null — 호출측은 로딩으로 진행한다.
  onFinish: (profile: Face3DProfile | null) => void;
};

export function Face3DMeasurementScreen({onFinish}: Face3DMeasurementScreenProps) {
  const insets = useSafeAreaInsets();
  const nativeViewReady = useUnityMakeupNativeViewReady();
  const {cancel, start, state} = useFace3DAnalysis();
  const [attemptCount, setAttemptCount] = useState(0);
  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  const [nativeViewRevision, setNativeViewRevision] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const finishedRef = useRef(false);
  // onFinish가 리렌더마다 바뀌어도 효과가 재실행되지 않도록 ref로 고정한다.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const finishOnce = useCallback((profile: Face3DProfile | null) => {
    if (finishedRef.current) {
      return;
    }
    finishedRef.current = true;
    onFinishRef.current(profile);
  }, []);

  const beginMeasurement = useCallback(() => {
    if (finishedRef.current || startingRef.current) {
      return;
    }

    startingRef.current = true;
    setUnityMakeupPlayerPaused(false);
    setPreviewActive(true);
    setNativeViewRevision(current => current + 1);
    setAttemptCount(current => current + 1);

    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
    }

    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      startingRef.current = false;
      start();
    }, AUTO_START_DELAY_MS);
  }, [start]);

  // 마운트 해제 시 세션·프리뷰 정리(카메라 반납). 측정 화면은 replace로 떠나므로
  // 정리는 여기 한 곳으로 충분하다.
  useEffect(() => {
    return () => {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
      }
      cancel();
      hideUnityMakeupView();
      setUnityMakeupPlayerPaused(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 사용자 안내 확인 + 네이티브 뷰 준비가 모두 끝난 뒤 첫 측정을 시작한다.
  useEffect(() => {
    if (
      !shouldStartFace3DMeasurement({
        attemptCount,
        instructionsAccepted,
        nativeViewReady,
      })
    ) {
      return;
    }
    beginMeasurement();
  }, [attemptCount, beginMeasurement, instructionsAccepted, nativeViewReady]);

  // 성공만 자동 종료한다. 실패는 화면에 남겨 사용자가 재시도하거나 건너뛴다.
  useEffect(() => {
    if (state.status === 'completed') {
      finishOnce(state.profile ?? null);
    }
  }, [finishOnce, state.profile, state.status]);

  const handleAcceptInstructions = useCallback(() => {
    setInstructionsAccepted(true);
  }, []);

  const handleReviewInstructions = useCallback(() => {
    cancel();
    hideUnityMakeupView();
    setUnityMakeupPlayerPaused(true);
    setPreviewActive(false);
    setAttemptCount(0);
    setInstructionsAccepted(false);
  }, [cancel]);

  const handleSkip = useCallback(() => {
    cancel();
    finishOnce(null);
  }, [cancel, finishOnce]);

  const progress = state.targetFrameCount > 0
    ? Math.min(1, state.validFrameCount / state.targetFrameCount)
    : 0;
  const remainingSeconds = getFace3DRemainingSeconds(
    state.validFrameCount,
    state.targetFrameCount,
  );
  const hasFailure = state.status === 'blocked' || state.status === 'error';
  const failureAction = getFace3DFailureAction(attemptCount);

  if (!instructionsAccepted) {
    return (
      <View
        style={[
          styles.preflightScreen,
          {
            paddingBottom: insets.bottom + spacing.xl,
            paddingTop: insets.top + spacing.xxl,
          },
        ]}>
        <StatusBar style="dark" />
        <View style={styles.preflightHeader}>
          <Text style={styles.preflightEyebrow}>STEP 2 OF 2</Text>
          <Text style={styles.preflightTitle}>{FACE_3D_PREFLIGHT_COPY.title}</Text>
          <Text style={styles.preflightDescription}>
            {FACE_3D_PREFLIGHT_COPY.description}
          </Text>
        </View>

        <View style={styles.preflightChecklist}>
          {['정면을 바라보기', '입술을 편하게 다물기', '표정과 고개를 유지하기'].map(
            (item, index) => (
              <View key={item} style={styles.preflightChecklistRow}>
                <View style={styles.preflightChecklistNumber}>
                  <Text style={styles.preflightChecklistNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.preflightChecklistText}>{item}</Text>
              </View>
            ),
          )}
        </View>

        <View style={styles.preflightSpacer} />
        <Text style={styles.preflightFootnote}>
          얼굴이 가이드에 맞으면 셔터 없이 자동으로 시작해요.
        </Text>
        <Pressable
          accessibilityLabel={FACE_3D_PREFLIGHT_COPY.action}
          accessibilityRole="button"
          onPress={handleAcceptInstructions}
          style={({pressed}) => [
            styles.preflightButton,
            pressed ? styles.buttonPressed : null,
          ]}>
          <Text style={styles.preflightButtonText}>{FACE_3D_PREFLIGHT_COPY.action}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.preview}>
        {nativeViewReady && previewActive ? (
          <UnityMakeupNativeView key={nativeViewRevision} style={styles.previewFill} />
        ) : (
          <View style={styles.previewFallback}>
            <Text style={styles.previewFallbackText}>3D 카메라 준비 중…</Text>
          </View>
        )}
        <View pointerEvents="none" style={styles.faceGuide} />
        <View pointerEvents="none" style={[styles.copyOverlay, {top: insets.top + spacing.xl}]}>
          <Text style={styles.title}>3D 얼굴 측정</Text>
          <Text accessibilityLiveRegion="polite" style={styles.subtitle}>
            {getFace3DStatusCopy(state.status)}
          </Text>
        </View>
        <View
          pointerEvents="box-none"
          style={[styles.bottomOverlay, {paddingBottom: insets.bottom + spacing.xl}]}>
          {hasFailure ? (
            <View style={styles.failureCard}>
              <Text style={styles.failureTitle}>3D 측정을 완료하지 못했어요</Text>
              <Text style={styles.failureDescription}>
                정면을 보고 입술을 편하게 다문 채 다시 시도해 주세요.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={
                  failureAction === 'retry' ? beginMeasurement : handleReviewInstructions
                }
                style={({pressed}) => [
                  styles.failureButton,
                  pressed ? styles.buttonPressed : null,
                ]}>
                <Text style={styles.failureButtonText}>
                  {failureAction === 'retry' ? '다시 측정' : '안내 다시 보기'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.progressCard}>
              <Text style={styles.frameCount}>
                {state.status === 'collecting'
                  ? `약 ${remainingSeconds}초 남았어요`
                  : '얼굴을 맞추고 있어요'}
              </Text>
              <Text style={styles.frameDetail}>
                {state.validFrameCount}/{state.targetFrameCount || 30} 유효 프레임
              </Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]} />
              </View>
            </View>
          )}
          <Pressable
            accessibilityLabel="3D 측정 건너뛰기"
            accessibilityRole="button"
            onPress={handleSkip}
            style={({pressed}) => [styles.skipButton, pressed ? styles.buttonPressed : null]}>
            <Text style={styles.skipButtonLabel}>건너뛰기</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonPressed: {
    opacity: 0.72,
  },
  bottomOverlay: {
    alignItems: 'center',
    bottom: 0,
    gap: spacing.md,
    left: 0,
    paddingHorizontal: spacing.xl,
    position: 'absolute',
    right: 0,
  },
  copyOverlay: {
    alignItems: 'center',
    gap: spacing.xs,
    left: spacing.xl,
    position: 'absolute',
    right: spacing.xl,
  },
  faceGuide: {
    alignSelf: 'center',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 170,
    borderWidth: 1,
    height: 320,
    marginTop: 160,
    width: 240,
  },
  failureButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  failureButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  failureCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
    width: '100%',
  },
  failureDescription: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  failureTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  frameCount: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  frameDetail: {
    color: 'rgba(255, 255, 255, 0.64)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  preflightButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: spacing.xl,
    width: '100%',
  },
  preflightButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  preflightChecklist: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  preflightChecklistNumber: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  preflightChecklistNumberText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  preflightChecklistRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  preflightChecklistText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  preflightDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  preflightEyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1.2,
    lineHeight: typography.lineHeight.xs,
  },
  preflightFootnote: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  preflightHeader: {
    gap: spacing.sm,
  },
  preflightScreen: {
    backgroundColor: colors.surface,
    flex: 1,
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  preflightSpacer: {
    flex: 1,
  },
  preflightTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xxl,
  },
  preview: {
    backgroundColor: colors.black,
    flex: 1,
  },
  previewFallback: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewFallbackText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  previewFill: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  progressCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: radius.lg,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    width: '100%',
  },
  progressFill: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
  },
  skipButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  skipButtonLabel: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  title: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
});
