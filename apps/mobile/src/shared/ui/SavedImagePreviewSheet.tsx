import {useEffect, useState} from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {colors, spacing, typography} from '../theme';

type SavedImagePreviewSheetProps = {
  imageUri: string | null;
  onClose: () => void;
  title?: string;
};

// 이미지 저장 직후 결과를 바로 보여주는 미리보기 시트 — iOS 스크린샷처럼
// "무엇이 저장됐는지"를 즉시 확인시킨다. 긴 보고서 이미지는 내부 스크롤로
// 전체를 훑어볼 수 있다.
export function SavedImagePreviewSheet({
  imageUri,
  onClose,
  title = '사진에 저장했어요',
}: SavedImagePreviewSheetProps) {
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  // 세로/가로 비율(h/w) — 긴 캡처를 원본 비율 그대로 보여주기 위해 실측한다.
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    if (!imageUri) {
      setImageAspectRatio(null);
      return undefined;
    }

    let isCancelled = false;
    Image.getSize(
      imageUri,
      (width, height) => {
        if (!isCancelled && width > 0) {
          setImageAspectRatio(height / width);
        }
      },
      () => undefined,
    );

    return () => {
      isCancelled = true;
    };
  }, [imageUri]);

  const previewWidth = Math.min(windowWidth - spacing.xl * 2, 420);
  const previewHeight =
    imageAspectRatio != null ? previewWidth * imageAspectRatio : null;
  const maxBodyHeight = windowHeight * 0.58;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={imageUri != null}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="미리보기 닫기"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>사진 앱에서 확인할 수 있어요.</Text>
          <ScrollView
            contentContainerStyle={styles.scrollBody}
            showsVerticalScrollIndicator
            style={{maxHeight: maxBodyHeight}}>
            {imageUri != null && previewHeight != null ? (
              <Image
                resizeMode="cover"
                source={{uri: imageUri}}
                style={[
                  styles.previewImage,
                  {height: previewHeight, width: previewWidth},
                ]}
              />
            ) : (
              <View style={[styles.previewPlaceholder, {width: previewWidth}]} />
            )}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({pressed}) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}>
            <Text style={styles.closeButtonLabel}>확인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(17, 17, 17, 0.55)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 20,
    maxWidth: 460,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    width: '100%',
  },
  closeButton: {
    backgroundColor: colors.textPrimary,
    borderRadius: 12,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  closeButtonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 15,
  },
  closeButtonPressed: {
    opacity: 0.85,
  },
  previewImage: {
    borderRadius: 12,
  },
  previewPlaceholder: {
    height: 220,
  },
  scrollBody: {
    alignItems: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 17,
  },
});
