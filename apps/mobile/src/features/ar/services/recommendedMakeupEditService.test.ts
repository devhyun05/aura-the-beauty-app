import {
  createFullFaceMakeupRecipeFromEditState,
  createFullFaceMakeupSavedContract,
  getInitialFullFaceMakeupEditState,
} from './fullFaceMakeupEditService';
import {
  createLookMakeupEditState,
  createRecommendedMakeupEditState,
  createRecommendedMakeupSavedContract,
  deriveRecommendedLookLanes,
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

// ── 세부 레인 파생(deriveRecommendedLookLanes) ──────────────────────────────
// 립글로스: 플랜 '광택' role hex 우선, 없으면 클리어 '#FFFFFF'.
const planGlossLanes = deriveRecommendedLookLanes([
  {
    area: 'lip',
    texture: '촉촉한 글로시',
    applicationPlan: {
      steps: [{title: '립글로스', colors: [{role: '광택', hex: '#FFD9E0'}]}],
    },
  },
]);
expectEqual(planGlossLanes?.lipGloss?.colorHex, '#FFD9E0', 'plan gloss hex adopted');
expectEqual(planGlossLanes?.lipGloss?.shape, 1, 'no zone cue -> center-dot gloss');
expectEqual(planGlossLanes?.lipStyle?.edgeFeather, 0.35, 'lip guide -> preset soft edge');
expectEqual(
  deriveRecommendedLookLanes([{area: 'lip', texture: '글로시'}])?.lipGloss?.colorHex,
  '#FFFFFF',
  'no plan -> clear gloss color',
);

// 글로스 존 — 스텝 텍스트 스코프로 판정(다른 스텝의 '입술 전체' 오염 방지).
const lowerGlossLanes = deriveRecommendedLookLanes([
  {
    area: 'lip',
    texture: '글로시',
    applicationPlan: {
      steps: [
        {title: '바탕', placement: '입술 전체에 얇게', colors: [{role: '바탕', hex: '#E8B4A8'}]},
        {title: '시럽광', placement: '아랫입술 중앙에만 얹는다', colors: [{role: '광택', hex: '#FFE0E6'}]},
      ],
    },
  },
]);
expectEqual(lowerGlossLanes?.lipGloss?.shape, 2, 'lower-lip cue -> syrup gloss zone');
// '아랫입술 전체에' = 아랫입술 존(2) — '전체' 판정보다 아랫입술 판정이 먼저.
expectEqual(
  deriveRecommendedLookLanes([
    {
      area: 'lip',
      applicationPlan: {
        steps: [{title: '글로스', placement: '아랫입술 전체에 광을 얹어요', colors: [{role: '광택', hex: '#FFE0E6'}]}],
      },
    },
  ])?.lipGloss?.shape,
  2,
  'lower-lip-full wording -> still lower-lip zone',
);
// 무플랜 폴백은 texture만 스캔 — placement의 베이스 도포 서술('입술 전체에…')이
// 풀 글로스로 오독되지 않는다.
expectEqual(
  deriveRecommendedLookLanes([
    {area: 'lip', texture: '글로시', placement: '입술 전체에 고르게 발라요'},
  ])?.lipGloss?.shape,
  1,
  'placement base wording never widens the gloss zone',
);
expectEqual(
  deriveRecommendedLookLanes([
    {
      area: 'lip',
      applicationPlan: {
        steps: [{title: '글로스', placement: '입술 전체에 광', colors: [{role: '광택', hex: '#FFE0E6'}]}],
      },
    },
  ])?.lipGloss?.shape,
  0,
  'explicit full cue -> full-lip gloss zone',
);

// 립 그라데 — 플랜 '안쪽 포인트' 색이 innerColorHex로 실린다.
const gradientLanes = deriveRecommendedLookLanes([
  {
    area: 'lip',
    applicationPlan: {
      steps: [{title: '그라데이션 깊이', colors: [{role: '안쪽 포인트', hex: '#8F2F3A'}]}],
    },
  },
]);
expectEqual(gradientLanes?.lipStyle?.innerColorHex, '#8F2F3A', 'plan inner hex -> lip gradient core');

// 블러셔 모양 — 위치·기법 텍스트 → AR_BLUSH_SHAPES value.
expectEqual(
  deriveRecommendedLookLanes([
    {area: 'cheek', technique: '광대 위쪽에서 관자놀이 방향으로 쓸어 올려요'},
  ])?.blushShape?.value,
  2,
  'upward sweep cue -> draping blush',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'cheek', placement: '볼 중앙에 둥글게'}])?.blushShape
    ?.value,
  4,
  'round apple cue -> lovely blush',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'cheek', placement: '눈 아래를 감싸듯 엷게'}])
    ?.blushShape?.value,
  5,
  'under-eye cue -> under-eye blush',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'cheek', texture: '맑은 소프트 블러'}])?.blushShape
    ?.value,
  3,
  'no cue -> daily blush (deterministic plan shape)',
);
// 하이라이터 스텝의 위치 어휘는 블러셔 모양 판정에서 제외된다.
expectEqual(
  deriveRecommendedLookLanes([
    {
      area: 'cheek',
      applicationPlan: {
        steps: [
          {
            title: '광대 윗면에 빛 더하기',
            productType: '미세 펄 하이라이터',
            technique: '광대 위쪽으로 쓸어 올려요',
            colors: [{role: '광 포인트', hex: '#FFE9C8'}],
          },
        ],
      },
    },
  ])?.blushShape?.value,
  3,
  'highlighter step vocabulary excluded from blush shape',
);

