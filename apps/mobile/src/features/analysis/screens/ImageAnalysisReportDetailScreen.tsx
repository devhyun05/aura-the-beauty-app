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
import {Share2, WandSparkles} from 'lucide-react-native';
import {Button, Text, View, XStack} from 'tamagui';

import {
  getImageAnalysisReportById,
  getLatestImageAnalysisReport,
} from '../../../shared/services/imageAnalysisService';
import {getUserProfile} from '../../../shared/services/userService';
import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import type {
  ImageAnalysisFacePointGuide,
  ImageAnalysisMakeupCard,
  ImageAnalysisReport,
} from '../../../shared/types/imageAnalysis';
import type {UserProfile} from '../../../shared/types/myPage';
import {AppHeader, XIcon} from '../../../shared/ui';

type ImageAnalysisReportDetailScreenProps = {
  reportId?: string | null;
  onBack?: () => void;
  onCreateARFilter?: () => void;
  onShare?: (report: ImageAnalysisReport) => void;
};

type GuideItem = {
  key: keyof ImageAnalysisFacePointGuide;
  label: string;
  point: string;
  detail: string;
};

type CreateFilterButtonPlacement = 'photo' | 'report-bottom';
type ImageAnalysisReportHeaderAction = 'share' | 'close';
type ImageAnalysisReportLiquidGlassButtonTarget = 'create-filter' | 'header-action';
type ImageAnalysisReportLiquidGlassCardTarget = 'hero' | 'summary' | 'makeup';

const guideLabels: Array<Pick<GuideItem, 'key' | 'label' | 'point'>> = [
  {key: 'brow', label: '눈썹', point: '자연스러운 아치형'},
  {key: 'eyeshadow', label: '아이섀도우', point: '뉴트럴 베이지 톤'},
  {key: 'lip', label: '립', point: 'MLBB 계열'},
  {key: 'highlight', label: '하이라이트', point: 'T존, 눈밑 삼각존'},
  {key: 'eyeliner', label: '아이라이너', point: '점막 채우기'},
  {key: 'blush', label: '블러셔', point: '뉴트럴 핑크'},
];

const createFilterButtonPlacements = [
  'photo',
  'report-bottom',
] as const satisfies readonly CreateFilterButtonPlacement[];

const createFilterButtonAccessibilityLabels: Record<
  CreateFilterButtonPlacement,
  string
> = {
  photo: '사진 아래 AR 필터 만들기',
  'report-bottom': 'AR 필터 만들기',
};
const imageAnalysisReportHeaderActions = [
  'share',
  'close',
] as const satisfies readonly ImageAnalysisReportHeaderAction[];
const imageAnalysisReportSubtitleTextStyle = {
  fontSize: typography.fontSize.md,
  lineHeight: typography.lineHeight.md,
} as const;
const imageAnalysisReportScreenFramePresentation = {
  contentTopPadding: spacing.xl,
  headerPlacement: 'fixed',
  headerUsesTopInset: true,
} as const;
const imageAnalysisReportLiquidGlassSurfaceStyle = {
  backgroundColor: colors.liquidGlassSurface,
  borderColor: colors.liquidGlassBorder,
  borderWidth: 1,
  elevation: 4,
  shadowColor: colors.black,
  shadowOffset: {width: 0, height: 10},
  shadowOpacity: 0.1,
  shadowRadius: shadows.liquidGlassGlow.shadowRadius,
} satisfies ViewStyle;
const imageAnalysisReportLiquidGlassButtonStyle = {
  ...imageAnalysisReportLiquidGlassSurfaceStyle,
  elevation: 5,
  shadowOffset: {width: 0, height: 8},
  shadowOpacity: 0.12,
} satisfies ViewStyle;
const imageAnalysisReportLiquidGlassPresentation = {
  buttonTargets: [
    'create-filter',
    'header-action',
  ] as const satisfies readonly ImageAnalysisReportLiquidGlassButtonTarget[],
  cardTargets: [
    'hero',
    'summary',
    'makeup',
  ] as const satisfies readonly ImageAnalysisReportLiquidGlassCardTarget[],
  shadowRadius: imageAnalysisReportLiquidGlassSurfaceStyle.shadowRadius,
  surfaceColor: colors.liquidGlassSurface,
} as const;

export function getImageAnalysisReportCreateFilterButtonPlacements() {
  return createFilterButtonPlacements;
}

export function getImageAnalysisReportHeaderActions() {
  return imageAnalysisReportHeaderActions;
}

export function getImageAnalysisReportSubtitleTextStyle() {
  return imageAnalysisReportSubtitleTextStyle;
}

export function getImageAnalysisReportScreenFramePresentation() {
  return imageAnalysisReportScreenFramePresentation;
}

export function getImageAnalysisReportLiquidGlassPresentation() {
  return imageAnalysisReportLiquidGlassPresentation;
}

