import React from 'react';

import {ARFilterScreen} from '../../../features/ar/screens/ARFilterScreen';
import {ARFilterShapeAdjustScreen} from '../../../features/ar/screens/ARFilterShapeAdjustScreen';
import {MakeupFilterEditScreen} from '../../../features/ar/screens/MakeupFilterEditScreen';
import type {GuideMode} from '../../../shared/types/makeupGuide';
import {navigateARBack, navigateMainTab, type RootScreenProps} from './routeUtils';

const DEFAULT_AR_GUIDE_MODE: GuideMode = 'basic';

export function ARFilterRouteScreen({navigation}: RootScreenProps<'ARFilter'>) {
  return (
    <ARFilterScreen
      initialGuideMode={DEFAULT_AR_GUIDE_MODE}
      onBack={() => navigateMainTab(navigation, 'HomeTab')}
      onComplete={() => navigateMainTab(navigation, 'HomeTab')}
      onOpenShapeAdjust={() => navigation.navigate('ARFilterShapeAdjust')}
      onSave={() => navigation.navigate('MakeupFilterSave')}
    />
  );
}

export function ARFilterShapeAdjustRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ARFilterShapeAdjust'>) {
  return (
    <ARFilterShapeAdjustScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={() => navigation.navigate('ARFilter')}
    />
  );
}

export function MakeupFilterEditRouteScreen({
  navigation,
  route,
}: RootScreenProps<'MakeupFilterEdit'>) {
  return (
    <MakeupFilterEditScreen
      onBack={() => navigateARBack(navigation, route.params?.backRoute)}
      onSave={() => navigation.navigate('ARFilter')}
    />
  );
}
