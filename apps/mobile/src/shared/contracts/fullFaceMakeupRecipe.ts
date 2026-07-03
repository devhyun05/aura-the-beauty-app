import type {FullFaceMakeupSourceInput} from './fullFaceMakeupCapture';

export const MAKEUP_RECIPE_REGIONS = ['foundation', 'lip', 'blush', 'brow', 'eyeliner'] as const;

export type MakeupRecipeRegion = (typeof MAKEUP_RECIPE_REGIONS)[number];

export type MakeupRecipeRegionAlias = MakeupRecipeRegion | 'base' | 'cheek' | 'eye';

export type MakeupAreaLike =
  | 'all'
  | 'base'
  | 'eye'
  | 'brow'
  | 'lip'
  | 'cheek'
  | 'contour';

export type RegionAdjustmentFieldSchema = {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  help: string;
};

export type FullFaceRegionColorOption = {
  id: string;
  label: string;
  hex: string;
};

export type FullFaceRegionFinishOption = {
  id: string;
  label: string;
  finish: string;
  textureAmount: number;
  roughness: number;
  specular: number;
  specularPower: number;
  glossBoost: number;
  shimmer: number;
};

export type FullFaceRegionCandidateOption = {
  id: string;
  label: string;
  candidateId: string;
  maskTextureId: string;
};

export type FoundationRenderMode = 'uvMask' | 'screenSpace';

export type FoundationFallbackMode = 'uvMask' | 'off';

export type FullFaceMakeupRecipeLayer = {
  id: string;
  recipeId?: string;
  recipeBatchId?: string;
  lookId?: string;
  sentAtMs?: number;
  activeRegions?: string;
  layerCount?: number;
  enabledLayerCount?: number;
  region: MakeupRecipeRegion;
  layer: MakeupRecipeRegion;
  enabled: boolean;
  color: string;
  secondaryColor?: string;
  opacity: number;
  texture:
    | 'foundation_natural'
    | 'foundation_matte'
    | 'foundation_glow'
    | 'matte_lip'
    | 'soft_blush'
    | 'blush_session_1'
    | 'blush_session_2'
    | 'blush_session_3'
    | 'blush_session_4'
    | 'blush_session_5'
    | 'natural_brow'
    | 'shimmer_eye';
  sample:
    | 'foundation_natural'
    | 'foundation_matte'
    | 'foundation_glow'
    | 'matte_lip'
    | 'soft_blush'
    | 'blush_session_1'
    | 'blush_session_2'
    | 'blush_session_3'
    | 'blush_session_4'
    | 'blush_session_5'
    | 'natural_brow'
    | 'shimmer_eye';
  textureMode: 'sample';
  intensity: number;
  feather: number;
  blendMode: 'normal' | 'multiply' | 'screen';
  rendererMode: 'smooth-region-mask';
  coverage: number;
  maskSpreadX: number;
  maskOffsetY: number;
  browGap: number;
  browAngle: number;
  browArch: number;
  browArchPosition: number;
  finish: string;
  textureAmount: number;
  roughness: number;
  specular: number;
  specularPower: number;
  glossBoost: number;
  detailAmount: number;
  browCleanupEnabled: boolean;
  browCleanupStrength: number;
  browReshapeStrength: number;
  browCleanupSourceMode: 'none' | 'grabpass' | 'ar_camera_background';
  shimmer: number;
  shimmerColor: string;
  skinAdaptive: boolean;
  preserveDetail: boolean;
  materialId: string;
  shaderMode: string;
  passCount: number;
  candidateId: string;
  maskTextureId: string;
  maskThreshold: number;
  maskFeatherUvNormalized: number;
  cornerReach: number;
  upperLipTightness: number;
  lowerLipTightness: number;
  upperInnerFill: number;
  verticalOffset: number;
  cameraBackdropAvailable: boolean;
  lightEstimateAvailable: boolean;
  mode?: FoundationRenderMode | undefined;
  fallbackMode?: FoundationFallbackMode | undefined;
  debugMaskMode?: number | undefined;
  foundationMode?: FoundationRenderMode | undefined;
  foundationFallbackMode?: FoundationFallbackMode | undefined;
};

