import {Image, Pressable, StyleSheet, Text, View} from 'react-native';

import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {colors, radius, spacing, typography} from '../../../shared/theme';

export function AnalysisReportSelectorCard({
  onPress,
  report,
}: {
  onPress: () => void;
  report: FaceAnalysisReport;
}) {
  const analyzedDate = /^\d{4}-\d{2}-\d{2}/.exec(report.analyzedAt)?.[0]?.replaceAll('-', '. ');
  return (
    <Pressable
      accessibilityHint="추천에 사용할 다른 얼굴 분석 보고서를 고릅니다"
      accessibilityLabel={`${report.reportTitle}, ${report.faceShape}, ${report.personalColor}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.card, pressed && styles.pressed]}
    >
      <Image accessible={false} accessibilityIgnoresInvertColors source={report.imageSource} style={styles.image} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{report.reportTitle}</Text>
        <Text numberOfLines={2} style={styles.summary}>
          {[report.faceShape, report.personalColor, report.skinType].filter(Boolean).join(' · ')}
        </Text>
        {analyzedDate ? <Text style={styles.date}>{analyzedDate}</Text> : null}
      </View>
      <Text style={styles.action}>바꾸기</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetSurface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 104,
    padding: spacing.md,
  },
  pressed: {opacity: 0.76},
  image: {backgroundColor: colors.surfaceMuted, borderRadius: radius.md, height: 72, width: 72},
  copy: {flex: 1, gap: 2},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  summary: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  date: {color: colors.textTertiary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs},
  action: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
});