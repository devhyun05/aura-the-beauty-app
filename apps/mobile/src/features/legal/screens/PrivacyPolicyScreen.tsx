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
          AURA는 서비스 제공에 필요한 최소한의 정보를 수집·이용합니다.{'\n'}
          ① 계정 정보(필수) — Apple·Google 로그인 시 제공되는 이메일, 닉네임. 회원 식별과
          서비스 제공에 사용합니다.{'\n'}
          ② 얼굴 사진(해당 기능 이용 시) — 촬영하거나 앨범에서 업로드한 사진. AI 얼굴 분석
          보고서, 메이크업 추출·피드백 생성에만 사용합니다.{'\n'}
          ③ 퍼스널 컬러·얼굴 측정 수치 — 피부·헤어·입술 색과 얼굴 비율에서 계산한 수치.
          톤 분석과 맞춤 추천에 사용합니다.{'\n'}
          ④ 대략적 위치(선택) — 지역 날씨·트렌드 기반 제품 추천에 사용합니다. 허용하지
          않아도 기본 지역으로 모든 기능을 이용할 수 있습니다.{'\n'}
          ⑤ 서비스 이용 기록 — 좋아요·검색·클릭 기록. 제품 추천 개인화와 익명화된 컬러
          취향 통계에 사용합니다.{'\n'}
          ⑥ 푸시 알림 토큰(선택) — 분석 완료 등 알림 발송에 사용하며, 기기 설정에서 언제든
          끌 수 있습니다.{'\n'}
          선택 항목의 수집을 거부해도 서비스 이용에 제한이 없으며, 기능별 항목(얼굴 사진
          등)은 해당 기능을 이용하지 않으면 수집되지 않습니다.
        </Section>
        <Section title="2. 얼굴 이미지의 처리 (중요)">
          퍼스널 컬러 등 얼굴 측정 계산은 이용자의 기기 안에서 수행되며, 측정에 사용된 원본
          얼굴 프레임은 계산 직후 즉시 삭제됩니다. 촬영·업로드한 사진은 AI 분석 보고서
          생성을 위해서만 암호화(HTTPS)되어 AURA 서버에 전송·저장되고, 해당 보고서를
          삭제하면 함께 삭제됩니다. 얼굴 이미지는 본인 확인·신원 식별 목적으로 사용하지
          않으며, 광고 목적으로 사용하거나 제3자에게 판매·공유하지 않습니다.
        </Section>
        <Section title="3. 보유 기간과 파기">
          개인정보는 수집·이용 목적이 달성되면 지체 없이 파기하며, 회원 탈퇴 시 계정
          정보와 서버에 저장된 보고서·이미지·측정 수치를 모두 삭제합니다(관계 법령이 보존을
          요구하는 정보는 해당 기간 보관 후 파기). 개별 분석 보고서와 첨부 이미지는 앱에서
          해당 보고서를 삭제하면 즉시 함께 삭제됩니다. 기기에 저장된 측정 결과는 앱 내 “내
          색상 데이터 삭제” 또는 앱 삭제로 제거됩니다.
        </Section>
        <Section title="4. 처리 위탁과 국외 이전">
          서비스 운영을 위해 다음 업무를 위탁합니다.{'\n'}
          · Amazon Web Services — 클라우드 서버·데이터 보관(서울 리전) 및 AI 분석
          처리(Amazon Bedrock).{'\n'}
          · OpenAI — 추천 메이크업 이미지 생성 처리.{'\n'}
          AI 처리 과정에서 분석에 필요한 데이터가 국외에서 일시 처리될 수 있으며, 위탁받은
          업체는 처리 목적 외 사용이 금지됩니다. 위 업체가 이용자의 데이터를 자체 목적으로
          보관·학습에 사용하지 않도록 계약·설정으로 제한합니다.
        </Section>
        <Section title="5. 제3자 제공·광고·추적">
          이용자의 개인정보를 제3자에게 제공하거나 판매하지 않습니다. 광고 네트워크,
          추적(트래킹) SDK, 제3자 분석 도구를 사용하지 않으며, 앱을 넘나드는 이용자 추적을
          하지 않습니다. 쿠키 등 자동 수집 장치를 사용하지 않습니다.
        </Section>
        <Section title="6. 이용자의 권리와 행사 방법">
          이용자는 언제든 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수
          있습니다.{'\n'}
          · 계정과 전체 데이터 삭제: 앱 내 [프로필 → 설정 → 계정 관리 → 회원 탈퇴]{'\n'}
          · 개별 보고서·측정 데이터 삭제: 각 보고서 화면과 설정에서 직접 삭제{'\n'}
          · 위치·알림 권한 철회: 기기 설정에서 언제든 변경{'\n'}
          권리 행사는 아래 문의처를 통해서도 요청할 수 있으며, 지체 없이 조치합니다.
        </Section>
        <Section title="7. 안전성 확보 조치">
          전송 구간 암호화(HTTPS), 인증 기반 접근 통제, 클라우드 보안 설정 등 개인정보를
          안전하게 처리하기 위한 기술적·관리적 조치를 적용하고 있습니다. 로그인 세션 정보는
          기기의 보안 저장소에 보관됩니다.
        </Section>
        <Section title="8. 아동의 개인정보">
          AURA는 만 14세 미만 아동의 개인정보를 수집하지 않으며, 만 14세 미만은 서비스를
          이용할 수 없습니다.
        </Section>
        <Section title="9. 개인정보 보호책임자와 문의">
          개인정보 보호책임자: AURA 운영팀{'\n'}
          문의: aura.partner.kr@gmail.com{'\n'}
          개인정보 관련 문의·불만·피해 구제 요청에 지체 없이 답변·처리합니다. 본 방침이
          변경되는 경우 앱 내 공지로 사전에 알려드립니다.
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
