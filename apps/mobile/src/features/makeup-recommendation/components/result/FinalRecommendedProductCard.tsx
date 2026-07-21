import {Image} from 'expo-image';
import {Search, ShoppingBag} from 'lucide-react-native';
import {useLayoutEffect, useRef, useState} from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';

import type {MakeupRecommendationProduct} from '../../types';
import {colors, radius} from '../../theme/makeupResultTokens';

export type FinalRecommendedProductCardProps = {
  colorHex: string;

  onImageSettledChange?: (settled: boolean) => void;
  product?: MakeupRecommendationProduct;
  searchQuery: string;
};

function formatProductPrice(price: number | undefined) {
  return typeof price === 'number' && price > 0
    ? `${price.toLocaleString('ko-KR')}원`
    : '가격 확인';
}

function normalizePurchaseUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

async function openProduct(url: string) {
  const supported = await Linking.canOpenURL(url);
  if (!supported) return false;

  await Linking.openURL(url);
  return true;
}

export function FinalRecommendedProductCard({
  colorHex,
  onImageSettledChange,
  product,
  searchQuery,
}: FinalRecommendedProductCardProps) {
  const productImageKey = normalizePurchaseUrl(product?.imageUrl) || '';
  const productLoadEpochKey = `${product?.id?.trim() || 'empty'}:${productImageKey}`;
  const productLoadEpochKeyRef = useRef(productLoadEpochKey);
  const purchaseUrl = normalizePurchaseUrl(product?.purchaseUrl);
  const productLinkEpochKey = `${product?.id?.trim() || 'empty'}:${purchaseUrl || ''}`;
  const productLinkEpochKeyRef = useRef(productLinkEpochKey);
  const [productImageFailed, setProductImageFailed] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const brandName = product?.brandName?.trim() || '';
  const productName = product?.productName?.trim() || '';
  const productReason = product?.reason?.trim();
  const productPrice = formatProductPrice(product?.price);
  const shadeName = product?.shadeName?.trim();
  const hasCatalogProduct = Boolean(product && productName && purchaseUrl && productImageKey);
  const showProduct = hasCatalogProduct && !productImageFailed;

  useLayoutEffect(() => {
    productLoadEpochKeyRef.current = productLoadEpochKey;
    setProductImageFailed(false);
    onImageSettledChange?.(!hasCatalogProduct || !productImageKey);
  }, [hasCatalogProduct, onImageSettledChange, productImageKey, productLoadEpochKey]);

  useLayoutEffect(() => {
    productLinkEpochKeyRef.current = productLinkEpochKey;
    setLinkError(null);
  }, [productLinkEpochKey]);

  const handleOpenProduct = () => {
    if (!purchaseUrl) return;

    setLinkError(null);
    void openProduct(purchaseUrl)
      .then(opened => {
        if (productLinkEpochKeyRef.current !== productLinkEpochKey) return;
        if (!opened) setLinkError('이 제품 링크를 열 수 없어요.');
      })
      .catch(error => {
        if (productLinkEpochKeyRef.current !== productLinkEpochKey) return;
        console.info('[aura:makeup-recommendation] product-link:failed', {
          message: error instanceof Error ? error.message : String(error),
        });
        setLinkError('제품 페이지를 열지 못했어요. 잠시 후 다시 시도해 주세요.');
      });
  };

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.iconShell}>
          <ShoppingBag color={colors.white} size={16} strokeWidth={2} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>추천 제품</Text>
          <Text style={styles.title}>이 무드에 어울리는 제품</Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Search color={colors.sub2} size={15} strokeWidth={2} />
        <Text numberOfLines={1} style={styles.searchText}>
          {searchQuery}
        </Text>
      </View>

      {showProduct ? (
        <Pressable
          accessibilityLabel={`${brandName ? `${brandName} ` : ''}${productName}${purchaseUrl ? ' 구매 페이지' : ''}`}
          accessibilityHint={purchaseUrl ? '상품 구매 페이지를 엽니다.' : undefined}
          accessibilityRole={purchaseUrl ? 'link' : undefined}
          disabled={!purchaseUrl}
          onPress={handleOpenProduct}
          style={({pressed}) => [
            styles.productRow,
            pressed && purchaseUrl ? styles.pressed : null,
          ]}>
          <View style={styles.productImageFrame}>
          {productImageKey && !productImageFailed ? (
            <Image
              accessibilityIgnoresInvertColors
              contentFit="contain"
              onError={() => {
                if (productLoadEpochKeyRef.current !== productLoadEpochKey) return;
                setProductImageFailed(true);
                onImageSettledChange?.(true);
              }}
              onLoad={() => {
                if (productLoadEpochKeyRef.current !== productLoadEpochKey) return;
                onImageSettledChange?.(true);
              }}
              key={productLoadEpochKey}
              recyclingKey={productLoadEpochKey}
              source={{uri: productImageKey}}
              style={styles.productImage}
            />
          ) : (
            <View style={[styles.productFallback, {backgroundColor: colorHex}]} />
          )}
        </View>
        <View style={styles.productCopy}>
          {brandName ? (
            <Text numberOfLines={1} style={styles.productBrand}>
              {brandName}
            </Text>
          ) : null}
          <Text numberOfLines={2} style={styles.productName}>
            {productName}
          </Text>
          {shadeName ? (
            <Text numberOfLines={1} style={styles.productShade}>
              {shadeName}
            </Text>
          ) : null}
          <Text style={styles.productPrice}>{productPrice}</Text>
        </View>
        </Pressable>
      ) : (
        <View
          accessible
          accessibilityLabel="현재 구매 링크와 이미지가 확인된 추천 제품이 없어요."
          style={styles.unavailableRow}>
          <View style={[styles.unavailableSwatch, {backgroundColor: colorHex}]} />
          <View style={styles.unavailableCopy}>
            <Text style={styles.unavailableTitle}>연결 가능한 제품이 없어요</Text>
            <Text style={styles.unavailableBody}>
              구매 링크와 이미지가 확인된 실제 카탈로그 제품만 표시해요.
            </Text>
          </View>
        </View>
      )}

      {linkError ? (
        <Text accessibilityLiveRegion="polite" style={styles.linkError}>
          {linkError}
        </Text>
      ) : null}

      {productReason?.trim() ? (
        <View style={styles.reasonBubble}>
          <Text style={styles.reasonLabel}>제품 선택 기준</Text>
          <Text style={styles.reasonText}>{productReason}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.glassInner,
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    gap: 12,
    marginTop: 18,
    padding: 14,
  },
  header: {alignItems: 'center', flexDirection: 'row', gap: 10},
  iconShell: {
    alignItems: 'center',
    backgroundColor: colors.dark,
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerCopy: {flex: 1, gap: 2, minWidth: 0},
  eyebrow: {color: colors.sub2, fontSize: 10, fontWeight: '700'},
  title: {color: colors.ink, fontSize: 13.5, fontWeight: '800'},
  searchRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  searchText: {color: colors.ink, flex: 1, fontSize: 10.5, fontWeight: '700'},
  productRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    // 이미지·텍스트 그룹을 카드 가운데로 정렬한다.
    justifyContent: 'center',
    padding: 10,
  },
  productImageFrame: {
    alignItems: 'center',
    backgroundColor: colors.heroPlaceholder,
    borderColor: colors.glassBorder,
    borderRadius: 12,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 72,
  },
  productImage: {height: '100%', width: '100%'},
  productFallback: {borderRadius: 18, height: 36, opacity: 0.72, width: 36},
  productCopy: {flexShrink: 1, gap: 3, justifyContent: 'center', minWidth: 0},
  productBrand: {color: colors.sub2, fontSize: 10.5, fontWeight: '600'},
  productName: {color: colors.ink, fontSize: 13.5, fontWeight: '800', lineHeight: 18},
  productShade: {color: colors.sub2, fontSize: 10.5, fontWeight: '600'},
  productPrice: {color: colors.ink, fontSize: 11, fontWeight: '700'},
  linkError: {color: '#A83E48', fontSize: 10.5, fontWeight: '600', lineHeight: 16},
  reasonBubble: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.glassBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
    padding: 12,
  },
  reasonLabel: {color: colors.ink, fontSize: 10.5, fontWeight: '800'},
  reasonText: {color: colors.sub2, fontSize: 11.5, fontWeight: '500', lineHeight: 17},
  pressed: {opacity: 0.76},
  unavailableRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 92,
    padding: 14,
  },
  unavailableSwatch: {borderRadius: 18, height: 36, opacity: 0.72, width: 36},
  unavailableCopy: {flex: 1, gap: 4, minWidth: 0},
  unavailableTitle: {color: colors.ink, fontSize: 13.5, fontWeight: '800'},
  unavailableBody: {color: colors.sub2, fontSize: 11, fontWeight: '500', lineHeight: 17},
});
