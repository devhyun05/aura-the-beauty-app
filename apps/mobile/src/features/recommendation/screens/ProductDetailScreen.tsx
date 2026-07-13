import {useEffect, useState} from 'react';
import {Image, Linking, Pressable, StyleSheet, View} from 'react-native';
import {ExternalLink, Heart} from 'lucide-react-native';
import {Text} from 'tamagui';

import {likeProduct, unlikeProduct} from '../../../shared/services/productService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen, useTransientToast} from '../../../shared/ui';
import {RecommendationSectionState} from '../components/RecommendationSectionState';
import {getTrustedProductDetail, openTrustedProductOffer} from '../services/productHubService';
import type {CatalogProduct, ProductDetailRecommendationContext} from '../types';

export function ProductDetailScreen({
  productId,
  shadeId,
  initialProduct,
  recommendationContext,
  onOpenLikedProducts,
}: {
  productId: string;
  shadeId?: string | null;
  initialProduct?: CatalogProduct | null;
  recommendationContext?: ProductDetailRecommendationContext;
  onOpenLikedProducts?: () => void;
}) {
  const [product, setProduct] = useState<CatalogProduct | null>(initialProduct ?? null);
  const [loading, setLoading] = useState(!initialProduct);
  const [error, setError] = useState<string | null>(null);
  const [openingOffer, setOpeningOffer] = useState(false);
  const {showToast, toast} = useTransientToast(2600);
  const load = () => {
    setLoading(true); setError(null);
    getTrustedProductDetail(productId, shadeId).then(next => setProduct(current => ({
      ...next,
      disclosureLabel: recommendationContext?.disclosureLabel ?? current?.disclosureLabel ?? next.disclosureLabel,
      reasonCodes: current?.reasonCodes ?? next.reasonCodes,
      reasonLabels: recommendationContext?.reasonLabels ?? current?.reasonLabels ?? next.reasonLabels,
      sponsored: recommendationContext?.sponsored ?? current?.sponsored ?? next.sponsored,
      sponsorshipType: recommendationContext?.sponsorshipType ?? current?.sponsorshipType ?? next.sponsorshipType,
    }))).catch(value => setError(value instanceof Error ? value.message : '제품 상세를 불러오지 못했어요.')).finally(() => setLoading(false));
  };
  useEffect(load, [productId, recommendationContext, shadeId]);
  if (loading && !product) return <AppScreen topPadding="none"><RecommendationSectionState kind="loading" message="제품 정보를 확인하고 있어요." /></AppScreen>;
  if (error && !product) return <AppScreen topPadding="none"><RecommendationSectionState kind="error" message={error} actionLabel="다시 시도" onAction={load} /></AppScreen>;
  if (!product) return <AppScreen topPadding="none"><RecommendationSectionState kind="empty" message="표시할 수 있는 제품이 없어요." /></AppScreen>;
  const liked = product.viewerState.liked;
  const toggleLike = async () => {
    setProduct(current => current ? {...current, viewerState: {liked: !liked}} : current);
    try {
      if (liked) await unlikeProduct(product.productId);
      else {
        await likeProduct(product.productId, product.shadeId);
        showToast('좋아요한 제품에 저장했어요', onOpenLikedProducts
          ? {label: '보기', onPress: onOpenLikedProducts}
          : undefined);
      }
    } catch {setProduct(current => current ? {...current, viewerState: {liked}} : current);}
  };
  const openOffer = async () => {
    if (!product.offer?.offerId || openingOffer) return;
    setOpeningOffer(true);
    try {const outbound = await openTrustedProductOffer(product.productId, product.offer.offerId); await Linking.openURL(outbound.url);} catch (value) {setError(value instanceof Error ? value.message : '판매처를 열지 못했어요.');} finally {setOpeningOffer(false);}
  };
  return <>
    <AppScreen topPadding="none">
      <View style={styles.imageFrame}>{product.imageUrl ? <Image resizeMode="contain" source={{uri: product.imageUrl}} style={styles.image} /> : <Text style={styles.muted}>이미지 권리를 확인 중이에요.</Text>}</View>
      <View style={styles.titleRow}><View style={styles.titleBlock}><Text style={styles.brand}>{product.brandName}</Text><Text style={styles.title}>{product.productName}</Text></View><Pressable accessibilityLabel={liked ? '좋아요 취소' : '좋아요 추가'} accessibilityRole="button" accessibilityState={{selected: liked}} onPress={toggleLike} style={styles.heart}><Heart color={liked ? colors.heart : colors.textPrimary} fill={liked ? colors.heart : 'transparent'} size={iconSize.md} /></Pressable></View>
      {product.shadeName ? <View style={styles.infoCard}><Text style={styles.label}>추천 shade</Text><Text style={styles.value}>{product.shadeName}</Text><Text style={styles.muted}>{product.finish ?? '피니시 정보 확인'}{product.shadeHex ? ` · ${product.shadeHex}` : ''}</Text></View> : null}
      {product.reasonLabels?.length ? <View style={styles.infoCard}><Text style={styles.label}>추천 근거</Text>{product.reasonLabels.map(reason => <Text key={reason} style={styles.value}>• {reason}</Text>)}</View> : null}
      <View style={styles.infoCard}><Text style={styles.label}>판매 정보</Text><Text style={styles.price}>{typeof product.price.amount === 'number' ? `${product.price.amount.toLocaleString('ko-KR')}원` : '가격 확인'}</Text><Text style={styles.muted}>{product.offer ? `${product.offer.sellerName} · ${product.offer.availability}` : '현재 연결 가능한 판매처가 없어요.'}</Text>{product.offer?.disclosureLabel ? <Text style={styles.disclosure}>{product.offer.disclosureLabel}</Text> : null}</View>
      {product.disclosureLabel ? <Text accessibilityRole="text" style={styles.prominentDisclosure}>{product.disclosureLabel}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!product.offer || openingOffer} onPress={openOffer} style={!product.offer ? styles.sellerDisabled : styles.seller}><Text style={!product.offer ? styles.sellerTextDisabled : styles.sellerText}>{openingOffer ? '판매처 확인 중…' : product.offer ? '판매처로 이동' : '판매 종료'}</Text><ExternalLink color={product.offer ? colors.white : colors.textTertiary} size={iconSize.sm} /></Pressable>
      <Text style={styles.notice}>가격·재고·shade는 catalog의 마지막 검수 시점을 기준으로 하며 실제 판매처와 다를 수 있어요.{product.sourceUpdatedAt ? ` · 상품 갱신 ${formatDate(product.sourceUpdatedAt)}` : ''}{product.price.updatedAt ? ` · 가격 갱신 ${formatDate(product.price.updatedAt)}` : ''}</Text>
    </AppScreen>
    {toast}
  </>;
}

const styles = StyleSheet.create({
  imageFrame: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, height: 340, justifyContent: 'center', overflow: 'hidden'},
  image: {height: '100%', width: '100%'},
  titleRow: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md},
  titleBlock: {flex: 1, gap: spacing.xs},
  brand: {...typography.caption, color: colors.textSecondary},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
  heart: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, height: 48, justifyContent: 'center', width: 48},
  infoCard: {backgroundColor: colors.surface, borderRadius: radius.lg, gap: spacing.xs, padding: spacing.md},
  label: {...typography.caption, color: colors.textSecondary},
  value: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  price: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, lineHeight: typography.lineHeight.lg},
  muted: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  disclosure: {...typography.caption, color: colors.textPrimary, textDecorationLine: 'underline'},
  prominentDisclosure: {...typography.caption, color: colors.textPrimary, textDecorationLine: 'underline'},
  error: {...typography.caption, color: colors.danger},
  seller: {alignItems: 'center', backgroundColor: colors.black, borderRadius: radius.lg, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 52},
  sellerDisabled: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.lg, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', minHeight: 52},
  sellerText: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  sellerTextDisabled: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  notice: {...typography.caption, color: colors.textSecondary},
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '확인 필요'
    : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}
