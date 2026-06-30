import {NativeModules} from 'react-native';

import {
  buildUnityMessageFromPackage,
  type LipAdjustment,
  type LipGeneratePackage,
  type LipMaskProvider,
} from './lipGenerateCore';
import {
  buildGeneratedLipCandidateSet,
  type E7NativeBoundaryResult,
} from './personalizedGenerate/e7PersonalizedGeneratePipeline';
import {
  buildFullFaceMakeupRecipe,
  DEFAULT_FULL_FACE_REGION_CONTROLS,
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
  generatedPackage: LipGeneratePackage;
  nativeResult: E7NativeBoundaryResult;
  savedRecord?: unknown;
  unityApplyPayload: string;
};

export type PersonalizedCompanionMakeupRegionControl = {
  candidateId: string;
  colorHex: string;
  intensity: number;
  maskTextureId: string;
  opacity: number;
};

export type PersonalizedCompanionMakeupControls = {
  blush: PersonalizedCompanionMakeupRegionControl;
  brow: PersonalizedCompanionMakeupRegionControl;
  eyeliner: PersonalizedCompanionMakeupRegionControl;
};

export type PersonalizedCompanionMakeupActiveRegion =
  | 'blush'
  | 'brow'
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
  intensity: 0.86,
  maskVisible: true,
  opacity: 0.88,
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
  blush: {
    candidateId: 'blush-session-1-v1',
    colorHex: '#E67B5F',
    intensity: 0.76,
    maskTextureId: 'cheek-session-mask-1-v1',
    opacity: 0.58,
  },
  brow: {
    candidateId: 'brow-soft-arch-fine-hair-v1',
    colorHex: '#4A342B',
    intensity: 0.72,
    maskTextureId: 'brow-soft-arch-fine-hair-v1',
    opacity: 0.68,
  },
  eyeliner: {
    candidateId: 'eyeliner-smooth-v1',
    colorHex: '#40303F',
    intensity: 0.62,
    maskTextureId: 'eye-smooth-mask-v1',
    opacity: 0.38,
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

  let savedRecord: unknown;
  if (nativeModule.saveGeneratedPackage) {
    savedRecord = JSON.parse(
      await nativeModule.saveGeneratedPackage(JSON.stringify(generatedPackage)),
    );
  }

  return {
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

export function buildCheekBrowRecipeAfterGeneratedLip(
  sentAtMs = Date.now(),
  companionControls: PersonalizedCompanionMakeupControls =
    DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
  options: {
    activeRegion?: PersonalizedCompanionMakeupActiveRegion;
    useCheekRegionAlias?: boolean;
  } = {},
): FullFaceMakeupRecipe {
  const activeRegion = options.activeRegion ?? 'all';
  const shouldUseCheekRegionAlias = options.useCheekRegionAlias ?? true;
  const isRegionEnabled = (region: 'blush' | 'brow') =>
    activeRegion === 'all' || activeRegion === region;
  const controls: FullFaceRegionControls = {
    ...DEFAULT_FULL_FACE_REGION_CONTROLS,
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
      enabled: false,
      intensity: companionControls.eyeliner.intensity,
      maskTextureId: companionControls.eyeliner.maskTextureId,
      opacity: companionControls.eyeliner.opacity,
    },
    lip: {
      ...DEFAULT_FULL_FACE_REGION_CONTROLS.lip,
      enabled: false,
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
      layer => layer.region === 'blush' || layer.region === 'brow',
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
