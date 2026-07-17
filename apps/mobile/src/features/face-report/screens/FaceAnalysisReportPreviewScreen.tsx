import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
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
import type {OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';
import {ReportScreenScaffold} from '../ReportScreenScaffold';
import {color, font} from '../reportTokens';
import {buildReportDataFromFaceAnalysisReport} from '../services/fromFaceAnalysisReport';
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
  personalColor?: AuraPersonalColorResult | null;
  reportId?: string | null;
  sessionCaptureId?: string | null;
  verticalThirds?: FaceVerticalThirdsResult | null;
  onBack?: () => void;
  onRetake?: () => void;
  // 옛 보고서 화면에 있던 액션들 — 화면 교체로 사라지지 않도록 포팅했다.
  onCreateARFilter?: () => void;
  onDeleteReport?: (reportId: string) => Promise<void> | void;
  onPressProducts?: (reportId: string) => void;
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
  onRetake,
  onCreateARFilter,
  onDeleteReport,
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

  const handleConfirmDelete = useCallback(async () => {
    if (!report || !onDeleteReport) {
      return;
    }
    try {
      await onDeleteReport(report.id);
    } catch (error) {
      console.info('[aura:analysis] report-detail:delete-failed', {
        message: error instanceof Error ? error.message : String(error),
        reportId: report.id,
      });
      Alert.alert('삭제 실패', '보고서를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  }, [onDeleteReport, report]);

  // 상단 "더보기" → 옛 화면의 공유/저장/추천제품/삭제 액션 메뉴.
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
    if (onDeleteReport) {
      options.push({
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          Alert.alert('보고서 삭제', '삭제한 맞춤 분석 보고서는 되돌릴 수 없어요.', [
            {text: '취소', style: 'cancel'},
            {text: '삭제', style: 'destructive', onPress: () => void handleConfirmDelete()},
          ]),
      });
    }
    options.push({text: '취소', style: 'cancel'});

    Alert.alert('맞춤 분석 보고서', '원하는 작업을 선택해 주세요.', options);
  }, [
    activeShareTarget,
    handleConfirmDelete,
    handleShareAction,
    onDeleteReport,
    onPressProducts,
    report,
  ]);

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
        captureRef={reportCaptureRef}
        data={reportData}
        onBack={onBack}
        onMore={handleMore}
        // 푸터 CTA는 '메이크업 추천 보러가기' 라벨이므로 AR 추천으로 간다.
        // 재촬영은 S2의 "이마가 보이게 다시 찍기" 링크가 담당한다.
        onPressCta={onCreateARFilter}
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
