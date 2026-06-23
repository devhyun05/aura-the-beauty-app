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

        <View style={styles.heart}>
          <HeartIcon />
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
  heart: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
  imageArea: {
    aspectRatio: 1,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    padding: spacing.sm,
    position: 'relative',
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
    minHeight: typography.lineHeight.xs * 2,
  },
  price: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  textArea: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
  },
});
