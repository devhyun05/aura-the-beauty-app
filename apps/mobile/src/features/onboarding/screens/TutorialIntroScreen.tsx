import {useState} from 'react';
import {StyleSheet, useWindowDimensions} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {Button, Image, Text, View, YStack} from 'tamagui';

import {typography} from '../../../shared/theme';
import {AuraLogo} from '../../../shared/ui';
import {PhotoCaptureGuideScreen} from './PhotoCaptureGuideScreen';

type TutorialIntroScreenProps = {
  onStartDiagnosis?: () => void;
  onStartCapture?: () => void;
};

const makeupImageSource = require('../../../assets/images/tutorial-makeup-strokes.png');
const makeupImageRatio = 562 / 416;
const logoLineHeight = typography.logoIntro.lineHeight;

export function TutorialIntroScreen({
  onStartCapture,
  onStartDiagnosis,
}: TutorialIntroScreenProps) {
  const [isPhotoGuideVisible, setIsPhotoGuideVisible] = useState(false);
  const {height, width} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompactHeight = height < 760;
  const contentHeight = height - insets.top - insets.bottom;
  const logoTopMargin = isCompactHeight ? 24 : Math.min(56, height * 0.07);
  const imageTopMargin = isCompactHeight ? 12 : 18;
  const copyTopMargin = isCompactHeight ? 12 : 16;
  const buttonHeight = isCompactHeight ? 58 : 64;
  const bottomPadding = isCompactHeight ? 30 : 38;
  const footerMinHeight = isCompactHeight ? 8 : 12;
  const reservedHeight =
    logoTopMargin +
    logoLineHeight +
    imageTopMargin +
    copyTopMargin +
    94 +
    footerMinHeight +
    buttonHeight +
    bottomPadding;
  const availableImageHeight = Math.max(180, contentHeight - reservedHeight);
  const imageWidth = Math.min(
    width - 88,
    isCompactHeight ? 250 : 280,
    availableImageHeight / makeupImageRatio,
  );
  const handleStartDiagnosis = () => {
    onStartDiagnosis?.();
    setIsPhotoGuideVisible(true);
  };

  if (isPhotoGuideVisible) {
    return (
      <PhotoCaptureGuideScreen
        onBackToIntro={() => setIsPhotoGuideVisible(false)}
        onStartCapture={onStartCapture}
      />
    );
  }

  return (
    <SafeAreaView style={{backgroundColor: '#FFFFFF', flex: 1}}>
      <YStack
        style={[
          styles.screen,
          {
            paddingBottom: bottomPadding,
          },
        ]}
      >
        <AuraLogo variant="intro" style={{marginTop: logoTopMargin}} />

        <View style={{marginTop: imageTopMargin}}>
          <Image
            accessibilityIgnoresInvertColors
            height={imageWidth * makeupImageRatio}
            resizeMode="contain"
            src={makeupImageSource}
            width={imageWidth}
          />
        </View>

        <YStack style={[styles.copyArea, {marginTop: copyTopMargin}]}>
          <Text style={styles.title}>
            AI/AR 기반 맞춤 메이크업 가이드
          </Text>
          <Text style={styles.description}>
            내 얼굴에 맞는 메이크업을 추천하고,{'\n'}
            나만의 스타일로 자연스럽게 완성해보세요.
          </Text>
        </YStack>

        <View style={[styles.footerSpacer, {minHeight: footerMinHeight}]} />

        <View style={[styles.startButtonPanel, {height: buttonHeight}]}>
          <View style={styles.startButtonHighlight} />
          <Button
            accessibilityLabel="진단 시작"
            accessibilityRole="button"
            onPress={handleStartDiagnosis}
            pressStyle={{opacity: 0.72}}
            style={styles.startButton}
            unstyled
          >
            <Text style={styles.startButtonText}>진단 시작</Text>
          </Button>
        </View>
      </YStack>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  copyArea: {
    alignItems: 'center',
    width: '100%',
  },
  description: {
    color: '#242121',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 24,
    marginTop: 14,
    textAlign: 'center',
  },
  footerSpacer: {
    flex: 1,
  },
  screen: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    paddingHorizontal: 22,
  },
  startButtonPanel: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: 'rgba(36, 33, 33, 0.18)',
    borderRadius: 18,
    borderWidth: 1,
    elevation: 5,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: {
      height: 10,
      width: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    width: '100%',
  },
  startButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    height: '100%',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: '100%',
  },
  startButtonHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
    borderBottomColor: 'rgba(255, 255, 255, 0.74)',
    borderBottomWidth: 1,
    height: '48%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  startButtonText: {
    color: '#111111',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 0,
    lineHeight: 28,
    textAlign: 'center',
  },
  title: {
    color: '#000000',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 20,
    textAlign: 'center',
  },
});
