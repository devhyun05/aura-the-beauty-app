// 1층 프로파일의 사진 판정(VLM) 슬롯 → S3 부위 카드에 뿌릴 한국어 상세 구절.
// 순수함수, RN·토큰 무의존(계약 러너가 plain node로 실행).
//
// 정직성: 판정된(비-null) 슬롯만, 그리고 '특징적'인 값만 문구로 만든다 — medium·
// none·absent 같은 '무난/없음'은 카드 소음을 줄이려 생략한다(허위 강조가 아니라 침묵).
// 지표 없으면 그 부위 배열은 비어서 카드가 상세 블록을 숨긴다.

import type {FaceFeatureProfile} from '../../shared/contracts/faceFeatureProfile';
import type {RegionAxesKey} from './reportFeatureAxes';

const EYELID_LABEL: Record<string, string> = {
  monolid: '쌍꺼풀 없는 무쌍',
  inner: '속쌍꺼풀',
  outer: '겉쌍꺼풀',
  hooded: '눈두덩이 덮인 헐린 눈',
};

export function buildRegionFeatureDescriptors(
  profile: FaceFeatureProfile,
): Record<RegionAxesKey, string[]> {
  const upper: string[] = [];
  const mid: string[] = [];
  const lower: string[] = [];
  const jaw: string[] = [];

  // ── 상안부: 눈 + 눈썹 ──────────────────────────────────────────────────
  const eyelid = profile.eye.doubleEyelid?.value;
  if (eyelid && EYELID_LABEL[eyelid]) {
    upper.push(EYELID_LABEL[eyelid]);
  }
  const hooding = profile.eye.upperLidHooding?.value;
  if (hooding === 'mild') upper.push('상안검이 살짝 덮인 편');
  else if (hooding === 'pronounced') upper.push('상안검 덮임이 뚜렷');

  const sagging = profile.eye.lowerLidSagging?.value;
  if (sagging === 'mild') upper.push('하안검이 살짝 처진 편');
  else if (sagging === 'pronounced') upper.push('하안검 처짐이 뚜렷');

  if (profile.eye.aegyoSal?.value === 'present') upper.push('애교살 있음');

  const eyeContrast = profile.eye.contrast?.value;
  if (eyeContrast === 'high') upper.push('눈매 대비가 뚜렷');
  else if (eyeContrast === 'low') upper.push('눈매 대비가 은은');

  const density = profile.brow.density?.value;
  if (density === 'sparse') upper.push('눈썹 숱이 옅은 편');
  else if (density === 'dense') upper.push('눈썹 숱이 짙은 편');

  // ── 중안부: 볼 ─────────────────────────────────────────────────────────
  const volume = profile.cheek.volume?.value;
  if (volume === 'full') mid.push('볼에 볼륨이 있는 편');
  else if (volume === 'flat') mid.push('볼이 평평한 편');

  const cheekContrast = profile.cheek.contrast?.value;
  if (cheekContrast === 'high') mid.push('볼 대비가 뚜렷');
  else if (cheekContrast === 'low') mid.push('볼 대비가 은은');

  // ── 하안부: 입술 ───────────────────────────────────────────────────────
  const lipContrast = profile.lip.colorContrast?.value;
  if (lipContrast === 'high') lower.push('입술 혈색이 뚜렷');
  else if (lipContrast === 'low') lower.push('입술 혈색이 옅은 편');

  // ── 광대·턱: 광대 위치 ─────────────────────────────────────────────────
  const cheekbone = profile.cheek.cheekboneHeight?.value;
  if (cheekbone === 'high') jaw.push('광대가 높은 편');
  else if (cheekbone === 'low') jaw.push('광대가 낮은 편');

  return {upper, mid, lower, jaw};
}
