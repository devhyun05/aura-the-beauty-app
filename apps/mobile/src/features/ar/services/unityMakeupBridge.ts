import {NativeEventEmitter, NativeModules} from 'react-native';

import type {
  FilterColorOption,
  MakeupArea,
  MakeupFilter,
} from '../../../shared/types/makeupGuide';
import {ORIGINAL_OPTION_CARD_ID} from './arFilterOptionRules';

export const UNITY_MAKEUP_BRIDGE_TARGET = {
  gameObject: 'RNBridge',
  applyRecipeMethod: 'ApplyRecipeJson',
} as const;

export const UNITY_MAKEUP_NATIVE_EVENT_NAME = 'UnityMakeupEvent';

export type UnityMakeupRegion = 'lip' | 'cheek' | 'brow';

export type UnityMakeupLayerRegion = UnityMakeupRegion | 'eye';

export type UnityMakeupRegionPreset = {
  branchSource: string;
  color: string;
  finish: string;
  label: string;
  maskTextureId: string;
  opacity: number;
  region: UnityMakeupLayerRegion;
  texture: string;
};

export type UnityMakeupLayer = UnityMakeupRegionPreset & {
  blendMode: 'normal' | 'screen';
  coverage: number;
  enabled: boolean;
  feather: number;
  id: string;
  intensity: number;
  rendererMode: 'smooth-region-mask';
  textureMode: 'sample';
};

export type UnityMakeupRecipeBatch = {
  activeRegions: string;
  enabledLayerCount: number;
  layerCount: number;
  layers: UnityMakeupLayer[];
  lookId: 'lip_cheek_brow_region_preview';
  recipeBatchId: string;
  rendererMode: 'smooth-region-mask';
  sentAtMs: number;
  version: 1;
};

export type UnityMakeupARFilterSelection = {
  selectedColor: Pick<FilterColorOption, 'hex' | 'label'>;
  selectedColorId: string;
  selectedMakeupArea: MakeupArea;
  selectedMakeupFilter: MakeupFilter;
  selectedPointMakeupLookId: string;
  selectedShapeId: string;
  selectedTextureId: string;
  selectedTotalMakeupLookId: string | null;
  selectedTypeId: string;
  sentAtMs?: number;
};

export const UNITY_MAKEUP_LAYER_ORDER: readonly UnityMakeupLayerRegion[] = [
  'lip',
  'cheek',
  'eye',
  'brow',
];

export const UNITY_MAKEUP_LAYER_PRESETS: Record<
  UnityMakeupLayerRegion,
  UnityMakeupRegionPreset
> = {
  lip: {
    branchSource: 'COMETIC-EXPRESSION-ENINEERING',
    color: '#D94B74',
    finish: 'gradient-lip',
    label: 'Lip',
    maskTextureId: 'lip-drawn-style-atlas-v1',
    opacity: 0.95,
    region: 'lip',
    texture: 'gradient_lip',
  },
  cheek: {
    branchSource: 'blush-mask@c0c518d',
    color: '#E67B5F',
    finish: 'powder-blush',
    label: 'Cheek',
    maskTextureId: 'cheek-daily-mask-v1',
    opacity: 0.78,
    region: 'cheek',
    texture: 'soft_blush',
  },
  eye: {
    branchSource: 'eye-mask@smooth-v1',
    color: '#8A756E',
    finish: 'soft-eye-shimmer',
    label: 'Eye',
    maskTextureId: 'eye-smooth-mask-v1',
    opacity: 0.52,
    region: 'eye',
    texture: 'shimmer_eye',
  },
  brow: {
    branchSource: 'feature/brow-0626',
    color: '#4A342B',
    finish: 'soft-powder-brow',
    label: 'Brow',
    maskTextureId: 'brow-png-dailyflat-sharp-v1',
    opacity: 0.92,
    region: 'brow',
    texture: 'natural_brow',
  },
};

export const UNITY_MAKEUP_REGION_PRESETS: Record<
  UnityMakeupRegion,
  UnityMakeupRegionPreset
> = {
  brow: UNITY_MAKEUP_LAYER_PRESETS.brow,
  cheek: UNITY_MAKEUP_LAYER_PRESETS.cheek,
  lip: UNITY_MAKEUP_LAYER_PRESETS.lip,
};

