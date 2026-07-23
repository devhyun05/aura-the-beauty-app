import {AppRoot} from './src/app/AppRoot';

const experimentApp = process.env.EXPO_PUBLIC_AURA_EXPERIMENT_APP;

function selectApp() {
  if (experimentApp === 'personal-color-lab') {
    return require('./src/app/experiments/PersonalColorLabApp').PersonalColorLabApp as
      typeof import('./src/app/experiments/PersonalColorLabApp').PersonalColorLabApp;
  }
  if (experimentApp === 'personal-color-repeatability-lab') {
    return require('./src/app/experiments/PersonalColorRepeatabilityLabApp')
      .PersonalColorRepeatabilityLabApp as
      typeof import('./src/app/experiments/PersonalColorRepeatabilityLabApp').PersonalColorRepeatabilityLabApp;
  }
  return AppRoot;
}

export default selectApp();
