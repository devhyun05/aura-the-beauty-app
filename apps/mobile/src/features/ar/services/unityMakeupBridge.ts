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
  type HalfFaceMode,
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
    opacity: 0.38,
    region: 'foundation',
    texture: 'foundation_natural',
  },
  lip: {
    branchSource: 'makeupAR-full-face',
    color: '#D94B74',
    finish: 'gradient-lip',
    label: PRODUCT_REGION_LABELS.lip,
    maskTextureId: 'lip-drawn-style-atlas-v1',
    opacity: 0.85,
    region: 'lip',
    texture: 'gradient_lip',
  },
  blush: {
    branchSource: 'makeupAR-full-face',
    color: '#E67B5F',
    finish: 'powder-blush',
    label: PRODUCT_REGION_LABELS.blush,
    maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.blush.maskTextureId,
    opacity: 0.38,
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
    opacity: 0.72,
    region: 'brow',
    texture: 'natural_brow',
  },
  lens: {
    branchSource: 'makeupAR-lens',
    color: '#5B4634',
    finish: 'natural-lens',
    label: PRODUCT_REGION_LABELS.lens,
    maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.lens.maskTextureId,
    opacity: 0.55,
    region: 'lens',
    texture: 'shimmer_eye',
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
  lens: UNITY_MAKEUP_LAYER_PRESETS.lens,
};

// Brow 핏(shape) tab -> a distinct, correctly-authored brow mask. Every mask
// here has its shape in RGB and sits on the eyebrow band (unlike the malformed
// psd-arcore-brow-semi-arch, which was retired). candidateId == maskTextureId;
// both pass the Unity whitelist (region=='brow' accepts a 'brow-' prefix).
const BROW_SHAPE_MASKS: Record<string, string> = {
  'brow-natural': 'brow-png-natural-hair-v1',
  'brow-daily': 'brow-png-daily-hair-v1',
  'brow-soft-arch': 'brow-soft-arch-fine-hair-v1',
  'brow-arch': 'brow-back-arch-soft-mix-v1',
  'brow-straight': 'brow-png-dailyflat-hair-v1',
  'brow-slim': 'brow-png-narrow-hair-v1',
};

function resolveBrowMaskForShape(selectedShapeId: string): string {
  return BROW_SHAPE_MASKS[selectedShapeId] ?? FULL_FACE_REGION_RUNTIME_ASSETS.brow.maskTextureId;
}

// Eyeliner 형태(shape) tab -> one of the PROCEDURAL eyeliner styles that Unity
// rasterizes live from the measured eye zones (e7-eyeliner-gen-* -> quadratic
// thickness profile + bezier wing, per the reference chart: 캣/퍼피/섹시/윙드/
// 컬러드/돌). These already render in the live AR filter (the eye zones are
// re-measured every foundation calibration, same source the lens discs use), so
// wiring the shape id here is all that is needed to replace the flat static
// `minimal-safe` liner with a realistic generated one. Unknown/absent shape ids
// fall back to a universally flattering WINGED liner so the AR-filter eyeliner
// is realistic by default; the exact 형태 option ids are logged at the call site
// so any that do not match below can be added.
const EYELINER_SHAPE_MASKS: Record<string, string> = {
  cat: 'e7-eyeliner-gen-cat-v2',
  puppy: 'e7-eyeliner-gen-puppy-v2',
  sexy: 'e7-eyeliner-gen-sexy-v2',
  winged: 'e7-eyeliner-gen-winged-v2',
  colored: 'e7-eyeliner-gen-colored-v2',
  doll: 'e7-eyeliner-gen-doll-v2',
  'eyeliner-cat': 'e7-eyeliner-gen-cat-v2',
  'eyeliner-puppy': 'e7-eyeliner-gen-puppy-v2',
  'eyeliner-sexy': 'e7-eyeliner-gen-sexy-v2',
  'eyeliner-winged': 'e7-eyeliner-gen-winged-v2',
  'eyeliner-colored': 'e7-eyeliner-gen-colored-v2',
  'eyeliner-doll': 'e7-eyeliner-gen-doll-v2',
  'eyeliner-gen-cat-v2': 'e7-eyeliner-gen-cat-v2',
  'eyeliner-gen-puppy-v2': 'e7-eyeliner-gen-puppy-v2',
  'eyeliner-gen-sexy-v2': 'e7-eyeliner-gen-sexy-v2',
  'eyeliner-gen-winged-v2': 'e7-eyeliner-gen-winged-v2',
  'eyeliner-gen-colored-v2': 'e7-eyeliner-gen-colored-v2',
  'eyeliner-gen-doll-v2': 'e7-eyeliner-gen-doll-v2',
};

