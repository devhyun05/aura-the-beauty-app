import {useEffect, useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  Heart,
  PackagePlus,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getProductRecommendations} from '../services/productRecommendationService';
import type {
  ProductRecommendationCategory,
  ProductRecommendationData,
  ProductRecommendationItem,
  ProductRecommendationLook,
  ProductRecommendationSet,
  ProductRecommendationTab,
} from '../types';

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

export function ProductRecommendationScreen() {
  const [data, setData] = useState<ProductRecommendationData | null>(null);
  const [activeCategory, setActiveCategory] = useState<ProductRecommendationCategory>('all');

  useEffect(() => {
    let isMounted = true;

    getProductRecommendations().then((recommendations) => {
      if (isMounted) {
        setData(recommendations);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const products = useMemo(() => {
    if (!data) {
      return [];
    }

    if (activeCategory === 'all') {
      return data.products;
    }

    return data.products.filter((product) => product.category === activeCategory);
  }, [activeCategory, data]);

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>추천 제품을 불러오는 중이에요.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.scrollView}>
      <LookSummaryCard look={data.look} />

      <CategoryTabs
        activeCategory={activeCategory}
        onChangeCategory={setActiveCategory}
        tabs={data.tabs}
      />

      <View style={styles.productHeader}>
        <View style={styles.productTitleGroup}>
          <XStack style={styles.eyebrowRow}>
            <Sparkles color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.eyebrowText}>AI PRODUCT MATCH</Text>
          </XStack>
          <Text style={styles.sectionTitle}>AI가 추천하는 유사 제품</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.sortButton}>
          <Text style={styles.sortText}>유사도 높은 순</Text>
          <ChevronDown color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
        </Pressable>
      </View>

      <View style={styles.productGrid}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </View>

      <YStack style={styles.setSection}>
        <View style={styles.productTitleGroup}>
          <XStack style={styles.eyebrowRow}>
            <PackagePlus color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.eyebrowText}>RECOMMENDED SET</Text>
          </XStack>
          <Text style={styles.sectionTitle}>이 룩과 잘 맞는 추천 조합</Text>
        </View>

        {data.sets.map((set) => (
          <RecommendationSetCard
            key={set.id}
            products={data.products}
            recommendationSet={set}
          />
        ))}
      </YStack>

      <Pressable accessibilityRole="button" style={styles.ctaButton}>
        <Text style={styles.ctaText}>추천 조합 담기</Text>
      </Pressable>
    </ScrollView>
  );
}

