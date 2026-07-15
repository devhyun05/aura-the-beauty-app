/**
 * 사용자가 만든 룩(오버레이 레이어 스택 + 파라미터 + 전역 농도)을 이름 붙여 저장하고
 * 다시 불러온다. 설계 섹션 05 — R10: 저장·이름·재사용.
 *
 * AsyncStorage로 앱 재시작 뒤에도 유지되며, 네이티브 미링크·저장소 오류 등으로
 * 실패해도 세션 메모리 미러로 폴백해 앱이 도는 동안엔 저장/재사용이 유지된다
 * (영속화는 best-effort — 실패해도 크래시하지 않는다).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FilterParams, OverlayLayer } from '../bridge/types';

/** 스키마 버전을 키에 박아 둔다 — 포맷이 바뀌면 키를 올려 옛 데이터를 무시. */
const STORAGE_KEY = 'armakeup.userStyles.v1';

/** 저장된 사용자 룩 한 벌. */
export interface UserStyle {
  /** 고유 id — 캐러셀 선택 하이라이트 키로도 쓰인다 */
  id: string;
  /** 사용자 지정 이름 (칩 라벨) */
  name: string;
  /** 저장 시각 epoch ms — 최신순 정렬용 */
  createdAt: number;
  /** 룩 전체 파라미터 (전역 농도 곱하기 전의 풀강도 base) */
  params: FilterParams;
  /** 캐노니컬 오버레이 레이어 스택 (배열 순서 = 그리기 순서) */
  overlayLayers: OverlayLayer[];
  /** 전역 메이크업 농도 0..1 (설계: 저장 시 전역농도까지 직렬화) */
  opacity: number;
}

// AsyncStorage가 없거나(테스트·미링크) 실패해도 앱 세션 동안 값을 유지하는 미러.
let mirror: UserStyle[] | null = null;

function isUserStyle(v: any): v is UserStyle {
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    !!v.params &&
    typeof v.params === 'object' &&
    Array.isArray(v.overlayLayers)
  );
}

/** 저장된 룩 목록을 읽는다. 없거나 손상됐으면 빈 배열. */
export async function loadUserStyles(): Promise<UserStyle[]> {
  if (mirror) return mirror;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // opacity는 나중 추가 필드 — 옛 레코드엔 없을 수 있어 1로 보정.
    mirror = Array.isArray(parsed)
      ? parsed.filter(isUserStyle).map(s => ({
          ...s,
          opacity: typeof s.opacity === 'number' ? s.opacity : 1,
        }))
      : [];
  } catch {
    mirror = [];
  }
  return mirror;
}

/** 목록 전체를 저장한다(교체). 영속화 실패해도 세션 미러엔 반영된다. */
export async function saveUserStyles(styles: UserStyle[]): Promise<void> {
  mirror = styles;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
  } catch {
    // 영속화 실패(네이티브 미링크 등) — 세션 미러엔 이미 반영됨.
  }
}

/**
 * 현재 룩에서 저장 이름을 자동 제안한다. 베이스(마지막 선택 프리셋/커스텀 이름)에
 * 두드러진 커스텀 특징을 태그로 붙이고, 기존 이름과 겹치면 번호를 매긴다.
 */
export function suggestStyleName(
  params: FilterParams,
  overlayLayers: OverlayLayer[],
  baseName: string,
  existingNames: string[],
): string {
  const tags: string[] = [];
  if ((params.lipOverline ?? 0) > 0) tags.push('오버립');
  if ((params.eyeCornerLift ?? 0) > 0) tags.push('올림눈');
  if (overlayLayers.length > 0) tags.push('데코');
  const base = (baseName || '내 룩').trim() || '내 룩';
  let name = tags.length ? `${base} + ${tags.join('·')}` : base;
  if (existingNames.includes(name)) {
    let n = 2;
    while (existingNames.includes(`${name} ${n}`)) n++;
    name = `${name} ${n}`;
  }
  return name;
}
