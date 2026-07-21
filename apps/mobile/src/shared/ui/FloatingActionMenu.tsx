import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import {
  Camera,
  MessageSquareText,
  PackageSearch,
  ScanFace,
  ScanSearch,
  Settings2,
  Sparkles,
  Store,
} from 'lucide-react-native';
import {View} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing} from '../theme';

export type FloatingActionId =
  | 'arFilter'
  | 'makeupRecommendation'
  | 'makeupExtraction'
  | 'makeupFeedback'
  | 'faceAnalysis'
  | 'productRecommendation'
  | 'filterStore';

export type FloatingActionDefinition = {
  accessibilityLabel: string;
  description: string;
  icon: (color: string) => ReactNode;
  id: FloatingActionId;
  label: string;
};

export type FloatingActionDragPoint = {
  translationX: number;
  translationY: number;
};

export type FloatingActionSlotOffset = {
  x: number;
  y: number;
};

export type FloatingActionAnchor = {
  xRatio: number;
  yRatio: number;
};

export type FloatingActionViewport = {
  bottomInset: number;
  bottomReserved: number;
  height: number;
  leftInset: number;
  rightInset: number;
  topInset: number;
  width: number;
};

export type FloatingActionCenter = {
  x: number;
  y: number;
};

export type FloatingActionFreeLayout = {
  center: FloatingActionCenter;
  viewport: FloatingActionViewport;
};

export type FloatingActionQuadrant =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight';

export type FloatingActionPlacement = 'floating' | 'inline' | 'free';
export type FloatingActionInteractionMode = 'tap' | 'drag';
export type FloatingActionButtonPosition = 'right' | 'left';

export type FloatingActionReleaseOutcome =
  | {kind: 'select'; actionId: FloatingActionId}
  | {kind: 'settings'}
  | {kind: 'close'};

export type FloatingActionFreeReleaseIntent =
  | 'drag'
  | 'selection'
  | 'toggle'
  | 'none';

export type FloatingActionInteractionModeOption = {
  description: string;
  id: FloatingActionInteractionMode;
  label: string;
};

export type FloatingActionButtonPositionOption = {
  description: string;
  id: FloatingActionButtonPosition;
  label: string;
};

export type FloatingActionSettingsVisualState = {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
};

export const FLOATING_ACTION_MAX_ITEM_COUNT = 3;
export const FLOATING_ACTION_TAP_MAX_DISTANCE = 8;
export const FLOATING_ACTION_LONG_PRESS_MS = 400;
export const FLOATING_ACTION_EDGE_INSET = 8;
export const FLOATING_ACTION_ACCESSIBILITY_MOVE_STEP = 44;
export const FLOATING_ACTION_MIN_DRAG_DISTANCE = 48;
export const FLOATING_ACTION_SELECTION_RADIUS = 54;
export const FLOATING_ACTION_FLICK_ALIGNMENT = 0.88;
export const FLOATING_ACTION_FLICK_EXTRA_DISTANCE = 18;
export const FLOATING_ACTION_IDLE_SCALE = 1;
export const FLOATING_ACTION_ACTIVE_SCALE = 1.2;
export const FLOATING_ACTION_BUTTON_SIZE = 62;
export const FLOATING_ACTION_MAIN_ICON_SIZE = iconSize.sm;
export const FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH = 1.8;
export const FLOATING_ACTION_ITEM_SIZE = 52;
export const FLOATING_ACTION_SETTINGS_SIZE = 44;
export const FLOATING_ACTION_SETTINGS_SELECTION_RADIUS =
  FLOATING_ACTION_SETTINGS_SIZE / 2 + spacing.sm;
export const FLOATING_ACTION_BUTTON_SURFACE_BACKGROUND = colors.liquidGlassSurface;
export const FLOATING_ACTION_SETTINGS_BACKGROUND = colors.bottomSheetControlSurface;
export const FLOATING_ACTION_ACTIVE_BORDER_COLOR = colors.transparent;
export const FLOATING_ACTION_HOST_EXTRA_HEIGHT = 178;
export const FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET: FloatingActionSlotOffset = {
  x: 0,
  y: -74,
};
export const FLOATING_ACTION_INLINE_SETTINGS_SLOT_OFFSET: FloatingActionSlotOffset = {
  x: -44,
  y: 24,
};
const FLOATING_ACTION_INLINE_ARC_SLOT_OFFSETS = [
  FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET,
  {x: -52, y: -52},
  {x: -74, y: 0},
] as const satisfies readonly FloatingActionSlotOffset[];
const FLOATING_ACTION_FREE_ARC_RADIUS = 112;
const FLOATING_ACTION_FREE_HOST_SIZE = 300;
export const DEFAULT_FLOATING_ACTION_INTERACTION_MODE: FloatingActionInteractionMode = 'drag';
export const DEFAULT_FLOATING_ACTION_BUTTON_POSITION: FloatingActionButtonPosition = 'right';
export const DEFAULT_FLOATING_ACTION_IDS = [
  'makeupRecommendation',
  'makeupFeedback',
  'arFilter',
] as const satisfies readonly FloatingActionId[];

export type FloatingActionLongPressTransition = {
  shouldBeginDrag: boolean;
  shouldCloseMenu: boolean;
};

export function getFloatingActionLongPressTransition(input: {
  isGestureActive: boolean;
  isMenuExpanded: boolean;
}): FloatingActionLongPressTransition {
  return {
    shouldBeginDrag: input.isGestureActive,
    shouldCloseMenu: input.isGestureActive && input.isMenuExpanded,
  };
}

export function shouldBeginFloatingActionMenuSelection(
  interactionMode: FloatingActionInteractionMode,
  dragDistance: number,
): boolean {
  return (
    interactionMode === 'drag' &&
    dragDistance > FLOATING_ACTION_TAP_MAX_DISTANCE
  );
}

