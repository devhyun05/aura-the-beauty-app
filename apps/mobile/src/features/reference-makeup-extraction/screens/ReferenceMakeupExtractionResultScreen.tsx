import {useEffect, useRef, useState} from 'react';
import {
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ChevronUp,
  Search,
  ShoppingBag,
  Sparkles,
} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getReferenceMakeupExtractionDataSync} from '../services/makeupExtractionService';
import type {
  MakeupLookPoint,
  ReferenceMakeupAreaGuide,
  ReferenceMakeupExtractionResult,
  ReferenceMakeupPhoto,
} from '../types';

type ReferenceMakeupExtractionResultScreenProps = {
  headerTitle?: string;
  photo: ReferenceMakeupPhoto;
  onOpenARFilter: () => void;
  onBack?: () => void;
  onRetake: () => void;
};

const formatPrice = (price: number) =>
  price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 확인';

export function ReferenceMakeupExtractionResultScreen({
  photo,
  onOpenARFilter,
  onRetake,
}: ReferenceMakeupExtractionResultScreenProps) {
  const {extractedMakeupLook} = getReferenceMakeupExtractionDataSync();
  const [activeAreaIndex, setActiveAreaIndex] = useState(0);
  const [isProExpanded, setIsProExpanded] = useState(false);
  const {width} = useWindowDimensions();
  const areaScrollRef = useRef<ScrollView | null>(null);
  const isProgrammaticAreaScrollRef = useRef(false);
  const areaScrollUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaPageWidth = width;

  useEffect(() => {
    return () => {
      if (areaScrollUnlockTimerRef.current) {
        clearTimeout(areaScrollUnlockTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsProExpanded(false);
  }, [activeAreaIndex]);

  const handleSelectArea = (index: number) => {
    if (index === activeAreaIndex) {
      return;
    }

    isProgrammaticAreaScrollRef.current = true;

    if (areaScrollUnlockTimerRef.current) {
      clearTimeout(areaScrollUnlockTimerRef.current);
    }

    setActiveAreaIndex(index);
    areaScrollRef.current?.scrollTo({animated: true, x: index * areaPageWidth, y: 0});
    areaScrollUnlockTimerRef.current = setTimeout(() => {
      isProgrammaticAreaScrollRef.current = false;
    }, 520);
  };

  const updateActiveAreaIndexFromOffset = (offsetX: number) => {
    if (areaPageWidth <= 0) {
      return;
    }

    const nextIndex = Math.round(offsetX / areaPageWidth);
    const clampedIndex = Math.min(
      extractedMakeupLook.areaGuides.length - 1,
      Math.max(0, nextIndex),
    );

    setActiveAreaIndex((currentIndex) =>
      currentIndex === clampedIndex ? currentIndex : clampedIndex,
    );
  };

  const handleAreaScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isProgrammaticAreaScrollRef.current) {
      return;
    }

    updateActiveAreaIndexFromOffset(event.nativeEvent.contentOffset.x);
  };

  const handleAreaMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isProgrammaticAreaScrollRef.current = false;

    if (areaScrollUnlockTimerRef.current) {
      clearTimeout(areaScrollUnlockTimerRef.current);
      areaScrollUnlockTimerRef.current = null;
    }

    updateActiveAreaIndexFromOffset(event.nativeEvent.contentOffset.x);
  };

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
        <LookIntroCard look={extractedMakeupLook} photo={photo} />
        <ReferenceSummaryCard points={extractedMakeupLook.points} />

        <YStack style={styles.areaExploreSection}>
          <Text style={styles.sectionTitle}>부위별 메이크업</Text>

          <AreaTabRail
            activeAreaIndex={activeAreaIndex}
            guides={extractedMakeupLook.areaGuides}
            onSelectArea={handleSelectArea}
          />

          <ScrollView
            bounces={false}
            horizontal
            nestedScrollEnabled
            onMomentumScrollEnd={handleAreaMomentumEnd}
            onScroll={handleAreaScroll}
            pagingEnabled
            ref={areaScrollRef}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={styles.areaCarousel}>
            {extractedMakeupLook.areaGuides.map((guide, index) => (
              <View key={guide.id} style={[styles.areaPage, {width: areaPageWidth}]}>
                <AreaGuidePanel
                  guide={guide}
                  isProExpanded={index === activeAreaIndex && isProExpanded}
                  onTogglePro={() => setIsProExpanded((expanded) => !expanded)}
                />
              </View>
            ))}
          </ScrollView>
        </YStack>

        <XStack style={styles.actionRow}>
          <Pressable
            accessibilityLabel="다른 사진 선택하기"
            accessibilityRole="button"
            onPress={onRetake}
            style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>다시 선택</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="레퍼런스 메이크업 기반 메이크업 필터 보기"
            accessibilityRole="button"
            onPress={onOpenARFilter}
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>메이크업 필터로 보기</Text>
            <ChevronRight color={colors.white} size={iconSize.xs} strokeWidth={2.2} />
          </Pressable>
        </XStack>
      </ScrollView>
    </AppScreen>
  );
}

