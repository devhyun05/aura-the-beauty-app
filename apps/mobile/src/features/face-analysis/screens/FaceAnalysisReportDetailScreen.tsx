import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Download, Share2, ShoppingBag, Trash2, WandSparkles} from 'lucide-react-native';
import {Button, Text, View} from 'tamagui';

import {
  getFaceAnalysisReportById,
  getLatestFaceAnalysisReport,
} from '../../../shared/services/faceAnalysisService';
import {
  loadOptionalMediaLibraryModule,
  loadOptionalSharingModule,
} from '../../../shared/services/optionalNativeShareModules';
import {getUserProfile} from '../../../shared/services/userService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceAnalysisMakeupCard,
  FaceAnalysisReport,
} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {OptionalViewShot, type OptionalViewShotRef} from '../../../shared/ui/OptionalViewShot';
import {Face3DMetricGrid} from '../../face-3d/components/Face3DMetricGrid';
import type {Face3DProfile} from '../../face-3d/types';
import {
  PhotoStage,
  VerticalThirdsOverlay,
} from '../../face-ratio/components/VerticalThirdsOverlay';
import type {FaceVerticalThirdsResult} from '../../face-ratio/types';
import {PersonalColorTypeCard} from '../../personal-color/components/PersonalColorTypeCard';
import type {
  AuraPersonalColorResult,
  PersonalColorCorrectionStatus,
} from '../../personal-color/types';
import {
  faceAnalysisReportCreateFilterButtonAccessibilityLabels,
  faceAnalysisReportLiquidGlassButtonStyle,
  getFaceAnalysisReportEditorialPresentation,
  getFaceAnalysisReportPointGuideItems,
  getFaceAnalysisReportPrimaryMakeupRecommendation,
  getFaceAnalysisReportScreenFramePresentation,
  getFaceAnalysisReportSummaryItems,
  type FaceAnalysisReportCreateFilterButtonPlacement,
  type FaceAnalysisReportGuideItem,
  type FaceAnalysisReportPrimaryMakeupRecommendation,
} from '../services/faceAnalysisReportDetailModel';
import {
  type FaceAnalysisReportDetailLoadState,
  resolveFaceAnalysisReportDetailLoadState,
} from '../services/faceAnalysisReportDetailLoadState';

type FaceAnalysisReportDetailScreenProps = {
  analysisReport?: FaceAnalysisReport | null;
  capturedPhotoUri?: string;
  bottomOverlayHeight?: number;
  // 세션 내 ARKit 라이브 측정으로 얻은 3D 프로필(온디바이스, 정규화 5지표).
  // 과거 보고서(id 조회)나 측정 skip/실패면 null — 섹션을 렌더하지 않는다.
  face3d?: Face3DProfile | null;
  headerTitle?: string;
  reportId?: string | null;
  onBack?: () => void;
  onCreateARFilter?: () => void;
  onDeleteReport?: (reportId: string) => Promise<void> | void;
  onHeaderShareActionChange?: (action: FaceAnalysisReportShareAction | null) => void;
  onPressProducts?: (reportId: string) => void;
  // 세션 내 촬영에서 온디바이스로 진단한 퍼스널 컬러(로컬 전용).
  // 과거 보고서(id 조회)에는 없다. 판정 불가(insufficient)여도 섹션을 숨기지
  // 않고 사유 + 재촬영 안내를 표시한다 (조용한 실패 금지).
  personalColor?: AuraPersonalColorResult | null;
  // 위 결과의 조명 보정 상태 — applied면 corrected 결과가 메인으로 표시 중.
  personalColorCorrection?: PersonalColorCorrectionStatus | null;
  // 세션 내 촬영에서 온디바이스로 계산한 얼굴 세로 비율.
  // 과거 보고서(id 조회)에는 없으므로 null이면 섹션을 렌더하지 않는다.
  // blocked/failed 는 숨기지 않고 사유 + 재촬영 안내를 표시한다.
  verticalThirds?: FaceVerticalThirdsResult | null;
};

// 사후 게이트 차단 사유 → 사용자 안내 문구. 알 수 없는 코드는 일반 문구로.
const VERTICAL_THIRDS_BLOCKED_MESSAGES: Record<string, string> = {
  pose_gate_failed:
    '고개 각도(상하/좌우 기울임)가 커서 비율을 측정하지 못했어요. 정면을 바라보고 다시 촬영해 주세요.',
  face_not_detected: '사진에서 얼굴을 찾지 못했어요. 밝은 곳에서 다시 촬영해 주세요.',
  multiple_faces_detected: '얼굴이 여러 개 감지됐어요. 혼자 나온 사진으로 다시 촬영해 주세요.',
  required_keypoints_missing:
    '얼굴 기준점을 찾지 못했어요. 이마와 턱이 가려지지 않게 다시 촬영해 주세요.',
  vertical_keypoint_order_invalid:
    '얼굴 기준점이 비정상적으로 측정됐어요. 정면에서 다시 촬영해 주세요.',
};

function getVerticalThirdsBlockedMessage(statusReason?: string): string {
  return (
    (statusReason && VERTICAL_THIRDS_BLOCKED_MESSAGES[statusReason]) ??
    '얼굴 세로 비율을 측정하지 못했어요. 정면에서 다시 촬영해 주세요.'
  );
}

