import type { FavoriteProductPreview } from '../../../shared/types/myPage';
import { ProductCard } from './ProductCard';

type FavoriteProductCardProps = {
  product: FavoriteProductPreview;
};

export function FavoriteProductCard({ product }: FavoriteProductCardProps) {
  return <ProductCard product={product} />;
}
