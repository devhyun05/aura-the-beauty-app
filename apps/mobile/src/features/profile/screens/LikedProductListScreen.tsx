import { RoutePlaceholder } from '../../../shared/ui';

type LikedProductListScreenProps = {
  onBack?: () => void;
};

export function LikedProductListScreen({ onBack }: LikedProductListScreenProps) {
  return (
    <RoutePlaceholder
      description="좋아요한 제품목록 전체 화면은 다음 단계에서 연결됩니다."
      onBack={onBack}
      title="좋아요한 제품목록"
    />
  );
}
