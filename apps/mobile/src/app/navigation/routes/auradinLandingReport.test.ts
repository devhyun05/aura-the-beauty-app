// R1 게이트 2 — Auradin 랜딩 리포트 해석(라우팅 분기 유닛) 검증
// (프로젝트 관례: expectEqual + tsc --noEmit 게이트).

import {resolveAuradinLandingReport} from './auradinLandingReport';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

const sessionReport = {id: 'report-1', personalColor: '여름 쿨 라이트'};

// ① 얼굴분석 완료 직후 (param 없음, flow state 리포트 보유) → 동기 ready + 톤 첨부
const afterAnalysis = resolveAuradinLandingReport(null, sessionReport);
expectEqual(afterAnalysis.kind, 'ready', 'after-analysis resolves synchronously');
if (afterAnalysis.kind === 'ready') {
  expectEqual(afterAnalysis.report?.id, 'report-1', 'after-analysis report id');
  expectEqual(
    afterAnalysis.report?.personalColor,
    '여름 쿨 라이트',
    'after-analysis attaches personalColor',
  );
}

// ② 리포트 상세 → 추천 진입: param이 선택 리포트와 같으면 동기 ready
const sameReport = resolveAuradinLandingReport('report-1', sessionReport);
expectEqual(sameReport.kind, 'ready', 'same-report param resolves synchronously');

// ③ 과거(다른) 리포트 상세 → 추천 진입: 상세 GET으로 personalColor 확보 필요
const pastReport = resolveAuradinLandingReport('report-9', sessionReport);
expectEqual(pastReport.kind, 'fetch', 'different report id requires fetch');
if (pastReport.kind === 'fetch') {
  expectEqual(pastReport.reportId, 'report-9', 'fetch targets the param report');
}

// ④ 선택 리포트가 톤을 비웠으면 param 리포트를 fetch (빈 문자열 방어)
const emptyTone = resolveAuradinLandingReport('report-1', {id: 'report-1', personalColor: '  '});
expectEqual(emptyTone.kind, 'fetch', 'blank personalColor falls through to fetch');

// ⑤ 리포트 문맥 자체가 없으면 첨부 없이 진입 (broad 흐름)
const noContext = resolveAuradinLandingReport(null, null);
expectEqual(noContext.kind, 'ready', 'no context resolves synchronously');
if (noContext.kind === 'ready') {
  expectEqual(noContext.report, null, 'no context attaches nothing');
}

console.log('auradinLandingReport contract assertions passed');
