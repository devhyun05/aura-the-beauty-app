import {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {ChevronDown, ChevronUp, WandSparkles} from 'lucide-react-native';
import {Button, Text, View} from 'tamagui';

import {
  getFaceAnalysisReportById,
  getLatestFaceAnalysisReport,
} from '../../../shared/services/faceAnalysisService';
import {getUserProfile} from '../../../shared/services/userService';
import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import type {
  FaceAnalysisMakeupCard,
  FaceAnalysisReport,
} from '../../../shared/types/faceAnalysis';
import {AppScreen} from '../../../shared/ui';
import {
  faceAnalysisReportCreateFilterButtonAccessibilityLabels,
  faceAnalysisReportLiquidGlassButtonStyle,
  faceAnalysisReportLiquidGlassSurfaceStyle,
  getFaceAnalysisReportPointGuideItems,
  getFaceAnalysisReportScreenFramePresentation,
  getFaceAnalysisReportSubtitleTextStyle,
  getFaceAnalysisReportSummaryItems,
  type FaceAnalysisReportCreateFilterButtonPlacement,
  type FaceAnalysisReportGuideItem,
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
  onShare?: (report: FaceAnalysisReport) => void;
};

type FaceAnalysisReportShareAction = () => void;
type FacePointGuideKey = FaceAnalysisReportGuideItem['key'];

const CREATE_FILTER_BUTTON_HEIGHT = 56;
const REPORT_IMAGE_POLL_INTERVAL_MS = 4000;
const MAKEUP_IMAGE_PENDING_TEXT = '\uC774\uBBF8\uC9C0 \uC0DD\uC131 \uC911';
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

function countPendingRecommendedMakeupImages(report: FaceAnalysisReport | null): number {
  return report?.recommendedMakeups.filter(item => item.imageStatus !== 'ready').length ?? 0;
}

export function FaceAnalysisReportDetailScreen({
  analysisReport,
  capturedPhotoUri,
  headerTitle = '맞춤 분석 보고서',
  reportId,
  onCreateARFilter,
  onHeaderShareActionChange,
  onShare,
}: FaceAnalysisReportDetailScreenProps) {
  const [loadState, setLoadState] =
    useState<FaceAnalysisReportDetailLoadState>({status: 'loading'});

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

    pollTimeoutId = setTimeout(pollReportImages, 1200);

    return () => {
      isCancelled = true;

      if (pollTimeoutId) {
        clearTimeout(pollTimeoutId);
      }
    };
  }, [pendingRecommendedMakeupImageCount, report?.id]);

  useEffect(() => {
    if (!report) {
      onHeaderShareActionChange?.(null);
      return;
    }

    const shareAction = () => {
      if (onShare) {
        onShare(report);
        return;
      }

      void Share.share({
        message: [
          formatReportDate(report.analyzedAt, profile?.name),
          `퍼스널 컬러: ${report.personalColor}`,
          `추천 무드: ${report.recommendedMood}`,
        ].join('\n'),
        title: headerTitle,
      });
    };

    onHeaderShareActionChange?.(shareAction);

    return () => {
      onHeaderShareActionChange?.(null);
    };
  }, [headerTitle, onHeaderShareActionChange, onShare, profile?.name, report]);

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

      <ReportSection title="분석 요약">
        <Text numberOfLines={3} style={styles.paragraph}>
          {report.skinAnalysisSummary || report.shortSummary}
        </Text>
      </ReportSection>

      <ReportSection title={'\uD3EC\uC778\uD2B8 \uAC00\uC774\uB4DC'}>
        <FacePointGuideMap guideItems={guideItems} />
      </ReportSection>

      <MakeupCardRail title="추천 메이크업" items={report.recommendedMakeups} />

      <Text style={styles.notice}>
        분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.
      </Text>
    </FaceAnalysisReportScaffold>
  );
}


