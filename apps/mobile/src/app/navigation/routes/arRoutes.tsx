import React from 'react';

import {ARFilterLocationAdjustScreen} from '../../../features/ar/screens/ARFilterLocationAdjustScreen';
import {ARFilterScreen} from '../../../features/ar/screens/ARFilterScreen';
import {ARFilterStyleAdjustScreen} from '../../../features/ar/screens/ARFilterStyleAdjustScreen';
import type {GuideMode} from '../../../shared/types/makeupGuide';
import {navigateARBack, navigateMainTab, type RootScreenProps} from './routeUtils';

const DEFAULT_AR_GUIDE_MODE: GuideMode = 'basic';

export function ARFilterRouteScreen({navigation}: RootScreenProps<'ARFilter'>) {
  return (
    <ARFilterScreen
      initialGuideMode={DEFAULT_AR_GUIDE_MODE}
      onBack={() => navigateMainTab(navigation, 'HomeTab')}
      onComplete={() => navigateMainTab(navigation, 'HomeTab')}
      onOpenShapeAdjust={() => navigation.navigate('ARFilterLocationAdjust')}
      onSave={() => navigation.navigate('FilterSaveForm')}
    />
  );
}

export function ARFilterLocationAdjustRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterLocationAdjust'>) {
  return (
    <ARFilterLocationAdjustScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={() => navigation.navigate('ARFilter')}
    />
  );
}

export function ARFilterStyleAdjustRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterStyleAdjust'>) {
  return (
    <ARFilterStyleAdjustScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={() => navigation.navigate('ARFilter')}
    />
  );
}