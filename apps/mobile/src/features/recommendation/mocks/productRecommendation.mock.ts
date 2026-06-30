import {appAssetSource, makeupFilterAssetSource} from '../../../shared/config/mediaAssets';
import {userProfileMock} from '../../../shared/mocks/user.mock';
import type {ProductRecommendationData} from '../types';

const makeupLookImage = appAssetSource('images/looks/look-mute-rosy-daily.png');

const velureLipstickRoseWood = makeupFilterAssetSource('filter-plum-syrup-gloss.png');
const laurelleGlossRoseVeil = makeupFilterAssetSource('filter-water-glow-clean.png');
const luneraAiryTintRoseMist = makeupFilterAssetSource('filter-milky-strawberry-pink.png');
const luneraLiquidBlushPeachDusk = makeupFilterAssetSource('filter-juice-coral.png');
const velureBlushRoseCompact = makeupFilterAssetSource('filter-one-gyaru-rose.png');
const velureEyePaletteRoseHaze = appAssetSource('images/looks/look-mute-rosy-daily.png');
const velureEyePaletteRoseNeutral = appAssetSource('images/looks/look-royal-brown.png');
const velureLiquidLinerDeepCocoa = makeupFilterAssetSource('filter-latte-brown.png');
const velureBrowFlickTaupe = appAssetSource('images/looks/look-warm-beige-natural.png');
const velureGlowCushionNeutral = makeupFilterAssetSource('filter-glass-skin-nude.png');

