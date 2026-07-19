import type {
  MakeupJourneyDayResponse,
  MakeupJourneyFeedbackDigest,
  MakeupJourneyMissionLevel,
  MakeupJourneyReport,
} from '../types';

export function resolveMakeupJourneyActiveReportId(input: {
  currentReportId: string | null;
  initialReportId?: string;
  preserveCurrent: boolean;
  reports: Pick<MakeupJourneyReport, 'reportId'>[];
  representativeReportId: string | null;
}): string | null {
  const reportIds = new Set(input.reports.map(report => report.reportId));

  if (input.initialReportId && reportIds.has(input.initialReportId)) {
    return input.initialReportId;
  }
  if (
    input.preserveCurrent &&
    input.currentReportId &&
    reportIds.has(input.currentReportId)
  ) {
    return input.currentReportId;
  }
  if (
    input.representativeReportId &&
    reportIds.has(input.representativeReportId)
  ) {
    return input.representativeReportId;
  }
  return input.reports.at(-1)?.reportId ?? null;
}

export type MissionDifficultyGuide = {
  description: string;
  duration: string;
  label: string;
  shortDescription: string;
};

const MISSION_DIFFICULTY_GUIDES: Record<MakeupJourneyMissionLevel, MissionDifficultyGuide> = {
  beginner: {
    description: '지금 바로 할 수 있는 작은 뷰티 습관이에요.',
    duration: '1~5분',
    label: '가벼운 습관',
    shortDescription: '가볍게 시작',
  },
  intermediate: {
    description: '앱 기능이나 뷰티 루틴 하나를 해봐요.',
    duration: '5~15분',
    label: '뷰티 루틴',
    shortDescription: '루틴 하나',
  },
  advanced: {
    description: '결과나 기록을 남기는 오늘의 도전이에요.',
    duration: '15~30분',
    label: '오늘의 도전',
    shortDescription: '오늘의 도전',
  },
};

export function getMissionDifficultyGuide(
  level: MakeupJourneyMissionLevel,
): MissionDifficultyGuide {
  return MISSION_DIFFICULTY_GUIDES[level];
}

export type JourneyScorePresentation = {
  label: string;
  deltaLabel: string | null;
};

export function getJourneyScorePresentation(
  detail: Pick<
    MakeupJourneyDayResponse,
    'firstScore' | 'latestScore' | 'scoreDelta' | 'reportCount'
  >,
): JourneyScorePresentation | null {
  if (detail.firstScore === null || detail.latestScore === null) {
    return null;
  }

  if (detail.reportCount <= 1) {
    return {
      label: `최초 ${detail.firstScore} · 최신 ${detail.latestScore}`,
      deltaLabel: null,
    };
  }

  const delta = detail.scoreDelta ?? detail.latestScore - detail.firstScore;
  return {
    label: `최초 ${detail.firstScore} → 최신 ${detail.latestScore}`,
    deltaLabel: `${delta >= 0 ? '+' : ''}${delta}`,
  };
}

export function getJourneyStatusLabel(status: MakeupJourneyDayResponse['status']): string {
  if (status === 'success') {
    return '목표 달성';
  }
  if (status === 'failure') {
    return '목표 미달';
  }
  return '기록 없음';
}

export function getCappedJourneyGoalProgress(
  score: number | null,
  goalScore: number | null,
): number {
  if (score === null || goalScore === null || goalScore <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((score / goalScore) * 100)));
}

export type JourneyDigestContent = {
  headline: string | null;
  strengths: string[];
  improvements: string[];
  nextAction: string | null;
};

export function getJourneyDigestContent(
  digest: MakeupJourneyFeedbackDigest,
): JourneyDigestContent {
  return {
    headline: digest.headline?.trim() || null,
    strengths: digest.strengths.filter(Boolean),
    improvements: digest.improvements.filter(Boolean),
    nextAction: digest.nextAction?.trim() || null,
  };
}

export type MakeupJourneyLandingMode =
  | 'settings-loading'
  | 'settings-error'
  | 'onboarding'
  | 'calendar-loading'
  | 'calendar-error'
  | 'calendar';

export function getMakeupJourneyLandingMode(input: {
  calendarHasData: boolean;
  calendarIsLoading: boolean;
  calendarError: string | null;
  settings: unknown | null;
  settingsError: string | null;
  settingsIsLoading: boolean;
}): MakeupJourneyLandingMode {
  if (input.settingsIsLoading) {
    return 'settings-loading';
  }
  if (input.settingsError && !input.settings) {
    return 'settings-error';
  }
  if (!input.settings) {
    return 'onboarding';
  }
  if (input.calendarIsLoading && !input.calendarHasData) {
    return 'calendar-loading';
  }
  if (input.calendarError && !input.calendarHasData) {
    return 'calendar-error';
  }
  return 'calendar';
}
