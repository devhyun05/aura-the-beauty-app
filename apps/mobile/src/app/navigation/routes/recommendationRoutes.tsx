import React from 'react';

import {
  AuradinSearchScreen,
  LikedProductListScreen,
  MakeupLookListScreen,
  ProductDetailScreen,
  ProductRecommendationScreen,
  ProductRecommendationShelfScreen,
  ProductSearchResultScreen,
} from '../../../features/recommendation';
import {getRecommendedFilterRouteParams} from '../../../features/home';
import {getFaceAnalysisReportById} from '../../../shared/services/faceAnalysisService';
import {
  getLikedMakeupFilterLooks,
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

// 얼굴분석 완료·리포트 상세의 추천 랜딩 (Shelf 정본 — dev 진열/스폰서십/신뢰제품 표면).
// Auradin은 이 화면의 진입점(onOpenAuradin → AuradinSearch)에서 하위 라우트로 도달하고,
// personalColor 첨부 해석(R1 게이트 2)은 AuradinSearchRouteScreen이 담당한다
// (resolveAuradinLandingReport·getFaceAnalysisReportById). 뒤로가기는 다시 이 랜딩.
export function ProductRecommendationRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ProductRecommendation'>) {
  const {selectedFaceAnalysisReport} = useNavigationFlowState();
  const sourceReportId = route.params?.reportId ?? selectedFaceAnalysisReport?.id ?? null;

  return (
    <DetailRouteChrome
      headerMode="standard"
      routeName="ProductRecommendation"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <ProductRecommendationScreen
        arStyleId={route.params?.arStyleId}
        initialSection={route.params?.initialSection}
        onCapturePhoto={() =>
          navigation.navigate('FaceCapture', {afterAnalysisRoute: 'ProductRecommendation'})
        }
        onPickGalleryPhoto={() =>
          navigation.navigate('FaceCapture', {
            afterAnalysisRoute: 'ProductRecommendation',
            initialSource: 'gallery',
          })
        }
        onCreateArLook={() => navigation.navigate('UnityMakeupCapture')}
        onOpenAuradin={() =>
          navigation.navigate(
            'AuradinSearch',
            sourceReportId ? {reportId: sourceReportId} : undefined,
          )
        }
        onOpenLikedProducts={() => navigation.navigate('LikedProductList')}
        onOpenProduct={(productId, shadeId, recommendationContext) =>
          navigation.navigate('ProductDetail', {
            productId,
            ...(shadeId ? {shadeId} : {}),
            ...(recommendationContext?.disclosureLabel
              ? {disclosureLabel: recommendationContext.disclosureLabel}
              : {}),
            ...(recommendationContext?.reasonLabels?.length
              ? {reasonLabels: recommendationContext.reasonLabels}
              : {}),
            ...(recommendationContext?.sponsored !== undefined
              ? {sponsored: recommendationContext.sponsored}
              : {}),
            ...(recommendationContext?.sponsorshipType
              ? {sponsorshipType: recommendationContext.sponsorshipType}
              : {}),
          })
        }
        onOpenShelf={(shelf, title, selectedArStyleId) =>
          navigation.navigate('ProductRecommendationShelf', {
            shelf,
            title,
            ...(selectedArStyleId ? {arStyleId: selectedArStyleId} : {}),
          })
        }
        onSearch={query => navigation.navigate('ProductSearchResult', {query})}
        sourceReportId={sourceReportId}
      />
    </DetailRouteChrome>
  );
}

// dev Shelf 라우트 — 진열/스폰서십/신뢰제품(TrustedProduct) 진입. 얼굴분석 랜딩에서
// onOpenShelf로 도달하고, 뒤로가기는 랜딩으로 복귀한다.
export function ProductRecommendationShelfRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ProductRecommendationShelf'>) {
  return (
    <DetailRouteChrome
      headerMode="standard"
      routeName="ProductRecommendationShelf"
      onBack={() => navigation.goBack()}>
      <ProductRecommendationShelfScreen
        arStyleId={route.params.arStyleId}
        initialTitle={route.params.title}
        onOpenLikedProducts={() => navigation.navigate('LikedProductList')}
        onOpenProduct={product =>
          navigation.navigate('ProductDetail', {
            productId: product.productId,
            ...(product.shadeId ? {shadeId: product.shadeId} : {}),
            ...(product.disclosureLabel ? {disclosureLabel: product.disclosureLabel} : {}),
            ...(product.reasonLabels?.length ? {reasonLabels: product.reasonLabels} : {}),
            ...(product.sponsored !== undefined ? {sponsored: product.sponsored} : {}),
            ...(product.sponsorshipType ? {sponsorshipType: product.sponsorshipType} : {}),
          })
        }
        shelf={route.params.shelf}
      />
    </DetailRouteChrome>
  );
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

