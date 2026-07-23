import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { LookCardData, S7Data } from '../reportTypes';
import { Card } from '../visuals/Card';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

/** One complete styling look for a single story page or a long-form capture. */
export function S7LookCard({
  card,
  showHeader = true,
}: {
  card: LookCardData;
  showHeader?: boolean;
}) {
  const natural = card.variant === 'natural';
  return (
    <RiseIn>
      <Card gap={0}>
        {showHeader ? (
          <View style={{ gap: 5, paddingBottom: 13 }}>
            <View style={{
              alignSelf: 'flex-start', backgroundColor: natural ? color.accentTint : color.ink,
              borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12,
            }}>
              <Text style={[font(11.5, '800'), { color: natural ? color.accentInk : color.white }]}>{card.chip}</Text>
            </View>
            <Text style={[font(14, '700'), { color: color.ink, marginTop: 3 }]}>{card.title}</Text>
          </View>
        ) : null}
        {card.rows.map((r, i) => {
          const reason = r.why
            .trim()
            .replace(/^왜 나에게\s*[—–-]\s*/, '')
            .replace(/^아티스트들은\s*/, '');
          return (
            <View key={r.category} style={{
              flexDirection: 'row', gap: 11, paddingTop: 13,
              paddingBottom: i === card.rows.length - 1 ? 2 : 13,
              borderTopWidth: i === 0 && !showHeader ? 0 : 1,
              borderTopColor: color.divider,
            }}>
              <Text style={[font(12.5, '800'), { color: color.ink, width: 52, paddingTop: 2 }]}>{r.category}</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[font(13.5, '500', 1.55), { color: color.body }]}>{r.title}</Text>
                {reason ? (
                  <View style={{ gap: 2 }}>
                    <Text style={[font(11.5, '800'), { color: color.accentInk }]}>
                      {r.evidenceLabel}
                    </Text>
                    <Text style={[font(12.5, '400', 1.6), { color: color.text }]}>
                      {reason}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>
    </RiseIn>
  );
}

/** S7 스타일링 — 내추럴/글램 두 룩을 항상 완전 불투명으로 나란히(세로 스택) 표시. */
export function S7Styling({ data }: { data: S7Data }) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} />
      <S7LookCard card={data.naturalCard} />
      <S7LookCard card={data.glamCard} />
    </RiseIn>
  );
}
