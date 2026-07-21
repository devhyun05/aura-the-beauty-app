import type {FullFaceMakeupSourceInput} from './fullFaceMakeupCapture';
import {
  AR_BLUSH_COLORS,
  AR_BLUSH_DEFAULT_COLOR,
  AR_BLUSH_REFERENCE_SHAPES,
} from './arBlushCatalog';

// 'lens' is LAST so the colored contact-lens disc paints AFTER (on top of) the
// eye makeup layers (eyeliner) in a combined look.
// 'eyeshadow' renders via the ARwithFable graft band (setEyeshadowLayers), NOT
// the ApplyRecipeJson wire — Unity's recipe parser rejects the region and a
// parse failure wipes every layer, so postUnityMakeupRecipe strips it from the
// wire payload and side-channels it (same pattern as the dormant lens layer).
export const MAKEUP_RECIPE_REGIONS = ['foundation', 'lip', 'blush', 'brow', 'eyeshadow', 'eyeliner', 'lens'] as const;

export type MakeupRecipeRegion = (typeof MAKEUP_RECIPE_REGIONS)[number];

export type MakeupRecipeRegionAlias = MakeupRecipeRegion | 'base' | 'cheek' | 'eye';

export type MakeupAreaLike =
  | 'all'
  | 'base'
  | 'eye'
  | 'brow'
  | 'lip'
  | 'cheek'
  | 'lens';

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

export type FoundationRenderMode = 'uvMask' | 'screenSpace' | 'semantic';

export type FoundationFallbackMode = 'uvMask' | 'off';

// Recipe-level half-face makeup flag. 'off' = full face (default, unchanged
// behavior). 'left'/'right' render makeup on only one half of the face,
// split down the canonical face centerline (face UV x = 0.5). The Unity side
// maps this to the _HalfFaceMode shader uniform (off=0, left=1, right=2).
export type HalfFaceMode = 'off' | 'left' | 'right';

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
    | 'gloss_lip'
    | 'gradient_lip'
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
    | 'gloss_lip'
    | 'gradient_lip'
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
  // 'screen' removed: never implemented (Unity rendered it as normal).
  // Unity aliases legacy 'screen' payloads to 'normal' for old app versions.
  blendMode: 'normal' | 'multiply';
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
  gradientAmount: number;
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
  halfFaceMode: HalfFaceMode;
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
  gradientAmount: number;
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
  eyeshadow: 'eyeshadow',
  foundation: 'foundation',
  lens: 'lens',
  lip: 'lip',
};

