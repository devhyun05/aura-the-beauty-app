import {
  MAKEUP_RECIPE_REGIONS,
  REGION_FINISH_OPTIONS,
  getMakeupRecipeRegionsForArea,
  type FullFaceRegionControl,
  type FullFaceRegionControls,
  type MakeupRecipeRegion,
} from '../../../shared/contracts/fullFaceMakeupRecipe';
import type {RecommendedMakeupFilter} from '../../../shared/types/makeupGuide';
import type {
  FaceAnalysisMakeupColorRegion,
  FaceAnalysisMakeupColors,
} from '../../../shared/types/faceAnalysis';
import {
  createFullFaceMakeupRecipeFromEditState,
  createFullFaceMakeupSavedContract,
  getInitialFullFaceMakeupEditState,
  type FullFaceMakeupEditState,
  type FullFaceMakeupSavedContract,
} from './fullFaceMakeupEditService';

const DECORATIVE_COLOR_INDEX_BY_REGION: Record<MakeupRecipeRegion, number> = {
  foundation: 0,
  lip: 0,
  blush: 1,
  brow: 2,
  eyeliner: 2,
  lens: 0,
};

// AR 레시피 부위 → 분석 makeupColors 키. foundation/lens는 색 개인화 대상 아님(null).
// 레시피엔 eyeshadow 부위가 없어 eye 색은 eyeliner 부위가 대표한다.
const ANALYSIS_COLOR_KEY_BY_REGION: Record<
  MakeupRecipeRegion,
  FaceAnalysisMakeupColorRegion | null
> = {
  foundation: null,
  lip: 'lip',
  blush: 'blush',
  brow: 'brow',
  eyeliner: 'eyeliner',
  lens: null,
};

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// 분석 색 오버라이드 — 유효한 hex만 채택. 없거나 형식 이상이면 undefined(프리셋 폴백).
function resolveAnalysisColorHex(
  region: MakeupRecipeRegion,
  makeupColors: FaceAnalysisMakeupColors | undefined,
): string | undefined {
  const key = ANALYSIS_COLOR_KEY_BY_REGION[region];
  if (!key || !makeupColors) {
    return undefined;
  }
  const hex = makeupColors[key];
  return hex && HEX_COLOR_PATTERN.test(hex) ? hex : undefined;
}

function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.6;
  }

  return Math.min(Math.max(value, 0), 1);
}

function getActiveRegions(
  filter: RecommendedMakeupFilter,
): readonly MakeupRecipeRegion[] {
  const filterRegions = filter.makeupAreas
    .flatMap(area => getMakeupRecipeRegionsForArea(area))
    .filter(region => region !== 'lens');
  const presetRegions = getMakeupRecipeRegionsForArea(
    filter.presetValues.makeupArea,
  ).filter(region => region !== 'lens');
  const resolvedRegions = filterRegions.length > 0 ? filterRegions : presetRegions;
  const uniqueRegions = [...new Set(resolvedRegions)];

  return uniqueRegions.length > 0 ? uniqueRegions : ['lip'];
}

function getRegionColorHex(
  filter: RecommendedMakeupFilter,
  region: MakeupRecipeRegion,
  fallbackColorHex: string,
  makeupColors?: FaceAnalysisMakeupColors,
): string {
  if (region === 'foundation') {
    return fallbackColorHex;
  }

  // 분석(퍼스널 컬러 근거) 색이 있으면 프리셋보다 우선. 없으면 프리셋 팔레트.
  const analysisHex = resolveAnalysisColorHex(region, makeupColors);
  if (analysisHex) {
    return analysisHex;
  }

  const colorIndex = Math.min(
    DECORATIVE_COLOR_INDEX_BY_REGION[region],
    Math.max(filter.colorOptions.length - 1, 0),
  );

  return filter.colorOptions[colorIndex]?.hex ?? fallbackColorHex;
}

