// 저조도 색소 바닥 공용 — "어두운데 메이크업만 발광"(플로팅) 해소.
// 립·아이섀도·블러셔·데칼이 공유(드리프트 방지, Finish.cginc 선례).
//
// 원인: 루마 보존 색소 공식 (luma·gain + floor)의 상수 바닥(floor)이 luma=0(깜깜한
// 피부)에서도 색소를 `색 × floor`로 남겨 발광시킨다 — 검정 얼굴 위에 색 스티커가
// 붕 뜬 것처럼 보이는 직접 원인.
//
// 해소: 바닥을 픽셀 luma에 종속시켜 어두운 픽셀에서 색소가 얼굴과 함께 꺼지게 한다.
// 픽셀 레벨이라 사이드 조명·손그림자처럼 얼굴 일부만 그늘질 때도 그 부분만 어두워짐
// (씬 전역 측정 불필요 — 피드 luma는 셰이더 안에 이미 있다. 신규 의존 0).
//
// ★ 하위호환(대수 검증): luma ≥ PIGMENT_KNEE 픽셀은 smoothstep=1 → 기존 (luma·gain
//   + floor)와 픽셀 단위 동일. 평범한 조명의 얼굴 luma는 knee 위라 기존 룩 불변 —
//   어두운 픽셀에서만 바닥이 페이드된다.
//
// 후속 옵션(이번 스코프 제외 — 실기기에서 이것으로 부족할 때): ② 씬 평균 luma 전역
// 유니폼으로 부위 알파 감쇠(존재감 후퇴), ① 조명 패널 저조도 보정(화면 감마 리프트).
#ifndef ARMAKEUP_AMBIENT_INCLUDED
#define ARMAKEUP_AMBIENT_INCLUDED

// 바닥 페이드 상한 — 이 luma 이상 픽셀은 기존 바닥 그대로. // 실기기 튜닝 대상
#define PIGMENT_KNEE 0.25

// 눈썹/털 스트로크 전용 문턱 — 립·섀도보다 낮다. 눈썹은 밝은 방에서도 픽셀 luma가
// 낮아(어두운 털 위에 그림) PIGMENT_KNEE(0.25)를 쓰면 밝은 방의 진한 눈썹까지 옅어진다
// (픽셀 luma로는 "어두운 털"과 "어두운 방"을 구분 못 하는 한계). 문턱을 밝은 방 털
// luma(~0.15) 아래로 낮춰, 밝은 방 눈썹 색은 보존하고 어두운 방에서 밴드 전체가
// 깔리는 더 낮은 luma에서만 발광을 죽인다. // ★ 실기기 튜닝 1순위
#define BROW_KNEE 0.13

// 색소 luma 밝기 — 기존 (luma·gain + floor) 패턴의 드롭인 대체.
inline float PigmentBaseKnee(float luma, float gain, float floorAmt, float knee)
{
    return luma * gain + floorAmt * smoothstep(0.0, knee, luma);
}
inline float PigmentBase(float luma, float gain, float floorAmt)
{
    return PigmentBaseKnee(luma, gain, floorAmt, PIGMENT_KNEE);
}

#endif // ARMAKEUP_AMBIENT_INCLUDED
