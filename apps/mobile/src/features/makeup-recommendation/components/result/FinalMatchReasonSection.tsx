import {StyleSheet, Text, View} from 'react-native';

import type {FinalRecommendationMatch} from '../../services/toFinalRecommendationResult';
import {colors, type as typography} from '../../theme/makeupResultTokens';
import {ResultGlassCard} from './ResultGlassCard';

export interface FinalMatchReasonSectionProps {
  match: FinalRecommendationMatch;
}

export function FinalMatchReasonSection({
  match,
}: FinalMatchReasonSectionProps) {
  const score = match.value;

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        추천 메이크업 매칭률
      </Text>

      <ResultGlassCard style={styles.card}>
        {score === null ? (
          <View accessibilityLiveRegion="polite" style={styles.unavailableCopy}>
            <Text style={styles.unavailableTitle}>
              {match.source === 'legacy-unavailable'
                ? '매칭률 정보가 없는 이전 결과예요'
                : '매칭률 계산 정보가 부족해요'}
            </Text>
            <Text style={styles.explanation}>{match.explanation}</Text>
          </View>
        ) : (
          <View style={styles.scoreContent}>
            <Text
              accessibilityLabel={`추천 메이크업 매칭률 ${score}퍼센트`}
              style={styles.score}>
              {score}%
            </Text>
            <View
              accessibilityLabel={`추천 메이크업 매칭률 ${score}퍼센트`}
              accessibilityRole="progressbar"
              accessibilityValue={{min: 0, max: 100, now: score}}
              style={styles.progressTrack}>
              <View style={[styles.progressFill, {width: `${score}%`}]} />
            </View>
            <Text style={styles.explanation}>{match.explanation}</Text>
          </View>
        )}
      </ResultGlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {gap: 8},
  title: {...typography.displayMd, marginBottom: 8},
  card: {marginTop: 2},
  scoreContent: {alignItems: 'center'},
  score: {
    color: colors.ink,
    fontSize: 54,
    fontWeight: '500',
    letterSpacing: -1.7,
    lineHeight: 62,
  },
  progressTrack: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 999,
    height: 12,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.dark,
    borderRadius: 999,
    height: '100%',
  },
  explanation: {
    color: colors.sub2,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 19,
    marginTop: 13,
    textAlign: 'center',
  },
  unavailableCopy: {alignItems: 'center', paddingVertical: 10},
  unavailableTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 24,
    textAlign: 'center',
  },
});
