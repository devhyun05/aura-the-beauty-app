import {useState} from 'react';
import {Image, Pressable, StyleSheet} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Check, ImagePlus} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import type {MakeupFeedbackPhotoSelection} from '../types';

type MakeupFeedbackAlbumUploadScreenProps = {
  onStartAnalysis: (selection: MakeupFeedbackPhotoSelection) => void;
};

const copy = {
  uploadAccessibilityLabel: '\uBA54\uC774\uD06C\uC5C5 \uD53C\uB4DC\uBC31 \uC0AC\uC9C4 \uC120\uD0DD\uD558\uAE30',
  uploadTitle: '\uBA54\uC774\uD06C\uC5C5 \uD53C\uB4DC\uBC31 \uC0AC\uC9C4 \uC120\uD0DD',
  uploadDescription:
    '\uAC24\uB7EC\uB9AC\uC5D0\uC11C \uD53C\uB4DC\uBC31\uBC1B\uC744 \uBA54\uC774\uD06C\uC5C5 \uC0AC\uC9C4\uC744 \uD558\uB098 \uC120\uD0DD\uD574\uC8FC\uC138\uC694.',
  selectedPhotoLabel: '\uC120\uD0DD\uD55C \uC0AC\uC9C4',
  emptySelection: '\uC0AC\uC9C4\uC744 \uC120\uD0DD\uD558\uBA74 AI \uBA54\uC774\uD06C\uC5C5 \uD53C\uB4DC\uBC31\uC744 \uC2DC\uC791\uD560 \uC218 \uC788\uC5B4\uC694.',
  startAnalysis: '\uBD84\uC11D \uC2DC\uC791\uD558\uAE30',
  picking: '\uC0AC\uC9C4 \uBD88\uB7EC\uC624\uB294 \uC911',
} as const;

export function MakeupFeedbackAlbumUploadScreen({
  onStartAnalysis,
}: MakeupFeedbackAlbumUploadScreenProps) {
  const insets = useSafeAreaInsets();
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);

  const handlePickPhoto = async () => {
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

      if (pickedAsset?.uri) {
        setSelectedImageUri(pickedAsset.uri);
      }
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const handleStartAnalysis = () => {
    if (!selectedImageUri) {
      return;
    }

    onStartAnalysis({
      imageUri: selectedImageUri,
      photoSource: 'gallery',
    });
  };

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <YStack style={styles.content}>
        <Pressable
          accessibilityLabel={copy.uploadAccessibilityLabel}
          accessibilityRole="button"
          disabled={isPickingPhoto}
          onPress={handlePickPhoto}
          style={({pressed}) => [
            styles.uploadHero,
            (pressed || isPickingPhoto) && styles.pressed,
          ]}>
          <View style={styles.uploadIcon}>
            <ImagePlus color={colors.textPrimary} size={iconSize.lg} strokeWidth={1.8} />
          </View>
          <YStack style={styles.uploadCopy}>
            <Text style={styles.uploadTitle}>{copy.uploadTitle}</Text>
            <Text style={styles.uploadDescription}>{copy.uploadDescription}</Text>
          </YStack>
        </Pressable>

        {selectedImageUri ? (
          <Pressable
            accessibilityLabel={copy.selectedPhotoLabel}
            accessibilityRole="button"
            onPress={handlePickPhoto}
            style={({pressed}) => [styles.previewCard, pressed && styles.pressed]}>
            <Image
              resizeMode="cover"
              source={{uri: selectedImageUri}}
              style={styles.previewImage}
            />
            <View style={styles.selectedBadge}>
              <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
            </View>
          </Pressable>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{copy.emptySelection}</Text>
          </View>
        )}
      </YStack>

      <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.md}]}>
        <Text style={styles.selectedText}>
          {selectedImageUri ? copy.selectedPhotoLabel : copy.emptySelection}
        </Text>
        <Pressable
          accessibilityLabel={copy.startAnalysis}
          accessibilityRole="button"
          accessibilityState={{disabled: !selectedImageUri || isPickingPhoto}}
          disabled={!selectedImageUri || isPickingPhoto}
          onPress={handleStartAnalysis}
          style={({pressed}) => [
            styles.primaryButton,
            (!selectedImageUri || isPickingPhoto) && styles.primaryButtonDisabled,
            pressed && selectedImageUri && !isPickingPhoto && styles.pressed,
          ]}>
          <Text style={styles.primaryButtonText}>
            {isPickingPhoto ? copy.picking : copy.startAnalysis}
          </Text>
        </Pressable>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 320,
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  footer: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  pressed: {
    opacity: 0.78,
  },
  previewCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.textPrimary,
    borderRadius: radius.lg,
    borderWidth: 2,
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 58,
  },
  primaryButtonDisabled: {
    opacity: 0.42,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
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