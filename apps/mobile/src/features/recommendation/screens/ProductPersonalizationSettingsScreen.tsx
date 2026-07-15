import {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Switch, View} from 'react-native';
import {Text} from 'tamagui';

import {colors, radius, spacing, typography} from '../../../shared/theme';
import {AppScreen} from '../../../shared/ui';
import {RecommendationSectionState} from '../components/RecommendationSectionState';
import {clearProductEventQueue, setProductEventCollectionEnabled} from '../services/productEventService';
import {deleteProductPersonalizationData, getProductConsents, setProductConsent, type ProductConsentPurpose} from '../services/productHubService';

type ConsentState = Record<ProductConsentPurpose, boolean>;
const initial: ConsentState = {engagement_personalization: false, color_cohort: false};

export function ProductPersonalizationSettingsScreen() {
  const [consents, setConsents] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {getProductConsents().then(data => {const next = {engagement_personalization: Boolean(data.purposes.engagement_personalization?.accepted), color_cohort: Boolean(data.purposes.color_cohort?.accepted)}; setConsents(next); setProductEventCollectionEnabled(next.engagement_personalization);}).catch(() => setMessage('동의 상태를 불러오지 못했어요.')).finally(() => setLoading(false));}, []);
  const toggle = async (purpose: ProductConsentPurpose) => {
    const accepted = !consents[purpose];
    setConsents(current => ({...current, [purpose]: accepted})); setMessage(null);
    try {await setProductConsent(purpose, accepted); if (purpose === 'engagement_personalization') {setProductEventCollectionEnabled(accepted); if (!accepted) clearProductEventQueue();} setMessage(accepted ? '선택 동의를 저장했어요.' : '동의를 철회하고 파생 데이터를 삭제했어요.');} catch {setConsents(current => ({...current, [purpose]: !accepted})); setMessage('설정을 저장하지 못했어요.');}
  };
  const deleteAll = async () => {setLoading(true); try {await deleteProductPersonalizationData(); clearProductEventQueue(); setConsents(initial); setProductEventCollectionEnabled(false); setMessage('제품 개인화 이벤트와 취향 프로필을 삭제했어요.');} catch {setMessage('개인화 데이터를 삭제하지 못했어요.');} finally {setLoading(false);}};
  return (
    <AppScreen topPadding="none">
      <View style={styles.intro}><Text style={styles.title}>제품 개인화 설정</Text><Text style={styles.body}>개인화는 선택 사항이에요. 끄더라도 제품 검색, 시즌 추천, 명시적으로 선택한 AR 룩 추천은 그대로 이용할 수 있어요.</Text></View>
      {loading ? <RecommendationSectionState kind="loading" message="동의와 삭제 상태를 확인하고 있어요." /> : null}
      <ConsentRow title="검색·좋아요·클릭 기반 개인화" description="좋아요, 검색 제출, 상세 열기, 판매처 이동을 최대 90일간 사용하고 파생 취향 프로필은 최근 활동 후 최대 180일 보관해요." value={consents.engagement_personalization} disabled={loading} onChange={() => toggle('engagement_personalization')} />
      <ConsentRow title="비슷한 컬러 취향 추천" description="얼굴 사진이나 얼굴 임베딩은 쓰지 않아요. 별도 동의한 100명 이상의 넓은 취향 집계가 있을 때만 표시해요." value={consents.color_cohort} disabled={loading} onChange={() => toggle('color_cohort')} />
      <View style={styles.policy}><Text style={styles.policyTitle}>수집하지 않는 정보</Text><Text style={styles.body}>원본 얼굴 프레임, 얼굴 landmark, 신원 식별용 얼굴 임베딩은 제품 추천 이벤트에 저장하지 않아요.</Text></View>
      <View style={styles.policy}><Text style={styles.policyTitle}>연령 안내</Text><Text style={styles.body}>선택형 제품 개인화는 프로필에서 만 14세 이상으로 확인된 계정만 켤 수 있어요. 연령 정책이 확정되지 않은 환경에서는 기본으로 비활성화돼요.</Text></View>
      <Pressable accessibilityRole="button" disabled={loading} onPress={deleteAll} style={styles.delete}><Text style={styles.deleteText}>제품 개인화 데이터 삭제</Text></Pressable>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
    </AppScreen>
  );
}

function ConsentRow({title, description, value, disabled, onChange}: {title: string; description: string; value: boolean; disabled: boolean; onChange: () => void}) {
  return <View style={styles.row}><View style={styles.rowCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.body}>{description}</Text></View><Switch accessibilityLabel={title} disabled={disabled} onValueChange={onChange} value={value} /></View>;
}

const styles = StyleSheet.create({
  intro: {gap: spacing.sm},
  title: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.xl, lineHeight: typography.lineHeight.xl},
  body: {color: colors.textSecondary, fontFamily: typography.fontFamily.regular, fontSize: typography.fontSize.sm, lineHeight: typography.lineHeight.sm},
  row: {alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.lg, flexDirection: 'row', gap: spacing.md, padding: spacing.md},
  rowCopy: {flex: 1, gap: spacing.xs},
  rowTitle: {color: colors.textPrimary, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md, lineHeight: typography.lineHeight.md},
  policy: {borderColor: colors.borderStrong, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.md},
  policyTitle: {...typography.caption, color: colors.textPrimary},
  delete: {alignItems: 'center', borderColor: colors.danger, borderRadius: radius.lg, borderWidth: 1, justifyContent: 'center', minHeight: 52},
  deleteText: {color: colors.danger, fontFamily: typography.fontFamily.bold, fontSize: typography.fontSize.md},
  message: {...typography.caption, color: colors.textSecondary},
});
