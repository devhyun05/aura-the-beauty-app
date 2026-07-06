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
import {Download, Share2, WandSparkles} from 'lucide-react-native';
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
import {
  faceAnalysisReportCreateFilterButtonAccessibilityLabels,
  faceAnalysisReportLiquidGlassButtonStyle,
  getFaceAnalysisReportPointGuideItems,
  getFaceAnalysisReportPrimaryMakeupRecommendation,
  getFaceAnalysisReportScreenFramePresentation,
  getFaceAnalysisReportSubtitleTextStyle,
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
  headerTitle?: string;
  reportId?: string | null;
  onBack?: () => void;
  onCreateARFilter?: () => void;
  onHeaderShareActionChange?: (action: FaceAnalysisReportShareAction | null) => void;
};

type FaceAnalysisReportShareAction = () => void;
type FaceAnalysisReportShareTarget = 'save-image' | 'share-report';
type FaceAnalysisReportShareFeedback = {
  message: string;
};

const CREATE_FILTER_BUTTON_HEIGHT = 56;
const REPORT_IMAGE_POLL_INTERVAL_MS = 2000;
const REPORT_IMAGE_POLL_INITIAL_DELAY_MS = 800;
const MAKEUP_IMAGE_PENDING_TEXT = '\uC774\uBBF8\uC9C0 \uC0DD\uC131 \uC911';
const REPORT_BACKGROUND_COLOR = colors.surfaceMuted;
const REPORT_TEXT_PRIMARY = '#111827';
const REPORT_TEXT_BODY = '#1F2937';
const REPORT_TEXT_SECONDARY = '#374151';
const REPORT_CARD_BORDER = '#E5E7EB';
const REPORT_CAPTURE_OPTIONS = {
  format: 'jpg',
  quality: 0.95,
  result: 'tmpfile',
} as const;
const faceAnalysisReportScreenFramePresentation =
  getFaceAnalysisReportScreenFramePresentation();
const faceAnalysisReportSubtitleTextStyle =
  getFaceAnalysisReportSubtitleTextStyle();

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
  capturedPhotoUri,
  headerTitle = '맞춤 분석 보고서',
  reportId,
  onCreateARFilter,
  onHeaderShareActionChange,
}: FaceAnalysisReportDetailScreenProps) {
  const [loadState, setLoadState] =
    useState<FaceAnalysisReportDetailLoadState>({status: 'loading'});
  const [activeShareTarget, setActiveShareTarget] =
    useState<FaceAnalysisReportShareTarget | null>(null);
  const [shareFeedback, setShareFeedback] =
    useState<FaceAnalysisReportShareFeedback | null>(null);
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
        <Text style={styles.subtitle}>
          {formatReportDate(report.analyzedAt, profile?.name)}
        </Text>

        <View style={styles.heroCard}>
          <Image
            resizeMode="cover"
            source={heroImageSource}
            style={styles.heroImage}
            testID="face-analysis-report-hero-image"
          />
        </View>

        <View style={styles.summaryGrid}>
          {summaryItems.map((item) => (
            <SummaryItem key={item.label} label={item.label} value={item.value} />
          ))}
        </View>

        <ReportSection title={"분석 요약"}>
          <AnalysisSummaryBlock summary={report.skinAnalysisSummary || report.shortSummary} />
        </ReportSection>

        {primaryMakeupRecommendation ? (
          <PrimaryMakeupRecommendationCard recommendation={primaryMakeupRecommendation} />
        ) : null}

        <ReportSection title={"포인트 가이드"}>
          <FacePointGuideMap guideItems={guideItems} />
        </ReportSection>

        <Text style={styles.notice}>
          분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.
        </Text>
      </OptionalViewShot>

      <ReportShareActions
        activeTarget={activeShareTarget}
        feedback={shareFeedback}
        onPressShareAction={handleShareAction}
      />
    </FaceAnalysisReportScaffold>
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
    <View style={styles.pointGuideBoard}>
      {guideItems.map((guide, index) => (
        <View
          key={guide.key}
          style={[
            styles.pointGuideItem,
            index === guideItems.length - 1 ? styles.pointGuideItemLast : null,
          ]}>
          <Text style={styles.pointGuideLabel}>
            {guide.label}
          </Text>
          <Text style={styles.pointGuidePoint}>
            {guide.detail}
          </Text>
        </View>
      ))}
    </View>
  );
}
function FaceAnalysisReportScaffold({
  children,
  contentStyle,
  floatingAction,
  scroll = true,
}: {
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
            {paddingBottom: Math.max(insets.bottom, spacing.md)},
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
      <Text style={styles.createFilterButtonText}>AR 필터 만들기</Text>
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
      <Text style={styles.analysisSummaryText}>{summary}</Text>
    </View>
  );
}

