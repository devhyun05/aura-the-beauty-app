import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  type GestureResponderEvent,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  CheckCircle2,
  ExternalLink,
  Heart,
  Menu,
  Plus,
} from 'lucide-react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Text, View, XStack, YStack} from 'tamagui';

import {
  getLikedProducts,
  likeProduct,
  unlikeProduct,
  type ProductLikePayload,
} from '../../../shared/services/productService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {getProductRecommendations} from '../services/productRecommendationService';
import type {
  ProductRecommendationCategory,
  ProductRecommendationData,
  RecommendedProduct,
  ProductRecommendationLook,
  ProductRecommendationSet,
  ProductRecommendationTab,
} from '../types';

const formatPrice = (price: number) =>
  price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 확인';
const PRODUCT_PAGE_SIZE = 4;

type ProductSortOption = 'matchDesc' | 'priceAsc' | 'priceDesc';

const productSortOptions: Array<{
  id: ProductSortOption;
  label: string;
}> = [
  {id: 'matchDesc', label: '유사도 높은 순'},
  {id: 'priceAsc', label: '낮은 가격 순'},
  {id: 'priceDesc', label: '높은 가격 순'},
];

type ProductRecommendationHeaderCopy = {
  productSectionEyebrow?: undefined;
  productSectionTitle?: undefined;
  setSectionEyebrow?: undefined;
};

export const productRecommendationHeaderCopy: ProductRecommendationHeaderCopy = {
  productSectionTitle: undefined,
};

export const getRecommendationSetSectionTitle = (userNickname: string) =>
  `${userNickname} 님의 룩과 잘 맞는 추천 조합`;

export async function openProductPurchaseUrl(product: RecommendedProduct): Promise<boolean> {
  const purchaseUrl = product.purchaseUrl?.trim();

  if (!purchaseUrl) {
    console.info('[aura:products] purchase:missing-url', {
      productId: product.id,
      productName: product.productName,
    });

    return false;
  }

  try {
    await Linking.openURL(purchaseUrl);
  } catch (error) {
    console.info('[aura:products] purchase:open-failed', {
      message: error instanceof Error ? error.message : String(error),
      productId: product.id,
      purchaseUrl,
    });

    return false;
  }

  return true;
}

function getProductDisplayName(product: RecommendedProduct): string {
  return [product.productName, product.shadeName].filter((value) => value.trim()).join(' ');
}

function getSortablePrice(product: RecommendedProduct): number {
  return product.price > 0 ? product.price : Number.MAX_SAFE_INTEGER;
}

function toProductLikePayload(product: RecommendedProduct): ProductLikePayload {
  return {
    brandName: product.brandName,
    category: product.category,
    id: product.id,
    imageUrl: product.imageUrl,
    matchRate: product.matchRate,
    palette: product.palette,
    price: product.price,
    productInfo: product.productInfo as Record<string, unknown> | undefined,
    productName: product.productName,
    purchaseUrl: product.purchaseUrl,
    reason: product.reason,
    shadeName: product.shadeName,
    tags: product.tags,
  };
}

type ProductRecommendationScreenProps = {
  sourceReportId?: string | null;
};

