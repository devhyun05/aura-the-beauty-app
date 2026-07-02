import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  type GestureResponderEvent,
  Image,
  Linking,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
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
  likeProduct,
  unlikeProduct,
  type ProductLikePayload,
} from '../../../shared/services/productService';
import {getFaceAnalysisReports} from '../../../shared/services/faceAnalysisService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {getProductRecommendations} from '../services/productRecommendationService';
import type {
  ProductRecommendationCategory,
  ProductRecommendationData,
  RecommendedProduct,
  ProductRecommendationLook,
  ProductRecommendationLookOption,
  ProductRecommendationTab,
} from '../types';

const formatPrice = (price: number) =>
  price > 0 ? `${price.toLocaleString('ko-KR')}원` : '가격 확인';
const PRODUCT_PAGE_SIZE = 4;
const LOOK_SELECTION_STORAGE_KEY_PREFIX = 'aura.productRecommendation.lookIndex';

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
  onCapturePhoto?: () => void;
  onPickGalleryPhoto?: () => void;
  sourceReportId?: string | null;
};

export function ProductRecommendationScreen({
  onCapturePhoto,
  onPickGalleryPhoto,
  sourceReportId,
}: ProductRecommendationScreenProps = {}) {
  const {height, width} = useWindowDimensions();
  const productScrollRef = useRef<ScrollView | null>(null);
  const [data, setData] = useState<ProductRecommendationData | null>(null);
  const [activeCategory, setActiveCategory] = useState<ProductRecommendationCategory>('all');
  const [likedProductIds, setLikedProductIds] = useState<Set<string>>(new Set());
  const [reports, setReports] = useState<FaceAnalysisReport[]>([]);
  const [isReportListLoaded, setIsReportListLoaded] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    sourceReportId ?? null,
  );
  const [sortOption, setSortOption] = useState<ProductSortOption>('matchDesc');
  const [currentPage, setCurrentPage] = useState(1);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isLookPickerOpen, setIsLookPickerOpen] = useState(false);
  const [isRecommendationRefreshing, setIsRecommendationRefreshing] = useState(false);
  const [selectedLookIndex, setSelectedLookIndex] = useState(0);
  const hasLoadedRecommendationsRef = useRef(false);
  const isVeryCompactHeight = height < 700;
  const isCompactHeight = height < 780;
  const contentWidth = width - spacing.screenX * 2;
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
  const productCarouselHeight = cardHeight * 2 + productRowGap;
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
        hasLoadedRecommendationsRef.current = true;
      } else {
        console.info('[aura:products] recommendations:load-failed', {
          message: recommendationsResult.reason instanceof Error
            ? recommendationsResult.reason.message
            : String(recommendationsResult.reason),
        });
      }

      if (likedProductsResult.status === 'fulfilled') {
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

  useFocusEffect(loadRecommendations);

  useEffect(() => {
    setSelectedReportId(sourceReportId ?? null);
  }, [sourceReportId]);

  useEffect(() => {
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
  }, []);

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

  const productPages = useMemo(() => {
    const pages: RecommendedProduct[][] = [];

    for (let index = 0; index < products.length; index += PRODUCT_PAGE_SIZE) {
      pages.push(products.slice(index, index + PRODUCT_PAGE_SIZE));
    }

    return pages;
  }, [products]);
  const totalProductPages = Math.max(1, productPages.length);
  const currentProductPage = Math.min(currentPage, totalProductPages);

  useEffect(() => {
    setCurrentPage(1);
    setIsSortMenuOpen(false);
    productScrollRef.current?.scrollTo({animated: false, x: 0, y: 0});
  }, [activeCategory, contentWidth, sortOption]);

  useEffect(() => {
    setActiveCategory('all');
    setCurrentPage(1);
    setIsSortMenuOpen(false);
    productScrollRef.current?.scrollTo({animated: false, x: 0, y: 0});
  }, [selectedReportId]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalProductPages));
  }, [totalProductPages]);

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

  const handleProductMomentumEnd = useCallback((
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / contentWidth) + 1;

    setCurrentPage(Math.min(totalProductPages, Math.max(1, nextPage)));
  }, [contentWidth, totalProductPages]);

  const handleSelectProductPage = useCallback((page: number) => {
    const nextPage = Math.min(totalProductPages, Math.max(1, page));

    setCurrentPage(nextPage);
    productScrollRef.current?.scrollTo({
      animated: true,
      x: (nextPage - 1) * contentWidth,
      y: 0,
    });
  }, [contentWidth, totalProductPages]);

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

  if (!data) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>추천 제품을 불러오는 중이에요.</Text>
      </View>
    );
  }

  return (
    <AppScreen
      bottomPadding={spacing.sm}
      contentGap={sectionGap}
      scroll={false}
      topPadding="none">
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
          <>
            <ScrollView
              bounces={false}
              horizontal
              onMomentumScrollEnd={handleProductMomentumEnd}
              pagingEnabled
              ref={productScrollRef}
              scrollEventThrottle={16}
              showsHorizontalScrollIndicator={false}
              style={[styles.productCarousel, {height: productCarouselHeight}]}>
              {productPages.map((productPage, pageIndex) => (
                <View
                  key={`products-page-${pageIndex}`}
                  style={[styles.productPage, {width: contentWidth}]}>
                  <View style={[styles.productGrid, {columnGap: cardGap, rowGap: productRowGap}]}>
                    {productPage.map((product) => (
                      <ProductCard
                        height={cardHeight}
                        imageHeight={productImageHeight}
                        key={product.id}
                        isLiked={likedProductIds.has(product.id)}
                        onToggleLike={handleToggleLike}
                        product={product}
                        width={cardWidth}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>

            <ProductPageDots
              currentPage={currentProductPage}
              onSelectPage={handleSelectProductPage}
              totalPages={totalProductPages}
            />
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
                getProductRecommendations({
                  lookIndex: selectedLookIndex,
                  reportId: recommendationReportId,
                }).then(setData);
              }}
              style={styles.retryButton}>
              <Text style={styles.retryButtonText}>다시 불러오기</Text>
            </Pressable>
          </View>
        )}
      </View>
    </AppScreen>
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
        <Image resizeMode="cover" source={makeupLook.imageSource} style={styles.makeupLookImage} />
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
                  <Image
                    resizeMode="cover"
                    source={option.imageSource}
                    style={styles.lookOptionImage}
                  />
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
            <Text style={isActive ? styles.tabTextActive : styles.tabText}>{tab.label}</Text>
            <View style={isActive ? styles.tabIndicatorActive : styles.tabIndicator} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ProductPageDots({
  currentPage,
  onSelectPage,
  totalPages,
}: {
  currentPage: number;
  onSelectPage: (page: number) => void;
  totalPages: number;
}) {
  const pages = Array.from({length: totalPages}, (_, index) => index + 1);

  return (
    <View style={styles.productPageDots}>
      {pages.map((page) => {
        const isActive = page === currentPage;

        return (
          <Pressable
            accessibilityLabel={`${page}번째 추천 제품 페이지 보기`}
            accessibilityRole="button"
            accessibilityState={{selected: isActive}}
            hitSlop={8}
            key={page}
            onPress={() => onSelectPage(page)}
            style={isActive ? styles.productPageDotActive : styles.productPageDot}
          />
        );
      })}
    </View>
  );
}

function ProductCard({
  height,
  imageHeight,
  isLiked,
  onToggleLike,
  product,
  width,
}: {
  height: number;
  imageHeight: number;
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
      style={({pressed}) => [styles.productCard, {height, width}, pressed && styles.pressed]}>
      <View style={[styles.productImageFrame, {height: imageHeight}]}>
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
  brandName: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: 10,
    lineHeight: 12,
  },
  heartButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 30,
  },
  heartButtonLiked: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.xs,
    top: spacing.xs,
    width: 30,
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
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    flex: 1,
    height: 38,
    justifyContent: 'center',
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
    height: 30,
    justifyContent: 'center',
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
    backgroundColor: colors.textPrimary,
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
  productCarousel: {
    flexGrow: 0,
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
  productPage: {
    paddingRight: 0,
  },
  productPageDot: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 7,
    width: 7,
  },
  productPageDotActive: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: 7,
    width: 22,
  },
  productPageDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: 22,
    paddingTop: 2,
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
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
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
    height: 36,
    justifyContent: 'center',
    maxWidth: 128,
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
    top: 42,
    zIndex: 3,
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
    gap: spacing.xs,
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
