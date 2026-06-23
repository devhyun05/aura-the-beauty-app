import React from 'react';

import {getMockFacialAnalysisResult} from '../../../shared/services/facialAnalysisResultService';
import {FacialAnalysisResultScreen} from './FacialAnalysisResultScreen';

<FacialAnalysisResultScreen
  onBack={() => undefined}
  onSave={() => undefined}
  onShare={() => undefined}
  onStartARGuide={() => undefined}
  result={getMockFacialAnalysisResult()}
/>;
