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
  postUnityGeneratedLipMaskPayload,
  postUnityMakeupRecipe,
  postUnityRegionOverlayVisibility,
  postUnitySynchronizedCaptureRequest,
  prepareUnityMakeupRuntime,
} from '../services/unityMakeupBridge';
import {
  buildGeneratedMaskUnityPayload,
  buildCheekBrowRecipeAfterGeneratedLip,
  DEFAULT_GENERATED_MASK_CONTROLS,
  DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
  generatePersonalizedLipMakeup,
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
  {id: 'apply', label: 'AR 적용'},
] as const;
const PERSONAL_MASK_REGIONS = [
  {id: 'lip', label: '입술', guidance: '경계 추출'},
  {id: 'blush', label: '볼', guidance: '위치 기준'},
  {id: 'brow', label: '눈썹', guidance: '브로우 기준'},
] as const;
const AR_BLUSH_HUD_REGIONS = [
  {id: 'lip', label: 'LIP'},
  {id: 'cheek', label: 'CHEEK'},
  {id: 'eyebrow', label: 'EYEBROW'},
] as const;
const GENERATED_MASK_VALIDATION_COLORS = [
  {name: 'ROSE', color: '#D94B74', secondaryColor: '#F29BAA'},
  {name: 'CORAL', color: '#E67B5F', secondaryColor: '#F5A18C'},
  {name: 'NUDE', color: '#C08A72', secondaryColor: '#E0B39E'},
  {name: 'BERRY', color: '#A83567', secondaryColor: '#D66A91'},
  {name: 'RED', color: '#CF1838', secondaryColor: '#F05C70'},
  {name: 'PALE PINK', color: '#F1CBD5', secondaryColor: '#F8DEE5'},
] as const;
const GENERATED_MASK_FINISH_OPTIONS = [
  {
    finish: 'matte',
    gradientAmount: 0.08,
    glossBoost: 0,
    label: 'Matte',
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
    label: 'Glow',
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
    label: 'Gradient',
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
  {label: 'Daily', candidateId: 'blush-session-1-v1', maskTextureId: 'cheek-session-mask-1-v1'},
  {label: 'Lovely', candidateId: 'blush-session-2-v1', maskTextureId: 'cheek-session-mask-2-v1'},
  {label: 'Under', candidateId: 'blush-session-3-v1', maskTextureId: 'cheek-session-mask-3-v1'},
  {label: 'Sun 1', candidateId: 'blush-session-4-v1', maskTextureId: 'cheek-session-mask-4-v1'},
  {label: 'Sun 2', candidateId: 'blush-session-5-v1', maskTextureId: 'cheek-session-mask-5-v1'},
] as const;
const AR_BLUSH_EYEBROW_REGION_OPTIONS = [
  {label: 'Daily', candidateId: 'brow-soft-arch-fine-hair-v1', maskTextureId: 'brow-soft-arch-fine-hair-v1'},
  {label: 'Natural', candidateId: 'brow-png-natural-hair-v1', maskTextureId: 'brow-png-natural-hair-v1'},
  {label: 'Slim', candidateId: 'brow-slim-tail-fine-hair-v1', maskTextureId: 'brow-slim-tail-fine-hair-v1'},
] as const;

type ArBlushHudRegion = (typeof AR_BLUSH_HUD_REGIONS)[number]['id'];
type CompanionHudRegion = Exclude<ArBlushHudRegion, 'lip'>;
type CompanionRegionKey = Exclude<keyof PersonalizedCompanionMakeupControls, 'eyeliner'>;

export function UnityMakeupCaptureScreen({
  onBack,
}: UnityMakeupCaptureScreenProps) {
  const insets = useSafeAreaInsets();
  const shouldUseUnityPreview = useUnityMakeupNativeViewReady();
  const [hasStartedMaskFlow, setHasStartedMaskFlow] = useState(false);
  const [isPreparingUnity, setIsPreparingUnity] = useState(false);
  const [phase, setPhase] = useState<CapturePhase>('ready');
  const [notice, setNotice] = useState('개인 마스크를 먼저 만든 뒤 립, 볼, 눈썹을 적용합니다');
  const [lastGeneratedMaskId, setLastGeneratedMaskId] = useState<string | null>(null);
  const [sourceFrameMetadata, setSourceFrameMetadata] =
    useState<FullFaceMakeupSourceInput | null>(null);
  const [generatedPackage, setGeneratedPackage] =
    useState<PersonalizedMakeupGenerateResult['generatedPackage'] | null>(null);
  const [generatedMaskControls, setGeneratedMaskControls] =
    useState<GeneratedMaskControls>(DEFAULT_GENERATED_MASK_CONTROLS);
  const [companionMakeupControls, setCompanionMakeupControls] =
    useState<PersonalizedCompanionMakeupControls>(
      DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
    );
  const [activeHudRegion, setActiveHudRegion] = useState<ArBlushHudRegion>('lip');
  const pendingCaptureRequestRef = useRef<UnitySynchronizedCaptureRequest | null>(null);
  const pendingGeneratedMaskIdRef = useRef<string | null>(null);
  const latestGeneratedApplyPayloadRef = useRef<string | null>(null);
  const generatedMaskControlRevisionRef = useRef(0);
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
    setPhase('ready');
    setNotice('정면 사진을 촬영해 입술, 볼, 눈썹 기준 마스크를 만듭니다');
    postUnityMakeupRecipe(
      buildCheekBrowRecipeAfterGeneratedLip(Date.now(), DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS, {
        activeRegion: 'none',
      }),
    );
    postUnityRegionOverlayVisibility({
      guideOverlayVisible: false,
      maskOverlayVisible: false,
      reason: 'personalized_mask_entry_inactive',
      visible: false,
    });
  };

  const handleStartMaskFlow = () => {
    if (isPreparingUnity || hasStartedMaskFlow) {
      return;
    }

    setIsPreparingUnity(true);
    setNotice('AR 카메라를 준비하는 중입니다');
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

  const handleReferenceCaptureEvent = async (event: UnitySynchronizedCaptureEvent) => {
    const pendingRequest = pendingCaptureRequestRef.current;

    if (!pendingRequest || event.capturePairId !== pendingRequest.capturePairId) {
      return;
    }

    const captureBundle = buildFullFaceCaptureBundleFromEvent(event);
    if (!captureBundle) {
      if (event.status === 'failed') {
        setPhase('error');
        setNotice(event.detail ?? 'Unity 프레임 저장에 실패했습니다');
      }
      return;
    }

    const nextSourceFrameMetadata = buildFullFaceMakeupSourceInput(captureBundle);
    setSourceFrameMetadata(nextSourceFrameMetadata);
    setPhase('generating');
    setNotice('병합용 Generate 흐름으로 개인 마스크를 만드는 중입니다');

    try {
      const result = await generatePersonalizedLipMakeup({
        sourceFrameMetadata: nextSourceFrameMetadata,
      });

      pendingGeneratedMaskIdRef.current = result.generatedPackage.generatedMaskId;
      const unityApplyPayload = JSON.stringify(
        buildGeneratedMaskUnityPayload(result.generatedPackage, DEFAULT_GENERATED_MASK_CONTROLS, {
          includeTexture: true,
        }),
      );
      latestGeneratedApplyPayloadRef.current = unityApplyPayload;
      setGeneratedPackage(result.generatedPackage);
      setGeneratedMaskControls(DEFAULT_GENERATED_MASK_CONTROLS);
      setCompanionMakeupControls(DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS);
      setActiveHudRegion('lip');
      setLastGeneratedMaskId(result.generatedPackage.generatedMaskId);
      setPhase('applying');
      setNotice('개인 마스크를 Unity AR에 적용하는 중입니다');

      postUnityRegionOverlayVisibility({
        guideOverlayVisible: false,
        maskOverlayVisible: true,
        reason: 'personalized_generated_lip_apply',
        visible: true,
      });
      postUnityGeneratedLipMaskPayload(unityApplyPayload);
      postUnityMakeupRecipe(
        buildCheekBrowRecipeAfterGeneratedLip(
          Date.now(),
          DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS,
          {activeRegion: 'all'},
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

  const handleGeneratedLipAppliedEvent = (event: {
    applied?: boolean;
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

    const isApplied =
      (event.status === 'partial' || event.status === 'ready') &&
      event.applied === true &&
      event.uvAvailable === true &&
      (event.maskTriangles ?? 0) > 0;

    if (isApplied) {
      setPhase('applied');
      setNotice('개인 마스크 기반으로 립, 볼, 눈썹이 적용됐습니다');
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
        postUnityMakeupRecipe(
          buildCheekBrowRecipeAfterGeneratedLip(Date.now(), companionMakeupControls, {
            activeRegion: 'all',
          }),
        );
      }, 800);
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
    latestGeneratedApplyPayloadRef.current = null;
    setGeneratedPackage(null);
    setGeneratedMaskControls(DEFAULT_GENERATED_MASK_CONTROLS);
    setCompanionMakeupControls(DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS);
    setActiveHudRegion('lip');
    setLastGeneratedMaskId(null);
    setPhase('capturing');
    setNotice('입술, 볼, 눈썹 기준이 될 현재 프레임을 스캔하는 중입니다');
    postUnityMakeupRecipe(
      buildCheekBrowRecipeAfterGeneratedLip(Date.now(), DEFAULT_PERSONALIZED_COMPANION_MAKEUP_CONTROLS, {
        activeRegion: 'none',
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
      setNotice('Unity 캡처 요청을 보낼 수 없습니다');
    }
  };

  const handleGeneratedMaskControlChange = (patch: Partial<GeneratedMaskControls>) => {
    if (!generatedPackage) {
      return;
    }

    const nextControls = clampGeneratedMaskControls({
      ...generatedMaskControls,
      ...patch,
    });
    generatedMaskControlRevisionRef.current += 1;
    setGeneratedMaskControls(nextControls);
    postRuntimeMakeupForHudRegion(activeHudRegion, nextControls, companionMakeupControls);
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
    postRuntimeMakeupForHudRegion(activeHudRegion, generatedMaskControls, nextControls);
  };

  const handleChangeActiveHudRegion = (region: ArBlushHudRegion) => {
    setActiveHudRegion(region);
    postRuntimeMakeupForHudRegion(region, generatedMaskControls, companionMakeupControls);
  };

  function postRuntimeMakeupForHudRegion(
    region: ArBlushHudRegion,
    nextGeneratedControls: GeneratedMaskControls,
    nextCompanionControls: PersonalizedCompanionMakeupControls,
  ) {
    if (!generatedPackage) {
      return;
    }

    const lipControls = {
      ...nextGeneratedControls,
      maskVisible: true,
    };

    postUnityGeneratedLipMaskPayload(
      JSON.stringify(
        buildGeneratedMaskUnityPayload(generatedPackage, lipControls, {
          controlRevision: generatedMaskControlRevisionRef.current,
          includeTexture: false,
        }),
      ),
    );
    postUnityMakeupRecipe(
      buildCheekBrowRecipeAfterGeneratedLip(Date.now(), nextCompanionControls, {
        activeRegion: 'all',
      }),
    );
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
          <Text style={styles.headerEyebrow}>맞춤 Generate</Text>
          <Text style={styles.headerTitle}>개인 마스크 적용</Text>
        </YStack>

        <View style={styles.headerSpacer} />
      </XStack>

      <YStack style={styles.cameraStage}>
        <View style={[styles.unityMountPoint, !hasStartedMaskFlow && styles.maskIntroStage]}>
          {hasStartedMaskFlow && shouldUseUnityPreview ? (
            <UnityMakeupNativeView />
          ) : !hasStartedMaskFlow ? (
            <YStack style={styles.maskIntroContent}>
              <View style={styles.maskIntroFace}>
                <View style={[styles.regionPreview, styles.introLipPreview, styles.regionPreviewActive]} />
                <View style={[styles.regionPreview, styles.introCheekPreviewLeft, styles.regionPreviewActive]} />
                <View style={[styles.regionPreview, styles.introCheekPreviewRight, styles.regionPreviewActive]} />
                <View style={[styles.regionPreview, styles.introBrowPreviewLeft, styles.regionPreviewActive]} />
                <View style={[styles.regionPreview, styles.introBrowPreviewRight, styles.regionPreviewActive]} />
              </View>
              <YStack style={styles.maskIntroCopy}>
                <Text style={styles.maskIntroEyebrow}>CUSTOM MASK</Text>
                <Text style={styles.maskIntroTitle}>개인 마스크 만들기</Text>
                <Text style={styles.maskIntroDescription}>
                  얼굴 기준 마스크를 만든 뒤 립, 볼, 눈썹을 같은 위치에 적용합니다.
                </Text>
              </YStack>
            </YStack>
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
      </YStack>

      {phase === 'applied' && generatedPackage ? (
        <ArBlushRuntimeHud
          activeRegion={activeHudRegion}
          companionControls={companionMakeupControls}
          controls={generatedMaskControls}
          onChangeActiveRegion={handleChangeActiveHudRegion}
          onChangeCompanionControls={handleCompanionMakeupControlChange}
          onChangeControls={handleGeneratedMaskControlChange}
          onReopenGenerate={() => {
            setPhase('ready');
            setNotice('촬영한 프레임으로 다시 생성하거나 새로 스캔할 수 있습니다');
          }}
        />
      ) : (
        <YStack style={styles.controlPanel}>
          <ScrollView
            contentContainerStyle={styles.maskFlowStepRow}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {MASK_FLOW_STEPS.map(step => {
              const state = getMaskFlowStepState(step.id, activeMaskFlowStep);

              return (
                <View
                  key={step.id}
                  style={[
                    styles.maskFlowStepChip,
                    state === 'active' && styles.maskFlowStepChipActive,
                    state === 'done' && styles.maskFlowStepChipDone,
                  ]}>
                  <Text
                    style={[
                      styles.maskFlowStepText,
                      state !== 'pending' && styles.maskFlowStepTextActive,
                    ]}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <XStack style={styles.scanRegionRow}>
            {PERSONAL_MASK_REGIONS.map(region => {
              const isScanned = Boolean(sourceFrameMetadata);
              const isScanning = phase === 'capturing' || phase === 'generating';

              return (
                <View
                  key={region.id}
                  style={[
                    styles.scanRegionCard,
                    isScanning && styles.scanRegionCardActive,
                    isScanned && styles.scanRegionCardDone,
                  ]}>
                  <Text style={styles.scanRegionLabel}>{region.label}</Text>
                  <Text style={styles.scanRegionMeta}>
                    {isScanned ? '스캔됨' : isScanning ? '스캔 중' : region.guidance}
                  </Text>
                </View>
              );
            })}
          </XStack>

          {lastGeneratedMaskId ? (
            <Text style={styles.maskIdText} numberOfLines={1}>
              {lastGeneratedMaskId}
            </Text>
          ) : null}
        </YStack>
      )}

      <XStack style={styles.bottomActions}>
        {!hasStartedMaskFlow ? (
          <Pressable
            accessibilityLabel="개인 마스크 만들기 시작"
            accessibilityRole="button"
            disabled={isPreparingUnity}
            onPress={handleStartMaskFlow}
            style={({pressed}) => [
              styles.startButton,
              isPreparingUnity && styles.captureButtonDisabled,
              pressed && styles.pressed,
            ]}>
            <Sparkles color={colors.black} size={iconSize.sm} strokeWidth={2} />
            <Text style={styles.startButtonText}>
              {isPreparingUnity ? '준비 중' : '개인 마스크 만들기'}
            </Text>
          </Pressable>
        ) : null}

        {hasStartedMaskFlow ? (
          <Pressable
            accessibilityLabel={captureButtonLabel}
            accessibilityRole="button"
            disabled={isBusy}
            onPress={handleCapturePress}
            style={({pressed}) => [
              styles.captureButton,
              isBusy && styles.captureButtonDisabled,
              phase === 'applied' && styles.captureButtonApplied,
              pressed && styles.capturePressed,
            ]}>
            <View style={styles.captureButtonInner} />
          </Pressable>
        ) : null}
      </XStack>
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
  companionControls,
  controls,
  onChangeActiveRegion,
  onChangeCompanionControls,
  onChangeControls,
  onReopenGenerate,
}: {
  activeRegion: ArBlushHudRegion;
  companionControls: PersonalizedCompanionMakeupControls;
  controls: GeneratedMaskControls;
  onChangeActiveRegion: (region: ArBlushHudRegion) => void;
  onChangeCompanionControls: (
    region: CompanionRegionKey,
    patch: Partial<PersonalizedCompanionMakeupControls[CompanionRegionKey]>,
  ) => void;
  onChangeControls: (patch: Partial<GeneratedMaskControls>) => void;
  onReopenGenerate: () => void;
}) {
  const [isHudHidden, setIsHudHidden] = useState(false);
  const activeValues = getHudRegionValues(activeRegion, controls, companionControls);

  const handleColorPress = (color: (typeof GENERATED_MASK_VALIDATION_COLORS)[number]) => {
    if (activeRegion === 'lip') {
      onChangeControls({
        colorHex: color.color,
        secondaryColorHex: color.secondaryColor,
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
      return;
    }

    const regionKey = getCompanionRegionKey(activeRegion);
    onChangeCompanionControls(regionKey, {
      opacity: value,
    });
  };

  if (isHudHidden) {
    return (
      <XStack style={styles.arBlushCollapsedRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsHudHidden(false)}
          style={({pressed}) => [styles.arBlushShowButton, pressed && styles.pressed]}>
          <Text style={styles.arBlushShowText}>SHOW</Text>
        </Pressable>
      </XStack>
    );
  }

  return (
    <YStack style={styles.arBlushHudShell}>
      <XStack style={styles.arBlushModeRow}>
        {['CLEAN', 'HUD', 'DEBUG'].map(mode => (
          <Pressable
            accessibilityRole="button"
            key={mode}
            onPress={mode === 'CLEAN' ? onReopenGenerate : undefined}
            style={[
              styles.arBlushModeButton,
              mode === 'HUD' && styles.arBlushModeButtonActive,
            ]}>
            <Text
              style={[
                styles.arBlushModeText,
                mode === 'HUD' && styles.arBlushModeTextActive,
              ]}>
              {mode}
            </Text>
          </Pressable>
        ))}
      </XStack>

      <YStack style={styles.arBlushControlsPanel}>
        <XStack style={styles.arBlushPanelHeader}>
          <Text style={styles.arBlushPanelTitle}>CONTROLS</Text>
          <Text style={styles.arBlushPanelMeta}>
            active=lip,cheek,brow / focus={activeRegion}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setIsHudHidden(true)}
            style={styles.arBlushHideButton}>
            <Text style={styles.arBlushHideText}>HIDE</Text>
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

        <XStack style={styles.arBlushColorRow}>
          {GENERATED_MASK_VALIDATION_COLORS.map(color => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: activeValues.colorHex === color.color}}
              key={color.name}
              onPress={() => handleColorPress(color)}
              style={[
                styles.arBlushColorButton,
                {backgroundColor: color.color},
                activeValues.colorHex === color.color && styles.arBlushColorButtonActive,
              ]}>
              <Text style={styles.arBlushColorText}>{color.name}</Text>
            </Pressable>
          ))}
        </XStack>

        <Text style={styles.arBlushSectionLabel}>{getHudOptionSectionLabel(activeRegion)}</Text>
        <XStack style={styles.arBlushOptionGrid}>
          <HudRegionOptions
            activeRegion={activeRegion}
            companionControls={companionControls}
            controls={controls}
            onChangeCompanionControls={onChangeCompanionControls}
            onChangeControls={onChangeControls}
          />
        </XStack>

        <HudSliderControl
          colorHex={activeValues.colorHex}
          label="Intensity"
          onChange={handleIntensityChange}
          value={activeValues.intensity}
        />
        <HudSliderControl
          colorHex={activeValues.colorHex}
          label="Opacity"
          onChange={handleOpacityChange}
          value={activeValues.opacity}
        />

      </YStack>
    </YStack>
  );
}

function HudRegionOptions({
  activeRegion,
  companionControls,
  controls,
  onChangeCompanionControls,
  onChangeControls,
}: {
  activeRegion: ArBlushHudRegion;
  companionControls: PersonalizedCompanionMakeupControls;
  controls: GeneratedMaskControls;
  onChangeCompanionControls: (
    region: CompanionRegionKey,
    patch: Partial<PersonalizedCompanionMakeupControls[CompanionRegionKey]>,
  ) => void;
  onChangeControls: (patch: Partial<GeneratedMaskControls>) => void;
}) {
  if (activeRegion === 'lip') {
    return (
      <>
        {GENERATED_MASK_FINISH_OPTIONS.map(option => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{selected: controls.finish === option.finish}}
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
              controls.finish === option.finish && styles.arBlushOptionButtonActive,
            ]}>
            <Text
              style={[
                styles.arBlushOptionText,
                controls.finish === option.finish && styles.arBlushOptionTextActive,
              ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </>
    );
  }

  const regionKey = getCompanionRegionKey(activeRegion);
  const options = getCompanionOptions(activeRegion);

  return (
    <>
      {options.map(option => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            selected: companionControls[regionKey].maskTextureId === option.maskTextureId,
          }}
          key={option.maskTextureId}
          onPress={() =>
            onChangeCompanionControls(regionKey, {
              candidateId: option.candidateId,
              maskTextureId: option.maskTextureId,
            })
          }
          style={[
            styles.arBlushOptionButton,
            companionControls[regionKey].maskTextureId === option.maskTextureId &&
              styles.arBlushOptionButtonActive,
          ]}>
          <Text
            style={[
              styles.arBlushOptionText,
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
    return {
      colorHex: controls.colorHex,
      colorName: getColorName(controls.colorHex),
      intensity: controls.intensity,
      opacity: controls.opacity,
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
    GENERATED_MASK_VALIDATION_COLORS.find(color => color.color === colorHex)?.name ?? 'CUSTOM'
  );
}

function getCompanionRegionKey(region: CompanionHudRegion): CompanionRegionKey {
  if (region === 'cheek') {
    return 'blush';
  }

  return 'brow';
}

function getCompanionOptions(region: CompanionHudRegion) {
  if (region === 'cheek') {
    return AR_BLUSH_CHEEK_REGION_OPTIONS;
  }

  return AR_BLUSH_EYEBROW_REGION_OPTIONS;
}

function getCompanionStyleLabel(region: CompanionHudRegion, maskTextureId: string): string {
  const option = getCompanionOptions(region).find(candidate => candidate.maskTextureId === maskTextureId);
  return option?.label ?? 'Custom';
}

function getHudOptionSectionLabel(region: ArBlushHudRegion): string {
  if (region === 'lip') {
    return 'LIP FINISH';
  }

  if (region === 'cheek') {
    return 'BLUSH REGION';
  }

  return 'EYEBROW SHAPE';
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

function clampCompanionMakeupControls(
  controls: PersonalizedCompanionMakeupControls,
): PersonalizedCompanionMakeupControls {
  return {
    blush: clampCompanionMakeupRegionControl(controls.blush),
    brow: clampCompanionMakeupRegionControl(controls.brow),
    eyeliner: clampCompanionMakeupRegionControl(controls.eyeliner),
  };
}

function clampCompanionMakeupRegionControl(
  control: PersonalizedCompanionMakeupControls[CompanionRegionKey],
) {
  return {
    ...control,
    intensity: Math.max(0, Math.min(1, control.intensity)),
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
    minWidth: 58,
    paddingHorizontal: spacing.sm,
  },
  arBlushColorButtonActive: {
    borderColor: colors.white,
    borderWidth: 2,
  },
  arBlushColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  arBlushOptionButton: {
    alignItems: 'center',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 12,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 46,
    justifyContent: 'center',
    minWidth: '30%',
    paddingHorizontal: spacing.md,
  },
  arBlushOptionButtonActive: {
    backgroundColor: colors.white,
    borderColor: '#FFE978',
    borderWidth: 2,
  },
  arBlushOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
