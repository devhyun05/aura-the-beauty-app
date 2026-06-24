import {useState} from 'react';
import {StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {AuraLogo} from '../components/AuraLogo';
import {SocialLoginButton} from '../components/SocialLoginButton';
import {socialLoginProviders} from '../mocks/socialLoginProviders.mock';
import {loginWithSocialProvider} from '../services/authService';
import type {AuthSession, SocialLoginProvider} from '../types';

type LoginFeedback = {
  message: string;
  tone: 'success' | 'error';
};

type LoginScreenProps = {
  onLoginSuccess?: (session: AuthSession) => void;
  simulateLoginFailure?: boolean;
};

export function LoginScreen({onLoginSuccess, simulateLoginFailure = false}: LoginScreenProps) {
  const [feedback, setFeedback] = useState<LoginFeedback | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<SocialLoginProvider | null>(null);

  const handleSocialLogin = async (provider: SocialLoginProvider) => {
    if (loadingProvider !== null) {
      return;
    }

    setFeedback(null);
    setLoadingProvider(provider);

    try {
      const session = await loginWithSocialProvider(provider, {
        shouldFail: simulateLoginFailure,
      });

      setFeedback({
        message: '로그인되었습니다.',
        tone: 'success',
      });
      onLoginSuccess?.(session);
    } catch (error) {
      setFeedback({
        message: error instanceof Error ? error.message : '로그인에 실패했습니다.',
        tone: 'error',
      });
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <AppScreen
      backgroundColor={colors.background}
      bottomPadding="safeArea"
      contentGap={0}
      horizontalPadding={0}
      scroll={false}
      topPadding="safeArea">
      <YStack style={styles.screen}>
        <View style={styles.logoArea}>
          <AuraLogo />
        </View>

        <YStack style={styles.loginArea}>
          <XStack style={styles.socialRow}>
            {socialLoginProviders.map((item) => (
              <SocialLoginButton
                disabled={loadingProvider !== null && loadingProvider !== item.id}
                isLoading={loadingProvider === item.id}
                item={item}
                key={item.id}
                onPress={handleSocialLogin}
              />
            ))}
          </XStack>

          <View style={styles.feedbackSlot}>
            {feedback ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  styles.feedback,
                  feedback.tone === 'success' ? styles.successFeedback : styles.errorFeedback,
                ]}
              >
                {feedback.message}
              </Text>
            ) : null}
          </View>

          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.82}
            numberOfLines={1}
            style={styles.termsText}
          >
            가입 시 <Text style={styles.termsLink}>이용약관</Text> 및{' '}
            <Text style={styles.termsLink}>개인정보처리방침</Text>에 동의하게 됩니다
          </Text>
        </YStack>
      </YStack>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  errorFeedback: {
    color: '#C05F57',
  },
  feedback: {
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  feedbackSlot: {
    height: 18,
    justifyContent: 'center',
    marginTop: 14,
  },
  loginArea: {
    alignItems: 'center',
    bottom: 46,
    left: 0,
    paddingHorizontal: 30,
    position: 'absolute',
    right: 0,
  },
  logoArea: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: '35%',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  socialRow: {
    alignItems: 'center',
    columnGap: 74,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  successFeedback: {
    color: colors.successMuted,
  },
  termsLink: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.bold,
    textDecorationLine: 'underline',
  },
  termsText: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
    marginTop: 8,
    textAlign: 'center',
    width: '100%',
  },
});
