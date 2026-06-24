import type {GuideMode} from '../shared/types/makeupGuide';

type FooterTabKey = 'home' | 'capture' | 'custom';
export type AppShellHeaderVariant = 'home' | 'custom' | 'default';
export type AppShellHeaderCopy = {
  subtitle: 'MAKEUP GUIDE' | 'AI PRODUCT MATCH';
  title: 'AI AR Makeup' | '추천 제품';
};
export type FooterTabTargetScreen = 'home' | 'arMakeupFilter' | 'custom';
export type ImageAnalysisReportCreateFilterTargetScreen = 'arFilterStyle';
export type ImageAnalysisReportCloseTargetScreen = 'home';
export type ImageAnalysisLoadingCompleteTargetScreen = 'imageAnalysisReportDetail';
export type HomeFaceDiagnosisTargetScreen = 'tutorial';
export type SavedContentTargetScreen = 'myPage';

export function getARMakeupFilterInitialGuideMode(): GuideMode {
  return 'basic';
}

export function getAppShellHeaderCopy(
  variant: AppShellHeaderVariant,
): AppShellHeaderCopy {
  if (variant === 'custom') {
    return {
      subtitle: 'AI PRODUCT MATCH',
      title: '추천 제품',
    };
  }

  return {
    subtitle: 'MAKEUP GUIDE',
    title: 'AI AR Makeup',
  };
}

export function getImageAnalysisReportCreateFilterTargetScreen():
  ImageAnalysisReportCreateFilterTargetScreen {
  return 'arFilterStyle';
}

export function getImageAnalysisReportCloseTargetScreen(): ImageAnalysisReportCloseTargetScreen {
  return 'home';
}

export function getImageAnalysisLoadingCompleteTargetScreen():
  ImageAnalysisLoadingCompleteTargetScreen {
  return 'imageAnalysisReportDetail';
}

export function getHomeFaceDiagnosisTargetScreen(): HomeFaceDiagnosisTargetScreen {
  return 'tutorial';
}

export function getSavedContentTargetScreen(): SavedContentTargetScreen {
  return 'myPage';
}

export function getFooterTabTargetScreen(tab: FooterTabKey): FooterTabTargetScreen {
  if (tab === 'capture') {
    return 'arMakeupFilter';
  }

  return tab;
}
