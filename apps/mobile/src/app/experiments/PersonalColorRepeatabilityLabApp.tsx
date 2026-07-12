import React, { useCallback, useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider } from 'tamagui';

import { tamaguiConfig } from '../../../tamagui.config';
import { CameraFaceCaptureScreen } from '../../features/face-capture/screens/CameraFaceCaptureScreen';
import {
  inferFaceCaptureContentType,
  type FaceCaptureImageInput,
  type FaceCaptureUploadResult,
} from '../../features/face-capture/services/faceCaptureUploadService';
import { PersonalColorRepeatabilityReportCard } from '../../features/personal-color/components/PersonalColorRepeatabilityReportCard';
import { PersonalColorConsentScreen } from '../../features/personal-color/screens/PersonalColorConsentScreen';
import { PrivacyPolicyScreen } from '../../features/legal/screens/PrivacyPolicyScreen';
import { analyzePersonalColorCapture } from '../../features/personal-color/services/personalColorService';
import { hasPersonalColorConsent } from '../../features/personal-color/services/personalColorConsentStore';
import {
  computeRepeatability,
  toRepeatabilitySample,
} from '../../features/personal-color/services/personalColorCore/personalColorRepeatability';
import type { AuraPersonalColorResult } from '../../features/personal-color/types';
import { typography } from '../../shared/theme';

const TARGET_N = 5;

type Phase = 'capturing' | 'analyzing' | 'report';

type RepeatabilityLabStackParamList = { PersonalColorRepeatabilityLab: undefined };
const Stack = createNativeStackNavigator<RepeatabilityLabStackParamList>();

function createLabCaptureResult(imageInput: FaceCaptureImageInput): FaceCaptureUploadResult {
  const id = `pc-repeatability-${Date.now()}`;
  return {
    bucket: 'local-personal-color-repeatability-lab',
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

function RepeatabilityLabContent() {
  const [consented, setConsented] = useState<boolean | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [results, setResults] = useState<AuraPersonalColorResult[]>([]);
  // 조명 보정 실험(A/B): 캡처별 보정 결과(미적용이면 null) 병행 수집
  const [correctedResults, setCorrectedResults] = useState<(AuraPersonalColorResult | null)[]>([]);
  const [phase, setPhase] = useState<Phase>('capturing');

  useEffect(() => {
    void hasPersonalColorConsent().then(setConsented);
  }, []);

  const uploadImage = useCallback(async (imageInput: FaceCaptureImageInput) => {
    return createLabCaptureResult(imageInput);
  }, []);

  const handleCaptured = useCallback((result?: FaceCaptureUploadResult) => {
    if (!result) {
      return;
    }
    setPhase('analyzing');
    void analyzePersonalColorCapture({
      captureId: result.photoCaptureId,
      createdAt: new Date().toISOString(),
      sessionId: result.photoCaptureId,
      imageUri: result.imageUri,
      cameraMetadata: result.cameraMetadata ?? undefined,
      frameCount: 1,
    })
      .then(outcome => {
        setCorrectedResults(prev => [...prev, outcome.corrected?.result ?? null]);
        setResults(prev => {
          const next = [...prev, outcome.result];
          setPhase(next.length >= TARGET_N ? 'report' : 'capturing');
          return next;
        });
      })
      .catch(() => {
        setPhase('capturing'); // 분석 실패 시 재촬영
      });
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

  if (phase === 'report') {
    const report = computeRepeatability(results.map(toRepeatabilitySample));
    // 조명 보정 A/B — 부분집합 편향 방지: 전 캡처에 보정이 적용됐을 때만 비교 리포트를
    // 만든다(일부만 적용되면 "보정이 어려운 캡처가 걸러진" 유리한 비교가 되므로).
    const correctedAvailable = correctedResults.filter(
      (r): r is AuraPersonalColorResult => r != null,
    );
    const allCorrected =
      correctedAvailable.length === results.length && correctedAvailable.length >= 2;
    const correctedReport = allCorrected
      ? computeRepeatability(correctedAvailable.map(toRepeatabilitySample))
      : null;
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>재현성 리포트</Text>
          <Text style={styles.subtitle}>같은 얼굴 {results.length}회 촬영의 흔들림</Text>
          <PersonalColorRepeatabilityReportCard report={report} />
          {correctedReport && (
            <>
              <Text style={styles.subtitle}>
                조명 보정 실험(A/B) — 전 촬영 보정 적용 · 아래는 보정판 재현성
              </Text>
              <PersonalColorRepeatabilityReportCard
                report={correctedReport}
                footnote="실험: 흰자 기반 조명 보정 결과의 재현성. 위 기본 리포트가 기준입니다."
              />
            </>
          )}
          {!correctedReport && correctedAvailable.length > 0 && (
            <Text style={styles.subtitle}>
              조명 보정 {correctedAvailable.length}/{results.length}회만 적용 — 편향 없는 비교가
              불가해 보정판 리포트를 생략합니다.
            </Text>
          )}
          <Pressable
            style={styles.primaryBtn}
            onPress={() => {
              setResults([]);
              setCorrectedResults([]);
              setPhase('capturing');
            }}>
            <Text style={styles.primaryBtnText}>다시 시작</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (phase === 'analyzing') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3a6df0" />
          <Text style={styles.dim}>
            분석 중… ({results.length + 1}/{TARGET_N})
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraFaceCaptureScreen
        captureMode="face"
        captureType="personal_color"
        onCapture={handleCaptured}
        onClose={() => undefined}
        uploadImage={uploadImage}
      />
      <View style={styles.progressBadge} pointerEvents="none">
        <Text style={styles.progressText}>
          {results.length}/{TARGET_N} 촬영 · 같은 얼굴을 반복 촬영하세요
        </Text>
      </View>
    </View>
  );
}

export function PersonalColorRepeatabilityLabApp() {
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
            <Stack.Screen component={RepeatabilityLabContent} name="PersonalColorRepeatabilityLab" />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f5f7' },
  scroll: { padding: 16, gap: 14 },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 13, color: '#777' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  dim: { fontSize: 14, color: '#888' },
  cameraWrap: { flex: 1 },
  progressBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  progressText: { color: '#fff', fontSize: 13 },
  primaryBtn: { backgroundColor: '#3a6df0', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
