import {registerRootComponent} from 'expo';
import {LogBox} from 'react-native';

import './src/shared/dev/disableDevRefreshBanner';

import App from './App';

LogBox.ignoreAllLogs(true);

registerRootComponent(App);
