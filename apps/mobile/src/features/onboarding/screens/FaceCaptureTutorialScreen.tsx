import {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import {SafeAreaView, useSafeAreaInsets, type Edge} from 'react-native-safe-area-context';
import {
  Camera,
  Check,
  CheckCircle2,
  Glasses,
  ScanFace,
  WandSparkles,
} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {FACE_ANALYSIS_CAPTURE_CHECKLIST} from '../../face-analysis/services/faceAnalysisCaptureChecklist';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {AppHeader, IconButton, PaginationDots, XIcon} from '../../../shared/ui';

const faceCaptureTutorialImageSources = {
  accessory: require('../../../assets/images/face-capture-guide/04-no-accessories.png'),
  ears: require('../../../assets/images/face-capture-guide/03-ears-clear.png'),
  expression: require('../../../assets/images/face-capture-guide/05-neutral-expression.png'),
  forehead: require('../../../assets/images/face-capture-guide/02-forehead-clear.png'),
  framing: require('../../../assets/images/face-capture-guide/06-full-chin.png'),
  light: require('../../../assets/images/face-capture-guide/01-even-light.png'),
} as const;

type FaceCaptureTutorialIconKey = keyof typeof faceCaptureTutorialImageSources;
type FaceCaptureTutorialPresentation = 'screen' | 'sheet';

type FaceCaptureTutorialStep = {
  buttonLabel: string | null;
  description: string;
  heading: string;
  iconKey: FaceCaptureTutorialIconKey;
  id: FaceCaptureTutorialIconKey;
  imageAccessibilityLabel: string;
  imageSource: ImageSourcePropType;
  requiresPrivacyAgreement: false;
  stepLabel: string;
  tip: string;
};

export const FACE_CAPTURE_TUTORIAL_IMAGE_ASPECT_RATIO = 448 / 362;
const FACE_CAPTURE_TUTORIAL_IMAGE_FILL_SCALE = 1;
const FACE_CAPTURE_TUTORIAL_PAGE_INDICATOR_THRESHOLD = 0.38;
export const FACE_CAPTURE_TUTORIAL_ACCESSIBILITY_LABEL = '사진 촬영 가이드';

const faceCaptureTutorialIconNames = {
  accessory: 'glasses',
  ears: 'scan-face',
  expression: 'scan-face',
  forehead: 'scan-face',
  framing: 'camera',
  light: 'wand-sparkles',
} as const satisfies Record<FaceCaptureTutorialIconKey, string>;

const faceCaptureTutorialTips = {
  accessory: '안경·모자·큰 귀걸이는 빼 주세요.',
  ears: '양쪽 귀와 얼굴 옆선이 모두 보여야 해요.',
  expression: '입을 다물고 입술에 힘을 빼 주세요.',
  forehead: '이마와 헤어라인이 모두 보여야 해요.',
  framing: '턱끝이 잘리지 않았는지 확인해 주세요.',
  light: '큰 그림자와 색 번짐이 없는지 확인해 주세요.',
} as const satisfies Record<FaceCaptureTutorialIconKey, string>;

const faceCaptureTutorialSteps: readonly FaceCaptureTutorialStep[] =
  FACE_ANALYSIS_CAPTURE_CHECKLIST.map((item, index) => ({
    buttonLabel:
      index === FACE_ANALYSIS_CAPTURE_CHECKLIST.length - 1 ? '촬영하기' : null,
    description: item.description,
    heading: item.title,
    iconKey: item.id,
    id: item.id,
    imageAccessibilityLabel: item.imageAccessibilityLabel,
    imageSource: faceCaptureTutorialImageSources[item.id],
    requiresPrivacyAgreement: false,
    stepLabel: `${index + 1}/${FACE_ANALYSIS_CAPTURE_CHECKLIST.length}`,
    tip: faceCaptureTutorialTips[item.id],
  }));

const faceCaptureTutorialComparisonBadges = {
  correct: {
    color: colors.guideReady,
    icon: 'check',
    placement: 'right-panel-bottom-right',
  },
  incorrect: {
    color: colors.danger,
    icon: 'x',
    placement: 'left-panel-bottom-right',
  },
  source: 'ui-overlay',
} as const;

const faceCaptureTutorialNavigationMode = {
  showsStepAdvanceButton: false,
  stepAdvance: 'swipe',
} as const;

const faceCaptureTutorialVisualPresentation = {
  finalActionWidth: 'compact',
  finalPrivacyPlacement: 'none',
  headerComponent: 'AppHeader',
  headerDismissControl: 'close-to-home',
  imageFillMode: 'fit-image',
  imageFillScale: FACE_CAPTURE_TUTORIAL_IMAGE_FILL_SCALE,
  showsImageChip: false,
  showsPageNumberChip: false,
  sheetDismissControl: 'close-button',
  sheetPresentation: 'bottom-modal-sheet',
  swipeNavigationPlacement: 'fixed-footer-pagination',
  usesImageScrim: false,
} as const;

type FaceCaptureTutorialScreenProps = {
  closeAccessibilityLabel?: string;
  onBackToIntro?: () => void;
  onCloseToHome?: () => void;
  onStartCapture?: () => void;
  presentation?: FaceCaptureTutorialPresentation;
};

type FaceCaptureTutorialSheetProps = {
  isVisible: boolean;
  onDismiss: () => void;
  onStartCapture?: () => void;
};

export function getFaceCaptureTutorialSteps() {
  return faceCaptureTutorialSteps;
}

export function getFaceCaptureTutorialNavigationMode() {
  return faceCaptureTutorialNavigationMode;
}

export function getFaceCaptureTutorialIconNames() {
  return faceCaptureTutorialIconNames;
}

export function getFaceCaptureTutorialComparisonBadges() {
  return faceCaptureTutorialComparisonBadges;
}

export function getFaceCaptureTutorialVisualPresentation() {
  return faceCaptureTutorialVisualPresentation;
}

export function FaceCaptureTutorialSheet({
  isVisible,
  onDismiss,
  onStartCapture,
}: FaceCaptureTutorialSheetProps) {
  const [isSheetMounted, setIsSheetMounted] = useState(isVisible);
  const transitionValue = useRef(new Animated.Value(isVisible ? 1 : 0)).current;
  const {height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = Math.round(height * (height < 760 ? 0.92 : 0.88));
  const sheetHiddenOffset = sheetHeight + Math.max(insets.bottom, spacing.xxl);
  const backdropOpacity = transitionValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const sheetTranslateY = transitionValue.interpolate({
    inputRange: [0, 1],
    outputRange: [sheetHiddenOffset, 0],
  });

  useEffect(() => {
    if (isVisible) {
      setIsSheetMounted(true);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isSheetMounted) {
      return;
    }

    transitionValue.stopAnimation();
    Animated.timing(transitionValue, {
      duration: isVisible ? 240 : 180,
      easing: isVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      toValue: isVisible ? 1 : 0,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (finished && !isVisible) {
        setIsSheetMounted(false);
      }
    });
  }, [isSheetMounted, isVisible, transitionValue]);

  if (!isSheetMounted) {
    return null;
  }

  return (
    <Modal
      animationType="none"
      onRequestClose={onDismiss}
      transparent
      visible={isSheetMounted}>
      <YStack style={styles.sheetRoot}>
        <Animated.View style={[styles.sheetBackdropHost, {opacity: backdropOpacity}]}>
          <Pressable
            accessibilityLabel="사진 촬영 가이드 닫기"
            accessibilityRole="button"
            onPress={onDismiss}
            style={styles.sheetBackdrop}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheetPanel,
            {
              height: sheetHeight,
              paddingBottom: Math.max(insets.bottom, spacing.sm),
              transform: [{translateY: sheetTranslateY}],
            },
          ]}>
          <View style={styles.sheetHandle} />
          <FaceCaptureTutorialScreen
            closeAccessibilityLabel="사진 촬영 가이드 닫기"
            onBackToIntro={onDismiss}
            onCloseToHome={onDismiss}
            onStartCapture={onStartCapture}
            presentation="sheet"
          />
        </Animated.View>
      </YStack>
    </Modal>
  );
}

