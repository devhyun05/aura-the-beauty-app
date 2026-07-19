// R1 게이트 2 — 추천 랜딩이 Auradin으로 전환됐을 때의 reportId/personalColor 전달 계약.
//
// 얼굴분석 완료 직후에는 nav flow state의 selectedFaceAnalysisReport가 방금 리포트를
// 들고 있고, 과거 리포트 상세 → 추천 진입은 route param(reportId)만 온다. 이 함수가
// "동기 확보 가능(ready)" / "서버 상세 조회 필요(fetch)" / "첨부 없음(ready+null)"을
// 한 곳에서 판정한다. personalColor는 attachments.ts의 report 첨부 → context.personalColor
// 릴레이를 그대로 재사용한다 (AuradinSearchScreen availableReport 시드).

// skinType은 백엔드 report_profile의 C4 finish soft 선호를 살린다(있으면 릴레이).
export type AuradinLandingReport = {id?: string; personalColor: string; skinType?: string};

export type AuradinLandingReportResolution =
  | {kind: 'ready'; report: AuradinLandingReport | null}
  | {kind: 'fetch'; reportId: string};

export function resolveAuradinLandingReport(
  paramReportId: string | null | undefined,
  selectedReport:
    | {id: string; personalColor?: string | null; skinType?: string | null}
    | null
    | undefined,
): AuradinLandingReportResolution {
  const selectedTone = selectedReport?.personalColor?.trim();

  // 선택 리포트가 톤을 들고 있고, param이 없거나 같은 리포트를 가리키면 동기 사용.
  if (selectedReport && selectedTone && (!paramReportId || paramReportId === selectedReport.id)) {
    return {
      kind: 'ready',
      report: {
        id: selectedReport.id,
        personalColor: selectedTone,
        ...(selectedReport.skinType ? {skinType: selectedReport.skinType} : {}),
      },
    };
  }

  // 다른(과거) 리포트로 진입 — 상세 GET으로 personalColor를 받아 첨부한다.
  if (paramReportId) {
    return {kind: 'fetch', reportId: paramReportId};
  }

  // 리포트 문맥 없음 — 첨부 없이 Auradin 홈으로 (broad 흐름).
  return {kind: 'ready', report: null};
}
