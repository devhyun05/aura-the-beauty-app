import React from 'react';

import {
  AuradinSearchScreen,
  LikedProductListScreen,
  MakeupLookListScreen,
  ProductRecommendationScreen,
} from '../../../features/recommendation';
import {getRecommendedFilterRouteParams} from '../../../features/home';
import {isAuradinPrimarySurfaceEnabled} from '../../../shared/config/featureFlags';
import {getFaceAnalysisReportById} from '../../../shared/services/faceAnalysisService';
import {
  getLikedMakeupFilterLooks,
  mergeSavedAndLikedMakeupLooks,
} from '../../../shared/services/makeupGuideService';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {
  resolveAuradinLandingReport,
  type AuradinLandingReport,
} from './auradinLandingReport';
import {
  navigateMainTab,
  type RootScreenProps,
} from './routeUtils';

// R1(B1) 표면 전환 — auradinPrimarySurface가 켜지면 얼굴분석 완료·리포트 상세의 추천
// 랜딩을 Auradin(personalColor 자동 첨부)으로 바꾼다. 진입 경로 전부가 이 라우트로
// 수렴하므로 분기는 여기 1지점이다. 기본 false — 레거시 유지 (§13 R1).
export function ProductRecommendationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ProductRecommendation'>) {
  const {selectedFaceAnalysisReport} = useNavigationFlowState();
  const sourceReportId = route.params?.reportId ?? selectedFaceAnalysisReport?.id ?? null;

  if (isAuradinPrimarySurfaceEnabled()) {
    return (
      <AuradinPrimaryLandingScreen
        paramReportId={route.params?.reportId ?? null}
        selectedReport={selectedFaceAnalysisReport}
      />
    );
  }

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

// R1 게이트 2: Auradin 랜딩의 리포트 첨부 해석.
// AuradinSearchScreen은 마운트 시점에만 availableReport를 첨부로 시드하므로,
// 과거 리포트 상세 → 추천 진입(fetch 필요)은 personalColor 해석이 끝난 뒤 마운트한다.
function AuradinPrimaryLandingScreen({
  paramReportId,
  selectedReport,
}: {
  paramReportId: string | null;
  selectedReport: {id: string; personalColor?: string | null} | null;
}) {
  const resolution = resolveAuradinLandingReport(paramReportId, selectedReport);
  const fetchReportId = resolution.kind === 'fetch' ? resolution.reportId : null;
  const [fetchedReport, setFetchedReport] = React.useState<AuradinLandingReport | null>(null);
  const [resolving, setResolving] = React.useState(fetchReportId != null);

  React.useEffect(() => {
    if (!fetchReportId) {
      return undefined;
    }

    let alive = true;
    getFaceAnalysisReportById(fetchReportId)
      .then(report => {
        if (alive && report?.personalColor) {
          setFetchedReport({id: report.id, personalColor: report.personalColor});
        }
      })
      .catch(() => {
        // 상세 조회 실패 → 첨부 없이 진입 (broad 흐름, 검색 자체는 정상 동작)
      })
      .finally(() => {
        if (alive) {
          setResolving(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [fetchReportId]);

  if (resolving) {
    return null; // 짧은 상세 GET 동안 대기 — 첨부 시드가 마운트 시점에 확정돼야 한다
  }

  const availableReport = resolution.kind === 'ready' ? resolution.report : fetchedReport;

  return <AuradinSearchScreen availableReport={availableReport} />;
}

// AURADIN 검색 — 자체 글라스 지반·워드마크를 갖는 풀스크린 경험 (DetailRouteChrome 미사용).
// EXPO_PUBLIC_AURADIN_DEMO_DRIVE(질의 텍스트)가 설정되면 검색→상세→다이얼→상세 시퀀스를
// 탭과 동일한 핸들러로 자동 구동한다 (시뮬레이터 QA·데모 전용).
// __DEV__ 가드 — 릴리즈/실기기 테스트 빌드에는 절대 반영되지 않는다 (실기기 이슈: 데모가 홈을 강탈).
const DEMO_DRIVE_PROMPT = __DEV__ ? process.env.EXPO_PUBLIC_AURADIN_DEMO_DRIVE : undefined;
const DEMO_DRIVE_STEPS: Array<{delayMs: number; step: Record<string, string>}> = [
  {delayMs: 6000, step: {prompt: DEMO_DRIVE_PROMPT ?? '', ts: 'demo-1'}},
  {delayMs: 22000, step: {open: 'discovery', ts: 'demo-2'}},
  {delayMs: 30000, step: {dial: 'more_diverse', ts: 'demo-3'}},
  {delayMs: 38000, step: {open: 'anchor', ts: 'demo-4'}},
];

export function AuradinSearchRouteScreen({route}: RootScreenProps<'AuradinSearch'>) {
  const [drive, setDrive] = React.useState(route.params);
  // 리포트 첨부: nav state의 선택된 얼굴분석 리포트 → availableReport (첨부 트레이가 소비).
  const {selectedFaceAnalysisReport} = useNavigationFlowState();
  const availableReport = React.useMemo(
    () =>
      selectedFaceAnalysisReport?.personalColor
        ? {id: selectedFaceAnalysisReport.id, personalColor: selectedFaceAnalysisReport.personalColor}
        : null,
    [selectedFaceAnalysisReport],
  );

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

  return <AuradinSearchScreen availableReport={availableReport} drive={drive} />;
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
