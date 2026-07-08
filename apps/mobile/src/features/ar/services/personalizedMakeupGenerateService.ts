import {NativeModules} from 'react-native';

import {
  buildUnityMessageFromPackage,
  type LipAdjustment,
  type LipGeneratePackage,
  type LipMaskProvider,
} from './lipGenerateCore';
import {
  buildGeneratedBrowMaskUnityPayload,
  buildGeneratedBrowPackage,
  DEFAULT_GENERATED_BROW_CONTROLS,
  type GeneratedBrowControls,
  type GeneratedBrowPackage,
} from './browGenerateCore';
import {
  buildGeneratedLipCandidateSet,
  type E7NativeBoundaryResult,
} from './personalizedGenerate/e7PersonalizedGeneratePipeline';
import {
  buildFullFaceMakeupRecipe,
  DEFAULT_FULL_FACE_REGION_CONTROLS,
  REGION_COLOR_OPTIONS,
  type FullFaceMakeupRecipeLayer,
  type FullFaceMakeupRecipe,
  type FullFaceMakeupSourceInput,
  type FullFaceRegionControls,
} from '../../../shared/contracts/fullFaceMakeupRecipe';

type E7NativeLipBoundaryProviders = {
  extractLipBoundary?: (requestJson: string) => Promise<string>;
  saveGeneratedPackage?: (packageJson: string) => Promise<string>;
};

export type GeneratedMaskControls = {
  blendMode: 'multiply' | 'normal' | 'screen';
  boundaryDebugVisible: boolean;
  colorHex: string;
  coverage: number;
  finish: 'matte' | 'gloss' | 'gradient' | 'cream';
  glossBoost: number;
  gradientAmount: number;
  intensity: number;
  maskVisible: boolean;
  opacity: number;
  preserveDetail: boolean;
  roughness: number;
  secondaryColorHex: string;
  specular: number;
  specularPower: number;
  strongMode: boolean;
  texture: 'matte_lip' | 'gloss_lip' | 'gradient_lip' | 'full_lip' | 'overline_lip';
  textureAmount: number;
};

export type PersonalizedMakeupGenerateResult = {
  browUnityApplyPayload: string;
  generatedBrowPackage: GeneratedBrowPackage;
  generatedPackage: LipGeneratePackage;
  nativeResult: E7NativeBoundaryResult;
  savedRecord?: unknown;
  unityApplyPayload: string;
};

export {
  buildGeneratedBrowMaskUnityPayload,
  buildGeneratedBrowPackage,
  DEFAULT_GENERATED_BROW_CONTROLS,
};

export type {
  GeneratedBrowControls,
  GeneratedBrowPackage,
} from './browGenerateCore';

export type PersonalizedCompanionMakeupRegionControl = {
  candidateId: string;
  colorHex: string;
  coverage?: number | undefined;
  debugMaskMode?: number | undefined;
  finish?: 'natural' | 'matte' | 'glow' | undefined;
  fallbackMode?: 'uvMask' | 'off' | undefined;
  intensity: number;
  luminanceInfluence?: number | undefined;
  maskTextureId: string;
  mode?: 'uvMask' | 'screenSpace' | 'semantic' | undefined;
  opacity: number;
  evenness?: number | undefined;
  // 잡티 제거(blemish smoothing) strength [0,1]; foundation only.
  blemish?: number | undefined;
};

export type PersonalizedCompanionMakeupControls = {
  blush: PersonalizedCompanionMakeupRegionControl;
  brow: PersonalizedCompanionMakeupRegionControl;
  eyeliner: PersonalizedCompanionMakeupRegionControl;
  foundation: PersonalizedCompanionMakeupRegionControl;
  lip: PersonalizedCompanionMakeupRegionControl;
};

export type PersonalizedCompanionMakeupActiveRegion =
  | 'blush'
  | 'brow'
  | 'eyeliner'
  | 'foundation'
  | 'lip'
  | 'all'
  | 'none';

