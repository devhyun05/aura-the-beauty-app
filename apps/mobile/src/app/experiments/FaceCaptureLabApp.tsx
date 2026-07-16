import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import {
  appendFace3DRuntimeEvidence,
  readFace3DRuntimeEvidenceLog,
} from '../../features/face-3d/services/face3DRuntimeEvidenceLogger';
import {isRealtimeFaceCaptureAvailable} from '../../features/face-capture/components/RealtimeFaceCaptureNativeView';
import {
  CameraFaceCaptureScreen,
  type CameraFaceCaptureRuntimeProvenance,
} from '../../features/face-capture/screens/CameraFaceCaptureScreen';
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
import {
  resolveFaceRatioPhase1CollectionPlanFromEnvironment,
  resolveFaceRatioPreparedCollectionProgress,
  resolveFaceRatioPreparedExact30Progress,
} from '../../features/face-ratio/services/faceRatioPhase1CollectionPlan';
import {isFaceRatioPoseNormalizationEnabled} from '../../features/face-ratio/services/faceRatioPoseNormalization';
import {
  deleteFaceRatioPhase1ReplayArtifact,
  deleteFaceRatioPhase1LocalCapture,
  isFaceRatioPhase1ReplayShotComplete,
  pruneExpiredFaceRatioPhase1ReplayArtifacts,
  readFaceRatioPhase1ReplayArtifact,
} from '../../features/face-ratio/services/faceVerticalThirdsArtifacts';
import type {
  FaceRatioPhase1ReplayAcquisition,
  FaceRatioPhase1ReplayCondition,
  FaceRatioPhase1ReplayValidation,
  FaceVerticalThirdsResult,
} from '../../features/face-ratio/types';
import {colors, radius, spacing, typography} from '../../shared/theme';

