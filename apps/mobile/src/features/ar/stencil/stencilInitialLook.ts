import type {EyeshadowLayer, FilterParams} from './src/bridge/types';

/**
 * 외부 플로우(메이크업 추천 등)가 StencilARApp에 주입하는 시작 룩. 마운트 시 1회
 * 컴포저 트리로 분해 적용된다 — '사진→룩 추출'(lookExtracted)과 동일한
 * changeTreeUser 관문이라 undo·저장·편집이 전부 일반 룩과 똑같이 동작한다.
 * (.tsx가 아닌 이 모듈에 두는 이유: 라우트 타입/서비스가 --jsx 없는 컨트랙트
 * 러너에서도 타입만 안전하게 import할 수 있어야 한다.)
 */
export type StencilInitialLook = {
  label: string;
  params: Partial<FilterParams>;
  eyeshadowLayers?: EyeshadowLayer[];
  /** §16 카탈로그 마스크 참조 — flat params가 URI를 못 담아 사이드채널로 싣는다
   *  (FilterPreset.maskRefs 선례). decomposeToTree가 해당 부위 잎에 붙이고,
   *  params의 …MaskImported 마커와 짝이 맞아야 App reconcile이 setRegionMask를
   *  보낸다(마커만 있고 URI가 없으면 하부가 번들 스모키 실루엣 고아 상태). */
  maskRefs?: {region: string; uri: string}[];
};
