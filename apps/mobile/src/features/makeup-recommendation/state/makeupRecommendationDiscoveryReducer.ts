import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {MakeupRecommendationDiscovery, MakeupSituation} from '../types';

export type MakeupRecommendationDiscoveryState = {
  reports: FaceAnalysisReport[];
  reportStatus: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  reportError?: string;
  selectedReportId: string | null;
  catalog: MakeupRecommendationDiscovery | null;
  catalogStatus: 'idle' | 'loading' | 'ready' | 'error';
  catalogError?: string;
  selectedSituationId: string | null;
  selectedKeywordId: string | null;
  customOpen: boolean;
  customSituationText: string;
};

export type MakeupRecommendationDiscoveryAction =
  | {type: 'reports/loading'}
  | {type: 'reports/loaded'; reports: FaceAnalysisReport[]; preferredReportId?: string}
  | {type: 'report/detailLoaded'; report: FaceAnalysisReport}
  | {type: 'reports/failed'; message: string}
  | {type: 'catalog/loading'}
  | {type: 'catalog/loaded'; catalog: MakeupRecommendationDiscovery}
  | {type: 'catalog/failed'; message: string}
  | {type: 'report/selected'; reportId: string}
  | {type: 'situation/selected'; situationId: string}
  | {type: 'keyword/selected'; keywordId: string}
  | {type: 'custom/opened'}
  | {type: 'custom/closed'}
  | {type: 'custom/changed'; value: string}
  | {type: 'intent/reset'};

export const initialMakeupRecommendationDiscoveryState: MakeupRecommendationDiscoveryState = {
  reports: [],
  reportStatus: 'idle',
  selectedReportId: null,
  catalog: null,
  catalogStatus: 'idle',
  selectedSituationId: null,
  selectedKeywordId: null,
  customOpen: false,
  customSituationText: '',
};

// 세션 동안 유지되는 인메모리 캐시. 추천 진입 시 캐시가 있으면 로딩 화면 없이 바로
// 이전 보고서·상황 목록을 보여주고 백그라운드로 갱신한다(stale-while-revalidate).
// 계정 전환/로그아웃 시 authSessionContext가 clearMakeupDiscoveryCache로 비운다.
let cachedReports: FaceAnalysisReport[] | null = null;
let cachedCatalog: MakeupRecommendationDiscovery | null = null;

export function cacheMakeupDiscoveryReports(reports: FaceAnalysisReport[]): void {
  cachedReports = reports;
}

export function cacheMakeupDiscoveryCatalog(catalog: MakeupRecommendationDiscovery): void {
  cachedCatalog = catalog;
}

export function clearMakeupDiscoveryCache(): void {
  cachedReports = null;
  cachedCatalog = null;
}

export function buildInitialMakeupRecommendationDiscoveryState(): MakeupRecommendationDiscoveryState {
  const reports = cachedReports ?? [];
  return {
    ...initialMakeupRecommendationDiscoveryState,
    reports,
    reportStatus: cachedReports ? (reports.length > 0 ? 'ready' : 'empty') : 'idle',
    selectedReportId: reports[0]?.id ?? null,
    catalog: cachedCatalog,
    catalogStatus: cachedCatalog ? 'ready' : 'idle',
  };
}

export function makeupRecommendationDiscoveryReducer(
  state: MakeupRecommendationDiscoveryState,
  action: MakeupRecommendationDiscoveryAction,
): MakeupRecommendationDiscoveryState {
  switch (action.type) {
    case 'reports/loading':
      // 캐시로 이미 표시 중이면(ready/empty) 로딩 화면 대신 조용히 갱신한다.
      return state.reportStatus === 'ready' || state.reportStatus === 'empty'
        ? {...state, reportError: undefined}
        : {...state, reportStatus: 'loading', reportError: undefined};
    case 'reports/loaded': {
      const preferred = action.preferredReportId
        ? action.reports.find(report => report.id === action.preferredReportId)
        : undefined;
      const selectedStillExists = action.reports.some(report => report.id === state.selectedReportId);
      return {
        ...state,
        reports: action.reports,
        reportStatus: action.reports.length > 0 ? 'ready' : 'empty',
        reportError: undefined,
        selectedReportId: preferred?.id ?? (selectedStillExists ? state.selectedReportId : action.reports[0]?.id ?? null),
      };
    }
    case 'report/detailLoaded':
      if (!state.reports.some(report => report.id === action.report.id)) {
        return state;
      }
      return {
        ...state,
        reports: state.reports.map(report =>
          report.id === action.report.id ? action.report : report),
      };
    case 'reports/failed':
      return {...state, reportStatus: 'error', reportError: action.message};
    case 'catalog/loading':
      // 캐시로 이미 표시 중이면 로딩 화면 대신 조용히 갱신한다.
      return state.catalogStatus === 'ready'
        ? {...state, catalogError: undefined}
        : {...state, catalogStatus: 'loading', catalogError: undefined};
    case 'catalog/loaded': {
      const selectedStillExists = action.catalog.situations.some(
        situation => situation.id === state.selectedSituationId,
      );
      return {
        ...state,
        catalog: action.catalog,
        catalogStatus: 'ready',
        catalogError: undefined,
        selectedSituationId: selectedStillExists ? state.selectedSituationId : null,
        selectedKeywordId: selectedStillExists ? state.selectedKeywordId : null,
      };
    }
    case 'catalog/failed':
      return {...state, catalogStatus: 'error', catalogError: action.message};
    case 'report/selected':
      return {...state, selectedReportId: action.reportId};
    case 'situation/selected':
      return {
        ...state,
        selectedSituationId: action.situationId,
        selectedKeywordId: null,
        customOpen: false,
        customSituationText: '',
      };
    case 'keyword/selected':
      return {...state, selectedKeywordId: action.keywordId, customOpen: false};
    case 'custom/opened':
      return {
        ...state,
        customOpen: true,
        selectedSituationId: null,
        selectedKeywordId: null,
      };
    case 'custom/closed':
      return {...state, customOpen: false, customSituationText: ''};
    case 'custom/changed':
      return {...state, customSituationText: action.value};
    case 'intent/reset':
      return {
        ...state,
        selectedSituationId: null,
        selectedKeywordId: null,
        customOpen: false,
        customSituationText: '',
      };
    default:
      return state;
  }
}

export function getSelectedMakeupSituation(
  state: MakeupRecommendationDiscoveryState,
): MakeupSituation | undefined {
  return state.catalog?.situations.find(situation => situation.id === state.selectedSituationId);
}

export function getSelectedFaceAnalysisReport(
  state: MakeupRecommendationDiscoveryState,
): FaceAnalysisReport | undefined {
  return state.reports.find(report => report.id === state.selectedReportId);
}