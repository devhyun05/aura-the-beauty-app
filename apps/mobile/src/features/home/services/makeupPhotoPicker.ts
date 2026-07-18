import {Alert} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import type {MakeupFeedbackPhotoSelection} from '../../makeup-feedback/types';
import type {ReferenceMakeupPhoto} from '../../reference-makeup-extraction/types';

const REFERENCE_MAKEUP_IMAGE_QUALITY = 0.76;
const MAKEUP_FEEDBACK_IMAGE_QUALITY = 1;

async function pickSinglePhoto(
  quality: number,
): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        '앨범 접근 권한이 필요해요',
        'iPhone 설정에서 AURA의 사진 접근 권한을 허용해 주세요.',
      );
      return null;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality,
    });

    if (pickerResult.canceled) {
      return null;
    }

    return pickerResult.assets[0]?.uri ? pickerResult.assets[0] : null;
  } catch {
    Alert.alert(
      '앨범을 열 수 없어요',
      '잠시 후 다시 시도해 주세요.',
    );
    return null;
  }
}

export async function pickReferenceMakeupPhotoFromLibrary(): Promise<
  ReferenceMakeupPhoto | null
> {
  const asset = await pickSinglePhoto(REFERENCE_MAKEUP_IMAGE_QUALITY);
  if (!asset) {
    return null;
  }

  const pickedAt = Date.now();
  return {
    contentType: asset.mimeType ?? null,
    id: `album-reference-${pickedAt}`,
    imageSource: {uri: asset.uri},
    referenceSource: 'album',
    title: '업로드한 참고 사진',
  };
}

export async function pickMakeupFeedbackPhotoFromLibrary(): Promise<
  MakeupFeedbackPhotoSelection | null
> {
  const asset = await pickSinglePhoto(MAKEUP_FEEDBACK_IMAGE_QUALITY);
  if (!asset) {
    return null;
  }

  return {
    contentType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    imageHeight: asset.height ?? null,
    imageUri: asset.uri,
    imageWidth: asset.width ?? null,
    photoSource: 'gallery',
  };
}
