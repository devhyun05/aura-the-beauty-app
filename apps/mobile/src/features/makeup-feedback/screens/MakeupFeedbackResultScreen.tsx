import {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Share, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {
  loadOptionalMediaLibraryModule,
  loadOptionalSharingModule,
} from '../../../shared/services/optionalNativeShareModules';
import {
  type OptionalViewShotRef,
} from '../../../shared/ui/OptionalViewShot';
import {MakeupFeedbackScreenScaffold} from '../components/MakeupFeedbackScreenScaffold';
import {MakeupFeedbackRedesignHomeScreen} from '../redesign/MakeupFeedbackRedesignHomeScreen';
import {MakeupFeedbackRedesignSlidesScreen} from '../redesign/MakeupFeedbackRedesignSlidesScreen';
import {
  feedbackRedesignColors as C,
  feedbackRedesignFonts,
} from '../redesign/feedbackRedesignTheme';
import {feedbackHaptics} from '../redesign/feedbackHaptics';
import {useMakeupFeedbackRedesignController} from '../redesign/useMakeupFeedbackRedesignController';
import type {MakeupFeedbackResult} from '../types';

type MakeupFeedbackResultScreenProps = {
  onHeaderShareActionChange?: (action: MakeupFeedbackHeaderShareAction | null) => void;
  onInternalBackActionChange?: (action: (() => void) | null) => void;
  onOpenMakeupJourney: () => void;
  reduceMotion?: boolean;
  result: MakeupFeedbackResult;
};

type MakeupFeedbackHeaderShareAction = () => void;
type MakeupFeedbackShareTarget = 'save-image' | 'share-report';
type MakeupFeedbackShareFeedback = {
  message: string;
  tone: 'success' | 'error';
};

const shareTargetLabels: Record<MakeupFeedbackShareTarget, string> = {
  'save-image': '이미지 저장',
  'share-report': '공유하기',
};

function waitForNextFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

const FEEDBACK_CAPTURE_SETTLE_TIMEOUT_MS = 10_000;

function waitForFeedbackCaptureAssets(
  readyRef: {current: boolean},
  resolveRef: {current: (() => void) | null},
) {
  if (readyRef.current) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      if (resolveRef.current === finish) resolveRef.current = null;
      resolve();
    };
    const fail = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      if (resolveRef.current === finish) resolveRef.current = null;
      reject(
        new Error(
          '피드백 보고서의 상세 이미지를 모두 불러오지 못했어요. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.',
        ),
      );
    };

    resolveRef.current = finish;
    timeoutId = setTimeout(fail, FEEDBACK_CAPTURE_SETTLE_TIMEOUT_MS);
    if (readyRef.current) finish();
  });
}