export type FullFaceMakeupRecipe = {
  version: 2;
  recipeId: string;
  recipeBatchId: string;
  lookId: 'e7_full_face_region_generate_v0' | string;
  rendererMode: 'smooth-region-mask';
  activeRegions: string;
  region: MakeupRecipeRegion;
  layerCount: number;
  enabledLayerCount: number;
  sentAtMs: number;
  sourceFrameMetadata?: FullFaceMakeupSourceInput;
  layers: FullFaceMakeupRecipeLayer[];
};

export type FullFaceRegionControl = {
  enabled: boolean;
  colorHex: string;
  opacity: number;
  intensity: number;
  finish: string;
  textureAmount: number;
  roughness: number;
  specular: number;
  specularPower: number;
  glossBoost: number;
  shimmer: number;
  candidateId: string;
  maskTextureId: string;
  params: Record<string, number>;
  foundationMode?: FoundationRenderMode | undefined;
  foundationFallbackMode?: FoundationFallbackMode | undefined;
  foundationDebugMaskMode?: number | undefined;
};

export type FullFaceRegionControls = Record<MakeupRecipeRegion, FullFaceRegionControl>;

export type FullFaceRegionRuntimeAsset = {
  region: MakeupRecipeRegion;
  candidateId: string;
  maskTextureId: string;
  width: number;
  height: number;
  runtimeReady: false;
};

export type LipRegionPayload = {
  region: 'lip';
  maskId: string;
  captureSetId: string;
  runtimeApplyPayload: unknown;
};

export const MAKEUP_REGION_ALIASES: Record<MakeupRecipeRegionAlias, MakeupRecipeRegion> = {
  base: 'foundation',
  blush: 'blush',
  brow: 'brow',
  cheek: 'blush',
  eye: 'eyeliner',
  eyeliner: 'eyeliner',
  foundation: 'foundation',
  lip: 'lip',
};

export const PRODUCT_REGION_LABELS: Record<MakeupRecipeRegion, string> = {
  foundation: '파운데이션',
  lip: '립',
  blush: '블러셔',
  brow: '브로우',
  eyeliner: '아이라이너',
};

export const FULL_FACE_REGION_RUNTIME_ASSETS: Record<
  MakeupRecipeRegion,
  FullFaceRegionRuntimeAsset
