import { RoutePlaceholder } from '../../../shared/ui';

type AnalysisResultListScreenProps = {
  onBack?: () => void;
};

export function AnalysisResultListScreen({
  onBack,
}: AnalysisResultListScreenProps) {
  return (
    <RoutePlaceholder
      description="분석 결과 전체 목록은 다음 단계에서 연결됩니다."
      onBack={onBack}
      title="분석 결과"
    />
  );
}
