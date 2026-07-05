import {NativeEventEmitter, NativeModules} from 'react-native';

import type {
  FilterColorOption,
  MakeupArea,
  MakeupFilter,
} from '../../../shared/types/makeupGuide';
import {
  DEFAULT_FULL_FACE_REGION_CONTROLS,
  FULL_FACE_REGION_RUNTIME_ASSETS,
  MAKEUP_RECIPE_REGIONS,
  PRODUCT_REGION_LABELS,
  buildFullFaceMakeupRecipe,
  createDefaultRegionParams,
  getMakeupRecipeRegionsForArea,
  type FullFaceMakeupRecipe,
  type FullFaceMakeupRecipeLayer,
  type UnitySynchronizedCaptureRequest,
  type FullFaceRegionControls,
  type MakeupRecipeRegion,
} from '../../../shared/contracts/fullFaceMakeupRecipe';
import {ORIGINAL_OPTION_CARD_ID} from './arFilterOptionRules';

export const UNITY_MAKEUP_BRIDGE_TARGET = {
  gameObject: 'RNBridge',
  applyRecipeMethod: 'ApplyRecipeJson',
  captureReferenceFrameMethod: 'CaptureE7ReferenceFrameJson',
  applyGeneratedBrowMaskMethod: 'ApplyGeneratedBrowMaskJson',
  applyGeneratedLipMaskMethod: 'ApplyGeneratedLipMaskJson',
  regionOverlayVisibilityMethod: 'SetE7RegionOverlayVisibleJson',
} as const;

export const UNITY_MAKEUP_NATIVE_EVENT_NAME = 'UnityMakeupEvent';

export type UnityMakeupRegion = MakeupRecipeRegion;

export type UnityMakeupLayerRegion = MakeupRecipeRegion;

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

export type UnityMakeupLayer = FullFaceMakeupRecipeLayer;

export type UnityMakeupRecipeBatch = FullFaceMakeupRecipe;

export type UnityGeneratedMaskBridgeKind = 'lip' | 'brow';

