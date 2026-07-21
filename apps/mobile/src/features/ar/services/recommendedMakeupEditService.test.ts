import {
  createFullFaceMakeupRecipeFromEditState,
  createFullFaceMakeupSavedContract,
  getInitialFullFaceMakeupEditState,
} from './fullFaceMakeupEditService';
import {
  createLookMakeupEditState,
  createRecommendedMakeupEditState,
  createRecommendedMakeupSavedContract,
  resolveLookFinishId,
} from './recommendedMakeupEditService';
import {buildSavedArLookRequest} from './savedArLookService';
import {getRecommendedMakeupFilterById} from '../../../shared/services/makeupGuideService';

function expectEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, received ${String(actual)}`,
    );
  }
}

const cleanSmokyFilter = getRecommendedMakeupFilterById(
  'filter-clean-smoky-city',
);
const cleanSmokyState = createRecommendedMakeupEditState(cleanSmokyFilter);

expectEqual(cleanSmokyState.selectedRegion, 'lip', 'recommended selected region');
expectEqual(
  cleanSmokyState.controls.foundation.enabled,
  false,
  'recommended disabled foundation',
);
expectEqual(cleanSmokyState.controls.lip.enabled, true, 'recommended enabled lip');
expectEqual(
  cleanSmokyState.controls.blush.enabled,
  true,
  'recommended enabled blush',
);
expectEqual(cleanSmokyState.controls.brow.enabled, true, 'recommended enabled brow');
expectEqual(
  cleanSmokyState.controls.eyeliner.enabled,
  true,
  'recommended enabled eyeliner',
);
expectEqual(
  cleanSmokyState.controls.lip.colorHex,
  cleanSmokyFilter.colorOptions[0]?.hex,
  'recommended primary lip color',
);
expectEqual(
  cleanSmokyState.controls.lip.intensity,
  cleanSmokyFilter.presetValues.intensity,
  'recommended preset intensity',
);

const cleanSmokyRecipe = createFullFaceMakeupRecipeFromEditState(
  cleanSmokyState,
  1000,
);
expectEqual(cleanSmokyRecipe.version, 2, 'recommended recipe version');
expectEqual(
  cleanSmokyRecipe.activeRegions,
  'lip,blush,brow,eyeliner',
  'recommended recipe active regions',
);

const glowFilter = getRecommendedMakeupFilterById('filter-gyaru-glow');
const glowState = createRecommendedMakeupEditState(glowFilter);
expectEqual(glowState.controls.lip.finish, 'gloss', 'recommended glow lip finish');
expectEqual(
  glowState.controls.eyeliner.finish,
  'soft-eye-shimmer',
  'recommended glow eye finish',
);

const savedContract = createRecommendedMakeupSavedContract(
  cleanSmokyFilter,
  2000,
);
const savedRequest = buildSavedArLookRequest(
  savedContract,
  '11111111-1111-4111-8111-111111111111',
);

expectEqual(savedContract.source, 'preset', 'recommended saved contract source');
expectEqual(
  savedRequest.stylePayload.schemaVersion,
  'saved_ar_look_v1',
  'recommended saved payload schema',
);
expectEqual(
  savedRequest.stylePayload.recipeContract,
  'FullFaceMakeupRecipe',
  'recommended saved recipe contract',
);
expectEqual(
  savedRequest.stylePayload.source,
  'preset',
  'recommended saved payload source',
);

const defaultEditState = getInitialFullFaceMakeupEditState();
const defaultRecipe = createFullFaceMakeupRecipeFromEditState(
  defaultEditState,
  3000,
);
const defaultSavedContract = createFullFaceMakeupSavedContract({
  editState: defaultEditState,
  recipe: defaultRecipe,
  savedAtMs: 3000,
});

expectEqual(
  defaultSavedContract.source,
  'face-analysis-full-face',
  'existing Unity save source remains the default',
);

// ── 분석 색(퍼스널 컬러 근거) 오버라이드 — B ─────────────────────────────────
// 유효 hex가 있으면 데코 부위 색을 개인화하고, foundation은 스킨-세이프로 불변,
// 형식 이상/부재 부위는 프리셋 색 폴백.
const presetLipHex = cleanSmokyState.controls.lip.colorHex;
const overriddenState = createRecommendedMakeupEditState(cleanSmokyFilter, {
  lip: '#C0334D',
  blush: '#E58B7A',
  brow: 'not-a-hex',      // 형식 이상 → 폴백
  // eyeliner 생략 → 폴백
});
expectEqual(overriddenState.controls.lip.colorHex, '#C0334D', 'lip color overridden by analysis');
expectEqual(overriddenState.controls.blush.colorHex, '#E58B7A', 'blush color overridden by analysis');
expectEqual(
  overriddenState.controls.brow.colorHex,
  cleanSmokyState.controls.brow.colorHex,
  'invalid hex -> preset brow color kept',
);
expectEqual(
  overriddenState.controls.eyeliner.colorHex,
  cleanSmokyState.controls.eyeliner.colorHex,
  'missing color -> preset eyeliner color kept',
);
expectEqual(
  overriddenState.controls.foundation.colorHex,
  cleanSmokyState.controls.foundation.colorHex,
  'foundation stays skin-safe (never overridden)',
);
// 오버라이드 없으면 기존과 동일(회귀 없음)
expectEqual(
  createRecommendedMakeupEditState(cleanSmokyFilter).controls.lip.colorHex,
  presetLipHex,
  'no override -> unchanged preset behavior',
);

// ── 추천 룩(areaGuides) → 편집 상태 직접 빌드 ────────────────────────────────
// 부위·색·질감·강도가 룩에서 직접 나온다(프리셋 뼈대 미사용).
const guidedState = createLookMakeupEditState({
  role: 'bold',
  areaGuides: [
    {area: 'lip', color: {hex: '#B03A48'}, texture: '매트 벨벳'},
    {area: 'cheek', color: {hex: '#E8A08F'}, texture: '크림 블러셔'},
    {area: 'eye', color: {hex: '#8A5A40'}, texture: '펄이 반짝이는 시머'},
    {area: 'brow', color: {hex: 'oops'}, texture: '결을 살린'}, // 색 형식 이상 → 폴백
    {area: 'base', texture: '보송한 세미매트'},
  ],
});

expectEqual(guidedState !== null, true, 'guides -> edit state built');
expectEqual(guidedState?.controls.lip.enabled, true, 'guided lip enabled');
expectEqual(guidedState?.controls.lip.colorHex, '#B03A48', 'guided lip color');
// 매트 립 → natural finish (립 옵션엔 matte가 없어 가장 매트에 가까운 마감)
expectEqual(guidedState?.controls.lip.finish, 'natural-makeup', 'matte lip -> natural finish');
expectEqual(guidedState?.controls.lip.intensity, 0.75, 'bold role intensity');
expectEqual(guidedState?.controls.blush.colorHex, '#E8A08F', 'guided blush color');
expectEqual(guidedState?.controls.blush.finish, 'cream-blush', 'cream keyword -> cream blush');
expectEqual(guidedState?.controls.eyeshadow.enabled, true, 'eye guide -> eyeshadow band on');
expectEqual(guidedState?.controls.eyeshadow.colorHex, '#8A5A40', 'eyeshadow color from eye guide');
expectEqual(guidedState?.controls.eyeshadow.shimmer, 0.5, 'shimmer keyword -> shimmer gain');
expectEqual(guidedState?.controls.eyeliner.enabled, true, 'eye guide keeps liner for definition');
expectEqual(
  guidedState?.controls.eyeliner.colorHex,
  getInitialFullFaceMakeupEditState().controls.eyeliner.colorHex,
  'liner keeps deep default color (not the light eye guide color)',
);
expectEqual(
  guidedState?.controls.brow.colorHex,
  getInitialFullFaceMakeupEditState().controls.brow.colorHex,
  'invalid guide hex -> default brow color',
);
expectEqual(
  guidedState?.controls.foundation.enabled,
  true,
  'base guide enables foundation',
);
expectEqual(
  guidedState?.controls.foundation.colorHex,
  getInitialFullFaceMakeupEditState().controls.foundation.colorHex,
  'foundation color stays skin-safe',
);
expectEqual(guidedState?.controls.lens.enabled, false, 'lens stays off');
expectEqual(guidedState?.selectedRegion, 'lip', 'guided selected region');

// 가이드 없음/전부 미지원 → null(프리셋 폴백 신호)
expectEqual(
  createLookMakeupEditState({role: 'anchor', areaGuides: []}),
  null,
  'no guides -> null (preset fallback)',
);
expectEqual(
  createLookMakeupEditState({
    areaGuides: [{area: 'eye', arSupported: false, color: {hex: '#8A5A40'}}],
  }),
  null,
  'arSupported=false guides are ignored',
);

// 분석 색 폴백: 가이드에 hex가 없으면 makeupColors가 그 부위를 채운다
const analysisFallbackState = createLookMakeupEditState(
  {role: 'anchor', areaGuides: [{area: 'lip', texture: '글로시'}]},
  {lip: '#c0334d'},
);
expectEqual(
  analysisFallbackState?.controls.lip.colorHex,
  '#c0334d',
  'missing guide hex -> analysis color fallback',
);
expectEqual(
  analysisFallbackState?.controls.lip.finish,
  'gloss',
  'glossy keyword -> gloss lip finish',
);
expectEqual(
  analysisFallbackState?.controls.lip.intensity,
  0.55,
  'anchor role intensity',
);

// 질감 휴리스틱 한/영 키워드 스팟 체크
expectEqual(resolveLookFinishId('eyeshadow', '매트하게'), 'matte', 'ko matte eyeshadow');
expectEqual(resolveLookFinishId('eyeshadow', 'glitter point'), 'shimmer', 'en glitter eyeshadow');
expectEqual(resolveLookFinishId('foundation', '물광 피부'), 'glow', 'ko glow foundation');
expectEqual(resolveLookFinishId('brow', '또렷한 눈썹'), 'clear', 'ko defined brow');
expectEqual(resolveLookFinishId('eyeliner', ''), 'soft', 'empty texture -> region default');
