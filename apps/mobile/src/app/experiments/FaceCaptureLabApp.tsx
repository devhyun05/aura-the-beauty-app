import React, {useCallback, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useFonts} from 'expo-font';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../../tamagui.config';
import {CameraFaceCaptureScreen} from '../../features/face-capture/screens/CameraFaceCaptureScreen';
import {Face3DEntryBlockedScreen} from '../../features/face-3d/screens/Face3DEntryBlockedScreen';
import {Face3DLabScreen} from '../../features/face-3d/screens/Face3DLabScreen';
import {evaluateFace3DEntryEligibility} from '../../features/face-3d/services/face3DEntryEligibility';
import {FaceVerticalThirdsScreen} from '../../features/face-ratio/screens/FaceVerticalThirdsScreen';
import {
  inferFaceCaptureContentType,
  type FaceCaptureImageInput,
  type FaceCaptureUploadResult,
} from '../../features/face-capture/services/faceCaptureUploadService';
import {
  type FaceCaptureGreenlightReport,
} from '../../features/face-capture/services/faceCaptureGreenlight';
import {
  appendGreenlightEvent,
} from '../../features/face-capture/services/faceCaptureGreenlightLogger';
import {typography} from '../../shared/theme';

type LabCapture = FaceCaptureUploadResult & {
  capturedAt: string;
  greenlightLogUri?: string;
  greenlightReport?: FaceCaptureGreenlightReport;
};

type FaceCaptureLabStackParamList = {
  FaceCaptureLab: undefined;
};

const Stack = createNativeStackNavigator<FaceCaptureLabStackParamList>();

function createLabCaptureResult(imageInput: FaceCaptureImageInput): LabCapture {
  const id = `face-capture-lab-${Date.now()}`;

  return {
    bucket: 'local-face-capture-lab',
    capturedAt: new Date().toISOString(),
    contentType: imageInput.contentType ?? inferFaceCaptureContentType(imageInput.uri),
    imageUri: imageInput.uri,
    mediaId: id,
    objectKey: imageInput.uri,
    photoCaptureId: id,
    semanticMattes: imageInput.semanticMattes,
    source: imageInput.source,
  };
}

function FaceCaptureLabContent() {
  const [capture, setCapture] = useState<LabCapture | null>(null);
  const [resultMode, setResultMode] = useState<
    'face3d' | 'face3d-blocked' | 'vertical-thirds'
  >('face3d');

  const uploadImage = useCallback(async (imageInput: FaceCaptureImageInput) => {
    return createLabCaptureResult(imageInput);
  }, []);

  if (capture) {
    if (resultMode === 'face3d-blocked') {
      const eligibility = evaluateFace3DEntryEligibility({
        greenlightReport: capture.greenlightReport,
        source: capture.source,
      });

      return (
        <Face3DEntryBlockedScreen
          message={eligibility.eligible ? '3D 측정을 다시 시작해 주세요.' : eligibility.message}
          onOpenVerticalThirds={() => setResultMode('vertical-thirds')}
          onRetake={() => {
            setCapture(null);
            setResultMode('face3d');
          }}
        />
      );
    }

    if (resultMode === 'face3d') {
      return (
        <Face3DLabScreen
          capture={{
            capturedAt: capture.capturedAt,
            imageUri: capture.imageUri,
            photoCaptureId: capture.photoCaptureId,
          }}
          onOpenVerticalThirds={() => setResultMode('vertical-thirds')}
          onRetake={() => {
            setCapture(null);
            setResultMode('face3d');
          }}
        />
      );
    }

    return (
      <FaceVerticalThirdsScreen
        capture={{
          capturedAt: capture.capturedAt,
          imageUri: capture.imageUri,
          photoCaptureId: capture.photoCaptureId,
          semanticMattes: capture.semanticMattes,
          source: capture.source,
        }}
        debug
        onRetake={() => {
          setCapture(null);
          setResultMode('face3d');
        }}
      />
    );
  }

  return (
    <CameraFaceCaptureScreen
      awaitCameraReleaseBeforeComplete
      captureMode="face"
      captureType="face_analysis"
      onCapture={(result, greenlightReport) => {
        if (result) {
          const nextCapture = {
            ...(result as LabCapture),
            greenlightReport,
          };

          setCapture(nextCapture);
          const eligibility = evaluateFace3DEntryEligibility({
            greenlightReport,
            source: result.source,
          });
          setResultMode(
            eligibility.eligible ? 'face3d' : 'face3d-blocked',
          );

          if (greenlightReport) {
            void appendGreenlightEvent({
              imageUri: result.imageUri,
              report: greenlightReport,
            })
              .then(greenlightLogUri => {
                setCapture(current =>
                  current?.photoCaptureId === result.photoCaptureId
                    ? {...current, greenlightLogUri}
                    : current,
                );
              })
              .catch(error => {
                console.info('[aura:face-capture-greenlight] log-write:error', {
                  message: error instanceof Error ? error.message : String(error),
                });
              });
          }
        }
      }}
      onClose={() => undefined}
      uploadImage={uploadImage}
    />
  );
}

export function FaceCaptureLabApp() {
  const [fontsLoaded] = useFonts({
    [typography.fontFamily.brand]: require('../../assets/fonts/NixieOne-Regular.ttf'),
    [typography.fontFamily.regular]: require('../../assets/fonts/Pretendard-Regular.otf'),
    [typography.fontFamily.medium]: require('../../assets/fonts/Pretendard-Medium.otf'),
    [typography.fontFamily.semibold]: require('../../assets/fonts/Pretendard-SemiBold.otf'),
    [typography.fontFamily.bold]: require('../../assets/fonts/Pretendard-Bold.otf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{headerShown: false}}>
            <Stack.Screen component={FaceCaptureLabContent} name="FaceCaptureLab" />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
