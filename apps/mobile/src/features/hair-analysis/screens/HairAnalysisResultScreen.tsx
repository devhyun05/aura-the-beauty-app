import {Pressable, StyleSheet} from 'react-native';
import {ChevronRight, Scissors} from 'lucide-react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {CachedImage} from '../../../shared/ui/CachedImage';
import type {HairAnalysisResult, HairRecommendation} from '../types';

type HairAnalysisResultScreenProps = {
  analysis: HairAnalysisResult;
  onOpenSaved: () => void;
  onSelectStyle: (recommendation: HairRecommendation) => void;
};

const labels: Record<string, string> = {
  bob: '단발', curly: '컬', diamond: '다이아몬드형', heart: '하트형', high: '높음',
  left: '왼쪽', long: '장발', low: '낮음', medium: '중간', none: '없음', oblong: '긴형',
  oval: '계란형', right: '오른쪽', round: '둥근형', short: '숏', square: '각진형',
  straight: '직모', wavy: '웨이브', curtain: '커튼뱅', full: '풀뱅', side: '사이드뱅',
  see_through: '시스루뱅', center: '가운데', balanced: '균형',
};
const display = (value: string) => labels[value] ?? value;

export function HairAnalysisResultScreen({analysis, onOpenSaved, onSelectStyle}: HairAnalysisResultScreenProps) {
  const metrics = [
    ['얼굴형', display(analysis.faceShape)], ['현재 길이', display(analysis.currentLength)],
    ['앞머리', display(analysis.bangs)], ['가르마', display(analysis.part)],
    ['질감', display(analysis.texture)], ['볼륨', display(analysis.volume)],
    ['헤어라인', display(analysis.hairline)], ['현재 컬러', analysis.currentColor],
  ];
  return (
    <AppScreen contentGap={spacing.xxl} topPadding="belowShellHeader">
      <YStack style={styles.summary}>
        <Text style={styles.eyebrow}>분석 신뢰도 {Math.round(analysis.confidence * 100)}%</Text>
        <Text style={styles.title}>현재 헤어 분석</Text>
        <Text style={styles.description}>{analysis.summary}</Text>
      </YStack>
      <View style={styles.metricGrid}>
        {metrics.map(([label, value]) => (
          <YStack key={label} style={styles.metric}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
          </YStack>
        ))}
      </View>
      <YStack style={styles.sectionHeader}>
        <XStack style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>추천 헤어 3가지</Text>
          <Pressable accessibilityRole="button" onPress={onOpenSaved}>
            <Text style={styles.savedLink}>저장한 헤어</Text>
          </Pressable>
        </XStack>
        <Text style={styles.sectionDescription}>선택한 스타일만 한 장씩 합성돼요.</Text>
      </YStack>
      <YStack style={styles.recommendations}>
        {analysis.recommendations.map((recommendation, index) => (
          <Pressable
            accessibilityLabel={`${recommendation.style.name} 합성하기`}
            accessibilityRole="button"
            key={recommendation.styleId}
            onPress={() => onSelectStyle(recommendation)}
            style={({pressed}) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.preview}>
              {recommendation.style.previewUrl ? (
                <CachedImage priority="high" source={{uri: recommendation.style.previewUrl}} style={styles.previewImage} />
              ) : (
                <Scissors color={colors.textTertiary} size={iconSize.xl} strokeWidth={1.5} />
              )}
            </View>
            <YStack style={styles.cardCopy}>
              <Text style={styles.rank}>추천 {index + 1}</Text>
              <Text style={styles.cardTitle}>{recommendation.style.name}</Text>
              <Text numberOfLines={2} style={styles.cardReason}>{recommendation.reasons[0]}</Text>
            </YStack>
            <ChevronRight color={colors.textTertiary} size={iconSize.sm} strokeWidth={2} />
          </Pressable>
        ))}
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  card: {alignItems: 'center', borderBottomColor: colors.divider, borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 112, paddingVertical: spacing.md},
  cardCopy: {flex: 1, gap: spacing.xs, minWidth: 0},
  cardReason: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  cardTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg, lineHeight: typography.lineHeight.lg},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  eyebrow: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  metric: {gap: spacing.xs, padding: spacing.md, width: '33.333%'},
  metricGrid: {backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden'},
  metricLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.xs},
  metricValue: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  pressed: {opacity: 0.7},
  preview: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, height: 88, justifyContent: 'center', overflow: 'hidden', width: 76},
  previewImage: {height: '100%', width: '100%'},
  rank: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs},
  recommendations: {gap: 0},
  savedLink: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  sectionDescription: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm},
  sectionHeader: {gap: spacing.xs},
  sectionTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl},
  sectionTitleRow: {alignItems: 'center', justifyContent: 'space-between'},
  summary: {gap: spacing.sm},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
});