// 눈썹 레인 — 눈썹룩(레퍼런스 알파 browStyle 한 겹) 계약. 모양은 에셋이 소유하고
// 두께는 두께 축, 정의감은 강도로 표현한다.
const softBrowLanes = deriveRecommendedLookLanes([
  {area: 'brow', color: {hex: '#4A3428'}, texture: '결을 살린 자연 눈썹'},
]);
// 무신호 기본 = 소프트 일자(value 1 / template 8) — 내추럴 프리셋과 같은 값.
expectEqual(softBrowLanes?.brow?.shape, 1, 'no shape cue -> soft-straight');
expectEqual(softBrowLanes?.brow?.styleTemplate, 8, 'soft-straight reference alpha template');
expectEqual(softBrowLanes?.brow?.styleIntensity, 0.62, 'brow look baseline intensity');
expectEqual(softBrowLanes?.brow?.thicknessProfile, 2, 'default brow -> coverage profile 2');
expectEqual(softBrowLanes?.brow?.thickness, 1, 'default brow -> neutral thickness');
expectEqual(softBrowLanes?.brow?.arch, 0.08, 'brow look baseline arch');

// 모양 어휘 → 레퍼런스 알파 5종. '세미아치'가 '아치'를 포함하므로 순서가 중요하고,
// 모양어는 눈썹/브로우를 직접 수식할 때만 인정한다.
const shapeCue = (texture: string) =>
  deriveRecommendedLookLanes([{area: 'brow', texture}])?.brow;
expectEqual(shapeCue('깔끔한 일자 눈썹')?.shape, 0, 'straight cue -> straight');
expectEqual(shapeCue('깔끔한 일자 눈썹')?.styleTemplate, 9, 'straight template');
expectEqual(shapeCue('소프트한 일자 눈썹')?.shape, 1, 'soft straight cue');
expectEqual(shapeCue('세미 아치 눈썹')?.shape, 2, 'semi-arch cue before arch');
expectEqual(shapeCue('세미 아치 눈썹')?.styleTemplate, 7, 'semi-arch template');
expectEqual(shapeCue('또렷한 아치 눈썹')?.shape, 3, 'arch cue');
expectEqual(shapeCue('또렷한 아치 눈썹')?.styleTemplate, 5, 'arch template');
expectEqual(shapeCue('둥근 눈썹')?.shape, 4, 'round cue');
expectEqual(shapeCue('둥근 눈썹')?.styleTemplate, 6, 'round template');

// 정의감(또렷/선명/짙/진한) = 강도 상향. 절차 3겹→1겹 전환으로 옅어지는 것 상쇄.
const definedBrowLanes = deriveRecommendedLookLanes([
  {area: 'brow', color: {hex: '#2A1E16'}, texture: '선명한 소프트 매트'},
]);
expectEqual(definedBrowLanes?.brow?.styleIntensity, 0.72, 'defined cue -> stronger style intensity');
expectEqual(definedBrowLanes?.brow?.thickness, 1, 'defined cue keeps base thickness');

