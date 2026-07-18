// View-model shapes the redesigned result screen renders.
// Real data is mapped into these by services/toRecommendationResultLooks.ts.
import type {ImageSourcePropType} from 'react-native';

export type PartKey = 'base' | 'brow' | 'eye' | 'cheek' | 'lip';

export const PART_KEYS: {key: PartKey; label: string}[] = [
  {key: 'base', label: '베이스'},
  {key: 'brow', label: '브로우'},
  {key: 'eye', label: '아이'},
  {key: 'cheek', label: '치크'},
  {key: 'lip', label: '립'},
];

export interface PartGuide {
  label: string;
  en: string;
  colorName: string;
  hex: string;
  texture: string;
  textureNote: string;
  steps: string[];
  finish: string;
  prod: {brand: string; name: string; price: string; why: string; ini: string};
}

export interface Look {
  id: 'anchor' | 'bold' | 'discovery';
  roleLabel: string;
  roleEn: string;
  name: string;
  image: ImageSourcePropType;
  match: number;
  diff: string;
  time: string;
  matchLine: string;
  /** LOOK MAP coordinates, 0–100: mx = 자연스러움(0)↔개성(100), my = 캐주얼(0)↔글램(100) */
  mx: number;
  my: number;
  reasons: string[];
  parts: Record<PartKey, PartGuide>;
}
