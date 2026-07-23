import {Share} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import {
  loadOptionalMediaLibraryModule,
  loadOptionalSharingModule,
} from '../../../shared/services/optionalNativeShareModules';
import type {OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';

declare const require: (moduleName: string) => unknown;

export type ReportShareFormat = 'summary' | 'story' | 'full';
export type ReportShareTarget = 'save-image' | 'share-report';

export type ReportSharePrivacy = {
  blurPhotoBackground: boolean;
  includeDate: boolean;
  includeName: boolean;
  includePhoto: boolean;
};

export const DEFAULT_REPORT_SHARE_PRIVACY: ReportSharePrivacy = {
  blurPhotoBackground: true,
  includeDate: true,
  includeName: false,
  includePhoto: false,
};

export const reportShareTargetLabels: Record<ReportShareTarget, string> = {
  'save-image': '사진에 저장',
  'share-report': '공유하기',
};

type ReactNativeShareModule = {
  open: (options: {
    failOnCancel?: boolean;
    title?: string;
    type?: string;
    url?: string;
    urls?: string[];
  }) => Promise<unknown>;
};

function loadReactNativeShare(): ReactNativeShareModule | null {
  try {
    const loaded = require('react-native-share') as {
      default?: ReactNativeShareModule;
      open?: ReactNativeShareModule['open'];
    };
    const candidate = loaded.default ?? loaded;
    return typeof candidate.open === 'function'
      ? (candidate as ReactNativeShareModule)
      : null;
  } catch {
    return null;
  }
}

function waitForNextFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export async function captureReportImage(reportCaptureRef: {
  current: OptionalViewShotRef | null;
}) {
  const capture = reportCaptureRef.current?.capture;
  if (!capture) {
    throw new Error('공유 이미지를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  await waitForNextFrame();
  const imageUri = await capture.call(reportCaptureRef.current);
  if (!imageUri) {
    throw new Error('공유 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  }
  return imageUri;
}

export async function captureReportImages(
  refs: Array<{current: OptionalViewShotRef | null}>,
) {
  const images: string[] = [];
  for (const ref of refs) {
    images.push(await captureReportImage(ref));
  }
  return images;
}

export async function shareReportImagesWithSystemSheet({
  imageUris,
  title,
}: {
  imageUris: string[];
  title: string;
}): Promise<'shared' | 'dismissed'> {
  if (!imageUris.length) {
    throw new Error('공유할 이미지가 없어요.');
  }

  const nativeShare = loadReactNativeShare();
  if (nativeShare) {
    await nativeShare.open({
      failOnCancel: false,
      title,
      type: 'image/jpeg',
      ...(imageUris.length > 1 ? {urls: imageUris} : {url: imageUris[0]}),
    });
    return 'shared';
  }

  if (imageUris.length > 1) {
    throw new Error(
      '여러 장 공유 기능이 현재 앱에 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.',
    );
  }

  const sharingModule = loadOptionalSharingModule();
  const isSharingAvailable = sharingModule
    ? await sharingModule.isAvailableAsync()
    : false;
  if (sharingModule && isSharingAvailable) {
    await sharingModule.shareAsync(imageUris[0], {
      dialogTitle: title,
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
    });
    return 'shared';
  }

  const shareResult = await Share.share({title, url: imageUris[0]});
  return shareResult.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

export async function requestReportImageSavePermission() {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();
  if (!mediaLibraryModule) {
    throw new Error(
      '현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.',
    );
  }

  const currentPermission = await mediaLibraryModule.getPermissionsAsync(true, ['photo']);
  const permission = currentPermission.granted
    ? currentPermission
    : await mediaLibraryModule.requestPermissionsAsync(true, ['photo']);
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

export async function saveReportImagesToLibrary(imageUris: string[]) {
  await requestReportImageSavePermission();
  for (const imageUri of imageUris) {
    await saveReportImageToLibrary(imageUri);
  }
}

export function cleanupReportShareImages(imageUris: string[]) {
  for (const imageUri of imageUris) {
    void FileSystem.deleteAsync(imageUri, {idempotent: true}).catch(() => undefined);
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