export function ProductRecommendationScreen({
  sourceReportId,
}: ProductRecommendationScreenProps = {}) {
  const {width} = useWindowDimensions();
  const [data, setData] = useState<ProductRecommendationData | null>(null);
  const [activeCategory, setActiveCategory] = useState<ProductRecommendationCategory>('all');
  const [likedProductIds, setLikedProductIds] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<ProductSortOption>('matchDesc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const contentWidth = width - spacing.screenX * 2;
  const cardGap = spacing.md;
  const cardWidth = Math.floor((contentWidth - cardGap) / 2);
  const sortLabel =
    productSortOptions.find((option) => option.id === sortOption)?.label ??
    productSortOptions[0].label;

  const loadRecommendations = useCallback(() => {
    let isMounted = true;

    Promise.all([
      getProductRecommendations({reportId: sourceReportId}),
      getLikedProducts(),
    ]).then(([recommendations, likedProducts]) => {
      if (!isMounted) {
        return;
      }

      setData(recommendations);
      setLikedProductIds(new Set(likedProducts.map((product) => product.id)));
    });

    return () => {
      isMounted = false;
    };
  }, [sourceReportId]);

  useFocusEffect(loadRecommendations);

  const products = useMemo(() => {
    if (!data) {
      return [];
    }

    const filteredProducts =
      activeCategory === 'all'
        ? data.products
        : data.products.filter((product) => product.category === activeCategory);

    return [...filteredProducts].sort((left, right) => {
      if (sortOption === 'priceAsc') {
        return getSortablePrice(left) - getSortablePrice(right);
      }

      if (sortOption === 'priceDesc') {
        return getSortablePrice(right) - getSortablePrice(left);
      }

      return right.matchRate - left.matchRate;
    });
  }, [activeCategory, data, sortOption]);

  const totalProductPages = Math.max(1, Math.ceil(products.length / PRODUCT_PAGE_SIZE));
  const currentProductPage = Math.min(currentPage, totalProductPages);
  const pagedProducts = products.slice(
    (currentProductPage - 1) * PRODUCT_PAGE_SIZE,
    currentProductPage * PRODUCT_PAGE_SIZE,
  );

  useEffect(() => {
    setCurrentPage(1);
    setIsSortMenuOpen(false);
  }, [activeCategory, sortOption]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalProductPages));
  }, [totalProductPages]);

  const handleChangeCategory = useCallback((category: ProductRecommendationCategory) => {
    setActiveCategory(category);
  }, []);

  const handleToggleSortMenu = useCallback(() => {
    setIsSortMenuOpen((isOpen) => !isOpen);
  }, []);

  const handleSelectSortOption = useCallback((option: ProductSortOption) => {
    setSortOption(option);
    setIsSortMenuOpen(false);
    setCurrentPage(1);
  }, []);

  const handleToggleLike = useCallback(async (product: RecommendedProduct) => {
    const wasLiked = likedProductIds.has(product.id);
    const nextLikedIds = new Set(likedProductIds);

    if (wasLiked) {
      nextLikedIds.delete(product.id);
    } else {
      nextLikedIds.add(product.id);
    }

    setLikedProductIds(nextLikedIds);

    try {
      if (wasLiked) {
        await unlikeProduct(product.id);
      } else {
        await likeProduct(toProductLikePayload(product));
      }
    } catch (error) {
      console.info('[aura:products] like:toggle-failed', {
        message: error instanceof Error ? error.message : String(error),
        productId: product.id,
      });
      setLikedProductIds(likedProductIds);
    }
  }, [likedProductIds]);

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>추천 제품을 불러오는 중이에요.</Text>
      </View>
    );
  }

  return (
    <AppScreen contentGap={spacing.xl} topPadding="none">
      <LookSummaryCard makeupLook={data.makeupLook} />

      <CategoryTabs
        activeCategory={activeCategory}
        onChangeCategory={handleChangeCategory}
        tabs={data.tabs}
      />

      <View style={styles.productSection}>
        <View style={styles.productHeader}>
          <View style={styles.productHeaderSpacer} />
          <View style={styles.sortMenuWrap}>
            <Pressable
              accessibilityLabel={`${sortLabel} 정렬 메뉴 열기`}
              accessibilityRole="button"
              accessibilityState={{expanded: isSortMenuOpen}}
              onPress={handleToggleSortMenu}
              style={styles.sortButton}>
              <Menu color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
              <Text style={styles.sortText}>{sortLabel}</Text>
            </Pressable>

            {isSortMenuOpen ? (
              <View accessibilityRole="menu" style={styles.sortMenu}>
                {productSortOptions.map((option) => {
                  const isSelected = option.id === sortOption;

                  return (
                    <Pressable
                      accessibilityLabel={`${option.label} 정렬`}
                      accessibilityRole="menuitem"
                      accessibilityState={{selected: isSelected}}
                      key={option.id}
                      onPress={() => handleSelectSortOption(option.id)}
                      style={isSelected ? styles.sortMenuItemActive : styles.sortMenuItem}>
                      <Text
                        style={
                          isSelected
                            ? styles.sortMenuItemTextActive
                            : styles.sortMenuItemText
                        }>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        </View>

        {products.length > 0 ? (
          <>
            <View style={[styles.productGrid, {columnGap: cardGap, rowGap: spacing.lg}]}>
              {pagedProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  isLiked={likedProductIds.has(product.id)}
                  onToggleLike={handleToggleLike}
                  product={product}
                  width={cardWidth}
                />
              ))}
            </View>

            {totalProductPages > 1 ? (
              <ProductPagination
                currentPage={currentProductPage}
                onChangePage={setCurrentPage}
                totalPages={totalProductPages}
              />
            ) : null}
          </>
        ) : (
          <View style={styles.emptyProductState}>
            <Text style={styles.emptyProductText}>
              네이버 스토어 상품을 불러오지 못했어요. 백엔드 배포와 쇼핑 API 설정을 확인해 주세요.
            </Text>
            <Pressable
              accessibilityLabel="추천 제품 다시 불러오기"
              accessibilityRole="button"
              onPress={() => {
                getProductRecommendations({reportId: sourceReportId}).then(setData);
              }}
              style={styles.retryButton}>
              <Text style={styles.retryButtonText}>다시 불러오기</Text>
            </Pressable>
          </View>
        )}
      </View>

      <YStack style={styles.setSection}>
        <View style={styles.productTitleGroup}>
          <Text style={styles.sectionTitle}>
            {getRecommendationSetSectionTitle(data.userNickname)}
          </Text>
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
    </AppScreen>
  );
}

function LookSummaryCard({makeupLook}: {makeupLook: ProductRecommendationLook}) {
  return (
    <View style={styles.makeupLookCard}>
      <View style={styles.makeupLookImageFrame}>
        <Image resizeMode="cover" source={makeupLook.imageSource} style={styles.makeupLookImage} />
        <View style={styles.makeupLookCheck}>
          <CheckCircle2 color={colors.white} size={iconSize.xs} strokeWidth={2.2} />
        </View>
      </View>

      <YStack style={styles.makeupLookCopy}>
        <Text style={styles.makeupLookCaption}>저장한 메이크업 룩</Text>
        <Text style={styles.makeupLookTitle}>{makeupLook.title}</Text>

        <XStack style={styles.makeupLookTags}>
          {makeupLook.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </XStack>

        <Text style={styles.makeupLookDescription}>{makeupLook.description}</Text>

        <XStack style={styles.paletteRow}>
          {makeupLook.palette.map((color) => (
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

function ProductPagination({
  currentPage,
  onChangePage,
  totalPages,
}: {
  currentPage: number;
  onChangePage: (page: number) => void;
  totalPages: number;
}) {
  const pages = Array.from({length: totalPages}, (_, index) => index + 1);
  const goToPreviousPage = () => onChangePage(Math.max(1, currentPage - 1));
  const goToNextPage = () => onChangePage(Math.min(totalPages, currentPage + 1));

  return (
    <View style={styles.pagination}>
      <Pressable
        accessibilityLabel="이전 추천 제품 페이지"
        accessibilityRole="button"
        accessibilityState={{disabled: currentPage === 1}}
        disabled={currentPage === 1}
        onPress={goToPreviousPage}
        style={[
          styles.paginationButton,
          currentPage === 1 && styles.paginationButtonDisabled,
        ]}>
        <Text
          style={[
            styles.paginationButtonText,
            currentPage === 1 && styles.paginationButtonTextDisabled,
          ]}>
          이전
        </Text>
      </Pressable>

      {pages.map((page) => {
        const isActive = page === currentPage;

        return (
          <Pressable
            accessibilityLabel={`${page}페이지 추천 제품 보기`}
            accessibilityRole="button"
            accessibilityState={{selected: isActive}}
            key={page}
            onPress={() => onChangePage(page)}
            style={[
              styles.paginationButton,
              isActive && styles.paginationButtonActive,
            ]}>
            <Text
              style={[
                styles.paginationButtonText,
                isActive && styles.paginationButtonTextActive,
              ]}>
              {page}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        accessibilityLabel="다음 추천 제품 페이지"
        accessibilityRole="button"
        accessibilityState={{disabled: currentPage === totalPages}}
        disabled={currentPage === totalPages}
        onPress={goToNextPage}
        style={[
          styles.paginationButton,
          currentPage === totalPages && styles.paginationButtonDisabled,
        ]}>
        <Text
          style={[
            styles.paginationButtonText,
            currentPage === totalPages && styles.paginationButtonTextDisabled,
          ]}>
          다음
        </Text>
      </Pressable>
    </View>
  );
}

function ProductCard({
  isLiked,
  onToggleLike,
  product,
  width,
}: {
  isLiked: boolean;
  onToggleLike: (product: RecommendedProduct) => void;
  product: RecommendedProduct;
  width: number;
}) {
  const productDisplayName = getProductDisplayName(product);
  const handlePressLike = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onToggleLike(product);
  };

  return (
    <Pressable
      accessibilityHint={product.purchaseUrl ? '상품 구매 페이지를 엽니다.' : undefined}
      accessibilityLabel={`${product.brandName} ${productDisplayName}`}
      accessibilityRole="button"
      onPress={() => {
        void openProductPurchaseUrl(product);
      }}
      style={({pressed}) => [styles.productCard, {width}, pressed && styles.pressed]}>
      <View style={styles.productImageFrame}>
        <Image resizeMode="contain" source={product.imageSource} style={styles.productImage} />
        <View style={styles.matchBadge}>
          <Text style={styles.matchText}>{product.matchRate}% 매치</Text>
        </View>
        <Pressable
          accessibilityLabel={`${product.productName} ${isLiked ? '찜 해제' : '찜하기'}`}
          accessibilityRole="button"
          accessibilityState={{selected: isLiked}}
          onPress={handlePressLike}
          style={isLiked ? styles.heartButtonLiked : styles.heartButton}>
          <Heart
            color={isLiked ? colors.white : colors.textPrimary}
            fill={isLiked ? colors.textPrimary : 'transparent'}
            size={iconSize.xs}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      <YStack style={styles.productCopy}>
        <Text numberOfLines={1} style={styles.brandName}>
          {product.brandName}
        </Text>
        <Text numberOfLines={2} style={styles.productName}>
          {productDisplayName}
        </Text>
        <XStack style={styles.productPurchaseRow}>
          <Text style={styles.productPrice}>{formatPrice(product.price)}</Text>
          {product.purchaseUrl ? (
            <ExternalLink color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
          ) : null}
        </XStack>

        <XStack style={styles.productPalette}>
          {product.palette.map((color) => (
            <View key={color} style={[styles.productSwatch, {backgroundColor: color}]} />
          ))}
        </XStack>

        <XStack style={styles.productTagRow}>
          {product.tags.slice(0, 3).map((tag) => (
            <View key={tag} style={styles.productTag}>
              <Text numberOfLines={1} style={styles.productTagText}>
                {tag}
              </Text>
            </View>
          ))}
        </XStack>

        <Text numberOfLines={3} style={styles.productReason}>
          {product.reason}
        </Text>
      </YStack>
    </Pressable>
  );
}

function RecommendationSetCard({
  products,
  recommendationSet,
}: {
  products: RecommendedProduct[];
  recommendationSet: ProductRecommendationSet;
}) {
  const setProducts = recommendationSet.productIds
    .map((productId) => products.find((product) => product.id === productId))
    .filter((product): product is RecommendedProduct => Boolean(product));

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

function MiniProductCard({product}: {product: RecommendedProduct}) {
  const productDisplayName = getProductDisplayName(product);

  return (
    <Pressable
      accessibilityLabel={`${product.brandName} ${productDisplayName} 조합에 담기`}
      accessibilityRole="button"
      onPress={() => {
        void openProductPurchaseUrl(product);
      }}
      style={({pressed}) => [styles.miniCard, pressed && styles.pressed]}>
      <View style={styles.miniImageFrame}>
        <Image resizeMode="contain" source={product.imageSource} style={styles.miniImage} />
      </View>
      <View style={styles.miniCopy}>
        <Text numberOfLines={1} style={styles.miniBrand}>
          {product.brandName}
        </Text>
        <Text numberOfLines={2} style={styles.miniName}>
          {productDisplayName}
        </Text>
        <XStack style={styles.miniPurchaseRow}>
          <Text style={styles.miniPrice}>{formatPrice(product.price)}</Text>
          {product.purchaseUrl ? (
            <ExternalLink color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
          ) : null}
        </XStack>
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
  heartButtonLiked: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 34,
  },
  emptyProductState: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
    width: '100%',
  },
  emptyProductText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
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
  makeupLookCaption: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  makeupLookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    ...sharedCardShadow,
  },
  makeupLookCheck: {
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
  makeupLookCopy: {
    flex: 1,
    gap: spacing.sm,
    minWidth: 0,
  },
  makeupLookDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  makeupLookImage: {
    height: '100%',
    width: '100%',
  },
  makeupLookImageFrame: {
    borderRadius: radius.md,
    height: 126,
    overflow: 'hidden',
    position: 'relative',
    width: 104,
  },
  makeupLookTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  makeupLookTitle: {
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
  miniPurchaseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
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
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  paginationButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 38,
    paddingHorizontal: spacing.md,
  },
  paginationButtonActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  paginationButtonDisabled: {
    opacity: 0.38,
  },
  paginationButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  paginationButtonTextActive: {
    color: colors.white,
  },
  paginationButtonTextDisabled: {
    color: colors.textSecondary,
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
  },
  productHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  productHeaderSpacer: {
    flex: 1,
    minWidth: 0,
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
  productReason: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productPurchaseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  productSection: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  productSwatch: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 14,
    width: 22,
  },
  productTag: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  productTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  productTagText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  productTitleGroup: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 38,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  sortMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 160,
    overflow: 'hidden',
    ...sharedCardShadow,
  },
  sortMenuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sortMenuItemActive: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sortMenuItemText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  sortMenuItemTextActive: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  sortMenuWrap: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  sortText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
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
