import React from 'react';

import {
  MakeupCorrectionGuideOverlayScreen,
  MakeupCorrectionTipScreen,
  MakeupFeedbackCaptureScreen,
  MakeupFeedbackEntryScreen,
  MakeupFeedbackLoadingScreen,
  MakeupFeedbackResultScreen,
  type MakeupFeedbackPhotoSelection,
  type MakeupFeedbackResult,
} from '../../../features/makeup-feedback';
import {RoutePlaceholder} from '../../../shared/ui';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function MakeupFeedbackEntryRouteScreen({navigation}: RootScreenProps<'MakeupFeedbackEntry'>) {
  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackEntry"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}>
      <MakeupFeedbackEntryScreen
        onPressAiFeedback={() => navigation.navigate('MakeupFeedbackCapture')}
      />
    </DetailRouteChrome>
  );
}

export function MakeupFeedbackCaptureRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackCapture'>) {
  const {setSelectedMakeupFeedbackPhoto} = useNavigationFlowState();

  const handleSelectPhoto = (selection: MakeupFeedbackPhotoSelection) => {
    setSelectedMakeupFeedbackPhoto(selection);
    navigation.navigate('MakeupFeedbackLoading');
  };

  return (
    <MakeupFeedbackCaptureScreen
      onClose={() => navigation.navigate('MakeupFeedbackEntry')}
      onSelectPhoto={handleSelectPhoto}
    />
  );
}

export function MakeupFeedbackLoadingRouteScreen({
  navigation,
}: RootScreenProps<'MakeupFeedbackLoading'>) {
  const {selectedMakeupFeedbackPhoto, setMakeupFeedbackResult} = useNavigationFlowState();

  const handleComplete = (result: MakeupFeedbackResult) => {
    setMakeupFeedbackResult(result);
    navigation.navigate('MakeupFeedbackResult');
  };

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackLoading"
      onBack={() => navigation.navigate('MakeupFeedbackCapture')}>
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
        onBack={() => navigation.navigate('MakeupFeedbackEntry')}>
        <RoutePlaceholder
          description="피드백 분석을 먼저 완료해 주세요."
          showHeader={false}
          title="메이크업 피드백"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="MakeupFeedbackResult"
      onBack={() => navigation.navigate('MakeupFeedbackEntry')}>
      <MakeupFeedbackResultScreen
        onOpenGuide={() => navigation.navigate('MakeupCorrectionGuide')}
        onOpenTip={point => navigation.navigate('MakeupCorrectionTip', {pointId: point.id})}
        onRetake={() => navigation.navigate('MakeupFeedbackCapture')}
        onUploadAgain={() => navigation.navigate('MakeupFeedbackCapture')}
        result={makeupFeedbackResult}
      />
    </DetailRouteChrome>
  );
}

export function MakeupCorrectionGuideRouteScreen({navigation}: RootScreenProps<'MakeupCorrectionGuide'>) {
  const {makeupFeedbackResult} = useNavigationFlowState();

  if (!makeupFeedbackResult) {
    return (
      <DetailRouteChrome
        routeName="MakeupCorrectionGuide"
        onBack={() => navigation.navigate('MakeupFeedbackResult')}>
        <RoutePlaceholder
          description="가이드를 보려면 피드백 결과가 필요해요."
          showHeader={false}
          title="가이드 오버레이"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="MakeupCorrectionGuide"
      onBack={() => navigation.navigate('MakeupFeedbackResult')}>
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
        onBack={() => navigation.navigate('MakeupFeedbackResult')}>
        <RoutePlaceholder
          description="선택한 수정팁을 찾을 수 없어요."
          showHeader={false}
          title="수정팁"
        />
      </DetailRouteChrome>
    );
  }

  return (
    <DetailRouteChrome
      routeName="MakeupCorrectionTip"
      onBack={() => navigation.navigate('MakeupFeedbackResult')}>
      <MakeupCorrectionTipScreen
        onBack={() => navigation.navigate('MakeupFeedbackResult')}
        point={point}
      />
    </DetailRouteChrome>
  );
}
