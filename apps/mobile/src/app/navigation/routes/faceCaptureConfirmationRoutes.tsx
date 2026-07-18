import React from 'react';
import {Image} from 'react-native';

import {FaceCaptureConfirmationScreen} from '../../../features/face-capture/screens/FaceCaptureConfirmationScreen';
import type {
  FaceCaptureImageSource,
  FaceCaptureUploadResult,
} from '../../../features/face-capture/services/faceCaptureUploadService';
import {
  getFaceAnalysisConfirmationDestination,
  getUnifiedHairlineConfirmationNotice,
} from '../../../features/face-capture/services/unifiedFaceCaptureNavigation';
import {deleteUnifiedFaceCaptureTempImage} from '../../../features/face-capture/services/unifiedFaceCaptureTempImageCleanup';
import type {
  MakeupFeedbackKind,
  MakeupFeedbackPhotoSelection,
} from '../../../features/makeup-feedback';
import {applyMakeupFeedbackJourneyContext} from '../../../features/makeup-feedback/services/makeupFeedbackJourneyContext';
import type {ReferenceMakeupPhoto} from '../../../features/reference-makeup-extraction';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import type {
  FaceAnalysisCompletionRouteName,
  FaceCaptureConfirmationTarget,
  RootStackParamList,
} from '../routeTypes';
import {
  getMakeupJourneyDayResetState,
  navigateMainTab,
  type RootScreenProps,
} from './routeUtils';

const loadMakeupPhotoPicker = () =>
  require('../../../features/home/services/makeupPhotoPicker') as typeof import('../../../features/home/services/makeupPhotoPicker');

type FaceCaptureConfirmationCopy = {
  confirmLabel: string;
  description: string;
  retakeLabel: string;
  title: string;
};

type FaceCaptureConfirmationRetakeRoute =
  | {
      name: 'FaceCapture';
      params?: RootStackParamList['FaceCapture'];
    }
  | {
      name: 'MakeupFeedbackAlbumUpload';
      params?: undefined;
    }
  | {
      name: 'MakeupFeedbackCapture';
      params?: undefined;
    }
  | {
      name: 'ReferenceMakeupExtractionUpload';
      params?: RootStackParamList['ReferenceMakeupExtractionUpload'];
    }
  | {
      name: 'HairAnalysisCapture';
      params?: undefined;
    };

type FaceCaptureConfirmationRetakeParams = {
  afterAnalysisRoute?: FaceAnalysisCompletionRouteName;
  source: FaceCaptureImageSource;
  target: FaceCaptureConfirmationTarget;
};

const confirmationCopyByTarget: Record<
  FaceCaptureConfirmationTarget,
  FaceCaptureConfirmationCopy
> = {
  faceAnalysis: {
    confirmLabel: '얼굴 분석 시작',
    description: '얼굴 분석에 사용할 사진을 확인해 주세요.',
    retakeLabel: '다시 촬영',
    title: '이 사진으로 얼굴 분석을 시작할까요?',
  },
  hairAnalysis: {
    confirmLabel: '헤어 분석 시작',
    description: '헤어 분석과 시뮬레이션에 사용할 사진을 확인해 주세요.',
    retakeLabel: '다시 촬영',
    title: '이 사진으로 헤어를 분석할까요?',
  },
  makeupFeedback: {
    confirmLabel: '메이크업 피드백 시작',
    description: '메이크업 피드백에 사용할 사진을 확인해 주세요.',
    retakeLabel: '다시 선택',
    title: '이 사진으로 피드백을 시작할까요?',
  },
  referenceMakeupExtraction: {
    confirmLabel: '메이크업 추출 시작',
    description: '메이크업 추출에 사용할 사진을 확인해 주세요.',
    retakeLabel: '다시 선택',
    title: '이 사진으로 메이크업을 추출할까요?',
  },
};

export function getFaceCaptureConfirmationCopy(
  target: FaceCaptureConfirmationTarget,
): FaceCaptureConfirmationCopy {
  return confirmationCopyByTarget[target];
}

