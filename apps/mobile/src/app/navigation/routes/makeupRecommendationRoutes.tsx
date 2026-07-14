import React from 'react';

import {MakeupRecommendationScreen} from '../../../features/makeup-recommendation';
import {getRecommendedFilterRouteParams} from '../../../features/home';
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
        onApplyAR={look =>
          navigation.navigate('ARFilter', getRecommendedFilterRouteParams(look.arFilterId))
        }
        personalColor={selectedFaceAnalysisReport?.personalColor}
      />
    </DetailRouteChrome>
  );
}
