import React from 'react';

import {MakeupFilterEditScreen} from '../../../features/ar/screens/MakeupFilterEditScreen';
import {UnityMakeupCaptureScreen} from '../../../features/ar/screens/UnityMakeupCaptureScreen';
import StencilARApp from '../../../features/ar/stencil/StencilARApp';
import type {FullFaceMakeupSavedContract} from '../../../features/ar/services/fullFaceMakeupEditService';
import {navigateARBack, navigateMainTab, type RootScreenProps} from './routeUtils';

export function ARFilterRouteScreen({
  navigation,
}: RootScreenProps<'ARFilter'>) {
  return (
    <StencilARApp onBack={() => navigateMainTab(navigation, 'HomeTab')} />
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
