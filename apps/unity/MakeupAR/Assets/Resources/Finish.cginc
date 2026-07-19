#ifndef ARMAKEUP_FINISH_INCLUDED
#define ARMAKEUP_FINISH_INCLUDED

// 마감(finish) 공용 함수 — 립·아이섀도·블러셔가 공유(드리프트 방지, Occlusion.cginc 선례).
// 피드 luma가 곧 그 픽셀에 실제로 떨어진 빛(설계 섹션 13). GrabPass 피드 기반이라
// 신규 의존 0.
//
// 제형 스튜디오(#21): enum(0새틴/1매트/2글로시/3시머)의 내부 빛 반응 파라미터를 노출.
//   glossLo        광 임계 — 어디부터 반짝(낮=넓은 은은광=새틴, 높=정점만=유리광)
//   glossGain      광 게인 — 얼마나 반짝(매트↔글로시, 젖은 하이라이트 가산)
//   shimmerSize    펄/시머 입자 크기(고운 시머↔굵은 글리터 — 셀 주파수)
//   shimmerDensity 펄/시머 밀도(반짝 셀 비율·밝기)
//   matte          광 억제(파우더성 매트화 — 하이라이트 감쇠)
//   sheen          벨벳 시언 — 저~중 루마(그레이징) 영역의 부드러운 역광 반사(레트로리플렉션)
//
// ★ 하위호환(대수 검증): 여섯 세부값 합이 0이면 기존 enum 경로로 분기해
//   리팩터 전과 픽셀 단위로 동일하다. 세부값이 하나라도 0이 아니면(제형 스튜디오
//   커스텀·저장 제형) 커스텀 제형 경로로 재해석한다. sheen은 신규 축이라 게이트 합에
//   포함(sheen만 켜도 커스텀 경로 진입)하되, 커스텀 경로 내 sheen 가산항이 sheen에
//   선형이므로 sheen=0이면 기존 커스텀 결과도 바이트 불변.

// 벨벳 시언 튜닝 상수 — 실기기 미검증(광 임계·강도 조정 대상).
#define SHEEN_LO   0.12   // 이 루마 이하가 최대 시언(그레이징 하한)
#define SHEEN_HI   0.62   // 이 루마 이상은 시언 소멸(하이라이트엔 벨벳 없음)
#define SHEEN_GAIN 0.45   // 시언 최대 가산 강도(sheen=1·graze=1에서 pigment의 45%)

// ── A15: 펄/시머 방향 게인(맨얼굴 피드 로컬 루마 그라디언트) ─────────────────────
// GrabPass 공유 피드("_CameraFeed") — 립·아이섀도·블러셔가 각자 GrabPass "_CameraFeed"를
// 선언하므로 공유 표본 함수도 여기(cginc 1곳)에 두고, 텍스처·텍셀 유니폼도 이 한 곳에서만
// 선언한다(각 셰이더의 로컬 중복 선언은 제거 — Finish.cginc가 로컬 선언보다 먼저 include됨).
sampler2D _CameraFeed;
float4 _CameraFeed_TexelSize; // 이웃 탭 오프셋용. 그랩 텍스처라 0이면 탭이 겹쳐 g=0 → dirGain=1(무변조)로 안전 축약.
// 방향 게인 세기 — MakeupController가 Shader.SetGlobalFloat("_PearlLightGain", ...)로 1회
// 전역 설정하고 ApplyFinish에 lightGain 인자로 전달된다(0=완전 하위호환=무변조).
float _PearlLightGain;

// ── 헤드포즈 프록시(재질 확장) — HeadPoseSource.cs가 매 프레임 전역 설정 ────────────
// _ViewAngle.xy = 시점 프록시(yaw, pitch, 정면 ≈ 0), .z = 움직임 세기 미러, .w 예약.
// _MotionEnergy  = 움직임 세기 0..1(정지 0). 글리터 명멸·홀로그램·메탈 하이라이트 이동의
// 공통 입력. ★ 하위호환: 소스가 없거나 얼굴 소실이면 둘 다 0 → 명멸/재질 항이 무변조.
float4 _ViewAngle;
float4 _ViewAngleSmooth;  // 강평활 시점 — 재질(메탈/홀로) 색 travel(노이즈 명멸 없이 움직임에만 서서히)
float _MotionEnergy;
float _MatteGrain;        // 전역 — 매트 파우더 입자감(0=매끈, ↑=거친 파우더). MakeupController 1회 설정.
sampler2D _MatCapChrome;  // 전역 — 절차 생성 크롬 MatCap(조명 구운 구슬). 메탈이 법선.xy로 샘플.
sampler2D _MatCapHolo;    // 전역 — 홀로(오일슬릭) MatCap. 홀로 재질이 법선.xy로 샘플.
sampler2D _MatCapMulti;   // 전역 — 멀티크롬(듀오크롬) MatCap. 멀티크롬 재질이 법선.xy로 샘플.

