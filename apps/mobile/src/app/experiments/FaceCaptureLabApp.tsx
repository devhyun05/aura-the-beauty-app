import React, {useCallback, useMemo, useState} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {useFonts} from 'expo-font';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {TamaguiProvider} from 'tamagui';

import {tamaguiConfig} from '../../../tamagui.config';
import {Face3DEntryBlockedScreen} from '../../features/face-3d/screens/Face3DEntryBlockedScreen';
import {Face3DLabScreen} from '../../features/face-3d/screens/Face3DLabScreen';
import {evaluateFace3DEntryEligibility} from '../../features/face-3d/services/face3DEntryEligibility';
import {appendFace3DRuntimeEvidence} from '../../features/face-3d/services/face3DRuntimeEvidenceLogger';
import {CameraFaceCaptureScreen} from '../../features/face-capture/screens/CameraFaceCaptureScreen';
import {UnifiedFaceCaptureScreen} from '../../features/face-capture/screens/UnifiedFaceCaptureScreen';
import {
  buildUnifiedFaceCaptureRequest,
  type UnifiedFaceCaptureCompletedEvent,
} from '../../features/face-capture/services/unifiedFaceCaptureContract';
import {
  getUnifiedFaceCaptureLabPolicy,
  UNIFIED_FACE_CAPTURE_LAB_MODES,
  type UnifiedFaceCaptureLabMode,
} from '../../features/face-capture/services/unifiedFaceCaptureDiagnostics';
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
import {isUnifiedFaceCaptureDiagnosticsEnabled} from '../../features/face-capture/services/unifiedFaceCaptureMode';
import phase1ReplayShotPlan from '../../features/face-ratio/phase1ReplayShotPlan.json';
import {FaceVerticalThirdsScreen} from '../../features/face-ratio/screens/FaceVerticalThirdsScreen';
import {isFaceRatioPoseNormalizationEnabled} from '../../features/face-ratio/services/faceRatioPoseNormalization';
import type {
  FaceRatioPhase1ReplayCondition,
  FaceRatioPhase1ReplayValidation,
  FaceVerticalThirdsResult,
} from '../../features/face-ratio/types';
import {colors, radius, spacing, typography} from '../../shared/theme';

type LabCapture = FaceCaptureUploadResult & {
  capturedAt: string;
  greenlightLogUri?: string;
  greenlightReport?: FaceCaptureGreenlightReport;
};

type FaceCaptureLabStackParamList = {
  FaceCaptureLab: undefined;
};

type FaceCaptureLabMode = UnifiedFaceCaptureLabMode | 'phase1-replay-10';

const Stack = createNativeStackNavigator<FaceCaptureLabStackParamList>();

const PHASE1_REPLAY_SHOTS: readonly {
  condition: FaceRatioPhase1ReplayCondition;
  instruction: string;
  label: string;
}[] = Object.freeze(
  phase1ReplayShotPlan.shots.map(shot => ({
    condition: shot.condition as FaceRatioPhase1ReplayCondition,
    instruction: shot.lab.instruction,
    label: shot.lab.label,
  })),
);

function createPhase1PseudonymousToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildPhase1LabValidation({
  runIndex,
  shotIndex,
  subjectToken,
}: {
  runIndex: number;
  shotIndex: number;
  subjectToken: string;
}): FaceRatioPhase1ReplayValidation {
  const shot = PHASE1_REPLAY_SHOTS[shotIndex - 1];
  if (!shot) {
    throw new Error(`Unsupported Phase 1 lab shot index: ${shotIndex}`);
  }

  return {
    captureId: `cap_${subjectToken}-${runIndex}-${shotIndex}`,
    cohortId: 'cohort_phase1-validation-v3',
    condition: shot.condition,
    retentionDays: 7,
    sessionId: `session_${subjectToken}-${runIndex}`,
    subjectId: `subj_${subjectToken}`,
  };
}

function createLabCaptureResult(imageInput: FaceCaptureImageInput): LabCapture {
  const id = `face-capture-lab-${Date.now()}`;

  return {
    bucket: 'local-face-capture-lab',
    capturedAt: new Date().toISOString(),
    contentType: imageInput.contentType ?? inferFaceCaptureContentType(imageInput.uri),
    height: imageInput.height ?? null,
    imageUri: imageInput.uri,
    mediaId: id,
    objectKey: imageInput.uri,
    photoCaptureId: id,
    semanticMattes: imageInput.semanticMattes,
    source: imageInput.source,
    width: imageInput.width ?? null,
  };
}

