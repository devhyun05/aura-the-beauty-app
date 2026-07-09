import {StyleSheet, View as RNView} from 'react-native';
import {Check} from 'lucide-react-native';
import {Text, View} from 'tamagui';

import {
  consultingColors,
  consultingRadius,
  spacing,
  typography,
} from '../../../shared/theme';
import {ConsultingScreenScaffold} from '../components/ConsultingScreenScaffold';
import {
  ConsultingBottomBar,
  ConsultingSectionTitle,
  PrimaryButton,
  SecondaryButton,
} from '../components/consultingComponents';
import {formatConsultingPrice} from '../mocks/consulting.mock';
import type {
  ConsultingExpert,
  ConsultingRecommendedProduct,
  ConsultingSummary,
} from '../types';

const productToneColors: Record<string, string> = {
  rose: '#EAD6D2',
  mauve: '#E4D8E1',
  sand: '#E9E2D6',
};

type ConsultingSummaryScreenProps = {
  expert: ConsultingExpert;
  summary?: ConsultingSummary;
  heroTitle?: string;
  onGoToConsultingHome: () => void;
  onPressHistory: () => void;
};

export function ConsultingSummaryScreen({
  expert,
  summary,
  heroTitle = '상담이 완료됐어요',
  onGoToConsultingHome,
  onPressHistory,
}: ConsultingSummaryScreenProps) {
  const hasSummary = Boolean(summary);

  return (
    <RNView style={styles.root}>
      <ConsultingScreenScaffold bottomPadding={spacing.md}>
        <View style={styles.hero}>
          <RNView style={styles.checkCircle}>
            <Check color={consultingColors.roseText} size={24} />
          </RNView>
          <Text style={styles.title}>{heroTitle}</Text>
          <Text style={styles.subtitle}>
            {summary
              ? `${expert.name} · ${summary.durationLabel} · ${summary.dateLabel}`
              : `${expert.name} 상담 AI 요약이 준비되면 표시돼요.`}
          </Text>
        </View>

        {summary ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteCardLabel}>AI 상담 요약</Text>
            <View style={styles.noteList}>
              {summary.notes.map(note => (
                <RNView key={note.id} style={styles.noteRow}>
                  <Text style={styles.noteBody}>
                    <Text style={styles.noteBadge}>{note.label} </Text>
                    {note.body}
                  </Text>
                </RNView>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.noteCard}>
            <Text style={styles.noteCardLabel}>요약 준비 중</Text>
            <Text style={styles.noteBody}>
              화상 상담이 완료되고 AI 요약이 생성되면 이 화면에 바로 반영돼요.
            </Text>
          </View>
        )}

        {summary && summary.products.length > 0 ? (
          <View style={styles.section}>
            <ConsultingSectionTitle>전문가 추천 제품</ConsultingSectionTitle>
            <View style={styles.productList}>
              {summary.products.map(product => (
                <ProductRow key={product.id} product={product} />
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.saveNote}>
          {hasSummary
            ? '요약 리포트는 마이페이지 > 내 상담 내역에 자동 저장됐어요.'
            : '저장된 요약이 없을 때는 상담 내역만 먼저 보여드려요.'}
        </Text>
      </ConsultingScreenScaffold>

      <ConsultingBottomBar>
        <PrimaryButton label="내 상담 내역 보기" onPress={onPressHistory} />
        <SecondaryButton label="컨설팅 홈으로" onPress={onGoToConsultingHome} />
      </ConsultingBottomBar>
    </RNView>
  );
}

function ProductRow({product}: {product: ConsultingRecommendedProduct}) {
  const swatch = productToneColors[product.tone] ?? consultingColors.surfaceMuted;
  return (
    <RNView style={styles.productRow}>
      <RNView style={[styles.productSwatch, {backgroundColor: swatch}]} />
      <RNView style={styles.productBody}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productMeta}>
          {product.category} · {formatConsultingPrice(product.price)}
        </Text>
      </RNView>
      <RNView style={styles.productChip}>
        <Text style={styles.productChipText}>담기</Text>
      </RNView>
    </RNView>
  );
}

const styles = StyleSheet.create({
  checkCircle: {
    alignItems: 'center',
    backgroundColor: consultingColors.roseSoft,
    borderRadius: consultingRadius.pill,
    height: 52,
    justifyContent: 'center',
    marginBottom: 12,
    width: 52,
  },
  hero: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  noteBadge: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.semibold,
    fontWeight: typography.fontWeight.semibold,
  },
  noteBody: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  noteCard: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.card,
    padding: 18,
  },
  noteCardLabel: {
    color: consultingColors.roseStrong,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: 12,
  },
  noteList: {
    gap: spacing.md,
  },
  noteRow: {
    flexDirection: 'row',
  },
  productBody: {
    flex: 1,
  },
  productChip: {
    backgroundColor: consultingColors.surfaceMuted,
    borderRadius: consultingRadius.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  productChipText: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  productList: {
    gap: spacing.sm,
  },
  productMeta: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  productName: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  productRow: {
    alignItems: 'center',
    backgroundColor: consultingColors.surface,
    borderColor: consultingColors.borderSoft,
    borderRadius: consultingRadius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: 12,
  },
  productSwatch: {
    borderRadius: 10,
    height: 40,
    width: 40,
  },
  root: {
    backgroundColor: consultingColors.background,
    flex: 1,
  },
  saveNote: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    textAlign: 'center',
  },
  section: {
    gap: spacing.md,
  },
  subtitle: {
    color: consultingColors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    marginTop: 6,
    textAlign: 'center',
  },
  title: {
    color: consultingColors.text,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
  },
});
