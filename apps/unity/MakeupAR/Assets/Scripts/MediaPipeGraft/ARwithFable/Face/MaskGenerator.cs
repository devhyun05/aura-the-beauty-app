using UnityEngine;

namespace ARMakeup.Face
{
    /// <summary>
    /// Provides makeup mask textures in face-mesh UV space (R channel = mask).
    ///
    /// Lookup order:
    ///   MEDIAPIPE 사용 시(권장): 모든 플랫폼이 MediaPipe canonical UV를 공유하므로
    ///     Assets/Resources/Masks/{lips,blush,eyeshadow}.png 한 벌이면 된다.
    ///     (ARCore canonical_face_mesh.psd 또는 UVTemplateExporter 산출물 위에 페인팅)
    ///   폴백(ARKit/ARCore 트래킹) 시: 플랫폼별 UV가 달라
    ///     Masks/{ios|android}/ 하위 경로를 먼저 찾고, 없으면 Masks/ 루트,
    ///     그것도 없으면 아래 절차적 근사 마스크를 생성한다.
    ///
    /// The fallback regions are rough approximations — good enough to see the
    /// pipeline working end-to-end, but production quality requires painted masks.
    /// Tune the ellipse values below per platform if features land off-target.
    /// </summary>
    public static class MaskGenerator
    {
        const int Size = 256;

        struct Ellipse
        {
            public float cx, cy, rx, ry, softness;

            public Ellipse(float cx, float cy, float rx, float ry, float softness)
            {
                this.cx = cx; this.cy = cy; this.rx = rx; this.ry = ry; this.softness = softness;
            }
        }

#if !MEDIAPIPE && UNITY_IOS
        // Approximate feature regions in the ARKit face mesh UV layout (폴백 전용).
        static readonly Ellipse[] LipRegion =
        {
            new Ellipse(0.50f, 0.28f, 0.105f, 0.060f, 0.45f),
        };
        static readonly Ellipse[] BlushRegion =
        {
            // 넓힌 반경 + 가우시안 꼬리(BlushShapeMask에서 gaussianTail=true)로 뿌연 확산 홍조.
            new Ellipse(0.28f, 0.42f, 0.120f, 0.085f, 0.90f),
            new Ellipse(0.72f, 0.42f, 0.120f, 0.085f, 0.90f),
        };
#else
        // MediaPipe/ARCore canonical face mesh UV의 근사 영역.
        // (ARCore Augmented Faces와 MediaPipe canonical은 같은 토폴로지)
        static readonly Ellipse[] LipRegion =
        {
            new Ellipse(0.50f, 0.23f, 0.115f, 0.065f, 0.45f),
        };
        static readonly Ellipse[] BlushRegion =
        {
            // 넓힌 반경 + 가우시안 꼬리(BlushShapeMask에서 gaussianTail=true)로 뿌연 확산 홍조.
            new Ellipse(0.27f, 0.38f, 0.128f, 0.092f, 0.90f),
            new Ellipse(0.73f, 0.38f, 0.128f, 0.092f, 0.90f),
        };
#endif

        // 블러셔 모양 프리셋(AXIS 02 모양) — 0=클래식(위 BlushRegion). 컴포저는
        // MediaPipe 전용(섹션 12)이라 아래 변형은 canonical UV 기준. 실기기 튜닝값.
        // 이가리: 볼을 눈밑 가까이 올리고 콧대에 걸쳐 한 장으로 잇는다(코걸침).
        static readonly Ellipse[] BlushIgariRegion =
        {
            new Ellipse(0.35f, 0.44f, 0.085f, 0.045f, 0.8f),  // 볼 위쪽 L
            new Ellipse(0.65f, 0.44f, 0.085f, 0.045f, 0.8f),  // 볼 위쪽 R
            new Ellipse(0.50f, 0.45f, 0.090f, 0.030f, 0.85f), // 콧대 걸침(중앙 연결)
        };
        // 드레이핑: 광대 바깥→관자 쪽으로 스윕해 리프팅 인상.
        static readonly Ellipse[] BlushDrapeRegion =
        {
            new Ellipse(0.25f, 0.42f, 0.085f, 0.055f, 0.8f),  // 광대 위 바깥 L
            new Ellipse(0.75f, 0.42f, 0.085f, 0.055f, 0.8f),  // 광대 위 바깥 R
            new Ellipse(0.16f, 0.49f, 0.055f, 0.045f, 0.85f), // 관자 스윕 L
            new Ellipse(0.84f, 0.49f, 0.055f, 0.045f, 0.85f), // 관자 스윕 R
        };