// 조명 보정 미적용 사유 → 사용자 안내 문구.
// illuminationCorrection.ts 의 실제 사유 코드는 region 접두사(scleraLeft_…)와
// 조합 코드(sclera_combined_…)를 섞어 쓰므로 정확 키가 아니라 프래그먼트로
// 매칭한다(우선순위 순). 첫 매칭 사유만 표기.
const CORRECTION_SKIP_RULES: Array<{fragment: string; message: string}> = [
  {
    fragment: 'redness',
    message: '눈이 충혈된 상태로 보여 조명 보정을 보류했어요.',
  },
  {
    fragment: 'disagree',
    message: '좌우 눈의 조명이 달라 보정을 보류했어요(빛을 정면으로 받아 보세요).',
  },
  {
    fragment: 'too_few_samples',
    message: '눈 흰자 표본이 부족해 조명 보정을 적용하지 못했어요(더 밝은 곳 권장).',
  },
  {
    fragment: 'one_eye_only',
    message: '한쪽 눈만 보여 조명 보정을 적용하지 못했어요(양쪽 눈이 보이게 촬영해 주세요).',
  },
  {
    fragment: 'extreme_cast',
    message: '조명 색이 치우쳐 있어 보정을 보류했어요(더 자연광에 가까운 곳 권장).',
  },
];

function getCorrectionSkipMessage(reasons: readonly string[]): string {
  for (const rule of CORRECTION_SKIP_RULES) {
    if (reasons.some(reason => reason.includes(rule.fragment))) {
      return rule.message;
    }
  }
  return '이번 촬영에는 조명 보정을 적용하지 못했어요(측정값은 조명 영향을 받을 수 있어요).';
}

type FaceAnalysisReportShareAction = () => void;
type FaceAnalysisReportShareTarget = 'save-image' | 'share-report';
type FaceAnalysisReportShareFeedback = {
  message: string;
};
type FaceAnalysisReportDetailActionFeedback = {
  message: string;
};

const CREATE_FILTER_BUTTON_HEIGHT = 56;
const REPORT_IMAGE_POLL_INTERVAL_MS = 2000;
const REPORT_IMAGE_POLL_INITIAL_DELAY_MS = 800;
const MAKEUP_IMAGE_PENDING_TEXT = '\uC774\uBBF8\uC9C0 \uC0DD\uC131 \uC911';
const REPORT_BACKGROUND_COLOR = colors.surfaceMuted;
const REPORT_PANEL_COLOR = colors.white;
const REPORT_PANEL_MUTED_COLOR = 'rgba(255, 255, 255, 0.72)';
const REPORT_TEXT_PRIMARY = colors.textPrimary;
const REPORT_TEXT_BODY = '#202326';
const REPORT_TEXT_SECONDARY = '#62666B';
const REPORT_CARD_BORDER = 'rgba(17, 24, 39, 0.08)';
const REPORT_CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
} as const;
const faceAnalysisReportScreenFramePresentation =
  getFaceAnalysisReportScreenFramePresentation();
const faceAnalysisReportEditorialPresentation =
  getFaceAnalysisReportEditorialPresentation();

export function resolveFaceAnalysisReportHeroImageSource(
  capturedPhotoUri?: string,
  report?: FaceAnalysisReport | null,
) {
  return capturedPhotoUri ? {uri: capturedPhotoUri} : report?.imageSource;
}

const formatReportDate = (dateText: string, name?: string) => {
  const date = new Date(dateText);
  const year = String(date.getFullYear()).slice(2);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const displayName = name ? `${name}님` : '서진님';

  return `${year}년 ${month}월 ${day}일 ${displayName}`;
};

const shareTargetLabels: Record<FaceAnalysisReportShareTarget, string> = {
  'save-image': "이미지 저장",
  'share-report': "공유하기",
};
export const faceAnalysisReportDetailActionLabels = {
  delete: "삭제",
  deleting: "삭제 중",
  products: "추천 제품",
} as const;
export const faceAnalysisReportDeleteConfirmationCopy = {
  cancel: "취소",
  confirm: "삭제",
  message: "삭제한 맞춤 분석 보고서는 되돌릴 수 없어요.",
  title: "보고서 삭제",
} as const;

function isMakeupImagePending(item?: FaceAnalysisMakeupCard | null) {
  return item?.imageStatus === 'pending';
}

function countPendingRecommendedMakeupImages(report: FaceAnalysisReport | null): number {
  const [primaryMakeup] = report?.recommendedMakeups ?? [];

  return isMakeupImagePending(primaryMakeup) ? 1 : 0;
}