const DEFAULT_PROVIDER: LipMaskProvider = 'mediapipe';

const DEFAULT_LIP_ADJUSTMENT: LipAdjustment = {
  cornerReach: 0,
  innerFill: 0,
  lowerLipTightness: 0,
  upperInnerFill: 0,
  upperLipTightness: 0,
  verticalOffset: 0,
};

export const DEFAULT_GENERATED_MASK_CONTROLS: GeneratedMaskControls = {
  blendMode: 'multiply',
  boundaryDebugVisible: false,
  colorHex: '#D94B74',
  coverage: 0.84,
  finish: 'matte',
  glossBoost: 0,
  gradientAmount: 0.08,
  intensity: 0.5,
  maskVisible: true,
  opacity: 0.5,
  preserveDetail: true,
  roughness: 0.28,
  secondaryColorHex: '#F29BAA',
  specular: 0.08,
  specularPower: 18,
  strongMode: false,
  texture: 'matte_lip',
  textureAmount: 0.16,
};

export const DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS: PersonalizedCompanionMakeupControls = {
  foundation: {
    candidateId: 'foundation-skin-tone-relative-v1',
    colorHex: REGION_COLOR_OPTIONS.foundation[0].hex,
    coverage: 0.5,
    evenness: 0.5,
    // Foundation must never paint the face mesh / uvMask overlay directly:
    // the final color composite happens only in the screen-space camera
    // post-process. If the semantic mask is not ready, show nothing rather
    // than falling back to mesh painting.
    fallbackMode: 'off',
    finish: 'natural',
    debugMaskMode: 0,
    intensity: 0.5,
    luminanceInfluence: 0.52,
    maskTextureId: 'foundation-skin-mask-v1',
    // screenSpace: the final color composite happens in the screen-space
    // camera post-process quad, driven by the projected face-mesh + neck
    // mask (with calibrated eye/lip/brow exclusions). Never painted on the
    // face mesh / uvMask overlay directly.
    mode: 'screenSpace',
    opacity: 0.5,
    // 잡티 제거 on by default at a gentle level; users can drag to 0 (off) or
    // up to 1.0 for a heavy, over-smoothed look.
    blemish: 0.38,
  },
  blush: {
    candidateId: 'blush-session-1-v1',
    colorHex: '#E67B5F',
    intensity: 0.5,
    maskTextureId: 'cheek-session-mask-1-v1',
    opacity: 0.5,
  },
  brow: {
    candidateId: 'brow-soft-arch-fine-hair-v1',
    colorHex: '#4A342B',
    intensity: 0.5,
    maskTextureId: 'brow-soft-arch-fine-hair-v1',
    opacity: 0.5,
  },
  eyeliner: {
    candidateId: 'eyeliner-smooth-v1',
    colorHex: '#40303F',
    intensity: 0.5,
    maskTextureId: 'eye-smooth-mask-v1',
    opacity: 0.5,
  },
  // Mesh-locked lip: the canonical-UV lip atlas is sampled through the LIVE
  // ARKit face UVs (E3 "lip_style_atlas_v1_uv_back_projection"), so it is
  // rigidly attached to the face mesh and cannot float/drift with head or
  // phone motion — the SNOW/YouCam-stable behavior. The prior
  // 'lip-vision-boundary-v1' was a lagging screen-space Vision polygon rebased
  // onto a stale face-bounds reference, which drifted off the lips under
  // motion and dropped out when calibration/latency went wrong.
  lip: {
    candidateId: 'lip-drawn-style-atlas-v1',
    colorHex: '#C96A6E',
    intensity: 0.5,
    maskTextureId: 'lip-drawn-style-atlas-v1',
    opacity: 0.5,
  },
};

export function isPersonalizedMakeupGenerateAvailable(): boolean {
  const nativeModule = getNativeLipBoundaryProviders();

  return typeof nativeModule?.extractLipBoundary === 'function';
}