const UNITY_LAYER_REGIONS_BY_MAKEUP_AREA: Record<
  MakeupArea,
  readonly UnityMakeupLayerRegion[]
> = {
  all: ['lip', 'cheek', 'eye', 'brow'],
  base: [],
  brow: ['brow'],
  cheek: ['cheek'],
  contour: [],
  eye: ['eye'],
  lip: ['lip'],
};

export function getUnityMakeupLayerRegionsForMakeupArea(
  selectedMakeupArea: MakeupArea,
): readonly UnityMakeupLayerRegion[] {
  return UNITY_LAYER_REGIONS_BY_MAKEUP_AREA[selectedMakeupArea];
}

export function createUnityMakeupRecipeBatch(
  activeRegion: UnityMakeupRegion,
  sentAtMs = Date.now(),
): UnityMakeupRecipeBatch {
  return createUnityMakeupRecipeBatchForRegions({
    activeRegions: [activeRegion],
    recipeBatchId: `makeup-region-${activeRegion}-${sentAtMs}`,
    sentAtMs,
  });
}

export function createUnityMakeupRecipeBatchFromARFilterSelection({
  selectedColor,
  selectedColorId,
  selectedMakeupArea,
  selectedMakeupFilter,
  selectedPointMakeupLookId,
  selectedShapeId,
  selectedTextureId,
  selectedTotalMakeupLookId,
  selectedTypeId,
  sentAtMs = Date.now(),
}: UnityMakeupARFilterSelection): UnityMakeupRecipeBatch {
  return createUnityMakeupRecipeBatchFromARFilterSelections(
    [
      {
        selectedColor,
        selectedColorId,
        selectedMakeupArea,
        selectedMakeupFilter,
        selectedPointMakeupLookId,
        selectedShapeId,
        selectedTextureId,
        selectedTotalMakeupLookId,
        selectedTypeId,
      },
    ],
    sentAtMs,
  );
}

export function createUnityMakeupRecipeBatchFromARFilterSelections(
  selections: readonly UnityMakeupARFilterSelection[],
  sentAtMs = Date.now(),
): UnityMakeupRecipeBatch {
  const layerSelections = new Map<UnityMakeupLayerRegion, UnityMakeupARFilterSelection>();

  selections.forEach(selection => {
    if (!shouldEnableUnityMakeupSelection(selection)) {
      return;
    }

    getUnityMakeupLayerRegionsForMakeupArea(selection.selectedMakeupArea).forEach(
      region => {
        layerSelections.set(region, selection);
      },
    );
  });

  const layers = UNITY_MAKEUP_LAYER_ORDER.map(region => {
    const selection = layerSelections.get(region);

    return createUnityMakeupLayer({
      enabled: Boolean(selection),
      region,
      selectedColor: selection?.selectedColor,
      selectedShapeId: selection?.selectedShapeId,
      selectedTextureId: selection?.selectedTextureId,
      selectedTypeId: selection?.selectedTypeId,
    });
  });
  const activeRegions = UNITY_MAKEUP_LAYER_ORDER.filter(region =>
    layerSelections.has(region),
  );
  const activeRegionSummary =
    activeRegions.length > 0 ? activeRegions.join(',') : 'none';
  const recipeAreas = selections
    .map(selection => sanitizeRecipeIdPart(selection.selectedMakeupArea))
    .join('_');

  return {
    activeRegions: activeRegionSummary,
    enabledLayerCount: layers.filter(layer => layer.enabled).length,
    layerCount: layers.length,
    layers,
    lookId: 'lip_cheek_brow_region_preview',
    recipeBatchId: ['rn-filter-combined', recipeAreas || 'none', sentAtMs].join('-'),
    rendererMode: 'smooth-region-mask',
    sentAtMs,
    version: 1,
  };
}

