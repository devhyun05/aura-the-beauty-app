using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// R7 명명 워프 — 눈꼬리 띄우기. 바깥 눈꼬리 쪽 제품(아이라이너 리본·아이섀도
    /// 밴드·아이라인 스타일·하안검 밴드)의 기준점을 눈썹 방향으로 올려 캣아이
    /// 리프트 룩을 만든다. 실제 눈(스텐실·홍채)은 그대로 — 제품만 들어올리는
    /// 배치 워프다(오버립 lipOverline과 동일 계열).
    ///
    /// 정규화 규약(설계 섹션 09): 오프셋 = 눈 가로폭 × MaxLiftFactor × lift(0..1)
    /// — 얼굴 크기·해상도와 무관하게 같은 룩. 좌우 대칭은 lift 값 공유로 잠금(R7).
    /// </summary>
    public static class EyeWarp
    {
        const float MaxLiftFactor = 0.12f; // lift=1일 때 눈꼬리 상승 = 눈 가로폭 × 12%
        const float FalloffStart = 0.45f;  // 가로 s가 이 값부터 눈꼬리(1)까지 점증

        /// <summary>
        /// s: 가로 위치(0=안쪽 앞머리 → 1=바깥 눈꼬리), up: 눈썹 방향 단위벡터,
        /// eyeDist: 눈 가로폭(p와 같은 좌표계), lift: 0..1 (0=원래, 변형 없음).
        /// </summary>
        public static Vector2 LiftCorner(Vector2 p, float s, Vector2 up, float eyeDist, float lift)
        {
            if (lift <= 0f) return p;
            var w = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(FalloffStart, 1f, s));
            return p + up * (eyeDist * MaxLiftFactor * lift * w);
        }
    }
}
