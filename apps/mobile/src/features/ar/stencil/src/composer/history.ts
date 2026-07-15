/**
 * 편집 히스토리 — undo/redo 스택 (순수 모듈, React 무관).
 *
 * 한 스냅샷 = "그 순간의 편집 상태" 전체: 룩 트리(LookSnapshot) + 보정 레인(WarpLane)
 * + 보정 강도(wpGain) + 메이크업 농도(opacity). 룩과 보정이 하나의 통합 스택으로
 * 묶여, ↶ 한 번이 마지막 편집(룩이든 보정이든)을 되돌린다.
 *
 * App은 편집 직전 상태를 record로 past에 push(redo 클리어)하고, undo/redo가
 * 현재 상태를 반대쪽 스택으로 옮기며 복원할 스냅샷을 돌려준다(App이 revive+적용).
 * past는 HISTORY_LIMIT를 넘으면 가장 오래된 것부터 버린다.
 */
import type { LookSnapshot } from './lookTree';
import type { WarpLane } from './warpPresets';

/** 한 시점의 편집 상태 스냅샷 — 룩 + 보정 통합. */
export interface EditSnapshot {
  /** 룩 트리 스냅샷 (원본=빈 조합이면 null) */
  look: LookSnapshot | null;
  /** 활성 LOOK 칩 id — 하이라이트/ dirty 표시와 상세 진입(ensureTreeForDetail)이 참조.
   *  복원 안 하면 트리는 되돌아가는데 lookSel이 남아 하이라이트 desync·룩 부활이 난다. */
  lookSel: string;
  /** 보정 레인 사본 */
  warp: WarpLane;
  /** 보정 강도 (보정 레인 마스터) */
  wpGain: number;
  /** 전역 메이크업 농도 */
  opacity: number;
}

export interface HistoryState {
  /** 되돌릴 수 있는 과거 상태들 (오래된 것 → 최근 순) */
  past: EditSnapshot[];
  /** 다시 실행할 수 있는 미래 상태들 (undo로 밀려난 것들) */
  future: EditSnapshot[];
}

/** 스택 상한 — 초과 시 가장 오래된 past부터 버린다. */
export const HISTORY_LIMIT = 50;

export function emptyHistory(): HistoryState {
  return { past: [], future: [] };
}

export function canUndo(h: HistoryState): boolean {
  return h.past.length > 0;
}

export function canRedo(h: HistoryState): boolean {
  return h.future.length > 0;
}

/** 상한을 넘으면 앞(가장 오래된 것)부터 잘라낸 사본 반환. */
function capped(stack: EditSnapshot[]): EditSnapshot[] {
  return stack.length > HISTORY_LIMIT
    ? stack.slice(stack.length - HISTORY_LIMIT)
    : stack;
}

/**
 * 편집 직전 상태(prev)를 past에 쌓는다. 새 편집 분기이므로 future(redo)는 비운다.
 */
export function record(h: HistoryState, prev: EditSnapshot): HistoryState {
  return { past: capped([...h.past, prev]), future: [] };
}

/**
 * undo — past의 마지막을 꺼내 복원 대상(snapshot)으로 돌려주고, 현재 상태(current)를
 * future 앞에 넣는다. past가 비어 있으면 null.
 */
export function undo(
  h: HistoryState,
  current: EditSnapshot,
): { history: HistoryState; snapshot: EditSnapshot } | null {
  if (h.past.length === 0) return null;
  const snapshot = h.past[h.past.length - 1];
  const past = h.past.slice(0, -1);
  const future = [current, ...h.future];
  return { history: { past, future }, snapshot };
}

/**
 * redo — future의 첫 항목을 복원 대상으로 돌려주고, 현재 상태(current)를 past에 쌓는다.
 * future가 비어 있으면 null.
 */
export function redo(
  h: HistoryState,
  current: EditSnapshot,
): { history: HistoryState; snapshot: EditSnapshot } | null {
  if (h.future.length === 0) return null;
  const snapshot = h.future[0];
  const future = h.future.slice(1);
  const past = capped([...h.past, current]);
  return { history: { past, future }, snapshot };
}
