using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// R7 명명 워프 — 눈썹 두께/길이/아치. 실제 상·하 랜드마크 간격을 측정 두께로 삼고,
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
        public const int BandArcPoints = 5;
        public const int BandSubdivisions = 3;
        public const int BandSegments = (BandArcPoints - 1) * (BandSubdivisions + 1) + 1;
        // ── 모양 프리셋 강도(밴드 높이 h 배수, 실기기 튜닝 대상) ────────────────
        // 상·하단 이동을 마지막에 평균내던 구 수식은 아치와 반달의 최종 중심선 차이가
        // 0.05h뿐이라 실제 사진에서 거의 같은 모양으로 보였다. 모양은 중심선 이동과
        // 국소 폭을 직접 정의한다. 즉, thickness=1/arch=0에서도 여섯 실루엣이 독립적이다.
        const float StraightCenterDrop = 0.34f;
        const float StraightCenterWidthLoss = 0.16f;
        const float ArchCenterPeak = 0.62f;
        const float ArchPeakWidthGain = 0.10f;
        const float MoonCenterPeak = 0.42f;
        const float MoonPeakWidthGain = 0.05f;
        const float AngularCenterPeak = 0.78f;
        const float AngularPeakWidthGain = 0.16f;
        const float AngularPos = 0.62f;
        const float AngularSharp = 5.2f;
        const float RiseCenterPeak = 0.76f;
        const float RiseTailWidthLoss = 0.12f;
        // 실제 눈썹 중심선은 사람마다 이미 아치가 있어, 밴드 높이만큼 국소 이동하는
        // ShapeBand만으로는 "일자"도 원래 아치를 그대로 따라가고 아치/반달끼리 겹친다.
        // 아래 전역 프로필은 꼬리↔앞머리 chord를 기준으로 중심선을 재구성한다. 진폭은
        // 눈썹 가로 길이 비율이라 원근·얼굴 크기에 안정적이고, 원본과 85~92% 블렌드해
        // 얼굴 고유 비대칭과 표정을 완전히 지우지 않는다.
        const float StraightProfileBlend = 0.92f;
        const float ArchProfileBlend = 0.88f;
        const float AngularProfileBlend = 0.90f;
        const float RiseProfileBlend = 0.88f;
        const float MoonProfileBlend = 0.86f;
        // 실제 얼굴의 내추럴 아치가 이미 약 0.10 span인 경우에도 아치 프리셋이
        // 원본과 겹치지 않도록 그보다 한 단계 높은 넓은 피크를 사용한다.
        const float ArchProfileHeight = 0.175f;
        const float AngularProfileHeight = 0.180f;
        const float RiseProfileHeight = 0.070f;
        const float MoonProfileHeight = 0.040f;

        // ── 과변형·퇴화 가드 ────────────────────────────────────────────────
        const float MaxEdgeShift = 0.55f;      // 엣지별 이동 상한(밴드 높이 배수)
        const float GeometryEpsilon = 1e-6f;   // 정규화/나눗셈 가능한 최소 길이
        const float MinimumFinalBandSpan = 0.15f;
        const float MaximumLowerCoverage = 0.55f;

        // ── 꼬리 안티-드룹(전역, 모든 shape 공통) ─────────────────────────────
        // 미용 규칙: 눈썹 꼬리 끝(바깥·along 0)은 앞머리(안쪽·along 1) 높이 이상에서
        // 끝나야 한다(처진 눈썹 불가). WarpAndLiftDroopingTail가 ShapeBand와 꼬리 폭 테이퍼 적용
        // 후 얹는 가드로 이를 강제한다. 이미 목표 floor보다 높은 shape(상승 등)는 no-op.
        // 안티 드룹은 모든 모양을 강제로 상승형으로 바꾸지 않고 실제 처짐만 막는 안전망이다.
        // 상승 프리셋의 큰 꼬리 리프트는 ShapeBand가 전담한다.
        const float AntiDroopHeadMargin = 0.10f;
        const float AntiDroopFullRegion = 0.18f;
        const float AntiDroopTailRegion = 0.55f;
        // 꼬리 길이 — arc[0](꼬리) 제어점을 브로우 축(arc[0]-arc[1]) 방향으로 외삽해 눈썹을
        // 길게. SubdivideArc가 전 브로우 렌더러 공유라 호출부 변경 없이 일관 적용.
        // 목표점 = 미용 규칙선(콧볼 alar → 눈꼬리 outer corner 연장선). 브로우 축 위에서
        // 그 선과 만나는 지점까지만 전진하므로(축 밖 이동 아님) Catmull-Rom·꼬리 테이퍼와
        // 합쳐지면 스파이크가 아니라 자연 테이퍼로 규칙선에 닿는다. 연장량은 꼬리 세그먼트
        // 길이 배수로 상·하한 클램프 — 과연장(스파이크)·무연장(뭉툭)을 모두 방지. 실기기 튜닝 대상.
        const float TailExtendMin = 0.30f;
        const float TailExtendMax = 0.85f;
        const float TailRuleFallback = 0.45f;
        // 사용자가 요청한 길이 보정은 꼬리 쪽에만 적용한다. 앞머리 랜드마크는 고정.
        const float HeadExtend = 0f;
        const int EyeOuterCornerRight = 33;      // MediaPipe 눈꼬리(오른쪽)
        const int EyeOuterCornerLeft = 263;      // MediaPipe 눈꼬리(왼쪽)
        const int AlarRight = 129;               // MediaPipe 콧볼(오른쪽)
        const int AlarLeft = 358;                // MediaPipe 콧볼(왼쪽)
        const int FaceUpForeheadLandmark = 10;   // 안정 얼굴축 상단(MediaPipe forehead top)
        const int FaceUpChinLandmark = 152;      // 안정 얼굴축 하단(MediaPipe chin)

        // ── 꼬리 폭 테이퍼(밴드 채움·텍스처·가이드 공통) ─────────────────────
        const float TailTaperRegion = 0.50f;
        const float TailTaperStrength = 1.25f;
        const float TailTipMinimumWidth = 0.08f;
        public const int LegacyProfile = 0;
        // Reference eyebrow PNGs already contain their own straight/semi-arch/round
        // silhouette. They must be placed on a locally planar UV band instead of being
        // bent a second time along the landmark arcs.
        // 레퍼런스 알파 눈썹은 앞머리 쪽 현재 위치를 유지하고 꼬리 쪽으로만 소폭 더
        // 연장한다. 앞머리 위치는 0으로 고정하고 꼬리만 0.07 연장한다. 두께는 길이와
        // 독립적으로 1.14를 적용해 기존(1.10)보다 약 4%만 두껍게 보이도록 한다.
        public const float ReferenceMaskHeadExtension = 0f;
        public const float ReferenceMaskTailExtension = 0.07f;
        public const float ReferenceMaskThicknessScale = 1.14f;
        // Basic mode exposes a deliberately broad 10x silhouette spectrum. Keep these
        // limits shared by every brow renderer so style, products and guide never drift.
        public const float ThicknessMin = 0.25f;
        public const float ThicknessMax = 2.5f;
        // 눈썹머리는 고정하고 꼬리 방향의 접선 거리만 조절한다. 세로 곡률과 두께는
        // 그대로라 두께/아치 슬라이더와 서로 간섭하지 않는다.
        public const float LengthMin = 0.65f;
        public const float LengthMax = 1.6f;

        // 0 is deliberately absent from these tables: profile 0 takes the byte-compatible
        // legacy path.  The other profiles are anatomical coverage choices, not face warps.
        // Values are measured-band multiples and are clamped below before use.
        static readonly float[] TailTipMinimumWidths = { 0.08f, 0.16f, 0.26f, 0.34f, 0.38f, 0.32f, 0.30f };

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

            // 모양 프리셋 — 최종 재구성에서 사라지지 않도록 중심선과 국소 폭을 직접 정의.
            // centerK > 0 = 위로, widthK=1 = 원래 폭.
            var centerK = 0f;
            var widthK = 1f;
            if (shape == 1) // 일자 — 중앙을 낮추고 얇게 눌러 수평 바 실루엣
            {
                var midH = 1f - Mathf.Abs(along * 2f - 1f);
                centerK -= StraightCenterDrop * midH;
                widthK -= StraightCenterWidthLoss * midH;
            }
            else if (shape == 2) // 아치 — 중앙의 좁고 높은 삼각 피크
            {
                var peak = Mathf.Clamp01(1f - Mathf.Abs(along - 0.52f) * 3.2f);
                centerK += ArchCenterPeak * peak;
                widthK += ArchPeakWidthGain * peak;
            }
            else if (shape == 3) // 각진 — 앞 1/3에 더 좁고 높은 코너
            {
                var peak = Mathf.Clamp01(1f - Mathf.Abs(along - AngularPos) * AngularSharp);
                centerK += AngularCenterPeak * peak;
                widthK += AngularPeakWidthGain * peak;
            }
            else if (shape == 4) // 상승 — 꼬리로 갈수록 중심선 전체를 위로
            {
                var tail = 1f - along;
                var lift = Mathf.Pow(tail, 1.35f);
                centerK += RiseCenterPeak * lift;
                widthK -= RiseTailWidthLoss * lift;
            }
            else if (shape == 5) // 반달 — 넓고 둥근 sin 돔
            {
                var dome = Mathf.Sin(along * Mathf.PI);
                centerK += MoonCenterPeak * dome;
                widthK += MoonPeakWidthGain * dome;
            }

            // 최종 폭 불변식: up-lo == 원본 measuredBand * thickness. shape/arch가 만든
            // 중심선 주위로 재구성하되 프리셋의 국소 폭 차이는 보존한다.
            centerK = Mathf.Clamp(centerK, -MaxEdgeShift, 0.85f);
            widthK = Mathf.Clamp(widthK, 0.72f, 1.22f);
            var shapedCenter = 0.5f * (shapedLo + shapedUp) +
                               n * (measuredH * centerK);
            var halfBand = 0.5f * measuredBand * thickness * widthK;
            lo = shapedCenter - halfBand;
            up = shapedCenter + halfBand;
        }

        /// <summary>
        /// 눈썹 전체 중심선을 꼬리→앞머리 chord 기준의 실제 모양으로 재구성한다.
        /// ShapeBand의 국소 폭 보정 전에 한 번 호출한다. shape 0은 byte-compatible no-op.
        /// 배열은 아래/위 아크의 같은 along 샘플이어야 하며 이미지 좌표(원점 좌상단)를 쓴다.
        /// </summary>
        public static void ShapeArcProfile(
            Vector2[] lo, Vector2[] up, int count, int shape, float imageAspect)
        {
            if (shape == 0 || lo == null || up == null || count < 2 ||
                lo.Length < count || up.Length < count ||
                !IsFinite(imageAspect) || imageAspect <= GeometryEpsilon)
                return;

            var normalSum = Vector2.zero;
            for (var i = 0; i < count; i++)
            {
                if (!IsFinite(lo[i]) || !IsFinite(up[i])) return;
                normalSum += up[i] - lo[i]; // 실제 하단→상단(화면 위) 방향
            }
            if (normalSum.sqrMagnitude < GeometryEpsilon * GeometryEpsilon) return;
            var normal = normalSum.normalized;

            var tail = 0.5f * (lo[0] + up[0]);
            var head = 0.5f * (lo[count - 1] + up[count - 1]);
            var span = Mathf.Abs(head.x - tail.x);
            if (span < GeometryEpsilon)
            {
                var delta = head - tail;
                span = Mathf.Sqrt(delta.x * delta.x +
                                  delta.y * delta.y / (imageAspect * imageAspect));
            }
            if (!IsFinite(span) || span < GeometryEpsilon) return;

            for (var i = 0; i < count; i++)
            {
                var along = i / (float)(count - 1);
                var rawCenter = 0.5f * (lo[i] + up[i]);
                var chord = Vector2.Lerp(tail, head, along);
                var curve = 0f;
                var blend = 1f;
                var widthScale = 1f;

                switch (shape)
                {
                    case 1: // 일자 — 원래 아치를 chord로 펴되 얼굴 비대칭은 8% 남김
                        blend = StraightProfileBlend;
                        widthScale = 1f - 0.10f *
                            (1f - Mathf.Abs(along * 2f - 1f));
                        break;
                    case 2: // 아치 — 중심보다 살짝 앞머리 쪽의 부드러운 피크
                    {
                        const float peakAt = 0.56f;
                        var peak = along <= peakAt
                            ? along / peakAt
                            : (1f - along) / (1f - peakAt);
                        peak = Mathf.Clamp01(peak);
                        curve = ArchProfileHeight * span * Mathf.SmoothStep(0f, 1f, peak);
                        blend = ArchProfileBlend;
                        widthScale = 1f + 0.06f * peak;
                        break;
                    }
                    case 3: // 각진 — 동일 위치의 좁고 명확한 꺾임
                    {
                        const float peakAt = 0.60f;
                        var peak = along <= peakAt
                            ? along / peakAt
                            : (1f - along) / (1f - peakAt);
                        peak = Mathf.Pow(Mathf.Clamp01(peak), 4f);
                        curve = AngularProfileHeight * span * peak;
                        blend = AngularProfileBlend;
                        widthScale = 1f + 0.12f * peak;
                        break;
                    }
                    case 4: // 상승 — 꼬리를 올리고 앞머리로 갈수록 자연스럽게 수렴
                    {
                        var tailLift = Mathf.Pow(1f - along, 1.35f);
                        curve = RiseProfileHeight * span * tailLift;
                        blend = RiseProfileBlend;
                        widthScale = 1f - 0.08f * tailLift;
                        break;
                    }
                    case 5: // 반달 — 폭이 넓고 꼭짓점이 없는 sin 곡선
                    {
                        var dome = Mathf.Sin(along * Mathf.PI);
                        curve = MoonProfileHeight * span * dome;
                        blend = MoonProfileBlend;
                        widthScale = 1f + 0.04f * dome;
                        break;
                    }
                    default:
                        continue;
                }

                var targetCenter = chord + normal * curve;
                var center = Vector2.Lerp(rawCenter, targetCenter, blend);
                var halfBand = 0.5f * (up[i] - lo[i]) * widthScale;
                lo[i] = center - halfBand;
                up[i] = center + halfBand;
            }
        }

        /// <summary>
        /// Builds a face-anchored rectangular UV band for a pre-shaped eyebrow texture.
        /// The landmark samples decide placement, roll and depth (depth is handled by the
        /// renderer), while the PNG alpha decides the visible silhouette. This avoids the
        /// previous double warp where every supplied asset inherited the same landmark arch.
        /// </summary>
        public static bool BuildReferenceTextureBand(
            Vector2[] lo, Vector2[] up, int count, float imageAspect,
            float textureAspect, float thickness, float length = 1f)
        {
            if (lo == null || up == null || count < 2 ||
                lo.Length < count || up.Length < count ||
                !IsFinite(imageAspect) || imageAspect <= GeometryEpsilon ||
                !IsFinite(textureAspect) || textureAspect <= GeometryEpsilon ||
                !IsFinite(thickness) || !IsFinite(length))
                return false;

            var normalSumMetric = Vector2.zero;
            var centerSumMetric = Vector2.zero;
            for (var i = 0; i < count; i++)
            {
                if (!IsFinite(lo[i]) || !IsFinite(up[i])) return false;
                var loMetric = ToMetric(lo[i], imageAspect);
                var upMetric = ToMetric(up[i], imageAspect);
                normalSumMetric += upMetric - loMetric;
                centerSumMetric += 0.5f * (loMetric + upMetric);
            }

            var tailCenter = 0.5f * (ToMetric(lo[0], imageAspect) +
                                     ToMetric(up[0], imageAspect));
            var headCenter = 0.5f * (ToMetric(lo[count - 1], imageAspect) +
                                     ToMetric(up[count - 1], imageAspect));
            var axis = headCenter - tailCenter;
            var span = axis.magnitude;
            if (!IsFinite(span) || span < GeometryEpsilon ||
                normalSumMetric.sqrMagnitude < GeometryEpsilon * GeometryEpsilon)
                return false;

            var tangent = axis / span;
            var normal = new Vector2(-tangent.y, tangent.x);
            if (Vector2.Dot(normal, normalSumMetric) < 0f) normal = -normal;

            // Keep the chord centred on the measured eyebrow so a naturally arched face
            // does not push the whole asset upward. Only the alpha inside this band bends.
            var measuredCenter = centerSumMetric / count;
            var chordCenter = 0.5f * (tailCenter + headCenter);
            var placementOffset = measuredCenter - chordCenter;
            tailCenter += placementOffset;
            headCenter += placementOffset;

            var clampedLength = Mathf.Clamp(length, LengthMin, LengthMax);
            var scaledSpan = span * clampedLength;
            tailCenter = headCenter - tangent * scaledSpan;
            tailCenter -= tangent * (scaledSpan * ReferenceMaskTailExtension);
            headCenter += tangent * (scaledSpan * ReferenceMaskHeadExtension);

            var bandHeight = span * ReferenceMaskThicknessScale * textureAspect *
                             Mathf.Clamp(thickness, ThicknessMin, ThicknessMax);
            if (!IsFinite(bandHeight) || bandHeight < GeometryEpsilon) return false;
            var halfBand = normal * (0.5f * bandHeight);

            for (var i = 0; i < count; i++)
            {
                var along = i / (float)(count - 1);
                var center = Vector2.Lerp(tailCenter, headCenter, along);
                lo[i] = FromMetric(center - halfBand, imageAspect);
                up[i] = FromMetric(center + halfBand, imageAspect);
            }
            return true;
        }

        /// <summary>
        /// 눈썹머리(count-1)를 고정하고 꼬리 방향의 접선 성분만 length배 한다.
        /// 수직 곡률과 상·하 밴드 폭은 보존하므로 길이가 두께나 아치를 바꾸지 않는다.
        /// </summary>
        public static bool ScaleLengthFromHead(
            Vector2[] lo, Vector2[] up, int count, float imageAspect, float length)
        {
            if (lo == null || up == null || count < 2 ||
                lo.Length < count || up.Length < count ||
                !IsFinite(imageAspect) || imageAspect <= GeometryEpsilon ||
                !IsFinite(length))
                return false;

            var tail = 0.5f * (ToMetric(lo[0], imageAspect) +
                               ToMetric(up[0], imageAspect));
            var head = 0.5f * (ToMetric(lo[count - 1], imageAspect) +
                               ToMetric(up[count - 1], imageAspect));
            var axis = head - tail;
            var span = axis.magnitude;
            if (!IsFinite(span) || span < GeometryEpsilon) return false;

            var tangent = axis / span;
            var clampedLength = Mathf.Clamp(length, LengthMin, LengthMax);
            for (var i = 0; i < count; i++)
            {
                if (!IsFinite(lo[i]) || !IsFinite(up[i])) return false;
                var loMetric = ToMetric(lo[i], imageAspect);
                var upMetric = ToMetric(up[i], imageAspect);
                var center = 0.5f * (loMetric + upMetric);
                var halfBand = 0.5f * (upMetric - loMetric);
                var fromHead = center - head;
                var stretchedCenter =
                    head +
                    tangent * (Vector2.Dot(fromHead, tangent) * clampedLength) +
                    (fromHead - tangent * Vector2.Dot(fromHead, tangent));
                lo[i] = FromMetric(stretchedCenter - halfBand, imageAspect);
                up[i] = FromMetric(stretchedCenter + halfBand, imageAspect);
            }
            return true;
        }

        /// <summary>All brow renderers use this exact Catmull-Rom landmark subdivision.
        /// Keeping it here prevents the guide from drifting onto a five-point approximation.</summary>
        public static void SubdivideArc(Vector3[] landmarks, int[] arc, Vector2[] output)
        {
            if (landmarks == null || arc == null || output == null || arc.Length != BandArcPoints ||
                output.Length < BandSegments) return;
            // 꼬리(arc[0]) 제어점을 브로우 축 방향으로 외삽해 미용 규칙선(콧볼→눈꼬리 연장선)에
            // 닿게 한다(사용자 요청: 더 길게 + 꼬리는 규칙선에서 끝). 앞머리(arc[last])는 그대로.
            var tailExt = ComputeTailExtension(landmarks, arc[0], arc[1]);
            var head = LandmarkPoint(landmarks, arc[arc.Length - 1]);
            var beforeHead = LandmarkPoint(landmarks, arc[arc.Length - 2]);
            var headExt = head + (head - beforeHead) * HeadExtend;
            var mi = 0;
            for (var i = 0; i < arc.Length - 1; i++)
            {
                var p1 = i == 0 ? tailExt : LandmarkPoint(landmarks, arc[i]);
                var p2 = i + 1 == arc.Length - 1
                    ? headExt
                    : LandmarkPoint(landmarks, arc[i + 1]);
                var p0 = i == 0 ? tailExt : LandmarkPoint(landmarks, arc[i - 1]);
                var p3 = i + 2 >= arc.Length - 1
                    ? headExt
                    : LandmarkPoint(landmarks, arc[i + 2]);
                output[mi++] = p1;
                for (var k = 1; k <= BandSubdivisions; k++)
                    output[mi++] = CatmullRom(p0, p1, p2, p3, k / (float)(BandSubdivisions + 1));
            }
            output[mi] = headExt;
        }

        /// <summary>
        /// SubdivideArc와 같은 파라미터 위치의 MediaPipe z를 만든다. BrowRenderer가 한 눈썹을
        /// 단일 깊이 평면에 놓지 않고 이 값을 정점별로 사용해 이마 곡면을 따라가게 한다.
        /// </summary>
        public static void SubdivideArcDepth(Vector3[] landmarks, int[] arc, float[] output)
        {
            if (landmarks == null || arc == null || output == null || arc.Length != BandArcPoints ||
                output.Length < BandSegments) return;

            var tail = LandmarkPoint(landmarks, arc[0]);
            var inner = LandmarkPoint(landmarks, arc[1]);
            var tailExt = ComputeTailExtension(landmarks, arc[0], arc[1]);
            var baseLength = (tail - inner).magnitude;
            var tailRatio = baseLength < GeometryEpsilon ? 0f : (tailExt - tail).magnitude / baseLength;
            var tailZ = landmarks[arc[0]].z +
                        (landmarks[arc[0]].z - landmarks[arc[1]].z) * tailRatio;

            var last = arc.Length - 1;
            var headZ = Mathf.LerpUnclamped(
                landmarks[arc[last - 1]].z, landmarks[arc[last]].z, 1f + HeadExtend);
            var mi = 0;
            for (var i = 0; i < last; i++)
            {
                var p1 = i == 0 ? tailZ : landmarks[arc[i]].z;
                var p2 = i + 1 == last ? headZ : landmarks[arc[i + 1]].z;
                var p0 = i == 0 ? tailZ : landmarks[arc[i - 1]].z;
                var p3 = i + 2 >= last ? headZ : landmarks[arc[i + 2]].z;
                output[mi++] = p1;
                for (var k = 1; k <= BandSubdivisions; k++)
                    output[mi++] = CatmullRom(p0, p1, p2, p3,
                        k / (float)(BandSubdivisions + 1));
            }
            output[mi] = headZ;
        }

        /// <summary>꼬리 제어점을 브로우 축(inner→tail) 방향으로 외삽해, 콧볼(alar)→눈꼬리(outer
        /// corner) 규칙선과 만나는 지점까지 늘린다. 축 밖 이동이 아니라 축 위 전진이라
        /// Catmull-Rom 스무딩·꼬리 테이퍼와 합쳐지면 스파이크가 아닌 자연 테이퍼가 된다.
        /// 연장량 s는 꼬리 세그먼트 길이 배수로 [TailExtendMin, TailExtendMax] 클램프(뭉툭·
        /// 스파이크 동시 방지·항상 양수 전진). 규칙선을 못 구하면(랜드마크 결측·평행) 고정
        /// 배수로 폴백한다. 좌/우 눈꼬리·콧볼은 꼬리와의 근접도로 골라 미러 규약에 무관하다.</summary>
        static Vector2 ComputeTailExtension(Vector3[] landmarks, int tailIndex, int innerIndex)
        {
            var tail = LandmarkPoint(landmarks, tailIndex);
            var inner = LandmarkPoint(landmarks, innerIndex);
            var axis = tail - inner;                 // 안쪽→꼬리(바깥 방향)
            var axisLen = axis.magnitude;
            if (!IsFinite(axis) || axisLen < GeometryEpsilon) return tail;
            var dir = axis / axisLen;

            // 같은 쪽 눈꼬리·콧볼을 꼬리와의 근접도로 선택(L/R 명명 무관).
            var cornerR = LandmarkPoint(landmarks, EyeOuterCornerRight);
            var cornerL = LandmarkPoint(landmarks, EyeOuterCornerLeft);
            var useRight = (tail - cornerR).sqrMagnitude <= (tail - cornerL).sqrMagnitude;
            var corner = useRight ? cornerR : cornerL;
            var alar = LandmarkPoint(landmarks, useRight ? AlarRight : AlarLeft);

            var rule = corner - alar;                // 규칙선 방향(콧볼→눈꼬리)
            var denom = Cross(dir, rule);
            float s;
            if (!IsFinite(corner) || !IsFinite(alar) ||
                corner == Vector2.zero || alar == Vector2.zero ||
                Mathf.Abs(denom) < GeometryEpsilon)
                s = axisLen * TailRuleFallback;      // 규칙선 불가 → 고정 연장
            else
                // tail + s*dir 가 alar·corner 직선 위에 오는 s: (tail+s·dir − alar) × rule = 0.
                s = -Cross(tail - alar, rule) / denom;

            if (!IsFinite(s)) s = axisLen * TailRuleFallback;
            s = Mathf.Clamp(s, axisLen * TailExtendMin, axisLen * TailExtendMax);
            return tail + dir * s;
        }

        static float Cross(Vector2 u, Vector2 v) => u.x * v.y - u.y * v.x;

        /// <summary>
        /// Anatomical thickness profiles. Profile 0 is intentionally the legacy entry point:
        /// omitted fields in saved looks retain exactly the former center-expanded band.
        /// Other profiles use the measured lower edge as a stable reference, then add an
        /// independently bounded lower cover. This is what lets the makeup cover real hairs
        /// below a conservative landmark band without moving the whole brow upward.
        /// </summary>
        public static void ShapeBand(
            ref Vector2 lo, ref Vector2 up, float along, float thickness, float arch, int shape,
            int thicknessProfile, float expandUpper, float expandLower)
        {
            if (thicknessProfile == LegacyProfile && expandUpper == 0f && expandLower == 0f)
            {
                ShapeBand(ref lo, ref up, along, thickness, arch, shape);
                return;
            }

            var measuredBand = up - lo;
            var measuredH = measuredBand.magnitude;
            var rawLower = lo;
            var rawUpper = up;
            if (!IsFinite(lo) || !IsFinite(up) || !IsFinite(along) || !IsFinite(thickness) ||
                !IsFinite(arch) || !IsFinite(expandUpper) || !IsFinite(expandLower) || !IsFinite(measuredH) ||
                measuredH < GeometryEpsilon)
                return;

            if (thicknessProfile == LegacyProfile)
            {
                ShapeBand(ref lo, ref up, along, thickness, arch, shape);
                var legacyNormal = measuredBand / measuredH;
                lo -= legacyNormal * (measuredH * Mathf.Clamp(expandLower, -0.25f, MaximumLowerCoverage));
                up += legacyNormal * (measuredH * Mathf.Clamp(expandUpper, -0.25f, 0.75f));
                ClampLowerCoverageEdge(ref lo, ref up, rawLower, rawUpper);
                EnsureMinimumSignedBand(ref lo, ref up, legacyNormal, measuredH);
                return;
            }

            // First calculate the old silhouette at a neutral width. This keeps the six
            // shape/arch rules identical; profile changes only the anatomical envelope.
            ShapeBand(ref lo, ref up, along, 1f, arch, shape);
            var center = 0.5f * (lo + up);
            var normal = measuredBand / measuredH;
            ResolveCoverageProfile(thicknessProfile, Mathf.Clamp01(along), out var widthK,
                out var upperK, out var lowerK);
            lowerK = Mathf.Clamp(lowerK + expandLower, -0.25f, MaximumLowerCoverage);
            upperK = Mathf.Clamp(upperK + expandUpper, -0.25f, 0.75f);
            var finalWidth = Mathf.Max(0.15f, thickness * widthK);

            // Width is intentionally asymmetric. `lowerK` is extra coverage below the
            // shaped lower edge; the remaining width grows toward the upper edge.
            var shapedLo = center - normal * (measuredH * 0.5f);
            lo = shapedLo - normal * (measuredH * lowerK);
            up = lo + normal * (measuredH * (finalWidth + lowerK + upperK));
            ClampLowerCoverageEdge(ref lo, ref up, rawLower, rawUpper);
            EnsureMinimumSignedBand(ref lo, ref up, normal, measuredH);
        }

        /// <summary>Caps the actual lower edge at rawLower−0.55H. If shape/profile shifts
        /// made it lower, translate the whole band upward so its intended span is retained.</summary>
        public static void ClampLowerCoverageEdge(ref Vector2 lo, ref Vector2 up,
                                                  Vector2 rawLower, Vector2 rawUpper)
        {
            var rawBand = rawUpper - rawLower;
            var rawH = rawBand.magnitude;
            if (!IsFinite(lo) || !IsFinite(up) || !IsFinite(rawLower) || !IsFinite(rawUpper) ||
                !IsFinite(rawH) || rawH < GeometryEpsilon) return;
            var normal = rawBand / rawH;
            var cap = rawLower - normal * (rawH * MaximumLowerCoverage);
            var belowCap = Vector2.Dot(lo - cap, normal);
            if (belowCap >= 0f) return;
            var correction = normal * -belowCap;
            lo += correction;
            up += correction;
        }

        /// <summary>Shader feather needs the same logical lower coverage as geometry.
        /// A uniform cannot vary along the brow, so it uses the canonical mid-band sample.</summary>
        public static float EffectiveLowerCoverage(int thicknessProfile, float expandLower)
        {
            var lower = expandLower;
            if (thicknessProfile != LegacyProfile)
            {
                ResolveCoverageProfile(thicknessProfile, 0.5f, out _, out _, out var profileLower);
                lower += profileLower;
            }
            return Mathf.Clamp(lower, -0.25f, MaximumLowerCoverage);
        }

        public static bool IsCoverageActive(int thicknessProfile, float expandUpper, float expandLower) =>
            thicknessProfile != LegacyProfile || expandUpper != 0f || expandLower != 0f;

        static void ResolveCoverageProfile(int profile, float along, out float widthK,
                                           out float upperK, out float lowerK)
        {
            // along: tail 0 -> head 1. Deliberately analytic/no allocation in LateUpdate.
            var tail = 1f - along;
            var center = 1f - Mathf.Abs(2f * along - 1f);
            switch (Mathf.Clamp(profile, 1, 6))
            {
                case 1: // slim
                    widthK = 0.86f; upperK = 0.03f; lowerK = 0.10f; break;
                case 2: // regular
                    widthK = 1.12f; upperK = 0.08f; lowerK = 0.22f; break;
                case 3: // full
                    widthK = 1.30f + center * 0.10f; upperK = 0.12f; lowerK = 0.32f; break;
                case 4: // bold
                    widthK = 1.52f; upperK = 0.10f; lowerK = 0.42f; break;
                case 5: // headFull: front/inner head (along=1) gets the body mass
                    widthK = 1.04f + along * 0.40f; upperK = 0.08f + along * 0.12f;
                    lowerK = 0.18f + along * 0.22f; break;
                default: // bodyFull: central belly is full while the tail/head remain clean
                    widthK = 1.16f + center * 0.42f; upperK = 0.12f + center * 0.10f;
                    lowerK = 0.24f + center * 0.20f; break;
            }
        }

        static void EnsureMinimumSignedBand(ref Vector2 lo, ref Vector2 up, Vector2 normal, float measuredH)
        {
            var span = Vector2.Dot(up - lo, normal);
            var minimum = measuredH * MinimumFinalBandSpan;
            if (!IsFinite(span) || !IsFinite(minimum) || span >= minimum) return;
            // Preserve the anatomical lower-cover edge; only lift/extend the upper edge.
            up = lo + normal * minimum;
        }

        /// <summary>Call after tail taper. The raw landmark pair supplies the anatomical
        /// normal/height so the final visible band cannot collapse below 0.15H.</summary>
        public static void EnsureMinimumFinalBandSpan(ref Vector2 lo, ref Vector2 up,
                                                      Vector2 rawLo, Vector2 rawUp)
        {
            var rawBand = rawUp - rawLo;
            var rawH = rawBand.magnitude;
            if (!IsFinite(rawLo) || !IsFinite(rawUp) || !IsFinite(rawH) || rawH < GeometryEpsilon)
                return;
            EnsureMinimumSignedBand(ref lo, ref up, rawBand / rawH, rawH);
        }

        /// <summary>Anti-droop may lift a coverage tail. Restore its promised lower edge
        /// along the anatomical band normal, translating the upper edge with it.</summary>
        public static void RestoreCoverageLowerFloor(ref Vector2 lo, ref Vector2 up,
                                                     Vector2 targetLower, Vector2 rawLo, Vector2 rawUp,
                                                     bool alreadyWarped)
        {
            if (alreadyWarped)
            {
                var warp = FaceWarpField.Instance;
                targetLower = ForwardWarp(targetLower, warp);
                rawLo = ForwardWarp(rawLo, warp);
                rawUp = ForwardWarp(rawUp, warp);
            }
            RestoreCoverageLowerFloorInSpace(ref lo, ref up, targetLower, rawLo, rawUp);
        }

        /// <summary>Restores the promised lower cover when every argument is already in
        /// one coordinate space. Kept separate so the production warp boundary cannot
        /// accidentally mix raw anatomical points with final display-space geometry.</summary>
        public static void RestoreCoverageLowerFloorInSpace(ref Vector2 lo, ref Vector2 up,
                                                            Vector2 targetLower, Vector2 rawLo,
                                                            Vector2 rawUp)
        {
            var rawBand = rawUp - rawLo;
            var rawH = rawBand.magnitude;
            if (!IsFinite(lo) || !IsFinite(up) || !IsFinite(targetLower) ||
                !IsFinite(rawH) || rawH < GeometryEpsilon) return;
            var normal = rawBand / rawH;
            var lifted = Vector2.Dot(lo - targetLower, normal);
            if (lifted <= 0f) return;
            var correction = normal * lifted;
            lo -= correction;
            up -= correction;
        }

        static Vector2 LandmarkPoint(Vector3[] landmarks, int index)
        {
            if (index < 0 || index >= landmarks.Length) return Vector2.zero;
            var point = landmarks[index];
            return new Vector2(point.x, point.y);
        }

        static Vector2 CatmullRom(Vector2 p0, Vector2 p1, Vector2 p2, Vector2 p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
        }

        static float CatmullRom(float p0, float p1, float p2, float p3, float t)
        {
            var t2 = t * t;
            var t3 = t2 * t;
            return 0.5f * (2f * p1 + (p2 - p0) * t
                + (2f * p0 - 5f * p1 + 4f * p2 - p3) * t2
                + (3f * p1 - p0 - 3f * p2 + p3) * t3);
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

        /// <summary>Profile-aware tail taper. Legacy profile keeps the exact prior formula.
        /// Coverage profiles retain enough physical band at the tail to hide lower stray hair.</summary>
        public static void TaperTail(ref Vector2 lo, ref Vector2 up, float along, int thicknessProfile)
        {
            if (thicknessProfile == LegacyProfile)
            {
                TaperTail(ref lo, ref up, along);
                return;
            }
            var clampedAlong = Mathf.Clamp01(along);
            var t = Mathf.Clamp01(clampedAlong / TailTaperRegion);
            var eased = Mathf.SmoothStep(0f, 1f, Mathf.Pow(t, TailTaperStrength));
            var minIndex = Mathf.Clamp(thicknessProfile, 1, TailTipMinimumWidths.Length - 1);
            var widthScale = Mathf.Lerp(TailTipMinimumWidths[minIndex], 1f, eased);
            var center = 0.5f * (lo + up);
            var halfBand = 0.5f * (up - lo) * widthScale;
            lo = center - halfBand;
            up = center + halfBand;
        }

        /// <summary>Explicit coverage is also allowed on profile 0. It keeps the legacy
        /// taper only when both expand deltas are zero; otherwise the physical lower cover
        /// must not collapse to the old 8% tail point.</summary>
        public static void TaperTail(ref Vector2 lo, ref Vector2 up, float along, int thicknessProfile,
                                     bool coverageActive)
        {
            if (thicknessProfile == LegacyProfile && !coverageActive)
            {
                TaperTail(ref lo, ref up, along);
                return;
            }
            var t = Mathf.Clamp01(Mathf.Clamp01(along) / TailTaperRegion);
            var eased = Mathf.SmoothStep(0f, 1f, Mathf.Pow(t, TailTaperStrength));
            var minWidth = thicknessProfile == LegacyProfile
                ? 0.20f
                : TailTipMinimumWidths[Mathf.Clamp(thicknessProfile, 1, TailTipMinimumWidths.Length - 1)];
            var widthScale = Mathf.Lerp(minWidth, 1f, eased);
            if (coverageActive)
            {
                // The lower edge is the anatomical coverage promise. Narrow only toward
                // the upper edge so a tail never exposes the user's lower hairs again.
                up = lo + (up - lo) * widthScale;
                return;
            }
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

        static Vector2 FromMetric(Vector2 point, float imageAspect) =>
            new Vector2(point.x / imageAspect, point.y);

        static Vector2 ForwardWarp(Vector2 point, FaceWarpField warp) =>
            warp != null ? warp.Forward(point) : point;

        static bool IsFinite(float value) =>
            !float.IsNaN(value) && !float.IsInfinity(value);

        static bool IsFinite(Vector2 value) => IsFinite(value.x) && IsFinite(value.y);
        static bool IsFinite(Vector3 value) =>
            IsFinite(value.x) && IsFinite(value.y) && IsFinite(value.z);
    }
}