function createUnityMakeupRecipeBatchForRegions({
  activeRegions,
  recipeBatchId,
  selectedColor,
  selectedShapeId,
  selectedTextureId,
  selectedTypeId,
  sentAtMs,
}: {
  activeRegions: readonly UnityMakeupLayerRegion[];
  recipeBatchId: string;
  selectedColor?: Pick<FilterColorOption, 'hex' | 'label'>;
  selectedShapeId?: string;
  selectedTextureId?: string;
  selectedTypeId?: string;
  sentAtMs: number;
}): UnityMakeupRecipeBatch {
  const activeRegionSet = new Set(activeRegions);
  const layers = UNITY_MAKEUP_LAYER_ORDER.map(region =>
    createUnityMakeupLayer({
      enabled: activeRegionSet.has(region),
      region,
      selectedColor,
      selectedShapeId,
      selectedTextureId,
      selectedTypeId,
    }),
  );
  const activeRegionSummary =
    activeRegions.length > 0 ? activeRegions.join(',') : 'none';

  return {
    activeRegions: activeRegionSummary,
    enabledLayerCount: layers.filter(layer => layer.enabled).length,
    layerCount: layers.length,
    layers,
    lookId: 'lip_cheek_brow_region_preview',
    recipeBatchId,
    rendererMode: 'smooth-region-mask',
    sentAtMs,
    version: 1,
  };
}

function shouldEnableUnityMakeupSelection({
  selectedColorId,
  selectedMakeupArea,
  selectedPointMakeupLookId,
  selectedShapeId,
  selectedTextureId,
  selectedTotalMakeupLookId,
  selectedTypeId,
}: UnityMakeupARFilterSelection): boolean {
  if (
    selectedMakeupArea === 'all' &&
    selectedTotalMakeupLookId === ORIGINAL_OPTION_CARD_ID
  ) {
    return false;
  }

  const hasPointMakeupCustomization = [
    selectedColorId,
    selectedTypeId,
    selectedTextureId,
    selectedShapeId,
  ].some(optionId => optionId.length > 0 && optionId !== ORIGINAL_OPTION_CARD_ID);
  const shouldClearPoint =
    selectedMakeupArea !== 'all' &&
    selectedPointMakeupLookId === ORIGINAL_OPTION_CARD_ID &&
    !hasPointMakeupCustomization;
  const shouldClearColor =
    !selectedColorId || selectedColorId === ORIGINAL_OPTION_CARD_ID;

  return !shouldClearPoint && !shouldClearColor;
}

function createUnityMakeupLayer({
  enabled,
  region,
  selectedColor,
  selectedShapeId,
  selectedTextureId,
  selectedTypeId,
}: {
  enabled: boolean;
  region: UnityMakeupLayerRegion;
  selectedColor?: Pick<FilterColorOption, 'hex' | 'label'>;
  selectedShapeId?: string;
  selectedTextureId?: string;
  selectedTypeId?: string;
}): UnityMakeupLayer {
  const preset = UNITY_MAKEUP_LAYER_PRESETS[region];
  const texture = resolveTextureForRegion(
    region,
    selectedTextureId,
    selectedTypeId,
    selectedShapeId,
  );
  const maskTextureId = resolveMaskTextureIdForRegion(region, selectedShapeId);
  const selectedHex = normalizeSelectedHex(selectedColor?.hex);
  const layerColor = enabled && selectedHex ? selectedHex : preset.color;
  const label =
    enabled && selectedColor?.label
      ? `${preset.label} ${selectedColor.label}`
      : preset.label;

  return {
    ...preset,
    blendMode: resolveBlendModeForRegion(region, texture),
    color: layerColor,
    coverage: resolveCoverageForRegion(region, selectedShapeId),
    enabled,
    feather: resolveFeatherForRegion(region, selectedShapeId),
    id: `${region}-${maskTextureId}`,
    intensity: enabled ? 1 : 0,
    label,
    maskTextureId,
    opacity: enabled
      ? resolveOpacityForRegion(region, selectedTextureId, selectedTypeId)
      : 0,
    rendererMode: 'smooth-region-mask',
    texture,
    textureMode: 'sample',
  };
}

