import React from 'react';

import {getMockRecommendationResult} from '../../../shared/services/makeupGuideService';
import {MakeupRecommendationResultScreen} from './MakeupRecommendationResultScreen';

<MakeupRecommendationResultScreen
  onBack={() => undefined}
  onSave={() => undefined}
  onShare={() => undefined}
  onStartARGuide={() => undefined}
  result={getMockRecommendationResult()}
/>;