export async function generatePersonalizedLipMakeup({
  adjustment = DEFAULT_LIP_ADJUSTMENT,
  provider = DEFAULT_PROVIDER,
  sourceFrameMetadata,
}: {
  adjustment?: LipAdjustment;
  provider?: LipMaskProvider;
  sourceFrameMetadata: FullFaceMakeupSourceInput;
}): Promise<PersonalizedMakeupGenerateResult> {
  const nativeModule = getNativeLipBoundaryProviders();

  if (!nativeModule?.extractLipBoundary) {
    throw new Error('native_lip_boundary_module_unavailable');
  }

  const capture = sourceFrameMetadata.capture;
  const nativeResult = JSON.parse(
    await nativeModule.extractLipBoundary(
      JSON.stringify({
        adjustment,
        arFaceExportPath: capture.arFaceExportPath,
        capturePairId: capture.capturePairId,
        captureSetId: capture.captureSetId,
        captureShotKind: capture.captureShotKind,
        framePath: capture.framePath,
        orientation: 'up',
        privacy: {
          localOnly: true,
          longTermRawFrameStored: false,
          offDeviceUpload: false,
        },
        provider,
      }),
    ),
  ) as E7NativeBoundaryResult;

  console.info('[aura:personalized-makeup] native lip boundary result', {
    blockedReason: nativeResult.blockedReason,
    generationMethod: nativeResult.boundary?.generationMethod,
    innerPointCount: nativeResult.boundary?.innerPoints.length ?? 0,
    outerPointCount: nativeResult.boundary?.outerPoints.length ?? 0,
    provider: nativeResult.provider,
    status: nativeResult.status,
    warnings: nativeResult.warnings ?? [],
  });

  if (
    nativeResult.status === 'blocked' ||
    !nativeResult.boundary ||
    !nativeResult.arFaceExport
  ) {
    throw new Error(nativeResult.blockedReason ?? 'native_lip_boundary_blocked');
  }

  const generatedCandidate = buildGeneratedLipCandidateSet({
    adjustment,
    expressionModes: ['uvOnly'],
    nativeResult,
    providerResults: [nativeResult],
  }).find(candidate => candidate.package);
  const generatedPackage = generatedCandidate?.package;

  if (!generatedPackage) {
    throw new Error(generatedCandidate?.blockedReason ?? 'generated_lip_package_missing');
  }

  const generatedBrowPackage = buildGeneratedBrowPackage({
    controls: DEFAULT_GENERATED_BROW_CONTROLS,
    nativeResult,
  });

  let savedRecord: unknown;
  if (nativeModule.saveGeneratedPackage) {
    savedRecord = JSON.parse(
      await nativeModule.saveGeneratedPackage(JSON.stringify(generatedPackage)),
    );
  }

  return {
    browUnityApplyPayload: JSON.stringify(
      buildGeneratedBrowMaskUnityPayload(
        generatedBrowPackage,
        DEFAULT_GENERATED_BROW_CONTROLS,
        {
          includeTexture: true,
        },
      ),
    ),
    generatedBrowPackage,
    generatedPackage,
    nativeResult,
    savedRecord,
    unityApplyPayload: JSON.stringify(
      buildGeneratedMaskUnityPayload(generatedPackage, DEFAULT_GENERATED_MASK_CONTROLS, {
        includeTexture: true,
      }),
    ),
  };
}

export type GeneratedBrowFromCaptureResult = {
  browUnityApplyPayload: string;
  generatedBrowPackage: GeneratedBrowPackage;
  nativeResult: E7NativeBoundaryResult;
};

/**
 * Brow-only variant of {@link generatePersonalizedLipMakeup} for the LIVE AR
 * filter brow tab: runs the native face-landmark extraction on a synchronized
 * capture and builds a landmark-aligned generated brow (real-brow neutralize
 * footprint + strand map), WITHOUT the lip candidate build (so a face where the
 * lip boundary fails to solve still yields a brow). The returned
 * browUnityApplyPayload is ready for postUnityGeneratedBrowMaskPayload; the
 * nativeResult is kept so shape/color taps can re-rasterize via
 * buildGeneratedBrowPackage without re-capturing.
 */
