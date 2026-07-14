import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {ScenarioPuzzleWall} from '../components/ScenarioPuzzleWall';
import type {MakeupScenarioPrompt} from '../types';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppCard, AppScreen} from '../../../shared/ui';
import {
  makeupRecommendationDiscoveryCopy,
  makeupRecommendationHistoryCopy,
} from './makeupRecommendationViewContracts';
export {makeupRecommendationDiscoveryCopy} from './makeupRecommendationViewContracts';

type ScenarioDiscoveryViewProps = {
  onChangePrompt: (value: string) => void;
  onLoadMoreScenarios: () => void;
  onOpenHistory: () => void;
  onRefreshScenarios: () => void;
  onSelectScenario: (scenario: MakeupScenarioPrompt) => void;
  onSubmitPrompt: () => void;
  isLoadingScenarios: boolean;
  prompt: string;
  scenarioError?: string;
  scenarios: readonly MakeupScenarioPrompt[];
};

export function ScenarioDiscoveryView({
  onChangePrompt,
  onLoadMoreScenarios,
  onOpenHistory,
  onRefreshScenarios,
  onSelectScenario,
  onSubmitPrompt,
  isLoadingScenarios,
  prompt,
  scenarioError,
  scenarios,
}: ScenarioDiscoveryViewProps) {
  const insets = useSafeAreaInsets();
  const disabled = !prompt.trim();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <AppScreen bottomPadding={230 + insets.bottom} contentGap={spacing.xl} keyboardShouldPersistTaps="handled" topPadding="belowShellHeader">
        <View style={styles.intro}>
          {makeupRecommendationDiscoveryCopy.eyebrow ? (
            <Text style={styles.eyebrow}>{makeupRecommendationDiscoveryCopy.eyebrow}</Text>
          ) : null}
          <View style={styles.titleRow}>
            <Text style={styles.title}>{makeupRecommendationDiscoveryCopy.title}</Text>
            <Pressable accessibilityRole="button" onPress={onOpenHistory} style={styles.historyButton}>
              <Text style={styles.historyLabel}>{makeupRecommendationHistoryCopy.action}</Text>
            </Pressable>
          </View>
          {makeupRecommendationDiscoveryCopy.description ? (
            <Text style={styles.description}>{makeupRecommendationDiscoveryCopy.description}</Text>
          ) : null}
        </View>

        <View style={styles.scenarioSection}>
          <View style={styles.scenarioActions}>
            <Pressable accessibilityRole="button" disabled={isLoadingScenarios} onPress={onRefreshScenarios} style={styles.refreshButton}>
              {isLoadingScenarios ? <ActivityIndicator color={colors.textSecondary} size="small" /> : (
                <Text style={styles.refreshLabel}>{makeupRecommendationDiscoveryCopy.refresh} ↻</Text>
              )}
            </Pressable>
          </View>
          <ScenarioPuzzleWall onSelect={onSelectScenario} scenarios={scenarios} />
          {scenarioError ? <Text accessibilityRole="alert" style={styles.scenarioError}>{scenarioError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={isLoadingScenarios}
            onPress={onLoadMoreScenarios}
            style={styles.moreButton}
          >
            <Text style={styles.moreLabel}>{isLoadingScenarios ? '새 카드를 만드는 중…' : '카드 더보기'}</Text>
          </Pressable>
        </View>
      </AppScreen>

      <View pointerEvents="box-none" style={[styles.floatingHost, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
        <View style={styles.floatingSurface}>
          <View style={styles.composerRow}>
            <AppCard style={styles.composerCard}>
              <TextInput
                accessibilityLabel="원하는 메이크업 직접 입력"
                maxLength={240}
                multiline
                onChangeText={onChangePrompt}
                placeholder={makeupRecommendationDiscoveryCopy.placeholder}
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                textAlignVertical="center"
                value={prompt}
              />
            </AppCard>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{disabled}}
              disabled={disabled}
              onPress={onSubmitPrompt}
              style={[styles.submitButton, disabled && styles.submitButtonDisabled]}
            >
              <Text style={[styles.submitLabel, disabled && styles.submitLabelDisabled]}>{makeupRecommendationDiscoveryCopy.submit}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  intro: {gap: spacing.sm},
  titleRow: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between'},
  eyebrow: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, letterSpacing: 1.2},
  title: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xxl, lineHeight: typography.lineHeight.xxl},
  historyButton: {justifyContent: 'center', minHeight: 44, paddingLeft: spacing.md},
  historyLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  composerRow: {alignItems: 'stretch', flexDirection: 'row', gap: spacing.sm},
  composerCard: {flex: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  input: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md, minHeight: 36, padding: 0},
  scenarioSection: {gap: spacing.lg},
  scenarioActions: {alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end'},
  refreshButton: {justifyContent: 'center', minHeight: 44, paddingLeft: spacing.md},
  refreshLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  moreButton: {alignItems: 'center', alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg},
  moreLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  scenarioError: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, textAlign: 'center'},
  floatingHost: {bottom: 0, left: 0, paddingHorizontal: spacing.screenX, position: 'absolute', right: 0},
  floatingSurface: {backgroundColor: colors.bottomSheetSurface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.sm},
  submitButton: {alignItems: 'center', backgroundColor: colors.textPrimary, borderRadius: radius.pill, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md},
  submitButtonDisabled: {backgroundColor: colors.surfaceMuted},
  submitLabel: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  submitLabelDisabled: {color: colors.textTertiary},
  pressed: {opacity: 0.72},
});
