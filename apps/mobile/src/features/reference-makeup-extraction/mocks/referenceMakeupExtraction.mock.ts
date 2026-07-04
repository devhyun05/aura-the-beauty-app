import {appAssetSource} from '../../../shared/config/mediaAssets';
import type {ReferenceMakeupExtractionData} from '../types';

const lookOjiGirl = appAssetSource('images/looks/look-ojigirl.png');
const filterLovelyPinkActress = appAssetSource('images/makeup-filters/filter-lovely-pink-actress.png');
const productSatinCushion = appAssetSource('images/products/product-satin-cushion.png');
const productRoseLacquer = appAssetSource('images/products/product-rose-lacquer.png');
const productSheerPowder = appAssetSource('images/products/product-sheer-powder.png');
const productNeutralPalette = appAssetSource('images/products/product-neutral-palette.png');
const productLilacCheek = appAssetSource('images/products/product-lilac-cheek.png');
const productClearGloss = appAssetSource('images/products/product-clear-gloss.png');
export const referenceMakeupExtractionMock: ReferenceMakeupExtractionData = {
  photos: [
    {
      id: 'influencer-muted-rose',
      title: '뮤트 로즈 인플루언서 룩',
      referenceSource: 'album',
      imageSource: lookOjiGirl,
      contentType: 'image/png',
    },
    {
      id: 'lovely-pink-actress',
      title: '러블리 핑크 배우상 룩',
      referenceSource: 'album',
      imageSource: filterLovelyPinkActress,
      contentType: 'image/png',
    },
  ],
  loadingSteps: [
    {
      id: 'reference-read',
      label: '레퍼런스 사진 정보 확인',
      status: 'active',
    },
    {
      id: 'core-points',
      label: '메이크업 핵심 포인트 정리',
      status: 'waiting',
    },
    {
      id: 'area-guides',
      label: '부위별 메이크업 방법 구성',
      status: 'waiting',
    },
    {
      id: 'product-criteria',
      label: '추천 제품 검색 기준 생성',
      status: 'waiting',
    },
    {
      id: 'ar-filter-ready',
      label: 'AR 필터 연결 준비',
      status: 'waiting',
    },
  ],
  extractedMakeupLook: {
    id: 'lovely-pink-actress-reference-look',
    title: '맑은 핑크 배우상 메이크업',
    subtitle:
      '투명한 피부결 위에 핑크 혈색과 부드러운 눈매를 연결한 러블리 컨설턴트 룩이에요.',
    imageSource: filterLovelyPinkActress,
    tags: ['#레퍼런스분석', '#러블리핑크', '#세미글로우', '#부드러운눈매'],
    accuracy: 91,
    lookDna: {
      moodKeywords: ['러블리', '맑음', '부드러움'],
      difficulty: '보통',
      keyAreas: ['볼', '입술', '눈'],
      textureBalance: [
        {id: 'glow', label: '세미 글로우', value: 60, color: '#F0D6C8'},
        {id: 'powder', label: '파우더 블러', value: 25, color: '#E59AA6'},
        {id: 'watery', label: '수분광', value: 15, color: '#D96F83'},
      ],
    },
    palette: [
      {
        id: 'skin-semi-glow',
        label: '피부',
        hex: '#F0D6C8',
        description: '얇고 맑은 아이보리 베이지에 은은한 윤기',
      },
      {
        id: 'eye-rose-brown',
        label: '눈',
        hex: '#B7776E',
        description: '로즈 브라운 음영으로 눈매를 부드럽게 정리',
      },
      {
        id: 'cheek-clear-pink',
        label: '볼',
        hex: '#E59AA6',
        description: '볼 중앙을 환하게 만드는 맑은 핑크 혈색',
      },
      {
        id: 'lip-clear-rose',
        label: '입술',
        hex: '#D96F83',
        description: '입술 안쪽은 생기 있게, 외곽은 가볍게 번지는 로즈 핑크',
      },
    ],
    points: [
      {
        id: 'thin-skin-layer',
        title: '얇고 맑은 피부결',
        description: '커버를 두껍게 올리기보다 피부 중앙을 얇게 정돈해 투명함을 남겨요.',
      },
      {
        id: 'soft-eye-line',
        title: '부드러운 눈매 정리',
        description: '강한 스모키보다 로즈 브라운 음영과 얇은 라인으로 또렷함을 만들어요.',
      },
      {
        id: 'pink-balance',
        title: '핑크 계열의 연결감',
        description: '볼과 입술의 핑크 톤을 맞춰 얼굴 전체가 한 가지 무드로 보이게 해요.',
      },
    ],
    areaGuides: [
      {
        id: 'skin',
        label: '피부',
        title: '얇고 맑은 세미 글로우 피부',
        color: {
          name: '아이보리 베이지',
          hex: '#F0D6C8',
        },
        texture: '얇게 밀착되고 은은한 윤기가 남는 세미 글로우',
        quickTip: '얼굴 중앙은 얇게 밝히고, 파우더는 무너지는 부분에만 소량 사용해요.',
        analysis:
          '레퍼런스에서는 피부가 두껍게 덮인 느낌보다 맑고 균일하게 정돈된 느낌이 강해요. 광은 얼굴 전체가 아니라 볼 앞, 콧대처럼 빛이 닿는 부분에만 살아 있습니다.',
        howTo:
          '스킨케어 후 쿠션이나 파운데이션을 얼굴 중앙부터 얇게 펴 바르고, 잡티가 보이는 부분만 컨실러로 눌러 주세요. 마지막에 파우더는 코 옆과 턱처럼 쉽게 무너지는 부분에만 소량 사용하면 투명함이 유지돼요.',
        professionalPoint:
          '이 룩은 커버력보다 레이어 두께가 중요해요. 한 번에 많이 바르지 말고 얇은 막을 두 번 쌓는 방식이 사진의 피부결에 더 가깝습니다.',
        productRecommendation: {
          category: 'base',
          searchQuery: '얇은 세미 글로우 쿠션 파운데이션',
          reason:
            '피부 결을 가리지 않고 맑게 정돈해야 하므로 두꺼운 매트 파운데이션보다 얇게 밀착되는 글로우 베이스가 잘 맞아요.',
          product: {
            id: 'product-hera-satin-glow-cushion',
            brandName: '헤라',
            productName: '새틴 글로우 쿠션',
            price: 36000,
            imageSource: productSatinCushion,
          },
        },
      },
      {
        id: 'eye',
        label: '눈',
        title: '로즈 브라운으로 또렷한 눈매',
        color: {
          name: '로즈 브라운',
          hex: '#B7776E',
        },
        texture: '무광 베이스 위에 아주 작은 새틴 펄이 섞인 질감',
        quickTip: '베이지를 넓게 깔고 로즈 브라운은 쌍꺼풀 라인과 눈꼬리에만 얇게 쌓아요.',
        analysis:
          '눈두덩 전체가 진하게 칠해진 룩은 아니고, 눈꼬리와 쌍꺼풀 라인 쪽에 부드러운 음영이 모여 있어요. 라인은 얇지만 속눈썹 가까이 채워져 눈매가 또렷해 보입니다.',
        howTo:
          '밝은 베이지 섀도를 눈두덩에 먼저 깔고, 로즈 브라운을 쌍꺼풀 라인과 눈꼬리 위주로 한 번 더 얹어 주세요. 아이라인은 점막 가까이 얇게 그리고, 눈꼬리는 길게 빼기보다 살짝만 정리하면 부드러운 인상이 유지돼요.',
        professionalPoint:
          '경계가 보이면 성숙한 음영 메이크업처럼 보일 수 있어요. 브러시에 남은 양으로 위쪽 경계를 풀어 눈을 뜬 상태에서도 색이 자연스럽게 이어지게 만드는 게 핵심입니다.',
        productRecommendation: {
          category: 'shadow',
          searchQuery: '로즈 브라운 데일리 섀도우 팔레트',
          reason:
            '베이스, 중간 음영, 눈꼬리 포인트를 한 팔레트에서 단계적으로 쌓을 수 있어야 사진의 부드러운 깊이를 만들기 좋아요.',
          product: {
            id: 'product-dasique-neutral-palette',
            brandName: '데이지크',
            productName: '뉴트럴 브라운 팔레트',
            price: 34000,
            imageSource: productNeutralPalette,
          },
        },
      },
      {
        id: 'brow',
        label: '눈썹',
        title: '결을 살린 소프트 브라운 눈썹',
        color: {
          name: '내추럴 브라운',
          hex: '#6F5148',
        },
        texture: '파우더리하고 뭉침 없는 자연스러운 결 표현',
        quickTip: '앞머리는 연하게, 비어 보이는 중간부터 짧은 선으로 결을 채워요.',
        analysis:
          '눈썹은 진하게 각을 세우기보다 본래 결을 따라 부드럽게 채운 형태예요. 앞머리는 연하고, 중간부터 꼬리까지는 자연스럽게 농도가 이어집니다.',
        howTo:
          '눈썹 앞머리는 브러시에 남은 양으로만 쓸어 주고, 비어 보이는 중간 부분부터 짧은 선을 여러 번 그려 채워 주세요. 꼬리는 아래로 꺾지 말고 눈매 흐름에 맞춰 살짝 길게 정리하면 얼굴이 순해 보여요.',
        professionalPoint:
          '눈썹 색이 너무 검으면 핑크 계열의 맑은 분위기가 끊겨요. 헤어보다 반 톤 밝거나 회갈색이 섞인 브라운을 쓰면 전체 룩과 잘 이어집니다.',
        productRecommendation: {
          category: 'liner',
          searchQuery: '내추럴 브라운 슬림 아이브로우 펜슬',
          reason:
            '눈썹 결을 한 올씩 채우는 룩이라 넓은 파우더보다 얇은 펜슬이나 슬림 브로우 제품이 더 정교하게 맞아요.',
          product: {
            id: 'product-clio-slim-brow-pencil',
            brandName: '클리오',
            productName: '슬림 브로우 펜슬',
            price: 12000,
            imageSource: productClearGloss,
          },
        },
      },
      {
        id: 'cheek',
        label: '볼',
        title: '맑게 퍼지는 핑크 혈색',
        color: {
          name: '클리어 핑크',
          hex: '#E59AA6',
        },
        texture: '경계가 흐린 파우더 블러 또는 크림을 얇게 픽스한 질감',
        quickTip: '볼 중앙보다 살짝 위에 첫 터치를 두고 바깥쪽으로 넓게 풀어요.',
        analysis:
          '볼은 과하게 동그란 치크가 아니라 얼굴 중앙을 밝히는 정도로 넓게 번져 있어요. 핑크가 선명하지만 농도는 가벼워서 피부 위에 혈색처럼 보입니다.',
        howTo:
          '웃었을 때 올라오는 볼 중앙보다 살짝 위쪽에 첫 터치를 두고, 바깥쪽과 아래쪽으로 힘을 빼며 넓게 풀어 주세요. 한 번에 진하게 올리지 말고 거울에서 한 발 물러나 보며 두 번 정도만 얇게 쌓는 게 좋아요.',
        professionalPoint:
          '치크의 시작점이 너무 코 가까이 오면 어려 보이기보다 답답해질 수 있어요. 눈동자 바깥 라인 근처부터 시작하면 사진처럼 맑고 정돈된 인상이 납니다.',
        productRecommendation: {
          category: 'cheek',
          searchQuery: '라이트 핑크 블러 치크',
          reason:
            '볼 위에 뭉치지 않고 넓게 퍼져야 하므로 입자가 고운 라이트 핑크 블러셔가 레퍼런스의 맑은 혈색에 잘 맞아요.',
          product: {
            id: 'product-clio-lilac-cheek',
            brandName: '클리오',
            productName: '라일락 블러 치크',
            price: 22000,
            imageSource: productLilacCheek,
          },
        },
      },
      {
        id: 'lip',
        label: '입술',
        title: '맑은 로즈 핑크 생기 립',
        color: {
          name: '클리어 로즈 핑크',
          hex: '#D96F83',
        },
        texture: '촉촉하지만 과한 유리알 광은 아닌 수분 틴트 질감',
        quickTip: '입술 안쪽은 선명하게 찍고, 외곽은 손끝으로 부드럽게 흐려요.',
        analysis:
          '입술은 얼굴에서 가장 생기가 모이는 포인트예요. 중앙 컬러가 살아 있고 외곽은 부드럽게 흐려져 있어, 선명하지만 부담스럽지 않은 핑크 립으로 보입니다.',
        howTo:
          '입술 안쪽에 먼저 컬러를 찍고 음파음파로 퍼뜨린 뒤, 면봉이나 손끝으로 외곽 경계를 가볍게 흐려 주세요. 입술산은 또렷하게 그리기보다 본래 라인을 살짝 따라가면 러블리한 분위기가 유지됩니다.',
        professionalPoint:
          '치크와 같은 핑크 계열이지만 립은 한 단계 더 선명해야 얼굴 중심이 살아나요. 다만 외곽선을 딱 끊어 그리면 레퍼런스의 부드러움이 줄어듭니다.',
        productRecommendation: {
          category: 'lip',
          searchQuery: '맑은 로즈 핑크 촉촉한 틴트',
          reason:
            '중앙은 선명하고 외곽은 자연스럽게 번지는 표현이 필요해서 착색이 너무 진한 매트 틴트보다 수분감 있는 로즈 핑크 틴트가 좋아요.',
          product: {
            id: 'product-amuse-dew-tint',
            brandName: '어뮤즈',
            productName: '듀 틴트',
            price: 20000,
            imageSource: productRoseLacquer,
          },
        },
      },
      {
        id: 'contour',
        label: '윤곽',
        title: '거의 티 나지 않는 소프트 윤곽',
        color: {
          name: '라이트 토프 베이지',
          hex: '#B99B8B',
        },
        texture: '피부 위에 얇게 녹는 매트 파우더 질감',
        quickTip: '얼굴 외곽은 큰 브러시로 한 번만 쓸고, 하이라이트는 작은 면에만 얹어요.',
        analysis:
          '윤곽은 강하게 깎는 방식이 아니라 얼굴 바깥 라인을 아주 약하게 정리하는 정도예요. 하이라이트도 번쩍이는 펄보다 피부 광에 가깝게 들어가 있습니다.',
        howTo:
          '쉐딩은 턱 끝이나 광대 아래를 진하게 칠하기보다 얼굴 외곽을 큰 브러시로 한 번 쓸어 주세요. 하이라이트는 콧대 전체가 아니라 콧등 중앙, 눈 밑 앞쪽, 입술산처럼 작은 면에만 살짝 얹는 게 좋습니다.',
        professionalPoint:
          '핑크 러블리 룩에서 윤곽이 진하면 분위기가 무거워져요. 색은 회색보다 베이지가 섞인 토프 계열을 고르고, 브러시에 묻은 양을 손등에서 한 번 털어낸 뒤 올리세요.',
        productRecommendation: {
          category: 'shadow',
          searchQuery: '라이트 토프 베이지 쉐딩 팔레트',
          reason:
            '강한 컨투어보다 자연스러운 음영 정리가 필요해서 붉은기 적은 라이트 토프 컬러의 쉐딩 제품이 잘 맞아요.',
          product: {
            id: 'product-soft-contour-palette',
            brandName: '데이지크',
            productName: '소프트 컨투어 팔레트',
            price: 26000,
            imageSource: productSheerPowder,
          },
        },
      },
    ],
  },
};