export const productRecommendationMock: ProductRecommendationData = {
  userNickname: userProfileMock.nickname,
  makeupLook: {
    title: '내추럴 뮤트 로즈 룩',
    description: '분석된 로즈 톤과 어울리는 실제 컬러 제품만 골라 추천해드려요.',
    imageSource: makeupLookImage,
    tags: ['로즈 립', '피치 블러셔', '브라운 음영', '뉴트럴 베이스'],
    palette: ['#C96F72', '#E49C90', '#A77A69', '#5A3D34'],
  },
  tabs: [
    {id: 'all', label: '전체'},
    {id: 'lip', label: '립'},
    {id: 'cheek', label: '블러셔'},
    {id: 'shadow', label: '아이섀도우'},
    {id: 'liner', label: '아이라이너'},
    {id: 'base', label: '베이스'},
  ],
  products: [
    {
      id: 'velure-lipstick-rose-wood',
      brandName: '벨루어',
      productName: '벨벳 립스틱',
      shadeName: '로즈 우드',
      category: 'lip',
      matchRate: 95,
      price: 28000,
      tags: ['로즈우드', '세미매트', 'MLBB'],
      imageSource: velureLipstickRoseWood,
      palette: ['#B95F62', '#D48A85'],
      reason: '입술 본연의 색과 비슷한 로즈 우드 톤이라 차분한 데일리 룩에 잘 맞아요.',
    },
    {
      id: 'laurelle-gloss-rose-veil',
      brandName: '로렐',
      productName: '글로스 틴트',
      shadeName: '로즈 베일',
      category: 'lip',
      matchRate: 92,
      price: 19000,
      tags: ['글로스', '로즈베일', '볼륨'],
      imageSource: laurelleGlossRoseVeil,
      palette: ['#C95E68', '#EDB1B5'],
      reason: '로즈 컬러에 맑은 광택을 더해 입술 중앙 볼륨을 자연스럽게 살려줘요.',
    },
    {
      id: 'lunera-airy-tint-rose-mist',
      brandName: '루네라',
      productName: '에어리 틴트',
      shadeName: '로즈 미스트',
      category: 'lip',
      matchRate: 90,
      price: 17000,
      tags: ['에어리', '로즈미스트', '소프트'],
      imageSource: luneraAiryTintRoseMist,
      palette: ['#C75E68', '#E79196'],
      reason: '부드럽게 번지는 장미빛 컬러라 과하지 않은 생기를 만들기 좋아요.',
    },
    {
      id: 'lunera-liquid-blush-peach-dusk',
      brandName: '루네라',
      productName: '리퀴드 블러쉬',
      shadeName: '피치 더스크',
      category: 'cheek',
      matchRate: 93,
      price: 22000,
      tags: ['피치더스크', '리퀴드', '생기'],
      imageSource: luneraLiquidBlushPeachDusk,
      palette: ['#D77A75', '#F0AAA0'],
      reason: '광대 위쪽에 얇게 올리면 얼굴 중심이 밝아지고 로즈 립과 자연스럽게 이어져요.',
    },
    {
      id: 'velure-blush-rose-compact',
      brandName: '벨루어',
      productName: '실키 블러쉬',
      shadeName: '소프트 로즈',
      category: 'cheek',
      matchRate: 89,
      price: 26000,
      tags: ['로즈블러셔', '파우더', '은은함'],
      imageSource: velureBlushRoseCompact,
      palette: ['#D67674', '#F0B5AD'],
      reason: '파우더 타입이라 경계가 부드럽고, 전체 메이크업을 깔끔하게 정돈해줘요.',
    },
    {
      id: 'velure-eye-palette-rose-haze',
      brandName: '벨루어',
      productName: '아이 팔레트',
      shadeName: '로즈 헤이즈',
      category: 'shadow',
      matchRate: 94,
      price: 39000,
      tags: ['로즈헤이즈', '음영', '글리터'],
      imageSource: velureEyePaletteRoseHaze,
      palette: ['#D6A394', '#C98082', '#8B5F55', '#5F4039'],
      reason: '로즈 브라운 음영과 은은한 펄 조합이 눈매를 차분하게 또렷하게 만들어줘요.',
    },
    {
      id: 'velure-eye-palette-rose-neutral',
      brandName: '벨루어',
      productName: '아이 팔레트',
      shadeName: '로즈 뉴트럴',
      category: 'shadow',
      matchRate: 91,
      price: 37000,
      tags: ['뉴트럴', '데일리', '브라운'],
      imageSource: velureEyePaletteRoseNeutral,
      palette: ['#E2B6A7', '#C68A7F', '#956A61', '#6C4942'],
      reason: '붉은 기와 브라운이 균형 있게 섞여 데일리 음영으로 쓰기 좋아요.',
    },
    {
      id: 'velure-liquid-liner-deep-cocoa',
      brandName: '벨루어',
      productName: '디파인 리퀴드 라이너',
      shadeName: '딥 코코아',
      category: 'liner',
      matchRate: 90,
      price: 21000,
      tags: ['딥코코아', '슬림라인', '리퀴드'],
      imageSource: velureLiquidLinerDeepCocoa,
      palette: ['#4B3028'],
      reason: '블랙보다 부드러운 코코아 브라운이라 눈꼬리 각도 보정이 자연스러워요.',
    },
    {
      id: 'velure-brow-flick-taupe',
      brandName: '벨루어',
      productName: '브로우 플릭',
      shadeName: '타우프',
      category: 'liner',
      matchRate: 86,
      price: 20000,
      tags: ['타우프', '브로우', '결정리'],
      imageSource: velureBrowFlickTaupe,
      palette: ['#786356', '#A08A7A'],
      reason: '눈썹 꼬리와 빈 곳을 차분하게 채워 전체 인상을 더 정돈해줘요.',
    },
    {
      id: 'velure-glow-cushion-neutral',
      brandName: '벨루어',
      productName: '글로우 쿠션',
      shadeName: '뉴트럴 아이보리',
      category: 'base',
      matchRate: 88,
      price: 34000,
      tags: ['뉴트럴', '쿠션', '세미글로우'],
      imageSource: velureGlowCushionNeutral,
      palette: ['#E4C5A8', '#F4DDC8'],
      reason: '밝은 아이보리 피부 톤에 맞춰 중앙은 맑게, 외곽은 차분하게 표현해줘요.',
    },
  ],
  sets: [
    {
      id: 'daily-rose-set',
      title: '데일리 로즈 조합',
      description: '로즈 우드 립, 피치 블러쉬, 로즈 헤이즈 팔레트로 차분한 데일리 룩',
      productIds: [
        'velure-lipstick-rose-wood',
        'lunera-liquid-blush-peach-dusk',
        'velure-eye-palette-rose-haze',
      ],
    },
    {
      id: 'clear-glow-set',
      title: '클리어 글로우 조합',
      description: '글로스 틴트와 뉴트럴 쿠션으로 맑고 깨끗한 로즈 글로우 룩',
      productIds: [
        'laurelle-gloss-rose-veil',
        'velure-blush-rose-compact',
        'velure-glow-cushion-neutral',
      ],
    },
  ],
};
