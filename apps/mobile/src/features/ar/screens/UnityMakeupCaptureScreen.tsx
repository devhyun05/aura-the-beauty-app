import React, {useEffect, useRef, useState} from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View as RNView,
} from 'react-native';
import {ChevronLeft, Sparkles} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {
  buildFullFaceCaptureBundleFromEvent,
  buildFullFaceMakeupSourceInput,
  buildUnitySynchronizedCaptureRequest,
  REGION_COLOR_OPTIONS,
  type FullFaceMakeupSourceInput,
  type UnitySynchronizedCaptureEvent,
  type UnitySynchronizedCaptureRequest,
} from '../../../shared/contracts/fullFaceMakeupRecipe';
import {
  UnityMakeupNativeView,
  useUnityMakeupNativeViewReady,
} from '../components/UnityMakeupNativeView';
import {
  addUnityMakeupEventListener,
  hideUnityMakeupView,
  isUnityMakeupReady,
  postUnityGeneratedBrowMaskPayload,
  postUnityGeneratedLipMaskPayload,
  postUnityMakeupRecipe,
  postUnityRegionOverlayVisibility,
  postUnitySynchronizedCaptureRequest,
  prepareUnityMakeupRuntime,
} from '../services/unityMakeupBridge';
import {
  buildGeneratedMaskUnityPayload,
  buildGeneratedBrowMaskUnityPayload,
  buildGeneratedBrowPackage,
  buildCheekBrowRecipeAfterGeneratedLip,
  DEFAULT_GENERATED_BROW_CONTROLS,
  DEFAULT_GENERATED_MASK_CONTROLS,
  DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
  generatePersonalizedLipMakeup,
  type GeneratedBrowControls,
  type GeneratedBrowPackage,
  type GeneratedMaskControls,
  type PersonalizedCompanionMakeupControls,
  type PersonalizedMakeupGenerateResult,
  isPersonalizedMakeupGenerateAvailable,
} from '../services/personalizedMakeupGenerateService';

type UnityMakeupCaptureScreenProps = {
  onBack?: () => void;
  onComplete?: (sourceFrameMetadata: FullFaceMakeupSourceInput) => void;
};

type CapturePhase =
  | 'ready'
  | 'capturing'
  | 'generating'
  | 'applying'
  | 'applied'
  | 'error';

const MASK_FLOW_STEPS = [
  {id: 'start', label: '시작'},
  {id: 'capture', label: '스캔'},
  {id: 'extract', label: '마스크'},
  {id: 'apply', label: '적용'},
] as const;
const PERSONAL_MASK_REGIONS = [
  {id: 'lip', label: '입술', guidance: '경계 추출'},
  {id: 'blush', label: '볼', guidance: '위치 기준'},
  {id: 'brow', label: '눈썹', guidance: '브로우 기준'},
] as const;
const AR_BLUSH_HUD_REGIONS = [
  {id: 'foundation', label: '베이스'},
  {id: 'lip', label: '립'},
  {id: 'cheek', label: '치크'},
  {id: 'eyebrow', label: '눈썹'},
  {id: 'eyeliner', label: '아이라이너'},
] as const;
const GENERATED_MASK_VALIDATION_COLORS = [
  {name: '로즈', color: '#D94B74', secondaryColor: '#F29BAA'},
  {name: '코랄', color: '#E67B5F', secondaryColor: '#F5A18C'},
  {name: '누드', color: '#C08A72', secondaryColor: '#E0B39E'},
  {name: '베리', color: '#A83567', secondaryColor: '#D66A91'},
  {name: '레드', color: '#CF1838', secondaryColor: '#F05C70'},
  {name: '연핑크', color: '#F1CBD5', secondaryColor: '#F8DEE5'},
] as const;
const FOUNDATION_VALIDATION_COLORS = [
  ...REGION_COLOR_OPTIONS.foundation.map(option => ({
    name: option.label,
    color: option.hex,
  })),
];
const INITIAL_INVISIBLE_GENERATED_MASK_CONTROLS: GeneratedMaskControls = {
  ...DEFAULT_GENERATED_MASK_CONTROLS,
  intensity: 0,
  maskVisible: true,
  opacity: 0,
};
const GENERATED_MASK_FINISH_OPTIONS = [
  {
    finish: 'matte',
    gradientAmount: 0.08,
    glossBoost: 0,
    label: '매트',
    roughness: 0.28,
    specular: 0.08,
    specularPower: 18,
    texture: 'matte_lip',
    textureAmount: 0.16,
  },
  {
    finish: 'gloss',
    gradientAmount: 0.04,
    glossBoost: 0.34,
    label: '글로우',
    roughness: 0.08,
    specular: 0.34,
    specularPower: 48,
    texture: 'gloss_lip',
    textureAmount: 0.26,
  },
  {
    finish: 'gradient',
    gradientAmount: 0.82,
    glossBoost: 0.04,
    label: '그라데이션',
    roughness: 0.22,
    specular: 0.1,
    specularPower: 20,
    texture: 'gradient_lip',
    textureAmount: 0.22,
  },
] as const satisfies ReadonlyArray<
  Pick<
    GeneratedMaskControls,
    | 'finish'
    | 'glossBoost'
    | 'gradientAmount'
    | 'roughness'
    | 'specular'
    | 'specularPower'
    | 'texture'
    | 'textureAmount'
  > & {label: string}
>;
const AR_BLUSH_CHEEK_REGION_OPTIONS = [
  {label: '데일리', candidateId: 'blush-session-1-v1', maskTextureId: 'cheek-session-mask-1-v1'},
  {label: '러블리', candidateId: 'blush-session-2-v1', maskTextureId: 'cheek-session-mask-2-v1'},
  {label: '언더', candidateId: 'blush-session-3-v1', maskTextureId: 'cheek-session-mask-3-v1'},
  {label: '선키스 1', candidateId: 'blush-session-4-v1', maskTextureId: 'cheek-session-mask-4-v1'},
  {label: '선키스 2', candidateId: 'blush-session-5-v1', maskTextureId: 'cheek-session-mask-5-v1'},
] as const;
const AR_BLUSH_EYEBROW_REGION_OPTIONS = [
  {label: '데일리', candidateId: 'brow-soft-arch-fine-hair-v1', maskTextureId: 'brow-soft-arch-fine-hair-v1'},
  {label: '내추럴', candidateId: 'brow-png-natural-hair-v1', maskTextureId: 'brow-png-natural-hair-v1'},
  {label: '슬림', candidateId: 'brow-slim-tail-fine-hair-v1', maskTextureId: 'brow-slim-tail-fine-hair-v1'},
] as const;
// 결(strand hair texture)은 슬라이더 없이 항상 이 값으로 고정 유지한다.
const BROW_STRAND_TEXTURE_AMOUNT = 0.9;
const GENERATED_BROW_SHAPE_OPTIONS = [
  {label: '일자', shapeId: 'straight'},
  {label: '세미아치', shapeId: 'soft-arch'},
  {label: '아치', shapeId: 'slim-tail'},
] as const satisfies ReadonlyArray<{
  label: string;
  shapeId: GeneratedBrowControls['shapeId'];
}>;
const GENERATED_BROW_DEBUG_OPTIONS = [
  {debugExaggerate: false, debugMode: 0, debugShowLeftRight: false, label: '일반'},
  {debugExaggerate: true, debugMode: 5, debugShowLeftRight: false, label: '마스크 확인'},
  {debugExaggerate: false, debugMode: 6, debugShowLeftRight: true, label: '좌우 확인'},
] as const satisfies ReadonlyArray<{
  debugExaggerate: boolean;
  debugMode: GeneratedBrowControls['debugMode'];
  debugShowLeftRight: boolean;
  label: string;
}>;
const GENERATED_BROW_VALIDATION_COLORS = [
  {name: '블랙', color: '#17120F', secondaryColor: '#302721'},
  {name: '브라운', color: '#4A342B', secondaryColor: '#6A4A3B'},
  {name: '라이트브라운', color: '#8A5A3D', secondaryColor: '#B07A52'},
  {name: '와인', color: '#5A2432', secondaryColor: '#7F3448'},
] as const;
const INITIAL_INVISIBLE_GENERATED_BROW_CONTROLS: GeneratedBrowControls = {
  ...DEFAULT_GENERATED_BROW_CONTROLS,
  enabled: false,
  intensity: 0,
  opacity: 0,
};
// 사람별 실측 눈 존에서 Unity가 런타임 생성하는 절차적 아이라이너 모양들.
// 참고 차트(v2) 6종. 컬러드는 핏보다 색이 정체성이라 선택 시 버건디를
// 기본 적용한다 (colorHex — 이후 색상 변경 가능).
const AR_BLUSH_EYELINER_REGION_OPTIONS = [
  {label: '캣', candidateId: 'eyeliner-gen-cat-v2', maskTextureId: 'e7-eyeliner-gen-cat-v2'},
  {label: '퍼피', candidateId: 'eyeliner-gen-puppy-v2', maskTextureId: 'e7-eyeliner-gen-puppy-v2'},
  {label: '섹시', candidateId: 'eyeliner-gen-sexy-v2', maskTextureId: 'e7-eyeliner-gen-sexy-v2'},
  {label: '윙드', candidateId: 'eyeliner-gen-winged-v2', maskTextureId: 'e7-eyeliner-gen-winged-v2'},
  {label: '컬러드', candidateId: 'eyeliner-gen-colored-v2', maskTextureId: 'e7-eyeliner-gen-colored-v2', colorHex: '#5A2A33'},
  {label: '돌', candidateId: 'eyeliner-gen-doll-v2', maskTextureId: 'e7-eyeliner-gen-doll-v2'},
] as const;
const EYELINER_VALIDATION_COLORS = [
  {name: '블랙', color: '#2F2730'},
  {name: '브라운', color: '#4A332D'},
  {name: '플럼', color: '#40303F'},
  {name: '토프', color: '#5E514E'},
  {name: '버건디', color: '#5A2A33'},
  {name: '그레이', color: '#3E3E46'},
] as const;
const FOUNDATION_FINISH_OPTIONS = [
  {label: '내추럴', finish: 'natural', luminanceInfluence: 0.35, evenness: 0.3},
  {label: '세미매트', finish: 'matte', luminanceInfluence: 0.28, evenness: 0.38},
  {label: '윤광', finish: 'glow', luminanceInfluence: 0.4, evenness: 0.24},
] as const;
const FOUNDATION_DEBUG_MODE_OPTIONS = [
  {label: '끄기', mode: 0},
  {label: '경로확인', mode: 23},
  // 마스크 흔들림 라이브 튜닝: 마스크가 얼굴보다 앞서가면 지연55/지연90,
  // 뒤따라오면 예측35. 화면은 정상 파운데이션으로 보이고 투영 타이밍만 바뀜.
  {label: '지연55', mode: 40},
  {label: '예측35', mode: 41},
  {label: '지연90', mode: 42},
  {label: '표면(CB)', mode: 1},
  {label: '최종(CB)', mode: 3},
  {label: '강제색(CB)', mode: 5},
  {label: '앵커', mode: 6},
  {label: '추적', mode: 7},
  {label: 'CB noRT', mode: 25},
  {label: 'CB X', mode: 26},
  {label: 'CB Y', mode: 27},
  {label: 'CB 180', mode: 28},
  {label: 'CB 90시계', mode: 29},
  {label: 'CB 90반시계', mode: 30},
  {label: '구RT 원본', mode: 8},
  {label: '구RT X', mode: 9},
  {label: '구RT Y', mode: 10},
  {label: '구RT 180', mode: 11},
  {label: '기본 마스크', mode: 12},
  {label: '기본 90시계', mode: 13},
  {label: '기본 90반시계', mode: 14},
  {label: '구RT 90시계', mode: 15},
  {label: '구RT 90반시계', mode: 16},
  {label: '소스 90시계', mode: 17},
  {label: '소스 90반시계', mode: 18},
  {label: '정밀A', mode: 19},
  {label: '정밀B', mode: 20},
  {label: '정밀C', mode: 21},
  {label: '정밀D', mode: 22},
  {label: 'CB합성', mode: 24},
] as const;

