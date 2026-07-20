import {useCallback, useEffect, useRef, useState} from 'react';
import {Linking, ScrollView, StyleSheet, View} from 'react-native';
import {useFocusEffect, useIsFocused} from '@react-navigation/native';

import {
  getLikedProducts,
  likeExternalProduct,
  likeProduct,
  unlikeProduct,
} from '../../../shared/services/productService';
import {colors, spacing} from '../../../shared/theme';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {Product} from '../../../shared/types/profile';
import {AppScreen, useTransientToast} from '../../../shared/ui';
import {AuradinFloatingOrb} from '../components/AuradinFloatingOrb';
import {ProductRecommendationHubContent} from '../components/ProductRecommendationHubContent';
import {productLikeKey} from '../services/productLikeIdentity';
import type {
  CatalogProduct,
  MakeupReportProductShelfContext,
  ProductDetailRecommendationContext,
  ProductRecommendationShelf,
} from '../types';

type ProductCategoryTabWidthMode = 'equal' | 'labelContent';
type ProductListScrollAxis = 'horizontal' | 'vertical';

export const productCategoryTabWidthMode: ProductCategoryTabWidthMode = 'labelContent';
export const productListScrollAxis: ProductListScrollAxis = 'vertical';
export const PRODUCT_PREFERENCE_REFRESH_DEBOUNCE_MS = 280;

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
  if (Number.isNaN(date.getTime())) return '최근 분석';
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function getProductRecommendationReportLabel(
  report: Pick<FaceAnalysisReport, 'analyzedAt' | 'personalColor'> | null | undefined,
): string {
  if (!report) return '최근 분석 기준';
  return `${formatRecommendationReportDate(report.analyzedAt)} · ${report.personalColor}`;
}

type ProductRecommendationScreenProps = {
  preferredMakeupReportId?: string | null;
  onCreateMakeupRecommendation?: () => void;
  onOpenAuradin?: () => void;
  onOpenLikedProducts?: () => void;
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
  onOpenMakeupReportShelf?: (context: MakeupReportProductShelfContext) => void;
  onSearch?: (query: string) => void;
  // Kept distinct from preferredMakeupReportId: this is face-analysis context
  // for Auradin, never a MakeupRecommendation report identity.
  sourceReportId?: string | null;
  initialSection?: ProductRecommendationShelf;
};