function getReportCaptureTitle(profileName?: string) {
  return profileName ? [profileName, "님 맞춤 분석 보고서"].join('') : "맞춤 분석 보고서";
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function captureReportImage(reportCaptureRef: {current: OptionalViewShotRef | null}) {
  const captureTarget = reportCaptureRef.current;
  const capture = captureTarget?.capture;

  if (!captureTarget || !capture) {
    throw new Error("보고서 이미지를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  await waitForNextFrame();
  const imageUri = await capture.call(captureTarget);

  if (!imageUri) {
    throw new Error("보고서 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  return imageUri;
}

async function shareReportImageWithSystemSheet({
  imageUri,
  title,
}: {
  imageUri: string;
  title: string;
}): Promise<'shared' | 'dismissed'> {
  const sharingModule = loadOptionalSharingModule();
  const isSharingAvailable = sharingModule
    ? await sharingModule.isAvailableAsync()
    : false;

  if (sharingModule && isSharingAvailable) {
    await sharingModule.shareAsync(imageUri, {
      dialogTitle: title,
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
    });
    return 'shared';
  }

  const shareResult = await Share.share({
    title,
    url: imageUri,
  });

  return shareResult.action === Share.dismissedAction ? 'dismissed' : 'shared';
}

async function requestReportImageSavePermission() {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error('현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.');
  }

  const currentPermission = await mediaLibraryModule.getPermissionsAsync(true, ['photo']);
  const permission = currentPermission.granted
    ? currentPermission
    : await mediaLibraryModule.requestPermissionsAsync(true, ['photo']);

  if (!permission.granted) {
    throw new Error("사진 저장 권한이 필요합니다. 설정에서 사진 접근을 허용해 주세요.");
  }
}

async function saveReportImageToLibrary(imageUri: string) {
  const mediaLibraryModule = loadOptionalMediaLibraryModule();

  if (!mediaLibraryModule) {
    throw new Error('현재 설치된 앱에 사진 저장 모듈이 포함되어 있지 않아요. 앱을 새로 설치한 뒤 다시 시도해 주세요.');
  }

  try {
    await mediaLibraryModule.saveToLibraryAsync(imageUri);
  } catch (error) {
    console.info('[aura:analysis] report-share:save-to-library-failed', {
      imageUri,
      message: error instanceof Error ? error.message : String(error),
    });
    await mediaLibraryModule.createAssetAsync(imageUri);
  }
}

function getShareErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "공유 작업을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export function FaceAnalysisReportDetailScreen({
  analysisReport,
  bottomOverlayHeight = 0,
  capturedPhotoUri,
  face3d,
  headerTitle = '맞춤 분석 보고서',
  personalColor,
  personalColorCorrection,
  reportId,
  onCreateARFilter,
  onDeleteReport,
  onHeaderShareActionChange,
  onPressProducts,
  verticalThirds,
}: FaceAnalysisReportDetailScreenProps) {
  const [loadState, setLoadState] =
    useState<FaceAnalysisReportDetailLoadState>({status: 'loading'});
  const [activeShareTarget, setActiveShareTarget] =
    useState<FaceAnalysisReportShareTarget | null>(null);
  const [shareFeedback, setShareFeedback] =
    useState<FaceAnalysisReportShareFeedback | null>(null);
  const [isDeletingReport, setIsDeletingReport] = useState(false);
  const [actionFeedback, setActionFeedback] =
    useState<FaceAnalysisReportDetailActionFeedback | null>(null);
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

      return {
        report: nextReport,
        profile: nextProfile,
      };
    }).then((nextState) => {
      if (isMounted) {
        setLoadState(nextState);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [analysisReport, reportId]);

  const report = loadState.status === 'success' ? loadState.report : null;
  const profile = loadState.status === 'success' ? loadState.profile : null;
  const emptyTitle =
    loadState.status === 'loading'
      ? '보고서를 불러오는 중이에요'
      : loadState.status === 'error'
        ? loadState.message
        : '얼굴 분석 결과를 찾을 수 없어요';
  const emptyDescription =
    loadState.status === 'loading'
      ? '잠시만 기다려 주세요.'
      : loadState.status === 'error'
        ? loadState.description
        : '목록에서 얼굴 분석 결과를 다시 선택해 주세요.';

  const guideItems = useMemo(
    () => (report ? getFaceAnalysisReportPointGuideItems(report) : []),
    [report],
  );
  const summaryItems = useMemo(
    () => (report ? getFaceAnalysisReportSummaryItems(report) : []),
    [report],
  );
  const primaryMakeupRecommendation = useMemo(
    () => (report ? getFaceAnalysisReportPrimaryMakeupRecommendation(report, guideItems) : null),
    [guideItems, report],
  );
  const heroImageSource = resolveFaceAnalysisReportHeroImageSource(capturedPhotoUri, report);
  const pendingRecommendedMakeupImageCount = useMemo(
    () => countPendingRecommendedMakeupImages(report),
    [report],
  );

  useEffect(() => {
    if (!report?.id || pendingRecommendedMakeupImageCount === 0) {
      return;
    }

    let isCancelled = false;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollReportImages = async () => {
      try {
        const nextReport = await getFaceAnalysisReportById(report.id);

        if (!isCancelled && nextReport) {
          setLoadState(current =>
            current.status === 'success'
              ? {...current, report: nextReport}
              : current,
          );
        }
      } catch (error) {
        console.info('[aura:analysis] report-images:poll-failed', {
          message: error instanceof Error ? error.message : String(error),
          reportId: report.id,
        });
      } finally {
        if (!isCancelled) {
          pollTimeoutId = setTimeout(
            pollReportImages,
            REPORT_IMAGE_POLL_INTERVAL_MS,
          );
        }
      }
    };

    pollTimeoutId = setTimeout(pollReportImages, REPORT_IMAGE_POLL_INITIAL_DELAY_MS);

    return () => {
      isCancelled = true;

      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
    };
  }, [pendingRecommendedMakeupImageCount, report?.id]);

  const handleShareAction = useCallback(async (target: FaceAnalysisReportShareTarget) => {
    if (!report || activeShareTarget) {
      return;
    }

    const label = shareTargetLabels[target];
    const reportTitle = getReportCaptureTitle(profile?.name);

    setActiveShareTarget(target);
    setShareFeedback(null);

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
        title: reportTitle,
      });
    } catch (error) {
      console.info('[aura:analysis] report-share:failed', {
        message: error instanceof Error ? error.message : String(error),
        target,
      });
      const errorMessage = getShareErrorMessage(error);

      setShareFeedback({
        message: errorMessage,
      });
      Alert.alert([label, " 실패"].join(''), errorMessage);
    } finally {
      setActiveShareTarget(null);
    }
  }, [
    activeShareTarget,
    profile?.name,
    report,
  ]);

  const handleOpenShareOptions = useCallback(() => {
    if (!report) {
      return;
    }

    if (activeShareTarget) {
      Alert.alert("공유 준비 중", "이전 공유 작업을 처리하고 있어요. 잠시만 기다려 주세요.");
      return;
    }

    Alert.alert("맞춤 분석 보고서", "원하는 방식을 선택해 주세요.", [
      {
        text: shareTargetLabels['save-image'],
        onPress: () => {
          void handleShareAction('save-image');
        },
      },
      {
        text: shareTargetLabels['share-report'],
        onPress: () => {
          void handleShareAction('share-report');
        },
      },
      {text: "취소", style: 'cancel'},
    ]);
  }, [activeShareTarget, handleShareAction, report]);

  const handlePressProducts = useCallback(() => {
    if (report) {
      onPressProducts?.(report.id);
    }
  }, [onPressProducts, report]);

  const handleConfirmDeleteReport = useCallback(async () => {
    if (!report || !onDeleteReport || isDeletingReport) {
      return;
    }

    setIsDeletingReport(true);
    setActionFeedback(null);

    try {
      await onDeleteReport(report.id);
    } catch (error) {
      console.info('[aura:analysis] report-detail:delete-failed', {
        message: error instanceof Error ? error.message : String(error),
        reportId: report.id,
      });
      const message = "보고서를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.";

      setActionFeedback({message});
      Alert.alert("삭제 실패", message);
    } finally {
      setIsDeletingReport(false);
    }
  }, [isDeletingReport, onDeleteReport, report]);

  const handlePressDeleteReport = useCallback(() => {
    if (!report || !onDeleteReport || isDeletingReport) {
      return;
    }

    Alert.alert(
      faceAnalysisReportDeleteConfirmationCopy.title,
      faceAnalysisReportDeleteConfirmationCopy.message,
      [
        {text: faceAnalysisReportDeleteConfirmationCopy.cancel, style: 'cancel'},
        {
          text: faceAnalysisReportDeleteConfirmationCopy.confirm,
          onPress: () => {
            void handleConfirmDeleteReport();
          },
          style: 'destructive',
        },
      ],
    );
  }, [handleConfirmDeleteReport, isDeletingReport, onDeleteReport, report]);

  useEffect(() => {
    if (!report) {
      onHeaderShareActionChange?.(null);
      return;
    }

    onHeaderShareActionChange?.(handleOpenShareOptions);

    return () => {
      onHeaderShareActionChange?.(null);
    };
  }, [handleOpenShareOptions, onHeaderShareActionChange, report]);

  if (!report) {
    return (
      <FaceAnalysisReportScaffold
        bottomOverlayHeight={bottomOverlayHeight}
        contentStyle={styles.empty}
        scroll={false}
      >
        <Text accessibilityLiveRegion="polite" style={styles.emptyTitle}>
          {emptyTitle}
        </Text>
        <Text style={styles.emptyDescription}>
          {emptyDescription}
        </Text>
      </FaceAnalysisReportScaffold>
    );
  }

  return (
    <FaceAnalysisReportScaffold
      bottomOverlayHeight={bottomOverlayHeight}
      floatingAction={
        <CreateFilterButton
          onPress={onCreateARFilter}
          placement="floating-bottom"
        />
      }
    >
      <OptionalViewShot
        ref={reportCaptureRef}
        options={REPORT_CAPTURE_OPTIONS}
        style={styles.captureArea}
      >
        <ReportHero
          analyzedAt={report.analyzedAt}
          heroImageSource={heroImageSource}
          profileName={profile?.name}
          report={report}
          summaryItems={summaryItems}
        />

        <ReportSection eyebrow="AI TONE READING" title={"분석 요약"}>
          <AnalysisSummaryBlock summary={report.skinAnalysisSummary || report.shortSummary} />
        </ReportSection>

        {verticalThirds ? (
          verticalThirds.status === 'full_success' ||
          verticalThirds.status === 'partial_success' ? (
            <ReportSection title={"얼굴 세로 비율"}>
              <PhotoStage
                imageUri={verticalThirds.sourceImage.uri}
                result={verticalThirds}>
                <VerticalThirdsOverlay result={verticalThirds} />
              </PhotoStage>
            </ReportSection>
          ) : (
            // 조용한 실패 금지: 사후 게이트 차단(pose_gate_failed 등)이면 섹션을
            // 숨기지 않고 사유 + 재촬영 안내를 표시한다.
            <ReportSection title={"얼굴 세로 비율"}>
              <Text style={styles.sectionBlockedNotice}>
                {getVerticalThirdsBlockedMessage(verticalThirds.statusReason)}
              </Text>
            </ReportSection>
          )
        ) : null}

        {face3d ? (
          <ReportSection eyebrow="3D FACIAL DEPTH" title={"입체 특성"}>
            <Face3DMetricGrid profile={face3d} />
            <Text style={styles.face3dFrameCaption}>
              유효 프레임 {face3d.validFrameCount}/{face3d.targetFrameCount} · ARKit 얼굴 메시 측정
            </Text>
            {face3d.warnings.length > 0 ? (
              <View style={styles.face3dWarningCard}>
                {face3d.warnings.map(warning => (
                  <Text key={warning} selectable style={styles.face3dWarningText}>
                    • {warning}
                  </Text>
                ))}
              </View>
            ) : null}
          </ReportSection>
        ) : null}

        {personalColor ? (
          personalColor.status !== 'insufficient' && personalColor.tone ? (
            <ReportSection eyebrow="PERSONAL COLOR" title={"퍼스널 컬러 진단"}>
              <PersonalColorTypeCard result={personalColor} />
              {personalColorCorrection ? (
                <Text
                  style={
                    personalColorCorrection.applied
                      ? styles.correctionAppliedBadge
                      : styles.sectionBlockedNotice
                  }>
                  {personalColorCorrection.applied
                    ? '✓ 조명 보정 적용됨 — 촬영 조명의 색 왜곡을 제거한 결과예요.'
                    : getCorrectionSkipMessage(personalColorCorrection.reasons)}
                </Text>
              ) : null}
            </ReportSection>
          ) : (
            <ReportSection eyebrow="PERSONAL COLOR" title={"퍼스널 컬러 진단"}>
              <Text style={styles.sectionBlockedNotice}>
                퍼스널 컬러를 진단하지 못했어요(조명·각도 문제일 수 있어요). 밝고 균일한
                조명에서 다시 촬영해 주세요.
              </Text>
            </ReportSection>
          )
        ) : null}

        {primaryMakeupRecommendation ? (
          <PrimaryMakeupRecommendationCard recommendation={primaryMakeupRecommendation} />
        ) : null}

        <ReportSection eyebrow="MAKEUP TIPS" title={"메이크업 팁"}>
          <FacePointGuideMap guideItems={guideItems} />
        </ReportSection>

        <Text style={styles.notice}>
          분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.
        </Text>
      </OptionalViewShot>

      <ReportDetailActions
        feedback={actionFeedback}
        isDeleting={isDeletingReport}
        onPressDelete={onDeleteReport ? handlePressDeleteReport : undefined}
        onPressProducts={onPressProducts ? handlePressProducts : undefined}
      />

      <ReportShareActions
        activeTarget={activeShareTarget}
        feedback={shareFeedback}
        onPressShareAction={handleShareAction}
      />
    </FaceAnalysisReportScaffold>
  );
}