export async function generateBrowFromCapture({
  controls = DEFAULT_GENERATED_BROW_CONTROLS,
  provider = DEFAULT_PROVIDER,
  sourceFrameMetadata,
}: {
  controls?: GeneratedBrowControls;
  provider?: LipMaskProvider;
  sourceFrameMetadata: FullFaceMakeupSourceInput;
}): Promise<GeneratedBrowFromCaptureResult> {
  const nativeModule = getNativeLipBoundaryProviders();

  if (!nativeModule?.extractLipBoundary) {
    throw new Error('native_lip_boundary_module_unavailable');
  }

  const capture = sourceFrameMetadata.capture;
  const nativeResult = JSON.parse(
    await nativeModule.extractLipBoundary(
      JSON.stringify({
        adjustment: DEFAULT_LIP_ADJUSTMENT,
        arFaceExportPath: capture.arFaceExportPath,
        capturePairId: capture.capturePairId,
        captureSetId: capture.captureSetId,
        captureShotKind: capture.captureShotKind,
        framePath: capture.framePath,
        orientation: 'up',
        privacy: {
          localOnly: true,
          longTermRawFrameStored: false,
          offDeviceUpload: false,
        },
        provider,
      }),
    ),
  ) as E7NativeBoundaryResult;

  if (nativeResult.status === 'blocked' || !nativeResult.arFaceExport) {
    throw new Error(nativeResult.blockedReason ?? 'native_brow_arface_missing');
  }

  return buildGeneratedBrowFromCaptureResult(nativeResult, controls);
}

/**
 * Re-rasterize the generated brow for a NEW shape/color using a cached
 * nativeResult (from a prior generateBrowFromCapture) — no re-capture needed.
 */
export function buildGeneratedBrowFromCaptureResult(
  nativeResult: E7NativeBoundaryResult,
  controls: GeneratedBrowControls = DEFAULT_GENERATED_BROW_CONTROLS,
): GeneratedBrowFromCaptureResult {
  const generatedBrowPackage = buildGeneratedBrowPackage({
    controls,
    nativeResult,
  });

  return {
    browUnityApplyPayload: JSON.stringify(
      buildGeneratedBrowMaskUnityPayload(generatedBrowPackage, controls, {
        includeTexture: true,
      }),
    ),
    generatedBrowPackage,
    nativeResult,
  };
}

