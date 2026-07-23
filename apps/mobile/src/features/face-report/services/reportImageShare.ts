// 보고서 이미지 캡처·저장·공유 헬퍼.
//
// 원래 FaceAnalysisReportDetailScreen(옛 보고서 화면)의 module-scope 함수였다.
// 그 화면이 report_RN(S1~S7)으로 교체되면서, 검증된 동작(공유 모듈 부재 폴백,
// 권한 요청, saveToLibrary 실패 시 createAsset 폴백)을 잃지 않도록 화면에서
// 분리해 그대로 옮겼다.

import {Share} from 'react-native';

import {
  loadOptionalMediaLibraryModule,
  loadOptionalSharingModule,
} from '../../../shared/services/optionalNativeShareModules';
import type {OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';

export type ReportShareTarget = 'save-image' | 'share-report';

export const reportShareTargetLabels: Record<ReportShareTarget, string> = {
  'save-image': '이미지 저장',
  'share-report': '공유하기',
};

function waitForNextFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

export const FACE_REPORT_CAPTURE_SETTLE_TIMEOUT_MS = 10_000;

type CaptureReportImageOptions = {
  isReady?: () => boolean;
  shouldContinue?: () => boolean;
  timeoutMs?: number;
};

function assertCaptureStillActive(shouldContinue?: () => boolean) {
  if (shouldContinue && !shouldContinue()) {
    throw new Error('보고서 이미지 준비가 취소되었어요.');
  }
}

export async function waitForFaceReportCaptureAssets({
  isReady,
  shouldContinue,
  timeoutMs = FACE_REPORT_CAPTURE_SETTLE_TIMEOUT_MS,
}: CaptureReportImageOptions) {
  if (!isReady) {
    return;
  }

  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (!isReady()) {
    assertCaptureStillActive(shouldContinue);
    if (Date.now() >= deadline) {
      throw new Error('보고서 이미지를 불러오는 데 시간이 오래 걸렸어요. 다시 시도해 주세요.');
    }
    await waitForNextFrame();
  }
}

async function waitForLayoutFrames(frameCount: number) {
  for (let frame = 0; frame < frameCount; frame += 1) {
    await waitForNextFrame();
  }
}

export async function captureReportImage(
  reportCaptureRef: {current: OptionalViewShotRef | null},
  options: CaptureReportImageOptions = {},
) {
  await waitForFaceReportCaptureAssets(options);
  await waitForLayoutFrames(2);
  assertCaptureStillActive(options.shouldContinue);

  const captureTarget = reportCaptureRef.current;
  const capture = captureTarget?.capture;

  if (!captureTarget || !capture) {
    throw new Error('보고서 이미지를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  const imageUri = await capture.call(captureTarget);
  assertCaptureStillActive(options.shouldContinue);

  if (!imageUri) {
    throw new Error('보고서 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return imageUri;
}
export async function shareReportImageWithSystemSheet({
  imageUri,
  title,
}: {
  imageUri: string;
  title: string;
}): Promise<'shared' | 'dismissed'> {
  const sharingModule = loadOptionalSharingModule();
  const isSharingAvailable = sharingModule
    ? await sharingModule.isAvailableAsync()
    : false;

  if (sharingModule && isSharingAvailable) {
    await sharingModule.shareAsync(imageUri, {
      dialogTitle: title,
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
    });
    return 'shared';
  }

  const shareResult = await Share.share({
    title,
    url: imageUri,
  });

  return shareResult.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

export async function requestReportImageSavePermission() {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error(
      '현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.',
    );
  }

  const currentPermission = await mediaLibraryModule.getPermissionsAsync(true, []);
  const permission = currentPermission.granted
    ? currentPermission
    : await mediaLibraryModule.requestPermissionsAsync(true, []);

  if (!permission.granted) {
    throw new Error('사진 저장 권한이 필요합니다. 설정에서 사진 접근을 허용해 주세요.');
  }
}

export async function saveReportImageToLibrary(imageUri: string) {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error(
      '현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.',
    );
  }

  try {
    await mediaLibraryModule.saveToLibraryAsync(imageUri);
  } catch (error) {
    console.info('[aura:analysis] report-share:save-to-library-failed', {
      imageUri,
      message: error instanceof Error ? error.message : String(error),
    });
    await mediaLibraryModule.createAssetAsync(imageUri);
  }
}

export function getShareErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : '공유 작업을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export function getReportCaptureTitle(profileName?: string) {
  return profileName ? `${profileName}님 맞춤 분석 보고서` : '맞춤 분석 보고서';
}
