/**
 * 커스텀 라인 아이콘 — react-native-svg 한 장으로 앱 전역 아이콘을 통일한다.
 * 유니코드/이모지 글리프(↶ ↷ ⌄ ⚙️ …) 대체. 24 뷰박스·2px 스트로크·라운드 캡(Feather 계열
 * 지오메트리 차용, MIT). 색·두께는 prop으로, 유리 UI 위에 얹히면 리퀴드글래스 톤과 맞는다.
 *
 * stroke/strokeWidth/fill은 <Svg> 루트에 주면 자식 프리미티브가 상속받는다(SVG 규약).
 */
import React from 'react';
import Svg, {
  Circle,
  Line,
  Path,
  Polygon,
  Polyline,
  Rect,
} from 'react-native-svg';

export type IconName =
  | 'chevronUp'
  | 'chevronDown'
  | 'undo'
  | 'redo'
  | 'plus'
  | 'settings'
  | 'image'
  | 'cameraFlip'
  | 'book'
  | 'eyeOff'
  | 'sun'
  | 'grid'
  | 'symmetry'
  | 'target'
  | 'folder'
  | 'droplet'
  | 'user'
  | 'scissors';

interface Props {
  name: IconName;
  /** 정사각 한 변(px). 기본 20 */
  size?: number;
  /** 스트로크 색. 기본 흰색 */
  color?: string;
  /** 스트로크 두께. 기본 2 */
  strokeWidth?: number;
}

// 아이콘별 도형 — 전부 24 뷰박스. 색·두께는 루트에서 상속.
const SHAPES: Record<IconName, React.ReactNode> = {
  chevronUp: <Polyline points="18 15 12 9 6 15" />,
  chevronDown: <Polyline points="6 9 12 15 18 9" />,
  undo: (
    <>
      <Polyline points="1 4 1 10 7 10" />
      <Path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </>
  ),
  redo: (
    <>
      <Polyline points="23 4 23 10 17 10" />
      <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>
  ),
  plus: (
    <>
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  settings: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  image: (
    <>
      <Rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <Circle cx="8.5" cy="8.5" r="1.5" />
      <Polyline points="21 15 16 10 5 21" />
    </>
  ),
  cameraFlip: (
    <>
      <Polyline points="23 4 23 10 17 10" />
      <Polyline points="1 20 1 14 7 14" />
      <Path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  book: (
    <>
      <Path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <Path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <Line x1="1" y1="1" x2="23" y2="23" />
    </>
  ),
  sun: (
    <>
      <Circle cx="12" cy="12" r="5" />
      <Line x1="12" y1="1" x2="12" y2="3" />
      <Line x1="12" y1="21" x2="12" y2="23" />
      <Line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <Line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <Line x1="1" y1="12" x2="3" y2="12" />
      <Line x1="21" y1="12" x2="23" y2="12" />
      <Line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <Line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </>
  ),
  grid: (
    <>
      <Rect x="3" y="3" width="7" height="7" rx="1" />
      <Rect x="14" y="3" width="7" height="7" rx="1" />
      <Rect x="14" y="14" width="7" height="7" rx="1" />
      <Rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  // 좌우대칭 — 중앙 점선 축 + 축을 향해 마주보는 두 삼각형(거울 대칭 은유).
  symmetry: (
    <>
      <Line x1="12" y1="3" x2="12" y2="21" strokeDasharray="2 2.5" />
      <Polygon points="4 6 9.5 12 4 18" />
      <Polygon points="20 6 14.5 12 20 18" />
    </>
  ),
  // 크로스헤어(Feather) — 내 핏(배치 조준) 도구 레일 토글용.
  target: (
    <>
      <Circle cx="12" cy="12" r="8" />
      <Line x1="12" y1="1" x2="12" y2="5" />
      <Line x1="12" y1="19" x2="12" y2="23" />
      <Line x1="1" y1="12" x2="5" y2="12" />
      <Line x1="19" y1="12" x2="23" y2="12" />
    </>
  ),
  // 폴더(Feather) — 스튜디오 허브(저작·라이브러리) 진입용.
  folder: (
    <Path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ),
  // 물방울(Feather droplet) — 향수 추천 도구 레일 진입용.
  droplet: (
    <Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  ),
  // 사람(Feather user) — 체형 체크 도구 레일 진입용.
  user: (
    <>
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx="12" cy="7" r="4" />
    </>
  ),
  // 가위(Feather scissors) — 헤어 추천 도구 레일 진입용.
  scissors: (
    <>
      <Circle cx="6" cy="6" r="3" />
      <Circle cx="6" cy="18" r="3" />
      <Line x1="20" y1="4" x2="8.12" y2="15.88" />
      <Line x1="14.47" y1="14.48" x2="20" y2="20" />
      <Line x1="8.12" y1="8.12" x2="12" y2="12" />
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  color = '#FFFFFF',
  strokeWidth = 2,
}: Props) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {SHAPES[name]}
    </Svg>
  );
}
