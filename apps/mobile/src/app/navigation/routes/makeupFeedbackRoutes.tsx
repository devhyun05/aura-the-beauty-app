import React from 'react';

import {
  FeedbackCaptureScreen,
  FeedbackEntryScreen,
  FeedbackGuideOverlayScreen,
  FeedbackLoadingScreen,
  FeedbackTipScreen,
  MakeupFeedbackScreen,
  type FeedbackPhotoSelection,
  type MakeupFeedbackResult,
} from '../../../features/feedback';
import {RoutePlaceholder} from '../../../shared/ui';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function FeedbackEntryRouteScreen({navigation}: RootScreenProps<'FeedbackEntry'>) {
  return (
    <DetailRouteChrome
      routeName="FeedbackEntry"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <FeedbackEntryScreen
        onPressAiFeedback={() => navigation.navigate('FeedbackCapture')}
      />
    </DetailRouteChrome>
  );
}

export function FeedbackCaptureRouteScreen({
  navigation,
}: RootScreenProps<'FeedbackCapture'>) {
  const {setSelectedFeedbackPhoto} = useNavigationFlowState();

  const handleSelectPhoto = (selection: FeedbackPhotoSelection) => {
    setSelectedFeedbackPhoto(selection);
    navigation.navigate('FeedbackLoading');
  };

  return (
    <FeedbackCaptureScreen
      onClose={() => navigation.navigate('FeedbackEntry')}
      onSelectPhoto={handleSelectPhoto}
    />
  );
}

export function FeedbackLoadingRouteScreen({
  navigation,
}: RootScreenProps<'FeedbackLoading'>) {
  const {selectedFeedbackPhoto, setFeedbackResult} = useNavigationFlowState();

  const handleComplete = (result: MakeupFeedbackResult) => {
    setFeedbackResult(result);
    navigation.navigate('FeedbackResult');
  };

  return (
    <DetailRouteChrome
      routeName="FeedbackLoading"
      onBack={() => navigation.navigate('FeedbackCapture')}>
      <FeedbackLoadingScreen
        onComplete={handleComplete}
        selection={selectedFeedbackPhoto}
      />
    </DetailRouteChrome>
  );
}

export function FeedbackResultRouteScreen({navigation}: RootScreenProps<'FeedbackResult'>) {
  const {feedbackResult} = useNavigationFlowState();

  if (!feedbackResult) {
    return (
      <DetailRouteChrome
        routeName="FeedbackResult"
        onBack={() => navigation.navigate('FeedbackEntry')}>
        <RoutePlaceholder
          description="Analysis result is required."
          showHeader={false}
          title="Makeup Feedback"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="FeedbackResult"
      onBack={() => navigation.navigate('FeedbackEntry')}>
      <MakeupFeedbackScreen
        onOpenGuide={() => navigation.navigate('FeedbackGuide')}
        onOpenTip={point => navigation.navigate('FeedbackTip', {pointId: point.id})}
        onRetake={() => navigation.navigate('FeedbackCapture')}
        onUploadAgain={() => navigation.navigate('FeedbackCapture')}
        result={feedbackResult}
      />
    </DetailRouteChrome>
  );
}

export function FeedbackGuideRouteScreen({navigation}: RootScreenProps<'FeedbackGuide'>) {
  const {feedbackResult} = useNavigationFlowState();

  if (!feedbackResult) {
    return (
      <DetailRouteChrome
        routeName="FeedbackGuide"
        onBack={() => navigation.navigate('FeedbackResult')}>
        <RoutePlaceholder
          description="Feedback result is required to view the guide."
          showHeader={false}
          title="Feedback Guide"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="FeedbackGuide"
      onBack={() => navigation.navigate('FeedbackResult')}>
      <FeedbackGuideOverlayScreen result={feedbackResult} />
    </DetailRouteChrome>
  );
}

export function FeedbackTipRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FeedbackTip'>) {
  const {feedbackResult} = useNavigationFlowState();
  const point = feedbackResult?.points.find(item => item.id === route.params.pointId);

  if (!point) {
    return (
      <DetailRouteChrome
        routeName="FeedbackTip"
        onBack={() => navigation.navigate('FeedbackResult')}>
        <RoutePlaceholder
          description="Selected feedback point was not found."
          showHeader={false}
          title="Feedback Tip"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="FeedbackTip"
      onBack={() => navigation.navigate('FeedbackResult')}>
      <FeedbackTipScreen
        onBack={() => navigation.navigate('FeedbackResult')}
        point={point}
      />
    </DetailRouteChrome>
  );
}