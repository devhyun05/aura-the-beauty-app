import {BROW_COLORS} from '../presets';
import type {FilterParams} from '../bridge/types';
import {
  isLeaf,
  setSubRegion,
  subDefsForRegion,
  updateBrowSharedAxis,
  updateLeaf,
} from './lookTree';
import type {
  LookLibrary,
  LookNode,
  ProductLeaf,
} from './lookTree';
import type {RegionKey} from './regions';

/** Basic 눈썹 UI가 사용하는 실제 레퍼런스 알파 에셋 5종. */
export const BROW_REFERENCE_SHAPES = [
  {value: 0, label: '일자', template: 9},
  {value: 1, label: '소프트 일자', template: 8},
  {value: 2, label: '세미아치', template: 7},
  {value: 3, label: '아치', template: 5},
  {value: 4, label: '둥근형', template: 6},
] as const;

/** 레퍼런스 알파 에셋을 담을 기본 browStyle sub 룩. */
export const DEFAULT_BROW_STYLE_SUB_LOOK_ID =
  'sys:var:brow-style:natural-texture:s0';
const REFERENCE_BROW_INTENSITY = 0.62;
export const BASIC_BROW_THICKNESS_MIN = 0.25;
export const BASIC_BROW_THICKNESS_NEUTRAL = 1;
export const BASIC_BROW_THICKNESS_MAX = 2.5;
export const BASIC_BROW_LENGTH_MIN = 0.65;
export const BASIC_BROW_LENGTH_NEUTRAL = 1;
export const BASIC_BROW_LENGTH_MAX = 1.6;

const BROW_PRODUCT_REGIONS: RegionKey[] = [
  'brow',
  'browPowder',
  'browPencil',
  'browLightener',
  'browStyle',
];

const BROW_COLOR_KEY_BY_REGION: Partial<
  Record<RegionKey, keyof FilterParams>
> = {
  brow: 'browColor',
  browPowder: 'browPowderColor',
  browPencil: 'browPencilColor',
  browStyle: 'browStyleColor',
};

const DEFAULT_BROW_COLOR = BROW_COLORS[2];

