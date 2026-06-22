import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';

export function AppRoot() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <FaceCaptureScreen />
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
