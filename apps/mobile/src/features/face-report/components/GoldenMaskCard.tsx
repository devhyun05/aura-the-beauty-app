import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {UnityMakeupNativeView} from '../../ar/components/UnityMakeupNativeView';
import {
  addUnityGoldenMaskEventListener,
  captureUnityGoldenMaskPoster,
  resetUnityGoldenMaskView,
  setUnityGoldenMaskRotation,
  setUnityGoldenMaskWireframeVisible,
} from '../../ar/services/unityMakeupBridge';
import type {GoldenMaskReportDescriptor} from '../../../shared/contracts/goldenMask';
import type {StoryReportPagerRef} from '../../../shared/ui/StoryReportPager';
import type {PhotoSlotData} from '../reportTypes';
import {
  disposePreparedGoldenMask,
  getPreparedGoldenMask,
  preloadGoldenMaskForReport,
} from '../services/goldenMaskPreloadService';
import {resolveGoldenMaskRotation} from '../services/goldenMaskInteraction';
import {PhotoSlot} from '../visuals/PhotoSlot';
import {color} from '../reportTokens';

type GoldenMaskCardProps = {
  active: boolean;
  descriptor: GoldenMaskReportDescriptor;
  layout?: 'standalone' | 'evidence';
  onInteractionChange?: (interacting: boolean) => void;
  onPosterUnavailable?: () => void;
  onPosterReady?: (fileUri: string) => void;
  pagerRef: React.RefObject<StoryReportPagerRef | null>;
  posterRequestKey?: number;
  reportId: string;
  sourcePhoto?: PhotoSlotData;
};

type ViewerStatus = 'loading' | 'ready' | 'error';

