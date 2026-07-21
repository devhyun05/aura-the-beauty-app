import {createRecommendedMakeupEditState} from '../../../features/ar/services/recommendedMakeupEditService';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';
import type {FaceAnalysisMakeupColors} from '../../../shared/types/faceAnalysis';
import type {MakeupLookRecommendation} from '../../../features/makeup-recommendation/types';
import type {RootStackParamList} from '../routeTypes';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// 추천 룩의 부위 가이드 area → makeupColors 키. contour/base는 색 개인화 대상 아님
// (base=파운데이션 스킨세이프). eye 가이드 색은 레시피의 eyeliner 부위가 대표한다.
const LOOK_AREA_TO_COLOR_KEY: Record<string, keyof FaceAnalysisMakeupColors> = {
  lip: 'lip',
  cheek: 'blush',
  brow: 'brow',
  eye: 'eyeliner',
};

/**
 * 추천 룩의 areaGuides 색(hex) → 부위별 색 맵. LLM이 이 룩을 위해 고른 실제 색이라
 * 정적 프리셋·분석 기본색보다 우선한다. 유효한 #RRGGBB만 채택(이상하면 그 부위 생략).
 */
export function getLookMakeupColors(
  look: Pick<MakeupLookRecommendation, 'areaGuides'>,
): FaceAnalysisMakeupColors | undefined {
  const guides = look.areaGuides ?? [];
  const colors: FaceAnalysisMakeupColors = {};
  for (const guide of guides) {
    const key = (LOOK_AREA_TO_COLOR_KEY as Record<string, keyof FaceAnalysisMakeupColors>)[
      guide.area
    ];
    const hex = guide.color?.hex?.trim();
    if (key && hex && HEX_COLOR_PATTERN.test(hex)) {
      colors[key] = hex.toLowerCase();
    }
  }
  return Object.keys(colors).length > 0 ? colors : undefined;
}

export type MakeupRecommendationARFilterRouteParams = NonNullable<
  RootStackParamList['ARFilter']
>;

export function getMakeupRecommendationARFilterRouteParams(
  arFilterId: string,
  // 분석이 낸 부위별 hex(퍼스널 컬러 근거). 있으면 데코 부위 색을 개인화하고, 없거나
  // 형식 이상이면 프리셋 색을 그대로 쓴다(모양·질감은 불변).
  makeupColors?: FaceAnalysisMakeupColors,
): MakeupRecommendationARFilterRouteParams {
  const recommendedFilter = getRecommendedMakeupFilterById(arFilterId);

  return {
    fullFaceEditState: createRecommendedMakeupEditState(recommendedFilter, makeupColors),
    initialGuideMode: 'half',
    initialMakeupFilterId: recommendedFilter.id,
    source: 'recommendedFilter',
  };
}
