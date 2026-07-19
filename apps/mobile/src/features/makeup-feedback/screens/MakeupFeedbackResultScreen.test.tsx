import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import {MakeupFeedbackResultScreen} from './MakeupFeedbackResultScreen';

const result = createMockMakeupFeedback({photoSource: 'camera'});

<MakeupFeedbackResultScreen
  onOpenMakeupJourney={() => undefined}
  result={result}
/>;
