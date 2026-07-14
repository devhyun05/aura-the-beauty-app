import {selectCognitoRedirectUri} from './cognitoRedirectUri';

function expectEqual(actual: string, expected: string, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

const expoGoRedirectUri = 'exp://172.21.100.173:8081/--/auth/callback';
const nativeRedirectUri = 'aiarmakeup://auth/callback';

expectEqual(
  selectCognitoRedirectUri({automaticRedirectUri: expoGoRedirectUri}),
  expoGoRedirectUri,
  'Expo Go uses its generated LAN callback when no override exists',
);

expectEqual(
  selectCognitoRedirectUri({
    automaticRedirectUri: expoGoRedirectUri,
    configuredRedirectUri: 'exp://192.168.0.20:8081/--/auth/callback',
  }),
  expoGoRedirectUri,
  'an override is ignored unless it is explicitly enabled',
);


expectEqual(
  selectCognitoRedirectUri({
    automaticRedirectUri: expoGoRedirectUri,
    allowConfiguredOverride: true,
    configuredRedirectUri: ' exp://192.168.0.20:8081/--/auth/callback ',
  }),
  'exp://192.168.0.20:8081/--/auth/callback',
  'Expo Go accepts an explicit Expo Go override',
);

expectEqual(
  selectCognitoRedirectUri({
    automaticRedirectUri: nativeRedirectUri,
    allowConfiguredOverride: true,
    configuredRedirectUri: expoGoRedirectUri,
  }),
  nativeRedirectUri,
  'native builds ignore a LAN-only Expo Go override',
);

expectEqual(
  selectCognitoRedirectUri({
    automaticRedirectUri: expoGoRedirectUri,
    allowConfiguredOverride: true,
    configuredRedirectUri: nativeRedirectUri,
  }),
  expoGoRedirectUri,
  'Expo Go ignores a native-only override',
);

expectEqual(
  selectCognitoRedirectUri({
    automaticRedirectUri: nativeRedirectUri,
    allowConfiguredOverride: true,
    configuredRedirectUri: 'https://auth.example.com/mobile/callback',
  }),
  'https://auth.example.com/mobile/callback',
  'native builds accept an explicit non-Expo callback override',
);
