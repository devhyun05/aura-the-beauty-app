using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// R7 명명 워프 — 눈썹 두께/아치. 실제 상·하 랜드마크 간격을 측정 두께로 삼고,
    /// shape/arch 중심선 주위로 그 간격×thickness의 밴드를 만든다. BrowRenderer(제품 스택)·
    /// StyleRenderer(텍스처)·PencilRenderer(개별 털)·StencilGuideRenderer(가이드)가
    /// 같은 함수를 쓰므로 네 렌더러가 함께 움직인다(핸들 조작 시 제품 분리 방지 — 설계 섹션 12 정정 1).
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

        // ── 과변형·퇴화 가드 ────────────────────────────────────────────────
        const float MaxEdgeShift = 0.55f;      // 엣지별 이동 상한(밴드 높이 배수)
        const float GeometryEpsilon = 1e-6f;   // 정규화/나눗셈 가능한 최소 길이

        // ── 꼬리 안티-드룹(전역, 모든 shape 공통) ─────────────────────────────
        // 미용 규칙: 눈썹 꼬리 끝(바깥·along 0)은 앞머리(안쪽·along 1) 높이 이상에서
        // 끝나야 한다(처진 눈썹 불가). WarpAndLiftDroopingTail가 ShapeBand와 꼬리 폭 테이퍼 적용
        // 후 얹는 가드로 이를 강제한다. 이미 목표 floor보다 높은 shape(상승 등)는 no-op.
        const float AntiDroopHeadMargin = 0.05f; // 목표 floor를 앞머리보다 올릴 여유(밴드 높이 배수)
        const float AntiDroopFullRegion = 0.20f; // 꼬리 끝 20%는 목표 floor까지 완전 보정
        const float AntiDroopTailRegion = 0.80f; // 이후 이 지점까지 가중치를 부드럽게 0으로 감쇠
        const int FaceUpForeheadLandmark = 10;   // 안정 얼굴축 상단(MediaPipe forehead top)
        const int FaceUpChinLandmark = 152;      // 안정 얼굴축 하단(MediaPipe chin)

        // ── 꼬리 폭 테이퍼(밴드 채움·텍스처·가이드 공통) ─────────────────────
        const float TailTaperRegion = 0.50f;
        const float TailTaperStrength = 1.25f;
        const float TailTipMinimumWidth = 0.08f;

        /// <summary>along: 가로 0(꼬리)→1(앞머리). shape(#19b, 슬롯 공통):
        /// 0=내추럴(무변경) 1=일자(중앙 평탄) 2=아치(중앙 뾰족 텐트) 3=각진(앞 1/3 꺾임)
        /// 4=상승(꼬리 전체 리프트) 5=반달(넓고 둥근 돔). 강화판은 상단·하단(lo) 두
        /// 엣지를 ref로 함께 이동시켜 중심선 실루엣을 만든다(구버전은 상단만). thickness는
        /// 중심선과 독립적으로 원본 측정 간격에 한 번만 곱하고, arch·프리셋 이동은 원본
        /// 밴드 높이 배수라 얼굴 크기 무관(섹션 09). 네 렌더러가 같은 값과 along 규약을
        /// 공유하므로 좌우 대칭과 제품 동조가 잠긴다.</summary>
        public static void ShapeBand(
            ref Vector2 lo, ref Vector2 up, float along, float thickness, float arch, int shape)
        {
            var measuredBand = up - lo;       // 사용자의 실제 하단→상단 랜드마크 간격
            var measuredH = measuredBand.magnitude;
            if (!IsFinite(lo) || !IsFinite(up) || !IsFinite(along) ||
                !IsFinite(thickness) || !IsFinite(arch) || !IsFinite(measuredH) ||
                measuredH < GeometryEpsilon)
                return;
            var n = measuredBand / measuredH; // 단위 '위' 방향

            // 아치·shape는 원본 측정 밴드에서 실루엣 중심선만 결정한다. thickness는 아래
            // 최종 재구성에서 실제 측정 간격의 배수로 한 번만 적용하므로 중심선에 영향 없음.
            var shapedLo = lo;
            var shapedUp = up;
            if (arch != 0f)
            {
                var midH = 1f - Mathf.Abs(along * 2f - 1f);
                shapedUp += measuredBand * (arch * midH);
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
            shapedUp += n * (measuredH * upK);
            shapedLo += n * (measuredH * loK);

            // 최종 폭 불변식: up-lo == 원본 measuredBand * thickness. shape/arch가 만든
            // 중심선 주위로 대칭 재구성해 slider=1이면 사용자의 실제 눈썹 두께 그대로다.
            var shapedCenter = 0.5f * (shapedLo + shapedUp);
            var halfBand = 0.5f * measuredBand * thickness;
            lo = shapedCenter - halfBand;
            up = shapedCenter + halfBand;
        }

        /// <summary>꼬리 폭 테이퍼 — 중심선은 유지하고 along 0(꼬리)에서 최소 폭으로
        /// 좁힌 뒤 along 0.5까지 원래 폭으로 복원한다. 최소 폭이 양수라 strip 삼각형과
        /// 텍스처 UV가 꼬리 끝에서 퇴화하지 않는다.</summary>
        public static void TaperTail(ref Vector2 lo, ref Vector2 up, float along)
        {
            var clampedAlong = Mathf.Clamp01(along);
            var t = Mathf.Clamp01(clampedAlong / TailTaperRegion);
            var eased = Mathf.SmoothStep(0f, 1f, Mathf.Pow(t, TailTaperStrength));
            var widthScale = Mathf.Lerp(TailTipMinimumWidth, 1f, eased);
            var center = 0.5f * (lo + up);
            var halfBand = 0.5f * (up - lo) * widthScale;
            lo = center - halfBand;
            up = center + halfBand;
        }

        /// <summary>꼬리 안티-드룹(전역 미용 가드) — 눈썹 꼬리 끝이 앞머리보다 아래에서
        /// 끝나지 않도록, 각 단면에서 실제로 가장 낮은 엣지를 앞머리의 가장 낮은 엣지와
        /// 비교해 부족분만큼 위로 올린다. 높이축은 대각선으로 짝지어진 BrowUpper−BrowLower가
        /// 아니라 live landmark의 forehead(10)−chin(152) 얼굴축이다. 최종 표시와 동일하게
        /// FaceWarpField.Forward를 통과한 최종 표시 공간에서 floor를 판정하고 직접 올린다.
        /// 성공하면 lo/up 전체가 이미 Forward 적용된 이미지 UV가 되므로 호출자는 반드시
        /// FramePresenter.WarpedImageToViewport로 표시해야 한다(두 번째 얼굴 워프 금지).
        /// false면 배열은 전혀 바꾸지 않아 기존 ImageToViewport 경로로 안전하게 폴백할 수 있다.
        /// x에 imageAspect를 곱한 등방 metric에서 계산하므로 얼굴 롤과 정규화 이미지 UV의
        /// x/y 단위 차이를 모두 보존한다. 꼬리 끝 20%는 완전 보정하고 이후 along 0.8까지
        /// SmoothStep으로 감쇠한다. 네 눈썹 렌더러가 공유하며 배열 순서는 [0]=꼬리 →
        /// [n-1]=앞머리다.</summary>
        public static bool WarpAndLiftDroopingTail(
            Vector2[] lo, Vector2[] up, int n, Vector3[] landmarks, float imageAspect)
        {
            if (lo == null || up == null || landmarks == null || n < 2 ||
                lo.Length < n || up.Length < n || landmarks.Length <= FaceUpChinLandmark ||
                !IsFinite(imageAspect) || imageAspect <= GeometryEpsilon)
                return false;

            var forehead = landmarks[FaceUpForeheadLandmark];
            var chin = landmarks[FaceUpChinLandmark];
            if (!IsFinite(forehead) || !IsFinite(chin)) return false;
            var warp = FaceWarpField.Instance;

            // 두 단계 커밋: 모든 입력과 Forward 결과를 먼저 검증한다. 하나라도 잘못되면
            // raw UV 배열을 그대로 두고 false를 반환해 호출자의 기존 매핑 폴백과 맞춘다.
            for (var i = 0; i < n; i++)
            {
                if (!IsFinite(lo[i]) || !IsFinite(up[i])) return false;
                if (!IsFinite(ForwardWarp(lo[i], warp)) || !IsFinite(ForwardWarp(up[i], warp)))
                    return false;
            }

            var foreheadWarped = ForwardWarp(new Vector2(forehead.x, forehead.y), warp);
            var chinWarped = ForwardWarp(new Vector2(chin.x, chin.y), warp);
            if (!IsFinite(foreheadWarped) || !IsFinite(chinWarped)) return false;
            var faceUp = new Vector2(
                (foreheadWarped.x - chinWarped.x) * imageAspect,
                foreheadWarped.y - chinWarped.y);
            var faceUpH = faceUp.magnitude;
            if (!IsFinite(faceUpH) || faceUpH < GeometryEpsilon) return false;
            var upAxis = faceUp / faceUpH;

            var mid = (n - 1) / 2;
            var midLoWarped = ForwardWarp(lo[mid], warp);
            var midUpWarped = ForwardWarp(up[mid], warp);
            var band = new Vector2(
                (midUpWarped.x - midLoWarped.x) * imageAspect,
                midUpWarped.y - midLoWarped.y);
            var bandH = band.magnitude;
            if (!IsFinite(bandH) || bandH < GeometryEpsilon) return false;
            var headLoWarped = ForwardWarp(lo[n - 1], warp);
            var headUpWarped = ForwardWarp(up[n - 1], warp);
            var headLo = ToMetric(headLoWarped, imageAspect);
            var headUp = ToMetric(headUpWarped, imageAspect);
            var headFloor = Mathf.Min(Vector2.Dot(headLo, upAxis), Vector2.Dot(headUp, upAxis));
            var targetFloor = headFloor + bandH * AntiDroopHeadMargin;
            if (!IsFinite(headFloor) || !IsFinite(targetFloor)) return false;
            var fadeSpan = Mathf.Max(AntiDroopTailRegion - AntiDroopFullRegion, GeometryEpsilon);

            // 여기서부터 배열 좌표계는 최종 FaceWarp 공간이다. 호출자는 반환값 true일 때
            // raw viewport affine만 적용해야 한다.
            for (var i = 0; i < n; i++)
            {
                lo[i] = ForwardWarp(lo[i], warp);
                up[i] = ForwardWarp(up[i], warp);
            }

            for (var i = 0; i < n; i++)
            {
                var along = i / (float)(n - 1);
                if (along >= AntiDroopTailRegion) continue;

                var loMetric = ToMetric(lo[i], imageAspect);
                var upMetric = ToMetric(up[i], imageAspect);
                var floor = Mathf.Min(Vector2.Dot(loMetric, upAxis), Vector2.Dot(upMetric, upAxis));
                var deficit = targetFloor - floor;
                if (deficit <= 0f) continue;

                var weight = 1f;
                if (along > AntiDroopFullRegion)
                {
                    var fade = Mathf.Clamp01(
                        (along - AntiDroopFullRegion) / fadeSpan);
                    weight = 1f - Mathf.SmoothStep(0f, 1f, fade);
                }
                // along=0은 weight=1: 최종 워프 공간의 lower tail floor 목표가 targetFloor다.
                // 조절 가능한 strength를 두지 않아 tip 불변식이 튜닝으로 약화되지 않는다.
                var liftMetric = upAxis * (deficit * weight);
                var liftUv = new Vector2(liftMetric.x / imageAspect, liftMetric.y);
                lo[i] += liftUv;
                up[i] += liftUv;
            }

            return true;
        }

        static Vector2 ToMetric(Vector2 point, float imageAspect) =>
            new Vector2(point.x * imageAspect, point.y);

        static Vector2 ForwardWarp(Vector2 point, FaceWarpField warp) =>
            warp != null ? warp.Forward(point) : point;

        static bool IsFinite(float value) =>
            !float.IsNaN(value) && !float.IsInfinity(value);

        static bool IsFinite(Vector2 value) => IsFinite(value.x) && IsFinite(value.y);
        static bool IsFinite(Vector3 value) =>
            IsFinite(value.x) && IsFinite(value.y) && IsFinite(value.z);
    }
}
