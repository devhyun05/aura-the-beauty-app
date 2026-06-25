import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import {MakeupFeedbackScreen} from './MakeupFeedbackScreen';

const result = createMockMakeupFeedback({source: 'camera'});

<MakeupFeedbackScreen
  onBack={() => undefined}
  onOpenGuide={() => undefined}
  onOpenTip={() => undefined}
  onRetake={() => undefined}
  onUploadAgain={() => undefined}
  result={result}
/>;
