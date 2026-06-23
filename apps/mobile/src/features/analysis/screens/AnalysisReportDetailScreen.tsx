import { RoutePlaceholder } from '../../../shared/ui';

type AnalysisReportDetailScreenProps = {
  onBack?: () => void;
};

export function AnalysisReportDetailScreen({
  onBack,
}: AnalysisReportDetailScreenProps) {
  return (
    <RoutePlaceholder
      description="맞춤 분석 보고서 상세 화면은 다음 단계에서 연결됩니다."
      onBack={onBack}
      title="맞춤 분석 보고서"
    />
  );
}
