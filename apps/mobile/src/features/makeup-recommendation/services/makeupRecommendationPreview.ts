import type {
  MakeupRecommendationImageStatus,
  MakeupRecommendationReportHistoryItem,
} from '../types';

export function getMakeupRecommendationPreviewStatusLabel(
  status: MakeupRecommendationImageStatus | undefined,
): string {
  if (status === 'pending' || status === 'processing' || status === 'partial') {
    return '적용 이미지 생성 중';
  }
  if (status === 'failed') {
    return '적용 이미지 없음';
  }
  return '적용 이미지 미리보기 없음';
}

export function getMakeupRecommendationPreviewPresentation(
  report: Pick<
    MakeupRecommendationReportHistoryItem,
    'imageStatus' | 'previewImageStatus' | 'previewImageUrl'
  >,
): {
  imageUrl?: string;
  status: MakeupRecommendationImageStatus;
  statusLabel: string;
} {
  const imageUrl = report.previewImageUrl?.trim() || undefined;
  const status = report.previewImageStatus ?? report.imageStatus;
  return {
    imageUrl,
    status,
    statusLabel: getMakeupRecommendationPreviewStatusLabel(status),
  };
}
