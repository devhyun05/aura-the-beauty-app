/**
 * 체형 프로필(7문항 체감 설문 원답)을 이름 없는 단일 레코드로 영속 저장/로드한다.
 * scentProfileStore와 같은 규약: AsyncStorage로 앱 재시작 뒤에도 유지되며, 네이티브
 * 미링크·저장소 오류 등으로 실패해도 세션 메모리 미러로 폴백해 앱이 도는 동안엔
 * 저장/재사용이 유지된다(영속화는 best-effort — 실패해도 크래시하지 않는다).
 *
 * 단일 값이고 "미설정(null)"도 유효한 상태이므로, 미러가 채워졌는지 여부를
 * mirrorLoaded로 따로 추적해 null 저장과 "아직 안 읽음"을 구분한다.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {isBodyProfile, type BodyProfile} from '../composer/bodyProfile';

/** 스키마 버전을 키에 박아 둔다 — 포맷이 바뀌면 키를 올려 옛 데이터를 무시. */
const STORAGE_KEY = 'armakeup.bodyProfile.v1';

// AsyncStorage가 없거나(테스트·미링크) 실패해도 앱 세션 동안 값을 유지하는 미러.
let mirror: BodyProfile | null = null;
// 미러가 스토어에서 한 번이라도 채워졌는지(값이 null이어도 "읽음"일 수 있어 별도 추적).
let mirrorLoaded = false;

/** 저장된 프로필을 읽는다. 없거나 손상됐으면(isBodyProfile 불통과) null. */
export const loadBodyProfile = async (): Promise<BodyProfile | null> => {
  if (mirrorLoaded) return mirror;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    mirror = isBodyProfile(parsed) ? parsed : null;
  } catch {
    // 파싱·저장소 오류 — 미설정으로 취급.
    mirror = null;
  }
  mirrorLoaded = true;
  return mirror;
};

/** 프로필을 저장한다(교체). 영속화 실패해도 세션 미러엔 반영된다. */
export const saveBodyProfile = async (p: BodyProfile): Promise<void> => {
  mirror = p;
  mirrorLoaded = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // 영속화 실패(네이티브 미링크 등) — 세션 미러엔 이미 반영됨.
  }
};

/** 프로필을 지운다(다시 설문 받기 등). 세션 미러도 비운다. */
export const clearBodyProfile = async (): Promise<void> => {
  mirror = null;
  mirrorLoaded = true;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // 삭제 실패해도 세션 미러는 이미 비워졌다.
  }
};

/** 테스트 전용 — 세션 미러 상태를 초기화(스토어 격리). */
export const __resetForTests = (): void => {
  mirror = null;
  mirrorLoaded = false;
};
