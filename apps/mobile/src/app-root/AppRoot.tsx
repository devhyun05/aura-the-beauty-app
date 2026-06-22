import React, {useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {LoginScreen} from '../features/auth';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';

type AppScreen = 'login' | 'faceCapture';

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <>
          <StatusBar style={activeScreen === 'login' ? 'dark' : 'light'} />
          {activeScreen === 'login' ? (
            <LoginScreen onLoginSuccess={() => setActiveScreen('faceCapture')} />
          ) : (
            <FaceCaptureScreen onClose={() => setActiveScreen('login')} />
          )}
        </>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
