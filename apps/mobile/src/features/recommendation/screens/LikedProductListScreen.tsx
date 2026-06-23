import {useEffect, useState} from 'react';
import {
  Image,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {Text, View} from 'tamagui';

import {getLikedProducts} from '../../../shared/services/productService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {Product} from '../../../shared/types/userPage';
import {
  AppHeader,
  AppScreen,
  ImagePlaceholder,
  PagedGrid,
} from '../../../shared/ui';

const heartFilledIcon = require('../../../assets/icons/profile/heart-filled.png');

type LikedProductListScreenProps = {
  onBack?: () => void;
};

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

export function LikedProductListScreen({onBack}: LikedProductListScreenProps) {
  const {width} = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const gap = spacing.lg;
  const contentWidth = width - spacing.screenX * 2;
  const cardWidth = Math.floor((contentWidth - gap) / 2);

  useEffect(() => {
    let isMounted = true;

    getLikedProducts().then((nextProducts) => {
      if (isMounted) {
        setProducts(nextProducts);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppScreen contentGap={spacing.xl}>
      <AppHeader onBack={onBack} title="좋아요 목록" />

      <PagedGrid
        data={products}
        keyExtractor={(product) => product.id}
        pageSize={10}
        pageStyle={[styles.grid, {columnGap: gap, rowGap: spacing.xxl}]}
        pageWidth={contentWidth}
        renderItem={(product) => (
          <View style={[styles.card, {width: cardWidth}]}>
            <View style={styles.imageArea}>
              <ImagePlaceholder
                borderRadius={radius.md}
                resizeMode="contain"
                source={product.imageSource}
              />
              <View style={styles.heartBadge}>
                <Image
                  resizeMode="contain"
                  source={heartFilledIcon}
                  style={styles.heartIcon}
                />
              </View>
            </View>

            <View style={styles.textArea}>
              <Text numberOfLines={1} style={styles.brand}>
                {product.brandName}
              </Text>
              <Text numberOfLines={2} style={styles.name}>
                {product.productName}
              </Text>
              <Text numberOfLines={1} style={styles.price}>
                {formatPrice(product.price)}
              </Text>
            </View>
          </View>
        )}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
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
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 28,
  },
  heartIcon: {
    height: 14,
    tintColor: colors.black,
    width: 15,
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
  name: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    minHeight: typography.lineHeight.sm * 2,
  },
  price: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  textArea: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
});
