import React from 'react';

import {
  MakeupRecommendationScreen,
  type MakeupRecommendationScreenHandle,
} from '../../../features/makeup-recommendation';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {getMakeupRecommendationARFilterRouteParams} from './makeupRecommendationRouteActions';
import type {RootScreenProps} from './routeUtils';

export function MakeupRecommendationRouteScreen({
  navigation,
}: RootScreenProps<'MakeupRecommendation'>) {
  const {selectedFaceAnalysisReport, selectedFaceCapture} = useNavigationFlowState();
  const screenRef = React.useRef<MakeupRecommendationScreenHandle>(null);
  const handleBack = React.useCallback(() => {
    if (!screenRef.current?.handleBack()) navigation.goBack();
  }, [navigation]);

  React.useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (screenRef.current?.handleBack()) event.preventDefault();
      }),
    [navigation],
  );

  return (
    <DetailRouteChrome
      onBack={handleBack}
      routeName="MakeupRecommendation"
    >
      <MakeupRecommendationScreen
        faceImageUri={selectedFaceCapture?.imageUri}
        onApplyAR={look =>
          navigation.navigate(
            'ARFilter',
            getMakeupRecommendationARFilterRouteParams(look.arFilterId),
          )
        }
        personalColor={selectedFaceAnalysisReport?.personalColor}
        ref={screenRef}
      />
    </DetailRouteChrome>
  );
}
