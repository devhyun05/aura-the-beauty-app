import React from 'react';
import {Alert} from 'react-native';

import {CameraFaceCaptureScreen} from '../../../features/face-capture/screens/CameraFaceCaptureScreen';
import {HairAnalysisIntroScreen} from '../../../features/hair-analysis/screens/HairAnalysisIntroScreen';
import {HairAnalysisResultScreen} from '../../../features/hair-analysis/screens/HairAnalysisResultScreen';
import {HairProgressScreen} from '../../../features/hair-analysis/screens/HairProgressScreen';
import {HairSimulationResultScreen} from '../../../features/hair-analysis/screens/HairSimulationResultScreen';
import {SavedHairSimulationsScreen} from '../../../features/hair-analysis/screens/SavedHairSimulationsScreen';
import {
  createHairAnalysisFromCapture,
  createHairClientRequestId,
  createHairSimulation,
  deleteDownloadedHairResult,
  deleteHairSimulation,
  downloadHairResult,
  getHairAnalysis,
  getHairSimulation,
  listSavedHairSimulations,
  setHairSimulationSaved,
  waitForHairAnalysis,
  waitForHairSimulation,
} from '../../../features/hair-analysis/services/hairAnalysisService';
import type {HairAnalysisJob, HairRecommendation, HairSimulation} from '../../../features/hair-analysis/types';
import {
  loadOptionalMediaLibraryModule,
  loadOptionalSharingModule,
} from '../../../shared/services/optionalNativeShareModules';
import {prefetchImageUri, prefetchTransientImageUri} from '../../../shared/services/imageCacheService';
import {DetailRouteChrome} from '../detailHeaderChrome';
import {useNavigationFlowState} from '../flowState';
import {navigateMainTab, type RootScreenProps} from './routeUtils';


export function HairAnalysisIntroRouteScreen({navigation}: RootScreenProps<'HairAnalysisIntro'>) {
  return (
    <DetailRouteChrome routeName="HairAnalysisIntro" onBack={() => navigateMainTab(navigation)}>
      <HairAnalysisIntroScreen
        onOpenSaved={() => navigation.navigate('SavedHairSimulations')}
        onStart={() => navigation.navigate('HairAnalysisCapture')}
      />
    </DetailRouteChrome>
  );
}

export function HairAnalysisCaptureRouteScreen({navigation}: RootScreenProps<'HairAnalysisCapture'>) {
  const {setSelectedHairCapture} = useNavigationFlowState();
  return (
    <CameraFaceCaptureScreen
      allowCameraToggle={false}
      allowGallery={false}
      captureMode="face"
      captureType="hair_analysis"
      deferUpload
      onCapture={capture => {
        if (!capture) {
          return;
        }
        setSelectedHairCapture(capture);
        navigation.replace('FaceCaptureConfirmation', {target: 'hairAnalysis'});
      }}
      onClose={() => {
        setSelectedHairCapture(null);
        navigation.replace('HairAnalysisIntro');
      }}
    />
  );
}

export function HairAnalysisLoadingRouteScreen({navigation}: RootScreenProps<'HairAnalysisLoading'>) {
  const {selectedHairCapture} = useNavigationFlowState();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [requestKey, setRequestKey] = React.useState(0);
  const clientRequestId = React.useRef(createHairClientRequestId());

  React.useEffect(() => {
    if (!selectedHairCapture) {
      setErrorMessage('촬영한 사진을 찾지 못했어요. 다시 촬영해 주세요.');
      return undefined;
    }
    const controller = new AbortController();
    setErrorMessage(null);
    void createHairAnalysisFromCapture(selectedHairCapture, clientRequestId.current)
      .then(({analysis}) => waitForHairAnalysis(analysis.id, controller.signal))
      .then(async analysis => {
        await Promise.all(
          (analysis.analysis?.recommendations ?? []).map(recommendation =>
            prefetchImageUri(recommendation.style.previewUrl ?? undefined),
          ),
        );
        if (!controller.signal.aborted) {
          navigation.replace('HairAnalysisResult', {
            analysisId: analysis.id,
            sourceImageUri: selectedHairCapture.imageUri,
          });
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setErrorMessage(error instanceof Error ? error.message : '헤어 분석을 완료하지 못했어요.');
        }
      });
    return () => controller.abort();
  }, [navigation, requestKey, selectedHairCapture]);

  return (
    <DetailRouteChrome routeName="HairAnalysisLoading" onBack={() => navigation.replace('HairAnalysisCapture')}>
      <HairProgressScreen
        description="얼굴형과 현재 헤어 상태를 확인하고 추천 스타일을 고르고 있어요."
        errorMessage={errorMessage}
        imageUri={selectedHairCapture?.imageUri}
        onRetry={() => setRequestKey(key => key + 1)}
        title="헤어를 분석하고 있어요"
      />
    </DetailRouteChrome>
  );
}

