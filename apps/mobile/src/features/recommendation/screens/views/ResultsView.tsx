// AURADIN — Results: the "bright reveal". One hero pick + '비슷한 후보' list on
// glass, ink-first text, refine dials, reset link. The orb recedes top-right
// (host). Recreated from prompts/3-results.md (+ refine dials from the port brief).
import * as React from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, layout, text, tracking } from '../../theme/auradinTokens';
import type { AuradinAppliedFilter, AuradinCandidateProduct, RefineDial } from '../../types';
import {
  Badge,
  Chip,
  GlassCard,
  LoaderDots,
  ProductThumb,
  useEnterTransition,
  Wordmark,
} from '../../components/ds';

export type ResultsViewProps = {
  candidates: AuradinCandidateProduct[];
  subtitle?: string;
  appliedFilters?: AuradinAppliedFilter[];
  refining?: boolean;
  onOpen: (product: AuradinCandidateProduct) => void;
  onRefine: (dial: RefineDial) => void;
  onHome: () => void;
  onOpenSaved?: () => void;
  savedCount: number;
};

const monoLabel = {
  fontFamily: font.mono,
  textTransform: 'uppercase',
} as const;

/** 12px palette dot (au-swatch) used in the "왜 맞는지" row. */
function PaletteDot({ c }: { c?: string }): React.JSX.Element {
  return (
    <View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 1.6,
        borderColor: '#FFFFFF',
        backgroundColor: c ?? color.pink,
      }}
    />
  );
}

