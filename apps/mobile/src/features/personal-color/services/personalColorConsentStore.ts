// 퍼스널 컬러 민감정보(얼굴 이미지) 동의 플래그. feature-scoped just-in-time 동의.
// expo-secure-store 사용(앱 직접 의존성). 촬영 전 게이트가 이 값을 확인.

import * as SecureStore from 'expo-secure-store';

const CONSENT_KEY = 'personalColorConsentAcceptedAt';

export async function getPersonalColorConsent(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(CONSENT_KEY);
  } catch {
    return null;
  }
}

export async function hasPersonalColorConsent(): Promise<boolean> {
  return (await getPersonalColorConsent()) != null;
}

export async function acceptPersonalColorConsent(nowIso: string): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_KEY, nowIso);
}

export async function revokePersonalColorConsent(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CONSENT_KEY);
  } catch {
    // 이미 없으면 무시
  }
}
