import {useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet} from 'react-native';
import {
  Camera,
  EyeOff,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Text, View, XStack, YStack} from 'tamagui';

import {colors, iconSize, radius, shadows, spacing, typography} from '../../../shared/theme';
import {getFilterExtractionDataSync} from '../services/filterExtractionService';
import type {
  FilterAdjustmentTab,
  FilterExtractionPhoto,
  FilterFaceArea,
  FilterStyleGroup,
} from '../types';

type FilterTryOnAdjustScreenProps = {
  photo: FilterExtractionPhoto;
  onClose: () => void;
  onCreateRecipe: () => void;
  onSave: () => void;
};

const styleGroups: {id: FilterStyleGroup; label: string}[] = [
  {id: 'color', label: '컬러'},
  {id: 'type', label: '타입'},
  {id: 'texture', label: '질감'},
];

const faceAreas: {id: FilterFaceArea; label: string}[] = [
  {id: 'all', label: '전체'},
  {id: 'base', label: '페이스'},
  {id: 'eye', label: '아이'},
  {id: 'lip', label: '립'},
  {id: 'contour', label: '컨투어'},
];

const typeOptions = ['소프트', '또렷함', '글로우', '내추럴'];
const textureOptions = ['벨벳', '쉬머', '새틴', '글로시'];

