import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {
  UnityMakeupNativeView,
  useUnityMakeupNativeViewReady,
} from '../../ar/components/UnityMakeupNativeView';
import {
  hideUnityMakeupView,
  setUnityMakeupPlayerPaused,
} from '../../ar/services/unityMakeupBridge';
import {useFace3DAnalysis} from '../hooks/useFace3DAnalysis';
import {useFace3DSemanticCapture} from '../hooks/useFace3DSemanticCapture';
import {
  createFace3DSemanticCaptureSetId,
  type Face3DSemanticCaptureShotKind,
} from '../services/face3DSemanticCaptureContract';
import type {Face3DStatus} from '../types';
import {Face3DMetricGrid} from './Face3DMetricGrid';

export type Face3DCaptureReference = {
  capturedAt: string;
  imageUri: string;
  photoCaptureId: string;
};

type Face3DAnalysisPanelProps = {
  captureReference: Face3DCaptureReference;
  onOpenVerticalThirds?: () => void;
  onRetake: () => void;
};

const STATUS_COPY: Record<Face3DStatus, {label: string; guidance: string}> = {
  blocked: {
    guidance: '지원 기기와 UnityFramework 포함 여부를 확인해 주세요.',
    label: '실행 차단',
  },
  collecting: {
    guidance: '표정과 고개를 고정한 채 잠시만 기다려 주세요.',
    label: '유효 프레임 수집',
  },
  completed: {
    guidance: '지표와 품질 정보를 확인할 수 있습니다.',
    label: '추출 완료',
  },
  error: {
    guidance: '얼굴을 정면에 맞춘 뒤 다시 시도해 주세요.',
    label: '추출 실패',
  },
  idle: {
    guidance: '얼굴을 프레임 안에 맞추고 측정을 시작하세요.',
    label: '측정 대기',
  },
  preparing: {
    guidance: 'ARKit Face Tracking 세션을 준비하고 있습니다.',
    label: '카메라 준비',
  },
  tracking: {
    guidance: '정면을 보고 얼굴 윤곽이 안정될 때까지 유지해 주세요.',
    label: '얼굴 추적',
  },
};

function getPrimaryLabel(status: Face3DStatus): string {
  if (status === 'preparing' || status === 'tracking' || status === 'collecting') {
    return '측정 취소';
  }
  if (status === 'completed') {
    return '다시 측정';
  }
  if (status === 'blocked' || status === 'error') {
    return '다시 시도';
  }
  return '3D 측정 시작';
}

