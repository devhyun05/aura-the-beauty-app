import type {UnifiedFaceCaptureCollectionPolicyId} from './unifiedFaceCaptureContract';

export type UnifiedFaceCaptureLabMode =
  | 'legacy-30'
  | 'product-5-of-8'
  | 'exact-1'
  | 'exact-3'
  | 'exact-5'
  | 'exact-8'
  | 'exact-12'
  | 'exact-30';

export const UNIFIED_FACE_CAPTURE_LAB_MODES: readonly {
  description: string;
  label: string;
  mode: UnifiedFaceCaptureLabMode;
}[] = [
  {
    description: '현재 네이티브 사진 촬영 뒤 별도 ARKit 30프레임 측정',
    label: 'Legacy 30',
    mode: 'legacy-30',
  },
  {
    description: '제품 후보 micro-burst · 최소 5 / 목표 8 / 500ms',
    label: '제품 후보 5/8',
    mode: 'product-5-of-8',
  },
  {description: '단일 프레임 · 집계 없음', label: 'Exact 1', mode: 'exact-1'},
  {description: '정확히 3프레임', label: 'Exact 3', mode: 'exact-3'},
  {description: '정확히 5프레임', label: 'Exact 5', mode: 'exact-5'},
  {description: '정확히 8프레임', label: 'Exact 8', mode: 'exact-8'},
  {description: '정확히 12프레임', label: 'Exact 12', mode: 'exact-12'},
  {description: '정확히 30프레임', label: 'Exact 30', mode: 'exact-30'},
];

const POLICY_BY_MODE: Partial<
  Record<UnifiedFaceCaptureLabMode, UnifiedFaceCaptureCollectionPolicyId>
> = {
  'exact-1': 'diagnostics-exact-1-v1',
  'exact-3': 'diagnostics-exact-3-v1',
  'exact-5': 'diagnostics-exact-5-v1',
  'exact-8': 'diagnostics-exact-8-v1',
  'exact-12': 'diagnostics-exact-12-v1',
  'exact-30': 'diagnostics-exact-30-v1',
  'product-5-of-8': 'unified-micro-burst-5of8-v1',
};

export function getUnifiedFaceCaptureLabPolicy(
  mode: UnifiedFaceCaptureLabMode,
): UnifiedFaceCaptureCollectionPolicyId | null {
  return POLICY_BY_MODE[mode] ?? null;
}
