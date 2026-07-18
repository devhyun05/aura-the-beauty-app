import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import {
  BODY_QUESTIONS,
  analyzeBody,
  summarizeBody,
} from '../composer/bodyProfile';
import type {BodyAnswerKey, BodyProfile, BodyQuestion, TypeStyle} from '../composer/bodyProfile';
import {loadBodyProfile, saveBodyProfile} from '../storage/bodyProfileStore';
import {ACCENT, PANEL_BG, accentAlpha} from '../theme';

/**
 * 체형 체크 패널 — 거울 앞에서 스스로 관찰 가능한 7문항(비율 3 + 골격 질감 4)을
 * 칩으로 답하면 실루엣(5종)·골격(3종)을 진단하고 스타일링 가이드를 보여준다.
 * 순수 RN(Unity 무관). PerfumePanel의 체향 프로필과 같은 UX 규약:
 *
 * 체형은 사람마다 다르고 잘 안 변하는 개인 값이라 최초 1회 설문으로 물어 영속
 * 저장한다. 저장하는 것은 분류 결과가 아니라 설문 원답 — 분류 규칙을 나중에
 * 튜닝해도 저장 데이터 마이그레이션이 없다(리포트는 렌더 시 analyzeBody로 유도).
 *
 * 마운트 시 프로필을 1회 로드하고, 로딩 완료 전엔 헤더만 렌더해 내용 플래시를 막는다.
 * 프로필 없음 → 설문 뷰(저장 후 결과 뷰), 있음 → 결과 뷰(요약 행+수정 진입).
 */

interface Props {
  onClose: () => void;
}

// 결과 강조 색 — 유리 UI 위에서 라이너 톤(따뜻한 앰버)과 맞춘다(PerfumePanel과 동일).

// 설문 답 — 질문 key별 선택 옵션 id(문자열). 일곱 칸이 다 차야 프로필로 저장한다.
type Answers = Partial<Record<BodyAnswerKey, string>>;

