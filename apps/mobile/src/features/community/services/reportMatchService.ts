import {getLatestFaceAnalysisReport} from '../../../shared/services/faceAnalysisService';
import type {FaceAnalysisReport} from '../../../shared/types/faceAnalysis';
import type {CommunityThreadSummary} from '../types';

/**
 * 리포트 매칭 — 최신 AI 분석 리포트와 커뮤니티 룩의 궁합을 룰 기반으로 점수화한다.
 * ML이 아니라 도메인 사전(퍼스널컬러 계열 → 어울리는 룩 키워드) + 키워드 겹침 계산이다.
 * AI는 분석 단계(리포트 생성)에 있고, 매칭은 그 출력을 소비하는 결정적 로직.
 */

// 퍼스널컬러 계열별 어울리는 룩 키워드 사전.
const toneKeywordDictionary: Array<{keywords: string[]; match: RegExp}> = [
  {
    keywords: ['코랄', '피치', '살구', '글로우', '윤광', '물광', '청순', '봄웜'],
    match: /봄|spring/i,
  },
  {
    keywords: ['로즈', '뮤트', '뮤트핑크', '말린장미', '라벤더', '쿨핑크', '쿨톤'],
    match: /여름|summer/i,
  },
  {
    keywords: ['브라운', '음영', '베이지', '테라코타', 'MLBB', '가을웜'],
    match: /가을|autumn|fall/i,
  },
  {
    keywords: ['버건디', '푸시아', '레드', '스모키', '대비', '겨울쿨'],
    match: /겨울|winter/i,
  },
];

// 피부 타입 → 어울리는 질감 키워드.
const skinKeywordDictionary: Array<{keywords: string[]; match: RegExp}> = [
  {keywords: ['글로우', '물광', '윤광', '촉촉'], match: /건성/},
  {keywords: ['매트', '세미매트', '보송'], match: /지성/},
];

export type ReportMatchContext = {
  keywords: string[];
  reportId: string;
  reportTitle: string;
};

export type ThreadMatchResult = {
  matchedKeywords: string[];
  percent: number;
};

// 배지를 노출하는 최소 매칭 점수.
export const MATCH_BADGE_THRESHOLD = 55;

function tokenize(text: string): string[] {
  return text
    .split(/[\s,·]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

export function buildReportMatchContext(report: FaceAnalysisReport): ReportMatchContext {
  const keywords = new Set<string>();

  report.tags.forEach(tag => keywords.add(tag));
  tokenize(`${report.recommendedMood} ${report.toneSummary}`).forEach(token => keywords.add(token));

  toneKeywordDictionary
    .filter(entry => entry.match.test(report.personalColor))
    .forEach(entry => entry.keywords.forEach(keyword => keywords.add(keyword)));

  skinKeywordDictionary
    .filter(entry => entry.match.test(report.skinType))
    .forEach(entry => entry.keywords.forEach(keyword => keywords.add(keyword)));

  return {
    keywords: [...keywords],
    reportId: report.id,
    reportTitle: report.reportTitle,
  };
}

export async function loadReportMatchContext(): Promise<ReportMatchContext | null> {
  try {
    const report = await getLatestFaceAnalysisReport();
    return report ? buildReportMatchContext(report) : null;
  } catch {
    // 리포트가 없거나 로드 실패 시 매칭 배지 없이 동작한다.
    return null;
  }
}

export function computeThreadMatch(
  context: ReportMatchContext,
  thread: Pick<CommunityThreadSummary, 'moodTags' | 'situationTags' | 'title'>,
): ThreadMatchResult {
  const threadKeywords = new Set<string>([
    ...thread.moodTags,
    ...thread.situationTags,
    ...tokenize(thread.title),
  ]);

  const matchedKeywords = [...threadKeywords].filter(threadKeyword =>
    context.keywords.some(reportKeyword =>
      threadKeyword.includes(reportKeyword) || reportKeyword.includes(threadKeyword),
    ),
  );

  if (matchedKeywords.length === 0) {
    return {matchedKeywords, percent: 0};
  }

  // 1개 매칭=58%, 2개=76%, 3개 이상=94~96%로 수렴.
  const percent = Math.min(96, 40 + matchedKeywords.length * 18);

  return {matchedKeywords, percent};
}
