import type {MakeupArea} from '../../../shared/types/makeupGuide';
import type {MakeupLookPreview} from '../../../shared/types/profile';

export type SavePartMakeupArea = Exclude<MakeupArea, 'all'>;

export type MakeupFilterSaveSettings = {
  makeupLookName: string;
  savePartAreas: readonly SavePartMakeupArea[];
  saveSeparatedParts: boolean;
  saveTotalLook: boolean;
};

const MAKEUP_PART_AREA_LABELS: Record<SavePartMakeupArea, string> = {
  base: '베이스',
  eye: '아이',
  brow: '브로우',
  lip: '립',
  cheek: '치크',
  contour: '컨투어',
};

const MAKEUP_PART_AREA_ORDER: readonly SavePartMakeupArea[] = [
  'base',
  'eye',
  'brow',
  'cheek',
  'lip',
  'contour',
];

export function getDefaultMakeupFilterSaveSettings({
  defaultName,
  makeupAreas,
}: {
  defaultName: string;
  makeupAreas: readonly MakeupArea[];
}): MakeupFilterSaveSettings {
  return {
    makeupLookName: defaultName,
    savePartAreas: getMakeupFilterSavePartAreas(makeupAreas),
    saveSeparatedParts: false,
    saveTotalLook: true,
  };
}

export function getMakeupFilterSavePartAreas(
  makeupAreas: readonly MakeupArea[],
): readonly SavePartMakeupArea[] {
  const areaSet = new Set(makeupAreas);

  return MAKEUP_PART_AREA_ORDER.filter(area => areaSet.has(area));
}

export function getMakeupFilterSavePartAreaLabel(area: SavePartMakeupArea): string {
  return MAKEUP_PART_AREA_LABELS[area];
}

export function getMakeupFilterSaveScopeSummary(
  settings: MakeupFilterSaveSettings,
): string {
  const scopeLabels: string[] = [];

  if (settings.saveTotalLook) {
    scopeLabels.push('전체 룩 1개 저장');
  }

  if (settings.saveSeparatedParts && settings.savePartAreas.length > 0) {
    scopeLabels.push(`부위별 ${settings.savePartAreas.length}개 저장`);
  }

  return scopeLabels.length > 0
    ? scopeLabels.join(' + ')
    : '저장 범위를 선택해 주세요';
}

export function isMakeupFilterSaveEnabled(
  settings: MakeupFilterSaveSettings,
): boolean {
  const hasName = normalizeMakeupFilterSaveName(settings.makeupLookName).length > 0;
  const hasSelectedScope =
    settings.saveTotalLook ||
    (settings.saveSeparatedParts && settings.savePartAreas.length > 0);

  return hasName && hasSelectedScope;
}

export function buildMakeupFilterSavedLooks({
  baseSavedLook,
  settings,
  timestamp = Date.now(),
}: {
  baseSavedLook: MakeupLookPreview;
  settings: MakeupFilterSaveSettings;
  timestamp?: number;
}): readonly MakeupLookPreview[] {
  if (!isMakeupFilterSaveEnabled(settings)) {
    return [];
  }

  const title = normalizeMakeupFilterSaveName(settings.makeupLookName);
  const savedLookId = getSavedLookId(baseSavedLook, timestamp);
  const savedLooks: MakeupLookPreview[] = [];

  if (settings.saveTotalLook) {
    savedLooks.push({
      ...baseSavedLook,
      id: savedLookId,
      makeupArea: 'all',
      makeupPresetValues: {
        ...baseSavedLook.makeupPresetValues,
        makeupArea: 'all',
      },
      scope: 'totalMakeup',
      title,
    });
  }

  if (settings.saveSeparatedParts) {
    settings.savePartAreas.forEach(area => {
      savedLooks.push({
        ...baseSavedLook,
        id: `${savedLookId}-${area}`,
        makeupArea: area,
        makeupPresetValues: {
          ...baseSavedLook.makeupPresetValues,
          makeupArea: area,
        },
        scope: 'pointMakeup',
        shortDescription: `${baseSavedLook.shortDescription} ${getMakeupFilterSavePartAreaLabel(area)}만 따로 저장했어요.`,
        title: `${title} ${getMakeupFilterSavePartAreaLabel(area)}`,
      });
    });
  }

  return savedLooks;
}

export function normalizeMakeupFilterSaveName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function prependSavedMakeupLooks(
  currentSavedLooks: readonly MakeupLookPreview[],
  nextSavedLooks: readonly MakeupLookPreview[],
): readonly MakeupLookPreview[] {
  const nextSavedLookIds = new Set(nextSavedLooks.map(savedLook => savedLook.id));

  return [
    ...nextSavedLooks,
    ...currentSavedLooks.filter(savedLook => !nextSavedLookIds.has(savedLook.id)),
  ];
}

function getSavedLookId(baseSavedLook: MakeupLookPreview, timestamp: number): string {
  const sourceId =
    baseSavedLook.makeupPresetValues.sourceFilterId ??
    baseSavedLook.id.replace(/^saved-/, '');

  return `saved-${sourceId}-${timestamp}`;
}
