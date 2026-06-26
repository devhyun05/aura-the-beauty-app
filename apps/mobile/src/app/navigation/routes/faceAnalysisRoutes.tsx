import React from 'react';

import {
  FaceAnalysisReportDetailScreen,
  FaceAnalysisReportsListScreen,
} from '../../../features/face-analysis';
import {FaceAnalysisLoadingScreen} from '../../../features/face-analysis/screens/FaceAnalysisLoadingScreen';
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

        navigation.navigate('FaceAnalysisLoading');
      }}
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
    />
  );
}

export function FaceAnalysisLoadingRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisLoading'>) {
  return (
    <DetailRouteChrome
      routeName="FaceAnalysisLoading"
      onBack={() => navigation.navigate('FaceCapture')}>
      <FaceAnalysisLoadingScreen
        onComplete={() => navigation.navigate('FaceAnalysisReportDetail')}
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportsListRouteScreen({
  navigation,
}: RootScreenProps<'FaceAnalysisReportsList'>) {
  return (
    <DetailRouteChrome
      routeName="FaceAnalysisReportsList"
      onBack={() => navigateMainTab(navigation, 'ProfileTab')}>
      <FaceAnalysisReportsListScreen
        onPressReport={reportId =>
          navigation.navigate('FaceAnalysisReportDetail', {reportId})
        }
      />
    </DetailRouteChrome>
  );
}

export function FaceAnalysisReportDetailRouteScreen({
  navigation,
  route,
}: RootScreenProps<'FaceAnalysisReportDetail'>) {
  const [shareAction, setShareAction] = React.useState<HeaderShareAction | null>(null);
  const handleHeaderShareActionChange = React.useCallback(
    (nextShareAction: (() => void) | null) => {
      setShareAction(nextShareAction ? {cb: nextShareAction} : null);
    },
    [],
  );

  return (
    <DetailRouteChrome
      routeName="FaceAnalysisReportDetail"
      onClose={() => navigateMainTab(navigation, 'HomeTab')}
      onShare={shareAction?.cb}
      shareDisabled={!shareAction}>
      <FaceAnalysisReportDetailScreen
        onCreateARFilter={() =>
          navigation.navigate('MakeupFilterEdit', {backRoute: 'FaceAnalysisReportDetail'})
        }
        onHeaderShareActionChange={handleHeaderShareActionChange}
        reportId={route.params?.reportId ?? null}
      />
    </DetailRouteChrome>
  );
}
