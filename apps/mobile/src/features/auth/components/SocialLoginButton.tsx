import {ActivityIndicator, Image, StyleSheet} from 'react-native';
import {Button} from 'tamagui';

import type {SocialLoginItem, SocialLoginProvider} from '../types';

type SocialLoginButtonProps = {
  disabled?: boolean;
  isLoading?: boolean;
  item: SocialLoginItem;
  onPress: (provider: SocialLoginProvider) => void;
};

export function SocialLoginButton({
  disabled = false,
  isLoading = false,
  item,
  onPress,
}: SocialLoginButtonProps) {
  return (
    <Button
      accessibilityLabel={item.label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onPress(item.id)}
      style={styles.button}
      unstyled
    >
      {isLoading ? (
        <ActivityIndicator color="#8FA59A" size="small" />
      ) : (
        <SocialLoginMark item={item} />
      )}
    </Button>
  );
}

function SocialLoginMark({item}: {item: SocialLoginItem}) {
  if (item.id === 'kakao') {
    return (
      <Image
        resizeMode="contain"
        source={require('../../../assets/icons/auth/kakao-talk.png')}
        style={styles.kakaoMark}
      />
    );
  }

  if (item.id === 'naver') {
    return (
      <Image
        resizeMode="contain"
        source={require('../../../assets/icons/auth/naver.png')}
        style={styles.naverMark}
      />
    );
  }

  return (
    <Image
      resizeMode="contain"
      source={require('../../../assets/icons/auth/google.png')}
      style={styles.googleMark}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    height: 64,
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 64,
  },
  googleMark: {
    height: 42,
    width: 42,
  },
  kakaoMark: {
    height: 42,
    width: 42,
  },
  naverMark: {
    height: 44,
    width: 44,
  },
});