// 글리터 명멸 튜닝 — 실기기 튜닝 대상.
#define TWINKLE_DEPTH  0.9   // 명멸 깊이(0=기존 정적, 1=완전 on/off)
#define TWINKLE_SPEED  3.5   // 움직일 때 시간 명멸 속도(느리게 조정)
// 정지 시 명멸 처리 — 데드존으로 트래킹 노이즈의 "가짜 움직임"을 컷하고, 그 위에
// 통제된 아이들 시머(B: 가만히 있어도 은은하게 살아있음)를 얹는다.
#define TWINKLE_DEADZONE    0.15  // 이 이하 _MotionEnergy는 정지로 간주(랜드마크 지터 컷)
#define TWINKLE_IDLE_SPEED  0.35  // 아이들 시머 속도(더 느리게)
#define TWINKLE_IDLE_AMOUNT 0.18  // 아이들 시머 세기(은은)
// per-flake 법선 명멸 튜닝 — 실기기 튜닝 대상.
#define FLAKE_TILT_MAX    0.55  // 조각 의사 법선의 최대 기울기(분포 폭). ↑=시점 훑는 각 넓음
#define FLAKE_VIEW_TILT   1.3   // _ViewAngle(±0.5) → 시선 벡터 측면 스케일(헤드포즈 민감도)
#define FLAKE_SPEC_SHARP  9.0   // 정반사 로브 예리함(↑=좁고 뾰족 = 크리스프한 패싯 번쩍)
#define FLAKE_WOBBLE      0.10  // 움직일 때 시선 벡터 시간 흔들림 진폭
#define FLAKE_IDLE_WOBBLE 0.035 // 정지 시 상시 미세 흔들림(B: 가만히 있어도 살아있음)

// 탭 간격·대비 스케일은 로컬 근사의 튜닝 노브 — 실기기 미검증.
#define PEARL_TAP        3.0   // 이웃 탭 간격(텍셀 배수) // 실기기 튜닝 대상
#define PEARL_GRAD_SCALE 8.0   // 루마 그라디언트 → [-1,1] 정렬 스케일 // 실기기 튜닝 대상

// _CameraFeed 루마 표본 — 화면 경계 밖 UV는 saturate로 클램프(그랩 텍스처 wrap 모드와
// 무관하게 화면 안쪽 픽셀만 읽어 엣지 랩/스미어 방지).
float PearlFeedLuma(float2 uv)
{
    fixed3 c = tex2D(_CameraFeed, saturate(uv)).rgb;
    return dot(c, fixed3(0.299, 0.587, 0.114));
}

// 로컬 루마 그라디언트 → 스파클 방향 게인. 픽셀 주변 맨얼굴 피드 루마를 4탭 읽어
// "밝은 쪽을 향한" 스파클 셀을 강조한다. 전역 광원 추정이 아니라 화면 로컬 근사.
// ★ 하위호환: lightGain=0이면 dirGain=1(1+0·align → x*1.0 바이트 불변). 그라디언트
//   평탄(g=0)이면 정렬=0 → dirGain=1 — 두 경우 모두 기존 시머와 픽셀 동일.
float PearlDirGain(float2 screenUV, float2 sparkleUV, float lightGain)
{
    float2 duv = _CameraFeed_TexelSize.xy * PEARL_TAP;
    float lumaR = PearlFeedLuma(screenUV + float2(duv.x, 0.0));
    float lumaL = PearlFeedLuma(screenUV - float2(duv.x, 0.0));
    float lumaU = PearlFeedLuma(screenUV + float2(0.0, duv.y));
    float lumaD = PearlFeedLuma(screenUV - float2(0.0, duv.y));
    float2 g = float2(lumaR - lumaL, lumaU - lumaD);   // 밝은 쪽을 가리키는 루마 그라디언트
    float2 sDir = normalize((sparkleUV - 0.5) + 1e-5); // 셀 방향 근사(중심 기준)
    // g를 정규화하지 않고 그대로 내적 — 평탄(g=0)이면 정렬=0 → dirGain=1(무변조 보장).
    float align = clamp(dot(g, sDir) * PEARL_GRAD_SCALE, -1.0, 1.0);
    return 1.0 + lightGain * align;
}

