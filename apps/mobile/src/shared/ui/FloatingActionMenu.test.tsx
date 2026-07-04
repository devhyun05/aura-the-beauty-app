import {
  DEFAULT_FLOATING_ACTION_IDS,
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  FLOATING_ACTION_ACTIVE_SCALE,
  FLOATING_ACTION_BUTTON_SURFACE_BACKGROUND,
  FLOATING_ACTION_ICON_LIBRARY_NAMES,
  FLOATING_ACTION_IDLE_SCALE,
  FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET,
  FLOATING_ACTION_MAIN_ICON_SIZE,
  FLOATING_ACTION_MAIN_ICON_STROKE_WIDTH,
  FLOATING_ACTION_MAX_ITEM_COUNT,
  FLOATING_ACTION_SETTINGS_BACKGROUND,
  floatingActionInteractionModeOptions,
  getFloatingActionButtonScale,
  getFloatingActionMenuTarget,
  getFloatingActionReleaseOutcome,
  getFloatingActionSelectedSlotNumber,
  getFloatingActionSettingsSlotOffset,
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
const customOrderedFloatingActions: readonly FloatingActionId[] = [
  'makeupFeedback',
  'arFilter',
  'makeupExtraction',
];

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
  DEFAULT_FLOATING_ACTION_INTERACTION_MODE,
  'tap',
  'default floating action interaction mode',
);
expectEqual(
  floatingActionInteractionModeOptions.map(option => option.id).join(','),
  'tap,drag',
  'floating action interaction mode ids',
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
  FLOATING_ACTION_ICON_LIBRARY_NAMES.magazine,
  'Newspaper',
  'magazine icon library name',
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
expectEqual(FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET.x, -46, 'AR filter balanced x offset');
expectEqual(FLOATING_ACTION_INLINE_AR_FILTER_SLOT_OFFSET.y, -66, 'AR filter balanced y offset');
expectEqual(inlineTopSlot.x, -46, 'inline floating action AR slot x offset');
expectEqual(inlineTopSlot.y, -66, 'inline floating action AR slot y offset');
expectEqual(inlineLeftSlot.x, -78, 'inline floating action extraction slot x offset');
expectEqual(inlineLeftSlot.y, 0, 'inline floating action extraction slot y offset');
expectEqual(inlineRightSlot.x, 30, 'inline floating action feedback slot x offset stays inside screen');
expectEqual(inlineRightSlot.y, -66, 'inline floating action feedback slot y offset');
expectEqual(inlineArFilterSlot.x, -46, 'inline AR filter sits at 11 o clock');
expectEqual(inlineArFilterSlot.y, -66, 'inline AR filter moves closer to the star');
expectEqual(inlineMakeupExtractionSlot.x, -78, 'inline makeup extraction sits closer at 9 o clock');
expectEqual(inlineMakeupExtractionSlot.y, 0, 'inline makeup extraction aligns horizontally');
expectEqual(inlineMakeupFeedbackSlot.x, 30, 'inline makeup feedback sits closer at 1 o clock');
expectEqual(inlineMakeupFeedbackSlot.y, -66, 'inline makeup feedback moves closer to the star');
expectEqual(inlineSettingsSlot.x, 58, 'inline settings keeps a small gap from the star');
expectEqual(inlineSettingsSlot.y, 0, 'inline settings aligns horizontally');
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
    {translationX: 30, translationY: -66},
    defaultFloatingActions,
    'inline',
  ),
  'makeupFeedback',
  'inline dragging upper-right selects makeup feedback without leaving the screen',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -46, translationY: -66},
    customOrderedFloatingActions,
    'inline',
  ),
  'makeupFeedback',
  'inline slot 1 uses the first selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: -78, translationY: 0},
    customOrderedFloatingActions,
    'inline',
  ),
  'arFilter',
  'inline slot 2 uses the second selected action',
);
expectEqual(
  getFloatingActionMenuTarget(
    {translationX: 30, translationY: -66},
    customOrderedFloatingActions,
    'inline',
  ),
  'makeupExtraction',
  'inline slot 3 uses the third selected action',
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
    false,
    'inline',
  ).kind,
  'open',
  'short release from collapsed menu keeps fallback menu open',
);
expectEqual(
  getFloatingActionReleaseOutcome(
    {translationX: 8, translationY: -12},
    defaultFloatingActions,
    true,
    'inline',
  ).kind,
  'close',
  'short release from expanded menu closes fallback menu',
);
const inlineFeedbackRelease = getFloatingActionReleaseOutcome(
  {translationX: 30, translationY: -66},
  defaultFloatingActions,
  false,
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
  {translationX: 50, translationY: -100},
  defaultFloatingActions,
  false,
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
    false,
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
