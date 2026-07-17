using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// 코너 고정 3차식 아크 피팅 — LowerLidRenderer.FitArc(0f63e2c, 실기기 검증)의
    /// 재사용 일반화. lash 라인 점들(코너→코너)의 현(chord) 수직 성분을
    /// v(u) = k0·u(1−u) + k1·u²(1−u) 최소제곱 아크로 교체한다.
    ///
    /// u=0,1(코너)에서 v=0이라 눈머리·눈꼬리를 정확히 통과하고(타 라인과 접점 유지),
    /// 저차 곡선이라 꺾임이 불가능하며, 계수 EMA로 프레임 간 평활 — 점별 독립 수직
    /// 지터가 9점 최소제곱 평균으로 상쇄된다. 눈 랜드마크는 상류 핀 블렌드가 잔여지연
    /// 큰(=노이즈 큰) 점일수록 raw를 통과시켜 필터를 덜 받으므로, 가늘고 대비 높은
    /// 라인(아이라이너)에선 이 모양 단위 안정화가 필수다.
    ///
    /// 인스턴스 하나 = 눈 하나(계수 EMA 상태 보유). 이미지 정규화 좌표 기준
    /// (LowerLidRenderer와 동일 — 등방 보정 없이도 피팅 기저로 충분, 실기기 검증).
    /// </summary>
    public class LidArcFit
    {
        readonly float _ema;
        float[] _u = new float[16]; // 점별 현 투영 위치(재작성용 스크래치, 필요 시 확장)
        float _k0, _k1;
        bool _primed;
        // 애교살 SDF(3d71a28) — 마지막 Apply가 확정한 기준 프레임·계수. 셰이더가 정점
        // 로컬 좌표에서 같은 곡선 v(u)=k0·u(1−u)+k1·u²(1−u)을 재구성해 픽셀당 수직거리를
        // 재려면 프레임(코너 원점·현축·아래축)과 길이·계수가 필요하다(LowerLidRenderer 선례).
        Vector2 _fitInner, _fitXAxis, _fitYAxis;
        float _fitLen;

        /// <summary>피팅 곡선 계수(EMA 후) — v(u)=K0·u(1−u)+K1·u²(1−u).</summary>
        public float K0 => _k0;
        public float K1 => _k1;
        /// <summary>안쪽 코너(현 원점, 이미지 정규화 좌표).</summary>
        public Vector2 Inner => _fitInner;
        /// <summary>현축(안쪽→바깥 단위 벡터)·아래축(피부 방향 v&gt;0 단위 벡터).</summary>
        public Vector2 XAxis => _fitXAxis;
        public Vector2 YAxis => _fitYAxis;
        /// <summary>현 길이 L(눈폭, 이미지 단위) — SDF t=localX/L 정규화 분모.</summary>
        public float ChordLength => _fitLen;

        /// <param name="emaAlpha">계수 시간 평활(낮을수록 안정·반응 느림).
        /// 랜드마크가 이미 상류 필터링돼 있어 0.4면 충분(LowerLidRenderer.FitEma).</param>
        public LidArcFit(float emaAlpha) => _ema = emaAlpha;

        /// <summary>얼굴 소실/미사용 구간에서 호출 — 재획득 시 다른 위치·스케일의
        /// 스테일 계수에서 EMA가 출발하는 것 방지(하안검 _fitPrimed 규약).</summary>
        public void Reset() => _primed = false;

        /// <summary>
        /// pts[0..n-1]의 안쪽 점들(1..n-2)을 피팅된 아크 위로 제자리 교체한다.
        /// 각 점은 자기 현 투영 u를 유지하므로 점 간격(앞머리 조밀)이 보존되고,
        /// 끝 두 점(코너)은 변하지 않는다. upHint = yAxis 부호 고정 기준 — 프레임 간
        /// 계수 부호가 안 뒤집히게 하는 안정적 수직 방향(눈썹 방향)이면 된다.
        /// </summary>
        public void Apply(Vector2[] pts, int n, Vector2 upHint)
        {
            if (_u.Length < n) _u = new float[n]; // 긴 체인도 안전(호출부는 9점)
            var inner = pts[0];
            var outer = pts[n - 1];
            var chord = outer - inner;
            var len = chord.magnitude;
            if (len < 1e-6f)
            {
                // 축퇴 폴백 — SDF 기준 프레임을 안전값으로 채운다(셰이더 Lc·Troll 클램프로 무해).
                _fitInner = inner; _fitXAxis = Vector2.right;
                _fitYAxis = upHint.sqrMagnitude > 1e-12f ? upHint.normalized : Vector2.up;
                _fitLen = 1e-5f;
                return;
            }
            var xAxis = chord / len;
            var yAxis = new Vector2(-xAxis.y, xAxis.x);
            if (Vector2.Dot(yAxis, upHint) < 0f) yAxis = -yAxis;

            // 정규방정식 [[a00 a01][a01 a11]]·[k0 k1]ᵀ = [r0 r1]ᵀ (φ0=u(1−u), φ1=u²(1−u))
            float a00 = 0f, a01 = 0f, a11 = 0f, r0 = 0f, r1 = 0f;
            for (var j = 0; j < n; j++)
            {
                var rel = pts[j] - inner;
                var u = Mathf.Clamp01(Vector2.Dot(rel, xAxis) / len);
                var v = Vector2.Dot(rel, yAxis);
                _u[j] = u;
                var p0 = u * (1f - u);
                var p1 = u * u * (1f - u);
                a00 += p0 * p0; a01 += p0 * p1; a11 += p1 * p1;
                r0 += p0 * v; r1 += p1 * v;
            }
            var det = a00 * a11 - a01 * a01;
            float k0 = 0f, k1 = 0f;
            if (Mathf.Abs(det) > 1e-12f)
            {
                k0 = (a11 * r0 - a01 * r1) / det;
                k1 = (a00 * r1 - a01 * r0) / det;
            }

            if (!_primed)
            {
                _primed = true;
                _k0 = k0;
                _k1 = k1;
            }
            else
            {
                _k0 = Mathf.Lerp(_k0, k0, _ema);
                _k1 = Mathf.Lerp(_k1, k1, _ema);
            }

            // SDF 기준 프레임 확정(EMA 계수와 동일 프레임) — 셰이더가 이 곡선을 재구성.
            _fitInner = inner; _fitXAxis = xAxis; _fitYAxis = yAxis; _fitLen = len;

            for (var j = 1; j < n - 1; j++)
            {
                var u = _u[j];
                var v = _k0 * u * (1f - u) + _k1 * u * u * (1f - u);
                var arc = inner + xAxis * (u * len) + yAxis * v;

                // 코너 근처는 원래 랜드마크로 복귀, 중앙만 아크 100%. 코너 고정 3차식은
                // u→0,1에서 현(chord)으로 수렴하는데 실제 lash 라인은 앞머리·눈꼬리에서도
                // 위로 볼록하다 — 그대로 쓰면 아크가 코너를 현 쪽으로 끌어내려 눈 안쪽을
                // 가린다(앞머리 처짐). 블링크 수직 지터는 중앙 lid에서 최대라 안정화는
                // 중앙에만 필요하고, 코너 랜드마크는 해부학적으로 안정적이라 raw로 둬도
                // 안 떨린다. d=코너까지 u거리, edge=0.4 위에서 전부 아크.
                var d = Mathf.Min(u, 1f - u);
                var w = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(d / 0.4f));
                pts[j] = Vector2.Lerp(pts[j], arc, w);
            }
        }
    }
}
