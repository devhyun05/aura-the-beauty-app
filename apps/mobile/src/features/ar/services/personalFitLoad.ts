// 개인 핏 시트 재생성·화해 — 최신 분석 보고서를 순수 조립(personalFitService)에
// 넘기고 결과를 핏 시트 저장소(lookStore)에 upsert한다. 네트워크·저장 의존이라
// 순수 서비스와 파일 분리(계약 러너는 personalFitService만 컴파일).
//
// 수명주기(확장 기획 v0.2 §5):
// - 분석 완료 시마다 재생성: regenerateAnalysisFitSheet(report) — 리포트를 직접
//   받아 fetch 없이 시트를 만들고 저장한다(분석 플로우 완료 지점에서 호출).
// - AR 진입은 화해(reconcile)로 강등: 저장 시트의 sourceReportId가 최신 리포트와
//   같으면 재생성/상세 fetch를 생략한다.
// - 자동 ★(§5-4): "새 분석"(sourceReportId 변경)일 때만 mainId를 분석 시트로
//   설정한다. 같은 리포트에서 사용자가 껐다면(mainId 이동/해제) 다시 켜지 않는다 —
//   새 분석 = 새 핏이므로 그때 다시 자동 ON.
//
// 실패는 조용히 무해(기존 저장물 유지) — 개인 핏은 부가 기능이라 AR 필터
// 자체를 깨지 않는다.

import {
  getFaceAnalysisReports,
  getFaceAnalysisReportById,
  getLatestFaceAnalysisReport,
} from '../../../shared/services/faceAnalysisService';
import type {StyleLane} from '../../../shared/contracts/personalFitProfile';
import {
  loadFitSheets,
  saveFitSheets,
  type FitSheetsStore,
} from '../stencil/src/storage/lookStore';
import type {FitSheet} from '../stencil/src/composer/fitSheets';
import {
  ANALYSIS_FIT_SHEET_ID,
  buildAnalysisFitSheet,
  buildPersonalFitBaseDeltas,
  type AnalysisFitSheet,
  type PersonalFitBaseDelta,
  type PersonalFitReportInput,
} from './personalFitService';

// 저장된 분석 시트(레거시 포함) — sourceReportId/styleLane은 구버전 시트에 없다.
type StoredAnalysisSheet = FitSheet & {
  sourceReportId?: string;
  styleLane?: StyleLane;
};

function storedAnalysisSheet(store: FitSheetsStore): StoredAnalysisSheet | null {
  return (
    (store.sheets.find(s => s.id === ANALYSIS_FIT_SHEET_ID) as
      | StoredAnalysisSheet
      | undefined) ?? null
  );
}

// 시트 upsert + 자동 ★ 규칙 적용 후 저장. sheet=null이면 stale 분석 시트 제거
// (새 분석에서 발동 규칙이 없는데 옛 분석의 δ가 남아 적용되는 것을 방지).
async function persistAnalysisFitSheet(
  sheet: AnalysisFitSheet | null,
  reportId: string,
): Promise<FitSheetsStore> {
  const store = await loadFitSheets();
  const prev = storedAnalysisSheet(store);

  if (!sheet) {
    if (!prev || prev.sourceReportId === reportId) return store;
    const sheets = store.sheets.filter(s => s.id !== ANALYSIS_FIT_SHEET_ID);
    const next: FitSheetsStore = {
      sheets,
      mainId: store.mainId === ANALYSIS_FIT_SHEET_ID ? null : store.mainId,
    };
    await saveFitSheets(next);
    console.info('[aura:personal-fit] analysis-fit-sheet:removed-stale', {
      previousReportId: prev.sourceReportId ?? null,
      reportId,
    });
    return next;
  }

  const isNewReport = !prev || prev.sourceReportId !== sheet.sourceReportId;
  const sheets = [
    ...store.sheets.filter(s => s.id !== ANALYSIS_FIT_SHEET_ID),
    sheet as unknown as FitSheet,
  ];
  const next: FitSheetsStore = {
    sheets,
    // 자동 ★: 새 분석에서만. 같은 리포트 재화해는 사용자의 켬/끔 선택을 존중.
    mainId: isNewReport ? ANALYSIS_FIT_SHEET_ID : store.mainId,
  };
  await saveFitSheets(next);
  console.info('[aura:personal-fit] analysis-fit-sheet:persisted', {
    autoMain: isNewReport,
    regions: sheet.entries.map(e => e.region),
    reportId: sheet.sourceReportId,
    styleLane: sheet.styleLane,
  });
  return next;
}

