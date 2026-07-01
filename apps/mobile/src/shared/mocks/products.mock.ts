import {appAssetSource, makeupFilterAssetSource} from '../config/mediaAssets';
import type {Product} from '../types/profile';

const productSatinCushion = makeupFilterAssetSource('filter-glass-skin-nude.png');
const productRoseLacquer = makeupFilterAssetSource('filter-one-gyaru-rose.png');
const productSheerPowder = appAssetSource('images/looks/look-warm-beige-natural.png');
const productNeutralPalette = appAssetSource('images/looks/look-royal-brown.png');
const productLilacCheek = makeupFilterAssetSource('filter-milky-strawberry-pink.png');
const productClearGloss = makeupFilterAssetSource('filter-water-glow-clean.png');
const productVelvetTint = makeupFilterAssetSource('filter-plum-syrup-gloss.png');

export const productsMock: Product[] = [
  {
    id: 'product-romand-juicy-lasting-tint',
    brandName: '롬앤',
    productName: '쥬시 래스팅 틴트',
    price: 15000,
    imageSource: productVelvetTint,
    isLiked: true,
  },
  {
    id: 'product-clio-mesh-glow-cushion',
    brandName: '클리오',
    productName: '킬 커버 메쉬 글로우 쿠션',
    price: 32000,
    imageSource: productSatinCushion,
    isLiked: true,
  },
  {
    id: 'product-dasique-blending-mood-cheek',
    brandName: '데이지크',
    productName: '블렌딩 무드 치크',
    price: 24000,
    imageSource: productLilacCheek,
    isLiked: true,
  },
  {
    id: 'product-dasique-shadow-palette',
    brandName: '데이지크',
    productName: '섀도우 팔레트',
    price: 34000,
    imageSource: productNeutralPalette,
    isLiked: true,
  },
  {
    id: 'product-clio-superproof-pen-liner',
    brandName: '클리오',
    productName: '수퍼프루프 펜 라이너',
    price: 14000,
    imageSource: productClearGloss,
    isLiked: true,
  },
  {
    id: 'product-amuse-dew-tint',
    brandName: '어뮤즈',
    productName: '듀 틴트',
    price: 20000,
    imageSource: productRoseLacquer,
    isLiked: true,
  },
  {
    id: 'product-hera-satin-glow-cushion',
    brandName: '헤라',
    productName: '새틴 글로우 쿠션',
    price: 36000,
    imageSource: productSatinCushion,
    isLiked: true,
  },
  {
    id: 'product-romand-rose-lacquer',
    brandName: '롬앤',
    productName: '로즈 워터 래커',
    price: 16000,
    imageSource: productRoseLacquer,
    isLiked: true,
  },
  {
    id: 'product-laneige-sheer-powder',
    brandName: '라네즈',
    productName: '시어 피니시 파우더',
    price: 28000,
    imageSource: productSheerPowder,
    isLiked: true,
  },
  {
    id: 'product-dasique-neutral-palette',
    brandName: '데이지크',
    productName: '뉴트럴 브라운 팔레트',
    price: 34000,
    imageSource: productNeutralPalette,
    isLiked: true,
  },
  {
    id: 'product-clio-lilac-cheek',
    brandName: '클리오',
    productName: '라일락 블러 치크',
    price: 22000,
    imageSource: productLilacCheek,
    isLiked: true,
  },
  {
    id: 'product-amuse-clear-gloss',
    brandName: '어뮤즈',
    productName: '클리어 립 글로스',
    price: 18000,
    imageSource: productClearGloss,
    isLiked: true,
  },
];