function getRecommendedFinishId(
  filter: RecommendedMakeupFilter,
  region: MakeupRecipeRegion,
): string {
  const finishHint = [
    filter.presetValues.finish,
    filter.presetValues.textureId,
    filter.presetValues.typeId,
  ]
    .join(' ')
    .toLowerCase();
  const isGlow = /glow|gloss|glass|dewy|pearl|shimmer|syrup|balmy/.test(
    finishHint,
  );
  const isMatte = /matte|velvet|blur|powder/.test(finishHint);
  const isDefined = /defined|sharp|clear|liner/.test(finishHint);

  if (region === 'foundation') {
    return isMatte ? 'matte' : isGlow ? 'glow' : 'natural';
  }

  if (region === 'lip') {
    return isGlow ? 'gloss' : isMatte ? 'cream' : 'natural';
  }

  if (region === 'blush') {
    return isGlow ? 'glow' : /cream|balmy/.test(finishHint) ? 'cream' : 'soft';
  }

  if (region === 'brow') {
    return isDefined ? 'clear' : /hair|lash/.test(finishHint) ? 'hair' : 'powder';
  }

  if (region === 'eyeliner') {
    return isGlow ? 'sheer' : isDefined ? 'clear' : 'soft';
  }

  return 'natural';
}

function applyRecommendedFinish(
  control: FullFaceRegionControl,
  region: MakeupRecipeRegion,
  finishId: string,
): FullFaceRegionControl {
  const finishOption =
    REGION_FINISH_OPTIONS[region].find(option => option.id === finishId) ??
    REGION_FINISH_OPTIONS[region][0];

  return {
    ...control,
    finish: finishOption.finish,
    glossBoost: finishOption.glossBoost,
    roughness: finishOption.roughness,
    shimmer: finishOption.shimmer,
    specular: finishOption.specular,
    specularPower: finishOption.specularPower,
    textureAmount: finishOption.textureAmount,
  };
}

/**
 * Converts a curated recommendation preset into the same editable recipe-v2
 * state used by the Unity full-face editor. This keeps the recommendation's
 * regions, palette, intensity and texture intent while leaving skin tone safe.
 */
export function createRecommendedMakeupEditState(
  filter: RecommendedMakeupFilter,
  // 분석이 낸 부위별 hex(퍼스널 컬러 근거). 있으면 데코 부위 색을 이걸로 개인화하고,
  // 없거나 형식 이상인 부위는 프리셋 색을 그대로 쓴다(색만 바뀌고 모양·질감은 불변).
  makeupColors?: FaceAnalysisMakeupColors,
): FullFaceMakeupEditState {
  const initialState = getInitialFullFaceMakeupEditState();
  const activeRegions = getActiveRegions(filter);
  const activeRegionSet = new Set(activeRegions);
  const intensity = clampIntensity(filter.presetValues.intensity);
  const controls = MAKEUP_RECIPE_REGIONS.reduce<FullFaceRegionControls>(
    (nextControls, region) => {
      const initialControl = initialState.controls[region];
      const isActive = activeRegionSet.has(region);
      const adjustedControl = applyRecommendedFinish(
        {
          ...initialControl,
          colorHex: isActive
            ? getRegionColorHex(filter, region, initialControl.colorHex, makeupColors)
            : initialControl.colorHex,
          enabled: isActive,
          intensity: isActive ? intensity : initialControl.intensity,
          params: {...initialControl.params},
        },
        region,
        getRecommendedFinishId(filter, region),
      );

      nextControls[region] = adjustedControl;
      return nextControls;
    },
    {} as FullFaceRegionControls,
  );

  return {
    controls,
    selectedRegion: activeRegionSet.has('lip') ? 'lip' : activeRegions[0],
  };
}

export function createRecommendedMakeupSavedContract(
  filter: RecommendedMakeupFilter,
  savedAtMs = Date.now(),
): FullFaceMakeupSavedContract {
  const editState = createRecommendedMakeupEditState(filter);
  const recipe = createFullFaceMakeupRecipeFromEditState(editState, savedAtMs);

  return createFullFaceMakeupSavedContract({
    editState,
    recipe,
    savedAtMs,
    source: 'preset',
  });
}
