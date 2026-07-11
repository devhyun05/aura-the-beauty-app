import {ActivityIndicator, Image, Pressable, StyleSheet} from 'react-native';
import {Text, View, YStack} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';

type HairProgressScreenProps = {
  description: string;
  errorMessage?: string | null;
  imageUri?: string | null;
  onRetry?: () => void;
  title: string;
};

export function HairProgressScreen({description, errorMessage, imageUri, onRetry, title}: HairProgressScreenProps) {
  return (
    <AppScreen bottomPadding="safeArea" contentGap={spacing.xxl} scroll={false} topPadding="belowShellHeader">
      <YStack style={styles.copy}>
        <Text style={styles.title}>{errorMessage ? '처리를 완료하지 못했어요' : title}</Text>
        <Text style={styles.description}>{errorMessage || description}</Text>
      </YStack>
      <View style={styles.preview}>
        {imageUri ? <Image resizeMode="cover" source={{uri: imageUri}} style={styles.image} /> : null}
        <View style={styles.dim} />
        {!errorMessage ? <ActivityIndicator color={colors.white} size="large" /> : null}
      </View>
      {!errorMessage ? (
        <YStack style={styles.status}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>앱을 닫아도 작업은 안전하게 계속돼요</Text>
        </YStack>
      ) : (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>다시 시도</Text>
        </Pressable>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  copy: {gap: spacing.sm},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  dim: {backgroundColor: 'rgba(0,0,0,0.34)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0},
  image: {height: '100%', width: '100%'},
  preview: {alignItems: 'center', backgroundColor: colors.textPrimary, borderRadius: radius.sm, flex: 1, justifyContent: 'center', minHeight: 360, overflow: 'hidden'},
  retryButton: {alignItems: 'center', backgroundColor: colors.blackSurface, borderRadius: radius.pill, justifyContent: 'center', minHeight: 56},
  retryButtonText: {color: colors.white, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  status: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'center'},
  statusDot: {backgroundColor: colors.guideReady, borderRadius: radius.pill, height: 8, width: 8},
  statusText: {color: colors.textSecondary, fontFamily: typography.fontFamily.medium, fontSize: typography.fontSize.sm},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
});
