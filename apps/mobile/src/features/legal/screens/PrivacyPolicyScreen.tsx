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
        <Text style={styles.updated}>최종 업데이트: 2026-07-23</Text>

        <Section title="1. 수집하는 개인정보와 이용 목적">
          AURA는 서비스 제공에 필요한 최소한의 정보를 수집·이용합니다.{'\n'}
          ① 계정 정보(필수) — Apple·Google 로그인 시 제공되는 식별자, 이메일, 이름 또는
          닉네임. 회원 식별과 서비스 제공에 사용합니다.{'\n'}
          ② 얼굴 사진(해당 기능 이용 시) — 직접 촬영하거나 사진 보관함에서 선택한 RGB
          사진. 얼굴 분석 보고서, 메이크업 추출·피드백·추천 및 이미지 생성에 사용합니다.{'\n'}
          ③ 얼굴·색상 분석값(해당 기능 이용 시) — 얼굴형·비율·윤곽·돌출도, 피부·헤어·입술
          색상, 피부톤·언더톤·퍼스널 컬러 등 사진과 센서에서 계산한 값. 분석 보고서와 맞춤
          추천에 사용합니다.{'\n'}
          ④ 대략적 위치(선택) — 지역 날씨·트렌드 기반 제품 추천에 사용합니다. 허용하지
          않아도 기본 지역으로 모든 기능을 이용할 수 있습니다.{'\n'}
          ⑤ 서비스 이용 기록 — 좋아요·검색·클릭 기록. 제품 추천 개인화와 익명화된 컬러
          취향 통계에 사용합니다.{'\n'}
          ⑥ 푸시 알림 토큰(선택) — 분석 완료 등 알림 발송에 사용하며, 기기 설정에서 언제든
          끌 수 있습니다.{'\n'}
          ⑦ 설문·입력 내용(해당 기능 이용 시) — 체형 설문 응답은 이용자의 기기에만
          저장됩니다. 메이크업 추천·피드백 과정의 질문 답변과 입력 내용은 해당 보고서에
          포함되어 맞춤 결과 생성에 사용됩니다.{'\n'}
          ⑧ 메이크업 캘린더 기록(해당 기능 이용 시) — 일자별 메이크업 기록·점수 선택·메모와
          목표 설정. 캘린더 화면 제공과 기록 관리에 사용합니다.{'\n'}
          이 밖에 서비스 이용 과정에서 접속 기록 등이 자동으로 생성될 수 있으며, 서비스
          안정 운영 목적으로만 사용됩니다.{'\n'}
          선택 항목의 수집 또는 외부 AI 전송에 동의하지 않아도 로그인과 기기 내 AR 필터를
          이용할 수 있습니다. 다만 사진·분석값 전송이 필요한 클라우드 AI 기능은 이용할 수
          없습니다.
        </Section>
        <Section title="2. TrueDepth 및 얼굴 정보 처리">
          지원되는 iPhone의 얼굴 분석 촬영에서는 Apple ARKit TrueDepth 기능을 사용할 수
          있습니다.{'\n'}
          · 처리 데이터 — 전면 카메라 RGB 프레임, ARKit이 제공하는 얼굴 메시의 3차원
          꼭짓점·2차원 투영점·삼각형 연결 정보, TrueDepth 사용 가능 여부를 촬영 중 기기
          메모리에서 처리합니다.{'\n'}
          · 원시 깊이 지도 — 원시 depth-map 바이트를 복사·파일 저장·서버 업로드하지
          않습니다. 촬영 샘플과 원시 얼굴 메시 프레임은 측정 종료 또는 화면 종료 시
          메모리에서 해제됩니다.{'\n'}
          · 저장되는 파생값 — 코·턱·광대 돌출도, 입술과 E-line 거리, 얼굴 비율, 측정
          신뢰도·유효 프레임 수 등 계산된 측정값과 보고서 생성용 RGB 사진은 이용자가
          분석을 실행한 경우 서버에 전송·저장될 수 있습니다.{'\n'}
          · 이용 목적 — 얼굴형·비율·색상 분석, 맞춤 보고서와 메이크업 추천 생성, AR
          메이크업 위치 정렬에만 사용합니다. 얼굴 인증, 신원 확인, 사용자 추적, 광고에는
          사용하지 않습니다.
        </Section>
        <Section title="3. 외부 AI 전송과 명시적 동의">
          AURA는 클라우드 AI 기능을 처음 실행하기 전에 별도 화면에서 전송 데이터, 수신자,
          목적, 보관·삭제 방법을 안내하고 이용자가 “동의하고 계속”을 선택한 경우에만
          전송합니다. 로그인 또는 일반 약관 동의를 외부 AI 전송 동의로 간주하지
          않습니다.{'\n'}
          · Amazon Web Services의 Amazon Bedrock / Anthropic Claude — 얼굴·색상·메이크업
          분석, 질문·보고서·추천 문구 생성{'\n'}
          · OpenAI — 맞춤 메이크업·헤어 이미지 분석·편집·생성{'\n'}
          전송될 수 있는 항목은 얼굴 사진, 위 2항의 파생 측정값, 피부톤·퍼스널 컬러 등
          분석값, 이용자가 입력한 상황·설문 답변·메이크업 목표입니다. 제공업체는 AURA가
          요청한 결과를 생성하기 위한 처리자로 이용되며, AURA는 개인정보를 판매하거나
          광고 목적으로 제공하지 않습니다. 처리 과정에서 국외 리전이 이용될 수 있으며,
          AURA는 계약과 서비스 설정을 통해 본 방침과 동등한 수준의 보호와 목적 외 사용
          제한이 적용되는 서비스 구성을 사용합니다.
        </Section>
        <Section title="4. 보유 기간과 파기">
          계정 정보, 보고서, 업로드 사진, 파생 측정값과 질문 답변은 서비스 제공을 위해
          계정이 유지되는 동안 보관할 수 있습니다. 얼굴 분석 보고서에서 삭제를 선택하면
          해당 보고서의 사진·측정값 삭제 절차가 시작되며, 회원 탈퇴 시 계정과 서버에
          연결된 보고서·이미지·측정값·캘린더 기록의 삭제 절차가 시작됩니다. 법령상 보관
          의무 또는 장애 복구용 백업이 있는 경우에는 해당 목적과 기간 동안 격리 보관한 뒤
          삭제합니다.{'\n'}
          원시 TrueDepth depth-map은 저장하지 않습니다. 기기에만 저장된 데이터는 앱의
          삭제 기능 또는 앱 삭제로 제거할 수 있습니다. 외부 AI 제공업체가 처리한 데이터는
          각 서비스의 기업용 처리 조건과 AURA의 계약·설정에 따른 보관 기간이 적용됩니다.
        </Section>
        <Section title="5. 저장·처리 위탁과 보안">
          Amazon Web Services는 서울 리전의 앱 서버·데이터베이스·객체 저장소와 푸시·AI
          처리 인프라 제공에 사용됩니다. 전송 구간 암호화(HTTPS), 인증 기반 접근 제어,
          로그와 권한 관리 등 안전성 확보 조치를 적용합니다. 로그인 세션 정보는 기기의
          보안 저장소에 보관합니다.
        </Section>
        <Section title="6. 이용자의 권리와 행사 방법">
          이용자는 언제든 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수
          있습니다.{'\n'}
          · 계정과 전체 데이터 삭제: 앱 내 [프로필 → 설정 → 계정 관리 → 회원 탈퇴]{'\n'}
          · 얼굴 분석 보고서·측정 데이터 삭제: 해당 보고서 메뉴에서 삭제{'\n'}
          · 외부 AI 전송 동의 확인·철회: [프로필 → 설정 → AI 데이터 관리]{'\n'}
          · 위치·알림 권한 철회: 기기 설정에서 언제든 변경{'\n'}
          동의를 철회하면 새로운 외부 AI 전송은 중단되지만, 철회 전에 생성된 보고서는
          별도로 삭제하거나 회원 탈퇴하기 전까지 보관될 수 있습니다. 다른 보고서 삭제를
          포함한 권리 행사는 아래 문의처로 요청할 수 있으며 확인 후 처리합니다.
        </Section>
        <Section title="7. 판매·광고·추적">
          AURA는 개인정보를 판매하지 않습니다. 얼굴 사진과 TrueDepth 파생값을 광고 또는
          앱 간 추적 목적으로 사용하지 않으며, 외부 AI 처리자는 3항의 기능 제공 목적으로만
          이용합니다.
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
