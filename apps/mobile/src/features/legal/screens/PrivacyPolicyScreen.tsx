import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';

type Props = {
  onClose?: () => void;
};

// App Store 심사·PIPA 대응. 로그인 화면의 죽은 “개인정보처리방침” 링크가 이 화면을 연다.
export function PrivacyPolicyScreen({ onClose }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>개인정보처리방침</Text>
        <Text style={styles.updated}>최종 업데이트: 2026-07-21</Text>

        <Section title="1. 수집하는 개인정보와 이용 목적">
          AURA는 다음 정보를 수집·이용합니다.{'\n'}
          ① 계정 정보(이메일, 닉네임 등 소셜 로그인 제공 정보) — 회원 식별과 서비스
          제공.{'\n'}
          ② 얼굴 사진(촬영·앨범 업로드) — AI 얼굴 분석 보고서, 메이크업 추출·피드백
          생성.{'\n'}
          ③ 퍼스널 컬러·얼굴 측정 수치 — 톤 분석과 맞춤 추천.{'\n'}
          ④ 대략적 위치(선택) — 지역 날씨·트렌드 기반 제품 추천. 허용하지 않아도 기본
          지역으로 이용할 수 있습니다.{'\n'}
          ⑤ 서비스 이용 기록(좋아요·검색·클릭) — 제품 추천 개인화와 익명 컬러 취향
          추천.{'\n'}
          ⑥ 푸시 알림 토큰(선택) — 알림 발송. 기기 설정에서 언제든 끌 수 있습니다.
        </Section>
        <Section title="2. 얼굴 이미지의 처리">
          퍼스널 컬러를 포함한 얼굴 측정 계산은 기기 안에서 수행되며, 측정에 사용된 원본
          얼굴 프레임은 계산 후 즉시 삭제됩니다. 촬영·업로드한 사진은 AI 분석 보고서 생성을
          위해 AURA 서버로 암호화 전송·저장되고, 해당 보고서를 삭제하면 함께 삭제됩니다.
          얼굴 이미지는 본인 확인·식별 목적으로 사용하지 않습니다.
        </Section>
        <Section title="3. 보유 기간과 파기">
          수집한 개인정보는 회원 탈퇴 시 지체 없이 파기합니다(관계 법령이 보존을 요구하는
          경우 해당 기간 보관 후 파기). 분석 보고서와 첨부 이미지·측정 수치는 이용자가 앱에서
          해당 보고서를 삭제하면 즉시 함께 삭제됩니다. 기기에 저장된 측정 결과는 앱 내 “내
          색상 데이터 삭제” 또는 앱 삭제로 제거됩니다.
        </Section>
        <Section title="4. 처리 위탁과 제3자 제공">
          서비스 운영을 위해 클라우드 인프라(Amazon Web Services)와 AI 분석 처리(AWS
          Bedrock, OpenAI)에 업무를 위탁하며, 위탁 처리 과정에서 일부 데이터가 국외에서
          처리될 수 있습니다. 그 외 제3자에게 개인정보를 제공하지 않으며, 광고·추적 목적의
          수집이나 제3자 광고 SDK는 사용하지 않습니다.
        </Section>
        <Section title="5. 이용자의 권리">
          이용자는 언제든 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수
          있습니다. 앱 내 [프로필 → 설정 → 계정 관리 → 회원 탈퇴]로 계정과 수집 정보를 직접
          삭제할 수 있고, 개별 보고서·측정 데이터도 앱에서 직접 삭제할 수 있습니다.
        </Section>
        <Section title="6. 아동의 개인정보">
          AURA는 만 14세 미만 아동의 개인정보를 수집하지 않으며, 만 14세 미만은 서비스를
          이용할 수 없습니다.
        </Section>
        <Section title="7. 문의">
          개인정보 관련 문의는 devhyun.jungle@gmail.com 으로 접수할 수 있습니다. 본 방침이
          변경되는 경우 앱 내 공지로 알려드립니다.
        </Section>

        {onClose && (
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  updated: { fontSize: 12, color: '#999', marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#222', marginTop: 12 },
  sectionBody: { fontSize: 14, color: '#444', lineHeight: 21 },
  closeBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#eef0f4' },
  closeBtnText: { color: '#333', fontSize: 15, fontWeight: '600' },
});
