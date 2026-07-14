using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// R7 명명 워프 — 눈썹 두께/아치. 밴드 상단(up)을 하단(lo) 기준으로 배율·중앙
    /// 볼록 오프셋해 "두껍게 / 아치 올림"을 만든다. BrowRenderer(제품 스택)·
    /// StyleRenderer(텍스처)·PencilRenderer(개별 털)가 같은 함수를 쓰므로
    /// 세 제품이 함께 움직인다(핸들 조작 시 제품 분리 방지 — 설계 섹션 12 정정 1).
    ///
    /// 정규화 규약(섹션 09): 오프셋은 밴드 자체 높이(up-lo)의 배수라 얼굴 크기와
    /// 무관. thickness 1 = 원래, arch 0 = 원래(0=baseline 규약). 좌우 대칭은
    /// 한 값 공유로 잠금(R7).
    /// </summary>
    public static class BrowWarp
    {
        // ── 모양 프리셋 강도(밴드 높이 h 배수, 실기기 튜닝 대상) ────────────────
        // 진단(섹션 12): 구버전은 상단 엣지만 0.18~0.35h 이동해 6종이 육안 구분 불가
        // (아치 0.22 텐트 vs 반달 0.20 sin ≈ 0.4px 차 = 사실상 중복)였다. 강화판은
        // 상·하단 두 엣지를 함께 이동시켜 실루엣 변화를 배증하고, 아치(뾰족 텐트)와
        // 반달(둥근 돔)의 프로파일·엣지 방향을 분리한다. 모두 default 핸들(thickness=1,
        // arch=0)에서 프리셋 단독으로 실루엣을 만든다(핸들과 합산 — 아래 참조).
        const float StraightTopDrop = 0.42f;   // 일자: 중앙 상단을 눌러 곧게
        const float StraightBottomLift = 0.08f; // 일자: 중앙 하단 살짝 올려 평탄한 바
        const float ArchTopPeak = 0.42f;       // 아치: 중앙 상단 리프트(삼각·뾰족)
        const float ArchBottomDip = 0.12f;     // 아치: 중앙 하단 하강 → 아치감 강조
        const float MoonTopPeak = 0.30f;       // 반달: 상단 리프트(sin·둥근·넓음)
        const float MoonBottomRise = 0.10f;    // 반달: 하단도 함께 상승 → 균일 크레센트
        const float AngularTopPeak = 0.45f;    // 각진: 앞1/3 피크(높고)
        const float AngularBottomDip = 0.10f;  // 각진: 피크 하단 하강 → 꺾임(코너) 부각
        const float AngularPos = 0.62f;        // 각진: 피크 위치(앞머리 쪽 1/3)
        const float AngularSharp = 4.0f;       // 각진: 피크 예리도(클수록 좁고 각짐)
        const float RiseTopPeak = 0.42f;       // 상승: 꼬리 상단 리프트
        const float RiseBottomLift = 0.22f;    // 상승: 꼬리 하단도 리프트 → 밴드 전체 상승

        // ── 과변형 가드 ──────────────────────────────────────────────────────
        const float MaxEdgeShift = 0.55f;      // 엣지별 이동 상한(밴드 높이 배수)
        const float MinBandFrac = 0.35f;       // 밴드 최소 높이(반전·붕괴 방지)

        // ── 꼬리 안티-드룹(전역, 모든 shape 공통) ─────────────────────────────
        // 미용 규칙: 눈썹 꼬리 끝(바깥·along 0)은 앞머리(안쪽·along 1) 높이 이상에서
        // 끝나야 한다(처진 눈썹 불가). LiftDroopingTail가 ShapeBand 프로파일 적용 후
        // 얹는 후처리 가드로 이를 강제한다. 이미 꼬리가 앞머리보다 높은 shape(상승 등)는
        // no-op. 앞머리 높이를 '하한'으로만 삼아 그 이상 과도 리프트는 하지 않는다.
        const float AntiDroopStrength = 1.0f;   // 꼬리 부족분을 앞머리 높이까지 보정하는 비율
                                                // (1=끝이 정확히 앞머리 높이, 구 0.85=15% 잔여 처짐)
        const float AntiDroopHeadMargin = 0f;   // 보정 시 앞머리 위로 더 올릴 여유(밴드 높이 배수, 튜닝용)
        const float AntiDroopTailRegion = 0.6f; // 보정 대상 꼬리 반쪽 경계(along) — 접합부 매끈

        /// <summary>along: 가로 0(꼬리)→1(앞머리). shape(#19b, 슬롯 공통):
        /// 0=내추럴(무변경) 1=일자(중앙 평탄) 2=아치(중앙 뾰족 텐트) 3=각진(앞 1/3 꺾임)
        /// 4=상승(꼬리 전체 리프트) 5=반달(넓고 둥근 돔). 강화판은 상단·하단(lo) 두
        /// 엣지를 ref로 함께 이동시켜 실루엣 변화를 키운다(구버전은 상단만). 연속 핸들
        /// thickness/arch는 기존 규약대로 lo를 앵커로 상단만 조작하며, 프리셋 이동은 그
        /// 위에 합산되므로 default 핸들에서 프리셋이 단독 실루엣을 만든다. 모양 이동은
        /// 밴드 높이(원본 up-lo) 배수라 얼굴 크기 무관(섹션 09). 세 눈썹 제품이 같은
        /// shape/thickness/arch를 공유하고 along 규약이 좌우 동일하므로 대칭이 잠긴다.</summary>
        public static void ShapeBand(
            ref Vector2 lo, ref Vector2 up, float along, float thickness, float arch, int shape)
        {
            var band = up - lo;            // 원본 밴드 벡터(하단→상단)
            var h = band.magnitude;
            if (h < 1e-6f) return;         // 퇴화(밴드 높이 0) — 무변경
            var n = band / h;              // 단위 '위' 방향

            // 연속 핸들(thickness/arch) — 기존 규약 유지: lo 앵커로 상단만 스케일·볼록.
            if (thickness != 1f) up = lo + band * thickness;
            if (arch != 0f)
            {
                var midH = 1f - Mathf.Abs(along * 2f - 1f);
                up += band * (arch * midH);
            }

            // 모양 프리셋 — 상·하단 엣지 각각의 이동량(밴드 높이 h 배수)을 누적.
            // upK/loK > 0 = 위로. shape 0(내추럴) = 무변경(baseline).
            var upK = 0f;
            var loK = 0f;
            if (shape == 1) // 일자 — 중앙 상단을 눌러 곧게 + 하단 살짝 올려 평탄한 바
            {
                var midH = 1f - Mathf.Abs(along * 2f - 1f);
                upK -= StraightTopDrop * midH;
                loK += StraightBottomLift * midH;
            }
            else if (shape == 2) // 아치 — 중앙 뾰족 텐트: 상단 리프트 + 하단 하강(삼각 프로파일)
            {
                var midH = 1f - Mathf.Abs(along * 2f - 1f); // 삼각(중앙 뾰족)
                upK += ArchTopPeak * midH;
                loK -= ArchBottomDip * midH;
            }
            else if (shape == 3) // 각진 — 앞 1/3에 예리한 꺾임: 좁은 피크 + 하단 하강으로 코너 부각
            {
                var peak = Mathf.Clamp01(1f - Mathf.Abs(along - AngularPos) * AngularSharp);
                upK += AngularTopPeak * peak;
                loK -= AngularBottomDip * peak;
            }
            else if (shape == 4) // 상승 — 꼬리로 갈수록 상·하단 함께 리프트(밴드 전체 우상향)
            {
                var tail = 1f - along;
                var t2 = tail * tail;
                upK += RiseTopPeak * t2;
                loK += RiseBottomLift * t2;
            }
            else if (shape == 5) // 반달 — 넓고 둥근 돔(sin): 상·하단 함께 상승 → 균일 크레센트
            {
                var dome = Mathf.Sin(along * Mathf.PI);
                upK += MoonTopPeak * dome;
                loK += MoonBottomRise * dome;
            }

            // 과변형 클램프 — 엣지별 이동을 밴드 높이 배수로 상한(마스크 밖 오버플로 가드).
            upK = Mathf.Clamp(upK, -MaxEdgeShift, MaxEdgeShift);
            loK = Mathf.Clamp(loK, -MaxEdgeShift, MaxEdgeShift);
            up += n * (h * upK);
            lo += n * (h * loK);

            // 밴드 붕괴·반전 방지 — 상단이 하단 아래로 내려가지 않게 최소 높이 확보(하단 고정).
            var newH = Vector2.Dot(up - lo, n);
            if (newH < h * MinBandFrac) up += n * (h * MinBandFrac - newH);
        }

        /// <summary>꼬리 안티-드룹(전역 미용 가드) — 눈썹 꼬리 끝이 앞머리보다 아래에서
        /// 끝나지 않도록, 밴드 중심선 높이가 앞머리보다 낮은 꼬리 반쪽 점을 부족분만큼
        /// 위로 올린다. MediaPipe 랜드마크는 꼬리가 앞머리보다 처지는 경향(실기기: "끝이
        /// 앞머리보다 내려가며 그려짐")이라 모든 shape에 공통으로 필요하다. '위' 방향은
        /// 밴드 중앙의 (상단−하단) = 이마 쪽 = 화면상 위(원래 처짐 수정으로 실기기 검증된
        /// 부호). AntiDroopStrength=1이면 꼬리 끝(along 0, 가중 1)이 정확히 앞머리 높이에
        /// 닿는다. 이미 앞머리 이상인 점(deficit≤0, 상승 등)은 무변경(no-op)이라 모양
        /// 실루엣과 충돌하지 않고, 앞머리 높이를 하한으로만 삼아 과도 리프트도 없다.
        /// 꼬리로 갈수록 강한 SmoothStep 가중으로 접합부가 매끈하다(급격한 꺾임 없음).
        /// 네 눈썹 제품(제품 스택·펜슬·텍스처·스텐실 가이드)이 공유한다.
        /// 배열 순서 규약: [0]=꼬리 → [n-1]=앞머리(BrowUpper/BrowLower 순서).</summary>
        public static void LiftDroopingTail(Vector2[] lo, Vector2[] up, int n)
        {
            if (n < 2) return;
            var head = 0.5f * (lo[n - 1] + up[n - 1]);
            var mid = (n - 1) / 2;
            var band = up[mid] - lo[mid]; // 밴드 중앙의 '위' 방향(하단→상단=이마쪽=화면상 위)
            var bandH = band.magnitude;
            if (bandH < 1e-6f) return;
            var upAxis = band / bandH;
            var hHead = Vector2.Dot(head, upAxis); // 앞머리 중심선 높이(하한)
            for (var i = 0; i < n; i++)
            {
                var along = i / (float)(n - 1);
                if (along > AntiDroopTailRegion) continue; // 앞머리 반쪽은 손대지 않음
                var c = 0.5f * (lo[i] + up[i]);
                var deficit = hHead - Vector2.Dot(c, upAxis);
                if (deficit <= 0f) continue; // 앞머리 이상이면 정상 — 무변경(상승 등 no-op)
                // 꼬리로 갈수록 강하게(경계에서 0 → 꼬리 1): 접합부 매끈.
                var w = Mathf.SmoothStep(0f, 1f, (AntiDroopTailRegion - along) / AntiDroopTailRegion);
                var lift = deficit * AntiDroopStrength + bandH * AntiDroopHeadMargin;
                var liftV = upAxis * (lift * w);
                lo[i] += liftV;
                up[i] += liftV;
            }
        }
    }
}
