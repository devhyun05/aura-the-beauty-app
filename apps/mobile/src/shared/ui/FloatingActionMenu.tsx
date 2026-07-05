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
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../theme';

export type FloatingActionId =
  | 'arFilter'
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

export type FloatingActionPlacement = 'floating' | 'inline';
export type FloatingActionInteractionMode = 'tap' | 'drag';
export type FloatingActionButtonPosition = 'right' | 'left';

export type FloatingActionReleaseOutcome =
  | {kind: 'select'; actionId: FloatingActionId}
  | {kind: 'settings'}
  | {kind: 'close'};

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
export const FLOATING_ACTION_MIN_DRAG_DISTANCE = 48;
export const FLOATING_ACTION_SELECTION_RADIUS = 54;
export const FLOATING_ACTION_FLICK_ALIGNMENT = 0.88;
export const FLOATING_ACTION_FLICK_EXTRA_DISTANCE = 18;
export const FLOATING_ACTION_IDLE_SCALE = 1;
export const FLOATING_ACTION_ACTIVE_SCALE = 1.2;
export const FLOATING_ACTION_BUTTON_SIZE = 62;
export const FLOATING_ACTION_MAIN_ICON_SIZE = iconSize.sm;
export const FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH = 1.8;
export const FLOATING_ACTION_ITEM_SIZE = 58;
export const FLOATING_ACTION_SETTINGS_SIZE = 42;
export const FLOATING_ACTION_SETTINGS_SELECTION_RADIUS =
  FLOATING_ACTION_SETTINGS_SIZE / 2 + spacing.sm;
export const FLOATING_ACTION_BUTTON_SURFACE_BACKGROUND = '#FFFFFF';
export const FLOATING_ACTION_SETTINGS_BACKGROUND = '#E7E7E7';
export const FLOATING_ACTION_HOST_EXTRA_HEIGHT = 178;
export const FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET: FloatingActionSlotOffset = {
  x: 0,
  y: -74,
};
export const FLOATING_ACTION_INLINE_SETTINGS_SLOT_OFFSET: FloatingActionSlotOffset = {
  x: -38,
  y: 38,
};
const FLOATING_ACTION_INLINE_ARC_SLOT_OFFSETS = [
  FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET,
  {x: -52, y: -52},
  {x: -74, y: 0},
] as const satisfies readonly FloatingActionSlotOffset[];
export const DEFAULT_FLOATING_ACTION_INTERACTION_MODE: FloatingActionInteractionMode = 'drag';
export const DEFAULT_FLOATING_ACTION_BUTTON_POSITION: FloatingActionButtonPosition = 'right';
export const DEFAULT_FLOATING_ACTION_IDS = [
  'arFilter',
  'makeupExtraction',
  'makeupFeedback',
] as const satisfies readonly FloatingActionId[];

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

    if (visibleIds.includes(actionId)) {
      return;
    }

    if (visibleIds.length < FLOATING_ACTION_MAX_ITEM_COUNT) {
      visibleIds.push(actionId);
    }
  });

  return visibleIds.length > 0 ? visibleIds : DEFAULT_FLOATING_ACTION_IDS;
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
): FloatingActionSlotOffset {
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
): FloatingActionSlotOffset {
  const defaultActionIndex =
    (DEFAULT_FLOATING_ACTION_IDS as readonly FloatingActionId[]).indexOf(actionId);
  const resolvedIndex = fallbackIndex ?? (defaultActionIndex >= 0 ? defaultActionIndex : 0);

  return getFloatingActionSlotOffset(resolvedIndex, itemCount, placement, buttonPosition);
}

export function getFloatingActionSettingsSlotOffset(
  placement: FloatingActionPlacement = 'floating',
  buttonPosition: FloatingActionButtonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
): FloatingActionSlotOffset {
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
    backgroundColor: isActive ? colors.textPrimary : FLOATING_ACTION_SETTINGS_BACKGROUND,
    borderColor: isActive ? colors.textPrimary : colors.borderStrong,
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
  );
}

function isFloatingActionFlickActivation(
  dragPoint: FloatingActionDragPoint,
  activeActionId: FloatingActionId,
  actionIds: readonly FloatingActionId[],
  placement: FloatingActionPlacement,
  buttonPosition: FloatingActionButtonPosition,
) {
  const slotOffset = getFloatingActionSlotOffsetById(
    activeActionId,
    actionIds,
    placement,
    buttonPosition,
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
) {
  const dragDistance = Math.hypot(dragPoint.translationX, dragPoint.translationY);

  if (dragDistance < FLOATING_ACTION_MIN_DRAG_DISTANCE) {
    return false;
  }

  const slotOffset = getFloatingActionSettingsSlotOffset(placement, buttonPosition);
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
): FloatingActionReleaseOutcome {
  if (isFloatingActionSettingsTarget(dragPoint, placement, buttonPosition)) {
    return {kind: 'settings'};
  }

  const directTargetActionId = getFloatingActionMenuTarget(
    dragPoint,
    actionIds,
    placement,
    buttonPosition,
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
    )
  ) {
    return {kind: 'select', actionId: activeActionId};
  }

  return {kind: 'close'};
}

