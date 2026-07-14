import React from 'react';

import {MakeupRecommendationScreen} from '../../../features/makeup-recommendation';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import type {RootScreenProps} from './routeUtils';

export function MakeupRecommendationRouteScreen({
  navigation,
}: RootScreenProps<'MakeupRecommendation'>) {
  const {selectedFaceAnalysisReport} = useNavigationFlowState();

  return (
    <DetailRouteChrome
      onBack={() => navigation.goBack()}
      routeName="MakeupRecommendation"
    >
      <MakeupRecommendationScreen
        onApplyAR={() => navigation.navigate('ARFilter', {source: 'recommendedFilter'})}
        personalColor={selectedFaceAnalysisReport?.personalColor}
      />
    </DetailRouteChrome>
  );
}