export function FaceCaptureTutorialScreen({
  closeAccessibilityLabel,
  onBackToIntro,
  onCloseToHome,
  onStartCapture,
  presentation = 'screen',
}: FaceCaptureTutorialScreenProps) {
  const guideScrollViewRef = useRef<ScrollView>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const {height, width} = useWindowDimensions();
  const currentStep = faceCaptureTutorialSteps[currentStepIndex] ?? faceCaptureTutorialSteps[0];
  const isSheetPresentation = presentation === 'sheet';
  const isCompactHeight = height < 760;
  const maxGuideImageWidth = Math.min(width - spacing.xl * 2, isSheetPresentation ? 344 : 362);
  const contentGap = isCompactHeight ? spacing.md : spacing.lg;
  const safeAreaEdges: Edge[] = isSheetPresentation
    ? []
    : ['top', 'right', 'bottom', 'left'];
  const closeButtonAccessibilityLabel =
    closeAccessibilityLabel ?? (isSheetPresentation ? '사진 촬영 가이드 닫기' : '홈으로 가기');

  const getGuideImageSize = (step: FaceCaptureTutorialStep) => {
    const maxGuideImageHeight = isCompactHeight ? 216 : 292;
    const imageWidth = Math.min(
      maxGuideImageWidth,
      maxGuideImageHeight * FACE_CAPTURE_TUTORIAL_IMAGE_ASPECT_RATIO,
    );

    return {
      height: imageWidth / FACE_CAPTURE_TUTORIAL_IMAGE_ASPECT_RATIO,
      width: imageWidth,
    };
  };

  const handleStartCapturePress = () => {
    onStartCapture?.();
  };

  const clampStepIndex = (stepIndex: number) =>
    Math.max(0, Math.min(stepIndex, faceCaptureTutorialSteps.length - 1));

  const updateCurrentStepIndex = (nextStepIndex: number) => {
    const clampedStepIndex = clampStepIndex(nextStepIndex);

    setCurrentStepIndex((prevStepIndex) =>
      prevStepIndex === clampedStepIndex ? prevStepIndex : clampedStepIndex,
    );
  };

  const getLiveStepIndexFromScrollOffset = (offsetX: number) => {
    const scrollProgress = offsetX / Math.max(width, 1);
    const baseStepIndex = Math.floor(scrollProgress);
    const pageProgress = scrollProgress - baseStepIndex;
    const nextStepIndex =
      pageProgress >= FACE_CAPTURE_TUTORIAL_PAGE_INDICATOR_THRESHOLD
        ? baseStepIndex + 1
        : baseStepIndex;

    return clampStepIndex(nextStepIndex);
  };

  const syncStepIndexFromScrollOffset = (offsetX: number) => {
    updateCurrentStepIndex(getLiveStepIndexFromScrollOffset(offsetX));
  };

  const settleStepIndexFromScrollOffset = (offsetX: number) => {
    updateCurrentStepIndex(Math.round(offsetX / Math.max(width, 1)));
  };

  const handleGuideScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    syncStepIndexFromScrollOffset(event.nativeEvent.contentOffset.x);
  };

  const handleGuideScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    settleStepIndexFromScrollOffset(event.nativeEvent.contentOffset.x);
  };

  const handleClosePress = () => {
    onCloseToHome?.();
  };

  const handleBackPress = () => {
    if (currentStepIndex === 0) {
      onBackToIntro?.();
      return;
    }

    const previousStepIndex = Math.max(currentStepIndex - 1, 0);

    guideScrollViewRef.current?.scrollTo({
      animated: true,
      x: previousStepIndex * width,
      y: 0,
    });
    updateCurrentStepIndex(previousStepIndex);
  };

  const isFinalStep = currentStepIndex === faceCaptureTutorialSteps.length - 1;
  const actionButtonLabel = currentStep.buttonLabel ?? '촬영하기';

  return (
    <SafeAreaView edges={safeAreaEdges} style={styles.safeArea}>
      <YStack style={[styles.screen, isSheetPresentation ? styles.sheetScreen : null]}>
        <AppHeader
          onBack={handleBackPress}
          rightSlot={
            <IconButton
              accessibilityLabel={closeButtonAccessibilityLabel}
              onPress={handleClosePress}>
              <XIcon color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
            </IconButton>
          }
          title="사진 촬영 가이드"
          topInset={0}
        />

        <YStack style={[styles.content, isSheetPresentation ? styles.sheetContent : null]}>
          <ScrollView
            ref={guideScrollViewRef}
            accessibilityLabel={FACE_CAPTURE_TUTORIAL_ACCESSIBILITY_LABEL}
            decelerationRate="fast"
            horizontal
            onMomentumScrollEnd={handleGuideScrollEnd}
            onScroll={handleGuideScroll}
            onScrollEndDrag={handleGuideScrollEnd}
            pagingEnabled
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={styles.guideCarousel}>
            {faceCaptureTutorialSteps.map((step) => (
              <YStack
                key={step.id}
                style={[
                  styles.guidePage,
                  isSheetPresentation ? styles.sheetGuidePage : null,
                  {gap: contentGap, width},
                ]}>
                <View
                  style={[
                    styles.imageFrame,
                    getGuideImageSize(step),
                  ]}>
                  <Image
                    accessible
                    accessibilityLabel={step.imageAccessibilityLabel}
                    accessibilityIgnoresInvertColors
                    resizeMode="contain"
                    source={step.imageSource}
                    style={styles.guideImage}
                  />
                  <View
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                    pointerEvents="none"
                    style={styles.comparisonBadgeOverlay}>
                    {(['incorrect', 'correct'] as const).map(kind => {
                      const badge = faceCaptureTutorialComparisonBadges[kind];

                      return (
                        <View key={kind} style={styles.comparisonBadgeHalf}>
                          <View
                            style={[
                              styles.comparisonBadge,
                              {backgroundColor: badge.color},
                            ]}>
                            {kind === 'incorrect' ? (
                              <XIcon color={colors.white} size={iconSize.xs} strokeWidth={2.6} />
                            ) : (
                              <Check color={colors.white} size={iconSize.xs} strokeWidth={2.8} />
                            )}
                          </View>
                        </View>
                      );
                    })}

                  </View>
                </View>
                <YStack style={styles.guidePanel}>
                  <XStack style={styles.guideHeadingRow}>
                    <View style={styles.guideIconCircle}>
                      {renderGuideIcon(step.iconKey, colors.textPrimary, iconSize.md)}
                    </View>
                    <Text style={styles.heading}>{step.heading}</Text>
                  </XStack>
                  <Text style={styles.description}>{step.description}</Text>
                  <XStack style={styles.tipRow}>
                    <CheckCircle2 color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
                    <Text style={styles.tipText}>{step.tip}</Text>
                  </XStack>
                </YStack>
              </YStack>
            ))}
          </ScrollView>

          <View style={styles.footerSpacer} />

          <YStack
            style={[
              styles.swipeNavigationArea,
              styles.swipeNavigationAreaWithAction,
            ]}>
            <PaginationDots
              activeIndex={currentStepIndex}
              count={faceCaptureTutorialSteps.length}
            />
          </YStack>

          {/* 촬영 전 처리 안내 — 개인정보처리방침 2항(사전 안내) 이행 문구. */}
          <View style={styles.privacyNoticePlaceholder}>
            <Text style={styles.privacyNoticeText}>
              촬영한 사진은 AI 분석과 보고서 생성에만 사용되며, 보고서 삭제 또는
              회원 탈퇴 시 관련 데이터의 삭제 절차가 시작됩니다.
            </Text>
          </View>

          {isFinalStep ? (
            <Button
              accessibilityLabel={actionButtonLabel}
              accessibilityRole="button"
              onPress={handleStartCapturePress}
              pressStyle={{opacity: 0.78}}
              style={styles.nextButton}
              unstyled>
              <Text style={styles.nextButtonText}>{actionButtonLabel}</Text>
            </Button>
          ) : (
            <View style={styles.nextButtonPlaceholder} />
          )}
        </YStack>
      </YStack>
    </SafeAreaView>
  );
}

