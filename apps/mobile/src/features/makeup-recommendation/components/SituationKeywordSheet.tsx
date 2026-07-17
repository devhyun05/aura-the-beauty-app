import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import type {MakeupSituation, MakeupTrendKeyword} from '../types';

export function SituationKeywordSheet({
  disabled,
  onClose,
  onSelect,
  selectedKeywordId,
  situation,
  visible,
}: {
  disabled?: boolean;
  onClose: () => void;
  onSelect: (keyword: MakeupTrendKeyword) => void;
  selectedKeywordId: string | null;
  situation: MakeupSituation | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();

  if (!situation) return null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel={situation.label + ' 키워드 선택 닫기'}
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {paddingBottom: Math.max(insets.bottom, spacing.lg)},
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.title}>{situation.label}</Text>
            </View>
            <Pressable
              accessibilityLabel="키워드 선택 닫기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({pressed}) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.closeLabel}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.keywordList}
            showsVerticalScrollIndicator={false}
            style={styles.keywordScroller}
          >
            {situation.keywords.map(item => {
              const selected = item.id === selectedKeywordId;

              return (
                <Pressable
                  accessibilityHint="선택하면 맞춤 질문으로 이동합니다"
                  accessibilityLabel={item.label}
                  accessibilityRole="button"
                  accessibilityState={{disabled, selected}}
                  disabled={disabled}
                  key={item.id}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={({pressed}) => [
                    styles.keywordChip,
                    selected && styles.keywordChipSelected,
                    disabled && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.keywordLabel,
                      selected && styles.keywordLabelSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {flex: 1},
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    maxHeight: '78%',
    minHeight: '44%',
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  heading: {flex: 1},
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    lineHeight: typography.lineHeight.xl,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  closeLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
  },
  keywordScroller: {flexShrink: 1},
  keywordList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  keywordChip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  keywordChipSelected: {
    borderColor: colors.textPrimary,
  },
  keywordLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  keywordLabelSelected: {color: colors.textPrimary},
  disabled: {opacity: 0.45},
  pressed: {backgroundColor: colors.divider},
});
