import {useState} from 'react';
import {Modal, StyleSheet} from 'react-native';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {PrivacyPolicyScreen} from '../../legal/screens/PrivacyPolicyScreen';
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
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

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
            style={styles.termsText}
          >
            가입 시 이용약관,{' '}
            <Text style={styles.termsLink} onPress={() => setShowPrivacyPolicy(true)}>
              개인정보 수집·이용 및 처리방침
            </Text>
            , 제품 추천 개인화를 위한 좋아요·검색·클릭 데이터 활용과 익명 컬러 취향 추천에 동의하게 됩니다.
          </Text>
        </YStack>
      </YStack>

      <Modal
        animationType="slide"
        onRequestClose={() => setShowPrivacyPolicy(false)}
        presentationStyle="pageSheet"
        visible={showPrivacyPolicy}>
        <PrivacyPolicyScreen onClose={() => setShowPrivacyPolicy(false)} />
      </Modal>
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
    columnGap: spacing.lg,
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
    maxWidth: 340,
    textAlign: 'center',
    width: '100%',
  },
});