function renderGuideIcon(
  iconKey: FaceCaptureTutorialIconKey,
  color: string,
  size: number,
) {
  const iconName = faceCaptureTutorialIconNames[iconKey];

  if (iconName === 'scan-face') {
    return <ScanFace color={color} size={size} strokeWidth={1.9} />;
  }

  if (iconName === 'camera') {
    return <Camera color={color} size={size} strokeWidth={1.9} />;
  }

  if (iconName === 'wand-sparkles') {
    return <WandSparkles color={color} size={size} strokeWidth={1.9} />;
  }

  return <Glasses color={color} size={size} strokeWidth={1.9} />;
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    flex: 1,
    paddingBottom: spacing.xl,
  },
  comparisonBadge: {
    alignItems: 'center',
    borderColor: colors.white,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 32,
    justifyContent: 'center',
    shadowColor: colors.black,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.18,
    shadowRadius: 5,
    width: 32,
  },
  comparisonBadgeHalf: {
    alignItems: 'flex-end',
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.sm,
  },
  comparisonBadgeOverlay: {
    bottom: 0,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  footerSpacer: {
    flex: 1,
  },
  guideHeadingRow: {
    alignItems: 'center',
    gap: spacing.md,
  },
  guideIconCircle: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: iconSize.xl + spacing.md,
    justifyContent: 'center',
    width: iconSize.xl + spacing.md,
  },
  guideImage: {
    height: '100%',
    width: '100%',
  },
  guideCarousel: {
    flexGrow: 0,
    width: '100%',
  },
  guidePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: 0.06,
    shadowRadius: shadows.soft.shadowRadius,
    width: '100%',
  },
  guidePage: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  heading: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.lg,
  },
  imageFrame: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: shadows.soft.shadowOffset,
    shadowOpacity: shadows.soft.shadowOpacity,
    shadowRadius: shadows.soft.shadowRadius,
  },
  nextButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.blackSurface,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    height: iconSize.xl + spacing.xxl,
    justifyContent: 'center',
    maxWidth: 280,
    minWidth: 220,
    paddingHorizontal: spacing.xl,
    width: '72%',
  },
  nextButtonPlaceholder: {
    alignSelf: 'center',
    height: iconSize.xl + spacing.xxl,
    maxWidth: 280,
    minWidth: 220,
    width: '72%',
  },
  nextButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  privacyNoticePlaceholder: {
    alignSelf: 'center',
    marginBottom: spacing.md,
    maxWidth: 362,
    minHeight: 0,
    width: '100%',
  },
  privacyNoticeText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sheetBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetBackdropHost: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetContent: {
    paddingBottom: spacing.lg,
  },
  sheetGuidePage: {
    paddingTop: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    marginTop: spacing.sm,
    width: 42,
  },
  sheetPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -10},
    shadowOpacity: 0.16,
    shadowRadius: 28,
  },
  sheetRoot: {
    bottom: 0,
    justifyContent: 'flex-end',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheetScreen: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  swipeNavigationArea: {
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  swipeNavigationAreaWithAction: {
    marginBottom: spacing.lg,
  },
  tipRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tipText: {
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
});
