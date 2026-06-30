import {useEffect, useMemo, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Check, ImagePlus} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getReferenceMakeupExtractionData} from '../services/makeupExtractionService';
import type {
  ReferenceMakeupExtractionData,
  ReferenceMakeupPhoto,
} from '../types';

type ReferenceMakeupExtractionUploadScreenProps = {
  headerTitle?: string;
  onClose?: () => void;
  onStartAnalysis: (photo: ReferenceMakeupPhoto) => void;
};


export function ReferenceMakeupExtractionUploadScreen({
  onStartAnalysis,
}: ReferenceMakeupExtractionUploadScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ReferenceMakeupExtractionData | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<ReferenceMakeupPhoto[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getReferenceMakeupExtractionData().then((nextData) => {
      if (isMounted) {
        setData(nextData);
        setSelectedPhotoId(nextData.photos[0]?.id ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const photos = useMemo(
    () => (data ? [...uploadedPhotos, ...data.photos] : uploadedPhotos),
    [data, uploadedPhotos],
  );

  const handlePickReferencePhoto = async () => {
    if (isPickingPhoto) {
      return;
    }

    setIsPickingPhoto(true);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 0.9,
      });
      const pickedAsset = pickerResult.canceled ? null : pickerResult.assets[0];

      if (!pickedAsset?.uri) {
        return;
      }

      const uploadedPhoto: ReferenceMakeupPhoto = {
        id: `uploaded-reference-${Date.now()}`,
        imageSource: {uri: pickedAsset.uri},
        referenceSource: 'album',
        title: '\uC5C5\uB85C\uB4DC\uD55C \uC0AC\uC9C4',
      };

      setUploadedPhotos((currentPhotos) => [uploadedPhoto, ...currentPhotos]);
      setSelectedPhotoId(uploadedPhoto.id);
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const selectedPhoto = useMemo(() => {
    if (photos.length === 0) {
      return null;
    }

    return photos.find((photo) => photo.id === selectedPhotoId) ?? photos[0] ?? null;
  }, [photos, selectedPhotoId]);

  if (!data || !selectedPhoto) {
    return (
      <AppScreen
        bottomPadding={0}
        contentGap={0}
        horizontalPadding={0}
        scroll={false}
        topPadding="none"
      >
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>업로드 화면을 불러오는 중이에요.</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <Pressable
          accessibilityLabel="\uBA54\uC774\uD06C\uC5C5 \uCC38\uACE0 \uC0AC\uC9C4 \uC5C5\uB85C\uB4DC\uD558\uAE30"
          accessibilityRole="button"
          disabled={isPickingPhoto}
          onPress={handlePickReferencePhoto}
          style={({pressed}) => [
            styles.uploadHero,
            (pressed || isPickingPhoto) && styles.pressed,
          ]}>
          <View style={styles.uploadIcon}>
            <ImagePlus color={colors.textPrimary} size={iconSize.lg} strokeWidth={1.8} />
          </View>
          <YStack style={styles.uploadCopy}>
            <Text style={styles.uploadTitle}>{'\uBA54\uC774\uD06C\uC5C5 \uCC38\uACE0 \uC0AC\uC9C4 \uC5C5\uB85C\uB4DC'}</Text>
            <Text style={styles.uploadDescription}>
              {'\uAC24\uB7EC\uB9AC\uC5D0\uC11C \uBD84\uC11D\uD560 \uC0AC\uC9C4\uC744 \uD558\uB098\uC529 \uCD94\uAC00\uD558\uACE0, \uC120\uD0DD\uD55C \uC0AC\uC9C4\uC73C\uB85C \uBD84\uC11D\uC744 \uC2DC\uC791\uD558\uC138\uC694.'}
            </Text>
          </YStack>
        </Pressable>

        <View style={styles.galleryGrid}>
          {photos.map((photo) => {
            const isSelected = photo.id === selectedPhoto.id;

            return (
              <Pressable
                accessibilityLabel={`${photo.title} \uC120\uD0DD`}
                accessibilityRole="button"
                accessibilityState={{selected: isSelected}}
                key={photo.id}
                onPress={() => setSelectedPhotoId(photo.id)}
                style={({pressed}) => [
                  styles.photoTile,
                  isSelected && styles.photoTileSelected,
                  pressed && styles.pressed,
                ]}>
                <Image resizeMode="cover" source={photo.imageSource} style={styles.photoImage} />
                {isSelected ? (
                  <View style={styles.selectedBadge}>
                    <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.md}]}>
        <Text style={styles.selectedText}>1장 선택됨 · {selectedPhoto.title}</Text>
        <Pressable
          accessibilityLabel="메이크업 룩 분석 시작하기"
          accessibilityRole="button"
          onPress={() => onStartAnalysis(selectedPhoto)}
          style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.primaryButtonText}>분석 시작하기</Text>
        </Pressable>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: 128,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  footer: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  header: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: spacing.lg,
  },
  loadingContainer: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  photoImage: {
    height: '100%',
    width: '100%',
  },
  photoTile: {
    aspectRatio: 0.82,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexBasis: '31.7%',
    overflow: 'hidden',
  },
  photoTileSelected: {
    borderColor: colors.textPrimary,
    borderWidth: 3,
  },
  pressed: {
    opacity: 0.78,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
  },
  selectedBadge: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 34,
  },
  selectedText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  tabButton: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  tabIndicator: {
    backgroundColor: 'transparent',
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  tabIndicatorActive: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  tabText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  tabTextActive: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  uploadCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  uploadDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  uploadHero: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: shadows.soft.shadowRadius,
  },
  uploadIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  uploadTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
});
