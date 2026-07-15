#ifndef ARMAKEUP_FOUNDATION_INCLUDED
#define ARMAKEUP_FOUNDATION_INCLUDED

// FaceMakeup(얼굴/이마)과 CameraFeed(목/귀)가 공유하는 파운데이션 색 파이프라인.
// 호출 순서: FoundationTarget -> FoundationSoftClip -> finish ->
// (듀이일 때만 FoundationSoftClip) -> FoundationBlend.

#define FND_REFERENCE_LUMA 0.798322 // 제품 기본 피부색에 고정된 기준 루마
#define FND_LUMA_GAIN 1.0           // 1.0 = 기준 피부색에서 입력 루마 보존
#define FND_LUMA_LIFT 0.04          // 암부 연속성을 유지하는 소량 커버 리프트
#define FND_CHROMA 0.4              // 커버리지 비례 chroma 평탄화
#define FND_HIGHLIGHT_CEIL 0.95     // hue 보존 균일 소프트클립 점근 상한

// 제형별 상대 조정. 0=리퀴드, 1=쿠션, 2=스킨틴트.
#define FND_CUSHION_GAIN 0.12
#define FND_SKINTINT_GAIN 0.15
#define FND_CUSHION_CHROMA 0.20
#define FND_SKINTINT_CHROMA 0.30
#define FND_CUSHION_COVERAGE 0.15
#define FND_SKINTINT_COVERAGE 0.30

void FoundationTextureParams(float textureMode, float intensity,
                             out float gain, out float chroma, out float coverage)
{
    float cushionAmount = saturate(1.0 - abs(textureMode - 1.0));
    float skinTintAmount = saturate(textureMode - 1.0);
    gain = FND_LUMA_GAIN *
        (1.0 + cushionAmount * FND_CUSHION_GAIN - skinTintAmount * FND_SKINTINT_GAIN);
    chroma = FND_CHROMA *
        (1.0 + cushionAmount * FND_CUSHION_CHROMA - skinTintAmount * FND_SKINTINT_CHROMA);
    coverage = intensity *
        (1.0 + cushionAmount * FND_CUSHION_COVERAGE - skinTintAmount * FND_SKINTINT_COVERAGE);
}

fixed3 FoundationTarget(fixed3 foundationColor, float sourceLuma, float gain)
{
    // 선택색 루마로 나누면 near-black 색에서 gain이 급증한다. 기본 피부색의 고정
    // 기준 루마만 사용해 색 선택 전 구간에서 연속적인 명암 이식을 보장한다.
    float shade = (sourceLuma / FND_REFERENCE_LUMA) * gain + FND_LUMA_LIFT;
    return foundationColor * shade;
}

fixed3 FoundationSoftClip(fixed3 targetColor)
{
    // 최대 채널만으로 스케일을 구한 뒤 RGB 전체에 같은 배수를 적용해 hue를 보존한다.
    // 4차 램프는 중간톤은 거의 유지하고 상단만 점근적으로 압축한다.
    float maxChannel = max(targetColor.r, max(targetColor.g, targetColor.b));
    float ceilingRatio = maxChannel / FND_HIGHLIGHT_CEIL;
    float softMaximum = maxChannel /
        pow(1.0 + ceilingRatio * ceilingRatio * ceilingRatio * ceilingRatio, 0.25);
    return targetColor * (softMaximum / max(maxChannel, 1e-4));
}

fixed3 FoundationBlend(fixed3 baseColor, fixed3 targetColor, float sourceLuma,
                       float chroma, float coverage)
{
    float blendAmount = saturate(coverage);
    fixed3 desaturated = lerp(baseColor, sourceLuma.xxx, chroma * blendAmount);
    return lerp(desaturated, targetColor, blendAmount);
}

#endif // ARMAKEUP_FOUNDATION_INCLUDED
