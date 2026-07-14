import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import * as SecureStore from '../../../shared/services/localSecureStore';
import {
  CheckCircle2,
  ExternalLink,
  Heart,
  ImagePlus,
  Menu,
} from 'lucide-react-native';
import {useFocusEffect} from '@react-navigation/native';
import {Text, View, XStack, YStack} from 'tamagui';

import {
  getLikedProducts,
  likeExternalProduct,
  likeProduct,
  unlikeProduct,
} from '../../../shared/services/productService';
import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {Product} from '../../../shared/types/profile';
import {AppScreen, useTransientToast} from '../../../shared/ui';
import {AuradinFloatingOrb} from '../components/AuradinFloatingOrb';
import {ProductRecommendationHubContent} from '../components/ProductRecommendationHubContent';
import {RecommendationSectionState} from '../components/RecommendationSectionState';
import {
  getProductRecommendations,
  isTrustedCatalogProductId,
} from '../services/productRecommendationService';
import {
  productEventIdentity,
  queueProductEvent,
} from '../services/productEventService';
import type {
  ProductDetailRecommendationContext,
  ProductRecommendationCategory,
  ProductRecommendationData,
  RecommendedProduct,
  ProductRecommendationLook,
  ProductRecommendationLookOption,
  ProductRecommendationShelf,
  ProductRecommendationTab,
  CatalogProduct,
} from '../types';

const formatPrice = (price: number) =>
  price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 확인';
const LOOK_SELECTION_STORAGE_KEY_PREFIX = 'aura.productRecommendation.lookIndex';

type ProductCategoryTabWidthMode = 'equal' | 'labelContent';
type ProductListScrollAxis = 'horizontal' | 'vertical';

export const productCategoryTabWidthMode: ProductCategoryTabWidthMode = 'labelContent';
export const productListScrollAxis: ProductListScrollAxis = 'vertical';

function getIsProductListHorizontal(axis: ProductListScrollAxis): boolean {
  return axis === 'horizontal';
}

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

