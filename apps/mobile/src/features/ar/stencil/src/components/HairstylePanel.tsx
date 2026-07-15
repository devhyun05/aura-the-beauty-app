import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {
  DEFAULT_HAIR_CONTEXT,
  EFFORT_OPTIONS,
  LENGTH_OPTIONS,
  recommend,
} from '../composer/hairstyle';
import type {HairContext, LengthPref, RankedStyle} from '../composer/hairstyle';
import {HAIR_QUESTIONS, summarizeHairProfile} from '../composer/hairProfile';
import type {HairProfile, HairQuestion} from '../composer/hairProfile';
import {loadHairProfile, saveHairProfile} from '../storage/hairProfileStore';

/**
 * 헤어스타일 추천 패널 — 얼굴형·두상(뒤통수·정수리)·모발(결·굵기·숱) 프로필로
 * 카탈로그를 채점해 순위·이유·주의·손질 팁을 보여준다. 순수 RN(Unity 무관).
 *
 * 얼굴형·두상·모발은 사람마다 다르고 잘 안 변하는 개인 값이라 최초 1회 7문항
 * 설문으로 물어 영속 저장한다(체향 프로필과 같은 규약). 원하는 기장·손질 여유는
 * 그때그때 바뀌는 취향이라 세션 로컬 칩으로 둔다.
 *
 * 마운트 시 프로필을 1회 로드하고, 로딩 완료 전엔 헤더만 렌더해 내용 플래시를 막는다.
 * 프로필 없음 → 설문 뷰(저장 후 추천 뷰), 있음 → 추천 뷰(요약 행+수정 진입).
 */

interface Props {
  onClose: () => void;
}

// 강조 색 — 유리 UI 위에서 라이너 톤(따뜻한 앰버)과 맞춘다(PerfumePanel과 동일).
const ACCENT = '#FFD27F';

// 설문 답 — 질문 key별 선택 옵션 id(문자열). 일곱 칸이 다 차야 프로필로 저장한다.
type Answers = Partial<Record<HairQuestion['key'], string>>;

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

