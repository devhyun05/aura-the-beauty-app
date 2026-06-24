import {AppHeader} from '../../../shared/ui';

export type FeedbackDetailHeaderVariant = 'result' | 'tip' | 'guide';

const feedbackDetailHeaderTitles: Record<FeedbackDetailHeaderVariant, string> = {
  result: '메이크업 피드백',
  tip: '수정팁',
  guide: '가이드 오버레이',
};

export function getFeedbackDetailHeaderTitle(variant: FeedbackDetailHeaderVariant) {
  return feedbackDetailHeaderTitles[variant];
}

type FeedbackDetailHeaderProps = {
  variant: FeedbackDetailHeaderVariant;
  onBack: () => void;
};

export function FeedbackDetailHeader({
  onBack,
  variant,
}: FeedbackDetailHeaderProps) {
  return <AppHeader onBack={onBack} title={getFeedbackDetailHeaderTitle(variant)} />;
}
