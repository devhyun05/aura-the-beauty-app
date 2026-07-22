import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { S9Data, StyleLaneCard } from '../reportTypes';
import { Card } from '../visuals/Card';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

const CHIP_TINT: Record<StyleLaneCard['laneKey'], { bg: string; fg: string }> = {
  balance: { bg: color.accentTint, fg: color.accentInk },
  youthful: { bg: color.dial, fg: color.body },
  accent: { bg: color.ink, fg: color.white },
};

function LaneCard({ card }: { card: StyleLaneCard }) {
  const tint = CHIP_TINT[card.laneKey];
  return (
    <Card gap={0}>
      <View style={{ gap: 6, paddingBottom: 13 }}>
        <View style={{
          alignSelf: 'flex-start', backgroundColor: tint.bg,
          borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 11,
        }}>
          <Text style={[font(11.5, '800'), { color: tint.fg }]}>{card.chip}</Text>
        </View>
        <Text style={[font(14.5, '700'), { color: color.ink, marginTop: 3 }]}>{card.title}</Text>
        <Text style={[font(12.5, '400', 1.6), { color: color.body }]}>{card.description}</Text>
      </View>
      {card.moves.map((m, i) => (
        <View key={`${m.region}-${i}`} style={{
          flexDirection: 'row', gap: 11, paddingTop: 12,
          paddingBottom: i === card.moves.length - 1 ? 2 : 12,
          borderTopWidth: 1, borderTopColor: color.divider,
        }}>
          <Text style={[font(12, '800'), { color: color.ink, width: 44, paddingTop: 1 }]}>{m.region}</Text>
          <Text style={[font(13, '400', 1.55), { color: color.body, flex: 1 }]}>{m.note}</Text>
        </View>
      ))}
    </Card>
  );
}

/** S9 3 스타일 레인 추천 — 균형·동안·개성 강조 세 카드를 세로로. */
export function S9StyleLanes({ data }: { data: S9Data }) {
  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      {data.lanes.map(lane => (
        <RiseIn key={lane.laneKey}>
          <LaneCard card={lane} />
        </RiseIn>
      ))}
    </RiseIn>
  );
}
