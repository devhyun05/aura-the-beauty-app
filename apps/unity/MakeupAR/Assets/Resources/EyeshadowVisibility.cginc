#ifndef ARMAKEUP_EYESHADOW_VISIBILITY_INCLUDED
#define ARMAKEUP_EYESHADOW_VISIBILITY_INCLUDED

// 상·하안검 공통 발색 리프트. 낮은 알파만 올리고 0/1 endpoint는 보존한다.
// 멀티밴드는 surface profile/texture를 곱하기 전 layer intensity에 정확히 한 번 적용한다.
float EyeshadowVisibilityLift(float alpha)
{
    return 1.0 - pow(1.0 - saturate(alpha), 1.5);
}

#endif
