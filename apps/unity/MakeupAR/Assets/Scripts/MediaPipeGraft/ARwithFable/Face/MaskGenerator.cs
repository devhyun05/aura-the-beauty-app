using ARMakeup.Bridge;
using UnityEngine;
using UnityEngine.Experimental.Rendering;

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
    /// Legacy fallback regions are approximate and may still benefit from painted masks.
    /// Highlighter is the exception: its six-zone Gaussian fallback is a supported
    /// production path; Photoshop masks are an optional drop-in refinement only.
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

        // 넓은 면 보정 영역 (canonical UV). 하이라이터=가산(광채), 컨투어/섀딩=감산(그림자).
        // ★볼(C존)은 구운 블러셔 마스크 실측 애플(u 0.277/0.723, v 0.468 — blush.png 측정)을
        // 기준으로 배치한다. 옛 좌표(0.305/0.42)는 미렌더 절차 BlushRegion(v0.38)에 상대 배치돼
        // 애플보다 아래·안쪽(코옆 하안검)에 떠 잘못됐다. C존 = 애플 위·바깥(눈꼬리 아래) 광대뼈.
        // ★존 좌표는 canonical_face_model.obj의 vt(캐노니컬 UV) 실측으로 잡는다(추정 금지).
        // 실측 근거(랜드마크 UV): 코끝 1=(0.500,0.453)/4=(0.500,0.473), 콧대 5=(0.500,0.502)·
        // 195=(0.500,0.530)·197=(0.500,0.560)·6=(0.500,0.599)·나시온168=(0.500,0.649),
        // 콧벽 97/326=(0.468/0.532,0.398), 큐피드산 37=(0.472,0.350)/0=(0.500,0.348)/
        // 267=(0.528,0.350), 눈썹아치 52=(0.337,0.717)/65=(0.386,0.719)·눈썹중앙 105=(0.327,0.744),
        // 턱끝 152=(0.500,0.046)/175=(0.500,0.091)/199=(0.500,0.133)·턱옆 171/396=(0.44/0.559,0.097).
        // 기본 하이라이터는 광대 pair·콧대·코끝만 켠다. 눈썹뼈·큐피드·턱은 6-zone
        // atlas API에는 남기되 default-off — 실기기 QA에서 얼굴 중앙의 점광을 제거했다.
        static readonly Ellipse[] HighlightRegion =
        {
            new Ellipse(0.27f, 0.52f, 0.082f, 0.050f, 0.5f), // 광대뼈 pair L
            new Ellipse(0.73f, 0.52f, 0.082f, 0.050f, 0.5f), // 광대뼈 pair R
            new Ellipse(0.50f, 0.55f, 0.032f, 0.070f, 0.5f), // 콧대
            new Ellipse(0.50f, 0.45f, 0.028f, 0.030f, 0.5f), // 코끝
        };
        // atlas 채널 순서 고정: atlas0 RGBA = cheek pair / bridge / tip / brow bone,
        // atlas1 RG = cupid bow / chin. Phase B renderer가 그대로 uniform에 연결한다.
        static readonly Ellipse[][] HighlightZoneRegions =
        {
            new[] { HighlightRegion[0], HighlightRegion[1] },
            new[] { HighlightRegion[2] },
            new[] { HighlightRegion[3] },
            new[]
            {
                new Ellipse(0.36f, 0.68f, 0.060f, 0.030f, 0.5f),
                new Ellipse(0.64f, 0.68f, 0.060f, 0.030f, 0.5f),
            },
            new[] { new Ellipse(0.50f, 0.36f, 0.046f, 0.015f, 0.5f) },
            new[] { new Ellipse(0.50f, 0.11f, 0.048f, 0.048f, 0.5f) },
        };
        const float HighlightGaussianK = 3.2f;
        const float HighlightTailFloor = 1f / 255f;
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
        static Texture2D _highlightZoneAtlas0;
        static Texture2D _highlightZoneAtlas1;
        static Material _blushWarpMaterial;
        static RenderTexture _blushWarpTarget;

        static readonly int WarpRight0Id = Shader.PropertyToID("_WarpRight0");
        static readonly int WarpRight1Id = Shader.PropertyToID("_WarpRight1");
        static readonly int WarpLeft0Id = Shader.PropertyToID("_WarpLeft0");
        static readonly int WarpLeft1Id = Shader.PropertyToID("_WarpLeft1");

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

        /// <summary>
        /// W5 블러셔 로컬 윤곽 재베이크. 0/부재는 캐시된 기존 인스턴스를 그대로 반환해
        /// 바이트·수명 계약을 보존한다. 클래식 비0은 페인팅 원본을 같은 해상도에서 GPU
        /// 역워프하고, 절차 프리셋은 8점 프로파일을 타원 극각에 선형 보간한다.
        /// </summary>
        public static Texture2D BlushWarpMask(int shape, float softnessScale, RegionWarp source)
        {
            if (RegionWarpUtility.IsZero(source)) return BlushShapeMask(shape, softnessScale);
            var s = Mathf.Clamp(shape, 0, 2);
            var profile = RegionWarpUtility.SanitizeProfile(source);
            if (s == 0)
                return WarpClassicBlush(BlushShapeMask(0, softnessScale), profile);
            var regions = s == 1 ? BlushIgariRegion : s == 2 ? BlushDrapeRegion : BlushRegion;
            var texture = Generate(regions, softnessScale, gaussianTail: true,
                warp: profile, hasWarp: true);
            texture.name = $"BlushWarp_{s}";
            return texture;
        }

        static Texture2D WarpClassicBlush(Texture2D source, RegionWarpProfile profile)
        {
            EnsureBlushWarpGpuResources(source.width, source.height);
            _blushWarpMaterial.SetVector(WarpRight0Id,
                new Vector4(profile.p0, profile.p1, profile.p2, profile.p3));
            _blushWarpMaterial.SetVector(WarpRight1Id,
                new Vector4(profile.p4, profile.p5, profile.p6, profile.p7));
            _blushWarpMaterial.SetVector(WarpLeft0Id, new Vector4(
                SampleBlushWarpProfile(profile, 0f / 8f, true),
                SampleBlushWarpProfile(profile, 1f / 8f, true),
                SampleBlushWarpProfile(profile, 2f / 8f, true),
                SampleBlushWarpProfile(profile, 3f / 8f, true)));
            _blushWarpMaterial.SetVector(WarpLeft1Id, new Vector4(
                SampleBlushWarpProfile(profile, 4f / 8f, true),
                SampleBlushWarpProfile(profile, 5f / 8f, true),
                SampleBlushWarpProfile(profile, 6f / 8f, true),
                SampleBlushWarpProfile(profile, 7f / 8f, true)));

            Graphics.Blit(source, _blushWarpTarget, _blushWarpMaterial);
            var result = new Texture2D(source.width, source.height, TextureFormat.R8, false, true)
            {
                name = "BlushWarp_0",
                wrapMode = source.wrapMode,
                filterMode = source.filterMode,
            };
            Graphics.CopyTexture(_blushWarpTarget, result);
            return result;
        }

        static float SampleBlushWarpProfile(RegionWarpProfile profile, float t,
                                            bool anatomicalLeft) =>
            RegionWarpUtility.SampleCyclicAnatomicalProfile(profile, t, anatomicalLeft);

        static void EnsureBlushWarpGpuResources(int width, int height)
        {
            if (_blushWarpMaterial == null)
            {
                var shader = Resources.Load<Shader>("BlushMaskWarp");
                if (shader == null) shader = Shader.Find("Hidden/ARMakeup/BlushMaskWarp");
                _blushWarpMaterial = new Material(shader) { hideFlags = HideFlags.HideAndDontSave };
            }
            if (_blushWarpTarget != null &&
                (_blushWarpTarget.width != width || _blushWarpTarget.height != height))
                ReleaseBlushWarpTarget();
            if (_blushWarpTarget != null) return;

            var descriptor = new RenderTextureDescriptor(width, height)
            {
                depthBufferBits = 0,
                graphicsFormat = GraphicsFormat.R8_UNorm,
                msaaSamples = 1,
                mipCount = 1,
                sRGB = false,
                useMipMap = false,
                autoGenerateMips = false,
            };
            _blushWarpTarget = new RenderTexture(descriptor)
            {
                name = "BlushWarpTarget",
                wrapMode = TextureWrapMode.Clamp,
                filterMode = FilterMode.Bilinear,
                hideFlags = HideFlags.HideAndDontSave,
            };
            _blushWarpTarget.Create();
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ReleaseBlushWarpGpuResources()
        {
            ReleaseBlushWarpTarget();
            DestroyGeneratedObject(_blushWarpMaterial);
            _blushWarpMaterial = null;
        }

        static void ReleaseBlushWarpTarget()
        {
            if (_blushWarpTarget == null) return;
            _blushWarpTarget.Release();
            DestroyGeneratedObject(_blushWarpTarget);
            _blushWarpTarget = null;
        }

        static void DestroyGeneratedObject(Object value)
        {
            if (value == null) return;
            if (Application.isPlaying) Object.Destroy(value);
            else Object.DestroyImmediate(value);
        }
        public static Texture2D HighlightMask =>
            Bucketed(_highlightBuckets, "highlight", HighlightRegion, 0f, gaussianTail: true);
        public static Texture2D ContourMask => Bucketed(_contourBuckets, "contour", ContourRegion, 0f);
        /// <summary>하이라이터/컨투어 재베이크 마스크(가장자리 softness 버킷) —
        /// softnessScale 0 = 기존 마스크(버킷 0)와 바이트 동일.</summary>
        public static Texture2D HighlightShapeMask(float softnessScale) =>
            Bucketed(_highlightBuckets, "highlight", HighlightRegion, softnessScale, gaussianTail: true);
        /// <summary>Phase B highlighter atlas API. atlas0 RGBA = cheek/bridge/tip/brow.</summary>
        public static Texture2D HighlightZoneAtlas0 =>
            EnsureHighlightZoneAtlases().atlas0;
        /// <summary>Phase B highlighter atlas API. atlas1 RG = cupid/chin.</summary>
        public static Texture2D HighlightZoneAtlas1 =>
            EnsureHighlightZoneAtlases().atlas1;
        public static Vector4 HighlightDefaultZoneWeights0 => new Vector4(0.20f, 0.10f, 0.075f, 0f);
        public static Vector4 HighlightDefaultZoneWeights1 => Vector4.zero;
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

        /// <summary>Tests/calibration share the exact six-zone procedural fallback profile.</summary>
        public static float EvaluateHighlighterZoneFallback(int zone, float u, float v)
        {
            if (zone < 0 || zone >= HighlightZoneRegions.Length) return 0f;
            var value = 0f;
            foreach (var e in HighlightZoneRegions[zone])
            {
                var dx = (u - e.cx) / e.rx;
                var dy = (v - e.cy) / e.ry;
                var alpha = Mathf.Exp(-HighlightGaussianK * (dx * dx + dy * dy));
                if (alpha > value) value = alpha;
            }
            return value < HighlightTailFloor ? 0f : Mathf.Clamp01(value);
        }

        /// <summary>Default-off zones are deliberately excluded from the production fallback.</summary>
        public static float EvaluateDefaultHighlighterFallback(float u, float v) =>
            Mathf.Max(
                EvaluateHighlighterZoneFallback(0, u, v),
                Mathf.Max(EvaluateHighlighterZoneFallback(1, u, v),
                          EvaluateHighlighterZoneFallback(2, u, v)));

        /// <summary>FaceMakeup atlas branch의 channel-local edge-softness shaping CPU mirror.</summary>
        public static float EvaluateHighlightAtlasSoftness(float mask, float softness)
        {
            var channel = Mathf.Clamp01(mask);
            var exponent = Mathf.Lerp(1f, 0.45f, Mathf.Clamp01(softness));
            // RGBA8의 첫 non-zero texel(1/255)을 pow가 눈에 띄는 링으로 키우지
            // 못하게 8 quantization level 동안 에너지를 0에 수렴시킨다. core=1은 항등.
            var tailGate = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(channel / (8f / 255f)));
            return Mathf.Pow(Mathf.Max(channel, 1e-6f), exponent) * tailGate;
        }

        static Texture2D GenerateHighlightZoneAtlas(bool secondAtlas)
        {
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, false, true)
            {
                name = secondAtlas ? "HighlighterZoneAtlas1_Fallback" : "HighlighterZoneAtlas0_Fallback",
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
                    if (secondAtlas)
                    {
                        var c4 = (byte)Mathf.RoundToInt(EvaluateHighlighterZoneFallback(4, u, v) * 255f);
                        var c5 = (byte)Mathf.RoundToInt(EvaluateHighlighterZoneFallback(5, u, v) * 255f);
                        pixels[y * Size + x] = new Color32(c4, c5, 0, 0);
                    }
                    else
                    {
                        var c0 = (byte)Mathf.RoundToInt(EvaluateHighlighterZoneFallback(0, u, v) * 255f);
                        var c1 = (byte)Mathf.RoundToInt(EvaluateHighlighterZoneFallback(1, u, v) * 255f);
                        var c2 = (byte)Mathf.RoundToInt(EvaluateHighlighterZoneFallback(2, u, v) * 255f);
                        var c3 = (byte)Mathf.RoundToInt(EvaluateHighlighterZoneFallback(3, u, v) * 255f);
                        pixels[y * Size + x] = new Color32(c0, c1, c2, c3);
                    }
                }
            }
            tex.SetPixels32(pixels);
            tex.Apply(false, true);
            return tex;
        }

        /// <summary>Photoshop pair import contract. Both must be 2048 linear, no mipmaps.</summary>
        public static bool ValidateAndConfigureHighlightZoneAtlasPair(
            Texture2D replacement0, Texture2D replacement1)
        {
            if (replacement0 == null || replacement1 == null) return false;
            if (replacement0.width != 2048 || replacement0.height != 2048 ||
                replacement1.width != 2048 || replacement1.height != 2048) return false;
            if (replacement0.mipmapCount != 1 || replacement1.mipmapCount != 1) return false;
            if (UnityEngine.Experimental.Rendering.GraphicsFormatUtility.IsSRGBFormat(replacement0.graphicsFormat) ||
                UnityEngine.Experimental.Rendering.GraphicsFormatUtility.IsSRGBFormat(replacement1.graphicsFormat))
                return false;
            replacement0.wrapMode = replacement1.wrapMode = TextureWrapMode.Clamp;
            replacement0.filterMode = replacement1.filterMode = FilterMode.Bilinear;
            return true;
        }

        static (Texture2D atlas0, Texture2D atlas1) EnsureHighlightZoneAtlases()
        {
            if (_highlightZoneAtlas0 != null && _highlightZoneAtlas1 != null)
                return (_highlightZoneAtlas0, _highlightZoneAtlas1);

            // Photoshop 교체본은 반드시 두 atlas가 한 쌍일 때만 사용한다. 한 장만 있으면
            // 채널 세대가 섞이지 않도록 둘 다 linear procedural fallback으로 되돌린다.
            var replacement0 = Resources.Load<Texture2D>("Masks/highlighter_zone_atlas0");
            var replacement1 = Resources.Load<Texture2D>("Masks/highlighter_zone_atlas1");
            if (ValidateAndConfigureHighlightZoneAtlasPair(replacement0, replacement1))
            {
                _highlightZoneAtlas0 = replacement0;
                _highlightZoneAtlas1 = replacement1;
            }
            else
            {
                _highlightZoneAtlas0 = GenerateHighlightZoneAtlas(secondAtlas: false);
                _highlightZoneAtlas1 = GenerateHighlightZoneAtlas(secondAtlas: true);
            }
            return (_highlightZoneAtlas0, _highlightZoneAtlas1);
        }

        // softnessScale은 절차 폴백(Generate)에만 적용 — 임포트/페인팅 마스크(painted)는
        // PNG라 재베이크 불가하므로 softness와 무관하게 같은 텍스처를 돌려준다.
        static Texture2D LoadOrGenerate(string baseName, Ellipse[] regions, float softnessScale, bool gaussianTail = false)
        {
            var painted = Resources.Load<Texture2D>(PlatformFolder + baseName);
            if (painted == null && PlatformFolder != "Masks/")
                painted = Resources.Load<Texture2D>("Masks/" + baseName);
            return painted != null ? painted : Generate(regions, softnessScale, gaussianTail);
        }

        static Texture2D Generate(Ellipse[] regions, float softnessScale, bool gaussianTail = false,
                                  RegionWarpProfile warp = default, bool hasWarp = false)
        {
            var tex = new Texture2D(Size, Size, TextureFormat.R8, false, true)
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
                        if (hasWarp)
                        {
                            var angle = Mathf.Atan2(dy, dx);
                            var t = angle / (Mathf.PI * 2f);
                            if (t < 0f) t += 1f;
                            var scale = 1f + SampleBlushWarpProfile(warp, t, e.cx < 0.5f);
                            r /= Mathf.Max(0.8f, scale);
                        }
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