export function getFaceCaptureConfirmationNextRouteName(
  target: FaceCaptureConfirmationTarget,
  feedbackKind: MakeupFeedbackKind = 'initial',
) {
  if (target === 'faceAnalysis') {
    // 확인 뒤 ARKit 3D 자동 측정을 거쳐 로딩으로 간다(셔터 1회 UX).
    // 측정 화면이 자격 미달/미지원이면 스스로 로딩으로 즉시 넘어간다.
    return 'Face3DMeasurement';
  }

  if (target === 'makeupFeedback') {
    return feedbackKind === 'correction'
      ? 'MakeupFeedbackLoading'
      : 'MakeupFeedbackGoalInput';
  }

  if (target === 'hairAnalysis') {
    return 'HairAnalysisLoading';
  }

  return 'ReferenceMakeupExtractionLoading';
}

export function getFaceCaptureConfirmationRetakeRoute({
  afterAnalysisRoute,
  source,
  target,
}: FaceCaptureConfirmationRetakeParams): FaceCaptureConfirmationRetakeRoute {
  if (target === 'faceAnalysis') {
    const params: NonNullable<RootStackParamList['FaceCapture']> = {};

    if (afterAnalysisRoute) {
      params.afterAnalysisRoute = afterAnalysisRoute;
    }

    if (source === 'gallery') {
      params.initialSource = 'gallery';
    }

    return {
      name: 'FaceCapture',
      params: afterAnalysisRoute || source === 'gallery' ? params : undefined,
    };
  }

  if (target === 'makeupFeedback') {
    return {
      name: source === 'gallery' ? 'MakeupFeedbackAlbumUpload' : 'MakeupFeedbackCapture',
    };
  }

  if (target === 'hairAnalysis') {
    return {name: 'HairAnalysisCapture'};
  }

  return {
    name: 'ReferenceMakeupExtractionUpload',
    params: {
      initialSource: source === 'gallery' ? 'gallery' : 'camera',
    },
  };
}

function getReferenceMakeupPhotoUri(photo: ReferenceMakeupPhoto | null): string | null {
  if (!photo) {
    return null;
  }

  return Image.resolveAssetSource(photo.imageSource)?.uri ?? null;
}

function getConfirmationPhotoUri({
  selectedFaceCapture,
  selectedHairCapture,
  selectedMakeupFeedbackPhoto,
  selectedReferenceMakeupPhoto,
  target,
}: {
  selectedFaceCapture: FaceCaptureUploadResult | null;
  selectedHairCapture: FaceCaptureUploadResult | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
  target: FaceCaptureConfirmationTarget;
}): string | null {
  if (target === 'faceAnalysis') {
    return selectedFaceCapture?.imageUri ?? null;
  }

  if (target === 'hairAnalysis') {
    return selectedHairCapture?.imageUri ?? null;
  }

  if (target === 'makeupFeedback') {
    return selectedMakeupFeedbackPhoto.imageUri ?? null;
  }

  return getReferenceMakeupPhotoUri(selectedReferenceMakeupPhoto);
}

function getConfirmationPhotoSource({
  selectedFaceCapture,
  selectedHairCapture,
  selectedMakeupFeedbackPhoto,
  selectedReferenceMakeupPhoto,
  target,
}: {
  selectedFaceCapture: FaceCaptureUploadResult | null;
  selectedHairCapture: FaceCaptureUploadResult | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
  target: FaceCaptureConfirmationTarget;
}): FaceCaptureImageSource {
  if (target === 'faceAnalysis') {
    return selectedFaceCapture?.source ?? 'camera';
  }

  if (target === 'hairAnalysis') {
    return selectedHairCapture?.source ?? 'camera';
  }

  if (target === 'makeupFeedback') {
    return selectedMakeupFeedbackPhoto.photoSource;
  }

  return selectedReferenceMakeupPhoto?.referenceSource === 'album' ? 'gallery' : 'camera';
}

