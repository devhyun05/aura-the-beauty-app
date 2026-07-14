/**
 * 에셋 카탈로그 영속(§16) — 웹 GUI(에셋-카탈로그-빌더.html)가 export한 매니페스트를
 * 앱이 보유·병합·추가하는 세션/영속 목록. 카탈로그는 "임포트 픽커에 노출할 목록"일 뿐,
 * 실제 파일은 uri로만 참조한다(저장 스냅샷에 파일 미포함 규약 유지 — assetCatalog.ts 주석).
 *
 * finishStore/lookStore와 같은 원칙: AsyncStorage best-effort + 세션 미러 폴백
 * (영속화 실패해도 앱이 도는 동안엔 목록이 유지된다).
 *
 * 2층 구조:
 *   ① 번들 기본(catalogDefault.json) — 팀이 웹 GUI export를 커밋해 두면 시작 시 로드.
 *   ② 사용자 레이어(AsyncStorage) — 붙여넣기 임포트/카탈로그 저장으로 쌓인 항목.
 * 로드 시 ①⇩② 병합(같은 id는 사용자가 이김). 영속화는 사용자 레이어만 저장하므로
 * 번들 기본을 나중에 갱신하면 새 항목이 그대로 반영된다(사용자 저장물과 충돌 없이).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import catalogDefault from '../assets/catalogDefault.json';
import {
  CATALOG_MANIFEST_VERSION,
  CATALOG_SCHEMA_ID,
  emptyCatalog,
  loadCatalog,
  normalizeEntry,
  serializeCatalog,
} from '../assets/assetCatalog';
import type { AssetCatalogEntry, CatalogManifest } from '../assets/assetCatalog';

const STORAGE_KEY = 'armakeup.assetCatalog.v1';

// 번들 기본 — 모듈 로드 시 1회 검증(불량이면 빈 카탈로그로 방어).
const DEFAULT_CATALOG: CatalogManifest = loadCatalog(catalogDefault);

// AsyncStorage가 없거나(테스트·미링크) 실패해도 세션 동안 값을 유지하는 미러.
// 미러는 "사용자 레이어"만 담는다(번들 기본은 로드 시 매번 병합).
let mirror: CatalogManifest | null = null;

/** 여러 레이어를 병합 — 뒤 레이어가 id 충돌 시 이긴다(loadCatalog 규약). */
function mergeLayers(...layers: CatalogManifest[]): CatalogManifest {
  const entries: AssetCatalogEntry[] = [];
  for (const layer of layers) entries.push(...layer.entries);
  return loadCatalog({
    schema: CATALOG_SCHEMA_ID,
    version: CATALOG_MANIFEST_VERSION,
    entries,
  });
}

/** 사용자 레이어 + 번들 기본 → 픽커에 노출할 최종 목록(사용자가 id 충돌 시 이김). */
function visible(user: CatalogManifest): CatalogManifest {
  return mergeLayers(DEFAULT_CATALOG, user);
}

/** 사용자 레이어를 읽어 미러에 캐시. 없거나 손상됐으면 빈 카탈로그. */
async function readUserLayer(): Promise<CatalogManifest> {
  if (mirror) return mirror;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    mirror = raw ? loadCatalog(raw) : emptyCatalog();
  } catch {
    mirror = emptyCatalog();
  }
  return mirror;
}

/** 사용자 레이어를 저장하고 최종(병합) 목록을 돌려준다. 영속화 실패해도 미러엔 반영. */
async function persist(user: CatalogManifest): Promise<CatalogManifest> {
  mirror = user;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, serializeCatalog(user));
  } catch {
    // best-effort — 세션 미러엔 이미 반영됨(네이티브 미링크 등).
  }
  return visible(user);
}

/** 시작 시 카탈로그 로드 — 저장분(사용자 레이어) + 번들 기본 병합. */
export async function loadCatalogStore(): Promise<CatalogManifest> {
  const user = await readUserLayer();
  return visible(user);
}

/**
 * 매니페스트 교체 저장 — 주어진 매니페스트를 사용자 레이어로 삼는다(검증 후).
 * 번들 기본은 로드 시 병합되므로 여기 담을 필요 없다.
 */
export async function saveCatalogStore(
  manifest: CatalogManifest,
): Promise<CatalogManifest> {
  return persist(loadCatalog(manifest));
}

/**
 * 웹 GUI export JSON(문자열)을 받아 검증→기존 사용자 레이어에 병합 저장.
 * 임포트 항목이 id 충돌 시 이긴다(웹에서 갱신한 최신본 우선). 불량/빈 입력은
 * loadCatalog가 빈 카탈로그로 방어하므로 병합해도 무해(기존 목록 유지).
 */
export async function importManifestText(
  jsonText: string,
): Promise<CatalogManifest> {
  const user = await readUserLayer();
  const imported = loadCatalog(jsonText);
  return persist(mergeLayers(user, imported));
}

/**
 * 원격 매니페스트 페치(§16 v2 "디자이너 발행 → 앱에 즉시") — url에서 manifest.json을
 * 내려받아 붙여넣기 임포트와 동형으로 병합 저장한다. importManifestText가 검증·병합·영속을
 * 담당하므로 네트워크 텍스트만 넘긴다. 네트워크/파싱 실패는 best-effort로 기존 목록을
 * 그대로 반환(finishStore 방어 원칙 — 실패해도 앱은 계속 돈다). RN fetch는 런타임 기본 제공.
 */
export async function fetchRemoteManifest(
  url: string,
): Promise<CatalogManifest> {
  try {
    const res = await fetch(url);
    const text = await res.text();
    return await importManifestText(text);
  } catch {
    return loadCatalogStore();
  }
}

/**
 * 방금 사진 라이브러리로 임포트한 에셋을 카탈로그에 등록(이름·kind·region·uri).
 * 불량 항목(kind/region 불일치 등)은 normalizeEntry가 걸러 변화 없이 현재 목록 반환.
 */
export async function addEntry(
  entry: AssetCatalogEntry,
): Promise<CatalogManifest> {
  const user = await readUserLayer();
  const one = normalizeEntry(entry);
  if (!one) return visible(user);
  return persist(
    mergeLayers(user, {
      schema: CATALOG_SCHEMA_ID,
      version: CATALOG_MANIFEST_VERSION,
      entries: [one],
    }),
  );
}

/**
 * 사용자 레이어에서 항목 제거. 번들 기본(catalogDefault.json) 항목은 로드 시
 * 다시 병합되므로 여기서 지워지지 않는다(시드는 코드/커밋으로 관리).
 */
export async function removeEntry(id: string): Promise<CatalogManifest> {
  const user = await readUserLayer();
  return persist({
    ...user,
    entries: user.entries.filter(e => e.id !== id),
  });
}

/** 테스트용 — 미러 초기화 */
export function __resetCatalogStoreMirror(): void {
  mirror = null;
}