export function HairAnalysisResultRouteScreen({navigation, route}: RootScreenProps<'HairAnalysisResult'>) {
  const [job, setJob] = React.useState<HairAnalysisJob | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  React.useEffect(() => {
    void getHairAnalysis(route.params.analysisId)
      .then(setJob)
      .catch(error => setErrorMessage(error instanceof Error ? error.message : '분석 결과를 불러오지 못했어요.'));
  }, [route.params.analysisId]);
  const handleSelect = React.useCallback((recommendation: HairRecommendation) => {
    navigation.navigate('HairSimulationLoading', {
      analysisId: route.params.analysisId,
      sourceImageUri: route.params.sourceImageUri,
      styleId: recommendation.styleId,
    });
  }, [navigation, route.params.analysisId, route.params.sourceImageUri]);

  return (
    <DetailRouteChrome routeName="HairAnalysisResult" onBack={() => navigation.replace('HairAnalysisIntro')}>
      {job?.analysis ? (
        <HairAnalysisResultScreen
          analysis={job.analysis}
          onOpenSaved={() => navigation.navigate('SavedHairSimulations')}
          onSelectStyle={handleSelect}
        />
      ) : (
        <HairProgressScreen
          description="추천 결과를 정리하고 있어요."
          errorMessage={errorMessage}
          imageUri={route.params.sourceImageUri}
          onRetry={() => navigation.replace('HairAnalysisResult', route.params)}
          title="분석 결과를 불러오는 중이에요"
        />
      )}
    </DetailRouteChrome>
  );
}

export function HairSimulationLoadingRouteScreen({navigation, route}: RootScreenProps<'HairSimulationLoading'>) {
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [requestKey, setRequestKey] = React.useState(0);
  const clientRequestId = React.useRef(createHairClientRequestId());
  React.useEffect(() => {
    const controller = new AbortController();
    setErrorMessage(null);
    void createHairSimulation(
      route.params.analysisId,
      route.params.styleId,
      clientRequestId.current,
    )
      .then(simulation => waitForHairSimulation(simulation.id, controller.signal))
      .then(async simulation => {
        await prefetchTransientImageUri(simulation.resultUrl ?? undefined);
        if (!controller.signal.aborted) {
          navigation.replace('HairSimulationResult', {
            simulationId: simulation.id,
            sourceImageUri: route.params.sourceImageUri,
          });
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setErrorMessage(error instanceof Error ? error.message : '헤어 합성을 완료하지 못했어요.');
        }
      });
    return () => controller.abort();
  }, [navigation, requestKey, route.params.analysisId, route.params.sourceImageUri, route.params.styleId]);
  return (
    <DetailRouteChrome routeName="HairSimulationLoading" onBack={() => navigation.goBack()}>
      <HairProgressScreen
        description="얼굴과 배경은 유지하면서 선택한 헤어만 자연스럽게 바꾸고 있어요."
        errorMessage={errorMessage}
        imageUri={route.params.sourceImageUri}
        onRetry={() => setRequestKey(key => key + 1)}
        title="헤어를 합성하고 있어요"
      />
    </DetailRouteChrome>
  );
}

async function ensureLocalResult(simulation: HairSimulation) {
  const freshSimulation = await getHairSimulation(simulation.id);
  if (!freshSimulation.resultUrl) {
    throw new Error('저장할 합성 결과가 없어요.');
  }
  return downloadHairResult(freshSimulation.resultUrl, freshSimulation.id);
}

