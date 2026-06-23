import { MakeupStyleListScreen } from './MakeupStyleListScreen';

type MakeupLookScreenProps = {
  onBack?: () => void;
};

export function MakeupLookScreen({ onBack }: MakeupLookScreenProps) {
  return <MakeupStyleListScreen onBack={onBack} />;
}
