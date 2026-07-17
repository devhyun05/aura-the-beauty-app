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
  route,
}: RootScreenProps<'MakeupRecommendation'>) {
  const {selectedFaceAnalysisReport, selectedFaceCapture} = useNavigationFlowState();
  const screenRef = React.useRef<MakeupRecommendationScreenHandle>(null);
  const analysisReportId = route.params?.analysisReportId
    ?? (route.params?.reportId ? undefined : selectedFaceAnalysisReport?.id);
  const canUseSelectedFlowData = Boolean(selectedFaceAnalysisReport)
    && !route.params?.reportId
    && (!route.params?.analysisReportId
      || route.params.analysisReportId === selectedFaceAnalysisReport?.id);
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
        analysisReportId={analysisReportId}
        faceImageUri={canUseSelectedFlowData ? selectedFaceCapture?.imageUri : undefined}
        initialView={route.params?.view}
        onApplyAR={look =>
          navigation.navigate(
            'ARFilter',
            getMakeupRecommendationARFilterRouteParams(look.arFilterId),
          )
        }
        onStartFaceAnalysis={() => navigation.navigate('FaceAnalysisIntro')}
        personalColor={canUseSelectedFlowData ? selectedFaceAnalysisReport?.personalColor : undefined}
        ref={screenRef}
        reportId={route.params?.reportId}
      />
    </DetailRouteChrome>
  );
}
