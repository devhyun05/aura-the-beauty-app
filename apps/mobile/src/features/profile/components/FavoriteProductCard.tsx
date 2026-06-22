import { Image, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { userPageColors, userPageRadius } from '../../../shared/theme/tokens';
import type { FavoriteProductPreview } from '../../../shared/types/userPage';

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

        <Text style={styles.likeIcon}>{product.isLiked ? '♥' : '♡'}</Text>
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
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFrame: {
    aspectRatio: 1,
    borderColor: userPageColors.borderSubtle,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  likeIcon: {
    bottom: 8,
    color: userPageColors.accent,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 22,
    position: 'absolute',
    right: 8,
  },
  price: {
    color: userPageColors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  productName: {
    color: userPageColors.textMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  textGroup: {
    gap: 6,
  },
});
