import {StyleSheet} from 'react-native';
import {Button, Image, Spinner} from 'tamagui';

import {appAssetUri} from '../../../shared/config/mediaAssets';
import {colors, iconSize, spacing} from '../../../shared/theme';
import type {SocialLoginItem, SocialLoginProvider} from '../types';
import {AppleLogo} from './AppleLogo';

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
      disabledStyle={{opacity: 0.4}}
      onPress={() => onPress(item.id)}
      pressStyle={{opacity: 0.68}}
      style={styles.button}
      unstyled
    >
      {isLoading ? <Spinner color="#8FA59A" size="small" /> : <SocialLoginMark item={item} />}
    </Button>
  );
}

function SocialLoginMark({item}: {item: SocialLoginItem}) {
  if (item.id === 'apple') {
    return <AppleLogo color={colors.black} size={iconSize.xl} />;
  }

  if (item.id === 'kakao') {
    return (
      <Image
        height={44}
        resizeMode="contain"
        src={appAssetUri('icons/auth/kakao-talk.png')}
        width={44}
      />
    );
  }

  if (item.id === 'naver') {
    return (
      <Image
        height={41}
        resizeMode="contain"
        src={appAssetUri('icons/auth/naver.png')}
        width={41}
      />
    );
  }

  return (
    <Image
      height={36}
      resizeMode="contain"
      src={appAssetUri('icons/auth/google.png')}
      width={36}
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
    width: iconSize.xl + spacing.xxl,
  },
});
