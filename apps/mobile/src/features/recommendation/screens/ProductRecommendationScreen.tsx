import {useCallback, useEffect, useRef, useState} from 'react';
import {Linking, ScrollView, StyleSheet, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';

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
import type {
  CatalogProduct,
  ProductDetailRecommendationContext,
  ProductRecommendationShelf,
} from '../types';

type ProductCategoryTabWidthMode = 'equal' | 'labelContent';
type ProductListScrollAxis = 'horizontal' | 'vertical';

export const productCategoryTabWidthMode: ProductCategoryTabWidthMode = 'labelContent';
export const productListScrollAxis: ProductListScrollAxis = 'vertical';

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
  arStyleId?: string | null;
  onCapturePhoto?: () => void;
  onCreateArLook?: () => void;
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
  onPickGalleryPhoto?: () => void;
  onSearch?: (query: string) => void;
  sourceReportId?: string | null;
  initialSection?: ProductRecommendationShelf;
};

export function ProductRecommendationScreen(props: ProductRecommendationScreenProps = {}) {
  const {showToast, toast} = useTransientToast(2600);
  const productScrollRef = useRef<ScrollView | null>(null);
  const didScrollToInitialSectionRef = useRef(false);
  const hasFocusedHubRef = useRef(false);
  const [likedProductIds, setLikedProductIds] = useState<Set<string>>(new Set());
  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [hubRefreshKey, setHubRefreshKey] = useState(0);
  const [orbScrollState, setOrbScrollState] = useState<'idle' | 'compact' | 'hidden'>('idle');

  useEffect(() => {
    didScrollToInitialSectionRef.current = false;
  }, [props.arStyleId, props.initialSection]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (hasFocusedHubRef.current) setHubRefreshKey(current => current + 1);
    else hasFocusedHubRef.current = true;
    getLikedProducts()
      .then(products => {
        if (!active) return;
        setLikedProducts(products);
        setLikedProductIds(new Set(products.map(product => product.id)));
      })
      .catch(error => {
        console.info('[aura:products] likes:load-failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {active = false;};
  }, []));

  const handleToggleLike = useCallback(async (product: CatalogProduct) => {
    if (product.canLike === false) return;
    const wasLiked = likedProductIds.has(product.productId);
    const next = new Set(likedProductIds);
    if (wasLiked) next.delete(product.productId);
    else next.add(product.productId);
    setLikedProductIds(next);
    try {
      if (wasLiked) {
        await unlikeProduct(product.productId, product.externalSource);
      } else {
        if (product.externalSource) await likeExternalProduct(product.productId, product.externalSource);
        else await likeProduct(product.productId, product.shadeId);
        showToast('좋아요한 제품에 저장했어요', props.onOpenLikedProducts
          ? {label: '보기', onPress: props.onOpenLikedProducts}
          : undefined);
      }
    } catch {
      setLikedProductIds(likedProductIds);
      showToast('좋아요를 변경하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }, [likedProductIds, props.onOpenLikedProducts, showToast]);

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
        onScrollActivityChange={(active, fast) => {
          setOrbScrollState(!active ? 'idle' : fast ? 'hidden' : 'compact');
        }}
        scroll
        scrollViewRef={productScrollRef}
        topPadding="none">
        <ProductRecommendationHubContent
          arStyleId={props.arStyleId}
          likedProductIds={likedProductIds}
          likedProducts={likedProducts}
          onCreateArLook={props.onCreateArLook ?? props.onCapturePhoto ?? (() => undefined)}
          onOpenProduct={handleOpenProduct}
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
          refreshKey={hubRefreshKey}
        />
      </AppScreen>
      <AuradinFloatingOrb
        compact={orbScrollState !== 'idle'}
        hidden={orbScrollState === 'hidden'}
        onOpen={props.onOpenAuradin ?? (() => undefined)}
      />
      {toast}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {backgroundColor: colors.background, flex: 1},
});