// 설문 한 문항 — 각 칩엔 결정론적 testID를 달아 테스트가 라벨 문안에 얽매이지 않게
// 한다(문안은 hairProfile.ts가 소유).
function QuestionRow({
  question,
  value,
  onSelect,
}: {
  question: HairQuestion;
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
              testID={`hair-opt-${question.key}-${o.id}`}
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

// 순위 한 줄 — 1위는 ★와 하이라이트. 이유·주의는 발동한 규칙 문장 그대로.
function StyleRow({item, top}: {item: RankedStyle; top: boolean}) {
  return (
    <View style={[styles.styleRow, top && styles.styleRowTop]}>
      <View style={styles.styleHead}>
        <Text style={[styles.styleName, top && styles.styleNameTop]}>
          {top ? '★ ' : ''}
          {item.name}
          <Text style={styles.styleLen}>  {item.lengthLabel}</Text>
        </Text>
        <Text style={styles.styleScore}>{Math.round(item.score * 100)}</Text>
      </View>
      <Text style={styles.styleSummary}>{item.summary}</Text>
      {item.reasons.length > 0 && (
        <Text style={styles.styleReason}>{item.reasons.join(' · ')}</Text>
      )}
      {item.cautions.length > 0 && (
        <Text style={styles.styleCaution}>{item.cautions.join(' · ')}</Text>
      )}
    </View>
  );
}

export default function HairstylePanel({onClose}: Props) {
  // 기장·손질 여유는 세션 로컬(닫으면 기본값).
  const [ctx, setCtx] = useState<HairContext>(DEFAULT_HAIR_CONTEXT);
  const set = <K extends keyof HairContext>(k: K, v: HairContext[K]) =>
    setCtx(prev => ({...prev, [k]: v}));

  // 프로필: 마운트 후 1회 로드. loaded 전엔 헤더만 렌더(플래시 방지).
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<HairProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});

  useEffect(() => {
    let alive = true;
    loadHairProfile()
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

  // 설문 뷰에선 화면에 안 쓰이지만 훅 규칙상 항상 계산(무해 — 프로필 없으면 null).
  const rec = useMemo(() => (profile ? recommend(profile, ctx) : null), [profile, ctx]);

  const allAnswered = HAIR_QUESTIONS.every(q => answers[q.key] != null);
  // 프로필 없음이거나 수정 중이면 설문 뷰. (editing=true는 항상 기존 프로필이 있을 때만.)
  const showSurvey = !profile || editing;

  const selectAnswer = (key: HairQuestion['key'], id: string) =>
    setAnswers(prev => ({...prev, [key]: id}));

  const handleSave = () => {
    if (!allAnswered) return;
    const next: HairProfile = {
      lane: answers.lane as HairProfile['lane'],
      faceShape: answers.faceShape as HairProfile['faceShape'],
      backHead: answers.backHead as HairProfile['backHead'],
      crown: answers.crown as HairProfile['crown'],
      texture: answers.texture as HairProfile['texture'],
      thickness: answers.thickness as HairProfile['thickness'],
      density: answers.density as HairProfile['density'],
      createdAt: Date.now(),
    };
    // 레인이 바뀌면 세션 기장 선호가 새 레인의 선택지 밖일 수 있다 — 무관으로 복귀.
    if (!LENGTH_OPTIONS[next.lane].some(o => o.id === ctx.lengthPref)) {
      set('lengthPref', 'any');
    }
    // 낙관적 전환 — 즉시 추천 뷰로. 영속화는 best-effort(스토어가 실패를 흡수).
    setProfile(next);
    setEditing(false);
    void saveHairProfile(next).catch(() => {});
  };

  const startEdit = () => {
    if (profile) {
      setAnswers({
        lane: profile.lane,
        faceShape: profile.faceShape,
        backHead: profile.backHead,
        crown: profile.crown,
        texture: profile.texture,
        thickness: profile.thickness,
        density: profile.density,
      });
    }
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const picks = rec ? rec.picks.slice(0, 5) : [];
  const alternates =
    rec && ctx.lengthPref !== 'any' ? rec.alternates.slice(0, 2) : [];
  const top = picks[0];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>헤어 추천</Text>
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
            얼굴형·두상·모발은 잘 안 변하는 값이라 한 번만 물어볼게요 — 답은 저장되고
            언제든 수정 가능해요.
          </Text>

          {HAIR_QUESTIONS.map(q => (
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
              testID="hair-save"
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
      {loaded && !showSurvey && profile && rec && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* 내 조건 요약 — 저장된 프로필 한 줄 + 수정 진입 */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>내 조건</Text>
            <Text style={styles.summaryValue}>{summarizeHairProfile(profile)}</Text>
            <TouchableOpacity
              testID="hair-edit"
              style={styles.editBtn}
              onPress={startEdit}>
              <Text style={styles.editText}>수정</Text>
            </TouchableOpacity>
          </View>

          {/* 그때그때 바뀌는 취향 — 세션 로컬 칩 */}
          <ChipRow
            label="원하는 기장"
            options={LENGTH_OPTIONS[profile.lane]}
            value={ctx.lengthPref as LengthPref}
            onSelect={v => set('lengthPref', v)}
          />
          <ChipRow
            label="아침 손질 여유"
            options={EFFORT_OPTIONS}
            value={ctx.effort}
            onSelect={v => set('effort', v)}
          />

          <View style={styles.divider} />

          {/* 스타일 순위 */}
          <View style={styles.resultBlock}>
            <Text style={styles.blockTitle}>어울리는 스타일</Text>
            {picks.length === 0 ? (
              <Text style={styles.emptyNote}>
                이 기장에 맞는 스타일이 없어요 — 아래 다른 기장 제안을 확인해 보세요.
              </Text>
            ) : (
              picks.map((s, i) => <StyleRow key={s.id} item={s} top={i === 0} />)
            )}
          </View>

          {/* 기장을 바꾸면 — 선호 기장 밖 상위 2 */}
          {alternates.length > 0 && (
            <View style={styles.resultBlock}>
              <Text style={styles.blockTitle}>기장을 바꾸면</Text>
              {alternates.map(s => (
                <StyleRow key={s.id} item={s} top={false} />
              ))}
            </View>
          )}

          {/* 1위 스타일 손질 팁 */}
          {top && (
            <View style={styles.resultBlock}>
              <Text style={styles.blockTitle}>손질 팁 — {top.name}</Text>
              {top.tips.map((t, i) => (
                <Text key={i} style={styles.tip}>
                  • {t}
                </Text>
              ))}
            </View>
          )}

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
  chipOn: {backgroundColor: 'rgba(255,210,127,0.35)', borderColor: ACCENT},
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

  // 내 조건 요약 행(추천 뷰 상단)
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
  emptyNote: {color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 15},

  styleRow: {gap: 2, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 10},
  styleRowTop: {backgroundColor: 'rgba(255,210,127,0.12)'},
  styleHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  styleName: {color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600'},
  styleNameTop: {color: '#FFE6B8'},
  styleLen: {color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '600'},
  styleScore: {color: 'rgba(255,255,255,0.55)', fontSize: 11, fontVariant: ['tabular-nums']},
  styleSummary: {color: 'rgba(255,255,255,0.6)', fontSize: 11},
  styleReason: {color: 'rgba(255,210,127,0.85)', fontSize: 10, lineHeight: 14},
  styleCaution: {color: 'rgba(255,140,120,0.9)', fontSize: 10, lineHeight: 14},

  tip: {color: 'rgba(255,255,255,0.78)', fontSize: 11, lineHeight: 16},
  caveat: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
