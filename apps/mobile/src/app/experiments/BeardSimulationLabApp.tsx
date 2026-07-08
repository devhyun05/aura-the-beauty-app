import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';

import {
  checkBeardSimApiHealth,
  deleteBeardSimulationRun,
  isBeardSimulationRejectedError,
  simulateBeardRemoval,
} from '../../features/beard-simulation/services/beardSimulationService';
import {mockSimulateBeardRemoval} from '../../features/beard-simulation/mocks/mockBeardSimulationResult';
import {BeardSimulationFailureScreen} from '../../features/beard-simulation/screens/BeardSimulationFailureScreen';
import {BeardSimulationInputScreen} from '../../features/beard-simulation/screens/BeardSimulationInputScreen';
import {BeardSimulationLoadingScreen} from '../../features/beard-simulation/screens/BeardSimulationLoadingScreen';
import {BeardSimulationResultScreen} from '../../features/beard-simulation/screens/BeardSimulationResultScreen';
import type {
  BeardSimulationPhoto,
  BeardSimulationResult,
  BeardSurvey,
} from '../../features/beard-simulation/types';

type FlowState =
  | {step: 'input'}
  | {step: 'loading'; photoUri: string}
  | {
      step: 'result';
      photoUri: string;
      result: BeardSimulationResult & {inputImageRef?: string};
      usedMock: boolean;
    }
  | {step: 'failure'; reason: string};

/** Standalone dev flow: EXPO_PUBLIC_AURA_EXPERIMENT_APP=beard-simulation-lab.
 * Talks to the local lab server (tools/beard-simulation-lab/server.py); falls
 * back to the offline mock when it is unreachable or
 * EXPO_PUBLIC_BEARD_SIM_USE_MOCK=1. */
export function BeardSimulationLabApp() {
  const [flow, setFlow] = useState<FlowState>({step: 'input'});

  const runSimulation = useCallback(
    async (photo: BeardSimulationPhoto, survey: BeardSurvey) => {
      setFlow({step: 'loading', photoUri: photo.uri});
      const forceMock = process.env.EXPO_PUBLIC_BEARD_SIM_USE_MOCK === '1';
      try {
        const useMock = forceMock || !(await checkBeardSimApiHealth());
        const result = useMock
          ? await mockSimulateBeardRemoval(photo.uri, survey)
          : await simulateBeardRemoval(photo, survey);
        setFlow({step: 'result', photoUri: photo.uri, result, usedMock: useMock});
      } catch (error) {
        if (isBeardSimulationRejectedError(error)) {
          setFlow({step: 'failure', reason: error.reason});
          return;
        }
        console.warn('[beard-sim-lab] simulate failed', error);
        setFlow({step: 'failure', reason: 'default'});
      }
    },
    [],
  );

  const handleDelete = useCallback(async () => {
    if (flow.step !== 'result') {
      return;
    }
    if (!flow.usedMock) {
      try {
        await deleteBeardSimulationRun(flow.result.requestId);
      } catch (error) {
        console.warn('[beard-sim-lab] delete failed', error);
      }
    }
    setFlow({step: 'input'});
  }, [flow]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {flow.step === 'input' ? (
          <BeardSimulationInputScreen onSubmit={runSimulation} />
        ) : null}
        {flow.step === 'loading' ? (
          <BeardSimulationLoadingScreen photoUri={flow.photoUri} />
        ) : null}
        {flow.step === 'result' ? (
          <>
            {flow.usedMock ? (
              <View style={styles.mockBanner}>
                <Text style={styles.mockBannerText}>
                  오프라인 mock — 랩 서버(server.py)를 켜면 실제 결과가 나와요
                </Text>
              </View>
            ) : null}
            <BeardSimulationResultScreen
              beforeUri={flow.result.inputImageRef ?? flow.photoUri}
              result={flow.result}
              onDelete={handleDelete}
              onRetake={() => setFlow({step: 'input'})}
            />
          </>
        ) : null}
        {flow.step === 'failure' ? (
          <BeardSimulationFailureScreen
            reason={flow.reason}
            onRetake={() => setFlow({step: 'input'})}
          />
        ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#fff'},
  mockBanner: {backgroundColor: '#333', paddingVertical: 6, paddingHorizontal: 12},
  mockBannerText: {color: '#ffd166', fontSize: 11, textAlign: 'center'},
});
