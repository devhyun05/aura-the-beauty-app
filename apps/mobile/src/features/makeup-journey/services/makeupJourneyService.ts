import {requestBackendJson} from '../../../shared/services/backendApi';
import {commitMakeupJourneyScoreSelection} from './makeupJourneyCache';
import type {
  MakeupJourneyCalendarResponse,
  MakeupJourneyDayResponse,
  MakeupJourneyMission,
  MakeupJourneyMissionLevel,
  MakeupJourneyNote,
  MakeupJourneySettingsResponse,
  MakeupJourneyScoreSelection,
  MakeupJourneyTrendRange,
  MakeupJourneyTrendResponse,
} from '../types';
import {isIsoDateString, isYearMonthString} from '../utils/date';

function requireIsoDate(date: string): string {
  if (!isIsoDateString(date)) {
    throw new Error('날짜 형식은 YYYY-MM-DD여야 해요.');
  }
  return date;
}

function requireMonth(month: string): string {
  if (!isYearMonthString(month)) {
    throw new Error('월 형식은 YYYY-MM이어야 해요.');
  }
  return month;
}

function requireMissionTitle(title: string): string {
  const normalized = title.trim();
  if (normalized.length < 1 || normalized.length > 120) {
    throw new Error('미션은 1자 이상 120자 이하로 입력해 주세요.');
  }
  return normalized;
}

export async function getMakeupJourneySettings(
  signal?: AbortSignal,
): Promise<MakeupJourneySettingsResponse> {
  return requestBackendJson<MakeupJourneySettingsResponse>('/makeup-journey/settings', {signal});
}

export function saveMakeupJourneySettings(input: {
  goalScore: number;
  missionLevel: MakeupJourneyMissionLevel;
  timezoneName?: string;
}): Promise<MakeupJourneySettingsResponse> {
  const goalScore = Math.round(input.goalScore);
  if (goalScore < 1 || goalScore > 100) {
    return Promise.reject(new Error('목표 점수는 1점부터 100점까지 설정할 수 있어요.'));
  }

  return requestBackendJson<MakeupJourneySettingsResponse>('/makeup-journey/settings', {
    method: 'PUT',
    body: {
      goalScore,
      missionLevel: input.missionLevel,
      timezoneName: input.timezoneName ?? 'Asia/Seoul',
    },
  });
}

export async function getMakeupJourneyCalendar(
  month: string,
  signal?: AbortSignal,
): Promise<MakeupJourneyCalendarResponse> {
  const resolvedMonth = requireMonth(month);
  return requestBackendJson<MakeupJourneyCalendarResponse>(
    `/makeup-journey/calendar?month=${encodeURIComponent(resolvedMonth)}`,
    {signal},
  );
}

export async function getMakeupJourneyDay(
  entryDate: string,
  signal?: AbortSignal,
): Promise<MakeupJourneyDayResponse> {
  const resolvedDate = requireIsoDate(entryDate);
  return requestBackendJson<MakeupJourneyDayResponse>(
    `/makeup-journey/days/${encodeURIComponent(resolvedDate)}`,
    {signal},
  );
}

export async function getMakeupJourneyTrend(
  range: MakeupJourneyTrendRange,
  endDate: string,
  signal?: AbortSignal,
): Promise<MakeupJourneyTrendResponse> {
  const resolvedEndDate = requireIsoDate(endDate);
  return requestBackendJson<MakeupJourneyTrendResponse>(
    `/makeup-journey/trends?range=${encodeURIComponent(range)}&endDate=${encodeURIComponent(
      resolvedEndDate,
    )}`,
    {signal},
  );
}

export async function saveMakeupJourneyNote(
  entryDate: string,
  content: string,
  reportId: string | null = null,
): Promise<MakeupJourneyNote | null> {
  if (content.length > 2000) {
    throw new Error('메모는 2,000자 이하로 입력해 주세요.');
  }
  const response = await requestBackendJson<{note: MakeupJourneyNote | null}>(
    `/makeup-journey/days/${encodeURIComponent(requireIsoDate(entryDate))}/note`,
    {method: 'PUT', body: {content, reportId}},
  );
  return response.note;
}

export async function selectMakeupJourneyScore(
  entryDate: string,
  reportId: string,
): Promise<MakeupJourneyScoreSelection> {
  const response = await requestBackendJson<MakeupJourneyScoreSelection>(
    `/makeup-journey/days/${encodeURIComponent(requireIsoDate(entryDate))}/score-selection`,
    {method: 'PUT', body: {reportId}},
  );
  commitMakeupJourneyScoreSelection(response);
  return response;
}

export async function generateMakeupJourneyMissions(
  entryDate: string,
): Promise<MakeupJourneyMission[]> {
  const response = await requestBackendJson<{missions: MakeupJourneyMission[]}>(
    `/makeup-journey/days/${encodeURIComponent(requireIsoDate(entryDate))}/missions/generate`,
    {method: 'POST', body: {count: 3}},
  );
  return response.missions;
}

export async function createMakeupJourneyMission(
  entryDate: string,
  title: string,
): Promise<MakeupJourneyMission> {
  const response = await requestBackendJson<{mission: MakeupJourneyMission}>(
    `/makeup-journey/days/${encodeURIComponent(requireIsoDate(entryDate))}/missions`,
    {method: 'POST', body: {title: requireMissionTitle(title)}},
  );
  return response.mission;
}

export async function updateMakeupJourneyMission(
  missionId: string,
  patch: {isCompleted?: boolean; title?: string},
): Promise<MakeupJourneyMission> {
  const response = await requestBackendJson<{mission: MakeupJourneyMission}>(
    `/makeup-journey/missions/${encodeURIComponent(missionId)}`,
    {
      method: 'PATCH',
      body: {
        ...patch,
        ...(patch.title === undefined ? {} : {title: requireMissionTitle(patch.title)}),
      },
    },
  );
  return response.mission;
}

export async function deleteMakeupJourneyMission(missionId: string): Promise<void> {
  await requestBackendJson<{deleted: true; missionId: string}>(
    `/makeup-journey/missions/${encodeURIComponent(missionId)}`,
    {method: 'DELETE'},
  );
}
