import { Image, Pressable, StyleSheet } from 'react-native';
import { Text, View } from 'tamagui';

import {
  userPageColors,
  userPageRadius,
  userPageTypography,
} from '../../../shared/theme/tokens';
import type { AnalysisResult } from '../../../shared/types/analysis';

interface AnalysisResultHistoryCardProps {
  result: AnalysisResult;
  onPress?: () => void;
}

export const AnalysisResultHistoryCard = ({
  result,
  onPress,
}: AnalysisResultHistoryCardProps) => {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.reportHeader}>
        <Text style={styles.reportTitle}>맞춤 분석 보고서</Text>
        <Text style={styles.reportMeta}>{result.analyzedAt} 서진님</Text>
      </View>

      <View style={styles.reportImageFrame}>
        <Image resizeMode="cover" source={result.imageSource} style={styles.image} />

        <View pointerEvents="none" style={styles.dotColumn}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>

        <View pointerEvents="none" style={[styles.annotation, styles.annotationBrow]}>
          <View style={styles.annotationLine} />
          <Text style={styles.annotationText}>눈썹</Text>
        </View>

        <View pointerEvents="none" style={[styles.annotation, styles.annotationCheek]}>
          <View style={styles.annotationLine} />
          <Text style={styles.annotationText}>블러셔</Text>
        </View>

        <View pointerEvents="none" style={[styles.annotation, styles.annotationLip]}>
          <View style={styles.annotationLine} />
          <Text style={styles.annotationText}>립</Text>
        </View>
      </View>

      <View style={styles.reportBody}>
        <Text numberOfLines={1} style={styles.sectionTitle}>
          베이스 특징별 메이크업
        </Text>

        <Text numberOfLines={2} style={styles.summary}>
          {result.shortSummary}
        </Text>

        <View style={styles.recommendationRow}>
          <View style={styles.recommendationBlock}>
            <Text style={styles.recommendationLabel}>추천</Text>
            <Text numberOfLines={1} style={styles.recommendationText}>
              {result.recommendedMood}
            </Text>
          </View>

          <View style={styles.tags}>
            {result.tags.slice(0, 2).map((tag) => (
              <Text key={tag} style={styles.tag}>
                {tag}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  annotation: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    position: 'absolute',
  },
  annotationBrow: {
    right: 12,
    top: 54,
  },
  annotationCheek: {
    left: 10,
    top: 128,
  },
  annotationLine: {
    backgroundColor: userPageColors.text,
    height: 1,
    width: 28,
  },
  annotationLip: {
    bottom: 42,
    right: 20,
  },
  annotationText: {
    color: userPageColors.text,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  card: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.image,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dot: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.text,
    borderRadius: 4,
    borderWidth: 1,
    height: 7,
    width: 7,
  },
  dotColumn: {
    gap: 8,
    left: '50%',
    marginLeft: -3,
    position: 'absolute',
    top: 52,
  },
  image: {
    height: 244,
    width: '100%',
  },
  recommendationBlock: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  recommendationLabel: {
    color: userPageColors.textSoft,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
  },
  recommendationRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  recommendationText: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    fontWeight: '700',
    lineHeight: 21,
  },
  reportBody: {
    gap: 10,
    padding: 16,
  },
  reportHeader: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 14,
  },
  reportImageFrame: {
    borderColor: userPageColors.border,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  reportMeta: {
    color: userPageColors.text,
    fontSize: userPageTypography.body,
    lineHeight: 21,
  },
  reportTitle: {
    color: userPageColors.text,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 34,
  },
  sectionTitle: {
    color: userPageColors.text,
    fontSize: userPageTypography.sectionTitle,
    fontWeight: '700',
    lineHeight: 24,
  },
  summary: {
    color: userPageColors.textMuted,
    fontSize: userPageTypography.body,
    lineHeight: 21,
  },
  tag: {
    backgroundColor: userPageColors.surface,
    borderColor: userPageColors.border,
    borderRadius: userPageRadius.chip,
    borderWidth: 1,
    color: userPageColors.text,
    fontSize: userPageTypography.caption,
    lineHeight: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
});
