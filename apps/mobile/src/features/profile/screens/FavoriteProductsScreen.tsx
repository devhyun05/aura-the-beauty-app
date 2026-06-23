import { LikedProductListScreen } from './LikedProductListScreen';

type FavoriteProductsScreenProps = {
  onBack?: () => void;
};

export function FavoriteProductsScreen({ onBack }: FavoriteProductsScreenProps) {
  return <LikedProductListScreen onBack={onBack} />;
}
