import {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, Image, Pressable, ScrollView, Share, StyleSheet} from 'react-native';
import {BookmarkPlus} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getReferenceMakeupExtractionDataSync} from '../services/makeupExtractionService';
import type {ReferenceMakeupPhoto, MakeupRecipeTab} from '../types';

type MakeupRecipeDetailScreenProps = {
  headerTitle?: string;
  photo: ReferenceMakeupPhoto;
  onBack?: () => void;
  onHeaderShareActionChange?: (action: MakeupRecipeHeaderShareAction | null) => void;
  onSaveRecipe: () => void;
};

type MakeupRecipeHeaderShareAction = () => void;

const mainTabs: {id: MakeupRecipeTab; label: string}[] = [
  {id: 'all', label: '전체'},
  {id: 'eye', label: '눈'},
  {id: 'lip', label: '입술'},
  {id: 'cheek', label: '볼'},
  {id: 'base', label: '베이스'},
];

const subTabs = ['아이섀도우', '아이라이너', '속눈썹', '애교살'];

const recipeItems = [
  {
    id: 'base-color',
    area: 'eye',
    number: 1,
    title: '베이스 컬러',
    value: '뮤트 로지 베이지',
    swatch: '#D9A9A0',
  },
  {
    id: 'main-color',
    area: 'eye',
    number: 2,
    title: '메인 컬러',
    value: '핑크 브라운',
    swatch: '#B77A70',
  },
  {
    id: 'shadow-color',
    area: 'eye',
    number: 3,
    title: '음영 컬러',
    value: '딥 브라운',
    swatch: '#8B5C53',
  },
  {
    id: 'aegyo-glitter',
    area: 'eye',
    number: 4,
    title: '애교살 글리터',
    value: '실버 베이지 펄',
    swatch: '#C9B2A4',
  },
  {
    id: 'lip-center',
    area: 'lip',
    number: 1,
    title: '입술 중앙',
    value: '맑은 로즈 핑크',
    swatch: '#B85E61',
  },
  {
    id: 'cheek-layer',
    area: 'cheek',
    number: 1,
    title: '치크 레이어',
    value: '광대 위쪽 소프트 블러',
    swatch: '#D6948B',
  },
  {
    id: 'base-glow',
    area: 'base',
    number: 1,
    title: '피부 표현',
    value: '아이보리 세미글로우',
    swatch: '#E9D6CB',
  },
];

