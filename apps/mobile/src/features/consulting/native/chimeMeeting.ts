import {NativeEventEmitter, NativeModules} from 'react-native';

import type {
  ConsultingCallJoinResult,
  ConsultingCallLanguageCode,
} from '../types';

const NATIVE_MODULE_NAME = 'AURAChimeMeeting';
const NATIVE_EVENT_NAME = 'AURAChimeMeetingEvent';

type NativeChimeMeetingModule = {
  initialize?: () => Promise<void>;
  isAvailable?: () => boolean;
  setLocalVideoEnabled?: (enabled: boolean) => Promise<void>;
  setMuted?: (muted: boolean) => Promise<void>;
  startMeeting?: (payloadJson: string) => Promise<void>;
  stopMeeting?: () => Promise<void>;
  switchCamera?: () => Promise<void>;
};

export type ChimeMeetingEvent = {
  attendeeId?: string;
  error?: string;
  eventKind?: 'transcript' | 'transcriptionStatus' | 'unknown';
  externalUserId?: string;
  dropped?: boolean;
  isLocal?: boolean;
  level?: string;
  muted?: boolean;
  present?: boolean;
  results?: ChimeTranscriptResult[];
  state?: string;
  tileId?: number;
  transcript?: unknown;
  transcriptionStatus?: ChimeTranscriptionStatus;
  type:
    | 'meetingStateChanged'
    | 'attendeePresenceChanged'
    | 'videoTileAdded'
    | 'videoTileRemoved'
    | 'audioLevelChanged'
    | 'transcriptEvent'
    | 'meetingError';
};

export type ChimeTranscriptResult = {
  attendeeId?: string;
  channelId?: string;
  content?: string;
  endTimeMs?: number;
  externalUserId?: string;
  isPartial?: boolean;
  languageIdentification?: Array<{
    languageCode?: string;
    score?: number;
  }>;
  resultId?: string;
  sourceLanguageCode?: ConsultingCallLanguageCode;
  speakerType?: 'user' | 'expert' | 'unknown';
  startTimeMs?: number;
};

export type ChimeTranscriptionStatus = {
  eventTimeMs?: number;
  message?: string;
  status?: 'started' | 'interrupted' | 'resumed' | 'stopped' | 'failed' | 'unknown';
  transcriptionRegion?: string;
};

function getNativeChimeMeetingModule(): NativeChimeMeetingModule | undefined {
  return NativeModules[NATIVE_MODULE_NAME] as
    | NativeChimeMeetingModule
    | undefined;
}

export function isNativeChimeMeetingAvailable(): boolean {
  const nativeModule = getNativeChimeMeetingModule();
  return Boolean(
    nativeModule?.isAvailable?.() ??
      (nativeModule?.startMeeting && nativeModule?.stopMeeting),
  );
}

export async function startNativeChimeMeeting(
  joinResult: ConsultingCallJoinResult,
): Promise<boolean> {
  const nativeModule = getNativeChimeMeetingModule();
  if (!nativeModule?.startMeeting) {
    return false;
  }

  await nativeModule.initialize?.();
  await nativeModule.startMeeting(JSON.stringify(joinResult));
  return true;
}

export async function stopNativeChimeMeeting(): Promise<void> {
  await getNativeChimeMeetingModule()?.stopMeeting?.();
}

export async function setNativeChimeMuted(muted: boolean): Promise<void> {
  await getNativeChimeMeetingModule()?.setMuted?.(muted);
}

export async function setNativeChimeLocalVideoEnabled(
  enabled: boolean,
): Promise<void> {
  await getNativeChimeMeetingModule()?.setLocalVideoEnabled?.(enabled);
}

export async function switchNativeChimeCamera(): Promise<void> {
  await getNativeChimeMeetingModule()?.switchCamera?.();
}

export function addNativeChimeMeetingListener(
  listener: (event: ChimeMeetingEvent) => void,
) {
  const nativeModule = getNativeChimeMeetingModule();
  if (!nativeModule) {
    return {remove: () => undefined};
  }

  return new NativeEventEmitter(NativeModules[NATIVE_MODULE_NAME]).addListener(
    NATIVE_EVENT_NAME,
    listener,
  );
}
