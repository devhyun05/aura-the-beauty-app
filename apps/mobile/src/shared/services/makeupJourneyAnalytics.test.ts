import {
  MAKEUP_JOURNEY_ANALYTICS_EVENT_NAMES,
  createMakeupJourneyBackendAnalyticsAdapter,
  setMakeupJourneyAnalyticsAdapter,
  trackMakeupJourneyEvent,
  type MakeupJourneyAnalyticsEvent,
} from './makeupJourneyAnalytics';
import type {BackendJsonRequestInit} from './backendApi';

const events: MakeupJourneyAnalyticsEvent[] = [];
setMakeupJourneyAnalyticsAdapter({
  track: event => {
    events.push(event);
  },
});

trackMakeupJourneyEvent({
  name: 'makeup_journey_correction_started',
  properties: {},
});
trackMakeupJourneyEvent({
  name: 'makeup_journey_correction_completed',
  properties: {scoreDelta: 8},
});
trackMakeupJourneyEvent({
  name: 'floating_action_repositioned',
  properties: {quadrant: 'bottomRight'},
});

if (events.length !== 3) {
  throw new Error('journey analytics events must reach the configured adapter');
}

if (
  MAKEUP_JOURNEY_ANALYTICS_EVENT_NAMES.includes(
    'floating_action_repositioned',
  ) !== true
) {
  throw new Error('floating action analytics event name must remain stable');
}

const requests: Array<{
  body: unknown;
  method: string | undefined;
  path: string;
  timeoutMs: number | undefined;
}> = [];
const backendAdapter = createMakeupJourneyBackendAnalyticsAdapter(
  async <T>(path: string, init?: BackendJsonRequestInit) => {
    requests.push({
      body: init?.body,
      method: init?.method,
      path,
      timeoutMs: init?.timeoutMs,
    });
    return {
      accepted: true,
      eventName: 'makeup_journey_opened',
    } as T;
  },
);

void backendAdapter.track({
  name: 'makeup_journey_opened',
  properties: {hasRecords: true, month: '2026-07'},
});

if (
  requests.length !== 1 ||
  requests[0]?.path !== '/makeup-journey/analytics/events' ||
  requests[0]?.method !== 'POST' ||
  requests[0]?.timeoutMs !== 5000
) {
  throw new Error('journey analytics backend adapter must send one bounded POST request');
}

if (
  JSON.stringify(requests[0]?.body) !==
  JSON.stringify({
    name: 'makeup_journey_opened',
    properties: {hasRecords: true, month: '2026-07'},
  })
) {
  throw new Error('journey analytics backend adapter must forward only the typed event payload');
}

setMakeupJourneyAnalyticsAdapter();
