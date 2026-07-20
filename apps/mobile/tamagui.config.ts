import {defaultConfig} from '@tamagui/config/v4';
import {createTamagui} from 'tamagui';

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  settings: {
    ...defaultConfig.settings,
    // v4 default is `true`, which rejects full-name inline style props (e.g.
    // `textAlign`, `flexShrink`) and only accepts shorthands. Allow both forms.
    // Type-level only — no runtime change; existing `style={{}}` usage unaffected.
    onlyAllowShorthands: false,
  },
});

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
