import {
  DEFAULT_FLOATING_ACTION_IDS,
  DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  FLOATING_ACTION_ACTIVE_SCALE,
  FLOATING_ACTION_ACTIVE_BORDER_COLOR,
  FLOATING_ACTION_BUTTON_SURFACE_BACKGROUND,
  FLOATING_ACTION_ICON_LIBRARY_NAMES,
  FLOATING_ACTION_IDLE_SCALE,
  FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET,
  FLOATING_ACTION_ITEM_SIZE,
  FLOATING_ACTION_MAIN_ICON_SIZE,
  FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH,
  FLOATING_ACTION_MAX_ITEM_COUNT,
  FLOATING_ACTION_LONG_PRESS_MS,
  FLOATING_ACTION_SETTINGS_BACKGROUND,
  FLOATING_ACTION_SETTINGS_SIZE,
  FLOATING_ACTION_TAP_MAX_DISTANCE,
  floatingActionButtonPositionOptions,
  floatingActionInteractionModeOptions,
  getFloatingActionButtonScale,
  getFloatingActionAnchorFromCenter,
  getFloatingActionCenter,
  getClampedFloatingActionAnchor,
  getFloatingActionDefinition,
  getFloatingActionFreeReleaseIntent,
  getFloatingActionLongPressTransition,
  getFloatingActionMenuTarget,
  getFloatingActionQuadrant,
  getFloatingActionReleaseOutcome,
  getFloatingActionSelectedSlotNumber,
  getFloatingActionSettingsSlotOffset,
  getFloatingActionSettingsVisualState,
  getFloatingActionSlotOffsetForAction,
  getFloatingActionSlotOffset,
  getNextFloatingActionSelection,
  getVisibleFloatingActionIds,
  shouldBeginFloatingActionMenuSelection,
  type FloatingActionId,
} from './FloatingActionMenu';
import {colors} from '../theme';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function expectGreaterThan(actual: number, expected: number, label: string) {
  if (actual <= expected) {
    throw new Error(`${label}: expected greater than ${expected}, received ${actual}`);
  }
}

const defaultFloatingActions: readonly FloatingActionId[] = DEFAULT_FLOATING_ACTION_IDS;
const visibleFloatingActions = getVisibleFloatingActionIds([
  'arFilter',
  'makeupExtraction',
  'makeupFeedback',
  'faceAnalysis',
]);
const topSlot = getFloatingActionSlotOffset(0, FLOATING_ACTION_MAX_ITEM_COUNT);
const leftSlot = getFloatingActionSlotOffset(1, FLOATING_ACTION_MAX_ITEM_COUNT);
const rightSlot = getFloatingActionSlotOffset(2, FLOATING_ACTION_MAX_ITEM_COUNT);
const inlineTopSlot = getFloatingActionSlotOffset(0, FLOATING_ACTION_MAX_ITEM_COUNT, 'inline');
const inlineLeftSlot = getFloatingActionSlotOffset(1, FLOATING_ACTION_MAX_ITEM_COUNT, 'inline');
const inlineRightSlot = getFloatingActionSlotOffset(2, FLOATING_ACTION_MAX_ITEM_COUNT, 'inline');
const inlineLeftPositionTopSlot = getFloatingActionSlotOffset(
  0,
  FLOATING_ACTION_MAX_ITEM_COUNT,
  'inline',
  'left',
);
const inlineLeftPositionMiddleSlot = getFloatingActionSlotOffset(
  1,
  FLOATING_ACTION_MAX_ITEM_COUNT,
  'inline',
  'left',
);
const inlineLeftPositionEndSlot = getFloatingActionSlotOffset(
  2,
  FLOATING_ACTION_MAX_ITEM_COUNT,
  'inline',
  'left',
);
const inlineArFilterSlot = getFloatingActionSlotOffsetForAction('arFilter', 'inline');
const inlineMakeupRecommendationSlot = getFloatingActionSlotOffsetForAction(
  'makeupRecommendation',
  'inline',
);
const inlineMakeupFeedbackSlot = getFloatingActionSlotOffsetForAction(
  'makeupFeedback',
  'inline',
);
const inlineSettingsSlot = getFloatingActionSettingsSlotOffset('inline');
const inlineLeftPositionSettingsSlot = getFloatingActionSettingsSlotOffset('inline', 'left');
const inactiveSettingsVisualState = getFloatingActionSettingsVisualState(false);
const activeSettingsVisualState = getFloatingActionSettingsVisualState(true);
const inlineSettingsRelease = getFloatingActionReleaseOutcome(
  {translationX: inlineSettingsSlot.x, translationY: inlineSettingsSlot.y},
  defaultFloatingActions,
  'inline',
);
const inlineLeftSettingsRelease = getFloatingActionReleaseOutcome(
  {
    translationX: inlineLeftPositionSettingsSlot.x,
    translationY: inlineLeftPositionSettingsSlot.y,
  },
  defaultFloatingActions,
  'inline',
  null,
  'left',
);
const inlineSettingsRecommendationDistance = Math.hypot(
  inlineSettingsSlot.x - inlineMakeupRecommendationSlot.x,
  inlineSettingsSlot.y - inlineMakeupRecommendationSlot.y,
);
const inlineLeftSettingsExtractionDistance = Math.hypot(
  inlineLeftPositionSettingsSlot.x - inlineLeftPositionMiddleSlot.x,
  inlineLeftPositionSettingsSlot.y - inlineLeftPositionMiddleSlot.y,
);
const settingsExtractionMinimumDistance =
  (FLOATING_ACTION_SETTINGS_SIZE + FLOATING_ACTION_ITEM_SIZE) / 2;
