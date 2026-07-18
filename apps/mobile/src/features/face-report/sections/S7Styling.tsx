import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { LookCardData, S7Data } from '../reportTypes';
import { EvidenceBadge } from '../visuals/Badge';
import { Card } from '../visuals/Card';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

function LookCard({ card }: { card: LookCardData }) {
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
          <Text style={[font(12.5, '400', 1.55), { color: color.muted }]}>{card.sub}</Text>
        </View>
        {card.rows.map((r, i) => (
          <View key={r.category} style={{
            flexDirection: 'row', gap: 11, paddingTop: 12,
            paddingBottom: i === card.rows.length - 1 ? 2 : 12,
            borderTopWidth: 1, borderTopColor: color.divider,
          }}>
            <Text style={[font(12, '800'), { color: color.ink, width: 52, paddingTop: 2 }]}>{r.category}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <Text style={[font(13, '700'), { color: color.body }]}>{r.title}</Text>
                <EvidenceBadge kind={r.evidence} label={r.evidenceLabel} />
              </View>
              <Text style={[font(12, '400', 1.55), { color: color.muted }]}>{r.why}</Text>
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
      <SectionHeader eyebrow={data.eyebrow} title={data.title} subParts={data.noteParts} />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
        <Text style={[font(12, '800'), { color: color.accentInk }]}>{data.naturalLabel}</Text>
        <Text style={[font(12, '400'), { color: color.muted }]}>·</Text>
        <Text style={[font(12, '800'), { color: color.ink }]}>{data.glamLabel}</Text>
        <Text style={[font(11.5, '400'), { color: color.muted, flex: 1, textAlign: 'right' }]}>두 스타일 제안</Text>
      </View>
      <LookCard card={data.naturalCard} />
      <LookCard card={data.glamCard} />
    </RiseIn>
  );
}
