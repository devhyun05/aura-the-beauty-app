import { Image, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { FavoriteProductPreview } from '../../../shared/types/userPage';
import { HeartIcon } from './HeartIcon';

interface FavoriteProductCardProps {
  product: FavoriteProductPreview;
}

const formatPrice = (price: number) => {
  return `${price.toLocaleString('ko-KR')}원`;
};

export const FavoriteProductCard = ({ product }: FavoriteProductCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.imageFrame}>
        <Image
          resizeMode="contain"
          source={product.imageSource}
          style={styles.image}
        />

        {product.isLiked ? (
          <View style={styles.heartBadge}>
            <HeartIcon />
          </View>
        ) : null}
      </View>

      <View style={styles.textGroup}>
        <Text style={styles.brandName}>{product.brandName}</Text>
        <Text style={styles.productName}>{product.productName}</Text>
        <Text style={styles.price}>{formatPrice(product.price)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  brandName: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  card: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  heartBadge: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: 12,
    borderWidth: 1,
    bottom: 8,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    width: 24,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFrame: {
    aspectRatio: 1,
    backgroundColor: userPageColors.surfaceMuted,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  price: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  productName: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    lineHeight: 17,
  },
  textGroup: {
    gap: 4,
  },
});
