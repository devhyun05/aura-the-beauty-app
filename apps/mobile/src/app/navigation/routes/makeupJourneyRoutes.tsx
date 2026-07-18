import React from 'react';

import {MakeupFeedbackActionSheet} from '../../../features/home/components/MakeupFeedbackActionSheet';
import {
  MakeupJourneyDayDetailScreen,
  MakeupJourneyScreen,
  MakeupJourneyTrendScreen,
  type MakeupJourneyCorrectionContext,
  type MakeupJourneyTrendRange,
} from '../../../features/makeup-journey';
import {
  isIsoDateString,
  isYearMonthString,
} from '../../../features/makeup-journey/utils/date';
import {
  applyMakeupFeedbackJourneyContext,
  getInitialMakeupFeedbackJourneyFlowContext,
  normalizeInheritedMakeupFeedbackContext,
  type MakeupFeedbackJourneyFlowContext,
} from '../../../features/makeup-feedback/services/makeupFeedbackJourneyContext';
import {isMakeupJourneyEnabled} from '../../../shared/config/featureFlags';
import {trackMakeupJourneyEvent} from '../../../shared/services/makeupJourneyAnalytics';
import {RoutePlaceholder} from '../../../shared/ui';
import {useNavigationFlowState} from '../flowState';
import {
  getHomeTabResetState,
  getMakeupJourneyDayResetState,
  getMakeupJourneyTabResetState,
  navigateMainTab,
  type MainTabScreenProps,
  type RootNavigation,
  type RootScreenProps,
} from './routeUtils';

const loadMakeupPhotoPicker = () =>
  require('../../../features/home/services/makeupPhotoPicker') as typeof import('../../../features/home/services/makeupPhotoPicker');

export function getMakeupJourneyDayBackBehavior(
  canGoBack: boolean,
): 'goBack' | 'MakeupJourneyTab' {
  return canGoBack ? 'goBack' : 'MakeupJourneyTab';
}

export function getMakeupJourneyTrendBackBehavior(
  canGoBack: boolean,
): 'goBack' | 'MakeupJourneyDayDetail' {
  return canGoBack ? 'goBack' : 'MakeupJourneyDayDetail';
}

export function getMakeupJourneyFeedbackPhotoRoute(
  photoSource: 'camera' | 'gallery',
): 'MakeupFeedbackCapture' | 'MakeupFeedbackAlbumUpload' {
  return photoSource === 'camera'
    ? 'MakeupFeedbackCapture'
    : 'MakeupFeedbackAlbumUpload';
}

export function getMakeupJourneyEmptyDayFeedbackContext(
  _selectedEntryDate: string,
  now = new Date(),
): MakeupFeedbackJourneyFlowContext {
  return {
    ...getInitialMakeupFeedbackJourneyFlowContext(now),
    origin: 'journeyDay',
  };
}

export function isMakeupJourneyEntryDateRouteParam(
  value: unknown,
): value is string {
  return typeof value === 'string' && isIsoDateString(value);
}

export function getMakeupJourneyInitialMonthRouteParam(
  value: unknown,
): string | undefined {
  return typeof value === 'string' && isYearMonthString(value)
    ? value
    : undefined;
}

export function getMakeupJourneyInitialTrendRangeRouteParam(
  value: unknown,
): MakeupJourneyTrendRange | undefined {
  return value === '7d' || value === '30d' || value === '90d'
    ? value
    : undefined;
}

export function MakeupJourneyTabRouteScreen({
  navigation,
  route,
}: MainTabScreenProps<'MakeupJourneyTab'>) {
  const rootNavigation = navigation.getParent<RootNavigation>();
  const isEnabled = isMakeupJourneyEnabled();

  React.useEffect(() => {
    if (!isEnabled) {
      navigation.navigate('HomeTab');
    }
  }, [isEnabled, navigation]);

  if (!isEnabled) {
    return null;
  }

  return (
    <MakeupJourneyScreen
      initialMonth={getMakeupJourneyInitialMonthRouteParam(route.params?.month)}
      onOpenDay={entryDate => {
        rootNavigation?.navigate('MakeupJourneyDayDetail', {entryDate});
      }}
      onOpenTrend={entryDate => {
        rootNavigation?.navigate('MakeupJourneyTrend', {entryDate});
      }}
    />
  );
}

