import {useCallback, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Text, View} from 'tamagui';

import {getLikedProducts, unlikeProduct} from '../../../shared/services/productService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {Product} from '../../../shared/types/profile';
import {
  AppScreen,
  HeartIcon,
  ImagePlaceholder,
  PagedGrid,
} from '../../../shared/ui';
import {RecommendationSectionState} from '../components/RecommendationSectionState';

export const LIKED_PRODUCT_LIST_FAVORITE_ICON_NAME = 'Heart';

type LikedProductListScreenProps = {
  headerTitle?: string;
  onBack?: () => void;
  onOpenProduct?: (productId: string, shadeId?: string | null) => void;
};

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

export function LikedProductListScreen({onOpenProduct}: LikedProductListScreenProps = {}) {
  const {width} = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const gap = spacing.lg;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

  const load = useCallback(() => {
    let isMounted = true;
    setStatus('loading');
    getLikedProducts().then((nextProducts) => {
      if (isMounted) {
        setProducts(nextProducts);
        setStatus('ready');
      }
    }).catch(() => {if (isMounted) setStatus('error');});

    return () => {
      isMounted = false;
    };
  }, []);
  useFocusEffect(load);

  const removeLike = async (product: Product) => {
    setProducts(current => current.filter(item => item.id !== product.id));
    try {
      await unlikeProduct(product.id, product.externalSource);
    } catch {
      setProducts(current => current.some(item => item.id === product.id) ? current : [product, ...current]);
    }
  };
  const openLikedProduct = async (product: Product) => {
    if (product.externalSource && product.purchaseUrl) {
      try {
        const supported = await Linking.canOpenURL(product.purchaseUrl);
        if (!supported) throw new Error('Unsupported seller URL');
        await Linking.openURL(product.purchaseUrl);
      } catch {
        Alert.alert('판매처를 열 수 없어요', '잠시 후 다시 시도해 주세요.');
      }
      return;
    }
    onOpenProduct?.(product.id, product.shadeId);
  };

  return (
    <View style={styles.screen}>
      <AppScreen contentGap={spacing.xl} topPadding="none">
        {status === 'loading' ? <RecommendationSectionState kind="loading" message="좋아요한 제품을 불러오는 중이에요." /> : null}
        {status === 'error' ? <RecommendationSectionState kind="error" message="좋아요한 제품을 불러오지 못했어요." actionLabel="다시 시도" onAction={load} /> : null}
        {status === 'ready' && products.length === 0 ? <RecommendationSectionState kind="empty" message="좋아요한 제품이 아직 없어요." /> : null}
        {status === 'ready' && products.length > 0 ? (
        <PagedGrid
          data={products}
          keyExtractor={(product) => product.id}
          pageSize={10}
          pageStyle={[styles.grid, {columnGap: gap, rowGap: spacing.xxl}]}
          pageWidth={contentWidth}
          renderItem={(product) => (
            <View style={[styles.card, {width: cardWidth}]}>
              <View style={styles.imageArea}>
                <Pressable
                  accessibilityLabel={product.status === 'unavailable' ? '표시할 수 없는 제품' : `${product.brandName} ${product.productName} 상세 보기`}
                  accessibilityRole="button"
                  disabled={product.status === 'unavailable' || (!onOpenProduct && !product.purchaseUrl)}
                  onPress={() => void openLikedProduct(product)}
                  style={styles.imageOpen}>
                  <ImagePlaceholder
                    borderRadius={radius.md}
                    resizeMode="contain"
                    source={product.imageSource}
                  />
                </Pressable>
                <Pressable
                  accessibilityLabel="좋아요 취소"
                  accessibilityRole="button"
                  onPress={() => void removeLike(product)}
                  style={styles.heartBadge}>
                  <HeartIcon color={colors.black} filled size={iconSize.xs} strokeWidth={2.1} />
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={product.status === 'unavailable' || (!onOpenProduct && !product.purchaseUrl)}
                onPress={() => void openLikedProduct(product)}
                style={styles.textArea}>
                <Text numberOfLines={1} style={styles.brand}>
                  {product.status === 'unavailable' ? '표시 권리 만료' : product.brandName}
                </Text>
                <Text numberOfLines={2} style={styles.name}>
                  {product.status === 'unavailable' ? '제품 정보는 숨김 처리되었어요.' : product.productName}
                </Text>
                <Text numberOfLines={1} style={styles.price}>
                  {product.status === 'unavailable' ? '좋아요 취소 가능' : product.status === 'soldOut' ? '판매 종료' : formatPrice(product.price)}
                </Text>
              </Pressable>
            </View>
          )}
        />
        ) : null}
      </AppScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  card: {
    gap: spacing.sm,
    minWidth: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  heartBadge: {
    alignItems: 'center',
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 44,
  },
  imageArea: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.md,
    position: 'relative',
  },
  imageOpen: {
    height: '100%',
    width: '100%',
  },
  name: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    minHeight: typography.lineHeight.sm * 2,
  },
  price: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  textArea: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
