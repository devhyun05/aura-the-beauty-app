# 글램 2.0 룩 스펙 — 데모 대표작 정본

> 목표: 상용 필터(SODA) 이상, 레퍼런스(쿨톤 더우인 인형 메이크업)에 근접한 **립+눈 1세트** 데모 샘플.
> 이 문서가 유일한 정본. 스펙 변경은 반드시 여기 반영 후 작업.
> 관련: [에셋 계약](GLAM2_ASSET_CONTRACTS_KO.md) · [작업 로그](GLAM2_WORKLOG_KO.md)

## 0. 확정 결정 (2026-07-21)

- 립 색: **딥 로즈/레드 유지** (레퍼런스의 쿨로즈 구조만 이식, 색은 글램 계열)
- 속눈썹: **내추럴 위스피** (만화/해바라기 클러스터, 길이 절제)
- 섀도: ~~코랄핑크~~ → **쿨 더스티 로즈 + 뮤트 모브** (레퍼런스 재판독으로 정정, 딥 로즈 립과 조화)
- 눈 3요소(속눈썹·아이라인·섀도) **전부 텍스처 재생성**, 립은 셰이더 파라미터 튜닝만
- 애교살: 튜닝 확정(밝힘·음영), 프로파일 재생성은 정찰 후 판정

## 1. 스타일 정의

**쿨톤 더우인 인형 메이크업** (Cool-toned Douyin doll makeup) — 냉감 청순 + 인형 눈.
구성: 만화 속눈썹(睫毛 클러스터) + 소프트 키튼 윙 + 모브 헤일로 섀도 + 또렷한 애교살 + 시럽광 그라데 립.

## 2. 요소별 스펙

### 2.1 속눈썹 (텍스처 생성)
- 구조: 얇은 투명 밴드 + 촘촘한 잔모 뿌리 + 메인 클러스터 **7~9개**/눈 (뿌리 모이고 끝 갈라짐)
- 길이 프로파일: 눈머리 **35~45%** → 중앙 **75~90%** → 중앙-바깥 **100%(최장)** → 꼬리 끝 테이퍼
- 컬: 강한 C컬, 위+바깥 부채꼴
- 아래 속눈썹(선택): 성긴 짧은 가닥, 중앙·바깥에 가는 스파이크, 저불투명 별도 레이어

### 2.2 아이라인 (텍스처 생성 + 튜닝)
- 종류: **소프트 키튼 윙** (캣아이보다 낮고 퍼피보다 안 처짐)
- 색: 차콜 브라운블랙 (잉크 블랙 금지 — 바깥 경계는 브라운 기운)
- 두께: 눈머리 0.2~0.5mm → 중앙 0.8~1.2 → 바깥 1/3 **1.5~2mm(최대)** → 바늘 테이퍼
- 꼬리: 상승각 **5~10°**, 길이 = 눈 폭의 **8~12%**, 위 경계 선명·아래 경계는 래시와 융합
- 눈머리 micro point (짧고 뾰족, 과한 앞트임 금지)

### 2.3 아이섀도 (마스크 생성 + 밴드 튜닝)
- 색 3층: 베이스 페일 핑크 / 중심 **더스티 로즈·뮤트 모브** / 음영 쿨 토프
- 존: 래시라인+바깥 1/3 가장 진함 → 쌍꺼풀 위로 페더 (눈썹뼈 도달 금지), 눈 중앙은 밝고 투명
- 아래: 동공 아래→눈꼬리 모브 음영, 애교살 그림자와 연결돼 **타원형 핑크 헤일로**
- 펄: 마이크로 시머만, 중심 눈두덩+눈머리·애교살 안쪽 절반. 눈꼬리는 매트
- ⚠️ **색 마스크와 펄 마스크 분리** (색=디자이너 마스크 슬롯, 펄=FinishMap G채널)

### 2.4 애교살 (튜닝)
- 밝힘: 아래 래시 바로 밑, 동공 아래가 최대 폭 **3~5mm**, 양끝 좁아짐. 색은 페일 핑크베이지 (순백 금지)
- 음영선: 래시 아래 **4~6mm**, 동공 아래에서 시작→바깥으로, 쿨 토프 로즈, 경계 흐림
- 펄: 눈머리~중앙만 마이크로 펄. 밝기 맵과 펄 맵 분리