// 두께 신호 → 두께 축(모양·템플릿 불변).
const boldBrowLanes = deriveRecommendedLookLanes([
  {area: 'brow', color: {hex: '#2A1E16'}, texture: '두껍고 진한 볼드 브로우'},
]);
expectEqual(boldBrowLanes?.brow?.thicknessProfile, 3, 'bold cue -> full coverage profile');
expectEqual(boldBrowLanes?.brow?.thickness, 1.15, 'bold cue -> thicker band');
expectEqual(boldBrowLanes?.brow?.styleTemplate, 8, 'bold cue never changes the shape asset');
const fluffyBrowLanes = deriveRecommendedLookLanes([
  {area: 'brow', texture: '풍성한 일자 눈썹'},
]);
expectEqual(fluffyBrowLanes?.brow?.shape, 0, 'fluffy+straight cue -> straight shape');
expectEqual(fluffyBrowLanes?.brow?.thicknessProfile, 3, 'fluffy cue -> full coverage profile');
expectEqual(fluffyBrowLanes?.brow?.thickness, 1.1, 'fluffy cue -> slightly thicker band');
expectEqual(
  deriveRecommendedLookLanes([{area: 'brow', texture: '얇은 눈썹'}])?.brow?.thickness,
  0.9,
  'slim cue -> thinner band',
);

// 시술 지시문(technique/steps)은 모양·두께 판정에서 제외 — 백엔드 표준 문구
// ('꼬리는 짧고 선명하게')가 실루엣·두께를 뒤집던 회귀 봉인.
const fallbackNaturalBrowLanes = deriveRecommendedLookLanes([
  {
    area: 'brow',
    texture: '보송한 파우더',
    technique: '앞머리는 옅게, 꼬리는 짧고 선명하게',
    steps: [{instruction: '앞머리는 옅게, 꼬리는 짧고 선명하게 정돈해요'}],
  },
]);
expectEqual(fallbackNaturalBrowLanes?.brow?.shape, 1, 'technique wording never picks a shape');
expectEqual(fallbackNaturalBrowLanes?.brow?.thicknessProfile, 2, 'technique wording never triggers bold');
expectEqual(
  fallbackNaturalBrowLanes?.brow?.styleIntensity,
  0.62,
  'technique wording never raises intensity',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'brow', texture: '숱이 적은 눈썹'}])?.brow
    ?.thicknessProfile,
  2,
  'sparse-hair wording stays soft (no fluffy inversion)',
);
// 시술 지시문의 결 정돈 문구('결을 위로 올려 빗어')는 모양을 바꾸지 않는다 —
// 모양어가 눈썹을 직접 수식하지 않으면 무신호 기본(소프트 일자)이다.
const archCueLanes = deriveRecommendedLookLanes([
  {area: 'brow', texture: '보송한 파우더', technique: '눈썹 결을 위로 올려 빗어 정돈합니다'},
]);
expectEqual(archCueLanes?.brow?.shape, 1, 'grooming wording never promotes the shape');
expectEqual(archCueLanes?.brow?.arch, 0.08, 'arch stays at the brow-look baseline');

// ── 자유 서술(goal) 오독 봉인 ───────────────────────────────────────────────
// goal에는 얼굴형·눈매 어휘와, goal이 비면 매퍼가 합성하는 룩 제목이 섞여 온다.
const goalLane = (goal: string, texture = '보송한 파우더') =>
  deriveRecommendedLookLanes([{area: 'brow', texture, goal}])?.brow;
