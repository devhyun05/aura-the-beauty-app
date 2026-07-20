import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { BeardSimulationService } from './contracts/types';
import type { BeardStackParamList } from './navigation/types';
import { BeardFlowProvider, type BeardFlowState } from './state/BeardFlowContext';
import { ToastProvider } from './state/ToastContext';
import { BeardServiceProvider } from './services/BeardServiceContext';
import { PurposeSelectScreen } from './screens/PurposeSelectScreen';
import { SurveyScreen } from './screens/SurveyScreen';
import { CameraScreen } from './screens/CameraScreen';
import { GeneratingScreen } from './screens/GeneratingScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ReportScreen } from './screens/ReportScreen';
import { FailureScreen } from './screens/FailureScreen';

const Stack = createNativeStackNavigator<BeardStackParamList>();

/**
 * Self-contained navigator for the 수염 제거 (beard-simulation) feature.
 *
 * Wiring: mount <BeardSimulationNavigator/> as the screen behind the existing "수염 제거" entry
 * in the app's root/tab navigator, e.g.
 *   <RootStack.Screen name="BeardSimulation" component={BeardSimulationNavigator} />
 *
 * To swap in the real backend, pass `service={realBeardSimulationService}`.
 */
export function BeardSimulationNavigator({
  service,
  initialFlow,
  initialRouteName = 'PurposeSelect',
}: {
  service?: BeardSimulationService;
  /** Seed flow state (Storybook/tests jumping straight to Result/Report). */
  initialFlow?: Partial<BeardFlowState>;
  initialRouteName?: keyof BeardStackParamList;
}) {
  return (
    <BeardServiceProvider service={service}>
      <BeardFlowProvider initial={initialFlow}>
        <ToastProvider>
          <Stack.Navigator
            initialRouteName={initialRouteName}
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: '#000' },
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="PurposeSelect" component={PurposeSelectScreen} />
            <Stack.Screen name="Survey" component={SurveyScreen} />
            <Stack.Screen name="Camera" component={CameraScreen} />
            {/* No back-swipe out of generation. */}
            <Stack.Screen name="Generating" component={GeneratingScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="Result" component={ResultScreen} options={{ gestureEnabled: false, animation: 'fade' }} />
            <Stack.Screen name="Report" component={ReportScreen} />
            <Stack.Screen name="Failure" component={FailureScreen} options={{ gestureEnabled: false }} />
          </Stack.Navigator>
        </ToastProvider>
      </BeardFlowProvider>
    </BeardServiceProvider>
  );
}
