import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import {MakeupCorrectionGuideOverlayScreen} from './MakeupCorrectionGuideOverlayScreen';

const result = createMockMakeupFeedback({photoSource: 'gallery'});

<MakeupCorrectionGuideOverlayScreen onBack={() => undefined} result={result} />;