export function GoldenMaskCard({
  active,
  descriptor,
  layout = 'standalone',
  onInteractionChange,
  onPosterUnavailable,
  onPosterReady,
  pagerRef,
  posterRequestKey = 0,
  reportId,
  sourcePhoto,
}: GoldenMaskCardProps) {
  const evidenceLayout = layout === 'evidence';
  const preparedAtRender = getPreparedGoldenMask(
    reportId,
    descriptor.topologyFingerprint,
  );
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<ViewerStatus>(
    preparedAtRender ? 'ready' : 'loading',
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [wireframeVisible, setWireframeVisible] = useState(false);
  const requestIdRef = useRef(preparedAtRender?.requestId ?? '');
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const dragStartRef = useRef({pitch: 0, yaw: 0});
  const lastTapAtRef = useRef(0);
  const lastPosterRequestKeyRef = useRef(0);
  const setInteractionLocked = useCallback(
    (locked: boolean) => {
      pagerRef.current?.setPagingEnabled(!locked);
      onInteractionChange?.(locked);
    },
    [onInteractionChange, pagerRef],
  );

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let mounted = true;
    const startedAt = Date.now();
    yawRef.current = 0;
    pitchRef.current = 0;
    setWireframeVisible(false);
    const prepared = getPreparedGoldenMask(
      reportId,
      descriptor.topologyFingerprint,
    );
    if (prepared) {
      requestIdRef.current = prepared.requestId;
      setUnityGoldenMaskWireframeVisible({
        requestId: prepared.requestId,
        visible: false,
      });
      setStatus('ready');
    } else {
      setStatus('loading');
    }
    setErrorMessage('');
    console.info('[aura:golden-mask] viewer:start', {
      preloaded: Boolean(prepared),
      reportId,
      requestId: prepared?.requestId,
    });

    const subscription = addUnityGoldenMaskEventListener(event => {
      if (!mounted || event.requestId !== requestIdRef.current) {
        return;
      }
      console.info('[aura:golden-mask] unity:event', {
        requestId: event.requestId,
        type: event.type,
      });
      if (event.type === 'golden_mask_poster_ready') {
        onPosterReady?.(event.fileUri);
        return;
      }
      if (event.type === 'golden_mask_poster_failed') {
        // Poster export is optional. Keep the interactive mesh ready and let
        // report sharing continue without its static Golden Mask page.
        onPosterUnavailable?.();
        return;
      }
      if (event.type === 'golden_mask_failed') {
        setStatus('error');
        setErrorMessage('3D 얼굴을 표시하지 못했어요. 다시 시도해 주세요.');
      }
    });

    void (async () => {
      const result =
        prepared ??
        (await preloadGoldenMaskForReport(reportId, descriptor));
      console.info('[aura:golden-mask] viewer:prepared', {
        elapsedMs: Date.now() - startedAt,
        ready: result.ready,
        requestId: result.requestId,
      });
      if (!mounted) {
        return;
      }
      requestIdRef.current = result.requestId;
      if (!result.ready) {
        throw new Error('3D 얼굴 뷰어를 준비하지 못했어요.');
      }
      setUnityGoldenMaskWireframeVisible({
        requestId: result.requestId,
        visible: false,
      });
      setStatus('ready');
    })().catch(error => {
      console.info('[aura:golden-mask] viewer:error', {
        message: error instanceof Error ? error.message : String(error),
        requestId: requestIdRef.current,
      });
      if (mounted) {
        setStatus('error');
        setErrorMessage('골든마스크를 불러오지 못했어요. 다시 시도해 주세요.');
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
      setInteractionLocked(false);
    };
  }, [
    active,
    descriptor,
    onPosterReady,
    onPosterUnavailable,
    pagerRef,
    reportId,
    retryKey,
    setInteractionLocked,
  ]);

  useEffect(() => {
    if (
      !active ||
      status !== 'ready' ||
      posterRequestKey <= lastPosterRequestKeyRef.current
    ) {
      return;
    }
    lastPosterRequestKeyRef.current = posterRequestKey;
    captureUnityGoldenMaskPoster(requestIdRef.current);
  }, [active, posterRequestKey, status]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          status === 'ready' &&
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          status === 'ready' &&
          Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
        onPanResponderGrant: () => {
          dragStartRef.current = {
            pitch: pitchRef.current,
            yaw: yawRef.current,
          };
          setInteractionLocked(true);
        },
        onPanResponderMove: (_, gesture) => {
          const requestId = requestIdRef.current;
          const {pitch, yaw} = resolveGoldenMaskRotation(
            dragStartRef.current,
            gesture,
          );
          yawRef.current = yaw;
          pitchRef.current = pitch;
          setUnityGoldenMaskRotation({pitch, requestId, yaw});
        },
        onPanResponderRelease: (_, gesture) => {
          setInteractionLocked(false);
          if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5) {
            return;
          }
          const now = Date.now();
          if (now - lastTapAtRef.current <= 280) {
            yawRef.current = 0;
            pitchRef.current = 0;
            resetUnityGoldenMaskView(requestIdRef.current);
            lastTapAtRef.current = 0;
          } else {
            lastTapAtRef.current = now;
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          setInteractionLocked(false);
        },
        onShouldBlockNativeResponder: () => true,
        onStartShouldSetPanResponder: () => status === 'ready',
        onStartShouldSetPanResponderCapture: () => status === 'ready',
      }),
    [setInteractionLocked, status],
  );

  return (
    <View style={[styles.root, evidenceLayout ? styles.evidenceRoot : null]}>
      {!evidenceLayout ? (
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>GOLDEN MASK</Text>
          <Text accessibilityRole="header" style={styles.title}>
            나의 3D 페이스
          </Text>
          <Text style={styles.description}>
            TrueDepth로 측정한 얼굴 표면을 나만의 Golden Mask로 담았어요.
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.viewer,
          evidenceLayout ? styles.evidenceViewer : null,
        ]}>
        <View
          accessibilityActions={[{name: 'activate', label: '정면으로 돌아가기'}]}
          accessibilityHint="좌우로 드래그하면 옆모습까지, 위아래로 드래그하면 높은 각도와 낮은 각도를 볼 수 있습니다. 두 번 탭하면 정면으로 돌아갑니다."
          accessibilityLabel="골든마스크 3D 얼굴"
          accessibilityRole="image"
          onAccessibilityAction={() => {
            yawRef.current = 0;
            pitchRef.current = 0;
            resetUnityGoldenMaskView(requestIdRef.current);
          }}
          style={styles.interactionSurface}
          {...panResponder.panHandlers}>
          {active ? (
            <UnityMakeupNativeView
              pointerEvents="none"
              runtimeMode="still"
              style={styles.unityView}
            />
          ) : null}

          {status === 'ready' && !evidenceLayout ? (
            <View pointerEvents="none" style={styles.proofBadge}>
              <Text style={styles.proofBadgeText}>
                TRUEDEPTH · DEPTH INCLUDED
              </Text>
            </View>
          ) : null}

          {status === 'loading' ? (
            <View style={styles.stateOverlay}>
              <ActivityIndicator color={color.muted} size="small" />
              <Text style={styles.stateTitle}>골든마스크를 준비하고 있어요</Text>
              <Text style={styles.stateDescription}>잠시만 기다려 주세요.</Text>
            </View>
          ) : null}

          {status === 'error' ? (
            <View style={styles.stateOverlay}>
              <Text style={styles.stateTitle}>골든마스크를 열지 못했어요</Text>
              <Text style={styles.stateDescription}>{errorMessage}</Text>
              <Pressable
                accessibilityLabel="골든마스크 다시 불러오기"
                accessibilityRole="button"
                onPress={() => {
                  disposePreparedGoldenMask(reportId);
                  requestIdRef.current = '';
                  setWireframeVisible(false);
                  setRetryKey(value => value + 1);
                }}
                style={({pressed}) => [
                  styles.retryButton,
                  pressed ? styles.retryButtonPressed : null,
                ]}>
                <Text style={styles.retryText}>다시 시도</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {status === 'ready' ? (
          <Pressable
            accessibilityHint="얼굴 표면의 삼각형 메시 선을 표시하거나 숨깁니다."
            accessibilityLabel="3D 얼굴 메시 선"
            accessibilityRole="switch"
            accessibilityState={{checked: wireframeVisible}}
            hitSlop={8}
            onPress={() => {
              const visible = !wireframeVisible;
              setWireframeVisible(visible);
              setUnityGoldenMaskWireframeVisible({
                requestId: requestIdRef.current,
                visible,
              });
            }}
            style={({pressed}) => [
              styles.meshToggle,
              wireframeVisible ? styles.meshToggleActive : null,
              pressed ? styles.meshTogglePressed : null,
            ]}>
            <View
              style={[
                styles.meshToggleDot,
                wireframeVisible ? styles.meshToggleDotActive : null,
              ]}
            />
            <Text
              style={[
                styles.meshToggleText,
                wireframeVisible ? styles.meshToggleTextActive : null,
              ]}>
              메시
            </Text>
          </Pressable>
        ) : null}

        {status === 'ready' && evidenceLayout ? (
          <>
            {sourcePhoto ? (
              <View
                accessible
                accessibilityLabel="3D 얼굴과 비교할 원본 얼굴 사진"
                accessibilityRole="image"
                pointerEvents="none"
                style={styles.sourcePhotoBadge}>
                <View style={styles.sourcePhotoRing}>
                  <PhotoSlot
                    shape="circle"
                    slot={sourcePhoto}
                    style={styles.sourcePhoto}
                  />
                </View>
                <Text style={styles.sourcePhotoLabel}>원본 비교</Text>
              </View>
            ) : null}
            <View pointerEvents="none" style={styles.summaryProof}>
              <Text style={styles.summaryProofText}>TRUEDEPTH · 3D</Text>
            </View>
            <View pointerEvents="none" style={styles.summaryGesture}>
              <Text style={styles.summaryGestureText}>드래그해 확인</Text>
            </View>
          </>
        ) : null}
      </View>

      {!evidenceLayout ? (
        <Text style={styles.hint}>
          좌우·위아래로 회전 · 두 번 탭하여 정면 보기
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  copy: {
    gap: 5,
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  description: {
    color: color.text,
    fontFamily: 'Pretendard',
    fontSize: 12.5,
    lineHeight: 19,
  },
  eyebrow: {
    color: color.accentDeep,
    fontFamily: 'Pretendard',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  hint: {
    color: color.muted,
    fontFamily: 'Pretendard',
    fontSize: 11,
    paddingBottom: 16,
    textAlign: 'center',
  },
  interactionSurface: {
    ...StyleSheet.absoluteFill,
  },
  meshToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(248,247,242,0.90)',
    borderColor: 'rgba(42,44,42,0.16)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    position: 'absolute',
    right: 14,
    top: 14,
    zIndex: 3,
  },
  meshToggleActive: {
    backgroundColor: color.accentDeep,
    borderColor: color.accentDeep,
  },
  meshToggleDot: {
    backgroundColor: color.muted,
    borderRadius: 999,
    height: 5,
    width: 5,
  },
  meshToggleDotActive: {
    backgroundColor: color.white,
  },
  meshTogglePressed: {
    opacity: 0.72,
  },
  meshToggleText: {
    color: color.ink,
    fontFamily: 'Pretendard',
    fontSize: 10,
    fontWeight: '700',
  },
  meshToggleTextActive: {
    color: color.white,
  },
  proofBadge: {
    backgroundColor: 'rgba(20,24,24,0.62)',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    borderWidth: 1,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    top: 14,
  },
  proofBadgeText: {
    color: 'rgba(255,255,255,0.86)',
    fontFamily: 'Pretendard',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  retryButton: {
    backgroundColor: color.ink,
    borderRadius: 999,
    marginTop: 7,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonPressed: {
    opacity: 0.72,
  },
  retryText: {
    color: color.white,
    fontFamily: 'Pretendard',
    fontSize: 12,
    fontWeight: '700',
  },
  root: {
    backgroundColor: color.surface,
    flex: 1,
    gap: 14,
  },
  sourcePhoto: {
    height: 52,
    width: 52,
  },
  sourcePhotoBadge: {
    alignItems: 'center',
    bottom: 14,
    gap: 5,
    left: 14,
    position: 'absolute',
    zIndex: 3,
  },
  sourcePhotoLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontFamily: 'Pretendard',
    fontSize: 9.5,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 3,
  },
  sourcePhotoRing: {
    backgroundColor: color.surface,
    borderColor: color.white,
    borderRadius: 999,
    borderWidth: 2,
    padding: 2,
  },
  stateDescription: {
    color: color.text,
    fontFamily: 'Pretendard',
    fontSize: 11.5,
    lineHeight: 17,
    maxWidth: 220,
    textAlign: 'center',
  },
  stateOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: color.surface2,
    gap: 7,
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: color.ink,
    fontFamily: 'Pretendard',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  title: {
    color: color.ink,
    fontFamily: 'Pretendard',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  unityView: {
    ...StyleSheet.absoluteFill,
  },
  summaryGesture: {
    bottom: 24,
    position: 'absolute',
    right: 17,
    zIndex: 2,
  },
  summaryGestureText: {
    color: 'rgba(255,255,255,0.76)',
    fontFamily: 'Pretendard',
    fontSize: 9.5,
    fontWeight: '600',
  },
  summaryProof: {
    bottom: 25,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 2,
  },
  summaryProofText: {
    color: 'rgba(156,201,219,0.92)',
    fontFamily: 'Pretendard',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  evidenceRoot: {
    backgroundColor: 'transparent',
    flex: 0,
    gap: 0,
  },
  evidenceViewer: {
    backgroundColor: '#050709',
    borderColor: 'rgba(22,48,59,0.12)',
    borderRadius: 28,
    flex: 0,
    height: 320,
    marginHorizontal: 0,
    minHeight: 0,
  },
  viewer: {
    backgroundColor: color.surface2,
    borderColor: color.outline8,
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 16,
    minHeight: 280,
    overflow: 'hidden',
  },
});