export function buildCheekBrowRecipeAfterGeneratedLip(
  sentAtMs = Date.now(),
  companionControls: PersonalizedCompanionMakeupControls =
    DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
  options: {
    activeRegion?: PersonalizedCompanionMakeupActiveRegion;
    activeRegions?: readonly PersonalizedCompanionMakeupActiveRegion[];
    useCheekRegionAlias?: boolean;
  } = {},
): FullFaceMakeupRecipe {
  const activeRegion = options.activeRegion ?? 'all';
  const hasExplicitActiveRegions = options.activeRegions !== undefined;
  const activeRegionSet = new Set(options.activeRegions ?? []);
  const shouldUseCheekRegionAlias = options.useCheekRegionAlias ?? true;
  const isRegionEnabled = (
    region: 'blush' | 'brow' | 'foundation' | 'eyeliner' | 'lip',
  ) =>
    hasExplicitActiveRegions
      ? activeRegionSet.has(region)
      : activeRegion === 'all' || activeRegion === region;
  const controls: FullFaceRegionControls = {
    ...DEFAULT_FULL_FACE_REGION_CONTROLS,
    foundation: {
      ...DEFAULT_FULL_FACE_REGION_CONTROLS.foundation,
      candidateId: companionControls.foundation.candidateId,
      colorHex: companionControls.foundation.colorHex,
      enabled: isRegionEnabled('foundation'),
      finish: companionControls.foundation.finish ?? DEFAULT_FULL_FACE_REGION_CONTROLS.foundation.finish,
      foundationDebugMaskMode: companionControls.foundation.debugMaskMode ?? 0,
      foundationFallbackMode: companionControls.foundation.fallbackMode ?? 'uvMask',
      foundationMode: companionControls.foundation.mode ?? 'screenSpace',
      glossBoost: companionControls.foundation.evenness ?? DEFAULT_FULL_FACE_REGION_CONTROLS.foundation.glossBoost,
      intensity: companionControls.foundation.intensity,
      maskTextureId: companionControls.foundation.maskTextureId,
      opacity: companionControls.foundation.opacity,
      roughness:
        companionControls.foundation.luminanceInfluence ??
        DEFAULT_FULL_FACE_REGION_CONTROLS.foundation.roughness,
      // 잡티 제거(skin-smoothing) strength rides the foundation-unused Specular
      // field end-to-end to Unity (E3 -> ScreenSpaceFoundationController ->
      // _SkinSmoothStrength). Foundation never renders a mesh gloss, so reusing
      // Specular avoids threading a new positional arg through the whole recipe
      // chain. Default 0 keeps the feature off (bit-identical base).
      specular: companionControls.foundation.blemish ?? 0,
      textureAmount:
        companionControls.foundation.evenness ??
        DEFAULT_FULL_FACE_REGION_CONTROLS.foundation.textureAmount,
      params: {
        ...DEFAULT_FULL_FACE_REGION_CONTROLS.foundation.params,
        coverage:
          companionControls.foundation.coverage ??
          DEFAULT_FULL_FACE_REGION_CONTROLS.foundation.params.coverage,
      },
    },
    brow: {
      ...DEFAULT_FULL_FACE_REGION_CONTROLS.brow,
      candidateId: companionControls.brow.candidateId,
      colorHex: companionControls.brow.colorHex,
      enabled: isRegionEnabled('brow'),
      intensity: companionControls.brow.intensity,
      maskTextureId: companionControls.brow.maskTextureId,
      opacity: companionControls.brow.opacity,
    },
    blush: {
      ...DEFAULT_FULL_FACE_REGION_CONTROLS.blush,
      candidateId: companionControls.blush.candidateId,
      colorHex: companionControls.blush.colorHex,
      enabled: isRegionEnabled('blush'),
      intensity: companionControls.blush.intensity,
      maskTextureId: companionControls.blush.maskTextureId,
      opacity: companionControls.blush.opacity,
    },
    eyeliner: {
      ...DEFAULT_FULL_FACE_REGION_CONTROLS.eyeliner,
      candidateId: companionControls.eyeliner.candidateId,
      colorHex: companionControls.eyeliner.colorHex,
      enabled: isRegionEnabled('eyeliner'),
      intensity: companionControls.eyeliner.intensity,
      maskTextureId: companionControls.eyeliner.maskTextureId,
      opacity: companionControls.eyeliner.opacity,
    },
    // Live-personalized lips: the vision-boundary mask makes Unity track the
    // user's actual lip contour per frame — no reference capture required.
    lip: {
      ...DEFAULT_FULL_FACE_REGION_CONTROLS.lip,
      candidateId: companionControls.lip.candidateId,
      colorHex: companionControls.lip.colorHex,
      enabled: isRegionEnabled('lip'),
      intensity: companionControls.lip.intensity,
      maskTextureId: companionControls.lip.maskTextureId,
      opacity: companionControls.lip.opacity,
    },
  };
  const recipe = buildFullFaceMakeupRecipe({
    controls,
    recipeBatchId: `personalized-cheek-brow-${sentAtMs}`,
    recipeId: `personalized-cheek-brow-${sentAtMs}`,
    sentAtMs,
  });
  const layers = recipe.layers
    .filter(
      layer =>
        layer.region === 'foundation' ||
        layer.region === 'blush' ||
        layer.region === 'brow' ||
        layer.region === 'eyeliner' ||
        layer.region === 'lip',
    )
    .map(layer =>
      shouldUseCheekRegionAlias && layer.region === 'blush'
        ? ({
            ...layer,
            activeRegions: undefined,
            id: layer.id.replace(/^blush/, 'cheek'),
            layer: 'cheek',
            region: 'cheek',
          } as unknown as FullFaceMakeupRecipeLayer)
        : layer,
    );
  const enabledLayers = layers.filter(layer => layer.enabled);
  const activeRegions = enabledLayers.map(layer => layer.region).join(',') || 'none';

  return {
    ...recipe,
    activeRegions,
    enabledLayerCount: enabledLayers.length,
    layerCount: layers.length,
    layers,
    region: (enabledLayers[0]?.region ?? 'blush') as FullFaceMakeupRecipe['region'],
  } as FullFaceMakeupRecipe;
}