export function getFloatingActionFreeReleaseIntent(input: {
  dragDistance: number;
  durationMs: number;
  wasDragging: boolean;
  wasSelecting: boolean;
}): FloatingActionFreeReleaseIntent {
  if (input.wasDragging) {
    return 'drag';
  }

  if (input.wasSelecting) {
    return 'selection';
  }

  // The timer and release event can be delivered in either order at exactly
  // 400ms. Resolve that boundary here so a valid long press is never dropped.
  if (
    input.durationMs >= FLOATING_ACTION_LONG_PRESS_MS &&
    input.dragDistance <= FLOATING_ACTION_TAP_MAX_DISTANCE
  ) {
    return 'drag';
  }

  if (
    input.durationMs < FLOATING_ACTION_LONG_PRESS_MS &&
    input.dragDistance < FLOATING_ACTION_TAP_MAX_DISTANCE
  ) {
    return 'toggle';
  }

  return 'none';
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) {
    return (minimum + maximum) / 2;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

export function getFloatingActionCenter(
  anchor: FloatingActionAnchor,
  viewport: FloatingActionViewport,
): FloatingActionCenter {
  const buttonRadius = FLOATING_ACTION_BUTTON_SIZE / 2;
  const minimumX = viewport.leftInset + FLOATING_ACTION_EDGE_INSET + buttonRadius;
  const maximumX =
    viewport.width - viewport.rightInset - FLOATING_ACTION_EDGE_INSET - buttonRadius;
  const minimumY = viewport.topInset + FLOATING_ACTION_EDGE_INSET + buttonRadius;
  const maximumY =
    viewport.height -
    viewport.bottomInset -
    viewport.bottomReserved -
    FLOATING_ACTION_EDGE_INSET -
    buttonRadius;

  return {
    x: clamp(anchor.xRatio * viewport.width, minimumX, maximumX),
    y: clamp(anchor.yRatio * viewport.height, minimumY, maximumY),
  };
}

export function getFloatingActionAnchorFromCenter(
  center: FloatingActionCenter,
  viewport: FloatingActionViewport,
): FloatingActionAnchor {
  const clampedCenter = getFloatingActionCenter(
    {
      xRatio: viewport.width > 0 ? center.x / viewport.width : 0.5,
      yRatio: viewport.height > 0 ? center.y / viewport.height : 0.5,
    },
    viewport,
  );

  return {
    xRatio: viewport.width > 0 ? clampedCenter.x / viewport.width : 0.5,
    yRatio: viewport.height > 0 ? clampedCenter.y / viewport.height : 0.5,
  };
}

export function getClampedFloatingActionAnchor(
  anchor: FloatingActionAnchor,
  viewport: FloatingActionViewport,
): FloatingActionAnchor {
  return getFloatingActionAnchorFromCenter(
    getFloatingActionCenter(anchor, viewport),
    viewport,
  );
}

function floatingActionAnchorsEqual(
  left: FloatingActionAnchor,
  right: FloatingActionAnchor,
): boolean {
  const epsilon = 0.000001;
  return (
    Math.abs(left.xRatio - right.xRatio) <= epsilon &&
    Math.abs(left.yRatio - right.yRatio) <= epsilon
  );
}

export function getFloatingActionQuadrant(
  center: FloatingActionCenter,
  viewport: Pick<FloatingActionViewport, 'height' | 'width'>,
): FloatingActionQuadrant {
  const horizontal = center.x <= viewport.width / 2 ? 'Left' : 'Right';
  const vertical = center.y <= viewport.height / 2 ? 'top' : 'bottom';

  return `${vertical}${horizontal}` as FloatingActionQuadrant;
}

function getFreeFloatingActionSlotOffset(
  index: number,
  quadrant: FloatingActionQuadrant,
): FloatingActionSlotOffset {
  const xDirection = quadrant.endsWith('Left') ? 1 : -1;
  const yDirection = quadrant.startsWith('top') ? 1 : -1;

  if (index <= 0) {
    return {x: 0, y: yDirection * FLOATING_ACTION_FREE_ARC_RADIUS};
  }

  if (index === 1) {
    return {x: xDirection * 56, y: yDirection * 97};
  }

  return {x: xDirection * 97, y: yDirection * 56};
}

export function getClampedFloatingActionSlotOffset(
  slotOffset: FloatingActionSlotOffset,
  itemSize: number,
  layout: FloatingActionFreeLayout,
): FloatingActionSlotOffset {
  const itemRadius = itemSize / 2;
  const minimumX = layout.viewport.leftInset + FLOATING_ACTION_EDGE_INSET + itemRadius;
  const maximumX =
    layout.viewport.width -
    layout.viewport.rightInset -
    FLOATING_ACTION_EDGE_INSET -
    itemRadius;
  const minimumY = layout.viewport.topInset + FLOATING_ACTION_EDGE_INSET + itemRadius;
  const maximumY =
    layout.viewport.height -
    layout.viewport.bottomInset -
    layout.viewport.bottomReserved -
    FLOATING_ACTION_EDGE_INSET -
    itemRadius;

  return {
    x: clamp(layout.center.x + slotOffset.x, minimumX, maximumX) - layout.center.x,
    y: clamp(layout.center.y + slotOffset.y, minimumY, maximumY) - layout.center.y,
  };
}

export const floatingActionInteractionModeOptions = [
  {
    description: '별 버튼을 눌러 메뉴를 펼치고 원하는 기능을 다시 눌러요.',
    id: 'tap',
    label: '탭으로 열기',
  },
  {
    description: '별 버튼을 누른 채 기능 방향으로 밀어 빠르게 실행해요.',
    id: 'drag',
    label: '드래그로 실행',
  },
] as const satisfies readonly FloatingActionInteractionModeOption[];

export const floatingActionButtonPositionOptions = [
  {
    description: '기존처럼 하단바 오른쪽에서 빠르게 열어요.',
    id: 'right',
    label: '오른쪽',
  },
  {
    description: '하단바 왼쪽에서 엄지 위치에 맞춰 열어요.',
    id: 'left',
    label: '왼쪽',
  },
] as const satisfies readonly FloatingActionButtonPositionOption[];

export const FLOATING_ACTION_ICON_LIBRARY_NAMES = {
  arFilter: 'Camera',
  filterStore: 'Store',
  makeupFeedback: 'MessageSquareText',
} as const;

export const floatingActionDefinitions = [
  {
    accessibilityLabel: '메이크업 필터 열기',
    description: '추천 필터를 바로 얼굴에 적용해요.',
    icon: (color: string) => <Camera color={color} size={iconSize.sm} strokeWidth={2.1} />,
    id: 'arFilter',
    label: '메이크업 필터',
  },
  {
    accessibilityLabel: '메이크업 추천 시작',
    description: '오늘의 상황에 맞는 메이크업을 추천받아요.',
    icon: (color: string) => <Sparkles color={color} size={iconSize.sm} strokeWidth={2} />,
    id: 'makeupRecommendation',
    label: '메이크업 추천',
  },
  {
    accessibilityLabel: '메이크업 추출 시작',
    description: '촬영한 메이크업을 필터로 바꿔요.',
    icon: (color: string) => <ScanSearch color={color} size={iconSize.sm} strokeWidth={2} />,
    id: 'makeupExtraction',
    label: '메이크업 추출',
  },
  {
    accessibilityLabel: '메이크업 피드백 시작',
    description: '오늘 메이크업 균형을 점검해요.',
    icon: (color: string) => (
      <MessageSquareText color={color} size={iconSize.sm} strokeWidth={2} />
    ),
    id: 'makeupFeedback',
    label: '메이크업 피드백',
  },
  {
    accessibilityLabel: '얼굴 분석 시작',
    description: '얼굴형과 퍼스널 무드를 분석해요.',
    icon: (color: string) => <ScanFace color={color} size={iconSize.sm} strokeWidth={2} />,
    id: 'faceAnalysis',
    label: '얼굴 분석',
  },
  {
    accessibilityLabel: '추천 제품 보기',
    description: '분석 결과에 맞는 제품을 확인해요.',
    icon: (color: string) => <PackageSearch color={color} size={iconSize.sm} strokeWidth={2} />,
    id: 'productRecommendation',
    label: '추천 제품',
  },
  {
    accessibilityLabel: '필터 스토어 보기',
    description: '추천 필터를 둘러보고 바로 적용해요.',
    icon: (color: string) => <Store color={color} size={iconSize.sm} strokeWidth={2} />,
    id: 'filterStore',
    label: '필터 스토어',
  },
] as const satisfies readonly FloatingActionDefinition[];

const floatingActionDefinitionById = new Map<FloatingActionId, FloatingActionDefinition>(
  floatingActionDefinitions.map(definition => [definition.id, definition]),
);

export function getFloatingActionDefinition(
  actionId: FloatingActionId,
): FloatingActionDefinition {
  const definition = floatingActionDefinitionById.get(actionId);

  if (!definition) {
    throw new Error(`Unknown floating action: ${actionId}`);
  }

  return definition;
}

// 스토어 빌드에서 노출하지 않는 플로팅 액션 — AR 필터(발열 이슈로 릴리스 범위
// 제외)와 추천 필터 스토어. 렌더 경로와 설정 후보 목록이 모두 이 필터를 거치므로
// 기본값·저장된 선택에 남아 있어도 화면에는 나오지 않는다.
const STORE_HIDDEN_FLOATING_ACTION_IDS: readonly FloatingActionId[] = [
  'arFilter',
  'filterStore',
];

export function isFloatingActionAvailable(actionId: FloatingActionId): boolean {
  return __DEV__ || !STORE_HIDDEN_FLOATING_ACTION_IDS.includes(actionId);
}

export function getVisibleFloatingActionIds(
  selectedActionIds: readonly FloatingActionId[],
): readonly FloatingActionId[] {
  const selectedIds = selectedActionIds.length > 0
    ? selectedActionIds
    : DEFAULT_FLOATING_ACTION_IDS;
  const visibleIds: FloatingActionId[] = [];

  selectedIds.forEach(actionId => {
    if (!floatingActionDefinitionById.has(actionId)) {
      return;
    }

    if (!isFloatingActionAvailable(actionId)) {
      return;
    }

    if (visibleIds.includes(actionId)) {
      return;
    }

    if (visibleIds.length < FLOATING_ACTION_MAX_ITEM_COUNT) {
      visibleIds.push(actionId);
    }
  });

  return visibleIds.length > 0
    ? visibleIds
    : DEFAULT_FLOATING_ACTION_IDS.filter(isFloatingActionAvailable);
}

export function getNextFloatingActionSelection(
  currentActionIds: readonly FloatingActionId[],
  actionId: FloatingActionId,
): readonly FloatingActionId[] {
  if (currentActionIds.includes(actionId)) {
    return currentActionIds.filter(currentActionId => currentActionId !== actionId);
  }

  if (currentActionIds.length >= FLOATING_ACTION_MAX_ITEM_COUNT) {
    return currentActionIds;
  }

  return [...currentActionIds, actionId];
}

export function getFloatingActionSelectedSlotNumber(
  actionIds: readonly FloatingActionId[],
  actionId: FloatingActionId,
): number | null {
  const actionIndex = actionIds.indexOf(actionId);

  return actionIndex >= 0 && actionIndex < FLOATING_ACTION_MAX_ITEM_COUNT
    ? actionIndex + 1
    : null;
}

export function getFloatingActionSlotOffset(
  index: number,
  itemCount: number,
  placement: FloatingActionPlacement = 'floating',
  buttonPosition: FloatingActionButtonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  quadrant: FloatingActionQuadrant = 'bottomRight',
): FloatingActionSlotOffset {
  if (placement === 'free') {
    return getFreeFloatingActionSlotOffset(index, quadrant);
  }

  if (placement === 'inline') {
    const resolveInlineOffset = (rightCornerOffset: FloatingActionSlotOffset) =>
      buttonPosition === 'left'
        ? {x: -rightCornerOffset.x, y: rightCornerOffset.y}
        : rightCornerOffset;

    const arcIndex = itemCount <= 1
      ? 0
      : Math.min(index, FLOATING_ACTION_INLINE_ARC_SLOT_OFFSETS.length - 1);

    return resolveInlineOffset(FLOATING_ACTION_INLINE_ARC_SLOT_OFFSETS[arcIndex]);
  }

  if (itemCount <= 1) {
    return {x: 0, y: -112};
  }

  if (itemCount === 2) {
    return index === 0 ? {x: -76, y: -88} : {x: 76, y: -88};
  }

  if (index === 0) {
    return {x: 0, y: -112};
  }

  if (index === 1) {
    return {x: -92, y: -76};
  }

  return {x: 92, y: -76};
}

export function getFloatingActionSlotOffsetForAction(
  actionId: FloatingActionId,
  placement: FloatingActionPlacement = 'floating',
  fallbackIndex?: number,
  itemCount = FLOATING_ACTION_MAX_ITEM_COUNT,
  buttonPosition: FloatingActionButtonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  quadrant: FloatingActionQuadrant = 'bottomRight',
  freeLayout?: FloatingActionFreeLayout,
): FloatingActionSlotOffset {
  const defaultActionIndex =
    (DEFAULT_FLOATING_ACTION_IDS as readonly FloatingActionId[]).indexOf(actionId);
  const resolvedIndex = fallbackIndex ?? (defaultActionIndex >= 0 ? defaultActionIndex : 0);

  const slotOffset = getFloatingActionSlotOffset(
    resolvedIndex,
    itemCount,
    placement,
    buttonPosition,
    quadrant,
  );
  return placement === 'free' && freeLayout
    ? getClampedFloatingActionSlotOffset(
        slotOffset,
        FLOATING_ACTION_ITEM_SIZE * FLOATING_ACTION_ACTIVE_SCALE,
        freeLayout,
      )
    : slotOffset;
}

export function getFloatingActionSettingsSlotOffset(
  placement: FloatingActionPlacement = 'floating',
  buttonPosition: FloatingActionButtonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  quadrant: FloatingActionQuadrant = 'bottomRight',
  freeLayout?: FloatingActionFreeLayout,
): FloatingActionSlotOffset {
  if (placement === 'free') {
    const slotOffset = {
      x: (quadrant.endsWith('Left') ? 1 : -1) * FLOATING_ACTION_FREE_ARC_RADIUS,
      y: 0,
    };
    return freeLayout
      ? getClampedFloatingActionSlotOffset(
          slotOffset,
          FLOATING_ACTION_SETTINGS_SIZE,
          freeLayout,
        )
      : slotOffset;
  }

  if (placement !== 'inline') {
    return {x: 120, y: 0};
  }

  return buttonPosition === 'left'
    ? {
        x: -FLOATING_ACTION_INLINE_SETTINGS_SLOT_OFFSET.x,
        y: FLOATING_ACTION_INLINE_SETTINGS_SLOT_OFFSET.y,
      }
    : FLOATING_ACTION_INLINE_SETTINGS_SLOT_OFFSET;
}

export function getFloatingActionSettingsVisualState(
  isActive: boolean,
): FloatingActionSettingsVisualState {
  return {
    backgroundColor: isActive ? colors.blackSurface : FLOATING_ACTION_SETTINGS_BACKGROUND,
    borderColor: isActive ? FLOATING_ACTION_ACTIVE_BORDER_COLOR : colors.borderStrong,
    iconColor: isActive ? colors.white : colors.textPrimary,
  };
}

export function getFloatingActionButtonScale(isActive: boolean): number {
  return isActive ? FLOATING_ACTION_ACTIVE_SCALE : FLOATING_ACTION_IDLE_SCALE;
}

function getFloatingActionSlotOffsetById(
  actionId: FloatingActionId,
  actionIds: readonly FloatingActionId[],
  placement: FloatingActionPlacement,
  buttonPosition: FloatingActionButtonPosition,
  quadrant: FloatingActionQuadrant,
  freeLayout?: FloatingActionFreeLayout,
): FloatingActionSlotOffset | null {
  const visibleActionIds = getVisibleFloatingActionIds(actionIds);
  const actionIndex = visibleActionIds.indexOf(actionId);

  if (actionIndex < 0) {
    return null;
  }

  return getFloatingActionSlotOffsetForAction(
    actionId,
    placement,
    actionIndex,
    visibleActionIds.length,
    buttonPosition,
    quadrant,
    freeLayout,
  );
}

function isFloatingActionFlickActivation(
  dragPoint: FloatingActionDragPoint,
  activeActionId: FloatingActionId,
  actionIds: readonly FloatingActionId[],
  placement: FloatingActionPlacement,
  buttonPosition: FloatingActionButtonPosition,
  quadrant: FloatingActionQuadrant,
  freeLayout?: FloatingActionFreeLayout,
) {
  const slotOffset = getFloatingActionSlotOffsetById(
    activeActionId,
    actionIds,
    placement,
    buttonPosition,
    quadrant,
    freeLayout,
  );

  if (!slotOffset) {
    return false;
  }

  const slotDistance = Math.hypot(slotOffset.x, slotOffset.y);
  const dragDistance = Math.hypot(dragPoint.translationX, dragPoint.translationY);

  if (dragDistance < slotDistance + FLOATING_ACTION_FLICK_EXTRA_DISTANCE) {
    return false;
  }

  const alignment =
    (dragPoint.translationX * slotOffset.x + dragPoint.translationY * slotOffset.y) /
    (dragDistance * slotDistance);

  return alignment >= FLOATING_ACTION_FLICK_ALIGNMENT;
}

export function getFloatingActionMenuTarget(
  dragPoint: FloatingActionDragPoint,
  actionIds: readonly FloatingActionId[],
  placement: FloatingActionPlacement = 'floating',
  buttonPosition: FloatingActionButtonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  quadrant: FloatingActionQuadrant = 'bottomRight',
  freeLayout?: FloatingActionFreeLayout,
): FloatingActionId | null {
  const visibleActionIds = getVisibleFloatingActionIds(actionIds);
  const dragDistance = Math.hypot(dragPoint.translationX, dragPoint.translationY);

  if (dragDistance < FLOATING_ACTION_MIN_DRAG_DISTANCE) {
    return null;
  }

  let closestActionId: FloatingActionId | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  visibleActionIds.forEach((actionId, index) => {
    const slotOffset = getFloatingActionSlotOffsetForAction(
      actionId,
      placement,
      index,
      visibleActionIds.length,
      buttonPosition,
      quadrant,
      freeLayout,
    );
    const distance = Math.hypot(
      dragPoint.translationX - slotOffset.x,
      dragPoint.translationY - slotOffset.y,
    );

    if (distance < closestDistance) {
      closestActionId = actionId;
      closestDistance = distance;
    }
  });

  return closestDistance <= FLOATING_ACTION_SELECTION_RADIUS ? closestActionId : null;
}

function isFloatingActionSettingsTarget(
  dragPoint: FloatingActionDragPoint,
  placement: FloatingActionPlacement,
  buttonPosition: FloatingActionButtonPosition,
  quadrant: FloatingActionQuadrant,
  freeLayout?: FloatingActionFreeLayout,
) {
  const dragDistance = Math.hypot(dragPoint.translationX, dragPoint.translationY);

  if (dragDistance < FLOATING_ACTION_MIN_DRAG_DISTANCE) {
    return false;
  }

  const slotOffset = getFloatingActionSettingsSlotOffset(
    placement,
    buttonPosition,
    quadrant,
    freeLayout,
  );
  const distance = Math.hypot(
    dragPoint.translationX - slotOffset.x,
    dragPoint.translationY - slotOffset.y,
  );

  return distance <= FLOATING_ACTION_SETTINGS_SELECTION_RADIUS;
}

export function getFloatingActionReleaseOutcome(
  dragPoint: FloatingActionDragPoint,
  actionIds: readonly FloatingActionId[],
  placement: FloatingActionPlacement = 'floating',
  activeActionId: FloatingActionId | null = null,
  buttonPosition: FloatingActionButtonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  quadrant: FloatingActionQuadrant = 'bottomRight',
  freeLayout?: FloatingActionFreeLayout,
): FloatingActionReleaseOutcome {
  if (isFloatingActionSettingsTarget(
    dragPoint,
    placement,
    buttonPosition,
    quadrant,
    freeLayout,
  )) {
    return {kind: 'settings'};
  }

  const directTargetActionId = getFloatingActionMenuTarget(
    dragPoint,
    actionIds,
    placement,
    buttonPosition,
    quadrant,
    freeLayout,
  );

  if (directTargetActionId) {
    return {kind: 'select', actionId: directTargetActionId};
  }

  if (
    activeActionId &&
    isFloatingActionFlickActivation(
      dragPoint,
      activeActionId,
      actionIds,
      placement,
      buttonPosition,
      quadrant,
      freeLayout,
    )
  ) {
    return {kind: 'select', actionId: activeActionId};
  }

  return {kind: 'close'};
}

type FloatingActionMenuProps = {
  actionIds?: readonly FloatingActionId[];
  anchor?: FloatingActionAnchor;
  bottomOffset?: number;
  interactionMode?: FloatingActionInteractionMode;
  isExpanded?: boolean;
  buttonPosition?: FloatingActionButtonPosition;
  onAnchorChange?: (anchor: FloatingActionAnchor) => void;
  onExpandedChange?: (isExpanded: boolean) => void;
  onPressSettings?: () => void;
  onReposition?: (quadrant: FloatingActionQuadrant) => void;
  onSelectAction?: (actionId: FloatingActionId) => void;
  placement?: FloatingActionPlacement;
  viewport?: FloatingActionViewport;
};

export function FloatingActionMenu({
  actionIds = DEFAULT_FLOATING_ACTION_IDS,
  anchor = {xRatio: 0.88, yRatio: 0.8},
  bottomOffset = 0,
  buttonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  interactionMode = DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  isExpanded: controlledIsExpanded,
  onAnchorChange,
  onExpandedChange,
  onPressSettings,
  onReposition,
  onSelectAction,
  placement = 'floating',
  viewport = {
    bottomInset: 0,
    bottomReserved: 0,
    height: FLOATING_ACTION_HOST_EXTRA_HEIGHT,
    leftInset: 0,
    rightInset: 0,
    topInset: 0,
    width: FLOATING_ACTION_BUTTON_SIZE,
  },
}: FloatingActionMenuProps) {
  const visibleActionIds = useMemo(() => getVisibleFloatingActionIds(actionIds), [actionIds]);
  const [uncontrolledIsExpanded, setUncontrolledIsExpanded] = useState(false);
  const isExpanded = controlledIsExpanded ?? uncontrolledIsExpanded;
  const isExpandedRef = useRef(isExpanded);
  const panStartExpandedRef = useRef(false);
  const [activeActionId, setActiveActionId] = useState<FloatingActionId | null>(null);
  const activeActionIdRef = useRef<FloatingActionId | null>(null);
  const [isSettingsActive, setIsSettingsActive] = useState(false);
  const [freeDragPoint, setFreeDragPoint] = useState<FloatingActionDragPoint>({
    translationX: 0,
    translationY: 0,
  });
  const [isAccessibilityMoveMode, setIsAccessibilityMoveMode] = useState(false);
  const freeGestureActiveRef = useRef(false);
  const freeDragActiveRef = useRef(false);
  const freeSelectionActiveRef = useRef(false);
  const freeGestureStartedAtRef = useRef(0);
  const freeLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freeLastDragPointRef = useRef<FloatingActionDragPoint>({
    translationX: 0,
    translationY: 0,
  });
  const visibleDefinitions = visibleActionIds.map(getFloatingActionDefinition);
  const baseFreeCenter = useMemo(
    () => getFloatingActionCenter(anchor, viewport),
    [anchor, viewport],
  );
  const clampedFreeAnchor = useMemo(
    () => getClampedFloatingActionAnchor(anchor, viewport),
    [anchor, viewport],
  );
  const displayedFreeCenter = useMemo(
    () => getFloatingActionCenter(
      getFloatingActionAnchorFromCenter(
        {
          x: baseFreeCenter.x + freeDragPoint.translationX,
          y: baseFreeCenter.y + freeDragPoint.translationY,
        },
        viewport,
      ),
      viewport,
    ),
    [baseFreeCenter, freeDragPoint, viewport],
  );
  const freeQuadrant = getFloatingActionQuadrant(displayedFreeCenter, viewport);
  const freeLayout = useMemo<FloatingActionFreeLayout>(
    () => ({center: displayedFreeCenter, viewport}),
    [displayedFreeCenter, viewport],
  );

  isExpandedRef.current = isExpanded;

  const setExpanded = useCallback((nextIsExpanded: boolean | ((current: boolean) => boolean)) => {
    const resolvedIsExpanded = typeof nextIsExpanded === 'function'
      ? nextIsExpanded(isExpandedRef.current)
      : nextIsExpanded;

    if (controlledIsExpanded === undefined) {
      setUncontrolledIsExpanded(resolvedIsExpanded);
    }

    onExpandedChange?.(resolvedIsExpanded);
  }, [controlledIsExpanded, onExpandedChange]);

  const clearActiveTargets = useCallback(() => {
    setActiveActionId(null);
    activeActionIdRef.current = null;
    setIsSettingsActive(false);
  }, []);

  const closeMenu = useCallback(() => {
    setExpanded(false);
    clearActiveTargets();
  }, [clearActiveTargets, setExpanded]);

  const selectAction = useCallback((actionId: FloatingActionId) => {
    closeMenu();
    onSelectAction?.(actionId);
  }, [closeMenu, onSelectAction]);

  useEffect(() => {
    if (!isExpanded) {
      clearActiveTargets();
    }
  }, [clearActiveTargets, isExpanded]);

  useEffect(() => {
    if (
      placement === 'free' &&
      !floatingActionAnchorsEqual(anchor, clampedFreeAnchor)
    ) {
      onAnchorChange?.(clampedFreeAnchor);
    }
  }, [anchor, clampedFreeAnchor, onAnchorChange, placement]);

  const clearFreeLongPressTimer = useCallback(() => {
    if (freeLongPressTimerRef.current) {
      clearTimeout(freeLongPressTimerRef.current);
      freeLongPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearFreeLongPressTimer, [clearFreeLongPressTimer]);

  const commitFreeAnchor = useCallback((dragPoint: FloatingActionDragPoint) => {
    const nextAnchor = getFloatingActionAnchorFromCenter(
      {
        x: baseFreeCenter.x + dragPoint.translationX,
        y: baseFreeCenter.y + dragPoint.translationY,
      },
      viewport,
    );
    const nextCenter = getFloatingActionCenter(nextAnchor, viewport);

    setFreeDragPoint({translationX: 0, translationY: 0});
    onAnchorChange?.(nextAnchor);
    onReposition?.(getFloatingActionQuadrant(nextCenter, viewport));
  }, [baseFreeCenter, onAnchorChange, onReposition, viewport]);

  const updateSelectionTargets = useCallback((dragPoint: FloatingActionDragPoint) => {
    const nextIsSettingsActive = Boolean(
      onPressSettings &&
      isFloatingActionSettingsTarget(
        dragPoint,
        placement,
        buttonPosition,
        freeQuadrant,
        freeLayout,
      ),
    );
    const nextActionId = getFloatingActionMenuTarget(
      dragPoint,
      visibleActionIds,
      placement,
      buttonPosition,
      freeQuadrant,
      freeLayout,
    );
    let retainedActionId: FloatingActionId | null = null;

    if (!nextIsSettingsActive) {
      retainedActionId = nextActionId;

      if (
        !retainedActionId &&
        activeActionIdRef.current &&
        isFloatingActionFlickActivation(
          dragPoint,
          activeActionIdRef.current,
          visibleActionIds,
          placement,
          buttonPosition,
          freeQuadrant,
          freeLayout,
        )
      ) {
        retainedActionId = activeActionIdRef.current;
      }
    }

    activeActionIdRef.current = retainedActionId;
    setActiveActionId(retainedActionId);
    setIsSettingsActive(nextIsSettingsActive);
  }, [
    buttonPosition,
    freeLayout,
    freeQuadrant,
    onPressSettings,
    placement,
    visibleActionIds,
  ]);

  const freePanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => placement === 'free',
      onStartShouldSetPanResponderCapture: () => placement === 'free',
      onMoveShouldSetPanResponder: () => placement === 'free',
      onMoveShouldSetPanResponderCapture: () => placement === 'free',
      onPanResponderGrant: () => {
        freeGestureActiveRef.current = true;
        freeDragActiveRef.current = false;
        freeSelectionActiveRef.current = false;
        freeGestureStartedAtRef.current = Date.now();
        freeLastDragPointRef.current = {translationX: 0, translationY: 0};
        clearFreeLongPressTimer();
        freeLongPressTimerRef.current = setTimeout(() => {
          const transition = getFloatingActionLongPressTransition({
            isGestureActive: freeGestureActiveRef.current,
            isMenuExpanded: isExpandedRef.current,
          });
          if (!transition.shouldBeginDrag) {
            return;
          }

          freeDragActiveRef.current = true;
          setIsAccessibilityMoveMode(false);
          if (transition.shouldCloseMenu) {
            closeMenu();
          }
        }, FLOATING_ACTION_LONG_PRESS_MS);
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const dragPoint = {
          translationX: gestureState.dx,
          translationY: gestureState.dy,
        };
        freeLastDragPointRef.current = dragPoint;

        if (freeDragActiveRef.current) {
          setFreeDragPoint(dragPoint);
          return;
        }

        const dragDistance = Math.hypot(gestureState.dx, gestureState.dy);
        if (dragDistance > FLOATING_ACTION_TAP_MAX_DISTANCE) {
          clearFreeLongPressTimer();
          if (shouldBeginFloatingActionMenuSelection(interactionMode, dragDistance)) {
            freeSelectionActiveRef.current = true;
            setExpanded(true);
            updateSelectionTargets(dragPoint);
          }
        }
      },
      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const wasDragging = freeDragActiveRef.current;
        const wasSelecting = freeSelectionActiveRef.current;
        const durationMs = Date.now() - freeGestureStartedAtRef.current;
        const dragDistance = Math.hypot(gestureState.dx, gestureState.dy);
        const releaseIntent = getFloatingActionFreeReleaseIntent({
          dragDistance,
          durationMs,
          wasDragging,
          wasSelecting,
        });

        freeGestureActiveRef.current = false;
        freeDragActiveRef.current = false;
        freeSelectionActiveRef.current = false;
        clearFreeLongPressTimer();

        if (releaseIntent === 'drag') {
          commitFreeAnchor({
            translationX: gestureState.dx,
            translationY: gestureState.dy,
          });
          return;
        }

        if (releaseIntent === 'selection') {
          const releaseOutcome = getFloatingActionReleaseOutcome(
            {
              translationX: gestureState.dx,
              translationY: gestureState.dy,
            },
            visibleActionIds,
            placement,
            activeActionIdRef.current,
            buttonPosition,
            freeQuadrant,
            freeLayout,
          );

          if (releaseOutcome.kind === 'select') {
            selectAction(releaseOutcome.actionId);
            return;
          }
          if (releaseOutcome.kind === 'settings') {
            closeMenu();
            onPressSettings?.();
            return;
          }
          closeMenu();
          return;
        }

        setFreeDragPoint({translationX: 0, translationY: 0});
        if (releaseIntent === 'toggle') {
          clearActiveTargets();
          setExpanded(current => !current);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => {
        const wasDragging = freeDragActiveRef.current;
        const wasSelecting = freeSelectionActiveRef.current;
        const lastDragPoint = freeLastDragPointRef.current;

        freeGestureActiveRef.current = false;
        freeDragActiveRef.current = false;
        freeSelectionActiveRef.current = false;
        clearFreeLongPressTimer();
        if (wasDragging) {
          commitFreeAnchor(lastDragPoint);
          return;
        }
        if (wasSelecting) {
          closeMenu();
          return;
        }
        setFreeDragPoint({translationX: 0, translationY: 0});
      },
    }),
    [
      clearActiveTargets,
      clearFreeLongPressTimer,
      closeMenu,
      commitFreeAnchor,
      buttonPosition,
      freeQuadrant,
      freeLayout,
      interactionMode,
      onPressSettings,
      placement,
      selectAction,
      setExpanded,
      updateSelectionTargets,
      visibleActionIds,
    ],
  );

  const selectionPanResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => interactionMode === 'drag',
      onStartShouldSetPanResponderCapture: () => interactionMode === 'drag',
      onMoveShouldSetPanResponder: () => interactionMode === 'drag',
      onMoveShouldSetPanResponderCapture: () => interactionMode === 'drag',
      onPanResponderGrant: () => {
        panStartExpandedRef.current = isExpandedRef.current;
        setExpanded(true);
      },
      onPanResponderMove: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        setExpanded(true);
        const dragPoint = {
          translationX: gestureState.dx,
          translationY: gestureState.dy,
        };
        updateSelectionTargets(dragPoint);
      },
      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const dragDistance = Math.hypot(gestureState.dx, gestureState.dy);

        if (dragDistance <= FLOATING_ACTION_TAP_MAX_DISTANCE) {
          if (panStartExpandedRef.current) {
            closeMenu();
            return;
          }

          clearActiveTargets();
          setExpanded(true);
          return;
        }

        const releaseOutcome = getFloatingActionReleaseOutcome(
          {
            translationX: gestureState.dx,
            translationY: gestureState.dy,
          },
          visibleActionIds,
          placement,
          activeActionIdRef.current,
          buttonPosition,
          freeQuadrant,
          freeLayout,
        );

        if (releaseOutcome.kind === 'select') {
          selectAction(releaseOutcome.actionId);
          return;
        }

        if (releaseOutcome.kind === 'settings') {
          closeMenu();
          onPressSettings?.();
          return;
        }

        closeMenu();
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: closeMenu,
    }),
    [
      closeMenu,
      interactionMode,
      placement,
      buttonPosition,
      freeQuadrant,
      freeLayout,
      onPressSettings,
      selectAction,
      setExpanded,
      updateSelectionTargets,
      visibleActionIds,
    ],
  );

  const moveAnchorForAccessibility = useCallback((x: number, y: number) => {
    commitFreeAnchor({translationX: x, translationY: y});
  }, [commitFreeAnchor]);

  const accessibilityActions = isAccessibilityMoveMode
    ? [
        {label: '위로 이동', name: 'moveUp'},
        {label: '아래로 이동', name: 'moveDown'},
        {label: '왼쪽으로 이동', name: 'moveLeft'},
        {label: '오른쪽으로 이동', name: 'moveRight'},
        {label: '위치 이동 완료', name: 'finishMove'},
      ]
    : [
        {label: '빠른 실행 위치 이동', name: 'movePosition'},
        {label: isExpanded ? '메뉴 닫기' : '메뉴 열기', name: 'activate'},
      ];

  const handleAccessibilityAction = useCallback((actionName: string) => {
    if (actionName === 'movePosition') {
      closeMenu();
      setIsAccessibilityMoveMode(true);
      return;
    }

    if (actionName === 'finishMove') {
      setIsAccessibilityMoveMode(false);
      return;
    }

    if (actionName === 'moveUp') {
      moveAnchorForAccessibility(0, -FLOATING_ACTION_ACCESSIBILITY_MOVE_STEP);
      return;
    }

    if (actionName === 'moveDown') {
      moveAnchorForAccessibility(0, FLOATING_ACTION_ACCESSIBILITY_MOVE_STEP);
      return;
    }

    if (actionName === 'moveLeft') {
      moveAnchorForAccessibility(-FLOATING_ACTION_ACCESSIBILITY_MOVE_STEP, 0);
      return;
    }

    if (actionName === 'moveRight') {
      moveAnchorForAccessibility(FLOATING_ACTION_ACCESSIBILITY_MOVE_STEP, 0);
      return;
    }

    if (actionName === 'activate') {
      setExpanded(current => !current);
    }
  }, [closeMenu, isExpanded, moveAnchorForAccessibility, setExpanded]);

  return (
    <View
      pointerEvents="box-none"
      style={[
        placement === 'inline'
          ? styles.inlineHost
          : placement === 'free'
            ? [
                styles.freeHost,
                {
                  top: displayedFreeCenter.y - FLOATING_ACTION_FREE_HOST_SIZE / 2,
                  left: displayedFreeCenter.x - FLOATING_ACTION_FREE_HOST_SIZE / 2,
                },
              ]
            : styles.host,
        placement === 'floating' ? {bottom: bottomOffset} : undefined,
      ]}>
      {isExpanded && placement !== 'free' ? (
        <Pressable
          accessibilityLabel="빠른 실행 메뉴 닫기"
          accessibilityRole="button"
          onPress={closeMenu}
          style={styles.dismissLayer}
        />
      ) : null}

      {isExpanded ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.actionLayer,
            placement === 'free'
              ? {bottom: FLOATING_ACTION_FREE_HOST_SIZE / 2 - FLOATING_ACTION_BUTTON_SIZE / 2}
              : undefined,
          ]}>
          {visibleDefinitions.map((definition, index) => {
            const slotOffset = getFloatingActionSlotOffsetForAction(
              definition.id,
              placement,
              index,
              visibleDefinitions.length,
              buttonPosition,
              freeQuadrant,
              freeLayout,
            );
            const isActive = definition.id === activeActionId;

            return (
              <FloatingActionOptionButton
                definition={definition}
                isActive={isActive}
                key={definition.id}
                onPress={() => selectAction(definition.id)}
                slotOffset={slotOffset}
              />
            );
          })}

          {onPressSettings ? (
            <FloatingActionSettingsButton
              buttonPosition={buttonPosition}
              isActive={isSettingsActive}
              onPress={() => {
                closeMenu();
                onPressSettings();
              }}
              placement={placement}
              quadrant={freeQuadrant}
              freeLayout={freeLayout}
            />
          ) : null}
        </View>
      ) : null}

      {placement === 'free' ? (
        <View
          accessible
          accessibilityActions={accessibilityActions}
          accessibilityHint={
            isAccessibilityMoveMode
              ? '위, 아래, 왼쪽, 오른쪽 동작으로 위치를 옮길 수 있어요.'
              : '짧게 누르면 메뉴를 열고, 길게 누르면 위치를 옮길 수 있어요.'
          }
          accessibilityLabel={
            isAccessibilityMoveMode
              ? '빠른 실행 위치 이동 중'
              : isExpanded
                ? '빠른 실행 메뉴 닫기'
                : '빠른 실행 메뉴 열기'
          }
          accessibilityRole="button"
          onAccessibilityAction={event => {
            handleAccessibilityAction(event.nativeEvent.actionName);
          }}
          style={[
            styles.mainButton,
            {
              bottom:
                FLOATING_ACTION_FREE_HOST_SIZE / 2 -
                FLOATING_ACTION_BUTTON_SIZE / 2,
              left:
                FLOATING_ACTION_FREE_HOST_SIZE / 2 -
                FLOATING_ACTION_BUTTON_SIZE / 2,
            },
            isExpanded && styles.mainButtonExpanded,
          ]}
          {...freePanResponder.panHandlers}>
          <Sparkles
            color={isExpanded ? colors.white : colors.textPrimary}
            size={FLOATING_ACTION_MAIN_ICON_SIZE}
            strokeWidth={FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH}
          />
        </View>
      ) : interactionMode === 'drag' ? (
        <View
          accessible
          accessibilityLabel={isExpanded ? '빠른 실행 메뉴 닫기' : '빠른 실행 메뉴 열기'}
          accessibilityRole="button"
          style={[
            styles.mainButton,
            isExpanded && styles.mainButtonExpanded,
          ]}
          {...selectionPanResponder.panHandlers}>
          <Sparkles
            color={isExpanded ? colors.white : colors.textPrimary}
            size={FLOATING_ACTION_MAIN_ICON_SIZE}
            strokeWidth={FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH}
          />
        </View>
      ) : (
        <Pressable
          accessibilityLabel={isExpanded ? '빠른 실행 메뉴 닫기' : '빠른 실행 메뉴 열기'}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={() => {
            clearActiveTargets();
            setExpanded(current => !current);
          }}
          style={({pressed}) => [
            styles.mainButton,
            isExpanded && styles.mainButtonExpanded,
            pressed && styles.pressed,
          ]}>
          <Sparkles
            color={isExpanded ? colors.white : colors.textPrimary}
            size={FLOATING_ACTION_MAIN_ICON_SIZE}
            strokeWidth={FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH}
          />
        </Pressable>
      )}
    </View>
  );
}

