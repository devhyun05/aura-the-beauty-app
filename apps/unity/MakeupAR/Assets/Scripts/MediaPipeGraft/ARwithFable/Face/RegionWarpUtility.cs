using ARMakeup.Bridge;
using UnityEngine;

namespace ARMakeup.Face
{
    public struct RegionWarpProfile
    {
        public float p0, p1, p2, p3, p4, p5, p6, p7;
        public float this[int index]
        {
            get
            {
                switch (index)
                {
                    case 0: return p0; case 1: return p1; case 2: return p2; case 3: return p3;
                    case 4: return p4; case 5: return p5; case 6: return p6; default: return p7;
                }
            }
        }
    }

    /// <summary>W5 파일럿 윤곽 워프의 wire 방어·8점 보간·미러 기준식.</summary>
    public static class RegionWarpUtility
    {
        public const int PointCount = 8;
        public const float OffsetLimit = 0.2f;

        public static RegionWarp Sanitize(RegionWarp source)
        {
            var result = new RegionWarp
            {
                region = source != null ? source.region : null,
                warp = new float[PointCount],
            };
            if (source?.warp == null) return result;
            for (var i = 0; i < PointCount && i < source.warp.Length; i++)
            {
                var value = source.warp[i];
                if (float.IsNaN(value) || float.IsInfinity(value)) value = 0f;
                result.warp[i] = Mathf.Clamp(value, -OffsetLimit, OffsetLimit);
            }
            return result;
        }

        public static bool IsZero(RegionWarp source)
        {
            if (source?.warp == null) return true;
            for (var i = 0; i < source.warp.Length && i < PointCount; i++)
                if (source.warp[i] != 0f) return false;
            return true;
        }

        public static RegionWarpProfile SanitizeProfile(RegionWarp source)
        {
            float Read(int index)
            {
                if (source?.warp == null || index >= source.warp.Length) return 0f;
                var value = source.warp[index];
                return float.IsNaN(value) || float.IsInfinity(value)
                    ? 0f : Mathf.Clamp(value, -OffsetLimit, OffsetLimit);
            }
            return new RegionWarpProfile
            {
                p0 = Read(0), p1 = Read(1), p2 = Read(2), p3 = Read(3),
                p4 = Read(4), p5 = Read(5), p6 = Read(6), p7 = Read(7),
            };
        }

        public static bool IsZero(in RegionWarpProfile profile) =>
            profile.p0 == 0f && profile.p1 == 0f && profile.p2 == 0f && profile.p3 == 0f &&
            profile.p4 == 0f && profile.p5 == 0f && profile.p6 == 0f && profile.p7 == 0f;

        public static float SampleOpenProfile(in RegionWarpProfile profile, float t, bool mirrored)
        {
            if (IsZero(profile)) return 0f;
            var position = Mathf.Clamp01(mirrored ? 1f - t : t) * (PointCount - 1);
            var lo = Mathf.FloorToInt(position);
            var hi = Mathf.Min(lo + 1, PointCount - 1);
            return Mathf.Lerp(profile[lo], profile[hi], position - lo);
        }

        public static float SampleCyclicProfile(in RegionWarpProfile profile, float t)
        {
            if (IsZero(profile)) return 0f;
            var position = Mathf.Repeat(t, 1f) * PointCount;
            var floor = Mathf.Floor(position);
            var lo = Mathf.FloorToInt(position) % PointCount;
            return Mathf.Lerp(profile[lo], profile[(lo + 1) % PointCount], position - floor);
        }

        public static float SampleCyclicAnatomicalProfile(in RegionWarpProfile profile, float t,
                                                          bool anatomicalLeft)
        {
            // left spatial j maps canonical control 7-j while preserving the closed stroke winding.
            var canonicalT = anatomicalLeft ? Mathf.Repeat(1f - t - 1f / PointCount, 1f) : t;
            return SampleCyclicProfile(profile, canonicalT);
        }

        public static float SampleProfile(RegionWarp source, float t, bool mirrored)
        {
            return SampleOpenProfile(SanitizeProfile(source), t, mirrored);
        }

        /// <summary>
        /// 블러셔처럼 닫힌 8점 링 전용 보간. t=j/8에서 j번 제어점을 정확히 지나고
        /// 마지막 점에서 0번으로 순환한다. 좌우 모두 같은 캐노니컬 winding을 소비한다.
        /// </summary>
        public static float SampleCyclicProfile(RegionWarp source, float t)
        {
            return SampleCyclicProfile(SanitizeProfile(source), t);
        }

        /// <summary>캐노니컬 경계를 로컬 법선 방향으로 먼저 변형한다. W4 배치는 호출자가 후속 적용.</summary>
        public static Vector2 WarpBoundaryPoint(Vector2 center, Vector2 edge, float t,
                                                bool mirrored, RegionWarp source)
        {
            if (IsZero(source)) return center + edge;
            return center + edge * (1f + SampleProfile(source, t, mirrored));
        }


        /// <summary>닫힌 블러셔 경계를 동일 winding의 cyclic 프로파일로 로컬 변형한다.</summary>
        public static Vector2 WarpClosedBoundaryPoint(Vector2 center, Vector2 edge, float t,
                                                      RegionWarp source)
        {
            if (IsZero(source)) return center + edge;
            return center + edge * (1f + SampleCyclicProfile(source, t));
        }

        public static Vector2 WarpClosedBoundaryPoint(Vector2 center, Vector2 edge, float t,
                                                      in RegionWarpProfile profile)
        {
            if (IsZero(profile)) return center + edge;
            return center + edge * (1f + SampleCyclicProfile(profile, t));
        }

        public static Vector2 WarpClosedBoundaryPoint(Vector2 center, Vector2 edge, float t,
                                                      bool anatomicalLeft,
                                                      in RegionWarpProfile profile)
        {
            if (IsZero(profile)) return center + edge;
            return center + edge * (1f + SampleCyclicAnatomicalProfile(profile, t, anatomicalLeft));
        }
    }

    /// <summary>RN sparse 배열 중 명시된 파일럿만 교체한다. 누락은 직전값 유지.</summary>
    public sealed class RegionWarpState
    {
        public RegionWarp Eyeshadow { get; private set; } =
            RegionWarpUtility.Sanitize(new RegionWarp { region = "eyeshadow" });
        public RegionWarp Blush { get; private set; } =
            RegionWarpUtility.Sanitize(new RegionWarp { region = "blush" });

        public void ApplySparse(RegionWarp[] entries)
        {
            if (entries == null || entries.Length == 0) return;
            foreach (var entry in entries)
            {
                if (entry == null) continue;
                var sanitized = RegionWarpUtility.Sanitize(entry);
                if (sanitized.region == "eyeshadow") Eyeshadow = sanitized;
                else if (sanitized.region == "blush") Blush = sanitized;
            }
        }
    }

    /// <summary>드래그 중 최신 블러셔만 보존하고 재베이크를 120ms 간격으로 제한한다.</summary>
    public sealed class RegionWarpRebakeQueue
    {
        public const float IntervalSeconds = 0.120f;
        RegionWarp _pending;
        float _lastConsumedAt = float.NegativeInfinity;

        public void Submit(RegionWarp source, float now)
        {
            _pending = RegionWarpUtility.Sanitize(source);
        }

        public bool TryConsume(float now, out RegionWarp warp)
        {
            warp = null;
            if (_pending == null || now - _lastConsumedAt + 1e-6f < IntervalSeconds)
                return false;
            warp = _pending;
            _pending = null;
            _lastConsumedAt = now;
            return true;
        }
    }
}
