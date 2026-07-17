import {registerRootComponent} from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import {LogBox} from 'react-native';

import './src/shared/dev/disableDevRefreshBanner';

import App from './App';

LogBox.ignoreAllLogs(true);

if (!process.env.EXPO_PUBLIC_AURA_EXPERIMENT_APP) {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined);
}

registerRootComponent(App);