function FloatingActionSettingsButton({
  buttonPosition,
  isActive,
  onPress,
  placement,
  quadrant,
  freeLayout,
}: {
  buttonPosition: FloatingActionButtonPosition;
  isActive: boolean;
  onPress: () => void;
  placement: FloatingActionPlacement;
  quadrant: FloatingActionQuadrant;
  freeLayout: FloatingActionFreeLayout;
}) {
  const visualState = getFloatingActionSettingsVisualState(isActive);

  return (
    <Pressable
      accessibilityLabel="빠른 실행 설정"
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [
        styles.settingsButton,
        getFloatingActionPlacementStyle(
          getFloatingActionSettingsSlotOffset(
            placement,
            buttonPosition,
            quadrant,
            freeLayout,
          ),
          FLOATING_ACTION_SETTINGS_SIZE,
        ),
        {
          backgroundColor: visualState.backgroundColor,
          borderColor: visualState.borderColor,
        },
        pressed && styles.pressed,
      ]}>
      <Settings2 color={visualState.iconColor} size={iconSize.sm} strokeWidth={2} />
    </Pressable>
  );
}

function FloatingActionOptionButton({
  definition,
  isActive,
  onPress,
  slotOffset,
}: {
  definition: FloatingActionDefinition;
  isActive: boolean;
  onPress: () => void;
  slotOffset: FloatingActionSlotOffset;
}) {
  const scale = useRef(new Animated.Value(getFloatingActionButtonScale(isActive))).current;
  const entryProgress = useRef(new Animated.Value(0)).current;
  const entryTranslateX = entryProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-slotOffset.x, 0],
  });
  const entryTranslateY = entryProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-slotOffset.y, 0],
  });

  useEffect(() => {
    Animated.spring(entryProgress, {
      damping: 16,
      mass: 0.7,
      stiffness: 190,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entryProgress]);

  useEffect(() => {
    Animated.spring(scale, {
      damping: 12,
      mass: 0.75,
      stiffness: 220,
      toValue: getFloatingActionButtonScale(isActive),
      useNativeDriver: true,
    }).start();
  }, [isActive, scale]);

  return (
    <Animated.View
      style={[
        styles.actionButton,
        {
          bottom: getFloatingActionItemBottom(slotOffset.y),
          marginLeft: getFloatingActionItemMarginLeft(slotOffset.x),
          opacity: entryProgress,
          transform: [
            {translateX: entryTranslateX},
            {translateY: entryTranslateY},
            {scale},
          ],
        },
        isActive && styles.actionButtonActive,
      ]}>
      <Pressable
        accessibilityLabel={definition.accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={({pressed}) => [styles.actionButtonPressable, pressed && styles.pressed]}>
        {definition.icon(isActive ? colors.white : colors.textPrimary)}
      </Pressable>
    </Animated.View>
  );
}
function getFloatingActionItemBottom(slotOffsetY: number) {
  return (
    FLOATING_ACTION_BUTTON_SIZE / 2 -
    FLOATING_ACTION_ITEM_SIZE / 2 -
    slotOffsetY
  );
}

function getFloatingActionItemMarginLeft(slotOffsetX: number) {
  return slotOffsetX - FLOATING_ACTION_ITEM_SIZE / 2;
}

function getFloatingActionPlacementStyle(
  slotOffset: FloatingActionSlotOffset,
  itemSize: number,
) {
  return {
    bottom: FLOATING_ACTION_BUTTON_SIZE / 2 - itemSize / 2 - slotOffset.y,
    marginLeft: slotOffset.x - itemSize / 2,
  };
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    backgroundColor: FLOATING_ACTION_BUTTON_SURFACE_BACKGROUND,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: FLOATING_ACTION_ITEM_SIZE,
    justifyContent: 'center',
    left: '50%',
    position: 'absolute',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.18,
    shadowRadius: 18,
    width: FLOATING_ACTION_ITEM_SIZE,
  },
  actionButtonActive: {
    backgroundColor: colors.blackSurface,
    borderColor: FLOATING_ACTION_ACTIVE_BORDER_COLOR,
    shadowOpacity: 0.24,
  },
  actionButtonPressable: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  actionLayer: {
    bottom: 0,
    height: FLOATING_ACTION_HOST_EXTRA_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  dismissLayer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  host: {
    height: FLOATING_ACTION_HOST_EXTRA_HEIGHT,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  freeHost: {
    height: FLOATING_ACTION_FREE_HOST_SIZE,
    overflow: 'visible',
    position: 'absolute',
    width: FLOATING_ACTION_FREE_HOST_SIZE,
    zIndex: 30,
  },
  inlineHost: {
    height: FLOATING_ACTION_BUTTON_SIZE,
    overflow: 'visible',
    position: 'relative',
    width: FLOATING_ACTION_BUTTON_SIZE,
    zIndex: 30,
  },
  mainButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.liquidGlassSurface,
    borderColor: colors.liquidGlassBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: 0,
    height: FLOATING_ACTION_BUTTON_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: 10},
    shadowOpacity: 0.18,
    shadowRadius: 24,
    width: FLOATING_ACTION_BUTTON_SIZE,
  },
  mainButtonExpanded: {
    backgroundColor: colors.blackSurface,
    borderColor: FLOATING_ACTION_ACTIVE_BORDER_COLOR,
  },
  pressed: {
    opacity: 0.82,
  },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: FLOATING_ACTION_SETTINGS_BACKGROUND,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.sm,
    height: FLOATING_ACTION_SETTINGS_SIZE,
    justifyContent: 'center',
    left: '50%',
    position: 'absolute',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.12,
    shadowRadius: 16,
    width: FLOATING_ACTION_SETTINGS_SIZE,
  },
});
