import React from 'react';
import { Text, View } from 'react-native';
import { color, font, radius } from '../reportTokens';
import type { S1Data } from '../reportTypes';
import { LegacyBadge } from '../visuals/Badge';
import { PhotoSlot } from '../visuals/PhotoSlot';
import { RiseIn } from '../visuals/RiseIn';
import { SummaryCard } from '../visuals/SummaryCard';

/** S1 분석 요약 — ringed selfie, date/round line, headline, body, optional legacy badge, 2×2 cards. */
export function S1Summary({ data }: { data: S1Data }) {
  return (
    <RiseIn style={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 6, alignItems: 'center', gap: 12 }}>
      <View style={{ padding: 4, borderWidth: 2, borderColor: color.accentLight, borderRadius: radius.pill }}>
        <PhotoSlot slot={data.photo} shape="circle" style={{ width: 110, height: 110 }} />
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={[font(11.5, '600', undefined, 0.23), { color: color.muted }]}>{data.dateLine}</Text>
        <Text style={[font(21, '800', undefined, -0.21), { color: color.ink, textAlign: 'center' }]}>{data.headline}</Text>
        {data.body ? (
          <Text style={[font(13.5, '400', 1.65), { color: color.text, textAlign: 'center', maxWidth: 300 }]}>
            {data.body}
          </Text>
        ) : null}
      </View>
      {data.legacyReport && <LegacyBadge label={data.legacyBadge} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'stretch' }}>
        {data.cards.map(c => (
          <SummaryCard key={c.label} label={c.label} value={c.value} style={{ flexBasis: '48.6%', flexGrow: 0 }} />
        ))}
      </View>
    </RiseIn>
  );
}
