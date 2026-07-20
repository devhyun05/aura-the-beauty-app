#ifndef ARMAKEUP_EYESHADOW_SHAPE_INCLUDED
#define ARMAKEUP_EYESHADOW_SHAPE_INCLUDED

float EsFiniteOr(float value, float fallbackValue)
{
    return value == value && abs(value) <= 65504.0 ? value : fallbackValue;
}

void EsEvalShape(
    float verticalV,
    float bakedH,
    float anatomicalU,
    float cutoff,
    float edgeFeather,
    float shape,
    out float vfall,
    out float hweight)
{
    float v = saturate(EsFiniteOr(verticalV, 0.0));
    float h = saturate(EsFiniteOr(bakedH, 0.0));
    float u = clamp(EsFiniteOr(anatomicalU, 0.0), 0.0, 2.0);
    cutoff = max(saturate(EsFiniteOr(cutoff, 1.0)), 1e-4);
    edgeFeather = max(EsFiniteOr(edgeFeather, 0.45), 1e-4);
    shape = clamp(EsFiniteOr(shape, 0.0), 0.0, 11.0);

    // ID 0..3의 초기값과 분기 임계값/연산 순서는 기존 픽셀 계약이다.
    vfall = 1.0 - smoothstep(cutoff - edgeFeather, cutoff, v);
    hweight = h;

    float anatomicalBias = lerp(0.80, 1.00, h);
    float lidV = 1.0 - smoothstep(cutoff - edgeFeather, cutoff, v);

    if (shape > 3.5)
    {
        if (shape > 10.5)
        {
            // ID 11: tail extend
            vfall = 1.0 - smoothstep(0.62 * cutoff, 0.94 * cutoff, v);
            hweight = smoothstep(0.52, 0.78, min(u, 1.0))
                    * lerp(0.75, 1.00, h);
        }
        else if (shape > 9.5)
        {
            // ID 10: wide
            vfall = 1.0 - smoothstep(0.90 * cutoff, cutoff, v);
            hweight = lerp(0.92, 1.00, h);
        }
        else if (shape > 8.5)
        {
            // ID 9: point profile
            vfall = 1.0 - smoothstep(0.42 * cutoff, 0.72 * cutoff, v);
            hweight = smoothstep(0.58, 0.72, u)
                    * (1.0 - smoothstep(0.94, 1.00, u));
        }
        else if (shape > 7.5)
        {
            // ID 8: main profile
            vfall = 1.0 - smoothstep(0.58 * cutoff, 0.92 * cutoff, v);
            hweight = 0.88 * lerp(0.65, 1.00, h);
        }
        else if (shape > 6.5)
        {
            // ID 7: base profile
            vfall = 1.0 - smoothstep(0.74 * cutoff, cutoff, v);
            hweight = 0.62 * lerp(0.82, 1.00, h);
        }
        else if (shape > 5.5)
        {
            // ID 6: outer focus
            vfall = lidV;
            hweight = smoothstep(0.54, 0.72, u) * anatomicalBias;
        }
        else if (shape > 4.5)
        {
            // ID 5: center focus
            vfall = lidV;
            hweight = smoothstep(0.18, 0.34, u)
                    * (1.0 - smoothstep(0.66, 0.82, u))
                    * anatomicalBias;
        }
        else
        {
            // ID 4: inner focus
            vfall = lidV;
            hweight = (1.0 - smoothstep(0.28, 0.46, u))
                    * anatomicalBias;
        }
    }
    else if (shape > 2.5)
    {
        // ID 3: tail point
        hweight = pow(hweight, 2.4);
    }
    else if (shape > 1.5)
    {
        // ID 2: smoky
        vfall = 1.0 - smoothstep(
            0.70 * cutoff,
            1.00 * cutoff,
            v);
    }
    else if (shape > 0.5)
    {
        // ID 1: crease
        vfall =
            smoothstep(0.28 * cutoff, 0.50 * cutoff, v) *
            (1.0 - smoothstep(0.62 * cutoff, 0.95 * cutoff, v));
    }

    // 해부학적 안쪽 경계(u=0)를 모든 프로파일에서 부드럽게 닫는다.
    // 0.10→0.18: 안쪽 테이퍼를 더 넓게 펼쳐 뾰족한 삼각 코너 대신 둥근 마무리(파인애플 각짐 해소).
    hweight *= smoothstep(0.0, 0.18, u);
    vfall = saturate(vfall);
    hweight = saturate(hweight);
}

float EsExtensionGate(float anatomicalU, float shape)
{
    float u = clamp(EsFiniteOr(anatomicalU, 0.0), 0.0, 2.0);
    shape = clamp(EsFiniteOr(shape, 0.0), 0.0, 11.0);

    // 기존 ID 0 수식 그대로.
    if (shape < 0.5)
        return saturate(1.0 - smoothstep(1.0, 1.9, u));

    // 신규 ID 11만 현재 tail geometry의 전체 길이를 사용한다.
    if (shape > 10.5)
        return saturate(1.0 - smoothstep(1.0, 2.0, u));

    // ID 1..10: 바깥 눈꼬리로 짧고 자연스럽게 이어지는 공통 컷.
    return saturate(1.0 - smoothstep(1.0, 1.25, u));
}

#endif