export function ProductRecommendationScreen(props: ProductRecommendationScreenProps = {}) {
  const isScreenFocused = useIsFocused();
  const {showToast, toast} = useTransientToast(2600);
  const productScrollRef = useRef<ScrollView | null>(null);
  const didScrollToInitialSectionRef = useRef(false);
  const hasFocusedHubRef = useRef(false);
  const preferenceRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const likedProductsRequestRef = useRef(0);
  const likedProductKeysRef = useRef<Set<string>>(new Set());
  const confirmedLikedProductKeysRef = useRef<Set<string>>(new Set());
  const productLikeIntentVersionsRef = useRef(new Map<string, number>());
  const mountedRef = useRef(true);
  const [likedProductKeys, setLikedProductKeys] = useState<Set<string>>(new Set());
  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [hubRefreshKey, setHubRefreshKey] = useState(0);
  const [preferenceMutationRefreshKey, setPreferenceMutationRefreshKey] = useState(0);

  const applyServerLikedProducts = useCallback((products: Product[]) => {
    const nextKeys = new Set(products.map(product =>
      productLikeKey(product.id, product.externalSource),
    ));
    confirmedLikedProductKeysRef.current = new Set(nextKeys);
    likedProductKeysRef.current = nextKeys;
    setLikedProducts(products);
    setLikedProductKeys(nextKeys);
  }, []);

  const applyLikedIntent = useCallback((productKey: string, liked: boolean) => {
    const nextKeys = new Set(likedProductKeysRef.current);
    if (liked) nextKeys.add(productKey);
    else nextKeys.delete(productKey);
    likedProductKeysRef.current = nextKeys;
    setLikedProductKeys(nextKeys);
  }, []);

  const recordConfirmedLike = useCallback((productKey: string, liked: boolean) => {
    const nextKeys = new Set(confirmedLikedProductKeysRef.current);
    if (liked) nextKeys.add(productKey);
    else nextKeys.delete(productKey);
    confirmedLikedProductKeysRef.current = nextKeys;
  }, []);

  useEffect(() => {
    didScrollToInitialSectionRef.current = false;
  }, [props.initialSection, props.preferredMakeupReportId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (preferenceRefreshTimerRef.current) {
        clearTimeout(preferenceRefreshTimerRef.current);
        preferenceRefreshTimerRef.current = null;
      }
      likedProductsRequestRef.current += 1;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (hasFocusedHubRef.current) setHubRefreshKey(current => current + 1);
    else hasFocusedHubRef.current = true;
    const requestId = ++likedProductsRequestRef.current;
    getLikedProducts()
      .then(products => {
        if (!active || likedProductsRequestRef.current !== requestId) return;
        applyServerLikedProducts(products);
      })
      .catch(error => {
        console.info('[aura:products] likes:load-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      active = false;
      if (likedProductsRequestRef.current === requestId) {
        likedProductsRequestRef.current += 1;
      }
    };
  }, [applyServerLikedProducts]));

  const schedulePreferenceRefresh = useCallback(() => {
    if (!mountedRef.current) return;
    if (preferenceRefreshTimerRef.current) {
      clearTimeout(preferenceRefreshTimerRef.current);
    }
    preferenceRefreshTimerRef.current = setTimeout(() => {
      preferenceRefreshTimerRef.current = null;
      if (!mountedRef.current) return;
      setPreferenceMutationRefreshKey(current => current + 1);
      const requestId = ++likedProductsRequestRef.current;
      void getLikedProducts()
        .then(products => {
          if (!mountedRef.current || likedProductsRequestRef.current !== requestId) return;
          applyServerLikedProducts(products);
        })
        .catch(() => undefined);
    }, PRODUCT_PREFERENCE_REFRESH_DEBOUNCE_MS);
  }, [applyServerLikedProducts]);

  const handleToggleLike = useCallback(async (product: CatalogProduct) => {
    if (product.canLike === false) return;
    const productKey = productLikeKey(product.productId, product.externalSource);
    const wasLiked = likedProductKeysRef.current.has(productKey);
    const nextLiked = !wasLiked;
    const intentVersion = (productLikeIntentVersionsRef.current.get(productKey) ?? 0) + 1;
    productLikeIntentVersionsRef.current.set(productKey, intentVersion);
    likedProductsRequestRef.current += 1;
    applyLikedIntent(productKey, nextLiked);
    try {
      if (wasLiked) {
        await unlikeProduct(product.productId, product.externalSource);
      } else {
        if (product.externalSource) await likeExternalProduct(product.productId, product.externalSource);
        else await likeProduct(product.productId, product.shadeId);
      }
      recordConfirmedLike(productKey, nextLiked);
      if (!mountedRef.current) return;
      if (productLikeIntentVersionsRef.current.get(productKey) !== intentVersion) return;
      if (nextLiked) {
        showToast('좋아요한 제품에 저장했어요', props.onOpenLikedProducts
          ? {label: '보기', onPress: props.onOpenLikedProducts}
          : undefined);
      }
      schedulePreferenceRefresh();
    } catch {
      if (!mountedRef.current) return;
      if (productLikeIntentVersionsRef.current.get(productKey) !== intentVersion) return;
      applyLikedIntent(
        productKey,
        confirmedLikedProductKeysRef.current.has(productKey),
      );
      schedulePreferenceRefresh();
      showToast('좋아요를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (productLikeIntentVersionsRef.current.get(productKey) === intentVersion) {
        productLikeIntentVersionsRef.current.delete(productKey);
      }
    }
  }, [applyLikedIntent, props.onOpenLikedProducts, recordConfirmedLike, schedulePreferenceRefresh, showToast]);

  const handleOpenProduct = useCallback(async (product: CatalogProduct) => {
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
    props.onOpenProduct?.(product.productId, product.shadeId, {
      disclosureLabel: product.disclosureLabel ?? product.offer?.disclosureLabel,
      reasonLabels: product.reasonLabels,
      sponsored: product.sponsored,
      sponsorshipType: product.sponsorshipType,
    });
  }, [props.onOpenProduct, showToast]);

  return (
    <View style={styles.root}>
      <AppScreen
        bottomPadding={spacing.xxl * 2}
        contentGap={spacing.xxl}
        horizontalPaddingLeft={spacing.screenX}
        horizontalPaddingRight={spacing.screenX}
        scroll
        scrollViewRef={productScrollRef}
        topPadding="none">
        <ProductRecommendationHubContent
          isActive={isScreenFocused}
          preferredMakeupReportId={props.preferredMakeupReportId}
          likedProductKeys={likedProductKeys}
          likedProducts={likedProducts}
          onCreateMakeupRecommendation={props.onCreateMakeupRecommendation}
          onOpenProduct={handleOpenProduct}
          onOpenMakeupReportShelf={props.onOpenMakeupReportShelf}
          onOpenShelf={props.onOpenShelf ?? (() => undefined)}
          onSearch={props.onSearch ?? (() => undefined)}
          onSectionLayout={(section, y) => {
            if (section !== props.initialSection || didScrollToInitialSectionRef.current) return;
            didScrollToInitialSectionRef.current = true;
            requestAnimationFrame(() => productScrollRef.current?.scrollTo({
              animated: true,
              y: Math.max(0, y - spacing.md),
            }));
          }}
          onToggleLike={handleToggleLike}
          preferenceRefreshKey={hubRefreshKey + preferenceMutationRefreshKey}
          refreshKey={hubRefreshKey}
        />
      </AppScreen>
      <AuradinFloatingOrb
        isActive={isScreenFocused}
        onOpen={props.onOpenAuradin ?? (() => undefined)}
      />
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {backgroundColor: colors.background, flex: 1},
});
