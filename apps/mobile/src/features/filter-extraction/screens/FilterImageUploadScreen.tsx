import {useEffect, useMemo, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import {Camera, Check, ImagePlus} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getFilterExtractionData} from '../services/filterExtractionService';
import type {
  FilterExtractionData,
  FilterExtractionPhoto,
  FilterExtractionSource,
} from '../types';

type FilterImageUploadScreenProps = {
  headerTitle?: string;
  onClose?: () => void;
  onStartAnalysis: (photo: FilterExtractionPhoto) => void;
};

const sourceTabs: {id: FilterExtractionSource; label: string}[] = [
  {id: 'album', label: '앨범에서 선택'},
  {id: 'camera', label: '카메라로 촬영'},
];

export function FilterImageUploadScreen({
  onStartAnalysis,
}: FilterImageUploadScreenProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<FilterExtractionData | null>(null);
  const [activeSource, setActiveSource] = useState<FilterExtractionSource>('album');
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getFilterExtractionData().then((nextData) => {
      if (isMounted) {
        setData(nextData);
        setSelectedPhotoId(nextData.photos[0]?.id ?? null);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedPhoto = useMemo(() => {
    if (!data) {
      return null;
    }

    return data.photos.find((photo) => photo.id === selectedPhotoId) ?? data.photos[0] ?? null;
  }, [data, selectedPhotoId]);

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
      <YStack style={styles.header}>
        <XStack style={styles.tabRow}>
          {sourceTabs.map((tab) => {
            const isActive = tab.id === activeSource;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{selected: isActive}}
                key={tab.id}
                onPress={() => setActiveSource(tab.id)}
                style={styles.tabButton}>
                <Text style={isActive ? styles.tabTextActive : styles.tabText}>
                  {tab.label}
                </Text>
                <View style={isActive ? styles.tabIndicatorActive : styles.tabIndicator} />
              </Pressable>
            );
          })}
        </XStack>
      </YStack>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <Pressable
          accessibilityLabel={
            activeSource === 'album' ? '사진 업로드하기' : '카메라로 촬영하기'
          }
          accessibilityRole="button"
          style={({pressed}) => [styles.uploadHero, pressed && styles.pressed]}>
          <View style={styles.uploadIcon}>
            {activeSource === 'album' ? (
              <ImagePlus color={colors.textPrimary} size={iconSize.lg} strokeWidth={1.8} />
            ) : (
              <Camera color={colors.textPrimary} size={iconSize.lg} strokeWidth={1.8} />
            )}
          </View>
          <YStack style={styles.uploadCopy}>
            <Text style={styles.uploadTitle}>
              {activeSource === 'album' ? '참고할 메이크업 사진 선택' : '새 사진 촬영'}
            </Text>
            <Text style={styles.uploadDescription}>
              얼굴이 정면에 가깝고 메이크업 색감이 잘 보이는 사진을 추천해요.
            </Text>
          </YStack>
        </Pressable>

        <View style={styles.galleryGrid}>
          {data.photos.map((photo) => {
            const isSelected = photo.id === selectedPhoto.id;

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
