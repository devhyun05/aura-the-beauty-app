import React from 'react';

import {
  BeardSimulationNavigator,
  prewarmBeardSimulation,
  realBeardSimulationService,
} from '../../../features/beard-simulation';
import {useAiDataConsent} from '../../../features/legal/services/aiDataConsentContext';
import {goBackToPreviousOrMainTab, type RootScreenProps} from './routeUtils';

// 수염 제거 플로우는 자체 프로바이더 + 내부 네이티브 스택을 갖는 완결형 네비게이터라
// 풀스크린으로 렌더한다(DetailRouteChrome 미사용, AuradinSearch와 동일 패턴).
// 실제 백엔드(subsystem B/C)에 연결된 realBeardSimulationService를 주입한다.
export function BeardSimulationRouteScreen({
  navigation,
}: RootScreenProps<'BeardSimulation'>) {
  const {requestAiDataConsent} = useAiDataConsent();
  const [isAllowed, setIsAllowed] = React.useState(false);

  // Flow 진입 시 beard Lambda를 미리 데워 콜드스타트를 감춘다(fire-and-forget, 실패 무시).
  React.useEffect(() => {
    prewarmBeardSimulation();
    void requestAiDataConsent().then(accepted => {
      if (accepted) {
        setIsAllowed(true);
      } else {
        goBackToPreviousOrMainTab(navigation, 'HomeTab');
      }
    });
  }, [navigation, requestAiDataConsent]);

  return isAllowed
    ? <BeardSimulationNavigator service={realBeardSimulationService} />
    : null;
}
