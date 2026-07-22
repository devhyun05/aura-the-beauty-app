import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { LookCardData, S7Data } from '../reportTypes';
import { Card } from '../visuals/Card';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

/** One complete styling look for a single story page or a long-form capture. */
export function S7LookCard({ card }: { card: LookCardData }) {
  const natural = card.variant === 'natural';
  return (
    <RiseIn>
      <Card gap={0}>
        <View style={{ gap: 5, paddingBottom: 13 }}>
          <View style={{
            alignSelf: 'flex-start', backgroundColor: natural ? color.accentTint : color.ink,
            borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12,
          }}>
            <Text style={[font(11.5, '800'), { color: natural ? color.accentInk : color.white }]}>{card.chip}</Text>
          </View>
          <Text style={[font(14, '700'), { color: color.ink, marginTop: 3 }]}>{card.title}</Text>
        </View>
        {card.rows.map((r, i) => (
          <View key={r.category} style={{
            flexDirection: 'row', gap: 11, paddingTop: 12,
            paddingBottom: i === card.rows.length - 1 ? 2 : 12,
            borderTopWidth: 1, borderTopColor: color.divider,
          }}>
            <Text style={[font(12, '800'), { color: color.ink, width: 52, paddingTop: 2 }]}>{r.category}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[font(13, '400', 1.55), { color: color.body }]}>{r.title}</Text>
              {r.why.trim() ? (
                <Text style={[font(12, '400', 1.55), { color: color.muted }]}>{r.why}</Text>
              ) : null}
            </View>
          </View>
        ))}
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
