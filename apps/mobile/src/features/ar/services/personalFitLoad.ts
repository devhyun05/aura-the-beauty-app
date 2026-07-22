// 개인 핏 기저 델타 비동기 로더 — 최신 분석 보고서를 받아 순수 조립
// (personalFitService)에 넘긴다. 네트워크 의존이라 순수 서비스와 파일 분리
// (계약 러너는 personalFitService만 컴파일).
//
// 실패는 조용히 빈 배열 — 개인 핏은 부가 기능이라 AR 필터 자체를 깨지 않는다.

import {getLatestFaceAnalysisReport} from '../../../shared/services/faceAnalysisService';
import type {StyleLane} from '../../../shared/contracts/personalFitProfile';
import {
  buildAnalysisFitSheet,
  buildPersonalFitBaseDeltas,
  type AnalysisFitSheet,
  type PersonalFitBaseDelta,
} from './personalFitService';

export async function loadPersonalFitBaseDeltas(
  styleLane: StyleLane = 'balance',
): Promise<PersonalFitBaseDelta[]> {
  try {
    const report = await getLatestFaceAnalysisReport();
    const deltas = buildPersonalFitBaseDeltas(report, styleLane);
    if (deltas.length > 0) {
      console.info('[aura:personal-fit] base-deltas:loaded', {
        reportId: report?.id,
        regions: deltas.map(d => d.region),
        styleLane,
      });
    }
    return deltas;
  } catch (error) {
    console.info('[aura:personal-fit] base-deltas:load-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// 최신 분석 리포트 → "분석 맞춤 핏" 시트(저장 라이브러리에 upsert할 후보). 실패/부재/
// 근거없음이면 null(무해). 적용 여부는 스텐실 mainId 토글이 결정한다.
export async function loadAnalysisFitSheet(
  styleLane: StyleLane = 'balance',
): Promise<AnalysisFitSheet | null> {
  try {
    const report = await getLatestFaceAnalysisReport();
    const sheet = buildAnalysisFitSheet(report, styleLane);
    if (sheet) {
      console.info('[aura:personal-fit] analysis-fit-sheet:built', {
        reportId: report?.id,
        regions: sheet.entries.map(e => e.region),
        styleLane,
      });
    }
    return sheet;
  } catch (error) {
    console.info('[aura:personal-fit] analysis-fit-sheet:load-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
