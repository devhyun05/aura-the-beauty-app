import type {GuideMode} from '../shared/types/makeupGuide';

type FooterTabKey = 'home' | 'capture' | 'custom';
export type FooterTabTargetScreen = 'home' | 'arMakeupFilter' | 'custom';
export type AnalysisReportCreateFilterTargetScreen = 'arFilterStyle';
export type AnalysisLoadingCompleteTargetScreen = 'analysisReportDetail';
export type HomeFaceDiagnosisTargetScreen = 'tutorial';

export function getARMakeupFilterInitialGuideMode(): GuideMode {
  return 'basic';
}

export function getAnalysisReportCreateFilterTargetScreen(): AnalysisReportCreateFilterTargetScreen {
  return 'arFilterStyle';
}

export function getAnalysisLoadingCompleteTargetScreen(): AnalysisLoadingCompleteTargetScreen {
  return 'analysisReportDetail';
}

export function getHomeFaceDiagnosisTargetScreen(): HomeFaceDiagnosisTargetScreen {
  return 'tutorial';
}

export function getFooterTabTargetScreen(tab: FooterTabKey): FooterTabTargetScreen {
  if (tab === 'capture') {
    return 'arMakeupFilter';
  }

  return tab;
}
