import React from 'react';

import StencilARApp from '../../../features/ar/stencil/StencilARApp';
import {
  goBackToPreviousOrMainTab,
  type RootScreenProps,
} from './routeUtils';

// AR 필터는 스텐실 경험 하나로 통일됐다. recommendedLook(추천·프리셋 룩 주입)이
// 있으면 그 룩을 시작 상태로 얹고, 없으면 맨얼굴 라이브로 연다. 과거의
// ARFilterScreen 독립 화면과 recipe-v2 맞춤 조정 플로우(UnityMakeupCapture →
// MakeupFilterEdit)는 진입점이 모두 사라져 제거됐다 — 분석 기반 룩 생성이 다시
// 필요하면 스텐실 recommendedLook 주입 위에 새로 얹는다.
export function ARFilterRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilter'>) {
  const initialLook = route.params?.recommendedLook;
  if (__DEV__) {
    console.info('[aura:ar-filter] route:render', {
      source: route.params?.source ?? 'direct',
      hasInitialLook: Boolean(initialLook),
      label: initialLook?.label,
      paramKeys: Object.keys(initialLook?.params ?? {}),
      eyeshadowLayerCount: initialLook?.eyeshadowLayers?.length ?? 0,
    });
  }

  React.useEffect(() => {
    if (!__DEV__) return;
    console.info('[aura:ar-filter] route:received', {
      source: route.params?.source ?? 'direct',
      hasInitialLook: Boolean(initialLook),
      label: initialLook?.label,
      paramKeys: Object.keys(initialLook?.params ?? {}),
      eyeshadowLayerCount: initialLook?.eyeshadowLayers?.length ?? 0,
    });
  }, [initialLook, route.params?.source]);

  return (
    <StencilARApp
      initialLook={route.params?.recommendedLook}
      onBack={() => goBackToPreviousOrMainTab(navigation, 'HomeTab')}
    />
  );
}
