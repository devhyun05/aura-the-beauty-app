/**
 * 임포트 컨트롤 ↔ 카탈로그 종류(kind) 매핑 + 컨트롤별 후보 목록(§16 앱 배선).
 * ComposerSheet 픽커가 "이 컨트롤에 어떤 카탈로그 항목을 노출할지" 판단하는 순수 함수.
 * 매핑 규약:
 *   maskImport → 'mask'      (존 스텐실 "어디에")
 *   textureMap → 'textureMap'(광 지도 "어떻게 빛나는지")
 *   import(컬러 아트) → 'colorArt' ("무엇을")
 * 렌즈/오버레이 디자인 이미지는 부위 개념이 없어 'colorArt' 풀 전체를 후보로 본다
 * (자유 배치 그림 소스 — 부위 무관). App의 apply-by-uri가 uri만 받아 적용한다.
 */
import {
  entriesByKind,
  entriesByKindAndRegion,
} from './assetCatalog';
import type { AssetCatalogEntry, AssetKind, CatalogManifest } from './assetCatalog';

/** 부위 기반 임포트 컨트롤 타입 → 카탈로그 종류. */
export const CONTROL_KIND: Record<'maskImport' | 'textureMap' | 'import', AssetKind> = {
  maskImport: 'mask',
  textureMap: 'textureMap',
  import: 'colorArt',
};

/** 부위 기반 컨트롤(mask/textureMap/colorArt)에 노출할 카탈로그 항목. */
export function entriesForControl(
  catalog: CatalogManifest,
  controlType: 'maskImport' | 'textureMap' | 'import',
  region: string,
): AssetCatalogEntry[] {
  return entriesByKindAndRegion(catalog, CONTROL_KIND[controlType], region);
}

/** 렌즈/오버레이 디자인 후보 — 부위 무관 컬러 아트 전체(디자인 이미지 풀). */
export function designEntries(catalog: CatalogManifest): AssetCatalogEntry[] {
  return entriesByKind(catalog, 'colorArt');
}