const DEFAULT_GENERATED_EYELINER_MASK = 'e7-eyeliner-gen-winged-v2';

function resolveEyelinerMaskForShape(selectedShapeId: string): string {
  const key = (selectedShapeId ?? '').toLowerCase();
  return EYELINER_SHAPE_MASKS[key] ?? DEFAULT_GENERATED_EYELINER_MASK;
}

// Cheek 핏(shape) tab -> a blush session mask. The recipe builder auto-derives
// the blush_session_N texture from the cheek-session-mask-N maskTextureId, so we
// only override maskTextureId + candidateId (same pattern as the brow shapes).
const BLUSH_SHAPE_MASKS: Record<string, {maskTextureId: string; candidateId: string}> = {
  'cheek-daily': {maskTextureId: 'cheek-session-mask-1-v1', candidateId: 'blush-session-1-v1'},
  'cheek-lovely': {maskTextureId: 'cheek-session-mask-2-v1', candidateId: 'blush-session-2-v1'},
  'cheek-under': {maskTextureId: 'cheek-session-mask-3-v1', candidateId: 'blush-session-3-v1'},
  'cheek-sunkiss1': {maskTextureId: 'cheek-session-mask-4-v1', candidateId: 'blush-session-4-v1'},
  'cheek-sunkiss2': {maskTextureId: 'cheek-session-mask-5-v1', candidateId: 'blush-session-5-v1'},
};

function resolveBlushMaskForShape(
  selectedShapeId: string,
): {maskTextureId: string; candidateId: string} {
  return (
    BLUSH_SHAPE_MASKS[selectedShapeId] ?? {
      maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.blush.maskTextureId,
      candidateId: FULL_FACE_REGION_RUNTIME_ASSETS.blush.candidateId,
    }
  );
}

// Lens 컬러(color id) -> 홍채 틴트 색 + opacity. The color id IS the lens id (from
// REGION_COLOR_OPTIONS.lens); this record supplies the matching opacity. Vivids
// (blue/green/violet) get a higher opacity so they actually show on dark eyes.
// The swatch hex flows in via selection.selectedColor.hex, so we only need the
// opacity here (mirrors BLUSH_SHAPE_MASKS: id -> preset). The disc geometry and
// mask are generated in Unity (maskTextureId 'lens-iris-disc-v1'); blendMode is
// forced to 'normal' in buildFullFaceMakeupRecipeLayer.
const LENS_COLOR_PRESETS: Record<string, {hex: string; opacity: number}> = {
  'lens-natural-brown': {hex: '#5B4634', opacity: 0.55},
  'lens-choco': {hex: '#3E2C1E', opacity: 0.6},
  'lens-hazel': {hex: '#8A6A3B', opacity: 0.55},
  'lens-honey': {hex: '#9A6B34', opacity: 0.55},
  'lens-gray': {hex: '#7C7B78', opacity: 0.6},
  'lens-ash-gray': {hex: '#5E5E5C', opacity: 0.62},
  'lens-olive': {hex: '#6E6B3A', opacity: 0.6},
  'lens-forest-green': {hex: '#4C6B4A', opacity: 0.68},
  'lens-ocean-blue': {hex: '#3C5A78', opacity: 0.72},
  'lens-violet': {hex: '#5E4A78', opacity: 0.72},
};

function resolveLensOpacityForColorId(selectedColorId: string): number {
  return (
    LENS_COLOR_PRESETS[selectedColorId]?.opacity ??
    UNITY_MAKEUP_LAYER_PRESETS.lens.opacity
  );
}

export function getUnityMakeupLayerRegionsForMakeupArea(
  selectedMakeupArea: MakeupArea,
): readonly UnityMakeupLayerRegion[] {
  return getMakeupRecipeRegionsForArea(selectedMakeupArea);
}

