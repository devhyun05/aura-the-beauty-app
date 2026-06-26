import {useRef, useState} from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Glasses,
  ScanFace,
  WandSparkles,
  X as XIcon,
} from 'lucide-react-native';
import {Button, Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {PaginationDots} from '../../../shared/ui';

const expressionGuideImageSource = require('../../../assets/images/photo-capture-expression-guide.png');
const hairGuideImageSource = require('../../../assets/images/photo-capture-hair-guide.png');
const accessoryGuideImageSource = require('../../../assets/images/photo-capture-accessory-guide.png');
const framingGuideImageSource = require('../../../assets/images/photo-capture-framing-guide.png');

type FaceCaptureTutorialIconKey = 'face' | 'hair' | 'accessory' | 'framing';

type FaceCaptureTutorialStep = {
  buttonLabel: string | null;
  description: string;
  heading: string;
  iconKey: FaceCaptureTutorialIconKey;
  imageSource: ImageSourcePropType;
  requiresPrivacyAgreement: boolean;
  stepLabel: string;
  tip: string;
};

export const FACE_CAPTURE_TUTORIAL_IMAGE_ASPECT_RATIO = 448 / 362;
const FACE_CAPTURE_TUTORIAL_IMAGE_FILL_SCALE = 1;
export const FACE_CAPTURE_TUTORIAL_SWIPE_HINT_LABEL = '좌우로 넘겨 주세요.';

const faceCaptureTutorialIconNames = {
  accessory: 'glasses',
  face: 'scan-face',
  framing: 'camera',
  hair: 'wand-sparkles',
} as const satisfies Record<FaceCaptureTutorialIconKey, string>;

const faceCaptureTutorialSteps = [
  {
    buttonLabel: null,
    description: '눈썹과 입가에 힘을 빼고 정면을 바라보면 얼굴 균형을 더 정확히 읽을 수 있어요.',
    heading: '표정은 편안하게 유지해 주세요',
    iconKey: 'face',
    imageSource: expressionGuideImageSource,
    requiresPrivacyAgreement: false,
    stepLabel: '1/4',
    tip: '무표정에 가까운 자연스러운 얼굴이 좋아요.',
  },
  {
    buttonLabel: null,
    description: '이마와 귀 라인이 보이도록 머리를 정리하면 톤과 윤곽 분석이 안정적이에요.',
    heading: '머리는 얼굴 밖으로 넘겨주세요',
    iconKey: 'hair',
    imageSource: hairGuideImageSource,
    requiresPrivacyAgreement: false,
    stepLabel: '2/4',
    tip: '앞머리는 잠깐 고정하고 촬영해 주세요.',
  },
  {
    buttonLabel: null,
    description: '안경, 모자, 큰 귀걸이처럼 얼굴을 가리는 요소는 분석 결과를 흐릴 수 있어요.',
    heading: '액세서리는 잠시 빼주세요',
    iconKey: 'accessory',
    imageSource: accessoryGuideImageSource,
    requiresPrivacyAgreement: false,
    stepLabel: '3/4',
    tip: '렌즈 반사와 그림자도 함께 줄여주세요.',
  },
  {
    buttonLabel: '촬영하기',
    description: '밝은 곳에서 얼굴과 턱선이 화면 중앙에 들어오도록 맞춘 뒤 촬영을 시작해요.',
    heading: '얼굴을 중앙에 맞춰 촬영해 주세요',
    iconKey: 'framing',
    imageSource: framingGuideImageSource,
    requiresPrivacyAgreement: true,
    stepLabel: '4/4',
    tip: '역광보다 정면의 부드러운 조명이 좋아요.',
  },
] as const satisfies readonly FaceCaptureTutorialStep[];

const faceCaptureTutorialNavigationMode = {
  showsStepAdvanceButton: false,
  stepAdvance: 'swipe',
} as const;

const faceCaptureTutorialVisualPresentation = {
  finalActionWidth: 'compact',
  finalPrivacyPlacement: 'below-pagination-above-action',
  headerDismissControl: 'close-to-home',
  imageFillMode: 'fit-image',
  imageFillScale: FACE_CAPTURE_TUTORIAL_IMAGE_FILL_SCALE,
  showsImageChip: false,
  showsPageNumberChip: false,
  swipeNavigationPlacement: 'fixed-above-swipe-hint',
  usesImageScrim: false,
} as const;

type FaceCaptureTutorialScreenProps = {
  onBackToIntro?: () => void;
  onCloseToHome?: () => void;
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

export function getFaceCaptureTutorialVisualPresentation() {
  return faceCaptureTutorialVisualPresentation;
}

export function FaceCaptureTutorialScreen({
  onBackToIntro,
  onCloseToHome,
  onStartCapture,
}: FaceCaptureTutorialScreenProps) {
  const guideScrollViewRef = useRef<ScrollView>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hasAgreedToPrivacy, setHasAgreedToPrivacy] = useState(false);
  const {height, width} = useWindowDimensions();
  const currentStep = faceCaptureTutorialSteps[currentStepIndex] ?? faceCaptureTutorialSteps[0];
  const isCompactHeight = height < 760;
  const maxGuideImageWidth = Math.min(width - spacing.xl * 2, 362);
  const contentGap = isCompactHeight ? spacing.md : spacing.lg;

  const getGuideImageSize = (step: FaceCaptureTutorialStep) => {
    const shouldReduceForPrivacy = isCompactHeight && step.requiresPrivacyAgreement;
    const maxGuideImageHeight = shouldReduceForPrivacy ? 190 : isCompactHeight ? 216 : 292;
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
    if (currentStep.requiresPrivacyAgreement && !hasAgreedToPrivacy) {
      return;
    }

    onStartCapture?.();
  };

  const handleGuideMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextStepIndex = Math.round(event.nativeEvent.contentOffset.x / width);

    setCurrentStepIndex(
      Math.max(0, Math.min(nextStepIndex, faceCaptureTutorialSteps.length - 1)),
    );
  };

  const handlePrivacyPress = () => {
    setHasAgreedToPrivacy((prevValue) => !prevValue);
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
    setCurrentStepIndex(previousStepIndex);
  };

  const isNextDisabled = currentStep.requiresPrivacyAgreement && !hasAgreedToPrivacy;
  const isFinalStep = currentStepIndex === faceCaptureTutorialSteps.length - 1;
  const actionButtonLabel = currentStep.buttonLabel ?? '촬영하기';

  return (
    <SafeAreaView style={styles.safeArea}>
      <YStack style={styles.screen}>
        <XStack style={[styles.header, isCompactHeight ? styles.compactHeader : undefined]}>
          <Button
            accessibilityLabel="이전으로 돌아가기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleBackPress}
            pressStyle={{scale: 0.97}}
            style={styles.headerButton}
            unstyled>
            <ChevronLeft color={colors.textPrimary} size={iconSize.md} strokeWidth={2} />
          </Button>

          <YStack style={styles.headerTitleGroup}>
            <Text numberOfLines={1} style={styles.headerTitle}>
              사진 촬영 가이드
            </Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>
              정확한 추천을 위한 촬영 준비
            </Text>
          </YStack>

          <Button
            accessibilityLabel="홈으로 가기"
            accessibilityRole="button"
            hitSlop={8}
            onPress={handleClosePress}
            pressStyle={{scale: 0.97}}
            style={styles.headerButton}
            unstyled>
            <XIcon color={colors.textPrimary} size={iconSize.md} strokeWidth={2} />
          </Button>
        </XStack>

        <YStack style={styles.content}>
          <ScrollView
            ref={guideScrollViewRef}
            accessibilityLabel={FACE_CAPTURE_TUTORIAL_SWIPE_HINT_LABEL}
            decelerationRate="fast"
            horizontal
            onMomentumScrollEnd={handleGuideMomentumScrollEnd}
            pagingEnabled
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={styles.guideCarousel}>
            {faceCaptureTutorialSteps.map((step) => (
              <YStack key={step.stepLabel} style={[styles.guidePage, {gap: contentGap, width}]}>
                <View
                  style={[
                    styles.imageFrame,
                    getGuideImageSize(step),
                  ]}>
                  <Image
                    accessibilityIgnoresInvertColors
                    resizeMode="contain"
                    source={step.imageSource}
                    style={styles.guideImage}
                  />
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
              isFinalStep ? styles.swipeNavigationAreaWithAction : undefined,
            ]}>
            <PaginationDots
              activeIndex={currentStepIndex}
              count={faceCaptureTutorialSteps.length}
            />
            {isFinalStep ? null : (
              <Text style={styles.swipeHint}>{FACE_CAPTURE_TUTORIAL_SWIPE_HINT_LABEL}</Text>
            )}
          </YStack>

          {isFinalStep ? (
            <Button
              accessibilityLabel="개인정보 수집 및 이용 동의"
              accessibilityRole="checkbox"
              accessibilityState={{checked: hasAgreedToPrivacy}}
              onPress={handlePrivacyPress}
              pressStyle={{opacity: 0.78}}
              style={[
                styles.privacyNotice,
                hasAgreedToPrivacy ? styles.privacyNoticeSelected : undefined,
              ]}
              unstyled>
              {hasAgreedToPrivacy ? (
                <CheckCircle2 color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
              ) : (
                <Circle color={colors.borderStrong} size={iconSize.sm} strokeWidth={2} />
              )}
              <Text style={styles.privacyText}>개인정보 수집 및 이용</Text>
              <Text style={styles.privacyLink}>자세히 보기</Text>
              <ChevronRight color={colors.textSecondary} size={iconSize.xs} strokeWidth={2} />
            </Button>
          ) : null}

          {isFinalStep ? (
            <Button
              accessibilityLabel={actionButtonLabel}
              accessibilityRole="button"
              disabled={isNextDisabled}
              disabledStyle={{opacity: 1}}
              onPress={handleStartCapturePress}
              pressStyle={{opacity: 0.78}}
              style={[styles.nextButton, isNextDisabled ? styles.nextButtonDisabled : undefined]}
              unstyled>
              <Text
                style={[
                  styles.nextButtonText,
                  isNextDisabled ? styles.nextButtonTextDisabled : undefined,
                ]}>
                {actionButtonLabel}
              </Text>
            </Button>
          ) : null}
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
  compactHeader: {
    paddingBottom: spacing.md,
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
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  headerButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: iconSize.xl + spacing.md,
    justifyContent: 'center',
    padding: 0,
    width: iconSize.xl + spacing.md,
  },
  headerSubtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
    textAlign: 'center',
  },
  headerTitleGroup: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    minWidth: 0,
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
    backgroundColor: colors.black,
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
  nextButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  nextButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.md,
  },
  nextButtonTextDisabled: {
    color: colors.textTertiary,
  },
  privacyLink: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    marginLeft: 'auto',
  },
  privacyNotice: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    maxWidth: 362,
    minHeight: iconSize.xl + spacing.lg,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  privacyNoticeSelected: {
    borderColor: colors.textPrimary,
  },
  privacyText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.sm,
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  swipeHint: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
    width: '100%',
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