type LabCapture = FaceCaptureUploadResult & {
  capturedAt: string;
  greenlightLogUri?: string;
  greenlightReport?: FaceCaptureGreenlightReport;
  phase1ReplayAcquisition?: FaceRatioPhase1ReplayAcquisition;
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
const PHASE1_COLLECTION_PLAN_RESOLUTION =
  resolveFaceRatioPhase1CollectionPlanFromEnvironment(
    PHASE1_REPLAY_SHOTS.map((shot, index) => ({
      condition: shot.condition,
      shotId: phase1ReplayShotPlan.shots[index].collection.shotId,
    })),
  );

function createPhase1PseudonymousToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildPhase1LabValidation({
  runIndex,
  shotIndex,
  subjectToken,
  acquisition,
}: {
  acquisition: FaceRatioPhase1ReplayAcquisition;
  runIndex: number;
  shotIndex: number;
  subjectToken: string;
}): FaceRatioPhase1ReplayValidation {
  const shot = PHASE1_REPLAY_SHOTS[shotIndex - 1];
  if (!shot) {
    throw new Error(`Unsupported Phase 1 lab shot index: ${shotIndex}`);
  }

  return {
    acquisition: {...acquisition},
    captureId: `cap_${subjectToken}-${runIndex}-${shotIndex}`,
    cohortId: 'cohort_phase1-validation-v3',
    condition: shot.condition,
    retentionDays: 7,
    sessionId: `session_${subjectToken}-${runIndex}`,
    subjectId: `subj_${subjectToken}`,
  };
}

function getPhase1ReplayAcquisition(
  result: FaceCaptureUploadResult,
  greenlightReport: FaceCaptureGreenlightReport | undefined,
  runtimeProvenance: CameraFaceCaptureRuntimeProvenance | undefined,
): FaceRatioPhase1ReplayAcquisition | null {
  if (
    result.source !== 'camera' ||
    runtimeProvenance?.captureImplementation !== 'native' ||
    runtimeProvenance.cameraFacing !== 'front' ||
    !greenlightReport?.finalCaptureGreenlight ||
    !Number.isFinite(
      greenlightReport.nativeCameraMetadata?.captureLockedAtMs,
    )
  ) {
    return null;
  }

  return {
    cameraFacing: runtimeProvenance.cameraFacing,
    captureImplementation: runtimeProvenance.captureImplementation,
    source: result.source,
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
  phase1PruneError,
  phase1PrunePending,
  phase1CompletionCleanupDone,
  phase1ResumeNotice,
  preparedCollection,
  preparedExact30Completed,
  preparedSequenceError,
  diagnosticsEnabled,
  poseValidationEnabled,
  onSelect,
  onResetPreparedReplay,
  onCompletePreparedReplayCleanup,
}: {
  phase1Completed: boolean;
  phase1PruneError: string | null;
  phase1PrunePending: boolean;
  phase1CompletionCleanupDone: boolean;
  phase1ResumeNotice: string | null;
  preparedCollection: boolean;
  preparedExact30Completed: boolean;
  preparedSequenceError: string | null;
  diagnosticsEnabled: boolean;
  poseValidationEnabled: boolean;
  onSelect: (mode: FaceCaptureLabMode) => void;
  onResetPreparedReplay: () => void;
  onCompletePreparedReplayCleanup: () => void;
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
        {phase1PrunePending ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              만료된 Phase 1 raw replay를 정리하고 있어요.
            </Text>
          </View>
        ) : null}
        {phase1PruneError ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              raw replay 준비/정리에 실패해 Phase 1 수집을 차단했습니다:{' '}
              {phase1PruneError}. 아래 버튼으로 이 prepared session의 기기 raw를
              삭제해 처음부터 다시 시작하거나 새 가명 ID로 계획을 생성하세요.
            </Text>
            {preparedCollection &&
            !phase1PrunePending &&
            !preparedExact30Completed ? (
              <Pressable
                accessibilityRole="button"
                onPress={onResetPreparedReplay}
                style={styles.modeButton}>
                <Text style={styles.modeButtonLabel}>
                  prepared raw 삭제 후 1번부터 다시 시작
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {phase1ResumeNotice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{phase1ResumeNotice}</Text>
          </View>
        ) : null}
        {preparedSequenceError ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              Prepared exact-30 sequence를 차단했습니다:{' '}
              {preparedSequenceError}. 같은 request ID를 재사용하지 말고
              events.jsonl을 확인한 뒤 새 계획 또는 검증된 수동 재개 절차를
              사용하세요.
            </Text>
          </View>
        ) : null}
        {preparedCollection ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              Prepared collection plan의 가명 ID와 10-shot 순서를 그대로 사용합니다.
              Phase 1 완료 전에는 다른 수집 모드를 시작할 수 없습니다.
            </Text>
          </View>
        ) : null}
        {preparedCollection && preparedExact30Completed ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>
              {phase1CompletionCleanupDone
                ? '완료된 기기 raw replay를 삭제해 이 세션을 종료했습니다. 같은 plan으로 재개하지 말고 새 가명 ID로 새 계획을 생성하세요.'
                : 'Prepared Phase 1과 Exact 30 수집이 완료됐습니다. export와 검증을 마쳤다면 아래 버튼으로 기기 raw replay를 삭제해 이 세션을 종료하세요. 삭제 뒤 같은 plan으로 재개하지 말고 새 가명 ID로 새 계획을 생성해야 합니다.'}
            </Text>
            {!phase1PrunePending && !phase1CompletionCleanupDone ? (
              <Pressable
                accessibilityRole="button"
                onPress={onCompletePreparedReplayCleanup}
                style={styles.modeButton}>
                <Text style={styles.modeButtonLabel}>
                  완료된 기기 raw 삭제 및 세션 종료
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.modeList}>
          {options.map(option => {
            const disabled =
              (option.mode === 'phase1-replay-10' && !poseValidationEnabled) ||
              (preparedCollection && Boolean(preparedSequenceError)) ||
              (option.mode === 'phase1-replay-10' &&
                (phase1PrunePending ||
                  Boolean(phase1PruneError) ||
                  (preparedCollection && phase1Completed))) ||
              (preparedCollection &&
                !phase1Completed &&
                option.mode !== 'phase1-replay-10') ||
              (preparedCollection &&
                phase1Completed &&
                option.mode !== 'exact-30') ||
              (preparedCollection &&
                preparedExact30Completed &&
                option.mode === 'exact-30') ||
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

function PreparedCollectionPlanBlocked({message}: {message: string}) {
  return (
    <SafeAreaView style={styles.modeScreen}>
      <View style={styles.modeContent}>
        <Text style={styles.eyebrow}>PREPARED COLLECTION BLOCKED</Text>
        <Text style={styles.modeTitle}>수집 계획을 사용할 수 없습니다</Text>
        <Text style={styles.modeDescription}>{message}</Text>
        <Text style={styles.modeDescription}>
          계획을 다시 생성하고 prepared-lab wrapper로 실행하세요. generic lab으로
          자동 폴백하지 않습니다.
        </Text>
      </View>
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

function Phase1NativeCaptureUnavailable({
  onChangeMode,
}: {
  onChangeMode: () => void;
}) {
  return (
    <SafeAreaView style={styles.modeScreen}>
      <View style={styles.modeContent}>
        <Text style={styles.eyebrow}>PHASE 1 BLOCKED</Text>
        <Text style={styles.modeTitle}>네이티브 전면 카메라가 필요합니다</Text>
        <Text style={styles.modeDescription}>
          Phase 1 replay는 AURA 네이티브 전면 카메라에서만 수집합니다. 현재 빌드에
          네이티브 촬영 모듈이 없으므로 앱을 다시 빌드한 뒤 시도해 주세요.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onChangeMode}
          style={styles.modeButton}>
          <Text style={styles.modeButtonLabel}>촬영 모드 선택으로 돌아가기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function UnifiedLabResult({
  capture,
  onChangeMode,
  onRetake,
  primaryActionLabel = '같은 정책으로 다시 촬영',
  result,
}: {
  capture: LabCapture;
  onChangeMode: () => void;
  onRetake: () => void;
  primaryActionLabel?: string;
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
          <Text style={styles.primaryButtonText}>{primaryActionLabel}</Text>
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
  const [
    phase1CompletionCleanupDone,
    setPhase1CompletionCleanupDone,
  ] = useState(false);
  const [phase1PrunePending, setPhase1PrunePending] = useState(true);
  const [phase1PruneError, setPhase1PruneError] = useState<string | null>(null);
  const [phase1ResumeNotice, setPhase1ResumeNotice] =
    useState<string | null>(null);
  const [preparedExact30CompletedShotCount, setPreparedExact30CompletedShotCount] =
    useState(0);
  const [preparedSequenceError, setPreparedSequenceError] =
    useState<string | null>(null);
  const preparedCollectionPlan =
    PHASE1_COLLECTION_PLAN_RESOLUTION.mode === 'prepared'
      ? PHASE1_COLLECTION_PLAN_RESOLUTION.plan
      : null;

  useEffect(() => {
    let active = true;

    void (async () => {
      const deletedCount =
        await pruneExpiredFaceRatioPhase1ReplayArtifacts();
      let resumeNotice =
        deletedCount > 0
          ? `만료되거나 손상된 raw replay ${deletedCount}개를 삭제했습니다.`
          : null;

      if (deletedCount > 0) {
        console.info('[aura:face-capture-lab] phase1:retention-pruned', {
          deletedCount,
        });
      }

      if (preparedCollectionPlan) {
        const firstValidation =
          preparedCollectionPlan.phase1.shots[0]
            ?.phase1ReplayValidation;
        if (!firstValidation) {
          throw new Error(
            'prepared collection plan has no first Phase 1 validation tuple',
          );
        }
        const artifact =
          await readFaceRatioPhase1ReplayArtifact(firstValidation);
        const phase1Progress = resolveFaceRatioPreparedCollectionProgress(
          artifact,
          preparedCollectionPlan,
        );

        if (active) {
          setPhase1Sequence(current => ({
            ...current,
            shotIndex: phase1Progress.nextShotIndex,
          }));
          setPhase1Completed(phase1Progress.phase1Completed);
        }
        if (phase1Progress.phase1Completed) {
          resumeNotice =
            '기존 prepared artifact의 canonical 10-shot을 확인했습니다. Exact 30 단계부터 계속합니다.';
        } else if (phase1Progress.completedShotCount > 0) {
          resumeNotice =
            `기존 prepared artifact ${phase1Progress.completedShotCount}/10을 확인했습니다. ` +
            `${phase1Progress.nextShotIndex}번 샷부터 재개합니다.`;
        }

        try {
          const exact30Progress =
            resolveFaceRatioPreparedExact30Progress(
              await readFace3DRuntimeEvidenceLog(),
              preparedCollectionPlan,
            );
          if (
            exact30Progress.completedShotCount > 0 &&
            !phase1Progress.phase1Completed
          ) {
            throw new Error(
              'Exact-30 evidence exists before the prepared Phase 1 prefix is complete',
            );
          }
          if (active) {
            setPreparedExact30CompletedShotCount(
              exact30Progress.completedShotCount,
            );
          }
          if (exact30Progress.phase2Completed) {
            resumeNotice =
              `기존 runtime evidence에서 Exact 30 ${exact30Progress.completedShotCount}/` +
              `${preparedCollectionPlan.phase2.exact30RepeatCount} 완료를 확인했습니다.`;
          } else if (phase1Progress.phase1Completed) {
            resumeNotice =
              `runtime evidence에서 Exact 30 ${exact30Progress.completedShotCount}/` +
              `${preparedCollectionPlan.phase2.exact30RepeatCount} durable 완료를 확인했습니다. ` +
              `${exact30Progress.nextShotIndex}번부터 재개하기 전에, 이전 실행이 기기 완료와 ` +
              'events.jsonl 기록 사이에서 중단되지 않았는지 확인하세요.';
          }
        } catch (error) {
          if (active) {
            setPreparedSequenceError(
              error instanceof Error ? error.message : String(error),
            );
          }
          return;
        }
      }

      if (active) {
        setPhase1ResumeNotice(resumeNotice);
      }
    })()
      .catch(error => {
        if (active) {
          setPhase1PruneError(
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        if (active) {
          setPhase1PrunePending(false);
        }
      });

    return () => {
      active = false;
    };
  }, [preparedCollectionPlan]);

  const preparedExact30Completed =
    Boolean(preparedCollectionPlan) &&
    preparedExact30CompletedShotCount >=
      (preparedCollectionPlan?.phase2.exact30RepeatCount ?? 0);
  const preparedExact30Shot =
    preparedCollectionPlan?.phase2.shots[
      preparedExact30CompletedShotCount
    ] ?? null;

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
    if (
      preparedCollectionPlan &&
      labMode === 'exact-30' &&
      !preparedExact30Shot
    ) {
      return null;
    }
    const collectionPolicyId = getUnifiedFaceCaptureLabPolicy(labMode);
    if (!collectionPolicyId) {
      return null;
    }

    return buildUnifiedFaceCaptureRequest({
      allowDiagnostics: true,
      collectionPolicyId,
      requestId:
        preparedCollectionPlan && labMode === 'exact-30'
          ? preparedExact30Shot!.shotId
          : `face-capture-lab-${labMode}-${modeRevision}-${Date.now()}`,
    });
  }, [
    labMode,
    modeRevision,
    preparedCollectionPlan,
    preparedExact30Shot,
  ]);

  const phase1ValidationReplay = useMemo(
    () => {
      if (!capture?.phase1ReplayAcquisition) {
        return null;
      }

      const preparedValidation =
        preparedCollectionPlan?.phase1.shots[
          phase1Sequence.shotIndex - 1
        ]?.phase1ReplayValidation;
      if (preparedValidation) {
        const actualAcquisition = capture.phase1ReplayAcquisition;
        if (
          preparedValidation.acquisition.source !==
            actualAcquisition.source ||
          preparedValidation.acquisition.captureImplementation !==
            actualAcquisition.captureImplementation ||
          preparedValidation.acquisition.cameraFacing !==
            actualAcquisition.cameraFacing
        ) {
          return null;
        }

        return preparedValidation;
      }

      return buildPhase1LabValidation({
        acquisition: capture.phase1ReplayAcquisition,
        runIndex: phase1Sequence.runIndex,
        shotIndex: phase1Sequence.shotIndex,
        subjectToken: phase1SubjectToken,
      });
    },
    [
      capture?.phase1ReplayAcquisition,
      phase1Sequence.runIndex,
      phase1Sequence.shotIndex,
      phase1SubjectToken,
      preparedCollectionPlan,
    ],
  );

  const releasePhase1LocalCapture = useCallback(
    (captureToRelease: LabCapture | null) => {
      if (labMode !== 'phase1-replay-10' || !captureToRelease) {
        return;
      }

      // 먼저 결과 화면의 참조를 끊고, 다음 task에서 네이티브 tmp 파일만 지운다.
      // Documents/앨범/원격 URI는 cleanup helper가 거부한다.
      setTimeout(() => {
        void deleteFaceRatioPhase1LocalCapture(captureToRelease.imageUri);
      }, 0);
    },
    [labMode],
  );

  const resetCapture = useCallback(() => {
    const captureToRelease = capture;
    setCapture(null);
    setUnifiedResult(null);
    setPhase1RawSaved(false);
    setResultMode('face3d');
    setModeRevision(current => current + 1);
    releasePhase1LocalCapture(captureToRelease);
  }, [capture, releasePhase1LocalCapture]);

  const finishPhase1Shot = useCallback(() => {
    const captureToRelease = capture;
    const completedShotIndex = phase1Sequence.shotIndex;
    setCapture(null);
    setUnifiedResult(null);
    setPhase1RawSaved(false);
    if (phase1RawSaved) {
      setPhase1Sequence(current => {
        // 결과 버튼의 빠른 연속 탭이 같은 저장 완료를 두 번 소비해
        // canonical prepared shot을 건너뛰지 못하게 한다.
        if (current.shotIndex !== completedShotIndex) {
          return current;
        }
        if (completedShotIndex >= PHASE1_REPLAY_SHOTS.length) {
          return preparedCollectionPlan
            ? current
            : {
                runIndex: current.runIndex + 1,
                shotIndex: 1,
              };
        }
        return {
          ...current,
          shotIndex: current.shotIndex + 1,
        };
      });
      if (completedShotIndex >= PHASE1_REPLAY_SHOTS.length) {
        setPhase1Completed(true);
        setLabMode(null);
      }
    }
    setResultMode('face3d');
    setModeRevision(current => current + 1);
    releasePhase1LocalCapture(captureToRelease);
  }, [
    capture,
    phase1RawSaved,
    phase1Sequence.shotIndex,
    preparedCollectionPlan,
    releasePhase1LocalCapture,
  ]);

  const handlePhase1AnalysisResult = useCallback(
    (result: FaceVerticalThirdsResult) => {
      setPhase1RawSaved(isFaceRatioPhase1ReplayShotComplete(result));
    },
    [],
  );

  const changeMode = useCallback(() => {
    const captureToRelease = capture;
    setCapture(null);
    setUnifiedResult(null);
    setResultMode('face3d');
    setLabMode(null);
    setPhase1RawSaved(false);
    if (!preparedCollectionPlan) {
      setPhase1Completed(false);
      setPhase1Sequence({runIndex: 1, shotIndex: 1});
    }
    setModeRevision(current => current + 1);
    releasePhase1LocalCapture(captureToRelease);
  }, [capture, preparedCollectionPlan, releasePhase1LocalCapture]);

  const resetPreparedReplay = useCallback(() => {
    const firstValidation =
      preparedCollectionPlan?.phase1.shots[0]
        ?.phase1ReplayValidation;
    if (!firstValidation) {
      return;
    }

    setPhase1PrunePending(true);
    setPhase1PruneError(null);
    void deleteFaceRatioPhase1ReplayArtifact(firstValidation)
      .then(() => pruneExpiredFaceRatioPhase1ReplayArtifacts())
      .then(() => {
        setPhase1Sequence({runIndex: 1, shotIndex: 1});
        setPhase1Completed(false);
        setPhase1ResumeNotice(
          '기존 prepared raw를 삭제했습니다. 1번 샷부터 다시 시작합니다.',
        );
      })
      .catch(error => {
        setPhase1PruneError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        setPhase1PrunePending(false);
      });
  }, [preparedCollectionPlan]);

  const completePreparedReplayCleanup = useCallback(() => {
    const firstValidation =
      preparedCollectionPlan?.phase1.shots[0]
        ?.phase1ReplayValidation;
    if (!firstValidation || !preparedExact30Completed) {
      return;
    }

    setPhase1PrunePending(true);
    setPhase1PruneError(null);
    void deleteFaceRatioPhase1ReplayArtifact(firstValidation)
      .then(() => pruneExpiredFaceRatioPhase1ReplayArtifacts())
      .then(() => {
        setPhase1CompletionCleanupDone(true);
        setPhase1ResumeNotice(
          '완료된 prepared 기기 raw replay를 삭제했습니다. 이 세션은 종료됐으며 같은 plan으로 재개할 수 없습니다.',
        );
      })
      .catch(error => {
        setPhase1PruneError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        setPhase1PrunePending(false);
      });
  }, [preparedCollectionPlan, preparedExact30Completed]);

  if (PHASE1_COLLECTION_PLAN_RESOLUTION.mode === 'invalid') {
    return (
      <PreparedCollectionPlanBlocked
        message={PHASE1_COLLECTION_PLAN_RESOLUTION.error}
      />
    );
  }

  if (!labMode) {
    return (
      <LabModePicker
        diagnosticsEnabled={diagnosticsEnabled}
        onCompletePreparedReplayCleanup={completePreparedReplayCleanup}
        onResetPreparedReplay={resetPreparedReplay}
        onSelect={mode => {
          if (!preparedCollectionPlan) {
            setPhase1Completed(false);
          }
          setLabMode(mode);
        }}
        phase1Completed={phase1Completed}
        phase1CompletionCleanupDone={phase1CompletionCleanupDone}
        phase1PruneError={phase1PruneError}
        phase1PrunePending={phase1PrunePending}
        phase1ResumeNotice={phase1ResumeNotice}
        poseValidationEnabled={poseValidationEnabled}
        preparedCollection={Boolean(preparedCollectionPlan)}
        preparedExact30Completed={preparedExact30Completed}
        preparedSequenceError={preparedSequenceError}
      />
    );
  }

  if (
    resultMode === 'unified' &&
    capture &&
    unifiedResult
  ) {
    const isPreparedExact30 =
      Boolean(preparedCollectionPlan) && labMode === 'exact-30';
    return (
      <UnifiedLabResult
        capture={capture}
        onChangeMode={changeMode}
        onRetake={
          isPreparedExact30 && preparedExact30Completed
            ? changeMode
            : resetCapture
        }
        primaryActionLabel={
          isPreparedExact30
            ? preparedExact30Completed
              ? 'Prepared Exact 30 수집 완료'
              : `다음 Exact 30 (${preparedExact30CompletedShotCount + 1}/${
                  preparedCollectionPlan!.phase2.exact30RepeatCount
                })`
            : undefined
        }
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
              ...(isPhase1Replay && phase1ValidationReplay
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
        onCaptureCommitted={async (result, upload) => {
          const isPreparedExact30 =
            Boolean(preparedCollectionPlan) && labMode === 'exact-30';
          if (isPreparedExact30) {
            if (
              !preparedExact30Shot ||
              result.type !==
                preparedExact30Shot.expectedEventType ||
              result.requestId !== preparedExact30Shot.shotId ||
              result.face3d.collectionPolicyId !==
                preparedExact30Shot.collectionPolicyId ||
              result.face3d.validFrameCount !==
                preparedExact30Shot.requiredValidFrameCount ||
              result.face3d.targetFrameCount !==
                preparedExact30Shot.requiredTargetFrameCount
            ) {
              throw new Error(
                'Prepared exact-30 completion does not match the current planned shot',
              );
            }
            const evidenceUri =
              await appendFace3DRuntimeEvidence(result);
            if (!evidenceUri) {
              throw new Error(
                'Prepared exact-30 completion was not persisted to runtime evidence',
              );
            }
            setPreparedExact30CompletedShotCount(current =>
              Math.max(
                current,
                preparedExact30CompletedShotCount + 1,
              ),
            );
            setPhase1ResumeNotice(
              `Prepared Exact 30 ${
                preparedExact30CompletedShotCount + 1
              }/${preparedCollectionPlan!.phase2.exact30RepeatCount}을 ` +
                'events.jsonl에 기록했습니다.',
            );
          } else {
            void appendFace3DRuntimeEvidence(result).catch(() => undefined);
          }
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
          if (preparedCollectionPlan && labMode === 'exact-30') {
            setLabMode(null);
            if (
              reason === 'unified_capture_commit_failed' ||
              reason === 'unified_capture_commit_rejected'
            ) {
              setPreparedSequenceError(
                `planned shot ${preparedExact30Shot?.shotId ?? 'unknown'} commit/evidence persistence failed`,
              );
            } else {
              setPhase1ResumeNotice(
                `Prepared Exact 30 ${
                  preparedExact30CompletedShotCount + 1
                }번은 commit 전에 실패했습니다. 같은 planned shot으로 다시 시도할 수 있습니다.`,
              );
            }
            return;
          }
          setLabMode('legacy-30');
        }}
        onRequestStarted={requestId => {
          if (
            preparedCollectionPlan &&
            labMode === 'exact-30' &&
            requestId !== preparedExact30Shot?.shotId
          ) {
            setPreparedSequenceError(
              `unexpected prepared exact-30 requestId ${requestId}`,
            );
          }
        }}
        request={unifiedRequest}
        uploadImage={uploadImage}
      />
    );
  }

  if (
    labMode === 'phase1-replay-10' &&
    !isRealtimeFaceCaptureAvailable()
  ) {
    return <Phase1NativeCaptureUnavailable onChangeMode={changeMode} />;
  }

  const cameraScreen = (
    <CameraFaceCaptureScreen
      allowCameraToggle={labMode !== 'phase1-replay-10'}
      allowGallery={labMode !== 'phase1-replay-10'}
      awaitCameraReleaseBeforeComplete
      captureMode="face"
      captureType="face_analysis"
      onCapture={(result, greenlightReport, runtimeProvenance) => {
        if (result) {
          const phase1ReplayAcquisition =
            labMode === 'phase1-replay-10'
              ? getPhase1ReplayAcquisition(
                  result,
                  greenlightReport,
                  runtimeProvenance,
                )
              : undefined;

          if (labMode === 'phase1-replay-10' && !phase1ReplayAcquisition) {
            console.info('[aura:face-capture-lab] phase1:capture-rejected', {
              cameraFacing: runtimeProvenance?.cameraFacing ?? null,
              captureImplementation:
                runtimeProvenance?.captureImplementation ?? null,
              finalCaptureGreenlight:
                greenlightReport?.finalCaptureGreenlight ?? false,
              hasNativeCaptureLock: Number.isFinite(
                greenlightReport?.nativeCameraMetadata?.captureLockedAtMs,
              ),
              source: result.source,
            });
            void deleteFaceRatioPhase1LocalCapture(result.imageUri);
            return;
          }

          const nextCapture = {
            ...(result as LabCapture),
            greenlightReport,
            ...(phase1ReplayAcquisition
              ? {phase1ReplayAcquisition}
              : {}),
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