// 명시적 눈썹 모양이 얼굴형·눈매 수식어보다 우선한다.
expectEqual(
  goalLane('올라간 눈매를 눌러주는 일자 눈썹')?.shape,
  0,
  'explicit brow shape wins over eye-shape wording',
);
expectEqual(
  goalLane('둥근 얼굴형에 각을 더해 정돈하는 눈썹')?.shape,
  1,
  'face-shape wording never picks the round brow asset',
);
expectEqual(
  goalLane('각진 얼굴형을 부드럽게 보완하는 눈썹')?.shape,
  1,
  'angular face wording never picks the arch asset',
);
expectEqual(
  goalLane('눈꼬리가 올라간 눈매와 균형을 맞추는 눈썹')?.shape,
  1,
  'raised-eye wording never picks the arch asset',
);
// 부정 서술이 그 축을 반대로 확정하지 않는다.
expectEqual(
  goalLane('과한 아치 없이 자연스럽게 정돈')?.shape,
  1,
  'negated arch stays on the default shape',
);
expectEqual(
  goalLane('아치를 낮춰 평평하고 직선적인 눈썹')?.shape,
  0,
  'flattened-arch wording resolves to the straight asset',
);
// 룩 제목 파생 goal이 눈썹 두께·강도를 지배하지 않는다(두께·정의감은 texture만).
expectEqual(
  goalLane('볼드 레드 글램의 분위기를 브로우에 담아 정돈해요')?.thickness,
  1,
  'title-derived goal never thickens the brow',
);
expectEqual(
  goalLane('짙은 스모키 나이트의 분위기를 브로우에 담아 정돈해요')?.styleIntensity,
  0.62,
  'title-derived goal never raises the brow intensity',
);
expectEqual(
  goalLane('둥근 러블리 글로우의 분위기를 브로우에 담아 정돈해요')?.shape,
  1,
  'title-derived goal never picks a brow shape',
);
// 두께 관형형('두꺼운')은 잡고, 부정형('두껍지 않게')은 잡지 않는다.
expectEqual(
  deriveRecommendedLookLanes([{area: 'brow', texture: '두꺼운 결의 파우더'}])?.brow
    ?.thickness,
  1.15,
  'common adnominal thickness wording is recognised',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'brow', texture: '두껍지 않게 얇고 자연스러운'}])
    ?.brow?.thickness,
  0.9,
  'negated thickness falls through to the slim cue',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'brow', texture: '짙지 않게 은은한 파우더'}])?.brow
    ?.styleIntensity,
  0.62,
  'negated definition keeps the baseline intensity',
);

// eye 가이드: 아래 섀도 표식 상시 + 플랜 '깊이'/'라인' 색 채택.
const eyePlanLanes = deriveRecommendedLookLanes([
  {
    area: 'eye',
    texture: '고운 음영',
    applicationPlan: {
      steps: [
        {title: '음영', colors: [{role: '깊이', hex: '#5C4A46'}]},
        {title: '라인', colors: [{role: '라인', hex: '#3A241E'}]},
      ],
    },
  },
]);
expectEqual(eyePlanLanes?.lowerShadow?.colorHex, '#5C4A46', 'plan depth hex -> lower shadow');
expectEqual(eyePlanLanes?.eyelinerColorHex, '#3A241E', 'deep plan line hex adopted');
expectEqual(
  eyePlanLanes?.upperBaseColorHex,
  undefined,
  'no base role -> no base wash lane',
);
// 눈 플랜 '베이스' role → 베이스 워시 밴드 색.
expectEqual(
  deriveRecommendedLookLanes([
    {
      area: 'eye',
      applicationPlan: {
        steps: [{title: '베이스 정돈', colors: [{role: '베이스', hex: '#D5C5BC'}]}],
      },
    },
  ])?.upperBaseColorHex,
  '#D5C5BC',
  'plan base role hex -> base wash lane',
);

const brightLinerLanes = deriveRecommendedLookLanes([
  {
    area: 'eye',
    applicationPlan: {steps: [{colors: [{role: '라인', hex: '#E08A6B'}]}]},
  },
]);
expectEqual(
  brightLinerLanes?.eyelinerColorHex,
  undefined,
  'bright line hex rejected by luminance gate',
);
expectEqual(
  brightLinerLanes?.lowerShadow !== undefined,
  true,
  'eye guide always marks the lower-shadow lane',
);
expectEqual(
  brightLinerLanes?.lowerShadow?.colorHex,
  undefined,
  'no depth hex -> downstream falls back to guide color',
);

// 애교살: 언급 여부와 무관하게 눈 가이드가 있으면 항상 동반. 새틴(0) 고정 —
// 매트는 밝은 피부에서 하이라이트를 오히려 어둡게 만든다.
const aegyoLanes = deriveRecommendedLookLanes([
  {area: 'eye', steps: [{instruction: '애교살 포인트를 밝게 살린다'}]},
]);
expectEqual(aegyoLanes?.aegyo?.intensity, 0.45, 'aegyo visible intensity');
expectEqual(aegyoLanes?.aegyo?.colorHex, '#F7E7CE', 'aegyo ivory pearl highlight color');
expectEqual(aegyoLanes?.aegyo?.finish, 0, 'aegyo satin finish (max pigment)');
expectEqual(
  deriveRecommendedLookLanes([{area: 'eye', texture: '고운 음영'}])?.aegyo?.intensity,
  0.45,
  'aegyo rides along even without a mention',
);

