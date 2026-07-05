import React from 'react';
import {Modal, Pressable, ScrollView, StyleSheet} from 'react-native';
import {ArrowRight} from 'lucide-react-native';
import {Text, View, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../shared/theme';
import type {AppFeatureMenuItem} from './appFeatureMenu';
import {appFeatureMenuSections} from './appFeatureMenu';

type AppFeatureMenuSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  onSelectItem: (item: AppFeatureMenuItem) => void;
};

export function AppFeatureMenuSheet({
  isVisible,
  onClose,
  onSelectItem,
}: AppFeatureMenuSheetProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isVisible}>
      <Pressable
        accessibilityLabel="전체 기능 메뉴 닫기"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.backdrop}>
        <Pressable
          accessibilityRole="menu"
          onPress={() => {}}
          style={styles.sheet}>
          <View style={styles.handle} />
          <YStack style={styles.header}>
            <Text style={styles.title}>전체 기능</Text>
            <Text style={styles.description}>
              지금 사용할 수 있는 기능을 빠르게 열어요.
            </Text>
          </YStack>

          <ScrollView
            contentContainerStyle={styles.sectionList}
            showsVerticalScrollIndicator={false}>
            {appFeatureMenuSections.map(section => (
              <YStack key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.label}</Text>
                <YStack style={styles.itemList}>
                  {section.items.map(item => (
                    <Pressable
                      accessibilityLabel={`${item.label} 열기`}
                      accessibilityRole="menuitem"
                      key={item.id}
                      onPress={() => onSelectItem(item)}
                      style={({pressed}) => [
                        styles.itemButton,
                        pressed && styles.pressed,
                      ]}>
                      <YStack style={styles.itemCopy}>
                        <Text style={styles.itemTitle}>{item.label}</Text>
                        <Text style={styles.itemDescription}>{item.description}</Text>
                      </YStack>
                      <ArrowRight
                        color={colors.textPrimary}
                        size={iconSize.sm}
                        strokeWidth={2}
                      />
                    </Pressable>
                  ))}
                </YStack>
              </YStack>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.md,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    height: 4,
    width: 42,
  },
  header: {
    gap: spacing.xs,
  },
  itemButton: {
    alignItems: 'center',
    backgroundColor: colors.bottomSheetControlSurface,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  itemDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  itemList: {
    gap: spacing.xs,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  section: {
    gap: spacing.sm,
  },
  sectionList: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    letterSpacing: 0,
    lineHeight: typography.lineHeight.xs,
  },
  sheet: {
    backgroundColor: colors.bottomSheetSurface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.lg,
    maxHeight: '82%',
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -8},
    shadowOpacity: 0.14,
    shadowRadius: 24,
  },
  title: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.xl,
  },
});
