// AURADIN — Saved library (보관함): 2-column paged grid of hearted products,
// page-swipe + page-indicator dots (active = magenta, the screen's one accent).
// Hearts are always-filled static badges here (display-only).
// Recreated from prompts/5-saved.md.
//
// Port notes (from the spec):
// · Real pageSize = 10; this mock pages by 4 (2×2) — the density the source
//   UI kit uses at 393×852. Change PER_PAGE when wiring real pagination.
// · The legacy LikedProductListScreen ignored header title/onBack props
//   (_props) — here they are real: wire them into AppHeader when porting.
import * as React from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, layout, radius, tracking } from '../../theme/auradinTokens';
import type { AuradinCandidateProduct } from '../../types';
import {
  GlassCard,
  HeartButton,
  ProductThumb,
  useEnterTransition,
  Wordmark,
} from '../../components/ds';

export type SavedViewProps = {
  products: AuradinCandidateProduct[];
  onOpen: (product: AuradinCandidateProduct) => void;
  onBack: () => void;
  onHome: () => void;
};

const PER_PAGE = 4; // 2-col × 2 rows at baseline density (real pageSize = 10)

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function SavedView({ products, onOpen, onBack, onHome }: SavedViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const enter = useEnterTransition(12);
  const [page, setPage] = React.useState(0);
  const [pageW, setPageW] = React.useState(W - layout.padH * 2);

  const pages = chunk(products, PER_PAGE);
  const empty = products.length === 0;
  const cardW = (pageW - 12) / 2;

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageW <= 0) return;
    setPage(Math.round(e.nativeEvent.contentOffset.x / pageW));
  };

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
      {/* header — title + back are REAL here (wire into AppHeader when porting) */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
          style={{ width: 60 }}
        >
          <Text
            style={{ fontFamily: font.mono, fontSize: 14, color: color.inkSoft }}
            allowFontScaling={false}
          >
            ←
          </Text>
        </Pressable>
        <Text
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: font.sansBold,
            fontSize: 15,
            color: color.ink,
          }}
          accessibilityRole="header"
          allowFontScaling={false}
        >
          보관함
        </Text>
        <View style={{ width: 60, alignItems: 'flex-end' }}>
          <Wordmark onHome={onHome} size={10} />
        </View>
      </View>

      {empty ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          {/* the small residual orb floats above this text (host-mounted) */}
          <Text style={{ fontFamily: font.sans, fontSize: 13, color: color.inkSoft }}>
            아직 보관한 제품이 없어요
          </Text>
          <Pressable
            onPress={onHome}
            accessibilityRole="button"
            accessibilityLabel="검색하러 가기"
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
              검색하러 가기
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View
            style={{ flex: 1, marginTop: 16 }}
            onLayout={(e) => setPageW(e.nativeEvent.layout.width)}
          >
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onMomentumEnd}
              accessibilityLabel="보관한 제품 목록"
            >
              {pages.map((items, pi) => (
                <View
                  key={pi}
                  style={{
                    width: pageW,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignContent: 'flex-start',
                  }}
                >
                  {items.map((p) => (
                    <GlassCard
                      key={p.id}
                      padding={10}
                      onPress={() => onOpen(p)}
                      accessibilityLabel={`${p.brandName} ${p.productName}`}
                      style={{ width: cardW }}
                    >
                      <View>
                        <ProductThumb
                          imageUrl={p.imageUrl}
                          palette={p.palette}
                          width="100%"
                          height={110}
                          radius={radius.md}
                          contain
                          alt={p.productName}
                        />
                        {/* display-only heart badge — always filled here */}
                        <HeartButton
                          staticBadge
                          size={16}
                          style={{ position: 'absolute', top: 6, right: 6 }}
                        />
                      </View>
                      <Text
                        style={{
                          fontFamily: font.mono,
                          fontSize: 9,
                          letterSpacing: tracking(9, 0.12),
                          textTransform: 'uppercase',
                          color: color.inkSoft,
                          marginTop: 8,
                        }}
                        numberOfLines={1}
                        allowFontScaling={false}
                      >
                        {p.brandName}
                      </Text>
                      <Text
                        style={{
                          fontFamily: font.sansSemiBold,
                          fontSize: 12.5,
                          lineHeight: 17.5,
                          color: color.ink,
                          marginTop: 2,
                          minHeight: 35,
                        }}
                        numberOfLines={2}
                      >
                        {p.productName}
                      </Text>
                      <Text
                        style={{ fontFamily: font.mono, fontSize: 11, color: color.ink, marginTop: 4 }}
                        allowFontScaling={false}
                      >
                        {p.priceText}
                      </Text>
                    </GlassCard>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
          {/* page indicator — active dot is the screen's one magenta accent */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingTop: 14,
              paddingBottom: 6,
            }}
            accessibilityRole="tablist"
            accessibilityLabel="페이지"
          >
            {pages.map((_, i) => (
              <View
                key={i}
                accessibilityLabel={`${i + 1}페이지${i === page ? ', 현재' : ''}`}
                style={{
                  width: i === page ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === page ? color.magenta : color.inkFaint,
                }}
              />
            ))}
          </View>
        </>
      )}
    </Animated.View>
  );
}
