import {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {ImagePlus} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import type {ReferenceMakeupPhoto} from '../types';

type ReferenceMakeupExtractionAlbumUploadScreenProps = {
  onSelectPhoto: (photo: ReferenceMakeupPhoto) => void;
};

type PickerState = 'opening' | 'cancelled' | 'denied';

const copy = {
  openingTitle: '앨범을 여는 중이에요',
  cancelledTitle: '추출할 메이크업 사진을 골라주세요',
  deniedTitle: '앨범 접근 권한이 필요해요',
  retry: '앨범 다시 열기',
} as const;

const REFERENCE_MAKEUP_IMAGE_QUALITY = 0.76;

function buildReferenceMakeupPhoto(asset: ImagePicker.ImagePickerAsset): ReferenceMakeupPhoto {
  const pickedAt = Date.now();

  return {
    contentType: asset.mimeType ?? null,
    id: `album-reference-${pickedAt}`,
    imageSource: {uri: asset.uri},
    referenceSource: 'album',
    title: '업로드한 참고 사진',
  };
}

export function ReferenceMakeupExtractionAlbumUploadScreen({
  onSelectPhoto,
}: ReferenceMakeupExtractionAlbumUploadScreenProps) {
  const insets = useSafeAreaInsets();
  const hasAutoOpenedPickerRef = useRef(false);
  const isPickerOpenRef = useRef(false);
  const onSelectPhotoRef = useRef(onSelectPhoto);
  const [pickerState, setPickerState] = useState<PickerState>('opening');

  useEffect(() => {
    onSelectPhotoRef.current = onSelectPhoto;
  }, [onSelectPhoto]);

  const openImagePicker = useCallback(async () => {
    if (isPickerOpenRef.current) {
      return;
    }

    isPickerOpenRef.current = true;
    setPickerState('opening');

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        setPickerState('denied');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: REFERENCE_MAKEUP_IMAGE_QUALITY,
      });
      const pickedAsset = pickerResult.canceled ? null : pickerResult.assets[0];

      if (!pickedAsset?.uri) {
        setPickerState('cancelled');
        return;
      }

      onSelectPhotoRef.current(buildReferenceMakeupPhoto(pickedAsset));
    } finally {
      isPickerOpenRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (hasAutoOpenedPickerRef.current) {
      return;
    }

    hasAutoOpenedPickerRef.current = true;
    void openImagePicker();
  }, [openImagePicker]);

  const title =
    pickerState === 'denied'
      ? copy.deniedTitle
      : pickerState === 'opening'
        ? copy.openingTitle
        : copy.cancelledTitle;

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <YStack style={[styles.content, {paddingBottom: insets.bottom + spacing.xl}]}>
        <View style={styles.iconFrame}>
          {pickerState === 'opening' ? (
            <ActivityIndicator color={colors.textPrimary} size="small" />
          ) : (
            <ImagePlus color={colors.textPrimary} size={iconSize.lg} strokeWidth={1.9} />
          )}
        </View>

        <Text style={styles.title}>{title}</Text>

        <Pressable
          accessibilityLabel={copy.retry}
          accessibilityRole="button"
          disabled={pickerState === 'opening'}
          onPress={() => {
            void openImagePicker();
          }}
          style={({pressed}) => [
            styles.retryButton,
            pickerState === 'opening' && styles.retryButtonDisabled,
            pressed && pickerState !== 'opening' && styles.pressed,
          ]}>
          <Text style={styles.retryButtonText}>{copy.retry}</Text>
        </Pressable>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  iconFrame: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.08,
    shadowRadius: shadows.soft.shadowRadius,
    width: 72,
  },
  pressed: {
    opacity: 0.78,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.xl,
  },
  retryButtonDisabled: {
    opacity: 0.42,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
});
