import {StyleSheet, View as RNView} from 'react-native';
import {Clock3} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';

export function ConsultingMembershipScreen() {
  return (
    <ConsultingScreenScaffold contentGap={spacing.xl}>
      <View style={styles.hero}>
        <RNView style={styles.heroIcon}>
          <Clock3 color={consultingColors.goldText} size={22} />
        </RNView>
        <Text style={styles.heroTitle}>멤버십 준비 중</Text>
        <Text style={styles.heroSubtitle}>
          사업자 등록과 결제 정책을 확정한 뒤 안내할 예정이에요.
        </Text>
      </View>
    </ConsultingScreenScaffold>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: 44,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: consultingColors.goldSoft,
    borderRadius: consultingRadius.pill,
    height: 44,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 44,
  },
  heroSubtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
  heroTitle: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
});