// ---- ARwithFable Unity bridge (AR filter engine = ARwithFable) --------------
// The live AR filter Unity is now the ARwithFable ("ARMakeup") project instead
// of AURA's E3 region-mask system. It is driven by a FLAT FilterParams message
// (all colors + intensities), delivered via the SAME native UnitySendMessage
// bridge: postMessage('NativeBridge', 'OnMessageFromRN', json). AURA's per-area
// color selections are mapped onto FilterParams here.
export type ArwFilterParams = {
  skinSmoothing: number;
  skinBrightening: number;
  // AURA 스크린스페이스 파운데이션 (FaceMakeup.shader에 이식): 선택 shade가
  // foundationColor, skinSmoothing이 잡티제거, foundationIntensity가 HSV 톤 강도.
  foundationColor: string;
  userSkinBaseColor: string;
  foundationIntensity: number;
  foundationCoverage: number;
  foundationEvenness: number;
  foundationLuminance: number;
  lipColor: string;
  lipIntensity: number;
  lipStyleIntensity: number;
  blushColor: string;
  blushIntensity: number;
  // AURA cheek session-mask index (0..4: daily/lovely/under/sunkiss1/sunkiss2).
  // Drives the ported AURA CheekBlushRenderer's mask + per-mask tuning in Unity.
  blushShape: number;
  blushStyleIntensity: number;
  eyeshadowColor: string;
  eyeshadowIntensity: number;
  irisColor: string;
  irisIntensity: number;
  eyelinerColor: string;
  eyelinerIntensity: number;
  eyelinerStyle: number;
  eyelinerStyleIntensity: number;
  browColor: string;
  browIntensity: number;
  browPowderColor: string;
  browPowderIntensity: number;
  browLightenerIntensity: number;
  browPencilColor: string;
  browPencilIntensity: number;
  browStyleColor: string;
  browStyleIntensity: number;
  browThickness: number;
  browArch: number;
  highlightColor: string;
  highlightIntensity: number;
  contourColor: string;
  contourIntensity: number;
  concealerColor: string;
  concealerIntensity: number;
  faceOverlayIntensity: number;
  // 반반: 0=전체, 1=왼쪽만, 2=오른쪽만.
  halfFaceMode: number;
};

// Matches ARwithFable src/presets.ts BARE (all intensities 0).
export const ARW_BARE_FILTER_PARAMS: ArwFilterParams = {
  skinSmoothing: 0,
  skinBrightening: 0,
  foundationColor: '#D6B09A',
  userSkinBaseColor: '#C79A82',
  foundationIntensity: 0,
  foundationCoverage: 0.55,
  foundationEvenness: 0.25,
  foundationLuminance: 0.08,
  lipColor: '#C94F6D',
  lipIntensity: 0,
  lipStyleIntensity: 0,
  blushColor: '#F08FA0',
  blushIntensity: 0,
  blushShape: 0,
  blushStyleIntensity: 0,
  eyeshadowColor: '#B06A4E',
  eyeshadowIntensity: 0,
  irisColor: '#5B7B8C',
  irisIntensity: 0,
  eyelinerColor: '#181418',
  eyelinerIntensity: 0,
  eyelinerStyle: 0,
  eyelinerStyleIntensity: 0,
  browColor: '#4A3428',
  browIntensity: 0,
  browPowderColor: '#4A3628',
  browPowderIntensity: 0,
  browLightenerIntensity: 0,
  browPencilColor: '#2A1E16',
  browPencilIntensity: 0,
  browStyleColor: '#3A2A20',
  browStyleIntensity: 0,
  browThickness: 1,
  browArch: 0,
  highlightColor: '#FFF2DB',
  highlightIntensity: 0,
  contourColor: '#9E806B',
  contourIntensity: 0,
  concealerColor: '#FADCC2',
  concealerIntensity: 0,
  faceOverlayIntensity: 0,
  halfFaceMode: 0,
};

// AURA cheek 형태 tab -> session-mask index. Mirrors BLUSH_SHAPE_MASKS
// (cheek-session-mask-N -> index N-1) which the ported CheekBlushRenderer uses.
const BLUSH_SHAPE_INDEX: Record<string, number> = {
  'cheek-daily': 0,
  'cheek-lovely': 1,
  'cheek-under': 2,
  'cheek-sunkiss1': 3,
  'cheek-sunkiss2': 4,
};

function mapArwBlushShapeId(selectedShapeId: string): number {
  return BLUSH_SHAPE_INDEX[selectedShapeId] ?? 0;
}

function mapArwEyelinerStyleId(selectedShapeId: string): number {
  const id = (selectedShapeId ?? '').toLowerCase();
  if (id.includes('puppy') || id.includes('down')) {
    return 1;
  }
  if (id.includes('horizontal') || id.includes('straight') || id.includes('long')) {
    return 2;
  }
  return 0; // cat / wing-up
}