function FacePointGuideMap({
  guideItems,
}: {
  guideItems: FaceAnalysisReportGuideItem[];
}) {
  const [expandedGuideKey, setExpandedGuideKey] = useState<FacePointGuideKey | null>(null);

  useEffect(() => {
    if (
      expandedGuideKey &&
      !guideItems.some((guide) => guide.key === expandedGuideKey)
    ) {
      setExpandedGuideKey(null);
    }
  }, [expandedGuideKey, guideItems]);

  if (guideItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.pointGuideBoard}>
      {guideItems.map((guide, index) => {
        const isExpanded = guide.key === expandedGuideKey;

        return (
          <View
            key={guide.key}
            style={[
              styles.pointGuideItem,
              index === guideItems.length - 1 ? styles.pointGuideItemLast : null,
            ]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{expanded: isExpanded}}
              onPress={() =>
                setExpandedGuideKey((currentGuideKey) =>
                  currentGuideKey === guide.key ? null : guide.key,
                )
              }
              style={({pressed}) => [
                styles.pointGuideRow,
                isExpanded ? styles.pointGuideRowExpanded : null,
                pressed ? styles.pointGuideRowPressed : null,
              ]}>
              <Text numberOfLines={1} style={styles.pointGuideLabel}>
                {guide.label}
              </Text>
              <View style={styles.pointGuideIcon}>
                {isExpanded ? (
                  <ChevronUp
                    color={colors.textTertiary}
                    size={iconSize.sm}
                    strokeWidth={2}
                  />
                ) : (
                  <ChevronDown
                    color={colors.textTertiary}
                    size={iconSize.sm}
                    strokeWidth={2}
                  />
                )}
              </View>
            </Pressable>
            {isExpanded ? (
              <View style={styles.pointGuideBubble}>
                <Text style={styles.pointGuideBubbleText}>{guide.detail}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
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
      backgroundColor={colors.surfaceMuted}
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
      <Text numberOfLines={2} style={styles.summaryValue}>
        {value}
      </Text>
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

function MakeupCardRail({
  items,
  title,
}: {
  items: FaceAnalysisMakeupCard[];
  title: string;
}) {
  const {width} = useWindowDimensions();
  const cardWidth = Math.min(286, Math.max(230, width * 0.72));
  const snapInterval = cardWidth + spacing.md;
  const visibleItems = items.slice(0, 3);

  return (
    <ReportSection title={title}>
      <ScrollView
        style={styles.railViewport}
        contentContainerStyle={styles.railContent}
        decelerationRate="fast"
        horizontal
        removeClippedSubviews={false}
        snapToAlignment="start"
        snapToInterval={snapInterval}
        showsHorizontalScrollIndicator={false}
      >
        {visibleItems.map((item) => {
          const isImagePending = item.imageStatus !== 'ready';

          return (
            <View key={item.id} style={[styles.makeupCard, {width: cardWidth}]}>
              <View style={styles.makeupImageWrap}>
                <Image
                  resizeMode="cover"
                  source={item.imageSource}
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
                    <Text numberOfLines={1} style={styles.makeupTitle}>
                      {item.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.makeupSubtitle}>
                      {item.subtitle}
                    </Text>
                  </View>
                </View>
                <Text numberOfLines={3} style={styles.makeupDescription}>
                  {item.description}
                </Text>
                <View style={styles.tagRow}>
                  {item.tags.slice(0, 2).map((tag) => (
                    <Text key={tag} style={styles.tag}>
                      {tag}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </ReportSection>
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
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
    textAlign: 'center',
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
    color: colors.textPrimary,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.md,
  },
  heroCard: {
    ...faceAnalysisReportLiquidGlassSurfaceStyle,
    borderRadius: radius.lg,
    padding: spacing.xs,
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
    borderColor: colors.border,
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
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
  makeupImage: {
    height: '100%',
    width: '100%',
  },
  makeupImageScrim: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
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
    backgroundColor: colors.surfaceMuted,
    height: 220,
    overflow: 'hidden',
    position: 'relative',
  },
  makeupSubtitle: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
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
    color: colors.textPrimary,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  notice: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  paragraph: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
  paragraphMuted: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.sm,
  },
  pointGuideBoard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pointGuideBubble: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'relative',
  },
  pointGuideBubbleText: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  pointGuideIcon: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  pointGuideItem: {
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
  },
  pointGuideItemLast: {
    borderBottomWidth: 0,
  },
  pointGuideLabel: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
    minWidth: 0,
  },
  pointGuideRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pointGuideRowExpanded: {
    backgroundColor: colors.surfaceMuted,
  },
  pointGuideRowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  railContent: {
    gap: spacing.md,
    paddingHorizontal: spacing.screenX,
    paddingVertical: spacing.sm,
  },
  railViewport: {
    marginHorizontal: -spacing.screenX,
    overflow: 'visible',
  },
  reportContent: {
    gap: spacing.xl,
    paddingHorizontal: spacing.screenX,
    paddingTop: faceAnalysisReportScreenFramePresentation.contentTopPadding,
  },
  scrollBody: {
    backgroundColor: colors.surfaceMuted,
    flex: 1,
  },
  section: {
    borderTopColor: colors.divider,
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
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  staticBody: {
    backgroundColor: colors.surfaceMuted,
    flex: 1,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: faceAnalysisReportSubtitleTextStyle.fontSize,
    fontWeight: typography.fontWeight.medium,
    lineHeight: faceAnalysisReportSubtitleTextStyle.lineHeight,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryItem: {
    ...faceAnalysisReportLiquidGlassSurfaceStyle,
    borderRadius: radius.md,
    flexGrow: 1,
    gap: spacing.xs,
    minHeight: 72,
    padding: spacing.md,
    width: '47%',
  },
  summaryLabel: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  tag: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
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
