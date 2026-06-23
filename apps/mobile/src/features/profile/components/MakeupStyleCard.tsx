import type { MakeupStylePreview } from '../../../shared/types/userPage';
import { MakeupLookCard } from './MakeupLookCard';

type MakeupStyleCardProps = {
  style: MakeupStylePreview;
};

export function MakeupStyleCard({ style }: MakeupStyleCardProps) {
  return <MakeupLookCard look={style} />;
}
