import { RoutePlaceholder } from '../../../shared/ui';

type MakeupStyleListScreenProps = {
  onBack?: () => void;
};

export function MakeupStyleListScreen({ onBack }: MakeupStyleListScreenProps) {
  return (
    <RoutePlaceholder
      description="메이크업 스타일 전체 목록은 다음 단계에서 연결됩니다."
      onBack={onBack}
      title="메이크업 스타일"
    />
  );
}
