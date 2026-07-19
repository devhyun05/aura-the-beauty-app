import React from 'react';

import {FaceAnalysisIntroScreen} from '../../../features/face-analysis/screens/FaceAnalysisIntroScreen';
import {FaceCaptureTutorialSheet} from '../../../features/onboarding/screens/FaceCaptureTutorialScreen';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function FaceAnalysisIntroRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisIntro'>) {
  const [isGuideVisible, setIsGuideVisible] = React.useState(false);

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
        onBack={() => navigateMainTab(navigation, 'HomeTab')}>
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
