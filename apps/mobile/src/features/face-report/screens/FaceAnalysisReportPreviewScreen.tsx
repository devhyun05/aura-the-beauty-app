import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  getFaceAnalysisReportById,
  getLatestFaceAnalysisReport,
} from '../../../shared/services/faceAnalysisService';
import {getUserProfile} from '../../../shared/services/userService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
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
import {ReportScreenScaffold} from '../ReportScreenScaffold';
import {color, font} from '../reportTokens';
import {buildReportDataFromFaceAnalysisReport} from '../services/fromFaceAnalysisReport';

export type FaceAnalysisReportPreviewScreenProps = {
  // Same session-props shape as FaceAnalysisReportDetailScreen — this preview
  // reads the same report/measurement sources, just renders them with the
  // redesigned S1–S7 UI instead of the current production layout.
  analysisReport?: FaceAnalysisReport | null;
  capturedPhotoUri?: string;
  personalColor?: AuraPersonalColorResult | null;
  reportId?: string | null;
  sessionCaptureId?: string | null;
  verticalThirds?: FaceVerticalThirdsResult | null;
  onBack?: () => void;
  onMore?: () => void;
  onRetake?: () => void;
};

function CenteredMessage({title, description}: {title: string; description?: string}) {
  return (
    <View style={styles.centered}>
      <Text style={styles.centeredTitle}>{title}</Text>
      {description ? <Text style={styles.centeredDescription}>{description}</Text> : null}
    </View>
  );
}

export function FaceAnalysisReportPreviewScreen({
  analysisReport,
  capturedPhotoUri,
  personalColor,
  reportId,
  sessionCaptureId,
  verticalThirds,
  onBack,
  onMore,
  onRetake,
}: FaceAnalysisReportPreviewScreenProps) {
  const insets = useSafeAreaInsets();
  const [loadState, setLoadState] = useState<FaceAnalysisReportDetailLoadState>({status: 'loading'});
  const [bodyProfile, setBodyProfile] = useState<BodyProfile | null>(null);
  const [isBodySurveyOpen, setIsBodySurveyOpen] = useState(false);

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
  }, [analysisReport, reportId]);

  const reloadBodyProfile = useCallback(() => {
    void loadBodyProfile().then(setBodyProfile);
  }, []);

  useEffect(() => {
    reloadBodyProfile();
  }, [reloadBodyProfile]);

  const report = loadState.status === 'success' ? loadState.report : null;
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
    });
  }, [bodyProfile, capturedPhotoUri, effectivePersonalColor, effectiveVerticalThirds, report, reportId]);

  const handleCloseBodySurvey = useCallback(() => {
    setIsBodySurveyOpen(false);
    reloadBodyProfile();
  }, [reloadBodyProfile]);

  if (loadState.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={color.accentDeep} />
      </View>
    );
  }

  if (!reportData) {
    return loadState.status === 'error' ? (
      <CenteredMessage description={loadState.description} title={loadState.message} />
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
        data={reportData}
        onBack={onBack}
        onMore={onMore}
        onResurvey={() => setIsBodySurveyOpen(true)}
        onRetake={onRetake}
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
  centeredTitle: {
    ...font(15, '700'),
    color: color.ink,
    textAlign: 'center',
  },
});
