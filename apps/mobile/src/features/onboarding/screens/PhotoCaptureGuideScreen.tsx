import {useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, Image, Text, View, XStack, YStack} from 'tamagui';

const expressionGuideImageSource = require('../../../assets/images/photo-capture-expression-guide.png');
const hairGuideImageSource = require('../../../assets/images/photo-capture-hair-guide.png');
const accessoryGuideImageSource = require('../../../assets/images/photo-capture-accessory-guide.png');
const framingGuideImageSource = require('../../../assets/images/photo-capture-framing-guide.png');
const expressionGuideImageRatio = 362 / 448;
const captureGuideSteps = [
  {
    buttonLabel: '다음',
    description: '웃거나 찡그리는 표정은 진단 정확도를 낮출 수 있어요',
    hasPrivacyNotice: false,
    heading: '표정을 짓지 마세요',
    imageSource: expressionGuideImageSource,
    stepLabel: '1/4 step',
  },
  {
    buttonLabel: '다음',
    description: '앞머리와 귀가 잘 보이도록 준비해 주세요',
    hasPrivacyNotice: false,
    heading: '머리를 뒤로 넘겨 주세요',
    imageSource: hairGuideImageSource,
    stepLabel: '2/4 step',
  },
  {
    buttonLabel: '다음',
    description: '안경, 귀걸이, 피어싱, 모자 등\n액세서리를 착용할 경우 진단이 어려워요',
    hasPrivacyNotice: false,
    heading: '액세서리는 빼주세요!',
    imageSource: accessoryGuideImageSource,
    stepLabel: '3/4 step',
  },
  {
    buttonLabel: '촬영하기',
    description: '어둡거나 역광인 환경에서는 결과가 정확하지 않을 수 있어요',
    hasPrivacyNotice: true,
    heading: '얼굴과 턱선이 화면 중앙에 오도록\n촬영해주세요',
    imageSource: framingGuideImageSource,
    stepLabel: '4/4 step',
  },
] as const;

type PhotoCaptureGuideScreenProps = {
  onBackToIntro?: () => void;
  onStartCapture?: () => void;
};

