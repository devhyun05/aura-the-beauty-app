import {Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {colors, radius, spacing, typography} from '../../../shared/theme';

type ThirdPartyAiConsentSheetProps = {
  accepted: boolean;
  errorMessage?: string | null;
  isSubmitting: boolean;
  mode: 'request' | 'settings';
  onAccept: () => void;
  onClose: () => void;
  onRevoke: () => void;
  visible: boolean;
};

const disclosureSections = [
  {
    body:
      '촬영하거나 선택한 얼굴 사진, 얼굴형·비율·피부·헤어·입술 색상·퍼스널 컬러 등 사진과 센서에서 계산한 분석값, 선택한 상황·설문 답변·메이크업 목표를 전송할 수 있어요.',
    title: '전송하는 정보',
  },
  {
    body:
      'Amazon Web Services의 Amazon Bedrock(Anthropic Claude)은 얼굴·메이크업 분석과 보고서·추천 문구 생성에 사용해요. OpenAI는 맞춤 메이크업·헤어 이미지의 분석·편집·생성에 사용해요.',
    title: '전송받는 외부 AI 서비스와 목적',
  },
  {
    body:
      '업로드 사진과 생성 결과는 AURA의 AWS 저장소에 보고서와 연결해 보관될 수 있어요. 회원 탈퇴 또는 앱에서 제공되는 삭제 기능을 이용하면 AURA 보관본의 삭제 절차가 시작돼요. 외부 AI 제공업체의 처리·보관 조건은 개인정보처리방침에서 확인할 수 있어요.',
    title: '보관과 삭제',
  },
  {
    body:
      '동의하지 않아도 로그인과 기기 내 AR 필터는 이용할 수 있지만 클라우드 AI 분석·생성 기능은 제한돼요. 설정 > AI 데이터 관리에서 언제든 철회할 수 있고, 철회 후에는 새로운 전송이 중단돼요.',
    title: '선택과 철회',
  },
] as const;

export function ThirdPartyAiConsentSheet({
  accepted,
  errorMessage,
  isSubmitting,
  mode,
  onAccept,
  onClose,
  onRevoke,
  visible,
}: ThirdPartyAiConsentSheetProps) {
  const insets = useSafeAreaInsets();
  const isSettings = mode === 'settings';

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}>
      <View style={[styles.screen, {paddingBottom: Math.max(insets.bottom, spacing.lg)}]}>
        <View style={styles.header}>
          <Text
            lineBreakStrategyIOS="hangul-word"
            style={styles.headerTitle}>
            {isSettings ? 'AI 데이터 관리' : '외부 AI 처리를 허용할까요?'}
          </Text>
          <Pressable
            accessibilityLabel="닫기"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={onClose}
            style={styles.closeButton}>
            <Text style={styles.closeLabel}>닫기</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          style={styles.scroll}
          showsVerticalScrollIndicator={false}>
          {isSettings ? (
            <View style={[styles.statusCard, accepted ? styles.acceptedCard : styles.revokedCard]}>
              <Text style={styles.statusEyebrow}>현재 상태</Text>
              <Text style={styles.statusValue}>
                {accepted ? '외부 AI 처리 동의 중' : '외부 AI 처리 동의 안 함'}
              </Text>
            </View>
          ) : (
            <Text
              lineBreakStrategyIOS="hangul-word"
              style={styles.intro}>
              AURA는 선택한 AI 분석·생성 기능을 제공하기 위해 필요한 정보를 외부 AI
              서비스로 전송할 수 있어요. 동의 전에는 전송하지 않아요.
            </Text>
          )}

          <View style={styles.disclosureCard}>
            {disclosureSections.map((section, index) => (
              <View
                key={section.title}
                style={[
                  styles.disclosureSection,
                  index < disclosureSections.length - 1 ? styles.sectionDivider : null,
                ]}>
                <Text
                  lineBreakStrategyIOS="hangul-word"
                  style={styles.sectionTitle}>
                  {section.title}
                </Text>
                <Text
                  lineBreakStrategyIOS="hangul-word"
                  style={styles.sectionBody}>
                  {section.body}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.rightsNotice}>
            다른 사람의 사진은 업로드·분석할 권한이 있는 경우에만 사용해 주세요.
          </Text>
        </ScrollView>

        {errorMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
        <View style={styles.actions}>
          {accepted ? (
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={onRevoke}
              style={[styles.secondaryButton, isSubmitting ? styles.disabledButton : null]}>
              <Text style={styles.secondaryButtonLabel}>
                {isSubmitting ? '처리 중…' : '동의 철회'}
              </Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onClose}
                style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonLabel}>동의하지 않음</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting}
                onPress={onAccept}
                style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}>
                <Text style={styles.primaryButtonLabel}>
                  {isSubmitting ? '처리 중…' : '동의하고 계속'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  acceptedCard: {
    backgroundColor: '#EDF3EB',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 40,
  },
  closeLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.sm,
  },
  content: {
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  disabledButton: {
    opacity: 0.55,
  },
  disclosureCard: {
    backgroundColor: '#F7F5F1',
    borderColor: '#E8E3DB',
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  disclosureSection: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  errorText: {
    color: '#B3544D',
    fontFamily: typography.fontFamily.medium,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#ECE9E4',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.lg,
  },
  intro: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.md,
    lineHeight: typography.lineHeight.md,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.textPrimary,
    borderRadius: radius.lg,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  primaryButtonLabel: {
    color: colors.white,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
  },
  revokedCard: {
    backgroundColor: '#F2F0EC',
  },
  rightsNotice: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.xs,
    lineHeight: typography.lineHeight.xs,
  },
  screen: {
    backgroundColor: colors.white,
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#F1EFEB',
    borderRadius: radius.lg,
    flex: 1,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
  },
  sectionBody: {
    color: colors.textSecondary,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.fontSize.sm,
    lineHeight: typography.lineHeight.sm,
  },
  sectionDivider: {
    borderBottomColor: '#E8E3DB',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    lineHeight: typography.lineHeight.md,
  },
  statusCard: {
    borderRadius: radius.lg,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  statusEyebrow: {
    color: colors.textTertiary,
    fontFamily: typography.fontFamily.semibold,
    fontSize: typography.fontSize.xs,
  },
  statusValue: {
    color: colors.textPrimary,
    fontFamily: typography.fontFamily.bold,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
  },
});
