import React from 'react';

import {RoutePlaceholder} from '../../../shared/ui';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

export function AppSettingsRouteScreen({
  navigation,
}: RootScreenProps<'AppSettings'>) {
  return (
    <DetailRouteChrome
      routeName="AppSettings"
      onBack={() => navigateMainTab(navigation, 'HomeTab')}>
      <RoutePlaceholder
        description="앱 환경설정 기능을 준비 중이에요."
        showHeader={false}
        title="앱 환경설정"
      />
    </DetailRouteChrome>
  );
}
