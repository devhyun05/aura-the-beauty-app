import {MyPageScreen} from './MyPageScreen';
import type {MakeupStylePreview} from '../../../shared/types/userPage';

type UserPageScreenProps = {
  onPressSettings?: () => void;
  onPressReport?: (reportId: string) => void;
  onPressReports?: () => void;
  onPressMakeupStyles?: () => void;
  onPressFavoriteProducts?: () => void;
  savedMakeupStyle?: MakeupStylePreview | null;
};

export function UserPageScreen({
  onPressSettings,
  onPressReport,
  onPressReports,
  onPressMakeupStyles,
  onPressFavoriteProducts,
  savedMakeupStyle,
}: UserPageScreenProps) {
  return (
    <MyPageScreen
      onPressAnalysisResult={onPressReport}
      onPressAnalysisResultList={onPressReports}
      onPressLikedProductList={onPressFavoriteProducts}
      onPressMakeupStyleList={onPressMakeupStyles}
      onPressProfileEdit={onPressSettings}
      savedMakeupStyle={savedMakeupStyle}
    />
  );
}
