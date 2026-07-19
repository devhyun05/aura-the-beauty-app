// 구(舊) 보고서 상세 화면의 프레젠테이션 모델이었으나, 라우트가 face-report
// S1~S7 신규 UI로 이관되며 요약 아이템만 살아남았다(fromFaceAnalysisReport.ts가
// 유일한 사용처). 나머지 guidePoint·liquid-glass·placement 계열 export는
// 어디서도 렌더되지 않는 죽은 코드라 제거했다 — 특히 getGuidePoint는 LLM
// detail 내용과 무관하게 카테고리 고정 문구를 반환해 오해를 부르던 코드였다.
import {getMeasuredPersonalColorSummary} from '../../personal-color/services/personalColorCore/presentation';
import type {MeasuredPersonalColorView} from './faceAnalysisMeasurements';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';

export type FaceAnalysisReportSummaryItem = {
  label: string;
  value: string;
};

function compactSummaryLabel(value: string | null | undefined): string {
  const text = value?.trim() ?? '';
  if (!text) {
    return '측정 보류';
  }
  const normalized = text
    .replace(/에 가까운/g, '')
    .replace(/얼굴/g, '')
    .replace(/부드러운 윤곽/g, '')
    .replace(/상대적으로/g, '')
    .replace(/길어 온/g, '긴')
    .replace(/[,.，。].*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/계란|타원/.test(normalized)) return '계란형';
  if (/긴 타원|세로|긴형|길/.test(normalized)) return '긴형';
  if (/둥근/.test(normalized)) return '둥근형';
  if (/각진|사각/.test(normalized)) return '각진형';
  if (/하트/.test(normalized)) return '하트형';
  if (/다이아/.test(normalized)) return '다이아몬드형';
  if (/중안부/.test(normalized)) return '중안부 강조형';
  if (/상안부/.test(normalized)) return '상안부 강조형';
  if (/하안부/.test(normalized)) return '하안부 강조형';
  if (/균형/.test(normalized)) return '균형형';

  return normalized.length > 12 ? `${normalized.slice(0, 12)}…` : normalized;
}

function resolveCompactFaceShape(report: FaceAnalysisReport): string {
  return compactSummaryLabel(report.faceAnalysisV2?.derived.faceShape?.label ?? report.faceShape);
}

function resolveCompactBalance(report: FaceAnalysisReport): string {
  return compactSummaryLabel(report.faceAnalysisV2?.derived.verticalBalance?.label);
}

export function getFaceAnalysisReportSummaryItems(
  report: FaceAnalysisReport,
  personalColor: MeasuredPersonalColorView | null = null,
): FaceAnalysisReportSummaryItem[] {
  const measured = getMeasuredPersonalColorSummary(personalColor ?? {axes: {} as MeasuredPersonalColorView['axes'], tone: null});
  return [
    {label: '퍼스널 컬러', value: measured.personalColor},
    {label: '얼굴형', value: resolveCompactFaceShape(report)},
    {label: '비율 특징', value: resolveCompactBalance(report)},
    {label: '톤 요약', value: measured.toneSummary},
  ];
}
