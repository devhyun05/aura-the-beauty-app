# 체크포인트 ⑥ 사전 잠금 annotation — 판정 전 수정 금지

Codex #14 §Q7 프로토콜: 이 annotation은 파이프라인 실행 **전에** 잠금된다.
판정(체크포인트 ⑥ 실행) 이후에는 어떤 파일도 수정할 수 없다.

- 제작 일시: 2026-07-12 06:15 KST
- 제작 방식: 원본 열람 + mediapipe FaceMesh(0.10.14, refine_landmarks) 직접 임포트 + cv2 폴리곤.
  파이프라인 코드(spike/ eval/ engine/)는 임포트·실행하지 않음. 홀드아웃 사진에 마스크 생성·LaMa 등 파이프라인 미실행.
- 검수: 오버레이·콧구멍 4배 확대 크롭을 육안 검수. 총 2 라운드
  (1라운드에서 IMG_4572 진한 수염이 턱선 랜드마크 아래로 늘어져 미포함 → 턱선 하단 확장 14/6/5px 적용 후 2라운드 승인).
- 침범 검증: 3장 모두 target ∩ 입술 버밀리언 = 0px, target ∩ 콧구멍 어퍼처 = 0px
  (target은 입술 버밀리언+3px 팽창, 어퍼처+2px 마진을 제외하고 생성됨).

## 양성 3장 (수염 제거 대상)

| 원본 | 밀도 | target (지워질 전부: 인중·볼·턱·턱선, 목 제외) | 입술 버밀리언 | 콧구멍 어퍼처 | 검수용 |
|---|---|---|---|---|---|
| 아카이브/denceKorean/IMG_4572.JPG | dense (비차단 프로브) | IMG_4572_target.png | IMG_4572_lip.png | IMG_4572_aperture.json | IMG_4572_overlay.png, IMG_4572_nosecrop.png |
| 아카이브/denceKorean/IMG_4570.JPG | medium | IMG_4570_target.png | IMG_4570_lip.png | IMG_4570_aperture.json | IMG_4570_overlay.png, IMG_4570_nosecrop.png |
| 아카이브/denceKorean/IMG_4575.JPG | medium(콧수염+턱수염) | IMG_4575_target.png | IMG_4575_lip.png | IMG_4575_aperture.json | IMG_4575_overlay.png, IMG_4575_nosecrop.png |

- `*_target.png`: 8-bit 단일채널, 255 = 지워져야 할 수염 목표 영역(원본과 동일 해상도).
- `*_lip.png`: 255 = 입술 버밀리언(outer vermilion 경계 폴리곤). 이 영역은 결과물에서 보존되어야 함.
- `*_aperture.json`: 콧구멍 2점 중심좌표(x,y) + 반경 px. 이 원 내부는 결과물에서 보존되어야 함.
- `*_overlay.png` / `*_nosecrop.png`: 검수 근거 사본(초록=target, 빨강=입술, 파랑 원=어퍼처).

## negative 2장 (수염 없음 — annotation 불필요)

- 아카이브/IMG_4561.JPG
- 아카이브/IMG_4565.JPG

기준: 파이프라인 통과 시 **editPx = 0 이고 출력이 입력과 byte identity**여야 통과.
(마스크·폴리곤 annotation이 존재하지 않는 것 자체가 스펙이다.)
