import React from 'react';

import {
  AuradinSearchScreen,
  LikedProductListScreen,
  MakeupLookListScreen,
  ProductRecommendationScreen,
} from '../../../features/recommendation';
import {getRecommendedFilterRouteParams} from '../../../features/home';
import {
  getLikedMakeupFilterLooks,
  mergeSavedAndLikedMakeupLooks,
} from '../../../shared/services/makeupGuideService';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {
  navigateMainTab,
  type RootScreenProps,
} from './routeUtils';

export function ProductRecommendationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ProductRecommendation'>) {
  const {selectedFaceAnalysisReport} = useNavigationFlowState();
  const sourceReportId = route.params?.reportId ?? selectedFaceAnalysisReport?.id ?? null;

  return (
    <DetailRouteChrome
      routeName="ProductRecommendation"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <ProductRecommendationScreen
        onCapturePhoto={() =>
          navigation.navigate('FaceCapture', {afterAnalysisRoute: 'ProductRecommendation'})
        }
        onPickGalleryPhoto={() =>
          navigation.navigate('FaceCapture', {
            afterAnalysisRoute: 'ProductRecommendation',
            initialSource: 'gallery',
          })
        }
        sourceReportId={sourceReportId}
      />
    </DetailRouteChrome>
  );
}

// AURADIN 검색 — 자체 글라스 지반·워드마크를 갖는 풀스크린 경험 (DetailRouteChrome 미사용).
// EXPO_PUBLIC_AURADIN_DEMO_DRIVE(질의 텍스트)가 설정되면 검색→상세→다이얼→상세 시퀀스를
// 탭과 동일한 핸들러로 자동 구동한다 (시뮬레이터 QA·데모용, 기본 미설정 = 영향 없음).
const DEMO_DRIVE_PROMPT = process.env.EXPO_PUBLIC_AURADIN_DEMO_DRIVE;
const DEMO_DRIVE_STEPS: Array<{delayMs: number; step: Record<string, string>}> = [
  {delayMs: 6000, step: {prompt: DEMO_DRIVE_PROMPT ?? '', ts: 'demo-1'}},
  {delayMs: 22000, step: {open: 'discovery', ts: 'demo-2'}},
  {delayMs: 30000, step: {dial: 'more_diverse', ts: 'demo-3'}},
  {delayMs: 38000, step: {open: 'anchor', ts: 'demo-4'}},
];

export function AuradinSearchRouteScreen({route}: RootScreenProps<'AuradinSearch'>) {
  const [drive, setDrive] = React.useState(route.params);

  React.useEffect(() => {
    if (route.params) {
      setDrive(route.params);
    }
  }, [route.params]);

  React.useEffect(() => {
    if (!DEMO_DRIVE_PROMPT) {
      return;
    }
    const timers = DEMO_DRIVE_STEPS.map(({delayMs, step}) =>
      setTimeout(() => setDrive(step), delayMs),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return <AuradinSearchScreen drive={drive} />;
}

export function MakeupLookListRouteScreen({
  navigation,
}: RootScreenProps<'MakeupLookList'>) {
  const {
    likedMakeupFilterIds,
    savedMakeupLook,
    savedMakeupLooks,
    setSelectedRecommendedMakeupFilterId,
  } = useNavigationFlowState();
  const likedMakeupLooks = React.useMemo(
    () => getLikedMakeupFilterLooks(likedMakeupFilterIds),
    [likedMakeupFilterIds],
  );
  const savedAndLikedMakeupLooks = React.useMemo(() => {
    return mergeSavedAndLikedMakeupLooks({
      likedMakeupLooks,
      savedMakeupLook,
      savedMakeupLooks,
    });
  }, [likedMakeupLooks, savedMakeupLook, savedMakeupLooks]);
  const handleMakeupLookPress = React.useCallback(
    (makeupLook: (typeof savedAndLikedMakeupLooks)[number]) => {
      const filterId = makeupLook.makeupPresetValues.sourceFilterId;

      if (!filterId) {
        return;
      }

      setSelectedRecommendedMakeupFilterId(filterId);
      navigation.navigate('ARFilter', getRecommendedFilterRouteParams(filterId));
    },
    [navigation, setSelectedRecommendedMakeupFilterId],
  );

  return (
    <DetailRouteChrome
      routeName="MakeupLookList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <MakeupLookListScreen
        likedMakeupLooks={savedAndLikedMakeupLooks}
        onPressMakeupLook={handleMakeupLookPress}
      />
    </DetailRouteChrome>
  );
}

export function LikedProductListRouteScreen({
  navigation,
}: RootScreenProps<'LikedProductList'>) {
  return (
    <DetailRouteChrome
      routeName="LikedProductList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <LikedProductListScreen />
    </DetailRouteChrome>
  );
}
