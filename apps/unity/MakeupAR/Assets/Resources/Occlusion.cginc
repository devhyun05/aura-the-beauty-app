// 세그멘테이션 오클루전 공통 게이트 (설계 §11 — "개입점 = 한 곳, 한 줄").
//
// 모든 메이크업 셰이더가 이미 계산하는 grabPos(스크린 좌표)를 받아, SelfieMulticlass
// face-skin 확률(R 채널)로 최종 알파에 곱할 게이트를 돌려준다. 손·머리카락·옷이
// 얼굴 앞을 가리면 그 픽셀의 face-skin 확률이 낮아 색소가 제외된다.
//
// 전역 유니폼만 사용 — SegmentationSource가 프레임당 1회 기록(머티리얼별 세팅 0).
// _SegOn=0(패키지 미설치·모델 부재·추론 실패·스테일)이면 게이트가 항상 1 →
// 완전 무영향 폴백(§11 불변식).
//
// 좌표 정합 (근거 — FramePresenter/CameraFeed 실코드 판단):
//  - 마스크는 카메라 이미지 UV에 정렬돼 있고(세그 입력 = 캡처 프레임 그 자체),
//    FramePresenter의 배경 쿼드는 aspect-fill(coverScale)이라 화면보다 크게 걸린다 —
//    즉 스크린 UV ≠ 이미지 UV이고, 90°스텝 회전·미러·커버스케일을 지나는
//    뷰포트→이미지 역매핑이 반드시 필요하다. 그 역매핑(∘ 마스크 회전 보정)을
//    CPU(SegmentationSource.PublishMask)가 아핀 행 _SegScreenToMask*로 합성해 주므로
//    셰이더는 dot 2번이면 된다.
//  - 워프(§10)와의 교차: 배경은 워프 역샘플(src)로 그려지고 메이크업 정점은 순방향
//    워프 위치에 있으므로, 이 픽셀이 실제로 보여주는 원본 이미지 위치는 src(q)다.
//    엄밀히는 마스크도 src(q)에서 샘플해야 하지만 역워프는 프래그먼트당 24옵×4회
//    고정점 반복 — "한 줄" 게이트에 과중해 워프 후 위치 q로 근사한다. 오차는 워프
//    변위(슬라이더 캡 기준 수%UV 이하)로 유계이고, 256px 소프트 확률맵 +
//    _OccLo/_OccHi 페더 폭 아래라 실효 차이가 없다. // 실기기 확인 항목
//
// 눈썹 화이트리스트 검증(§14): hair 채널을 "지우개"로 쓰면 짙은 눈썹이 머리카락으로
// 오분류될 때 눈썹 메이크업이 통째로 지워진다(§14 치명적 함정). 여기는 hair를 쓰지
// 않고 face-skin "양성 게이트"만 쓰므로 그 함정 자체가 없다 — 눈썹이 일부 hair로
// 새더라도 face-skin 확률이 0으로 떨어지지 않는 한(256px에서 눈썹은 얼굴 영역 안,
// hair 클래스는 두피 머리카락 학습) _OccLo(하한) 위에 남는다 → 별도 화이트리스트
// 불필요. 반대로 이마로 내려온 "진짜 앞머리"는 face-skin이 낮아져 눈썹 메이크업이
// 가려진다 — 이것은 원하는 동작(§14 앞머리 오클루전). 헤어라인 부근 부작용은
// _OccLo/_OccHi 페더로 완화. // 실기기 튜닝 대상
#ifndef ARMAKEUP_OCCLUSION_INCLUDED
#define ARMAKEUP_OCCLUSION_INCLUDED

sampler2D _SegMask;       // RGBA = face-skin / hair / body-skin(목·귀·손) / 기타 확률
float _SegOn;             // 0 = 폴백(게이트 1), 1 = 마스크 유효
float _OccLo;             // face-skin 페더 하한 (SegmentationSource.OccFeatherLo) // 실기기 튜닝 대상
float _OccHi;             // face-skin 페더 상한 (SegmentationSource.OccFeatherHi) // 실기기 튜닝 대상
float4 _SegScreenToMaskX; // 뷰포트 UV → 마스크 UV 아핀 행 (xy=선형부, z=오프셋)
float4 _SegScreenToMaskY;

// grabPos(ComputeGrabScreenPos) → 진짜 뷰포트 UV(원점 좌하단) 원복.
// 그랩 UV는 그랩 텍스처의 "저장 방향" 기준이라 UNITY_UV_STARTS_AT_TOP(Metal/D3D)에서
// 백버퍼 직행(_ProjectionParams.x > 0)이면 뷰포트와 y가 뒤집혀 있고, RT 렌더(투영
// 플립, x < 0)면 이미 일치한다. GL 계열은 항상 일치. — ComputeScreenPos 인터폴레이터를
// 새로 태우는 대신 기존 grabPos를 재활용해 "셰이더당 한 줄" 원칙을 지킨다.
inline float2 OccViewportUV(float4 grabPos)
{
    float2 uv = grabPos.xy / max(grabPos.w, 1e-6);
#if UNITY_UV_STARTS_AT_TOP
    if (_ProjectionParams.x > 0) uv.y = 1.0 - uv.y;
#endif
    return uv;
}