const formatReportDate = (dateText: string, name?: string) => {
  const date = new Date(dateText);
  const year = String(date.getFullYear()).slice(2);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const displayName = name ? `${name}님` : '서진님';

  return `${year}년 ${month}월 ${day}일 ${displayName}`;
};

export function ImageAnalysisReportDetailScreen({
  reportId,
  onBack,
  onCreateARFilter,
  onShare,
}: ImageAnalysisReportDetailScreenProps) {
  const [report, setReport] = useState<ImageAnalysisReport | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setIsLoaded(false);

    Promise.all([
      reportId
        ? getImageAnalysisReportById(reportId)
        : getLatestImageAnalysisReport(),
      getUserProfile(),
    ]).then(([nextReport, nextProfile]) => {
      if (isMounted) {
        setReport(nextReport);
        setProfile(nextProfile);
        setIsLoaded(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [reportId]);

  const guideItems = useMemo<GuideItem[]>(() => {
    if (!report) {
      return [];
    }

    return guideLabels.map((guide) => ({
      ...guide,
      detail: report.facePointGuide[guide.key],
    }));
  }, [report]);

  if (!report) {
    return (
      <ImageAnalysisReportScaffold
        contentStyle={styles.empty}
        onClose={onBack}
        onShare={onShare}
        profileName={profile?.name}
        report={report}
        scroll={false}
      >
        <Text style={styles.emptyTitle}>
          {isLoaded ? '이미지 분석 결과를 찾을 수 없어요' : '보고서를 불러오는 중이에요'}
        </Text>
        <Text style={styles.emptyDescription}>
          목록에서 이미지 분석 결과를 다시 선택해 주세요.
        </Text>
      </ImageAnalysisReportScaffold>
    );
  }

  return (
    <ImageAnalysisReportScaffold
      onClose={onBack}
      onShare={onShare}
      profileName={profile?.name}
      report={report}
    >
      <Text style={styles.subtitle}>
        {formatReportDate(report.analyzedAt, profile?.name)}
      </Text>

      <View style={styles.heroSection}>
        <View style={styles.heroCard}>
          <Image resizeMode="cover" source={report.imageSource} style={styles.heroImage} />
        </View>
        <CreateFilterButton
          onPress={onCreateARFilter}
          placement="photo"
        />
      </View>

      <View style={styles.summaryGrid}>
        <SummaryItem label="퍼스널 컬러" value={report.personalColor} />
        <SummaryItem label="피부 타입" value={report.skinType} />
        <SummaryItem label="톤 요약" value={report.toneSummary} />
        <SummaryItem label="추천 무드" value={report.recommendedMood} />
      </View>

      <ReportSection title="분석 요약">
        <Text style={styles.paragraph}>{report.skinAnalysisSummary}</Text>
        <Text style={styles.paragraphMuted}>{report.shortSummary}</Text>
      </ReportSection>

      <ReportSection title="포인트 가이드">
        <View style={styles.guideList}>
          {guideItems.map((guide) => (
            <View key={guide.key} style={styles.guideItem}>
              <View style={styles.guideMarker} />
              <View style={styles.guideLine} />
              <View style={styles.guideText}>
                <Text style={styles.guideLabel}>{guide.label}</Text>
                <Text style={styles.guidePoint}>{guide.point}</Text>
                <Text style={styles.guideDescription}>{guide.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      </ReportSection>

      <ReportSection title="베이스 가이드">
        <Text style={styles.paragraph}>{report.baseMakeupGuide}</Text>
      </ReportSection>

      <MakeupCardRail title="추천 메이크업" items={report.recommendedMakeups} />

      <MakeupCardRail
        isAvoided
        title="비추천 메이크업 적용법"
        items={report.avoidedMakeups}
      />

      <Text style={styles.notice}>
        분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.
      </Text>

      <CreateFilterButton
        hasTopMargin
        onPress={onCreateARFilter}
        placement="report-bottom"
      />
    </ImageAnalysisReportScaffold>
  );
}

function ImageAnalysisReportHeader({
  onClose,
  onShare,
  profileName,
  report,
  topInset,
}: {
  onClose?: () => void;
  onShare?: (report: ImageAnalysisReport) => void;
  profileName?: string;
  report: ImageAnalysisReport | null;
  topInset: number;
}) {
  const handleSharePress = () => {
    if (!report) {
      return;
    }

    if (onShare) {
      onShare(report);
      return;
    }

    void Share.share({
      message: [
        formatReportDate(report.analyzedAt, profileName),
        `퍼스널 컬러: ${report.personalColor}`,
        `추천 무드: ${report.recommendedMood}`,
      ].join('\n'),
      title: '맞춤 분석 보고서',
    });
  };

  return (
    <AppHeader
      rightSlot={
        <XStack style={styles.headerActions}>
          <HeaderActionButton
            accessibilityLabel="공유하기"
            disabled={!report}
            onPress={handleSharePress}
          >
            <Share2 color={colors.textPrimary} size={iconSize.sm} strokeWidth={2} />
          </HeaderActionButton>
          <HeaderActionButton accessibilityLabel="닫기" onPress={onClose}>
            <XIcon color={colors.textPrimary} size={iconSize.sm} />
          </HeaderActionButton>
        </XStack>
      }
      titleSlot={
        <Text numberOfLines={1} style={styles.headerTitle}>
          맞춤 분석 보고서
        </Text>
      }
      topInset={topInset}
    />
  );
}

function ImageAnalysisReportScaffold({
  children,
  contentStyle,
  onClose,
  onShare,
  profileName,
  report,
  scroll = true,
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  onClose?: () => void;
  onShare?: (report: ImageAnalysisReport) => void;
  profileName?: string;
  report: ImageAnalysisReport | null;
  scroll?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const contentContainerStyle = [
    styles.reportContent,
    {paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.xxl},
    contentStyle,
  ];

  return (
    <View style={styles.screen}>
      <ImageAnalysisReportHeader
        onClose={onClose}
        onShare={onShare}
        profileName={profileName}
        report={report}
        topInset={insets.top}
      />
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
    </View>
  );
}

function HeaderActionButton({
  accessibilityLabel,
  children,
  disabled,
  onPress,
}: {
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Button
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{disabled: Boolean(disabled)}}
      disabled={disabled}
      disabledStyle={{opacity: 0.42}}
      hitSlop={8}
      onPress={onPress}
      pressStyle={{scale: 0.97}}
      style={styles.headerActionButton}
      unstyled
    >
      {children}
    </Button>
  );
}

function CreateFilterButton({
  hasTopMargin,
  onPress,
  placement,
}: {
  hasTopMargin?: boolean;
  onPress?: () => void;
  placement: CreateFilterButtonPlacement;
}) {
  return (
    <Button
      accessibilityLabel={createFilterButtonAccessibilityLabels[placement]}
      accessibilityRole="button"
      onPress={onPress}
      pressStyle={{scale: 0.98}}
      style={[
        styles.createFilterButton,
        hasTopMargin ? styles.createFilterButtonWithTopMargin : null,
      ]}
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
  isAvoided,
  items,
  title,
}: {
  isAvoided?: boolean;
  items: ImageAnalysisMakeupCard[];
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
              {isAvoided ? (
                <View style={styles.avoidBadge}>
                  <XIcon color={colors.white} size={15} />
                </View>
              ) : null}
            </View>
            <View style={styles.makeupBody}>
              <Text numberOfLines={1} style={styles.makeupTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={styles.makeupSubtitle}>
                {item.subtitle}
              </Text>
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
        ))}
      </ScrollView>
    </ReportSection>
  );
}

const styles = StyleSheet.create({
  avoidBadge: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 24,
  },
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
  createFilterButton: {
    ...imageAnalysisReportLiquidGlassButtonStyle,
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 56,
    justifyContent: 'center',
    width: '100%',
  },
  createFilterButtonWithTopMargin: {
    marginTop: spacing.sm,
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
    alignItems: 'center',
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
    ...imageAnalysisReportLiquidGlassSurfaceStyle,
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  heroImage: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    height: 360,
    width: '100%',
  },
  heroSection: {
    gap: spacing.md,
  },
  headerActionButton: {
    ...imageAnalysisReportLiquidGlassButtonStyle,
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 42,
    justifyContent: 'center',
    padding: 0,
    width: 42,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontFamily: typography.title.fontFamily,
    fontSize: typography.title.fontSize,
    fontWeight: typography.title.fontWeight,
    lineHeight: typography.title.lineHeight,
  },
  makeupBody: {
    gap: 4,
    padding: spacing.md,
  },
  makeupCard: {
    ...imageAnalysisReportLiquidGlassSurfaceStyle,
    borderRadius: radius.md,
    padding: spacing.xs,
    width: 170,
  },
  makeupDescription: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.regular,
    lineHeight: typography.lineHeight.xs,
  },
  makeupImage: {
    height: 104,
    width: '100%',
  },
  makeupImageWrap: {
    backgroundColor: colors.surfaceMuted,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  makeupSubtitle: {
    color: colors.textTertiary,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
  },
  makeupTitle: {
    color: colors.textPrimary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
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
    paddingTop: imageAnalysisReportScreenFramePresentation.contentTopPadding,
  },
  screen: {
    backgroundColor: colors.surfaceMuted,
    flex: 1,
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
    fontSize: imageAnalysisReportSubtitleTextStyle.fontSize,
    fontWeight: typography.fontWeight.medium,
    lineHeight: imageAnalysisReportSubtitleTextStyle.lineHeight,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryItem: {
    ...imageAnalysisReportLiquidGlassSurfaceStyle,
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
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
});
