import React from 'react';

import {
  MakeupRecommendationScreen,
  type MakeupRecommendationScreenHandle,
} from '../../../features/makeup-recommendation';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {getLookMakeupColors, getMakeupRecommendationStencilRouteParams} from './makeupRecommendationRouteActions';
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
          // areaGuides가 있으면 룩 자체(부위·색·질감·강도)로 AR 레시피를 직접
          // 빌드하고, 없으면 프리셋 폴백. 색 폴백 우선순위: areaGuides 색 >
          // 분석 기본색(퍼스널 컬러 근거, 선택 플로우 유효 시) > 기본 팔레트.
          const analysisColors = canUseSelectedFlowData
            ? selectedFaceAnalysisReport?.makeupColors
            : undefined;
          const lookColors = getLookMakeupColors(look);
          const mergedColors =
            analysisColors || lookColors
              ? {...analysisColors, ...lookColors}
              : undefined;
          const routeParams = getMakeupRecommendationStencilRouteParams(
            look,
            mergedColors,
          );
          if (__DEV__) {
            console.info('[aura:makeup-recommendation] ar-route:prepared', {
              lookId: look.id,
              title: look.title,
              arFilterId: look.arFilterId,
              areaGuideCount: look.areaGuides?.length ?? 0,
              mergedColorKeys: Object.keys(mergedColors ?? {}),
              paramKeys: Object.keys(routeParams.recommendedLook?.params ?? {}),
              eyeshadowLayerCount:
                routeParams.recommendedLook?.eyeshadowLayers?.length ?? 0,
            });
          }
          navigation.navigate(
            'ARFilter',
            routeParams,
          );
        }}
        onResultsVisibilityChange={setIsResultsVisible}
        onOpenRecommendedProducts={(makeupRecommendationReportId, sourceAnalysisReportId) =>
          navigation.navigate('ProductRecommendation', {
            initialSection: 'ar',
            ...(makeupRecommendationReportId ? {makeupRecommendationReportId} : {}),
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