export function HairSimulationResultRouteScreen({navigation, route}: RootScreenProps<'HairSimulationResult'>) {
  const [simulation, setSimulation] = React.useState<HairSimulation | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  React.useEffect(() => {
    void getHairSimulation(route.params.simulationId)
      .then(setSimulation)
      .catch(error => setFeedback(error instanceof Error ? error.message : '합성 결과를 불러오지 못했어요.'));
  }, [route.params.simulationId]);

  const handleSaveDevice = React.useCallback(async () => {
    if (!simulation) return;
    let uri: string | null = null;
    try {
      uri = await ensureLocalResult(simulation);
      const mediaLibrary = loadOptionalMediaLibraryModule();
      if (!mediaLibrary) throw new Error('사진 저장 모듈을 사용할 수 없어요.');
      const current = await mediaLibrary.getPermissionsAsync(true, ['photo']);
      const permission = current.granted ? current : await mediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!permission.granted) throw new Error('사진 저장 권한이 필요해요.');
      await mediaLibrary.saveToLibraryAsync(uri);
      setFeedback('사진 앱에 저장했어요.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '사진을 저장하지 못했어요.');
    } finally {
      if (uri) await deleteDownloadedHairResult(uri);
    }
  }, [simulation]);

  const handleShare = React.useCallback(async () => {
    if (!simulation) return;
    let uri: string | null = null;
    try {
      uri = await ensureLocalResult(simulation);
      const sharing = loadOptionalSharingModule();
      if (!sharing || !(await sharing.isAvailableAsync())) throw new Error('공유 기능을 사용할 수 없어요.');
      await sharing.shareAsync(uri, {dialogTitle: 'AURA 헤어 시뮬레이션', mimeType: 'image/jpeg', UTI: 'public.jpeg'});
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '결과를 공유하지 못했어요.');
    } finally {
      if (uri) await deleteDownloadedHairResult(uri);
    }
  }, [simulation]);

  const handleAccountSave = React.useCallback(async () => {
    if (!simulation) return;
    try {
      const updated = await setHairSimulationSaved(simulation.id, !simulation.saved);
      setSimulation(updated);
      setFeedback(updated.saved ? '계정에 저장했어요.' : '계정 저장을 해제했어요.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '계정 저장을 변경하지 못했어요.');
    }
  }, [simulation]);

  return (
    <DetailRouteChrome routeName="HairSimulationResult" onBack={() => navigation.goBack()}>
      {simulation?.resultUrl ? (
        <HairSimulationResultScreen
          feedback={feedback}
          onSaveAccount={handleAccountSave}
          onSaveDevice={handleSaveDevice}
          onShare={handleShare}
          simulation={simulation}
          sourceImageUri={route.params.sourceImageUri}
        />
      ) : (
        <HairProgressScreen description="합성 결과를 불러오고 있어요." errorMessage={feedback} title="결과 준비 중" />
      )}
    </DetailRouteChrome>
  );
}

export function SavedHairSimulationsRouteScreen({navigation}: RootScreenProps<'SavedHairSimulations'>) {
  const [items, setItems] = React.useState<HairSimulation[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const load = React.useCallback(() => {
    setIsLoading(true);
    setErrorMessage(null);
    void listSavedHairSimulations()
      .then(setItems)
      .catch(error => setErrorMessage(error instanceof Error ? error.message : '저장한 헤어를 불러오지 못했어요.'))
      .finally(() => setIsLoading(false));
  }, []);
  React.useEffect(load, [load]);
  const handleDelete = React.useCallback((item: HairSimulation) => {
    Alert.alert('저장한 헤어 삭제', '이 합성 결과를 계정에서 완전히 삭제할까요?', [
      {text: '취소', style: 'cancel'},
      {text: '삭제', style: 'destructive', onPress: () => {
        void deleteHairSimulation(item.id)
          .then(() => setItems(current => current.filter(value => value.id !== item.id)))
          .catch(error => {
            setErrorMessage(error instanceof Error ? error.message : '저장한 헤어를 삭제하지 못했어요.');
          });
      }},
    ]);
  }, []);
  return (
    <DetailRouteChrome routeName="SavedHairSimulations" onBack={() => navigation.goBack()}>
      <SavedHairSimulationsScreen
        errorMessage={errorMessage}
        isLoading={isLoading}
        items={items}
        onDelete={handleDelete}
        onOpen={item => navigation.navigate('HairSimulationResult', {simulationId: item.id})}
        onRetry={load}
      />
    </DetailRouteChrome>
  );
}