> = {
  foundation: {
    region: 'foundation',
    candidateId: 'foundation-skin-tone-relative-v1',
    maskTextureId: 'foundation-skin-mask-v1',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
  lip: {
    region: 'lip',
    candidateId: 'lip-balanced-gold-v0',
    maskTextureId: 'e7-lip-balanced-uv-v0',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
  blush: {
    region: 'blush',
    candidateId: 'blush-session-1-v1',
    maskTextureId: 'cheek-session-mask-1-v1',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
  brow: {
    region: 'brow',
    candidateId: 'brow-psd-semi-arch-v1',
    maskTextureId: 'psd-arcore-brow-semi-arch-v1',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
  eyeliner: {
    region: 'eyeliner',
    candidateId: 'eyeliner-minimal-safe-lashline-v0',
    maskTextureId: 'e7-eyeliner-minimal-safe-uv-v0',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
};

export const REGION_COLOR_OPTIONS: Record<
  MakeupRecipeRegion,
  readonly FullFaceRegionColorOption[]
> = {
  foundation: [
    {id: 'neutral-21', label: '뉴트럴 21', hex: '#D7B19A'},
    {id: 'ivory-19', label: '아이보리 19', hex: '#E6C4AD'},
    {id: 'beige-23', label: '베이지 23', hex: '#CFA58A'},
    {id: 'sand-25', label: '샌드 25', hex: '#B98E74'},
  ],
  lip: [
    {id: 'rose', label: '로즈', hex: '#C76B74'},
    {id: 'berry', label: '베리', hex: '#A64262'},
    {id: 'coral', label: '코랄', hex: '#D97A5B'},
    {id: 'brick', label: '브릭', hex: '#9D4E3F'},
  ],
  blush: [
    {id: 'peach', label: '피치', hex: '#E67B5F'},
    {id: 'rose', label: '로즈', hex: '#D77986'},
    {id: 'apricot', label: '살구', hex: '#E99A6E'},
    {id: 'mauve', label: '모브', hex: '#BE7684'},
  ],
  brow: [
    {id: 'soft-brown', label: '브라운', hex: '#4A342B'},
    {id: 'ash', label: '애쉬', hex: '#5C514B'},
    {id: 'deep', label: '딥', hex: '#2F261F'},
    {id: 'light', label: '라이트', hex: '#7A5A43'},
  ],
  eyeliner: [
    {id: 'soft-black', label: '블랙', hex: '#2F2730'},
    {id: 'brown', label: '브라운', hex: '#4A332D'},
    {id: 'plum', label: '플럼', hex: '#40303F'},
    {id: 'taupe', label: '토프', hex: '#5E514E'},
  ],
};

export const REGION_FINISH_OPTIONS: Record<
  MakeupRecipeRegion,
  readonly FullFaceRegionFinishOption[]
> = {
  foundation: [
    {
      id: 'natural',
      label: '내추럴',
      finish: 'natural',
      textureAmount: 0.3,
      roughness: 0.35,
      specular: 0,
      specularPower: 8,
      glossBoost: 0.3,
      shimmer: 0,
    },
    {
      id: 'matte',
      label: '세미매트',
      finish: 'matte',
      textureAmount: 0.38,
      roughness: 0.28,
      specular: 0,
      specularPower: 8,
      glossBoost: 0.38,
      shimmer: 0,
    },
    {
      id: 'glow',
      label: '윤광',
      finish: 'glow',
      textureAmount: 0.24,
      roughness: 0.4,
      specular: 0.08,
      specularPower: 16,
      glossBoost: 0.24,
      shimmer: 0,
    },
  ],
  lip: [
    {
      id: 'natural',
      label: '내추럴',
      finish: 'natural-makeup',
      textureAmount: 0,
      roughness: 0.08,
      specular: 0.04,
      specularPower: 12,
      glossBoost: 0,
      shimmer: 0,
    },
    {
      id: 'cream',
      label: '크림',
      finish: 'cream',
      textureAmount: 0.18,
      roughness: 0.16,
      specular: 0.16,
      specularPower: 18,
      glossBoost: 0.12,
      shimmer: 0,
    },
    {
      id: 'gloss',
      label: '글로스',
      finish: 'gloss',
      textureAmount: 0.26,
      roughness: 0.08,
      specular: 0.34,
      specularPower: 26,
      glossBoost: 0.34,
      shimmer: 0.02,
    },
  ],
  blush: [
    {
      id: 'soft',
      label: '소프트',
      finish: 'soft-powder',
      textureAmount: 0.12,
      roughness: 0.42,
      specular: 0.02,
      specularPower: 8,
      glossBoost: 0,
      shimmer: 0,
    },
    {
      id: 'cream',
      label: '크림',
      finish: 'cream-blush',
      textureAmount: 0.18,
      roughness: 0.24,
      specular: 0.12,
      specularPower: 14,
      glossBoost: 0.08,
      shimmer: 0,
    },
    {
      id: 'glow',
      label: '은은광',
      finish: 'sheer-glow',
      textureAmount: 0.2,
      roughness: 0.18,
      specular: 0.18,
      specularPower: 18,
      glossBoost: 0.12,
      shimmer: 0.1,
    },
  ],
  brow: [
    {
      id: 'powder',
      label: '파우더',
      finish: 'soft-powder-brow',
      textureAmount: 0.22,
      roughness: 0.5,
      specular: 0,
      specularPower: 8,
      glossBoost: 0,
      shimmer: 0,
    },
    {
      id: 'hair',
      label: '결',
      finish: 'hair-stroke-brow',
      textureAmount: 0.42,
      roughness: 0.36,
      specular: 0.03,
      specularPower: 10,
      glossBoost: 0,
      shimmer: 0,
    },
    {
      id: 'clear',
      label: '또렷',
      finish: 'defined-brow',
      textureAmount: 0.34,
      roughness: 0.28,
      specular: 0.06,
      specularPower: 12,
      glossBoost: 0.02,
      shimmer: 0,
    },
  ],
  eyeliner: [
    {
      id: 'soft',
      label: '소프트',
      finish: 'soft-eye-line',
      textureAmount: 0.16,
      roughness: 0.3,
      specular: 0.04,
      specularPower: 10,
      glossBoost: 0,
      shimmer: 0,
    },
    {
      id: 'clear',
      label: '선명',
      finish: 'defined-eye-line',
      textureAmount: 0.24,
      roughness: 0.2,
      specular: 0.08,
      specularPower: 14,
      glossBoost: 0.04,
      shimmer: 0,
    },
    {
      id: 'sheer',
      label: '은은광',
      finish: 'soft-eye-shimmer',
      textureAmount: 0.22,
      roughness: 0.18,
      specular: 0.16,
      specularPower: 18,
      glossBoost: 0.08,
      shimmer: 0.08,
    },
  ],
};

export const REGION_CANDIDATE_OPTIONS: Record<
  MakeupRecipeRegion,
  readonly FullFaceRegionCandidateOption[]
> = {
  foundation: [
    {
      id: 'skin',
      label: '피부 영역',
      candidateId: FULL_FACE_REGION_RUNTIME_ASSETS.foundation.candidateId,
      maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.foundation.maskTextureId,
    },
  ],
  lip: [
    {
      id: 'balanced',
      label: '균형',
      candidateId: FULL_FACE_REGION_RUNTIME_ASSETS.lip.candidateId,
      maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.lip.maskTextureId,
    },
    {
      id: 'tight',
      label: '밀착',
      candidateId: 'lip-tight-auto-v0',
      maskTextureId: 'e7-lip-validation-tight-auto-v0',
    },
    {
      id: 'soft',
      label: '부드럽게',
      candidateId: 'lip-safe-v0',
      maskTextureId: 'e7-lip-validation-safe-v0',
    },
  ],
  blush: [
    {
      id: 'daily',
      label: 'Daily',
      candidateId: 'blush-session-1-v1',
      maskTextureId: 'cheek-session-mask-1-v1',
    },
    {
      id: 'lovely',
      label: 'Lovely',
      candidateId: 'blush-session-2-v1',
      maskTextureId: 'cheek-session-mask-2-v1',
    },
    {
      id: 'under-eye',
      label: 'Under',
      candidateId: 'blush-session-3-v1',
      maskTextureId: 'cheek-session-mask-3-v1',
    },
    {
      id: 'sun-1',
      label: 'Sun 1',
      candidateId: 'blush-session-4-v1',
      maskTextureId: 'cheek-session-mask-4-v1',
    },
    {
      id: 'sun-2',
      label: 'Sun 2',
      candidateId: 'blush-session-5-v1',
      maskTextureId: 'cheek-session-mask-5-v1',
    },
  ],
  brow: [
    {
      id: 'psd',
      label: '세미아치',
      candidateId: FULL_FACE_REGION_RUNTIME_ASSETS.brow.candidateId,
      maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.brow.maskTextureId,
    },
    {
      id: 'soft',
      label: '소프트',
      candidateId: 'brow-soft-arch-fine-hair-v1',
      maskTextureId: 'brow-soft-arch-fine-hair-v1',
    },
    {
      id: 'slim',
      label: '슬림',
      candidateId: 'brow-slim-tail-fine-hair-v1',
      maskTextureId: 'brow-slim-tail-fine-hair-v1',
    },
  ],
  eyeliner: [
    {
      id: 'minimal',
      label: '미니멀',
      candidateId: FULL_FACE_REGION_RUNTIME_ASSETS.eyeliner.candidateId,
      maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.eyeliner.maskTextureId,
    },
    {
      id: 'smooth',
      label: '소프트',
      candidateId: 'eyeliner-smooth-v1',
      maskTextureId: 'eye-smooth-mask-v1',
    },
    {
      id: 'drawn',
      label: '선명',
      candidateId: 'eyeliner-drawn-v1',
      maskTextureId: 'eye-drawn-mask-v1',
    },
  ],
};

export const REGION_ADJUSTMENT_FIELD_SCHEMAS: Record<
  MakeupRecipeRegion,
  RegionAdjustmentFieldSchema[]
> = {
  foundation: [
    {
      name: 'coverage',
      label: '커버력',
      min: 0.15,
      max: 0.85,
      step: 0.05,
      defaultValue: 0.6,
      help: '현재 피부톤을 파운데이션 쉐이드 방향으로 정돈하는 정도입니다.',
    },
    {
      name: 'feather',
      label: '경계',
      min: 0.18,
      max: 0.7,
      step: 0.04,
      defaultValue: 0.42,
      help: '턱선과 헤어라인 주변의 부드러운 정도입니다.',
    },
    {
      name: 'maskThreshold',
      label: '피부영역',
      min: 0.02,
      max: 0.2,
      step: 0.01,
      defaultValue: 0.04,
      help: '피부 마스크가 잡히는 기준입니다.',
    },
  ],
  lip: [
    {
      name: 'cornerReach',
      label: '입꼬리',
      min: -1,
      max: 1,
      step: 0.05,
      defaultValue: 0,
      help: '양쪽 입꼬리까지 색이 닿는 범위를 조정합니다.',
    },
    {
      name: 'upperLipTightness',
      label: '윗입술',
      min: -1,
      max: 1,
      step: 0.05,
      defaultValue: 0,
      help: '윗입술 라인의 밀착도를 조정합니다.',
    },
    {
      name: 'lowerLipTightness',
      label: '밑입술',
      min: -1,
      max: 1,
      step: 0.05,
      defaultValue: 0,
      help: '밑입술 라인의 밀착도를 조정합니다.',
    },
    {
      name: 'upperInnerFill',
      label: '안쪽채움',
      min: -1,
      max: 1,
      step: 0.15,
      defaultValue: 0,
      help: '입 안쪽으로 보이는 영역의 채움 정도를 조정합니다.',
    },
    {
      name: 'verticalOffset',
      label: '위치',
      min: -1,
      max: 1,
      step: 0.05,
      defaultValue: 0,
      help: '입술 마스크의 위아래 위치를 조정합니다.',
    },
  ],
  blush: [
    {
      name: 'coverage',
      label: '범위',
      min: 0.25,
      max: 1,
      step: 0.05,
      defaultValue: 0.68,
      help: '볼에 퍼지는 면적을 조정합니다.',
    },
    {
      name: 'feather',
      label: '번짐',
      min: 0.02,
      max: 0.22,
      step: 0.01,
      defaultValue: 0.07,
      help: '가장자리의 부드러운 정도를 조정합니다.',
    },
    {
      name: 'maskThreshold',
      label: '선명도',
      min: 0.05,
      max: 0.45,
      step: 0.01,
      defaultValue: 0.18,
      help: '볼 마스크가 잡히는 밀도를 조정합니다.',
    },
  ],
  brow: [
    {
      name: 'detailAmount',
      label: '결',
      min: 0,
      max: 1,
      step: 0.05,
      defaultValue: 0.64,
      help: '눈썹 결 표현의 양을 조정합니다.',
    },
    {
      name: 'maskSpreadX',
      label: '폭',
      min: -0.34,
      max: 0.34,
      step: 0.02,
      defaultValue: 0,
      help: '눈썹 좌우 폭을 조정합니다.',
    },
    {
      name: 'maskOffsetY',
      label: '높이',
      min: -0.08,
      max: 0.08,
      step: 0.01,
      defaultValue: 0,
      help: '눈썹 위치를 위아래로 조정합니다.',
    },
    {
      name: 'browGap',
      label: '간격',
      min: -0.34,
      max: 0.34,
      step: 0.02,
      defaultValue: 0,
      help: '미간 쪽 간격을 조정합니다.',
    },
    {
      name: 'browAngle',
      label: '각도',
      min: -0.16,
      max: 0.16,
      step: 0.01,
      defaultValue: 0,
      help: '눈썹 기울기를 조정합니다.',
    },
    {
      name: 'browArch',
      label: '아치',
      min: -0.05,
      max: 0.05,
      step: 0.01,
      defaultValue: 0,
      help: '눈썹 산의 높이를 조정합니다.',
    },
    {
      name: 'browArchPosition',
      label: '산 위치',
      min: -0.15,
      max: 0.15,
      step: 0.01,
      defaultValue: 0,
      help: '눈썹 산의 좌우 위치를 조정합니다.',
    },
  ],
  eyeliner: [
    {
      name: 'coverage',
      label: '길이',
      min: 0.35,
      max: 1,
      step: 0.05,
      defaultValue: 0.72,
      help: '아이라인의 적용 길이를 조정합니다.',
    },
    {
      name: 'feather',
      label: '부드러움',
      min: 0.01,
      max: 0.18,
      step: 0.01,
      defaultValue: 0.07,
      help: '라인의 가장자리 부드러움을 조정합니다.',
    },
    {
      name: 'maskThreshold',
      label: '밀도',
      min: 0.04,
      max: 0.35,
      step: 0.01,
      defaultValue: 0.12,
      help: '라인이 보이는 밀도를 조정합니다.',
    },
  ],
};

export const DEFAULT_FULL_FACE_REGION_CONTROLS: FullFaceRegionControls = {
  foundation: {
    enabled: false,
    colorHex: REGION_COLOR_OPTIONS.foundation[0].hex,
    opacity: 0.65,
    intensity: 0.5,
    ...REGION_FINISH_OPTIONS.foundation[0],
    candidateId: REGION_CANDIDATE_OPTIONS.foundation[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.foundation[0].maskTextureId,
    params: createDefaultRegionParams('foundation'),
  },
  lip: {
    enabled: true,
    colorHex: REGION_COLOR_OPTIONS.lip[0].hex,
    opacity: 0.62,
    intensity: 0.72,
    ...REGION_FINISH_OPTIONS.lip[0],
    candidateId: REGION_CANDIDATE_OPTIONS.lip[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.lip[0].maskTextureId,
    params: createDefaultRegionParams('lip'),
  },
  blush: {
    enabled: true,
    colorHex: REGION_COLOR_OPTIONS.blush[0].hex,
    opacity: 0.45,
    intensity: 0.45,
    ...REGION_FINISH_OPTIONS.blush[0],
    candidateId: REGION_CANDIDATE_OPTIONS.blush[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.blush[0].maskTextureId,
    params: createDefaultRegionParams('blush'),
  },
  brow: {
    enabled: true,
    colorHex: REGION_COLOR_OPTIONS.brow[0].hex,
    opacity: 0.75,
    intensity: 0.76,
    ...REGION_FINISH_OPTIONS.brow[0],
    candidateId: REGION_CANDIDATE_OPTIONS.brow[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.brow[0].maskTextureId,
    params: createDefaultRegionParams('brow'),
  },
  eyeliner: {
    enabled: true,
    colorHex: REGION_COLOR_OPTIONS.eyeliner[0].hex,
    opacity: 0.66,
    intensity: 0.72,
    ...REGION_FINISH_OPTIONS.eyeliner[0],
    candidateId: REGION_CANDIDATE_OPTIONS.eyeliner[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.eyeliner[0].maskTextureId,
    params: createDefaultRegionParams('eyeliner'),
  },
};

export function normalizeMakeupRecipeRegion(
  region: MakeupRecipeRegionAlias,
): MakeupRecipeRegion {
  return MAKEUP_REGION_ALIASES[region];
}

export function getMakeupRecipeRegionsForArea(
  area: MakeupAreaLike,
): readonly MakeupRecipeRegion[] {
  if (area === 'all') {
    return MAKEUP_RECIPE_REGIONS;
  }

  if (area === 'cheek') {
    return ['blush'];
  }

  if (area === 'eye') {
    return ['eyeliner'];
  }

  if (area === 'base') {
    return ['foundation'];
  }

  if (area === 'lip' || area === 'brow') {
    return [area];
  }

  return [];
}

export function createDefaultRegionParams(
  region: MakeupRecipeRegion,
): Record<string, number> {
  return REGION_ADJUSTMENT_FIELD_SCHEMAS[region].reduce<Record<string, number>>(
    (params, field) => {
      params[field.name] = field.defaultValue;
      return params;
    },
    {},
  );
}

export function buildFullFaceMakeupRecipe({
  controls = DEFAULT_FULL_FACE_REGION_CONTROLS,
  recipeId,
  recipeBatchId,
  sentAtMs = Date.now(),
  sourceFrameMetadata,
}: {
  controls?: FullFaceRegionControls;
  recipeId?: string;
  recipeBatchId?: string;
  sentAtMs?: number;
  sourceFrameMetadata?: FullFaceMakeupSourceInput;
} = {}): FullFaceMakeupRecipe {
  const resolvedRecipeId = recipeId ?? `full-face-makeup-${sentAtMs}`;
  const resolvedRecipeBatchId = recipeBatchId ?? `${resolvedRecipeId}-batch`;
  const activeRegions = MAKEUP_RECIPE_REGIONS.filter(region => controls[region].enabled);
  const activeRegionSummary =
    activeRegions.length > 0 ? activeRegions.join(',') : 'none';
  const enabledLayerCount = activeRegions.length;
  const layers = MAKEUP_RECIPE_REGIONS.map(region =>
    buildFullFaceMakeupRecipeLayer({
      region,
      controls,
      recipeId: resolvedRecipeId,
      recipeBatchId: resolvedRecipeBatchId,
      activeRegions: activeRegionSummary,
      enabledLayerCount,
      sentAtMs,
    }),
  );

  return {
    version: 2,
    recipeId: resolvedRecipeId,
    recipeBatchId: resolvedRecipeBatchId,
    lookId: 'e7_full_face_region_generate_v0',
    rendererMode: 'smooth-region-mask',
    activeRegions: activeRegionSummary,
    region: 'lip',
    layerCount: MAKEUP_RECIPE_REGIONS.length,
    enabledLayerCount,
    sentAtMs,
    sourceFrameMetadata,
    layers,
  };
}

function buildFullFaceMakeupRecipeLayer({
  region,
  controls,
  recipeId,
  recipeBatchId,
  activeRegions,
  enabledLayerCount,
  sentAtMs,
}: {
  region: MakeupRecipeRegion;
  controls: FullFaceRegionControls;
  recipeId: string;
  recipeBatchId: string;
  activeRegions: string;
  enabledLayerCount: number;
  sentAtMs: number;
}): FullFaceMakeupRecipeLayer {
  const control = controls[region];
  const params = control.params;
  const texture = getTextureForRegionControl(region, control);
  const blendMode = 'multiply';
  const materialId = `e7-full-face-${region}-material-v0`;
  const skinAdaptive = region === 'lip' || region === 'foundation';

  return {
    id: `${region}-${control.candidateId}`,
    recipeId,
    recipeBatchId,
    lookId: 'e7_full_face_region_generate_v0',
    sentAtMs,
    activeRegions,
    layerCount: MAKEUP_RECIPE_REGIONS.length,
    enabledLayerCount,
    region,
    layer: region,
    enabled: control.enabled,
    color: control.colorHex,
    secondaryColor: region === 'foundation' ? '#C89A82' : undefined,
    opacity: control.enabled ? control.opacity : 0,
    texture,
    sample: texture,
    textureMode: 'sample',
    intensity: control.enabled ? control.intensity : 0,
    feather: getRegionParam(params, 'feather', region === 'brow' ? 0.42 : 0.07),
    blendMode,
    rendererMode: 'smooth-region-mask',
    coverage: getRegionParam(params, 'coverage', region === 'lip' ? 1 : 0.72),
    maskSpreadX: getRegionParam(params, 'maskSpreadX', 0),
    maskOffsetY: getRegionParam(params, 'maskOffsetY', 0),
    browGap: getRegionParam(params, 'browGap', 0),
    browAngle: getRegionParam(params, 'browAngle', 0),
    browArch: getRegionParam(params, 'browArch', 0),
    browArchPosition: getRegionParam(params, 'browArchPosition', 0),
    finish: control.finish,
    textureAmount: control.textureAmount,
    roughness: control.roughness,
    specular: control.specular,
    specularPower: control.specularPower,
    glossBoost: control.glossBoost,
    detailAmount: getRegionParam(params, 'detailAmount', 0),
    browCleanupEnabled: false,
    browCleanupStrength: 0,
    browReshapeStrength: region === 'brow' ? 0.16 : 0,
    browCleanupSourceMode: 'none',
    shimmer: control.shimmer,
    shimmerColor: '#FFFFFF',
    skinAdaptive,
    preserveDetail: true,
    materialId,
    shaderMode: 'smooth-lip-finish-v0',
    passCount: 1,
    candidateId: control.candidateId,
    maskTextureId: control.maskTextureId,
    maskThreshold: getRegionParam(params, 'maskThreshold', getDefaultMaskThreshold(region)),
    maskFeatherUvNormalized: getRegionParam(params, 'feather', region === 'brow' ? 0.42 : 0.07),
    cornerReach: getRegionParam(params, 'cornerReach', 0),
    upperLipTightness: getRegionParam(params, 'upperLipTightness', 0),
    lowerLipTightness: getRegionParam(params, 'lowerLipTightness', 0),
    upperInnerFill: getRegionParam(params, 'upperInnerFill', 0),
    verticalOffset: getRegionParam(params, 'verticalOffset', 0),
    cameraBackdropAvailable: false,
    lightEstimateAvailable: false,
    mode: region === 'foundation' ? control.foundationMode : undefined,
    fallbackMode: region === 'foundation' ? control.foundationFallbackMode : undefined,
    debugMaskMode:
      region === 'foundation'
        ? control.foundationDebugMaskMode ?? getRegionParam(params, 'debugMaskMode', 0)
        : undefined,
    foundationMode: region === 'foundation' ? control.foundationMode : undefined,
    foundationFallbackMode:
      region === 'foundation' ? control.foundationFallbackMode : undefined,
  };
}

function getDefaultTextureForRegion(
  region: MakeupRecipeRegion,
): FullFaceMakeupRecipeLayer['texture'] {
  if (region === 'foundation') {
    return 'foundation_natural';
  }

  if (region === 'lip') {
    return 'matte_lip';
  }

  if (region === 'blush') {
    return 'soft_blush';
  }

  if (region === 'brow') {
    return 'natural_brow';
  }

  return 'shimmer_eye';
}

function getTextureForRegionControl(
  region: MakeupRecipeRegion,
  control: FullFaceRegionControl,
): FullFaceMakeupRecipeLayer['texture'] {
  if (region !== 'blush') {
    if (region === 'foundation') {
      if (control.finish === 'matte') {
        return 'foundation_matte';
      }
      if (control.finish === 'glow') {
        return 'foundation_glow';
      }
    }

    return getDefaultTextureForRegion(region);
  }

  switch (control.maskTextureId) {
    case 'cheek-session-mask-1-v1':
      return 'blush_session_1';
    case 'cheek-session-mask-2-v1':
      return 'blush_session_2';
    case 'cheek-session-mask-3-v1':
      return 'blush_session_3';
    case 'cheek-session-mask-4-v1':
      return 'blush_session_4';
    case 'cheek-session-mask-5-v1':
      return 'blush_session_5';
    default:
      return 'soft_blush';
  }
}

function getDefaultMaskThreshold(region: MakeupRecipeRegion): number {
  if (region === 'foundation') {
    return 0.04;
  }

  if (region === 'lip') {
    return 0.35;
  }

  if (region === 'blush') {
    return 0.18;
  }

  if (region === 'brow') {
    return 0.035;
  }

  return 0.12;
}

function getRegionParam(
  params: Record<string, number>,
  name: string,
  fallback: number,
): number {
  return Number.isFinite(params[name]) ? params[name] : fallback;
}

export * from './fullFaceMakeupCapture';
