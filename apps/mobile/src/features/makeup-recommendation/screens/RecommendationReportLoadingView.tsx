import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {colors, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

export function RecommendationReportLoadingView() {
  return (
    <AppScreen scroll={false} topPadding="belowShellHeader">
      <View
        accessibilityLabel="저장된 추천 메이크업 기록을 불러오는 중"
        accessibilityRole="progressbar"
        style={styles.container}
      >
        <ActivityIndicator color={colors.textPrimary} size="small" />
        <Text style={styles.label}>저장된 추천을 불러오는 중이에요.</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  label: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    textAlign: 'center',
  },
});
