import React from 'react';

import {FaceAnalysisIntroScreen} from '../../../features/face-analysis/screens/FaceAnalysisIntroScreen';
import {useAiDataConsent} from '../../../features/legal/services/aiDataConsentContext';
import {FaceCaptureTutorialSheet} from '../../../features/onboarding/screens/FaceCaptureTutorialScreen';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {goBackToPreviousOrMainTab, type RootScreenProps} from './routeUtils';

export function FaceAnalysisIntroRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisIntro'>) {
  const [isGuideVisible, setIsGuideVisible] = React.useState(false);
  const {requestAiDataConsent} = useAiDataConsent();

  const openAnalysisGuide = React.useCallback(() => {
    setIsGuideVisible(true);
  }, []);

  const dismissAnalysisGuide = React.useCallback(() => {
    setIsGuideVisible(false);
  }, []);

  const startFaceCapture = React.useCallback(() => {
    setIsGuideVisible(false);
    void requestAiDataConsent().then(accepted => {
      if (accepted) {
        navigation.navigate('FaceCapture');
      }
    });
  }, [navigation, requestAiDataConsent]);

  return (
    <>
      <DetailRouteChrome
        routeName="FaceAnalysisIntro"
        onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}>
        <FaceAnalysisIntroScreen
          onOpenCaptureTips={openAnalysisGuide}
          onStartAnalysis={startFaceCapture}
        />
      </DetailRouteChrome>
      <FaceCaptureTutorialSheet
        isVisible={isGuideVisible}
        onDismiss={dismissAnalysisGuide}
        onStartCapture={startFaceCapture}
      />
    </>
  );
}