export function FaceCaptureConfirmationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceCaptureConfirmation'>) {
  const {
    clearMakeupFeedbackFlowContext,
    invalidateUnifiedFaceCapture,
    makeupFeedbackEntryDate,
    makeupFeedbackFlowOrigin,
    makeupFeedbackInheritedGoalContext,
    makeupFeedbackKind,
    makeupFeedbackParentReportId,
    makeupFeedbackParentScore,
    selectedFaceCapture,
    selectedHairCapture,
    selectedMakeupFeedbackPhoto,
    selectedReferenceMakeupPhoto,
    setMakeupFeedbackResult,
    setReferenceMakeupUploadedPhotos,
    setSelectedFaceCapture,
    setSelectedHairCapture,
    setSelectedMakeupFeedbackPhoto,
    setSelectedReferenceMakeupPhoto,
    unifiedFaceCaptureFlow,
  } = useNavigationFlowState();
  const target = route.params.target;
  const makeupFeedbackJourneyContext = {
    entryDate: makeupFeedbackEntryDate,
    feedbackKind: makeupFeedbackKind,
    inheritedGoalContext: makeupFeedbackInheritedGoalContext,
    origin: makeupFeedbackFlowOrigin,
    parentFeedbackReportId: makeupFeedbackParentReportId,
    parentScore: makeupFeedbackParentScore,
  };
  const copy = getFaceCaptureConfirmationCopy(target);
  const photoUri = getConfirmationPhotoUri({
    selectedFaceCapture,
    selectedHairCapture,
    selectedMakeupFeedbackPhoto,
    selectedReferenceMakeupPhoto,
    target,
  });
  const photoSource = getConfirmationPhotoSource({
    selectedFaceCapture,
    selectedHairCapture,
    selectedMakeupFeedbackPhoto,
    selectedReferenceMakeupPhoto,
    target,
  });
  const unifiedHairlineNotice =
    target === 'faceAnalysis'
      ? getUnifiedHairlineConfirmationNotice(
          unifiedFaceCaptureFlow.committedCapture?.result.hairline,
        )
      : null;

  const handleRetake = React.useCallback(async () => {
    if (photoSource === 'gallery' && target === 'makeupFeedback') {
      const {pickMakeupFeedbackPhotoFromLibrary} = loadMakeupPhotoPicker();
      const selection = await pickMakeupFeedbackPhotoFromLibrary();
      if (!selection) {
        return;
      }
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(
        applyMakeupFeedbackJourneyContext(
          selection,
          makeupFeedbackJourneyContext,
        ),
      );
      return;
    }

    if (photoSource === 'gallery' && target === 'referenceMakeupExtraction') {
      const {pickReferenceMakeupPhotoFromLibrary} = loadMakeupPhotoPicker();
      const photo = await pickReferenceMakeupPhotoFromLibrary();
      if (!photo) {
        return;
      }
      setSelectedReferenceMakeupPhoto(photo);
      return;
    }

    const retakeRoute = getFaceCaptureConfirmationRetakeRoute({
      afterAnalysisRoute: route.params.afterAnalysisRoute,
      source: photoSource,
      target,
    });

    if (target === 'faceAnalysis') {
      await deleteUnifiedFaceCaptureTempImage(
        unifiedFaceCaptureFlow.committedCapture?.result.image.uri,
      );
      invalidateUnifiedFaceCapture({
        incrementRetryAttempt: Boolean(
          unifiedFaceCaptureFlow.committedCapture?.result.hairline
            .retryRecommendation.recommended,
        ),
      });
      setSelectedFaceCapture(null);
    }

    if (target === 'makeupFeedback') {
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(
        applyMakeupFeedbackJourneyContext(
          {photoSource},
          makeupFeedbackJourneyContext,
        ),
      );
    }

    if (target === 'hairAnalysis') {
      setSelectedHairCapture(null);
    }

    if (target === 'referenceMakeupExtraction') {
      setSelectedReferenceMakeupPhoto(null);
    }

    if (retakeRoute.name === 'FaceCapture') {
      navigation.replace('FaceCapture', retakeRoute.params);
      return;
    }

    if (retakeRoute.name === 'MakeupFeedbackAlbumUpload') {
      navigation.replace('MakeupFeedbackAlbumUpload');
      return;
    }

    if (retakeRoute.name === 'MakeupFeedbackCapture') {
      navigation.replace('MakeupFeedbackCapture');
      return;
    }

    if (retakeRoute.name === 'HairAnalysisCapture') {
      navigation.replace('HairAnalysisCapture');
      return;
    }

    navigation.replace('ReferenceMakeupExtractionUpload', retakeRoute.params);
  }, [
    navigation,
    invalidateUnifiedFaceCapture,
    photoSource,
    route.params.afterAnalysisRoute,
    setMakeupFeedbackResult,
    setSelectedFaceCapture,
    setSelectedHairCapture,
    setSelectedMakeupFeedbackPhoto,
    setSelectedReferenceMakeupPhoto,
    target,
    makeupFeedbackJourneyContext,
    unifiedFaceCaptureFlow.committedCapture,
  ]);

  const handleConfirm = React.useCallback(() => {
    if (!photoUri) {
      handleRetake();
      return;
    }

    if (target === 'faceAnalysis') {
      const destination = getFaceAnalysisConfirmationDestination(
        Boolean(unifiedFaceCaptureFlow.committedCapture),
      );
      if (destination === 'FaceAnalysisLoading') {
        navigation.replace(
          'FaceAnalysisLoading',
          route.params.afterAnalysisRoute
            ? {afterAnalysisRoute: route.params.afterAnalysisRoute}
            : undefined,
        );
        return;
      }

      // 3D 자동 측정을 경유(셔터 1회 UX). afterAnalysisRoute는 측정 화면이
      // 로딩으로 그대로 이어 전달한다(ProductRecommendation 연속 흐름 보존).
      navigation.replace(
        'Face3DMeasurement',
        route.params.afterAnalysisRoute
          ? {afterAnalysisRoute: route.params.afterAnalysisRoute}
          : undefined,
      );
      return;
    }

    if (target === 'makeupFeedback') {
      if (makeupFeedbackKind === 'correction') {
        navigation.replace('MakeupFeedbackLoading');
        return;
      }
      navigation.replace('MakeupFeedbackGoalInput');
      return;
    }

    if (target === 'hairAnalysis') {
      navigation.replace('HairAnalysisLoading');
      return;
    }

    if (selectedReferenceMakeupPhoto) {
      setReferenceMakeupUploadedPhotos(currentPhotos => [
        selectedReferenceMakeupPhoto,
        ...currentPhotos.filter(photo => photo.id !== selectedReferenceMakeupPhoto.id),
      ]);
    }

    navigation.replace('ReferenceMakeupExtractionLoading');
  }, [
    handleRetake,
    navigation,
    photoUri,
    route.params.afterAnalysisRoute,
    selectedReferenceMakeupPhoto,
    setReferenceMakeupUploadedPhotos,
    makeupFeedbackKind,
    target,
    unifiedFaceCaptureFlow.committedCapture,
  ]);

  const handleClose = React.useCallback(async () => {
    if (target === 'faceAnalysis') {
      await deleteUnifiedFaceCaptureTempImage(
        unifiedFaceCaptureFlow.committedCapture?.result.image.uri,
      );
      invalidateUnifiedFaceCapture({resetRetryAttempt: true});
    }

    if (target === 'makeupFeedback') {
      const returnEntryDate = makeupFeedbackEntryDate;
      const shouldReturnToJourney = makeupFeedbackFlowOrigin === 'journeyDay';

      clearMakeupFeedbackFlowContext();
      if (shouldReturnToJourney) {
        navigation.reset(getMakeupJourneyDayResetState(returnEntryDate));
        return;
      }
      navigateMainTab(navigation, 'HomeTab');
      return;
    }

    navigateMainTab(navigation, 'HomeTab');
  }, [
    invalidateUnifiedFaceCapture,
    clearMakeupFeedbackFlowContext,
    makeupFeedbackEntryDate,
    makeupFeedbackFlowOrigin,
    navigation,
    target,
    unifiedFaceCaptureFlow.committedCapture,
  ]);

  return (
    <DetailRouteChrome
      routeName="FaceCaptureConfirmation"
      onBack={handleRetake}
      onClose={handleClose}>
      <FaceCaptureConfirmationScreen
        confirmLabel={copy.confirmLabel}
        description={unifiedHairlineNotice ?? copy.description}
        onConfirm={handleConfirm}
        onRetake={handleRetake}
        photoUri={photoUri}
        retakeLabel={copy.retakeLabel}
        title={copy.title}
      />
    </DetailRouteChrome>
  );
}
