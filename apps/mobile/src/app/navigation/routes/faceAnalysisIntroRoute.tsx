import React from 'react';
import {Image} from 'react-native';

import {FaceAnalysisIntroScreen} from '../../../features/face-analysis/screens/FaceAnalysisIntroScreen';
import {FaceCaptureTutorialSheet} from '../../../features/onboarding/screens/FaceCaptureTutorialScreen';
import {appAssetUri} from '../../../shared/config/mediaAssets';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

const FACE_CAPTURE_TUTORIAL_IMAGE_URIS = [
  'images/photo-capture-expression-guide.png',
  'images/photo-capture-hair-guide.png',
  'images/photo-capture-accessory-guide.png',
  'images/photo-capture-framing-guide.png',
].map(appAssetUri);

export function FaceAnalysisIntroRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisIntro'>) {
  const [isGuideVisible, setIsGuideVisible] = React.useState(false);

  React.useEffect(() => {
    // These four images are remote CloudFront assets. Prefetching is deliberately
    // fire-and-forget so the intro button remains interactive on a cold launch.
    FACE_CAPTURE_TUTORIAL_IMAGE_URIS.forEach(uri => {
      void Image.prefetch(uri).catch(() => false);
    });
  }, []);

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