function ReportHero({
  analyzedAt,
  heroImageSource,
  profileName,
  report,
  summaryItems,
}: {
  analyzedAt: string;
  heroImageSource: ReturnType<typeof resolveFaceAnalysisReportHeroImageSource>;
  profileName?: string;
  report: FaceAnalysisReport;
  summaryItems: ReturnType<typeof getFaceAnalysisReportSummaryItems>;
}) {
  const {width} = useWindowDimensions();
  const heroHeight = Math.min(
    580,
    Math.max(faceAnalysisReportEditorialPresentation.heroMinimumHeight, width * 1.18),
  );

  return (
    <View style={styles.reportHero}>
      <View style={styles.reportHeroImageStage}>
        <Image
          resizeMode="cover"
          source={heroImageSource}
          style={[styles.reportHeroImage, {height: heroHeight}]}
          testID="face-analysis-report-hero-image"
        />
        <View style={styles.reportHeroScrim} />
        <View style={styles.reportHeroCopy}>
          <Text style={styles.reportHeroEyebrow}>
            PERSONAL BEAUTY REPORT
          </Text>
          <Text numberOfLines={2} style={styles.reportHeroTitle}>
            {report.recommendedMood}
          </Text>
          <Text style={styles.reportHeroSubtitle}>
            {formatReportDate(analyzedAt, profileName)}
          </Text>
        </View>
      </View>

      <View style={styles.summaryDeck}>
        <View style={styles.summaryDeckHeader}>
          <Text style={styles.summaryDeckEyebrow}>BEAUTY PROFILE</Text>
          <Text style={styles.summaryDeckTitle}>얼굴 무드 핵심값</Text>
        </View>
        <View style={styles.summaryGrid}>
          {summaryItems.map((item) => (
            <SummaryItem key={item.label} label={item.label} value={item.value} />
          ))}
        </View>
      </View>
    </View>
  );
}