function LookSummaryCard({look}: {look: ProductRecommendationLook}) {
  return (
    <View style={styles.lookCard}>
      <View style={styles.lookImageFrame}>
        <Image resizeMode="cover" source={look.imageSource} style={styles.lookImage} />
        <View style={styles.lookCheck}>
          <CheckCircle2 color={colors.white} size={iconSize.xs} strokeWidth={2.2} />
        </View>
      </View>

      <YStack style={styles.lookCopy}>
        <Text style={styles.lookCaption}>저장한 메이크업 룩</Text>
        <Text style={styles.lookTitle}>{look.title}</Text>

        <XStack style={styles.lookTags}>
          {look.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </XStack>

        <Text style={styles.lookDescription}>{look.description}</Text>

        <XStack style={styles.paletteRow}>
          {look.palette.map((color) => (
            <View key={color} style={[styles.paletteSwatch, {backgroundColor: color}]} />
          ))}
        </XStack>
      </YStack>
    </View>
  );
}

function CategoryTabs({
  activeCategory,
  onChangeCategory,
  tabs,
}: {
  activeCategory: ProductRecommendationCategory;
  onChangeCategory: (category: ProductRecommendationCategory) => void;
  tabs: ProductRecommendationTab[];
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.tabList}
      horizontal
      showsHorizontalScrollIndicator={false}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeCategory;

        return (
          <Pressable
            accessibilityLabel={`${tab.label} 제품 보기`}
            accessibilityRole="tab"
            accessibilityState={{selected: isActive}}
            key={tab.id}
            onPress={() => onChangeCategory(tab.id)}
            style={styles.tabButton}>
            <Text style={isActive ? styles.tabTextActive : styles.tabText}>{tab.label}</Text>
            <View style={isActive ? styles.tabIndicatorActive : styles.tabIndicator} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ProductCard({product}: {product: ProductRecommendationItem}) {
  return (
    <Pressable
      accessibilityLabel={`${product.brandName} ${product.productName} ${product.shadeName}`}
      accessibilityRole="button"
      style={({pressed}) => [styles.productCard, pressed && styles.pressed]}>
      <View style={styles.productImageFrame}>
        <Image resizeMode="contain" source={product.imageSource} style={styles.productImage} />
        <View style={styles.matchBadge}>
          <Text style={styles.matchText}>{product.matchRate}% 매치</Text>
        </View>
        <Pressable accessibilityLabel={`${product.productName} 찜하기`} style={styles.heartButton}>
          <Heart color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
        </Pressable>
      </View>

      <YStack style={styles.productCopy}>
        <Text numberOfLines={1} style={styles.brandName}>
          {product.brandName}
        </Text>
        <Text numberOfLines={2} style={styles.productName}>
          {product.productName} {product.shadeName}
        </Text>
        <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>

        <XStack style={styles.productPalette}>
          {product.palette.map((color) => (
            <View key={color} style={[styles.productSwatch, {backgroundColor: color}]} />
          ))}
        </XStack>
      </YStack>
    </Pressable>
  );
}

function RecommendationSetCard({
  products,
  recommendationSet,
}: {
  products: ProductRecommendationItem[];
  recommendationSet: ProductRecommendationSet;
}) {
  const setProducts = recommendationSet.productIds
    .map((productId) => products.find((product) => product.id === productId))
    .filter((product): product is ProductRecommendationItem => Boolean(product));

  return (
    <View style={styles.setBlock}>
      <View style={styles.setHeader}>
        <YStack style={styles.setTitleGroup}>
          <Text style={styles.setTitle}>{recommendationSet.title}</Text>
        </YStack>
        <View style={styles.setBadge}>
          <Text style={styles.setBadgeText}>BEST</Text>
        </View>
      </View>

      <Text numberOfLines={2} style={styles.setDescription}>
        {recommendationSet.description}
      </Text>

      <ScrollView
        contentContainerStyle={styles.setProducts}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {setProducts.map((product) => (
          <MiniProductCard key={product.id} product={product} />
        ))}
      </ScrollView>
    </View>
  );
}

function MiniProductCard({product}: {product: ProductRecommendationItem}) {
  return (
    <Pressable
      accessibilityLabel={`${product.brandName} ${product.productName} 조합에 담기`}
      accessibilityRole="button"
      style={({pressed}) => [styles.miniCard, pressed && styles.pressed]}>
      <View style={styles.miniImageFrame}>
        <Image resizeMode="contain" source={product.imageSource} style={styles.miniImage} />
      </View>
      <View style={styles.miniCopy}>
        <Text numberOfLines={1} style={styles.miniBrand}>
          {product.brandName}
        </Text>
        <Text numberOfLines={2} style={styles.miniName}>
          {product.productName} {product.shadeName}
        </Text>
        <Text style={styles.miniPrice}>{formatPrice(product.price)}</Text>
      </View>
      <View style={styles.plusButton}>
        <Plus color={colors.white} size={iconSize.xs} strokeWidth={2.3} />
      </View>
    </Pressable>
  );
}

const sharedCardShadow = {
  shadowColor: shadows.soft.shadowColor,
  shadowOffset: shadows.soft.shadowOffset,
  shadowOpacity: 0.06,
  shadowRadius: shadows.soft.shadowRadius,
} as const;

const styles = StyleSheet.create({
  brandName: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  ctaButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: 54,
  },
  ctaText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  eyebrowRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  eyebrowText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 0.8,
    lineHeight: typography.lineHeight.xs,
  },
  heartButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 34,
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
  lookCaption: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    ...sharedCardShadow,
  },
  lookCheck: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    bottom: spacing.xs,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    width: 24,
  },
  lookCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  lookDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lookImage: {
    height: '100%',
    width: '100%',
  },
  lookImageFrame: {
    borderRadius: radius.md,
    height: 126,
    overflow: 'hidden',
    position: 'relative',
    width: 104,
  },
  lookTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  lookTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  matchBadge: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    bottom: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  matchText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  miniCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 94,
    padding: spacing.sm,
    position: 'relative',
    width: 232,
  },
  miniBrand: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  miniCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingRight: spacing.md,
  },
  miniImage: {
    height: '100%',
    width: '100%',
  },
  miniImageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 70,
    overflow: 'hidden',
    width: 70,
  },
  miniName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  miniPrice: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  paletteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  paletteSwatch: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 28,
    width: 42,
  },
  plusButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    bottom: spacing.xs,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    width: 28,
  },
  pressed: {
    opacity: 0.78,
  },
  productCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    gap: spacing.sm,
    minWidth: 0,
    overflow: 'hidden',
    paddingBottom: spacing.md,
    ...sharedCardShadow,
  },
  productCopy: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  productHeader: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productImageFrame: {
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  productName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  productPalette: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  productPrice: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  productSwatch: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 14,
    width: 22,
  },
  productTitleGroup: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  scrollView: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  setBadge: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  setBadgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  setHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  setBlock: {
    gap: spacing.sm,
  },
  setDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
    marginTop: -spacing.xs,
  },
  setProducts: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  setSection: {
    gap: spacing.md,
  },
  setTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  setTitleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  sortButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 32,
  },
  sortText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  tabButton: {
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 58,
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
  tabList: {
    gap: spacing.xl,
    paddingRight: spacing.lg,
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
  tagPill: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
