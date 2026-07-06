// AURADIN — Home (entry). Serif hero + orb zone + bottom glass sheet
// (composer + suggestion chips + terminal meta). Recreated from the
// AppScreen entry-v3 redesign: clean-gradient ground (no photo), milk-glass
// sheet/composer, UNIFORM chips (the violet `hl` tint was retired — no
// iridescent rims on home; the send gem is the screen's one emphasis).
import * as React from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar as RNStatusBar,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, layout, text, tracking } from '../../theme/auradinTokens';
import {
  Chip,
  Composer,
  GlassSheet,
  StatusBarRow,
  useEnterTransition,
} from '../../components/ds';
import {
  attachmentChipLabel,
  attachmentGlyph,
  FILTER_PRESETS,
  type AuradinAttachment,
} from '../../attachments';

export type HomeViewProps = {
  query: string;
  setQuery: (v: string) => void;
  onSubmit: () => void;
  onPickSuggestion: (label: string) => void;
  savedCount: number;
  onOpenSaved?: () => void;
  // Change C: 확장형 첨부 트레이 (리포트·필터, 향후 자료).
  attachments: AuradinAttachment[];
  availableReport?: {id?: string; personalColor: string} | null;
  onAddAttachment: (attachment: AuradinAttachment) => void;
  onRemoveAttachment: (index: number) => void;
};

/** Suggestion chips — Korean conversational fragments (brand copy, fixed). */
const SUGGESTIONS = ['쿨톤 글로시 립', '면접용 블러셔', '올리브영에서만'] as const;

export function HomeView({
  query,
  setQuery,
  onSubmit,
  onPickSuggestion,
  savedCount,
  onOpenSaved,
  attachments,
  availableReport,
  onAddAttachment,
  onRemoveAttachment,
}: HomeViewProps): React.JSX.Element {
  // 첨부 메뉴: null(닫힘) | 'root'(리포트/필터/사진) | 'filter'(프리셋).
  const [menu, setMenu] = React.useState<null | 'root' | 'filter'>(null);
  const [reportHint, setReportHint] = React.useState(false);
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const enter = useEnterTransition(12);
  const heroSize = W < 360 ? 46 : 53; // small-screen tolerance

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
        <StatusBarRow />
        {onOpenSaved ? (
          <Pressable
            onPress={onOpenSaved}
            accessibilityRole="button"
            accessibilityLabel={`보관함, ${savedCount}개`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ alignSelf: 'flex-end', marginTop: 10 }}
          >
            <Text style={[text.meta, { textDecorationLine: 'underline' }]} allowFontScaling={false}>
              보관함 · {savedCount}
            </Text>
          </Pressable>
        ) : null}

        <Text
          style={[
            text.hero,
            {
              marginTop: onOpenSaved ? 12 : 30,
              fontSize: heroSize,
              lineHeight: Math.round(heroSize * 1.08),
              letterSpacing: tracking(heroSize, -0.035),
            },
          ]}
          accessibilityRole="header"
        >
          Find your{'\n'}own Cosmetic.
        </Text>
        <Text style={[text.heroSub, { marginTop: 14 }]}>
          색·질감·예산 — 편하게 말하면 아우라딘이 찾아드려요.
        </Text>

        {/* orb zone — the PersistentOrb (mounted by the host) floats here on home.
            Tapping the open ground dismisses the keyboard. */}
        <Pressable style={{ flex: 1, minHeight: 180 }} onPress={Keyboard.dismiss} accessible={false} />

        <GlassSheet iridescent style={{ marginHorizontal: -layout.sheetBleed }}>
          <Composer value={query} onChangeText={setQuery} onSend={onSubmit} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {SUGGESTIONS.map((label) => (
              <Chip
                key={label}
                label={label}
                on={query === label}
                onPress={() => onPickSuggestion(label)}
              />
            ))}
          </View>
          {/* attach menu — root(리포트/필터/사진) or filter presets */}
          {menu === 'root' ? (
            <View style={styles.menuPanel}>
              <MenuRow
                label="분석 리포트"
                disabled={!availableReport}
                onPress={() => {
                  if (!availableReport) {
                    setReportHint(true);
                    return;
                  }
                  onAddAttachment({
                    kind: 'report',
                    id: availableReport.id,
                    personalColor: availableReport.personalColor,
                  });
                  setMenu(null);
                  setReportHint(false);
                }}
              />
              <MenuRow label="필터" onPress={() => setMenu('filter')} />
              <MenuRow label="사진  (준비중)" disabled onPress={() => {}} />
              {reportHint && !availableReport ? (
                <Text style={[text.metaSm, { color: color.inkFaint, marginTop: 4 }]} allowFontScaling={false}>
                  먼저 얼굴 분석을 해주세요
                </Text>
              ) : null}
            </View>
          ) : null}
          {menu === 'filter' ? (
            <View style={styles.menuPanel}>
              {FILTER_PRESETS.map((group) => (
                <View key={group.group} style={{ marginBottom: 8 }}>
                  <Text style={[text.metaSm, { color: color.inkFaint, marginBottom: 4 }]} allowFontScaling={false}>
                    {group.group}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {group.items.map((item) => (
                      <Pressable
                        key={item.label}
                        onPress={() => {
                          onAddAttachment(item);
                          setMenu(null);
                        }}
                        style={styles.presetChip}
                      >
                        <Text style={[text.chip, { fontSize: 12 }]} allowFontScaling={false}>
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* sheet meta — 첨부 트레이(좌) + 세션(우) */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginTop: 12,
              gap: 8,
            }}
          >
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Pressable
                onPress={() => setMenu(menu ? null : 'root')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="자료 첨부"
                style={styles.attachPill}
              >
                <Text style={[text.metaSm, { color: color.inkSoft }]} allowFontScaling={false}>
                  ＋
                </Text>
                {attachments.length === 0 ? (
                  <Text style={[text.metaSm, { color: color.inkSoft }]} allowFontScaling={false}>
                    자료 첨부
                  </Text>
                ) : null}
              </Pressable>
              {attachments.map((attachment, index) => (
                <Pressable
                  key={`${attachment.kind}-${index}`}
                  onPress={() => onRemoveAttachment(index)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${attachmentChipLabel(attachment)} 첨부 제거`}
                  style={styles.attachChip}
                >
                  <Text style={[text.metaSm, { color: color.ink }]} allowFontScaling={false}>
                    {attachmentGlyph(attachment)} {attachmentChipLabel(attachment)}
                  </Text>
                  <Text style={[text.metaSm, { color: color.inkFaint }]} allowFontScaling={false}>
                    ✕
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={text.metaSm} allowFontScaling={false}>
              SESSION 001 · KR
            </Text>
          </View>
        </GlassSheet>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function MenuRow({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [styles.menuRow, pressed && !disabled && { opacity: 0.6 }]}
    >
      <Text
        style={[text.body, { fontSize: 13.5, color: disabled ? color.inkFaint : color.ink }]}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 첨부 어피던스: 얇은 유리 하프라인 보더 pill — "버튼"으로 읽히게 (장식 텍스트 아님).
  attachPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,58,82,0.3)',
  },
  // 첨부된 자료 칩 — 옅은 마젠타 보더(강조는 send gem 하나 유지).
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(224,72,156,0.45)',
    backgroundColor: 'rgba(224,72,156,0.06)',
  },
  menuPanel: {
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,58,82,0.16)',
    backgroundColor: 'rgba(255,255,255,0.4)',
    gap: 2,
  },
  menuRow: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  presetChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,58,82,0.22)',
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});
