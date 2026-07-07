import {Home, PenLine, Search, User} from 'lucide-react-native';
import {Pressable, StyleSheet} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {XStack} from 'tamagui';

import {colors, communityColors, iconSize, spacing} from '../../../shared/theme';

export type CommunityMode = 'home' | 'my' | 'recommended';

export const COMMUNITY_MODE_BAR_HEIGHT = 64;
export const COMMUNITY_MODE_BAR_FOOTER_GAP = spacing.sm;

export function CommunityModeBar({
  bottomPadding,
  mode,
  onPressCreate,
  onSelectMode,
}: {
  bottomPadding?: number;
  mode: CommunityMode;
  onPressCreate: () => void;
  onSelectMode: (mode: CommunityMode) => void;
}) {
  const insets = useSafeAreaInsets();
  const resolvedBottomPadding = bottomPadding ?? Math.max(insets.bottom, spacing.sm);

  return (
    <XStack style={[styles.bar, {paddingBottom: resolvedBottomPadding}]}>
      <ModeButton
        active={mode === 'home'}
        icon="home"
        label="홈"
        onPress={() => onSelectMode('home')}
      />
      <ModeButton
        active={mode === 'recommended'}
        icon="search"
        label="추천"
        onPress={() => onSelectMode('recommended')}
      />
      <ModeButton
        active={false}
        icon="create"
        label="작성"
        onPress={onPressCreate}
      />
      <ModeButton
        active={mode === 'my'}
        icon="my"
        label="MY"
        onPress={() => onSelectMode('my')}
      />
    </XStack>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: 'create' | 'home' | 'my' | 'search';
  label: string;
  onPress: () => void;
}) {
  const Icon = icon === 'home' ? Home : icon === 'search' ? Search : icon === 'my' ? User : PenLine;
  const color = active ? colors.textPrimary : colors.textTertiary;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{selected: active}}
      onPress={onPress}
      style={({pressed}) => [styles.item, pressed && styles.pressed]}>
      <Icon color={color} size={iconSize.md} strokeWidth={active ? 2.4 : 2} />
      {active ? <XStack style={styles.activeDot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activeDot: {
    backgroundColor: communityColors.accent,
    borderRadius: 2,
    height: 3,
    width: 14,
  },
  bar: {
    alignItems: 'center',
    backgroundColor: communityColors.surfaceWarm,
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: COMMUNITY_MODE_BAR_HEIGHT,
    paddingTop: spacing.sm,
  },
  item: {
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 72,
  },
  pressed: {
    opacity: 0.7,
  },
});