export type UnityGeneratedMaskBridgeRoute = {
  eventName: 'generated_lip_mask_apply' | 'generated_brow_mask_apply';
  method: typeof UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedLipMaskMethod
    | typeof UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedBrowMaskMethod;
  retryKeyPrefix: 'generated-lip-mask' | 'generated-brow-mask';
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

export const UNITY_MAKEUP_LAYER_ORDER: readonly UnityMakeupLayerRegion[] =
  MAKEUP_RECIPE_REGIONS;

export const UNITY_MAKEUP_LAYER_PRESETS: Record<
  UnityMakeupLayerRegion,
  UnityMakeupRegionPreset
> = {
  foundation: {
    branchSource: 'makeupAR-full-face',
    color: '#E8C9B5',
    finish: 'natural-foundation',
    label: PRODUCT_REGION_LABELS.foundation,
    maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.foundation.maskTextureId,
    opacity: 0.65,
    region: 'foundation',
    texture: 'foundation_natural',
  },
  lip: {
    branchSource: 'makeupAR-full-face',
    color: '#D94B74',
    finish: 'gradient-lip',
    label: PRODUCT_REGION_LABELS.lip,
    maskTextureId: 'lip-drawn-style-atlas-v1',
    opacity: 0.95,
    region: 'lip',
    texture: 'gradient_lip',
  },
  blush: {
    branchSource: 'makeupAR-full-face',
    color: '#E67B5F',
    finish: 'powder-blush',
    label: PRODUCT_REGION_LABELS.blush,
    maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.blush.maskTextureId,
    opacity: 0.78,
    region: 'blush',
    texture: 'soft_blush',
  },
  eyeliner: {
    branchSource: 'makeupAR-full-face',
    color: '#8A756E',
    finish: 'soft-eye-shimmer',
    label: PRODUCT_REGION_LABELS.eyeliner,
    maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.eyeliner.maskTextureId,
    opacity: 0.52,
    region: 'eyeliner',
    texture: 'shimmer_eye',
  },
  brow: {
    branchSource: 'makeupAR-psd-brow',
    color: '#4A342B',
    finish: 'soft-powder-brow',
    label: PRODUCT_REGION_LABELS.brow,
    maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.brow.maskTextureId,
    opacity: 0.92,
    region: 'brow',
    texture: 'natural_brow',
  },
};

export const UNITY_MAKEUP_REGION_PRESETS: Record<
  UnityMakeupRegion,
  UnityMakeupRegionPreset
> = {
  foundation: UNITY_MAKEUP_LAYER_PRESETS.foundation,
  brow: UNITY_MAKEUP_LAYER_PRESETS.brow,
  blush: UNITY_MAKEUP_LAYER_PRESETS.blush,
  eyeliner: UNITY_MAKEUP_LAYER_PRESETS.eyeliner,
  lip: UNITY_MAKEUP_LAYER_PRESETS.lip,
};

export function getUnityMakeupLayerRegionsForMakeupArea(
  selectedMakeupArea: MakeupArea,
): readonly UnityMakeupLayerRegion[] {
  return getMakeupRecipeRegionsForArea(selectedMakeupArea);
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

  const activeRegions = UNITY_MAKEUP_LAYER_ORDER.filter(region =>
    layerSelections.has(region),
  );
  const recipeAreas = selections
    .map(selection => sanitizeRecipeIdPart(selection.selectedMakeupArea))
    .join('_');

  return buildFullFaceMakeupRecipe({
    controls: createUnityMakeupControlsForRegions({
      activeRegions,
      layerSelections,
    }),
    recipeId: ['rn-filter-combined', recipeAreas || 'none', sentAtMs].join('-'),
    recipeBatchId: ['rn-filter-combined', recipeAreas || 'none', sentAtMs].join('-'),
    sentAtMs,
  });
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
  const layerSelections = new Map<UnityMakeupLayerRegion, UnityMakeupARFilterSelection>();

  activeRegions.forEach(region => {
    const preset = UNITY_MAKEUP_LAYER_PRESETS[region];

    layerSelections.set(region, {
      selectedColor: selectedColor ?? {
        hex: preset.color,
        label: preset.label,
      },
      selectedColorId: 'unity-region-color',
      selectedMakeupArea: region === 'foundation'
        ? 'base'
        : region === 'blush'
        ? 'cheek'
        : region === 'eyeliner'
        ? 'eye'
        : region,
      selectedMakeupFilter: {
        id: 'unity-region-recipe',
        imageSource: 1,
        categoryId: 'recommended',
        title: preset.label,
        subtitle: preset.label,
        intensityLabel: '',
        makeupAreas: [],
        colorOptions: [],
        typeOptions: [],
        textureOptions: [],
      },
      selectedPointMakeupLookId: '',
      selectedShapeId: selectedShapeId ?? '',
      selectedTextureId: selectedTextureId ?? '',
      selectedTotalMakeupLookId: null,
      selectedTypeId: selectedTypeId ?? '',
    });
  });

  return buildFullFaceMakeupRecipe({
    controls: createUnityMakeupControlsForRegions({
      activeRegions,
      layerSelections,
    }),
    recipeId: recipeBatchId,
    recipeBatchId,
    sentAtMs,
  });
}

function createUnityMakeupControlsForRegions({
  activeRegions,
  layerSelections,
}: {
  activeRegions: readonly UnityMakeupLayerRegion[];
  layerSelections: ReadonlyMap<UnityMakeupLayerRegion, UnityMakeupARFilterSelection>;
}): FullFaceRegionControls {
  const activeRegionSet = new Set(activeRegions);

  return UNITY_MAKEUP_LAYER_ORDER.reduce((controls, region) => {
    const selection = layerSelections.get(region);
    const defaultControl = DEFAULT_FULL_FACE_REGION_CONTROLS[region];
    const preset = UNITY_MAKEUP_LAYER_PRESETS[region];
    const selectedHex = normalizeSelectedHex(selection?.selectedColor.hex);
    const selectedShapeId = selection?.selectedShapeId ?? '';
    const selectedTextureId = selection?.selectedTextureId ?? '';
    const selectedTypeId = selection?.selectedTypeId ?? '';
    const params = createDefaultRegionParams(region);

    params.coverage = resolveCoverageForRegion(region, selectedShapeId);
    params.feather = resolveFeatherForRegion(region, selectedShapeId);
    params.maskThreshold = resolveMaskThresholdForRegion(region);

    return {
      ...controls,
      [region]: {
        ...defaultControl,
        enabled: activeRegionSet.has(region),
        colorHex: selectedHex ?? preset.color,
        opacity: resolveOpacityForRegion(region, selectedTextureId, selectedTypeId),
        intensity: activeRegionSet.has(region) ? 1 : 0,
        params,
      },
    };
  }, {} as FullFaceRegionControls);
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

function resolveOpacityForRegion(
  region: UnityMakeupLayerRegion,
  selectedTextureId = '',
  selectedTypeId = '',
): number {
  const defaultOpacity = UNITY_MAKEUP_LAYER_PRESETS[region].opacity;

  if (region === 'lip' && includesAny(selectedTextureId, ['glass', 'glow', 'balmy'])) {
    return 0.86;
  }

  if (region === 'eyeliner' && includesAny(selectedTypeId, ['liner'])) {
    return 0.64;
  }

  if (region === 'foundation') {
    return 0.65;
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

  if (region === 'blush') {
    return selectedShapeId === 'cheek-round' ? 0.66 : 0.72;
  }

  if (region === 'eyeliner') {
    return selectedShapeId === 'eye-tail' ? 0.5 : 0.4;
  }

  if (region === 'foundation') {
    return 0.6;
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

  if (region === 'eyeliner') {
    return 0.24;
  }

  if (region === 'foundation') {
    return 0.42;
  }

  return selectedShapeId === 'cheek-round' ? 0.3 : 0.24;
}

function resolveMaskThresholdForRegion(region: UnityMakeupLayerRegion): number {
  if (region === 'lip') {
    return 0.35;
  }

  if (region === 'blush') {
    return 0.18;
  }

  if (region === 'brow') {
    return 0.035;
  }

  if (region === 'foundation') {
    return 0.04;
  }

  return 0.12;
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

function readJsonStringField(
  value: unknown,
  field: string,
): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const fieldValue = record[field];

  return typeof fieldValue === 'string' && fieldValue.trim().length > 0
    ? fieldValue.trim()
    : undefined;
}

function readJsonNumberField(
  value: unknown,
  field: string,
): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const fieldValue = record[field];

  return typeof fieldValue === 'number' && Number.isFinite(fieldValue)
    ? fieldValue
    : undefined;
}

function extractGeneratedLipMaskMetadata(payload: string): {
  messageId: string;
  packageId: string;
} {
  try {
    const parsed = JSON.parse(payload) as unknown;
    const generatedMaskId =
      readJsonStringField(parsed, 'generatedMaskId') ??
      readJsonStringField(parsed, 'maskTextureId') ??
      readJsonStringField(parsed, 'captureSetId');
    const packageId = generatedMaskId ?? `generated-lip-payload-${payload.length}`;
    const revision =
      readJsonNumberField(parsed, 'validationControlRequestId') ??
      readJsonNumberField(parsed, 'controlRequestId') ??
      readJsonNumberField(parsed, 'validationControlRevision') ??
      readJsonNumberField(parsed, 'controlRevision') ??
      0;

    return {
      messageId: sanitizeRecipeIdPart(`${packageId}-${revision}-${payload.length}`),
      packageId,
    };
  } catch {
    return {
      messageId: sanitizeRecipeIdPart(`generated-lip-unparsed-${payload.length}`),
      packageId: `generated-lip-unparsed-${payload.length}`,
    };
  }
}

function extractGeneratedBrowMaskMetadata(payload: string): {
  messageId: string;
  packageId: string;
} {
  try {
    const parsed = JSON.parse(payload) as unknown;
    const generatedMaskId =
      readJsonStringField(parsed, 'generatedMaskId') ??
      readJsonStringField(parsed, 'maskTextureId') ??
      readJsonStringField(parsed, 'captureSetId');
    const packageId = generatedMaskId ?? `generated-brow-payload-${payload.length}`;
    const revision =
      readJsonNumberField(parsed, 'validationControlRequestId') ??
      readJsonNumberField(parsed, 'controlRequestId') ??
      readJsonNumberField(parsed, 'validationControlRevision') ??
      readJsonNumberField(parsed, 'controlRevision') ??
      0;

    return {
      messageId: sanitizeRecipeIdPart(`${packageId}-${revision}-${payload.length}`),
      packageId,
    };
  } catch {
    return {
      messageId: sanitizeRecipeIdPart(`generated-brow-unparsed-${payload.length}`),
      packageId: `generated-brow-unparsed-${payload.length}`,
    };
  }
}

export function getUnityGeneratedMaskBridgeRoute(
  kind: UnityGeneratedMaskBridgeKind,
): UnityGeneratedMaskBridgeRoute {
  if (kind === 'brow') {
    return {
      eventName: 'generated_brow_mask_apply',
      method: UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedBrowMaskMethod,
      retryKeyPrefix: 'generated-brow-mask',
    };
  }

  return {
    eventName: 'generated_lip_mask_apply',
    method: UNITY_MAKEUP_BRIDGE_TARGET.applyGeneratedLipMaskMethod,
    retryKeyPrefix: 'generated-lip-mask',
  };
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
  postMessageWithMetadata?: (
    gameObject: string,
    method: string,
    payload: string,
    metadata: string,
  ) => void;
  prepareFramework?: () => void;
  prepareRuntime?: () => void;
};

function getNativeUnityMakeupBridge(): NativeUnityMakeupBridge | undefined {
  return NativeModules.UnityMakeupBridge as NativeUnityMakeupBridge | undefined;
}

type NativeUnityPostMetadata = {
  eventName: string;
  messageId: string;
  packageId?: string;
  payloadBytes: number;
  retryKey: string;
};

type ScheduledNativePost = {
  attemptNumber: number;
  createdAtMs: number;
  metadata: NativeUnityPostMetadata;
  method: string;
  payload: string;
  sequence: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const NATIVE_UNITY_RETRY_DELAYS_MS = [0, 250, 750, 1500, 2500, 4000, 6000, 8000];
const GENERATED_LIP_MASK_NATIVE_SEND_RETRY_DELAY_MS = 1500;
const GENERATED_LIP_MASK_NATIVE_SEND_MAX_ATTEMPTS = 24;

let latestNativePostSequence = 0;
const scheduledNativePosts = new Map<string, ScheduledNativePost>();
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

  return eventEmitter.addListener(UNITY_MAKEUP_NATIVE_EVENT_NAME, event => {
    handleUnityMakeupNativeEvent(event);
    listener(event);
  });
}

function clearScheduledNativePost(retryKey: string) {
  const scheduledPost = scheduledNativePosts.get(retryKey);

  if (!scheduledPost) {
    return;
  }

  if (scheduledPost.timer) {
    clearTimeout(scheduledPost.timer);
  }
  scheduledNativePosts.delete(retryKey);
}

function clearGeneratedLipMaskNativePosts() {
  Array.from(scheduledNativePosts.keys())
    .filter(retryKey => retryKey.startsWith('generated-lip-mask:'))
    .forEach(clearScheduledNativePost);
}

function clearGeneratedBrowMaskNativePosts() {
  Array.from(scheduledNativePosts.keys())
    .filter(retryKey => retryKey.startsWith('generated-brow-mask:'))
    .forEach(clearScheduledNativePost);
}

function handleUnityMakeupNativeEvent(event: {message?: string}) {
  if (!event.message) {
    return;
  }

  try {
    const parsed = JSON.parse(event.message) as {
      generatedMaskId?: string;
      type?: string;
    };

    if (parsed.type === 'generated_lip_mask_applied') {
      clearGeneratedLipMaskNativePosts();
      return;
    }

    if (parsed.type === 'generated_brow_mask_applied') {
      // Unity keeps streaming applied events (applyTrigger=runtime_sample) for
      // whatever mask is currently active. Only clear retry loops whose payload
      // matches the applied mask id — otherwise a stale mask's stream cancels a
      // freshly scheduled shape/color payload before its first send fires.
      const appliedMaskId = parsed.generatedMaskId;
      if (typeof appliedMaskId === 'string' && appliedMaskId.length > 0) {
        Array.from(scheduledNativePosts.entries())
          .filter(
            ([retryKey, post]) =>
              retryKey.startsWith('generated-brow-mask:') &&
              post.metadata.packageId === appliedMaskId,
          )
          .forEach(([retryKey]) => clearScheduledNativePost(retryKey));
        return;
      }
      clearGeneratedBrowMaskNativePosts();
    }
  } catch {
    // Unity also sends diagnostic strings that are intentionally passed through.
  }
}

function getNativeUnityRetryDelayMs(attemptNumber: number): number {
  return (
    NATIVE_UNITY_RETRY_DELAYS_MS[attemptNumber - 1] ??
    NATIVE_UNITY_RETRY_DELAYS_MS[NATIVE_UNITY_RETRY_DELAYS_MS.length - 1]
  );
}

function getNativeUnityMaxAttempts(metadata: NativeUnityPostMetadata): number {
  return metadata.eventName === 'generated_lip_mask_apply' ||
    metadata.eventName === 'generated_brow_mask_apply'
    ? GENERATED_LIP_MASK_NATIVE_SEND_MAX_ATTEMPTS
    : NATIVE_UNITY_RETRY_DELAYS_MS.length;
}

function scheduleNativePostAttempt(retryKey: string, delayMs: number) {
  const scheduledPost = scheduledNativePosts.get(retryKey);

  if (!scheduledPost) {
    return;
  }

  if (scheduledPost.timer) {
    clearTimeout(scheduledPost.timer);
  }

  scheduledPost.timer = setTimeout(() => {
    runScheduledNativePostAttempt(retryKey);
  }, delayMs);
}

function scheduleNextNativePostAttempt(
  scheduledPost: ScheduledNativePost,
  unityReady: boolean,
) {
  const maxAttempts = getNativeUnityMaxAttempts(scheduledPost.metadata);

  if (scheduledPost.attemptNumber >= maxAttempts) {
    console.info('[aura:unity] native-send:exhausted', {
      attemptNumber: scheduledPost.attemptNumber,
      eventName: scheduledPost.metadata.eventName,
      messageId: scheduledPost.metadata.messageId,
      method: scheduledPost.method,
      packageId: scheduledPost.metadata.packageId,
      payloadBytes: scheduledPost.payload.length,
      retryKey: scheduledPost.metadata.retryKey,
      waitedMs: Date.now() - scheduledPost.createdAtMs,
    });
    clearScheduledNativePost(scheduledPost.metadata.retryKey);
    return;
  }

  const delayMs =
    (scheduledPost.metadata.eventName === 'generated_lip_mask_apply' ||
      scheduledPost.metadata.eventName === 'generated_brow_mask_apply') &&
    unityReady
      ? Math.max(
          getNativeUnityRetryDelayMs(scheduledPost.attemptNumber + 1),
          GENERATED_LIP_MASK_NATIVE_SEND_RETRY_DELAY_MS,
        )
      : getNativeUnityRetryDelayMs(scheduledPost.attemptNumber + 1);

  scheduleNativePostAttempt(scheduledPost.metadata.retryKey, delayMs);
}

function runScheduledNativePostAttempt(retryKey: string) {
  const scheduledPost = scheduledNativePosts.get(retryKey);

  if (!scheduledPost) {
    return;
  }

  scheduledPost.timer = null;

  const nativeBridge = getNativeUnityMakeupBridge();
  const attemptNumber = scheduledPost.attemptNumber + 1;
  scheduledPost.attemptNumber = attemptNumber;

  const frameworkAvailable = isUnityMakeupFrameworkAvailable();
  const unityReady = isUnityMakeupReady();
  const unityWarm = frameworkAvailable && !unityReady;

  console.info('[aura:unity] native-send:attempt', {
    attemptNumber,
    delayMs: attemptNumber === 1 ? 0 : getNativeUnityRetryDelayMs(attemptNumber),
    eventName: scheduledPost.metadata.eventName,
    frameworkAvailable,
    gameObject: UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
    messageId: scheduledPost.metadata.messageId,
    method: scheduledPost.method,
    packageId: scheduledPost.metadata.packageId,
    payloadBytes: scheduledPost.payload.length,
    retryKey,
    unityReady,
    unityWarm,
  });

  if (!nativeBridge?.postMessage || !frameworkAvailable) {
    scheduleNextNativePostAttempt(scheduledPost, unityReady);
    return;
  }

  if (!unityReady) {
    nativeBridge.prepareRuntime?.();
    scheduleNextNativePostAttempt(scheduledPost, unityReady);
    return;
  }

  sendNativeUnityMethod(nativeBridge, scheduledPost.method, scheduledPost.payload, {
    ...scheduledPost.metadata,
    attemptNumber,
    unityReady,
    unityWarm,
  });

  if (
    scheduledPost.metadata.eventName === 'generated_lip_mask_apply' ||
    scheduledPost.metadata.eventName === 'generated_brow_mask_apply'
  ) {
    scheduleNextNativePostAttempt(scheduledPost, unityReady);
    return;
  }

  clearScheduledNativePost(retryKey);
}

function sendNativeUnityMethod(
  nativeBridge: NativeUnityMakeupBridge,
  method: string,
  payload: string,
  metadata?: NativeUnityPostMetadata & {attemptNumber?: number; unityReady?: boolean; unityWarm?: boolean},
) {
  const payloadBytes = payload.length;
  const metadataPayload = metadata
    ? JSON.stringify({
        attemptNumber: metadata.attemptNumber,
        eventName: metadata.eventName,
        gameObject: UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
        messageId: metadata.messageId,
        method,
        packageId: metadata.packageId,
        payloadBytes,
        retryKey: metadata.retryKey,
        unityReady: metadata.unityReady,
        unityWarm: metadata.unityWarm,
      })
    : undefined;

  console.info('[aura:unity] native-send:dispatch', {
    attemptNumber: metadata?.attemptNumber,
    eventName: metadata?.eventName ?? 'unity_method',
    gameObject: UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
    messageId: metadata?.messageId,
    method,
    packageId: metadata?.packageId,
    payloadBytes,
    retryKey: metadata?.retryKey,
    unityReady: metadata?.unityReady,
    unityWarm: metadata?.unityWarm,
  });

  if (metadataPayload && nativeBridge.postMessageWithMetadata) {
    nativeBridge.postMessageWithMetadata(
      UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
      method,
      payload,
      metadataPayload,
    );
    return;
  }

  nativeBridge.postMessage?.(UNITY_MAKEUP_BRIDGE_TARGET.gameObject, method, payload);
}

function sendNativeUnityMessage(nativeBridge: NativeUnityMakeupBridge, payload: string) {
  sendNativeUnityMethod(
    nativeBridge,
    UNITY_MAKEUP_BRIDGE_TARGET.applyRecipeMethod,
    payload,
  );
}

function sendNativeUnityCaptureRequest(
  nativeBridge: NativeUnityMakeupBridge,
  payload: string,
) {
  nativeBridge.postMessage?.(
    UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
    UNITY_MAKEUP_BRIDGE_TARGET.captureReferenceFrameMethod,
    payload,
  );
}

function postNativeUnityMessageWithWarmupRetries(
  nativeBridge: NativeUnityMakeupBridge,
  payload: string,
  method: string = UNITY_MAKEUP_BRIDGE_TARGET.applyRecipeMethod,
  metadata: {
    eventName?: string;
    messageId?: string;
    packageId?: string;
    retryKey?: string;
  } = {},
) {
  latestNativePostSequence += 1;
  const sequence = latestNativePostSequence;
  const retryKey = metadata.retryKey ?? `${method}:latest`;
  const messageId = metadata.messageId ?? `${retryKey}:${sequence}`;
  const eventName = metadata.eventName ?? 'unity_method';
  const postMetadata: NativeUnityPostMetadata = {
    eventName,
    messageId,
    packageId: metadata.packageId,
    payloadBytes: payload.length,
    retryKey,
  };

  clearScheduledNativePost(retryKey);
  scheduledNativePosts.set(retryKey, {
    attemptNumber: 0,
    createdAtMs: Date.now(),
    metadata: postMetadata,
    method,
    payload,
    sequence,
    timer: null,
  });
  nativeBridge.prepareRuntime?.();
  scheduleNativePostAttempt(retryKey, getNativeUnityRetryDelayMs(1));
}

export function postUnityMakeupRecipe(recipeBatch: UnityMakeupRecipeBatch): boolean {
  const payload = serializeUnityMakeupRecipeBatch(recipeBatch);
  const nativeBridge = getNativeUnityMakeupBridge();
  const canUseBridge = isUnityMakeupFrameworkAvailable();

  if (nativeBridge?.postMessage && canUseBridge) {
    postNativeUnityMessageWithWarmupRetries(nativeBridge, payload, UNITY_MAKEUP_BRIDGE_TARGET.applyRecipeMethod, {
      eventName: 'makeup_recipe_apply',
      messageId: `makeup-recipe:${recipeBatch.recipeBatchId}:${Date.now()}`,
      packageId: recipeBatch.recipeBatchId,
      retryKey: `${UNITY_MAKEUP_BRIDGE_TARGET.applyRecipeMethod}:latest`,
    });

    return true;
  }

  console.info('[aura:unity] makeup-recipe:fallback-log', {
    activeRegions: recipeBatch.activeRegions,
    layerCount: recipeBatch.layerCount,
    target: UNITY_MAKEUP_BRIDGE_TARGET,
  });

  return false;
}

export function postUnityGeneratedLipMaskPayload(payload: string): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();
  const canUseBridge = isUnityMakeupFrameworkAvailable();
  const lipMaskMetadata = extractGeneratedLipMaskMetadata(payload);
  const lipRoute = getUnityGeneratedMaskBridgeRoute('lip');

  if (nativeBridge?.postMessage && canUseBridge) {
    postNativeUnityMessageWithWarmupRetries(
      nativeBridge,
      payload,
      lipRoute.method,
      {
        eventName: lipRoute.eventName,
        messageId: lipMaskMetadata.messageId,
        packageId: lipMaskMetadata.packageId,
        retryKey: `${lipRoute.retryKeyPrefix}:${lipMaskMetadata.messageId}`,
      },
    );

    return true;
  }

  console.info('[aura:unity] generated-lip-mask:fallback-log', {
    messageId: lipMaskMetadata.messageId,
    packageId: lipMaskMetadata.packageId,
    payloadBytes: payload.length,
    target: {
      gameObject: UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
      method: lipRoute.method,
    },
  });

  return false;
}

export function postUnityGeneratedBrowMaskPayload(payload: string): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();
  const canUseBridge = isUnityMakeupFrameworkAvailable();
  const browMaskMetadata = extractGeneratedBrowMaskMetadata(payload);
  const browRoute = getUnityGeneratedMaskBridgeRoute('brow');

  if (nativeBridge?.postMessage && canUseBridge) {
    // Cancel any in-flight retry loops for previous brow payloads. Each payload
    // otherwise keeps re-sending for up to 24 attempts / 8s under its own
    // retryKey, so a stale shape/color would race with — and overwrite — the one
    // the user just selected. Only the latest brow payload should be retried.
    clearGeneratedBrowMaskNativePosts();
    postNativeUnityMessageWithWarmupRetries(
      nativeBridge,
      payload,
      browRoute.method,
      {
        eventName: browRoute.eventName,
        messageId: browMaskMetadata.messageId,
        packageId: browMaskMetadata.packageId,
        retryKey: `${browRoute.retryKeyPrefix}:${browMaskMetadata.messageId}`,
      },
    );

    return true;
  }

  console.info('[aura:unity] generated-brow-mask:fallback-log', {
    messageId: browMaskMetadata.messageId,
    packageId: browMaskMetadata.packageId,
    payloadBytes: payload.length,
    target: {
      gameObject: UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
      method: browRoute.method,
    },
  });

  return false;
}

export function postUnityRegionOverlayVisibility({
  diagnosticsHudVisible = false,
  guideOverlayVisible = false,
  maskOverlayVisible = true,
  reason,
  visible,
}: {
  diagnosticsHudVisible?: boolean;
  guideOverlayVisible?: boolean;
  maskOverlayVisible?: boolean;
  reason: string;
  visible: boolean;
}): boolean {
  const payload = JSON.stringify({
    diagnosticsHudVisible,
    guideOverlayVisible,
    maskOverlayVisible,
    reason,
    validationViewMode: 'clean',
    visible,
  });
  const nativeBridge = getNativeUnityMakeupBridge();
  const canUseBridge = isUnityMakeupFrameworkAvailable();

  if (nativeBridge?.postMessage && canUseBridge) {
    sendNativeUnityMethod(
      nativeBridge,
      UNITY_MAKEUP_BRIDGE_TARGET.regionOverlayVisibilityMethod,
      payload,
      {
        eventName: 'region_overlay_visibility',
        messageId: `region-overlay:${reason}:${Date.now()}`,
        packageId: reason,
        payloadBytes: payload.length,
        retryKey: `${UNITY_MAKEUP_BRIDGE_TARGET.regionOverlayVisibilityMethod}:immediate`,
      },
    );
    return true;
  }

  return false;
}

export function postUnitySynchronizedCaptureRequest(
  request: UnitySynchronizedCaptureRequest,
): boolean {
  const payload = JSON.stringify(request);
  const nativeBridge = getNativeUnityMakeupBridge();
  const canUseBridge = isUnityMakeupFrameworkAvailable();

  if (nativeBridge?.postMessage && canUseBridge) {
    sendNativeUnityMethod(nativeBridge, UNITY_MAKEUP_BRIDGE_TARGET.captureReferenceFrameMethod, payload, {
      eventName: 'synchronized_capture_request',
      messageId: request.capturePairId,
      packageId: request.captureSetId,
      payloadBytes: payload.length,
      retryKey: `${UNITY_MAKEUP_BRIDGE_TARGET.captureReferenceFrameMethod}:${request.capturePairId}`,
    });
    return true;
  }

  console.info('[aura:unity] capture-request:fallback-log', {
    capturePairId: request.capturePairId,
    captureSetId: request.captureSetId,
    captureShotKind: request.captureShotKind,
    target: {
      gameObject: UNITY_MAKEUP_BRIDGE_TARGET.gameObject,
      method: UNITY_MAKEUP_BRIDGE_TARGET.captureReferenceFrameMethod,
    },
  });

  return false;
}
