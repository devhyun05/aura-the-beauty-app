import type { FilterParams } from '../bridge/types';
import { fitFieldsOfRegion } from './fitSheets';
import type { RegionKey } from './regions';

type FitHandleField = keyof FilterParams & string;

export interface FitHandleAxisRule {
  field: FitHandleField;
  k: number;
}

export interface FitHandleRule {
  /** Omitted for brow handles so each leaf keeps its concrete brow* region. */
  region?: RegionKey;
  dyUp?: FitHandleAxisRule;
  dxOut?: FitHandleAxisRule;
  /** Shared brow fields must reach every brow leaf to avoid compile last-writer wins. */
  broadcastBrow?: boolean;
}

/** Unity anchor base -> makeup leaf region used when expanding on-face handles. */
export const FIT_HANDLE_REGIONS: Record<string, RegionKey> = {
  blush: 'blush',
  highlight: 'highlighter',
  contour: 'contour',
  wing: 'eyelinerUpper',
  eyelinerThickness: 'eyelinerUpper',
  eyelinerInner: 'eyelinerUpper',
  aegyo: 'aegyo',
  eyeshadow: 'eyeshadow',
  doubleLid: 'doubleLid',
  mascara: 'mascara',
  lowerMascara: 'lowerMascara',
  brow: 'brow',
  browThickness: 'brow',
  lip: 'lip',
  lipLiner: 'lipLiner',
};

/** Strip Unity's L/R side suffix or a deco index without touching unsided names. */
export function normalizeFitHandleAnchor(rawAnchor: string): {
  anchor: string;
  side: 'L' | 'R' | '';
} {
  const side = rawAnchor.endsWith('L')
    ? 'L'
    : rawAnchor.endsWith('R')
    ? 'R'
    : '';
  return {
    anchor: side ? rawAnchor.slice(0, -1) : rawAnchor.replace(/\d+$/, ''),
    side,
  };
}

/** Drag direction is expressed in viewport units relative to eye width. */
export const FIT_HANDLE_RULES: Record<string, FitHandleRule> = {
  blush: {
    region: 'blush',
    dyUp: { field: 'blushLift', k: 0.35 },
    dxOut: { field: 'blushSpread', k: 0.35 },
  },
  highlight: {
    region: 'highlighter',
    dyUp: { field: 'highlightLift', k: 0.35 },
    dxOut: { field: 'highlightSpread', k: 0.35 },
  },
  contour: {
    region: 'contour',
    dyUp: { field: 'contourLift', k: 0.35 },
    dxOut: { field: 'contourSpread', k: 0.35 },
  },
  wing: {
    region: 'eyelinerUpper',
    dyUp: { field: 'eyeCornerLift', k: 0.8 },
    dxOut: { field: 'eyelinerWingLength', k: 3 },
  },
  eyelinerThickness: {
    region: 'eyelinerUpper',
    dyUp: { field: 'eyelinerThickness', k: 1.2 },
  },
  eyelinerInner: {
    region: 'eyelinerUpper',
    dyUp: { field: 'eyelinerInnerLift', k: 0.12 },
  },
  aegyo: {
    region: 'aegyo',
    dyUp: { field: 'aegyoHeight', k: -2 },
  },
  eyeshadow: {
    region: 'eyeshadow',
    dyUp: { field: 'eyeshadowHeight', k: 1.2 },
  },
  eyeshadowLower: {
    region: 'eyeshadowLower',
    dyUp: { field: 'eyeshadowLowerHeight', k: 1.2 },
  },
  eyelinerLower: {
    region: 'eyelinerLower',
    dyUp: { field: 'eyelinerLowerThickness', k: 1.2 },
  },
  triangleZone: {
    region: 'triangleZone',
    dyUp: { field: 'triangleZoneHeight', k: 1.2 },
  },
  doubleLid: {
    region: 'doubleLid',
    dyUp: { field: 'doubleLidHeight', k: 1 },
  },
  mascara: {
    region: 'mascara',
    dyUp: { field: 'mascaraLength', k: 1.3 },
  },
  lowerMascara: {
    region: 'lowerMascara',
    dyUp: { field: 'lowerLashLength', k: -1.3 },
  },
  brow: {
    dyUp: { field: 'browArch', k: 0.35 },
    broadcastBrow: true,
  },
  browThickness: {
    dyUp: { field: 'browThickness', k: 1 },
    broadcastBrow: true,
  },
  lip: {
    region: 'lip',
    dyUp: { field: 'lipOverline', k: 0.8 },
  },
  lipLiner: {
    region: 'lipLiner',
    dyUp: { field: 'lipLinerWidth', k: -1.2 },
  },
  lipBase: {
    region: 'lipBase',
    dyUp: { field: 'lipBaseOverline', k: 0.8 },
  },
  lipGloss: {
    region: 'lipGloss',
    dyUp: { field: 'lipGlossOverline', k: 0.8 },
  },
};

