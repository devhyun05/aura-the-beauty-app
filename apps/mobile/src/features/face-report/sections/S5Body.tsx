import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { color, font, radius, shadow } from '../reportTokens';
import type { S5Data } from '../reportTypes';
import { BodySilhouette } from '../visuals/BodySilhouette';
import { Card } from '../visuals/Card';
import { Hatch } from '../visuals/Hatch';
import { RiseIn } from '../visuals/RiseIn';
import { SectionHeader } from '../visuals/SectionHeader';

function DotItem({ text, avoid }: { text: string; avoid?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
      <View style={{
        width: 8, height: 8, borderRadius: 4, marginTop: 5,
        backgroundColor: avoid ? 'transparent' : color.accent,
        borderWidth: avoid ? 2 : 0, borderColor: avoid ? color.dotOutline : undefined,
      }} />
      <Text style={[font(13, '400', 1.55), { color: avoid ? color.muted : color.body, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/** S5 체형 분석 — survey-based silhouette/skeleton result + do/avoid styling lists. */
export function S5Body({ data, onResurvey }: { data: S5Data; onResurvey?: () => void }) {
  const hasSurvey = Boolean(data.silhouetteKind);

  return (
    <RiseIn style={{ paddingTop: 30, paddingHorizontal: 20, gap: 12 }}>
      <SectionHeader eyebrow={data.eyebrow} title={data.title} sub={data.sub} />
      <RiseIn>
        <Card gap={14}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {data.silhouetteKind ? (
              // 설문 답변이 있으면 타입별 실루엣 다이어그램(개인 몸이 아닌 타입 그림).
              <View style={{ width: 96, height: 128, alignItems: 'center', justifyContent: 'center' }}>
                <BodySilhouette kind={data.silhouetteKind} gender={data.styleGender ?? 'neutral'} />
              </View>
            ) : (
              // 미답변(설문 전) 빈 상태 — 기존 빗금 플레이스홀더 유지.
              <View style={{
                width: 96, height: 128, borderRadius: radius.md, overflow: 'hidden',
                alignItems: 'center', justifyContent: 'center', padding: 8,
              }}>
                <Hatch colorA={color.hatchC} colorB={color.bg} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                <Text style={[font(9.5, '400', 1.5), { color: color.faint, textAlign: 'center' }]}>{data.silhouettePlaceholder}</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 9 }}>
              <View style={{ gap: 2 }}>
                <Text style={[font(10.5, '600'), { color: color.muted }]}>{data.silhouetteLabel}</Text>
                <Text style={[font(16, '800'), { color: color.ink }]}>{data.silhouetteValue}</Text>
              </View>
              <View style={{ gap: 2 }}>
                <Text style={[font(10.5, '600'), { color: color.muted }]}>{data.skeletonLabel}</Text>
                <Text style={[font(16, '800'), { color: color.ink }]}>{data.skeletonValue}</Text>
              </View>
              <View style={{ gap: 8, alignItems: 'flex-start' }}>
                <Text style={[font(11, '400'), { color: color.muted }]}>
                  {data.surveyNote}
                  {hasSurvey ? ' · ' : ''}
                  {hasSurvey ? (
                    <Text onPress={onResurvey} suppressHighlighting style={[font(11, '700'), { color: color.accentDeep }]}>
                      {data.surveyLink}
                    </Text>
                  ) : null}
                </Text>
                {!hasSurvey ? (
                  <Pressable
                    accessibilityLabel={data.surveyLink}
                    accessibilityRole="button"
                    onPress={onResurvey}
                    style={({ pressed }) => [{
                      backgroundColor: color.accent,
                      borderRadius: radius.pill,
                      paddingHorizontal: 15,
                      paddingVertical: 9,
                      opacity: pressed ? 0.82 : 1,
                    }, shadow.cta]}>
                    <Text style={[font(12, '800'), { color: color.white }]}>{data.surveyLink}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
          <View style={{ gap: 9, borderTopWidth: 1, borderTopColor: color.divider, paddingTop: 13 }}>
            <Text style={[font(12.5, '800'), { color: color.ink }]}>{data.doTitle}</Text>
            {data.doItems.map((t, i) => <DotItem key={i} text={t} />)}
            <Text style={[font(12.5, '800'), { color: color.ink, marginTop: 4 }]}>{data.avoidTitle}</Text>
            {data.avoidItems.map((t, i) => <DotItem key={i} text={t} avoid />)}
          </View>
        </Card>
      </RiseIn>
    </RiseIn>
  );
}