function FacePointGuideMap({
  guideItems,
}: {
  guideItems: FaceAnalysisReportGuideItem[];
}) {
  if (guideItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.pointGuideTimeline}>
      {guideItems.map((guide, index) => (
        <View
          key={guide.key}
          style={[
            styles.pointGuideTimelineItem,
            index > 0 ? styles.pointGuideTimelineDivider : null,
          ]}>
          <View style={styles.pointGuideIndex}>
            <Text style={styles.pointGuideIndexText}>
              {String(index + 1).padStart(2, '0')}
            </Text>
            <Text style={styles.pointGuideLabel}>{guide.label}</Text>
          </View>
          <View style={styles.pointGuideTextGroup}>
            <Text style={styles.pointGuidePoint}>{guide.point}</Text>
            <Text style={styles.pointGuideDetail}>{guide.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
function FaceAnalysisReportScaffold({
  bottomOverlayHeight = 0,
  children,
  contentStyle,
  floatingAction,
  scroll = true,
}: {
  bottomOverlayHeight?: number;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  floatingAction?: React.ReactNode;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const contentContainerStyle = [
    styles.reportContent,
    {
      paddingBottom:
        Math.max(insets.bottom, spacing.xl) +
        bottomOverlayHeight +
        (floatingAction ? CREATE_FILTER_BUTTON_HEIGHT : 0) +
        spacing.xxl,
    },
    contentStyle,
  ];

  return (
    <AppScreen
      backgroundColor={REPORT_BACKGROUND_COLOR}
      bottomPadding={0}
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="none"
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          style={styles.scrollBody}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.staticBody, contentContainerStyle]}>{children}</View>
      )}
      {floatingAction ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.floatingCreateFilterArea,
            {
              bottom: bottomOverlayHeight,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
        >
          {floatingAction}
        </View>
      ) : null}
    </AppScreen>
  );
}

function CreateFilterButton({
  onPress,
  placement,
}: {
  onPress?: () => void;
  placement: FaceAnalysisReportCreateFilterButtonPlacement;
}) {
  return (
    <Button
      accessibilityLabel={faceAnalysisReportCreateFilterButtonAccessibilityLabels[placement]}
      accessibilityRole="button"
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={styles.createFilterButton}
      unstyled
    >
      <WandSparkles color={colors.textPrimary} size={iconSize.xs} strokeWidth={2} />
      <Text style={styles.createFilterButtonText}>메이크업 필터 만들기</Text>
    </Button>
  );
}

function SummaryItem({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={3} style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
}

function AnalysisSummaryBlock({summary}: {summary: string}) {
  return (
    <View style={styles.analysisSummaryCard}>
      <Text style={styles.analysisSummaryLead}>분석 핵심</Text>
      <Text style={styles.analysisSummaryText}>{summary}</Text>
    </View>
  );
}

function ReportSection({
  children,
  eyebrow,
  trailing,
  title,
}: {
  children: React.ReactNode;
  eyebrow?: string;
  trailing?: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleGroup}>
          {eyebrow ? <Text style={styles.sectionEyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function getMakeupMoodLabels(makeup: FaceAnalysisMakeupCard) {
  const labels = [
    "데일리",
    makeup.subtitle,
    ...makeup.tags.filter((tag) => tag !== "추천"),
  ]
    .map((label) => label.trim())
    .filter(Boolean);

  return Array.from(new Set(labels)).slice(0, 3);
}

function PrimaryMakeupRecommendationCard({
  recommendation,
}: {
  recommendation: FaceAnalysisReportPrimaryMakeupRecommendation;
}) {
  const {width} = useWindowDimensions();
  const imageHeight = Math.min(340, Math.max(236, width * 0.76));
  const {makeup} = recommendation;
  const isImagePending = isMakeupImagePending(makeup);
  const moodLabels = getMakeupMoodLabels(makeup);
  const makeupTitle = makeup.subtitle || makeup.title;

  return (
    <ReportSection eyebrow="BEST ROUTE" title={"추천 메이크업"}>
      <View style={styles.makeupCard}>
        <View style={[styles.makeupImageWrap, {height: imageHeight}]}>
          <Image
            resizeMode="cover"
            source={makeup.imageSource}
            style={[
              styles.makeupImage,
              isImagePending ? styles.makeupImagePending : null,
            ]}
          />
          <View style={styles.makeupImageScrim} />
          {isImagePending ? (
            <View style={styles.makeupImagePendingOverlay}>
              <ActivityIndicator color={colors.white} size="small" />
              <Text style={styles.makeupImagePendingText}>
                {MAKEUP_IMAGE_PENDING_TEXT}
              </Text>
            </View>
          ) : null}
          <View style={styles.makeupImageBadge}>
            <Text style={styles.makeupImageBadgeText}>BEST MATCH</Text>
          </View>
        </View>
        <View style={styles.makeupBody}>
          <View style={styles.makeupTitleRow}>
            <View style={styles.makeupTitleTextGroup}>
              <Text style={styles.makeupEyebrow}>RECOMMENDED LOOK</Text>
              <Text numberOfLines={2} style={styles.makeupTitle}>
                {makeupTitle}
              </Text>
            </View>
          </View>
          <View style={styles.makeupGuideCallout}>
            <Text style={styles.makeupGuideCaption}>적용 포인트</Text>
            <Text style={styles.makeupGuideText}>{recommendation.guideSummary}</Text>
          </View>
          <Text style={styles.makeupDescription}>
            {recommendation.reason}
          </Text>
          <View style={styles.makeupMoodRow}>
            {moodLabels.map((label) => (
              <Text key={label} numberOfLines={1} style={styles.makeupMoodTag}>
                {label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </ReportSection>
  );
}

function ReportDetailActions({
  feedback,
  isDeleting,
  onPressDelete,
  onPressProducts,
}: {
  feedback: FaceAnalysisReportDetailActionFeedback | null;
  isDeleting: boolean;
  onPressDelete?: () => void;
  onPressProducts?: () => void;
}) {
  if (!onPressProducts && !onPressDelete) {
    return null;
  }

  return (
    <View style={styles.reportDetailActionArea}>
      <View style={styles.reportDetailActionRow}>
        {onPressProducts ? (
          <Button
            accessibilityLabel={faceAnalysisReportDetailActionLabels.products}
            accessibilityRole="button"
            onPress={onPressProducts}
            pressStyle={{opacity: 0.72}}
            style={[styles.reportDetailActionButton, styles.reportProductsButton]}
            unstyled>
            <ShoppingBag color={colors.white} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.reportProductsButtonText}>
              {faceAnalysisReportDetailActionLabels.products}
            </Text>
          </Button>
        ) : null}

        {onPressDelete ? (
          <Button
            accessibilityLabel="맞춤 분석 보고서 삭제"
            accessibilityRole="button"
            accessibilityState={{busy: isDeleting, disabled: isDeleting}}
            disabled={isDeleting}
            disabledStyle={styles.reportDeleteButtonDisabled}
            onPress={onPressDelete}
            pressStyle={{opacity: 0.72}}
            style={[styles.reportDetailActionButton, styles.reportDeleteButton]}
            unstyled>
            {isDeleting ? (
              <ActivityIndicator color={colors.danger} size="small" />
            ) : (
              <Trash2 color={colors.danger} size={iconSize.xs} strokeWidth={2} />
            )}
            <Text style={styles.reportDeleteButtonText}>
              {isDeleting
                ? faceAnalysisReportDetailActionLabels.deleting
                : faceAnalysisReportDetailActionLabels.delete}
            </Text>
          </Button>
        ) : null}
      </View>

      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.reportDetailActionFeedback}>
          {feedback.message}
        </Text>
      ) : null}
    </View>
  );
}

function ReportShareActions({
  activeTarget,
  feedback,
  onPressShareAction,
}: {
  activeTarget: FaceAnalysisReportShareTarget | null;
  feedback: FaceAnalysisReportShareFeedback | null;
  onPressShareAction: (target: FaceAnalysisReportShareTarget) => Promise<void>;
}) {
  const shareActions: Array<{
    icon: React.ReactNode;
    target: FaceAnalysisReportShareTarget;
  }> = [
    {
      icon: <Download color={REPORT_TEXT_PRIMARY} size={iconSize.md} strokeWidth={2.1} />,
      target: 'save-image',
    },
    {
      icon: <Share2 color={REPORT_TEXT_PRIMARY} size={iconSize.md} strokeWidth={2.1} />,
      target: 'share-report',
    },
  ];

  return (
    <View style={styles.shareActionArea}>
      <View style={styles.shareActionRow}>
        {shareActions.map((action) => {
          const isActive = activeTarget === action.target;
          const isDisabled = Boolean(activeTarget);

          return (
            <Button
              accessibilityLabel={shareTargetLabels[action.target]}
              accessibilityRole="button"
              accessibilityState={{busy: isActive, disabled: isDisabled}}
              disabled={isDisabled}
              disabledStyle={styles.shareActionDisabled}
              key={action.target}
              onPress={() => {
                void onPressShareAction(action.target);
              }}
              pressStyle={{opacity: 0.56}}
              style={styles.shareActionButton}
              unstyled>
              {isActive ? (
                <ActivityIndicator color={REPORT_TEXT_PRIMARY} size="small" />
              ) : (
                action.icon
              )}
            </Button>
          );
        })}
      </View>
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.shareFeedback}>
          {feedback.message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
  },
  emptyDescription: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
  },
  captureArea: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    gap: spacing.sectionGap,
  },
  analysisSummaryCard: {
    backgroundColor: REPORT_PANEL_COLOR,
    borderColor: colors.transparent,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    shadowColor: colors.black,
    shadowOffset: {height: 8, width: 0},
    shadowOpacity: 0.03,
    shadowRadius: 14,
  },
  analysisSummaryLead: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  analysisSummaryText: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  floatingCreateFilterArea: {
    bottom: 0,
    left: 0,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.sm,
    position: 'absolute',
    right: 0,
    zIndex: 20,
  },
  createFilterButton: {
    ...faceAnalysisReportLiquidGlassButtonStyle,
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    height: CREATE_FILTER_BUTTON_HEIGHT,
    justifyContent: 'center',
    width: '100%',
  },
  createFilterButtonText: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  makeupBody: {
    backgroundColor: REPORT_PANEL_COLOR,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  makeupCard: {
    backgroundColor: REPORT_PANEL_COLOR,
    borderRadius: radius.lg,
    elevation: 0,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: {height: 8, width: 0},
    shadowOpacity: 0.03,
    shadowRadius: 18,
  },
  makeupDescription: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  makeupEyebrow: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  makeupGuideCallout: {
    backgroundColor: '#F5F1EA',
    borderColor: colors.transparent,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  makeupGuideCaption: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  makeupGuideText: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  makeupImage: {
    height: '100%',
    width: '100%',
  },
  makeupImageScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  makeupImagePending: {
    opacity: 0.44,
  },
  makeupImagePendingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.26)',
    bottom: 0,
    gap: spacing.xs,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  makeupImagePendingText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  makeupImageWrap: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    overflow: 'hidden',
    position: 'relative',
  },
  makeupImageBadge: {
    backgroundColor: REPORT_PANEL_MUTED_COLOR,
    borderColor: colors.transparent,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    position: 'absolute',
  },
  makeupImageBadgeText: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  makeupTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  makeupTitleTextGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  makeupTitle: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
    textShadowColor: 'rgba(17, 24, 39, 0.08)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 1,
  },
  makeupMoodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  makeupMoodTag: {
    backgroundColor: '#F3F0EA',
    borderColor: colors.transparent,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
    maxWidth: '100%',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  notice: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  // 3D 측정 프레임 수 캡션 — 지표 그리드 아래 근거 표시.
  face3dFrameCaption: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    marginTop: spacing.sm,
  },
  // 3D 측정 경고 카드 — 랩(Face3DAnalysisPanel) warningCard 팔레트와 동일.
  face3dWarningCard: {
    backgroundColor: '#FFF8F6',
    borderColor: '#F4D8D2',
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.lg,
  },
  face3dWarningText: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  // 측정 불가/보정 미적용 안내 — 섹션을 숨기는 대신 사유를 정직하게 노출.
  sectionBlockedNotice: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    marginTop: spacing.xs,
  },
  correctionAppliedBadge: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
    marginTop: spacing.xs,
  },
  pointGuideTimeline: {
    backgroundColor: REPORT_PANEL_COLOR,
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
  },
  pointGuideTimelineItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  pointGuideTimelineDivider: {
    borderTopColor: REPORT_CARD_BORDER,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pointGuideIndex: {
    alignItems: 'flex-start',
    gap: 2,
    paddingTop: 2,
    width: 58,
  },
  pointGuideIndexText: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  pointGuideLabel: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  pointGuidePoint: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  pointGuideDetail: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  pointGuideTextGroup: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  reportContent: {
    gap: spacing.sectionGap,
    paddingHorizontal: spacing.screenX,
    paddingTop: faceAnalysisReportScreenFramePresentation.contentTopPadding,
  },
  reportHero: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    marginHorizontal: -spacing.screenX,
    marginTop: -faceAnalysisReportScreenFramePresentation.contentTopPadding,
  },
  reportHeroCopy: {
    bottom: spacing.sectionGap,
    gap: spacing.sm,
    left: spacing.screenX,
    maxWidth: '84%',
    position: 'absolute',
    right: spacing.screenX,
  },
  reportHeroEyebrow: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  reportHeroImage: {
    backgroundColor: colors.blackSurface,
    width: '100%',
  },
  reportHeroImageStage: {
    overflow: 'hidden',
    position: 'relative',
  },
  reportHeroScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  reportHeroSubtitle: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  reportHeroTitle: {
    color: colors.white,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
  reportDeleteButton: {
    backgroundColor: REPORT_PANEL_COLOR,
    borderColor: 'rgba(220, 38, 38, 0.28)',
  },
  reportDeleteButtonDisabled: {
    opacity: 0.58,
  },
  reportDeleteButtonText: {
    color: colors.danger,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  reportDetailActionArea: {
    gap: spacing.xs,
  },
  reportDetailActionButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  reportDetailActionFeedback: {
    color: colors.danger,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  reportDetailActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  scrollBody: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    flex: 1,
  },
  sectionEyebrow: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  sectionTitleGroup: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  section: {
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  reportProductsButton: {
    backgroundColor: colors.blackSurface,
    borderColor: colors.textPrimary,
  },
  reportProductsButtonText: {
    color: colors.white,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  shareActionArea: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  shareActionButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  shareActionDisabled: {
    opacity: 0.52,
  },
  shareActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'center',
  },
  shareFeedback: {
    color: colors.danger,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  staticBody: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    flex: 1,
  },
  summaryDeck: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.xl,
  },
  summaryDeckHeader: {
    gap: 2,
  },
  summaryDeckEyebrow: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  summaryDeckTitle: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryItem: {
    backgroundColor: REPORT_PANEL_COLOR,
    borderColor: colors.transparent,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    minHeight: 82,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    width: '48%',
  },
  summaryLabel: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  summaryValue: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
});
