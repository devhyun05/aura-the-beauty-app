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

// 부위 크롭·가이드 폴리라인용 인덱스(P3). MediaPipe face_mesh topology 기준, 피사체 L/R.
// 콧대 중심선(nasion→코끝): 168·6·197·195·5·4·1.
export const NOSE_BRIDGE_MIDLINE_INDICES = [168, 6, 197, 195, 5, 4, 1] as const;
// 콧볼(alare) 좌우 — 중안부 크롭 폭.
export const NOSE_ALAE_INDICES = [98, 327] as const;
// 외곽 입술 링(윗입술 좌→우, 아랫입술 우→좌) — 입술 라인 가이드 + 하안부 크롭.
export const OUTER_LIP_RING_INDICES = [61, 40, 39, 37, 0, 267, 269, 270, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146] as const;
// 하악 실루엣(피사체 오른턱→턱끝152→왼턱) — 턱 곡선 가이드 + 외곽 크롭.
export const JAW_SILHOUETTE_INDICES = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397] as const;
// 이마(상안부 크롭 상단 확장, B4) — 헤어라인중앙10·상부151·글라벨라상9·이마측면67/297.
// 필수 아님(availablePts로 있는 것만 사용) — 앞머리에 가려 없으면 눈썹까지만 확장.
export const FOREHEAD_INDICES = [10, 151, 9, 67, 297] as const;

// 서비스 입구 가드: 아래 인덱스가 전부 존재+finite 가 아니면 결과 전체를
// blocked(required_landmarks_missing) 처리한다 (478 전수 검사가 아님).
export const FACE_GEOMETRY_REQUIRED_INDICES: readonly number[] = [
  ...Object.values(FACE_GEOMETRY_LANDMARK_INDICES),
  ...BROW_CORE_RIGHT_INDICES,
  ...BROW_CORE_LEFT_INDICES,
];

// ⚠ 후보(실기기 검증 필요) — 외안각 수렴각용 상/하 눈꺼풀 접선 표본점.
// 외안각(33/263) 근방 상연·하연 링에서 1점씩. round/almond 구분용.
export const CANTHAL_TANGENT_INDICES = {
  upperRight: 161,
  lowerRight: 163,
  upperLeft: 388,
  lowerLeft: 390,
} as const;

// ⚠ 후보 — 눈썹 상연 edge (medial→lateral 순). apex(최고점) 탐색·호길이 비율용.
// BROW_CORE 의 상연 5점을 medial→lateral 로 재배열한 것.
export const BROW_UPPER_EDGE_RIGHT_INDICES = [107, 66, 105, 63, 70] as const;
export const BROW_UPPER_EDGE_LEFT_INDICES = [336, 296, 334, 293, 300] as const;
