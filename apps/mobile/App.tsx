import {AppRoot} from './src/app/AppRoot';
import {FaceCaptureLabApp} from './src/app/experiments/FaceCaptureLabApp';

const isFaceCaptureLab =
  process.env.EXPO_PUBLIC_AURA_EXPERIMENT_APP === 'face-capture-lab';

export default isFaceCaptureLab ? FaceCaptureLabApp : AppRoot;
