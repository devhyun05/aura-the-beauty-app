import React from 'react';

import {
  MakeupCorrectionGuideOverlayScreen,
  MakeupCorrectionTipScreen,
  MakeupFeedbackAlbumUploadScreen,
  MakeupFeedbackGoalInputScreen,
  MakeupFeedbackLoadingScreen,
  MakeupFeedbackResultScreen,
  type MakeupFeedbackPhotoSelection,
  type MakeupFeedbackResult,
} from '../../../features/makeup-feedback';
import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import type {FaceCaptureUploadResult} from '../../../features/face-capture/services/faceCaptureUploadService';
import {RoutePlaceholder} from '../../../shared/ui';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

function getMakeupFeedbackPhotoSourceRoute(selection: MakeupFeedbackPhotoSelection) {
  return selection.photoSource === 'gallery'
    ? 'MakeupFeedbackAlbumUpload'
    : 'MakeupFeedbackCapture';
}

export function mapFaceCaptureResultToMakeupFeedbackPhotoSelection(
  result: FaceCaptureUploadResult,
): MakeupFeedbackPhotoSelection {
  return {
    imageUri: result.imageUri,
    photoSource: result.source === 'gallery' ? 'gallery' : 'camera',
  };
}

export function MakeupFeedbackCaptureRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackCapture'>) {
  const {setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto} = useNavigationFlowState();

  const handleCapture = React.useCallback(
    (result?: FaceCaptureUploadResult) => {
      if (!result) {
        return;
      }

      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(
        mapFaceCaptureResultToMakeupFeedbackPhotoSelection(result),
      );
      navigation.replace('FaceCaptureConfirmation', {target: 'makeupFeedback'});
    },
    [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  return (
    <CameraFaceCaptureScreen
      captureMode="face"
      captureType="makeup_feedback"
      onCapture={handleCapture}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
    />
  );
}

export function MakeupFeedbackAlbumUploadRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackAlbumUpload'>) {
  const {setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto} = useNavigationFlowState();

  const handleStartAnalysis = React.useCallback(
    (selection: MakeupFeedbackPhotoSelection) => {
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(selection);
      navigation.replace('FaceCaptureConfirmation', {target: 'makeupFeedback'});
    },
    [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackAlbumUpload"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <MakeupFeedbackAlbumUploadScreen onStartAnalysis={handleStartAnalysis} />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackGoalInputRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackGoalInput'>) {
  const {selectedMakeupFeedbackPhoto, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto} =
    useNavigationFlowState();

  const handleStartFeedback = React.useCallback(
    (selection: MakeupFeedbackPhotoSelection) => {
      setMakeupFeedbackResult(null);
      setSelectedMakeupFeedbackPhoto(selection);
      navigation.replace('MakeupFeedbackLoading');
    },
    [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackGoalInput"
      onBack={() => navigation.replace(getMakeupFeedbackPhotoSourceRoute(selectedMakeupFeedbackPhoto))}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <MakeupFeedbackGoalInputScreen
        onStartFeedback={handleStartFeedback}
        selection={selectedMakeupFeedbackPhoto}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackLoadingRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackLoading'>) {
  const {selectedMakeupFeedbackPhoto, setMakeupFeedbackResult} = useNavigationFlowState();

  const handleBack = React.useCallback(() => {
    navigation.replace('MakeupFeedbackGoalInput');
  }, [navigation]);

  const handleComplete = React.useCallback(
    (result: MakeupFeedbackResult) => {
      setMakeupFeedbackResult(result);
      navigation.replace('MakeupFeedbackResult');
    },
    [navigation, setMakeupFeedbackResult],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackLoading"
      onBack={handleBack}>
      <MakeupFeedbackLoadingScreen
        onBack={handleBack}
        onComplete={handleComplete}
        selection={selectedMakeupFeedbackPhoto}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackResultRouteScreen({navigation}: RootScreenProps<'MakeupFeedbackResult'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();

  if (!makeupFeedbackResult) {
    return (
      <DetailRouteChrome
        routeName="MakeupFeedbackResult"
        onBack={() => navigateMainTab(navigation, 'HomeTab')}>
        <RoutePlaceholder
          description="Start makeup feedback analysis first."
          showHeader={false}
          title="Makeup feedback"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackResult"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <MakeupFeedbackResultScreen result={makeupFeedbackResult} />
    </DetailRouteChrome>
  );
}

export function MakeupCorrectionGuideRouteScreen({navigation}: RootScreenProps<'MakeupCorrectionGuide'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();

  if (!makeupFeedbackResult) {
    return (
      <DetailRouteChrome
        routeName="MakeupCorrectionGuide"
        onBack={() => navigateMainTab(navigation, 'HomeTab')}>
        <RoutePlaceholder
          description="A makeup feedback result is required to show the guide."
          showHeader={false}
          title="Guide overlay"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome routeName="MakeupCorrectionGuide" onBack={() => navigation.goBack()}>
      <MakeupCorrectionGuideOverlayScreen result={makeupFeedbackResult} />
    </DetailRouteChrome>
  );
}

export function MakeupCorrectionTipRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupCorrectionTip'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();
  const point = makeupFeedbackResult?.points.find(item => item.id === route.params.pointId);

  if (!point) {
    return (
      <DetailRouteChrome
        routeName="MakeupCorrectionTip"
        onBack={() => navigateMainTab(navigation, 'HomeTab')}>
        <RoutePlaceholder
          description="The selected correction point was not found."
          showHeader={false}
          title="Correction tip"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome routeName="MakeupCorrectionTip" onBack={() => navigation.goBack()}>
      <MakeupCorrectionTipScreen onBack={() => navigation.goBack()} point={point} />
    </DetailRouteChrome>
  );
}
