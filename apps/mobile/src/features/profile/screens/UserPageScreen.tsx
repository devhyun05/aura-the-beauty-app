import { MyPageScreen } from './MyPageScreen';

type UserPageScreenProps = {
  onPressSettings?: () => void;
  onPressReport?: (reportId: string) => void;
  onPressReports?: () => void;
  onPressMakeupStyles?: () => void;
  onPressFavoriteProducts?: () => void;
};

export function UserPageScreen({
  onPressSettings,
  onPressReport,
  onPressMakeupStyles,
  onPressFavoriteProducts,
}: UserPageScreenProps) {
  return (
    <MyPageScreen
      onPressAnalysisResult={onPressReport}
      onPressLikedProductList={onPressFavoriteProducts}
      onPressMakeupStyleList={onPressMakeupStyles}
      onPressProfileEdit={onPressSettings}
    />
  );
}
