import {getRecommendedMakeupFilterById, mapMakeupFilterToSavedLook} from '../../../shared/services/makeupGuideService';
import {
  buildMakeupFilterSavedLooks,
  getDefaultMakeupFilterSaveSettings,
  getMakeupFilterSavePartAreas,
  getMakeupFilterSaveScopeSummary,
  isMakeupFilterSaveEnabled,
  prependSavedMakeupLooks,
} from './makeupFilterSaveModel';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const cleanSmokyFilter = getRecommendedMakeupFilterById('filter-clean-smoky-city');
const defaultSettings = getDefaultMakeupFilterSaveSettings({
  defaultName: cleanSmokyFilter.displayTitle,
  makeupAreas: cleanSmokyFilter.makeupAreas,
});
const baseSavedLook = mapMakeupFilterToSavedLook(cleanSmokyFilter, 123);
const savedLooks = buildMakeupFilterSavedLooks({
  baseSavedLook,
  settings: {
    ...defaultSettings,
    makeupLookName: '출근 스모키',
    saveSeparatedParts: true,
    saveTotalLook: true,
  },
  timestamp: 456,
});
const mergedSavedLooks = prependSavedMakeupLooks([savedLooks[1]], savedLooks);

expectEqual(defaultSettings.makeupLookName, '클린 스모키', 'default save name');
expectEqual(defaultSettings.saveSeparatedParts, false, 'default separated save unchecked');
expectEqual(defaultSettings.saveTotalLook, true, 'default total look checked');
expectEqual(
  getMakeupFilterSavePartAreas(['all', 'eye', 'lip']).join(','),
  'eye,lip',
  'save part areas exclude all',
);
expectEqual(
  getMakeupFilterSaveScopeSummary(defaultSettings),
  '전체 룩 1개 저장',
  'default save scope summary',
);
expectEqual(
  isMakeupFilterSaveEnabled(defaultSettings),
  true,
  'save enabled with name and total scope',
);
expectEqual(
  isMakeupFilterSaveEnabled({
    ...defaultSettings,
    makeupLookName: '   ',
  }),
  false,
  'save disabled without a name',
);
expectEqual(
  isMakeupFilterSaveEnabled({
    ...defaultSettings,
    saveSeparatedParts: false,
    saveTotalLook: false,
  }),
  false,
  'save disabled without a selected scope',
);
expectEqual(
  savedLooks.length,
  cleanSmokyFilter.makeupAreas.length + 1,
  'total and separated part saved look count',
);
expectEqual(savedLooks[0].id, 'saved-filter-clean-smoky-city-456', 'total saved look id');
expectEqual(savedLooks[0].title, '출근 스모키', 'total saved look custom title');
expectEqual(savedLooks[0].scope, 'totalMakeup', 'total saved look scope');
expectEqual(savedLooks[1].id, 'saved-filter-clean-smoky-city-456-eye', 'part saved look id');
expectEqual(savedLooks[1].title, '출근 스모키 아이', 'part saved look title');
expectEqual(savedLooks[1].scope, 'pointMakeup', 'part saved look scope');
expectEqual(savedLooks[1].makeupArea, 'eye', 'part saved look makeup area');
expectEqual(
  savedLooks[1].makeupPresetValues.makeupArea,
  'eye',
  'part saved look preset makeup area',
);
expectEqual(
  mergedSavedLooks.length,
  savedLooks.length,
  'merged saved looks remove duplicate ids',
);
expectEqual(
  mergedSavedLooks[0].id,
  'saved-filter-clean-smoky-city-456',
  'merged saved looks keep new items first',
);