export function ResultsView({
  candidates,
  subtitle,
  appliedFilters = [],
  refining = false,
  onOpen,
  onRefine,
  onHome,
  onOpenSaved,
  savedCount,
}: ResultsViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const enter = useEnterTransition(16);
  const top = candidates[0];
  const alts = candidates.slice(1);
  const chips = appliedFilters.filter((f) => f.label);

  return (
    <Animated.View
      style={[
        {
          flex: 1,
          paddingTop: insets.top + layout.padTopExtra,
          paddingHorizontal: layout.padH,
          paddingBottom: Math.max(insets.bottom, layout.padBottom),
        },
        enter,
      ]}
    >
      <RNStatusBar barStyle="dark-content" animated />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Wordmark onHome={onHome} />
        {onOpenSaved ? (
          <Pressable
            onPress={onOpenSaved}
            accessibilityRole="button"
            accessibilityLabel={`보관함, ${savedCount}개`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[text.meta, { textDecorationLine: 'underline' }]} allowFontScaling={false}>
              보관함 · {savedCount}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1, marginHorizontal: -layout.sheetBleed }}
        contentContainerStyle={{
          paddingTop: 18,
          paddingHorizontal: layout.sheetBleed,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={[monoLabel, { fontSize: 10, letterSpacing: tracking(10, 0.14), color: color.magenta }]}
          allowFontScaling={false}
        >
          AURADIN PICKS
        </Text>
        <Text style={[text.title, { marginTop: 8 }]} accessibilityRole="header">
          이 컬러, 어때요?
        </Text>
        <Text style={{ fontFamily: font.sans, fontSize: 12.5, color: color.inkSoft, marginTop: 2 }}>
          {subtitle ?? '조건에 가까운 제품'}
        </Text>

        {/* 적용 조건 칩 — 하드 조건(prompt/question/refine) + 리포트 톤 참고(report). §9: report는 "참고". */}
        {chips.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {chips.map((chip, index) => (
              <Badge key={`${chip.label}-${index}`} tone="ink">
                {chip.source === 'report' ? `◦ ${chip.label}` : chip.label}
              </Badge>
            ))}
          </View>
        ) : null}

        {top ? (
          // iridescent mount 2 of 2 app-wide (the other: searching QUERY echo) —
          // the hero pick is this screen's one emphasis; alt rows stay plain glass.
          <GlassCard
            radius={22}
            glare
            iridescent
            onPress={() => onOpen(top)}
            accessibilityLabel={`${top.brandName} ${top.productName} ${top.shadeName}`}
            style={{ marginTop: 16 }}
          >
            <ProductThumb
              imageUrl={top.imageUrl}
              palette={top.palette}
              width="100%"
              height={170}
              radius={16}
              alt={top.productName}
            />
            <Text
              style={[
                monoLabel,
                { fontSize: 10, letterSpacing: tracking(10, 0.14), color: color.inkSoft, marginTop: 12 },
              ]}
              allowFontScaling={false}
              numberOfLines={1}
            >
              {top.brandName}
            </Text>
            <Text
              style={{ fontFamily: font.sansBold, fontSize: 15.5, color: color.ink, marginTop: 3 }}
              numberOfLines={1}
            >
              {top.productName} · {top.shadeName}
            </Text>
            <Text
              style={{ fontFamily: font.mono, fontSize: 12, color: color.ink, marginTop: 4 }}
              allowFontScaling={false}
            >
              {top.priceText}
            </Text>
            {/* 왜 맞는지 */}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: 'rgba(255,255,255,0.55)',
                marginTop: 12,
                paddingTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <PaletteDot c={top.palette[0]} />
              <Text
                style={{ fontFamily: font.sans, fontSize: 12, color: color.inkSoft, flex: 1 }}
                numberOfLines={2}
              >
                {top.matchSummary}
              </Text>
            </View>
          </GlassCard>
        ) : (
          <Text
            style={{
              textAlign: 'center',
              paddingVertical: 40,
              fontFamily: font.sans,
              fontSize: 13,
              color: color.inkSoft,
            }}
          >
            조건에 맞는 제품을 찾지 못했어요.
          </Text>
        )}

        {/* '비슷한 후보'는 대안이 있을 때만 — 빈 슬롯은 라이브 NAVER로 채워지므로 보통 존재하고,
            그래도 비면 제목을 숨겨 '고장'처럼 읽히지 않게 한다. */}
        {alts.length > 0 ? (
          <>
            <Text
              style={[
                monoLabel,
                {
                  fontSize: 9.5,
                  letterSpacing: tracking(9.5, 0.16),
                  color: color.inkFaint,
                  marginTop: 20,
                  marginBottom: 10,
                },
              ]}
              allowFontScaling={false}
            >
              비슷한 후보
            </Text>
            <View style={{ gap: 10 }}>
              {alts.map((p) => (
                <GlassCard
                  key={p.id}
                  onPress={() => onOpen(p)}
                  accessibilityLabel={`${p.brandName} ${p.productName} ${p.shadeName}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <ProductThumb
                      imageUrl={p.imageUrl}
                      palette={p.palette}
                      width={layout.thumbSize}
                      height={layout.thumbSize}
                      radius={16}
                      alt={p.productName}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1}>
                        <Text
                          style={[
                            monoLabel,
                            { fontSize: 9.5, letterSpacing: tracking(9.5, 0.14), color: color.inkSoft },
                          ]}
                          allowFontScaling={false}
                        >
                          {p.brandName}
                        </Text>
                        <Text style={{ fontFamily: font.sansSemiBold, fontSize: 13, color: color.ink }}>
                          {'  '}
                          {p.productName} · {p.shadeName}
                        </Text>
                      </Text>
                      <Text
                        style={{ fontFamily: font.sans, fontSize: 11.5, color: color.inkSoft, marginTop: 4 }}
                        numberOfLines={1}
                      >
                        <Text style={{ fontFamily: font.mono }} allowFontScaling={false}>
                          {p.priceText}
                        </Text>
                        {' · '}
                        {p.matchSummary}
                      </Text>
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          </>
        ) : null}

        {/* refine dials */}
        {candidates.length > 0 ? (
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            {refining ? (
              <LoaderDots tone="ink" label="딱 맞게 다시 고르는 중" />
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="더 비슷하게" onPress={() => onRefine('more_similar')} />
                <Chip label="더 다양하게" onPress={() => onRefine('more_diverse')} />
              </View>
            )}
          </View>
        ) : null}

        <Pressable
          onPress={onHome}
          accessibilityRole="button"
          accessibilityLabel="처음부터 다시"
          style={{ alignSelf: 'center', marginTop: 22, marginBottom: 8 }}
          hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
        >
          <Text
            style={{
              fontFamily: font.sans,
              fontSize: 13,
              color: color.inkSoft,
              textDecorationLine: 'underline',
            }}
            allowFontScaling={false}
          >
            처음부터 다시
          </Text>
        </Pressable>
      </ScrollView>
    </Animated.View>
  );
}
