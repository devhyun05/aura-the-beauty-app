// 분석 시점 순수 함수 — 픽셀 랜드마크 맵에서 부위별 크롭 rect + 가이드 폴리라인을
// 정규화 0..1로 산출한다. RN·토큰 무의존(계약 러너가 plain node로 실행).
// 원본 메시는 저장하지 않고 이 파생 기하만 measurements에 얹는다.

import {
  BROW_CORE_LEFT_INDICES,
  BROW_CORE_RIGHT_INDICES,
  FACE_GEOMETRY_LANDMARK_INDICES as IDX,
  FOREHEAD_INDICES,
  JAW_SILHOUETTE_INDICES,
  NOSE_ALAE_INDICES,
  NOSE_BRIDGE_MIDLINE_INDICES,
  OUTER_LIP_RING_INDICES,
} from './landmarkIndices';

export type RegionKey = 'upper' | 'mid' | 'lower' | 'jaw';
export type NormPoint = {x: number; y: number};
export type RegionGuideKind =
  | 'angle'
  | 'contour'
  | 'distance'
  | 'length'
  | 'symmetry';
export type RegionGuide = {
  key?: string;
  kind?: RegionGuideKind;
  label: string;
  metricKeys?: string[];
  points: NormPoint[];
};
export type RegionVisual = {
  cropRect: {x: number; y: number; w: number; h: number};
  // `guide` is retained for persisted v1 readers. New readers use all
  // measurement-specific guides and can switch between them without guessing
  // geometry from a generic representative line.
  guide: RegionGuide;
  guides?: RegionGuide[];
  sourceImage?: {width: number; height: number};
};
export type RegionVisuals = Partial<Record<RegionKey, RegionVisual>>;

type PxMap = Map<number, {x: number; y: number}>;

function pts(map: PxMap, indices: readonly number[]): {x: number; y: number}[] | null {
  const out: {x: number; y: number}[] = [];
  for (const i of indices) {
    const p = map.get(i);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return null;
    }
    out.push(p);
  }
  return out;
}

// brow/lip/jaw 폴리라인은 근사 가이드용 큰 인덱스 세트라 전부 존재하지 않아도 된다.
// 실제로 쓸 수 있는 점만 모아, 선/박스를 구성할 최소치(2점) 이상이면 채택한다.
const MIN_GUIDE_POINTS = 2;

function availablePts(map: PxMap, indices: readonly number[]): {x: number; y: number}[] {
  const out: {x: number; y: number}[] = [];
  for (const i of indices) {
    const p = map.get(i);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out.push(p);
    }
  }
  return out;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// 픽셀 점들의 bbox를 padFrac(부위 크기 대비)만큼 키워 정규화 rect로.
function bbox(
  points: {x: number; y: number}[],
  imageW: number,
  imageH: number,
  padFracX: number,
  padFracY: number,
): {x: number; y: number; w: number; h: number} {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const px = w * padFracX;
  const py = h * padFracY;
  const x0 = clamp01((minX - px) / imageW);
  const y0 = clamp01((minY - py) / imageH);
  const x1 = clamp01((maxX + px) / imageW);
  const y1 = clamp01((maxY + py) / imageH);
  return {x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0)};
}

function norm(points: {x: number; y: number}[], imageW: number, imageH: number): NormPoint[] {
  return points.map(p => ({x: clamp01(p.x / imageW), y: clamp01(p.y / imageH)}));
}

function guide(
  key: string,
  kind: RegionGuideKind,
  label: string,
  metricKeys: string[],
  points: {x: number; y: number}[],
  imageW: number,
  imageH: number,
): RegionGuide {
  return {key, kind, label, metricKeys, points: norm(points, imageW, imageH)};
}

// 축정렬 생존점(예: 세로 중앙선 두 점)으로 bbox의 w 또는 h가 0에 가까워지는
// 퇴화 크롭을 걸러낸다. 카드가 찌그러진 사각형으로 렌더되는 것을 막는 최종 방어선.
const EPS = 0.005;

function nonDegenerate(rect: {x: number; y: number; w: number; h: number}): boolean {
  return rect.w > EPS && rect.h > EPS;
}

