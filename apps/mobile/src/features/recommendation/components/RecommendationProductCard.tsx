import {Image, Pressable, StyleSheet, View} from 'react-native';
import {ExternalLink, Heart} from 'lucide-react-native';
import {Text} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {CatalogProduct} from '../types';

export const RECOMMENDATION_RAIL_CARD_WIDTH = 148;

export function RecommendationProductCard({
  product,
  onOpen,
  onToggleLike,
}: {
  product: CatalogProduct;
  onOpen: () => void;
  onToggleLike: () => void;
}) {
  const liked = product.viewerState.liked;
  const canLike = product.canLike !== false;
  return (
    <Pressable
      accessibilityLabel={`${product.brandName} ${product.productName}${product.shadeName ? ` ${product.shadeName}` : ''}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={styles.card}>
      <View style={styles.imageFrame}>
        {product.imageUrl ? <Image resizeMode="contain" source={{uri: product.imageUrl}} style={styles.image} /> : <Text style={styles.noImage}>이미지 없음</Text>}
        {canLike ? <Pressable
          accessibilityLabel={liked ? '좋아요 취소' : '좋아요 추가'}
          accessibilityRole="button"
          accessibilityState={{selected: liked}}
          hitSlop={4}
          onPress={event => {event.stopPropagation(); onToggleLike();}}
          style={styles.heart}>
          <Heart color={liked ? colors.heart : colors.textPrimary} fill={liked ? colors.heart : 'transparent'} size={iconSize.sm} />
        </Pressable> : <View accessibilityLabel="외부 판매처 상품" style={styles.external}><ExternalLink color={colors.textPrimary} size={iconSize.xs} /></View>}
      </View>
      <Text numberOfLines={1} style={styles.brand}>{product.brandName}</Text>
      <Text numberOfLines={2} style={styles.name}>{product.productName}</Text>
      {product.shadeName ? <Text numberOfLines={1} style={styles.shade}>{product.shadeName} · {product.finish ?? '피니시 정보 확인'}</Text> : null}
      <Text style={styles.price}>{typeof product.price.amount === 'number' ? `${product.price.amount.toLocaleString('ko-KR')}원` : '가격 확인'}</Text>
      {product.sponsored || product.offer?.affiliateType !== 'none' ? <Text style={styles.disclosure}>{product.disclosureLabel ?? product.offer?.disclosureLabel ?? '제휴 링크'}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {backgroundColor: colors.background, gap: spacing.xs, width: RECOMMENDATION_RAIL_CARD_WIDTH},
  imageFrame: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, height: 148, justifyContent: 'center', overflow: 'hidden'},
  image: {height: '100%', width: '100%'},
  noImage: {...typography.caption, color: colors.textTertiary},
  heart: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, height: 44, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 44},
  external: {alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.pill, height: 36, justifyContent: 'center', position: 'absolute', right: 6, top: 6, width: 36},
  brand: {...typography.caption, color: colors.textSecondary, fontWeight: '700'},
  name: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm, minHeight: 40},
  shade: {...typography.caption, color: colors.textSecondary},
  price: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  disclosure: {...typography.caption, color: colors.textSecondary, textDecorationLine: 'underline'},
});