// Build a full ARwithFable FilterParams from AURA's per-area AR-filter
// selections. Only colors are wired for now (type/texture/shape come later):
// each enabled area sets its region's color + a visible intensity.
export function buildFilterParamsFromARFilterSelections(
  selections: readonly UnityMakeupARFilterSelection[],
  halfFaceMode = 0,
): ArwFilterParams {
  const params: ArwFilterParams = {...ARW_BARE_FILTER_PARAMS};
  params.halfFaceMode = halfFaceMode;

  selections.forEach(selection => {
    if (!shouldEnableUnityMakeupSelection(selection)) {
      return;
    }
    const hex = normalizeSelectedHex(selection.selectedColor.hex);
    getUnityMakeupLayerRegionsForMakeupArea(selection.selectedMakeupArea).forEach(
      region => {
        switch (region) {
          case 'lip': {
            if (hex) {
              params.lipColor = hex;
            }
            // 기본 립 불투명도 0.37 (요청: 더 옅게).
            params.lipIntensity = 0.37;
            break;
          }
          case 'blush': {
            if (hex) {
              params.blushColor = hex;
            }
            params.blushIntensity = 0.7;
            params.blushShape = mapArwBlushShapeId(selection.selectedShapeId);
            break;
          }
          case 'brow': {
            if (hex) {
              params.browColor = hex;
            }
            params.browIntensity = 0.85;
            break;
          }
          case 'eyeliner': {
            if (hex) {
              params.eyelinerColor = hex;
            }
            params.eyelinerIntensity = 0.9;
            params.eyelinerStyle = mapArwEyelinerStyleId(selection.selectedShapeId);
            break;
          }
          case 'lens': {
            if (hex) {
              params.irisColor = hex;
            }
            params.irisIntensity = 0.85;
            break;
          }
          case 'foundation': {
            // AURA 스크린스페이스 base (FaceMakeup.shader에 이식). 선택한 shade가
            // 파운데이션 색(HSV 가산광채 톤), skinSmoothing이 잡티제거. 기존
            // ARwithFable flat brighten/concealer 매핑은 폐기.
            // intensity는 셰이더 자연 기본값(0.45)에 맞춘다 — 0.7은 gentle 톤보정을
            // 통째로 과구동해 "쨍한/부자연"으로 보였다(AURA 원본 대비 과함).
            params.skinSmoothing = 0.35;
            params.foundationIntensity = 0.45;
            if (hex) {
              params.foundationColor = hex;
            }
            break;
          }
          default:
            break;
        }
      },
    );
  });

  return params;
}

// Send a FilterParams to the ARwithFable Unity via the native UnitySendMessage
// bridge (GameObject 'NativeBridge', method 'OnMessageFromRN').
export function postUnityFilterParams(params: ArwFilterParams): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();
  if (!nativeBridge?.postMessage) {
    return false;
  }
  nativeBridge.postMessage(
    'NativeBridge',
    'OnMessageFromRN',
    JSON.stringify({filter: params, type: 'applyFilter'}),
  );
  return true;
}