        // 넓은 면 보정 영역 (canonical UV, 블러셔 v≈0.38 기준 상대 배치 — 실기기 튜닝값).
        // 하이라이터=가산(광채), 컨투어/섀딩=감산(그림자), 컨실러=밝힘(눈밑).
        static readonly Ellipse[] HighlightRegion =
        {
            new Ellipse(0.305f, 0.42f, 0.078f, 0.058f, 0.5f), // 광대뼈 위 L
            new Ellipse(0.695f, 0.42f, 0.078f, 0.058f, 0.5f), // 광대뼈 위 R
            new Ellipse(0.50f, 0.46f, 0.035f, 0.120f, 0.5f),  // 콧대
            new Ellipse(0.50f, 0.28f, 0.055f, 0.030f, 0.5f),  // 큐피드보우
            new Ellipse(0.35f, 0.55f, 0.058f, 0.040f, 0.5f),  // 눈썹뼈 L
            new Ellipse(0.65f, 0.55f, 0.058f, 0.040f, 0.5f),  // 눈썹뼈 R
        };
        static readonly Ellipse[] ContourRegion =
        {
            new Ellipse(0.255f, 0.35f, 0.080f, 0.080f, 0.5f), // 볼 꺼짐 L
            new Ellipse(0.745f, 0.35f, 0.080f, 0.080f, 0.5f), // 볼 꺼짐 R
            new Ellipse(0.455f, 0.44f, 0.024f, 0.105f, 0.5f), // 콧벽 L
            new Ellipse(0.545f, 0.44f, 0.024f, 0.105f, 0.5f), // 콧벽 R
            new Ellipse(0.135f, 0.50f, 0.068f, 0.100f, 0.5f), // 관자 L
            new Ellipse(0.865f, 0.50f, 0.068f, 0.100f, 0.5f), // 관자 R
            new Ellipse(0.255f, 0.20f, 0.082f, 0.058f, 0.5f), // 턱선 L
            new Ellipse(0.745f, 0.20f, 0.082f, 0.058f, 0.5f), // 턱선 R
        };
        // 눈밑 컨실러(구 ConcealerRegion 눈밑 타원)는 LowerLidRenderer 하안검 밴드로
        // 이관(§08, 랜드마크 정밀) — 캐노니컬 추정 마스크 삭제.
        // 애교살도 같은 밴드로 이관 — 캐노니컬 추정 마스크 삭제.

#if MEDIAPIPE
        const string PlatformFolder = "Masks/"; // canonical 한 벌
#elif UNITY_IOS
        const string PlatformFolder = "Masks/ios/";
#else
        const string PlatformFolder = "Masks/android/";
#endif

        static Texture2D _lip;
        // A14 마스크 재베이크(배치 A ③) — 가장자리 softness 스케일 0..1을 버킷 양자화해 캐시.
        // 연속값을 매프레임 Generate하면 텍스처가 누수되므로 버킷당 1회만 생성한다. 버킷
        // 0(softness=0) = 기존 마스크와 바이트 동일. 부위·모양별 독립 버킷 배열.
        const int SoftnessBuckets = 5;
        static readonly Texture2D[] _blushBuckets = new Texture2D[SoftnessBuckets];      // 모양 0(클래식)
        static readonly Texture2D[] _blushIgariBuckets = new Texture2D[SoftnessBuckets]; // 모양 1(이가리)
        static readonly Texture2D[] _blushDrapeBuckets = new Texture2D[SoftnessBuckets]; // 모양 2(드레이핑)
        static readonly Texture2D[] _highlightBuckets = new Texture2D[SoftnessBuckets];
        static readonly Texture2D[] _contourBuckets = new Texture2D[SoftnessBuckets];

        public static Texture2D LipMask => _lip != null ? _lip : _lip = LoadOrGenerate("lips", LipRegion, 0f);
        public static Texture2D BlushMask => Bucketed(_blushBuckets, "blush", BlushRegion, 0f, gaussianTail: true);

        /// <summary>블러셔 모양 프리셋 마스크(가장자리 softness 버킷 포함) — 0=클래식
        /// 1=이가리(코걸침) 2=드레이핑. softnessScale 0 = 기존 마스크(버킷 0)와 동일.</summary>
        public static Texture2D BlushShapeMask(int shape, float softnessScale)
        {
            var s = Mathf.Clamp(shape, 0, 2);
            if (s == 1) return Bucketed(_blushIgariBuckets, "blush_igari", BlushIgariRegion, softnessScale, gaussianTail: true);
            if (s == 2) return Bucketed(_blushDrapeBuckets, "blush_drape", BlushDrapeRegion, softnessScale, gaussianTail: true);
            return Bucketed(_blushBuckets, "blush", BlushRegion, softnessScale, gaussianTail: true);
        }
        public static Texture2D HighlightMask => Bucketed(_highlightBuckets, "highlight", HighlightRegion, 0f);
        public static Texture2D ContourMask => Bucketed(_contourBuckets, "contour", ContourRegion, 0f);
        /// <summary>하이라이터/컨투어 재베이크 마스크(가장자리 softness 버킷) —
        /// softnessScale 0 = 기존 마스크(버킷 0)와 바이트 동일.</summary>
        public static Texture2D HighlightShapeMask(float softnessScale) =>
            Bucketed(_highlightBuckets, "highlight", HighlightRegion, softnessScale);
        public static Texture2D ContourShapeMask(float softnessScale) =>
            Bucketed(_contourBuckets, "contour", ContourRegion, softnessScale);
        // 아이섀도우는 IrisRenderer의 동적 밴드로 분리됨 (정적 마스크 경로 제거)

