import React from 'react';

import {
  MakeupCorrectionGuideOverlayScreen,
  MakeupCorrectionTipScreen,
  MakeupFeedbackAlbumUploadScreen,
  MakeupFeedbackEntryScreen,
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

export function MakeupFeedbackEntryRouteScreen({navigation}: RootScreenProps<'MakeupFeedbackEntry'>) {
  const {setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto} = useNavigationFlowState();

  const handlePressAiFeedback = React.useCallback(() => {
    setMakeupFeedbackResult(null);
    setSelectedMakeupFeedbackPhoto({photoSource: 'camera'});
    navigation.replace('MakeupFeedbackCapture');
  }, [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto]);

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackEntry"
      onClose={() => navigateMainTab(navigation, 'CustomTab')}>
      <MakeupFeedbackEntryScreen onPressAiFeedback={handlePressAiFeedback} />
    </DetailRouteChrome>
  );
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
      navigation.replace('MakeupFeedbackGoalInput');
    },
    [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  return (
    <CameraFaceCaptureScreen
      captureMode="face"
      captureType="makeup_feedback"
      onCapture={handleCapture}
      onClose={() => navigateMainTab(navigation, 'CustomTab')}
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
      navigation.replace('MakeupFeedbackGoalInput');
    },
    [navigation, setMakeupFeedbackResult, setSelectedMakeupFeedbackPhoto],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackAlbumUpload"
      onBack={() => navigateMainTab(navigation, 'CustomTab')}
      onClose={() => navigateMainTab(navigation, 'CustomTab')}>
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
      onClose={() => navigateMainTab(navigation, 'CustomTab')}>
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
      onBack={() => navigation.replace('MakeupFeedbackGoalInput')}>
      <MakeupFeedbackLoadingScreen
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
        onBack={() => navigateMainTab(navigation, 'CustomTab')}>
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
      onBack={() => navigateMainTab(navigation, 'CustomTab')}>
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
        onBack={() => navigateMainTab(navigation, 'CustomTab')}>
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
        onBack={() => navigateMainTab(navigation, 'CustomTab')}>
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
