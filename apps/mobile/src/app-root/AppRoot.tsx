import React, {useState} from 'react';
import {useFonts} from 'expo-font';
import {StatusBar} from 'expo-status-bar';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {TamaguiProvider, YStack} from 'tamagui';

import {tamaguiConfig} from '../../tamagui.config';
import {LoginScreen} from '../features/auth';
import {FaceCaptureScreen} from '../features/face-capture/screens/FaceCaptureScreen';
import {colors, typography} from '../shared/theme';
import {AppFooter, AppHeader, type FooterTabKey} from '../shared/ui';

type AppScreen = 'login' | 'home' | 'faceCapture' | 'custom';

export function AppRoot() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>('login');
  const [fontsLoaded] = useFonts({
    'NixieOne-Regular': require('../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../assets/fonts/Pretendard-Bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  const handleFooterTabPress = (tab: FooterTabKey) => {
    if (tab === 'capture') {
      setActiveScreen('faceCapture');
      return;
    }

    setActiveScreen(tab);
  };

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        {activeScreen === 'login' ? (
          <>
            <StatusBar style="dark" />
            <LoginScreen onLoginSuccess={() => setActiveScreen('home')} />
          </>
        ) : activeScreen === 'faceCapture' ? (
          <FaceCaptureScreen onClose={() => setActiveScreen('home')} />
        ) : (
          <AppShell activeTab={activeScreen} onTabPress={handleFooterTabPress} />
        )}
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

function AppShell({
  activeTab,
  onTabPress,
}: {
  activeTab: Exclude<AppScreen, 'login' | 'faceCapture'>;
  onTabPress: (tab: FooterTabKey) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <YStack style={styles.screen}>
      <StatusBar style="dark" />
      <AppHeader topInset={insets.top} />
      <YStack style={styles.body} />
      <AppFooter activeTab={activeTab} bottomInset={insets.bottom} onTabPress={onTabPress} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  body: {
    flex: 1,
  },
});
