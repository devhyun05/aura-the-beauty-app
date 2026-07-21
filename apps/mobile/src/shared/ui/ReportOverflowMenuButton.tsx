import {useCallback, useState} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
} from 'react-native';
import {MoreHorizontal} from 'lucide-react-native';

import {colors, iconSize, radius} from '../theme';

type ReportOverflowMenuButtonProps = {
  confirmMessage?: string;
  disabled?: boolean;
  onDelete: () => Promise<void> | void;
};

export function ReportOverflowMenuButton({
  confirmMessage = '삭제한 보고서는 되돌릴 수 없어요.',
  disabled = false,
  onDelete,
}: ReportOverflowMenuButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    if (disabled || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      Alert.alert(
        '보고서를 삭제하지 못했어요',
        error instanceof Error
          ? error.message
          : '잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setIsDeleting(false);
    }
  }, [disabled, isDeleting, onDelete]);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (disabled || isDeleting) {
        return;
      }

      Alert.alert('보고서 관리', confirmMessage, [
        {style: 'cancel', text: '취소'},
        {
          onPress: () => void handleConfirmDelete(),
          style: 'destructive',
          text: '삭제',
        },
      ]);
    },
    [confirmMessage, disabled, handleConfirmDelete, isDeleting],
  );

  return (
    <Pressable
      accessibilityLabel={isDeleting ? '보고서 삭제 중' : '보고서 관리 메뉴'}
      accessibilityRole="button"
      accessibilityState={{busy: isDeleting, disabled: disabled || isDeleting}}
      disabled={disabled || isDeleting}
      hitSlop={6}
      onPress={handlePress}
      style={({pressed}) => [
        styles.button,
        (disabled || isDeleting) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <MoreHorizontal
        color={colors.textPrimary}
        size={iconSize.sm}
        strokeWidth={2.2}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
