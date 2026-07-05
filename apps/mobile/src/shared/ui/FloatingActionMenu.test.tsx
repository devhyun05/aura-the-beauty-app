import {
  DEFAULT_FLOATING_ACTION_IDS,
  DEFAULT_FLOATING_ACTION_BUTTON_POSITION,
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  FLOATING_ACTION_ACTIVE_SCALE,
  FLOATING_ACTION_BUTTON_SURFACE_BACKGROUND,
  FLOATING_ACTION_ICON_LIBRARY_NAMES,
  FLOATING_ACTION_IDLE_SCALE,
  FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET,
  FLOATING_ACTION_ITEM_SIZE,
  FLOATING_ACTION_MAIN_ICON_SIZE,
  FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH,
  FLOATING_ACTION_MAX_ITEM_COUNT,
  FLOATING_ACTION_SETTINGS_BACKGROUND,
  FLOATING_ACTION_SETTINGS_SIZE,
  floatingActionButtonPositionOptions,
  floatingActionInteractionModeOptions,
  getFloatingActionButtonScale,
  getFloatingActionDefinition,
  getFloatingActionMenuTarget,
  getFloatingActionReleaseOutcome,
  getFloatingActionSelectedSlotNumber,
  getFloatingActionSettingsSlotOffset,
  getFloatingActionSettingsVisualState,
  getFloatingActionSlotOffsetForAction,
  getFloatingActionSlotOffset,
  getNextFloatingActionSelection,
  getVisibleFloatingActionIds,
  type FloatingActionId,
} from './FloatingActionMenu';

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
const inlineMakeupExtractionSlot = getFloatingActionSlotOffsetForAction(
  'makeupExtraction',
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
const inlineSettingsExtractionDistance = Math.hypot(
  inlineSettingsSlot.x - inlineMakeupExtractionSlot.x,
  inlineSettingsSlot.y - inlineMakeupExtractionSlot.y,
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

expectEqual(FLOATING_ACTION_MAX_ITEM_COUNT, 3, 'floating action max item count');
expectEqual(FLOATING_ACTION_MAIN_ICON_SIZE, 20, 'floating action main icon size');
expectEqual(
  FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH,
  1.8,
  'floating action main icon stroke width',
);
expectEqual(
  defaultFloatingActions.join(','),
  'arFilter,makeupExtraction,makeupFeedback',
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
  '#FFFFFF',
  'floating action option button background',
);
expectEqual(
  FLOATING_ACTION_SETTINGS_BACKGROUND,
  '#E7E7E7',
  'floating action settings button background',
);
expectEqual(FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET.x, 0, 'AR filter 12 o clock x offset');
expectEqual(FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET.y, -74, 'AR filter 12 o clock y offset');
expectEqual(inlineTopSlot.x, 0, 'inline floating action AR slot x offset');
expectEqual(inlineTopSlot.y, -74, 'inline floating action AR slot y offset');
expectEqual(inlineLeftSlot.x, -52, 'inline floating action extraction arc x offset');
expectEqual(inlineLeftSlot.y, -52, 'inline floating action extraction arc y offset');
expectEqual(inlineRightSlot.x, -74, 'inline floating action feedback arc x offset');
expectEqual(inlineRightSlot.y, 0, 'inline floating action feedback arc y offset');
expectEqual(inlineArFilterSlot.x, 0, 'inline AR filter sits at 12 o clock');
expectEqual(inlineArFilterSlot.y, -74, 'inline AR filter sits closer above the star');
expectEqual(inlineMakeupExtractionSlot.x, -52, 'inline makeup extraction follows the tighter arc');
expectEqual(inlineMakeupExtractionSlot.y, -52, 'inline makeup extraction sits on the tighter upper-left arc');
expectEqual(inlineMakeupFeedbackSlot.x, -74, 'inline makeup feedback continues the tighter arc');
expectEqual(inlineMakeupFeedbackSlot.y, 0, 'inline makeup feedback sits at 9 o clock');
expectEqual(inlineSettingsSlot.x, -38, 'inline settings finishes the tighter arc toward 7 o clock');
expectEqual(inlineSettingsSlot.y, 38, 'inline settings sits closer below-left of the star');
expectGreaterThan(
  inlineSettingsExtractionDistance,
  settingsExtractionMinimumDistance,
  'inline settings avoids makeup extraction overlap',
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
  '#111111',
  'active settings uses black background',
);
expectEqual(
  activeSettingsVisualState.borderColor,
  '#111111',
  'active settings uses black border',
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
  38,
  'left-position settings finishes the mirrored arc',
);
expectEqual(
  inlineLeftPositionSettingsSlot.y,
  38,
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
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 6, translationY: -108},
    defaultFloatingActions,
  ),
  'arFilter',
  'dragging upward selects AR filter',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -96, translationY: -72},
    defaultFloatingActions,
  ),
  'makeupExtraction',
  'dragging upper-left selects makeup extraction',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 96, translationY: -72},
    defaultFloatingActions,
  ),
  'makeupFeedback',
  'dragging upper-right selects makeup feedback',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -74, translationY: 0},
    defaultFloatingActions,
    'inline',
  ),
  'makeupFeedback',
  'inline dragging inward-left selects makeup feedback without leaving the screen',
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
  {translationX: -74, translationY: 0},
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
  {translationX: -100, translationY: 0},
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
