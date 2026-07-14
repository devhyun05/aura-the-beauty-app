import {Pressable, StyleSheet, Switch, Text, TextInput, View} from 'react-native';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppCard, AppScreen} from '../../../shared/ui';
import {ScenarioPromptCard, type ScenarioCardEmphasis} from '../components/ScenarioPromptCard';
import type {MakeupScenarioPrompt} from '../types';

export const makeupRecommendationDiscoveryCopy = {
  eyebrow: 'AI MAKEUP DISCOVERY',
  title: '오늘, 어떤 내가 되어볼까요?',
  description: '마음을 설명하기 어렵다면 천천히 구경해보세요. 끌리는 한 문장이 오늘의 룩이 될 거예요.',
  placeholder: '원하는 느낌이나 상황을 직접 들려주세요',
  submit: '내 이야기로 추천받기',
  refresh: '새로운 시나리오 보여줘',
} as const;

export function getScenarioCardEmphasis(index: number): ScenarioCardEmphasis {
  return index % 6 === 0 ? 'featured' : 'regular';
}

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

function PromptComposer({
  onChangeText,
  onSubmit,
  value,
}: {
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  value: string;
}) {
  const disabled = value.trim().length === 0;

  return (
    <AppCard style={styles.composerCard}>
      <TextInput
        accessibilityLabel="원하는 메이크업 직접 입력"
        multiline
        onChangeText={onChangeText}
        placeholder={makeupRecommendationDiscoveryCopy.placeholder}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
        textAlignVertical="top"
        value={value}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityState={{disabled}}
        disabled={disabled}
        onPress={onSubmit}
        style={({pressed}) => [
          styles.submitButton,
          disabled ? styles.submitButtonDisabled : null,
          pressed && !disabled ? styles.pressed : null,
        ]}
      >
        <Text style={[styles.submitLabel, disabled ? styles.submitLabelDisabled : null]}>
          {makeupRecommendationDiscoveryCopy.submit}
        </Text>
      </Pressable>
    </AppCard>
  );
}

function ProfileContextRow({
  enabled,
  onChange,
  personalColor,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  personalColor?: string;
}) {
  return (
    <View style={styles.profileRow}>
      <View style={styles.profileCopy}>
        <Text style={styles.profileTitle}>내 분석 결과 함께 보기</Text>
        <Text style={styles.profileDescription}>
          {personalColor ? `${personalColor}을 추천에 반영해요` : '분석 결과 없이 추천'}
        </Text>
      </View>
      {personalColor ? (
        <Switch
          accessibilityLabel="퍼스널 컬러 분석 결과 반영"
          onValueChange={onChange}
          trackColor={{false: colors.borderStrong, true: colors.textPrimary}}
          value={enabled}
        />
      ) : null}
    </View>
  );
}

function ScenarioPromptWall({
  onSelect,
  scenarios,
}: {
  onSelect: (scenario: MakeupScenarioPrompt) => void;
  scenarios: readonly MakeupScenarioPrompt[];
}) {
  return (
    <View style={styles.wall}>
      {scenarios.map((scenario, index) => {
        const emphasis = getScenarioCardEmphasis(index);
        return (
          <ScenarioPromptCard
            emphasis={emphasis}
            key={scenario.id}
            onPress={() => onSelect(scenario)}
            scenario={scenario}
            style={emphasis === 'regular' ? styles.regularCard : undefined}
          />
        );
      })}
    </View>
  );
}

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
  return (
    <AppScreen contentGap={spacing.xl} topPadding="belowShellHeader">
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>{makeupRecommendationDiscoveryCopy.eyebrow}</Text>
        <Text style={styles.title}>{makeupRecommendationDiscoveryCopy.title}</Text>
        <Text style={styles.description}>{makeupRecommendationDiscoveryCopy.description}</Text>
      </View>

      <PromptComposer
        onChangeText={onChangePrompt}
        onSubmit={onSubmitPrompt}
        value={prompt}
      />

      <ProfileContextRow
        enabled={personalColor ? useProfile : false}
        onChange={onChangeUseProfile}
        personalColor={personalColor}
      />

      <View style={styles.scenarioSection}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionEyebrow}>지금 끌리는 한 문장</Text>
          <Text style={styles.sectionDescription}>정답은 없어요. 재미있는 것부터 눌러보세요.</Text>
        </View>
        <ScenarioPromptWall onSelect={onSelectScenario} scenarios={scenarios} />
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onRefreshScenarios}
        style={({pressed}) => [styles.refreshButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.refreshLabel}>{makeupRecommendationDiscoveryCopy.refresh}</Text>
      </Pressable>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    letterSpacing: 1.4,
    lineHeight: typography.lineHeight.xs,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xxl,
    letterSpacing: -1.2,
    lineHeight: typography.lineHeight.xxl,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    maxWidth: 350,
  },
  composerCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  input: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
    minHeight: 92,
    padding: 0,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  submitButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  submitLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  submitLabelDisabled: {
    color: colors.textTertiary,
  },
  pressed: {
    opacity: 0.72,
  },
  profileRow: {
    alignItems: 'center',
    borderBottomColor: colors.divider,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  profileCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  profileTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  profileDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
  },
  scenarioSection: {
    gap: spacing.lg,
  },
  sectionHeading: {
    gap: spacing.xs,
  },
  sectionEyebrow: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    lineHeight: typography.lineHeight.lg,
  },
  sectionDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  wall: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  regularCard: {
    flexBasis: '47%',
    flexGrow: 1,
    maxWidth: '49%',
  },
  refreshButton: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  refreshLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
});