const customOrderedFloatingActions: readonly FloatingActionId[] = [
  'makeupFeedback',
  'arFilter',
  'makeupExtraction',
];
const arFilterFloatingActionDefinition = getFloatingActionDefinition('arFilter');
const constrainedViewport = {
  bottomInset: 12,
  bottomReserved: 90,
  height: 340,
  leftInset: 8,
  rightInset: 8,
  topInset: 20,
  width: 240,
};
const clampedRestoredAnchor = getClampedFloatingActionAnchor(
  {xRatio: 1, yRatio: 1},
  constrainedViewport,
);
const constrainedFreeCenter = getFloatingActionCenter(
  {xRatio: 0.5, yRatio: 0.5},
  constrainedViewport,
);
const constrainedFreeLayout = {
  center: constrainedFreeCenter,
  viewport: constrainedViewport,
};
const constrainedActionSlot = getFloatingActionSlotOffsetForAction(
  'makeupFeedback',
  'free',
  1,
  3,
  'right',
  'topLeft',
  constrainedFreeLayout,
);
const constrainedSettingsSlot = getFloatingActionSettingsSlotOffset(
  'free',
  'right',
  'topLeft',
  constrainedFreeLayout,
);

expectEqual(FLOATING_ACTION_MAX_ITEM_COUNT, 3, 'floating action max item count');
expectEqual(FLOATING_ACTION_TAP_MAX_DISTANCE, 8, 'floating action tap distance threshold');
expectEqual(FLOATING_ACTION_LONG_PRESS_MS, 400, 'floating action long press threshold');
const freeReleaseBoundaryCases = [
  {
    dragDistance: 7,
    durationMs: 399,
    expected: 'toggle',
    label: '399ms short press with sub-threshold movement toggles the menu',
  },
  {
    dragDistance: 7,
    durationMs: 400,
    expected: 'drag',
    label: '400ms release resolves as a drag even if the timer callback races release',
  },
  {
    dragDistance: 7,
    durationMs: 401,
    expected: 'drag',
    label: 'presses over 400ms remain long-press drags',
  },
  {
    dragDistance: 8,
    durationMs: 399,
    expected: 'none',
    label: 'movement at the 8pt boundary is not treated as a short tap',
  },
  {
    dragDistance: 8,
    durationMs: 400,
    expected: 'drag',
    label: 'the 8pt boundary still permits an exact-threshold long press',
  },
] as const;

