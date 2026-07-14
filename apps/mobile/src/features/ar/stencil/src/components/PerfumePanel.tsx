import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {
  CLIMATE_OPTIONS,
  DEFAULT_CONTEXT,
  HUMIDITY_OPTIONS,
  INTENSITY_OPTIONS,
  OCCASION_OPTIONS,
  recommend,
} from '../composer/perfume';
import type {PerfumeContext} from '../composer/perfume';
import {PROFILE_QUESTIONS, summarizeProfile} from '../composer/scentProfile';
import type {ProfileQuestion, ScentProfile} from '../composer/scentProfile';
import {loadScentProfile, saveScentProfile} from '../storage/scentProfileStore';

/**
 * 향수 추천 패널 (#7) — 환경(계절·습도)·상황·선호 강도를 칩으로 고르면 조건에 맞는
 * 계열·부향률·시간축 전개·지속/확산 예측을 즉시 보여준다. 순수 RN(Unity 무관).
 *
 * 체향(피부 유분 등)은 매번 칩으로 고르는 대신, 최초 1회 "체향 프로필 설문"(3문항)으로
 * 물어 영속 저장한다 — 사람마다 다르고 잘 안 변하는 개인 값이라 세션마다 다시 고르게 하는
 * 건 번거롭기 때문. 프로필이 있으면 추천은 그 프로필로 skin을 덮어(effectiveCtx) 계산하고,
 * profileFactors로 지속/확산까지 보정한다(recommend 내부). 날씨·습도·상황·강도는 그때그때
 * 바뀌는 조건이라 여전히 세션 로컬 칩으로 둔다.
 *
 * 마운트 시 프로필을 1회 로드하고, 로딩 완료 전엔 헤더만 렌더해 내용 플래시를 막는다.
 * 프로필 없음 → 설문 뷰(저장 후 추천 뷰), 있음 → 추천 뷰(요약 행+수정 진입).
 */

interface Props {
  onClose: () => void;
}

// 확산/지속 막대 색 — 유리 UI 위에서 라이너 톤(따뜻한 앰버)과 맞춘다.
const BAR_ON = '#FFD27F';

// 설문 답 — 질문 key별 선택 옵션 id(문자열). 세 칸이 다 차야 프로필로 저장한다.
type Answers = Partial<Record<ProfileQuestion['key'], string>>;

