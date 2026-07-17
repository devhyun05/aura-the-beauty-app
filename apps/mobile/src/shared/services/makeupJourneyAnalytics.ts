import {
  requestBackendJson,
  type BackendJsonRequestInit,
} from './backendApi';

export const MAKEUP_JOURNEY_ANALYTICS_EVENT_NAMES = [
  'makeup_journey_opened',
  'makeup_journey_day_opened',
  'makeup_journey_settings_saved',
  'makeup_journey_mission_completed',
  'makeup_journey_correction_started',
  'makeup_journey_correction_completed',
  'floating_action_repositioned',
] as const;

export type MakeupJourneyAnalyticsEvent =
  | {
      name: 'makeup_journey_opened';
      properties: {hasRecords: boolean; month: string};
    }
  | {
      name: 'makeup_journey_day_opened';
      properties: {
        hasReport: boolean;
        reportCount: number;
        status: 'success' | 'failure' | 'empty';
      };
    }
  | {
      name: 'makeup_journey_settings_saved';
      properties: {
        goalScore: number;
        missionLevel: 'beginner' | 'intermediate' | 'advanced';
      };
    }
  | {
      name: 'makeup_journey_mission_completed';
      properties: {
        difficulty: 'beginner' | 'intermediate' | 'advanced';
        source: 'curated' | 'ai' | 'user';
      };
    }
  | {name: 'makeup_journey_correction_started'; properties: Record<string, never>}
  | {
      name: 'makeup_journey_correction_completed';
      properties: {scoreDelta: number};
    }
  | {
      name: 'floating_action_repositioned';
      properties: {
        quadrant: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
      };
    };

export type MakeupJourneyAnalyticsAdapter = {
  track: (event: MakeupJourneyAnalyticsEvent) => Promise<void> | void;
};

type MakeupJourneyAnalyticsRequest = <T>(
  path: string,
  init?: BackendJsonRequestInit,
) => Promise<T>;

type MakeupJourneyAnalyticsAccepted = {
  accepted: true;
  eventName: MakeupJourneyAnalyticsEvent['name'];
};

const ANALYTICS_REQUEST_TIMEOUT_MS = 5000;

export function createMakeupJourneyBackendAnalyticsAdapter(
  request: MakeupJourneyAnalyticsRequest = requestBackendJson,
): MakeupJourneyAnalyticsAdapter {
  return {
    track: async event => {
      await request<MakeupJourneyAnalyticsAccepted>(
        '/makeup-journey/analytics/events',
        {
          body: event,
          method: 'POST',
          timeoutMs: ANALYTICS_REQUEST_TIMEOUT_MS,
        },
      );
    },
  };
}

export const makeupJourneyBackendAnalyticsAdapter =
  createMakeupJourneyBackendAnalyticsAdapter();

const noopAdapter: MakeupJourneyAnalyticsAdapter = {track: () => undefined};
let adapter: MakeupJourneyAnalyticsAdapter = noopAdapter;

export function setMakeupJourneyAnalyticsAdapter(
  nextAdapter: MakeupJourneyAnalyticsAdapter = noopAdapter,
): void {
  adapter = nextAdapter;
}

export function trackMakeupJourneyEvent(
  event: MakeupJourneyAnalyticsEvent,
): void {
  try {
    const result = adapter.track(event);

    if (result && typeof result.catch === 'function') {
      void result.catch(() => undefined);
    }
  } catch {
    // 분석 전송 실패는 사용자 흐름을 방해하지 않는다.
  }
}
