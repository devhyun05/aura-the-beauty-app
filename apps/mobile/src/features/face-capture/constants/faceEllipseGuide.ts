// 얼굴 세로 비율(face_analysis) 촬영용 타원 프레이밍 가이드 기하.
// 타원은 순수 시각 가이드다 — 얼굴을 타원 안에 맞추면 촬영되며, 실제 거리·정렬
// 판정은 greenlight(faceWidthRatio 거리 + 센터라인 정렬)가 담당한다.
// (턱/정수리 점 매칭 게이트, ARKit FaceAnchor 거리 gate는 모두 취소됨.)
//
// 아래 수치는 실기기에서 타원 크기/위치를 튜닝하는 것을 전제로 이 객체에 모아둔다.
export const FACE_ELLIPSE_GUIDE_TUNING = {
  // 타원 높이 = preview height 비율. 이 값 하나로 타원 전체 크기 조절(폭은 파생).
  heightToPreviewHeightRatio: 0.4,
  // 타원 폭 = 타원 높이 비율
  widthToHeightRatio: 0.65,
  // 타원 세로 중심 위치 = preview height 비율 (principal point 없을 때 사용).
  // 값이 작을수록 타원이 위로, 클수록 아래로. 실기기 튜닝 대상.
  verticalCenterRatio: 0.46,
  // (ARKit 재도입 대비) principal point 앵커일 때만 사용하는 위치 비율.
  snFromTopRatio: 0.64,
} as const;

export type FaceEllipseGuideTuning = typeof FACE_ELLIPSE_GUIDE_TUNING;

export type FaceEllipsePoint = {
  x: number;
  y: number;
};

export type FaceEllipseGuideGeometry = {
  bottomDot: FaceEllipsePoint;
  centerX: number;
  centerY: number;
  height: number;
  snTarget: FaceEllipsePoint;
  topDot: FaceEllipsePoint;
  width: number;
};

// 타원 배치:
// - principal point가 있으면(향후 ARKit): 그 점을 Sn 목표로 삼아 snFromTopRatio 앵커.
// - 없으면(현재): 화면 x 중앙 + verticalCenterRatio 세로 중심으로 배치.
export function computeFaceEllipseGuideGeometry({
  previewHeight,
  previewWidth,
  principalPointInPreview,
  tuning = FACE_ELLIPSE_GUIDE_TUNING,
}: {
  previewHeight: number;
  previewWidth: number;
  principalPointInPreview?: FaceEllipsePoint | null;
  tuning?: FaceEllipseGuideTuning;
}): FaceEllipseGuideGeometry {
  const height = previewHeight * tuning.heightToPreviewHeightRatio;
  const width = height * tuning.widthToHeightRatio;
  const hasPrincipalPoint =
    principalPointInPreview != null &&
    Number.isFinite(principalPointInPreview.x) &&
    Number.isFinite(principalPointInPreview.y);

  const centerX = hasPrincipalPoint
    ? (principalPointInPreview as FaceEllipsePoint).x
    : previewWidth / 2;
  const top = hasPrincipalPoint
    ? (principalPointInPreview as FaceEllipsePoint).y - height * tuning.snFromTopRatio
    : previewHeight * tuning.verticalCenterRatio - height / 2;
  const centerY = top + height / 2;
  const snTarget = hasPrincipalPoint
    ? {x: centerX, y: (principalPointInPreview as FaceEllipsePoint).y}
    : {x: centerX, y: centerY};

  return {
    bottomDot: {x: centerX, y: top + height},
    centerX,
    centerY,
    height,
    snTarget,
    topDot: {x: centerX, y: top},
    width,
  };
}