/**
 * 분석 완료 시 재생성(§5-1) — 완료된 리포트를 직접 받아 시트를 만들고 저장한다.
 * 레인은 명시 > 저장 시트의 이전 선택(사용자 취향 기억) > balance.
 */
export async function regenerateAnalysisFitSheet(
  report: PersonalFitReportInput,
  styleLane?: StyleLane,
): Promise<void> {
  try {
    const store = await loadFitSheets();
    const lane = styleLane ?? storedAnalysisSheet(store)?.styleLane ?? 'balance';
    const sheet = buildAnalysisFitSheet(report, lane);
    await persistAnalysisFitSheet(sheet, report.id);
  } catch (error) {
    console.info('[aura:personal-fit] analysis-fit-sheet:regenerate-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * AR 진입 화해(§5-3) — 저장 시트가 최신 리포트에서 나왔으면 그대로(상세 fetch 생략),
 * 다르면 상세를 받아 재생성·저장한다. 반환값은 최신 저장 상태(실패 시 기존 저장물).
 */
export async function reconcileAnalysisFitSheet(): Promise<FitSheetsStore> {
  const store = await loadFitSheets();
  try {
    const [latest] = await getFaceAnalysisReports({limit: 1});
    if (!latest) return store;
    const prev = storedAnalysisSheet(store);
    if (prev?.sourceReportId === latest.id) return store;
    // 목록 응답은 measurements가 없어(경량화) 상세로 전체본을 받는다.
    const report = (await getFaceAnalysisReportById(latest.id)) ?? latest;
    const lane = prev?.styleLane ?? 'balance';
    const sheet = buildAnalysisFitSheet(report, lane);
    return await persistAnalysisFitSheet(sheet, report.id);
  } catch (error) {
    console.info('[aura:personal-fit] analysis-fit-sheet:reconcile-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return store;
  }
}

/**
 * 레인 전환(§6) — 저장된 분석 시트의 리포트로 같은 슬롯을 재계산·저장한다.
 * 시트가 없으면 최신 리포트로 새로 만든다. mainId는 그대로(켬/끔 불변).
 */
export async function switchAnalysisFitLane(
  styleLane: StyleLane,
): Promise<FitSheetsStore> {
  const store = await loadFitSheets();
  try {
    const prev = storedAnalysisSheet(store);
    const report = prev?.sourceReportId
      ? await getFaceAnalysisReportById(prev.sourceReportId)
      : await getLatestFaceAnalysisReport();
    if (!report) return store;
    const sheet = buildAnalysisFitSheet(report, styleLane);
    if (!sheet) return store;
    const sheets = [
      ...store.sheets.filter(s => s.id !== ANALYSIS_FIT_SHEET_ID),
      sheet as unknown as FitSheet,
    ];
    // 레인 전환은 같은 리포트 재계산 — 자동 ★ 규칙과 무관하게 mainId 유지.
    const next: FitSheetsStore = {sheets, mainId: store.mainId};
    await saveFitSheets(next);
    return next;
  } catch (error) {
    console.info('[aura:personal-fit] analysis-fit-sheet:lane-switch-failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return store;
  }
}

// ── 레거시 경로(호환 유지) ──────────────────────────────────────────────────

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

// 최신 분석 리포트 → "분석 맞춤 핏" 시트(저장 없이 빌드만). 신규 경로는
// reconcileAnalysisFitSheet를 쓴다 — 이 함수는 기존 호출부 호환용.
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