// 섀도 실루엣 = 카탈로그 마스크 페어(위/아래 짝).
expectEqual(
  deriveRecommendedLookLanes([{area: 'eye', texture: '고운 음영'}])?.shadowMask?.upper,
  'eye_base',
  'no silhouette cue -> natural base mask',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'eye', texture: '고운 음영'}])?.shadowMask?.lower,
  'under_wash',
  'base mask pairs with the full-length under wash',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'eye', texture: '딥 스모키'}])?.shadowMask?.lower,
  'under_full_smoky',
  'smoky cue -> smoky mask pair',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'eye', placement: '눈꼬리 바깥 V존'}])?.shadowMask
    ?.upper,
  'eye_outer_wide',
  'outer cue -> outer-wide mask pair',
);
expectEqual(
  deriveRecommendedLookLanes([{area: 'base', texture: '보송한 세미매트'}]),
  undefined,
  'base-only guides -> no lanes',
);

// 눈썹 색 게이트 — 밝은 가이드 hex는 라이트 브라운으로 스냅(직채색 셰이더의
// 흰 눈썹 방지), 딥한 hex는 그대로 채택.
const lightBrowState = createLookMakeupEditState({
  role: 'anchor',
  areaGuides: [{area: 'brow', color: {hex: '#F5E7DA'}, texture: '밝은 베이지 브로우'}],
});
expectEqual(
  lightBrowState?.controls.brow.colorHex,
  '#8A6B52',
  'light brow hex snapped to light brown',
);
const deepBrowState = createLookMakeupEditState({
  role: 'anchor',
  areaGuides: [{area: 'brow', color: {hex: '#4A3428'}, texture: '자연 눈썹'}],
});
expectEqual(
  deepBrowState?.controls.brow.colorHex,
  '#4A3428',
  'deep brow hex adopted unchanged',
);

// 라이너 분석색 게이트 — 밝은 분석 eyeliner 색은 기각하고 딥 기본색 유지.
const lightLinerState = createLookMakeupEditState(
  {role: 'anchor', areaGuides: [{area: 'eye', color: {hex: '#8A5A40'}, texture: '음영'}]},
  {eyeliner: '#e08a6b'},
);
expectEqual(
  lightLinerState?.controls.eyeliner.colorHex,
  getInitialFullFaceMakeupEditState().controls.eyeliner.colorHex,
  'light analysis liner color rejected (deep default kept)',
);

// createLookMakeupEditState가 레인을 첨부하고, 프리셋 폴백 경로엔 없다.
expectEqual(guidedState?.lookLanes !== undefined, true, 'guided state carries look lanes');
expectEqual(
  cleanSmokyState.lookLanes,
  undefined,
  'preset fallback state has no look lanes',
);

// 분석 makeupColors.eyeliner(진짜 분석 딥색)는 여전히 라이너에 채택된다 —
// 라우트가 eye 가이드 색을 이 키에 싣던 세탁 경로만 제거됐다.
const linerAnalysisState = createLookMakeupEditState(
  {role: 'anchor', areaGuides: [{area: 'eye', color: {hex: '#8A5A40'}, texture: '시머'}]},
  {eyeliner: '#3a241e'},
);
expectEqual(
  linerAnalysisState?.controls.eyeliner.colorHex,
  '#3a241e',
  'analysis deep liner color still adopted',
);

// 질감 휴리스틱 한/영 키워드 스팟 체크
expectEqual(resolveLookFinishId('eyeshadow', '매트하게'), 'matte', 'ko matte eyeshadow');
expectEqual(resolveLookFinishId('eyeshadow', 'glitter point'), 'shimmer', 'en glitter eyeshadow');
expectEqual(resolveLookFinishId('foundation', '물광 피부'), 'glow', 'ko glow foundation');
expectEqual(resolveLookFinishId('brow', '또렷한 눈썹'), 'clear', 'ko defined brow');
expectEqual(resolveLookFinishId('eyeliner', ''), 'soft', 'empty texture -> region default');