// per-flake 의사 법선 명멸(scintillation) — 각 글리터 조각을 "작은 거울(패싯)"로 본다.
// 조각마다 해시로 3D 의사 법선 N(정면 +z를 향하되 무작위로 기움)을 만들고, 헤드포즈로
// 움직이는 시선 벡터 V와의 정반사 정렬 pow(dot(N,V), sharp)로 밝기를 낸다. 고개를 돌리면
// (=_ViewAngle 변화) V가 법선 분포를 훑어, 정렬이 맞는 조각만 순간 번쩍이고 나머지는 꺼진다
// → 위상 사인이 아니라 "패싯이 빛을 문다"는 진짜 명멸. 정지 시엔 미세 아이들 흔들림, 움직일
// 땐 큰 흔들림이 V에 더해진다.
// ★ 하위호환: 정지+정면(_ViewAngle≈0, _MotionEnergy=0)이면 activity가 idle 바닥에 머물러
//   lerp(1.0, lit, activity*DEPTH)이 1.0 근처 → 기존 스파클/저장 룩과 사실상 동일. 시그니처
//   (cell, hash) 불변이라 4개 호출부·C# 무변경. cell로 법선 2번째 해시를 뽑아 무상관화.
float SparkleTwinkle(float2 cell, float hash)
{
    // 움직임 데드존 — 작은 값(트래킹 노이즈)은 0으로. 정지 시 "가짜 명멸" 차단.
    float motion = saturate((_MotionEnergy - TWINKLE_DEADZONE) / (1.0 - TWINKLE_DEADZONE));
    // per-flake 의사 법선 — 정면(+z)에서 방위 az로 tilt만큼 기운 단위 벡터. tilt는 cell 해시로
    // 조각마다 독립(azimuth/hash와 무상관) → 법선이 반구에 흩어져 시점을 훑을 때 개별 점등.
    float h2 = frac(sin(dot(cell, float2(39.71, 21.17))) * 24634.6345);
    float az = hash * 6.2831853;
    float tilt = FLAKE_TILT_MAX * h2;
    float3 N = float3(cos(az) * tilt, sin(az) * tilt, sqrt(saturate(1.0 - tilt * tilt)));
    // 시선/광 벡터 V — 정면(0,0,1)을 헤드포즈로 기울인다(고개 돌리면 V가 이동). 시간 흔들림은
    // 정지 시 미세(아이들 생기), 움직일 때 크게 — 속도도 idle↔active 보간.
    float wobSpeed = lerp(TWINKLE_IDLE_SPEED, TWINKLE_SPEED, motion);
    float wobAmt = FLAKE_IDLE_WOBBLE + FLAKE_WOBBLE * motion;
    float ph = _Time.y * wobSpeed + hash * 40.0;            // 조각별 위상 오프셋
    float2 wob = float2(sin(ph), cos(ph)) * wobAmt;
    float3 V = normalize(float3(_ViewAngle.xy * FLAKE_VIEW_TILT + wob, 1.0));
    // 정반사 정렬 — N이 V에 가까울수록 번쩍. 좁은 로브(pow sharp)라 몇몇 조각만 켜진다.
    float glint = pow(saturate(dot(N, V)), FLAKE_SPEC_SHARP) * (0.9 + 0.6 * frac(hash * 3.0));
    float lit = 0.72 + glint * 1.4;                         // 베이스 0.72(안 완전 꺼짐) ~ 정점
    // activity — 움직임(데드존) + 아이들 바닥. 정지 시에도 IDLE_AMOUNT만큼 은은한 반짝.
    float activity = saturate(motion * 1.5 + TWINKLE_IDLE_AMOUNT);
    return lerp(1.0, lit, activity * TWINKLE_DEPTH);
}

