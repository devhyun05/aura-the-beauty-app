import type {ImageSourcePropType} from 'react-native';

import type {Product} from '../types/userPage';

const productRomandTint =
  require('../../assets/images/products/product-romand-tint.png') as ImageSourcePropType;
const productClioCushion =
  require('../../assets/images/products/product-clio-cushion.png') as ImageSourcePropType;
const productDasiqueCheek =
  require('../../assets/images/products/product-dasique-cheek.png') as ImageSourcePropType;
const productDasiquePalette =
  require('../../assets/images/products/product-dasique-palette.png') as ImageSourcePropType;
const productClioLiner =
  require('../../assets/images/products/product-clio-liner.png') as ImageSourcePropType;
const productAmuseTint =
  require('../../assets/images/products/product-amuse-tint.png') as ImageSourcePropType;

export const productsMock: Product[] = [
  {
    id: 'product-romand-juicy-lasting-tint',
    brandName: '롬앤',
    productName: '쥬시 래스팅 틴트',
    price: 15000,
    imageSource: productRomandTint,
    isLiked: true,
  },
  {
    id: 'product-clio-mesh-glow-cushion',
    brandName: '클리오',
    productName: '킬 커버 메쉬 글로우 쿠션',
    price: 32000,
    imageSource: productClioCushion,
    isLiked: true,
  },
  {
    id: 'product-dasique-blending-mood-cheek',
    brandName: '데이지크',
    productName: '블렌딩 무드 치크',
    price: 24000,
    imageSource: productDasiqueCheek,
    isLiked: true,
  },
  {
    id: 'product-dasique-shadow-palette',
    brandName: '데이지크',
    productName: '섀도우 팔레트',
    price: 34000,
    imageSource: productDasiquePalette,
    isLiked: true,
  },
  {
    id: 'product-clio-superproof-pen-liner',
    brandName: '클리오',
    productName: '수퍼프루프 펜 라이너',
    price: 14000,
    imageSource: productClioLiner,
    isLiked: true,
  },
  {
    id: 'product-amuse-dew-tint',
    brandName: '어뮤즈',
    productName: '듀 틴트',
    price: 20000,
    imageSource: productAmuseTint,
    isLiked: true,
  },
];
