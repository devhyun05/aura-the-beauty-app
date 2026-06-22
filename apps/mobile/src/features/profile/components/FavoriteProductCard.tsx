import { Image, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import { userPageColors } from '../../../shared/theme/tokens';
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

        {product.isLiked ? (
          <View style={styles.likeBadge}>
            <LikedIcon />
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

function LikedIcon() {
  return (
    <View pointerEvents="none" style={styles.likedIcon}>
      <View style={[styles.likedLine, styles.likedLineLeft]} />
      <View style={[styles.likedLine, styles.likedLineRight]} />
    </View>
  );
}

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
  likeBadge: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: 11,
    borderWidth: 1,
    bottom: 8,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    width: 22,
  },
  likedIcon: {
    height: 12,
    position: 'relative',
    width: 12,
  },
  likedLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 1,
    height: 2,
    position: 'absolute',
    top: 5,
    width: 9,
  },
  likedLineLeft: {
    left: 0,
    transform: [{ rotate: '45deg' }],
  },
  likedLineRight: {
    right: 0,
    transform: [{ rotate: '-45deg' }],
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
