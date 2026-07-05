import {AppRoot} from './src/app/AppRoot';
import {FaceCaptureLabApp} from './src/app/experiments/FaceCaptureLabApp';
import {PersonalColorLabApp} from './src/app/experiments/PersonalColorLabApp';
import {PersonalColorRepeatabilityLabApp} from './src/app/experiments/PersonalColorRepeatabilityLabApp';

const experimentApp = process.env.EXPO_PUBLIC_AURA_EXPERIMENT_APP;

function selectApp() {
  if (experimentApp === 'face-capture-lab') {
    return FaceCaptureLabApp;
  }
  if (experimentApp === 'personal-color-lab') {
    return PersonalColorLabApp;
  }
  if (experimentApp === 'personal-color-repeatability-lab') {
    return PersonalColorRepeatabilityLabApp;
  }
  return AppRoot;
}

export default selectApp();
