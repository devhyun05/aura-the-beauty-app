import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'tamagui';

import { getFavoriteProducts } from '../../../shared/services/userPageService';
import {
  userPageColors,
  userPageRadius,
  userPageSpacing,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { FavoriteProductPreview } from '../../../shared/types/userPage';
import { HeartIcon } from '../components/HeartIcon';

interface FavoriteProductsScreenProps {
  onBack?: () => void;
}

const PAGE_SIZE = 5;

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

export const FavoriteProductsScreen = ({
  onBack,
}: FavoriteProductsScreenProps) => {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<FavoriteProductPreview[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let isMounted = true;

    getFavoriteProducts().then((favoriteProducts) => {
      if (isMounted) {
        setProducts(favoriteProducts.filter((product) => product.isLiked));
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const pageProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;

    return products.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, products]);

  const handleUnlike = (productId: string) => {
    setProducts((currentProducts) =>
      currentProducts.filter((product) => product.id !== productId),
    );
  };

  const handlePreviousPage = () => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Pressable
          accessibilityLabel="좋아요 목록에서 뒤로가기"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <BackIcon />
        </Pressable>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.eyebrow}>LIKED PRODUCTS</Text>
          <Text style={styles.title}>좋아요 목록</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        {products.length > 0 ? (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryText}>좋아요 {products.length}개</Text>
              <Text style={styles.summaryText}>
                {currentPage} / {totalPages}
              </Text>
            </View>

            <View style={styles.grid}>
              {pageProducts.map((product) => (
                <ProductLikeCard
                  key={product.id}
                  onUnlike={() => handleUnlike(product.id)}
                  product={product}
                />
              ))}
            </View>

            <Pagination
              currentPage={currentPage}
              onNext={handleNextPage}
              onPrevious={handlePreviousPage}
              onSelectPage={setCurrentPage}
              totalPages={totalPages}
            />
          </>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>좋아요한 제품이 없어요</Text>
            <Text style={styles.emptyDescription}>
              마음에 드는 제품을 누르면 이 목록에서 관리할 수 있어요.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

interface ProductLikeCardProps {
  product: FavoriteProductPreview;
  onUnlike: () => void;
}

const ProductLikeCard = ({ product, onUnlike }: ProductLikeCardProps) => {
  return (
    <View style={styles.productCard}>
      <View style={styles.imageFrame}>
        <Image
          resizeMode="contain"
          source={product.imageSource}
          style={styles.productImage}
        />

        <Pressable
          accessibilityLabel={`${product.productName} 좋아요 해제`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onUnlike}
          style={styles.heartButton}
        >
          <HeartIcon />
        </Pressable>
      </View>

      <View style={styles.productTextGroup}>
        <Text numberOfLines={1} style={styles.brandName}>
          {product.brandName}
        </Text>
        <Text numberOfLines={2} style={styles.productName}>
          {product.productName}
        </Text>
        <Text style={styles.price}>{formatPrice(product.price)}</Text>
      </View>
    </View>
  );
};

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  onSelectPage: (page: number) => void;
}

const Pagination = ({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  onSelectPage,
}: PaginationProps) => {
  return (
    <View style={styles.pagination}>
      <Pressable
        accessibilityLabel="이전 좋아요 제품 페이지"
        accessibilityRole="button"
        disabled={currentPage === 1}
        onPress={onPrevious}
        style={[styles.pageMoveButton, currentPage === 1 ? styles.disabled : null]}
      >
        <ChevronLeftIcon />
      </Pressable>

      <View style={styles.pageDots}>
        {Array.from({ length: totalPages }, (_, index) => {
          const page = index + 1;
          const isActive = page === currentPage;

          return (
            <Pressable
              accessibilityLabel={`${page}페이지로 이동`}
              accessibilityRole="button"
              key={page}
              onPress={() => onSelectPage(page)}
              style={[styles.pageDot, isActive ? styles.pageDotActive : null]}
            />
          );
        })}
      </View>

      <Pressable
        accessibilityLabel="다음 좋아요 제품 페이지"
        accessibilityRole="button"
        disabled={currentPage === totalPages}
        onPress={onNext}
        style={[
          styles.pageMoveButton,
          currentPage === totalPages ? styles.disabled : null,
        ]}
      >
        <ChevronRightIcon />
      </Pressable>
    </View>
  );
};

function BackIcon() {
  return (
    <View pointerEvents="none" style={styles.backIcon}>
      <View style={[styles.backLine, styles.backLineTop]} />
      <View style={[styles.backLine, styles.backLineBottom]} />
    </View>
  );
}

function ChevronLeftIcon() {
  return (
    <View pointerEvents="none" style={styles.chevronIcon}>
      <View style={[styles.chevronLine, styles.chevronLeftTop]} />
      <View style={[styles.chevronLine, styles.chevronLeftBottom]} />
    </View>
  );
}

function ChevronRightIcon() {
  return (
    <View pointerEvents="none" style={styles.chevronIcon}>
      <View style={[styles.chevronLine, styles.chevronRightTop]} />
      <View style={[styles.chevronLine, styles.chevronRightBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  backIcon: {
    height: 22,
    position: 'relative',
    width: 22,
  },
  backLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    left: 4,
    position: 'absolute',
    width: 14,
  },
  backLineBottom: {
    top: 13,
    transform: [{ rotate: '45deg' }],
  },
  backLineTop: {
    top: 5,
    transform: [{ rotate: '-45deg' }],
  },
  brandName: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    fontWeight: '700',
    lineHeight: 16,
  },
  chevronIcon: {
    height: 18,
    position: 'relative',
    width: 18,
  },
  chevronLeftBottom: {
    left: 4,
    top: 10,
    transform: [{ rotate: '45deg' }],
  },
  chevronLeftTop: {
    left: 4,
    top: 6,
    transform: [{ rotate: '-45deg' }],
  },
  chevronLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    position: 'absolute',
    width: 9,
  },
  chevronRightBottom: {
    right: 4,
    top: 10,
    transform: [{ rotate: '-45deg' }],
  },
  chevronRightTop: {
    right: 4,
    top: 6,
    transform: [{ rotate: '45deg' }],
  },
  disabled: {
    opacity: 0.3,
  },
  emptyDescription: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.card,
    borderWidth: 1,
    gap: 8,
    padding: 28,
  },
  emptyTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
  eyebrow: {
    color: userPageColors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  header: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    borderBottomColor: userPageColors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: userPageSpacing.screenX,
  },
  headerTitleGroup: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    marginRight: 38,
    minWidth: 0,
  },
  heartButton: {
    alignItems: 'center',
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: 15,
    borderWidth: 1,
    bottom: 10,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    width: 30,
  },
  imageFrame: {
    aspectRatio: 1,
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  pageDot: {
    backgroundColor: userPageColors.borderSubtle,
    borderRadius: 5,
    height: 9,
    width: 9,
  },
  pageDotActive: {
    backgroundColor: userPageColors.text,
    width: 18,
  },
  pageDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pageMoveButton: {
    alignItems: 'center',
    borderColor: userPageColors.borderSubtle,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  pagination: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    paddingTop: 4,
  },
  price: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 23,
  },
  productCard: {
    flexGrow: 1,
    gap: 10,
    maxWidth: '48%',
    minWidth: '48%',
  },
  productImage: {
    height: '100%',
    width: '100%',
  },
  productName: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    lineHeight: 19,
    minHeight: 38,
  },
  productTextGroup: {
    gap: 5,
    paddingHorizontal: 2,
  },
  screen: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  scrollContent: {
    gap: 18,
    paddingBottom: 48,
    paddingHorizontal: userPageSpacing.screenX,
    paddingTop: 16,
  },
  scrollView: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
});
