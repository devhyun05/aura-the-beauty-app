#ifndef ARMAKEUP_BROW_RESPONSE_INCLUDED
#define ARMAKEUP_BROW_RESPONSE_INCLUDED

// 양쪽 눈썹의 제품 응답만 pair 기준으로 맞추고, 실제 RGB 조명은 최종 색소에 복원한다.
// CPU는 FramePresenter viewport UV만 전달한다. GrabPass 방향은 여기서
// ComputeGrabScreenPos를 그대로 사용해 Metal backbuffer/RT 투영 부호를 동일 처리한다.
// GPU reference를 CPU로 되읽지 않으므로 temporal EMA는 두지 않는다. 대신 side별 안정
// 랜드마크 2개, chroma/floor rejection, 3% deadzone, ±25% clamp로 공간 응답을 제한한다.
#define BROW_REFERENCE_FLOOR 0.02
#define BROW_CHROMA_LIMIT 0.45
#define BROW_RATIO_DEADZONE 0.03

float4 _BrowSkinReferenceViewport01; // 첫 눈썹 위 피부 landmark A/B
float4 _BrowSkinReferenceViewport23; // 둘째 눈썹 위 피부 landmark A/B
float _BrowSkinReferenceValid;

inline float BrowResponseLuma(fixed3 rgb)
{
    return dot(rgb, fixed3(0.299, 0.587, 0.114));
}

inline float BrowResponseFinite1(float value)
{
    return (value == value && abs(value) < 65504.0) ? 1.0 : 0.0;
}

inline float BrowResponseFinite3(float3 value)
{
    return BrowResponseFinite1(value.r)
        * BrowResponseFinite1(value.g)
        * BrowResponseFinite1(value.b);
}

inline float2 BrowResponseViewportToGrabUV(float2 viewportUV)
{
    float2 clipXY = viewportUV * 2.0 - 1.0;
    // Viewport UV는 좌하단 기준이다. RT에서 GPU projection이 뒤집힌 경우 실제
    // UnityObjectToClipPos 정점과 같은 clip sign을 복원한 뒤 GrabPass 변환한다.
    clipXY.y *= _ProjectionParams.x;
    float4 grabPos = ComputeGrabScreenPos(
        float4(clipXY, 0.0, 1.0));
    return grabPos.xy / max(grabPos.w, 1e-6);
}

inline float BrowResponseReferenceSampleUsable(float2 grabUV, float3 rgb)
{
    float inside = step(0.0, grabUV.x) * step(grabUV.x, 1.0)
        * step(0.0, grabUV.y) * step(grabUV.y, 1.0);
    float channelFloor = step(BROW_REFERENCE_FLOOR, min(rgb.r, min(rgb.g, rgb.b)));
    float chroma = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
    float skinChroma = 1.0 - step(BROW_CHROMA_LIMIT, chroma);
    return inside * BrowResponseFinite3(rgb) * channelFloor * skinChroma;
}

inline void BrowResponseRobustReference(
    float2 viewportA, float2 viewportB, out float3 reference, out float valid)
{
    float2 grabA = BrowResponseViewportToGrabUV(viewportA);
    float2 grabB = BrowResponseViewportToGrabUV(viewportB);
    float3 rgbA = tex2D(_CameraFeed, grabA).rgb;
    float3 rgbB = tex2D(_CameraFeed, grabB).rgb;
    float usableA = BrowResponseReferenceSampleUsable(grabA, rgbA);
    float usableB = BrowResponseReferenceSampleUsable(grabB, rgbB);

    // NaN * 0도 NaN이므로 invalid 표본은 분기 안에서만 합산한다.
    reference = float3(0.0, 0.0, 0.0);
    float count = 0.0;
    UNITY_BRANCH if (usableA > 0.5)
    {
        reference += rgbA;
        count += 1.0;
    }
    UNITY_BRANCH if (usableB > 0.5)
    {
        reference += rgbB;
        count += 1.0;
    }
    valid = step(0.5, count);
    reference /= max(count, 1.0);
}

inline float3 BrowResponseContinuousDeadband(float3 rawRatio)
{
    float3 ratio = clamp(rawRatio, 0.75, 1.25);
    float3 delta = ratio - 1.0;
    // ±deadzone 안은 정확히 neutral. 밖에서는 경계의 0에서 선형으로 다시 시작하고
    // clamp 끝점(0.75/1.25)에 원래 최대 보정이 도달하도록 남은 구간을 재스케일한다.
    float3 resumedMagnitude = saturate(
        (abs(delta) - BROW_RATIO_DEADZONE) / (0.25 - BROW_RATIO_DEADZONE)) * 0.25;
    return clamp(1.0 + sign(delta) * resumedMagnitude, 0.75, 1.25);
}

inline float3 BrowResponseExposure(float browSide)
{
    float3 result = float3(1.0, 1.0, 1.0);
    // Pencil.shader를 공유하는 lash material은 이 유니폼을 설정하지 않는다. reference
    // taps 전체를 outer uniform branch 안에 둬 비활성 lash 경로의 샘플 비용을 0으로 둔다.
    UNITY_BRANCH if (_BrowSkinReferenceValid >= 0.5)
    {
        float3 firstReference = float3(0.0, 0.0, 0.0);
        float3 secondReference = float3(0.0, 0.0, 0.0);
        float firstValid = 0.0;
        float secondValid = 0.0;
        BrowResponseRobustReference(
            _BrowSkinReferenceViewport01.xy, _BrowSkinReferenceViewport01.zw,
            firstReference, firstValid);
        BrowResponseRobustReference(
            _BrowSkinReferenceViewport23.xy, _BrowSkinReferenceViewport23.zw,
            secondReference, secondValid);
        UNITY_BRANCH if (firstValid >= 0.5 && secondValid >= 0.5)
        {
            float3 sideReference = lerp(
                firstReference, secondReference, step(0.5, browSide));
            float3 pairReference = 0.5 * (firstReference + secondReference);
            float finite = BrowResponseFinite3(sideReference)
                * BrowResponseFinite3(pairReference);
            float aboveFloor = step(BROW_REFERENCE_FLOOR,
                min(min(sideReference.r, sideReference.g), sideReference.b))
                * step(BROW_REFERENCE_FLOOR,
                    min(min(pairReference.r, pairReference.g), pairReference.b));
            UNITY_BRANCH if (finite >= 0.5 && aboveFloor >= 0.5)
            {
                float3 ratio = clamp(sideReference / pairReference, 0.75, 1.25);
                UNITY_BRANCH if (BrowResponseFinite3(ratio) >= 0.5)
                    result = BrowResponseContinuousDeadband(ratio);
            }
        }
    }
    return result;
}

inline fixed3 BrowResponseNormalizeFeed(fixed3 feed, float3 exposure)
{
    return feed / max(exposure, float3(1e-4, 1e-4, 1e-4));
}

inline float BrowResponseNormalizedLuma(fixed3 normalizedFeed)
{
    return BrowResponseLuma(normalizedFeed);
}

inline float BrowResponseHair(float normalizedLuma, float hairLo, float hairHi)
{
    return 1.0 - smoothstep(hairLo, hairHi, normalizedLuma);
}

inline fixed3 BrowResponseReapplyExposure(fixed3 pigment, float3 exposure)
{
    return pigment * exposure;
}

#endif // ARMAKEUP_BROW_RESPONSE_INCLUDED
