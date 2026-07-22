import type {AuradinPhase} from '../types';

export type AuradinDetailOrigin = 'results' | 'saved';
export type AuradinInternalBackTarget = 'home' | 'results' | 'saved' | null;

export const AURADIN_BACK_SWIPE_EDGE_WIDTH = 28;
export const AURADIN_BACK_SWIPE_CLAIM_DISTANCE = 10;
export const AURADIN_BACK_SWIPE_COMMIT_DISTANCE = 56;

export function shouldClaimAuradinBackSwipe({
  enabled,
  startX,
  dx,
  dy,
}: {
  enabled: boolean;
  startX: number;
  dx: number;
  dy: number;
}): boolean {
  return (
    enabled &&
    startX <= AURADIN_BACK_SWIPE_EDGE_WIDTH &&
    dx >= AURADIN_BACK_SWIPE_CLAIM_DISTANCE &&
    dx > Math.abs(dy) * 1.2
  );
}

export function shouldCommitAuradinBackSwipe({
  dx,
  velocityX,
}: {
  dx: number;
  velocityX: number;
}): boolean {
  return (
    dx >= AURADIN_BACK_SWIPE_COMMIT_DISTANCE ||
    (dx >= AURADIN_BACK_SWIPE_CLAIM_DISTANCE && velocityX >= 0.55)
  );
}

/**
 * AURADIN is one native route with several in-route pages.  A native back
 * gesture from detail/saved must unwind that in-route page first; otherwise
 * React Navigation pops the whole route and discards the user's search result.
 */
export function getAuradinInternalBackTarget({
  phase,
  detailOrigin,
  hasResults,
}: {
  phase: AuradinPhase;
  detailOrigin: AuradinDetailOrigin;
  hasResults: boolean;
}): AuradinInternalBackTarget {
  if (phase === 'detail') {
    return detailOrigin;
  }
  if (phase === 'saved') {
    return hasResults ? 'results' : 'home';
  }
  return null;
}
