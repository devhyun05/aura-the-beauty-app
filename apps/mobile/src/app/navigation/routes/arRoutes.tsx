import React from 'react';

import {ARFilterScreen} from '../../../features/ar/screens/ARFilterScreen';
import {MakeupFilterEditScreen} from '../../../features/ar/screens/MakeupFilterEditScreen';
import {UnityMakeupCaptureScreen} from '../../../features/ar/screens/UnityMakeupCaptureScreen';
import StencilARApp from '../../../features/ar/stencil/StencilARApp';
import type {FullFaceMakeupSavedContract} from '../../../features/ar/services/fullFaceMakeupEditService';
import {
  createSavedArLookClientRequestId,
  saveArLook,
} from '../../../features/ar/services/savedArLookService';
import type {GuideMode} from '../../../shared/types/makeupGuide';
import {useNavigationFlowState} from '../flowState';
import {
  getARFilterDetailEditRouteParams,
  getSavedArLookProductRecommendationRouteParams,
} from './arRouteActions';
import {
  goBackToPreviousOrMainTab,
  navigateARBack,
  navigateMainTab,
  type RootScreenProps,
} from './routeUtils';

const DEFAULT_AR_GUIDE_MODE: GuideMode = 'basic';

export function ARFilterRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilter'>) {
  const saveRequestIdsByRecipe = React.useRef(new Map<string, string>());
  const {selectedFaceCapture, setSelectedRecommendedMakeupFilterId} =
    useNavigationFlowState();
  const initialMakeupFilterId = route.params?.initialMakeupFilterId;
  const initialSource = route.params?.source;
  const initialGuideMode =
    route.params?.initialGuideMode ??
    (initialSource === 'recommendedFilter' ? 'half' : DEFAULT_AR_GUIDE_MODE);
  const shouldUseStencilExperience =
    route.params == null ||
    (initialSource === 'homeServiceShortcut' &&
      !route.params.fullFaceEditState &&
      !route.params.initialGuideMode &&
      !route.params.initialMakeupFilterId);

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

  const handleSave = async (
    selectedMakeupFilterId?: string,
    savedContract?: FullFaceMakeupSavedContract,
  ) => {
    rememberSelectedRecommendedFilter(selectedMakeupFilterId);

    if (savedContract) {
      const recipeKey = JSON.stringify(savedContract.recipe);
      const clientRequestId =
        saveRequestIdsByRecipe.current.get(recipeKey) ??
        createSavedArLookClientRequestId();
      saveRequestIdsByRecipe.current.set(recipeKey, clientRequestId);
      const savedStyle = await saveArLook(savedContract, clientRequestId);

      if (initialSource === 'recommendedFilter') {
        navigation.replace(
          'ProductRecommendation',
          getSavedArLookProductRecommendationRouteParams(savedStyle.id),
        );
        return;
      }

      navigation.replace('MakeupFilterSaveComplete', {
        arStyleId: savedStyle.id,
      });
      return;
    }

    navigation.navigate('MakeupFilterSave');
  };

  if (shouldUseStencilExperience) {
    return (
      <StencilARApp
        onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}
      />
    );
  }

  return (
    <ARFilterScreen
      fullFaceEditState={route.params?.fullFaceEditState}
      initialGuideMode={initialGuideMode}
      initialMakeupFilterId={initialMakeupFilterId}
      initialSource={initialSource}
      onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}
      onComplete={() => navigateMainTab(navigation, 'HomeTab')}
      onOpenDetailEdit={handleOpenDetailEdit}
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
      onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}
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
  const saveRequestIdsByRecipe = React.useRef(new Map<string, string>());
  const handleSave = async (
    savedContract?: FullFaceMakeupSavedContract,
    selectedMakeupFilterId?: string,
  ) => {
    if (savedContract) {
      const recipeKey = JSON.stringify(savedContract.recipe);
      const clientRequestId = saveRequestIdsByRecipe.current.get(recipeKey)
        ?? createSavedArLookClientRequestId();
      saveRequestIdsByRecipe.current.set(recipeKey, clientRequestId);
      const savedStyle = await saveArLook(savedContract, clientRequestId);
      navigation.replace('MakeupFilterSaveComplete', {
        arStyleId: savedStyle.id,
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