type ArBlushHudRegion = (typeof AR_BLUSH_HUD_REGIONS)[number]['id'];
type CompanionHudRegion = Exclude<ArBlushHudRegion, 'lip'>;
type CompanionRegionKey = keyof PersonalizedCompanionMakeupControls;
type EnabledHudRegions = Record<ArBlushHudRegion, boolean>;
type UnityGeneratedBrowAppliedEvent = {
  anchorStabilizationMode?: string;
  applied?: boolean;
  applyTrigger?: string;
  attemptCount?: number;
  blockedReason?: string;
  browAnchorPointCount?: number;
  browCorePointCount?: number;
  browShapeBasePointCount?: number;
  color?: string;
  debugExaggerate?: boolean;
  debugMode?: number;
  debugShowLeftRight?: boolean;
  eyeAnchorPointCount?: number;
  eyeExclusionMode?: string;
  expectedMaskUvMaxX?: number;
  expectedMaskUvMaxY?: number;
  expectedMaskUvMinX?: number;
  expectedMaskUvMinY?: number;
  faceOvalPointCount?: number;
  faceCount?: number;
  generatedMaskId?: string;
  meshIndexCount?: number;
  meshUvCount?: number;
  meshVertexCount?: number;
  maskTextureId?: string;
  maskTextureSampleChannel?: string;
  maskTriangles?: number;
  maskNegativeXTriangleCount?: number;
  maskNegativeXUvBoundsAvailable?: boolean;
  maskNegativeXUvMaxX?: number;
  maskNegativeXUvMaxY?: number;
  maskNegativeXUvMinX?: number;
  maskNegativeXUvMinY?: number;
  maskPositiveXTriangleCount?: number;
  maskPositiveXUvBoundsAvailable?: boolean;
  maskPositiveXUvMaxX?: number;
  maskPositiveXUvMaxY?: number;
  maskPositiveXUvMinX?: number;
  maskPositiveXUvMinY?: number;
  maskUvBoundsAvailable?: boolean;
  maskUvMaxX?: number;
  maskUvMaxY?: number;
  maskUvMinX?: number;
  maskUvMinY?: number;
  maskUvSplitMode?: string;
  noseBridgeAnchorPointCount?: number;
  opacity?: number;
  runtimeReady?: boolean;
  stateAction?: string;
  stabilityMode?: string;
  stabilizationDeadZoneMeters?: number;
  stabilizationSnapDistanceMeters?: number;
  status?: string;
  softEdgeTexels?: number;
  surroundAnchorPointCount?: number;
  templeAnchorPointCount?: number;
  trackingState?: string;
  upperEyelidAnchorPointCount?: number;
  uvAvailable?: boolean;
};

const INITIAL_ENABLED_HUD_REGIONS: EnabledHudRegions = {
  cheek: false,
  foundation: true,
  eyebrow: false,
  eyeliner: false,
  lip: false,
};