async function captureFeedbackImage(captureRef: {current: OptionalViewShotRef | null}) {
  const captureTarget = captureRef.current;
  const capture = captureTarget?.capture;

  if (!captureTarget || !capture) {
    throw new Error('피드백 이미지를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  await waitForNextFrame();
  const imageUri = await capture.call(captureTarget);

  if (!imageUri) {
    throw new Error('피드백 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return imageUri;
}

async function requestFeedbackImageSavePermission() {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error('현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.');
  }

  const currentPermission = await mediaLibraryModule.getPermissionsAsync(true, []);
  const permission = currentPermission.granted
    ? currentPermission
    : await mediaLibraryModule.requestPermissionsAsync(true, []);

  if (!permission.granted) {
    throw new Error('사진 저장 권한이 필요합니다. 설정에서 사진 접근을 허용해 주세요.');
  }
}

async function saveFeedbackImageToLibrary(imageUri: string) {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error('현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.');
  }

  try {
    await mediaLibraryModule.saveToLibraryAsync(imageUri);
  } catch {
    await mediaLibraryModule.createAssetAsync(imageUri);
  }
}

async function shareFeedbackImageWithSystemSheet(imageUri: string) {
  const title = 'AI 피드백 리포트';
  const sharingModule = loadOptionalSharingModule();
  const isSharingAvailable = sharingModule
    ? await sharingModule.isAvailableAsync()
    : false;

  if (sharingModule && isSharingAvailable) {
    await sharingModule.shareAsync(imageUri, {
      UTI: 'public.jpeg',
      dialogTitle: title,
      mimeType: 'image/jpeg',
    });
    return;
  }

  await Share.share({title, url: imageUri});
}

function getShareErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : '공유 작업을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export function MakeupFeedbackResultScreen({
  onHeaderShareActionChange,
  onInternalBackActionChange,
  onOpenMakeupJourney,
  reduceMotion,
  result,
}: MakeupFeedbackResultScreenProps) {
  const captureRef = useRef<OptionalViewShotRef | null>(null);
  const captureDocumentSettledRef = useRef(false);
  const captureDocumentResolveRef = useRef<(() => void) | null>(null);
  const activeShareTargetRef = useRef<MakeupFeedbackShareTarget | null>(null);
  const controller = useMakeupFeedbackRedesignController({reduceMotion, result});
  const isSlides = controller.isSlides;
  const prepareCapture = controller.prepareCapture;
  const restoreSlidesAfterCapture = controller.restoreSlidesAfterCapture;
  const [activeShareTarget, setActiveShareTarget] =
    useState<MakeupFeedbackShareTarget | null>(null);
  const [shareFeedback, setShareFeedback] =
    useState<MakeupFeedbackShareFeedback | null>(null);
  const [captureRequestId, setCaptureRequestId] = useState(0);

  const handleCaptureDocumentSettledChange = useCallback((settled: boolean) => {
    captureDocumentSettledRef.current = settled;
    if (settled) captureDocumentResolveRef.current?.();
  }, []);

  const handleShareAction = useCallback(async (target: MakeupFeedbackShareTarget) => {
    if (activeShareTargetRef.current) {
      Alert.alert('공유 준비 중', '이전 작업을 처리하고 있어요. 잠시만 기다려 주세요.');
      return;
    }

    activeShareTargetRef.current = target;
    captureDocumentSettledRef.current = false;
    setCaptureRequestId(current => current + 1);
    setActiveShareTarget(target);
    setShareFeedback(null);
    let restoreSlides = false;

    try {
      if (target === 'save-image') {
        await requestFeedbackImageSavePermission();
      }

      restoreSlides = isSlides;
      prepareCapture();
      await waitForNextFrame();
      await waitForNextFrame();
      await waitForFeedbackCaptureAssets(
        captureDocumentSettledRef,
        captureDocumentResolveRef,
      );
      await waitForNextFrame();
      const imageUri = await captureFeedbackImage(captureRef);

      if (target === 'save-image') {
        await saveFeedbackImageToLibrary(imageUri);
        setShareFeedback({message: '이미지를 저장했어요.', tone: 'success'});
      } else {
        await shareFeedbackImageWithSystemSheet(imageUri);
        setShareFeedback({message: '공유 화면을 열었어요.', tone: 'success'});
      }
      feedbackHaptics.success();
    } catch (error) {
      feedbackHaptics.error();
      setShareFeedback({message: getShareErrorMessage(error), tone: 'error'});
    } finally {
      captureDocumentResolveRef.current = null;
      captureDocumentSettledRef.current = false;
      try {
        if (restoreSlides) {
          restoreSlidesAfterCapture();
        }
      } finally {
        activeShareTargetRef.current = null;
        setActiveShareTarget(null);
      }
    }
  }, [
    isSlides,
    prepareCapture,
    restoreSlidesAfterCapture,
  ]);

  const handleOpenShareOptions = useCallback(() => {
    if (activeShareTargetRef.current) {
      Alert.alert('공유 준비 중', '이전 작업을 처리하고 있어요. 잠시만 기다려 주세요.');
      return;
    }

    Alert.alert('메이크업 피드백', '원하는 방식을 선택해 주세요.', [
      {
        onPress: () => void handleShareAction('save-image'),
        text: shareTargetLabels['save-image'],
      },
      {
        onPress: () => void handleShareAction('share-report'),
        text: shareTargetLabels['share-report'],
      },
      {style: 'cancel', text: '취소'},
    ]);
  }, [handleShareAction]);

  useEffect(() => {
    setShareFeedback(null);
  }, [result.id]);

  useEffect(() => {
    onHeaderShareActionChange?.(handleOpenShareOptions);

    return () => onHeaderShareActionChange?.(null);
  }, [handleOpenShareOptions, onHeaderShareActionChange]);

  useEffect(() => {
    onInternalBackActionChange?.(isSlides ? controller.goHome : null);

    return () => onInternalBackActionChange?.(null);
  }, [controller.goHome, isSlides, onInternalBackActionChange]);

  useEffect(() => {
    if (!shareFeedback) {
      return;
    }

    const timeoutId = setTimeout(() => setShareFeedback(null), 2200);
    return () => clearTimeout(timeoutId);
  }, [shareFeedback]);

  return (
    <MakeupFeedbackScreenScaffold topPadding="none">
      <View style={styles.screen}>
        {controller.isHome ? (
          <MakeupFeedbackRedesignHomeScreen
            captureRef={captureRef}
            captureRequestId={captureRequestId}
            controller={controller}
            createdAt={result.createdAt}
            isShareBusy={Boolean(activeShareTarget)}
            onCaptureDocumentSettledChange={handleCaptureDocumentSettledChange}
            onOpenRecord={onOpenMakeupJourney}
            onSave={() => void handleShareAction('save-image')}
            onShare={() => void handleShareAction('share-report')}
          />
        ) : (
          <MakeupFeedbackRedesignSlidesScreen
            controller={controller}
            isShareBusy={Boolean(activeShareTarget)}
            onOpenRecord={onOpenMakeupJourney}
            onSave={() => void handleShareAction('save-image')}
            onShare={() => void handleShareAction('share-report')}
          />
        )}

        {shareFeedback ? (
          <View
            accessibilityLiveRegion="polite"
            pointerEvents="none"
            style={styles.toastPosition}>
            <View
              style={[
                styles.toast,
                shareFeedback.tone === 'error' ? styles.toastError : undefined,
              ]}>
              <Text style={styles.toastText}>{shareFeedback.message}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </MakeupFeedbackScreenScaffold>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  toast: {
    backgroundColor: 'rgba(28,51,63,0.94)',
    borderRadius: 999,
    maxWidth: 330,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  toastError: {
    backgroundColor: 'rgba(143,58,40,0.96)',
  },
  toastPosition: {
    alignItems: 'center',
    bottom: 28,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  toastText: {
    color: C.card,
    fontFamily: feedbackRedesignFonts.semibold,
    fontSize: 13,
    textAlign: 'center',
  },
});