export const PRODUCT_REGION_LABELS: Record<MakeupRecipeRegion, string> = {
  foundation: '파운데이션',
  lip: '립',
  blush: '블러셔',
  brow: '브로우',
  eyeshadow: '아이섀도',
  eyeliner: '아이라이너',
  lens: '렌즈',
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
    // Mesh-locked canonical-UV atlas (E3). The previous 'e7-lip-balanced-uv-v0'
    // routes to the E7 screen-UV path, which is blocked at runtime with
    // arface_uv_unavailable, so lips never rendered from combined recipes.
    maskTextureId: 'lip-drawn-style-atlas-v1',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
  blush: {
    region: 'blush',
    // Keep the 512x512 balanced atlas as the no-selection fallback. The five
    // reference masks are 1254px candidate choices and must not inherit this
    // runtime asset's dimensions.
    candidateId: 'blush-balanced-soft-oval-v0',
    maskTextureId: 'e7-blush-balanced-uv-v0',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
  brow: {
    region: 'brow',
    // The psd-arcore-brow-semi-arch mask is doubly malformed: its shape lived in
    // the alpha channel (shader reads red -> whole face painted) AND it sits at
    // ~0.30 of texture height (eye/lash level, cy/H) instead of the eyebrow band
    // (~0.22), so it read like eyeliner on the eyes. Use the correctly-authored
    // natural-hair brow mask (shape in RGB, positioned on the brows).
    candidateId: 'brow-png-natural-hair-v1',
    maskTextureId: 'brow-png-natural-hair-v1',
    width: 512,
    height: 512,
    runtimeReady: false,
  },
  eyeshadow: {
    region: 'eyeshadow',
    // The eyeshadow band is generated at runtime by the ARwithFable graft
    // (IrisRenderer dynamic band via setEyeshadowLayers); no UV mask PNG. These
    // ids never reach the ApplyRecipeJson wire.
    candidateId: 'eyeshadow-graft-band-v1',
    maskTextureId: 'eyeshadow-graft-band-v1',
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
  lens: {
    region: 'lens',
    // The iris disc mask is generated at runtime in E3 from the calibrated eye
    // zones (region=='lens' && maskTextureId=='lens-iris-disc-v1'); no PNG.
    candidateId: 'lens-iris-disc-v1',
    maskTextureId: 'lens-iris-disc-v1',
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
    {id: 'porcelain-cool-110c', label: '포슬린 쿨', hex: '#F0E7DB'},
    {id: 'golden-sand-260n', label: '골든 샌드', hex: '#D9AD7E'},
    {id: 'rosy-medium-320n', label: '로지 미디엄', hex: '#B88C6A'},
  ],
  // ARwithFable 원본 립 스와치(src/presets.ts LIP_COLORS)를 그대로 사용.
  // id는 rose/berry/coral/brick 유지(기존 목·테스트 selectedColorId 호환) +
  // pink/rosy 추가로 6색 구성.
  lip: [
    {id: 'rose', label: '로즈', hex: '#C94F6D'},
    {id: 'pink', label: '핑크', hex: '#E04E68'},
    {id: 'brick', label: '브릭', hex: '#B01E3C'},
    {id: 'coral', label: '코랄', hex: '#F2846B'},
    {id: 'rosy', label: '로지', hex: '#D96C7B'},
    {id: 'berry', label: '베리', hex: '#9E3B54'},
  ],
  blush: AR_BLUSH_COLORS.map(({id, label, hex}) => ({id, label, hex})),
  brow: [
    {id: 'soft-brown', label: '브라운', hex: '#4A342B'},
    {id: 'ash', label: '애쉬', hex: '#5C514B'},
    {id: 'deep', label: '딥', hex: '#2F261F'},
    {id: 'light', label: '라이트', hex: '#7A5A43'},
  ],
  // 아이섀도 밴드 틴트. 기본 브라운은 Unity FilterParams 기본색(#B06A4E)과 동일.
  eyeshadow: [
    {id: 'warm-brown', label: '웜 브라운', hex: '#B06A4E'},
    {id: 'coral', label: '코랄', hex: '#E08A6B'},
    {id: 'rose', label: '로즈', hex: '#D98A94'},
    {id: 'beige', label: '베이지', hex: '#C9A07E'},
    {id: 'mauve', label: '모브', hex: '#9E7B8F'},
    {id: 'burgundy', label: '버건디', hex: '#7E4A50'},
  ],
  eyeliner: [
    {id: 'soft-black', label: '블랙', hex: '#2F2730'},
    {id: 'brown', label: '브라운', hex: '#4A332D'},
    {id: 'plum', label: '플럼', hex: '#40303F'},
    {id: 'taupe', label: '토프', hex: '#5E514E'},
    // 컬러드 아이라이너 스타일의 기본색 (AR 검증 팔레트와 동일 hex).
    {id: 'burgundy', label: '버건디', hex: '#5A2A33'},
  ],
  // 컬러 렌즈(홍채 틴트). 색 id가 곧 렌즈 id이며 unityMakeupBridge의
  // LENS_COLOR_PRESETS가 이 id로 opacity를 결정합니다. 진한색(블루/그린/바이올렛)은
  // 어두운 눈에도 보이도록 opacity를 높였습니다.
  lens: [
    {id: 'lens-natural-brown', label: '내추럴 브라운', hex: '#5B4634'},
    {id: 'lens-choco', label: '초코 브라운', hex: '#3E2C1E'},
    {id: 'lens-hazel', label: '헤이즐', hex: '#8A6A3B'},
    {id: 'lens-honey', label: '허니 브라운', hex: '#9A6B34'},
    {id: 'lens-gray', label: '그레이', hex: '#7C7B78'},
    {id: 'lens-ash-gray', label: '애쉬 그레이', hex: '#5E5E5C'},
    {id: 'lens-olive', label: '올리브 그린', hex: '#6E6B3A'},
    {id: 'lens-forest-green', label: '포레스트 그린', hex: '#4C6B4A'},
    {id: 'lens-ocean-blue', label: '오션 블루', hex: '#3C5A78'},
    {id: 'lens-violet', label: '바이올렛', hex: '#5E4A78'},
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
  // 아이섀도 마감 — finish 문자열은 unityMakeupBridge에서 그래프트 enum으로 번역
  // (satin=0, matte=1, gloss=2, shimmer=3). shimmer 값은 시머 게인으로 전달.
  eyeshadow: [
    {
      id: 'satin',
      label: '새틴',
      finish: 'satin',
      textureAmount: 0.2,
      roughness: 0.3,
      specular: 0.06,
      specularPower: 12,
      glossBoost: 0.04,
      shimmer: 0,
    },
    {
      id: 'matte',
      label: '매트',
      finish: 'matte',
      textureAmount: 0.26,
      roughness: 0.45,
      specular: 0,
      specularPower: 8,
      glossBoost: 0,
      shimmer: 0,
    },
    {
      id: 'gloss',
      label: '글로시',
      finish: 'gloss',
      textureAmount: 0.2,
      roughness: 0.15,
      specular: 0.2,
      specularPower: 20,
      glossBoost: 0.2,
      shimmer: 0.05,
    },
    {
      id: 'shimmer',
      label: '시머',
      finish: 'shimmer',
      textureAmount: 0.24,
      roughness: 0.2,
      specular: 0.14,
      specularPower: 16,
      glossBoost: 0.1,
      shimmer: 0.5,
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
  // Lens has no finish variety (the disc is a flat tint); a single natural
  // entry satisfies the total Record and the default-controls spread.
  lens: [
    {
      id: 'natural',
      label: '내추럴',
      finish: 'natural-lens',
      textureAmount: 0,
      roughness: 0.4,
      specular: 0,
      specularPower: 8,
      glossBoost: 0,
      shimmer: 0,
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
  blush: AR_BLUSH_REFERENCE_SHAPES.map(shape => ({
    id: shape.fullFaceCandidateOptionId,
    label: shape.label,
    candidateId: shape.candidateId,
    maskTextureId: shape.maskTextureId,
  })),
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
  eyeshadow: [
    {
      id: 'band',
      label: '기본 밴드',
      candidateId: FULL_FACE_REGION_RUNTIME_ASSETS.eyeshadow.candidateId,
      maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.eyeshadow.maskTextureId,
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
  lens: [
    {
      id: 'iris',
      label: '아이리스',
      candidateId: FULL_FACE_REGION_RUNTIME_ASSETS.lens.candidateId,
      maskTextureId: FULL_FACE_REGION_RUNTIME_ASSETS.lens.maskTextureId,
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
  // coverage는 그래프트 밴드의 세로 높이 배수(EyeshadowLayerParams.height)로 번역된다.
  eyeshadow: [
    {
      name: 'coverage',
      label: '범위',
      min: 0.7,
      max: 1.4,
      step: 0.05,
      defaultValue: 1,
      help: '아이섀도가 눈두덩을 덮는 높이를 조정합니다.',
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
  // Lens has no per-person adjustable params in v1 (color id carries opacity;
  // the disc geometry is auto-calibrated in Unity). Empty schema is valid.
  lens: [],
};

export const DEFAULT_FULL_FACE_REGION_CONTROLS: FullFaceRegionControls = {
  foundation: {
    enabled: false,
    colorHex: REGION_COLOR_OPTIONS.foundation[0].hex,
    opacity: 0.65,
    intensity: 0.5,
    ...REGION_FINISH_OPTIONS.foundation[0],
    gradientAmount: 0,
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
    gradientAmount: 0,
    candidateId: REGION_CANDIDATE_OPTIONS.lip[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.lip[0].maskTextureId,
    params: createDefaultRegionParams('lip'),
  },
  blush: {
    enabled: true,
    colorHex: AR_BLUSH_DEFAULT_COLOR.hex,
    opacity: 0.58,
    intensity: 0.62,
    ...REGION_FINISH_OPTIONS.blush[0],
    gradientAmount: 0,
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
    gradientAmount: 0,
    candidateId: REGION_CANDIDATE_OPTIONS.brow[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.brow[0].maskTextureId,
    params: createDefaultRegionParams('brow'),
  },
  eyeshadow: {
    // Off by default: existing saved looks/presets predate the region and must
    // not suddenly grow an eyeshadow band. The recommendation builder or the
    // editor tab opts in explicitly.
    enabled: false,
    colorHex: REGION_COLOR_OPTIONS.eyeshadow[0].hex,
    opacity: 0.5,
    intensity: 0.45,
    ...REGION_FINISH_OPTIONS.eyeshadow[0],
    // 세로 그라데 기본 강도(EyeshadowLayerParams.gradient) — 리드쪽이 살짝 진한 자연스러운 밴드.
    gradientAmount: 0.35,
    candidateId: REGION_CANDIDATE_OPTIONS.eyeshadow[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.eyeshadow[0].maskTextureId,
    params: createDefaultRegionParams('eyeshadow'),
  },
  eyeliner: {
    enabled: true,
    colorHex: REGION_COLOR_OPTIONS.eyeliner[0].hex,
    opacity: 0.66,
    intensity: 0.72,
    ...REGION_FINISH_OPTIONS.eyeliner[0],
    gradientAmount: 0,
    candidateId: REGION_CANDIDATE_OPTIONS.eyeliner[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.eyeliner[0].maskTextureId,
    params: createDefaultRegionParams('eyeliner'),
  },
  lens: {
    // Off by default: the lens only renders once the user picks a lens color.
    enabled: false,
    colorHex: REGION_COLOR_OPTIONS.lens[0].hex,
    opacity: 0.55,
    intensity: 1,
    ...REGION_FINISH_OPTIONS.lens[0],
    gradientAmount: 0,
    candidateId: REGION_CANDIDATE_OPTIONS.lens[0].candidateId,
    maskTextureId: REGION_CANDIDATE_OPTIONS.lens[0].maskTextureId,
    params: createDefaultRegionParams('lens'),
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
    // 'all' (전체 look) intentionally EXCLUDES lens: a colored contact lens is
    // an opt-in point item, not part of a full-face makeup look. It only
    // activates from its own dedicated 렌즈 tab. Eyeshadow is likewise excluded:
    // pre-existing 'all' preset looks were authored without a shadow band, and
    // painting one with the look's single color would change how they render.
    return MAKEUP_RECIPE_REGIONS.filter(
      region => region !== 'lens' && region !== 'eyeshadow',
    );
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

  if (area === 'lens') {
    return ['lens'];
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
  halfFaceMode = 'off',
  sourceFrameMetadata,
}: {
  controls?: FullFaceRegionControls;
  recipeId?: string;
  recipeBatchId?: string;
  sentAtMs?: number;
  halfFaceMode?: HalfFaceMode;
  sourceFrameMetadata?: FullFaceMakeupSourceInput;
} = {}): FullFaceMakeupRecipe {
  const resolvedRecipeId = recipeId ?? `full-face-makeup-${sentAtMs}`;
  const resolvedRecipeBatchId = recipeBatchId ?? `${resolvedRecipeId}-batch`;
  // Lens is temporarily EXCLUDED from the recipe pipeline — reverted to the
  // pre-lens working state per user request. Building/parsing a lens layer threw
  // in E3 (NormalizeTextureMode/Sample on the lens layer, before the per-layer
  // guard) and the recipe-apply catch responded by wiping ALL makeup. Excluding
  // the lens layer here means no lens layer is ever sent/parsed. The lens Unity
  // + RN code stays dormant for a clean re-introduction later.
  //
  // Eyeshadow IS included in recipe.layers so saved contracts round-trip it,
  // but postUnityMakeupRecipe strips it from the ApplyRecipeJson wire payload
  // (Unity's parser rejects the region) and delivers it via setEyeshadowLayers.
  const recipeRegionsActive = MAKEUP_RECIPE_REGIONS.filter(region => region !== 'lens');
  const recipeLayerCount = recipeRegionsActive.length;
  const activeRegions = recipeRegionsActive.filter(region => controls[region].enabled);
  const activeRegionSummary =
    activeRegions.length > 0 ? activeRegions.join(',') : 'none';
  const enabledLayerCount = activeRegions.length;
  const layers = recipeRegionsActive.map(region =>
    buildFullFaceMakeupRecipeLayer({
      region,
      controls,
      recipeId: resolvedRecipeId,
      recipeBatchId: resolvedRecipeBatchId,
      activeRegions: activeRegionSummary,
      layerCount: recipeLayerCount,
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
    layerCount: recipeLayerCount,
    enabledLayerCount,
    sentAtMs,
    halfFaceMode,
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
  layerCount,
  enabledLayerCount,
  sentAtMs,
}: {
  region: MakeupRecipeRegion;
  controls: FullFaceRegionControls;
  recipeId: string;
  recipeBatchId: string;
  activeRegions: string;
  layerCount: number;
  enabledLayerCount: number;
  sentAtMs: number;
}): FullFaceMakeupRecipeLayer {
  const control = controls[region];
  const params = control.params;
  const texture = getTextureForRegionControl(region, control);
  // The lens MUST composite as an ALPHA OVERLAY (blendMode 'normal' ->
  // SrcAlpha/OneMinusSrcAlpha in Unity), NOT multiply. Multiply can only
  // darken, so it could never turn a dark iris blue/green/lighter, and it also
  // routes through the pigmentStrength cap. 'normal' overlays the color like a
  // real printed contact and bypasses that cap (fix #1).
  //
  // The BROW likewise needs 'normal': to ERASE the user's natural brow the
  // Unity shader must FILL forehead skin (a LIGHTEN over the dark natural brow)
  // and then draw the brow color on top in one alpha-over pass. Under multiply
  // (DstColor/Zero) that skin fill is impossible AND the multiply path
  // early-returns before the static-erase branch runs, so the natural brow is
  // never removed (it just gets a darker brow painted over it). All other
  // regions keep the existing multiply tint blend.
  const blendMode = region === 'lens' || region === 'brow' ? 'normal' : 'multiply';
  const materialId = `e7-full-face-${region}-material-v0`;
  const skinAdaptive = region === 'lip' || region === 'foundation';

  return {
    id: `${region}-${control.candidateId}`,
    recipeId,
    recipeBatchId,
    lookId: 'e7_full_face_region_generate_v0',
    sentAtMs,
    activeRegions,
    layerCount,
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
    // Lip 형태(그라데이션) shaping strength. Independent of finish/glossBoost:
    // drives _GradientAmount in the shader's gradient_lip base-fill (mode 3).
    gradientAmount: control.gradientAmount,
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

  // eyeliner + lens both use 'shimmer_eye' as a placeholder sample. The lens
  // ignores the sample entirely (the shader's lens branch early-returns before
  // any sample-driven logic); it just needs a token the Unity normalizer
  // accepts for the 'lens' region.
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

    if (region === 'lip') {
      // Lip base-fill mode is picked by the texture string (Unity
      // ResolveLipStyleMode: matte_lip=0, gloss_lip=1, gradient_lip=3). The
      // AR-filter bridge encodes the combined 질감(finish)+형태(shape) decision
      // into control.finish: 'gradient' when 그라데이션 is chosen (inner-
      // concentrated base fill shaped by gradientAmount), else 'gloss' for the
      // 글로우 finish (matte-reference base + light-reactive highlight pass),
      // else matte. The gloss highlight pass fires for ANY lip mode when
      // glossBoost & specular are > 0, so 글로우 stays light-reactive on top of
      // whichever base fill the shape selected.
      if (control.finish === 'gradient' || control.finish === 'gradient-lip') {
        return 'gradient_lip';
      }
      if (control.finish === 'gloss' || control.finish === 'glow') {
        return 'gloss_lip';
      }
      return 'matte_lip';
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
