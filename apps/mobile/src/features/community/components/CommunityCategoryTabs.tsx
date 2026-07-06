import {ArrowLeftRight, BookOpen, MessageCircle, Palette, Sparkles} from 'lucide-react-native';
import {useEffect, useRef} from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {Text} from 'tamagui';

import {colors, communityColors, radius, spacing, typography} from '../../../shared/theme';
import {triggerLightHaptic} from '../utils/haptics';

export type CommunityFeedTabItem = {
  id: string;
  label: string;
};

// 카테고리 아이콘 단일 소스 — 다이얼 셀렉터와 그리드 카드 배지가 공유한다.
export const categoryIcons: Record<string, typeof Sparkles> = {
  all: Sparkles,
  before_after: ArrowLeftRight,
  lookbook: BookOpen,
  product_combo: Palette,
  question: MessageCircle,
};

const ITEM_WIDTH = 76;

/**
 * 다이얼 카테고리 셀렉터 — 카메라 모드 다이얼처럼 슬라이드해서
 * 가운데에 스냅된 아이콘이 커지며 그 카테고리로 자연 전환된다.
 * 탭해도 해당 아이콘이 가운데로 스크롤되며 선택된다.
 */
export function CommunityCategoryTabs({
  items,
  selectedId,
  onSelect,
}: {
  items: CommunityFeedTabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const {width: windowWidth} = useWindowDimensions();
  const initialIndex = Math.max(0, items.findIndex(item => item.id === selectedId));
  const scrollX = useRef(new Animated.Value(initialIndex * ITEM_WIDTH)).current;
  const scrollRef = useRef<Animated.FlatList<CommunityFeedTabItem> | null>(null);
  const selectedIndexRef = useRef(Math.max(0, items.findIndex(item => item.id === selectedId)));
  const sidePadding = (windowWidth - ITEM_WIDTH) / 2;

  const commitIndex = (index: number) => {
    const clamped = Math.min(items.length - 1, Math.max(0, index));

    if (clamped !== selectedIndexRef.current) {
      selectedIndexRef.current = clamped;
      triggerLightHaptic();
      onSelect(items[clamped].id);
    }
  };

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollToOffset({animated: true, offset: index * ITEM_WIDTH});
    commitIndex(index);
  };

  // 외부에서 selectedId가 바뀌면 다이얼도 따라간다.
  useEffect(() => {
    const index = items.findIndex(item => item.id === selectedId);

    if (index >= 0 && index !== selectedIndexRef.current) {
      selectedIndexRef.current = index;
      scrollRef.current?.scrollToOffset({animated: true, offset: index * ITEM_WIDTH});
    }
  }, [items, selectedId]);

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    commitIndex(Math.round(event.nativeEvent.contentOffset.x / ITEM_WIDTH));
  };

  return (
    <Animated.FlatList
      horizontal
      contentContainerStyle={{paddingHorizontal: sidePadding, paddingVertical: spacing.sm}}
      contentOffset={{x: initialIndex * ITEM_WIDTH, y: 0}}
      data={items}
      decelerationRate="fast"
      keyExtractor={item => item.id}
      ref={scrollRef}
      renderItem={({item, index}) => {
        const selected = item.id === selectedId;
        const Icon = categoryIcons[item.id] ?? Sparkles;
        const inputRange = [(index - 1) * ITEM_WIDTH, index * ITEM_WIDTH, (index + 1) * ITEM_WIDTH];
        const scale = scrollX.interpolate({
          extrapolate: 'clamp',
          inputRange,
          outputRange: [0.78, 1.18, 0.78],
        });
        const opacity = scrollX.interpolate({
          extrapolate: 'clamp',
          inputRange,
          outputRange: [0.45, 1, 0.45],
        });

        return (
          <Pressable
            accessibilityLabel={`${item.label} 보기`}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            onPress={() => scrollToIndex(index)}
            style={styles.item}>
            <Animated.View
              style={[
                styles.circle,
                selected && styles.selectedCircle,
                {opacity, transform: [{scale}]},
              ]}>
              <Icon
                color={selected ? communityColors.accent : colors.textSecondary}
                size={22}
                strokeWidth={selected ? 2.4 : 2}
              />
            </Animated.View>
            <Animated.View style={{opacity}}>
              <Text style={[styles.label, selected && styles.selectedLabel]}>
                {item.label}
              </Text>
            </Animated.View>
          </Pressable>
        );
      }}
      showsHorizontalScrollIndicator={false}
      snapToInterval={ITEM_WIDTH}
      onMomentumScrollEnd={handleMomentumEnd}
      onScroll={Animated.event(
        [{nativeEvent: {contentOffset: {x: scrollX}}}],
        {useNativeDriver: true},
      )}
      scrollEventThrottle={16}
    />
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  item: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    width: ITEM_WIDTH,
  },
  label: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  selectedCircle: {
    backgroundColor: communityColors.accentSoft,
    borderColor: communityColors.accent,
    borderWidth: 1.5,
  },
  selectedLabel: {
    color: communityColors.accent,
    fontFamily: typography.fontFamily.bold,
  },
});