function formatRecommendationReportDate(dateText: string): string {
  const date = new Date(dateText);

  if (Number.isNaN(date.getTime())) {
    return '최근 분석';
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${month}.${day}`;
}

export function getProductRecommendationReportLabel(
  report: Pick<FaceAnalysisReport, 'analyzedAt' | 'personalColor'> | null | undefined,
): string {
  if (!report) {
    return '최근 분석 기준';
  }

  return `${formatRecommendationReportDate(report.analyzedAt)} · ${report.personalColor}`;
}

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

type ProductRecommendationScreenProps = {
  arStyleId?: string | null;
  onCapturePhoto?: () => void;
  onCreateArLook?: () => void;
  onOpenAuradin?: () => void;
  onOpenLikedProducts?: () => void;
  onOpenPersonalizationSettings?: () => void;
  onOpenProduct?: (
    productId: string,
    shadeId?: string | null,
    recommendationContext?: ProductDetailRecommendationContext,
  ) => void;
  onOpenShelf?: (
    shelf: ProductRecommendationShelf,
    title: string,
    arStyleId?: string | null,
  ) => void;
  onPickGalleryPhoto?: () => void;
  onSearch?: (query: string) => void;
  sourceReportId?: string | null;
  initialSection?: ProductRecommendationShelf;
};

export function ProductRecommendationScreen({
  arStyleId,
  onCapturePhoto,
  onCreateArLook,
  onOpenAuradin,
  onOpenLikedProducts,
  onOpenPersonalizationSettings,
  onOpenProduct,
  onOpenShelf,
  onPickGalleryPhoto,
  onSearch,
  sourceReportId,
  initialSection,
}: ProductRecommendationScreenProps = {}) {
  const {height, width} = useWindowDimensions();
  const {showToast, toast} = useTransientToast(2600);
  const productScrollRef = useRef<ScrollView | null>(null);
  const legacySectionYRef = useRef(0);
  const pendingLegacyScrollRef = useRef(false);
  const didScrollToInitialSectionRef = useRef(false);
  const [data, setData] = useState<ProductRecommendationData | null>(null);
  const [legacyStatus, setLegacyStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [activeCategory, setActiveCategory] = useState<ProductRecommendationCategory>('all');
  const [likedProductIds, setLikedProductIds] = useState<Set<string>>(new Set());
  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);
  const [isReportListLoaded, setIsReportListLoaded] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    sourceReportId ?? null,
  );
  const [sortOption, setSortOption] = useState<ProductSortOption>('matchDesc');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isLookPickerOpen, setIsLookPickerOpen] = useState(false);
  const [isLegacyExpanded, setIsLegacyExpanded] = useState(false);
  const [isRecommendationRefreshing, setIsRecommendationRefreshing] = useState(false);
  const [selectedLookIndex, setSelectedLookIndex] = useState(0);
  const [orbScrollState, setOrbScrollState] = useState<'idle' | 'compact' | 'hidden'>('idle');
  const [hubRefreshKey, setHubRefreshKey] = useState(0);
  const hasFocusedHubRef = useRef(false);
  const hasLoadedRecommendationsRef = useRef(false);
  useEffect(() => {
    didScrollToInitialSectionRef.current = false;
  }, [arStyleId, initialSection]);
  const isVeryCompactHeight = height < 700;
  const isCompactHeight = height < 780;
  const contentPaddingLeft = spacing.screenX;
  const contentPaddingRight = spacing.screenX;
  const contentWidth = width - contentPaddingLeft - contentPaddingRight;
  const cardGap = width < 380 ? spacing.sm : spacing.md;
  const cardWidth = Math.floor((contentWidth - cardGap) / 2);
  const lookImageSize = isVeryCompactHeight ? 54 : isCompactHeight ? 62 : 70;
  const sectionGap = isVeryCompactHeight ? spacing.xs : spacing.sm;
  const productRowGap = isVeryCompactHeight ? spacing.xs : spacing.sm;
  const reportSelectorReservedHeight = reports.length > 0
    ? isVeryCompactHeight
      ? 96
      : 104
    : 0;
  const minCardHeight = isVeryCompactHeight ? 164 : isCompactHeight ? 178 : 192;
  const maxCardHeight = isVeryCompactHeight ? 176 : isCompactHeight ? 194 : 212;
  const availableProductHeight = Math.max(
    328,
    height - lookImageSize - reportSelectorReservedHeight - 156,
  );
  const cardHeight = Math.max(
    minCardHeight,
    Math.min(maxCardHeight, Math.floor((availableProductHeight - productRowGap) / 2)),
  );
  const productImageHeight = Math.floor(cardHeight * 0.56);
  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );
  const recommendationReportId = selectedReportId ?? sourceReportId ?? null;
  const sortLabel =
    productSortOptions.find((option) => option.id === sortOption)?.label ??
    productSortOptions[0].label;
  const lookSelectionStorageKey = useMemo(
    () => `${LOOK_SELECTION_STORAGE_KEY_PREFIX}.${recommendationReportId ?? 'latest'}`,
    [recommendationReportId],
  );

  useEffect(() => {
    let isMounted = true;

    setSelectedLookIndex(0);

    SecureStore.getItemAsync(lookSelectionStorageKey)
      .then((storedValue) => {
        if (!isMounted) {
          return;
        }

        const storedIndex = Number(storedValue);
        setSelectedLookIndex(
          Number.isInteger(storedIndex) && storedIndex >= 0 ? storedIndex : 0,
        );
      })
      .catch(() => {
        if (isMounted) {
          setSelectedLookIndex(0);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [lookSelectionStorageKey]);

  const loadRecommendations = useCallback(() => {
    let isMounted = true;
    const shouldWaitForReportList = !sourceReportId && !isReportListLoaded;
    const shouldShowRefresh = hasLoadedRecommendationsRef.current;

    if (shouldWaitForReportList) {
      return () => {
        isMounted = false;
      };
    }

    if (!hasLoadedRecommendationsRef.current) {
      setLegacyStatus('loading');
    }

    if (shouldShowRefresh) {
      setIsRecommendationRefreshing(true);
    }

    Promise.allSettled([
      getProductRecommendations({lookIndex: selectedLookIndex, reportId: recommendationReportId}),
      getLikedProducts(),
    ]).then(([recommendationsResult, likedProductsResult]) => {
      if (!isMounted) {
        return;
      }

      if (recommendationsResult.status === 'fulfilled') {
        setData(recommendationsResult.value);
        setLegacyStatus('ready');
        hasLoadedRecommendationsRef.current = true;
      } else {
        setLegacyStatus('error');
        console.info('[aura:products] recommendations:load-failed', {
          message: recommendationsResult.reason instanceof Error
            ? recommendationsResult.reason.message
            : String(recommendationsResult.reason),
        });
      }

      if (likedProductsResult.status === 'fulfilled') {
        setLikedProducts(likedProductsResult.value);
        setLikedProductIds(new Set(likedProductsResult.value.map((product) => product.id)));
      } else {
        console.info('[aura:products] likes:load-failed', {
          message: likedProductsResult.reason instanceof Error
            ? likedProductsResult.reason.message
            : String(likedProductsResult.reason),
        });
      }
    }).finally(() => {
      if (isMounted) {
        setIsRecommendationRefreshing(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isReportListLoaded, recommendationReportId, selectedLookIndex, sourceReportId]);

  useFocusEffect(useCallback(() => {
    let isMounted = true;
    if (hasFocusedHubRef.current) setHubRefreshKey(current => current + 1);
    else hasFocusedHubRef.current = true;
    getLikedProducts()
      .then(nextProducts => {
        if (isMounted) {
          setLikedProducts(nextProducts);
          setLikedProductIds(new Set(nextProducts.map(product => product.id)));
        }
      })
      .catch(error => {
        console.info('[aura:products] likes:load-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    const cleanupRecommendations = isLegacyExpanded ? loadRecommendations() : undefined;
    return () => {
      isMounted = false;
      cleanupRecommendations?.();
    };
  }, [isLegacyExpanded, loadRecommendations]));

  useEffect(() => {
    setSelectedReportId(sourceReportId ?? null);
  }, [sourceReportId]);

  useEffect(() => {
    if (!isLegacyExpanded) {
      return undefined;
    }
    let isMounted = true;

    getFaceAnalysisReports({limit: 20})
      .then((nextReports) => {
        if (!isMounted) {
          return;
        }

        setReports(nextReports);
        setSelectedReportId((currentReportId) =>
          currentReportId ?? nextReports[0]?.id ?? null,
        );
        setIsReportListLoaded(true);
      })
      .catch((error) => {
        console.info('[aura:products] reports:load-failed', {
          message: error instanceof Error ? error.message : String(error),
        });

        if (isMounted) {
          setIsReportListLoaded(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isLegacyExpanded]);

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

  useEffect(() => {
    setIsSortMenuOpen(false);
    productScrollRef.current?.scrollTo({animated: false, x: 0, y: 0});
  }, [activeCategory, sortOption]);

  useEffect(() => {
    setActiveCategory('all');
    setIsSortMenuOpen(false);
    productScrollRef.current?.scrollTo({animated: false, x: 0, y: 0});
  }, [selectedReportId]);

  const handleChangeCategory = useCallback((category: ProductRecommendationCategory) => {
    setActiveCategory(category);
  }, []);

  const handleSelectReport = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
  }, []);

  const handleToggleSortMenu = useCallback(() => {
    setIsSortMenuOpen((isOpen) => !isOpen);
  }, []);

  const handleSelectSortOption = useCallback((option: ProductSortOption) => {
    setSortOption(option);
    setIsSortMenuOpen(false);
  }, []);

  const handleToggleLike = useCallback(async (product: RecommendedProduct) => {
    if (!isTrustedCatalogProductId(product.id) && !product.externalSource) {
      return;
    }
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
        await unlikeProduct(product.id, product.externalSource);
      } else {
        if (product.externalSource) await likeExternalProduct(product.id, product.externalSource);
        else await likeProduct(product.id);
        showToast('좋아요한 제품에 저장했어요', onOpenLikedProducts
          ? {label: '보기', onPress: onOpenLikedProducts}
          : undefined);
      }
    } catch (error) {
      console.info('[aura:products] like:toggle-failed', {
        message: error instanceof Error ? error.message : String(error),
        productId: product.id,
      });
      setLikedProductIds(likedProductIds);
    }
  }, [likedProductIds, onOpenLikedProducts, showToast]);

  const handleOpenLegacyProduct = useCallback((product: RecommendedProduct, position: number) => {
    queueProductEvent({
      eventType: 'product_open',
      section: 'legacy',
      ...productEventIdentity({
        productId: product.id,
        externalSource: product.externalSource,
      }),
      position,
      context: {screen: 'product_recommendation'},
    });
    if (onOpenProduct && isTrustedCatalogProductId(product.id)) {
      onOpenProduct(product.id);
      return;
    }
    void openProductPurchaseUrl(product).then(opened => {
      if (!opened) showToast('판매처 페이지를 열 수 없어요. 잠시 후 다시 시도해 주세요.');
    });
  }, [onOpenProduct, showToast]);

  const handleToggleCatalogLike = useCallback(async (product: CatalogProduct) => {
    const wasLiked = likedProductIds.has(product.productId);
    const nextLikedIds = new Set(likedProductIds);
    if (wasLiked) nextLikedIds.delete(product.productId);
    else nextLikedIds.add(product.productId);
    setLikedProductIds(nextLikedIds);
    try {
      if (wasLiked) await unlikeProduct(product.productId, product.externalSource);
      else {
        if (product.externalSource) await likeExternalProduct(product.productId, product.externalSource);
        else await likeProduct(product.productId, product.shadeId);
        showToast('좋아요한 제품에 저장했어요', onOpenLikedProducts
          ? {label: '보기', onPress: onOpenLikedProducts}
          : undefined);
      }
      setHubRefreshKey(current => current + 1);
    } catch {
      setLikedProductIds(likedProductIds);
    }
  }, [likedProductIds, onOpenLikedProducts, showToast]);

  const handleOpenCatalogProduct = useCallback(async (product: CatalogProduct) => {
    if (product.externalSource) {
      if (!product.purchaseUrl) {
        showToast('판매처 정보를 확인할 수 없어요.');
        return;
      }
      try {
        const supported = await Linking.canOpenURL(product.purchaseUrl);
        if (!supported) throw new Error('Unsupported seller URL');
        await Linking.openURL(product.purchaseUrl);
      } catch {
        showToast('판매처 페이지를 열 수 없어요. 잠시 후 다시 시도해 주세요.');
      }
      return;
    }
    onOpenProduct?.(product.productId, product.shadeId, {
      disclosureLabel: product.disclosureLabel ?? product.offer?.disclosureLabel,
      reasonLabels: product.reasonLabels,
      sponsored: product.sponsored,
      sponsorshipType: product.sponsorshipType,
    });
  }, [onOpenProduct, showToast]);

  const handleOpenLookPicker = useCallback(() => {
    setIsLookPickerOpen(true);
  }, []);

  const handleCloseLookPicker = useCallback(() => {
    setIsLookPickerOpen(false);
  }, []);

  const handleSelectLookOption = useCallback((option: ProductRecommendationLookOption) => {
    setSelectedLookIndex(option.index);
    setIsLookPickerOpen(false);
    void SecureStore.setItemAsync(lookSelectionStorageKey, String(option.index), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }, [lookSelectionStorageKey]);

  const handlePickGalleryPhoto = useCallback(() => {
    setIsLookPickerOpen(false);
    onPickGalleryPhoto?.();
  }, [onPickGalleryPhoto]);

  const handleCapturePhoto = useCallback(() => {
    setIsLookPickerOpen(false);
    onCapturePhoto?.();
  }, [onCapturePhoto]);
  const handleExpandLegacyRecommendations = useCallback(() => {
    pendingLegacyScrollRef.current = true;
    setIsLegacyExpanded(true);
  }, []);
  const handleLegacySectionLayout = useCallback((y: number) => {
    legacySectionYRef.current = y;
    if (!pendingLegacyScrollRef.current) return;
    pendingLegacyScrollRef.current = false;
    requestAnimationFrame(() => productScrollRef.current?.scrollTo({
      animated: true,
      y: Math.max(0, y - spacing.md),
    }));
  }, []);
  const hasLegacyContext = Boolean(
    data && (data.products.length > 0 || data.makeupLook.imageUrl),
  );

  return (
    <View style={styles.screenRoot}>
    <AppScreen
      bottomPadding={spacing.xxl * 2}
      contentGap={spacing.xxl}
      horizontalPaddingLeft={contentPaddingLeft}
      horizontalPaddingRight={contentPaddingRight}
      scroll
      scrollViewRef={productScrollRef}
      onScrollActivityChange={(active, fast) => {
        setOrbScrollState(!active ? 'idle' : fast ? 'hidden' : 'compact');
      }}
      topPadding="none">
      <ProductRecommendationHubContent
        arStyleId={arStyleId}
        likedProducts={likedProducts}
        likedProductIds={likedProductIds}
        onCreateArLook={onCreateArLook ?? onCapturePhoto ?? (() => undefined)}
        onOpenPersonalizationSettings={onOpenPersonalizationSettings ?? (() => undefined)}
        onOpenProduct={handleOpenCatalogProduct}
        onOpenShelf={onOpenShelf ?? (() => undefined)}
        onSearch={onSearch ?? (() => undefined)}
        onToggleLike={handleToggleCatalogLike}
        refreshKey={hubRefreshKey}
        onSectionLayout={(section, y) => {
          if (section === initialSection && !didScrollToInitialSectionRef.current) {
            didScrollToInitialSectionRef.current = true;
            requestAnimationFrame(() => productScrollRef.current?.scrollTo({animated: true, y: Math.max(0, y - spacing.md)}));
          }
        }}
      />

      {!isLegacyExpanded ? (
        <Pressable
          accessibilityHint="보고서, 룩, 카테고리와 정렬 기준을 선택할 수 있는 전체 추천을 엽니다."
          accessibilityLabel="얼굴 분석 기준 전체 추천 열기"
          accessibilityRole="button"
          onPress={handleExpandLegacyRecommendations}
          style={styles.legacyEntryCard}>
          <View style={styles.legacyEntryCopy}>
            <Text style={styles.legacyEntryTitle}>얼굴 분석 기준 전체 추천</Text>
            <Text style={styles.legacyEntryDescription}>
              내 분석 리포트와 메이크업 룩을 기준으로 카테고리·정렬을 바꿔 더 많은 제품을 찾아보세요.
            </Text>
          </View>
          <View style={styles.legacyEntryAction}>
            <Text style={styles.legacyEntryActionText}>전체 추천 보기</Text>
          </View>
        </Pressable>
      ) : null}

      {isLegacyExpanded ? <>
      <View
        onLayout={event => handleLegacySectionLayout(event.nativeEvent.layout.y)}
        style={styles.legacySectionHeader}>
        <View style={styles.legacySectionTitleRow}>
          <Text style={styles.legacySectionTitle}>분석 기준 추천 전체보기</Text>
          <Pressable
            accessibilityLabel="분석 기준 추천 접기"
            accessibilityRole="button"
            onPress={() => setIsLegacyExpanded(false)}
            style={styles.legacyCollapseButton}>
            <Text style={styles.legacyCollapseText}>접기</Text>
          </Pressable>
        </View>
        <Text style={styles.legacySectionDescription}>보고서·룩·카테고리·정렬 기준을 바꿔 전체 상품을 탐색할 수 있어요.</Text>
      </View>
      {legacyStatus === 'loading' && !data ? <RecommendationSectionState kind="loading" message="기존 분석 기준 추천을 불러오는 중이에요." /> : null}
      {legacyStatus === 'error' ? <RecommendationSectionState kind="error" message="기존 분석 기준 추천을 불러오지 못했어요. AR·시즌 추천은 계속 이용할 수 있어요." actionLabel="다시 시도" onAction={() => {loadRecommendations();}} /> : null}
      {legacyStatus === 'ready' && !hasLegacyContext ? <RecommendationSectionState kind="empty" message="현재 표시할 수 있는 기존 분석 기준 상품이 없어요. 검증된 catalog 상품이 준비되면 표시돼요." /> : null}
      {data && hasLegacyContext ? <>
      <ReportSelector
        onSelectReport={handleSelectReport}
        reports={reports}
        selectedReport={selectedReport}
        selectedReportId={selectedReportId}
      />

      <LookSummaryCard
        imageSize={lookImageSize}
        makeupLook={data.makeupLook}
        onChangePhoto={handleOpenLookPicker}
      />

      <LookPickerModal
        isVisible={isLookPickerOpen}
        onCapturePhoto={onCapturePhoto ? handleCapturePhoto : undefined}
        onClose={handleCloseLookPicker}
        onPickGalleryPhoto={onPickGalleryPhoto ? handlePickGalleryPhoto : undefined}
        onSelectLookOption={handleSelectLookOption}
        options={data.makeupLookOptions}
        selectedLookIndex={selectedLookIndex}
      />

      <View style={[styles.productSection, {gap: sectionGap}]}>
        <View style={styles.productControls}>
          <CategoryTabs
            activeCategory={activeCategory}
            onChangeCategory={handleChangeCategory}
            tabs={data.tabs}
          />
          <View style={styles.sortMenuWrap}>
            <Pressable
              accessibilityLabel={`${sortLabel} 정렬 메뉴 열기`}
              accessibilityRole="button"
              accessibilityState={{expanded: isSortMenuOpen}}
              onPress={handleToggleSortMenu}
              style={styles.sortButton}>
              <Menu color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
              <Text numberOfLines={1} style={styles.sortText}>{sortLabel}</Text>
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
                      onPress={() => {
                        handleSelectSortOption(option.id);
                      }}
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
          {isRecommendationRefreshing ? (
            <XStack style={styles.refreshNotice}>
              <ActivityIndicator color={colors.textPrimary} size="small" />
              <Text style={styles.refreshNoticeText}>
                사진 기준으로 제품을 다시 찾는 중이에요.
              </Text>
            </XStack>
          ) : null}
        </View>

        {products.length > 0 ? (
          <View
            style={[
              styles.productGrid,
              {
                columnGap: cardGap,
                rowGap: productRowGap,
                paddingBottom: spacing.sm,
              },
            ]}>
            {products.map((product, position) => (
              <ProductCard
                height={cardHeight}
                imageHeight={productImageHeight}
                key={product.id}
                isLiked={likedProductIds.has(product.id)}
                onToggleLike={handleToggleLike}
                onOpenProduct={() => handleOpenLegacyProduct(product, position)}
                product={product}
                width={cardWidth}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyProductState}>
            <Text style={styles.emptyProductText}>
              구매 가능한 기존 분석 기준 상품이 아직 없어요.
            </Text>
            <Pressable
              accessibilityLabel="추천 제품 다시 불러오기"
              accessibilityRole="button"
              onPress={() => {
                loadRecommendations();
              }}
              style={styles.retryButton}>
              <Text style={styles.retryButtonText}>다시 불러오기</Text>
            </Pressable>
          </View>
        )}
      </View>
      </> : null}
      </> : null}
    </AppScreen>
    <AuradinFloatingOrb
      compact={orbScrollState !== 'idle'}
      hidden={orbScrollState === 'hidden'}
      onOpen={onOpenAuradin ?? (() => undefined)}
    />
    {toast}
    </View>
  );
}

function ReportSelector({
  onSelectReport,
  reports,
  selectedReport,
  selectedReportId,
}: {
  onSelectReport: (reportId: string) => void;
  reports: FaceAnalysisReport[];
  selectedReport: FaceAnalysisReport | null;
  selectedReportId: string | null;
}) {
  if (reports.length === 0) {
    return null;
  }

  return (
    <View style={styles.reportSelector}>
      <View style={styles.reportSelectorHeader}>
        <View style={styles.reportSelectorTitleBlock}>
          <Text style={styles.reportSelectorEyebrow}>기준 보고서</Text>
          <Text numberOfLines={1} style={styles.reportSelectorTitle}>
            {getProductRecommendationReportLabel(selectedReport)}
          </Text>
        </View>
        <Text style={styles.reportSelectorCount}>{reports.length}개</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.reportChipList}
        horizontal
        showsHorizontalScrollIndicator={false}>
        {reports.map((report) => {
          const isSelected = report.id === selectedReportId;

          return (
            <Pressable
              accessibilityLabel={`${getProductRecommendationReportLabel(report)} 기준 추천 제품 보기`}
              accessibilityRole="button"
              accessibilityState={{selected: isSelected}}
              key={report.id}
              onPress={() => onSelectReport(report.id)}
              style={({pressed}) => [
                isSelected ? styles.reportChipSelected : styles.reportChip,
                pressed ? styles.pressed : null,
              ]}>
              <Text style={isSelected ? styles.reportChipDateSelected : styles.reportChipDate}>
                {formatRecommendationReportDate(report.analyzedAt)}
              </Text>
              <Text
                numberOfLines={1}
                style={isSelected ? styles.reportChipTitleSelected : styles.reportChipTitle}>
                {report.personalColor}
              </Text>
              <Text
                numberOfLines={1}
                style={isSelected ? styles.reportChipMoodSelected : styles.reportChipMood}>
                {report.recommendedMood}
              </Text>
              {isSelected ? (
                <View style={styles.reportChipCheck}>
                  <CheckCircle2 color={colors.white} size={iconSize.xs} strokeWidth={2.2} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function LookSummaryCard({
  imageSize,
  makeupLook,
  onChangePhoto,
}: {
  imageSize: number;
  makeupLook: ProductRecommendationLook;
  onChangePhoto?: () => void;
}) {
  return (
    <View style={styles.makeupLookCard}>
      <View style={[styles.makeupLookImageFrame, {height: imageSize, width: imageSize}]}>
        {makeupLook.imageUrl ? (
          <Image resizeMode="cover" source={makeupLook.imageSource} style={styles.makeupLookImage} />
        ) : (
          <View style={[styles.makeupLookImage, styles.missingImagePlaceholder]}>
            <ImagePlus color={colors.textTertiary} size={iconSize.sm} strokeWidth={1.8} />
          </View>
        )}
        <View style={styles.makeupLookCheck}>
          <CheckCircle2 color={colors.white} size={iconSize.xs} strokeWidth={2.2} />
        </View>
      </View>

      <YStack style={styles.makeupLookCopy}>
        <Text numberOfLines={1} style={styles.makeupLookTitle}>{makeupLook.title}</Text>

        <XStack style={styles.makeupLookTags}>
          {makeupLook.tags.slice(0, 2).map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </XStack>

        <XStack style={styles.makeupLookActionRow}>
          <XStack style={styles.paletteRow}>
            {makeupLook.palette.map((color) => (
              <View key={color} style={[styles.paletteSwatch, {backgroundColor: color}]} />
            ))}
          </XStack>

          {onChangePhoto ? (
            <Pressable
              accessibilityLabel="사진을 바꿔 추천 제품 다시 받기"
              accessibilityRole="button"
              onPress={onChangePhoto}
              style={styles.changePhotoButton}>
              <ImagePlus color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
              <Text style={styles.changePhotoButtonText}>사진 변경</Text>
            </Pressable>
          ) : null}
        </XStack>
      </YStack>
    </View>
  );
}

function LookPickerModal({
  isVisible,
  onCapturePhoto,
  onClose,
  onPickGalleryPhoto,
  onSelectLookOption,
  options,
  selectedLookIndex,
}: {
  isVisible: boolean;
  onCapturePhoto?: () => void;
  onClose: () => void;
  onPickGalleryPhoto?: () => void;
  onSelectLookOption: (option: ProductRecommendationLookOption) => void;
  options: ProductRecommendationLookOption[];
  selectedLookIndex: number;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isVisible}>
      <Pressable
        accessibilityLabel="추천 기준 이미지 선택 닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.lookPickerBackdrop}>
        <Pressable
          accessibilityRole="menu"
          onPress={(event) => event.stopPropagation()}
          style={styles.lookPickerSheet}>
          <YStack style={styles.lookPickerHeader}>
            <Text style={styles.lookPickerTitle}>추천 기준 이미지</Text>
            <Text style={styles.lookPickerCaption}>
              처음에는 첫 번째 생성 이미지가 기준이에요.
            </Text>
          </YStack>

          <ScrollView
            contentContainerStyle={styles.lookOptionList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {options.map((option) => {
              const isSelected = option.index === selectedLookIndex;

              return (
                <Pressable
                  accessibilityLabel={`${option.title} 기준으로 추천 제품 보기`}
                  accessibilityRole="menuitem"
                  accessibilityState={{selected: isSelected}}
                  key={`${option.index}-${option.title}`}
                  onPress={() => onSelectLookOption(option)}
                  style={isSelected ? styles.lookOptionCardActive : styles.lookOptionCard}>
                  {option.imageUrl ? (
                    <Image
                      resizeMode="cover"
                      source={option.imageSource}
                      style={styles.lookOptionImage}
                    />
                  ) : (
                    <View style={[styles.lookOptionImage, styles.missingImagePlaceholder]}>
                      <ImagePlus color={colors.textTertiary} size={iconSize.sm} strokeWidth={1.8} />
                    </View>
                  )}
                  <Text numberOfLines={1} style={styles.lookOptionTitle}>
                    {option.title}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <XStack style={styles.lookPickerActions}>
            {onPickGalleryPhoto ? (
              <Pressable
                accessibilityLabel="갤러리에서 새 사진 업로드"
                accessibilityRole="button"
                onPress={onPickGalleryPhoto}
                style={styles.lookPickerActionButton}>
                <Text style={styles.lookPickerActionText}>갤러리 업로드</Text>
              </Pressable>
            ) : null}

            {onCapturePhoto ? (
              <Pressable
                accessibilityLabel="카메라로 새 사진 촬영"
                accessibilityRole="button"
                onPress={onCapturePhoto}
                style={styles.lookPickerActionButton}>
                <Text style={styles.lookPickerActionText}>다시 촬영</Text>
              </Pressable>
            ) : null}
          </XStack>
        </Pressable>
      </Pressable>
    </Modal>
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
      showsHorizontalScrollIndicator={false}
      style={styles.tabScroller}>
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
            <Text numberOfLines={1} style={isActive ? styles.tabTextActive : styles.tabText}>
              {tab.label}
            </Text>
            <View style={isActive ? styles.tabIndicatorActive : styles.tabIndicator} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ProductCard({
  height,
  imageHeight,
  isLiked,
  onToggleLike,
  onOpenProduct,
  product,
  width,
}: {
  height: number;
  imageHeight: number;
  isLiked: boolean;
  onToggleLike: (product: RecommendedProduct) => void;
  onOpenProduct?: () => void;
  product: RecommendedProduct;
  width: number;
}) {
  const productDisplayName = getProductDisplayName(product);
  const canLike = isTrustedCatalogProductId(product.id) || Boolean(product.externalSource);
  const handlePressLike = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onToggleLike(product);
  };

  return (
    <Pressable
      accessibilityHint={product.purchaseUrl ? '상품 구매 페이지를 엽니다.' : undefined}
      accessibilityLabel={`${product.brandName} ${productDisplayName}`}
      accessibilityRole="button"
      onPress={() => {if (onOpenProduct) onOpenProduct(); else void openProductPurchaseUrl(product);}}
      style={({pressed}) => [styles.productCard, {height, width}, pressed && styles.pressed]}>
      <View style={[styles.productImageFrame, {height: imageHeight}]}>
        <Image resizeMode="contain" source={product.imageSource} style={styles.productImage} />
        <View style={styles.matchBadge}>
          <Text numberOfLines={2} style={styles.matchText}>{product.reason}</Text>
        </View>
        {canLike ? <Pressable
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
        </Pressable> : null}
      </View>

      <YStack style={styles.productCopy}>
        <Text numberOfLines={1} style={styles.brandName}>
          {product.brandName}
        </Text>
        <Text numberOfLines={1} style={styles.productName}>
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
      </YStack>
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
  screenRoot: {
    flex: 1,
  },
  legacyEntryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
    ...sharedCardShadow,
  },
  legacyEntryCopy: {
    gap: spacing.xs,
  },
  legacyEntryTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  legacyEntryDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  legacyEntryAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  legacyEntryActionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  legacySectionHeader: {
    gap: spacing.xs,
  },
  legacySectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  legacySectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  legacyCollapseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  legacyCollapseText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  legacySectionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  brandName: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 12,
  },
  heartButton: {
    alignItems: 'center',
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 44,
  },
  heartButtonLiked: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderColor: colors.textPrimary,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 44,
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
  lookOptionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.xs,
    width: 94,
  },
  lookOptionCardActive: {
    backgroundColor: colors.surface,
    borderColor: colors.textPrimary,
    borderRadius: radius.md,
    borderWidth: 2,
    gap: spacing.xs,
    padding: spacing.xs,
    width: 94,
  },
  lookOptionImage: {
    aspectRatio: 1,
    borderRadius: radius.sm,
    width: '100%',
  },
  lookOptionList: {
    gap: spacing.sm,
    paddingRight: spacing.xs,
  },
  lookOptionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    lineHeight: 14,
  },
  lookPickerActionButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  lookPickerActionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  lookPickerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  lookPickerBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.screenX,
  },
  lookPickerCaption: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  lookPickerHeader: {
    gap: 2,
  },
  lookPickerSheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    gap: spacing.md,
    padding: spacing.md,
    ...sharedCardShadow,
  },
  lookPickerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  changePhotoButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  changePhotoButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  makeupLookCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    ...sharedCardShadow,
  },
  makeupLookCheck: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
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
    gap: 4,
    minWidth: 0,
  },
  makeupLookImage: {
    height: '100%',
    width: '100%',
  },
  makeupLookImageFrame: {
    borderRadius: radius.sm,
    height: 74,
    overflow: 'hidden',
    position: 'relative',
    width: 74,
  },
  missingImagePlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
  },
  makeupLookTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  makeupLookActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  makeupLookTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  matchBadge: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    bottom: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    position: 'absolute',
  },
  matchText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  paletteRow: {
    flexDirection: 'row',
    flexShrink: 1,
    gap: 4,
  },
  paletteSwatch: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 28,
    width: 30,
  },
  pressed: {
    opacity: 0.78,
  },
  productCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
    height: 196,
    minWidth: 0,
    overflow: 'hidden',
    paddingBottom: spacing.xs,
    ...sharedCardShadow,
  },
  productCopy: {
    flex: 1,
    gap: 2,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
  },
  productControls: {
    alignItems: 'stretch',
    gap: spacing.xs,
    zIndex: 2,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productImageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    height: 104,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  productName: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 12,
    lineHeight: 15,
  },
  productPalette: {
    flexDirection: 'row',
    gap: 4,
  },
  productListScroller: {
    flex: 1,
  },
  productPrice: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 11,
    lineHeight: 13,
  },
  productPurchaseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  productSection: {
    flex: 1,
    gap: spacing.sm,
    paddingBottom: 0,
    paddingTop: 0,
  },
  productSwatch: {
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 10,
    width: 18,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  refreshNotice: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing.sm,
  },
  refreshNoticeText: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  reportChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 1,
    minHeight: 54,
    minWidth: 128,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'relative',
  },
  reportChipCheck: {
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
  },
  reportChipDate: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 13,
  },
  reportChipDateSelected: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 13,
    opacity: 0.84,
  },
  reportChipList: {
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  reportChipMood: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    lineHeight: 13,
    maxWidth: 100,
  },
  reportChipMoodSelected: {
    color: colors.white,
    fontFamily: typography.fontFamily.medium,
    fontSize: 10,
    lineHeight: 13,
    maxWidth: 100,
    opacity: 0.84,
  },
  reportChipSelected: {
    backgroundColor: colors.blackSurface,
    borderColor: colors.transparent,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 1,
    minHeight: 54,
    minWidth: 128,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'relative',
  },
  reportChipTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    maxWidth: 100,
  },
  reportChipTitleSelected: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    maxWidth: 100,
  },
  reportSelector: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...sharedCardShadow,
  },
  reportSelectorCount: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  reportSelectorEyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 13,
  },
  reportSelectorHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  reportSelectorTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  reportSelectorTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  sortButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    maxWidth: 128,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  sortMenu: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 160,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 50,
    zIndex: 3,
    ...sharedCardShadow,
  },
  sortMenuItem: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  sortMenuItemActive: {
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
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
    position: 'relative',
  },
  sortText: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    maxWidth: 92,
  },
  tabScroller: {
    width: '100%',
  },
  tabButton: {
    alignItems: 'center',
    flexGrow: productCategoryTabWidthMode === 'labelContent' ? 0 : 1,
    flexShrink: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  tabIndicator: {
    backgroundColor: 'transparent',
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  tabIndicatorActive: {
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    height: 3,
    width: '100%',
  },
  tabList: {
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: 2,
    paddingRight: spacing.sm,
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
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  tagText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
});