/** Fit-panel values without a single meaningful spatial control point. */
export const PANEL_ONLY_FIT_FIELDS = [
  'blushEdgeSoftness',
  'highlightEdgeSoftness',
  'contourEdgeSoftness',
] as const;

const fitField = (region: RegionKey, field: string) =>
  fitFieldsOfRegion(region).find(def => def.key === field);

const numericBase = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Clamp the stored delta itself so base + delta is always inside its field range. */
export function clampFitHandleStoredDelta(
  region: RegionKey,
  field: FitHandleField,
  requestedDelta: number,
  baseValue: unknown,
): number {
  const def = fitField(region, field);
  if (!def) return 0;
  const base = numericBase(baseValue, def.fallback);
  const safeDelta = Number.isFinite(requestedDelta) ? requestedDelta : 0;
  return Math.min(def.max - base, Math.max(def.min - base, safeDelta));
}

export interface FitHandleDragInput {
  anchor: string;
  side: 'L' | 'R' | '';
  dxVp: number;
  dyVpUp: number;
  eyeVp: number;
  startValues: Readonly<Record<string, number>>;
  baseParams: Partial<FilterParams>;
  leafRegion: RegionKey;
}

/** Convert a total handle drag into clamped fit-sheet rule deltas. */
export function fitHandleDragRules(
  input: FitHandleDragInput,
): Record<string, number> {
  const spec = FIT_HANDLE_RULES[input.anchor];
  if (!spec) return {};
  const region = spec.region ?? input.leafRegion;
  const eyeVp = input.eyeVp > 0 ? input.eyeVp : 0.12;
  const outwardVp = input.side === 'L' ? -input.dxVp : input.dxVp;
  const rules: Record<string, number> = {};

  if (spec.dyUp) {
    const { field, k } = spec.dyUp;
    const requested =
      (input.startValues[field] ?? 0) + (input.dyVpUp / eyeVp) * k;
    rules[field] = clampFitHandleStoredDelta(
      region,
      field,
      requested,
      input.baseParams[field],
    );
  }
  if (spec.dxOut) {
    const { field, k } = spec.dxOut;
    const requested = (input.startValues[field] ?? 0) + (outwardVp / eyeVp) * k;
    rules[field] = clampFitHandleStoredDelta(
      region,
      field,
      requested,
      input.baseParams[field],
    );
  }
  return rules;
}

export interface FitHandleLeaf {
  id: string;
  region: RegionKey;
  params: Partial<FilterParams>;
}

export interface FitHandleDragStartInput {
  anchor: string;
  leaf: FitHandleLeaf;
  storedRules?: Readonly<Record<string, number>>;
  compiledParams?: Partial<FilterParams>;
}

/** Brow drags start from the currently compiled shared value, not the touched leaf. */
export function fitHandleDragStartValues(
  input: FitHandleDragStartInput,
): Record<string, number> {
  const spec = FIT_HANDLE_RULES[input.anchor];
  if (!spec) return {};
  const region = spec.region ?? input.leaf.region;
  const values: Record<string, number> = {};
  const axes = [spec.dyUp, spec.dxOut].filter(
    (axis): axis is FitHandleAxisRule => axis !== undefined,
  );
  for (const { field } of axes) {
    const compiledValue = input.compiledParams?.[field];
    if (spec.broadcastBrow && typeof compiledValue === 'number') {
      const def = fitField(region, field);
      const base = numericBase(input.leaf.params[field], def?.fallback ?? 0);
      values[field] = clampFitHandleStoredDelta(
        region,
        field,
        compiledValue - base,
        base,
      );
    } else {
      values[field] = input.storedRules?.[field] ?? 0;
    }
  }
  return values;
}

/** Shared brow axes are broadcast to every brow product leaf; other handles stay per-leaf. */
export function fitHandleTargetLeaves<T extends FitHandleLeaf>(
  anchor: string,
  source: T,
  leaves: readonly T[],
): T[] {
  if (!FIT_HANDLE_RULES[anchor]?.broadcastBrow) return [source];
  return leaves.filter(leaf => leaf.region.startsWith('brow'));
}

/** Rebase source deltas so different leaf baselines still compile to one shared brow value. */
export function rebaseFitHandleRules(
  sourceRules: Readonly<Record<string, number>>,
  source: FitHandleLeaf,
  target: FitHandleLeaf,
): Record<string, number> {
  const rules: Record<string, number> = {};
  for (const [fieldName, sourceDelta] of Object.entries(sourceRules)) {
    const field = fieldName as FitHandleField;
    const sourceDef = fitField(source.region, field);
    const targetDef = fitField(target.region, field);
    if (!sourceDef || !targetDef) continue;
    const sourceBase = numericBase(source.params[field], sourceDef.fallback);
    const targetBase = numericBase(target.params[field], targetDef.fallback);
    rules[field] = clampFitHandleStoredDelta(
      target.region,
      field,
      sourceBase + sourceDelta - targetBase,
      targetBase,
    );
  }
  return rules;
}
