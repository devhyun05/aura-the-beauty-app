import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Text } from 'tamagui';
import { beardColors } from '../tokens/tokens';

/**
 * 삭제 확인 다이얼로그 (dark sheet, 296 wide). Deleting wipes all state and returns to the
 * purpose screen (handled by the caller's onConfirm).
 */
export function DeleteConfirmSheet({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.58)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Stop propagation so taps inside the sheet don't dismiss. */}
        <Pressable onPress={() => {}}>
          <View
            style={{
              width: 296,
              borderRadius: 22,
              backgroundColor: '#171A1F',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              paddingHorizontal: 22,
              paddingTop: 24,
              paddingBottom: 18,
            }}
          >
            <Text fontSize={17} fontWeight="700" color={beardColors.textPrimary}>
              사진과 결과를 삭제할까요?
            </Text>
            <Text fontSize={13.5} lineHeight={22} color={beardColors.textSecondary} mt={9}>
              촬영한 사진과 생성된 결과가 함께 삭제되고, 처음 화면으로 돌아가요.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={onCancel}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text fontSize={14.5} fontWeight="600" color={beardColors.textPrimary}>
                  취소
                </Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 999,
                  backgroundColor: beardColors.danger,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text fontSize={14.5} fontWeight="600" color="#FFFFFF">
                  삭제
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
