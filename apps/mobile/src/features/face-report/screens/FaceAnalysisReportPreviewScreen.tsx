import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getFaceAnalysisReportById,
  getLatestFaceAnalysisReport,
} from '../../../shared/services/faceAnalysisService';
import {getUserProfile} from '../../../shared/services/userService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {Face3DProfile} from '../../face-3d/types';
import type {FaceGeometryResult} from '../../face-geometry/types';
import type {FaceVerticalThirdsResult} from '../../face-ratio/types';
import type {AuraPersonalColorResult} from '../../personal-color/types';
import {shouldUseSessionMeasurements} from '../../face-analysis/services/faceAnalysisMeasurements';
import {
  resolveFaceAnalysisReportDetailLoadState,
  type FaceAnalysisReportDetailLoadState,
} from '../../face-analysis/services/faceAnalysisReportDetailLoadState';
import type {BodyProfile} from '../../ar/stencil/src/composer/bodyProfile';
import {loadBodyProfile} from '../../ar/stencil/src/storage/bodyProfileStore';
import BodyPanel from '../../ar/stencil/src/components/BodyPanel';
import type {OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';
import {ReportScreenScaffold} from '../ReportScreenScaffold';
import {color, font} from '../reportTokens';
import {
  buildReportDataFromFaceAnalysisReport,
  summarizeFace3DProfile,
  summarizeRegionMeasurements,
} from '../services/fromFaceAnalysisReport';
import {
  buildMinimumFaceReportData,
  type MinimumFaceReportPreview,
} from '../services/minimumFaceReport';
import {
  captureReportImage,
  getReportCaptureTitle,
  getShareErrorMessage,
  requestReportImageSavePermission,
  reportShareTargetLabels,
  saveReportImageToLibrary,
  shareReportImageWithSystemSheet,
  type ReportShareTarget,
} from '../services/reportImageShare';

export type FaceAnalysisReportPreviewScreenProps = {
  // Same session-props shape as FaceAnalysisReportDetailScreen — this preview
  // reads the same report/measurement sources, just renders them with the
  // redesigned S1–S7 UI instead of the current production layout.
  analysisReport?: FaceAnalysisReport | null;
  capturedPhotoUri?: string;
  face3d?: Face3DProfile | null;
  faceGeometry2d?: FaceGeometryResult | null;
  initialPageId?: string;
  minimumPreview?: MinimumFaceReportPreview | null;
  personalColor?: AuraPersonalColorResult | null;
  reportId?: string | null;
  sessionCaptureId?: string | null;
  verticalThirds?: FaceVerticalThirdsResult | null;
  onBack?: () => void;
  onRetake?: () => void;
  onPressProducts?: (reportId: string) => void;
};

function CenteredMessage({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.centeredTitle}>{title}</Text>
      {description ? <Text style={styles.centeredDescription}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={styles.centeredAction}>
          <Text style={styles.centeredActionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function FaceAnalysisReportPreviewScreen({
  analysisReport,
  capturedPhotoUri,
  face3d,
  faceGeometry2d,
  initialPageId,
  minimumPreview,
  personalColor,
  reportId,
  sessionCaptureId,
  verticalThirds,
  onBack,
  onRetake,
  onPressProducts,
}: FaceAnalysisReportPreviewScreenProps) {
  const insets = useSafeAreaInsets();
  const [loadState, setLoadState] = useState<FaceAnalysisReportDetailLoadState>({status: 'loading'});
  const [bodyProfile, setBodyProfile] = useState<BodyProfile | null>(null);
  const [isBodySurveyOpen, setIsBodySurveyOpen] = useState(false);
  const [activeShareTarget, setActiveShareTarget] = useState<ReportShareTarget | null>(null);
  const reportCaptureRef = useRef<OptionalViewShotRef | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoadState({status: 'loading'});

    resolveFaceAnalysisReportDetailLoadState(async () => {
      const providedReport = reportId ? null : analysisReport;
      const [nextReport, nextProfile] = await Promise.all([
        providedReport
          ? Promise.resolve(providedReport)
          : reportId
            ? getFaceAnalysisReportById(reportId)
            : minimumPreview
              ? Promise.resolve(null)
              : getLatestFaceAnalysisReport(),
        getUserProfile(),
      ]);
      return {report: nextReport, profile: nextProfile};
    }).then(nextState => {
      if (isMounted) {
        setLoadState(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [analysisReport, minimumPreview, reportId]);

  const reloadBodyProfile = useCallback(() => {
    void loadBodyProfile().then(setBodyProfile);
  }, []);

  useEffect(() => {
    reloadBodyProfile();
  }, [reloadBodyProfile]);

  const report =
    (!reportId ? analysisReport : null) ??
    (loadState.status === 'success' ? loadState.report : null);
  const profileGender = loadState.status === 'success' ? loadState.profile?.gender ?? null : null;
  const measurements = report?.measurements;
  // Same "3-반영 규칙" identity check the production report screen uses: session
  // measurement props only apply to the report captured in this session — a
  // past-report lookup (reportId) always restores from the server-saved values.
  const useSessionMeasurements = shouldUseSessionMeasurements({
    explicitReportId: reportId ?? null,
    reportCaptureId: measurements?.captureId ?? null,
    sessionCaptureId: sessionCaptureId ?? null,
  });
  const effectiveVerticalThirds =
    (useSessionMeasurements ? verticalThirds : null) ?? measurements?.faceVerticalThirds ?? null;
  const effectivePersonalColor =
    (useSessionMeasurements ? personalColor : null) ?? measurements?.personalColor?.reported ?? null;
  const effectiveFace3d = (useSessionMeasurements ? face3d : null) ?? measurements?.face3d ?? null;
  const sessionRegionVisuals = useSessionMeasurements ? faceGeometry2d?.regionVisuals : undefined;
  const sessionGeometryMetrics = useSessionMeasurements ? faceGeometry2d?.metrics : undefined;
  const effectiveRegionVisuals =
    sessionRegionVisuals ??
    measurements?.regionVisuals ??
    null;
  const effectiveGeometryMetrics =
    sessionGeometryMetrics ??
    measurements?.faceGeometry2d?.metrics ??
    null;

  const reportData = useMemo(() => {
    if (!report) {
      return null;
    }
    return buildReportDataFromFaceAnalysisReport({
      report,
      heroImageUri: reportId ? undefined : capturedPhotoUri,
      verticalThirds: effectiveVerticalThirds,
      personalColor: effectivePersonalColor,
      bodyProfile,
      regionVisuals: effectiveRegionVisuals,
      gender: profileGender,
      geometryMetrics: effectiveGeometryMetrics,
    });
  }, [
    bodyProfile,
    capturedPhotoUri,
    faceGeometry2d,
    effectiveGeometryMetrics,
    effectivePersonalColor,
    effectiveRegionVisuals,
    effectiveVerticalThirds,
    profileGender,
    report,
    reportId,
  ]);
  const minimumReportData = useMemo(
    () =>
      !report && minimumPreview
        ? buildMinimumFaceReportData(minimumPreview, verticalThirds)
        : null,
    [minimumPreview, report, verticalThirds],
  );
  const visibleReportData = useMemo(() => {
    if (!reportData) {
      return minimumReportData;
    }
    if (!initialPageId) {
      return reportData;
    }
    return {...reportData, initialPageId};
  }, [initialPageId, minimumReportData, reportData]);

  const measurementDebugPayload = useMemo(() => {
    if (!report) {
      return null;
    }

    return {
      reportId: report.id,
      explicitReportId: reportId ?? null,
      reportCaptureId: measurements?.captureId ?? null,
      sessionCaptureId: sessionCaptureId ?? null,
      useSessionMeasurements,
      storedMeasurements: measurements ?? null,
      sessionMeasurements: {
        face3d: face3d ?? null,
        faceGeometry2d: faceGeometry2d ?? null,
        faceVerticalThirds: verticalThirds ?? null,
        personalColor: personalColor ?? null,
      },
      effectiveForReportRendering: {
        face3d: effectiveFace3d,
        faceGeometryMetrics: effectiveGeometryMetrics,
        faceRegionVisuals: effectiveRegionVisuals,
        faceVerticalThirds: effectiveVerticalThirds,
        personalColor: effectivePersonalColor,
      },
    };
  }, [
    effectiveFace3d,
    effectiveGeometryMetrics,
    effectivePersonalColor,
    effectiveRegionVisuals,
    effectiveVerticalThirds,
    face3d,
    faceGeometry2d,
    measurements,
    personalColor,
    report,
    reportId,
    sessionCaptureId,
    useSessionMeasurements,
    verticalThirds,
  ]);

  const measurementDebugSummary = useMemo(
    () => [
      {label: '3D 측정', value: summarizeFace3DProfile(effectiveFace3d)},
      {
        label: '부위 기준선',
        value: summarizeRegionMeasurements(effectiveRegionVisuals, effectiveGeometryMetrics),
      },
    ],
    [effectiveFace3d, effectiveGeometryMetrics, effectiveRegionVisuals],
  );

  const handleCloseBodySurvey = useCallback(() => {
    setIsBodySurveyOpen(false);
    reloadBodyProfile();
  }, [reloadBodyProfile]);

  const profileName = loadState.status === 'success' ? loadState.profile?.name : undefined;

  const handleShareAction = useCallback(
    async (target: ReportShareTarget) => {
      if (!report || activeShareTarget) {
        return;
      }

      setActiveShareTarget(target);
      try {
        if (target === 'save-image') {
          await requestReportImageSavePermission();
        }

        const imageUri = await captureReportImage(reportCaptureRef);

        if (target === 'save-image') {
          await saveReportImageToLibrary(imageUri);
          return;
        }

        await shareReportImageWithSystemSheet({
          imageUri,
          title: getReportCaptureTitle(profileName),
        });
      } catch (error) {
        console.info('[aura:analysis] report-share:failed', {
          message: error instanceof Error ? error.message : String(error),
          target,
        });
        Alert.alert(`${reportShareTargetLabels[target]} 실패`, getShareErrorMessage(error));
      } finally {
        setActiveShareTarget(null);
      }
    },
    [activeShareTarget, profileName, report],
  );

  // 상세 보고서의 상단 더보기는 공유·저장·추천 제품만 제공한다.
  // 삭제는 보고서 목록 카드의 점점점 메뉴에서만 수행한다.
  const handleMore = useCallback(() => {
    if (!report) {
      return;
    }
    if (activeShareTarget) {
      Alert.alert('공유 준비 중', '이전 공유 작업을 처리하고 있어요. 잠시만 기다려 주세요.');
      return;
    }

    const options: Array<{text: string; onPress?: () => void; style?: 'cancel' | 'destructive'}> = [
      {
        text: reportShareTargetLabels['save-image'],
        onPress: () => void handleShareAction('save-image'),
      },
      {
        text: reportShareTargetLabels['share-report'],
        onPress: () => void handleShareAction('share-report'),
      },
    ];

    if (onPressProducts) {
      options.push({text: '추천 제품', onPress: () => onPressProducts(report.id)});
    }
    options.push({text: '취소', style: 'cancel'});

    Alert.alert('맞춤 분석 보고서', '원하는 작업을 선택해 주세요.', options);
  }, [
    activeShareTarget,
    handleShareAction,
    onPressProducts,
    report,
  ]);

  if (loadState.status === 'loading' && !visibleReportData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.accentDeep} />
      </View>
    );
  }

  if (!visibleReportData) {
    return loadState.status === 'error' ? (
      <CenteredMessage
        actionLabel={loadState.canRetake ? '다시 촬영' : undefined}
        description={loadState.description}
        onAction={loadState.canRetake ? onRetake : undefined}
        title={loadState.message}
      />
    ) : (
      <CenteredMessage
        description="목록에서 얼굴 분석 결과를 다시 선택해 주세요."
        title="얼굴 분석 결과를 찾을 수 없어요"
      />
    );
  }

  return (
    <>
      <ReportScreenScaffold
        captureRef={reportCaptureRef}
        data={visibleReportData}
        onBack={onBack}
        onMore={report ? handleMore : undefined}
        onResurvey={() => setIsBodySurveyOpen(true)}
        onRetake={onRetake}
        measurementDebugPayload={measurementDebugPayload}
        measurementDebugSummary={measurementDebugSummary}
      />
      {/*
        BodyPanel is the AR stencil's overlay card (maxHeight 460, dark glass) —
        not a full-screen screen. Rendered raw in a Modal it starts at y=0, which
        pushes its ✕ under the notch and out of reach. Center it over a dim
        backdrop inside the safe area so the close button is tappable, and let a
        backdrop tap dismiss too.
      */}
      <Modal
        animationType="fade"
        onRequestClose={handleCloseBodySurvey}
        transparent
        visible={isBodySurveyOpen}>
        <View style={styles.bodySurveyBackdrop}>
          <Pressable
            accessibilityLabel="체형 설문 닫기"
            onPress={handleCloseBodySurvey}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.bodySurveySheet,
              {paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12},
            ]}>
            <BodyPanel onClose={handleCloseBodySurvey} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bodySurveyBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    flex: 1,
    justifyContent: 'center',
  },
  bodySurveySheet: {
    justifyContent: 'center',
  },
  centered: {
    alignItems: 'center',
    backgroundColor: color.bg,
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  centeredDescription: {
    ...font(13, '400', 1.5),
    color: color.body,
    textAlign: 'center',
  },
  centeredAction: {
    backgroundColor: color.accentDeep,
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  centeredActionText: {
    ...font(14, '700'),
    color: color.white,
  },
  centeredTitle: {
    ...font(15, '700'),
    color: color.ink,
    textAlign: 'center',
  },
});
