import type { ImageSourcePropType } from 'react-native';

import type { Product } from '../types/userPage';

const productRomandTint =
  require('../../assets/images/products/product-romand-tint.png') as ImageSourcePropType;
const productHeraCushion =
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
    id: 'product-romand-glasting-water-tint',
    brandName: '롬앤',
    productName: '글래스팅 워터 틴트',
    price: 15000,
    imageSource: productRomandTint,
    isLiked: true,
  },
  {
    id: 'product-hera-black-cushion',
    brandName: '헤라',
    productName: '블랙 쿠션 21N1',
    price: 32000,
    imageSource: productHeraCushion,
    isLiked: true,
  },
  {
    id: 'product-dasique-mood-cheek',
    brandName: '데이지크',
    productName: '블렌딩 무드 치크 02',
    price: 24000,
    imageSource: productDasiqueCheek,
    isLiked: true,
  },
  {
    id: 'product-dasique-eye-palette',
    brandName: '데이지크',
    productName: '뉴트럴 아이 팔레트',
    price: 27000,
    imageSource: productDasiquePalette,
    isLiked: false,
  },
  {
    id: 'product-clio-liner',
    brandName: '클리오',
    productName: '샤프 블랙 라이너',
    price: 19000,
    imageSource: productClioLiner,
    isLiked: false,
  },
  {
    id: 'product-amuse-tint',
    brandName: '어뮤즈',
    productName: '듀 틴트 코랄',
    price: 18000,
    imageSource: productAmuseTint,
    isLiked: false,
  },
];