type FloatingActionMenuProps = {
  actionIds?: readonly FloatingActionId[];
  bottomOffset?: number;
  interactionMode?: FloatingActionInteractionMode;
  isExpanded?: boolean;
  buttonPosition?: FloatingActionButtonPosition;
  onExpandedChange?: (isExpanded: boolean) => void;
  onPressSettings?: () => void;
  onSelectAction?: (actionId: FloatingActionId) => void;
  placement?: FloatingActionPlacement;
};

export function FloatingActionMenu({
  actionIds = DEFAULT_FLOATING_ACTION_IDS,
  bottomOffset = 0,
  buttonPosition = DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  interactionMode = DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  isExpanded: controlledIsExpanded,
  onExpandedChange,
  onPressSettings,
  onSelectAction,
  placement = 'floating',
}: FloatingActionMenuProps) {
  const visibleActionIds = useMemo(() => getVisibleFloatingActionIds(actionIds), [actionIds]);
  const [uncontrolledIsExpanded, setUncontrolledIsExpanded] = useState(false);
  const isExpanded = controlledIsExpanded ?? uncontrolledIsExpanded;
  const isExpandedRef = useRef(isExpanded);
  const [activeActionId, setActiveActionId] = useState<FloatingActionId | null>(null);
  const activeActionIdRef = useRef<FloatingActionId | null>(null);
  const [isSettingsActive, setIsSettingsActive] = useState(false);
  const visibleDefinitions = visibleActionIds.map(getFloatingActionDefinition);

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

  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => interactionMode === 'drag',
      onStartShouldSetPanResponderCapture: () => interactionMode === 'drag',
      onMoveShouldSetPanResponder: () => interactionMode === 'drag',
      onMoveShouldSetPanResponderCapture: () => interactionMode === 'drag',
      onPanResponderGrant: () => {
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
        const nextIsSettingsActive = Boolean(
          onPressSettings &&
          isFloatingActionSettingsTarget(dragPoint, placement, buttonPosition),
        );
        const nextActionId = getFloatingActionMenuTarget(
          dragPoint,
          visibleActionIds,
          placement,
          buttonPosition,
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
            )
          ) {
            retainedActionId = activeActionIdRef.current;
          }
        }

        activeActionIdRef.current = retainedActionId;
        setActiveActionId(retainedActionId);
        setIsSettingsActive(nextIsSettingsActive);
      },
      onPanResponderRelease: (
        _event: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const releaseOutcome = getFloatingActionReleaseOutcome(
          {
            translationX: gestureState.dx,
            translationY: gestureState.dy,
          },
          visibleActionIds,
          placement,
          activeActionIdRef.current,
          buttonPosition,
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
      onPressSettings,
      selectAction,
      setExpanded,
      visibleActionIds,
    ],
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        placement === 'inline' ? styles.inlineHost : styles.host,
        placement === 'floating' ? {bottom: bottomOffset} : undefined,
      ]}>
      {isExpanded ? (
        <Pressable
          accessibilityLabel="빠른 실행 메뉴 닫기"
          accessibilityRole="button"
          onPress={closeMenu}
          style={styles.dismissLayer}
        />
      ) : null}

      {isExpanded ? (
        <View pointerEvents="box-none" style={styles.actionLayer}>
          {visibleDefinitions.map((definition, index) => {
            const slotOffset = getFloatingActionSlotOffsetForAction(
              definition.id,
              placement,
              index,
              visibleDefinitions.length,
              buttonPosition,
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
            />
          ) : null}
        </View>
      ) : null}

      {interactionMode === 'drag' ? (
        <View
          accessible
          accessibilityLabel={isExpanded ? '빠른 실행 메뉴 닫기' : '빠른 실행 메뉴 열기'}
          accessibilityRole="button"
          style={[
            styles.mainButton,
            isExpanded && styles.mainButtonExpanded,
          ]}
          {...panResponder.panHandlers}>
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
}: {
  buttonPosition: FloatingActionButtonPosition;
  isActive: boolean;
  onPress: () => void;
  placement: FloatingActionPlacement;
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
          getFloatingActionSettingsSlotOffset(placement, buttonPosition),
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
          transform: [{scale}],
        },
        isActive && styles.actionButtonActive,
      ]}>
      <Pressable
        accessibilityLabel={definition.accessibilityLabel}
        accessibilityRole="button"
        onPress={onPress}
        style={({pressed}) => [styles.actionButtonPressable, pressed && styles.pressed]}>
        {definition.icon(isActive ? colors.white : colors.textPrimary)}
        <Text
          numberOfLines={2}
          style={[
            styles.actionLabel,
            isActive && styles.actionLabelActive,
          ]}>
          {definition.label}
        </Text>
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
    gap: 2,
    height: FLOATING_ACTION_ITEM_SIZE,
    justifyContent: 'center',
    left: '50%',
    paddingHorizontal: spacing.xs,
    position: 'absolute',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.18,
    shadowRadius: 18,
    width: FLOATING_ACTION_ITEM_SIZE,
  },
  actionButtonActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
    shadowOpacity: 0.24,
  },
  actionButtonPressable: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    width: '100%',
  },
  actionLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: 9,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: 11,
    textAlign: 'center',
  },
  actionLabelActive: {
    color: colors.white,
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
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
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
