import React from 'react';

import {
  ImageAnalysisReportDetailScreen,
  ImageAnalysisReportsListScreen,
} from '../../../features/image-analysis';
import {ImageAnalysisLoadingScreen} from '../../../features/image-analysis/screens/ImageAnalysisLoadingScreen';
import {FaceCaptureScreen} from '../../../features/face-capture/screens/FaceCaptureScreen';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';

type HeaderShareAction = {
  cb: () => void;
};

export function FaceCaptureRouteScreen({navigation}: RootScreenProps<'FaceCapture'>) {
  const {setSelectedFaceCapture} = useNavigationFlowState();

  return (
    <FaceCaptureScreen
      onCapture={result => {
        if (result) {
          setSelectedFaceCapture(result);
        }

        navigation.navigate('ImageAnalysisLoading');
      }}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
    />
  );
}

export function ImageAnalysisLoadingRouteScreen({
  navigation,
}: RootScreenProps<'ImageAnalysisLoading'>) {
  return (
    <DetailRouteChrome
      routeName="ImageAnalysisLoading"
      onBack={() => navigation.navigate('FaceCapture')}>
      <ImageAnalysisLoadingScreen
        onComplete={() => navigation.navigate('ImageAnalysisReportDetail')}
      />
    </DetailRouteChrome>
  );
}

export function ImageAnalysisReportsListRouteScreen({
  navigation,
}: RootScreenProps<'ImageAnalysisReportsList'>) {
  return (
    <DetailRouteChrome
      routeName="ImageAnalysisReportsList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <ImageAnalysisReportsListScreen
        onPressReport={reportId =>
          navigation.navigate('ImageAnalysisReportDetail', {reportId})
        }
      />
    </DetailRouteChrome>
  );
}

export function ImageAnalysisReportDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'ImageAnalysisReportDetail'>) {
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  return (
    <DetailRouteChrome
      routeName="ImageAnalysisReportDetail"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <ImageAnalysisReportDetailScreen
        onCreateARFilter={() =>
          navigation.navigate('ARFilterStyleAdjust', {backRoute: 'ImageAnalysisReportDetail'})
        }
        onHeaderShareActionChange={handleHeaderShareActionChange}
        reportId={route.params?.reportId ?? null}
      />
    </DetailRouteChrome>
  );
}