        // softness 버킷 캐시 — 버킷당 1회만 Generate(연속값 매프레임 생성 금지 = 텍스처 누수 방지).
        // 버킷 대표 스케일(버킷 0 → 0)로 Generate하므로 버킷 0은 기존 마스크와 바이트 동일.
        static Texture2D Bucketed(Texture2D[] cache, string baseName, Ellipse[] regions, float softnessScale, bool gaussianTail = false)
        {
            var bucket = SoftnessBucket(softnessScale);
            if (cache[bucket] != null) return cache[bucket];
            var scale = bucket / (float)(SoftnessBuckets - 1);
            return cache[bucket] = LoadOrGenerate(baseName, regions, scale, gaussianTail);
        }

        static int SoftnessBucket(float softnessScale) =>
            Mathf.Clamp(Mathf.RoundToInt(Mathf.Clamp01(softnessScale) * (SoftnessBuckets - 1)), 0, SoftnessBuckets - 1);

        // softnessScale은 절차 폴백(Generate)에만 적용 — 임포트/페인팅 마스크(painted)는
        // PNG라 재베이크 불가하므로 softness와 무관하게 같은 텍스처를 돌려준다.
        static Texture2D LoadOrGenerate(string baseName, Ellipse[] regions, float softnessScale, bool gaussianTail = false)
        {
            var painted = Resources.Load<Texture2D>(PlatformFolder + baseName);
            if (painted == null && PlatformFolder != "Masks/")
                painted = Resources.Load<Texture2D>("Masks/" + baseName);
            return painted != null ? painted : Generate(regions, softnessScale, gaussianTail);
        }

        static Texture2D Generate(Ellipse[] regions, float softnessScale, bool gaussianTail = false)
        {
            var tex = new Texture2D(Size, Size, TextureFormat.R8, false)
            {
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
            };

            var pixels = new Color32[Size * Size];
            for (var y = 0; y < Size; y++)
            {
                var v = (y + 0.5f) / Size;
                for (var x = 0; x < Size; x++)
                {
                    var u = (x + 0.5f) / Size;
                    var value = 0f;
                    foreach (var e in regions)
                    {
                        // A14 재베이크(③) — Ellipse별 hand-tuned softness를 전역 덮지 않고 상대
                        // 배수. softnessScale 0이면 배수 1 → 기존 softness → 바이트 동일.
                        var soft = Mathf.Clamp01(e.softness * (1f + softnessScale));
                        var dx = (u - e.cx) / e.rx;
                        var dy = (v - e.cy) / e.ry;
                        var r = Mathf.Sqrt(dx * dx + dy * dy);
                        float a;
                        if (gaussianTail)
                        {
                            // 가우시안 꼬리 — 타원 경계(r=1)에서 딱 끊기지 않고 지수적으로
                            // 계속 옅어져 경계선 없는 뿌연 홍조를 만든다("연지곤지" 하드
                            // 원반 탈출, 블러셔 전용). soft↑ = 더 완만. 실기기 튜닝 대상.
                            var k = Mathf.Lerp(3.6f, 1.7f, soft);
                            a = Mathf.Exp(-k * r * r);
                        }
                        else
                        {
                            // 1 inside the core, feathering to 0 at the ellipse edge.
                            // (하위호환 — 립·하이라이터·컨투어는 기존 하드 경계 유지)
                            a = 1f - SmoothStep(1f - soft, 1f, r);
                        }
                        if (a > value) value = a;
                    }
                    var b = (byte)Mathf.RoundToInt(Mathf.Clamp01(value) * 255f);
                    pixels[y * Size + x] = new Color32(b, b, b, 255);
                }
            }

            tex.SetPixels32(pixels);
            tex.Apply(false, true);
            return tex;
        }

        static float SmoothStep(float edge0, float edge1, float x)
        {
            var t = Mathf.Clamp01((x - edge0) / Mathf.Max(edge1 - edge0, 1e-5f));
            return t * t * (3f - 2f * t);
        }
    }
}