export function FilterTryOnAdjustScreen({
  photo,
  onClose,
  onCreateRecipe,
  onSave,
}: FilterTryOnAdjustScreenProps) {
  const insets = useSafeAreaInsets();
  const {result} = getFilterExtractionDataSync();
  const [adjustmentTab, setAdjustmentTab] = useState<FilterAdjustmentTab>('style');
  const [styleGroup, setStyleGroup] = useState<FilterStyleGroup>('color');
  const [selectedColorId, setSelectedColorId] = useState(result.palette[3].id);
  const [selectedFaceArea, setSelectedFaceArea] = useState<FilterFaceArea>('lip');
  const [selectedType, setSelectedType] = useState(typeOptions[0]);
  const [selectedTexture, setSelectedTexture] = useState(textureOptions[2]);

  const selectedColor =
    result.palette.find((palette) => palette.id === selectedColorId) ?? result.palette[0];

  return (
    <View style={styles.screen}>
      <View style={[styles.closeButtonWrap, {top: insets.top + spacing.sm}]}>
        <Pressable accessibilityLabel="결과 화면으로 닫기" accessibilityRole="button" onPress={onClose}>
          <X color={colors.textSecondary} size={iconSize.lg} strokeWidth={2} />
        </Pressable>
      </View>

      <YStack style={[styles.content, {paddingTop: insets.top + spacing.xl}]}>
        <XStack style={styles.topSegment}>
          <SegmentButton
            isActive={adjustmentTab === 'position'}
            label="위치 조정"
            onPress={() => setAdjustmentTab('position')}
          />
          <SegmentButton
            isActive={adjustmentTab === 'style'}
            label="스타일 조정"
            onPress={() => setAdjustmentTab('style')}
          />
        </XStack>

        <View style={styles.previewFrame}>
          <Image resizeMode="cover" source={photo.imageSource} style={styles.previewImage} />
          <View style={[styles.eyeOverlay, {backgroundColor: selectedColor.hex}]} />
          <View style={[styles.cheekOverlayLeft, {backgroundColor: result.palette[2].hex}]} />
          <View style={[styles.cheekOverlayRight, {backgroundColor: result.palette[2].hex}]} />
          <View style={[styles.lipOverlay, {backgroundColor: selectedColor.hex}]} />

          <XStack style={styles.adjustHint}>
            <SlidersHorizontal color={colors.white} size={iconSize.xs} strokeWidth={2} />
            <Text style={styles.adjustHintText}>
              {adjustmentTab === 'position'
                ? '드래그 위치를 미세 조정하는 화면이에요'
                : `${selectedColor.label} 중심으로 스타일을 조정 중이에요`}
            </Text>
          </XStack>
        </View>

        <XStack style={styles.previewToolRow}>
          <Pressable accessibilityRole="button" style={styles.previewTool}>
            <RotateCcw color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.1} />
          </Pressable>
          <View style={styles.intensityTrack}>
            <View style={styles.intensityFill} />
            <View style={styles.intensityThumb} />
          </View>
          <Pressable accessibilityRole="button" style={styles.previewTool}>
            <EyeOff color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.1} />
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.previewTool}>
            <Camera color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.1} />
          </Pressable>
        </XStack>
      </YStack>

      <YStack style={[styles.controlsPanel, {paddingBottom: insets.bottom + spacing.lg}]}>
        <XStack style={styles.styleGroupTabs}>
          {styleGroups.map((group) => (
            <PillButton
              isActive={styleGroup === group.id}
              key={group.id}
              label={group.label}
              onPress={() => setStyleGroup(group.id)}
            />
          ))}
        </XStack>

        {styleGroup === 'color' ? (
          <ScrollView
            contentContainerStyle={styles.colorList}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {result.palette.map((palette) => (
              <Pressable
                accessibilityLabel={`${palette.label} 컬러 선택`}
                accessibilityRole="button"
                accessibilityState={{selected: palette.id === selectedColorId}}
                key={palette.id}
                onPress={() => setSelectedColorId(palette.id)}
                style={[
                  styles.colorCard,
                  palette.id === selectedColorId ? styles.colorCardActive : undefined,
                ]}>
                <View style={[styles.colorSwatch, {backgroundColor: palette.hex}]} />
                <Text style={styles.colorLabel}>{palette.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <XStack style={styles.optionList}>
            {(styleGroup === 'type' ? typeOptions : textureOptions).map((option) => {
              const isActive =
                styleGroup === 'type' ? option === selectedType : option === selectedTexture;

              return (
                <PillButton
                  isActive={isActive}
                  key={option}
                  label={option}
                  onPress={() => {
                    if (styleGroup === 'type') {
                      setSelectedType(option);
                      return;
                    }

                    setSelectedTexture(option);
                  }}
                />
              );
            })}
          </XStack>
        )}

        <XStack style={styles.faceAreaTabs}>
          {faceAreas.map((area) => (
            <PillButton
              isActive={selectedFaceArea === area.id}
              key={area.id}
              label={area.label}
              onPress={() => setSelectedFaceArea(area.id)}
            />
          ))}
        </XStack>

        <YStack style={styles.actionStack}>
          <Pressable
            accessibilityLabel="현재 필터 저장하기"
            accessibilityRole="button"
            onPress={onSave}
            style={({pressed}) => [styles.saveButton, pressed && styles.pressed]}>
            <Save color={colors.white} size={iconSize.sm} strokeWidth={2.1} />
            <Text style={styles.saveButtonText}>현재 필터를 저장하기</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="현재 메이크업 레시피 생성하기"
            accessibilityRole="button"
            onPress={onCreateRecipe}
            style={({pressed}) => [styles.recipeButton, pressed && styles.pressed]}>
            <Sparkles color={colors.textPrimary} size={iconSize.sm} strokeWidth={2.1} />
            <Text style={styles.recipeButtonText}>현재 메이크업 레시피 생성하기</Text>
          </Pressable>
        </YStack>
      </YStack>
    </View>
  );
}

function SegmentButton({
  isActive,
  label,
  onPress,
}: {
  isActive: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      style={[styles.segmentButton, isActive ? styles.segmentButtonActive : undefined]}>
      <Text style={isActive ? styles.segmentTextActive : styles.segmentText}>{label}</Text>
    </Pressable>
  );
}

function PillButton({
  isActive,
  label,
  onPress,
}: {
  isActive: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected: isActive}}
      onPress={onPress}
      style={[styles.pillButton, isActive ? styles.pillButtonActive : undefined]}>
      <Text style={isActive ? styles.pillTextActive : styles.pillText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionStack: {
    gap: spacing.sm,
  },
  adjustHint: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    borderRadius: radius.pill,
    bottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
    left: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.md,
  },
  adjustHintText: {
    color: colors.white,
    flex: 1,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  cheekOverlayLeft: {
    borderRadius: 999,
    height: 54,
    left: '21%',
    opacity: 0.2,
    position: 'absolute',
    top: '52%',
    transform: [{rotate: '-14deg'}],
    width: 90,
  },
  cheekOverlayRight: {
    borderRadius: 999,
    height: 54,
    opacity: 0.2,
    position: 'absolute',
    right: '21%',
    top: '52%',
    transform: [{rotate: '14deg'}],
    width: 90,
  },
  closeButtonWrap: {
    position: 'absolute',
    right: spacing.lg,
    zIndex: 3,
  },
  colorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
    width: 106,
  },
  colorCardActive: {
    borderColor: colors.textPrimary,
    borderWidth: 2,
  },
  colorLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
    textAlign: 'center',
  },
  colorList: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  colorSwatch: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 86,
    width: '100%',
  },
  content: {
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  controlsPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    shadowColor: shadows.soft.shadowColor,
    shadowOffset: {width: 0, height: -6},
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  eyeOverlay: {
    borderRadius: 999,
    height: 32,
    left: '27%',
    opacity: 0.2,
    position: 'absolute',
    right: '27%',
    top: '38%',
  },
  faceAreaTabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  intensityFill: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    height: '100%',
    width: '68%',
  },
  intensityThumb: {
    backgroundColor: colors.white,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 36,
    position: 'absolute',
    right: '22%',
    top: -13,
    width: 54,
  },
  intensityTrack: {
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    flex: 1,
    height: 10,
    position: 'relative',
  },
  lipOverlay: {
    borderRadius: 999,
    bottom: '25%',
    height: 24,
    left: '39%',
    opacity: 0.42,
    position: 'absolute',
    width: 82,
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pillButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  pillButtonActive: {
    backgroundColor: colors.textPrimary,
  },
  pillText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pillTextActive: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  pressed: {
    opacity: 0.78,
  },
  previewFrame: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    flex: 1,
    minHeight: 410,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewTool: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  previewToolRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  recipeButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 54,
  },
  recipeButtonText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 58,
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
  },
  segmentButtonActive: {
    backgroundColor: colors.textPrimary,
  },
  segmentText: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  segmentTextActive: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  styleGroupTabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
  topSegment: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
  },
});
