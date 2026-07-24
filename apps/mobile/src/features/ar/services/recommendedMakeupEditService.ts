import {
  MAKEUP_RECIPE_REGIONS,
  REGION_FINISH_OPTIONS,
  getMakeupRecipeRegionsForArea,
  type FullFaceRegionControl,
  type FullFaceRegionControls,
  type MakeupRecipeRegion,
} from '../../../shared/contracts/fullFaceMakeupRecipe';
import {
  AR_BLUSH_DEFAULT_SHAPE,
  AR_BLUSH_SHAPES,
} from '../../../shared/contracts/arBlushCatalog';
// 눈썹룩 계약의 정본 — 부위 룩(sys:var:brow:*)이 이 표를 그대로 승격한다.
import {
  BROW_REFERENCE_SHAPES,
  REFERENCE_BROW_INTENSITY,
} from '../stencil/src/composer/browTree';
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
  type RecommendedLookLanes,
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
// MakeupLookRecommendation이 그대로 대입 가능하다. applicationPlan/steps 등은
// 세부 레인(립글로스·아래 섀도·애교살·라이너 색) 파생에만 쓰는 선택 입력.
export type RecommendedLookAreaGuideInput = {
  area: string;
  arSupported?: boolean;
  color?: {name?: string; hex?: string};
  texture?: string;
  goal?: string;
  placement?: string;
  technique?: string;
  steps?: readonly {instruction?: string}[];
  applicationPlan?: {
    steps?: readonly {
      title?: string;
      productType?: string;
      placement?: string;
      technique?: string;
      colors?: readonly {role?: string; hex?: string}[];
    }[];
  };
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
// 세부 레인 파생 신호 — applicationPlan color role(백엔드 결정 플랜이 '광택'=글로스,
// '깊이'=아래 눈꼬리 음영, '라인'=아이라이너 역할 색을 항상 싣는다).
// (애교살은 텍스트 신호 없이 항상 동반하므로 관련 패턴은 두지 않는다.)
const GLOSS_COLOR_ROLE_PATTERN = /광택|글로스|글로시|윤광|gloss|glow/i;
const DEPTH_COLOR_ROLE_PATTERN = /깊이|음영|셰딩|depth|shade/i;
const LINER_COLOR_ROLE_PATTERN = /라인|라이너|line|liner/i;
// 눈 플랜 '베이스' role — 위 섀도 다층의 베이스 워시 색(결정 플랜 어휘:
// 베이스→전이→깊이→라인→포인트. '바탕'은 브로우/립 어휘라 매칭하지 않는다).
const EYE_BASE_COLOR_ROLE_PATTERN = /베이스|base/i;
// 립 플랜 '안쪽 포인트' role — 그라데 립의 안쪽 딥 색(치크의 '광 포인트'와
// 충돌하지 않게 '안쪽'만 매칭).
const LIP_INNER_COLOR_ROLE_PATTERN = /안쪽|inner/i;
// WCAG 상대휘도 상한 — 딥 기본색 '#2F2730'≈0.02는 통과, 밝은 섀도 대표색
// '#E08A6B'≈0.35는 차단(라이너가 밝은 색으로 그려지면 눈매 대비가 사라진다).
const LINER_MAX_LUMINANCE = 0.25;
// 눈썹 셰이더(Brow·BrowStyle 공통)는 선택색을 직채색(알파 합성)하므로 밝은 hex =
// 흰 눈썹이다 — 레퍼런스 알파 경로에서도 마스크는 모양만 담당하고 색은 그대로
// 곱해지니 게이트가 필요하다. 상한 0.65: 탈색 의도 블론드 베이지(#E8C9A0≈0.615)는
// 통과, 샴페인(#F5E7DA≈0.816)·아이보리류는 차단하고 팔레트 최밝 라이트 브라운으로
// 스냅한다. (browLightener 축은 잎을 2장으로 만들어 눈썹룩 무정규화 통과 조건을
// 깨므로 쓰지 않는다.)
const BROW_MAX_LUMINANCE = 0.65;
const BROW_LIGHT_SNAP_HEX = '#8A6B52'; // BROW_COLOR_OPTIONS '라이트 브라운'(휘도≈0.17)

// 섀도 카탈로그 마스크 페어 — 위/아래는 별개 슬롯이고, 생성기 규칙(같은 접미사)과
// lookVariants 실사용 페어(eye_base↔under_wash, eye_outer↔under_outer 등)를 따른다.
// 아래 마스크가 중요한 이유: 마스크 없이 profile 6이면 번들 스모키 마스크가 쓰이는데
// 눈머리쪽 30%가 비어 있는 바깥 꼬리 반달이라 언더가 거의 안 보인다.
const SHADOW_MASK_PAIRS = {
  smoky: {upper: 'eye_full_smoky', lower: 'under_full_smoky'},
  outer: {upper: 'eye_outer_wide', lower: 'under_outer'},
  gradient: {upper: 'eye_full_gradient', lower: 'under_full_gradient'},
  base: {upper: 'eye_base', lower: 'under_wash'},
} as const;

// 애교살 — 항상 동반한다(룩이 언급하지 않아도 눈밑 생기는 기본 마감).
// 값 근거(셰이더 알파 실측): 매트(1)는 밝은 픽셀에서 색소를 깎아 밝은 피부에선
// 하이라이트가 오히려 어두워지므로 새틴(0)을 쓴다(0=최대 발색).
// 강도 0.45: 기존 0.2는 피크 알파 0.11로 카메라 노이즈 수준이었고, 0.55는
// 스크린 블렌드 특성상 어두운 피부에서 ΔL +49/255까지 튀어 흰 패치로 읽히며
// 골(눈물고랑) 음영도 밝은 피부에서 다크서클 대역(−15)에 진입했다. 0.45는
// 가시성(피크 알파 0.25 ≈ 기존의 2.2배)과 톤 안전 사이의 값이다.
// aegyoShimmer·aegyoHeight·aegyoShape는 셰이더가 참조하지 않는 죽은 축이라 싣지 않는다.
const AEGYO_DEFAULT = {
  colorHex: '#F7E7CE',
  intensity: 0.45,
  finish: 0,
} as const;
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

/** WCAG 상대휘도(0..1) — #RRGGBB 전제(호출부가 HEX_COLOR_PATTERN 검증). */
export function getHexRelativeLuminance(hex: string): number {
  const channel = (index: number) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

// 플랜 '라인'/분석 라이너 색이 라이너로 쓸 만큼 딥한지 판정.
function isDeepLinerHex(hex: string): boolean {
  return getHexRelativeLuminance(hex) <= LINER_MAX_LUMINANCE;
}

// applicationPlan 스텝 색 중 role이 패턴에 맞는 첫 유효 hex와, 그 스텝의
// 서술 텍스트(존/모양 신호 스코프 — 다른 스텝의 '전체'/'아랫입술' 언급 오염 방지).
function findPlanColorStep(
  guide: RecommendedLookAreaGuideInput,
  rolePattern: RegExp,
): {hex: string; stepText: string} | undefined {
  for (const step of guide.applicationPlan?.steps ?? []) {
    for (const color of step.colors ?? []) {
      const hex = color.hex?.trim();
      if (
        color.role &&
        rolePattern.test(color.role) &&
        hex &&
        HEX_COLOR_PATTERN.test(hex)
      ) {
        return {
          hex,
          stepText: [step.title, step.placement, step.technique]
            .filter(Boolean)
            .join(' '),
        };
      }
    }
  }
  return undefined;
}

function findPlanColorHex(
  guide: RecommendedLookAreaGuideInput,
  rolePattern: RegExp,
): string | undefined {
  return findPlanColorStep(guide, rolePattern)?.hex;
}

// 립글로스 존 — 결정 플랜 표준은 '아랫입술 중앙 + 윗입술 산'(=중앙 도트)이라
// 무신호 기본을 1로 둔다. 0(전체)은 명시적 '전체'류 신호에서만.
// 순서 주의: '아랫입술 전체에'는 아랫입술 존(2)이지 풀립(0)이 아니다 —
// 아랫입술 판정이 '전체' 판정보다 먼저.
function resolveLipGlossShape(scopedText: string): number {
  if (/아랫\s*입술/.test(scopedText) && !/윗\s*입술/.test(scopedText)) {
    return 2; // 아랫입술만(시럽광)
  }
  if (/전체|입술\s*전부|풀\s*글로스/i.test(scopedText)) {
    return 0;
  }
  return 1; // 중앙 도트
}

// 블러셔 모양 — 위치·방향 자연어 → AR_BLUSH_SHAPES value. 결정 플랜의
// '볼 중앙→관자 가로 연장'과 AREA_DEFAULTS는 데일리(3)로 수렴한다.
function resolveBlushShapeValue(text: string): number {
  if (/언더\s*아이|눈\s*밑|눈\s*아래/.test(text)) {
    return 5; // 언더아이
  }
  if (/선키스|콧등|코\s*끝|주근깨|탠/.test(text)) {
    // '이어지-'(연결 의미)만 — 접속어 '이어서'는 밴드 신호가 아니다.
    return /밴드|한\s*줄|이어지/.test(text) ? 7 : 6; // 선키스드 밴드/소프트
  }
  // '올린/올려/올리듯'만 — '올리'는 '올리브(색)'에 오발화한다.
  if (/드레이핑|사선|쓸어\s*올|올려|올린|올리듯|위쪽으로|리프팅/.test(text)) {
    return 2; // 드레이핑
  }
  if (/둥글|동그|애플/.test(text)) {
    return 4; // 러블리
  }
  return 3; // 데일리
}

// 섀도 카탈로그 마스크 페어 — 눈매 서술의 실루엣 신호로 고른다. 위 마스크는
// 절차 프로파일에 곱해지는 게이트라 profile 0 밴드와 짝이어야 하고, 아래 마스크는
// profile 6(마스크 모드) 밴드의 실루엣 정본이다.
function resolveShadowMaskPair(
  text: string,
): NonNullable<RecommendedLookLanes['shadowMask']> {
  if (/스모키|깊은\s*음영|딥|다크|짙/.test(text)) {
    return {...SHADOW_MASK_PAIRS.smoky};
  }
  if (/눈꼬리|아웃터|바깥|외곽|V존|캣|고양이/.test(text)) {
    return {...SHADOW_MASK_PAIRS.outer};
  }
  if (/그라데|그러데이션|번지|블렌딩|자연스럽게\s*풀/.test(text)) {
    return {...SHADOW_MASK_PAIRS.gradient};
  }
  return {...SHADOW_MASK_PAIRS.base};
}

// 눈썹 모양 — 레퍼런스 알파 에셋(BROW_REFERENCE_SHAPES)이 실루엣을 소유한다.
// 모양 신호는 '(모양어) + 눈썹/브로우'처럼 눈썹을 직접 수식할 때만 인정한다.
// goal은 자유 서술이라 얼굴형('둥근 얼굴형')·눈매('올라간 눈매') 어휘가 섞이고,
// goal이 비면 매퍼가 룩 제목으로 합성하기까지 한다('볼드 레드 글램의 분위기를
// 브로우에…') — 인접 조건이 없으면 그 한 단어가 실루엣을 통째로 뒤집는다.
// 부정문("과한 아치 없이", "아치를 낮춰")도 인접 조건에서 자연히 걸러진다.
const BROW_NOUN = '(?:눈썹|브로우|브라우)';
const BROW_SHAPE_SUFFIX = '(?:형|한|하게|하고|적인|스러운|진|의|로운)?';
const browShapeCue = (text: string, words: string): boolean =>
  new RegExp(`(?:${words})${BROW_SHAPE_SUFFIX}\\s*${BROW_NOUN}`).test(text);

// 부정 꼬리 가드 — '두껍지 않게'·'짙지 않게'처럼 뒤에 부정이 붙으면 신호가 아니다.
const NEGATION_TAIL = /않|없|말고|아닌|대신|줄여|낮춰|피해/;
const cueHit = (text: string, pattern: RegExp): boolean => {
  const match = pattern.exec(text);
  if (!match) return false;
  const tailStart = match.index + match[0].length;
  return !NEGATION_TAIL.test(text.slice(tailStart, tailStart + 8));
};

// 순서 주의: '세미아치'가 '아치'를 포함하므로 먼저 판정한다. 무신호 기본은
// 소프트 일자 — 백엔드 표준 문구('자연스러운 눈썹', '본래 눈썹 결을 따라')의
// 직역이자 내추럴 프리셋과 같은 값이다.
function resolveBrowShape(
  shapeText: string,
): (typeof BROW_REFERENCE_SHAPES)[number] {
  const pick = (value: number) =>
    BROW_REFERENCE_SHAPES.find(candidate => candidate.value === value) ??
    BROW_REFERENCE_SHAPES[1];
  if (browShapeCue(shapeText, '둥근|라운드|동그')) return pick(4);
  if (browShapeCue(shapeText, '세미\\s*아치|살짝\\s*아치')) return pick(2);
  if (browShapeCue(shapeText, '아치|각진|올라간')) return pick(3);
  if (browShapeCue(shapeText, '일자|직선|스트레이트')) {
    return pick(/소프트|부드/.test(shapeText) ? 1 : 0);
  }
  return pick(1);
}

// 눈썹룩 계약으로 번역 — 모양은 알파 에셋, 두께는 두께 축, 정의감은 강도.
// 두께·정의감은 texture(제형 서술)에서만 읽는다: goal은 얼굴형·눈매·룩 제목이
// 섞여 들어와 '볼드 레드 글램'이 눈썹을 두껍게 만드는 식으로 오독된다.
function resolveBrowLane(
  shapeText: string,
  textureText: string,
): NonNullable<RecommendedLookLanes['brow']> {
  const shape = resolveBrowShape(shapeText);
  const bold = cueHit(textureText, /두꺼|두툼|볼드|도톰|굵/);
  const fluffy = !bold && cueHit(textureText, /풍성/);
  const slim = !bold && !fluffy && cueHit(textureText, /얇|슬림|가늘/);
  const defined = cueHit(textureText, /또렷|선명|짙|진한|진하/);

  return {
    shape: shape.value,
    styleTemplate: shape.template,
    // 눈썹룩 기준선 0.62(프리셋 6종 실효 밴드 중앙). 정의감 신호는 글램·스모키
    // 값 0.72로 올려, 절차 3겹(결+파우더+펜슬)에서 1겹으로 줄며 옅어지는 것을 상쇄.
    styleIntensity: defined ? 0.72 : REFERENCE_BROW_INTENSITY,
    thicknessProfile: bold || fluffy ? 3 : 2,
    thickness: bold ? 1.15 : fluffy ? 1.1 : slim ? 0.9 : 1,
    // 눈썹룩·프리셋 기준선 0.08(BARE 0과 달라 명시 필요).
    arch: 0.08,
  };
}

// 가이드가 부위를 서술하는 모든 텍스트(질감·목표·위치·기법·스텝·플랜 제목/위치/기법).
function collectGuideText(guide: RecommendedLookAreaGuideInput): string {
  const planSteps = guide.applicationPlan?.steps ?? [];
  return [
    guide.texture,
    guide.goal,
    guide.placement,
    guide.technique,
    ...(guide.steps ?? []).map(step => step.instruction),
    ...planSteps.flatMap(step => [step.title, step.placement, step.technique]),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * areaGuides에서 controls(7부위) 밖의 세부 레인을 파생한다 — 립글로스·아래 섀도·
 * 애교살·라이너 딥 색. 스텐실 번역(createRecommendedStencilLook) 전용이며 레시피
 * 와이어에는 실리지 않는다. 색은 지어내지 않는다: 플랜 role 색·가이드 색·검증된
 * 프리셋 상수(내추럴 애교살, 클리어 글로스)만 쓴다.
 */
export function deriveRecommendedLookLanes(
  guides: readonly RecommendedLookAreaGuideInput[],
): RecommendedLookLanes | undefined {
  const lanes: RecommendedLookLanes = {};
  const lipGuide = guides.find(guide => guide.area === 'lip');
  const eyeGuide = guides.find(guide => guide.area === 'eye');
  const cheekGuide = guides.find(guide => guide.area === 'cheek');
  const browGuide = guides.find(guide => guide.area === 'brow');

  if (lipGuide) {
    // 발화 여부는 번역층의 립 finish('gloss') 게이트가 결정 — 여기선 색·존만 준비.
    // '#FFFFFF' = 클리어 글로스(glam2 검증값). 빈 색 전송은 Unity SetColor 스킵으로
    // 직전 룩 틴트가 잔존하므로 항상 유효 hex를 싣는다. 존 신호는 글로스('광택')
    // 스텝 텍스트로 스코프를 좁힌다 — 립 전체 텍스트엔 베이스 스텝의 '입술 전체'가
    // 항상 섞여 있어 오염된다.
    const glossStep = findPlanColorStep(lipGuide, GLOSS_COLOR_ROLE_PATTERN);
    // 무플랜 폴백은 texture만 — placement는 베이스 립 도포 서술('입술 전체에…')
    // 이라 '전체'가 글로스 존 신호로 오독된다.
    lanes.lipGloss = {
      colorHex: glossStep?.hex ?? '#FFFFFF',
      shape: resolveLipGlossShape(glossStep?.stepText ?? lipGuide.texture ?? ''),
    };
    // 립 본체 — 프리셋 표준 소프트 경계(전 프리셋 lipEdgeFeather 0.35). 플랜
    // '안쪽 포인트' 딥 색이 있으면 그라데 립(안쪽 진하게)까지 복원.
    lanes.lipStyle = {
      edgeFeather: 0.35,
      innerColorHex: findPlanColorHex(lipGuide, LIP_INNER_COLOR_ROLE_PATTERN),
    };
  }

  if (cheekGuide) {
    // 하이라이터 스텝('광대뼈 가장 높은…')의 위치 어휘가 블러셔 모양으로 오인되지
    // 않게 제외하고, 가이드 서술 + 블러셔 스텝 텍스트만 스캔한다.
    const planSteps = (cheekGuide.applicationPlan?.steps ?? []).filter(
      step => !/하이라이터/.test([step.title, step.productType].filter(Boolean).join(' ')),
    );
    const cheekText = [
      cheekGuide.texture,
      cheekGuide.goal,
      cheekGuide.placement,
      cheekGuide.technique,
      ...(cheekGuide.steps ?? []).map(step => step.instruction),
      ...planSteps.flatMap(step => [step.title, step.placement, step.technique]),
    ]
      .filter(Boolean)
      .join(' ');
    const shapeValue = resolveBlushShapeValue(cheekText);
    const catalogShape =
      AR_BLUSH_SHAPES.find(shape => shape.value === shapeValue) ??
      AR_BLUSH_DEFAULT_SHAPE;
    lanes.blushShape = {
      value: catalogShape.value,
      lift: catalogShape.lift,
      spread: catalogShape.spread,
    };
  }

  if (browGuide) {
    // 모양은 texture+goal에서 '눈썹을 직접 수식하는' 어구만, 두께·정의감은
    // texture에서만 읽는다(goal은 얼굴형·눈매·룩 제목 파생 문구의 유입구).
    lanes.brow = resolveBrowLane(
      [browGuide.texture, browGuide.goal].filter(Boolean).join(' '),
      browGuide.texture ?? '',
    );
  }

  if (eyeGuide) {
    // 아래 섀도는 eye 가이드가 있으면 항상 동반(위 밴드만 있는 반쪽 눈매 방지).
    // 플랜 '깊이' 색이 있으면 그 색, 없으면 번역층이 가이드 색으로 폴백.
    lanes.lowerShadow = {
      colorHex: findPlanColorHex(eyeGuide, DEPTH_COLOR_ROLE_PATTERN),
    };
    // 위 섀도 다층 — 플랜 '베이스' 색이 있으면 베이스 워시 밴드를 동반한다.
    lanes.upperBaseColorHex = findPlanColorHex(
      eyeGuide,
      EYE_BASE_COLOR_ROLE_PATTERN,
    );

    const linerHex = findPlanColorHex(eyeGuide, LINER_COLOR_ROLE_PATTERN);
    if (linerHex && isDeepLinerHex(linerHex)) {
      lanes.eyelinerColorHex = linerHex;
    }

    // 섀도 실루엣 = 카탈로그 마스크. 룩의 눈매 서술에서 페어를 고르고, 신호가
    // 없으면 가장 자연스러운 기본(내추럴 프리셋과 같은 eye_base) 페어.
    const eyeText = collectGuideText(eyeGuide);
    lanes.shadowMask = resolveShadowMaskPair(eyeText);

    // 애교살은 언급 여부와 무관하게 항상 동반한다.
    lanes.aegyo = {...AEGYO_DEFAULT};
  }

  return Object.keys(lanes).length > 0 ? lanes : undefined;
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
      let colorHex = guideColor ?? analysisColor ?? initialControl.colorHex;

      if (region === 'brow') {
        // 눈썹 셰이더는 선택색 직채색이라 밝은 hex = 흰 눈썹. 휘도 게이트를
        // 통과한 색만 채택하고, 밝은 색이 '의도'였다면 팔레트 최밝 라이트
        // 브라운으로 스냅한다(라이트너 축은 잎을 2장으로 만들어 쓰지 않는다).
        const deepGuide =
          guideColor && getHexRelativeLuminance(guideColor) <= BROW_MAX_LUMINANCE
            ? guideColor
            : undefined;
        const deepAnalysis =
          analysisColor && getHexRelativeLuminance(analysisColor) <= BROW_MAX_LUMINANCE
            ? analysisColor
            : undefined;
        const hadLightColor =
          (guideColor && !deepGuide) || (analysisColor && !deepAnalysis);
        colorHex =
          deepGuide ??
          deepAnalysis ??
          (hadLightColor ? BROW_LIGHT_SNAP_HEX : initialControl.colorHex);
      } else if (region === 'eyeliner') {
        // 분석 makeupColors.eyeliner 폴백도 딥해야 채택 — 밝은 값이면 라이너가
        // 안 보이므로 딥 기본색 유지(플랜 '라인' 색 게이트와 동일 기준).
        colorHex =
          analysisColor && isDeepLinerHex(analysisColor)
            ? analysisColor
            : initialControl.colorHex;
      }

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
    lookLanes: deriveRecommendedLookLanes(guides),
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
