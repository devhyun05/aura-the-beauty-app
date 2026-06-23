import {useState} from 'react';
import {StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

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
    <SafeAreaView style={styles.safeArea}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  errorFeedback: {
    color: '#C05F57',
  },
  feedback: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0,
    lineHeight: 16,
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
  safeArea: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  socialRow: {
    alignItems: 'center',
    columnGap: 74,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  successFeedback: {
    color: '#6F877A',
  },
  termsLink: {
    color: '#242121',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  termsText: {
    color: '#B7B2B2',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 18,
    marginTop: 8,
    textAlign: 'center',
    width: '100%',
  },
});