export function UnityMakeupCaptureScreen({
  onBack,
}: UnityMakeupCaptureScreenProps) {
  const insets = useSafeAreaInsets();
  const shouldUseUnityPreview = useUnityMakeupNativeViewReady();
  const [hasStartedMaskFlow, setHasStartedMaskFlow] = useState(false);
  const [isPreparingUnity, setIsPreparingUnity] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>('ready');
  const [notice, setNotice] = useState('실시간 맞춤 메이크업을 준비하는 중입니다');
  const [sourceFrameMetadata, setSourceFrameMetadata] =
    useState<FullFaceMakeupSourceInput | null>(null);
  const [generatedPackage, setGeneratedPackage] =
    useState<PersonalizedMakeupGenerateResult['generatedPackage'] | null>(null);
  const [generatedBrowPackage, setGeneratedBrowPackage] =
    useState<GeneratedBrowPackage | null>(null);
  const [generatedMaskControls, setGeneratedMaskControls] =
    useState<GeneratedMaskControls>(DEFAULT_GENERATED_MASK_CONTROLS);
  const [generatedBrowControls, setGeneratedBrowControls] =
    useState<GeneratedBrowControls>(DEFAULT_GENERATED_BROW_CONTROLS);
  const [companionMakeupControls, setCompanionMakeupControls] =
    useState<PersonalizedCompanionMakeupControls>(
      DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
    );
  const [activeHudRegion, setActiveHudRegion] = useState<ArBlushHudRegion>('foundation');
  const [enabledHudRegions, setEnabledHudRegions] =
    useState<EnabledHudRegions>(INITIAL_ENABLED_HUD_REGIONS);
  const pendingCaptureRequestRef = useRef<UnitySynchronizedCaptureRequest | null>(null);
  const pendingGeneratedMaskIdRef = useRef<string | null>(null);
  const pendingGeneratedBrowMaskIdRef = useRef<string | null>(null);
  const latestGeneratedApplyPayloadRef = useRef<string | null>(null);
  const latestGeneratedBrowApplyPayloadRef = useRef<string | null>(null);
  // Source landmarks kept so the brow mask can be re-rasterized when the user
  // switches brow shape (일자/세미아치/아치). Without this the mask texture is
  // frozen at capture time and shape buttons only relabel the payload.
  const nativeBrowSourceRef =
    useRef<PersonalizedMakeupGenerateResult['nativeResult'] | null>(null);
  // Per-shape package cache: rasterizing 512x512 + base64 in JS takes long
  // enough to feel laggy, so each shape is built once (pre-warmed right after
  // capture) and shape taps reuse the cached package instantly.
  const browPackageCacheRef = useRef<
    Partial<Record<GeneratedBrowControls['shapeId'], GeneratedBrowPackage>>
  >({});
  const generatedMaskControlRevisionRef = useRef(0);
  const generatedBrowControlRevisionRef = useRef(0);
  const preparePollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (preparePollTimerRef.current) {
        clearInterval(preparePollTimerRef.current);
      }
      hideUnityMakeupView();
    };
  }, []);

  useEffect(() => {
    const subscription = addUnityMakeupEventListener(event => {
      if (!event.message) {
        return;
      }

      try {
        const payload = JSON.parse(event.message) as UnitySynchronizedCaptureEvent & {
          applied?: boolean;
          generatedMaskId?: string;
          maskTriangles?: number;
          status?: string;
          type?: string;
          uvAvailable?: boolean;
        };

        if (payload.type === 'e7_reference_capture') {
          handleReferenceCaptureEvent(payload);
          return;
        }

        if (payload.type === 'generated_lip_mask_applied') {
          handleGeneratedLipAppliedEvent(payload);
          return;
        }

        if (payload.type === 'generated_brow_mask_applied') {
          handleGeneratedBrowAppliedEvent(payload as UnityGeneratedBrowAppliedEvent);
        }
      } catch {
        // Unity can emit non-JSON diagnostic logs through the same bridge.
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleBack = () => {
    if (preparePollTimerRef.current) {
      clearInterval(preparePollTimerRef.current);
      preparePollTimerRef.current = null;
    }
    hideUnityMakeupView();
    onBack?.();
  };

  const finishUnityPreparation = () => {
    if (preparePollTimerRef.current) {
      clearInterval(preparePollTimerRef.current);
      preparePollTimerRef.current = null;
    }

    setIsPreparingUnity(false);
    setHasStartedMaskFlow(true);
    // 'applied' immediately: live personalization is active from the first
    // frame, so the HUD shows right away and no scan/prepare UI is needed.
    setPhase('applied');
    setNotice('실시간 맞춤 메이크업이 적용 중입니다');
    postUnityMakeupRecipe(
      buildCheekBrowRecipeAfterGeneratedLip(Date.now(), DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS, {
        activeRegions: getEnabledCompanionRegions(INITIAL_ENABLED_HUD_REGIONS),
      }),
    );
    postUnityRegionOverlayVisibility({
      guideOverlayVisible: false,
      maskOverlayVisible: true,
      reason: 'personalized_live_makeup_entry',
      visible: true,
    });
  };

  const handleStartMaskFlow = () => {
    if (isPreparingUnity || hasStartedMaskFlow) {
      return;
    }

    setIsPreparingUnity(true);
    setNotice('카메라를 준비하는 중입니다');
    prepareUnityMakeupRuntime();

    if (isUnityMakeupReady()) {
      finishUnityPreparation();
      return;
    }

    const startedAt = Date.now();
    preparePollTimerRef.current = setInterval(() => {
      if (isUnityMakeupReady() || Date.now() - startedAt > 4200) {
        finishUnityPreparation();
      }
    }, 160);
  };

  useEffect(() => {
    // Auto-start: masks personalize live at runtime, so there is nothing to
    // wait for — skip the intro gate and show makeup immediately on entry.
    handleStartMaskFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReferenceCaptureEvent = async (event: UnitySynchronizedCaptureEvent) => {
    const pendingRequest = pendingCaptureRequestRef.current;

    if (!pendingRequest || event.capturePairId !== pendingRequest.capturePairId) {
      return;
    }

    const captureBundle = buildFullFaceCaptureBundleFromEvent(event);
    if (!captureBundle) {
      if (event.status === 'failed') {
        setPhase('error');
        setNotice(event.detail ?? '프레임 저장에 실패했습니다');
      }
      return;
    }

    const nextSourceFrameMetadata = buildFullFaceMakeupSourceInput(captureBundle);
    setSourceFrameMetadata(nextSourceFrameMetadata);
    setPhase('generating');
    setNotice('개인 마스크를 생성하는 중입니다');

    try {
      const result = await generatePersonalizedLipMakeup({
        sourceFrameMetadata: nextSourceFrameMetadata,
      });

      pendingGeneratedMaskIdRef.current = result.generatedPackage.generatedMaskId;
      pendingGeneratedBrowMaskIdRef.current = null;
      const unityApplyPayload = JSON.stringify(
        buildGeneratedMaskUnityPayload(
          result.generatedPackage,
          INITIAL_INVISIBLE_GENERATED_MASK_CONTROLS,
          {
            includeTexture: true,
          },
        ),
      );
      const browUnityApplyPayload = JSON.stringify(
        buildGeneratedBrowMaskUnityPayload(
          result.generatedBrowPackage,
          INITIAL_INVISIBLE_GENERATED_BROW_CONTROLS,
          {
            includeTexture: true,
          },
        ),
      );
      latestGeneratedApplyPayloadRef.current = unityApplyPayload;
      latestGeneratedBrowApplyPayloadRef.current = browUnityApplyPayload;
      nativeBrowSourceRef.current = result.nativeResult;
      browPackageCacheRef.current = {
        [result.generatedBrowPackage.shapeId]: result.generatedBrowPackage,
      };
      // Pre-warm the remaining shape packages off the critical path so the
      // first tap on each shape button applies instantly.
      setTimeout(() => {
        const nativeSource = nativeBrowSourceRef.current;
        if (!nativeSource) {
          return;
        }
        for (const option of GENERATED_BROW_SHAPE_OPTIONS) {
          if (browPackageCacheRef.current[option.shapeId]) {
            continue;
          }
          try {
            browPackageCacheRef.current[option.shapeId] = buildGeneratedBrowPackage({
              controls: {
                ...DEFAULT_GENERATED_BROW_CONTROLS,
                enabled: true,
                shapeId: option.shapeId,
              },
              nativeResult: nativeSource,
            });
          } catch {
            // Pre-warm is best-effort; the tap handler rebuilds on demand.
          }
        }
      }, 900);
      setGeneratedPackage(result.generatedPackage);
      setGeneratedBrowPackage(result.generatedBrowPackage);
      setGeneratedMaskControls(DEFAULT_GENERATED_MASK_CONTROLS);
      setGeneratedBrowControls(DEFAULT_GENERATED_BROW_CONTROLS);
      setCompanionMakeupControls(DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS);
      setActiveHudRegion('lip');
      setEnabledHudRegions(INITIAL_ENABLED_HUD_REGIONS);
      setPhase('applying');
      setNotice('개인 마스크를 화면에 등록하는 중입니다');

      postUnityRegionOverlayVisibility({
        guideOverlayVisible: false,
        maskOverlayVisible: true,
        reason: 'personalized_generated_lip_apply',
        visible: true,
      });
      postUnityGeneratedLipMaskPayload(unityApplyPayload);
      postUnityGeneratedBrowMaskPayload(browUnityApplyPayload);
      postUnityMakeupRecipe(
        buildCheekBrowRecipeAfterGeneratedLip(
          Date.now(),
          DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
          {
            // The generated brow replaces the companion brow layer, so the
            // recipe must exclude 'brow' (branch used includeBrowLayer: false).
            activeRegions: excludeCompanionBrowRegion(
              getEnabledCompanionRegions(INITIAL_ENABLED_HUD_REGIONS),
            ),
          },
        ),
      );
    } catch (error) {
      setPhase('error');
      setNotice(
        error instanceof Error
          ? `개인 마스크 생성 실패: ${error.message}`
          : '개인 마스크 생성에 실패했습니다',
      );
    }
  };

  // Payload-level failures that can never succeed on resend (size/byte/id
  // mismatch). Shared by the lip and brow applied-event handlers.
  const TERMINAL_GENERATED_MASK_BLOCKED_REASONS = [
    'generated_lip_mask_texture_registration_failed',
    'generated_brow_mask_texture_registration_failed',
    'mask_texture_dimensions_invalid',
    'raw_rgba_byte_count_mismatch',
  ];

  const handleGeneratedLipAppliedEvent = (event: {
    applied?: boolean;
    blockedReason?: string;
    generatedMaskId?: string;
    maskTriangles?: number;
    status?: string;
    uvAvailable?: boolean;
  }) => {
    const pendingGeneratedMaskId = pendingGeneratedMaskIdRef.current;

    if (
      pendingGeneratedMaskId &&
      event.generatedMaskId &&
      event.generatedMaskId !== pendingGeneratedMaskId
    ) {
      return;
    }

    // Terminal failures: the payload itself is malformed (size/byte mismatch),
    // so resending the exact same payload can never succeed. Runs AFTER the
    // mask-id correlation check so a stale event from a previous request
    // cannot clear the current payload refs.
    if (event.blockedReason && TERMINAL_GENERATED_MASK_BLOCKED_REASONS.includes(event.blockedReason)) {
      pendingGeneratedMaskIdRef.current = null;
      latestGeneratedApplyPayloadRef.current = null;
      setPhase('error');
      setNotice(`개인 마스크 적용이 거부되었습니다 (${event.blockedReason}). 아래 버튼으로 다시 생성해 주세요.`);
      return;
    }

    const isApplied =
      (event.status === 'partial' || event.status === 'ready') &&
      event.applied === true &&
      event.uvAvailable === true &&
      (event.maskTriangles ?? 0) > 0;

    if (isApplied) {
      setPhase('applied');
      setNotice('개인 마스크 준비가 완료됐습니다');
      pendingGeneratedMaskIdRef.current = null;
      return;
    }

    if (latestGeneratedApplyPayloadRef.current) {
      setPhase('applying');
      setNotice('얼굴을 찾는 중입니다. 화면 중앙을 바라봐 주세요');
      setTimeout(() => {
        if (!pendingGeneratedMaskIdRef.current || !latestGeneratedApplyPayloadRef.current) {
          return;
        }
        postUnityGeneratedLipMaskPayload(latestGeneratedApplyPayloadRef.current);
        if (latestGeneratedBrowApplyPayloadRef.current) {
          postUnityGeneratedBrowMaskPayload(latestGeneratedBrowApplyPayloadRef.current);
        }
        postUnityMakeupRecipe(
          buildCheekBrowRecipeAfterGeneratedLip(Date.now(), companionMakeupControls, {
            activeRegions: latestGeneratedBrowApplyPayloadRef.current
              ? excludeCompanionBrowRegion(
                  getEnabledCompanionRegions(INITIAL_ENABLED_HUD_REGIONS),
                )
              : getEnabledCompanionRegions(INITIAL_ENABLED_HUD_REGIONS),
          }),
        );
      }, 800);
    }
  };

  const handleGeneratedBrowAppliedEvent = (event: UnityGeneratedBrowAppliedEvent) => {
    const pendingGeneratedBrowMaskId = pendingGeneratedBrowMaskIdRef.current;

    if (
      pendingGeneratedBrowMaskId &&
      event.generatedMaskId &&
      event.generatedMaskId !== pendingGeneratedBrowMaskId
    ) {
      return;
    }

    logGeneratedBrowAppliedEvent(event);

    // Terminal failures (see lip handler): clear the brow payload so neither
    // the brow retry nor the lip retry path (which re-posts the brow payload
    // alongside the lip one) keeps resending a payload that can never apply.
    if (event.blockedReason && TERMINAL_GENERATED_MASK_BLOCKED_REASONS.includes(event.blockedReason)) {
      pendingGeneratedBrowMaskIdRef.current = null;
      latestGeneratedBrowApplyPayloadRef.current = null;
      setPhase('error');
      setNotice(`눈썹 마스크 적용이 거부되었습니다 (${event.blockedReason}). 아래 버튼으로 다시 생성해 주세요.`);
      return;
    }

    const isApplied =
      (event.status === 'partial' || event.status === 'ready') &&
      event.applied === true &&
      event.uvAvailable === true &&
      (event.maskTriangles ?? 0) > 0;

    if (isApplied) {
      pendingGeneratedBrowMaskIdRef.current = null;
      return;
    }

    if (event.status === 'disabled') {
      pendingGeneratedBrowMaskIdRef.current = null;
      return;
    }

    if (event.status === 'blocked' && pendingGeneratedBrowMaskId) {
      setNotice(
        `눈썹 마스크 적용 대기: ${formatGeneratedBrowBlockedReason(
          event.blockedReason,
        )}`,
      );
    }
  };

  const handleCapturePress = () => {
    if (!hasStartedMaskFlow) {
      handleStartMaskFlow();
      return;
    }

    if (phase === 'capturing' || phase === 'generating' || phase === 'applying') {
      return;
    }

    if (!isPersonalizedMakeupGenerateAvailable()) {
      setPhase('error');
      setNotice('iOS 개인 마스크 생성 모듈을 찾을 수 없습니다');
      return;
    }

    const captureRequest = buildUnitySynchronizedCaptureRequest({
      requestedAtMs: Date.now(),
    });

    pendingCaptureRequestRef.current = captureRequest;
    pendingGeneratedMaskIdRef.current = null;
    pendingGeneratedBrowMaskIdRef.current = null;
    latestGeneratedApplyPayloadRef.current = null;
    latestGeneratedBrowApplyPayloadRef.current = null;
    nativeBrowSourceRef.current = null;
    browPackageCacheRef.current = {};
    setGeneratedPackage(null);
    setGeneratedBrowPackage(null);
    setGeneratedMaskControls(DEFAULT_GENERATED_MASK_CONTROLS);
    setGeneratedBrowControls(DEFAULT_GENERATED_BROW_CONTROLS);
    setCompanionMakeupControls(DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS);
    setActiveHudRegion('lip');
    setEnabledHudRegions(INITIAL_ENABLED_HUD_REGIONS);
    setPhase('capturing');
    setNotice('입술, 볼, 눈썹 기준이 될 현재 프레임을 스캔하는 중입니다');
    postUnityMakeupRecipe(
      buildCheekBrowRecipeAfterGeneratedLip(Date.now(), DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS, {
        activeRegions: [],
      }),
    );
    postUnityRegionOverlayVisibility({
      guideOverlayVisible: false,
      maskOverlayVisible: false,
      reason: 'personalized_capture_start',
      visible: false,
    });

    const didPostCaptureRequest = postUnitySynchronizedCaptureRequest(captureRequest);

    if (!didPostCaptureRequest) {
      setPhase('error');
      setNotice('캡처 요청을 보낼 수 없습니다');
    }
  };

  const handleGeneratedMaskControlChange = (patch: Partial<GeneratedMaskControls>) => {
    // Live personalization: the lip layer works without a generated package
    // (postRuntimeMakeup skips only the photo-refined texture payload).
    const nextControls = clampGeneratedMaskControls({
      ...generatedMaskControls,
      ...patch,
    });
    generatedMaskControlRevisionRef.current += 1;
    setGeneratedMaskControls(nextControls);
    const nextEnabledRegions = {
      ...enabledHudRegions,
      lip: true,
    };
    setEnabledHudRegions(nextEnabledRegions);
    postRuntimeMakeup(nextControls, companionMakeupControls, generatedBrowControls, nextEnabledRegions);
  };

  const handleGeneratedBrowControlChange = (patch: Partial<GeneratedBrowControls>) => {
    if (!generatedBrowPackage) {
      return;
    }

    const nextControls = clampGeneratedBrowControls({
      ...generatedBrowControls,
      ...patch,
      enabled: true,
    });
    generatedBrowControlRevisionRef.current += 1;
    setGeneratedBrowControls(nextControls);
    const nextEnabledRegions = {
      ...enabledHudRegions,
      eyebrow: true,
    };
    setEnabledHudRegions(nextEnabledRegions);

    // Shape changes the mask geometry, so the texture must be re-rasterized from
    // the source landmarks. Color/opacity/strand are applied downstream and do
    // not need a rebuild.
    let browPackageOverride: GeneratedBrowPackage | undefined;
    if (patch.shapeId !== undefined && nativeBrowSourceRef.current) {
      const rebuiltBrowPackage =
        browPackageCacheRef.current[nextControls.shapeId] ??
        buildGeneratedBrowPackage({
          controls: nextControls,
          nativeResult: nativeBrowSourceRef.current,
        });
      browPackageCacheRef.current[nextControls.shapeId] = rebuiltBrowPackage;
      browPackageOverride = rebuiltBrowPackage;
      setGeneratedBrowPackage(rebuiltBrowPackage);
    }

    postRuntimeMakeup(
      generatedMaskControls,
      companionMakeupControls,
      nextControls,
      nextEnabledRegions,
      {
        includeBrowTexture:
          !enabledHudRegions.eyebrow ||
          patch.colorHex !== undefined ||
          patch.shapeId !== undefined,
        browPackageOverride,
      },
    );
  };

  const handleCompanionMakeupControlChange = (
    region: CompanionRegionKey,
    patch: Partial<PersonalizedCompanionMakeupControls[CompanionRegionKey]>,
  ) => {
    const nextControls = clampCompanionMakeupControls({
      ...companionMakeupControls,
      [region]: {
        ...companionMakeupControls[region],
        ...patch,
      },
    });

    setCompanionMakeupControls(nextControls);
    const nextEnabledRegions = {
      ...enabledHudRegions,
      [getHudRegionFromCompanionRegionKey(region)]: true,
    };
    setEnabledHudRegions(nextEnabledRegions);
    postRuntimeMakeup(generatedMaskControls, nextControls, generatedBrowControls, nextEnabledRegions);
  };

  const handleChangeActiveHudRegion = (region: ArBlushHudRegion) => {
    setActiveHudRegion(region);

    if (region !== 'eyebrow' || !generatedBrowPackage) {
      return;
    }

    const wasEyebrowEnabled = enabledHudRegions.eyebrow;
    const nextGeneratedBrowControls = clampGeneratedBrowControls({
      ...generatedBrowControls,
      enabled: true,
    });
    const nextEnabledRegions = {
      ...enabledHudRegions,
      eyebrow: true,
    };

    if (!wasEyebrowEnabled || !generatedBrowControls.enabled) {
      generatedBrowControlRevisionRef.current += 1;
      setGeneratedBrowControls(nextGeneratedBrowControls);
      setEnabledHudRegions(nextEnabledRegions);
      postRuntimeMakeup(
        generatedMaskControls,
        companionMakeupControls,
        nextGeneratedBrowControls,
        nextEnabledRegions,
        {
          includeBrowTexture: true,
        },
      );
    }
  };

  const handleDisableHudRegion = (region: ArBlushHudRegion) => {
    const nextEnabledRegions = {
      ...enabledHudRegions,
      [region]: false,
    };
    const nextGeneratedBrowControls =
      region === 'eyebrow' && generatedBrowPackage
        ? clampGeneratedBrowControls({...generatedBrowControls, enabled: false})
        : generatedBrowControls;

    if (region === 'eyebrow' && generatedBrowPackage) {
      generatedBrowControlRevisionRef.current += 1;
      setGeneratedBrowControls(nextGeneratedBrowControls);
    }
    setEnabledHudRegions(nextEnabledRegions);
    postRuntimeMakeup(
      generatedMaskControls,
      companionMakeupControls,
      nextGeneratedBrowControls,
      nextEnabledRegions,
    );
  };

  const handleResetMakeupSelections = () => {
    const nextGeneratedControls = DEFAULT_GENERATED_MASK_CONTROLS;
    const nextGeneratedBrowControls = DEFAULT_GENERATED_BROW_CONTROLS;
    const nextCompanionControls = DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS;
    const nextEnabledRegions = INITIAL_ENABLED_HUD_REGIONS;

    setActiveHudRegion('lip');
    setGeneratedMaskControls(nextGeneratedControls);
    setGeneratedBrowControls(nextGeneratedBrowControls);
    setCompanionMakeupControls(nextCompanionControls);
    setEnabledHudRegions(nextEnabledRegions);
    generatedBrowControlRevisionRef.current += 1;
    postRuntimeMakeup(
      nextGeneratedControls,
      nextCompanionControls,
      nextGeneratedBrowControls,
      nextEnabledRegions,
    );
  };

  function postRuntimeMakeup(
    nextGeneratedControls: GeneratedMaskControls,
    nextCompanionControls: PersonalizedCompanionMakeupControls,
    nextGeneratedBrowControls: GeneratedBrowControls,
    nextEnabledRegions: EnabledHudRegions,
    options: {
      includeBrowTexture?: boolean;
      browPackageOverride?: GeneratedBrowPackage;
    } = {},
  ) {
    // Live personalization: the companion recipe (mesh-calibrated masks +
    // per-frame Vision lip boundary) works with NO reference capture, so a
    // missing generated package no longer blocks the HUD — it only skips
    // the photo-refined lip texture payload below.
    const lipControls = {
      ...nextGeneratedControls,
      maskVisible: nextEnabledRegions.lip,
    };
    const activeBrowPackage = options.browPackageOverride ?? generatedBrowPackage;
    // While a generated brow package is active it fully replaces the companion
    // brow layer, so the recipe must exclude 'brow' (branch: includeBrowLayer
    // false). Without a package the classic companion brow keeps working.
    const companionActiveRegions = activeBrowPackage
      ? excludeCompanionBrowRegion(getEnabledCompanionRegions(nextEnabledRegions))
      : getEnabledCompanionRegions(nextEnabledRegions);
    const companionRecipe = buildCheekBrowRecipeAfterGeneratedLip(
      Date.now(),
      nextCompanionControls,
      {
        activeRegions: companionActiveRegions,
      },
    );
    const foundationLayer = companionRecipe.layers.find(
      layer => layer.region === 'foundation',
    );

    console.info('[aura:foundation-ar] post-runtime-makeup', {
      activeRegions: companionActiveRegions,
      enabledHudRegions: nextEnabledRegions,
      foundationLayer: foundationLayer
        ? {
            blendMode: foundationLayer.blendMode,
            color: foundationLayer.color,
            coverage: foundationLayer.coverage,
            debugMaskMode: nextCompanionControls.foundation.debugMaskMode ?? 0,
            enabled: foundationLayer.enabled,
            finish: foundationLayer.finish,
            intensity: foundationLayer.intensity,
            maskTextureId: foundationLayer.maskTextureId,
            opacity: foundationLayer.opacity,
            roughness: foundationLayer.roughness,
            sample: foundationLayer.sample,
            secondaryColor: foundationLayer.secondaryColor,
            texture: foundationLayer.texture,
          }
        : null,
    });

    if (generatedPackage) {
      postUnityGeneratedLipMaskPayload(
        JSON.stringify(
          buildGeneratedMaskUnityPayload(generatedPackage, lipControls, {
            controlRevision: generatedMaskControlRevisionRef.current,
            includeTexture: false,
          }),
        ),
      );
    }

    if (activeBrowPackage) {
      const browControls = clampGeneratedBrowControls({
        ...nextGeneratedBrowControls,
        enabled: nextEnabledRegions.eyebrow,
      });
      const browPayload = JSON.stringify(
        buildGeneratedBrowMaskUnityPayload(activeBrowPackage, browControls, {
          controlRevision: generatedBrowControlRevisionRef.current,
          includeTexture: options.includeBrowTexture === true,
        }),
      );
      pendingGeneratedBrowMaskIdRef.current = browControls.enabled
        ? activeBrowPackage.generatedMaskId
        : null;
      latestGeneratedBrowApplyPayloadRef.current = browPayload;
      postUnityGeneratedBrowMaskPayload(browPayload);
    }

    postUnityMakeupRecipe(companionRecipe);
  };

  const isBusy = phase === 'capturing' || phase === 'generating' || phase === 'applying';
  const captureButtonLabel = phase === 'applied' ? '다시 만들기' : '개인 마스크 만들기';
  const activeMaskFlowStep = getActiveMaskFlowStep({
    hasStartedMaskFlow,
    phase,
    sourceFrameMetadata,
  });

  return (
    <YStack
      style={[
        styles.screen,
        {
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          paddingTop: Math.max(insets.top, spacing.lg),
        },
      ]}>
      <XStack style={styles.header}>
        <Pressable
          accessibilityLabel="홈으로 돌아가기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={handleBack}
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
          <ChevronLeft color={colors.white} size={iconSize.md} strokeWidth={2} />
        </Pressable>

        <YStack style={styles.headerTitleGroup}>
          <Text style={styles.headerEyebrow}>실시간 맞춤</Text>
          <Text style={styles.headerTitle}>메이크업 AR</Text>
        </YStack>

        <View style={styles.headerSpacer} />
      </XStack>

      <YStack style={styles.cameraStage}>
        {/* 스캔/인트로 단계 제거: 마스크가 런타임에서 실시간 개인화되므로
            진입 즉시 카메라(Unity 뷰)를 마운트한다. */}
        <View style={styles.unityMountPoint}>
          {shouldUseUnityPreview ? (
            <UnityMakeupNativeView />
          ) : (
            <View style={styles.faceGuide} />
          )}
        </View>

        {phase !== 'applied' ? (
          <XStack style={[styles.statusPill, phase === 'error' && styles.statusPillError]}>
            <Sparkles color={colors.white} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.statusText}>{notice}</Text>
          </XStack>
        ) : null}

        {phase === 'error' ? (
          <Pressable
            accessibilityRole="button"
            style={styles.statusPill}
            onPress={handleCapturePress}>
            <Text style={styles.statusText}>다시 생성</Text>
          </Pressable>
        ) : null}
      </YStack>

      {phase === 'applied' ? (
        <ArBlushRuntimeHud
          activeRegion={activeHudRegion}
          browControls={generatedBrowControls}
          companionControls={companionMakeupControls}
          controls={generatedMaskControls}
          enabledRegions={enabledHudRegions}
          hasGeneratedBrowPackage={Boolean(generatedBrowPackage)}
          onChangeActiveRegion={handleChangeActiveHudRegion}
          onChangeBrowControls={handleGeneratedBrowControlChange}
          onChangeCompanionControls={handleCompanionMakeupControlChange}
          onChangeControls={handleGeneratedMaskControlChange}
          onDisableActiveRegion={handleDisableHudRegion}
          onResetMakeup={handleResetMakeupSelections}
        />
      ) : null}

      {/* 스캔 단계 칩·스캔 상태 카드·시작 버튼 제거: 진입 즉시 라이브
          메이크업이 적용되므로 준비 UI가 필요 없다 (촬영 기반 정밀 보정
          플로우 코드는 유지 — 추후 옵션 기능으로 재노출 가능). */}
    </YStack>
  );
}

type MaskFlowStepId = (typeof MASK_FLOW_STEPS)[number]['id'];
type MaskFlowStepState = 'pending' | 'active' | 'done';

function getActiveMaskFlowStep({
  hasStartedMaskFlow,
  phase,
  sourceFrameMetadata,
}: {
  hasStartedMaskFlow: boolean;
  phase: CapturePhase;
  sourceFrameMetadata: FullFaceMakeupSourceInput | null;
}): MaskFlowStepId {
  if (!hasStartedMaskFlow) {
    return 'start';
  }

  if (phase === 'capturing' || (!sourceFrameMetadata && phase === 'ready')) {
    return 'capture';
  }

  if (phase === 'generating' || phase === 'error') {
    return 'extract';
  }

  if (phase === 'applying' || phase === 'applied') {
    return 'apply';
  }

  return sourceFrameMetadata ? 'extract' : 'capture';
}

function getMaskFlowStepState(
  step: MaskFlowStepId,
  activeStep: MaskFlowStepId,
): MaskFlowStepState {
  const stepIndex = MASK_FLOW_STEPS.findIndex(candidate => candidate.id === step);
  const activeIndex = MASK_FLOW_STEPS.findIndex(candidate => candidate.id === activeStep);

  if (stepIndex < activeIndex) {
    return 'done';
  }

  if (stepIndex === activeIndex) {
    return 'active';
  }

  return 'pending';
}

function ArBlushRuntimeHud({
  activeRegion,
  browControls,
  companionControls,
  controls,
  enabledRegions,
  hasGeneratedBrowPackage,
  onChangeActiveRegion,
  onChangeBrowControls,
  onChangeCompanionControls,
  onChangeControls,
  onDisableActiveRegion,
  onResetMakeup,
}: {
  activeRegion: ArBlushHudRegion;
  browControls: GeneratedBrowControls;
  companionControls: PersonalizedCompanionMakeupControls;
  controls: GeneratedMaskControls;
  enabledRegions: EnabledHudRegions;
  hasGeneratedBrowPackage: boolean;
  onChangeActiveRegion: (region: ArBlushHudRegion) => void;
  onChangeBrowControls: (patch: Partial<GeneratedBrowControls>) => void;
  onChangeCompanionControls: (
    region: CompanionRegionKey,
    patch: Partial<PersonalizedCompanionMakeupControls[CompanionRegionKey]>,
  ) => void;
  onChangeControls: (patch: Partial<GeneratedMaskControls>) => void;
  onDisableActiveRegion: (region: ArBlushHudRegion) => void;
  onResetMakeup: () => void;
}) {
  const [isHudHidden, setIsHudHidden] = useState(false);
  const isGeneratedBrowRegion = activeRegion === 'eyebrow' && hasGeneratedBrowPackage;
  const activeValues = isGeneratedBrowRegion
    ? {
        colorHex: browControls.colorHex,
        colorName: getColorName(browControls.colorHex),
        intensity: browControls.intensity,
        opacity: browControls.opacity,
        styleLabel:
          GENERATED_BROW_SHAPE_OPTIONS.find(
            option => option.shapeId === browControls.shapeId,
          )?.label ?? '소프트 아치',
        textureLabel: 'natural_brow',
      }
    : getHudRegionValues(activeRegion, controls, companionControls);
  const isActiveRegionEnabled = enabledRegions[activeRegion];
  const isFoundationPalette = activeRegion === 'foundation';
  const colorOptions =
    isFoundationPalette
      ? FOUNDATION_VALIDATION_COLORS
      : activeRegion === 'eyeliner'
      ? EYELINER_VALIDATION_COLORS
      : isGeneratedBrowRegion
      ? GENERATED_BROW_VALIDATION_COLORS
      : GENERATED_MASK_VALIDATION_COLORS;

  const handleColorPress = (color: {
    color: string;
    name: string;
    secondaryColor?: string;
  }) => {
    if (activeRegion === 'lip') {
      // Keep the optional photo-refined lip payload in sync when it exists,
      // but the live vision-boundary lip layer is driven by companion controls.
      onChangeControls({
        colorHex: color.color,
        secondaryColorHex: color.secondaryColor ?? color.color,
      });
    }

    if (isGeneratedBrowRegion) {
      onChangeBrowControls({
        colorHex: color.color,
      });
      return;
    }

    onChangeCompanionControls(getCompanionRegionKey(activeRegion), {
      colorHex: color.color,
    });
  };

  const handleIntensityChange = (value: number) => {
    if (activeRegion === 'lip') {
      onChangeControls({intensity: value});
    }

    if (isGeneratedBrowRegion) {
      onChangeBrowControls({intensity: value});
      return;
    }

    const regionKey = getCompanionRegionKey(activeRegion);
    onChangeCompanionControls(regionKey, {
      intensity: value,
    });
  };

  const handleOpacityChange = (value: number) => {
    if (activeRegion === 'lip') {
      onChangeControls({opacity: value});
    }

    if (isGeneratedBrowRegion) {
      onChangeBrowControls({opacity: value});
      return;
    }

    const regionKey = getCompanionRegionKey(activeRegion);
    onChangeCompanionControls(regionKey, {
      opacity: value,
    });
  };

  const handleFoundationCoverageChange = (value: number) => {
    onChangeCompanionControls('foundation', {
      coverage: value,
    });
  };

  const handleFoundationEvennessChange = (value: number) => {
    onChangeCompanionControls('foundation', {
      evenness: value,
    });
  };

  const handleFoundationBlemishChange = (value: number) => {
    onChangeCompanionControls('foundation', {
      blemish: value,
    });
  };

  const handleFoundationDebugModeChange = (debugMaskMode: number) => {
    console.info('[aura:unity-makeup] foundation-debug-mode-change', {
      debugMaskMode,
    });
    onChangeCompanionControls('foundation', {
      debugMaskMode,
    });
  };

  if (isHudHidden) {
    return (
      <XStack style={styles.arBlushCollapsedRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsHudHidden(false)}
          style={({pressed}) => [styles.arBlushShowButton, pressed && styles.pressed]}>
          <Text style={styles.arBlushShowText}>컨트롤 열기</Text>
        </Pressable>
      </XStack>
    );
  }

  return (
    <YStack style={styles.arBlushHudShell}>
      <XStack style={styles.arBlushModeRow}>
        {[
          {id: 'clean', label: '초기화'},
          {id: 'hud', label: '컨트롤'},
        ].map(mode => (
          <Pressable
            accessibilityRole="button"
            key={mode.id}
            onPress={mode.id === 'clean' ? onResetMakeup : undefined}
            style={[
              styles.arBlushModeButton,
              mode.id === 'hud' && styles.arBlushModeButtonActive,
            ]}>
            <Text
              style={[
                styles.arBlushModeText,
                mode.id === 'hud' && styles.arBlushModeTextActive,
              ]}>
              {mode.label}
            </Text>
          </Pressable>
        ))}
      </XStack>

      <YStack style={styles.arBlushControlsPanel}>
        <XStack style={styles.arBlushPanelHeader}>
          <Text style={styles.arBlushPanelTitle}>컨트롤</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsHudHidden(true)}
            style={styles.arBlushHideButton}>
            <Text style={styles.arBlushHideText}>숨기기</Text>
          </Pressable>
        </XStack>

        <XStack style={styles.arBlushRegionTabs}>
          {AR_BLUSH_HUD_REGIONS.map(region => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: activeRegion === region.id}}
              key={region.id}
              onPress={() => onChangeActiveRegion(region.id)}
              style={[
                styles.arBlushRegionButton,
                activeRegion === region.id && styles.arBlushRegionButtonActive,
              ]}>
              <Text
                style={[
                  styles.arBlushRegionText,
                  activeRegion === region.id && styles.arBlushRegionTextActive,
                ]}>
                {region.label}
              </Text>
            </Pressable>
          ))}
        </XStack>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.arBlushColorRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{selected: !isActiveRegionEnabled}}
            onPress={() => onDisableActiveRegion(activeRegion)}
            style={[
              styles.arBlushColorButton,
              styles.arBlushNoneButton,
              !isActiveRegionEnabled && styles.arBlushNoneButtonActive,
            ]}>
            <Text
              numberOfLines={1}
              style={styles.arBlushNoneButtonText}>
              선택 안함
            </Text>
          </Pressable>
          {colorOptions.map(color => {
            const isSelected = isActiveRegionEnabled && activeValues.colorHex === color.color;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{selected: isSelected}}
                key={color.name}
                onPress={() => handleColorPress(color)}
                style={[
                  styles.arBlushColorButton,
                  isFoundationPalette
                    ? styles.foundationShadeButton
                    : {backgroundColor: color.color},
                  isSelected &&
                    (isFoundationPalette
                      ? styles.foundationShadeButtonActive
                      : styles.arBlushColorButtonActive),
                ]}>
                {isFoundationPalette ? (
                  <>
                    <RNView
                      pointerEvents="none"
                      style={[
                        styles.foundationShadeSwatch,
                        {backgroundColor: color.color},
                      ]}
                    />
                    <Text
                      numberOfLines={1}
                      style={styles.foundationShadeText}>
                      {color.name}
                    </Text>
                  </>
                ) : (
                  <Text numberOfLines={1} style={styles.arBlushColorText}>
                    {color.name}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.arBlushSectionLabel}>{getHudOptionSectionLabel(activeRegion)}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.arBlushOptionGrid}>
          <HudRegionOptions
            activeRegion={activeRegion}
            activeRegionEnabled={isActiveRegionEnabled}
            browControls={browControls}
            companionControls={companionControls}
            controls={controls}
            hasGeneratedBrowPackage={hasGeneratedBrowPackage}
            onChangeBrowControls={onChangeBrowControls}
            onChangeCompanionControls={onChangeCompanionControls}
            onChangeControls={onChangeControls}
            onDisableActiveRegion={() => onDisableActiveRegion(activeRegion)}
          />
        </ScrollView>

        <HudSliderControl
          colorHex={activeValues.colorHex}
          label={activeRegion === 'foundation' ? '강도' : '발색'}
          onChange={handleIntensityChange}
          value={activeValues.intensity}
        />
        <HudSliderControl
          colorHex={activeValues.colorHex}
          label="투명도"
          onChange={handleOpacityChange}
          value={activeValues.opacity}
        />

        {activeRegion === 'foundation' ? (
          <>
            <YStack style={styles.foundationDebugGroup}>
              <Text style={styles.foundationDebugLabel}>마스크 디버그</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.foundationDebugModeRow}>
                {FOUNDATION_DEBUG_MODE_OPTIONS.map(option => {
                  const isSelected =
                    (companionControls.foundation.debugMaskMode ?? 0) === option.mode;

                  return (
                    <Pressable
                      accessibilityLabel={`파운데이션 디버그 ${option.label}`}
                      accessibilityRole="button"
                      accessibilityState={{selected: isSelected}}
                      key={option.mode}
                      onPress={() => handleFoundationDebugModeChange(option.mode)}
                      style={({pressed}) => [
                        styles.foundationDebugModeButton,
                        isSelected && styles.foundationDebugModeButtonActive,
                        pressed && styles.pressed,
                      ]}>
                      <Text
                        style={[
                          styles.foundationDebugModeText,
                          isSelected && styles.foundationDebugModeTextActive,
                        ]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </YStack>
            <HudSliderControl
              colorHex={activeValues.colorHex}
              label="커버력"
              onChange={handleFoundationCoverageChange}
              value={companionControls.foundation.coverage ?? 0.6}
            />
            <HudSliderControl
              colorHex={activeValues.colorHex}
              label="균일도"
              onChange={handleFoundationEvennessChange}
              value={companionControls.foundation.evenness ?? 0.3}
            />
            <HudSliderControl
              colorHex={activeValues.colorHex}
              label="잡티 제거"
              onChange={handleFoundationBlemishChange}
              value={companionControls.foundation.blemish ?? 0.38}
            />
          </>
        ) : null}

      </YStack>
    </YStack>
  );
}

function HudRegionOptions({
  activeRegion,
  activeRegionEnabled,
  browControls,
  companionControls,
  controls,
  hasGeneratedBrowPackage,
  onChangeBrowControls,
  onChangeCompanionControls,
  onChangeControls,
  onDisableActiveRegion,
}: {
  activeRegion: ArBlushHudRegion;
  activeRegionEnabled: boolean;
  browControls: GeneratedBrowControls;
  companionControls: PersonalizedCompanionMakeupControls;
  controls: GeneratedMaskControls;
  hasGeneratedBrowPackage: boolean;
  onChangeBrowControls: (patch: Partial<GeneratedBrowControls>) => void;
  onChangeCompanionControls: (
    region: CompanionRegionKey,
    patch: Partial<PersonalizedCompanionMakeupControls[CompanionRegionKey]>,
  ) => void;
  onChangeControls: (patch: Partial<GeneratedMaskControls>) => void;
  onDisableActiveRegion: () => void;
}) {
  if (activeRegion === 'eyebrow' && hasGeneratedBrowPackage) {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{selected: !activeRegionEnabled}}
          onPress={onDisableActiveRegion}
          style={[
            styles.arBlushOptionButton,
            styles.arBlushNoneOptionButton,
            !activeRegionEnabled && styles.arBlushNoneOptionButtonActive,
          ]}>
          <Text style={styles.arBlushNoneOptionText}>
            선택 안함
          </Text>
        </Pressable>
        {GENERATED_BROW_SHAPE_OPTIONS.map(option => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              selected: activeRegionEnabled && browControls.shapeId === option.shapeId,
            }}
            key={option.shapeId}
            onPress={() => onChangeBrowControls({shapeId: option.shapeId})}
            style={[
              styles.arBlushOptionButton,
              activeRegionEnabled &&
                browControls.shapeId === option.shapeId &&
                styles.arBlushOptionButtonActive,
            ]}>
            <Text
              style={[
                styles.arBlushOptionText,
                activeRegionEnabled &&
                  browControls.shapeId === option.shapeId &&
                  styles.arBlushOptionTextActive,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
        {__DEV__
          ? GENERATED_BROW_DEBUG_OPTIONS.map(option => {
              const isSelected =
                activeRegionEnabled &&
                browControls.debugMode === option.debugMode &&
                browControls.debugShowLeftRight === option.debugShowLeftRight &&
                browControls.debugExaggerate === option.debugExaggerate;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{selected: isSelected}}
                  key={`debug-${option.debugMode}`}
                  onPress={() =>
                    onChangeBrowControls({
                      debugExaggerate: option.debugExaggerate,
                      debugMode: option.debugMode,
                      debugShowLeftRight: option.debugShowLeftRight,
                    })
                  }
                  style={[
                    styles.arBlushOptionButton,
                    isSelected && styles.arBlushOptionButtonActive,
                  ]}>
                  <Text
                    style={[
                      styles.arBlushOptionText,
                      isSelected && styles.arBlushOptionTextActive,
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })
          : null}
      </>
    );
  }

  if (activeRegion === 'lip') {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{selected: !activeRegionEnabled}}
          onPress={onDisableActiveRegion}
          style={[
            styles.arBlushOptionButton,
            styles.arBlushNoneOptionButton,
            !activeRegionEnabled && styles.arBlushNoneOptionButtonActive,
          ]}>
          <Text style={styles.arBlushNoneOptionText}>
            선택 안함
          </Text>
        </Pressable>
        {GENERATED_MASK_FINISH_OPTIONS.map(option => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              selected: activeRegionEnabled && controls.finish === option.finish,
            }}
            key={option.finish}
            onPress={() =>
              onChangeControls({
                finish: option.finish,
                glossBoost: option.glossBoost,
                gradientAmount: option.gradientAmount,
                roughness: option.roughness,
                specular: option.specular,
                specularPower: option.specularPower,
                texture: option.texture,
                textureAmount: option.textureAmount,
              })
            }
            style={[
              styles.arBlushOptionButton,
              activeRegionEnabled &&
                controls.finish === option.finish &&
                styles.arBlushOptionButtonActive,
            ]}>
            <Text
              style={[
                styles.arBlushOptionText,
                activeRegionEnabled &&
                  controls.finish === option.finish &&
                  styles.arBlushOptionTextActive,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </>
    );
  }

  if (activeRegion === 'foundation') {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{selected: !activeRegionEnabled}}
          onPress={onDisableActiveRegion}
          style={[
            styles.arBlushOptionButton,
            styles.arBlushNoneOptionButton,
            !activeRegionEnabled && styles.arBlushNoneOptionButtonActive,
          ]}>
          <Text style={styles.arBlushNoneOptionText}>
            선택 안함
          </Text>
        </Pressable>
        {FOUNDATION_FINISH_OPTIONS.map(option => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              selected:
                activeRegionEnabled &&
                companionControls.foundation.finish === option.finish,
            }}
            key={option.finish}
            onPress={() =>
              onChangeCompanionControls('foundation', {
                evenness: option.evenness,
                finish: option.finish,
                luminanceInfluence: option.luminanceInfluence,
              })
            }
            style={[
              styles.arBlushOptionButton,
              activeRegionEnabled &&
                companionControls.foundation.finish === option.finish &&
                styles.arBlushOptionButtonActive,
            ]}>
            <Text
              style={[
                styles.arBlushOptionText,
                activeRegionEnabled &&
                  companionControls.foundation.finish === option.finish &&
                  styles.arBlushOptionTextActive,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </>
    );
  }

  const regionKey = getCompanionRegionKey(activeRegion);
  const options =
    activeRegion === 'cheek'
      ? AR_BLUSH_CHEEK_REGION_OPTIONS
      : activeRegion === 'eyeliner'
      ? AR_BLUSH_EYELINER_REGION_OPTIONS
      : AR_BLUSH_EYEBROW_REGION_OPTIONS;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{selected: !activeRegionEnabled}}
        onPress={onDisableActiveRegion}
        style={[
          styles.arBlushOptionButton,
          styles.arBlushNoneOptionButton,
          !activeRegionEnabled && styles.arBlushNoneOptionButtonActive,
        ]}>
        <Text style={styles.arBlushNoneOptionText}>
          선택 안함
        </Text>
      </Pressable>
      {options.map(option => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            selected:
              activeRegionEnabled &&
              companionControls[regionKey].maskTextureId === option.maskTextureId,
          }}
          key={option.maskTextureId}
          onPress={() =>
            onChangeCompanionControls(regionKey, {
              candidateId: option.candidateId,
              maskTextureId: option.maskTextureId,
              // 스타일이 기본색을 지정하면(예: 컬러드 → 버건디) 함께 적용.
              ...('colorHex' in option ? {colorHex: option.colorHex} : {}),
            })
          }
          style={[
            styles.arBlushOptionButton,
            activeRegionEnabled &&
              companionControls[regionKey].maskTextureId === option.maskTextureId &&
              styles.arBlushOptionButtonActive,
          ]}>
          <Text
            style={[
              styles.arBlushOptionText,
              activeRegionEnabled &&
                companionControls[regionKey].maskTextureId === option.maskTextureId &&
                styles.arBlushOptionTextActive,
            ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </>
  );
}

function HudSliderControl({
  colorHex,
  label,
  onChange,
  value,
}: {
  colorHex: string;
  label: string;
  onChange: (value: number) => void;
  value: number;
}) {
  const clampedValue = Math.max(0, Math.min(1, value));
  const trackRef = useRef<React.ElementRef<typeof RNView>>(null);
  const trackLeftRef = useRef(0);
  const trackWidthRef = useRef(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const measureTrack = () => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      trackLeftRef.current = x;
      trackWidthRef.current = Math.max(1, width);
    });
  };

  const updateValueFromEvent = (event: GestureResponderEvent) => {
    const width = Math.max(1, trackWidthRef.current);
    const localX =
      trackLeftRef.current > 0
        ? event.nativeEvent.pageX - trackLeftRef.current
        : event.nativeEvent.locationX;
    const nextValue = Math.max(0, Math.min(1, localX / width));
    onChangeRef.current(Number(nextValue.toFixed(3)));
  };

  const panResponderRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: event => {
        measureTrack();
        updateValueFromEvent(event);
      },
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderMove: updateValueFromEvent,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  );

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    trackWidthRef.current = Math.max(1, event.nativeEvent.layout.width);
    requestAnimationFrame(measureTrack);
  };

  return (
    <YStack style={styles.arBlushSliderGroup}>
      <XStack style={styles.arBlushSliderLabelRow}>
        <Text style={styles.arBlushSliderLabel}>{label}</Text>
        <Text style={styles.arBlushSliderValue}>{clampedValue.toFixed(2)}</Text>
      </XStack>
      <RNView
        ref={trackRef}
        accessibilityRole="adjustable"
        onLayout={handleTrackLayout}
        style={styles.arBlushSliderTrack}
        {...panResponderRef.current.panHandlers}>
        <RNView
          pointerEvents="none"
          style={[
            styles.arBlushSliderFill,
            {backgroundColor: colorHex, width: `${Math.max(3, clampedValue * 100)}%`},
          ]}
        />
        <RNView
          pointerEvents="none"
          style={[
            styles.arBlushSliderThumb,
            {left: `${Math.max(2, Math.min(96, clampedValue * 100))}%`},
          ]}
        />
      </RNView>
    </YStack>
  );
}

function getHudRegionValues(
  activeRegion: ArBlushHudRegion,
  controls: GeneratedMaskControls,
  companionControls: PersonalizedCompanionMakeupControls,
) {
  if (activeRegion === 'lip') {
    // Live vision-boundary lip layer is driven by companion controls; the
    // generated controls only carry the optional photo-refined finish/texture.
    const lipControls = companionControls.lip;
    return {
      colorHex: lipControls.colorHex,
      colorName: getColorName(lipControls.colorHex),
      intensity: lipControls.intensity,
      opacity: lipControls.opacity,
      styleLabel: controls.finish,
      textureLabel: controls.texture,
    };
  }

  const regionKey = getCompanionRegionKey(activeRegion);
  const regionControls = companionControls[regionKey];
  return {
    colorHex: regionControls.colorHex,
    colorName: getColorName(regionControls.colorHex),
    intensity: regionControls.intensity,
    opacity: regionControls.opacity,
    styleLabel: getCompanionStyleLabel(activeRegion, regionControls.maskTextureId),
    textureLabel: activeRegion === 'cheek' ? 'soft_blush' : 'soft_brow',
  };
}

function getColorName(colorHex: string): string {
  return (
    [
      ...FOUNDATION_VALIDATION_COLORS,
      ...GENERATED_MASK_VALIDATION_COLORS,
      ...GENERATED_BROW_VALIDATION_COLORS,
    ].find(color => color.color === colorHex)?.name ?? '사용자 지정'
  );
}

function getCompanionRegionKey(region: ArBlushHudRegion): CompanionRegionKey {
  if (region === 'foundation') {
    return 'foundation';
  }

  if (region === 'cheek') {
    return 'blush';
  }

  if (region === 'eyeliner') {
    return 'eyeliner';
  }

  if (region === 'lip') {
    return 'lip';
  }

  return 'brow';
}

function getHudRegionFromCompanionRegionKey(region: CompanionRegionKey): ArBlushHudRegion {
  if (region === 'foundation') {
    return 'foundation';
  }

  if (region === 'blush') {
    return 'cheek';
  }

  if (region === 'eyeliner') {
    return 'eyeliner';
  }

  if (region === 'lip') {
    return 'lip';
  }

  return 'eyebrow';
}

function getEnabledCompanionRegions(
  enabledRegions: EnabledHudRegions,
): readonly CompanionRegionKey[] {
  return [
    enabledRegions.foundation ? 'foundation' : null,
    enabledRegions.cheek ? 'blush' : null,
    enabledRegions.eyebrow ? 'brow' : null,
    enabledRegions.eyeliner ? 'eyeliner' : null,
    enabledRegions.lip ? 'lip' : null,
  ].filter((region): region is CompanionRegionKey => Boolean(region));
}

// When the generated (photo-personalized) brow mask is active it fully
// replaces the companion brow layer in Unity, so the companion recipe must
// never include 'brow' alongside it (the branch API used includeBrowLayer:
// false; the current recipe builder takes activeRegions instead).
function excludeCompanionBrowRegion(
  regions: readonly CompanionRegionKey[],
): readonly CompanionRegionKey[] {
  return regions.filter(region => region !== 'brow');
}

function getCompanionOptions(region: CompanionHudRegion) {
  if (region === 'foundation') {
    return FOUNDATION_FINISH_OPTIONS;
  }

  if (region === 'cheek') {
    return AR_BLUSH_CHEEK_REGION_OPTIONS;
  }

  if (region === 'eyeliner') {
    return AR_BLUSH_EYELINER_REGION_OPTIONS;
  }

  return AR_BLUSH_EYEBROW_REGION_OPTIONS;
}

function getCompanionStyleLabel(region: CompanionHudRegion, maskTextureId: string): string {
  if (region === 'foundation') {
    return '베이스';
  }

  const options =
    region === 'cheek'
      ? AR_BLUSH_CHEEK_REGION_OPTIONS
      : AR_BLUSH_EYEBROW_REGION_OPTIONS;
  const option = options.find(candidate => candidate.maskTextureId === maskTextureId);
  return option?.label ?? '사용자 지정';
}

function getHudOptionSectionLabel(region: ArBlushHudRegion): string {
  if (region === 'foundation') {
    return '베이스 마무리';
  }

  if (region === 'lip') {
    return '립 마무리';
  }

  if (region === 'cheek') {
    return '치크 영역';
  }

  return '눈썹 모양';
}

function clampGeneratedMaskControls(
  controls: GeneratedMaskControls,
): GeneratedMaskControls {
  return {
    ...controls,
    coverage: Math.max(0, Math.min(1, controls.coverage)),
    glossBoost: Math.max(0, Math.min(1, controls.glossBoost)),
    gradientAmount: Math.max(0, Math.min(1, controls.gradientAmount)),
    intensity: Math.max(0, Math.min(1, controls.intensity)),
    opacity: Math.max(0, Math.min(1, controls.opacity)),
    roughness: Math.max(0, Math.min(1, controls.roughness)),
    specular: Math.max(0, Math.min(1, controls.specular)),
    specularPower: Math.max(1, Math.min(128, controls.specularPower)),
    textureAmount: Math.max(0, Math.min(1, controls.textureAmount)),
  };
}

function clampGeneratedBrowControls(
  controls: GeneratedBrowControls,
): GeneratedBrowControls {
  return {
    ...controls,
    cleanupStrength: 0,
    coverage: Math.max(0, Math.min(1, controls.coverage)),
    debugExaggerate: Boolean(controls.debugExaggerate),
    debugMode: Math.max(0, Math.min(6, controls.debugMode)) as GeneratedBrowControls['debugMode'],
    debugShowLeftRight: Boolean(controls.debugShowLeftRight),
    intensity: Math.max(0, Math.min(1, controls.intensity)),
    neutralizeStrength: 0,
    opacity: Math.max(0, Math.min(1, controls.opacity)),
    // 결(strand hair texture)은 항상 살아있도록 고정한다. UI 슬라이더를 제거했고,
    // 어떤 상태값이 들어와도 강하게 유지.
    strandTextureAmount: BROW_STRAND_TEXTURE_AMOUNT,
  };
}

function formatGeneratedBrowBlockedReason(reason: string | undefined): string {
  if (!reason || reason === 'none') {
    return 'Unity 적용 상태 확인 중';
  }

  const labels: Record<string, string> = {
    ar_face_uv_unavailable: '얼굴 UV 대기',
    face_not_tracked: '얼굴 추적 대기',
    generated_brow_mask_pending_apply_exception: 'Unity 적용 예외',
    mask_texture_dimensions_invalid: '마스크 크기 오류',
    mask_texture_missing: '마스크 텍스처 대기',
    mask_texture_registration_failed: '마스크 등록 실패',
    mask_triangles_empty: '눈썹 UV 영역 미검출',
    raw_rgba_byte_count_mismatch: '마스크 바이트 수 불일치',
    raw_rgba_payload_missing: '마스크 원본 누락',
    texture_registration_failed: '텍스처 등록 실패',
    uv_unavailable: 'UV 대기',
  };

  return labels[reason] ?? reason;
}

function logGeneratedBrowAppliedEvent(event: UnityGeneratedBrowAppliedEvent) {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    return;
  }

  const logPayload = {
    anchorStabilizationMode: event.anchorStabilizationMode,
    applied: event.applied,
    applyTrigger: event.applyTrigger,
    attemptCount: event.attemptCount,
    blockedReason: event.blockedReason,
    browAnchorPointCount: event.browAnchorPointCount,
    browCorePointCount: event.browCorePointCount,
    browShapeBasePointCount: event.browShapeBasePointCount,
    color: event.color,
    debugExaggerate: event.debugExaggerate,
    debugMode: event.debugMode,
    debugShowLeftRight: event.debugShowLeftRight,
    eyeAnchorPointCount: event.eyeAnchorPointCount,
    eyeExclusionMode: event.eyeExclusionMode,
    expectedMaskUvMaxX: event.expectedMaskUvMaxX,
    expectedMaskUvMaxY: event.expectedMaskUvMaxY,
    expectedMaskUvMinX: event.expectedMaskUvMinX,
    expectedMaskUvMinY: event.expectedMaskUvMinY,
    faceOvalPointCount: event.faceOvalPointCount,
    faceCount: event.faceCount,
    generatedMaskId: event.generatedMaskId,
    meshIndexCount: event.meshIndexCount,
    meshUvCount: event.meshUvCount,
    meshVertexCount: event.meshVertexCount,
    maskTextureId: event.maskTextureId,
    maskTextureSampleChannel: event.maskTextureSampleChannel,
    maskTriangles: event.maskTriangles,
    maskNegativeXTriangleCount: event.maskNegativeXTriangleCount,
    maskNegativeXUvBoundsAvailable: event.maskNegativeXUvBoundsAvailable,
    maskNegativeXUvMaxX: event.maskNegativeXUvMaxX,
    maskNegativeXUvMaxY: event.maskNegativeXUvMaxY,
    maskNegativeXUvMinX: event.maskNegativeXUvMinX,
    maskNegativeXUvMinY: event.maskNegativeXUvMinY,
    maskPositiveXTriangleCount: event.maskPositiveXTriangleCount,
    maskPositiveXUvBoundsAvailable: event.maskPositiveXUvBoundsAvailable,
    maskPositiveXUvMaxX: event.maskPositiveXUvMaxX,
    maskPositiveXUvMaxY: event.maskPositiveXUvMaxY,
    maskPositiveXUvMinX: event.maskPositiveXUvMinX,
    maskPositiveXUvMinY: event.maskPositiveXUvMinY,
    maskUvBoundsAvailable: event.maskUvBoundsAvailable,
    maskUvMaxX: event.maskUvMaxX,
    maskUvMaxY: event.maskUvMaxY,
    maskUvMinX: event.maskUvMinX,
    maskUvMinY: event.maskUvMinY,
    maskUvSplitMode: event.maskUvSplitMode,
    noseBridgeAnchorPointCount: event.noseBridgeAnchorPointCount,
    opacity: event.opacity,
    runtimeReady: event.runtimeReady,
    stateAction: event.stateAction,
    stabilityMode: event.stabilityMode,
    stabilizationDeadZoneMeters: event.stabilizationDeadZoneMeters,
    stabilizationSnapDistanceMeters: event.stabilizationSnapDistanceMeters,
    status: event.status,
    softEdgeTexels: event.softEdgeTexels,
    surroundAnchorPointCount: event.surroundAnchorPointCount,
    templeAnchorPointCount: event.templeAnchorPointCount,
    trackingState: event.trackingState,
    upperEyelidAnchorPointCount: event.upperEyelidAnchorPointCount,
    uvAvailable: event.uvAvailable,
  };

  if (event.status === 'blocked') {
    console.warn('[aura:brow] generated-brow-mask:blocked', logPayload);
    return;
  }

  console.info('[aura:brow] generated-brow-mask:applied-event', logPayload);
}

function clampCompanionMakeupControls(
  controls: PersonalizedCompanionMakeupControls,
): PersonalizedCompanionMakeupControls {
  return {
    blush: clampCompanionMakeupRegionControl(controls.blush),
    brow: clampCompanionMakeupRegionControl(controls.brow),
    eyeliner: clampCompanionMakeupRegionControl(controls.eyeliner),
    foundation: clampCompanionMakeupRegionControl(controls.foundation),
    lip: clampCompanionMakeupRegionControl(controls.lip),
  };
}

function clampCompanionMakeupRegionControl(
  control: PersonalizedCompanionMakeupControls[CompanionRegionKey],
) {
  return {
    ...control,
    coverage: control.coverage === undefined ? undefined : Math.max(0, Math.min(1, control.coverage)),
    evenness: control.evenness === undefined ? undefined : Math.max(0, Math.min(1, control.evenness)),
    intensity: Math.max(0, Math.min(1, control.intensity)),
    luminanceInfluence:
      control.luminanceInfluence === undefined
        ? undefined
        : Math.max(0, Math.min(1, control.luminanceInfluence)),
    opacity: Math.max(0, Math.min(1, control.opacity)),
  };
}

const styles = StyleSheet.create({
  arBlushCollapsedRow: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  arBlushShowButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    borderColor: 'rgba(255, 255, 255, 0.20)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  arBlushShowText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  arBlushCloseButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  arBlushCloseText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  arBlushColorButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    minWidth: 74,
    paddingHorizontal: spacing.sm,
  },
  arBlushColorButtonActive: {
    borderColor: colors.white,
    borderWidth: 2,
  },
  arBlushColorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  arBlushColorText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  arBlushControlsPanel: {
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  foundationDebugGroup: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 10,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  foundationDebugLabel: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  foundationDebugModeButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.32)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    minWidth: 66,
    paddingHorizontal: spacing.sm,
  },
  foundationDebugModeButtonActive: {
    backgroundColor: '#FFE978',
    borderColor: '#FFE978',
  },
  foundationDebugModeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  foundationDebugModeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  foundationDebugModeTextActive: {
    color: colors.black,
  },
  foundationShadeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(255, 255, 255, 0.42)',
    gap: 4,
    height: 56,
    minWidth: 94,
    paddingHorizontal: spacing.xs,
  },
  foundationShadeButtonActive: {
    backgroundColor: colors.white,
    borderColor: '#FFE978',
    borderWidth: 2,
  },
  foundationShadeSwatch: {
    borderColor: 'rgba(0, 0, 0, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    height: 20,
    width: 38,
  },
  foundationShadeText: {
    color: colors.black,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  arBlushHideButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.36)',
    borderRadius: 10,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  arBlushHideText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  arBlushHudShell: {
    gap: spacing.sm,
  },
  arBlushHudTopRow: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  arBlushModeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  arBlushModeButtonActive: {
    backgroundColor: colors.white,
  },
  arBlushModeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  arBlushModeText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  arBlushModeTextActive: {
    color: colors.black,
  },
  arBlushNoneButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  arBlushNoneButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: colors.white,
    borderWidth: 2,
  },
  arBlushNoneButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  arBlushNoneOptionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  arBlushNoneOptionButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderColor: colors.white,
    borderWidth: 2,
  },
  arBlushNoneOptionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  arBlushOptionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 112,
    paddingHorizontal: spacing.md,
  },
  arBlushOptionButtonActive: {
    backgroundColor: colors.white,
    borderColor: '#FFE978',
    borderWidth: 2,
  },
  arBlushOptionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  arBlushOptionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  arBlushOptionTextActive: {
    color: colors.black,
  },
  arBlushPanelHeader: {
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  arBlushPanelMeta: {
    color: 'rgba(255, 255, 255, 0.78)',
    flex: 1,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'right',
  },
  arBlushPanelTitle: {
    color: '#FFE978',
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  arBlushRecipeText: {
    color: '#9BDEEF',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
  },
  arBlushRegionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  arBlushRegionButtonActive: {
    backgroundColor: colors.white,
    borderColor: '#FFE978',
    borderWidth: 2,
  },
  arBlushRegionTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  arBlushRegionText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  arBlushRegionTextActive: {
    color: colors.black,
  },
  arBlushSectionLabel: {
    color: '#BEEFFF',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  arBlushSliderFill: {
    borderRadius: radius.pill,
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  arBlushSliderGroup: {
    gap: spacing.xs,
  },
  arBlushSliderLabel: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  arBlushSliderLabelRow: {
    alignItems: 'center',
  },
  arBlushSliderRow: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  arBlushSliderStepButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  arBlushSliderStepText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  arBlushSliderThumb: {
    backgroundColor: colors.white,
    borderColor: '#182235',
    borderRadius: 9,
    borderWidth: 2,
    height: 22,
    marginLeft: -11,
    position: 'absolute',
    top: 0,
    width: 22,
  },
  arBlushSliderTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
    borderRadius: radius.pill,
    alignSelf: 'stretch',
    height: 22,
    overflow: 'visible',
    width: '100%',
  },
  arBlushSliderValue: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  arBlushStatusBox: {
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    padding: spacing.sm,
  },
  arBlushStatusMeta: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  arBlushStatusText: {
    color: 'rgba(255, 255, 255, 0.84)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
  },
  arBlushStatusTitle: {
    color: '#B8F4D3',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  arBlushSummaryText: {
    color: colors.white,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
  },
  bottomActions: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.lg,
  },
  cameraStage: {
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  captureButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: radius.pill,
    borderWidth: 5,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  captureButtonApplied: {
    borderColor: 'rgba(38, 214, 121, 0.58)',
  },
  captureButtonInner: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    height: 54,
    width: 54,
  },
  captureButtonDisabled: {
    opacity: 0.64,
  },
  capturePressed: {
    transform: [{scale: 0.96}],
  },
  controlPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  faceGuide: {
    alignSelf: 'center',
    borderColor: 'rgba(255, 255, 255, 0.42)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: '74%',
    marginTop: spacing.xl,
    width: '58%',
  },
  generateAppliedAdjustButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  generateAppliedAdjustButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  generateAppliedBanner: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  generateAppliedBannerText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.sm,
  },
  generateAppliedBannerTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  generateAppliedColorButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.30)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    minWidth: 58,
    paddingHorizontal: spacing.sm,
  },
  generateAppliedColorButtonSelected: {
    borderColor: colors.white,
    borderWidth: 2,
  },
  generateAppliedColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  generateAppliedColorText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  generateAppliedControlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  generateAppliedControlButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.34)',
  },
  generateAppliedControlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  generateAppliedControlText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  generateAppliedHeader: {
    gap: 2,
  },
  generateAppliedOpacityText: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  introBrowPreviewLeft: {
    backgroundColor: 'rgba(74, 52, 43, 0.8)',
    height: 10,
    left: '29%',
    top: '31%',
    transform: [{rotate: '-6deg'}],
    width: 54,
  },
  introBrowPreviewRight: {
    backgroundColor: 'rgba(74, 52, 43, 0.8)',
    height: 10,
    right: '29%',
    top: '31%',
    transform: [{rotate: '6deg'}],
    width: 54,
  },
  introCheekPreviewLeft: {
    backgroundColor: 'rgba(230, 123, 95, 0.52)',
    height: 42,
    left: '20%',
    top: '51%',
    width: 66,
  },
  introCheekPreviewRight: {
    backgroundColor: 'rgba(230, 123, 95, 0.52)',
    height: 42,
    right: '20%',
    top: '51%',
    width: 66,
  },
  introLipPreview: {
    backgroundColor: 'rgba(217, 75, 116, 0.76)',
    borderRadius: radius.pill,
    height: 22,
    left: '39%',
    top: '66%',
    width: 68,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 48,
  },
  headerEyebrow: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  headerSpacer: {
    height: 42,
    width: 42,
  },
  headerTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  headerTitleGroup: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  maskIntroContent: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  maskIntroCopy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  maskIntroDescription: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
    maxWidth: 260,
    textAlign: 'center',
  },
  maskIntroEyebrow: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  maskIntroFace: {
    aspectRatio: 0.72,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 230,
    position: 'relative',
  },
  maskIntroStage: {
    backgroundColor: '#101010',
  },
  maskIntroTitle: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
    textAlign: 'center',
  },
  maskIdText: {
    color: 'rgba(255, 255, 255, 0.48)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  maskFlowStepChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  maskFlowStepChipActive: {
    backgroundColor: colors.white,
  },
  maskFlowStepChipDone: {
    backgroundColor: 'rgba(38, 214, 121, 0.28)',
    borderColor: 'rgba(38, 214, 121, 0.38)',
  },
  maskFlowStepRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  maskFlowStepText: {
    color: 'rgba(255, 255, 255, 0.64)',
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  maskFlowStepTextActive: {
    color: colors.black,
  },
  pressed: {
    opacity: 0.72,
  },
  regionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    height: 42,
    justifyContent: 'center',
  },
  regionButtonActive: {
    backgroundColor: colors.white,
  },
  regionButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  regionButtonTextActive: {
    color: colors.black,
  },
  regionPreview: {
    borderRadius: radius.pill,
    opacity: 0.18,
    position: 'absolute',
  },
  regionPreviewActive: {
    opacity: 1,
  },
  regionTabs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  screen: {
    backgroundColor: colors.black,
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  scanRegionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minHeight: 50,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  scanRegionCardActive: {
    borderColor: 'rgba(255, 255, 255, 0.36)',
  },
  scanRegionCardDone: {
    backgroundColor: 'rgba(38, 214, 121, 0.18)',
    borderColor: 'rgba(38, 214, 121, 0.38)',
  },
  scanRegionLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  scanRegionMeta: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  scanRegionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  secondaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.glassSurface,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: '94%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  statusPillError: {
    backgroundColor: 'rgba(255, 91, 84, 0.24)',
    borderColor: 'rgba(255, 91, 84, 0.38)',
  },
  statusText: {
    color: colors.white,
    flexShrink: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 56,
    justifyContent: 'center',
    minWidth: 218,
    paddingHorizontal: spacing.xl,
  },
  startButtonText: {
    color: colors.black,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  unityMountPoint: {
    alignSelf: 'center',
    aspectRatio: 3 / 4,
    backgroundColor: '#151515',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    width: '82%',
  },
});