export function Face3DAnalysisPanel({
  captureReference,
  onOpenVerticalThirds,
  onRetake,
}: Face3DAnalysisPanelProps) {
  const insets = useSafeAreaInsets();
  const nativeViewReady = useUnityMakeupNativeViewReady();
  const {cancel, isActive, start, state} = useFace3DAnalysis();
  const semanticCapture = useFace3DSemanticCapture();
  const [semanticCaptureSetId, setSemanticCaptureSetId] = useState(
    () => createFace3DSemanticCaptureSetId(),
  );
  const [semanticSubjectOrdinal, setSemanticSubjectOrdinal] = useState(1);
  const [completedSemanticShots, setCompletedSemanticShots] = useState<
    Face3DSemanticCaptureShotKind[]
  >([]);
  const [nativeViewRevision, setNativeViewRevision] = useState(0);
  const [previewActive, setPreviewActive] = useState(false);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusCopy = STATUS_COPY[state.status];
  const progress = state.targetFrameCount > 0
    ? Math.min(1, state.validFrameCount / state.targetFrameCount)
    : 0;
  const semanticCaptureActive =
    semanticCapture.state.status === 'preparing' || semanticCapture.state.status === 'capturing';

  useEffect(() => {
    return () => {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
      }
      hideUnityMakeupView();
      setUnityMakeupPlayerPaused(true);
    };
  }, []);

  useEffect(() => {
    if (!nativeViewReady) {
      return;
    }

    // The first RN photo is only a reference image. Semantic capture and metric
    // extraction use a separate live ARKit/TrueDepth session, so that camera
    // must stay visible while the user frames the actual mesh capture.
    setUnityMakeupPlayerPaused(false);
    setPreviewActive(true);
    setNativeViewRevision(current => current + 1);
  }, [nativeViewReady]);

  useEffect(() => {
    const shotKind = semanticCapture.state.captureShotKind;
    if (semanticCapture.state.status !== 'exported' || !shotKind) {
      return;
    }
    setCompletedSemanticShots(previous =>
      previous.includes(shotKind) ? previous : [...previous, shotKind],
    );
  }, [
    semanticCapture.state.capturePairId,
    semanticCapture.state.captureShotKind,
    semanticCapture.state.status,
  ]);

  const handlePrimaryAction = () => {
    if (semanticCaptureActive) {
      return;
    }
    if (isActive) {
      cancel();
      return;
    }

    semanticCapture.reset();
    setUnityMakeupPlayerPaused(false);
    setPreviewActive(true);
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      start();
    }, 160);
  };

  const handleRetake = () => {
    cancel();
    semanticCapture.reset();
    setPreviewActive(false);
    hideUnityMakeupView();
    setUnityMakeupPlayerPaused(true);
    onRetake();
  };

  const handleOpenVerticalThirds = () => {
    cancel();
    semanticCapture.reset();
    setPreviewActive(false);
    hideUnityMakeupView();
    setUnityMakeupPlayerPaused(true);
    onOpenVerticalThirds?.();
  };

  const handleSemanticCapture = (captureShotKind: Face3DSemanticCaptureShotKind) => {
    if (isActive || semanticCaptureActive) {
      return;
    }

    semanticCapture.reset();
    setUnityMakeupPlayerPaused(false);
    setPreviewActive(true);
    startTimerRef.current = setTimeout(() => {
      startTimerRef.current = null;
      semanticCapture.start(captureShotKind, semanticCaptureSetId);
    }, 160);
  };

  const handleNextSemanticSubject = () => {
    if (isActive || semanticCaptureActive) {
      return;
    }
    semanticCapture.reset();
    setCompletedSemanticShots([]);
    setSemanticCaptureSetId(createFace3DSemanticCaptureSetId());
    setSemanticSubjectOrdinal(previous => previous + 1);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + spacing.xxl,
            paddingTop: insets.top + spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>AURA FACIAL LAB</Text>
            <Text style={styles.title}>ARKit 3D 얼굴 특성 추출</Text>
            <Text style={styles.subtitle}>
              첫 사진은 실험 기준 기록입니다. 아래 실시간 화면이 실제 ARKit 얼굴 메시를 수집하는 두 번째 카메라입니다.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="사진 다시 촬영"
            accessibilityRole="button"
            onPress={handleRetake}
            style={styles.textButton}>
            <Text style={styles.textButtonLabel}>다시 촬영</Text>
          </Pressable>
        </View>

        <View style={styles.preview}>
          {nativeViewReady && previewActive ? (
            <UnityMakeupNativeView key={nativeViewRevision} />
          ) : (
            <View style={styles.previewFallback}>
              <Text style={styles.previewFallbackTitle}>
                {nativeViewReady ? '측정을 시작하면 미리보기가 열립니다' : 'ARKit 얼굴 메시 미리보기 대기'}
              </Text>
              <Text style={styles.previewFallbackText}>
                Face3D Unity 런타임이 포함된 iPhone 실기기 빌드에서 활성화됩니다.
              </Text>
            </View>
          )}
          <View pointerEvents="none" style={styles.framingHint}>
            <Text style={styles.framingHintText}>이마와 턱을 모두 타원 안에 맞추세요</Text>
          </View>
          <View pointerEvents="none" style={styles.faceGuide} />
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                state.status === 'completed' ? styles.statusDotReady : null,
                state.status === 'blocked' || state.status === 'error'
                  ? styles.statusDotError
                  : null,
              ]}
            />
            <Text style={styles.statusPillText}>{statusCopy.label}</Text>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusHeaderCopy}>
              <Text style={styles.statusTitle}>{statusCopy.label}</Text>
              <Text style={styles.statusGuidance}>{state.message ?? statusCopy.guidance}</Text>
            </View>
            <Text style={styles.frameCount}>
              {state.validFrameCount}/{state.targetFrameCount || 30}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, {width: `${Math.round(progress * 100)}%`}]} />
          </View>
          <Text style={styles.captureReference} numberOfLines={1}>
            기준 촬영 ID · {captureReference.photoCaptureId}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={semanticCaptureActive}
          onPress={handlePrimaryAction}
          style={[styles.primaryButton, semanticCaptureActive ? styles.buttonDisabled : null]}>
          <Text style={styles.primaryButtonLabel}>{getPrimaryLabel(state.status)}</Text>
        </Pressable>

        <View style={styles.semanticCaptureSection}>
          <View style={styles.semanticCaptureSetHeader}>
            <Text style={styles.semanticCaptureTitle}>시맨틱 후보용 메시 캡처</Text>
            <Text style={styles.semanticCaptureSetStatus}>
              사람 {semanticSubjectOrdinal} · {completedSemanticShots.length}/3
            </Text>
          </View>
          <Text style={styles.statusGuidance}>정면을 먼저 저장한 뒤 고개만 약 15° 돌려 좌우를 저장하세요.</Text>
          <View style={styles.semanticCaptureRow}>
            {([
              ['neutral', '정면'],
              ['yawLeft', '왼쪽 15°'],
              ['yawRight', '오른쪽 15°'],
            ] as const).map(([captureShotKind, label]) => (
              <Pressable
                accessibilityHint="ARKit 정점, 삼각형, UV와 색칠 후보 생성용 기준 프레임을 기기 Documents에 저장합니다."
                accessibilityRole="button"
                disabled={isActive || semanticCaptureActive}
                key={captureShotKind}
                onPress={() => handleSemanticCapture(captureShotKind)}
                style={[
                  styles.semanticCaptureButton,
                  completedSemanticShots.includes(captureShotKind)
                    ? styles.semanticCaptureButtonCompleted
                    : null,
                  isActive || semanticCaptureActive ? styles.buttonDisabled : null,
                ]}>
                <Text style={styles.semanticCaptureButtonLabel}>
                  {semanticCaptureActive && semanticCapture.state.captureShotKind === captureShotKind
                    ? '저장 중…'
                    : completedSemanticShots.includes(captureShotKind)
                      ? `✓ ${label}`
                      : label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityHint="현재 세 캡처를 보존하고 다음 사람의 새 캡처 세트를 시작합니다."
            accessibilityRole="button"
            disabled={isActive || semanticCaptureActive}
            onPress={handleNextSemanticSubject}
            style={[
              styles.semanticNextSubjectButton,
              isActive || semanticCaptureActive ? styles.buttonDisabled : null,
            ]}>
            <Text style={styles.semanticNextSubjectButtonLabel}>다음 사람 촬영 시작</Text>
          </Pressable>
        </View>

        {semanticCapture.state.status !== 'idle' ? (
          <View style={styles.metadataCard}>
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Calibration</Text>
              <Text selectable style={styles.metadataValue}>
                {semanticCapture.state.status}
              </Text>
            </View>
            {semanticCapture.state.captureShotKind ? (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Pose</Text>
                <Text selectable style={styles.metadataValue}>
                  {semanticCapture.state.captureShotKind}
                </Text>
              </View>
            ) : null}
            {semanticCapture.state.captureSetId ? (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Set</Text>
                <Text selectable style={styles.metadataValue}>
                  {semanticCapture.state.captureSetId}
                </Text>
              </View>
            ) : null}
            {semanticCapture.state.relativeDirectory ? (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Export</Text>
                <Text selectable style={styles.metadataValue}>
                  {semanticCapture.state.relativeDirectory}
                </Text>
              </View>
            ) : null}
            {semanticCapture.state.meshVertexCount ? (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Mesh</Text>
                <Text selectable style={styles.metadataValue}>
                  v {semanticCapture.state.meshVertexCount} · i {semanticCapture.state.meshIndexCount ?? '—'} · uv {semanticCapture.state.meshUvCount ?? '—'}
                </Text>
              </View>
            ) : null}
            <Text selectable style={styles.statusGuidance}>
              {semanticCapture.state.detail ??
                (semanticCapture.state.status === 'exported'
                  ? 'Mac으로 캡처 폴더를 가져온 뒤 face3d:semantic:candidates 명령을 실행하세요.'
                  : '정면 무표정을 유지해 주세요.')}
            </Text>
          </View>
        ) : null}

        {state.profile || state.topologyFingerprint ? (
          <>
            <View style={styles.metadataCard}>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Gate</Text>
                <Text selectable style={styles.metadataValue}>
                  {state.profile?.gateVersion ?? 'face3d-gate-v1'}
                </Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Topology</Text>
                <Text selectable style={styles.metadataValue}>
                  {state.profile?.topologyFingerprint ?? state.topologyFingerprint}
                </Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Mesh</Text>
                <Text selectable style={styles.metadataValue}>
                  v {state.meshVertexCount ?? '—'} · i {state.meshIndexCount ?? '—'} · uv {state.meshUvCount ?? '—'}
                </Text>
              </View>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Face count</Text>
                <Text selectable style={styles.metadataValue}>
                  current {state.currentMaximumFaceCount ?? '—'} / supported {state.supportedFaceCount ?? '—'}
                </Text>
              </View>
              {state.profile ? (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Source</Text>
                <Text selectable style={styles.metadataValue}>{state.profile.source}</Text>
              </View>
              ) : null}
            </View>
            {state.profile ? <Face3DMetricGrid profile={state.profile} /> : null}
          </>
        ) : null}

        {state.warnings.length > 0 ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>측정 경고</Text>
            {state.warnings.map(warning => (
              <Text key={warning} selectable style={styles.warningText}>• {warning}</Text>
            ))}
          </View>
        ) : null}

        {onOpenVerticalThirds ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleOpenVerticalThirds}
            style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>기존 2D 세로비율 결과 보기</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: {
    opacity: 0.45,
  },
  captureReference: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  faceGuide: {
    alignSelf: 'center',
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 130,
    borderWidth: 1,
    height: 242,
    marginTop: 28,
    width: 184,
  },
  frameCount: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  framingHint: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    borderRadius: radius.pill,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  framingHintText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  metadataCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  metadataLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    width: 72,
  },
  metadataRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  metadataValue: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  preview: {
    backgroundColor: colors.black,
    borderRadius: radius.lg,
    height: 320,
    overflow: 'hidden',
    position: 'relative',
  },
  previewFallback: {
    alignItems: 'center',
    bottom: 0,
    gap: spacing.sm,
    justifyContent: 'center',
    left: 0,
    padding: spacing.xxl,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewFallbackText: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  previewFallbackTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  progressFill: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: '100%',
  },
  progressTrack: {
    backgroundColor: colors.divider,
    borderRadius: radius.pill,
    height: 6,
    overflow: 'hidden',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.xl,
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  semanticCaptureButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: spacing.sm,
  },
  semanticCaptureButtonCompleted: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.guideReady,
  },
  semanticCaptureButtonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  semanticCaptureRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  semanticCaptureSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  semanticCaptureSetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  semanticCaptureSetStatus: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  semanticCaptureTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  semanticNextSubjectButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  semanticNextSubjectButtonLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  statusDot: {
    backgroundColor: colors.textTertiary,
    borderRadius: radius.pill,
    height: 8,
    width: 8,
  },
  statusDotError: {
    backgroundColor: colors.danger,
  },
  statusDotReady: {
    backgroundColor: colors.guideReady,
  },
  statusGuidance: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  statusHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  statusHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  statusPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: radius.pill,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
  },
  statusPillText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  statusTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  textButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  textButtonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  warningCard: {
    backgroundColor: '#FFF8F6',
    borderColor: '#F4D8D2',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  warningText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  warningTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