function resolveTextureForRegion(
  region: UnityMakeupLayerRegion,
  selectedTextureId = '',
  selectedTypeId = '',
  selectedShapeId = '',
): string {
  if (region === 'lip') {
    if (selectedShapeId === 'lip-over') {
      return 'overline_lip';
    }

    if (
      includesAny(selectedTextureId, ['matte', 'velvet']) ||
      includesAny(selectedTypeId, ['lipstick'])
    ) {
      return 'matte_lip';
    }

    if (
      includesAny(selectedTextureId, ['glow', 'glass', 'balmy', 'satin']) ||
      includesAny(selectedTypeId, ['gloss', 'balm', 'tint'])
    ) {
      return 'gloss_lip';
    }

    return 'gradient_lip';
  }

  if (region === 'brow') {
    return selectedShapeId === 'brow-soft-arch' ? 'soft_brow' : 'natural_brow';
  }

  return UNITY_MAKEUP_LAYER_PRESETS[region].texture;
}

function resolveMaskTextureIdForRegion(
  region: UnityMakeupLayerRegion,
  selectedShapeId = '',
): string {
  if (region === 'lip' && selectedShapeId === 'lip-gradient') {
    return 'lip-drawn-gradient-density-atlas-v1';
  }

  if (region === 'cheek' && selectedShapeId === 'cheek-diagonal') {
    return 'cheek-sunkissed-mask1-v1';
  }

  if (region === 'cheek' && selectedShapeId === 'cheek-round') {
    return 'cheek-lovely-mask-v1';
  }

  if (region === 'brow' && selectedShapeId === 'brow-soft-arch') {
    return 'brow-soft-arch-fine-hair-v1';
  }

  if (region === 'brow' && selectedShapeId === 'brow-straight') {
    return 'brow-png-dailyflat-sharp-v1';
  }

  return UNITY_MAKEUP_LAYER_PRESETS[region].maskTextureId;
}

function resolveOpacityForRegion(
  region: UnityMakeupLayerRegion,
  selectedTextureId = '',
  selectedTypeId = '',
): number {
  const defaultOpacity = UNITY_MAKEUP_LAYER_PRESETS[region].opacity;

  if (region === 'lip' && includesAny(selectedTextureId, ['glass', 'glow', 'balmy'])) {
    return 0.86;
  }

  if (region === 'eye' && includesAny(selectedTypeId, ['liner'])) {
    return 0.64;
  }

  return defaultOpacity;
}

function resolveCoverageForRegion(
  region: UnityMakeupLayerRegion,
  selectedShapeId = '',
): number {
  if (region === 'lip') {
    return selectedShapeId === 'lip-over' ? 0.84 : 0.72;
  }

  if (region === 'cheek') {
    return selectedShapeId === 'cheek-round' ? 0.66 : 0.72;
  }

  if (region === 'eye') {
    return selectedShapeId === 'eye-tail' ? 0.5 : 0.4;
  }

  return selectedShapeId === 'brow-straight' ? 0.9 : 0.82;
}

function resolveFeatherForRegion(
  region: UnityMakeupLayerRegion,
  selectedShapeId = '',
): number {
  if (region === 'brow') {
    return selectedShapeId === 'brow-soft-arch' ? 0.38 : 0.34;
  }

  if (region === 'eye') {
    return 0.24;
  }

  return selectedShapeId === 'cheek-round' ? 0.3 : 0.24;
}

function resolveBlendModeForRegion(
  region: UnityMakeupLayerRegion,
  texture: string,
): UnityMakeupLayer['blendMode'] {
  return region === 'eye' || texture === 'gloss_lip' ? 'screen' : 'normal';
}

function normalizeSelectedHex(hex: string | undefined): string | null {
  if (!hex || !hex.startsWith('#')) {
    return null;
  }

  return hex;
}

function includesAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some(token => value.toLowerCase().includes(token));
}

function sanitizeRecipeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function serializeUnityMakeupRecipeBatch(
  recipeBatch: UnityMakeupRecipeBatch,
): string {
  return JSON.stringify(recipeBatch);
}

type NativeUnityMakeupBridge = {
  hideView?: () => void;
  isFrameworkAvailable?: () => boolean;
  isReady?: () => boolean;
  isRuntimeAvailable?: () => boolean;
  postMessage?: (gameObject: string, method: string, payload: string) => void;
  prepareFramework?: () => void;
  prepareRuntime?: () => void;
};

