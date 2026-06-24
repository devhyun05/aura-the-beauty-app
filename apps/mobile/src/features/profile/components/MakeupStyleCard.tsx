import type { MakeupStylePreview } from '../../../shared/types/myPage';
import { MakeupLookCard } from './MakeupLookCard';

type MakeupStyleCardProps = {
  style: MakeupStylePreview;
};

export function MakeupStyleCard({ style }: MakeupStyleCardProps) {
  return <MakeupLookCard look={style} />;
}
