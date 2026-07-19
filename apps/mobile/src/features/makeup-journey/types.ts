import type {MakeupFeedbackContext} from '../makeup-feedback/types';

export type MakeupJourneyMissionLevel = 'beginner' | 'intermediate' | 'advanced';
export type MakeupJourneyStatus = 'success' | 'failure' | 'empty';
export type MakeupJourneyFeedbackKind = 'initial' | 'correction';
export type MakeupJourneyMissionSource = 'curated' | 'ai' | 'user';
export type MakeupJourneyTrendRange = '7d' | '30d' | '90d';

export type MakeupJourneySettings = {
  goalScore: number;
  missionLevel: MakeupJourneyMissionLevel;
  timezoneName: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MakeupJourneySettingsResponse = {
  settings: MakeupJourneySettings | null;
  requiresOnboarding: boolean;
};

export type MakeupJourneyMissionSummary = {
  completed: number;
  total: number;
};

export type MakeupJourneyCalendarDay = {
  date: string;
  status: MakeupJourneyStatus;
  firstScore: number | null;
  latestScore: number | null;
  representativeReportId: string | null;
  representativeScore: number | null;
  representativeThumbnailUrl: string | null;
  scoreDelta: number | null;
  reportCount: number;
  hasNote: boolean;
  missionSummary: MakeupJourneyMissionSummary;
};

export type MakeupJourneyMonthSummary = {
  averageScore: number | null;
  recordedDays: number;
  currentStreak: number;
};

export type MakeupJourneyCalendarResponse = {
  month: string;
  goalScore: number | null;
  summary: MakeupJourneyMonthSummary;
  days: MakeupJourneyCalendarDay[];
};

export type MakeupJourneyFeedbackDigest = {
  reportId: string;
  headline: string | null;
  strengthCount: number;
  strengths: string[];
  improvementCount: number;
  improvements: string[];
  nextAction: string | null;
};

export type MakeupJourneyReport = {
  reportId: string;
  score: number;
  feedbackKind: MakeupJourneyFeedbackKind;
  parentFeedbackReportId: string | null;
  completedAt: string;
  imageUrl: string | null;
  goalContext: Partial<MakeupFeedbackContext> & Record<string, unknown>;
  feedbackDigest: MakeupJourneyFeedbackDigest | null;
  note: MakeupJourneyNote | null;
};

export type MakeupJourneyMission = {
  id: string;
  source: MakeupJourneyMissionSource;
  difficulty: MakeupJourneyMissionLevel;
  title: string;
  isCompleted: boolean;
  completedAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MakeupJourneyNote = {
  content: string;
  createdAt?: string;
  updatedAt?: string;
};

export type MakeupJourneyDayResponse = {
  date: string;
  goalScore: number | null;
  status: MakeupJourneyStatus;
  firstScore: number | null;
  latestScore: number | null;
  representativeReportId: string | null;
  representativeScore: number | null;
  scoreDelta: number | null;
  reportCount: number;
  feedbackDigest: MakeupJourneyFeedbackDigest | null;
  reports: MakeupJourneyReport[];
  missions: MakeupJourneyMission[];
  note: MakeupJourneyNote | null;
};

export type MakeupJourneyScoreSelection = {
  date: string;
  reportId: string;
  score: number;
  updatedAt: string;
};

export type MakeupJourneyTrendPoint = {
  date: string;
  score: number;
  status: Exclude<MakeupJourneyStatus, 'empty'>;
};

export type MakeupJourneyTrendSummary = {
  firstScore: number | null;
  latestScore: number | null;
  highestScore: number | null;
  averageScore: number | null;
};

export type MakeupJourneyTrendResponse = {
  range: MakeupJourneyTrendRange;
  goalScore: number | null;
  points: MakeupJourneyTrendPoint[];
  summary: MakeupJourneyTrendSummary;
};

export type MakeupJourneyCorrectionContext = {
  entryDate: string;
  feedbackKind: 'correction';
  parentFeedbackReportId: string;
  inheritedGoalContext: MakeupFeedbackContext;
  parentScore: number;
};

export type MakeupJourneyCacheTarget = {
  entryDate?: string;
  month?: string;
};
