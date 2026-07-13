// MediaPipe FaceMesh(478) 랜드마크 인덱스 — 앱 최초의 TS 인덱스 모듈.
//
// ⚠️ 명명 기준: 피사체(anatomical) 기준. subjectLeft = 비미러 이미지의 화면 오른쪽.
//  - apps/mobile/ios/AURA/E7NativeLipBoundaryProviders.swift: 피사체 기준(left=276대)
//    — 이 모듈과 동일 기준.
//  - apps/mobile/ios/AURA/AURAPersonalColorAnalyzer.m: 이미지 기준("left" cheek =
//    {50,101,...} = 피사체 오른뺨) — 반대 기준. 그쪽에서 인덱스를 포팅할 때는
//    좌우 재매핑이 필수다.
//
// 멤버십은 공식 MediaPipe face_mesh topology(face_mesh_connections.py)와 대조됨.

export const FACE_GEOMETRY_LANDMARK_INDICES = {
  // 얼굴 폭(볼 윤곽 최외곽) — 대부분 비율 지표의 분모.
  faceWidthRight: 234,
  faceWidthLeft: 454,

  // 눈: 내안각(inner) / 외안각(outer). canthalTilt 는 항상 내→외 방향으로 계산한다.
  eyeInnerRight: 133,
  eyeOuterRight: 33,
  eyeInnerLeft: 362,
  eyeOuterLeft: 263,

  // 눈꺼풀 상/하 중앙점 — eyeOpenness.
  eyeUpperLidRight: 159,
  eyeLowerLidRight: 145,
  eyeUpperLidLeft: 386,
  eyeLowerLidLeft: 374,

  // 입꼬리.
  mouthCornerRight: 61,
  mouthCornerLeft: 291,

  // 입술 중앙 세로 두께: 윗입술 0(외곽 상단)↔13(안쪽 하단), 아랫입술 14(안쪽 상단)↔17(외곽 하단).
  upperLipOuterTop: 0,
  upperLipInnerBottom: 13,
  lowerLipInnerTop: 14,
  lowerLipOuterBottom: 17,

  // 하악(턱 모서리 부근 윤곽) / 아래턱 윤곽 폭. 턱끝은 152(이 모듈에서는 미사용).
  jawRight: 172,
  jawLeft: 397,
  lowerJawRight: 148,
  lowerJawLeft: 377,
} as const;

// 눈썹 코어 링 10점(하연 5 + 상연 5) — browSlope 최소자승, eyeBrowGap 하연 최저점.
export const BROW_CORE_RIGHT_INDICES = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70] as const;
export const BROW_CORE_LEFT_INDICES = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300] as const;

// 서비스 입구 가드: 아래 인덱스가 전부 존재+finite 가 아니면 결과 전체를
// blocked(required_landmarks_missing) 처리한다 (478 전수 검사가 아님).
export const FACE_GEOMETRY_REQUIRED_INDICES: readonly number[] = [
  ...Object.values(FACE_GEOMETRY_LANDMARK_INDICES),
  ...BROW_CORE_RIGHT_INDICES,
  ...BROW_CORE_LEFT_INDICES,
];