// Pause/resume the ARwithFable Unity AR session. The Unity player is a persistent
// singleton — its ARSession keeps holding the FRONT camera even after the AR
// filter view is hidden, which blocks the face-capture (report) camera from
// starting (black preview). Pausing (setPaused true) disables the ARSession and
// releases the camera so other features can use it; resume on AR-filter re-entry.
export function setUnityMakeupSessionPaused(paused: boolean): boolean {
  const nativeBridge = getNativeUnityMakeupBridge();
  if (!nativeBridge?.postMessage) {
    return false;
  }
  nativeBridge.postMessage(
    'NativeBridge',
    'OnMessageFromRN',
    JSON.stringify({paused, type: 'setPaused'}),
  );
  return true;
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
  halfFaceMode: HalfFaceMode = 'off',
  excludeRegions: readonly UnityMakeupLayerRegion[] = [],
): UnityMakeupRecipeBatch {
  const layerSelections = new Map<UnityMakeupLayerRegion, UnityMakeupARFilterSelection>();
  const excludeRegionSet = new Set(excludeRegions);

  selections.forEach(selection => {
    if (!shouldEnableUnityMakeupSelection(selection)) {
      return;
    }

    getUnityMakeupLayerRegionsForMakeupArea(selection.selectedMakeupArea).forEach(
      region => {
        // Regions handled outside the recipe (e.g. the generated brow, applied
        // via ApplyGeneratedBrowMaskJson) are excluded so the static UV brow
        // layer does not double-render over the landmark-aligned one.
        if (excludeRegionSet.has(region)) {
          return;
        }
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
    halfFaceMode,
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
    const selectedColorId = selection?.selectedColorId ?? '';
    const selectedShapeId = selection?.selectedShapeId ?? '';
    const selectedTextureId = selection?.selectedTextureId ?? '';
    const selectedTypeId = selection?.selectedTypeId ?? '';
    const params = createDefaultRegionParams(region);

    params.coverage = resolveCoverageForRegion(region, selectedShapeId, selectedTypeId);
    params.feather = resolveFeatherForRegion(region, selectedShapeId, selectedTypeId);
    params.maskThreshold = resolveMaskThresholdForRegion(region);

    // Lip 질감(finish) / 핏(shape) / 타입(type) -> independent recipe params.
    // finish -> gloss highlight (glossBoost/specular) + base texture (매트/글로우);
    // shape -> base-fill gradientAmount; type -> extra gradient falloff. These
    // combine freely (글로우+그라데이션 = gloss highlight over a gradient base fill).
    const lipFinish = region === 'lip' ? resolveLipFinishParams(selectedTextureId) : null;
    const lipShape = region === 'lip' ? resolveLipShapeParams(selectedShapeId) : null;
    const lipType = region === 'lip' ? resolveLipTypeParams(selectedTypeId) : null;
    if (region === 'brow') {
      // The UV-locked brow sits BELOW the real brows; a positive verticalOffset
      // raises it (wired to _MaskOffset.y in E3, effect = value * 0.10 in UV).
      // Device feedback (this session): at 0.5 the drawn brow still lands
      // slightly BELOW the natural brow, so the natural brow shows above it and
      // the erase footprint (which follows the drawn brow) never reaches it.
      // Raise so the drawn brow + its erase footprint sit ON the natural brow.
      // Hot-reloadable RN value — tune up/down from device feedback (no Unity
      // rebuild needed).
      params.verticalOffset = 0.9;
    }

    return {
      ...controls,
      [region]: {
        ...defaultControl,
        enabled: activeRegionSet.has(region),
        colorHex: selectedHex ?? preset.color,
        opacity: resolveOpacityForRegion(region, selectedTextureId, selectedTypeId, selectedColorId),
        intensity: activeRegionSet.has(region) ? 1 : 0,
        params,
        // Lip 질감/핏/타입 -> finish (base texture + gloss highlight), gradient
        // shaping, and roughness/specular. control.finish drives the lip texture
        // string in getTextureForRegionControl; when 핏 is 그라데이션 the base
        // mode becomes gradient_lip regardless of finish (the gloss highlight
        // still layers on top because it only needs glossBoost & specular > 0).
        ...(region === 'lip' && lipFinish && lipShape && lipType
          ? {
              finish: lipShape.isGradient ? 'gradient' : lipFinish.finish,
              glossBoost: lipFinish.glossBoost,
              specular: lipFinish.specular,
              roughness: lipFinish.roughness,
              gradientAmount: clamp01(lipShape.gradientAmount + lipType.gradientBoost),
            }
          : {}),
        // Brow 핏 selection maps to a distinct brow mask; other regions keep
        // their default mask.
        ...(region === 'brow'
          ? {
              maskTextureId: resolveBrowMaskForShape(selectedShapeId),
              candidateId: resolveBrowMaskForShape(selectedShapeId),
            }
          : {}),
        // NOTE: the eyeliner 형태 -> live generated style wiring is temporarily
        // reverted — pointing the eyeliner layer at e7-eyeliner-gen-* wiped ALL
        // makeup (a generated-eyeliner recipe field is rejected by Unity's layer
        // parser, which clears every overlay). resolveEyelinerMaskForShape is
        // kept for when the generated-eyeliner recipe shape is validated.
        // Cheek 핏 selection maps to a blush session mask (데일리/러블리/언더/
        // 선키스 1/선키스 2). The blush_session_N texture auto-follows the mask id.
        ...(region === 'blush' ? resolveBlushMaskForShape(selectedShapeId) : {}),
        // Foundation must render through OUR screen-space compositor (live HSV
        // tone correction on the camera) — the same path the working makeup
        // screen uses. Without this the recipe defaults to uvMask, which paints
        // a near-invisible mesh overlay (a light shade × multiply ≈ no change),
        // so the base looked like it "did nothing".
        ...(region === 'foundation'
          ? {
              foundationMode: 'screenSpace' as const,
              foundationFallbackMode: 'off' as const,
              // Skin-smoothing (잡티 제거) strength rides the unused foundation
              // specular field (same transport as the capture screen's blemish
              // control). The finish-preset specular is ~0, which is why the
              // AR filter base showed no blur at all.
              specular: 0.32,
            }
          : {}),
      },
    };
  }, {} as FullFaceRegionControls);
}

export function shouldEnableUnityMakeupSelection({
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

// ---------------------------------------------------------------------------
// Lip 질감(finish) / 핏(shape) / 타입(type) -> recipe params. These three groups
// are INDEPENDENT and combine: finish drives the light-reactive gloss highlight
// (glossBoost/specular) + the lip texture string (matte_lip vs gloss_lip);
// shape drives the base-fill gradient (gradientAmount) + over-lip coverage; type
// layers opacity/feather/saturation combos on top. All uniforms already exist in
// SmoothRegionMask.shader + E3RegionMaskOverlay, so this is RN-only (no rebuild).
type LipFinishParams = {
  // 'matte' | 'gloss' | 'gradient' — encodes the base-fill mode (Unity
  // ResolveLipStyleMode). 그라데이션 wins the base mode; otherwise finish decides.
  finish: string;
  glossBoost: number;
  specular: number;
  roughness: number;
};

// 질감: 매트 => flat, no highlight; 글로우 => strong light-reactive gloss highlight.
// The shader's GlossAdditiveHighlight pass early-outs when glossBoost<=0.001 OR
// specular<=0.001, so 글로우 must set BOTH well above 0. The highlight boosts the
// EXISTING camera highlights on the lips, so it reacts to the real light dir.
function resolveLipFinishParams(selectedTextureId: string): LipFinishParams {
  if (selectedTextureId === 'lip-glow' || includesAny(selectedTextureId, ['glow', 'gloss', 'glass'])) {
    return {finish: 'gloss', glossBoost: 0.85, specular: 0.34, roughness: 0.08};
  }

  // 매트 (and unknown/unset) — no gloss highlight.
  return {finish: 'matte', glossBoost: 0, specular: 0.02, roughness: 0.5};
}

// 핏: 오버 립 => paint slightly past the lip line (high coverage, no gradient
// shaping); 그라데이션 => inner-concentrated fade (gradient_lip base + high
// gradientAmount). Returns the gradientAmount and whether the base mode is
// gradient (which overrides the finish's base texture with gradient_lip).
type LipShapeParams = {
  gradientAmount: number;
  isGradient: boolean;
};

function resolveLipShapeParams(selectedShapeId: string): LipShapeParams {
  if (selectedShapeId === 'lip-gradient') {
    return {gradientAmount: 0.82, isGradient: true};
  }

  // 오버 립 (and unknown/unset) — solid fill, coverage carries the over-line reach.
  return {gradientAmount: 0, isGradient: false};
}

// 타입: 소프트 스모키 => soft darkened smoky gradient (softer edge, gradient-
// leaning); 얇은 라인 => thin inner-lip / lip-line emphasis (tighter coverage);
// 뮤트 립 => muted, blurred, lower-opacity lip. Layers opacity/coverage/feather
// deltas on top of finish+shape without changing the base mode.
type LipTypeParams = {
  opacityScale: number;
  coverageScale: number;
  featherBoost: number;
  gradientBoost: number;
};

function resolveLipTypeParams(selectedTypeId: string): LipTypeParams {
  switch (selectedTypeId) {
    case 'lip-soft-smoky':
      // Soft, darker, blurred — nudge toward a gradient falloff + soft edge.
      return {opacityScale: 1, coverageScale: 0.96, featherBoost: 0.12, gradientBoost: 0.18};
    case 'lip-thin-line':
      // Thin inner-lip: pull coverage in, crisp edge.
      return {opacityScale: 1, coverageScale: 0.8, featherBoost: -0.06, gradientBoost: 0};
    case 'lip-mute':
      // Muted, blurred, lower-saturation feel via reduced opacity + soft edge.
      return {opacityScale: 0.82, coverageScale: 1, featherBoost: 0.16, gradientBoost: 0.1};
    default:
      return {opacityScale: 1, coverageScale: 1, featherBoost: 0, gradientBoost: 0};
  }
}

function resolveOpacityForRegion(
  region: UnityMakeupLayerRegion,
  selectedTextureId = '',
  selectedTypeId = '',
  selectedColorId = '',
): number {
  const defaultOpacity = UNITY_MAKEUP_LAYER_PRESETS[region].opacity;

  if (region === 'lens') {
    // The lens opacity follows the picked color (vivids show stronger). The
    // color id IS the lens id from REGION_COLOR_OPTIONS.lens.
    return resolveLensOpacityForColorId(selectedColorId);
  }

  if (region === 'lip') {
    const glowBase = includesAny(selectedTextureId, ['glass', 'glow', 'balmy']) ||
      selectedTextureId === 'lip-glow'
      ? 0.78
      : defaultOpacity;

    return clamp01(glowBase * resolveLipTypeParams(selectedTypeId).opacityScale);
  }

  if (region === 'eyeliner' && includesAny(selectedTypeId, ['liner'])) {
    return 0.64;
  }

  if (region === 'foundation') {
    return 0.38;
  }

  return defaultOpacity;
}

function resolveCoverageForRegion(
  region: UnityMakeupLayerRegion,
  selectedShapeId = '',
  selectedTypeId = '',
): number {
  if (region === 'lip') {
    // 오버 립 reaches slightly past the lip line (higher coverage); 그라데이션
    // pulls the fill inward. Type scales it (얇은 라인 tightens further).
    const shapeCoverage = selectedShapeId === 'lip-gradient' ? 0.7 : 0.84;
    return clamp01(shapeCoverage * resolveLipTypeParams(selectedTypeId).coverageScale);
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
  selectedTypeId = '',
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

  if (region === 'lip') {
    // 그라데이션 fades softer than 오버 립; 타입 layers a soft/crisp edge delta.
    const shapeFeather = selectedShapeId === 'lip-gradient' ? 0.34 : 0.24;
    return clamp01(shapeFeather + resolveLipTypeParams(selectedTypeId).featherBoost);
  }

  return selectedShapeId === 'cheek-round' ? 0.3 : 0.24;
}

function resolveMaskThresholdForRegion(region: UnityMakeupLayerRegion): number {
  if (region === 'lip') {
    // 0.35 over-tightened the paint (lip covered smaller than the real lips);
    // 0.025 (the old default) haloed outside them. 0.15 reaches the vermilion
    // border without spilling past it.
    return 0.15;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
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
  setPlayerPaused?: (paused: boolean) => void;
};

function getNativeUnityMakeupBridge(): NativeUnityMakeupBridge | undefined {
  return NativeModules.UnityMakeupBridge as NativeUnityMakeupBridge | undefined;
}

// Pause/resume the whole ARwithFable Unity PLAYER (native UnityFramework pause:)
// — stops its render loop + AR session, freeing CPU/camera/working-memory so a
// heavy screen (e.g. the report/face-capture camera: front + depth + Vision +
// matte) doesn't OOM/jetsam-kill the app while Unity is resident. Unlike the
// ARSession.enabled toggle (setUnityMakeupSessionPaused), the player pause does
// not corrupt Unity's state, so resume(false) restores it cleanly.
export function setUnityMakeupPlayerPaused(paused: boolean): void {
  getNativeUnityMakeupBridge()?.setPlayerPaused?.(paused);
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

// ── 정지영상 얼굴 랜드마크 (homuler 일원화) ─────────────────────────────────
// CocoaPods MediaPipe 제거(Unity homuler와 중복 크래시) 이후, MediaPipe 에 의존하던
// 두 정지영상 분석기(퍼스널 컬러 · 얼굴 세로비율)는 랜드마크를 Unity homuler
// (IMAGE 모드)에서 공통으로 받아온다. 요청 1종이 두 소비자를 모두 커버한다.
// RN→Unity: postMessage('AuraStillFaceLandmarks','AnalyzeStillJson', {requestId, imagePath, ...})
//   (Unity 측 수신자: MediaPipeGraft/StillFaceLandmarkService.cs — RNBridge 와 별개의
//    자립형 GameObject. UnitySendMessage 는 GameObject 이름으로 라우팅된다.)
// Unity→RN: UnityMakeupEvent 의 message = {type:'faceLandmarks', requestId, ...}
export const UNITY_STILL_FACE_LANDMARKS_TARGET = {
  gameObject: 'AuraStillFaceLandmarks',
  analyzeMethod: 'AnalyzeStillJson',
} as const;
export const FACE_LANDMARKS_STILL_REQUEST_TYPE = 'analyzeFaceLandmarksStill';
export const FACE_LANDMARKS_EVENT_TYPE = 'faceLandmarks';

export type FaceLandmarkPoint = {
  i: number;
  x: number;
  y: number;
  z: number;
};

export type FaceLandmarksStatus = 'ok' | 'no_face' | 'error';

export type FaceLandmarksResult = {
  status: FaceLandmarksStatus;
  requestId: string;
  faceCount: number;
  imageWidth: number;
  imageHeight: number;
  landmarks: FaceLandmarkPoint[];
  pose: {pitchDeg: number; yawDeg: number; rollDeg: number} | null;
  error?: string;
};

let faceLandmarksRequestCounter = 0;

export function createFaceLandmarksRequestId(): string {
  faceLandmarksRequestCounter += 1;
  return `fl-${Date.now().toString(36)}-${faceLandmarksRequestCounter.toString(36)}`;
}

// 순수 함수: Unity 로 보낼 요청 JSON 문자열을 만든다(유닛테스트 대상).
export function buildAnalyzeFaceLandmarksStillRequest(
  imagePath: string,
  requestId: string,
  maxFaces = 1,
): string {
  return JSON.stringify({
    type: FACE_LANDMARKS_STILL_REQUEST_TYPE,
    requestId,
    imagePath,
    maxFaces,
  });
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// 순수 함수: Unity 이벤트 message(JSON 문자열)를 파싱한다(유닛테스트 대상).
// faceLandmarks 이벤트가 아니거나 형식이 깨지면 null(무시).
export function parseFaceLandmarksMessage(
  rawMessage: string | undefined,
): FaceLandmarksResult | null {
  if (typeof rawMessage !== 'string' || rawMessage.length === 0) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawMessage) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (
    !parsed ||
    parsed.type !== FACE_LANDMARKS_EVENT_TYPE ||
    typeof parsed.requestId !== 'string'
  ) {
    return null;
  }

  const status: FaceLandmarksStatus =
    parsed.status === 'ok' || parsed.status === 'no_face'
      ? parsed.status
      : 'error';

  const rawLandmarks = Array.isArray(parsed.landmarks) ? parsed.landmarks : [];
  const landmarks: FaceLandmarkPoint[] = rawLandmarks
    .map((point, index) => {
      const p = (point ?? {}) as Record<string, unknown>;
      return {
        i: toFiniteNumber(p.i, index),
        x: toFiniteNumber(p.x, NaN),
        y: toFiniteNumber(p.y, NaN),
        z: toFiniteNumber(p.z, 0),
      };
    })
    .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));

  const rawPose = (parsed.pose ?? null) as Record<string, unknown> | null;
  const pose = rawPose
    ? {
        pitchDeg: toFiniteNumber(rawPose.pitchDeg, 0),
        yawDeg: toFiniteNumber(rawPose.yawDeg, 0),
        rollDeg: toFiniteNumber(rawPose.rollDeg, 0),
      }
    : null;

  return {
    status,
    requestId: parsed.requestId,
    faceCount: toFiniteNumber(parsed.faceCount, landmarks.length > 0 ? 1 : 0),
    imageWidth: toFiniteNumber(parsed.imageWidth, 0),
    imageHeight: toFiniteNumber(parsed.imageHeight, 0),
    landmarks,
    pose,
    error: typeof parsed.error === 'string' ? parsed.error : undefined,
  };
}

// Unity homuler(IMAGE 모드)에 정지영상 랜드마크 검출을 요청하고 응답을 기다린다.
// 퍼스널 컬러 · 얼굴 세로비율 두 분석기가 공통으로 쓴다.
// 브릿지 미탑재/타임아웃은 reject → 호출측 서비스가 null 로 격리한다.
export function requestFaceLandmarks(
  imagePath: string,
  options: {timeoutMs?: number; maxFaces?: number} = {},
): Promise<FaceLandmarksResult> {
  const {timeoutMs = 8000, maxFaces = 1} = options;
  const nativeBridge = getNativeUnityMakeupBridge();

  if (!nativeBridge?.postMessage) {
    return Promise.reject(new Error('unity_makeup_bridge_unavailable'));
  }

  // 가드 직후 좁혀진 postMessage 를 캡처(옵셔널 narrowing 은 Promise 클로저로
  // 이어지지 않는다). RN 네이티브 모듈 메서드는 this 에 의존하지 않는다.
  const postMessage = nativeBridge.postMessage;
  const requestId = createFaceLandmarksRequestId();

  return new Promise<FaceLandmarksResult>((resolve, reject) => {
    let settled = false;
    let subscription: {remove: () => void} | null = null;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('face_landmarks_timeout')));
    }, timeoutMs);

    subscription = addUnityMakeupEventListener(event => {
      const parsed = parseFaceLandmarksMessage(event.message);
      if (!parsed || parsed.requestId !== requestId) {
        return;
      }
      finish(() => resolve(parsed));
    });

    postMessage(
      UNITY_STILL_FACE_LANDMARKS_TARGET.gameObject,
      UNITY_STILL_FACE_LANDMARKS_TARGET.analyzeMethod,
      buildAnalyzeFaceLandmarksStillRequest(imagePath, requestId, maxFaces),
    );
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