inline half4 OccSampleMask(float4 grabPos)
{
    float2 vp = OccViewportUV(grabPos);
    float2 m = float2(dot(_SegScreenToMaskX.xy, vp) + _SegScreenToMaskX.z,
                      dot(_SegScreenToMaskY.xy, vp) + _SegScreenToMaskY.z);
    return tex2D(_SegMask, m);
}

// ── §11.1 메시 하한(floor) — 비정형 피부·저확신 지역 과차단 완화 ──
// 실기기 버그: (①) 세미매트 스킨 이마 윗부분 일부가 파운데 미커버, (②) 긁혀 붉어진 자극
// 피부에만 피부화장이 전혀 안 먹음. 원인 = face-skin(R) 확률이 이 지역에서 낮게 나와
// smoothstep(_OccLo,_OccHi,R)이 0으로 떨어져 메이크업을 통째로 제외. 하지만 얼굴 메시가
// 그리는 픽셀은 랜드마크가 이미 "얼굴"을 보증하므로, 게이트의 본래 목적(손·앞머리 가림)이
// "아닐 때"만 게이트에 하한을 깔아 과차단을 막는다.
//
// 핵심: 하한은 "가림 클래스(hair G + body-skin B — 손·목·귀 포함)가 낮을 때만" 열린다.
// - 손을 얼굴 앞에 대면 B가 높아 floorOpen→0, floor 폐쇄, rawGate(≈0)로 복귀 → 손 위
//   색소 제거는 그대로 유지(§11 가림 방어 불변).
// - 이마로 내려온 진짜 앞머리는 G가 높아 floor 폐쇄 → §14 앞머리 오클루전 유지.
// - 붉은 자극피부·세미매트 이마 잔머리는 R만 애매하고 G/B가 낮아 floorOpen→1 → 하한이
//   열려 파운데가 최소 OCC_MESH_FLOOR만큼 커버된다(두 증상 해소).
// 즉 게이트가 그동안 겸했던 두 역할(가림 제거[의도] + 비정형 피부 사각[버그])을 분리해,
// 가림 클래스가 낮은 곳에서는 세그가 얼굴 안 화장을 깎지 못하게 한다(§11 본래 목적 = 가림뿐).
// 하위호환: _SegOn=0이면 아래 lerp가 1을 반환 → floor 경로 자체가 무영향(불변식 유지).
#define OCC_MESH_FLOOR   0.7   // 메시 위 최소 커버리지 [0=하한없음=기존, 1=세그 무력화]. 실기기 튜닝 대상
#define OCC_OCCLUDER_LO  0.35  // 가림 클래스 확률 이하 = 가림 아님(floor 완전 개방). 실기기 튜닝 대상
#define OCC_OCCLUDER_HI  0.65  // 가림 클래스 확률 이상 = 가림 확정(floor 완전 폐쇄). 실기기 튜닝 대상

// 표준 게이트 — 최종 알파(불투명 셰이더는 lerp 가중)에 곱하는 값 [0,1].
inline float OccludeGate(float4 grabPos)
{
    half4 m = OccSampleMask(grabPos);
    // smoothstep 페더: 확률 경계가 부드러워 하드 엣지·플리커 없이 사라진다.
    float raw = smoothstep(_OccLo, _OccHi, m.r);
    // 메시 하한 — 가림 클래스(hair·body-skin)가 낮을 때만 열려 진짜 가림 방어를 보존한다.
    float occluder = max(m.g, m.b);
    float floorOpen = 1.0 - smoothstep(OCC_OCCLUDER_LO, OCC_OCCLUDER_HI, occluder);
    float gated = max(raw, OCC_MESH_FLOOR * floorOpen);
    return lerp(1.0, gated, _SegOn);
}

// 입안 변형 게이트 — 치아 미백 전용. SelfieMulticlass의 face-skin이 열린 입 안(치아)을
// 커버하는지 미확인 — 커버하지 않으면 표준 게이트가 미백을 통째로 지운다(세그 없던
// 때보다 후퇴). 치아가 "기타"(A) 클래스로 잡히는 경우까지 통과시키도록 max(face, 기타).
// 실기기에서 표준 게이트로 충분하면 OccludeGate로 교체. // 실기기 튜닝 대상
inline float OccludeGateMouth(float4 grabPos)
{
    half4 m = OccSampleMask(grabPos);
    return lerp(1.0, smoothstep(_OccLo, _OccHi, max(m.r, m.a)), _SegOn);
}

#endif // ARMAKEUP_OCCLUSION_INCLUDED