export function buildInactiveMakeupRecipe(sentAtMs = Date.now()): FullFaceMakeupRecipe {
  const controls = Object.fromEntries(
    Object.entries(DEFAULT_FULL_FACE_REGION_CONTROLS).map(([region, control]) => [
      region,
      {
        ...control,
        enabled: false,
      },
    ]),
  ) as FullFaceRegionControls;

  return buildFullFaceMakeupRecipe({
    controls,
    recipeBatchId: `personalized-mask-inactive-${sentAtMs}`,
    recipeId: `personalized-mask-inactive-${sentAtMs}`,
    sentAtMs,
  });
}

export function buildGeneratedMaskUnityPayload(
  generatedPackage: LipGeneratePackage,
  controls: GeneratedMaskControls,
  options: {
    includeTexture: boolean;
    controlRequestId?: number;
    controlRevision?: number;
  },
) {
  const message: Record<string, unknown> = {
    ...buildUnityMessageFromPackage(generatedPackage),
    boundaryDebug: controls.boundaryDebugVisible,
    boundaryDebugVisible: controls.boundaryDebugVisible,
    blendMode: controls.blendMode,
    color: controls.colorHex,
    colorHex: controls.colorHex,
    coverage: controls.coverage,
    debugBoundary: controls.boundaryDebugVisible,
    debugOverlayVisible: controls.boundaryDebugVisible,
    enabled: controls.maskVisible,
    finish: controls.finish,
    glossBoost: controls.glossBoost,
    gradientAmount: controls.gradientAmount,
    intensity: controls.intensity,
    maskOpacity: controls.opacity,
    maskVisible: controls.maskVisible,
    opacity: controls.opacity,
    preserveDetail: controls.preserveDetail,
    roughness: controls.roughness,
    sample: controls.texture,
    secondaryColor: controls.secondaryColorHex,
    secondaryColorHex: controls.secondaryColorHex,
    showBoundary: controls.boundaryDebugVisible,
    specular: controls.specular,
    specularPower: controls.specularPower,
    strongMode: controls.strongMode,
    strongValidationMode: controls.strongMode,
    texture: controls.texture,
    textureAmount: controls.textureAmount,
    validationColor: controls.colorHex,
    validationColorHex: controls.colorHex,
    validationMode: controls.strongMode ? 'strong' : 'standard',
    validationOpacity: controls.opacity,
    validationStrong: controls.strongMode,
    validationStrongMode: controls.strongMode,
    validationViewMode: controls.strongMode ? 'strong' : 'standard',
    validationVisible: controls.maskVisible,
    visible: controls.maskVisible,
  };

  if (options.controlRequestId !== undefined) {
    message.controlRequestId = options.controlRequestId;
    message.validationControlRequestId = options.controlRequestId;
  }
  if (options.controlRevision !== undefined) {
    message.controlRevision = options.controlRevision;
    message.validationControlRevision = options.controlRevision;
  }

  if (!options.includeTexture) {
    delete message.maskPngBase64;
    delete message.maskRawRgbaBase64;
  }

  return message;
}

function getNativeLipBoundaryProviders(): E7NativeLipBoundaryProviders | undefined {
  return NativeModules.E7NativeLipBoundaryProviders as
    | E7NativeLipBoundaryProviders
    | undefined;
}