function ReportSection({
  children,
  trailing,
  title,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
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
    <ReportSection title={"추천 메이크업"}>
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
        </View>
        <View style={styles.makeupBody}>
          <View style={styles.makeupTitleRow}>
            <View style={styles.makeupTitleTextGroup}>
              <Text style={styles.makeupEyebrow}>데일리</Text>
              <Text numberOfLines={2} style={styles.makeupTitle}>
                {makeupTitle}
              </Text>
            </View>
          </View>
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
    gap: spacing.xl,
  },
  analysisSummaryCard: {
    backgroundColor: colors.surface,
    borderColor: REPORT_CARD_BORDER,
    borderLeftColor: REPORT_TEXT_PRIMARY,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  analysisSummaryText: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
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
  heroCard: {
    backgroundColor: colors.surface,
    borderColor: REPORT_CARD_BORDER,
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 3,
    padding: spacing.xs,
    shadowColor: colors.black,
    shadowOffset: {height: 8, width: 0},
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  heroImage: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 360,
    width: '100%',
  },
  makeupBody: {
    backgroundColor: colors.surface,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  makeupCard: {
    backgroundColor: colors.surface,
    borderColor: REPORT_CARD_BORDER,
    borderRadius: radius.lg,
    borderWidth: 1,
    elevation: 4,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: {height: 8, width: 0},
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  makeupDescription: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  makeupEyebrow: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  makeupGuideCallout: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    borderColor: REPORT_CARD_BORDER,
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
  makeupSubtitle: {
    color: REPORT_TEXT_SECONDARY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
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
    backgroundColor: REPORT_BACKGROUND_COLOR,
    borderColor: REPORT_CARD_BORDER,
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
  paragraph: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  pointGuideBoard: {
    backgroundColor: colors.surface,
    borderColor: REPORT_CARD_BORDER,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pointGuideBubble: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    borderColor: REPORT_CARD_BORDER,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    marginHorizontal: spacing.md,
    marginLeft: spacing.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  pointGuideBubbleText: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  pointGuideIcon: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    marginTop: 2,
    width: 24,
  },
  pointGuideItem: {
    borderBottomColor: REPORT_CARD_BORDER,
    borderBottomWidth: 1,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pointGuideItemLast: {
    borderBottomWidth: 0,
  },
  pointGuideLabel: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  pointGuidePoint: {
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
  },
  pointGuideRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pointGuideTextGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  pointGuideRowExpanded: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
  },
  pointGuideRowPressed: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
  },
  reportContent: {
    gap: spacing.xl,
    paddingHorizontal: spacing.screenX,
    paddingTop: faceAnalysisReportScreenFramePresentation.contentTopPadding,
  },
  scrollBody: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    flex: 1,
  },
  section: {
    borderTopColor: REPORT_CARD_BORDER,
    borderTopWidth: 1,
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: REPORT_TEXT_PRIMARY,
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
    textShadowColor: 'rgba(17, 24, 39, 0.08)',
    textShadowOffset: {height: 1, width: 0},
    textShadowRadius: 1,
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
  subtitle: {
    color: REPORT_TEXT_BODY,
    fontSize: faceAnalysisReportSubtitleTextStyle.fontSize,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: faceAnalysisReportSubtitleTextStyle.lineHeight,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryItem: {
    backgroundColor: colors.surface,
    borderColor: REPORT_CARD_BORDER,
    borderRadius: radius.md,
    borderWidth: 1,
    elevation: 3,
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: {height: 8, width: 0},
    shadowOpacity: 0.08,
    shadowRadius: 12,
    width: '47%',
  },
  summaryLabel: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xs,
  },
  summaryValue: {
    color: REPORT_TEXT_PRIMARY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
  },
  tag: {
    backgroundColor: REPORT_BACKGROUND_COLOR,
    borderColor: REPORT_CARD_BORDER,
    borderRadius: radius.pill,
    borderWidth: 1,
    color: REPORT_TEXT_BODY,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
});
