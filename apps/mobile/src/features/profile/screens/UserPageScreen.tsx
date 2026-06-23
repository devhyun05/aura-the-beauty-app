import {MyPageScreen} from './MyPageScreen';
import type {MakeupStylePreview} from '../../../shared/types/userPage';

type UserPageScreenProps = {
  onPressSettings?: () => void;
  onPressReport?: (reportId: string) => void;
  onPressReports?: () => void;
  onPressMakeupStyles?: () => void;
  onPressFavoriteProducts?: () => void;
  onPressProductRecommendations?: () => void;
  savedMakeupStyle?: MakeupStylePreview | null;
};

export function UserPageScreen({
  onPressSettings,
  onPressReport,
  onPressReports,
  onPressMakeupStyles,
  onPressFavoriteProducts,
  onPressProductRecommendations,
  savedMakeupStyle,
}: UserPageScreenProps) {
  return (
    <MyPageScreen
      onPressAnalysisResult={onPressReport}
      onPressAnalysisResultList={onPressReports}
      onPressLikedProductList={onPressFavoriteProducts}
      onPressMakeupStyleList={onPressMakeupStyles}
      onPressProductRecommendations={onPressProductRecommendations}
      onPressProfileEdit={onPressSettings}
      savedMakeupStyle={savedMakeupStyle}
    />
  );
}
