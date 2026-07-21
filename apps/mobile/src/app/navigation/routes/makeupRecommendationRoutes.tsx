import React from 'react';

import {
  MakeupRecommendationScreen,
  type MakeupRecommendationScreenHandle,
} from '../../../features/makeup-recommendation';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {getLookMakeupColors, getMakeupRecommendationARFilterRouteParams} from './makeupRecommendationRouteActions';
import type {RootScreenProps} from './routeUtils';

export function MakeupRecommendationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupRecommendation'>) {
  const {selectedFaceAnalysisReport, selectedFaceCapture} = useNavigationFlowState();
  const screenRef = React.useRef<MakeupRecommendationScreenHandle>(null);
  const [isResultsVisible, setIsResultsVisible] = React.useState(false);
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
      headerHidden={isResultsVisible}
      onBack={handleBack}
      routeName="MakeupRecommendation"
    >
      <MakeupRecommendationScreen
        analysisReportId={analysisReportId}
        faceImageUri={canUseSelectedFlowData ? selectedFaceCapture?.imageUri : undefined}
        initialView={route.params?.view}
        onBack={handleBack}
        onApplyAR={look => {
          // 색 우선순위: 이 룩이 직접 고른 areaGuides 색 > 분석 기본색(퍼스널 컬러
          // 근거, 선택 플로우 유효 시) > 정적 프리셋. 모양·질감은 프리셋 유지.
          const analysisColors = canUseSelectedFlowData
            ? selectedFaceAnalysisReport?.makeupColors
            : undefined;
          const lookColors = getLookMakeupColors(look);
          const mergedColors =
            analysisColors || lookColors
              ? {...analysisColors, ...lookColors}
              : undefined;
          navigation.navigate(
            'ARFilter',
            getMakeupRecommendationARFilterRouteParams(look.arFilterId, mergedColors),
          );
        }}
        onResultsVisibilityChange={setIsResultsVisible}
        onOpenRecommendedProducts={sourceAnalysisReportId =>
          navigation.navigate('ProductRecommendation', {
            initialSection: 'personalized',
            ...(sourceAnalysisReportId ? {reportId: sourceAnalysisReportId} : {}),
          })
        }
        onStartFaceAnalysis={() => navigation.navigate('FaceAnalysisIntro')}
        personalColor={canUseSelectedFlowData ? selectedFaceAnalysisReport?.personalColor : undefined}
        ref={screenRef}
        reportId={route.params?.reportId}
      />
    </DetailRouteChrome>
  );
}
