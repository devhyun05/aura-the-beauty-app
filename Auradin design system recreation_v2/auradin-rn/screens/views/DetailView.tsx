// AURADIN — Product detail: WHY it fits, in full. Stage image, MATCH/role/source
// badges, reasonCopy, the three evidence buckets (matchedOn / inferred / caveat),
// palette, tags, Buy CTA (the screen's one magenta emphasis) + heart save.
// Recreated from prompts/4-detail.md.
import * as React from 'react';
import {
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StatusBar as RNStatusBar,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font, layout, radius, text, tracking } from '../../theme/auradinTokens';
import type { AuradinCandidateProduct } from '../../types';
import {
  Badge,
  CTAButton,
  GlassBase,
  GlassCard,
  HeartButton,
  PaletteSwatches,
  ProductThumb,
  Toast,
  useEnterTransition,
  Wordmark,
} from '../../components/ds';

export type DetailViewProps = {
  product: AuradinCandidateProduct;
  liked: boolean;
  onToggleSave: () => void;
  onBack: () => void;
  onHome: () => void;
};

/** Evidence bucket rows: leading mark on the first line, hanging indent after. */
function EvidenceRows({
  lines,
  mark,
  textColor,
}: {
  lines: string[];
  mark?: React.ReactNode;
  textColor: string;
}): React.JSX.Element {
  return (
    <View style={{ gap: 6 }}>
      {lines.map((line, i) => (
        <View
          key={`${i}-${line.slice(0, 8)}`}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}
        >
          {i === 0 && mark ? mark : mark ? <View style={{ width: 12 }} /> : null}
          <Text
            style={{
              flex: 1,
              fontFamily: font.sans,
              fontSize: 12.5,
              lineHeight: 19,
              color: textColor,
            }}
          >
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DetailView({
  product: p,
  liked,
  onToggleSave,
  onBack,
  onHome,
}: DetailViewProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const enter = useEnterTransition(16);

  // "보관함에 담김" toast on the save rising edge
  const [toast, setToast] = React.useState(false);
  const prevLiked = React.useRef(liked);
  React.useEffect(() => {
    if (liked && !prevLiked.current) {
      setToast(true);
      const t = setTimeout(() => setToast(false), 1600);
      return () => clearTimeout(t);
    }
    prevLiked.current = liked;
    return undefined;
  }, [liked]);
  React.useEffect(() => {
    prevLiked.current = liked;
  });

  const r = p.reason;
  const openBuy = () => {
    if (p.purchaseUrl) Linking.openURL(p.purchaseUrl).catch(() => {});
  };

  return (
    <View style={{ flex: 1 }}>
      <RNStatusBar barStyle="dark-content" animated />
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
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="결과로 돌아가기"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
          >
            <Text
              style={{
                fontFamily: font.mono,
                fontSize: 11,
                letterSpacing: tracking(11, 0.1),
                color: color.inkSoft,
              }}
              allowFontScaling={false}
            >
              ← 결과
            </Text>
          </Pressable>
          <Wordmark onHome={onHome} />
        </View>

        <ScrollView
          style={{ flex: 1, marginHorizontal: -layout.sheetBleed }}
          contentContainerStyle={{
            paddingTop: 16,
            paddingHorizontal: layout.sheetBleed,
            paddingBottom: 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <GlassCard radius={22} glare padding={10}>
            <ProductThumb
              imageUrl={p.imageUrl}
              palette={p.palette}
              width="100%"
              height={200}
              radius={16}
              alt={p.productName}
            />
          </GlassCard>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {p.matchRate !== undefined ? <Badge tone="ink">{`MATCH ${p.matchRate}%`}</Badge> : null}
            {p.role ? <Badge>{p.role}</Badge> : null}
            {p.source ? <Badge>{p.source}</Badge> : null}
          </View>

          <Text
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              letterSpacing: tracking(10, 0.14),
              textTransform: 'uppercase',
              color: color.inkSoft,
              marginTop: 12,
            }}
            allowFontScaling={false}
          >
            {p.brandName}
          </Text>
          <Text style={[text.title, { marginTop: 4 }]} accessibilityRole="header">
            {p.productName}
          </Text>
          <Text style={{ fontFamily: font.sans, fontSize: 13, color: color.inkSoft, marginTop: 3 }}>
            {p.shadeName}
          </Text>
          <Text
            style={{ fontFamily: font.mono, fontSize: 14, color: color.ink, marginTop: 6 }}
            allowFontScaling={false}
          >
            {p.priceText}
          </Text>

          {p.reasonCopy ? (
            <Text
              style={{
                fontFamily: font.sans,
                fontSize: 13,
                lineHeight: 21,
                color: color.ink,
                marginTop: 14,
              }}
            >
              {p.reasonCopy}
            </Text>
          ) : null}

          {/* match evidence — three distinct buckets; empty buckets are omitted */}
          <View style={{ gap: 8, marginTop: 16 }}>
            {r && r.matchedOn.length > 0 ? (
              <GlassCard>
                <EvidenceRows
                  lines={r.matchedOn}
                  textColor={color.ink}
                  mark={
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        borderWidth: 1.6,
                        borderColor: '#FFFFFF',
                        backgroundColor: p.palette[0] ?? color.pink,
                        marginTop: 3,
                      }}
                    />
                  }
                />
              </GlassCard>
            ) : null}
            {r && r.inferred.length > 0 ? (
              <GlassCard>
                <EvidenceRows lines={r.inferred} textColor={color.inkSoft} />
              </GlassCard>
            ) : null}
            {r && r.caveat.length > 0 ? (
              <GlassCard>
                <EvidenceRows
                  lines={r.caveat}
                  textColor={color.inkSoft}
                  mark={
                    <Text
                      style={{
                        width: 12,
                        fontFamily: font.mono,
                        fontSize: 11,
                        color: color.inkFaint,
                      }}
                      allowFontScaling={false}
                    >
                      !
                    </Text>
                  }
                />
              </GlassCard>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 16,
            }}
          >
            {p.palette.length > 0 ? <PaletteSwatches colors={p.palette} /> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 }}>
              {p.tags.map((t) => (
                <Badge key={t} tone="ink">
                  {t}
                </Badge>
              ))}
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 18,
              paddingBottom: 8,
            }}
          >
            {p.purchaseUrl ? (
              <CTAButton label="구매하러 가기 ↗" onPress={openBuy} style={{ flex: 1 }} />
            ) : (
              <CTAButton label="구매 링크 준비 중" disabled style={{ flex: 1 }} />
            )}
            <GlassBase tier="chip" radius={radius.pill}>
              <HeartButton liked={liked} onToggle={onToggleSave} style={{ margin: 4 }} />
            </GlassBase>
          </View>
        </ScrollView>
      </Animated.View>
      <Toast show={toast} label="보관함에 담김" bottom={Math.max(insets.bottom, 18) + 10} />
    </View>
  );
}
