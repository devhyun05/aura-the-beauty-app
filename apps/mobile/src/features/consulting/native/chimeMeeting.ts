import {NativeEventEmitter, NativeModules} from 'react-native';

import type {ConsultingCallJoinResult} from '../types';

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
  externalUserId?: string;
  dropped?: boolean;
  isLocal?: boolean;
  level?: string;
  muted?: boolean;
  present?: boolean;
  state?: string;
  tileId?: number;
  type:
    | 'meetingStateChanged'
    | 'attendeePresenceChanged'
    | 'videoTileAdded'
    | 'videoTileRemoved'
    | 'audioLevelChanged'
    | 'meetingError';
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