export function MakeupRecipeDetailScreen({
  onHeaderShareActionChange,
  photo,
  onSaveRecipe,
}: MakeupRecipeDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const {extractedMakeupLook} = getReferenceMakeupExtractionDataSync();
  const [activeTab, setActiveTab] = useState<MakeupRecipeTab>('eye');
  const [activeSubTab, setActiveSubTab] = useState(subTabs[0]);

  const visibleItems = useMemo(() => {
    if (activeTab === 'all') {
      return recipeItems;
    }

    return recipeItems.filter((item) => item.area === activeTab);
  }, [activeTab]);

  const handleHeaderShare = useCallback(() => {
    const message = buildRecipeShareMessage(extractedMakeupLook.title);

    void Share.share({
      message,
      title: '메이크업 레시피',
    }).catch((error: unknown) => {
      console.info('[aura:makeup-recipe] share:failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      Alert.alert(
        '공유 실패',
        error instanceof Error
          ? error.message
          : '레시피 공유 화면을 열지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    });
  }, [extractedMakeupLook.title]);

  useEffect(() => {
    onHeaderShareActionChange?.(handleHeaderShare);

    return () => {
      onHeaderShareActionChange?.(null);
    };
  }, [handleHeaderShare, onHeaderShareActionChange]);

  return (
    <AppScreen
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      <YStack style={styles.header}>
        <XStack style={styles.mainTabs}>
          {mainTabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{selected: isActive}}
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={styles.mainTabButton}>
                <Text style={isActive ? styles.mainTabTextActive : styles.mainTabText}>
                  {tab.label}
                </Text>
                <View style={isActive ? styles.mainTabIndicatorActive : styles.mainTabIndicator} />
              </Pressable>
            );
          })}
        </XStack>
      </YStack>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}>
        <View style={styles.recipeImageFrame}>
          <Image resizeMode="cover" source={photo.imageSource} style={styles.recipeImage} />
          <View style={styles.imageDim} />
          <View style={styles.eyeGuideTop} />
          <View style={styles.eyeGuideBottom} />
          <GuideNumber number="1" style={styles.guideOne} />
          <GuideNumber number="3" style={styles.guideThree} />
          <GuideNumber number="4" style={styles.guideFour} />
        </View>

        <ScrollView
          contentContainerStyle={styles.subTabList}
          horizontal
          showsHorizontalScrollIndicator={false}>
          {subTabs.map((tab) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: tab === activeSubTab}}
              key={tab}
              onPress={() => setActiveSubTab(tab)}
              style={[styles.subTabButton, tab === activeSubTab ? styles.subTabButtonActive : undefined]}>
              <Text style={tab === activeSubTab ? styles.subTabTextActive : styles.subTabText}>
                {tab}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <YStack style={styles.recipeCard}>
          <Text style={styles.recipeTitle}>{extractedMakeupLook.title}</Text>
          <Text style={styles.recipeDescription}>
            사진에서 추출한 색상과 위치를 실제 메이크업 순서로 정리했어요.
          </Text>

          {visibleItems.map((item) => (
            <XStack key={item.id} style={styles.recipeRow}>
              <View style={styles.numberBadge}>
                <Text style={styles.numberText}>{item.number}</Text>
              </View>
              <YStack style={styles.recipeCopy}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemValue}>{item.value}</Text>
              </YStack>
              <View style={[styles.itemSwatch, {backgroundColor: item.swatch}]} />
            </XStack>
          ))}
        </YStack>

        <YStack style={styles.tipCard}>
          <Text style={styles.tipTitle}>레시피 적용 팁</Text>
          <Text style={styles.tipDescription}>
            눈은 베이스를 넓게 깔고, 음영은 눈꼬리 바깥쪽에만 얇게 쌓으면 사진의
            분위기에 가장 가깝게 재현돼요.
          </Text>
        </YStack>
      </ScrollView>

      <YStack style={[styles.footer, {paddingBottom: insets.bottom + spacing.lg}]}>
        <Pressable
          accessibilityLabel="현재 메이크업 레시피 저장하기"
          accessibilityRole="button"
          onPress={onSaveRecipe}
          style={({pressed}) => [styles.saveButton, pressed && styles.pressed]}>
          <BookmarkPlus color={colors.white} size={iconSize.sm} strokeWidth={2.1} />
          <Text style={styles.saveButtonText}>현재 메이크업 레시피 저장하기</Text>
        </Pressable>
      </YStack>
    </AppScreen>
  );
}

function buildRecipeShareMessage(title: string) {
  const itemLines = recipeItems
    .map((item) => `${item.number}. ${item.title}: ${item.value}`)
    .join('\n');

  return `${title}\n사진에서 추출한 메이크업 레시피예요.\n\n${itemLines}`;
}

function GuideNumber({number, style}: {number: string; style: object}) {
  return (
    <View style={[styles.guideNumber, style]}>
      <Text style={styles.guideNumberText}>{number}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: 112,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  eyeGuideBottom: {
    borderBottomColor: colors.white,
    borderBottomWidth: 2,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderStyle: 'dashed',
    bottom: '31%',
    height: 58,
    left: '20%',
    opacity: 0.86,
    position: 'absolute',
    right: '19%',
    transform: [{rotate: '-5deg'}],
  },
  eyeGuideTop: {
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderStyle: 'dashed',
    borderWidth: 2,
    height: 72,
    left: '18%',
    opacity: 0.9,
    position: 'absolute',
    right: '16%',
    top: '29%',
    transform: [{rotate: '-4deg'}],
  },
  footer: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  guideFour: {
    bottom: '25%',
    right: '17%',
  },
  guideNumber: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    width: 30,
  },
  guideNumberText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  guideOne: {
    right: '12%',
    top: '18%',
  },
  guideThree: {
    right: '10%',
    top: '42%',
  },
  header: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  imageDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
  },
  itemSwatch: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 54,
    width: 54,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  itemValue: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  mainTabButton: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  mainTabIndicator: {
    backgroundColor: 'transparent',
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  mainTabIndicatorActive: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  mainTabText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  mainTabTextActive: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  mainTabs: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  numberBadge: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  numberText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  pressed: {
    opacity: 0.78,
  },
  recipeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: shadows.soft.shadowRadius,
  },
  recipeCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  recipeDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  recipeImage: {
    height: '100%',
    width: '100%',
  },
  recipeImageFrame: {
    aspectRatio: 1.35,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  recipeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  recipeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 58,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
  },
  subTabButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: spacing.md,
  },
  subTabButtonActive: {
    backgroundColor: colors.blackSurface,
  },
  subTabList: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  subTabText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  subTabTextActive: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  tipCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  tipDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  tipTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
});
