import React from 'react';

import type {MakeupFeedbackPhotoSelection} from '../types';
import {MakeupFeedbackLoadingScreen} from './MakeupFeedbackLoadingScreen';

const selection = {source: 'camera'} satisfies MakeupFeedbackPhotoSelection;

<MakeupFeedbackLoadingScreen
  onBack={() => undefined}
  onComplete={() => undefined}
  selection={selection}
/>;
