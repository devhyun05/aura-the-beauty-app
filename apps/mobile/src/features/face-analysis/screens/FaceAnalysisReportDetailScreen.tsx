import {useEffect, useMemo, useState} from 'react';
import {
  Image,
  ScrollView,
  Share,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {WandSparkles} from 'lucide-react-native';
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

const CREATE_FILTER_BUTTON_HEIGHT = 56;
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

      <ReportSection title="포인트 가이드">
        <View style={styles.guideList}>
          {guideItems.map((guide) => (
            <View key={guide.key} style={styles.guideItem}>
              <View style={styles.guideMarker} />
              <View style={styles.guideLine} />
              <View style={styles.guideText}>
                <Text style={styles.guideLabel}>{guide.label}</Text>
                <Text style={styles.guideDescription}>
                  {guide.detail}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ReportSection>

      <MakeupCardRail title="추천 메이크업" items={report.recommendedMakeups} />

      <Text style={styles.notice}>
        분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.
      </Text>
    </FaceAnalysisReportScaffold>
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
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
  return (
    <ReportSection title={title}>
      <ScrollView
        contentContainerStyle={styles.railContent}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {items.map((item) => (
          <View key={item.id} style={styles.makeupCard}>
            <View style={styles.makeupImageWrap}>
              <Image
                resizeMode="cover"
                source={item.imageSource}
                style={styles.makeupImage}
              />
            </View>
            <View style={styles.makeupBody}>
              <Text numberOfLines={1} style={styles.makeupTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.makeupSubtitle}>
                {item.subtitle}
              </Text>
              <Text style={styles.makeupDescription}>
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
        ))}
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
  guideDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  guideItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  guideLabel: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  guideLine: {
    backgroundColor: colors.borderStrong,
    height: 1,
    marginTop: 13,
    marginRight: spacing.md,
    width: 34,
  },
  guideList: {
    gap: spacing.md,
  },
  guideMarker: {
    backgroundColor: colors.textPrimary,
    borderRadius: 4,
    height: 8,
    marginTop: 9,
    width: 8,
  },
  guidePoint: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.xs,
  },
  guideText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
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
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  makeupCard: {
    ...faceAnalysisReportLiquidGlassSurfaceStyle,
    alignSelf: 'flex-start',
    borderRadius: radius.lg,
    padding: spacing.xs,
    width: 240,
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
  makeupImageWrap: {
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    height: 270,
    overflow: 'hidden',
    position: 'relative',
  },
  makeupSubtitle: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
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
  railContent: {
    gap: spacing.md,
    paddingRight: spacing.screenX,
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
  sectionTitle: {
    color: colors.textPrimary,
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
