import {Image, StyleSheet} from 'react-native';
import {Text, View} from 'tamagui';

import {communityColors, typography} from '../../../shared/theme';

export function CommunityAvatar({
  avatarUrl,
  bordered = false,
  nickname,
  size = 24,
}: {
  avatarUrl?: string | null;
  bordered?: boolean;
  nickname: string;
  size?: number;
}) {
  const shapeStyle = {
    borderRadius: size / 2,
    height: size,
    width: size,
  };

  if (avatarUrl) {
    return (
      <Image
        source={{uri: avatarUrl}}
        style={[shapeStyle, bordered && styles.bordered]}
      />
    );
  }

  return (
    <View style={[styles.fallback, shapeStyle, bordered && styles.bordered]}>
      <Text style={[styles.initial, {fontSize: Math.round(size * 0.45)}]}>
        {nickname.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bordered: {
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
  },
  fallback: {
    alignItems: 'center',
    backgroundColor: communityColors.accentSoft,
    justifyContent: 'center',
  },
  initial: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
  },
});