function LabModePicker({
  phase1Completed,
  diagnosticsEnabled,
  poseValidationEnabled,
  onSelect,
}: {
  phase1Completed: boolean;
  diagnosticsEnabled: boolean;
  poseValidationEnabled: boolean;
  onSelect: (mode: FaceCaptureLabMode) => void;
}) {
  const options = [
    {
      description:
        '정면 reference A/B와 각도·거리 변형 8장을 로컬 raw replay로 저장',
      label: 'Phase 1 · 10-shot replay',
      mode: 'phase1-replay-10' as const,
    },
    ...UNIFIED_FACE_CAPTURE_LAB_MODES,
  ];

  return (
    <SafeAreaView style={styles.modeScreen}>
      <ScrollView
        contentContainerStyle={styles.modeContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>AURA CAPTURE LAB</Text>
        <Text style={styles.modeTitle}>촬영 프레임 정책 선택</Text>
        <Text style={styles.modeDescription}>
          같은 피험자에서 Exact 1·3·5·8·12·30과 기존 30프레임을 각각
          수집해 비교하세요. 제품 기본 경로는 이 선택과 무관하게 플래그 off
          상태를 유지합니다.
        </Text>
        {phase1Completed ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              Phase 1의 10개 raw replay 저장이 끝났습니다. 다음 순서는 Exact 30
              정면·무표정 반복 수집입니다.
            </Text>
          </View>
        ) : null}
        {!diagnosticsEnabled ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              diagnostics 플래그가 꺼져 있어 Legacy 30만 실행할 수 있어요.
            </Text>
          </View>
        ) : null}
        {!poseValidationEnabled ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              Phase 1 raw replay는 validation-only 플래그가 켜진 개발 빌드에서만
              선택할 수 있어요.
            </Text>
          </View>
        ) : null}
        <View style={styles.modeList}>
          {options.map(option => {
            const disabled =
              (option.mode === 'phase1-replay-10' && !poseValidationEnabled) ||
              (option.mode !== 'phase1-replay-10' &&
                option.mode !== 'legacy-30' &&
                !diagnosticsEnabled);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{disabled}}
                disabled={disabled}
                key={option.mode}
                onPress={() => onSelect(option.mode)}
                style={[
                  styles.modeButton,
                  disabled ? styles.disabledButton : null,
                ]}>
                <Text style={styles.modeButtonLabel}>{option.label}</Text>
                <Text style={styles.modeButtonDescription}>
                  {option.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Phase1ShotGuide({
  rawSaved,
  shotIndex,
}: {
  rawSaved?: boolean;
  shotIndex: number;
}) {
  const shot = PHASE1_REPLAY_SHOTS[shotIndex - 1];
  if (!shot) {
    return null;
  }

  return (
    <SafeAreaView edges={['top']} style={styles.phase1Guide}>
      <Text style={styles.phase1GuideEyebrow}>
        PHASE 1 · {shotIndex}/{PHASE1_REPLAY_SHOTS.length}
      </Text>
      <Text style={styles.phase1GuideTitle}>{shot.label}</Text>
      <Text style={styles.phase1GuideText}>{shot.instruction}</Text>
      <Text
        style={[
          styles.phase1GuideStatus,
          rawSaved ? styles.phase1GuideStatusSaved : null,
        ]}>
        {rawSaved === true
          ? '로컬 raw replay 저장 확인됨 · 다시 촬영을 누르면 다음 샷으로 이동'
          : rawSaved === false
            ? '저장 확인 전 다시 촬영하면 같은 번호를 재시도'
            : '이 안내에 맞춰 촬영하세요. raw 저장 확인 전에는 다음 번호로 넘어가지 않습니다.'}
      </Text>
    </SafeAreaView>
  );
}

function UnifiedLabResult({
  capture,
  onChangeMode,
  onRetake,
  result,
}: {
  capture: LabCapture;
  onChangeMode: () => void;
  onRetake: () => void;
  result: UnifiedFaceCaptureCompletedEvent;
}) {
  return (
    <SafeAreaView style={styles.resultScreen}>
      <ScrollView
        contentContainerStyle={styles.resultContent}
        showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>UNIFIED CAPTURE COMPLETE</Text>
        <Text style={styles.modeTitle}>{result.face3d.collectionPolicyId}</Text>
        <Image source={{uri: capture.imageUri}} style={styles.resultImage} />
        <View style={styles.metadataCard}>
          <Text style={styles.metadataText}>
            Frames · {result.face3d.validFrameCount}/
            {result.face3d.targetFrameCount}
          </Text>
          <Text style={styles.metadataText}>
            Mode · {result.face3d.sampleMode} / {result.face3d.aggregation}
          </Text>
          <Text style={styles.metadataText}>
            Window · {Math.round(result.face3d.captureWindowMs)}ms
          </Text>
          <Text style={styles.metadataText}>
            Native Δ · {result.timestamps.maxAbsFaceSensorDeltaMs.toFixed(1)}ms
          </Text>
          <Text style={styles.metadataText}>
            Hairline · {result.hairline.outcome}
          </Text>
          <Text style={styles.metadataText}>
            Calibration · {result.face3d.confidenceCalibrationStatus}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onRetake}
          style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>같은 정책으로 다시 촬영</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onChangeMode}
          style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>프레임 정책 바꾸기</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function FaceCaptureLabContent() {
  const diagnosticsEnabled = isUnifiedFaceCaptureDiagnosticsEnabled();
  const poseValidationEnabled = isFaceRatioPoseNormalizationEnabled();
  const [capture, setCapture] = useState<LabCapture | null>(null);
  const [labMode, setLabMode] = useState<FaceCaptureLabMode | null>(null);
  const [modeRevision, setModeRevision] = useState(0);
  const [phase1SubjectToken] = useState(createPhase1PseudonymousToken);
  const [phase1Sequence, setPhase1Sequence] = useState({
    runIndex: 1,
    shotIndex: 1,
  });
  const [resultMode, setResultMode] = useState<
    'face3d' | 'face3d-blocked' | 'unified' | 'vertical-thirds'
  >('face3d');
  const [unifiedResult, setUnifiedResult] =
    useState<UnifiedFaceCaptureCompletedEvent | null>(null);
  const [phase1RawSaved, setPhase1RawSaved] = useState(false);
  const [phase1Completed, setPhase1Completed] = useState(false);

  const uploadImage = useCallback(async (imageInput: FaceCaptureImageInput) => {
    return createLabCaptureResult(imageInput);
  }, []);

  const unifiedRequest = useMemo(() => {
    if (!labMode) {
      return null;
    }
    if (labMode === 'phase1-replay-10') {
      return null;
    }
    const collectionPolicyId = getUnifiedFaceCaptureLabPolicy(labMode);
    if (!collectionPolicyId) {
      return null;
    }

    return buildUnifiedFaceCaptureRequest({
      allowDiagnostics: true,
      collectionPolicyId,
      requestId: `face-capture-lab-${labMode}-${modeRevision}-${Date.now()}`,
    });
  }, [labMode, modeRevision]);

  const phase1ValidationReplay = useMemo(
    () =>
      buildPhase1LabValidation({
        runIndex: phase1Sequence.runIndex,
        shotIndex: phase1Sequence.shotIndex,
        subjectToken: phase1SubjectToken,
      }),
    [phase1Sequence.runIndex, phase1Sequence.shotIndex, phase1SubjectToken],
  );

  const resetCapture = useCallback(() => {
    setCapture(null);
    setUnifiedResult(null);
    setPhase1RawSaved(false);
    setResultMode('face3d');
    setModeRevision(current => current + 1);
  }, []);

  const finishPhase1Shot = useCallback(() => {
    setCapture(null);
    setUnifiedResult(null);
    setPhase1RawSaved(false);
    if (phase1RawSaved) {
      if (phase1Sequence.shotIndex >= PHASE1_REPLAY_SHOTS.length) {
        setPhase1Sequence(current => ({
          runIndex: current.runIndex + 1,
          shotIndex: 1,
        }));
        setPhase1Completed(true);
        setLabMode(null);
      } else {
        setPhase1Sequence(current => ({
          ...current,
          shotIndex: current.shotIndex + 1,
        }));
      }
    }
    setResultMode('face3d');
    setModeRevision(current => current + 1);
  }, [phase1RawSaved, phase1Sequence.shotIndex]);

  const handlePhase1AnalysisResult = useCallback(
    (result: FaceVerticalThirdsResult) => {
      setPhase1RawSaved(Boolean(result.artifacts.poseNormalizationReplayUri));
    },
    [],
  );

  const changeMode = useCallback(() => {
    setCapture(null);
    setUnifiedResult(null);
    setResultMode('face3d');
    setLabMode(null);
    setPhase1RawSaved(false);
    setPhase1Completed(false);
    setPhase1Sequence({runIndex: 1, shotIndex: 1});
    setModeRevision(current => current + 1);
  }, []);

  if (!labMode) {
    return (
      <LabModePicker
        diagnosticsEnabled={diagnosticsEnabled}
        onSelect={mode => {
          setPhase1Completed(false);
          setLabMode(mode);
        }}
        phase1Completed={phase1Completed}
        poseValidationEnabled={poseValidationEnabled}
      />
    );
  }

  if (
    resultMode === 'unified' &&
    capture &&
    unifiedResult
  ) {
    return (
      <UnifiedLabResult
        capture={capture}
        onChangeMode={changeMode}
        onRetake={resetCapture}
        result={unifiedResult}
      />
    );
  }

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
          onRetake={resetCapture}
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
          onRetake={resetCapture}
        />
      );
    }

    const isPhase1Replay = labMode === 'phase1-replay-10';
    return (
      <View style={styles.verticalLabScreen}>
        {isPhase1Replay ? (
          <Phase1ShotGuide
            rawSaved={phase1RawSaved}
            shotIndex={phase1Sequence.shotIndex}
          />
        ) : null}
        <View style={styles.verticalLabContent}>
          <FaceVerticalThirdsScreen
            capture={{
              capturedAt: capture.capturedAt,
              imageUri: capture.imageUri,
              photoCaptureId: capture.photoCaptureId,
              semanticMattes: capture.semanticMattes,
              source: capture.source,
              ...(isPhase1Replay
                ? {validationReplay: phase1ValidationReplay}
                : {}),
            }}
            debug
            onAnalysisResult={
              isPhase1Replay ? handlePhase1AnalysisResult : undefined
            }
            onRetake={isPhase1Replay ? finishPhase1Shot : resetCapture}
          />
        </View>
      </View>
    );
  }

  if (unifiedRequest) {
    return (
      <UnifiedFaceCaptureScreen
        onCancel={changeMode}
        onCaptureCommitted={(result, upload) => {
          void appendFace3DRuntimeEvidence(result);
          setCapture({
            ...upload,
            capturedAt: new Date().toISOString(),
          });
          setUnifiedResult(result);
          setResultMode('unified');
          return true;
        }}
        onFallback={reason => {
          console.info('[aura:face-capture-lab] unified:fallback', {
            reason,
          });
          setCapture(null);
          setUnifiedResult(null);
          setResultMode('face3d');
          setLabMode('legacy-30');
        }}
        onRequestStarted={() => undefined}
        request={unifiedRequest}
        uploadImage={uploadImage}
      />
    );
  }

  const cameraScreen = (
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
          setPhase1RawSaved(false);
          if (labMode === 'phase1-replay-10') {
            setResultMode('vertical-thirds');
            return;
          }
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
      onClose={changeMode}
      uploadImage={uploadImage}
    />
  );

  if (labMode === 'phase1-replay-10') {
    return (
      <View style={styles.verticalLabScreen}>
        <Phase1ShotGuide shotIndex={phase1Sequence.shotIndex} />
        <View style={styles.verticalLabContent}>{cameraScreen}</View>
      </View>
    );
  }

  return cameraScreen;
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

const styles = StyleSheet.create({
  disabledButton: {
    opacity: 0.4,
  },
  eyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1.2,
  },
  metadataCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  metadataText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  modeButton: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  modeButtonDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  modeButtonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  modeContent: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  modeDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  modeList: {
    gap: spacing.md,
  },
  modeScreen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  modeTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xxl,
  },
  noticeCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  phase1Guide: {
    backgroundColor: colors.surfaceMuted,
    borderBottomColor: colors.borderStrong,
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  phase1GuideEyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 1,
  },
  phase1GuideStatus: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  phase1GuideStatusSaved: {
    color: colors.successMuted,
  },
  phase1GuideText: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  phase1GuideTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  resultContent: {
    gap: spacing.lg,
    padding: spacing.xl,
  },
  resultImage: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    width: '100%',
  },
  resultScreen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  verticalLabContent: {
    flex: 1,
  },
  verticalLabScreen: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
