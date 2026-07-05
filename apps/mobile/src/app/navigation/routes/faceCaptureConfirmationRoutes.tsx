import React from 'react';
import {Image} from 'react-native';

import {FaceCaptureConfirmationScreen} from '../../../features/face-capture/screens/FaceCaptureConfirmationScreen';
import type {
  FaceCaptureImageSource,
  FaceCaptureUploadResult,
} from '../../../features/face-capture/services/faceCaptureUploadService';
import type {MakeupFeedbackPhotoSelection} from '../../../features/makeup-feedback';
import type {ReferenceMakeupPhoto} from '../../../features/reference-makeup-extraction';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import type {
  FaceAnalysisCompletionRouteName,
  FaceCaptureConfirmationTarget,
  RootStackParamList,
} from '../routeTypes';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

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
) {
  if (target === 'faceAnalysis') {
    return 'FaceAnalysisLoading';
  }

  if (target === 'makeupFeedback') {
    return 'MakeupFeedbackGoalInput';
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
  selectedMakeupFeedbackPhoto,
  selectedReferenceMakeupPhoto,
  target,
}: {
  selectedFaceCapture: FaceCaptureUploadResult | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
  target: FaceCaptureConfirmationTarget;
}): string | null {
  if (target === 'faceAnalysis') {
    return selectedFaceCapture?.imageUri ?? null;
  }

  if (target === 'makeupFeedback') {
    return selectedMakeupFeedbackPhoto.imageUri ?? null;
  }

  return getReferenceMakeupPhotoUri(selectedReferenceMakeupPhoto);
}

function getConfirmationPhotoSource({
  selectedFaceCapture,
  selectedMakeupFeedbackPhoto,
  selectedReferenceMakeupPhoto,
  target,
}: {
  selectedFaceCapture: FaceCaptureUploadResult | null;
  selectedMakeupFeedbackPhoto: MakeupFeedbackPhotoSelection;
  selectedReferenceMakeupPhoto: ReferenceMakeupPhoto | null;
  target: FaceCaptureConfirmationTarget;
}): FaceCaptureImageSource {
  if (target === 'faceAnalysis') {
    return selectedFaceCapture?.source ?? 'camera';
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
    selectedFaceCapture,
    selectedMakeupFeedbackPhoto,
    selectedReferenceMakeupPhoto,
    setMakeupFeedbackResult,
    setReferenceMakeupUploadedPhotos,
    setSelectedFaceCapture,
    setSelectedMakeupFeedbackPhoto,
    setSelectedReferenceMakeupPhoto,
  } = useNavigationFlowState();
  const target = route.params.target;
  const copy = getFaceCaptureConfirmationCopy(target);
  const photoUri = getConfirmationPhotoUri({
    selectedFaceCapture,
    selectedMakeupFeedbackPhoto,
    selectedReferenceMakeupPhoto,
    target,
  });
  const photoSource = getConfirmationPhotoSource({
    selectedFaceCapture,
    selectedMakeupFeedbackPhoto,
    selectedReferenceMakeupPhoto,
    target,
  });

  const handleRetake = React.useCallback(() => {
    const retakeRoute = getFaceCaptureConfirmationRetakeRoute({
      afterAnalysisRoute: route.params.afterAnalysisRoute,
      source: photoSource,
      target,
    });

    if (target === 'faceAnalysis') {
      setSelectedFaceCapture(null);
    }

    if (target === 'makeupFeedback') {
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto({photoSource});
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

    navigation.replace('ReferenceMakeupExtractionUpload', retakeRoute.params);
  }, [
    navigation,
    photoSource,
    route.params.afterAnalysisRoute,
    setMakeupFeedbackResult,
    setSelectedFaceCapture,
    setSelectedMakeupFeedbackPhoto,
    setSelectedReferenceMakeupPhoto,
    target,
  ]);

  const handleConfirm = React.useCallback(() => {
    if (!photoUri) {
      handleRetake();
      return;
    }

    if (target === 'faceAnalysis') {
      navigation.replace(
        'FaceAnalysisLoading',
        route.params.afterAnalysisRoute
          ? {afterAnalysisRoute: route.params.afterAnalysisRoute}
          : undefined,
      );
      return;
    }

    if (target === 'makeupFeedback') {
      navigation.replace('MakeupFeedbackGoalInput');
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
    target,
  ]);

  const handleClose = React.useCallback(() => {
    if (target === 'makeupFeedback') {
      navigateMainTab(navigation, 'HomeTab');
      return;
    }

    navigateMainTab(navigation, 'HomeTab');
  }, [navigation, target]);

  return (
    <DetailRouteChrome
      routeName="FaceCaptureConfirmation"
      onBack={handleRetake}
      onClose={handleClose}>
      <FaceCaptureConfirmationScreen
        confirmLabel={copy.confirmLabel}
        description={copy.description}
        onConfirm={handleConfirm}
        onRetake={handleRetake}
        photoUri={photoUri}
        retakeLabel={copy.retakeLabel}
        title={copy.title}
      />
    </DetailRouteChrome>
  );
}
