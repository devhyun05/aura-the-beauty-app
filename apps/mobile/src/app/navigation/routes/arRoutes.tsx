import React from 'react';

import {ARFilterScreen} from '../../../features/ar/screens/ARFilterScreen';
import {ARFilterShapeAdjustScreen} from '../../../features/ar/screens/ARFilterShapeAdjustScreen';
import {MakeupFilterEditScreen} from '../../../features/ar/screens/MakeupFilterEditScreen';
import {UnityMakeupCaptureScreen} from '../../../features/ar/screens/UnityMakeupCaptureScreen';
import type {GuideMode} from '../../../shared/types/makeupGuide';
import {useNavigationFlowState} from '../flowState';
import {navigateARBack, navigateMainTab, type RootScreenProps} from './routeUtils';

const DEFAULT_AR_GUIDE_MODE: GuideMode = 'basic';

export function ARFilterRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilter'>) {
  const {setSelectedRecommendedMakeupFilterId} = useNavigationFlowState();
  const initialMakeupFilterId = route.params?.initialMakeupFilterId;
  const initialSource = route.params?.source;
  const initialGuideMode =
    route.params?.initialGuideMode ??
    (initialSource === 'recommendedFilter' ? 'half' : DEFAULT_AR_GUIDE_MODE);

  const handleOpenShapeAdjust = (selectedMakeupFilterId?: string) => {
    if (initialSource === 'recommendedFilter') {
      setSelectedRecommendedMakeupFilterId(
        selectedMakeupFilterId ?? initialMakeupFilterId ?? null,
      );
    }

    navigation.navigate('ARFilterShapeAdjust');
  };

  const handleSave = (selectedMakeupFilterId?: string) => {
    if (initialSource === 'recommendedFilter') {
      setSelectedRecommendedMakeupFilterId(
        selectedMakeupFilterId ?? initialMakeupFilterId ?? null,
      );
    }

    navigation.navigate('MakeupFilterSave');
  };

  return (
    <ARFilterScreen
      fullFaceEditState={route.params?.fullFaceEditState}
      initialGuideMode={initialGuideMode}
      initialMakeupFilterId={initialMakeupFilterId}
      initialSource={initialSource}
      onBack={() => navigateMainTab(navigation, 'HomeTab')}
      onComplete={() => navigateMainTab(navigation, 'HomeTab')}
      onOpenShapeAdjust={handleOpenShapeAdjust}
      onSave={handleSave}
    />
  );
}

export function UnityMakeupCaptureRouteScreen({
  navigation,
}: RootScreenProps<'UnityMakeupCapture'>) {
  return (
    <UnityMakeupCaptureScreen
      onBack={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigateMainTab(navigation, 'HomeTab')
      }
      onComplete={sourceFrameMetadata =>
        navigation.navigate('MakeupFilterEdit', {
          backRoute: 'FaceAnalysisReportDetail',
          mode: 'fullFace',
          sourceFrameMetadata,
        })
      }
    />
  );
}

export function ARFilterShapeAdjustRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterShapeAdjust'>) {
  const {selectedRecommendedMakeupFilterId} = useNavigationFlowState();

  const handleSave = () => {
    if (selectedRecommendedMakeupFilterId) {
      navigation.navigate('ARFilter', {
        initialGuideMode: 'half',
        initialMakeupFilterId: selectedRecommendedMakeupFilterId,
        source: 'recommendedFilter',
      });
      return;
    }

    navigation.navigate('ARFilter');
  };

  return (
    <ARFilterShapeAdjustScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={handleSave}
    />
  );
}

export function MakeupFilterEditRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupFilterEdit'>) {
  return (
    <MakeupFilterEditScreen
      mode={route.params?.mode === 'fullFace' ? 'fullFace' : 'preset'}
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={savedContract =>
        navigation.navigate('ARFilter', {
          fullFaceEditState: savedContract?.editState,
        })
      }
      sourceFrameMetadata={route.params?.sourceFrameMetadata}
    />
  );
}
