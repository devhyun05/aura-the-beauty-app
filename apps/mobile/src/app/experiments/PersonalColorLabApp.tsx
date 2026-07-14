import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from '../../../tamagui.config';
import { CameraFaceCaptureScreen } from '../../features/face-capture/screens/CameraFaceCaptureScreen';
import {
  inferFaceCaptureContentType,
  type FaceCaptureImageInput,
  type FaceCaptureUploadResult,
} from '../../features/face-capture/services/faceCaptureUploadService';
import { PersonalColorScreen } from '../../features/personal-color/screens/PersonalColorScreen';
import { PersonalColorConsentScreen } from '../../features/personal-color/screens/PersonalColorConsentScreen';
import { hasPersonalColorConsent } from '../../features/personal-color/services/personalColorConsentStore';
import { PrivacyPolicyScreen } from '../../features/legal/screens/PrivacyPolicyScreen';
import { typography } from '../../shared/theme';

type LabCapture = FaceCaptureUploadResult & { capturedAt: string };

type PersonalColorLabStackParamList = { PersonalColorLab: undefined };
const Stack = createNativeStackNavigator<PersonalColorLabStackParamList>();

function createLabCaptureResult(imageInput: FaceCaptureImageInput): LabCapture {
  const id = `personal-color-lab-${Date.now()}`;
  return {
    bucket: 'local-personal-color-lab',
    capturedAt: new Date().toISOString(),
    contentType: imageInput.contentType ?? inferFaceCaptureContentType(imageInput.uri),
    imageUri: imageInput.uri,
    mediaId: id,
    objectKey: imageInput.uri,
    photoCaptureId: id,
    semanticMattes: imageInput.semanticMattes,
    cameraMetadata: imageInput.cameraMetadata,
    source: imageInput.source,
  };
}

function PersonalColorLabContent() {
  const [consented, setConsented] = useState<boolean | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [capture, setCapture] = useState<LabCapture | null>(null);

  useEffect(() => {
    void hasPersonalColorConsent().then(setConsented);
  }, []);

  // personal_color는 로컬 분석만 — 어떤 업로드 경로도 호출하지 않는다.
  const uploadImage = useCallback(async (imageInput: FaceCaptureImageInput) => {
    return createLabCaptureResult(imageInput);
  }, []);

  if (consented === null) {
    return null;
  }

  if (showPrivacy) {
    return <PrivacyPolicyScreen onClose={() => setShowPrivacy(false)} />;
  }

  if (!consented) {
    return (
      <PersonalColorConsentScreen
        nowIso={new Date().toISOString()}
        onConsented={() => setConsented(true)}
        onCancel={() => undefined}
        onOpenPrivacyPolicy={() => setShowPrivacy(true)}
      />
    );
  }

  if (capture) {
    return (
      <PersonalColorScreen
        capture={{
          imageUri: capture.imageUri,
          photoCaptureId: capture.photoCaptureId,
          capturedAt: capture.capturedAt,
          cameraMetadata: capture.cameraMetadata,
        }}
        onRetake={() => setCapture(null)}
      />
    );
  }

  return (
    <CameraFaceCaptureScreen
      captureMode="face"
      captureType="personal_color"
      onCapture={result => {
        if (result) {
          setCapture(result as LabCapture);
        }
      }}
      onClose={() => undefined}
      uploadImage={uploadImage}
    />
  );
}

export function PersonalColorLabApp() {
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
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen component={PersonalColorLabContent} name="PersonalColorLab" />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}
