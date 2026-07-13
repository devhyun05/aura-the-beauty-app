import React from 'react';

import {
  AuradinSearchScreen,
  LikedProductListScreen,
  MakeupLookListScreen,
  ProductDetailScreen,
  ProductPersonalizationSettingsScreen,
  ProductRecommendationScreen,
  ProductSearchResultScreen,
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
        onOpenAuradin={() => navigation.navigate('AuradinSearch')}
        onOpenLikedProducts={() => navigation.navigate('LikedProductList')}
        onOpenPersonalizationSettings={() =>
          navigation.navigate('ProductPersonalizationSettings')
        }
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
        onSearch={query => navigation.navigate('ProductSearchResult', {query})}
        sourceReportId={sourceReportId}
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

export function ProductPersonalizationSettingsRouteScreen({
  navigation,
}: RootScreenProps<'ProductPersonalizationSettings'>) {
  return (
    <DetailRouteChrome
      routeName="ProductPersonalizationSettings"
      onBack={() => navigation.goBack()}>
      <ProductPersonalizationSettingsScreen />
    </DetailRouteChrome>
  );
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
      <LikedProductListScreen
        onOpenProduct={(productId, shadeId) => navigation.navigate('ProductDetail', {
          productId,
          ...(shadeId ? {shadeId} : {}),
        })}
      />
    </DetailRouteChrome>
  );
}
