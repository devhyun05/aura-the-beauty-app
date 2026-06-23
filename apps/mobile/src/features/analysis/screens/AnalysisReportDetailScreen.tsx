import {useEffect, useMemo, useState} from 'react';
import {Image, ScrollView, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {
  getAnalysisResultById,
  getLatestAnalysisResult,
} from '../../../shared/services/analysisService';
import {getUserProfile} from '../../../shared/services/userService';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {
  AnalysisFacePointGuide,
  AnalysisMakeupCard,
  AnalysisResult,
} from '../../../shared/types/analysis';
import type {UserProfile} from '../../../shared/types/userPage';
import {AppHeader, AppScreen, XIcon} from '../../../shared/ui';

type AnalysisReportDetailScreenProps = {
  resultId?: string | null;
  onBack?: () => void;
};

type GuideItem = {
  key: keyof AnalysisFacePointGuide;
  label: string;
  point: string;
  detail: string;
};

const guideLabels: Array<Pick<GuideItem, 'key' | 'label' | 'point'>> = [
  {key: 'brow', label: '눈썹', point: '자연스러운 아치형'},
  {key: 'eyeshadow', label: '아이섀도우', point: '뉴트럴 베이지 톤'},
  {key: 'lip', label: '립', point: 'MLBB 계열'},
  {key: 'highlight', label: '하이라이트', point: 'T존, 눈밑 삼각존'},
  {key: 'eyeliner', label: '아이라이너', point: '점막 채우기'},
  {key: 'blush', label: '블러셔', point: '뉴트럴 핑크'},
];

const formatReportDate = (dateText: string, name?: string) => {
  const date = new Date(dateText);
  const year = String(date.getFullYear()).slice(2);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const displayName = name ? `${name}님` : '서진님';

  return `${year}년 ${month}월 ${day}일 ${displayName}`;
};

export function AnalysisReportDetailScreen({
  resultId,
  onBack,
}: AnalysisReportDetailScreenProps) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setIsLoaded(false);

    Promise.all([
      resultId ? getAnalysisResultById(resultId) : getLatestAnalysisResult(),
      getUserProfile(),
    ]).then(([nextResult, nextProfile]) => {
      if (isMounted) {
        setResult(nextResult);
        setProfile(nextProfile);
        setIsLoaded(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [resultId]);

  const guideItems = useMemo<GuideItem[]>(() => {
    if (!result) {
      return [];
    }

    return guideLabels.map((guide) => ({
      ...guide,
      detail: result.facePointGuide[guide.key],
    }));
  }, [result]);

  if (!result) {
    return (
      <AppScreen scroll={false}>
        <AppHeader onBack={onBack} title="맞춤 분석 보고서" />
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {isLoaded ? '분석 결과를 찾을 수 없어요' : '보고서를 불러오는 중이에요'}
          </Text>
          <Text style={styles.emptyDescription}>
            목록에서 분석 결과를 다시 선택해 주세요.
          </Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentGap={spacing.xl}>
      <AppHeader onBack={onBack} title="맞춤 분석 보고서" />

      <Text style={styles.subtitle}>
        {formatReportDate(result.analyzedAt, profile?.name)}
      </Text>

      <View style={styles.heroCard}>
        <Image resizeMode="cover" source={result.imageSource} style={styles.heroImage} />
      </View>

      <View style={styles.summaryGrid}>
        <SummaryItem label="퍼스널 컬러" value={result.personalColor} />
        <SummaryItem label="피부 타입" value={result.skinType} />
        <SummaryItem label="톤 요약" value={result.toneSummary} />
        <SummaryItem label="추천 무드" value={result.recommendedMood} />
      </View>

      <ReportSection title="분석 요약">
        <Text style={styles.paragraph}>{result.skinAnalysisSummary}</Text>
        <Text style={styles.paragraphMuted}>{result.shortSummary}</Text>
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
        <Text style={styles.paragraph}>{result.baseMakeupGuide}</Text>
      </ReportSection>

      <MakeupCardRail title="추천 메이크업" items={result.recommendedMakeups} />

      <MakeupCardRail
        isAvoided
        title="비추천 메이크업 적용법"
        items={result.avoidedMakeups}
      />

      <Text style={styles.notice}>
        분석 결과는 AI 기반으로 제공되며, 개인 차이가 있을 수 있습니다.
      </Text>
    </AppScreen>
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
  items: AnalysisMakeupCard[];
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroImage: {
    backgroundColor: colors.surfaceMuted,
    height: 360,
    width: '100%',
  },
  makeupBody: {
    gap: 4,
    padding: spacing.md,
  },
  makeupCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
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
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  summaryItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
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
