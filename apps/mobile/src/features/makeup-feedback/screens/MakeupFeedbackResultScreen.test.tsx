import React from 'react';

import {createMockMakeupFeedback} from '../mocks/makeupFeedback.mock';
import {MakeupFeedbackResultScreen} from './MakeupFeedbackResultScreen';

const result = createMockMakeupFeedback({photoSource: 'camera'});

<MakeupFeedbackResultScreen
  onBack={() => undefined}
  onOpenGuide={() => undefined}
  onOpenTip={() => undefined}
  onRetake={() => undefined}
  onUploadAgain={() => undefined}
  result={result}
/>;
