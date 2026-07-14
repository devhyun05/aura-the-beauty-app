/**
 * 제형 스튜디오(#21) — 사용자가 만든 커스텀 마감(제형)을 이름 붙여 저장·재사용.
 * 제형 = 부위 무관 마감 세부 번들(광 임계·게인·펄 크기·밀도·억제 0..1). 잎에 꽂을 때
 * 부위별 브리지 필드로 번역된다(regions.finishBundleToPatch). 마감 축 finish 버튼 줄에
 * 저장된 커스텀 제형이 ◈로 추가된다.
 *
 * styleStore/lookStore와 같은 원칙: AsyncStorage best-effort + 세션 미러 폴백
 * (영속화 실패해도 앱이 도는 동안엔 저장/재사용 유지).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FinishBundle } from '../composer/regions';

const STORAGE_KEY = 'armakeup.userFinishes.v1';

/** 저장된 커스텀 제형 한 벌. */
export interface UserFinish {
  /** 고유 id — 칩 선택 키 */
  id: string;
  /** 사용자 지정 이름 (칩 라벨) */
  name: string;
  /** 저장 시각 epoch ms — 최신순 정렬용 */
  createdAt: number;
  /** 부위 무관 마감 세부 번들 (0..1) */
  bundle: FinishBundle;
}

// AsyncStorage가 없거나(테스트·미링크) 실패해도 세션 동안 값을 유지하는 미러.
let mirror: UserFinish[] | null = null;

function isFinishBundle(v: any): v is FinishBundle {
  return (
    !!v &&
    typeof v.glossLo === 'number' &&
    typeof v.glossGain === 'number' &&
    typeof v.shimmerSize === 'number' &&
    typeof v.shimmerDensity === 'number' &&
    typeof v.matte === 'number'
  );
}

function isUserFinish(v: any): v is UserFinish {
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    isFinishBundle(v.bundle)
  );
}

/** 저장된 제형 목록을 읽는다. 없거나 손상됐으면 빈 배열. */
export async function loadUserFinishes(): Promise<UserFinish[]> {
  if (mirror) return mirror;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // sheen(④)은 v1 이후 추가 축 — 옛 저장물엔 없으므로 0으로 채운다(하위호환).
    // isFinishBundle은 5축만 검사(옛 번들 통과) 후 여기서 sheen 정규화.
    mirror = Array.isArray(parsed)
      ? parsed
          .filter(isUserFinish)
          .map(f => ({ ...f, bundle: { ...f.bundle, sheen: f.bundle.sheen ?? 0 } }))
      : [];
  } catch {
    mirror = [];
  }
  return mirror;
}

/** 목록 전체를 저장한다(교체). 영속화 실패해도 세션 미러엔 반영된다. */
export async function saveUserFinishes(finishes: UserFinish[]): Promise<void> {
  mirror = finishes;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(finishes));
  } catch {
    // 영속화 실패(네이티브 미링크 등) — 세션 미러엔 이미 반영됨.
  }
}

/** 테스트용 — 미러 초기화 */
export function __resetFinishStoreMirror(): void {
  mirror = null;
}
