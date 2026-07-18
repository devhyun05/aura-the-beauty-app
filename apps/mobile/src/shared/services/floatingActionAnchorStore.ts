import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  FloatingActionAnchor,
  FloatingActionButtonPosition,
} from '../ui/FloatingActionMenu';

export const FLOATING_ACTION_ANCHOR_STORAGE_KEY =
  'aura.floatingActionAnchor.v1';
export const LEGACY_FLOATING_ACTION_POSITION_STORAGE_KEY =
  'aura.floatingActionButtonPosition';

export const DEFAULT_FLOATING_ACTION_ANCHOR: FloatingActionAnchor = {
  xRatio: 0.88,
  yRatio: 0.8,
};

export const LEFT_FLOATING_ACTION_ANCHOR: FloatingActionAnchor = {
  xRatio: 0.12,
  yRatio: DEFAULT_FLOATING_ACTION_ANCHOR.yRatio,
};

type FloatingActionAnchorStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let sessionAnchor: FloatingActionAnchor = DEFAULT_FLOATING_ACTION_ANCHOR;

function isUnitRatio(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function getAnchorForLegacyButtonPosition(
  position: FloatingActionButtonPosition,
): FloatingActionAnchor {
  return position === 'left'
    ? LEFT_FLOATING_ACTION_ANCHOR
    : DEFAULT_FLOATING_ACTION_ANCHOR;
}

export function getFloatingActionButtonPositionForAnchor(
  anchor: FloatingActionAnchor,
): FloatingActionButtonPosition {
  return anchor.xRatio <= 0.5 ? 'left' : 'right';
}

export function parseFloatingActionAnchor(
  rawValue: string | null | undefined,
): FloatingActionAnchor | null {
  if (!rawValue) {
    return null;
  }

  if (rawValue === 'left' || rawValue === 'right') {
    return getAnchorForLegacyButtonPosition(rawValue);
  }

  try {
    const parsed = JSON.parse(rawValue) as {
      position?: unknown;
      xRatio?: unknown;
      yRatio?: unknown;
    };

    if (isUnitRatio(parsed.xRatio) && isUnitRatio(parsed.yRatio)) {
      return {xRatio: parsed.xRatio, yRatio: parsed.yRatio};
    }

    if (parsed.position === 'left' || parsed.position === 'right') {
      return getAnchorForLegacyButtonPosition(parsed.position);
    }
  } catch {
    return null;
  }

  return null;
}

export function getSessionFloatingActionAnchor(): FloatingActionAnchor {
  return sessionAnchor;
}

export async function loadFloatingActionAnchor(
  storage: FloatingActionAnchorStorage = AsyncStorage,
): Promise<FloatingActionAnchor> {
  try {
    const storedAnchor = parseFloatingActionAnchor(
      await storage.getItem(FLOATING_ACTION_ANCHOR_STORAGE_KEY),
    );

    if (storedAnchor) {
      sessionAnchor = storedAnchor;
      return storedAnchor;
    }

    const legacyAnchor = parseFloatingActionAnchor(
      await storage.getItem(LEGACY_FLOATING_ACTION_POSITION_STORAGE_KEY),
    );

    if (legacyAnchor) {
      sessionAnchor = legacyAnchor;
      await storage.setItem(
        FLOATING_ACTION_ANCHOR_STORAGE_KEY,
        JSON.stringify(legacyAnchor),
      );
      return legacyAnchor;
    }
  } catch {
    // 저장소가 연결되지 않았거나 읽기에 실패하면 세션 미러를 사용한다.
  }

  return sessionAnchor;
}

export async function saveFloatingActionAnchor(
  anchor: FloatingActionAnchor,
  storage: FloatingActionAnchorStorage = AsyncStorage,
): Promise<void> {
  sessionAnchor = anchor;

  try {
    await storage.setItem(
      FLOATING_ACTION_ANCHOR_STORAGE_KEY,
      JSON.stringify(anchor),
    );
  } catch {
    // 세션 좌표는 유지하고 다음 앱 시작에서는 저장된 값 또는 기본값을 사용한다.
  }
}
