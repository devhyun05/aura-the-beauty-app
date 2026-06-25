import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import {FeedbackGuideOverlayScreen} from './FeedbackGuideOverlayScreen';

const result = createMockMakeupFeedback({source: 'gallery'});

<FeedbackGuideOverlayScreen onBack={() => undefined} result={result} />;
