import React, {useEffect, useMemo, useRef, useState} from 'react';
import * as FileSystem from 'expo-file-system/legacy';
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
  isUnityMakeupFrameworkAvailable,
  isUnityMakeupReady,
  loadUnityGoldenMask,
  prepareUnityMakeupRuntime,
  resetUnityGoldenMaskView,
  setUnityGoldenMaskRotation,
  unloadUnityGoldenMask,
} from '../../ar/services/unityMakeupBridge';
import type {GoldenMaskReportDescriptor} from '../../../shared/contracts/goldenMask';
import type {StoryReportPagerRef} from '../../../shared/ui/StoryReportPager';
import {downloadGoldenMaskForReport} from '../services/goldenMaskReportService';

type GoldenMaskCardProps = {
  active: boolean;
  descriptor: GoldenMaskReportDescriptor;
  onPosterUnavailable?: () => void;
  onPosterReady?: (fileUri: string) => void;
  pagerRef: React.RefObject<StoryReportPagerRef | null>;
  posterRequestKey?: number;
  reportId: string;
};

type ViewerStatus = 'loading' | 'ready' | 'error';

const READY_TIMEOUT_MS = 6_000;
const LOAD_TIMEOUT_MS = 10_000;
const YAW_LIMIT = 38;
const PITCH_LIMIT = 15;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function createRequestId(reportId: string): string {
  return `golden-mask:${reportId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function waitForUnityReady(): Promise<boolean> {
  if (isUnityMakeupReady()) {
    return Promise.resolve(true);
  }
  prepareUnityMakeupRuntime();
  return new Promise(resolve => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (isUnityMakeupReady()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
        clearInterval(timer);
        resolve(false);
      }
    }, 120);
  });
}

export function GoldenMaskCard({
  active,
  descriptor,
  onPosterUnavailable,
  onPosterReady,
  pagerRef,
  posterRequestKey = 0,
  reportId,
}: GoldenMaskCardProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState<ViewerStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const requestIdRef = useRef('');
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const dragStartRef = useRef({pitch: 0, yaw: 0});
  const lastTapAtRef = useRef(0);
  const lastPosterRequestKeyRef = useRef(0);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    let mounted = true;
    let loadTimeout: ReturnType<typeof setTimeout> | null = null;
    let downloadedFileUri: string | null = null;
    const deleteDownloadedFile = () => {
      const fileUri = downloadedFileUri;
      downloadedFileUri = null;
      if (fileUri) {
        void FileSystem.deleteAsync(fileUri, {idempotent: true}).catch(
          () => undefined,
        );
      }
    };
    const requestId = createRequestId(reportId);
    requestIdRef.current = requestId;
    yawRef.current = 0;
    pitchRef.current = 0;
    setStatus('loading');
    setErrorMessage('');

    const subscription = addUnityGoldenMaskEventListener(event => {
      if (!mounted || event.requestId !== requestId) {
        return;
      }
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
      if (loadTimeout) {
        clearTimeout(loadTimeout);
        loadTimeout = null;
      }
      if (event.type === 'golden_mask_ready') {
        deleteDownloadedFile();
        setStatus('ready');
        return;
      }
      if (event.type === 'golden_mask_failed') {
        deleteDownloadedFile();
        setStatus('error');
        setErrorMessage('3D 얼굴을 표시하지 못했어요. 다시 시도해 주세요.');
      }
    });

    void (async () => {
      if (!isUnityMakeupFrameworkAvailable()) {
        throw new Error('이 빌드에서는 3D 얼굴 뷰어를 사용할 수 없어요.');
      }
      const [{fileUri}, ready] = await Promise.all([
        downloadGoldenMaskForReport(reportId, descriptor),
        waitForUnityReady(),
      ]);
      downloadedFileUri = fileUri;
      if (!mounted) {
        deleteDownloadedFile();
        return;
      }
      if (!ready || !loadUnityGoldenMask({fileUri, requestId})) {
        throw new Error('3D 얼굴 뷰어를 준비하지 못했어요.');
      }
      loadTimeout = setTimeout(() => {
        if (mounted) {
          deleteDownloadedFile();
          setStatus('error');
          setErrorMessage('골든마스크를 불러오는 데 시간이 오래 걸리고 있어요.');
        }
      }, LOAD_TIMEOUT_MS);
    })().catch(() => {
      deleteDownloadedFile();
      if (mounted) {
        setStatus('error');
        setErrorMessage('골든마스크를 불러오지 못했어요. 다시 시도해 주세요.');
      }
    });

    return () => {
      mounted = false;
      if (loadTimeout) {
        clearTimeout(loadTimeout);
      }
      subscription.remove();
      unloadUnityGoldenMask(requestId);
      deleteDownloadedFile();
      pagerRef.current?.setPagingEnabled(true);
    };
  }, [
    active,
    descriptor,
    onPosterReady,
    onPosterUnavailable,
    pagerRef,
    reportId,
    retryKey,
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
        onPanResponderGrant: () => {
          dragStartRef.current = {
            pitch: pitchRef.current,
            yaw: yawRef.current,
          };
          pagerRef.current?.setPagingEnabled(false);
        },
        onPanResponderMove: (_, gesture) => {
          const requestId = requestIdRef.current;
          const yaw = clamp(
            dragStartRef.current.yaw + gesture.dx * 0.28,
            -YAW_LIMIT,
            YAW_LIMIT,
          );
          const pitch = clamp(
            dragStartRef.current.pitch - gesture.dy * 0.2,
            -PITCH_LIMIT,
            PITCH_LIMIT,
          );
          yawRef.current = yaw;
          pitchRef.current = pitch;
          setUnityGoldenMaskRotation({pitch, requestId, yaw});
        },
        onPanResponderRelease: (_, gesture) => {
          pagerRef.current?.setPagingEnabled(true);
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
        onPanResponderTerminate: () => {
          pagerRef.current?.setPagingEnabled(true);
        },
        onStartShouldSetPanResponder: () => status === 'ready',
      }),
    [pagerRef, status],
  );

  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>GOLDEN MASK</Text>
        <Text accessibilityRole="header" style={styles.title}>
          나의 3D 페이스
        </Text>
        <Text style={styles.description}>
          TrueDepth로 측정한 얼굴 메시를 고대 조각처럼 담았어요.
        </Text>
      </View>

      <View
        accessibilityActions={[{name: 'activate', label: '정면으로 돌아가기'}]}
        accessibilityHint="손가락으로 드래그하면 얼굴을 회전하고, 두 번 탭하면 정면으로 돌아갑니다."
        accessibilityLabel="골든마스크 3D 얼굴"
        accessibilityRole="image"
        onAccessibilityAction={() => {
          yawRef.current = 0;
          pitchRef.current = 0;
          resetUnityGoldenMaskView(requestIdRef.current);
        }}
        style={styles.viewer}
        {...panResponder.panHandlers}>
        {active ? (
          <UnityMakeupNativeView
            pointerEvents="none"
            runtimeMode="still"
            style={styles.unityView}
          />
        ) : null}

        {status === 'loading' ? (
          <View style={styles.stateOverlay}>
            <ActivityIndicator color="#76736D" size="small" />
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
              onPress={() => setRetryKey(value => value + 1)}
              style={({pressed}) => [
                styles.retryButton,
                pressed ? styles.retryButtonPressed : null,
              ]}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Text style={styles.hint}>
        드래그하여 회전 · 두 번 탭하여 정면 보기
      </Text>
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
    color: '#716F69',
    fontFamily: 'Pretendard',
    fontSize: 12.5,
    lineHeight: 19,
  },
  eyebrow: {
    color: '#7D786F',
    fontFamily: 'Lora',
    fontSize: 12,
    letterSpacing: 2,
  },
  hint: {
    color: '#8C8982',
    fontFamily: 'Pretendard',
    fontSize: 11,
    paddingBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#252A2C',
    borderRadius: 999,
    marginTop: 7,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryButtonPressed: {
    opacity: 0.72,
  },
  retryText: {
    color: '#FFFFFF',
    fontFamily: 'Pretendard',
    fontSize: 12,
    fontWeight: '700',
  },
  root: {
    backgroundColor: '#F4F2ED',
    flex: 1,
    gap: 14,
  },
  stateDescription: {
    color: '#85817A',
    fontFamily: 'Pretendard',
    fontSize: 11.5,
    lineHeight: 17,
    maxWidth: 220,
    textAlign: 'center',
  },
  stateOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: '#ECEAE5',
    gap: 7,
    justifyContent: 'center',
    padding: 24,
  },
  stateTitle: {
    color: '#4F4D48',
    fontFamily: 'Pretendard',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  title: {
    color: '#343330',
    fontFamily: 'Lora',
    fontSize: 27,
    lineHeight: 33,
  },
  unityView: {
    ...StyleSheet.absoluteFill,
  },
  viewer: {
    backgroundColor: '#ECEAE5',
    borderColor: 'rgba(90,86,78,0.12)',
    borderRadius: 24,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 16,
    minHeight: 280,
    overflow: 'hidden',
  },
});