function getNativeUnityMakeupBridge(): NativeUnityMakeupBridge | undefined {
  return NativeModules.UnityMakeupBridge as NativeUnityMakeupBridge | undefined;
}

let latestNativePostSequence = 0;
let scheduledNativePostTimers: ReturnType<typeof setTimeout>[] = [];
let nativeUnityEventEmitter: NativeEventEmitter | null = null;

export function isUnityMakeupFrameworkAvailable(): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();

  return (
    nativeBridge?.isFrameworkAvailable?.() ??
    nativeBridge?.isRuntimeAvailable?.() ??
    Boolean(nativeBridge?.postMessage)
  );
}

export function isUnityMakeupReady(): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();

  return nativeBridge?.isReady?.() ?? false;
}

export function prepareUnityMakeupRuntime(): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();
  const canPrepare =
    nativeBridge?.isFrameworkAvailable?.() === true &&
    typeof nativeBridge.prepareRuntime === 'function';

  if (!canPrepare) {
    return false;
  }

  nativeBridge.prepareRuntime?.();
  return true;
}

export function prepareUnityMakeupFramework(): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();
  const canPrepare =
    nativeBridge?.isFrameworkAvailable?.() === true &&
    typeof nativeBridge.prepareFramework === 'function';

  if (!canPrepare) {
    return false;
  }

  nativeBridge.prepareFramework?.();
  return true;
}

export function hideUnityMakeupView(): void {
  const nativeBridge = getNativeUnityMakeupBridge();

  nativeBridge?.hideView?.();
}

function getNativeUnityEventEmitter(): NativeEventEmitter | null {
  const nativeBridge = getNativeUnityMakeupBridge();

  if (!nativeBridge) {
    return null;
  }

  if (!nativeUnityEventEmitter) {
    nativeUnityEventEmitter = new NativeEventEmitter(
      NativeModules.UnityMakeupBridge,
    );
  }

  return nativeUnityEventEmitter;
}

export function addUnityMakeupEventListener(
  listener: (event: {message?: string}) => void,
) {
  const eventEmitter = getNativeUnityEventEmitter();

  if (!eventEmitter) {
    return {remove: () => undefined};
  }

  return eventEmitter.addListener(UNITY_MAKEUP_NATIVE_EVENT_NAME, listener);
}

function clearScheduledNativePosts() {
  scheduledNativePostTimers.forEach(timer => clearTimeout(timer));
  scheduledNativePostTimers = [];
}

function sendNativeUnityMessage(nativeBridge: NativeUnityMakeupBridge, payload: string) {
  nativeBridge.postMessage?.(
    UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
    UNITY_MAKEUP_BRIDGE_TARGET.applyRecipeMethod,
    payload,
  );
}

function postNativeUnityMessageWithWarmupRetries(
  nativeBridge: NativeUnityMakeupBridge,
  payload: string,
) {
  latestNativePostSequence += 1;
  const postSequence = latestNativePostSequence;
  clearScheduledNativePosts();

  scheduledNativePostTimers = [0, 250, 750, 1500, 2500, 4000, 6000, 8000].map(delayMs =>
    setTimeout(() => {
      if (
        postSequence !== latestNativePostSequence ||
        !isUnityMakeupFrameworkAvailable() ||
        !isUnityMakeupReady()
      ) {
        return;
      }

      sendNativeUnityMessage(nativeBridge, payload);
    }, delayMs),
  );
}

export function postUnityMakeupRecipe(recipeBatch: UnityMakeupRecipeBatch): boolean {
  const payload = serializeUnityMakeupRecipeBatch(recipeBatch);
  const nativeBridge = getNativeUnityMakeupBridge();
  const canUseBridge = isUnityMakeupFrameworkAvailable();

  if (nativeBridge?.postMessage && canUseBridge) {
    postNativeUnityMessageWithWarmupRetries(nativeBridge, payload);

    return true;
  }

  console.info('[aura:unity] makeup-recipe:fallback-log', {
    activeRegions: recipeBatch.activeRegions,
    layerCount: recipeBatch.layerCount,
    target: UNITY_MAKEUP_BRIDGE_TARGET,
  });

  return false;
}