// 설문 한 문항 — 질문을 라벨로, 옵션을 칩으로. 각 칩엔 결정론적 testID를 달아
// 테스트가 라벨 문안에 얽매이지 않게 한다(문안은 bodyProfile.ts가 소유).
function QuestionRow({
  question,
  value,
  onSelect,
}: {
  question: BodyQuestion;
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
              testID={`body-opt-${question.key}-${o.id}`}
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

// 타입 카드 하나(실루엣/골격 공용) — 라벨·한 줄 특징·추천·피할 것.
function TypeCard({axis, style}: {axis: string; style: TypeStyle}) {
  return (
    <View style={styles.typeCard}>
      <Text style={styles.typeAxis}>{axis}</Text>
      <Text style={styles.typeLabel}>{style.label}</Text>
      <Text style={styles.typeTagline}>{style.tagline}</Text>
      <View style={styles.tipBlock}>
        <Text style={styles.tipHead}>이렇게 입으면 좋아요</Text>
        {style.points.map((t, i) => (
          <Text key={i} style={styles.tip}>
            • {t}
          </Text>
        ))}
      </View>
      <View style={styles.tipBlock}>
        <Text style={styles.tipHeadAvoid}>피하면 좋아요</Text>
        {style.avoid.map((t, i) => (
          <Text key={i} style={styles.tipAvoid}>
            • {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function BodyPanel({onClose}: Props) {
  // 프로필: 마운트 후 1회 로드. loaded 전엔 헤더만 렌더(플래시 방지).
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<BodyProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});

  useEffect(() => {
    let alive = true;
    loadBodyProfile()
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

  // 리포트는 프로필에서 유도(결정론적). 설문 뷰에선 안 쓰이지만 훅 규칙상 항상 계산(무해).
  const report = useMemo(() => (profile ? analyzeBody(profile) : null), [profile]);

  const allAnswered = BODY_QUESTIONS.every(q => answers[q.key] != null);
  // 프로필 없음이거나 수정 중이면 설문 뷰. (editing=true는 항상 기존 프로필이 있을 때만.)
  const showSurvey = !profile || editing;

  const selectAnswer = (key: BodyAnswerKey, id: string) =>
    setAnswers(prev => ({...prev, [key]: id}));

  const handleSave = () => {
    if (!allAnswered) return;
    const next: BodyProfile = {
      frameWidth: answers.frameWidth as BodyProfile['frameWidth'],
      waist: answers.waist as BodyProfile['waist'],
      volume: answers.volume as BodyProfile['volume'],
      wrist: answers.wrist as BodyProfile['wrist'],
      collar: answers.collar as BodyProfile['collar'],
      flesh: answers.flesh as BodyProfile['flesh'],
      balance: answers.balance as BodyProfile['balance'],
      createdAt: Date.now(),
    };
    // 낙관적 전환 — 즉시 결과 뷰로. 영속화는 best-effort(스토어가 실패를 흡수).
    setProfile(next);
    setEditing(false);
    void saveBodyProfile(next).catch(() => {});
  };

  const startEdit = () => {
    if (profile) {
      setAnswers({
        frameWidth: profile.frameWidth,
        waist: profile.waist,
        volume: profile.volume,
        wrist: profile.wrist,
        collar: profile.collar,
        flesh: profile.flesh,
        balance: profile.balance,
      });
    }
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  // 섹션 라벨은 그룹이 바뀌는 첫 문항 위에만 찍는다(문항 순서는 bodyProfile.ts가 소유).
  const withGroupHead = (q: BodyQuestion, i: number) =>
    i === 0 || BODY_QUESTIONS[i - 1].group !== q.group;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>체형 체크</Text>
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
            거울 앞에서 관찰한 대로 일곱 가지만 답해 주세요 — 답은 저장되고 언제든 수정 가능해요.
          </Text>

          {BODY_QUESTIONS.map((q, i) => (
            <React.Fragment key={q.key}>
              {withGroupHead(q, i) && (
                <Text style={styles.groupHead}>{q.group}</Text>
              )}
              <QuestionRow
                question={q}
                value={answers[q.key]}
                onSelect={id => selectAnswer(q.key, id)}
              />
            </React.Fragment>
          ))}

          <View style={styles.actionRow}>
            {editing && (
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
                <Text style={styles.cancelText}>취소</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              testID="body-save"
              disabled={!allAnswered}
              style={[styles.saveBtn, !allAnswered && styles.saveBtnOff]}
              onPress={handleSave}>
              <Text style={[styles.saveText, !allAnswered && styles.saveTextOff]}>
                결과 보기
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* 결과 뷰 — 프로필이 있고 수정 중이 아닐 때 */}
      {loaded && !showSurvey && profile && report && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          {/* 내 체형 요약 — 개인 저장값. '수정'으로 설문 재진입. */}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>내 체형</Text>
            <Text style={styles.summaryValue}>{summarizeBody(profile)}</Text>
            <TouchableOpacity
              testID="body-edit"
              style={styles.editBtn}
              onPress={startEdit}>
              <Text style={styles.editText}>수정</Text>
            </TouchableOpacity>
          </View>

          <TypeCard axis="실루엣" style={report.silhouetteStyle} />
          <TypeCard axis="골격" style={report.frameStyle} />

          {/* 한계 고지 — 예측이 틀려도 UX가 깨지지 않게 정직하게 */}
          <Text style={styles.caveat}>{report.caveat}</Text>
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
    backgroundColor: PANEL_BG,
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

  // 설문 안내 문구·섹션 라벨
  intro: {color: 'rgba(255,255,255,0.75)', fontSize: 11, lineHeight: 16},
  groupHead: {
    color: accentAlpha(0.9),
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },

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
  chipOn: {backgroundColor: accentAlpha(0.35), borderColor: ACCENT},
  chipText: {color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600'},
  chipTextOn: {color: '#FFFFFF'},

  // 설문 저장/취소 버튼
  actionRow: {flexDirection: 'row', gap: 8, marginTop: 4},
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: accentAlpha(0.9),
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

  // 내 체형 요약 행(결과 뷰 상단)
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

  // 타입 카드(실루엣/골격)
  typeCard: {
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: accentAlpha(0.08),
  },
  typeAxis: {color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5},
  typeLabel: {color: '#FFE6B8', fontSize: 16, fontWeight: '700'},
  typeTagline: {color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 15},
  tipBlock: {gap: 2, marginTop: 4},
  tipHead: {color: accentAlpha(0.85), fontSize: 10, fontWeight: '700'},
  tipHeadAvoid: {color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700'},
  tip: {color: 'rgba(255,255,255,0.78)', fontSize: 11, lineHeight: 16},
  tipAvoid: {color: 'rgba(255,255,255,0.55)', fontSize: 11, lineHeight: 16},

  caveat: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    lineHeight: 14,
    fontStyle: 'italic',
    marginTop: 2,
  },
});
