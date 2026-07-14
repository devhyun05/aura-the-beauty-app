import {Check} from 'lucide-react-native';
import {KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useEffect, useMemo, useState} from 'react';

import {ScenarioPuzzleWall} from '../components/ScenarioPuzzleWall';
import type {MakeupScenarioPrompt} from '../types';
import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppCard, AppScreen} from '../../../shared/ui';
import {makeupRecommendationDiscoveryCopy} from './makeupRecommendationViewContracts';
export {makeupRecommendationDiscoveryCopy} from './makeupRecommendationViewContracts';

type ScenarioDiscoveryViewProps = {
  onChangePrompt: (value: string) => void;
  onChangeUseProfile: (value: boolean) => void;
  onRefreshScenarios: () => void;
  onSelectScenario: (scenario: MakeupScenarioPrompt) => void;
  onSubmitPrompt: () => void;
  personalColor?: string;
  prompt: string;
  scenarios: readonly MakeupScenarioPrompt[];
  useProfile: boolean;
};

export function ScenarioDiscoveryView({
  onChangePrompt,
  onChangeUseProfile,
  onRefreshScenarios,
  onSelectScenario,
  onSubmitPrompt,
  personalColor,
  prompt,
  scenarios,
  useProfile,
}: ScenarioDiscoveryViewProps) {
  const insets = useSafeAreaInsets();
  const [visibleScenarioCount, setVisibleScenarioCount] = useState(12);
  useEffect(() => setVisibleScenarioCount(12), [scenarios]);
  const visibleScenarios = useMemo(
    () => scenarios.slice(0, visibleScenarioCount),
    [scenarios, visibleScenarioCount],
  );
  const disabled = !prompt.trim();
  const profileEnabled = Boolean(personalColor) && useProfile;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <AppScreen bottomPadding={230 + insets.bottom} contentGap={spacing.xl} keyboardShouldPersistTaps="handled" topPadding="belowShellHeader">
        <View style={styles.intro}>
          {makeupRecommendationDiscoveryCopy.eyebrow ? (
            <Text style={styles.eyebrow}>{makeupRecommendationDiscoveryCopy.eyebrow}</Text>
          ) : null}
          <Text style={styles.title}>{makeupRecommendationDiscoveryCopy.title}</Text>
          <Text style={styles.description}>{makeupRecommendationDiscoveryCopy.description}</Text>
        </View>

        <Pressable
          accessibilityLabel={makeupRecommendationDiscoveryCopy.profile}
          accessibilityRole="checkbox"
          accessibilityState={{checked: profileEnabled, disabled: !personalColor}}
          disabled={!personalColor}
          onPress={() => onChangeUseProfile(!profileEnabled)}
          style={({pressed}) => [styles.profileOption, !personalColor && styles.profileDisabled, pressed && styles.pressed]}
        >
          <View style={[styles.checkbox, profileEnabled && styles.checkboxChecked]}>
            {profileEnabled ? <Check color={colors.white} size={12} strokeWidth={2.5} /> : null}
          </View>
          <Text style={[styles.profileLabel, !personalColor && styles.profileLabelDisabled]}>{makeupRecommendationDiscoveryCopy.profile}</Text>
        </Pressable>

        <View style={styles.scenarioSection}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>지금 끌리는 한 문장</Text>
              <Text style={styles.sectionDescription}>마음 가는 문장을 골라보세요.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onRefreshScenarios} style={styles.refreshButton}>
              <Text style={styles.refreshLabel}>{makeupRecommendationDiscoveryCopy.refresh} ↻</Text>
            </Pressable>
          </View>
          <ScenarioPuzzleWall onSelect={onSelectScenario} scenarios={visibleScenarios} />
          {visibleScenarioCount < scenarios.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleScenarioCount(count => Math.min(count + 12, scenarios.length))}
              style={styles.moreButton}
            >
              <Text style={styles.moreLabel}>카드 더보기</Text>
            </Pressable>
          ) : null}
        </View>
      </AppScreen>

      <View pointerEvents="box-none" style={[styles.floatingHost, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
        <View style={styles.floatingSurface}>
          <View style={styles.composerRow}>
            <AppCard style={styles.composerCard}>
              <TextInput
                accessibilityLabel="원하는 메이크업 직접 입력"
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
  eyebrow: {color: colors.textTertiary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xs, letterSpacing: 1.2},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xxl, lineHeight: typography.lineHeight.xxl},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  composerRow: {alignItems: 'stretch', flexDirection: 'row', gap: spacing.sm},
  composerCard: {flex: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  input: {color: colors.textPrimary, flex: 1, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md, minHeight: 36, padding: 0},
  profileOption: {alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md},
  profileDisabled: {opacity: 0.48},
  checkbox: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: 5, borderWidth: 1, height: 18, justifyContent: 'center', width: 18},
  checkboxChecked: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
  profileLabel: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  profileLabelDisabled: {color: colors.textTertiary},
  scenarioSection: {gap: spacing.lg},
  sectionHeadingRow: {alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between'},
  sectionHeading: {flex: 1, gap: spacing.xs},
  sectionTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.lg},
  sectionDescription: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm},
  refreshButton: {justifyContent: 'center', minHeight: 44, paddingLeft: spacing.md},
  refreshLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
  moreButton: {alignItems: 'center', alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg},
  moreLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  floatingHost: {bottom: 0, left: 0, paddingHorizontal: spacing.screenX, position: 'absolute', right: 0},
  floatingSurface: {backgroundColor: colors.bottomSheetSurface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.sm},
  submitButton: {alignItems: 'center', backgroundColor: colors.textPrimary, borderRadius: radius.pill, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.md},
  submitButtonDisabled: {backgroundColor: colors.surfaceMuted},
  submitLabel: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  submitLabelDisabled: {color: colors.textTertiary},
  pressed: {opacity: 0.72},
});