function ChipRow<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: {id: T; label: string}[];
  value: T;
  onSelect: (id: T) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map(o => {
          const on = o.id === value;
          return (
            <TouchableOpacity
              key={o.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onSelect(o.id)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// 설문 한 문항 — 질문을 라벨로, 옵션을 기존 칩 스타일로. 각 칩엔 결정론적 testID를 달아
// 테스트가 라벨 문안에 얽매이지 않게 한다(문안은 scentProfile.ts가 소유).
function QuestionRow({
  question,
  value,
  onSelect,
}: {
  question: ProfileQuestion;
  value?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{question.question}</Text>
      <View style={styles.chipRow}>
        {question.options.map(o => {
          const on = o.id === value;
          return (
            <TouchableOpacity
              key={o.id}
              testID={`scent-opt-${question.key}-${o.id}`}
              accessibilityState={{selected: on}}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => onSelect(o.id)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function Meter({label, value, text}: {label: string; value: number; text: string}) {
  return (
    <View style={styles.meterRow}>
      <Text style={styles.meterLabel}>{label}</Text>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, {width: `${Math.round(value * 100)}%`}]} />
      </View>
      <Text style={styles.meterValue}>{text}</Text>
    </View>
  );
}

export default function PerfumePanel({onClose}: Props) {
  // 날씨·습도·상황·강도는 세션 로컬(닫으면 기본값). skin은 프로필로 덮으므로 여기선 안 쓴다.
  const [ctx, setCtx] = useState<PerfumeContext>(DEFAULT_CONTEXT);
  const set = <K extends keyof PerfumeContext>(k: K, v: PerfumeContext[K]) =>
    setCtx(prev => ({...prev, [k]: v}));

  // 프로필: 마운트 후 1회 로드. loaded 전엔 헤더만 렌더(플래시 방지).
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<ScentProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});

  useEffect(() => {
    let alive = true;
    loadScentProfile()
      .then(p => {
        if (alive) setProfile(p);
      })
      .catch(() => {
        // 로드 실패는 스토어가 null로 흡수 — 방어적으로 한 번 더 삼킨다.
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 추천은 프로필로 skin을 덮은 effectiveCtx로 계산하고, 프로필 보정(profileFactors)까지
  // recommend 내부에 넘긴다. 설문 뷰에선 화면에 안 쓰이지만 훅 규칙상 항상 계산(무해).
  const rec = useMemo(() => {
    const effectiveCtx = profile ? {...ctx, skin: profile.skin} : ctx;
    return recommend(effectiveCtx, profile);
  }, [ctx, profile]);

  const allAnswered = PROFILE_QUESTIONS.every(q => answers[q.key] != null);
  // 프로필 없음이거나 수정 중이면 설문 뷰. (editing=true는 항상 기존 프로필이 있을 때만.)
  const showSurvey = !profile || editing;

  const selectAnswer = (key: ProfileQuestion['key'], id: string) =>
    setAnswers(prev => ({...prev, [key]: id}));

  const handleSave = () => {
    if (!allAnswered) return;
    const next: ScentProfile = {
      skin: answers.skin as ScentProfile['skin'],
      fade: answers.fade as ScentProfile['fade'],
      warmth: answers.warmth as ScentProfile['warmth'],
      // 수정 저장은 최초 생성 시각을 보존(createdAt 불변식). 신규만 지금 시각으로.
      createdAt: profile ? profile.createdAt : Date.now(),
    };
    // 낙관적 전환 — 즉시 추천 뷰로. 영속화는 best-effort(스토어가 실패를 흡수).
    setProfile(next);
    setEditing(false);
    void saveScentProfile(next).catch(() => {});
  };

  const startEdit = () => {
    if (profile) {
      setAnswers({
        skin: profile.skin,
        fade: profile.fade,
        warmth: profile.warmth,
      });
    }
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>향수 추천</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* 설문 뷰 — 프로필이 없거나 수정 중일 때 */}
      {loaded && showSurvey && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            체향은 사람마다 달라서, 세 가지만 물어볼게요 — 답은 저장되고 언제든 수정 가능해요.
          </Text>

          {PROFILE_QUESTIONS.map(q => (
            <QuestionRow
              key={q.key}
              question={q}
              value={answers[q.key]}
              onSelect={id => selectAnswer(q.key, id)}
            />
          ))}

          <View style={styles.actionRow}>
            {editing && (
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID="scent-save"
              disabled={!allAnswered}
              style={[styles.saveBtn, !allAnswered && styles.saveBtnOff]}
              onPress={handleSave}>
              <Text style={[styles.saveText, !allAnswered && styles.saveTextOff]}>
                저장
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* 추천 뷰 — 프로필이 있고 수정 중이 아닐 때 */}
      {loaded && !showSurvey && profile && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* 내 체향 요약 — 기존 '피부 유분' 칩 자리를 대신한다(개인 저장값) */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>내 체향</Text>
            <Text style={styles.summaryValue}>{summarizeProfile(profile)}</Text>
            <TouchableOpacity
              testID="scent-edit"
              style={styles.editBtn}
              onPress={startEdit}>
              <Text style={styles.editText}>수정</Text>
            </TouchableOpacity>
          </View>

          {/* 그때그때 바뀌는 조건 — 세션 로컬 칩 */}
          <ChipRow label="날씨" options={CLIMATE_OPTIONS} value={ctx.climate} onSelect={v => set('climate', v)} />
          <ChipRow label="습도" options={HUMIDITY_OPTIONS} value={ctx.humidity} onSelect={v => set('humidity', v)} />
          <ChipRow label="상황" options={OCCASION_OPTIONS} value={ctx.occasion} onSelect={v => set('occasion', v)} />
          <ChipRow label="강도" options={INTENSITY_OPTIONS} value={ctx.intensity} onSelect={v => set('intensity', v)} />

          <View style={styles.divider} />

          {/* 부향률 추천 */}
          <View style={styles.resultBlock}>
            <Text style={styles.blockTitle}>추천 부향률</Text>
            <Text style={styles.concLabel}>{rec.concentration.label}</Text>
            <Text style={styles.concReason}>{rec.concentration.reason}</Text>
          </View>

          {/* 예측 지표 */}
          <View style={styles.resultBlock}>
            <Meter
              label="지속"
              value={Math.min(1, rec.longevityHours / 12)}
              text={`약 ${rec.longevityHours}시간 · ${rec.longevityLabel}`}
            />
            <Meter label="확산" value={rec.projection} text={rec.projectionLabel} />
          </View>

          {/* 추천 계열 */}
          <View style={styles.resultBlock}>
            <Text style={styles.blockTitle}>어울리는 계열</Text>
            {rec.families.map((f, i) => (
              <View key={f.id} style={[styles.famRow, i === 0 && styles.famRowTop]}>
                <View style={styles.famHead}>
                  <Text style={[styles.famName, i === 0 && styles.famNameTop]}>
                    {i === 0 ? '★ ' : ''}
                    {f.label}
                  </Text>
                  <Text style={styles.famScore}>{Math.round(f.score * 100)}</Text>
                </View>
                <Text style={styles.famNotes}>{f.notes}</Text>
                <Text style={styles.famReason}>{f.reasons.join(' · ')}</Text>
              </View>
            ))}
          </View>

          {/* 시간축 전개 */}
          <View style={styles.resultBlock}>
            <Text style={styles.blockTitle}>시간축 전개 (예측)</Text>
            {rec.timeline.map(p => (
              <View key={p.key} style={styles.phaseRow}>
                <View style={styles.phaseHead}>
                  <Text style={styles.phaseName}>{p.label}</Text>
                  <Text style={styles.phaseWindow}>{p.window}</Text>
                </View>
                <View style={styles.meterTrack}>
                  <View style={[styles.meterFill, {width: `${Math.round(p.intensity * 100)}%`}]} />
                </View>
                <Text style={styles.phaseDesc}>{p.desc}</Text>
              </View>
            ))}
          </View>

          {/* 팁 */}
          <View style={styles.resultBlock}>
            <Text style={styles.blockTitle}>적용 팁</Text>
            {rec.tips.map((t, i) => (
              <Text key={i} style={styles.tip}>
                • {t}
              </Text>
            ))}
          </View>

          {/* 한계 고지 — 예측이 틀려도 UX가 깨지지 않게 정직하게 */}
          <Text style={styles.caveat}>{rec.caveat}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    gap: 8,
    maxHeight: 460,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {color: '#FFFFFF', fontSize: 14, fontWeight: '700'},
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  closeText: {color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', lineHeight: 14},
  scroll: {maxHeight: 400},
  scrollContent: {gap: 10, paddingBottom: 4},

  // 설문 안내 문구
  intro: {color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 16},

  field: {gap: 6},
  fieldLabel: {color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600'},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6},
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipOn: {backgroundColor: 'rgba(255,210,127,0.35)', borderColor: BAR_ON},
  chipText: {color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600'},
  chipTextOn: {color: '#FFFFFF'},

  // 설문 저장/취소 버튼
  actionRow: {flexDirection: 'row', gap: 8, marginTop: 4},
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255,210,127,0.9)',
  },
  saveBtnOff: {backgroundColor: 'rgba(255,255,255,0.12)'},
  saveText: {color: '#3A2A12', fontSize: 13, fontWeight: '700'},
  saveTextOff: {color: 'rgba(255,255,255,0.4)'},
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cancelText: {color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600'},

  // 내 체향 요약 행(추천 뷰 상단)
  summaryRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  summaryLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  summaryValue: {flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '600'},
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  editText: {color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600'},

  divider: {height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 2},
  resultBlock: {gap: 6},
  blockTitle: {color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5},

  concLabel: {color: '#FFFFFF', fontSize: 16, fontWeight: '700'},
  concReason: {color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 15},

  meterRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  meterLabel: {width: 36, color: 'rgba(255,255,255,0.8)', fontSize: 11},
  meterTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  meterFill: {height: 6, borderRadius: 3, backgroundColor: BAR_ON},
  meterValue: {
    width: 96,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },

  famRow: {gap: 2, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 10},
  famRowTop: {backgroundColor: 'rgba(255,210,127,0.12)'},
  famHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  famName: {color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600'},
  famNameTop: {color: '#FFE6B8'},
  famScore: {color: 'rgba(255,255,255,0.55)', fontSize: 11, fontVariant: ['tabular-nums']},
  famNotes: {color: 'rgba(255,255,255,0.6)', fontSize: 11},
  famReason: {color: 'rgba(255,210,127,0.85)', fontSize: 10},

  phaseRow: {gap: 4, paddingVertical: 3},
  phaseHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  phaseName: {color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600'},
  phaseWindow: {color: 'rgba(255,255,255,0.55)', fontSize: 11, fontVariant: ['tabular-nums']},
  phaseDesc: {color: 'rgba(255,255,255,0.6)', fontSize: 10, lineHeight: 14},

  tip: {color: 'rgba(255,255,255,0.78)', fontSize: 11, lineHeight: 16},
  caveat: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
