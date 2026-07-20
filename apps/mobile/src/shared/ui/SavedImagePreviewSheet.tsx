import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, spacing, typography} from '../theme';

type SavedImagePreviewSheetProps = {
  imageUri: string | null;
  onClose: () => void;
  title?: string;
};

const THUMBNAIL_WIDTH = 104;
const THUMBNAIL_MAX_HEIGHT = 190;
const AUTO_DISMISS_MS = 5000;
const EXIT_SLIDE_X = -168;

// 이미지 저장 직후 iOS 스크린샷처럼 좌하단에 미리보기 썸네일을 띄운다.
// 몇 초 뒤 왼쪽으로 미끄러지며 사라지고, 탭하면 전체 미리보기로 확장된다.
export function SavedImagePreviewSheet({
  imageUri,
  onClose,
  title = '사진에 저장했어요',
}: SavedImagePreviewSheetProps) {
  const insets = useSafeAreaInsets();
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  // 세로/가로 비율(h/w) — 긴 캡처를 원본 비율로 다루기 위해 실측한다.
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const appearProgress = useRef(new Animated.Value(0)).current;
  const exitProgress = useRef(new Animated.Value(0)).current;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const dismissThumbnail = useCallback(() => {
    clearDismissTimer();
    Animated.timing(exitProgress, {
      duration: 300,
      easing: Easing.in(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished) {
        onClose();
      }
    });
  }, [clearDismissTimer, exitProgress, onClose]);

  useEffect(() => {
    if (!imageUri) {
      clearDismissTimer();
      setIsExpanded(false);
      setImageAspectRatio(null);
      appearProgress.setValue(0);
      exitProgress.setValue(0);
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

    appearProgress.setValue(0);
    exitProgress.setValue(0);
    Animated.spring(appearProgress, {
      friction: 7,
      tension: 80,
      toValue: 1,
      useNativeDriver: true,
    }).start();
    dismissTimerRef.current = setTimeout(dismissThumbnail, AUTO_DISMISS_MS);

    return () => {
      isCancelled = true;
      clearDismissTimer();
    };
  }, [appearProgress, clearDismissTimer, dismissThumbnail, exitProgress, imageUri]);

  const expandPreview = useCallback(() => {
    clearDismissTimer();
    setIsExpanded(true);
  }, [clearDismissTimer]);

  if (!imageUri) {
    return null;
  }

  const thumbnailHeight =
    imageAspectRatio != null
      ? Math.min(THUMBNAIL_WIDTH * imageAspectRatio, THUMBNAIL_MAX_HEIGHT)
      : 150;
  const expandedWidth = Math.min(windowWidth - spacing.xl * 2, 420);
  const expandedHeight =
    imageAspectRatio != null ? expandedWidth * imageAspectRatio : null;
  const maxExpandedBodyHeight = windowHeight * 0.58;

  const thumbnailOpacity = Animated.multiply(
    appearProgress,
    exitProgress.interpolate({inputRange: [0, 1], outputRange: [1, 0]}),
  );

  return (
    <>
      {!isExpanded ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <Animated.View
            style={[
              styles.thumbnailWrap,
              {bottom: insets.bottom + 28},
              {
                opacity: thumbnailOpacity,
                transform: [
                  {
                    translateX: exitProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, EXIT_SLIDE_X],
                    }),
                  },
                  {
                    translateY: appearProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [28, 0],
                    }),
                  },
                  {
                    scale: appearProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.55, 1],
                    }),
                  },
                ],
              },
            ]}>
            <Pressable
              accessibilityHint="저장된 이미지를 크게 봅니다"
              accessibilityLabel="저장된 이미지 미리보기"
              accessibilityRole="button"
              onPress={expandPreview}
              style={({pressed}) => [
                styles.thumbnailCard,
                pressed && styles.thumbnailPressed,
              ]}>
              <Image
                resizeMode="cover"
                source={{uri: imageUri}}
                style={{
                  height: thumbnailHeight,
                  width: THUMBNAIL_WIDTH,
                }}
              />
            </Pressable>
          </Animated.View>
        </View>
      ) : (
        <Modal animationType="fade" onRequestClose={onClose} transparent visible>
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
                style={{maxHeight: maxExpandedBodyHeight}}>
                {expandedHeight != null ? (
                  <Image
                    resizeMode="cover"
                    source={{uri: imageUri}}
                    style={[
                      styles.previewImage,
                      {height: expandedHeight, width: expandedWidth},
                    ]}
                  />
                ) : (
                  <View
                    style={[styles.previewPlaceholder, {width: expandedWidth}]}
                  />
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
      )}
    </>
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
  thumbnailCard: {
    backgroundColor: colors.white,
    borderColor: colors.white,
    borderRadius: 12,
    borderWidth: 3,
    elevation: 8,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: {height: 6, width: 0},
    shadowOpacity: 0.32,
    shadowRadius: 12,
  },
  thumbnailPressed: {
    opacity: 0.9,
  },
  thumbnailWrap: {
    left: spacing.lg,
    position: 'absolute',
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 17,
  },
});
