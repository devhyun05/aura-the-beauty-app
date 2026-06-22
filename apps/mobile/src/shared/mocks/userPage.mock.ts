import type { UserPageData } from '../types/userPage';

export const userPageMock: UserPageData = {
  profile: {
    id: 'user-seojin',
    name: '서진',
    email: 'seojin@email.com',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=320&q=80',
    personalColor: '봄웜 라이트',
    skinType: '건성 피부',
    skinTone: '밝은 피부톤',
  },
  reports: [
    {
      id: 'report-2026-06-22',
      analyzedAt: '2026.06.22',
      title: '맞춤 분석 보고서',
      personalColor: '봄웜 라이트',
      skinType: '건성 피부',
      summary: '맑은 코랄 톤과 촉촉한 윤기 베이스가 잘 어울려요.',
    },
    {
      id: 'report-2026-06-08',
      analyzedAt: '2026.06.08',
      title: '데일리 메이크업 분석',
      personalColor: '봄웜 라이트',
      skinType: '건성 피부',
      summary: '피치 베이스와 은은한 글로우 표현을 추천해요.',
    },
  ],
  makeupStyles: [
    {
      id: 'style-clear-coral',
      title: '오지컬',
      imageUrl:
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=360&q=80',
      isSaved: true,
    },
    {
      id: 'style-soft-mauve',
      title: '모리걸',
      imageUrl:
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=360&q=80',
      isSaved: true,
    },
    {
      id: 'style-clean-smoky',
      title: '클린 스모키',
      imageUrl:
        'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=360&q=80',
      isSaved: true,
    },
  ],
  favoriteProducts: [
    {
      id: 'product-romand-tint',
      brandName: '롬앤',
      productName: '쥬시 래스팅 틴트',
      price: 15000,
      imageUrl:
        'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=320&q=80',
      isLiked: true,
    },
    {
      id: 'product-clio-cushion',
      brandName: '클리오',
      productName: '립 커버 매쉬 글로우 쿠션',
      price: 32000,
      imageUrl:
        'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=320&q=80',
      isLiked: true,
    },
    {
      id: 'product-dasique-cheek',
      brandName: '데이지크',
      productName: '블렌딩 무드 치크',
      price: 24000,
      imageUrl:
        'https://images.unsplash.com/photo-1631214540242-3cd8c31b1884?auto=format&fit=crop&w=320&q=80',
      isLiked: true,
    },
  ],
};
