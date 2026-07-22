// 3 스타일 레인 추천(균형/동안/개성강조) — 1층 프로파일 + 2층 시각 무게 지도에서
// 결정론적으로 만든다. 순수함수, RN·토큰 무의존(계약 러너가 plain node로 실행).
//
// 레인 자체는 "전략"이라 데이터가 얕아도 항상 유효하다(설계 §4.1). 개인화는 신뢰도
// 높은 신호(측정 밴드·시각 무게 집계) 위주로 하고, 불안정한 VLM 구조 판정(쌍꺼풀
// 유형 등)에는 의존하지 않는다. 프레젠테이션 타입은 여기(순수 파일)에 두고
// reportTypes가 재수출한다(RN 전이 의존 격리).

import type {FaceFeatureProfile} from '../../shared/contracts/faceFeatureProfile';
import type {
  VisualWeightMap,
  VisualWeightRegion,
} from '../../shared/contracts/visualWeightMap';

export type StyleLaneKey = 'balance' | 'youthful' | 'accent';

export interface StyleLaneMove {
  region: string; // 표시용 부위 라벨(베이스/눈/눈썹/볼/립)
  note: string;
}

export interface StyleLaneCard {
  laneKey: StyleLaneKey;
  chip: string; // 균형 · 동안 · 개성 강조
  title: string; // 이 사용자를 위한 한 줄 전략
  description: string;
  moves: StyleLaneMove[];
}

const REGION_LABEL: Record<VisualWeightRegion, string> = {
  eye: '눈',
  brow: '눈썹',
  cheek: '볼',
  lip: '립',
};

// dominant가 특정 부위가 아니면(균형/근거부족) 리서치 W-4(눈>립 가중)에 따라 눈을
// 기본 강조 부위로 삼는다.
function resolveAccentRegion(map: VisualWeightMap): VisualWeightRegion {
  return map.dominantRegion === 'balanced' || map.dominantRegion === 'insufficient'
    ? 'eye'
    : map.dominantRegion;
}

function balanceCard(
  profile: FaceFeatureProfile,
  map: VisualWeightMap,
): StyleLaneCard {
  const canthal = profile.eye.canthalTilt.band;
  const contrast = map.contrastLevel;
  const dom = map.dominantRegion;
  const domLabel =
    dom === 'balanced' || dom === 'insufficient' ? null : REGION_LABEL[dom];

  const title =
    contrast === 'high'
      ? '또렷함을 살짝 눌러 부드럽게'
      : contrast === 'low'
        ? '은은함에 또렷함을 조금 더해'
        : '지금의 균형을 자연스럽게 정돈';

  const description = domLabel
    ? `${domLabel}에 시선이 쏠려 있어, 그 부위는 절제하고 약한 곳을 채워 전체 균형을 맞추는 방향이에요.`
    : '이목구비가 고르게 분포해, 전체를 은은하게 다듬어 균형을 유지하는 방향이에요.';

  return {
    laneKey: 'balance',
    chip: '균형',
    title,
    description,
    moves: [
      {
        region: '눈',
        note:
          canthal === 'down'
            ? '눈꼬리를 살짝 올려 처진 느낌을 보정해요.'
            : '자연스러운 라인으로 또렷함만 더해요.',
      },
      {region: '볼', note: '얼굴 안쪽으로 은은하게 — 튀지 않는 혈색.'},
      {
        region: '립',
        note:
          contrast === 'low'
            ? '혈색을 살짝 더해 생기를 줘요.'
            : 'MLBB 톤으로 차분하게 마무리해요.',
      },
    ],
  };
}

function youthfulCard(profile: FaceFeatureProfile): StyleLaneCard {
  const vbal = profile.contour.verticalBalance.band;
  const aegyo = profile.eye.aegyoSal?.value === 'present';

  const description =
    vbal === 'middle'
      ? '중안부가 도드라지는 편이라, 볼을 높게 올려 중안부를 짧아 보이게 하면 특히 잘 어울려요.'
      : '볼을 눈밑 가까이 올려 시선을 얼굴 중앙으로 모아 어려 보이게 하는 방향이에요.';

  return {
    laneKey: 'youthful',
    chip: '동안',
    title: '중안부는 짧게, 볼엔 생기',
    description,
    moves: [
      {region: '볼', note: '눈밑에 가깝게 높이 — 중안부를 짧아 보이게.'},
      {
        region: '눈',
        note: aegyo
          ? '애교살을 살려 눈밑에 볼륨을 줘요.'
          : '아래 눈꺼풀에 은은한 음영으로 애교살 느낌을 더해요.',
      },
      {region: '립', note: '중앙만 톡 물들이는 그라데이션으로 어린 느낌.'},
    ],
  };
}

function accentCard(map: VisualWeightMap): StyleLaneCard {
  const region = resolveAccentRegion(map);
  const label = REGION_LABEL[region];
  const wasBalanced =
    map.dominantRegion === 'balanced' || map.dominantRegion === 'insufficient';

  const description = wasBalanced
    ? `한 곳에 포인트를 집중하는 원포인트 전략이에요. 시선을 가장 오래 끄는 ${label}을(를) 주인공으로, 나머지는 덜어냈어요.`
    : `${label}에 시각 무게가 실려 있어, 그곳을 최대한 살리고 나머지는 절제해 개성을 극대화해요.`;

  // 강조 부위는 진하게, 나머지는 절제.
  const emphasize: StyleLaneMove = {
    region: label,
    note: '색과 대비를 끌어올려 이 부위를 확실한 주인공으로.',
  };
  const restraint: StyleLaneMove = {
    region: region === 'eye' ? '립' : '눈',
    note: '톤을 낮춰 강조 부위와 경쟁하지 않게 절제.',
  };
  const base: StyleLaneMove = {
    region: '베이스',
    note: '매끈하게만 정돈해 포인트가 더 도드라지게.',
  };

  return {
    laneKey: 'accent',
    chip: '개성 강조',
    title: `${label}을(를) 주인공으로`,
    description,
    moves: [emphasize, restraint, base],
  };
}

/**
 * 3 스타일 레인 카드(균형·동안·개성강조). 항상 3장을 돌려준다 — 레인은 전략이라
 * 데이터가 얕아도 유효하고, 개인화 문구만 신호에 따라 달라진다.
 */
export function buildStyleLaneRecommendations(
  profile: FaceFeatureProfile,
  map: VisualWeightMap,
): StyleLaneCard[] {
  return [balanceCard(profile, map), youthfulCard(profile), accentCard(map)];
}
