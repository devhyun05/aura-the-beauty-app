import type { FavoriteProductPreview } from '../../../shared/types/userPage';
import { ProductCard } from './ProductCard';

type FavoriteProductCardProps = {
  product: FavoriteProductPreview;
};

export function FavoriteProductCard({ product }: FavoriteProductCardProps) {
  return <ProductCard product={product} />;
}
