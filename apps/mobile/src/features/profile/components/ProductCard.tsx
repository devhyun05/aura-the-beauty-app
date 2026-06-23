import {StyleSheet, type StyleProp, type ViewStyle} from 'react-native';
import {Text, View} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppCard, HeartIcon, ImagePlaceholder} from '../../../shared/ui';
import type {Product} from '../../../shared/types/userPage';

type ProductCardProps = {
  product: Product;
  style?: StyleProp<ViewStyle>;
};

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

export function ProductCard({product, style}: ProductCardProps) {
  return (
    <AppCard padded={false} style={[styles.card, style]}>
      <View style={styles.imageArea}>
        <ImagePlaceholder
          borderRadius={radius.md}
          resizeMode="contain"
          source={product.imageSource}
        />

        <View style={styles.heartBadge}>
          <HeartIcon size={16} />
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
    </AppCard>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  card: {
    minWidth: 0,
    overflow: 'hidden',
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
    right: 6,
    top: 6,
    width: 28,
  },
  imageArea: {
    aspectRatio: 0.86,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 6,
    position: 'relative',
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
    minHeight: typography.lineHeight.xs,
  },
  price: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  textArea: {
    gap: 2,
    paddingBottom: 7,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
});
