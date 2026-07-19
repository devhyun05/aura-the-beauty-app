using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    public static class RegionAffineUtility
    {
        public static RegionAffine Sanitize(RegionAffine source)
        {
            if (source == null) return new RegionAffine();
            return new RegionAffine
            {
                region = source.region,
                dx = Mathf.Clamp(FiniteOrZero(source.dx), -0.15f, 0.15f),
                dy = Mathf.Clamp(FiniteOrZero(source.dy), -0.15f, 0.15f),
                sx = Mathf.Clamp(FiniteOrZero(source.sx), -0.5f, 0.5f),
                sy = Mathf.Clamp(FiniteOrZero(source.sy), -0.5f, 0.5f),
                rot = Mathf.Clamp(FiniteOrZero(source.rot), -45f, 45f),
            };
        }

        public static bool IsZero(RegionAffine affine) =>
            affine == null || (affine.dx == 0f && affine.dy == 0f && affine.sx == 0f &&
                               affine.sy == 0f && affine.rot == 0f);

        public static Vector2 TransformEyePoint(Vector2 point, Vector2 center,
                                                Vector2 xAxis, Vector2 yAxis,
                                                float eyeWidth, RegionAffine source)
        {
            // 픽셀 동일 계약: 명시 reset도 계산 경로에 들어가지 않고 기존 정점을 그대로 반환한다.
            if (IsZero(source)) return point;

            var dx = Mathf.Clamp(FiniteOrZero(source.dx), -0.15f, 0.15f);
            var dy = Mathf.Clamp(FiniteOrZero(source.dy), -0.15f, 0.15f);
            var sx = Mathf.Clamp(FiniteOrZero(source.sx), -0.5f, 0.5f);
            var sy = Mathf.Clamp(FiniteOrZero(source.sy), -0.5f, 0.5f);
            var rotation = Mathf.Clamp(FiniteOrZero(source.rot), -45f, 45f);

            var localXAxis = xAxis.sqrMagnitude > 1e-12f ? xAxis.normalized : Vector2.right;
            var localYAxis = new Vector2(-localXAxis.y, localXAxis.x);
            if (Vector2.Dot(localYAxis, yAxis) < 0f) localYAxis = -localYAxis;
            var relative = point - center;
            var local = new Vector2(
                Vector2.Dot(relative, localXAxis), Vector2.Dot(relative, localYAxis));
            local = Vector2.Scale(local, new Vector2(1f + sx, 1f + sy));
            var radians = rotation * Mathf.Deg2Rad;
            var sine = Mathf.Sin(radians);
            var cosine = Mathf.Cos(radians);
            var rotated = new Vector2(
                cosine * local.x - sine * local.y,
                sine * local.x + cosine * local.y);
            rotated += new Vector2(dx, dy) * eyeWidth;
            return center + localXAxis * rotated.x + localYAxis * rotated.y;
        }

        /// <summary>
        /// LowerLid.shader의 정규화 band UV와 같은 forward 변환. x/y를 각각 눈폭/밴드높이로
        /// 정규화한 뒤 S→R→T하고 재구성하므로 비정방 밴드에서도 dy·회전이 셰이더와 일치한다.
        /// </summary>
        public static Vector2 TransformBandPoint(Vector2 point, Vector2 center,
                                                 Vector2 xAxis, Vector2 yAxis,
                                                 float bandWidth, float bandHeight,
                                                 RegionAffine source)
        {
            if (IsZero(source)) return point;
            var affine = Sanitize(source);
            var localXAxis = xAxis.sqrMagnitude > 1e-12f ? xAxis.normalized : Vector2.right;
            var localYAxis = new Vector2(-localXAxis.y, localXAxis.x);
            if (Vector2.Dot(localYAxis, yAxis) < 0f) localYAxis = -localYAxis;
            var width = Mathf.Max(Mathf.Abs(bandWidth), 1e-6f);
            var height = Mathf.Max(Mathf.Abs(bandHeight), 1e-6f);
            var relative = point - center;
            var normalized = new Vector2(
                Vector2.Dot(relative, localXAxis) / width,
                Vector2.Dot(relative, localYAxis) / height);
            normalized = Vector2.Scale(normalized,
                new Vector2(1f + affine.sx, 1f + affine.sy));
            var radians = affine.rot * Mathf.Deg2Rad;
            var sine = Mathf.Sin(radians);
            var cosine = Mathf.Cos(radians);
            var transformed = new Vector2(
                cosine * normalized.x - sine * normalized.y,
                sine * normalized.x + cosine * normalized.y) +
                new Vector2(affine.dx, affine.dy);
            return center + localXAxis * (transformed.x * width) +
                   localYAxis * (transformed.y * height);
        }

        /// <summary>LowerLid.shader InverseBandAffine의 CPU 기준식.</summary>
        public static Vector2 BandSampleUv(Vector2 displayBandUv, RegionAffine source)
        {
            var affine = Sanitize(source);
            if (IsZero(affine)) return displayBandUv;
            var centered = new Vector2(displayBandUv.x - 0.5f, 0.5f - displayBandUv.y);
            centered -= new Vector2(affine.dx, affine.dy);
            var radians = -affine.rot * Mathf.Deg2Rad;
            var sine = Mathf.Sin(radians);
            var cosine = Mathf.Cos(radians);
            centered = new Vector2(
                cosine * centered.x - sine * centered.y,
                sine * centered.x + cosine * centered.y);
            centered = Vector2.Scale(centered, new Vector2(
                1f / Mathf.Max(0.5f, 1f + affine.sx),
                1f / Mathf.Max(0.5f, 1f + affine.sy)));
            return new Vector2(centered.x + 0.5f, 0.5f - centered.y);
        }

        /// <summary>FaceMakeup.ZoneAffineUV와 같은 순서의 CPU 기준식.</summary>
        public static Vector2 ZoneSampleUv(Vector2 displayUv, float lift, float spread,
                                           RegionAffine source)
        {
            var affine = Sanitize(source);
            var sampleUv = displayUv;
            sampleUv.y -= Mathf.Clamp(lift, -0.15f, 0.15f);
            var spreadWeight = SpreadWeight(displayUv.x);
            sampleUv.x += (displayUv.x < 0.5f ? spread : -spread) * spreadWeight;
            if (IsZero(affine)) return sampleUv;

            var centered = sampleUv - new Vector2(0.5f, 0.5f);
            centered.y -= affine.dy;
            centered.x += (displayUv.x < 0.5f ? affine.dx : -affine.dx) * spreadWeight;
            var radians = -affine.rot * Mathf.Deg2Rad;
            var sine = Mathf.Sin(radians);
            var cosine = Mathf.Cos(radians);
            centered = new Vector2(
                cosine * centered.x - sine * centered.y,
                sine * centered.x + cosine * centered.y);
            centered = Vector2.Scale(centered, new Vector2(
                1f / Mathf.Max(0.5f, 1f + affine.sx),
                1f / Mathf.Max(0.5f, 1f + affine.sy)));
            return centered + new Vector2(0.5f, 0.5f);
        }

        /// <summary>마스크 source UV를 위 기준식의 표시 UV로 결정론적으로 역산한다.</summary>
        public static Vector2 SolveZoneDisplayUv(Vector2 sourceUv, float lift, float spread,
                                                  RegionAffine source)
        {
            var affine = Sanitize(source);
            var finiteSource = new Vector2(FiniteOrZero(sourceUv.x), FiniteOrZero(sourceUv.y));
            var finiteSpread = FiniteOrZero(spread);
            if (IsZero(affine))
                return SolveLegacyZoneDisplayUv(finiteSource, lift, finiteSpread);

            // ZoneAffineUV는 q-t → R^-1 → S^-1 순서다. 이를 정확히 되감으면 남는
            // 비선형성은 legacy spread와 mirrored dx가 공유하는 x 단일축뿐이다.
            var scaled = Vector2.Scale(finiteSource - new Vector2(0.5f, 0.5f),
                new Vector2(1f + affine.sx, 1f + affine.sy));
            var radians = affine.rot * Mathf.Deg2Rad;
            var sine = Mathf.Sin(radians);
            var cosine = Mathf.Cos(radians);
            var legacyCentered = new Vector2(
                cosine * scaled.x - sine * scaled.y,
                sine * scaled.x + cosine * scaled.y);
            var displayX = SolveMirroredSpreadX(
                legacyCentered.x + 0.5f, finiteSpread + affine.dx);
            var displayY = legacyCentered.y + 0.5f + affine.dy +
                           Mathf.Clamp(FiniteOrZero(lift), -0.15f, 0.15f);
            return new Vector2(displayX, Mathf.Clamp01(displayY));
        }

        static Vector2 SolveLegacyZoneDisplayUv(Vector2 sourceUv, float lift, float spread)
        {
            return new Vector2(
                SolveMirroredSpreadX(sourceUv.x, spread),
                Mathf.Clamp01(sourceUv.y +
                    Mathf.Clamp(FiniteOrZero(lift), -0.15f, 0.15f)));
        }

        // h(u)=u-spread*smoothstep(u)는 큰 양의 spread에서 접혀 역이 여러 개일 수 있다.
        // 도함수의 영점으로 단조 구간을 나눈 뒤 각 구간을 고정 횟수 이분한다. 따라서 2D
        // 잔차 반복처럼 회전/저스케일에서 발산하지 않으며, 다중해는 최소 이동 해로 고정된다.
        static float SolveMirroredSpreadX(float targetX, float spread)
        {
            targetX = FiniteOrZero(targetX);
            spread = FiniteOrZero(spread);
            if (spread == 0f) return Mathf.Clamp01(targetX);

            var breakpoints = new float[6];
            var count = 0;
            breakpoints[count++] = 0f;
            breakpoints[count++] = 0.04f;
            if (spread >= 0.12f)
            {
                var discriminant = Mathf.Max(0f, 1f - 0.12f / spread);
                var root = Mathf.Sqrt(discriminant);
                breakpoints[count++] = 0.04f + 0.18f * (1f - root) * 0.5f;
                breakpoints[count++] = 0.04f + 0.18f * (1f + root) * 0.5f;
            }
            breakpoints[count++] = 0.22f;
            breakpoints[count++] = 0.5f;

            var bestX = Mathf.Clamp01(targetX);
            var bestResidual = float.PositiveInfinity;
            var bestDistance = float.PositiveInfinity;
            var targetCentered = targetX - 0.5f;
            for (var sideIndex = 0; sideIndex < 2; sideIndex++)
            {
                var side = sideIndex == 0 ? -1f : 1f;
                var radialTarget = side * targetCentered;
                for (var i = 0; i < count; i++)
                    ConsiderSpreadCandidate(breakpoints[i], side, radialTarget, targetX,
                        spread, ref bestX, ref bestResidual, ref bestDistance);

                for (var i = 0; i < count - 1; i++)
                {
                    var lo = breakpoints[i];
                    var hi = breakpoints[i + 1];
                    var loError = MirroredSpreadRadius(lo, spread) - radialTarget;
                    var hiError = MirroredSpreadRadius(hi, spread) - radialTarget;
                    if (loError == 0f || hiError == 0f || loError * hiError > 0f) continue;
                    for (var iteration = 0; iteration < 32; iteration++)
                    {
                        var mid = (lo + hi) * 0.5f;
                        var midError = MirroredSpreadRadius(mid, spread) - radialTarget;
                        if ((loError < 0f) == (midError < 0f))
                        {
                            lo = mid;
                            loError = midError;
                        }
                        else
                        {
                            hi = mid;
                        }
                    }
                    ConsiderSpreadCandidate((lo + hi) * 0.5f, side, radialTarget, targetX,
                        spread, ref bestX, ref bestResidual, ref bestDistance);
                }
            }
            return Mathf.Clamp01(bestX);
        }

        static void ConsiderSpreadCandidate(float radius, float side, float radialTarget,
                                            float targetX, float spread,
                                            ref float bestX, ref float bestResidual,
                                            ref float bestDistance)
        {
            var residual = Mathf.Abs(MirroredSpreadRadius(radius, spread) - radialTarget);
            var candidateX = 0.5f + side * radius;
            var distance = Mathf.Abs(candidateX - targetX);
            if (residual < bestResidual - 1e-7f ||
                (Mathf.Abs(residual - bestResidual) <= 1e-7f && distance < bestDistance))
            {
                bestX = candidateX;
                bestResidual = residual;
                bestDistance = distance;
            }
        }

        static float MirroredSpreadRadius(float radius, float spread) =>
            radius - spread * SpreadWeight(0.5f + radius);

        static float SpreadWeight(float x)
        {
            var t = Mathf.Clamp01((Mathf.Abs(x - 0.5f) - 0.04f) / (0.22f - 0.04f));
            return t * t * (3f - 2f * t);
        }

        public static Vector4 ToShaderVector(RegionAffine source)
        {
            var affine = Sanitize(source);
            return new Vector4(affine.dx, affine.dy, affine.sx, affine.sy);
        }

        static float FiniteOrZero(float value) =>
            float.IsNaN(value) || float.IsInfinity(value) ? 0f : value;
    }
}
