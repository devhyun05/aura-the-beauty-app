import React from 'react';

import {ARFilterScreen} from '../../../features/ar/screens/ARFilterScreen';
import {MakeupFilterEditScreen} from '../../../features/ar/screens/MakeupFilterEditScreen';
import {UnityMakeupCaptureScreen} from '../../../features/ar/screens/UnityMakeupCaptureScreen';
import type {FullFaceMakeupSavedContract} from '../../../features/ar/services/fullFaceMakeupEditService';
import type {GuideMode} from '../../../shared/types/makeupGuide';
import {useNavigationFlowState} from '../flowState';
import {getARFilterDetailEditRouteParams} from './arRouteActions';
import {navigateARBack, navigateMainTab, type RootScreenProps} from './routeUtils';

const DEFAULT_AR_GUIDE_MODE: GuideMode = 'basic';

export function ARFilterRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilter'>) {
  const {selectedFaceCapture, setSelectedRecommendedMakeupFilterId} =
    useNavigationFlowState();
  const initialMakeupFilterId = route.params?.initialMakeupFilterId;
  const initialSource = route.params?.source;
  const initialGuideMode =
    route.params?.initialGuideMode ??
    (initialSource === 'recommendedFilter' ? 'half' : DEFAULT_AR_GUIDE_MODE);

  const rememberSelectedRecommendedFilter = (selectedMakeupFilterId?: string) => {
    if (initialSource === 'recommendedFilter') {
      setSelectedRecommendedMakeupFilterId(
        selectedMakeupFilterId ?? initialMakeupFilterId ?? null,
      );
    }
  };

  const getEditSourceImageUri = (editSourceImageUri?: string) =>
    editSourceImageUri ?? selectedFaceCapture?.imageUri;

  const handleOpenDetailEdit = (
    selectedMakeupFilterId?: string,
    editSourceImageUri?: string,
  ) => {
    rememberSelectedRecommendedFilter(selectedMakeupFilterId);

    navigation.navigate(
      'MakeupFilterEdit',
      getARFilterDetailEditRouteParams({
        editSourceImageUri: getEditSourceImageUri(editSourceImageUri),
        initialGuideMode,
        initialMakeupFilterId: selectedMakeupFilterId ?? initialMakeupFilterId,
        source: initialSource,
      }),
    );
  };

  const handleOpenShapeAdjust = (
    selectedMakeupFilterId?: string,
    editSourceImageUri?: string,
  ) => {
    rememberSelectedRecommendedFilter(selectedMakeupFilterId);

    navigation.navigate(
      'MakeupFilterEdit',
      getARFilterDetailEditRouteParams({
        editSourceImageUri: getEditSourceImageUri(editSourceImageUri),
        initialEditMode: 'fit',
        initialGuideMode,
        initialMakeupFilterId: selectedMakeupFilterId ?? initialMakeupFilterId,
        source: initialSource,
      }),
    );
  };

  const handleSave = (selectedMakeupFilterId?: string) => {
    rememberSelectedRecommendedFilter(selectedMakeupFilterId);

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
      onOpenDetailEdit={handleOpenDetailEdit}
      onOpenPersonalizedMakeup={() => navigation.navigate('UnityMakeupCapture')}
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

export function MakeupFilterEditRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupFilterEdit'>) {
  const handleSave = (
    savedContract?: FullFaceMakeupSavedContract,
    selectedMakeupFilterId?: string,
  ) => {
    if (savedContract) {
      navigation.navigate('ARFilter', {
        fullFaceEditState: savedContract.editState,
      });
      return;
    }

    navigation.navigate('ARFilter', {
      initialGuideMode: route.params?.initialGuideMode,
      initialMakeupFilterId: selectedMakeupFilterId ?? route.params?.initialMakeupFilterId,
      source: route.params?.source,
    });
  };

  return (
    <MakeupFilterEditScreen
      editSourceImageUri={route.params?.editSourceImageUri}
      initialEditMode={route.params?.initialEditMode ?? 'product'}
      initialGuideMode={route.params?.initialGuideMode}
      initialMakeupFilterId={route.params?.initialMakeupFilterId}
      initialSource={route.params?.source}
      mode={route.params?.mode === 'fullFace' ? 'fullFace' : 'preset'}
      onComplete={() => navigateARBack(navigation, route.params?.backRoute)}
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={handleSave}
      sourceFrameMetadata={route.params?.sourceFrameMetadata}
    />
  );
}