export function PhotoCaptureGuideScreen({
  onBackToIntro,
  onStartCapture,
}: PhotoCaptureGuideScreenProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hasAgreedToPrivacy, setHasAgreedToPrivacy] = useState(false);
  const {height, width} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const currentStep = captureGuideSteps[currentStepIndex];
  const isCompactHeight = height < 760;
  const contentHeight = height - insets.top - insets.bottom;
  const headerTopMargin = isCompactHeight ? 18 : 26;
  const dividerTopMargin = isCompactHeight ? 10 : 14;
  const stepTopMargin = isCompactHeight ? 18 : 24;
  const headingTopMargin = isCompactHeight ? 16 : 22;
  const descriptionTopMargin = isCompactHeight ? 8 : 12;
  const imageTopMargin = isCompactHeight ? 18 : 24;
  const paginationTopMargin = isCompactHeight ? 12 : 16;
  const privacyTopMargin = isCompactHeight ? 12 : 16;
  const privacyHeight = isCompactHeight ? 42 : 46;
  const footerMinHeight = isCompactHeight ? 8 : 14;
  const nextButtonBottomMargin = isCompactHeight ? 16 : 22;
  const privacyReservedHeight = currentStep.hasPrivacyNotice
    ? privacyTopMargin + privacyHeight
    : 0;
  const headingLineCount = currentStep.heading.includes('\n') ? 2 : 1;
  const descriptionLineCount = currentStep.description.includes('\n') ? 2 : 1;
  const reservedHeight =
    headerTopMargin +
    styles.title.lineHeight +
    dividerTopMargin +
    10 +
    stepTopMargin +
    styles.stepText.lineHeight +
    headingTopMargin +
    styles.heading.lineHeight * headingLineCount +
    descriptionTopMargin +
    styles.description.lineHeight * descriptionLineCount +
    imageTopMargin +
    privacyReservedHeight +
    paginationTopMargin +
    10 +
    footerMinHeight +
    styles.nextButtonPanel.height +
    nextButtonBottomMargin;
  const availableImageHeight = Math.max(210, contentHeight - reservedHeight);
  const guideImageWidth = Math.min(width - 28, 448, availableImageHeight / expressionGuideImageRatio);
  const guideImageHeight = guideImageWidth * expressionGuideImageRatio;
  const handleNextPress = () => {
    if (currentStep.hasPrivacyNotice && !hasAgreedToPrivacy) {
      return;
    }

    if (currentStepIndex === captureGuideSteps.length - 1) {
      onStartCapture?.();
      return;
    }

    setCurrentStepIndex((prevIndex) =>
      Math.min(prevIndex + 1, captureGuideSteps.length - 1),
    );
  };
  const handlePrivacyPress = () => {
    setHasAgreedToPrivacy((prevValue) => !prevValue);
  };
  const handleBackPress = () => {
    if (currentStepIndex === 0) {
      onBackToIntro?.();
      return;
    }

    setCurrentStepIndex((prevIndex) => Math.max(prevIndex - 1, 0));
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <YStack style={styles.screen}>
        <Button
          accessibilityLabel="이전으로 돌아가기"
          accessibilityRole="button"
          onPress={handleBackPress}
          pressStyle={{opacity: 0.62}}
          style={styles.backButton}
          unstyled
        >
          <View style={styles.backIcon} />
        </Button>

        <YStack style={[styles.headerArea, {marginTop: headerTopMargin}]}>
          <Text style={styles.title}>사진 촬영</Text>
          <XStack style={[styles.divider, {marginTop: dividerTopMargin}]}>
            <View style={styles.dividerLine} />
            <View style={styles.dividerDiamond} />
            <View style={styles.dividerLine} />
          </XStack>
          <View style={[styles.stepArea, {marginTop: stepTopMargin}]}>
            <Text style={styles.stepText}>{currentStep.stepLabel}</Text>
          </View>
          <Text style={[styles.heading, {marginTop: headingTopMargin}]}>
            {currentStep.heading}
          </Text>
          <Text style={[styles.description, {marginTop: descriptionTopMargin}]}>
            {currentStep.description}
          </Text>
        </YStack>

        <View style={[styles.imagePanel, {marginTop: imageTopMargin}]}>
          <Image
            accessibilityIgnoresInvertColors
            height={guideImageHeight}
            resizeMode="cover"
            src={currentStep.imageSource}
            width={guideImageWidth}
          />
        </View>

        {currentStep.hasPrivacyNotice ? (
          <Button
            accessibilityLabel="개인정보 수집 및 이용 동의"
            accessibilityRole="checkbox"
            accessibilityState={{checked: hasAgreedToPrivacy}}
            onPress={handlePrivacyPress}
            pressStyle={{opacity: 0.72}}
            style={[
              styles.privacyNotice,
              hasAgreedToPrivacy ? styles.privacyNoticeSelected : null,
              {height: privacyHeight, marginTop: privacyTopMargin},
            ]}
            unstyled
          >
            <View style={styles.privacyIconMark}>
              {hasAgreedToPrivacy ? (
                <View style={styles.privacyIconCheck} />
              ) : (
                <View style={styles.privacyIconDot} />
              )}
            </View>
            <Text style={styles.privacyText}>개인정보 수집 및 이용</Text>
            <Text style={styles.privacyLink}> (자세히 보기)</Text>
            <View style={styles.privacySpacer} />
            <View style={styles.privacyChevronIcon} />
          </Button>
        ) : null}

        <XStack style={[styles.pagination, {marginTop: paginationTopMargin}]}>
          {captureGuideSteps.map((item, index) => (
            <View
              key={item.stepLabel}
              style={[styles.dot, index === currentStepIndex ? styles.activeDot : null]}
            />
          ))}
        </XStack>

        <View style={[styles.footerSpacer, {minHeight: footerMinHeight}]} />

        <View style={[styles.nextButtonPanel, {marginBottom: nextButtonBottomMargin}]}>
          <View style={styles.nextButtonHighlight} />
          <Button
            accessibilityLabel={currentStep.buttonLabel}
            accessibilityRole="button"
            disabled={currentStep.hasPrivacyNotice && !hasAgreedToPrivacy}
            disabledStyle={{opacity: 1}}
            onPress={handleNextPress}
            pressStyle={{opacity: 0.72}}
            style={[
              styles.nextButton,
              currentStep.hasPrivacyNotice && !hasAgreedToPrivacy
                ? styles.nextButtonDisabled
                : null,
            ]}
            unstyled
          >
            <Text
              style={[
                styles.nextButtonText,
                currentStep.hasPrivacyNotice && !hasAgreedToPrivacy
                  ? styles.nextButtonTextDisabled
                  : null,
              ]}
            >
              {currentStep.buttonLabel}
            </Text>
          </Button>
        </View>
      </YStack>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    backgroundColor: '#7A5734',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderColor: 'rgba(177, 139, 102, 0.22)',
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    left: 14,
    paddingHorizontal: 0,
    paddingVertical: 0,
    position: 'absolute',
    top: 10,
    width: 42,
    zIndex: 2,
  },
  backIcon: {
    borderBottomColor: '#7A5734',
    borderBottomWidth: 2,
    borderLeftColor: '#7A5734',
    borderLeftWidth: 2,
    height: 12,
    marginLeft: 4,
    transform: [{rotate: '45deg'}],
    width: 12,
  },
  description: {
    color: '#5E514A',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 22,
    textAlign: 'center',
  },
  divider: {
    alignItems: 'center',
    columnGap: 8,
    justifyContent: 'center',
    marginTop: 16,
  },
  dividerDiamond: {
    backgroundColor: '#D5B99F',
    height: 10,
    transform: [{rotate: '45deg'}],
    width: 10,
  },
  dividerLine: {
    backgroundColor: '#E8D8C9',
    height: 1,
    width: 58,
  },
  dot: {
    backgroundColor: '#E9DED5',
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  footerSpacer: {
    flex: 1,
  },
  headerArea: {
    alignItems: 'center',
    width: '100%',
  },
  heading: {
    color: '#3B261D',
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 36,
    textAlign: 'center',
  },
  imagePanel: {
    alignItems: 'center',
    backgroundColor: '#F9F0EA',
    borderColor: '#E8D8C9',
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#7A5734',
    shadowOffset: {
      height: 8,
      width: 0,
    },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  nextButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: '100%',
  },
  nextButtonDisabled: {
    opacity: 0.46,
  },
  nextButtonHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
    borderBottomColor: 'rgba(255, 255, 255, 0.68)',
    borderBottomWidth: 1,
    height: '52%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  nextButtonPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(238, 222, 205, 0.74)',
    borderColor: 'rgba(177, 139, 102, 0.32)',
    borderRadius: 18,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#7A5734',
    shadowOffset: {
      height: 10,
      width: 0,
    },
    shadowOpacity: 0.13,
    shadowRadius: 20,
    width: '84%',
  },
  nextButtonText: {
    color: '#7A5734',
    fontSize: 21,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 28,
    textAlign: 'center',
  },
  nextButtonTextDisabled: {
    color: '#A89382',
  },
  pagination: {
    alignItems: 'center',
    columnGap: 14,
    justifyContent: 'center',
  },
  privacyChevronIcon: {
    borderBottomColor: '#9A7353',
    borderBottomWidth: 1.4,
    borderRightColor: '#9A7353',
    borderRightWidth: 1.4,
    height: 10,
    transform: [{rotate: '-45deg'}],
    width: 10,
  },
  privacyIconDot: {
    backgroundColor: '#8F6D4D',
    borderRadius: 999,
    height: 4,
    width: 4,
  },
  privacyIconCheck: {
    borderBottomColor: '#8F6D4D',
    borderBottomWidth: 1.7,
    borderRightColor: '#8F6D4D',
    borderRightWidth: 1.7,
    height: 9,
    transform: [{rotate: '0deg'}],
    width: 5,
  },
  privacyIconMark: {
    alignItems: 'center',
    borderColor: '#8F6D4D',
    borderRadius: 7,
    borderWidth: 1.2,
    height: 18,
    justifyContent: 'center',
    transform: [{rotate: '45deg'}],
    width: 18,
  },
  privacyLink: {
    color: '#7C7068',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 20,
  },
  privacyNotice: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.54)',
    borderColor: '#EADDD2',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 18,
    width: '88%',
  },
  privacyNoticeSelected: {
    backgroundColor: 'rgba(247, 231, 215, 0.72)',
    borderColor: '#CFAE91',
  },
  privacySpacer: {
    flex: 1,
  },
  privacyText: {
    color: '#4D413A',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
    marginLeft: 8,
  },
  safeArea: {
    backgroundColor: '#FFFBF8',
    flex: 1,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: '#FFFBF8',
    flex: 1,
    paddingHorizontal: 10,
  },
  stepArea: {
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    width: '100%',
  },
  stepText: {
    color: '#7D7068',
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 24,
  },
  title: {
    color: '#3B261D',
    fontSize: 38,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 48,
    textAlign: 'center',
  },
});
