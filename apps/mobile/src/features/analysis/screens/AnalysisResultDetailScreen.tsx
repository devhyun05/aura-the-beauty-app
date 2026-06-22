import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Text, View } from 'tamagui';

import { getAnalysisResultById } from '../../../shared/services/analysisResultService';
import {
  userPageColors,
  userPageRadius,
  userPageSpacing,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { AnalysisResult } from '../../../shared/types/analysis';
import { AnalysisMakeupGuideCard } from '../components/AnalysisMakeupGuideCard';

interface AnalysisResultDetailScreenProps {
  resultId: string | null;
  onBack?: () => void;
}

const guideLabels = {
  brow: '눈썹',
  blush: '블러셔',
  highlight: '하이라이트',
  eyeshadow: '아이섀도우',
  eyeliner: '아이라이너',
  lip: '립',
} as const;

export const AnalysisResultDetailScreen = ({
  resultId,
  onBack,
}: AnalysisResultDetailScreenProps) => {
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setIsLoaded(false);

    if (!resultId) {
      setResult(null);
      setIsLoaded(true);
      return () => {
        isMounted = false;
      };
    }

    getAnalysisResultById(resultId).then((analysisResult) => {
      if (isMounted) {
        setResult(analysisResult);
        setIsLoaded(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [resultId]);

  const faceGuides = useMemo(() => {
    if (!result) {
      return [];
    }

    return Object.entries(guideLabels).map(([key, label]) => ({
      key,
      label,
      description:
        result.facePointGuide[key as keyof typeof result.facePointGuide],
    }));
  }, [result]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable
          accessibilityLabel="맞춤 분석 보고서에서 뒤로가기"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <BackIcon />
        </Pressable>

        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>ANALYSIS REPORT</Text>
          <Text style={styles.title}>맞춤 분석 보고서</Text>
        </View>
      </View>

      {result ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          style={styles.scrollView}
        >
          <View style={styles.heroSection}>
            <Text style={styles.reportDate}>{result.analyzedAt} 서진님</Text>
            <Image
              resizeMode="cover"
              source={result.imageSource}
              style={styles.heroImage}
            />
          </View>

          <View style={styles.summaryGrid}>
            <SummaryChip label="퍼스널 컬러" value={result.personalColor} />
            <SummaryChip label="피부 타입" value={result.skinType} />
            <SummaryChip label="톤 요약" value={result.toneSummary} />
            <SummaryChip label="추천 무드" value={result.recommendedMood} />
          </View>

          <ReportSection title="분석 요약">
            <Text style={styles.paragraph}>{result.skinAnalysisSummary}</Text>
            <Text style={styles.paragraphMuted}>{result.shortSummary}</Text>
          </ReportSection>

          <ReportSection title="베이스 가이드">
            <Text style={styles.paragraph}>{result.baseMakeupGuide}</Text>
          </ReportSection>

          <ReportSection title="포인트 가이드">
            <View style={styles.faceGuideGrid}>
              {faceGuides.map((guide) => (
                <View key={guide.key} style={styles.faceGuideCard}>
                  <Text style={styles.faceGuideLabel}>{guide.label}</Text>
                  <Text style={styles.faceGuideDescription}>
                    {guide.description}
                  </Text>
                </View>
              ))}
            </View>
          </ReportSection>

          <GuideCarousel
            title="추천 메이크업"
            items={result.recommendedMakeups}
          />

          <GuideCarousel
            title="비추천 메이크업"
            items={result.avoidedMakeups}
          />
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            {isLoaded
              ? '분석 결과를 찾을 수 없어요'
              : '분석 보고서를 불러오는 중이에요'}
          </Text>
          <Text style={styles.emptyDescription}>
            목록에서 분석 결과를 다시 선택해 주세요.
          </Text>
        </View>
      )}
    </View>
  );
};

interface SummaryChipProps {
  label: string;
  value: string;
}

const SummaryChip = ({ label, value }: SummaryChipProps) => {
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.summaryValue}>
        {value}
      </Text>
    </View>
  );
};

interface ReportSectionProps {
  title: string;
  children: ReactNode;
}

const ReportSection = ({ title, children }: ReportSectionProps) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
};

interface GuideCarouselProps {
  title: string;
  items: AnalysisResult['recommendedMakeups'];
}

const GuideCarousel = ({ title, items }: GuideCarouselProps) => {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.carouselContent}
      >
        {items.map((item) => (
          <AnalysisMakeupGuideCard key={item.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
};

function BackIcon() {
  return (
    <View pointerEvents="none" style={styles.backIcon}>
      <View style={[styles.backLine, styles.backLineTop]} />
      <View style={[styles.backLine, styles.backLineBottom]} />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  backIcon: {
    height: 22,
    position: 'relative',
    width: 22,
  },
  backLine: {
    backgroundColor: userPageColors.text,
    borderRadius: 2,
    height: 2,
    left: 4,
    position: 'absolute',
    width: 14,
  },
  backLineBottom: {
    top: 13,
    transform: [{ rotate: '45deg' }],
  },
  backLineTop: {
    top: 5,
    transform: [{ rotate: '-45deg' }],
  },
  carouselContent: {
    gap: 10,
    paddingRight: userPageSpacing.screenX,
  },
  emptyDescription: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    flex: 1,
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: userPageSpacing.screenX,
  },
  emptyTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 24,
  },
  eyebrow: {
    color: userPageColors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    lineHeight: 14,
  },
  faceGuideCard: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    gap: 5,
    padding: 11,
    width: '48%',
  },
  faceGuideDescription: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.caption,
    lineHeight: 18,
  },
  faceGuideGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  faceGuideLabel: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  header: {
    alignItems: 'center',
    backgroundColor: userPageColors.background,
    borderBottomColor: userPageColors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
    paddingHorizontal: userPageSpacing.screenX,
  },
  headerText: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    marginRight: 38,
    minWidth: 0,
  },
  heroImage: {
    backgroundColor: userPageColors.surfaceMuted,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    height: 334,
    width: '100%',
  },
  heroSection: {
    gap: 10,
  },
  paragraph: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    lineHeight: 23,
  },
  paragraphMuted: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 23,
  },
  reportDate: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 22,
    textAlign: 'center',
  },
  screen: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  scrollContent: {
    gap: 20,
    paddingBottom: 56,
    paddingHorizontal: userPageSpacing.screenX,
    paddingTop: 16,
  },
  scrollView: {
    backgroundColor: userPageColors.background,
    flex: 1,
  },
  section: {
    borderTopColor: userPageColors.divider,
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 18,
  },
  sectionTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
  summaryChip: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.borderSubtle,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 70,
    minWidth: '47%',
    padding: 11,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryLabel: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
  },
  summaryValue: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 20,
  },
  title: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 22,
  },
});
