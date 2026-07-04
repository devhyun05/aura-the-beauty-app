import {useMemo, useState} from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Check, ImagePlus} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import type {MakeupFeedbackPhotoSelection} from '../types';

type MakeupFeedbackAlbumUploadScreenProps = {
  onStartAnalysis: (selection: MakeupFeedbackPhotoSelection) => void;
};

type MakeupFeedbackUploadedPhoto = {
  id: string;
  imageHeight?: number | null;
  imageUri: string;
  imageWidth?: number | null;
  title: string;
};

type UploadPhotoNameModalProps = {
  isVisible: boolean;
  name: string;
  onCancel: () => void;
  onChangeName: (name: string) => void;
  onConfirm: () => void;
};

const uploadedPhotoNameMaxLength = 24;

const copy = {
  uploadAccessibilityLabel: 'AI 피드백 사진 업로드',
  uploadTitle: 'AI 피드백 사진 업로드',
  emptySelection: '갤러리에서 사진을 업로드하면 여기에 등록돼요.',
  selectedFallback: '분석할 사진을 업로드해 주세요.',
  startAnalysis: '분석 시작하기',
  picking: '사진 불러오는 중',
} as const;

function UploadPhotoNameModal({
  isVisible,
  name,
  onCancel,
  onChangeName,
  onConfirm,
}: UploadPhotoNameModalProps) {
  const isConfirmDisabled = name.trim().length === 0;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={isVisible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.nameModalKeyboardView}>
        <Pressable
          accessibilityLabel="사진 이름 설정 닫기"
          accessibilityRole="button"
          onPress={onCancel}
          style={styles.nameModalBackdrop}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={styles.nameModalSheet}>
            <Text style={styles.nameModalTitle}>사진 이름 설정</Text>

            <YStack style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>이름</Text>
              <XStack style={styles.inputFrame}>
                <TextInput
                  autoFocus
                  maxLength={uploadedPhotoNameMaxLength}
                  onChangeText={onChangeName}
                  onSubmitEditing={() => {
                    if (!isConfirmDisabled) {
                      onConfirm();
                    }
                  }}
                  placeholder="예: 데일리 피드백 사진"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="done"
                  style={styles.input}
                  value={name}
                />
                <Text style={styles.countText}>
                  {name.length}/{uploadedPhotoNameMaxLength}
                </Text>
              </XStack>
            </YStack>

            <XStack style={styles.nameModalActions}>
              <Pressable
                accessibilityLabel="사진 이름 설정 취소"
                accessibilityRole="button"
                onPress={onCancel}
                style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>취소</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="이 이름으로 사진 추가"
                accessibilityRole="button"
                accessibilityState={{disabled: isConfirmDisabled}}
                disabled={isConfirmDisabled}
                onPress={onConfirm}
                style={({pressed}) => [
                  styles.confirmButton,
                  isConfirmDisabled && styles.confirmButtonDisabled,
                  pressed && !isConfirmDisabled && styles.pressed,
                ]}>
                <Text style={styles.confirmButtonText}>추가</Text>
              </Pressable>
            </XStack>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function MakeupFeedbackAlbumUploadScreen({
  onStartAnalysis,
}: MakeupFeedbackAlbumUploadScreenProps) {
  const insets = useSafeAreaInsets();
  const [uploadedPhotos, setUploadedPhotos] = useState<MakeupFeedbackUploadedPhoto[]>([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingPhotoWidth, setPendingPhotoWidth] = useState<number | null>(null);
  const [pendingPhotoHeight, setPendingPhotoHeight] = useState<number | null>(null);
  const [pendingPhotoName, setPendingPhotoName] = useState('');

  const selectedPhoto = useMemo(
    () => uploadedPhotos.find(photo => photo.id === selectedPhotoId) ?? uploadedPhotos[0] ?? null,
    [selectedPhotoId, uploadedPhotos],
  );

  const closeNameModal = () => {
    setPendingPhotoUri(null);
    setPendingPhotoWidth(null);
    setPendingPhotoHeight(null);
    setPendingPhotoName('');
  };

  const addPendingPhoto = () => {
    const nextPhotoName = pendingPhotoName.trim();

    if (!pendingPhotoUri || nextPhotoName.length === 0) {
      return;
    }

    const nextPhoto: MakeupFeedbackUploadedPhoto = {
      id: `makeup-feedback-gallery-${Date.now()}`,
      imageUri: pendingPhotoUri,
      title: nextPhotoName,
    };

    setUploadedPhotos(currentPhotos => [nextPhoto, ...currentPhotos]);
    setSelectedPhotoId(nextPhoto.id);
    closeNameModal();
  };

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

      if (!pickedAsset?.uri) {
        return;
      }

      setPendingPhotoUri(pickedAsset.uri);
      setPendingPhotoWidth(pickedAsset.width ?? null);
      setPendingPhotoHeight(pickedAsset.height ?? null);
      setPendingPhotoName('');
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const handleStartAnalysis = () => {
    if (!selectedPhoto) {
      return;
    }

    onStartAnalysis({
      imageHeight: selectedPhoto.imageHeight,
      imageUri: selectedPhoto.imageUri,
      imageWidth: selectedPhoto.imageWidth,
      photoSource: 'gallery',
      photoTitle: selectedPhoto.title,
    });
  };

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
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
          </YStack>
        </Pressable>

        {uploadedPhotos.length > 0 ? (
          <View style={styles.galleryGrid}>
            {uploadedPhotos.map(photo => {
              const isSelected = photo.id === selectedPhoto?.id;

              return (
                <Pressable
                  accessibilityLabel={`${photo.title} 선택`}
                  accessibilityRole="button"
                  accessibilityState={{selected: isSelected}}
                  key={photo.id}
                  onPress={() => setSelectedPhotoId(photo.id)}
                  style={({pressed}) => [
                    styles.photoTile,
                    isSelected && styles.photoTileSelected,
                    pressed && styles.pressed,
                  ]}>
                  <Image resizeMode="cover" source={{uri: photo.imageUri}} style={styles.photoImage} />
                  {isSelected ? (
                    <View style={styles.selectedBadge}>
                      <Check color={colors.white} size={iconSize.xs} strokeWidth={2.4} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{copy.emptySelection}</Text>
          </View>
        )}
      </ScrollView>

      <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.md}]}>
        <Text numberOfLines={1} style={styles.selectedText}>
          {selectedPhoto ? selectedPhoto.title : copy.selectedFallback}
        </Text>
        <Pressable
          accessibilityLabel={copy.startAnalysis}
          accessibilityRole="button"
          accessibilityState={{disabled: !selectedPhoto || isPickingPhoto}}
          disabled={!selectedPhoto || isPickingPhoto}
          onPress={handleStartAnalysis}
          style={({pressed}) => [
            styles.primaryButton,
            (!selectedPhoto || isPickingPhoto) && styles.primaryButtonDisabled,
            pressed && selectedPhoto && !isPickingPhoto && styles.pressed,
          ]}>
          <Text style={styles.primaryButtonText}>
            {isPickingPhoto ? copy.picking : copy.startAnalysis}
          </Text>
        </Pressable>
      </YStack>

      <UploadPhotoNameModal
        isVisible={Boolean(pendingPhotoUri)}
        name={pendingPhotoName}
        onCancel={closeNameModal}
        onChangeName={setPendingPhotoName}
        onConfirm={addPendingPhoto}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  confirmButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  confirmButtonDisabled: {
    opacity: 0.42,
  },
  confirmButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: 104,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  countText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
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
  fieldGroup: {
    gap: spacing.md,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
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
  input: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    padding: 0,
  },
  inputFrame: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
  },
  nameModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nameModalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  nameModalKeyboardView: {
    flex: 1,
  },
  nameModalSheet: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    gap: spacing.lg,
    maxWidth: 420,
    padding: spacing.lg,
    width: '100%',
  },
  nameModalTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
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
  primaryButtonDisabled: {
    opacity: 0.42,
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
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
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
    minWidth: 0,
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