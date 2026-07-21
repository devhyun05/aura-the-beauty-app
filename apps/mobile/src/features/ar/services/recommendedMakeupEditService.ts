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
  eyeshadow: 1,
  eyeliner: 2,
  lens: 0,
};

// AR 레시피 부위 → 분석 makeupColors 키. foundation/lens는 색 개인화 대상 아님(null).
// 분석 makeupColors엔 eyeshadow 키가 없어 eye 색은 eyeliner 키가 대표한다.
const ANALYSIS_COLOR_KEY_BY_REGION: Record<
  MakeupRecipeRegion,
  FaceAnalysisMakeupColorRegion | null
> = {
  foundation: null,
  lip: 'lip',
  blush: 'blush',
  brow: 'brow',
  eyeshadow: 'eyeliner',
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

// ---- 추천 룩(areaGuides) → 편집 상태 직접 빌드 ------------------------------
// arFilterId 프리셋을 거치지 않고 LLM이 이 룩을 위해 고른 부위·색·질감을 그대로
// AR 레시피로 번역한다. 프리셋 경로(createRecommendedMakeupEditState)는
// areaGuides가 없는 구버전 리포트의 폴백으로 유지된다.

// ar 서비스가 추천 feature 타입에 의존하지 않도록 구조적 최소 입력만 요구한다.
// MakeupLookRecommendation이 그대로 대입 가능하다.
export type RecommendedLookAreaGuideInput = {
  area: string;
  arSupported?: boolean;
  color?: {name?: string; hex?: string};
  texture?: string;
};

export type RecommendedLookInput = {
  role?: string;
  areaGuides?: readonly RecommendedLookAreaGuideInput[];
};

// 룩 가이드 area → 레시피 부위. eye는 진짜 아이섀도 밴드가 대표하고,
// 아이라이너는 눈매 정의용으로 함께 켠다(색은 딥 기본색 유지 — 가이드의 밝은
// 눈 색을 라이너에 그대로 쓰면 눈매가 흐려진다).
const LOOK_AREA_TO_REGIONS: Record<string, readonly MakeupRecipeRegion[]> = {
  base: ['foundation'],
  lip: ['lip'],
  cheek: ['blush'],
  brow: ['brow'],
  eye: ['eyeshadow', 'eyeliner'],
};

// 가이드 색을 직접 받는 부위(eye 가이드 색은 eyeshadow만).
const GUIDE_COLOR_REGIONS: ReadonlySet<MakeupRecipeRegion> = new Set([
  'lip',
  'blush',
  'brow',
  'eyeshadow',
]);

const GLOSSY_TEXTURE_PATTERN =
  /글로시|글로스|윤광|물광|촉촉|글로우|듀이|시럽|광택|gloss|glow|dewy|glass|balmy|syrup/i;
const MATTE_TEXTURE_PATTERN =
  /매트|벨벳|파우더|보송|블러|무광|matte|velvet|powder|blur/i;
const SHIMMER_TEXTURE_PATTERN =
  /시머|펄|글리터|반짝|스파클|shimmer|pearl|glitter|sparkle/i;
const DEFINED_TEXTURE_PATTERN = /또렷|선명|샤프|defined|sharp|clear|liner/i;
const HAIR_TEXTURE_PATTERN = /결|hair|lash/i;
const CREAM_TEXTURE_PATTERN = /크림|밤|cream|balmy/i;

// 룩 role → 데코 부위 공통 강도. 프리셋 intensity 대신 룩의 성격을 쓴다.
const LOOK_ROLE_INTENSITY: Record<string, number> = {
  anchor: 0.55,
  bold: 0.75,
  discovery: 0.65,
};

const LOOK_DEFAULT_INTENSITY = 0.6;
// 파운데이션은 스킨 세이프: 색은 기본 쉐이드 유지, 강도도 낮게 고정.
const LOOK_FOUNDATION_INTENSITY = 0.45;

// 가이드 texture 문자열 → 부위별 finish 옵션 id (REGION_FINISH_OPTIONS 키).
// 확실한 키워드가 없으면 부위 기본 마감으로 폴백하는 휴리스틱이다.
export function resolveLookFinishId(
  region: MakeupRecipeRegion,
  textureText: string,
): string {
  const glossy = GLOSSY_TEXTURE_PATTERN.test(textureText);
  const matte = MATTE_TEXTURE_PATTERN.test(textureText);
  const shimmer = SHIMMER_TEXTURE_PATTERN.test(textureText);

  if (region === 'foundation') {
    return matte ? 'matte' : glossy ? 'glow' : 'natural';
  }

  if (region === 'lip') {
    return glossy ? 'gloss' : matte ? 'natural' : 'cream';
  }

  if (region === 'blush') {
    return glossy || shimmer
      ? 'glow'
      : CREAM_TEXTURE_PATTERN.test(textureText)
        ? 'cream'
        : 'soft';
  }

  if (region === 'brow') {
    return DEFINED_TEXTURE_PATTERN.test(textureText)
      ? 'clear'
      : HAIR_TEXTURE_PATTERN.test(textureText)
        ? 'hair'
        : 'powder';
  }

  if (region === 'eyeshadow') {
    return shimmer ? 'shimmer' : matte ? 'matte' : glossy ? 'gloss' : 'satin';
  }

  if (region === 'eyeliner') {
    return glossy || shimmer
      ? 'sheer'
      : DEFINED_TEXTURE_PATTERN.test(textureText)
        ? 'clear'
        : 'soft';
  }

  return REGION_FINISH_OPTIONS[region][0].id;
}

function resolveLookIntensity(role: string | undefined): number {
  return LOOK_ROLE_INTENSITY[role ?? ''] ?? LOOK_DEFAULT_INTENSITY;
}

/**
 * 추천 룩의 areaGuides를 풀페이스 편집 상태로 직접 번역한다.
 * 부위 활성·색·질감·강도가 모두 이 룩에서 나오며, 쓸 수 있는 가이드가 하나도
 * 없으면 null(호출부가 arFilterId 프리셋 경로로 폴백).
 */
export function createLookMakeupEditState(
  look: RecommendedLookInput,
  // 분석 makeupColors — 가이드에 hex가 없는 부위의 폴백 색(퍼스널 컬러 근거).
  makeupColors?: FaceAnalysisMakeupColors,
): FullFaceMakeupEditState | null {
  const guides = (look.areaGuides ?? []).filter(
    guide => guide.arSupported !== false && LOOK_AREA_TO_REGIONS[guide.area],
  );

  if (guides.length === 0) {
    return null;
  }

  const initialState = getInitialFullFaceMakeupEditState();
  const intensity = resolveLookIntensity(look.role);
  const guideByRegion = new Map<MakeupRecipeRegion, RecommendedLookAreaGuideInput>();

  guides.forEach(guide => {
    LOOK_AREA_TO_REGIONS[guide.area].forEach(region => {
      if (!guideByRegion.has(region)) {
        guideByRegion.set(region, guide);
      }
    });
  });

  const controls = MAKEUP_RECIPE_REGIONS.reduce<FullFaceRegionControls>(
    (nextControls, region) => {
      const initialControl = initialState.controls[region];
      const guide = guideByRegion.get(region);

      if (!guide) {
        // 가이드에 없는 부위는 끈다 — 룩이 지정한 부위만 렌더.
        nextControls[region] = {...initialControl, enabled: false};
        return nextControls;
      }

      const guideHex = guide.color?.hex?.trim();
      const guideColor =
        GUIDE_COLOR_REGIONS.has(region) && guideHex && HEX_COLOR_PATTERN.test(guideHex)
          ? guideHex
          : undefined;
      const analysisColor = resolveAnalysisColorHex(region, makeupColors);
      const colorHex = guideColor ?? analysisColor ?? initialControl.colorHex;

      nextControls[region] = applyRecommendedFinish(
        {
          ...initialControl,
          colorHex: region === 'foundation' ? initialControl.colorHex : colorHex,
          enabled: true,
          intensity:
            region === 'foundation' ? LOOK_FOUNDATION_INTENSITY : intensity,
          params: {...initialControl.params},
        },
        region,
        resolveLookFinishId(region, guide.texture ?? ''),
      );
      return nextControls;
    },
    {} as FullFaceRegionControls,
  );

  const activeRegions = MAKEUP_RECIPE_REGIONS.filter(
    region => controls[region].enabled,
  );

  return {
    controls,
    selectedRegion: activeRegions.includes('lip') ? 'lip' : activeRegions[0],
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