freeReleaseBoundaryCases.forEach(({dragDistance, durationMs, expected, label}) => {
  expectEqual(
    getFloatingActionFreeReleaseIntent({
      dragDistance,
      durationMs,
      wasDragging: false,
      wasSelecting: false,
    }),
    expected,
    label,
  );
});
expectEqual(
  getFloatingActionFreeReleaseIntent({
    dragDistance: 96,
    durationMs: 450,
    wasDragging: true,
    wasSelecting: false,
  }),
  'drag',
  'an active long-press drag commits its anchor regardless of release distance',
);
expectEqual(
  getFloatingActionFreeReleaseIntent({
    dragDistance: 96,
    durationMs: 450,
    wasDragging: false,
    wasSelecting: true,
  }),
  'selection',
  'an early drag-to-select gesture remains a selection after a long hold',
);
expectEqual(
  shouldBeginFloatingActionMenuSelection('drag', 9),
  true,
  'early drag keeps the configured drag-to-select interaction',
);
expectEqual(
  shouldBeginFloatingActionMenuSelection('tap', 9),
  false,
  'tap interaction does not turn movement into menu selection',
);
const collapsedLongPressTransition = getFloatingActionLongPressTransition({
  isGestureActive: true,
  isMenuExpanded: false,
});
expectEqual(
  collapsedLongPressTransition.shouldBeginDrag,
  true,
  'an active 400ms long press begins dragging',
);
expectEqual(
  collapsedLongPressTransition.shouldCloseMenu,
  false,
  'a collapsed menu does not emit a redundant close transition',
);
const expandedLongPressTransition = getFloatingActionLongPressTransition({
  isGestureActive: true,
  isMenuExpanded: true,
});
expectEqual(
  expandedLongPressTransition.shouldBeginDrag,
  true,
  'an expanded menu still enters drag mode after a long press',
);
expectEqual(
  expandedLongPressTransition.shouldCloseMenu,
  true,
  'entering drag mode closes an expanded menu',
);
expectEqual(
  getFloatingActionLongPressTransition({
    isGestureActive: false,
    isMenuExpanded: true,
  }).shouldBeginDrag,
  false,
  'a cancelled gesture cannot be revived by a delayed long-press timer',
);
expectEqual(
  clampedRestoredAnchor.xRatio < 1 && clampedRestoredAnchor.yRatio < 1,
  true,
  'restored anchor is renormalized after viewport constraints change',
);
expectEqual(
  constrainedFreeCenter.y + constrainedActionSlot.y <=
    constrainedViewport.height -
      constrainedViewport.bottomInset -
      constrainedViewport.bottomReserved -
      8 -
      (FLOATING_ACTION_ITEM_SIZE * FLOATING_ACTION_ACTIVE_SCALE) / 2,
  true,
  'expanded active action item is clamped above the reserved bottom area',
);
expectEqual(
  constrainedFreeCenter.x + constrainedSettingsSlot.x <=
    constrainedViewport.width -
      constrainedViewport.rightInset -
      8 -
      FLOATING_ACTION_SETTINGS_SIZE / 2,
  true,
  'expanded settings item is clamped inside the horizontal safe area',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: constrainedActionSlot.x, translationY: constrainedActionSlot.y},
    defaultFloatingActions,
    'free',
    'right',
    'topLeft',
    constrainedFreeLayout,
  ),
  'makeupFeedback',
  'clamped free action target matches its rendered position',
);
expectEqual(
  getFloatingActionReleaseOutcome(
    {translationX: constrainedSettingsSlot.x, translationY: constrainedSettingsSlot.y},
    defaultFloatingActions,
    'free',
    null,
    'right',
    'topLeft',
    constrainedFreeLayout,
  ).kind,
  'settings',
  'clamped free settings target matches its rendered position',
);
expectEqual(FLOATING_ACTION_MAIN_ICON_SIZE, 20, 'floating action main icon size');
expectEqual(
  FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH,
  1.8,
  'floating action main icon stroke width',
);
expectEqual(
  defaultFloatingActions.join(','),
  'makeupRecommendation,makeupFeedback,arFilter',
  'default floating action ids',
);
expectEqual(
  arFilterFloatingActionDefinition.label,
  '메이크업 필터',
  'AR floating action display label uses makeup filter copy',
);
expectEqual(
  arFilterFloatingActionDefinition.accessibilityLabel,
  '메이크업 필터 열기',
  'AR floating action accessibility label uses makeup filter copy',
);
expectEqual(
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  'drag',
  'default floating action interaction mode',
);
expectEqual(
  DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  'right',
  'default floating action button position',
);
expectEqual(
  floatingActionInteractionModeOptions.map(option => option.id).join(','),
  'tap,drag',
  'floating action interaction mode ids',
);
expectEqual(
  floatingActionButtonPositionOptions.map(option => option.id).join(','),
  'right,left',
  'floating action button position ids',
);
expectEqual(
  visibleFloatingActions.join(','),
  'arFilter,makeupExtraction,makeupFeedback',
  'visible floating action ids are capped',
);
expectEqual(topSlot.x, 0, 'floating action top slot x offset');
expectEqual(topSlot.y, -112, 'floating action top slot y offset');
expectEqual(leftSlot.x, -92, 'floating action left slot x offset');
expectEqual(rightSlot.x, 92, 'floating action right slot x offset');
expectEqual(FLOATING_ACTION_ICON_LIBRARY_NAMES.arFilter, 'Camera', 'AR filter icon library name');
expectEqual(
  FLOATING_ACTION_ICON_LIBRARY_NAMES.filterStore,
  'Store',
  'filter store icon library name',
);
expectEqual(
  FLOATING_ACTION_ICON_LIBRARY_NAMES.makeupFeedback,
  'MessageSquareText',
  'makeup feedback icon library name',
);
expectEqual(
  FLOATING_ACTION_BUTTON_SURFACE_BACKGROUND,
  colors.liquidGlassSurface,
  'floating action option button uses liquid glass background',
);
expectEqual(
  FLOATING_ACTION_SETTINGS_BACKGROUND,
  colors.bottomSheetControlSurface,
  'floating action settings button uses translucent control background',
);
expectEqual(FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET.x, 0, 'AR filter 12 o clock x offset');
expectEqual(FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET.y, -74, 'AR filter 12 o clock y offset');
expectEqual(inlineTopSlot.x, 0, 'inline floating action AR slot x offset');
expectEqual(inlineTopSlot.y, -74, 'inline floating action AR slot y offset');
expectEqual(inlineLeftSlot.x, -52, 'inline floating action extraction arc x offset');
expectEqual(inlineLeftSlot.y, -52, 'inline floating action extraction arc y offset');
expectEqual(inlineRightSlot.x, -74, 'inline floating action feedback arc x offset');
expectEqual(inlineRightSlot.y, 0, 'inline floating action feedback arc y offset');
expectEqual(inlineMakeupRecommendationSlot.x, 0, 'inline makeup recommendation sits at 12 o clock');
expectEqual(inlineMakeupRecommendationSlot.y, -74, 'inline makeup recommendation starts the tighter arc');
expectEqual(inlineMakeupFeedbackSlot.x, -52, 'inline makeup feedback follows the tighter arc');
expectEqual(inlineMakeupFeedbackSlot.y, -52, 'inline makeup feedback sits on the upper-left arc');
expectEqual(inlineArFilterSlot.x, -74, 'inline AR filter finishes the default action arc');
expectEqual(inlineArFilterSlot.y, 0, 'inline AR filter sits at 9 o clock');
expectEqual(inlineSettingsSlot.x, -44, 'inline settings finishes the tighter arc toward 7 o clock');
expectEqual(inlineSettingsSlot.y, 24, 'inline settings sits closer below-left of the star');
expectGreaterThan(
  inlineSettingsRecommendationDistance,
  settingsExtractionMinimumDistance,
  'inline settings avoids makeup recommendation overlap',
);
expectEqual(
  inactiveSettingsVisualState.backgroundColor,
  FLOATING_ACTION_SETTINGS_BACKGROUND,
  'inactive settings keeps muted background',
);
expectEqual(
  inactiveSettingsVisualState.borderColor,
  '#D8D8D8',
  'inactive settings keeps strong border',
);
expectEqual(
  inactiveSettingsVisualState.iconColor,
  '#111111',
  'inactive settings keeps dark icon',
);
expectEqual(
  activeSettingsVisualState.backgroundColor,
  colors.blackSurface,
  'active settings uses translucent black surface',
);
expectEqual(
  activeSettingsVisualState.borderColor,
  FLOATING_ACTION_ACTIVE_BORDER_COLOR,
  'active settings removes black border',
);
expectEqual(
  FLOATING_ACTION_ACTIVE_BORDER_COLOR,
  colors.transparent,
  'active floating action buttons use transparent borders',
);
expectEqual(
  activeSettingsVisualState.iconColor,
  '#FFFFFF',
  'active settings uses white icon',
);
expectEqual(String(inlineSettingsRelease.kind), 'settings', 'inline release opens settings');
expectEqual(
  inlineLeftPositionTopSlot.x,
  0,
  'left-position inline slot 1 stays at 12 o clock',
);
expectEqual(
  inlineLeftPositionTopSlot.y,
  -74,
  'left-position inline slot 1 keeps vertical offset',
);
expectEqual(
  inlineLeftPositionMiddleSlot.x,
  52,
  'left-position inline slot 2 mirrors the circular arc',
);
expectEqual(
  inlineLeftPositionMiddleSlot.y,
  -52,
  'left-position inline slot 2 stays on the upper arc',
);
expectEqual(
  inlineLeftPositionEndSlot.x,
  74,
  'left-position inline slot 3 mirrors the circular arc',
);
expectEqual(
  inlineLeftPositionEndSlot.y,
  0,
  'left-position inline slot 3 sits at 3 o clock',
);
expectEqual(
  inlineLeftPositionSettingsSlot.x,
  44,
  'left-position settings finishes the mirrored arc',
);
expectEqual(
  inlineLeftPositionSettingsSlot.y,
  24,
  'left-position settings sits below-right of the star',
);
expectGreaterThan(
  inlineLeftSettingsExtractionDistance,
  settingsExtractionMinimumDistance,
  'left-position settings avoids makeup extraction overlap',
);
expectEqual(
  String(inlineLeftSettingsRelease.kind),
  'settings',
  'left-position inline release opens settings',
);
expectEqual(
  getFloatingActionSelectedSlotNumber(customOrderedFloatingActions, 'makeupFeedback'),
  1,
  'first selected floating action uses slot 1',
);
expectEqual(
  getFloatingActionSelectedSlotNumber(customOrderedFloatingActions, 'arFilter'),
  2,
  'second selected floating action uses slot 2',
);
expectEqual(
  getFloatingActionSelectedSlotNumber(customOrderedFloatingActions, 'faceAnalysis'),
  null,
  'unselected floating action has no slot number',
);
expectEqual(
  getFloatingActionSelectedSlotNumber([], 'arFilter'),
  null,
  'empty floating action selection has no slot number',
);
expectEqual(FLOATING_ACTION_IDLE_SCALE, 1, 'floating action idle scale');
expectEqual(FLOATING_ACTION_ACTIVE_SCALE, 1.2, 'floating action active scale');
expectEqual(getFloatingActionButtonScale(false), 1, 'inactive floating action scale');
expectEqual(getFloatingActionButtonScale(true), 1.2, 'active floating action scale');

