import type {GuideMode} from '../shared/types/makeupGuide';

type FooterTabKey = 'home' | 'capture' | 'custom';
export type AppShellHeaderVariant = 'home' | 'custom' | 'default';
export type AppShellHeaderCopy = {
  subtitle: 'MAKEUP GUIDE' | 'AI PRODUCT MATCH';
  title: 'AI AR Makeup' | '추천 제품';
};
export const appScreens = [
  'login',
  'tutorial',
  'home',
  'faceCapture',
  'imageAnalysisLoading',
  'arMakeupFilter',
  'arFilterLocation',
  'arFilterStyle',
  'custom',
  'myPage',
  'profileEdit',
  'imageAnalysisReportsList',
  'imageAnalysisReportDetail',
  'makeupStyleList',
  'likedProductList',
  'feedbackEntry',
  'feedbackCapture',
  'feedbackGuide',
  'feedbackLoading',
  'feedbackResult',
  'feedbackTip',
  'filterUpload',
  'filterLoading',
  'filterResult',
  'filterTryOn',
  'filterSave',
  'filterSaved',
  'filterRecipeDetail',
  'recipeSaved',
] as const;
export type AppScreenKey = (typeof appScreens)[number];
export type ScreenChrome = 'shell' | 'header' | 'fullscreen';
export type FooterTabTargetScreen = 'home' | 'arMakeupFilter' | 'custom';
export type ImageAnalysisReportCreateFilterTargetScreen = 'arFilterStyle';
export type ImageAnalysisReportCloseTargetScreen = 'home';
export type ImageAnalysisLoadingCompleteTargetScreen = 'imageAnalysisReportDetail';
export type HomeFaceDiagnosisTargetScreen = 'tutorial';
export type SavedContentTargetScreen = 'myPage';

export const screenChromeByScreen = {
  login: 'fullscreen',
  tutorial: 'fullscreen',
  home: 'shell',
  faceCapture: 'fullscreen',
  imageAnalysisLoading: 'header',
  arMakeupFilter: 'fullscreen',
  arFilterLocation: 'fullscreen',
  arFilterStyle: 'fullscreen',
  custom: 'shell',
  myPage: 'shell',
  profileEdit: 'header',
  imageAnalysisReportsList: 'header',
  imageAnalysisReportDetail: 'header',
  makeupStyleList: 'header',
  likedProductList: 'header',
  feedbackEntry: 'fullscreen',
  feedbackCapture: 'fullscreen',
  feedbackGuide: 'fullscreen',
  feedbackLoading: 'fullscreen',
  feedbackResult: 'fullscreen',
  feedbackTip: 'fullscreen',
  filterUpload: 'header',
  filterLoading: 'fullscreen',
  filterResult: 'header',
  filterTryOn: 'fullscreen',
  filterSave: 'header',
  filterSaved: 'fullscreen',
  filterRecipeDetail: 'header',
  recipeSaved: 'fullscreen',
} as const satisfies Record<AppScreenKey, ScreenChrome>;

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

export function getScreenChrome(screen: AppScreenKey): ScreenChrome {
  return screenChromeByScreen[screen];
}

export function getScreensByChrome(chrome: ScreenChrome): AppScreenKey[] {
  return appScreens.filter((screen) => screenChromeByScreen[screen] === chrome);
}