fixed3 ApplyFinish(fixed3 pigment, float luma, float2 sparkleUV, float f, float sh,
                   float glossLo, float glossGain, float shimmerSize,
                   float shimmerDensity, float matte, float sheen,
                   float2 screenUV, float lightGain)
{
    float customAmt = glossLo + glossGain + shimmerSize + shimmerDensity + matte + sheen;
    if (customAmt <= 1e-5) // ── 레거시 enum 경로 (세부 미지정 = 기존 동작, 하위호환) ──
    {
        float spec = smoothstep(0.55, 1.0, luma);
        if (f < 0.5) return pigment;                        // 새틴 = 현재 룩(기준)
        if (f < 1.5) return pigment * (1.0 - 0.38 * spec);  // 매트 = 하이라이트 억제
        if (f < 2.5)                                        // 글로시 = 미드 딥 + 젖은 광
        {
            float hot = smoothstep(0.78, 1.0, luma);
            return pigment * 0.9 + (0.5 * spec + 0.35 * hot);
        }
        // 시머 — 셀 해시 스파클. sh = 시머 게인.
        float2 cellL = floor(sparkleUV * (140.0 + 220.0 * sh));
        float hL = frac(sin(dot(cellL, float2(12.9898, 78.233))) * 43758.5453);
        float sparkleL = step(0.90 - 0.18 * sh, hL) * (0.35 + 0.65 * spec);
        // A15 방향 게인 — 밝은 쪽 향한 스파클 셀 강조(lightGain=0이면 dirGain=1 항등).
        float dirGainL = PearlDirGain(screenUV, sparkleUV, lightGain);
        // 명멸 — 정지 시 1.0(기존과 동일), 움직이면 셀별 번쩍임.
        float twL = SparkleTwinkle(cellL, hL);
        return pigment + sparkleL * (0.5 + 0.8 * sh) * dirGainL * twL;
    }

    // ── 커스텀 제형 경로 (제형 스튜디오) — 아래 상수는 실기기 튜닝 대상 ──
    // 광 임계: 낮으면 luma 넓게 잡혀 은은한 광(새틴), 높으면 정점만(유리광).
    float lo = lerp(0.35, 0.92, saturate(glossLo));
    float spec = smoothstep(lo, 1.0, luma);
    fixed3 c = pigment;
    c *= (1.0 - saturate(matte) * spec);        // 광 억제(파우더성 매트화)
    c += glossGain * spec;                       // 광 게인(매트↔글로시, 젖은 광)
    // 펄/시머 입자 — size 작을수록 고운 시머(고주파), 클수록 굵은 글리터(저주파).
    float cellScale = lerp(320.0, 40.0, saturate(shimmerSize));
    float2 cell = floor(sparkleUV * cellScale);
    float hsh = frac(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
    float sparkle = step(1.0 - 0.32 * saturate(shimmerDensity), hsh) * (0.35 + 0.65 * spec);
    // A15 방향 게인 — 커스텀 스파클도 동일 변조(shimmerDensity=0이면 항이 0이라 무영향).
    float dirGain = PearlDirGain(screenUV, sparkleUV, lightGain);
    // 명멸 — 정지 시 1.0(기존과 동일), 움직이면 셀별 번쩍임.
    float tw = SparkleTwinkle(cell, hsh);
    c += sparkle * shimmerDensity * (0.5 + 0.8 * glossGain + 0.5 * shimmerDensity) * dirGain * tw;
    // 벨벳 시언 — 글로스가 고휘도 정점을 키우는 것과 반대로, 저~중 루마(그레이징) 영역에
    // 은은한 빛무리를 얹어 벨벳/스웨이드 질감을 낸다. 색은 색소 hue를 따라 얹혀(무채
    // 화이트아웃 방지) 매트한 벨벳감. sheen=0이면 가산항 0 → 커스텀 경로 결과 불변(하위호환).
    float graze = 1.0 - smoothstep(SHEEN_LO, SHEEN_HI, luma);
    c += pigment * graze * saturate(sheen) * SHEEN_GAIN;
    return c;
}

// ── 질감 맵 임포트(#22) — 픽셀별 빛 반응 지도 (에셋 3층의 ③) ──────────────────
// 외부 툴(Substance/Blender/포토샵)에서 구운 straight 텍스처로 ApplyFinish의 스칼라
// 광 파라미터를 픽셀별로 변조한다. "어디가 얼마나 빛나는지"의 공간 지도.
//   R = 광 게인 변조 (roughness 역 — 밝을수록 반짝),   glossGain     *= map.r
//   G = 펄/시머 밀도 변조,                                shimmerDensity *= map.g
//   B = 예약 (미사용 — 후속 축)
//
// ★ 팀 제작 워크플로우 — Substance/포토샵 → 우리 채널 번역 가이드:
//   1) Substance의 Roughness 맵을 반전(1−roughness)해 R 채널에 굽는다 — 광택날 곳이
//      밝게(광 게인↑), 무광이 어둡게. (Roughness 그대로 쓰면 반대라 반드시 반전.)
//   2) 글리터/시머 마스크(반짝일 영역을 흰색으로 칠한 흑백)를 G 채널에 굽는다.
//   3) B는 비워 둔다(0, 예약). straight(non-sRGB/linear)로 내보내 감마 왜곡 방지.
//   맵은 각 부위 기존 UV로 샘플(립=링 uv 반경, 섀도=밴드 uv, 블러셔=얼굴 메시 uv).
//   판정 불필요 — #20 모양 마스크와 달리 그냥 로드해 슬롯에 건다.
//
// ★ 하위호환(대수 검증): hasMap=0(맵 미임포트)이면 변조 계수가 1.0로 고정돼
//   glossGain·shimmerDensity가 스칼라 그대로 → 리팩터 전과 픽셀 단위 동일. 맵이
//   있어도 두 스칼라가 0이면(마감 세부 미설정=enum) 곱은 여전히 0 → ApplyFinish가
//   레거시 enum 경로 유지(질감 맵은 커스텀 제형=#21 위에서만 광을 변조한다).
void ModulateFinishByMap(fixed4 finishMap, float hasMap,
                         inout float glossGain, inout float shimmerDensity)
{
    float gainMod = lerp(1.0, finishMap.r, hasMap);
    float densityMod = lerp(1.0, finishMap.g, hasMap);
    glossGain *= gainMod;
    shimmerDensity *= densityMod;
}

// ── 재질 아키타입(재질 확장) — 벨벳/메탈/홀로그램 ────────────────────────────────
// ApplyFinish가 끝난 색 위에 "물질감"을 얹는다. 화면 luma(피드 밝기)와 헤드포즈 프록시
// (_ViewAngle/_MotionEnergy)만으로 근사 — 진짜 BRDF·환경반사가 아니라 임프레션.
//   matType 0 = 없음(입력 그대로), 1 = 벨벳, 2 = 메탈, 3 = 홀로그램, 4 = 멀티크롬(듀오크롬)
//   matStrength = 0..1 블렌드 세기
// ★ 하위호환: matType=0 또는 matStrength=0이면 입력 c를 그대로 반환(픽셀 동일).
// 아래 상수는 전부 실기기 튜닝 대상.
fixed3 ApplyMaterial(fixed3 c, float luma, float2 screenUV, float3 nrm, float matType, float matStrength)
{
    if (matType < 0.5 || matStrength <= 1e-5) return c;
    fixed3 outc = c;
    if (matType < 1.5)               // ── 벨벳/스웨이드 ──
    {
        // 저~중 루마(그레이징)에 색 hue를 따르는 역광 무리 + 정점 억제(무광 표면).
        float graze = 1.0 - smoothstep(0.10, 0.60, luma);
        float hi = smoothstep(0.62, 1.0, luma);
        outc = c * (1.0 - 0.30 * hi) + c * graze * 0.55;
    }
    else if (matType < 2.5)          // ── 메탈/포일 (법선 기반 = MatCap 계열) ──
    {
        // ★ 텍스처 MatCap — 법선.xy로 "조명 구운 크롬 구슬"을 샘플(수식 근사 대신 진짜 반사에
        //   가까운 리치 크롬). 얼굴 굴곡·시점(뷰공간 법선)에 반응, 화면 luma 무관 → 깜빡임 없음.
        //   크롬 반사를 pigment 색으로 틴트(골드 pigment=금색 크롬, 중성=은색).
        float2 mcuv = nrm.xy * 0.5 + 0.5;
        fixed3 chrome = tex2D(_MatCapChrome, mcuv).rgb;
        // ★ 크롬을 "색"이 아니라 "밝기 구조(반사)"로만 쓴다 → pigment 색을 유지한 유색 금속
        //   (분홍 pigment=분홍 메탈, 골드=금 메탈). 회색으로 덮이던 문제 해결.
        float cl = dot(chrome, fixed3(0.299, 0.587, 0.114)); // 크롬의 명암 구조
        float spec = smoothstep(0.72, 1.05, cl);             // 가장 밝은 반사만 하얀 정점
        outc = c * (0.4 + 1.15 * cl) + spec * 0.55;
    }
    else if (matType < 3.5)          // ── 홀로그램/이리데슨스 (법선 기반) ──
    {
        // ★ 법선 방향으로 hue가 travel(박막 간섭 근사). 계수 대폭 하향 — 움직임당 hue가
        //   조금씩만 변하게(전체 무지개를 여러 바퀴 도는 "빠른 travel" 방지). 서서히 변함.
        // ★ 텍스처 MatCap — 법선.xy로 "오일슬릭 무지개 구슬" 샘플(수식 대신 하이라이트·림이
        //   구워진 리치 홀로). base 색을 앵커로 두고 얹어 pigment 색 유지.
        float2 mcuv = nrm.xy * 0.5 + 0.5;
        fixed3 holo = tex2D(_MatCapHolo, mcuv).rgb;
        outc = c * (0.5 + holo * 0.95);
    }
    else                             // ── 멀티크롬/듀오크롬 (2색 각도 변색, 법선 기반) ──
    {
        // 홀로(전체 무지개)와 달리 두 색 사이만 오간다: pigment ↔ 120° hue 회전(채널 회전
        // c.gbr). 각도(법선)에 따라 서서히 travel. 계수 낮게 = 움직임당 조금씩.
        // ★ 텍스처 MatCap — 법선.xy로 "듀오크롬 구슬"(보라↔초록+하이라이트+림) 샘플. base 색을
        //   앵커로 두고 얹어 pigment 색 유지 + 각도 따라 2색 travel.
        float2 mcuv = nrm.xy * 0.5 + 0.5;
        fixed3 duo = tex2D(_MatCapMulti, mcuv).rgb;
        outc = c * (0.5 + duo * 0.95);
    }
    return lerp(c, outc, saturate(matStrength));
}

// ── 7축 절차 입자(입자 레이어) — 색막/마감 위에 얹는 반짝 알갱이 오버레이 ──────────
// 마감의 연속 시머와 달리, 이산적인 "굵은 알갱이"를 표현하는 별도 레이어 타입.
// 축(7): size(크기: 고운↔굵은) · density(밀도: 성기게↔촘촘) · brightness(밝기)
//        pcolor(색) · twinkle(명멸: 정적↔움직임 번쩍) · shape(알갱이 모양: 원↔별)
//        parallax(시차: 글로스 속에 떠 있는 부유감). coverage = 부위 마스크(축 아님, 배치 게이트).
// ★ 하위호환: density<=0(또는 coverage<=0)이면 입력 그대로 반환(무변조).
// 상수는 실기기 튜닝 대상.
fixed3 ApplyParticles(fixed3 c, float luma, float2 uv, float2 screenUV,
                      float size, float density, float brightness, fixed3 pcolor,
                      float twinkle, float shape, float feather, float parallax,
                      float confetti, float coverage)
{
    if (density <= 1e-5 || coverage <= 1e-5) return c;
    // 시차 — 시점에 따라 알갱이가 배경 대비 미끄러진다(젤 속에 떠 있는 느낌).
    float2 puv = uv + _ViewAngle.xy * saturate(parallax) * 0.15;
    // 셀 간격 — 가시성 검증된 범위(size↑=큰 셀=큰 알갱이). 너무 잘게 잡으면 알갱이가
    // 서브픽셀이 돼 안 보인다(직전 버그).
    float cellScale = lerp(300.0, 26.0, saturate(size));
    float2 gv = puv * cellScale;
    // ★ 도메인 워프 — 격자 좌표를 저주파 물결로 휘어 "바둑판" 규칙 배열을 없앤다(셀별로
    //   다르게 밀려 정렬이 깨진다). 지터만으론 부족했던 격자감의 근본 해결.
    gv += float2(sin(gv.y * 1.7 + gv.x * 0.6), sin(gv.x * 1.9 + gv.y * 0.5)) * 0.8;
    float2 cell = floor(gv);
    float h = frac(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
    // 밀도 — density=0이면 문턱 1.0 → 알갱이 0개(하위호환), density=1이면 ~절반 셀.
    float isFlake = step(1.0 - 0.5 * saturate(density), h);
    // 셀 안 랜덤 위치 — 도메인 워프에 더해 셀별 해시로 한 번 더 흩뿌린다(±0.2).
    float jx = frac(sin(dot(cell, float2(21.31, 11.17))) * 13217.1);
    float jy = frac(sin(dot(cell, float2(37.71, 63.19))) * 29113.7);
    float2 fr = frac(gv) - (0.5 + (float2(jx, jy) - 0.5) * 0.4);
    // 알갱이 반경 — 셀 대비 비율(예전 0.40에서 축소), 셀별 크기 변이(0.7~1.1배)로 균일감 제거.
    float szVar = 0.7 + 0.4 * frac(h * 7.0);
    float ang = atan2(fr.y, fr.x);
    float angMod = lerp(1.0, 0.65 + 0.35 * cos(5.0 * ang), saturate(shape)); // shape=1=각진 별
    float rad = lerp(0.22, 0.30, saturate(size)) * szVar * angMod;
    // ★ 윤곽 부드러움 = feather 축(size와 독립). 원반(플래토+엣지)이라 "윤곽"이 보이던 걸,
    //   feather로 중심 피크 가우시안(플래토·엣지 없음)까지 뭉갠다.
    //   feather 0 = 또렷한 글리터 조각, feather 1 = 윤곽 없는 부드러운 펄.
    float d2 = dot(fr, fr) / max(rad * rad, 1e-6);         // (거리/반경)^2
    float hard = smoothstep(1.0, 0.49, d2);               // 또렷(안쪽 플래토 + 좁은 엣지)
    float softG = exp(-2.5 * d2);                         // 부드러운 가우시안(중심에서 서서히)
    float flake = lerp(hard, softG, saturate(feather));   // 셀 안 알갱이 마스크
    // 빛 반응 — 밝은 픽셀에서 더 번쩍(작은 거울). 명멸 축으로 명멸량 조절(0=정적).
    float spec = 0.4 + 0.6 * smoothstep(0.3, 1.0, luma);
    float tw = lerp(1.0, SparkleTwinkle(cell, h), saturate(twinkle));
    // ★ feather가 펄↔글리터를 "형태"부터 가른다: 펄(feather↑)이면 이산 점은 줄고 연속
    //   sheen이 지배 → 면. 글리터(feather↓)면 점만. 이산 격자감의 근본 완화.
    float sBright = isFlake * flake * spec * saturate(brightness) * saturate(coverage)
                    * (1.0 - 0.3 * saturate(feather));   // 펄이어도 고운 점은 대부분 남긴다(가시성)
    // 컨페티 — 셀별 무지개색(confetti 0=단색 pcolor ↔ 1=조각마다 다른 색). 축제 글리터.
    fixed3 cellHue = 0.5 + 0.5 * cos(6.2831853 * (frac(h * 3.7) + fixed3(0.0, 0.33, 0.67)));
    fixed3 baseCol = lerp(pcolor, cellHue, saturate(confetti));
    // 플래시 정점(tw>1)에서 색을 살짝 하얗게 → 정반사 글린트(과하면 징그러워 톤다운).
    fixed3 flakeCol = lerp(baseCol, fixed3(1.0, 1.0, 1.0), saturate(tw - 1.0) * 0.32);
    // 펄 sheen — 점 위 연속 소프트 글로우("빛나는 면"). 넓은 luma 범위 + 충분한 계수로 실제 보이게.
    float sheen = saturate(feather) * 0.18 * smoothstep(0.15, 0.70, luma) * saturate(coverage);
    return c + flakeCol * (sBright * tw * 1.4) + pcolor * sheen;
}

// ── 그레인(매트 파우더 입자감) — 부위 uv에 고정된 미세 밝기 노이즈. 매끈한 색면을 살짝
// 거칠게 해 파우더/매트 질감을 낸다. _MatteGrain=0이면 무변조(하위호환). 전 부위 공용.
fixed3 ApplyGrain(fixed3 c, float2 uv)
{
    if (_MatteGrain <= 1e-5) return c;
    float n = frac(sin(dot(uv * 512.0, float2(12.9898, 78.233))) * 43758.5453) - 0.5;
    return c + n * saturate(_MatteGrain) * 0.06;   // 은은한 입자(과하지 않게)
}

// ── 제형(텍스처) 공통 골격(W1) — 마감(빛 반응)과 별개 축. 커버리지 곡선·엣지 하드니스·
// 입자감(그레인)·발색 body(색소 밀도)를 갈아끼운다. 네 축 전부 0 = 무변조(하위호환
// 바이트 동일, 1e-5 조기 반환). RN(regions.ts TEXTURE_ENUM_SEED)이 시드 정본이고 아래
// TexBundleFromEnum이 그 미러다(마감 FINISH_ENUM_SEED↔ApplyFinish 레거시 경로 선례).
// W2(제형 스튜디오)는 부위별 오버라이드 유니폼을 이 시드 위에 얹어 연다(FinishBundle 선례).

// 엣지 하드니스 — 커버리지 마스크 경계의 부드럽기. edgeSoft>0=경계를 mid로 당겨 소프트,
// edgeSoft<0=경계를 대비화(또렷한 펜슬/젤). 0=입력 그대로.
float TexEdge(float baseEdge, float edgeSoft)
{
    if (abs(edgeSoft) <= 1e-5) return baseEdge;
    if (baseEdge <= 0.0 || baseEdge >= 1.0) return baseEdge;
    if (edgeSoft > 0.0) return saturate(baseEdge + 2.0 * saturate(edgeSoft)
        * baseEdge * (1.0 - baseEdge) * (1.0 - 2.0 * baseEdge));
    return lerp(baseEdge, smoothstep(0.0, 1.0, baseEdge), saturate(-edgeSoft));
}

// 커버리지 — 발색 마스크 세기 스케일(리퀴드=얇게 등). coverage>0=더 덮음, <0=얇게. 0=그대로.
float TexCoverage(float baseCov, float coverage)
{
    if (abs(coverage) <= 1e-5) return baseCov;
    return saturate(baseCov * (1.0 + coverage));
}

// 그레인(입자감) — ApplyGrain(_MatteGrain 전역)의 스칼라 일반화. uv 고정 미세 밝기 노이즈.
// 전역 매트 그레인과 가산적으로 얹힌다(전역 경로는 ApplyGrain이 그대로 유지).
fixed3 TexGrain(fixed3 c, float2 uv, float grain)
{
    if (grain <= 1e-5) return c;
    float n = frac(sin(dot(uv * 512.0, float2(12.9898, 78.233))) * 43758.5453) - 0.5;
    return c + n * saturate(grain) * 0.06;
}

// body(발색 두께감) — 색소 밀도. body>0=진하게(지수>1, 미드톤을 내려 딥 펜슬), body<0=옅게
// (지수<1, 미드톤을 띄워 물광 리퀴드). 무채화 없이 색을 유지한 채 명도 곡선만 굽힌다.
// luma는 조명 적응형 바디 보정용 예약 인자 — 현재 미사용.
fixed3 TexBody(fixed3 pig, float luma, float body)
{
    if (abs(body) <= 1e-5) return pig;
    float k = 1.0 + 0.35 * clamp(body, -1.0, 1.0);
    return pow(saturate(pig), max(k, 0.2));
}

// enum → TextureBundle 시드(RN TEXTURE_TEMPLATE_INDEX/TEXTURE_ENUM_SEED 정확 미러).
// texEnum=-1은 JsonUtility 필드 부재 sentinel=레거시 무변조. 명시 0부터 각 부위 첫 제품이다.
void TexBundleFromEnum(float templateId, float texEnum,
                       out float edgeSoft, out float grain, out float coverage, out float body)
{
    edgeSoft = 0.0; grain = 0.0; coverage = 0.0; body = 0.0;

    #define TEX_SEED(TEMPLATE_ID, ENUM_VALUE, EDGE_VALUE, GRAIN_VALUE, COVERAGE_VALUE, BODY_VALUE) \
        if (abs(templateId - (TEMPLATE_ID)) < 0.25 && abs(texEnum - (ENUM_VALUE)) < 0.25) \
        { edgeSoft = (EDGE_VALUE); grain = (GRAIN_VALUE); coverage = (COVERAGE_VALUE); body = (BODY_VALUE); return; }

    // 0 tone
    TEX_SEED(0, 0, 0, 0, 0, 0);
    TEX_SEED(0, 1, 0, 0.4, 0, 0);
    // 1 skin
    TEX_SEED(1, 0, 0, 0, 0, 0);
    TEX_SEED(1, 1, 0, 0.4, 0, 0);
    // 2 concealer
    TEX_SEED(2, 0, 0.3, 0, -0.1, 0);
    TEX_SEED(2, 1, 0, 0, 0, 0);
    TEX_SEED(2, 2, -0.1, 0.1, 0.15, 0.25);
    // 3 powder
    TEX_SEED(3, 0, 0.25, 0.45, -0.1, -0.1);
    TEX_SEED(3, 1, 0.1, 0.25, 0.15, 0);
    TEX_SEED(3, 2, 0.2, 0, -0.15, -0.15);
    // 4 blush
    TEX_SEED(4, 0, 0.2, 0.4, 0, -0.1);
    TEX_SEED(4, 1, 0.1, 0, 0, 0.1);
    TEX_SEED(4, 2, 0.3, 0, -0.1, 0);
    TEX_SEED(4, 3, 0.35, 0, -0.2, -0.15);
    // 5 highlighter
    TEX_SEED(5, 0, 0.2, 0.35, 0, -0.1);
    TEX_SEED(5, 1, 0.1, 0, 0.1, 0);
    TEX_SEED(5, 2, 0.25, 0, -0.1, -0.1);
    // 6 contour
    TEX_SEED(6, 0, 0.2, 0.4, 0, -0.1);
    TEX_SEED(6, 1, 0.15, 0, 0, 0.1);
    TEX_SEED(6, 2, -0.05, 0, 0.1, 0.2);
    // 7 triangleZone
    TEX_SEED(7, 0, 0.2, 0.4, 0, -0.1);
    TEX_SEED(7, 1, 0.15, 0, 0, 0.1);
    // 8 eyeshadow
    TEX_SEED(8, 0, 0.2, 0.4, 0, -0.1);
    TEX_SEED(8, 1, 0.1, 0, 0.1, 0.15);
    TEX_SEED(8, 2, 0.3, 0, -0.15, 0);
    // 9 eyeshadowLower
    TEX_SEED(9, 0, 0.2, 0.4, 0, -0.1);
    TEX_SEED(9, 1, 0.1, 0, 0.1, 0.15);
    TEX_SEED(9, 2, 0.3, 0, -0.15, 0);
    // 10 aegyo
    TEX_SEED(10, 0, -0.2, 0.5, 0, 0.3);
    TEX_SEED(10, 1, 0.2, 0.4, 0, -0.1);
    TEX_SEED(10, 2, 0.1, 0.2, 0, 0);
    // 11 eyelinerLower
    TEX_SEED(11, 0, -0.2, 0.5, 0, 0.3);
    TEX_SEED(11, 1, 0.35, 0.3, -0.1, 0);
    TEX_SEED(11, 2, 0.1, 0.15, -0.1, 0);
    // 12 brow
    TEX_SEED(12, 0, 0, 0, 0, 0);
    TEX_SEED(12, 1, 0.1, 0, -0.15, -0.1);
    // 13 browPencil
    TEX_SEED(13, 0, -0.2, 0.5, 0, 0.3);
    TEX_SEED(13, 1, 0, 0.3, 0, 0.1);
    TEX_SEED(13, 2, 0.2, 0, -0.1, -0.1);
    // 14 browConceal
    TEX_SEED(14, 0, 0, 0, 0, 0);
    // 15 browLightener
    TEX_SEED(15, 0, 0, 0, 0, 0);
    // 16 lipBase
    TEX_SEED(16, 0, 0, 0, 0, 0);
    TEX_SEED(16, 1, -0.05, 0, 0.15, 0.2);
    // 17 lipLiner
    TEX_SEED(17, 0, -0.2, 0.5, 0, 0.3);
    TEX_SEED(17, 1, 0, 0.2, 0, 0.1);
    // 18 lipGloss
    TEX_SEED(18, 0, 0, 0, 0, 0);
    TEX_SEED(18, 1, 0.2, 0, -0.15, -0.15);
    TEX_SEED(18, 2, 0.15, 0, 0.1, 0);
    // 19 teeth
    TEX_SEED(19, 0, 0, 0, 0, 0);

    #undef TEX_SEED
}

#endif // ARMAKEUP_FINISH_INCLUDED