export function MakeupJourneyDayDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupJourneyDayDetail'>) {
  const {
    beginMakeupFeedbackFlow,
    clearMakeupFeedbackFlowContext,
    makeupFeedbackFlowOrigin,
    setMakeupFeedbackResult,
    setSelectedMakeupFeedbackPhoto,
  } = useNavigationFlowState();
  const [pendingFeedbackContext, setPendingFeedbackContext] =
    React.useState<MakeupFeedbackJourneyFlowContext | null>(null);
  const [isFeedbackSheetVisible, setIsFeedbackSheetVisible] = React.useState(false);
  const [isFirstReportActive, setIsFirstReportActive] = React.useState(true);
  const entryDate = route.params?.entryDate;
  const feedbackFlowOriginRef = React.useRef(makeupFeedbackFlowOrigin);
  feedbackFlowOriginRef.current = makeupFeedbackFlowOrigin;

  React.useLayoutEffect(() => {
    const swipeBackEnabled = isFirstReportActive && navigation.canGoBack();
    navigation.setOptions({
      animationMatchesGesture: swipeBackEnabled,
      fullScreenGestureEnabled: swipeBackEnabled,
      gestureEnabled: swipeBackEnabled,
    });
  }, [isFirstReportActive, navigation]);

  React.useEffect(
    () => navigation.addListener('focus', () => {
      if (feedbackFlowOriginRef.current !== 'journeyDay') {
        return;
      }
      setIsFeedbackSheetVisible(false);
      setPendingFeedbackContext(null);
      clearMakeupFeedbackFlowContext();
    }),
    [clearMakeupFeedbackFlowContext, navigation],
  );

  const returnToCalendar = React.useCallback(() => {
    if (getMakeupJourneyDayBackBehavior(navigation.canGoBack()) === 'goBack') {
      navigation.goBack();
      return;
    }
    navigation.reset(
      isMakeupJourneyEntryDateRouteParam(entryDate)
        ? getMakeupJourneyTabResetState(entryDate.slice(0, 7))
        : getMakeupJourneyTabResetState(),
    );
  }, [entryDate, navigation]);

  const beginJourneyFeedback = React.useCallback((
    context: MakeupFeedbackJourneyFlowContext,
  ) => {
    beginMakeupFeedbackFlow(context);
    setMakeupFeedbackResult(null);
    setPendingFeedbackContext(context);
    setIsFeedbackSheetVisible(true);
  }, [beginMakeupFeedbackFlow, setMakeupFeedbackResult]);

  const handleStartCorrection = React.useCallback((
    context: MakeupJourneyCorrectionContext,
  ) => {
    trackMakeupJourneyEvent({
      name: 'makeup_journey_correction_started',
      properties: {},
    });
    beginJourneyFeedback({
      entryDate: context.entryDate,
      feedbackKind: 'correction',
      inheritedGoalContext: normalizeInheritedMakeupFeedbackContext(
        context.inheritedGoalContext,
      ),
      origin: 'journeyDay',
      parentFeedbackReportId: context.parentFeedbackReportId,
      parentScore: context.parentScore,
    });
  }, [beginJourneyFeedback]);

  const handleStartInitial = React.useCallback((entryDate: string) => {
    beginJourneyFeedback(getMakeupJourneyEmptyDayFeedbackContext(entryDate));
  }, [beginJourneyFeedback]);

  const closeFeedbackSheet = React.useCallback(() => {
    setIsFeedbackSheetVisible(false);
    setPendingFeedbackContext(null);
    clearMakeupFeedbackFlowContext();
  }, [clearMakeupFeedbackFlowContext]);

  const selectPhotoSource = React.useCallback((photoSource: 'camera' | 'gallery') => {
    if (!pendingFeedbackContext) {
      closeFeedbackSheet();
      return;
    }

    setIsFeedbackSheetVisible(false);
    setPendingFeedbackContext(null);

    if (photoSource === 'camera') {
      beginMakeupFeedbackFlow(pendingFeedbackContext);
      setSelectedMakeupFeedbackPhoto(
        applyMakeupFeedbackJourneyContext(
          {photoSource},
          pendingFeedbackContext,
        ),
      );
      requestAnimationFrame(() => {
        navigation.navigate('MakeupFeedbackCapture');
      });
      return;
    }

    const {pickMakeupFeedbackPhotoFromLibrary} = loadMakeupPhotoPicker();
    void pickMakeupFeedbackPhotoFromLibrary().then(selection => {
      if (!selection) {
        return;
      }
      beginMakeupFeedbackFlow(pendingFeedbackContext);
      setSelectedMakeupFeedbackPhoto(
        applyMakeupFeedbackJourneyContext(
          selection,
          pendingFeedbackContext,
        ),
      );
      navigation.navigate('FaceCaptureConfirmation', {
        target: 'makeupFeedback',
      });
    });
  }, [
    beginMakeupFeedbackFlow,
    closeFeedbackSheet,
    navigation,
    pendingFeedbackContext,
    setSelectedMakeupFeedbackPhoto,
  ]);

  if (!isMakeupJourneyEntryDateRouteParam(entryDate)) {
    return (
      <RoutePlaceholder
        description="날짜 형식이 올바르지 않아 기록을 열 수 없어요."
        onBack={() => navigation.reset(getMakeupJourneyTabResetState())}
        title="메이크업 성장"
      />
    );
  }

  if (!isMakeupJourneyEnabled()) {
    return (
      <RoutePlaceholder
        description="메이크업 성장 기능이 현재 비활성화되어 있어요."
        onBack={() => navigation.reset(getHomeTabResetState())}
        title="메이크업 성장"
      />
    );
  }

  return (
    <>
      <MakeupJourneyDayDetailScreen
        entryDate={entryDate}
        onBackToCalendar={returnToCalendar}
        onChangeDate={nextEntryDate => {
          navigation.setParams({entryDate: nextEntryDate});
        }}
        onFirstReportActiveChange={setIsFirstReportActive}
        onOpenReport={reportId => {
          navigation.navigate('MakeupFeedbackResult', {
            entryDate,
            reportId,
            returnTo: 'makeupJourney',
          });
        }}
        onOpenTrend={entryDate => {
          navigation.navigate('MakeupJourneyTrend', {entryDate});
        }}
        onStartCorrection={handleStartCorrection}
        onStartInitial={handleStartInitial}
      />
      <MakeupFeedbackActionSheet
        isVisible={isFeedbackSheetVisible}
        onClose={closeFeedbackSheet}
        onPressCamera={() => selectPhotoSource('camera')}
        onPressUpload={() => selectPhotoSource('gallery')}
      />
    </>
  );
}

