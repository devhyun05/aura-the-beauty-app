#ifndef ARMAKEUP_HIGHLIGHTER_MICRO_SHIMMER_INCLUDED
#define ARMAKEUP_HIGHLIGHTER_MICRO_SHIMMER_INCLUDED

// 하이라이터 전용 미세 펄. Finish.cginc의 정사각 셀 전체를 켜는 시머 대신,
// 셀 안의 작은 원형 입자만 부드럽게 드러내 가장자리/입자 형태가 보이지 않게 한다.
fixed3 ApplyHighlighterMicroShimmer(fixed3 color, float luma,
                                    float2 highlightUV, float2 screenUV,
                                    float finish, float shimmer,
                                    float size, float density,
                                    float lightGain)
{
    float legacyDensity = smoothstep(2.5, 3.0, finish) * saturate(shimmer) * 0.18;
    float densityAmount = max(saturate(density), legacyDensity);
    if (densityAmount <= 0.0001) return color;

    // 요청 밀도는 320~720 cells/UV이지만, 한 cell이 화면 4px보다 작아지면
    // 고개 이동 때 subpixel dot가 꺼졌다 켜진다. UV derivative로 실효 주파수를
    // 제한하고, 아래 radial AA가 남은 서브픽셀 에너지를 필터링한다.
    float requestedCellScale = lerp(720.0, 320.0, saturate(size));
    float2 uvFootprint = fwidth(highlightUV);
    float maxStableCellScale = 0.25 / max(max(uvFootprint.x, uvFootprint.y), 1e-5);
    float cellScale = max(1.0, min(requestedCellScale, maxStableCellScale));
    float2 cell = floor(highlightUV * cellScale);
    float2 local = frac(highlightUV * cellScale) - 0.5;
    float radial = length(local);
    float dotRadius = lerp(0.055, 0.13, saturate(size));
    float2 cellFootprint = fwidth(highlightUV * cellScale);
    float radialAA = max(0.5 * max(cellFootprint.x, cellFootprint.y), 1e-4);
    float dotMask = 1.0 - smoothstep(dotRadius - radialAA, dotRadius + radialAA, radial);

    float hash = frac(sin(dot(cell, float2(12.9898, 78.233))) * 43758.5453);
    // 고정된 sparse 입자 표본에 density를 gain으로 한 번만 곱해 평균 에너지가 1차 비례한다.
    float active = smoothstep(0.84, 0.96, hash);
    float specular = 0.35 + 0.65 * smoothstep(0.55, 1.0, luma);
    float direction = PearlDirGain(screenUV, highlightUV, lightGain);
    float twinkle = SparkleTwinkle(cell, hash);
    float gain = dotMask * active * densityAmount * specular * direction * twinkle;
    return color + gain;
}

#endif