export function regionVisualsBuilder(map: PxMap, imageW: number, imageH: number): RegionVisuals {
  if (!(imageW > 0) || !(imageH > 0)) {
    return {};
  }
  const out: RegionVisuals = {};
  const sourceImage = {width: imageW, height: imageH};

  // 상안부: 눈 외/내안각 + 눈꺼풀(필수) + 눈썹 코어(가용한 만큼, 크롭 상단 확장용) → 크롭.
  // 가이드 = 눈 라인(외안각 연결).
  const brow = availablePts(map, [...BROW_CORE_RIGHT_INDICES, ...BROW_CORE_LEFT_INDICES]);
  const forehead = availablePts(map, FOREHEAD_INDICES);
  const eyes = pts(map, [IDX.eyeOuterRight, IDX.eyeInnerRight, IDX.eyeInnerLeft, IDX.eyeOuterLeft, IDX.eyeUpperLidRight, IDX.eyeLowerLidRight, IDX.eyeUpperLidLeft, IDX.eyeLowerLidLeft]);
  if (eyes) {
    // 이마+눈썹+눈을 다 담아 "이마·눈썹·눈" 제목과 크롭을 일치시킨다(B4). 이마 점이
    // 없으면(앞머리 가림) forehead가 비어 눈썹까지만 — 기존 동작으로 자연 폴백.
    const cropRect = bbox([...forehead, ...brow, ...eyes], imageW, imageH, 0.2, 0.12);
    if (nonDegenerate(cropRect)) {
      const upperGuides: RegionGuide[] = [
        guide(
          'interCanthalDistance',
          'distance',
          '눈 사이 거리',
          ['interCanthalRatio'],
          [map.get(IDX.eyeInnerRight)!, map.get(IDX.eyeInnerLeft)!],
          imageW,
          imageH,
        ),
        guide(
          'eyeWidthRight',
          'distance',
          '오른쪽 눈 너비',
          ['eyeWidthRatioRight'],
          [map.get(IDX.eyeOuterRight)!, map.get(IDX.eyeInnerRight)!],
          imageW,
          imageH,
        ),
        guide(
          'eyeWidthLeft',
          'distance',
          '왼쪽 눈 너비',
          ['eyeWidthRatioLeft'],
          [map.get(IDX.eyeInnerLeft)!, map.get(IDX.eyeOuterLeft)!],
          imageW,
          imageH,
        ),
        guide(
          'eyeOpenness',
          'symmetry',
          '좌우 눈 개방도',
          ['eyeOpennessRight', 'eyeOpennessLeft'],
          [
            map.get(IDX.eyeUpperLidRight)!,
            map.get(IDX.eyeLowerLidRight)!,
            map.get(IDX.eyeUpperLidLeft)!,
            map.get(IDX.eyeLowerLidLeft)!,
          ],
          imageW,
          imageH,
        ),
        guide(
          'canthalTilt',
          'angle',
          '눈꼬리 기울기',
          ['canthalTiltRightDeg', 'canthalTiltLeftDeg'],
          [
            map.get(IDX.eyeInnerRight)!,
            map.get(IDX.eyeOuterRight)!,
            map.get(IDX.eyeInnerLeft)!,
            map.get(IDX.eyeOuterLeft)!,
          ],
          imageW,
          imageH,
        ),
      ];
      const browRight = availablePts(map, BROW_CORE_RIGHT_INDICES);
      const browLeft = availablePts(map, BROW_CORE_LEFT_INDICES);
      if (browRight.length >= MIN_GUIDE_POINTS && browLeft.length >= MIN_GUIDE_POINTS) {
        const browMetricKeys = [
          'browApexRatioRight',
          'browApexRatioLeft',
          'browSlopeRightDeg',
          'browSlopeLeftDeg',
          'eyeBrowGapRight',
          'eyeBrowGapLeft',
        ];
        upperGuides.push(
          guide(
            'browFlowRight',
            'contour',
            '오른쪽 눈썹 흐름',
            browMetricKeys,
            browRight,
            imageW,
            imageH,
          ),
          guide(
            'browFlowLeft',
            'contour',
            '왼쪽 눈썹 흐름',
            browMetricKeys,
            browLeft,
            imageW,
            imageH,
          ),
        );
      }
      out.upper = {
        cropRect,
        guide: upperGuides[0],
        guides: upperGuides,
        sourceImage,
      };
    }
  }

  // 중안부: 코 능선 + 콧볼 + 볼 폭 → 크롭. 가이드 = 콧대 중심선.
  const nose = pts(map, NOSE_BRIDGE_MIDLINE_INDICES);
  const alae = pts(map, NOSE_ALAE_INDICES);
  const cheeks = pts(map, [IDX.faceWidthRight, IDX.faceWidthLeft]);
  if (nose && alae && cheeks) {
    const cropRect = bbox([...nose, ...alae, ...cheeks], imageW, imageH, 0.08, 0.18);
    if (nonDegenerate(cropRect)) {
      const midGuides = [
        guide(
          'noseBridgeReference',
          'contour',
          '콧대 중심선',
          [],
          nose,
          imageW,
          imageH,
        ),
        guide(
          'alarReference',
          'distance',
          '콧볼 기준선',
          [],
          alae,
          imageW,
          imageH,
        ),
      ];
      out.mid = {
        cropRect,
        guide: midGuides[0],
        guides: midGuides,
        sourceImage,
      };
    }
  }

  // 하안부: 외곽 립 링(가용한 점만, 최소 2점) → 크롭 + 가이드(입술 라인).
  const lip = availablePts(map, OUTER_LIP_RING_INDICES);
  if (lip.length >= MIN_GUIDE_POINTS) {
    const cropRect = bbox(lip, imageW, imageH, 0.4, 0.5);
    if (nonDegenerate(cropRect)) {
      const lowerGuides: RegionGuide[] = [
        guide(
          'mouthWidth',
          'distance',
          '입 너비',
          ['mouthWidthRatio', 'mouthCornerAsymmetry'],
          [map.get(IDX.mouthCornerRight)!, map.get(IDX.mouthCornerLeft)!],
          imageW,
          imageH,
        ),
        guide(
          'lipContour',
          'contour',
          '입술 윤곽',
          [],
          lip,
          imageW,
          imageH,
        ),
      ];
      const lipThicknessPoints = pts(map, [
        IDX.upperLipOuterTop,
        IDX.upperLipInnerBottom,
        IDX.lowerLipInnerTop,
        IDX.lowerLipOuterBottom,
      ]);
      if (lipThicknessPoints) {
        lowerGuides.splice(
          1,
          0,
          guide(
            'lipThickness',
            'symmetry',
            '위아래 입술 두께',
            ['lipThicknessRatio'],
            lipThicknessPoints,
            imageW,
            imageH,
          ),
        );
      }
      out.lower = {
        cropRect,
        guide: lowerGuides[0],
        guides: lowerGuides,
        sourceImage,
      };
    }
  }

  // 외곽: 하악 실루엣 + 광대(faceWidth) → 크롭(가이드는 턱 곡선 그대로). 광대까지
  // 담아 "광대·턱" 제목과 크롭을 일치시킨다(B4) — 기존엔 하악만이라 입·턱만 보였다.
  const jaw = availablePts(map, JAW_SILHOUETTE_INDICES);
  const jawCheeks = availablePts(map, [IDX.faceWidthRight, IDX.faceWidthLeft]);
  if (jaw.length >= MIN_GUIDE_POINTS) {
    const cropRect = bbox([...jaw, ...jawCheeks], imageW, imageH, 0.1, 0.12);
    if (nonDegenerate(cropRect)) {
      const jawGuides = [
        guide(
          'jawWidth',
          'distance',
          '턱 너비',
          ['jawWidthRatio'],
          [map.get(IDX.jawRight)!, map.get(IDX.jawLeft)!],
          imageW,
          imageH,
        ),
        guide(
          'lowerJawWidth',
          'distance',
          '아래턱 너비',
          ['lowerJawWidthRatio'],
          [map.get(IDX.lowerJawRight)!, map.get(IDX.lowerJawLeft)!],
          imageW,
          imageH,
        ),
        guide(
          'jawContour',
          'contour',
          '턱선 윤곽',
          [],
          jaw,
          imageW,
          imageH,
        ),
      ];
      out.jaw = {
        cropRect,
        guide: jawGuides[0],
        guides: jawGuides,
        sourceImage,
      };
    }
  }

  return out;
}
