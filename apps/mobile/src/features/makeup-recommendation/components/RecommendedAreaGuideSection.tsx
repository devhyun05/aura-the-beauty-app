import {useEffect, useRef, useState} from 'react';
import {
  Image,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Search, ShoppingBag} from 'lucide-react-native';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {MakeupRecommendationProduct, RecommendedMakeupAreaGuide} from '../types';

const AREA_SCROLL_UNLOCK_MS = 520;

function formatPrice(price: number | undefined) {
  return typeof price === 'number' && price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 확인';
}

async function openProduct(product: MakeupRecommendationProduct) {
  if (!product.purchaseUrl) return;
  const supported = await Linking.canOpenURL(product.purchaseUrl);
  if (supported) await Linking.openURL(product.purchaseUrl);
}

export function RecommendedAreaGuideSection({
  guide,
  onSelectArea,
  guides,
}: {
  guide: RecommendedMakeupAreaGuide;
  onSelectArea: (area: RecommendedMakeupAreaGuide['area']) => void;
  guides: readonly RecommendedMakeupAreaGuide[];
}) {
  const carouselRef = useRef<ScrollView | null>(null);
  const tabRailRef = useRef<ScrollView | null>(null);
  const tabLayoutsRef = useRef<Record<number, {width: number; x: number}>>({});
  const programmaticScrollRef = useRef(false);
  const scrollUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const activeIndex = Math.max(0, guides.findIndex(item => item.area === guide.area));

  useEffect(() => {
    const activeTab = tabLayoutsRef.current[activeIndex];
    if (!activeTab || pageWidth <= 0) return;
    const targetX = Math.max(0, activeTab.x - (pageWidth - activeTab.width) / 2);
    tabRailRef.current?.scrollTo({animated: true, x: targetX, y: 0});
  }, [activeIndex, pageWidth]);

  useEffect(() => () => {
    if (scrollUnlockTimerRef.current) clearTimeout(scrollUnlockTimerRef.current);
  }, []);

  const selectAreaAt = (index: number) => {
    const nextGuide = guides[index];
    if (!nextGuide || index === activeIndex || pageWidth <= 0) return;
    programmaticScrollRef.current = true;
    if (scrollUnlockTimerRef.current) clearTimeout(scrollUnlockTimerRef.current);
    onSelectArea(nextGuide.area);
    carouselRef.current?.scrollTo({animated: true, x: index * pageWidth, y: 0});
    scrollUnlockTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false;
    }, AREA_SCROLL_UNLOCK_MS);
  };

  const syncAreaFromOffset = (offsetX: number) => {
    if (pageWidth <= 0 || programmaticScrollRef.current) return;
    const nextIndex = Math.min(guides.length - 1, Math.max(0, Math.round(offsetX / pageWidth)));
    if (nextIndex !== activeIndex) onSelectArea(guides[nextIndex].area);
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    programmaticScrollRef.current = false;
    if (scrollUnlockTimerRef.current) {
      clearTimeout(scrollUnlockTimerRef.current);
      scrollUnlockTimerRef.current = null;
    }
    syncAreaFromOffset(event.nativeEvent.contentOffset.x);
  };

  return (
    <View
      onLayout={event => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        if (nextWidth > 0 && nextWidth !== pageWidth) setPageWidth(nextWidth);
      }}
      style={styles.section}
    >
      <ScrollView
        contentContainerStyle={styles.tabList}
        horizontal
        ref={tabRailRef}
        showsHorizontalScrollIndicator={false}
        style={styles.tabScroller}
      >
        {guides.map((item, index) => {
          const selected = index === activeIndex;
          return (
            <Pressable
              accessibilityLabel={`${item.label} 메이크업법 보기`}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              key={item.area}
              onLayout={event => {
                const {width, x} = event.nativeEvent.layout;
                tabLayoutsRef.current[index] = {width, x};
              }}
              onPress={() => selectAreaAt(index)}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <View style={[styles.tabDot, {backgroundColor: item.color.hex}]} />
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {pageWidth > 0 ? (
        <ScrollView
          bounces={false}
          decelerationRate="fast"
          horizontal
          onMomentumScrollEnd={handleMomentumEnd}
          onScroll={event => syncAreaFromOffset(event.nativeEvent.contentOffset.x)}
          pagingEnabled
          ref={carouselRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
        >
          {guides.map(item => (
            <View key={item.area} style={[styles.page, {width: pageWidth}]}>
              <AreaGuidePanel guide={item} />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function AreaGuidePanel({guide}: {guide: RecommendedMakeupAreaGuide}) {
  const product = guide.products[0];
  const productSearchQuery = `${guide.color.name} ${guide.texture} ${guide.label} 메이크업`;

  return (
    <View style={styles.guideCard}>
      <View style={styles.areaHeader}>
        <View style={[styles.areaSwatchLarge, {backgroundColor: guide.color.hex}]} />
        <View style={styles.areaHeaderCopy}>
          <View style={styles.areaMetaRow}>
            <Text style={styles.areaLabel}>{guide.label}</Text>
            <Text style={styles.areaColorName}>{guide.color.name}</Text>
          </View>
          <Text style={styles.areaTitle}>{guide.goal}</Text>
        </View>
      </View>

      <View style={styles.quickTipBox}>
        <Text style={styles.boxLabel}>핵심</Text>
        <Text style={styles.quickTipText}>{guide.technique}</Text>
      </View>

      <View style={styles.textureBox}>
        <Text style={styles.boxLabel}>질감</Text>
        <Text style={styles.textureText}>{guide.texture}</Text>
        <Text style={styles.placementText}>{guide.placement}</Text>
      </View>

      {guide.steps.length > 0 ? (
        <View style={styles.proDetailSection}>
          <Text style={styles.blockHeading}>순서 따라가기</Text>
          <View style={styles.stepList}>
            {guide.steps.map((step, index) => (
              <View key={`${step.order}-${index}`} style={styles.stepRow}>
                <View style={styles.stepNumberBadge}>
                  <Text style={styles.stepNumberText}>{`${step.order || index + 1}.`}</Text>
                </View>
                <Text style={styles.stepDescription}>{step.instruction}</Text>
              </View>
            ))}
          </View>
          {guide.reason.trim().length > 0 ? (
            <View style={styles.finishBlock}>
              <Text style={styles.blockHeading}>메이크업 마무리</Text>
              <Text style={styles.finishText}>{guide.reason}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.productSection}>
        <View style={styles.productHeader}>
          <View style={styles.productIconShell}>
            <ShoppingBag color={colors.white} size={iconSize.xs} strokeWidth={2} />
          </View>
          <View style={styles.productHeaderCopy}>
            <Text style={styles.productEyebrow}>추천 제품</Text>
            <Text style={styles.productTitle}>이 룩에 가까운 제품</Text>
          </View>
        </View>

        <View style={styles.searchQueryRow}>
          <Search color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
          <Text style={styles.searchQueryText}>{productSearchQuery}</Text>
        </View>

        {product ? (
          <Pressable
            accessibilityHint={product.purchaseUrl ? '상품 구매 페이지를 엽니다.' : undefined}
            accessibilityRole={product.purchaseUrl ? 'link' : undefined}
            disabled={!product.purchaseUrl}
            onPress={() => { void openProduct(product); }}
            style={({pressed}) => [styles.productRow, pressed && product.purchaseUrl ? styles.pressed : null]}
          >
            <View style={styles.productImageFrame}>
              {product.imageUrl ? (
                <Image resizeMode="contain" source={{uri: product.imageUrl}} style={styles.productImage} />
              ) : (
                <View style={[styles.productFallback, {backgroundColor: guide.color.hex}]} />
              )}
            </View>
            <View style={styles.productCopy}>
              <Text numberOfLines={1} style={styles.productBrand}>{product.brandName}</Text>
              <Text numberOfLines={2} style={styles.productName}>{product.productName}</Text>
              <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
            </View>
          </Pressable>
        ) : null}

        {product?.reason.trim() ? (
          <View style={styles.productReasonBubble}>
            <Text style={styles.productReasonLabel}>제품 선택 기준</Text>
            <Text style={styles.productReasonText}>{product.reason}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const sharedCardShadow = {
  shadowColor: shadows.soft.shadowColor,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: 0.05,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  section: {gap: spacing.md, width: '100%'},
  tabScroller: {marginHorizontal: 0},
  tabList: {gap: spacing.sm, paddingRight: spacing.xxl},
  tab: {
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
  tabSelected: {backgroundColor: colors.blackSurface, borderColor: colors.transparent},
  tabDot: {borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, height: 14, width: 14},
  tabLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  tabLabelSelected: {color: colors.white},
  carousel: {width: '100%'},
  page: {paddingBottom: 1},
  guideCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    ...sharedCardShadow,
  },
  areaHeader: {alignItems: 'center', flexDirection: 'row', gap: spacing.md},
  areaSwatchLarge: {borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, height: 62, width: 62},
  areaHeaderCopy: {flex: 1, gap: spacing.xs, minWidth: 0},
  areaMetaRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.xs},
  areaLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  areaColorName: {color: colors.textSecondary, flexShrink: 1, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  areaTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, lineHeight: typography.lineHeight.lg},
  quickTipBox: {backgroundColor: colors.surfaceMuted, borderRadius: radius.md, gap: spacing.xs, padding: spacing.md},
  textureBox: {backgroundColor: colors.surfaceMuted, borderRadius: radius.md, gap: spacing.xs, padding: spacing.md},
  boxLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  quickTipText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  textureText: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  placementText: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs},
  proDetailSection: {backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, padding: spacing.md},
  blockHeading: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  stepList: {gap: spacing.xs},
  stepRow: {alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, padding: spacing.md},
  stepNumberBadge: {alignItems: 'center', backgroundColor: colors.blackSurface, borderRadius: radius.pill, height: 28, justifyContent: 'center', marginTop: 1, minWidth: 34, paddingHorizontal: spacing.xs},
  stepNumberText: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  stepDescription: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.md, minWidth: 0},
  finishBlock: {gap: spacing.sm},
  finishText: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.md, padding: spacing.md},
  productSection: {backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.md, marginTop: spacing.xs, padding: spacing.md},
  productHeader: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm},
  productIconShell: {alignItems: 'center', backgroundColor: colors.blackSurface, borderRadius: radius.pill, height: 34, justifyContent: 'center', width: 34},
  productHeaderCopy: {flex: 1, gap: 2, minWidth: 0},
  productEyebrow: {color: colors.textSecondary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  productTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  searchQueryRow: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 38, paddingHorizontal: spacing.md, paddingVertical: spacing.xs},
  searchQueryText: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  productRow: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.md, padding: spacing.sm},
  productImageFrame: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, height: 72, justifyContent: 'center', overflow: 'hidden', width: 72},
  productImage: {height: '100%', width: '100%'},
  productFallback: {borderRadius: radius.pill, height: 32, opacity: 0.72, width: 32},
  productCopy: {flex: 1, gap: 3, justifyContent: 'center', minWidth: 0},
  productBrand: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  productName: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  productPrice: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  productReasonBubble: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md},
  productReasonLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  productReasonText: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  pressed: {opacity: 0.78},
});
