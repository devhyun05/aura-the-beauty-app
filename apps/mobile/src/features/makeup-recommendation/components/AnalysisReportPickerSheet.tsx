import {FlatList, Image, Modal, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import {colors, radius, spacing, typography} from '../../../shared/theme';

export function AnalysisReportPickerSheet({
  onClose,
  onSelect,
  reports,
  selectedReportId,
  visible,
}: {
  onClose: () => void;
  onSelect: (reportId: string) => void;
  reports: readonly FaceAnalysisReport[];
  selectedReportId: string | null;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="보고서 선택 닫기" accessibilityRole="button" onPress={onClose} style={styles.dismissArea} />
        <View style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, spacing.lg)}]}>
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.title}>내 얼굴 분석 보고서</Text>
              <Text style={styles.description}>추천에 사용할 완료 보고서를 골라주세요.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeLabel}>닫기</Text>
            </Pressable>
          </View>
          <FlatList
            contentContainerStyle={styles.list}
            data={[...reports]}
            keyExtractor={item => item.id}
            renderItem={({item}) => {
              const selected = item.id === selectedReportId;
              return (
                <Pressable
                  accessibilityLabel={`${item.reportTitle}, ${item.faceShape}, ${item.personalColor}`}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  style={[styles.row, selected && styles.rowSelected]}
                >
                  <Image accessible={false} source={item.imageSource} style={styles.image} />
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={styles.reportTitle}>{item.reportTitle}</Text>
                    <Text numberOfLines={2} style={styles.meta}>{item.faceShape} · {item.personalColor} · {item.skinType}</Text>
                  </View>
                  <Text style={styles.check}>{selected ? '선택됨' : '선택'}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  dismissArea: {flex: 1},
  sheet: {backgroundColor: colors.bottomSheetSurface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '76%', paddingTop: spacing.lg},
  header: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', paddingHorizontal: spacing.screenX},
  heading: {flex: 1, gap: spacing.xs},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl},
  description: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm},
  closeButton: {justifyContent: 'center', minHeight: 44, paddingLeft: spacing.md},
  closeLabel: {color: colors.textSecondary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.sm},
  list: {gap: spacing.sm, padding: spacing.screenX},
  row: {alignItems: 'center', borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, minHeight: 88, padding: spacing.sm},
  rowSelected: {backgroundColor: colors.surfaceMuted, borderColor: colors.textPrimary},
  image: {backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, height: 64, width: 64},
  copy: {flex: 1, gap: spacing.xs},
  reportTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.sm},
  meta: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.xs, lineHeight: typography.lineHeight.xs},
  check: {color: colors.textPrimary, fontFamily: typography.fontFamily.semibold, fontSize: typography.fontSize.xs},
});