import React from 'react';

import {FaceAnalysisIntroScreen} from '../../../features/face-analysis/screens/FaceAnalysisIntroScreen';
import {FaceCaptureTutorialSheet} from '../../../features/onboarding/screens/FaceCaptureTutorialScreen';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {goBackToPreviousOrMainTab, type RootScreenProps} from './routeUtils';

export function FaceAnalysisIntroRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisIntro'>) {
  // 홈에서 얼굴 분석 진입 시 촬영 가이드를 바로 보여준다. 닫으면 인트로가
  // 남고, "촬영 가이드 보기"로 언제든 다시 열 수 있다.
  const [isGuideVisible, setIsGuideVisible] = React.useState(true);

  const openAnalysisGuide = React.useCallback(() => {
    setIsGuideVisible(true);
  }, []);

  const dismissAnalysisGuide = React.useCallback(() => {
    setIsGuideVisible(false);
  }, []);

  const startFaceCapture = React.useCallback(() => {
    setIsGuideVisible(false);
    navigation.navigate('FaceCapture');
  }, [navigation]);

  return (
    <>
      <DetailRouteChrome
        routeName="FaceAnalysisIntro"
        onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}>
        <FaceAnalysisIntroScreen onStartAnalysisGuide={openAnalysisGuide} />
      </DetailRouteChrome>
      <FaceCaptureTutorialSheet
        isVisible={isGuideVisible}
        onDismiss={dismissAnalysisGuide}
        onStartCapture={startFaceCapture}
      />
    </>
  );
}
