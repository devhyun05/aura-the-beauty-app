import { RoutePlaceholder } from '../../../shared/ui';

type ProfileEditScreenProps = {
  onBack?: () => void;
};

export function ProfileEditScreen({ onBack }: ProfileEditScreenProps) {
  return (
    <RoutePlaceholder
      description="프로필 수정 화면은 다음 단계에서 연결됩니다."
      onBack={onBack}
      title="프로필 수정"
    />
  );
}