export function MakeupJourneyTrendRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupJourneyTrend'>) {
  const entryDate = route.params?.entryDate;
  const returnToDetail = React.useCallback(() => {
    if (getMakeupJourneyTrendBackBehavior(navigation.canGoBack()) === 'goBack') {
      navigation.goBack();
      return;
    }
    navigation.reset(
      isMakeupJourneyEntryDateRouteParam(entryDate)
        ? getMakeupJourneyDayResetState(entryDate)
        : getMakeupJourneyTabResetState(),
    );
  }, [entryDate, navigation]);

  if (!isMakeupJourneyEntryDateRouteParam(entryDate)) {
    return (
      <RoutePlaceholder
        description="날짜 형식이 올바르지 않아 성장 그래프를 열 수 없어요."
        onBack={() => navigation.reset(getMakeupJourneyTabResetState())}
        title="성장 그래프"
      />
    );
  }

  if (!isMakeupJourneyEnabled()) {
    return (
      <RoutePlaceholder
        description="메이크업 성장 기능이 현재 비활성화되어 있어요."
        onBack={() => navigation.reset(getHomeTabResetState())}
        title="성장 그래프"
      />
    );
  }

  return (
    <MakeupJourneyTrendScreen
      entryDate={entryDate}
      initialRange={getMakeupJourneyInitialTrendRangeRouteParam(route.params.range)}
      onBackToDetail={returnToDetail}
    />
  );
}