function LookIntroCard({
  look,
  photo,
}: {
  look: ReferenceMakeupExtractionResult;
  photo: ReferenceMakeupPhoto;
}) {
  const displayTag = look.tags.find((tag) => tag.includes('러블리')) ?? look.tags[0];

  return (
    <View style={styles.introCard}>
      <View style={styles.introImageFrame}>
        <Image resizeMode="cover" source={photo.imageSource} style={styles.introImage} />
        <View style={styles.introImageShade} />
        <View style={styles.introSparkleBadge}>
          <Sparkles color={colors.white} size={iconSize.xs} strokeWidth={2} />
        </View>
      </View>

      <YStack style={styles.introCopy}>
        <Text style={styles.resultTitle}>{photo.title}</Text>
        <XStack style={styles.lookNameRow}>
          <Text style={styles.lookNameLabel}>분석 룩</Text>
          <Text style={styles.lookNameText}>{look.title}</Text>
        </XStack>
        {displayTag ? (
          <View style={styles.singleTagPill}>
            <Text style={styles.singleTagText}>{displayTag}</Text>
          </View>
        ) : null}
      </YStack>
    </View>
  );
}

function ReferenceSummaryCard({
  points,
}: {
  points: MakeupLookPoint[];
}) {
  return (
    <YStack style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>메이크업 핵심</Text>
      <YStack style={styles.summaryPointList}>
        {points.map((point, index) => (
          <XStack key={point.id} style={styles.summaryPointRowItem}>
            <View style={styles.summaryPointNumber}>
              <Text style={styles.summaryPointNumberText}>{index + 1}</Text>
            </View>
            <YStack style={styles.summaryPointCopy}>
              <Text style={styles.summaryPointTitle}>{point.title}</Text>
              <Text style={styles.summaryPointDescription}>{point.description}</Text>
            </YStack>
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

function AreaTabRail({
  activeAreaIndex,
  guides,
  onSelectArea,
}: {
  activeAreaIndex: number;
  guides: ReferenceMakeupAreaGuide[];
  onSelectArea: (index: number) => void;
}) {
  const tabRailRef = useRef<ScrollView | null>(null);
  const tabLayoutsRef = useRef<Record<number, {width: number; x: number}>>({});
  const {width} = useWindowDimensions();

  useEffect(() => {
    const activeTabLayout = tabLayoutsRef.current[activeAreaIndex];

    if (!activeTabLayout) {
      return;
    }

    const targetX = Math.max(0, activeTabLayout.x - (width - activeTabLayout.width) / 2);
    tabRailRef.current?.scrollTo({animated: true, x: targetX, y: 0});
  }, [activeAreaIndex, width]);

  return (
    <ScrollView
      contentContainerStyle={styles.areaTabList}
      horizontal
      ref={tabRailRef}
      showsHorizontalScrollIndicator={false}
      style={styles.areaTabScroller}>
      {guides.map((guide, index) => {
        const isActive = index === activeAreaIndex;

        return (
          <Pressable
            accessibilityLabel={`${guide.label} 메이크업법 보기`}
            accessibilityRole="tab"
            accessibilityState={{selected: isActive}}
            key={guide.id}
            onLayout={(event) => {
              const {width: tabWidth, x} = event.nativeEvent.layout;
              tabLayoutsRef.current[index] = {width: tabWidth, x};
            }}
            onPress={() => onSelectArea(index)}
            style={isActive ? styles.areaTabActive : styles.areaTab}>
            <View style={[styles.areaTabDot, {backgroundColor: guide.color.hex}]} />
            <Text style={isActive ? styles.areaTabTextActive : styles.areaTabText}>
              {guide.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function AreaGuidePanel({
  guide,
  isProExpanded,
  onTogglePro,
}: {
  guide: ReferenceMakeupAreaGuide;
  isProExpanded: boolean;
  onTogglePro: () => void;
}) {
  const product = guide.productRecommendation.product;
  const [isProductReasonVisible, setIsProductReasonVisible] = useState(false);

  useEffect(() => {
    setIsProductReasonVisible(false);
  }, [guide.id]);

  return (
    <YStack style={styles.areaCard}>
      <XStack style={styles.areaHeader}>
        <View style={[styles.areaSwatchLarge, {backgroundColor: guide.color.hex}]} />
        <YStack style={styles.areaHeaderCopy}>
          <XStack style={styles.areaMetaRow}>
            <Text style={styles.areaLabel}>{guide.label}</Text>
            <Text style={styles.areaColorName}>{guide.color.name}</Text>
          </XStack>
          <Text style={styles.areaTitle}>{guide.title}</Text>
        </YStack>
      </XStack>

      <YStack style={styles.quickTipBox}>
        <Text style={styles.quickTipLabel}>핵심</Text>
        <Text style={styles.quickTipText}>{guide.quickTip}</Text>
      </YStack>

      <YStack style={styles.textureBox}>
        <Text style={styles.textureLabel}>질감</Text>
        <Text style={styles.textureText}>{guide.texture}</Text>
      </YStack>

      <YStack style={styles.productSection}>
        <XStack style={styles.productHeader}>
          <ShoppingBag color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
          <Text style={styles.productTitle}>추천 제품</Text>
        </XStack>

        <XStack style={styles.searchQueryRow}>
          <Search color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
          <Text style={styles.searchQueryText}>
            {guide.productRecommendation.searchQuery}
          </Text>
        </XStack>

        {product ? (
          <XStack style={styles.productRow}>
            <View style={styles.productImageFrame}>
              <Image resizeMode="contain" source={product.imageUrl ? {uri: product.imageUrl} : product.imageSource} style={styles.productImage} />
            </View>
            <YStack style={styles.productCopy}>
              <Text style={styles.productBrand}>{product.brandName}</Text>
              <Text style={styles.productName}>{product.productName}</Text>
              <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
            </YStack>
            <Pressable
              accessibilityLabel="추천 제품 선택 기준 보기"
              accessibilityRole="button"
              accessibilityState={{expanded: isProductReasonVisible}}
              hitSlop={8}
              onPress={() => setIsProductReasonVisible((visible) => !visible)}
              style={({pressed}) => [
                styles.productReasonButton,
                isProductReasonVisible ? styles.productReasonButtonActive : undefined,
                pressed && styles.pressed,
              ]}>
              <CircleHelp
                color={isProductReasonVisible ? colors.white : colors.textSecondary}
                size={iconSize.xs}
                strokeWidth={2}
              />
            </Pressable>
          </XStack>
        ) : null}

        {isProductReasonVisible ? (
          <View style={styles.productReasonBubble}>
            <Text style={styles.productReasonLabel}>제품 선택 기준</Text>
            <Text style={styles.productReasonText}>{guide.productRecommendation.reason}</Text>
          </View>
        ) : null}
      </YStack>

      <Pressable
        accessibilityLabel={isProExpanded ? '자세히 접기' : '자세히 펼치기'}
        accessibilityRole="button"
        accessibilityState={{expanded: isProExpanded}}
        onPress={onTogglePro}
        style={({pressed}) => [styles.proToggleButton, pressed && styles.pressed]}>
        <Text style={styles.proToggleText}>자세히</Text>
        {isProExpanded ? (
          <ChevronUp color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        ) : (
          <ChevronDown color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        )}
      </Pressable>

      {isProExpanded ? <ProDetailSteps guide={guide} /> : null}
    </YStack>
  );
}

type ProDetailStep = {
  id: string;
  number?: string;
  text: string;
};

function parseNumberedDetailSteps(text: string): ProDetailStep[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();

  if (!normalizedText) {
    return [];
  }

  const matches = [...normalizedText.matchAll(/^\s*(\d{1,2})[.)]\s+/gm)];

  if (matches.length === 0) {
    return [{id: 'plain-0', text: normalizedText}];
  }

  return matches.map((match, index) => {
    const startIndex = (match.index ?? 0) + match[0].length;
    const nextMatch = matches[index + 1];
    const endIndex = nextMatch?.index ?? normalizedText.length;
    const textValue = normalizedText.slice(startIndex, endIndex).trim();

    return {
      id: `${match[1]}-${index}`,
      number: match[1],
      text: textValue,
    };
  }).filter((step) => step.text.length > 0);
}

function normalizeFinishDetail(text: string): string {
  const parsedSteps = parseNumberedDetailSteps(text);
  const hasNumberedDetail = parsedSteps.some((step) => step.number);

  if (hasNumberedDetail && parsedSteps.length > 0) {
    return parsedSteps.map((step) => step.text).join(' ');
  }

  return text.replace(/\r\n/g, '\n').trim();
}

function ProDetailSteps({guide}: {guide: ReferenceMakeupAreaGuide}) {
  const guideSteps = parseNumberedDetailSteps(guide.howTo);
  const finishDetail = normalizeFinishDetail(guide.professionalPoint);

  return (
    <YStack style={styles.proDetailSection}>
      <YStack style={styles.proDetailBlock}>
        <Text style={styles.proDetailHeading}>순서 따라가기</Text>
        <YStack style={styles.proStepList}>
          {guideSteps.map((step, index) => (
            <XStack key={`${step.id}-${index}`} style={styles.proStepRow}>
              <Text style={styles.proStepNumberText}>{`${step.number ?? index + 1}.`}</Text>
              <Text style={styles.proStepDescription}>{step.text}</Text>
            </XStack>
          ))}
        </YStack>
      </YStack>

      {finishDetail.length > 0 ? (
        <YStack style={styles.proDetailBlock}>
          <Text style={styles.proDetailHeading}>메이크업 마무리</Text>
          <Text style={styles.proFinishText}>{finishDetail}</Text>
        </YStack>
      ) : null}
    </YStack>
  );
}

const sharedCardShadow = {
  shadowColor: shadows.soft.shadowColor,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: 0.05,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  areaCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  areaColorName: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  areaCarousel: {
    width: '100%',
  },
  areaExploreSection: {
    gap: spacing.md,
    paddingHorizontal: 0,
  },
  areaHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  areaHeaderCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  areaLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  areaMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  areaPage: {
    paddingHorizontal: spacing.md,
  },
  areaSwatchLarge: {
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 62,
    width: 62,
  },
  areaTab: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  areaTabActive: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderColor: colors.transparent,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  areaTabDot: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 14,
    width: 14,
  },
  areaTabList: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingRight: spacing.xxl,
  },
  areaTabScroller: {
    marginHorizontal: 0,
  },
  areaTabText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  areaTabTextActive: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  areaTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: 0,
  },
  introCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    ...sharedCardShadow,
  },
  introCopy: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minWidth: 0,
  },
  introImage: {
    height: '100%',
    width: '100%',
  },
  introImageFrame: {
    borderRadius: radius.md,
    height: 128,
    overflow: 'hidden',
    position: 'relative',
    width: 104,
  },
  introImageShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
  introSparkleBadge: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    bottom: spacing.xs,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    width: 30,
  },
  lookNameLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lookNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  lookNameText: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flex: 1.35,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  proDetailSection: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  proDetailBlock: {
    gap: spacing.sm,
  },
  proDetailHeading: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  proFinishText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
  },
  proStepDescription: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
    minWidth: 0,
  },
  proStepList: {
    gap: spacing.sm,
  },
  proStepNumberText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
    width: 20,
  },
  proStepRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  proToggleButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
  },
  proToggleText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  productBrand: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minWidth: 0,
  },
  productHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productImageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 66,
    overflow: 'hidden',
    width: 66,
  },
  productName: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  productPrice: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productReasonBubble: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  productReasonButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  productReasonButtonActive: {
    backgroundColor: colors.blackSurface,
    borderColor: colors.transparent,
  },
  productReasonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productReasonText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  productSection: {
    gap: spacing.sm,
  },
  productTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },

  quickTipBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  quickTipLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  quickTipText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  resultTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
  },
  searchQueryRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  searchQueryText: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    marginHorizontal: spacing.md,
  },
  singleTagPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  singleTagText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginHorizontal: spacing.md,
    padding: spacing.lg,
    ...sharedCardShadow,
  },

  summaryPointCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  summaryPointDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  summaryPointList: {
    gap: spacing.sm,
  },
  summaryPointNumber: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  summaryPointNumberText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  summaryPointRowItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryPointTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  summaryTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  textureBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.md,
  },
  textureLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  textureText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
});
