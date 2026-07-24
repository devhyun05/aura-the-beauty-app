import {
  createLookMakeupEditState,
  createRecommendedMakeupEditState,
} from '../../../features/ar/services/recommendedMakeupEditService';
import {createRecommendedStencilLook} from '../../../features/ar/services/recommendedStencilLook';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';
import type {FaceAnalysisMakeupColors} from '../../../shared/types/faceAnalysis';
import type {MakeupLookRecommendation} from '../../../features/makeup-recommendation/types';
import type {RootStackParamList} from '../routeTypes';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// 추천 룩의 부위 가이드 area → makeupColors 키. contour/base는 색 개인화 대상 아님
// (base=파운데이션 스킨세이프). eye 가이드 색(밝은 섀도 대표색)은 어떤 키에도 싣지
// 않는다 — 섀도는 서비스의 guideColor 직접 경로가 소비하고, eyeliner 키에 실으면
// 분석색 폴백이 라이너를 밝은 색으로 세탁해 눈매 대비가 사라진다(딥 기본색 유지).
const LOOK_AREA_TO_COLOR_KEY: Record<string, keyof FaceAnalysisMakeupColors> = {
  lip: 'lip',
  cheek: 'blush',
  brow: 'brow',
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

export type MakeupRecommendationStencilRouteParams = NonNullable<
  RootStackParamList['ARFilter']
>;

// 추천 "AR로 적용하기" → 홈 바로가기 "메이크업 필터"와 같은 스텐실 경험에 추천
// 룩을 시작 상태로 주입하는 ARFilter 라우트 파라미터.
export function getMakeupRecommendationStencilRouteParams(
  look: Pick<MakeupLookRecommendation, 'arFilterId' | 'role' | 'title' | 'areaGuides'>,
  // 분석이 낸 부위별 hex(퍼스널 컬러 근거). 가이드에 hex가 없는 부위의 폴백 색.
  makeupColors?: FaceAnalysisMakeupColors,
): MakeupRecommendationStencilRouteParams {
  // 1순위: 룩의 areaGuides로 부위·색·질감·강도를 직접 빌드(추천 그 자체가 레시피).
  // 폴백(구버전 리포트 등 areaGuides 부재): role 고정 프리셋에 색만 개인화.
  const editState =
    createLookMakeupEditState(look, makeupColors) ??
    createRecommendedMakeupEditState(
      getRecommendedMakeupFilterById(look.arFilterId),
      makeupColors,
    );

  return {
    recommendedLook: createRecommendedStencilLook(
      editState,
      look.title?.trim() || '추천 룩',
    ),
    source: 'recommendedFilter',
  };
}