const phoneViewport = {
  bottomInset: 34,
  bottomReserved: 68,
  height: 874,
  leftInset: 0,
  rightInset: 0,
  topInset: 47,
  width: 402,
};
const topLeftClampedCenter = getFloatingActionCenter(
  {xRatio: 0, yRatio: 0},
  phoneViewport,
);
const bottomRightClampedCenter = getFloatingActionCenter(
  {xRatio: 1, yRatio: 1},
  phoneViewport,
);
expectEqual(topLeftClampedCenter.x, 39, 'free anchor clamps against left edge');
expectEqual(topLeftClampedCenter.y, 86, 'free anchor clamps below top safe area');
expectEqual(bottomRightClampedCenter.x, 363, 'free anchor clamps against right edge');
expectEqual(bottomRightClampedCenter.y, 733, 'free anchor clears footer and bottom safe area');
expectEqual(
  getFloatingActionQuadrant(bottomRightClampedCenter, phoneViewport),
  'bottomRight',
  'free anchor resolves normalized quadrant',
);
expectEqual(
  getFloatingActionAnchorFromCenter(bottomRightClampedCenter, phoneViewport).xRatio,
  363 / 402,
  'free anchor persists a normalized x coordinate',
);
const freeBottomRightTopSlot = getFloatingActionSlotOffset(
  0,
  3,
  'free',
  'right',
  'bottomRight',
);
const freeTopLeftEndSlot = getFloatingActionSlotOffset(
  2,
  3,
  'free',
  'left',
  'topLeft',
);
expectEqual(freeBottomRightTopSlot.y, -112, 'bottom-right menu expands upward');
expectEqual(freeTopLeftEndSlot.x, 97, 'top-left menu expands rightward');
expectEqual(freeTopLeftEndSlot.y, 56, 'top-left menu expands downward');
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 6, translationY: -108},
    defaultFloatingActions,
  ),
  'makeupRecommendation',
  'dragging upward selects makeup recommendation',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -96, translationY: -72},
    defaultFloatingActions,
  ),
  'makeupFeedback',
  'dragging upper-left selects makeup feedback',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 96, translationY: -72},
    defaultFloatingActions,
  ),
  'arFilter',
  'dragging upper-right selects AR filter',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -74, translationY: 0},
    defaultFloatingActions,
    'inline',
  ),
  'arFilter',
  'inline dragging inward-left selects AR filter without leaving the screen',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 0, translationY: -74},
    customOrderedFloatingActions,
    'inline',
  ),
  'makeupFeedback',
  'inline slot 1 uses the first selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -52, translationY: -52},
    customOrderedFloatingActions,
    'inline',
  ),
  'arFilter',
  'inline slot 2 uses the second selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -74, translationY: 0},
    customOrderedFloatingActions,
    'inline',
  ),
  'makeupExtraction',
  'inline slot 3 uses the third selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 0, translationY: -74},
    customOrderedFloatingActions,
    'inline',
    'left',
  ),
  'makeupFeedback',
  'left-position inline slot 1 uses the first selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 52, translationY: -52},
    customOrderedFloatingActions,
    'inline',
    'left',
  ),
  'arFilter',
  'left-position inline slot 2 uses the second selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 74, translationY: 0},
    customOrderedFloatingActions,
    'inline',
    'left',
  ),
  'makeupExtraction',
  'left-position inline slot 3 uses the third selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 8, translationY: -12},
    defaultFloatingActions,
  ),
  null,
  'short drag does not select a floating action',
);
expectEqual(
  getFloatingActionReleaseOutcome(
    {translationX: 8, translationY: -12},
    defaultFloatingActions,
    'inline',
  ).kind,
  'close',
  'short drag release from collapsed menu folds the quick action menu back',
);
expectEqual(
  getFloatingActionReleaseOutcome(
    {translationX: -20, translationY: 32},
    defaultFloatingActions,
    'inline',
  ).kind,
  'close',
  'short lower-left drag near settings still folds the quick action menu back',
);
const inlineFeedbackRelease = getFloatingActionReleaseOutcome(
  {translationX: -52, translationY: -52},
  defaultFloatingActions,
  'inline',
  null,
);
expectEqual(inlineFeedbackRelease.kind, 'select', 'inline release on target selects action');
expectEqual(
  inlineFeedbackRelease.kind === 'select' ? inlineFeedbackRelease.actionId : null,
  'makeupFeedback',
  'inline release selects makeup feedback',
);
const inlineFeedbackFlickRelease = getFloatingActionReleaseOutcome(
  {translationX: -86, translationY: -86},
  defaultFloatingActions,
  'inline',
  'makeupFeedback',
);
expectEqual(
  inlineFeedbackFlickRelease.kind,
  'select',
  'inline outward flick from active action selects action',
);
expectEqual(
  inlineFeedbackFlickRelease.kind === 'select' ? inlineFeedbackFlickRelease.actionId : null,
  'makeupFeedback',
  'inline outward flick keeps the active makeup feedback action',
);
expectEqual(
  getFloatingActionReleaseOutcome(
    {translationX: 88, translationY: -44},
    defaultFloatingActions,
    'inline',
    null,
  ).kind,
  'close',
  'release outside inline floating actions without an active action cancels selection',
);
expectEqual(
  getNextFloatingActionSelection(
    ['arFilter', 'makeupExtraction', 'makeupFeedback'],
    'faceAnalysis',
  ).join(','),
  'arFilter,makeupExtraction,makeupFeedback',
  'selection ignores fourth action',
);
expectEqual(
  getNextFloatingActionSelection(
    ['arFilter', 'makeupExtraction'],
    'faceAnalysis',
  ).join(','),
  'arFilter,makeupExtraction,faceAnalysis',
  'selection adds action until max count',
);
expectEqual(
  getNextFloatingActionSelection(
    ['arFilter', 'makeupExtraction', 'faceAnalysis'],
    'faceAnalysis',
  ).join(','),
  'arFilter,makeupExtraction',
  'selection toggles selected action off',
);