export function AuradinSearchRouteScreen({navigation, route}: RootScreenProps<'AuradinSearch'>) {
  const [drive, setDrive] = React.useState(route.params);
  const {selectedFaceAnalysisReport} = useNavigationFlowState();

  // R1 게이트 2: Auradin 진입 시 리포트 첨부(personalColor) 해석. 한 곳에서
  // 동기 확보(ready) / 과거 리포트 서버 조회(fetch) / 첨부 없음을 판정한다. 과거 리포트
  // 상세로 들어온 경우(fetch)는 personalColor 해석이 끝난 뒤 AuradinSearchScreen을 마운트한다
  // — availableReport 첨부 시드가 마운트 시점에 확정돼야 하기 때문(§13 R1).
  const resolution = resolveAuradinLandingReport(
    route.params?.reportId ?? null,
    selectedFaceAnalysisReport,
  );
  const fetchReportId = resolution.kind === 'fetch' ? resolution.reportId : null;
  const [fetchedReport, setFetchedReport] = React.useState<AuradinLandingReport | null>(null);
  const [resolving, setResolving] = React.useState(fetchReportId != null);

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

  return (
    <AuradinSearchScreen
      availableReport={availableReport}
      drive={drive}
      onBack={() =>
        navigation.canGoBack()
          ? navigation.goBack()
          : navigation.navigate('ProductRecommendation')
      }
      onOpenLikedProducts={() => navigation.navigate('LikedProductList')}
      onOpenProduct={(productId, shadeId) => navigation.navigate('ProductDetail', {
        productId,
        ...(shadeId ? {shadeId} : {}),
      })}
    />
  );
}

export function ProductSearchResultRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ProductSearchResult'>) {
  return (
    <DetailRouteChrome routeName="ProductSearchResult" onBack={() => navigation.goBack()}>
      <ProductSearchResultScreen
        onOpenLikedProducts={() => navigation.navigate('LikedProductList')}
        onOpenProduct={product =>
          navigation.navigate('ProductDetail', {
            productId: product.productId,
            ...(product.shadeId ? {shadeId: product.shadeId} : {}),
            ...(product.disclosureLabel ? {disclosureLabel: product.disclosureLabel} : {}),
            ...(product.reasonLabels?.length ? {reasonLabels: product.reasonLabels} : {}),
            ...(product.sponsored !== undefined ? {sponsored: product.sponsored} : {}),
            ...(product.sponsorshipType ? {sponsorshipType: product.sponsorshipType} : {}),
          })
        }
        query={route.params.query}
      />
    </DetailRouteChrome>
  );
}

export function ProductDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ProductDetail'>) {
  const recommendationContext = React.useMemo(
    () => ({
      disclosureLabel: route.params.disclosureLabel,
      reasonLabels: route.params.reasonLabels,
      sponsored: route.params.sponsored,
      sponsorshipType: route.params.sponsorshipType,
    }),
    [
      route.params.disclosureLabel,
      route.params.reasonLabels,
      route.params.sponsored,
      route.params.sponsorshipType,
    ],
  );
  return (
    <DetailRouteChrome routeName="ProductDetail" onBack={() => navigation.goBack()}>
      <ProductDetailScreen
        onOpenLikedProducts={() => navigation.navigate('LikedProductList')}
        productId={route.params.productId}
        shadeId={route.params.shadeId}
        recommendationContext={recommendationContext}
      />
    </DetailRouteChrome>
  );
}

export function MakeupLookListRouteScreen({
  navigation,
  route,
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
  const createdMakeupLooks = React.useMemo(
    () =>
      savedMakeupLooks.length > 0
        ? savedMakeupLooks
        : savedMakeupLook
          ? [savedMakeupLook]
          : [],
    [savedMakeupLook, savedMakeupLooks],
  );
  const visibleMakeupLooks =
    route.params?.kind === 'created'
      ? createdMakeupLooks
      : likedMakeupLooks;
  const handleMakeupLookPress = React.useCallback(
    (makeupLook: (typeof visibleMakeupLooks)[number]) => {
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
        emptyLabel={
          route.params?.kind === 'created'
            ? '아직 만든 필터가 없어요.'
            : '좋아요한 메이크업 필터가 없어요.'
        }
        likedMakeupLooks={visibleMakeupLooks}
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
      <LikedProductListScreen
        onOpenProduct={(productId, shadeId) => navigation.navigate('ProductDetail', {
          productId,
          ...(shadeId ? {shadeId} : {}),
        })}
      />
    </DetailRouteChrome>
  );
}
