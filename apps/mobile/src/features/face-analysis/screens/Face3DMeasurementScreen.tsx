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
import type {Face3DProfile, Face3DStatus} from '../../face-3d/types';
import {colors, radius, spacing, typography} from '../../../shared/theme';

// 측정 화면 전용 안내 문구 — 랩 패널의 STATUS_COPY와 별도 사본(랩은 실험용 카피를
// 독자적으로 바꿀 수 있어야 하므로 결합하지 않는다).
const STATUS_COPY: Record<Face3DStatus, string> = {
  blocked: '이 기기에서는 3D 측정을 사용할 수 없어 다음 단계로 이동합니다.',
  collecting: '표정과 고개를 고정한 채 잠시만 기다려 주세요.',
  completed: '3D 측정이 완료되었습니다.',
  error: '3D 측정에 실패해 다음 단계로 이동합니다.',
  idle: '얼굴을 타원 안에 맞추면 자동으로 측정합니다.',
  preparing: '3D 측정을 준비하고 있습니다.',
  tracking: '정면을 보고 얼굴 윤곽이 안정될 때까지 유지해 주세요.',
};

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
  const {cancel, isActive, start, state} = useFace3DAnalysis();
  const [nativeViewRevision, setNativeViewRevision] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
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

  // 네이티브 뷰 준비 → 플레이어 재개 + 프리뷰 표시 + 측정 자동 시작(1회).
  useEffect(() => {
    if (!nativeViewReady || startedRef.current) {
      return;
    }
    startedRef.current = true;

    setUnityMakeupPlayerPaused(false);
    setPreviewActive(true);
    setNativeViewRevision(current => current + 1);
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      start();
    }, AUTO_START_DELAY_MS);
  }, [nativeViewReady, start]);

  // 종착 상태 감지 — completed는 profile, blocked/error(타임아웃 포함)는 null로
  // 정확히 1회 종료한다. 3D 실패는 보고서 생성을 막지 않는다.
  useEffect(() => {
    if (state.status === 'completed') {
      finishOnce(state.profile ?? null);
      return;
    }
    if (state.status === 'blocked' || state.status === 'error') {
      finishOnce(null);
    }
  }, [finishOnce, state.profile, state.status]);

  const handleSkip = useCallback(() => {
    cancel();
    finishOnce(null);
  }, [cancel, finishOnce]);

  const progress = state.targetFrameCount > 0
    ? Math.min(1, state.validFrameCount / state.targetFrameCount)
    : 0;

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
          <Text style={styles.subtitle}>{state.message ?? STATUS_COPY[state.status]}</Text>
        </View>
        <View
          pointerEvents="box-none"
          style={[styles.bottomOverlay, {paddingBottom: insets.bottom + spacing.xl}]}>
          <View style={styles.progressCard}>
            <Text style={styles.frameCount}>
              {state.validFrameCount}/{state.targetFrameCount || 30}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]} />
            </View>
          </View>
          <Pressable
            accessibilityLabel="3D 측정 건너뛰기"
            accessibilityRole="button"
            disabled={!isActive && state.status !== 'idle'}
            onPress={handleSkip}
            style={styles.skipButton}>
            <Text style={styles.skipButtonLabel}>건너뛰기</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  frameCount: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
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
