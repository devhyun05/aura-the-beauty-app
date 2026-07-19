import {StyleSheet, Text, View} from 'react-native';

import {colors, radius, type as typography} from '../../theme/makeupResultTokens';
import type {FinalRecipeStep} from './finalAreaGuideRecipe';

export interface FinalMakeupRecipeStepCardProps {
  accentHex: string;
  step: FinalRecipeStep;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function FinalMakeupRecipeStepCard({
  accentHex,
  step,
}: FinalMakeupRecipeStepCardProps) {
  const safeAccentHex = HEX_COLOR.test(accentHex) ? accentHex : colors.heroPlaceholder;
  const details = [
    {label: '도구', value: step.tool},
    {label: '사용량', value: step.amount},
    {label: '바르는 범위', value: step.placement},
  ].filter(detail => detail.value);

  return (
    <View
      accessibilityLabel={`${step.order}단계 ${step.title}`}
      style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.numberBadge, {backgroundColor: safeAccentHex}]}>
          <Text style={styles.numberText}>{step.order}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{step.title}</Text>
          {step.productType ? (
            <Text style={styles.productType}>제품 유형 · {step.productType}</Text>
          ) : null}
        </View>
      </View>

      {step.colors.length > 0 ? (
        <View style={styles.colorSection}>
          <Text style={styles.sectionLabel}>사용 색상 · {step.colors.length}개</Text>
          <View style={styles.colorList}>
            {step.colors.map(color => (
              <View key={`${color.role}:${color.name}:${color.hex}`} style={styles.colorRow}>
                <View
                  accessibilityLabel={`${color.role ? `${color.role} ` : ''}${color.name} 색상`}
                  style={[
                    styles.colorSwatch,
                    {backgroundColor: HEX_COLOR.test(color.hex) ? color.hex : colors.heroPlaceholder},
                  ]}
                />
                <View style={styles.colorCopy}>
                  {color.role ? <Text style={styles.colorRole}>{color.role}</Text> : null}
                  <Text style={styles.colorName}>{color.name}</Text>
                </View>
                {HEX_COLOR.test(color.hex) ? (
                  <Text style={typography.mono}>{color.hex.toUpperCase()}</Text>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {details.length > 0 ? (
        <View style={styles.detailGrid}>
          {details.map(detail => (
            <View key={detail.label} style={styles.detailTile}>
              <Text style={styles.sectionLabel}>{detail.label}</Text>
              <Text style={styles.detailText}>{detail.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {step.technique ? (
        <View style={styles.instructionBlock}>
          <Text style={styles.sectionLabel}>바르는 방법</Text>
          <Text style={styles.instructionText}>{step.technique}</Text>
        </View>
      ) : null}

      {step.blending ? (
        <View style={styles.techniqueBlock}>
          <Text style={styles.sectionLabel}>블렌딩</Text>
          <Text style={styles.detailText}>{step.blending}</Text>
        </View>
      ) : null}

      {step.finishCheck ? (
        <View style={styles.finishBlock}>
          <View style={styles.finishDot} />
          <View style={styles.finishCopy}>
            <Text style={styles.finishLabel}>이 단계의 완료 기준</Text>
            <Text style={styles.finishText}>{step.finishCheck}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.glassBorder,
    borderRadius: radius.tile,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  header: {alignItems: 'center', flexDirection: 'row', gap: 11},
  numberBadge: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  numberText: {color: colors.ink, fontSize: 13, fontWeight: '900'},
  headerCopy: {flex: 1, gap: 3, minWidth: 0},
  title: {color: colors.ink, fontSize: 15, fontWeight: '800', lineHeight: 20},
  productType: {color: colors.sub2, fontSize: 11.5, fontWeight: '700'},
  sectionLabel: {
    color: colors.faint,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  colorSection: {gap: 8},
  colorList: {gap: 7},
  colorRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,249,255,0.72)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  colorSwatch: {
    borderColor: 'rgba(16,24,40,0.12)',
    borderRadius: 10,
    borderWidth: 1,
    height: 28,
    width: 28,
  },
  colorCopy: {flex: 1, gap: 1, minWidth: 0},
  colorRole: {color: colors.sub2, fontSize: 9.5, fontWeight: '700'},
  colorName: {color: colors.ink, fontSize: 12.5, fontWeight: '800'},
  detailGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  detailTile: {
    backgroundColor: 'rgba(239,244,255,0.68)',
    borderRadius: 10,
    flexGrow: 1,
    flexBasis: '46%',
    gap: 4,
    minWidth: 126,
    padding: 10,
  },
  detailText: {color: colors.ink3, fontSize: 12, fontWeight: '600', lineHeight: 18},
  instructionBlock: {
    borderLeftColor: colors.sub3,
    borderLeftWidth: 2,
    gap: 5,
    paddingLeft: 11,
  },
  instructionText: {color: colors.ink, fontSize: 13, fontWeight: '700', lineHeight: 20},
  techniqueBlock: {
    backgroundColor: 'rgba(226,232,247,0.72)',
    borderRadius: 10,
    gap: 5,
    padding: 11,
  },
  finishBlock: {
    alignItems: 'flex-start',
    backgroundColor: 'rgba(221,235,228,0.76)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 9,
    padding: 11,
  },
  finishDot: {backgroundColor: '#6E8878', borderRadius: 4, height: 8, marginTop: 5, width: 8},
  finishCopy: {flex: 1, gap: 3, minWidth: 0},
  finishLabel: {color: '#51675A', fontSize: 10, fontWeight: '800'},
  finishText: {color: colors.ink3, fontSize: 12, fontWeight: '600', lineHeight: 18},
});