### 2.5 립 (파라미터 튜닝 — 생성 없음)
- 색: 딥 로즈/레드 (확정), 구조는 레퍼런스 이식:
  - 안쪽 맞닿는 선 가장 어둡게 (그라데 스톱B 안쪽)
  - 아랫입술 중앙 1/3에만 광 — **시럽/젤리광** (유리광·시머 금지, 작은 반사점 여러 개 성질)
  - 윗입술은 아랫입술보다 살짝 매트 (입체감)
- 커버리지 상한 ~85% (밑 질감 비침 필수), 넓은 페더 + 입꼬리 페이드, 오버라인 0

## 3. 성공 기준 (심사 체크)

1. 경계선이 보이지 않는다 (특히 윗입술 산·입꼬리)
2. 광이 존재하고 위치가 맞다 (아랫입술 중앙)
3. 밑 질감(입술 주름·피부)이 비친다
4. 속눈썹이 "곤충 다리"가 아니라 뿌리띠+잔털로 읽힌다
5. 레퍼런스와 나란히 놓고 같은 장르로 보인다

## 4. Sprite Generator 최종 프롬프트

공통 규칙: 속눈썹·라이너=흰 배경(Remove BG용), 섀도=검정 배경 흑백 마스크. 첫 생성은 1장 테스트 후 4장 배치. 결함은 인페인팅으로 수리.

**속눈썹 (1순위):**
> A single black false eyelash strip isolated on a pure white background, side profile, wide upward fan shape following a gentle horizontal curve. Thin transparent band, dense fine roots, eight separated manga-style spike clusters with delicate filler hairs between them, short inner fibers, longest fibers at the outer-middle, tapering at the final edge, high C curl. No eye, face, skin, packaging, text, or cast shadow.

**아이라인 (1순위):**
> One clean soft kitten-wing eyeliner stroke in charcoal brown-black on a pure white background. Tiny pointed inner-corner extension, ultra-thin through the inner half, moderate center, thicker outer third extending into a short needle-fine wing lifted at a low angle. Sharp delicate tip. No eye, eyelashes, skin, lower liner, text.

**섀도 마스크 (1순위):**
> Create a grayscale eyeshadow coverage mask on a pure black background. Show one isolated elongated eye-makeup region made only from soft white and gray airbrushed shapes. The upper-lid area should be strongest near the lash line and outer third, then fade smoothly above the crease and toward the outer edge. Add a narrow curved lower-eye haze that is strongest beneath the outer half, separated from the upper shape by a thin black eye-opening gap. Include no eye, iris, eyelashes, skin, text, or hard outlines.

(예비 변형은 2026-07-21 ChatGPT 분석 회신 원문 참조 — 각 3종)

## 5. 역할 분담

- **Unity AI**: 원재료 비트맵 생성만 (앱 구조 모름)
- **사용자**: 생성 버튼 클릭 + 후보 미적 심사 + 최종 판정
- **Claude**: 프롬프트 준비 → 알파·레이아웃 가공(코드) → 임포트(계약 강제) → 셰이더 튜닝 → 캡처 비교 검증

## 6. 주의점 (지뢰 목록)

1. **립 라우팅 확정이 튜닝보다 먼저** — 글램 립이 E3/Fable 어느 경로로 그려지는지 콘솔 로그로 확인 (엉뚱한 셰이더 튜닝 방지)
2. 임포트 계약: 마스크류 비압축·리니어(non-sRGB)·Clamp·밉맵 주의
3. 기존 프리셋 불변 — 글램 2.0은 **새 프리셋 추가**, enum·기본값 변경 금지
4. 에디터 검증 씬 ≠ 실기기 — 발색·광은 피드 luma 기반이라 최종 판정은 폰
5. Sprite Generator 포인트 절약 — 1장 테스트 → 배치
6. 속눈썹 텍스처: 좌우 미러링·알파 방식·해상도는 [에셋 계약](GLAM2_ASSET_CONTRACTS_KO.md) 정찰 결과 따를 것
