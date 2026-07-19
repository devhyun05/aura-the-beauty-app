import {Platform, Share} from 'react-native';

import {
  loadOptionalMediaLibraryModule,
  loadOptionalSharingModule,
} from '../../../shared/services/optionalNativeShareModules';
import type {OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';

export type RecommendationResultShareTarget = 'save-image' | 'share-result';

function waitForNextFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });
}

export async function captureRecommendationResult(captureRef: {
  current: OptionalViewShotRef | null;
}) {
  const captureTarget = captureRef.current;
  const capture = captureTarget?.capture;

  if (!captureTarget || !capture) {
    throw new Error('결과 이미지를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  await waitForNextFrame();
  const imageUri = await capture.call(captureTarget);

  if (!imageUri) {
    throw new Error('결과 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
  }

  return imageUri;
}

export async function requestRecommendationResultSavePermission() {
  const mediaLibrary = loadOptionalMediaLibraryModule();

  if (!mediaLibrary) {
    throw new Error('현재 앱에서 사진 저장 기능을 사용할 수 없어요.');
  }

  try {
    // Write-only access is sufficient and avoids Expo Go's Android restriction on
    // granular photo/video permission requests. An explicit empty list is required because
    // the Android legacy module otherwise substitutes its full default permission list.
    const currentPermission = await mediaLibrary.getPermissionsAsync(true, []);
    const permission = currentPermission.granted
      ? currentPermission
      : await mediaLibrary.requestPermissionsAsync(true, []);

    if (!permission.granted) {
      throw new Error('사진 저장 권한이 필요합니다. 설정에서 사진 접근을 허용해 주세요.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('사진 저장 권한이 필요합니다.')) {
      throw error;
    }

    console.info('[aura:makeup-recommendation] result-save:permission-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new Error('사진 저장 권한을 확인하지 못했어요. 앱 설정을 확인한 뒤 다시 시도해 주세요.');
  }
}

export async function saveRecommendationResultToLibrary(imageUri: string) {
  const mediaLibrary = loadOptionalMediaLibraryModule();

  if (!mediaLibrary) {
    throw new Error('현재 앱에서 사진 저장 기능을 사용할 수 없어요.');
  }

  try {
    await mediaLibrary.saveToLibraryAsync(imageUri);
  } catch (error) {
    console.info('[aura:makeup-recommendation] result-save:fallback', {
      message: error instanceof Error ? error.message : String(error),
    });
    await mediaLibrary.createAssetAsync(imageUri);
  }
}

export async function shareRecommendationResult(imageUri: string) {
  const title = 'AURA 메이크업 추천 결과';
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
    return 'opened' as const;
  }

  if (Platform.OS !== 'ios') {
    throw new Error(
      '현재 기기에서는 이미지 공유 기능을 열 수 없어요. 먼저 사진에 저장한 뒤 공유해 주세요.',
    );
  }

  const shareResult = await Share.share({title, url: imageUri});
  return shareResult.action === Share.dismissedAction ? 'dismissed' as const : 'opened' as const;
}

export function getRecommendationResultShareError(error: unknown) {
  return error instanceof Error
    ? error.message
    : '작업을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