export type BrowTreeState = {
  enabled: boolean;
  shapeValue: number;
  color: string;
  intensity: number;
  thickness: number;
  length: number;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const clampBrowThickness = (value: number): number =>
  Math.min(
    BASIC_BROW_THICKNESS_MAX,
    Math.max(BASIC_BROW_THICKNESS_MIN, value),
  );
const clampBrowLength = (value: number): number =>
  Math.min(BASIC_BROW_LENGTH_MAX, Math.max(BASIC_BROW_LENGTH_MIN, value));

/**
 * 기본 모드 중앙(50)은 기존 1배를 유지한다. 양 끝은 0.25배↔2.5배로 넓혀
 * 최소/최대에서 실루엣 차이가 즉시 보이도록 한다.
 */
export function browThicknessFromSlider(value: number): number {
  const normalized = clamp01(value);
  if (normalized <= 0.5) {
    return (
      BASIC_BROW_THICKNESS_MIN +
      (BASIC_BROW_THICKNESS_NEUTRAL - BASIC_BROW_THICKNESS_MIN) *
        normalized *
        2
    );
  }
  return (
    BASIC_BROW_THICKNESS_NEUTRAL +
    (BASIC_BROW_THICKNESS_MAX - BASIC_BROW_THICKNESS_NEUTRAL) *
      (normalized - 0.5) *
      2
  );
}

export function normalizeBrowThickness(value: number): number {
  const thickness = clampBrowThickness(value);
  if (thickness <= BASIC_BROW_THICKNESS_NEUTRAL) {
    return (
      ((thickness - BASIC_BROW_THICKNESS_MIN) /
        (BASIC_BROW_THICKNESS_NEUTRAL - BASIC_BROW_THICKNESS_MIN)) *
      0.5
    );
  }
  return (
    0.5 +
    ((thickness - BASIC_BROW_THICKNESS_NEUTRAL) /
      (BASIC_BROW_THICKNESS_MAX - BASIC_BROW_THICKNESS_NEUTRAL)) *
      0.5
  );
}

/**
 * 가로 길이는 눈썹머리를 고정하고 꼬리 방향으로 0.65배↔1.6배 조절한다.
 * 중앙(50)은 저장된 기존 룩과 같은 1배다.
 */
export function browLengthFromSlider(value: number): number {
  const normalized = clamp01(value);
  if (normalized <= 0.5) {
    return (
      BASIC_BROW_LENGTH_MIN +
      (BASIC_BROW_LENGTH_NEUTRAL - BASIC_BROW_LENGTH_MIN) * normalized * 2
    );
  }
  return (
    BASIC_BROW_LENGTH_NEUTRAL +
    (BASIC_BROW_LENGTH_MAX - BASIC_BROW_LENGTH_NEUTRAL) *
      (normalized - 0.5) *
      2
  );
}

export function normalizeBrowLength(value: number): number {
  const length = clampBrowLength(value);
  if (length <= BASIC_BROW_LENGTH_NEUTRAL) {
    return (
      ((length - BASIC_BROW_LENGTH_MIN) /
        (BASIC_BROW_LENGTH_NEUTRAL - BASIC_BROW_LENGTH_MIN)) *
      0.5
    );
  }
  return (
    0.5 +
    ((length - BASIC_BROW_LENGTH_NEUTRAL) /
      (BASIC_BROW_LENGTH_MAX - BASIC_BROW_LENGTH_NEUTRAL)) *
      0.5
  );
}

function visibleBrowLeaves(root: LookNode | null): ProductLeaf[] {
  if (!root?.visible) return [];
  const leaves: ProductLeaf[] = [];

  const visit = (node: LookNode) => {
    if (!node.visible) return;
    for (const child of node.kids) {
      if (isLeaf(child)) {
        if (
          child.visible &&
          BROW_PRODUCT_REGIONS.includes(child.region)
        ) {
          leaves.push(child);
        }
      } else {
        visit(child);
      }
    }
  };

  visit(root);
  return leaves;
}

export function readBrowTree(root: LookNode | null): BrowTreeState {
  const leaves = visibleBrowLeaves(root);
  const last = leaves[leaves.length - 1];
  if (!last) {
    return {
      enabled: false,
      shapeValue: BROW_REFERENCE_SHAPES[0].value,
      color: DEFAULT_BROW_COLOR,
      intensity: REFERENCE_BROW_INTENSITY,
      thickness: BASIC_BROW_THICKNESS_NEUTRAL,
      length: BASIC_BROW_LENGTH_NEUTRAL,
    };
  }

  let color: string = DEFAULT_BROW_COLOR;
  let intensity = REFERENCE_BROW_INTENSITY;
  let thickness = BASIC_BROW_THICKNESS_NEUTRAL;
  let length = BASIC_BROW_LENGTH_NEUTRAL;
  for (const leaf of leaves) {
    const key = BROW_COLOR_KEY_BY_REGION[leaf.region];
    const candidate = key ? leaf.params[key] : undefined;
    if (typeof candidate === 'string') color = candidate;
    const intensityCandidate =
      leaf.region === 'brow'
        ? leaf.params.browIntensity
        : leaf.region === 'browPowder'
          ? leaf.params.browPowderIntensity
          : leaf.region === 'browPencil'
            ? leaf.params.browPencilIntensity
            : leaf.region === 'browStyle'
              ? leaf.params.browStyleIntensity
              : undefined;
    if (
      typeof intensityCandidate === 'number' &&
      Number.isFinite(intensityCandidate)
    ) {
      intensity = clamp01(intensityCandidate);
    }
    if (
      typeof leaf.params.browThickness === 'number' &&
      Number.isFinite(leaf.params.browThickness)
    ) {
      thickness = clampBrowThickness(leaf.params.browThickness);
    }
    if (
      typeof leaf.params.browLength === 'number' &&
      Number.isFinite(leaf.params.browLength)
    ) {
      length = clampBrowLength(leaf.params.browLength);
    }
  }

  const storedShape = last.params.browShape;
  return {
    enabled: true,
    shapeValue:
      BROW_REFERENCE_SHAPES.some(shape => shape.value === storedShape)
        ? storedShape!
        : BROW_REFERENCE_SHAPES[0].value,
    color,
    intensity,
    thickness,
    length,
  };
}

export function ensureBrowTree(
  root: LookNode | null,
  library: LookLibrary,
): LookNode | null {
  const leaves = visibleBrowLeaves(root);
  const referenceTemplates = BROW_REFERENCE_SHAPES.map(shape => shape.template);
  if (
    leaves.length === 1 &&
    leaves[0].region === 'browStyle' &&
    referenceTemplates.includes(
      leaves[0].params.browStyleTemplate as (typeof referenceTemplates)[number],
    )
  ) {
    return root;
  }

  const defaultDefinitionId = library[DEFAULT_BROW_STYLE_SUB_LOOK_ID]
    ? DEFAULT_BROW_STYLE_SUB_LOOK_ID
    : subDefsForRegion(library, 'browStyle')[0]?.id;
  if (!defaultDefinitionId) return root;

  // 이전 빌드가 만든 결·파우더·펜슬 레이어를 그대로 두면 알파 에셋 위에
  // 기하학 밴드가 겹친다. 명시적 지우개(browConceal)는 건드리지 않고 눈썹
  // 제품만 하나의 browStyle 레이어로 정규화한다.
  let next = root;
  for (const region of BROW_PRODUCT_REGIONS) {
    next = setSubRegion(next, library, '눈썹', region, null);
  }
  return setSubRegion(
    next,
    library,
    '눈썹',
    'browStyle',
    defaultDefinitionId,
  );
}

export function patchBrowTree(
  root: LookNode | null,
  library: LookLibrary,
  patch: {
    shapeValue?: number;
    color?: string;
    intensity?: number;
    thickness?: number;
    length?: number;
  },
): LookNode | null {
  const current = readBrowTree(root);
  const ensured = ensureBrowTree(root, library);
  if (!ensured) return root;

  let next = ensured;
  const requestedShape = patch.shapeValue ?? current.shapeValue;
  if (BROW_REFERENCE_SHAPES.some(shape => shape.value === requestedShape)) {
    next = updateBrowSharedAxis(next, {browShape: requestedShape});
    const selected = BROW_REFERENCE_SHAPES.find(
      shape => shape.value === requestedShape,
    )!;
    for (const leaf of visibleBrowLeaves(next)) {
      if (leaf.region !== 'browStyle') continue;
      next = updateLeaf(next, leaf.id, {
        params: {
          browStyleTemplate: selected.template,
          browStyleIntensity: current.intensity,
        },
      });
    }
  }

  if (patch.color !== undefined) {
    for (const leaf of visibleBrowLeaves(next)) {
      const colorKey = BROW_COLOR_KEY_BY_REGION[leaf.region];
      if (!colorKey) continue;
      next = updateLeaf(next, leaf.id, {
        params: {[colorKey]: patch.color},
      });
    }
  }

  if (
    patch.intensity !== undefined ||
    patch.thickness !== undefined ||
    patch.length !== undefined
  ) {
    for (const leaf of visibleBrowLeaves(next)) {
      const params: Partial<FilterParams> = {};
      if (patch.thickness !== undefined) {
        params.browThickness = clampBrowThickness(patch.thickness);
      }
      if (patch.length !== undefined) {
        params.browLength = clampBrowLength(patch.length);
      }
      if (patch.intensity !== undefined) {
        const intensity = clamp01(patch.intensity);
        if (leaf.region === 'brow') params.browIntensity = intensity;
        else if (leaf.region === 'browPowder') {
          params.browPowderIntensity = intensity;
        } else if (leaf.region === 'browPencil') {
          params.browPencilIntensity = intensity;
        } else if (leaf.region === 'browStyle') {
          params.browStyleIntensity = intensity;
        }
      }
      next = updateLeaf(next, leaf.id, {params});
    }
  }

  return next;
}

/** 눈썹 제품만 끄고, 사용자가 선택한 지우개(browConceal)는 보존한다. */
export function removeBrowTree(
  root: LookNode | null,
  library: LookLibrary,
): LookNode | null {
  let next = root;
  for (const region of BROW_PRODUCT_REGIONS) {
    next = setSubRegion(next, library, '눈썹', region, null);
  }
  return next;
}
