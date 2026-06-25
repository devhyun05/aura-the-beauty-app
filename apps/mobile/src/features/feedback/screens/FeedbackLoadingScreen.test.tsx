import React from 'react';

import type {FeedbackPhotoSelection} from '../types';
import {FeedbackLoadingScreen} from './FeedbackLoadingScreen';

const selection = {source: 'camera'} satisfies FeedbackPhotoSelection;

<FeedbackLoadingScreen
  onBack={() => undefined}
  onComplete={() => undefined}
  selection={selection}
/>;
