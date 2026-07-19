#ifndef ARMAKEUP_BROW_COVERAGE_INCLUDED
#define ARMAKEUP_BROW_COVERAGE_INCLUDED

// profile/expand가 없는 기존 룩은 coverageMode=0이다. 이때 반환값은 기존 페더
// 상수와 정확히 같아야 하며, 새 프로필에서만 하단의 유효 커버 영역을 넓힌다.
inline float BrowCoverageActive(float coverageMode)
{
    // profile>0은 CPU에서 1을 보내고, profile0의 작은 수동 확장은 0..1을
    // 연속적으로 보낸다. step으로 자르면 아주 조금 움직인 순간 페더가 튄다.
    return saturate(coverageMode);
}

inline float BrowLowerFeather(
    float legacyLowerFeather, float coverageMode, float coverageDown)
{
    float coverageActive = BrowCoverageActive(coverageMode);
    // 0.04 미만은 실기기에서 딱 잘린 선처럼 보이고, 0.06 초과는 두꺼운 자연
    // 눈썹의 하단 털이 다시 비친다. 아래 확장이 클수록 0.04 쪽으로 좁힌다.
    float coverageFeather = lerp(0.06, 0.04, saturate(coverageDown));
    return lerp(legacyLowerFeather, coverageFeather, coverageActive);
}

inline float BrowVerticalEdge(
    float verticalUv,
    float legacyLowerFeather,
    float legacyUpperFeather,
    float coverageMode,
    float coverageDown)
{
    float lowerFeather = BrowLowerFeather(
        legacyLowerFeather, coverageMode, coverageDown);
    return smoothstep(0.0, lowerFeather, verticalUv)
         * (1.0 - smoothstep(1.0 - legacyUpperFeather, 1.0, verticalUv));
}

// 스타일 텍스처는 자체 알파가 있지만 새 커버 프로필에서는 알파 bbox를 밴드에
// 펴므로 상·하 경계에 작은 안전 페더가 필요하다. legacy mode는 정확히 1이다.
inline float BrowStyleCoverageEdge(
    float verticalUv, float coverageMode, float coverageDown)
{
    float active = BrowCoverageActive(coverageMode);
    float edge = BrowVerticalEdge(verticalUv, 0.06, 0.08, 1.0, coverageDown);
    return lerp(1.0, edge, active);
}

#endif
