/**
 * 전문가 파라미터 단일 레지스트리.
 *
 * 안전 범위가 정본 또는 ShaderLab Range/UI에 실재하는 연속값만 싣는다. 상태는 RN에
 * 남기고 브리지에는 serializeExpertOverrides가 만든 전체 KV 배열만 전달한다.
 */
import type { RegionKey } from './regions';

export type ExpertParamTier = 'detail' | 'expert';
export type ExpertParamRegion = RegionKey | 'global';

export interface ExpertParamDef {
  key: string;
  label: string;
  effect: string;
  region: ExpertParamRegion;
  uniform: string;
  min: number;
  max: number;
  default: number;
  /** null = 연속 슬라이더. 수치 step은 정본에 근거가 있을 때만 지정한다. */
  step: number | null;
  tier: ExpertParamTier;
  /** 값을 소비하는 Unity 머티리얼/전역 셰이더의 소유자. */
  owner: string;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export const EXPERT_PARAMS = deepFreeze([
  {
    key: 'skin.blurRadius',
    label: '결 크기',
    effect:
      '스무딩이 참고하는 피부결 반경을 조절해 모공부터 큰 요철까지 흐립니다.',
    region: 'skin',
    uniform: '_BlurRadius',
    min: 0,
    max: 6,
    default: 2.5,
    step: null,
    tier: 'detail',
    owner: 'FaceMakeup.shader',
  },
  {
    key: 'foundation.texGrain',
    label: '보송함',
    effect: '트윈케익 파운데이션의 미세 입자감을 더합니다.',
    region: 'foundation',
    uniform: '_FndTexGrain',
    min: 0,
    max: 1,
    default: 0,
    step: null,
    tier: 'detail',
    owner: 'Foundation.cginc (FaceMakeup.shader + CameraFeed.shader)',
  },
  {
    key: 'lipGloss.glossLumaLo',
    label: '광 퍼짐',
    effect: '낮출수록 어두운 입술 영역까지 글로스 광이 넓게 퍼집니다.',
    region: 'lipGloss',
    uniform: '_GlossLumaLo',
    min: 0,
    max: 1,
    default: 0.4,
    step: null,
    tier: 'expert',
    owner: 'Lip.shader',
  },
  {
    key: 'brow.hairLo',
    label: '결 판정 하한',
    effect: '눈썹 털로 판정하기 시작하는 밝기 하한을 조절합니다.',
    region: 'brow',
    uniform: '_HairLo',
    min: 0,
    max: 1,
    default: 0.3,
    step: null,
    tier: 'expert',
    owner: 'Brow.shader',
  },
  {
    key: 'brow.hairHi',
    label: '결 판정 상한',
    effect: '눈썹 털 판정이 완전히 적용되는 밝기 상한을 조절합니다.',
    region: 'brow',
    uniform: '_HairHi',
    min: 0,
    max: 1,
    default: 0.62,
    step: null,
    tier: 'expert',
    owner: 'Brow.shader',
  },
  {
    key: 'browPowder.fillFloor',
    label: '숱 채움 밀도',
    effect: '털 사이 피부에 들어가는 최소 채움량을 조절합니다.',
    region: 'browPowder',
    uniform: '_FillFloor',
    min: 0,
    max: 1,
    default: 0.45,
    step: null,
    tier: 'expert',
    owner: 'BrowPowder.shader',
  },
  {
    key: 'browLightener.hairLo',
    label: '결 판정 하한',
    effect: '라이트너가 어두운 눈썹 털을 판정하기 시작하는 밝기 하한입니다.',
    region: 'browLightener',
    uniform: '_HairLo',
    min: 0,
    max: 1,
    default: 0.32,
    step: null,
    tier: 'expert',
    owner: 'BrowLightener.shader',
  },
  {
    key: 'browLightener.hairHi',
    label: '결 판정 상한',
    effect: '라이트너의 눈썹 털 판정이 완전히 적용되는 밝기 상한입니다.',
    region: 'browLightener',
    uniform: '_HairHi',
    min: 0,
    max: 1,
    default: 0.7,
    step: null,
    tier: 'expert',
    owner: 'BrowLightener.shader',
  },
  {
    key: 'browConceal.hairLo',
    label: '결 판정 하한',
    effect: '눈썹 지우개가 어두운 털을 판정하기 시작하는 밝기 하한입니다.',
    region: 'browConceal',
    uniform: '_HairLo',
    min: 0,
    max: 1,
    default: 0.32,
    step: null,
    tier: 'expert',
    owner: 'BrowConceal.shader',
  },
  {
    key: 'browConceal.hairHi',
    label: '결 판정 상한',
    effect: '눈썹 지우개의 털 판정이 완전히 적용되는 밝기 상한입니다.',
    region: 'browConceal',
    uniform: '_HairHi',
    min: 0,
    max: 1,
    default: 0.7,
    step: null,
    tier: 'expert',
    owner: 'BrowConceal.shader',
  },
  {
    key: 'browConceal.featherV',
    label: '세로 경계 페더',
    effect: '눈썹 지우개 밴드의 위아래 경계를 피부에 녹이는 폭입니다.',
    region: 'browConceal',
    uniform: '_FeatherV',
    min: 0,
    max: 0.4,
    default: 0.2,
    step: null,
    tier: 'expert',
    owner: 'BrowConceal.shader',
  },
  {
    key: 'browConceal.featherH',
    label: '가로 경계 페더',
    effect: '눈썹 지우개 밴드의 양끝 경계를 피부에 녹이는 폭입니다.',
    region: 'browConceal',
    uniform: '_FeatherH',
    min: 0,
    max: 0.4,
    default: 0.12,
    step: null,
    tier: 'expert',
    owner: 'BrowConceal.shader',
  },
  {
    key: 'teeth.toothLumaLo',
    label: '치아 밝기 하한',
    effect: '어두운 입안을 제외하고 치아로 판정하기 시작하는 밝기 하한입니다.',
    region: 'teeth',
    uniform: '_ToothLumaLo',
    min: 0,
    max: 1,
    default: 0.4,
    step: null,
    tier: 'expert',
    owner: 'TeethWhiten.shader',
  },
  {
    key: 'teeth.toothLumaHi',
    label: '치아 밝기 상한',
    effect: '치아 판정이 완전히 적용되는 밝기 상한입니다.',
    region: 'teeth',
    uniform: '_ToothLumaHi',
    min: 0,
    max: 1,
    default: 0.62,
    step: null,
    tier: 'expert',
    owner: 'TeethWhiten.shader',
  },
  {
    key: 'teeth.gumRedLo',
    label: '잇몸 붉은기 하한',
    effect: '잇몸과 혀를 제외하기 위한 붉은기 판정의 시작값입니다.',
    region: 'teeth',
    uniform: '_GumRedLo',
    min: 0,
    max: 0.5,
    default: 0.06,
    step: null,
    tier: 'expert',
    owner: 'TeethWhiten.shader',
  },
  {
    key: 'teeth.gumRedHi',
    label: '잇몸 붉은기 상한',
    effect: '잇몸과 혀 제외 판정이 완전히 적용되는 붉은기 상한입니다.',
    region: 'teeth',
    uniform: '_GumRedHi',
    min: 0,
    max: 0.5,
    default: 0.16,
    step: null,
    tier: 'expert',
    owner: 'TeethWhiten.shader',
  },
  {
    key: 'teeth.maxDesaturation',
    label: '최대 색 제거',
    effect: '치아의 원래 색을 무채색으로 바꾸는 최대 비율을 조절합니다.',
    region: 'teeth',
    uniform: '_MaxDesat',
    min: 0,
    max: 1,
    default: 0.8,
    step: null,
    tier: 'expert',
    owner: 'TeethWhiten.shader',
  },
  {
    key: 'teeth.brightenAdd',
    label: '밝기 추가',
    effect: '미백 결과에 더하는 밝기 양을 조절합니다.',
    region: 'teeth',
    uniform: '_BrightenAdd',
    min: 0,
    max: 0.3,
    default: 0.07,
    step: null,
    tier: 'expert',
    owner: 'TeethWhiten.shader',
  },
  {
    key: 'teeth.rimFeather',
    label: '입술 안쪽 경계 페더',
    effect: '치아 스트립의 위아래 끝을 입술 안쪽 경계에 부드럽게 감쇠합니다.',
    region: 'teeth',
    uniform: '_RimFeather',
    min: 0,
    max: 0.6,
    default: 0.25,
    step: null,
    tier: 'expert',
    owner: 'TeethWhiten.shader',
  },
  {
    key: 'global.foundationSeamLo',
    label: '이음새 전이 하한',
    effect:
      '낮은 신뢰도의 목·귀 피부가 파운데이션 게이트에 들어오기 시작하는 값입니다.',
    region: 'global',
    uniform: '_FndSegLoDbg',
    min: 0,
    max: 1,
    default: 0.1,
    step: null,
    tier: 'expert',
    owner: 'CameraFeed.shader',
  },
  {
    key: 'global.foundationSeamHi',
    label: '이음새 전이 상한',
    effect: '목·귀 피부에 파운데이션 게이트가 완전히 적용되는 값입니다.',
    region: 'global',
    uniform: '_FndSegHiDbg',
    min: 0,
    max: 1,
    default: 0.25,
    step: null,
    tier: 'expert',
    owner: 'CameraFeed.shader',
  },
  {
    key: 'global.foundationOvalSize',
    label: '얼굴 타원 크기',
    effect:
      '이중 도포를 막기 위해 제외하는 얼굴 타원의 반경 배수를 조절합니다.',
    region: 'global',
    uniform: '_FndOvalSizeDbg',
    min: 0.9,
    max: 1.4,
    default: 1.1,
    step: null,
    tier: 'expert',
    owner: 'CameraFeed.shader',
  },
  {
    key: 'global.foundationOvalFeather',
    label: '얼굴 타원 페더',
    effect: '얼굴 제외 타원의 경계를 부드럽게 번지는 폭을 조절합니다.',
    region: 'global',
    uniform: '_FndOvalFeatherDbg',
    min: 0,
    max: 0.3,
    default: 0.15,
    step: null,
    tier: 'expert',
    owner: 'CameraFeed.shader',
  },
] as const satisfies readonly ExpertParamDef[]);

export type ExpertParamKey = (typeof EXPERT_PARAMS)[number]['key'];
export type ExpertOverrides = Partial<Record<ExpertParamKey, number>>;

export interface ExpertParamRelation {
  lowerKey: ExpertParamKey;
  upperKey: ExpertParamKey;
}

/** smoothstep 하한/상한 쌍. 최소 gap은 지어내지 않고 순서만 강제한다. */
export const EXPERT_PARAM_RELATIONS: readonly ExpertParamRelation[] =
  deepFreeze([
    { lowerKey: 'brow.hairLo', upperKey: 'brow.hairHi' },
    {
      lowerKey: 'browLightener.hairLo',
      upperKey: 'browLightener.hairHi',
    },
    { lowerKey: 'browConceal.hairLo', upperKey: 'browConceal.hairHi' },
    { lowerKey: 'teeth.toothLumaLo', upperKey: 'teeth.toothLumaHi' },
    { lowerKey: 'teeth.gumRedLo', upperKey: 'teeth.gumRedHi' },
    {
      lowerKey: 'global.foundationSeamLo',
      upperKey: 'global.foundationSeamHi',
    },
  ]);

export interface BlockedExpertParam {
  key: string;
  label: string;
  region: RegionKey;
  source: string;
  tier: ExpertParamTier;
  status: 'blocked';
  reason: string;
}

/** W3 상세 노브로 확정됐지만 scale 산식과 안전 범위가 없어 활성화할 수 없는 항목. */
export const BLOCKED_EXPERT_PARAMS: readonly BlockedExpertParam[] = deepFreeze([
  {
    key: 'concealer.blemishSensitivity',
    label: '잡티 판정 민감도',
    region: 'concealer',
    source: 'BR_LO scale knob',
    tier: 'detail',
    status: 'blocked',
    reason:
      'BR_LO scale knob의 산식, 안전 범위, 기본값이 정본과 ShaderLab에 없음',
  },
]);

const PARAM_BY_KEY = new Map<string, ExpertParamDef>(
  EXPERT_PARAMS.map(param => [param.key, param]),
);

export function validateExpertParamRegistry(
  params: readonly ExpertParamDef[],
): void {
  const keys = new Set<string>();
  for (const param of params) {
    if (keys.has(param.key)) {
      throw new Error(`duplicate expert parameter key: ${param.key}`);
    }
    keys.add(param.key);
    if (![param.min, param.max, param.default].every(Number.isFinite)) {
      throw new Error(`non-finite range for expert parameter: ${param.key}`);
    }
    if (param.min > param.max) {
      throw new Error(`invalid range for expert parameter: ${param.key}`);
    }
    if (param.default < param.min || param.default > param.max) {
      throw new Error(
        `default outside range for expert parameter: ${param.key}`,
      );
    }
    if (
      param.step !== null &&
      (!Number.isFinite(param.step) || param.step <= 0)
    ) {
      throw new Error(`invalid step for expert parameter: ${param.key}`);
    }
  }
}

validateExpertParamRegistry(EXPERT_PARAMS);

export function validateExpertParamRelations(
  relations: readonly ExpertParamRelation[],
  params: readonly ExpertParamDef[],
): void {
  const keys = new Set(params.map(param => param.key));
  for (const relation of relations) {
    for (const key of [relation.lowerKey, relation.upperKey]) {
      if (!keys.has(key)) {
        throw new Error(`unknown expert relation key: ${key}`);
      }
    }
  }
}

validateExpertParamRelations(EXPERT_PARAM_RELATIONS, EXPERT_PARAMS);

/** ParamSlider의 optional step 계약으로 변환한다. null은 연속 슬라이더다. */
export function expertParamSliderStep(
  param: Pick<ExpertParamDef, 'step'>,
): number | undefined {
  return param.step ?? undefined;
}

export function paramsForRegion(region: RegionKey): readonly ExpertParamDef[] {
  return EXPERT_PARAMS.filter(param => param.region === region);
}

export function globalExpertParams(): readonly ExpertParamDef[] {
  return EXPERT_PARAMS.filter(param => param.region === 'global');
}

export function setExpertOverride(
  overrides: Readonly<ExpertOverrides>,
  key: ExpertParamKey,
  value: number,
): ExpertOverrides {
  const param = PARAM_BY_KEY.get(key);
  if (!param) throw new Error(`unknown expert parameter key: ${key}`);
  if (!Number.isFinite(value))
    throw new Error(`expert override must be finite: ${key}`);
  if (value < param.min || value > param.max) {
    throw new Error(`expert override outside range: ${key}`);
  }
  const next = { ...overrides, [key]: value };
  const relationErrors = validateExpertOverrideRelations(next);
  if (relationErrors.length > 0) {
    throw new Error(
      `invalid expert override relation: ${relationErrors.join(', ')}`,
    );
  }
  return next;
}

export function resetExpertOverride(
  overrides: Readonly<ExpertOverrides>,
  key: ExpertParamKey,
): ExpertOverrides {
  const next = { ...overrides };
  if (Object.prototype.hasOwnProperty.call(next, key)) delete next[key];
  const relationErrors = validateExpertOverrideRelations(next);
  if (relationErrors.length > 0) {
    throw new Error(
      `invalid expert override relation: ${relationErrors.join(', ')}`,
    );
  }
  return next;
}

export interface ExpertOverrideKV {
  key: ExpertParamKey;
  value: number;
}

/** 등록 순서로 전체 override를 직렬화한다. 0은 값이며, 비유한수/범위 밖 값만 버린다. */
export function serializeExpertOverrides(
  overrides: Readonly<Partial<Record<string, number>>>,
): ExpertOverrideKV[] {
  const out: ExpertOverrideKV[] = [];
  for (const param of EXPERT_PARAMS) {
    if (!Object.prototype.hasOwnProperty.call(overrides, param.key)) continue;
    const value = overrides[param.key];
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      value < param.min ||
      value > param.max
    ) {
      continue;
    }
    out.push({ key: param.key, value });
  }
  const relationErrors = validateExpertOverrideRelations(
    Object.fromEntries(out.map(item => [item.key, item.value])),
  );
  if (relationErrors.length > 0) {
    throw new Error(
      `invalid expert override relation: ${relationErrors.join(', ')}`,
    );
  }
  return out;
}

/** 미설정 쪽은 registry 기본값으로 해석해 관계쌍 전체를 검증한다. */
export function validateExpertOverrideRelations(
  overrides: Readonly<Partial<Record<string, number>>>,
): string[] {
  const errors: string[] = [];
  for (const relation of EXPERT_PARAM_RELATIONS) {
    const lowerDef = PARAM_BY_KEY.get(relation.lowerKey)!;
    const upperDef = PARAM_BY_KEY.get(relation.upperKey)!;
    const lower = overrides[relation.lowerKey] ?? lowerDef.default;
    const upper = overrides[relation.upperKey] ?? upperDef.default;
    if (!(lower < upper)) {
      errors.push(
        `${relation.lowerKey} must be less than ${relation.upperKey}`,
      );
    }
  }
  return errors;
}
